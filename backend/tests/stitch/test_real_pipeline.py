"""Required native acceptance: missing Hugin or real fixtures is a FAILURE."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import time

from fastapi.testclient import TestClient
from PIL import Image, ImageOps
import pytest

from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.main import create_app
from backend.app.modules.capture.service import store_capture_frame, submit_stitch
from backend.worker.main import process_one_capture
from backend.worker.processes import StitchError, require_tools
from backend.worker.stitching import stitch


def test_real_capture_through_worker_and_responsive_api(capture_job, real_frames, record_property):
    require_tools()  # Never skip or mock native tool availability.
    # Use a new collecting session: the unit fixture's queued frames are sealed.
    from uuid import uuid4
    capture_id = str(uuid4())
    with database() as db:
        with transaction(db, immediate=True):
            parent = db.execute("SELECT * FROM captures WHERE id=?", (capture_job,)).fetchone()
            # Cancel the synthetic queue job so this worker claims the real one.
            from backend.app.modules.capture.service import cancel_capture_job
            cancel_capture_job(db, parent)
            db.execute("INSERT INTO captures(id,map_id,title,x,y,hfov_hint_deg) VALUES(?,?,?,?,?,?)",
                       (capture_id, parent["map_id"], "C1 real series", 10, 10, 60))
            for index, path in enumerate(real_frames):
                with Image.open(path) as image:
                    image = ImageOps.exif_transpose(image).convert("RGB")
                    image.thumbnail((1600, 1600))
                    output = BytesIO()
                    image.save(output, format="JPEG", quality=92)
                row = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
                store_capture_frame(db, row, index, output.getvalue())
            row = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
            submit_stitch(db, row)
    latencies = []
    with TestClient(create_app()) as api, ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(process_one_capture)
        while not future.done():
            before = time.monotonic()
            assert api.get("/healthz").status_code == 200
            latencies.append(time.monotonic() - before)
            time.sleep(0.1)
        assert future.result()
    assert latencies and max(latencies) < 2, "API blocked during native stitching"
    record_property("max_health_latency_seconds", max(latencies))
    with database() as db:
        result = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
        assert result["state"] == "succeeded", f"Real C1 series rejected: {result['error_code']}: {result['error_message']}"
        asset = db.execute("SELECT * FROM assets WHERE id=?", (result["result_asset_id"],)).fetchone()
        assert asset["width_px"] == 4096 and 40 <= asset["vaov_deg"] <= 180
        assert asset["height_px"] == pytest.approx(4096 * asset["vaov_deg"] / 360)
        record_property("vaov_deg", asset["vaov_deg"])
        record_property("v_offset_deg", asset["v_offset_deg"])
        for name in ("preview", "mobile", "full"):
            with Image.open(settings.media_path / asset[name + "_key"]) as image:
                assert image.format == "WEBP"


def test_real_incomplete_and_duplicate_sets_fail(real_frames, tmp_path):
    require_tools()
    for frames, expected in [(real_frames[:8], "INPUT_EXPIRED"),
                             ([*real_frames[:4], real_frames[3], *real_frames[5:]], "NOT_ENOUGH_OVERLAP")]:
        with pytest.raises(StitchError) as error:
            stitch(frames, tmp_path / expected)
        assert error.value.code == expected
