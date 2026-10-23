from __future__ import annotations

from datetime import datetime, timezone
import logging
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from backend.app.config import settings
from backend.app.db import database, initialize_database, transaction
from backend.app.modules.capture.service import claim_next_capture
from backend.app.modules.media.storage import AssetStore, inspect_image_bytes


REQUIRED_TOOLS = ("pto_gen", "cpfind", "cpclean", "autooptimiser", "pano_modify", "nona", "enblend")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _fail_capture(capture_id: str, lease_token: str, progress: int, error_code: str, error_message: str) -> None:
    now = _now()
    with database() as connection:
        with transaction(connection, immediate=True):
            row = connection.execute("SELECT state,lease_token FROM captures WHERE id=?", (capture_id,)).fetchone()
            if row is None or row["state"] != "running" or row["lease_token"] != lease_token:
                return
            connection.execute(
                "UPDATE captures SET state='failed',progress=?,finished_at=?,result_asset_id=NULL,"
                "error_code=?,error_message=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                (min(max(progress, 1), 99), now, error_code, error_message, now, capture_id),
            )


def process_one_capture() -> bool:
    with database() as connection:
        with transaction(connection, immediate=True):
            claimed = claim_next_capture(connection)
            if claimed is None:
                return False
            capture_id = claimed["id"]
            map_id = claimed["map_id"]
            lease_token = claimed["lease_token"]
            hfov = float(claimed["hfov_hint_deg"])
            frames = connection.execute(
                "SELECT frame_index,storage_key,sha256 FROM capture_frames WHERE capture_id=? ORDER BY frame_index ASC",
                (capture_id,),
            ).fetchall()

    if len(frames) != 16:
        _fail_capture(capture_id, lease_token, 10, "INPUT_EXPIRED", "Capture does not contain all 16 frame files")
        return True

    frame_paths: list[Path] = []
    hashes: set[str] = set()
    for frame in frames:
        path = (settings.media_path / frame["storage_key"]).resolve()
        if not path.is_file():
            _fail_capture(capture_id, lease_token, 10, "INPUT_EXPIRED", f"Frame {frame['frame_index']} is missing on disk")
            return True
        frame_paths.append(path)
        hashes.add(frame["sha256"])

    if len(hashes) < 12:
        _fail_capture(capture_id, lease_token, 15, "NOT_ENOUGH_OVERLAP", "Too many duplicate frames in capture sequence")
        return True

    missing_tools = [tool for tool in REQUIRED_TOOLS if shutil.which(tool) is None]
    if missing_tools:
        _fail_capture(
            capture_id,
            lease_token,
            20,
            "TOOL_FAILED",
            f"Stitching tools unavailable ({', '.join(missing_tools)}); upload a ready 360° panorama or run worker container",
        )
        return True

    try:
        with tempfile.TemporaryDirectory(prefix=f"ttkmap-stitch-{capture_id}-") as tmp_dir:
            work = Path(tmp_dir)
            pto = work / "project.pto"
            subprocess.run(["pto_gen", "-f", str(hfov), "-o", str(pto), *[str(p) for p in frame_paths]], check=True, timeout=60)
            subprocess.run(["cpfind", "--multirow", "-o", str(pto), str(pto)], check=True, timeout=120)
            subprocess.run(["cpclean", "-o", str(pto), str(pto)], check=True, timeout=60)
            subprocess.run(["autooptimiser", "-a", "-m", "-l", "-s", "-o", str(pto), str(pto)], check=True, timeout=60)
            subprocess.run(["pano_modify", "--projection=2", "--fov=360x180", "--canvas=4096x2048", "-o", str(pto), str(pto)], check=True, timeout=60)
            subprocess.run(["nona", "-m", "TIFF_m", "-o", str(work / "remapped"), str(pto)], check=True, timeout=120)
            remapped = sorted(work.glob("remapped*.tif"))
            if not remapped:
                _fail_capture(capture_id, lease_token, 75, "NOT_ENOUGH_OVERLAP", "No overlapping frames produced by nona")
                return True
            out_img = work / "stitched.png"
            subprocess.run(["enblend", "-o", str(out_img), *[str(p) for p in remapped]], check=True, timeout=180)
            raw_bytes = out_img.read_bytes()
            _, width, height = inspect_image_bytes(raw_bytes, 40 * 1024 * 1024)
            asset_id = str(uuid4())
            store = AssetStore(settings.media_path)
            preview_key, mobile_key, full_key, final_w, final_h = store.store_asset_variants(asset_id, raw_bytes, width, height)
            now = _now()
            with database() as connection:
                with transaction(connection, immediate=True):
                    row = connection.execute("SELECT state,lease_token FROM captures WHERE id=?", (capture_id,)).fetchone()
                    if row is None or row["state"] != "running" or row["lease_token"] != lease_token:
                        return True
                    connection.execute(
                        "INSERT INTO assets(id,map_id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,v_offset_deg,preview_key,mobile_key,full_key,created_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (asset_id, map_id, "panorama", "stitch", final_w, final_h, "equirectangular", 360, 180.0, 0.0, preview_key, mobile_key, full_key, now),
                    )
                    connection.execute(
                        "UPDATE captures SET state='succeeded',progress=100,finished_at=?,result_asset_id=?,"
                        "error_code=NULL,error_message=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
                        (now, asset_id, now, capture_id),
                    )
    except subprocess.TimeoutExpired:
        _fail_capture(capture_id, lease_token, 80, "TIMEOUT", "Panorama stitching timed out")
    except Exception as exc:
        _fail_capture(capture_id, lease_token, 80, "TOOL_FAILED", f"Stitching pipeline failed: {exc}")
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    initialize_database()
    settings.media_path.mkdir(parents=True, exist_ok=True)
    logging.info("TTKMap worker started and polling durable capture queue.")
    while True:
        processed = process_one_capture()
        if not processed:
            time.sleep(2)


if __name__ == "__main__":
    main()
