from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from backend.app.config import settings
from backend.app.db import connect, database, initialize_database, transaction
from backend.worker.stitching import StitchResult

ORGANIZER_ID = "00000000-0000-4000-8000-0000000a0001"
MAP_ID = "00000000-0000-4000-8000-0000000a0002"
CAPTURE_ID = "00000000-0000-4000-8000-0000000a0003"


@pytest.fixture()
def worker_env(tmp_path: Path):
    """Isolated database + media root, mirroring what the worker container sees."""
    db_file = tmp_path / "stitch.sqlite"
    media_dir = tmp_path / "media"
    original_db, original_media = settings.database_path, settings.media_path
    object.__setattr__(settings, "database_path", db_file)
    object.__setattr__(settings, "media_path", media_dir)
    initialize_database(db_file)
    media_dir.mkdir(parents=True, exist_ok=True)
    try:
        with database() as connection:
            with transaction(connection, immediate=True):
                connection.execute(
                    "INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)",
                    (ORGANIZER_ID, "worker@example.test", "$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA", "organizer"),
                )
                connection.execute(
                    "INSERT INTO maps(id,owner_id,slug,title,description,width_units,height_units,"
                    "scale_m_per_unit,max_walk_gap_units) VALUES(?,?,?,?,?,?,?,?,?)",
                    (MAP_ID, ORGANIZER_ID, "wwwwwwwwwwwwwwwwwwwwwwwww2", "Worker map", "", 500, 500, 0.05, 100),
                )
        yield {"db": db_file, "media": media_dir}
    finally:
        object.__setattr__(settings, "database_path", original_db)
        object.__setattr__(settings, "media_path", original_media)


def _frame_bytes(index: int) -> bytes:
    """Distinct but tiny payloads: the worker validates hashes, not pixels."""
    return f"frame-payload-{index}".encode() * 8


def create_capture(
    *,
    capture_id: str = CAPTURE_ID,
    frames: int = 16,
    unique_frames: int = 16,
    state: str = "queued",
    attempt: int = 1,
    lease_token: str | None = "lease-token",
    lease_expires_at: str | None = "2099-01-01T00:00:00Z",
    write_files: bool = True,
) -> str:
    """Creates a capture the way the API does: collect frames, then queue it.

    Frame rows can only be written while the capture is ``collecting`` (DB
    trigger), so the helper walks the same legal state transitions as the real
    endpoints instead of inserting a terminal row directly.
    """
    from hashlib import sha256

    media: Path = settings.media_path
    with database() as connection:
        with transaction(connection, immediate=True):
            connection.execute(
                "INSERT INTO captures(id,map_id,title,x,y,hfov_hint_deg) VALUES(?,?,?,?,?,?)",
                (capture_id, MAP_ID, "Панорама зала", 100.0, 100.0, 65.0),
            )
            for index in range(frames):
                payload = _frame_bytes(index if index < unique_frames else 0)
                storage_key = f"captures/{capture_id}/frame-{index:02d}.bin"
                target = media / storage_key
                if write_files:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(payload)
                connection.execute(
                    "INSERT INTO capture_frames(capture_id,frame_index,sha256,storage_key,width_px,height_px) "
                    "VALUES(?,?,?,?,?,?)",
                    (capture_id, index, sha256(payload).hexdigest(), storage_key, 1200, 1600),
                )

            if state == "collecting":
                return capture_id

            def to_queued(next_attempt: int) -> None:
                connection.execute(
                    "UPDATE captures SET state='queued',attempt=?,progress=0,started_at=NULL,finished_at=NULL,"
                    "lease_token=NULL,lease_expires_at=NULL WHERE id=?",
                    (next_attempt, capture_id),
                )

            def to_running(next_attempt: int) -> None:
                connection.execute(
                    "UPDATE captures SET state='running',attempt=?,progress=5,started_at=?,lease_token=?,"
                    "lease_expires_at=? WHERE id=?",
                    (next_attempt, "2026-10-24T08:00:00Z", lease_token, lease_expires_at, capture_id),
                )

            to_queued(1)
            if state != "queued":
                to_running(1)
            if state == "running" and attempt == 2:
                to_queued(2)
                to_running(2)
    return capture_id


def png_bytes(width: int = 512, height: int = 256, color: tuple[int, int, int] = (12, 34, 56)) -> bytes:
    image = Image.new("RGB", (width, height), color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def fake_stitcher(
    *,
    vaov: float = 172.5,
    v_offset: float = 3.5,
    width: int = 512,
    height: int = 256,
    steps: tuple[str, ...] = ("validate", "features", "optimise", "render", "blend", "quality"),
    on_run=None,
):
    """Stand-in for Hugin that produces a real (small) spherical image."""

    def _stitch(frames, work_root, hfov_hint_deg, *, on_step=None, is_cancelled=None, frame_count=16):
        work_root.mkdir(parents=True, exist_ok=True)
        work_dir = work_root / "fake-work"
        work_dir.mkdir(parents=True, exist_ok=True)
        assert len(frames) == frame_count
        for step in steps:
            if on_step is not None:
                on_step(step)
            if on_run is not None:
                on_run(step, is_cancelled)
            if is_cancelled is not None and is_cancelled():
                from backend.worker.stitching import StitchCancelled

                raise StitchCancelled()
        image_path = work_dir / "stitched.png"
        image_path.write_bytes(png_bytes(width, height))
        return StitchResult(image_path, width, height, vaov, v_offset, work_dir)

    return _stitch


def capture_row(capture_id: str = CAPTURE_ID):
    with database() as connection:
        return connection.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()


def asset_rows():
    with database() as connection:
        return connection.execute("SELECT * FROM assets WHERE map_id=? ORDER BY created_at", (MAP_ID,)).fetchall()


def connect_raw(db_path: Path):
    return connect(db_path)
