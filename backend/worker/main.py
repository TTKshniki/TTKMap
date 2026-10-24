from __future__ import annotations

import logging
from pathlib import Path
import signal
import tempfile
import threading
from uuid import uuid4

from backend.app.config import settings
from backend.app.db import database, initialize_database, transaction
from backend.app.modules.capture.service import claim_next_capture
from backend.app.modules.media.images import make_variants
from backend.app.modules.media.storage import AssetStore
from backend.worker.lease import Lease, utc_now
from backend.worker.processes import LeaseLost, Runner, StitchError
from backend.worker.stitching import StitchResult, stitch


ERROR_CODES = {"INPUT_EXPIRED", "NOT_ENOUGH_OVERLAP", "LOOP_NOT_CLOSED", "INSUFFICIENT_COVERAGE",
               "QUALITY_REJECTED", "TIMEOUT", "WORKER_LOST", "TOOL_FAILED"}


def fail_capture(capture_id: str, token: str, error: StitchError) -> bool:
    code = error.code if error.code in ERROR_CODES else "TOOL_FAILED"
    with database() as db:
        with transaction(db, immediate=True):
            now = utc_now()
            updated = db.execute(
                "UPDATE captures SET state='failed',finished_at=?,error_code=?,error_message=?,"
                "lease_token=NULL,lease_expires_at=NULL,updated_at=? "
                "WHERE id=? AND state='running' AND lease_token=? AND julianday(lease_expires_at)>julianday(?)",
                (now, code, str(error)[:500] or "Stitching failed", now, capture_id, token, now),
            )
            return updated.rowcount == 1


def commit_result(capture, lease: Lease, result: StitchResult, variants: dict[str, str], asset_id: str):
    lease.check()
    with database() as db:
        with transaction(db, immediate=True):
            lease.check()
            now = utc_now()
            row = db.execute(
                "SELECT 1 FROM captures WHERE id=? AND map_id=? AND state='running' AND lease_token=? "
                "AND julianday(lease_expires_at)>julianday(?)",
                (capture["id"], capture["map_id"], lease.token, now),
            ).fetchone()
            if row is None:
                raise LeaseLost("Lease expired or capture was cancelled before result commit")
            db.execute(
                "INSERT INTO assets(id,map_id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,"
                "v_offset_deg,preview_key,mobile_key,full_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (asset_id, capture["map_id"], "panorama", "stitch", result.width, result.height,
                 "equirectangular", 360, result.vaov_deg, result.v_offset_deg,
                 variants["preview"], variants["mobile"], variants["full"], now),
            )
            db.execute(
                "UPDATE captures SET state='succeeded',progress=100,result_asset_id=?,finished_at=?,"
                "error_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (asset_id, now, now, capture["id"]),
            )


def process_one_capture(*, stop: threading.Event | None = None, lease_seconds: int = 120,
                        heartbeat_seconds: float = 5, timeout_seconds: float = 900) -> bool:
    if stop is not None and stop.is_set():
        return False
    with database() as db:
        with transaction(db, immediate=True):
            capture = claim_next_capture(db, lease_seconds)
            if capture is None:
                return False
            frames = db.execute("SELECT frame_index,storage_key FROM capture_frames WHERE capture_id=? ORDER BY frame_index",
                                (capture["id"],)).fetchall()
    asset_id = str(uuid4())
    written: list[Path] = []
    committed = False
    try:
        with Lease(capture["id"], capture["lease_token"], seconds=lease_seconds,
                   heartbeat_seconds=heartbeat_seconds, stop=stop, timeout_seconds=timeout_seconds) as lease:
            paths = []
            root = settings.media_path.resolve()
            if [frame["frame_index"] for frame in frames] != list(range(16)):
                raise StitchError("INPUT_EXPIRED", "All 16 frame slots are required")
            for frame in frames:
                path = (root / frame["storage_key"]).resolve()
                if root not in path.parents or not path.is_file():
                    raise StitchError("INPUT_EXPIRED", "Source frame is missing or outside media storage")
                paths.append(path)
            with tempfile.TemporaryDirectory(prefix="ttkmap-stitch-") as work:
                result = stitch(paths, Path(work), float(capture["hfov_hint_deg"]),
                                runner=Runner(lease.check, timeout_seconds), progress=lease.renew)
                lease.renew(90)
                variants, width, height = make_variants(result.image_path.read_bytes(), "panorama", partial_vaov_deg=result.vaov_deg)
                if (width, height) != (result.width, result.height) or set(variants) != {"preview", "mobile", "full"}:
                    raise StitchError("QUALITY_REJECTED", "Invalid panorama variants")
                store = AssetStore(root)
                keys = {}
                for name, content in variants.items():
                    lease.renew(95)
                    key = f"{asset_id}/{name}.webp"
                    written.append(store.write_atomic(key, content))
                    keys[name] = key
                commit_result(capture, lease, result, keys, asset_id)
                committed = True
                logging.info("Capture %s succeeded: vaov=%.2f offset=%.2f rms=%.2f inliers=%s",
                             capture["id"], result.vaov_deg, result.v_offset_deg, result.quality.rms_px, result.quality.inliers)
    except LeaseLost:
        logging.info("Stopped capture %s after cancellation, lease loss or shutdown", capture["id"])
    except StitchError as exc:
        fail_capture(capture["id"], capture["lease_token"], exc)
        logging.warning("Capture %s failed (%s): %s", capture["id"], exc.code, exc)
    except Exception:
        logging.exception("Capture %s failed unexpectedly", capture["id"])
        fail_capture(capture["id"], capture["lease_token"], StitchError("TOOL_FAILED", "Stitching pipeline failed unexpectedly"))
    finally:
        if not committed:
            for path in written:
                if path.parent == settings.media_path.resolve() / asset_id:
                    path.unlink(missing_ok=True)
            directory = settings.media_path.resolve() / asset_id
            if directory.is_dir():
                try:
                    directory.rmdir()
                except OSError:
                    pass
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    initialize_database()
    settings.media_path.mkdir(parents=True, exist_ok=True)
    stop = threading.Event()
    for name in ("SIGINT", "SIGTERM"):
        signal.signal(getattr(signal, name), lambda signum, frame: stop.set())
    logging.info("TTKMap worker started; polling durable capture queue")
    while not stop.is_set():
        try:
            if not process_one_capture(stop=stop):
                stop.wait(2)
        except Exception:
            logging.exception("Queue poll failed; retrying")
            stop.wait(2)


if __name__ == "__main__":
    main()
