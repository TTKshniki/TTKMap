from __future__ import annotations

from backend.app.config import settings
from backend.worker.jobs import process_one_capture
from backend.tests.stitch.conftest import (
    CAPTURE_ID,
    asset_rows,
    capture_row,
    create_capture,
    fake_stitcher,
)


def test_successful_stitch_publishes_measured_asset(worker_env):
    create_capture()

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.processed is True
    assert outcome.status == "succeeded"
    assert outcome.capture_id == CAPTURE_ID

    row = capture_row()
    assert row["state"] == "succeeded"
    assert row["progress"] == 100
    assert row["finished_at"] is not None
    assert row["error_code"] is None
    assert row["lease_token"] is None
    assert row["result_asset_id"]

    assets = asset_rows()
    assert len(assets) == 1
    asset = assets[0]
    assert asset["id"] == row["result_asset_id"]
    assert asset["kind"] == "panorama"
    assert asset["source"] == "stitch"
    assert asset["projection"] == "equirectangular"
    assert asset["haov_deg"] == 360
    # The angles come from the measured sphere, not from hardcoded 180/0.
    assert asset["vaov_deg"] == 172.5
    assert asset["v_offset_deg"] == 3.5


def test_success_writes_all_media_variants(worker_env):
    create_capture()
    process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    asset = asset_rows()[0]
    for key_field in ("preview_key", "mobile_key", "full_key"):
        path = settings.media_path / asset[key_field]
        assert path.is_file(), f"{key_field} was not written"
        assert path.stat().st_size > 0


def test_work_directory_is_cleaned_up_after_import(worker_env):
    create_capture()
    process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    work_root = settings.media_path / "stitch-work"
    leftovers = list(work_root.glob("fake-work")) if work_root.exists() else []
    assert leftovers == []


def test_progress_is_monotonic_and_reaches_100(worker_env):
    create_capture()
    seen: list[int] = []

    def stitcher(*args, on_step=None, **kwargs):
        def record(step: str) -> None:
            on_step(step)
            seen.append(capture_row()["progress"])

        base = fake_stitcher()
        return base(*args, on_step=record, **kwargs)

    outcome = process_one_capture(stitcher=stitcher, tools_check=lambda: [])

    assert outcome.status == "succeeded"
    assert seen == sorted(seen), f"progress went backwards: {seen}"
    assert seen[0] >= 10
    assert capture_row()["progress"] == 100


def test_second_poll_returns_no_work(worker_env):
    create_capture()
    first = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])
    second = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert first.processed is True
    assert second.processed is False
    assert second.capture_id is None
