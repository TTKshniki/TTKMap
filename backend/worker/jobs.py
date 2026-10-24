from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
from typing import Callable
from uuid import uuid4

from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.modules.capture.service import claim_next_capture
from backend.app.modules.media.storage import AssetStore
from backend.worker.lease import LeaseKeeper, ProgressTracker, now_iso
from backend.worker.stitching import (
    REQUIRED_TOOLS,
    StitchCancelled,
    StitchError,
    StitchResult,
    missing_tools,
    stitch,
)


FRAME_COUNT = 16
MIN_UNIQUE_FRAMES = 12
LEASE_SECONDS = 120
LEASE_RENEW_SECONDS = 30.0

RECOVERY_HINTS: dict[str, str] = {
    "INPUT_EXPIRED": "Кадры серии удалены или устарели: переснимите панораму или загрузите готовую сферу 2:1.",
    "NOT_ENOUGH_OVERLAP": "Мало перекрытия между кадрами: повторите съёмку с шагом 22,5° и без пропусков.",
    "LOOP_NOT_CLOSED": "Не замкнулось кольцо кадров: последний кадр должен перекрывать первый.",
    "INSUFFICIENT_COVERAGE": "Сфера покрыта не полностью: держите телефон ровно и не наклоняйте камеру в пол.",
    "QUALITY_REJECTED": "Склейка не прошла контроль качества: переснимите серию или загрузите готовую сферу.",
    "TIMEOUT": "Склейка превысила лимит времени: повторите позже или загрузите готовую сферу.",
    "WORKER_LOST": "Worker потерял задачу: поставьте склейку в очередь повторно.",
    "TOOL_FAILED": "Инструменты Hugin недоступны: загрузите готовую сферу или запустите worker-контейнер.",
}


def recovery_hint(code: str | None) -> str:
    if not code:
        return "Повторите склейку или загрузите готовую панораму."
    return RECOVERY_HINTS.get(code, "Повторите склейку или загрузите готовую панораму.")


@dataclass(frozen=True)
class JobOutcome:
    """Result of one polling iteration."""

    processed: bool
    capture_id: str | None = None
    status: str | None = None  # succeeded | failed | cancelled | lease_lost
    error_code: str | None = None
    error_message: str | None = None

    @property
    def recovery(self) -> str | None:
        return recovery_hint(self.error_code) if self.error_code else None


def _fail_capture(capture_id: str, lease_token: str, progress: int, error_code: str, error_message: str) -> bool:
    """Marks the job failed without ever pretending it succeeded."""
    with database() as connection:
        with transaction(connection, immediate=True):
            row = connection.execute(
                "SELECT state,lease_token FROM captures WHERE id=?", (capture_id,)
            ).fetchone()
            if row is None or row["state"] != "running" or row["lease_token"] != lease_token:
                return False
            connection.execute(
                "UPDATE captures SET state='failed',progress=?,finished_at=?,result_asset_id=NULL,"
                "error_code=?,error_message=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (min(max(progress, 1), 99), now_iso(), error_code, error_message, now_iso(), capture_id),
            )
    return True


def _complete_capture(capture_id: str, lease_token: str, asset_id: str) -> bool:
    with database() as connection:
        with transaction(connection, immediate=True):
            row = connection.execute(
                "SELECT state,lease_token FROM captures WHERE id=?", (capture_id,)
            ).fetchone()
            if row is None or row["state"] != "running" or row["lease_token"] != lease_token:
                return False
            connection.execute(
                "UPDATE captures SET state='succeeded',progress=100,finished_at=?,result_asset_id=?,"
                "error_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (now_iso(), asset_id, now_iso(), capture_id),
            )
    return True


def _store_result(result: StitchResult, map_id: str) -> str:
    """Writes the three media variants and the asset row with measured angles."""
    raw_bytes = result.image_path.read_bytes()
    asset_id = str(uuid4())
    store = AssetStore(settings.media_path)
    preview_key, mobile_key, full_key, final_w, final_h = store.store_asset_variants(
        asset_id, raw_bytes, result.width, result.height
    )
    with database() as connection:
        with transaction(connection, immediate=True):
            connection.execute(
                "INSERT INTO assets(id,map_id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,"
                "v_offset_deg,preview_key,mobile_key,full_key,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    asset_id,
                    map_id,
                    "panorama",
                    "stitch",
                    final_w,
                    final_h,
                    "equirectangular",
                    360,
                    round(result.vaov_deg, 2),
                    round(result.v_offset_deg, 2),
                    preview_key,
                    mobile_key,
                    full_key,
                    now_iso(),
                ),
            )
    return asset_id


def _current_state(capture_id: str) -> str | None:
    with database() as connection:
        row = connection.execute("SELECT state FROM captures WHERE id=?", (capture_id,)).fetchone()
    return row["state"] if row is not None else None


def _abort_reason(capture_id: str, keeper: LeaseKeeper) -> str | None:
    """Distinguishes an organizer cancel from a lease that moved elsewhere."""
    state = _current_state(capture_id)
    if state == "cancelled":
        return "cancelled"
    if state != "running" or keeper.is_cancelled():
        return "lease_lost"
    return None


