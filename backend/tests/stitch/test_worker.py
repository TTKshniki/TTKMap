from pathlib import Path
import threading
import time
from uuid import uuid4

import pytest
from PIL import Image

from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.modules.capture.service import cancel_capture_job, claim_next_capture
from backend.worker import main as worker
from backend.worker.lease import Lease
from backend.worker.processes import LeaseLost, StitchError
from backend.worker.quality import AlignmentQuality
from backend.worker.stitching import StitchResult


def status(capture_id):
    with database() as db:
        return dict(db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone())


def cancel(capture_id):
    with database() as db:
        with transaction(db, immediate=True):
            row = db.execute("SELECT * FROM captures WHERE id=?", (capture_id,)).fetchone()
            cancel_capture_job(db, row)


def fake_stitch(frames, work, *args, **kwargs):
    # Unit seam only: real acceptance is in test_real_pipeline.py.
    path = work / "unit-crop.png"
    Image.new("RGB", (4096, 1024), "red").save(path)
    return StitchResult(path, 4096, 1024, 90, 5, AlignmentQuality(64, 64, 1, 2))


def test_unit_success_preserves_measured_angles_and_variants(capture_job, monkeypatch):
    monkeypatch.setattr(worker, "stitch", fake_stitch)
    assert worker.process_one_capture()
    row = status(capture_job)
    assert row["state"] == "succeeded" and row["progress"] == 100
    assert row["lease_token"] is None and row["finished_at"]
    with database() as db:
        asset = db.execute("SELECT * FROM assets WHERE id=?", (row["result_asset_id"],)).fetchone()
        assert asset["source"] == "stitch" and asset["width_px"] == 4096
        assert asset["height_px"] == 1024 and asset["vaov_deg"] == 90 and asset["v_offset_deg"] == 5
        for variant in ("preview", "mobile", "full"):
            with Image.open(settings.media_path / asset[variant + "_key"]) as image:
                assert image.format == "WEBP" and image.width / image.height == 4
    assert worker.process_one_capture() is False


@pytest.mark.parametrize("code", ["INPUT_EXPIRED", "NOT_ENOUGH_OVERLAP", "LOOP_NOT_CLOSED", "INSUFFICIENT_COVERAGE", "QUALITY_REJECTED", "TIMEOUT", "TOOL_FAILED"])
def test_every_failure_remains_failed_without_asset(capture_job, monkeypatch, code):
    roots = []

    def failing(frames, work, *args, **kwargs):
        roots.append(work)
        raise StitchError(code, "Expected test failure")

    monkeypatch.setattr(worker, "stitch", failing)
    assert worker.process_one_capture()
    row = status(capture_job)
    assert row["state"] == "failed" and row["error_code"] == code
    assert row["progress"] < 100 and row["result_asset_id"] is None and row["lease_token"] is None
    assert all(not root.exists() for root in roots)
    with database() as db:
        assert db.execute("SELECT COUNT(*) FROM assets").fetchone()[0] == 0


def test_cancellation_between_render_and_commit_removes_variants(capture_job, monkeypatch):
    original = worker.commit_result

    def cancelled(capture, lease, result, variants, asset_id):
        cancel(capture_job)
        return original(capture, lease, result, variants, asset_id)

    monkeypatch.setattr(worker, "stitch", fake_stitch)
    monkeypatch.setattr(worker, "commit_result", cancelled)
    worker.process_one_capture()
    assert status(capture_job)["state"] == "cancelled"
    assert list(settings.media_path.glob("*/full.webp")) == []
    with database() as db:
        assert db.execute("SELECT COUNT(*) FROM assets").fetchone()[0] == 0


def test_missing_source_does_not_invoke_stitch(capture_job, monkeypatch):
    with database() as db:
        key = db.execute("SELECT storage_key FROM capture_frames WHERE capture_id=? LIMIT 1", (capture_job,)).fetchone()[0]
    (settings.media_path / key).unlink()
    monkeypatch.setattr(worker, "stitch", lambda *a, **kw: pytest.fail("Stitch invoked with a missing frame"))
    worker.process_one_capture()
    assert status(capture_job)["error_code"] == "INPUT_EXPIRED"


def test_heartbeat_extends_lease_and_detects_cancel(running):
    with Lease(running["id"], running["lease_token"], seconds=2, heartbeat_seconds=0.05) as lease:
        first = status(running["id"])["lease_expires_at"]
        time.sleep(0.15)
        assert status(running["id"])["lease_expires_at"] > first
        lease.renew(70)
        lease.renew(20)
        assert status(running["id"])["progress"] == 70
        cancel(running["id"])
        assert lease.lost.wait(2)
        with pytest.raises(LeaseLost):
            lease.check()


def test_expired_worker_cannot_renew_fail_or_commit(running, tmp_path):
    lease = Lease(running["id"], running["lease_token"])
    with database() as db:
        db.execute("UPDATE captures SET lease_expires_at='2000-01-01T00:00:00Z' WHERE id=?", (running["id"],))
    with pytest.raises(LeaseLost):
        lease.renew()
    assert worker.fail_capture(running["id"], running["lease_token"], StitchError("TOOL_FAILED", "late")) is False
    result = StitchResult(tmp_path / "absent", 4096, 1024, 90, 0, AlignmentQuality(64, 64, 1, 2))
    with pytest.raises(LeaseLost):
        worker.commit_result(running, Lease(running["id"], running["lease_token"]), result,
                             {"preview": "p", "mobile": "m", "full": "f"}, str(uuid4()))
    with database() as db:
        claimed = claim_next_capture(db)
        assert claimed["attempt"] == 2 and claimed["lease_token"] != running["lease_token"]


def test_attempt_deadline_records_timeout(capture_job, monkeypatch):
    def too_slow(frames, work, *args, runner, **kwargs):
        time.sleep(0.2)
        runner.check()

    monkeypatch.setattr(worker, "stitch", too_slow)
    worker.process_one_capture(timeout_seconds=0.05, heartbeat_seconds=0.01)
    assert status(capture_job)["state"] == "failed"
    assert status(capture_job)["error_code"] == "TIMEOUT"


def test_shutdown_leaves_recoverable_lease_and_no_success(capture_job, monkeypatch):
    stop = threading.Event()

    def shutting_down(frames, work, *args, runner, **kwargs):
        stop.set()
        runner.check()

    monkeypatch.setattr(worker, "stitch", shutting_down)
    worker.process_one_capture(stop=stop)
    assert status(capture_job)["state"] == "running"
    assert status(capture_job)["result_asset_id"] is None
    assert worker.process_one_capture(stop=stop) is False


def test_variant_write_failure_cleans_partial_files(capture_job, monkeypatch):
    monkeypatch.setattr(worker, "stitch", fake_stitch)
    original = worker.AssetStore.write_atomic
    writes = []

    def fail_second(self, key, data):
        if writes:
            raise OSError("disk full")
        result = original(self, key, data)
        writes.append(result)
        return result

    monkeypatch.setattr(worker.AssetStore, "write_atomic", fail_second)
    worker.process_one_capture()
    assert status(capture_job)["error_code"] == "TOOL_FAILED"
    assert writes and not writes[0].exists()
