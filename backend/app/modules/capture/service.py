from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
from uuid import uuid4

from backend.app.config import settings
from backend.app.errors import ApiError
from backend.app.modules.media.storage import FRAME_MAX_BYTES, AssetStore, inspect_image_bytes


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def capture_dto(connection, row) -> dict:
    frames = connection.execute(
        "SELECT frame_index,sha256,width_px,height_px FROM capture_frames WHERE capture_id=? ORDER BY frame_index ASC",
        (row["id"],),
    ).fetchall()
    return {
        "id": row["id"],
        "map_id": row["map_id"],
        "title": row["title"],
        "x": row["x"],
        "y": row["y"],
        "hfov_hint_deg": row["hfov_hint_deg"],
        "state": row["state"],
        "progress": row["progress"],
        "attempt": row["attempt"],
        "frames": [
            {
                "index": item["frame_index"],
                "sha256": item["sha256"],
                "width_px": item["width_px"],
                "height_px": item["height_px"],
            }
            for item in frames
        ],
        "result_asset_id": row["result_asset_id"],
        "error_code": row["error_code"],
        "error_message": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


def get_owned_capture(connection, map_id: str, capture_id: str, owner_id: str):
    row = connection.execute(
        "SELECT c.* FROM captures c JOIN maps m ON m.id=c.map_id WHERE c.id=? AND c.map_id=? AND m.owner_id=?",
        (capture_id, map_id, owner_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Capture session not found")
    return row


def store_capture_frame(connection, capture_row, index: int, raw_bytes: bytes) -> dict:
    if not (0 <= index <= 15):
        raise ApiError(422, "VALIDATION_ERROR", "Frame index must be between 0 and 15", issues=[{"path": "index", "message": "Must be 0..15"}])

    capture_id = capture_row["id"]
    digest = hashlib.sha256(raw_bytes).hexdigest()
    existing = connection.execute(
        "SELECT sha256,storage_key,width_px,height_px FROM capture_frames WHERE capture_id=? AND frame_index=?",
        (capture_id, index),
    ).fetchone()

    if existing is not None and existing["sha256"] == digest:
        return capture_dto(connection, capture_row)

    if capture_row["state"] != "collecting":
        raise ApiError(409, "CONFLICT", "Capture frames are sealed after stitch submission")

    _, width, height = inspect_image_bytes(raw_bytes, FRAME_MAX_BYTES)
    if width > 1600 or height > 1600:
        scale = min(1600 / width, 1600 / height)
        width = max(1, int(round(width * scale)))
        height = max(1, int(round(height * scale)))

    storage_key = f"captures/{capture_id}/frame-{index:02d}.bin"
    store = AssetStore(settings.media_path)
    store.write_atomic(storage_key, raw_bytes)
    now = _now()

    if existing is None:
        connection.execute(
            "INSERT INTO capture_frames(capture_id,frame_index,sha256,storage_key,width_px,height_px) VALUES(?,?,?,?,?,?)",
            (capture_id, index, digest, storage_key, width, height),
        )
    else:
        connection.execute(
            "UPDATE capture_frames SET sha256=?,storage_key=?,width_px=?,height_px=? WHERE capture_id=? AND frame_index=?",
            (digest, storage_key, width, height, capture_id, index),
        )
    connection.execute("UPDATE captures SET updated_at=? WHERE id=?", (now, capture_id))
    refreshed = connection.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
    return capture_dto(connection, refreshed)


def submit_stitch(connection, capture_row) -> tuple[int, dict]:
    capture_id = capture_row["id"]
    state = capture_row["state"]

    if state in {"queued", "running"}:
        return 202, capture_dto(connection, capture_row)
    if state == "succeeded":
        return 200, capture_dto(connection, capture_row)
    if state == "cancelled":
        raise ApiError(409, "CONFLICT", "Cancelled capture cannot be stitched")
    if state == "failed" and capture_row["attempt"] >= 2:
        raise ApiError(409, "CONFLICT", "Maximum stitch attempts exhausted for this capture")

    count = connection.execute(
        "SELECT COUNT(*) FROM capture_frames WHERE capture_id=?",
        (capture_id,),
    ).fetchone()[0]
    if count < 16:
        raise ApiError(422, "VALIDATION_ERROR", f"All 16 frames (0..15) are required before stitching (got {count})")

    now = _now()
    next_attempt = int(capture_row["attempt"]) + 1
    connection.execute(
        "UPDATE captures SET state='queued',attempt=?,progress=0,started_at=NULL,finished_at=NULL,"
        "result_asset_id=NULL,error_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? "
        "WHERE id=?",
        (next_attempt, now, capture_id),
    )
    refreshed = connection.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
    return 202, capture_dto(connection, refreshed)


def cancel_capture_job(connection, capture_row) -> dict:
    capture_id = capture_row["id"]
    state = capture_row["state"]
    if state == "cancelled":
        return capture_dto(connection, capture_row)
    if state in {"succeeded", "failed"}:
        raise ApiError(409, "CONFLICT", f"Cannot cancel capture in terminal state '{state}'")

    now = _now()
    progress = min(int(capture_row["progress"]), 99)
    connection.execute(
        "UPDATE captures SET state='cancelled',progress=?,finished_at=?,result_asset_id=NULL,"
        "error_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
        (progress, now, now, capture_id),
    )
    refreshed = connection.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
    return capture_dto(connection, refreshed)


def claim_next_capture(connection, lease_seconds: int = 120):
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat().replace("+00:00", "Z")
    expires = (now_dt + timedelta(seconds=lease_seconds)).isoformat().replace("+00:00", "Z")

    expired = connection.execute(
        "SELECT id,attempt,progress,started_at FROM captures WHERE state='running' AND lease_expires_at<=?",
        (now,),
    ).fetchall()
    for row in expired:
        if row["attempt"] < 2:
            connection.execute(
                "UPDATE captures SET state='queued',attempt=?,progress=0,started_at=NULL,finished_at=NULL,"
                "lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (row["attempt"] + 1, now, row["id"]),
            )
        else:
            connection.execute(
                "UPDATE captures SET state='failed',progress=?,finished_at=?,error_code='WORKER_LOST',"
                "error_message='Worker lease expired during stitching',lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (min(int(row["progress"]), 99), now, now, row["id"]),
            )

    candidate = connection.execute(
        "SELECT * FROM captures WHERE state='queued' ORDER BY created_at ASC LIMIT 1"
    ).fetchone()
    if candidate is None:
        return None

    lease_token = str(uuid4())
    connection.execute(
        "UPDATE captures SET state='running',progress=5,started_at=?,lease_token=?,lease_expires_at=?,updated_at=? WHERE id=?",
        (now, lease_token, expires, now, candidate["id"]),
    )
    return connection.execute("SELECT * FROM captures WHERE id=?", (candidate["id"],)).fetchone()