def _load_frames(capture_id: str) -> list:
    with database() as connection:
        return connection.execute(
            "SELECT frame_index,storage_key,sha256 FROM capture_frames WHERE capture_id=? ORDER BY frame_index ASC",
            (capture_id,),
        ).fetchall()


def process_one_capture(
    *,
    stitcher: Callable[..., StitchResult] = stitch,
    tools_check: Callable[[], list[str]] | None = None,
    lease_seconds: int = LEASE_SECONDS,
    renew_every_seconds: float = LEASE_RENEW_SECONDS,
    frame_count: int = FRAME_COUNT,
) -> JobOutcome:
    """Claims and stitches at most one capture.

    ``stitcher`` and ``tools_check`` are injected so the pipeline can be tested
    without Hugin installed.
    """
    tools_check = tools_check or missing_tools

    with database() as connection:
        with transaction(connection, immediate=True):
            claimed = claim_next_capture(connection, lease_seconds=lease_seconds)
            if claimed is None:
                return JobOutcome(processed=False)
            capture_id = claimed["id"]
            map_id = claimed["map_id"]
            lease_token = claimed["lease_token"]
            hfov = float(claimed["hfov_hint_deg"])

    frames = _load_frames(capture_id)

    if len(frames) != frame_count:
        code, message = "INPUT_EXPIRED", f"Capture does not contain all {frame_count} frame files"
        _fail_capture(capture_id, lease_token, 10, code, message)
        return JobOutcome(True, capture_id, "failed", code, message)

    frame_paths: list[Path] = []
    hashes: set[str] = set()
    for frame in frames:
        path = (settings.media_path / frame["storage_key"]).resolve()
        if not path.is_file():
            code = "INPUT_EXPIRED"
            message = f"Frame {frame['frame_index']} is missing on disk"
            _fail_capture(capture_id, lease_token, 10, code, message)
            return JobOutcome(True, capture_id, "failed", code, message)
        frame_paths.append(path)
        hashes.add(frame["sha256"])

    if len(hashes) < MIN_UNIQUE_FRAMES:
        code = "NOT_ENOUGH_OVERLAP"
        message = "Too many duplicate frames in capture sequence"
        _fail_capture(capture_id, lease_token, 15, code, message)
        return JobOutcome(True, capture_id, "failed", code, message)

    unavailable = tools_check()
    if unavailable:
        code = "TOOL_FAILED"
        message = f"Stitching tools unavailable ({', '.join(unavailable)}); upload a ready 360° panorama or run the worker container"
        _fail_capture(capture_id, lease_token, 20, code, message)
        return JobOutcome(True, capture_id, "failed", code, message)

    progress = ProgressTracker(capture_id, lease_token)
    work_root = settings.media_path / "stitch-work"
    keeper = LeaseKeeper(
        capture_id,
        lease_token,
        database,
        lease_seconds=lease_seconds,
        renew_every_seconds=renew_every_seconds,
    )

    with keeper:
        try:
            result = stitcher(
                frame_paths,
                work_root,
                hfov,
                on_step=progress.step,
                is_cancelled=keeper.is_cancelled,
                frame_count=frame_count,
            )
        except StitchCancelled:
            # The organizer cancelled the capture; cancel_capture_job already
            # wrote the terminal state, so the worker must not overwrite it.
            return JobOutcome(True, capture_id, _abort_reason(capture_id, keeper) or "cancelled")
        except StitchError as exc:
            abort = _abort_reason(capture_id, keeper)
            if abort is not None:
                return JobOutcome(True, capture_id, abort)
            _fail_capture(capture_id, lease_token, progress.current or 80, exc.code, str(exc))
            return JobOutcome(True, capture_id, "failed", exc.code, str(exc))
        except Exception as exc:  # noqa: BLE001 - never crash the polling loop
            abort = _abort_reason(capture_id, keeper)
            if abort is not None:
                return JobOutcome(True, capture_id, abort)
            message = f"Stitching pipeline failed: {exc}"
            _fail_capture(capture_id, lease_token, progress.current or 80, "TOOL_FAILED", message)
            return JobOutcome(True, capture_id, "failed", "TOOL_FAILED", message)

        if keeper.is_cancelled():
            shutil.rmtree(result.work_dir, ignore_errors=True)
            return JobOutcome(True, capture_id, "lease_lost")

        try:
            asset_id = _store_result(result, map_id)
        finally:
            shutil.rmtree(result.work_dir, ignore_errors=True)

        if not _complete_capture(capture_id, lease_token, asset_id):
            return JobOutcome(True, capture_id, "lease_lost")

    return JobOutcome(True, capture_id, "succeeded")


def fail_stale_running_captures() -> int:
    """Re-queues or fails captures whose worker died (handled by claim_next_capture)."""
    with database() as connection:
        with transaction(connection, immediate=True):
            claim_next_capture(connection)
    return 0
