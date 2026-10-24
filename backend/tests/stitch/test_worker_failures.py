from __future__ import annotations

import pytest

from backend.worker.jobs import process_one_capture, recovery_hint
from backend.worker.stitching import StitchError
from backend.tests.stitch.conftest import (
    asset_rows,
    capture_row,
    create_capture,
    fake_stitcher,
)


def failing_stitcher(code: str = "NOT_ENOUGH_OVERLAP", message: str = "Too little overlap"):
    def _stitch(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        if on_step is not None:
            on_step("features")
        raise StitchError(code, message)

    return _stitch


def exploding_stitcher():
    def _stitch(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        raise RuntimeError("unexpected hugin crash")

    return _stitch


def test_incomplete_frame_set_fails_without_asset(worker_env):
    create_capture(frames=12)

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.status == "failed"
    assert outcome.error_code == "INPUT_EXPIRED"
    row = capture_row()
    assert row["state"] == "failed"
    assert row["finished_at"] is not None
    assert row["result_asset_id"] is None
    assert "16" in row["error_message"]
    assert asset_rows() == []


def test_missing_file_on_disk_fails_the_job(worker_env):
    create_capture()
    (worker_env["media"] / f"captures/{capture_row()['id']}/frame-07.bin").unlink()

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.status == "failed"
    assert outcome.error_code == "INPUT_EXPIRED"
    assert "Frame 7" in (outcome.error_message or "")
    assert asset_rows() == []


def test_duplicate_frames_are_rejected(worker_env):
    create_capture(unique_frames=8)

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.status == "failed"
    assert outcome.error_code == "NOT_ENOUGH_OVERLAP"
    assert capture_row()["state"] == "failed"
    assert asset_rows() == []


def test_missing_hugin_tools_fails_with_recovery_hint(worker_env):
    create_capture()

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: ["pto_gen", "enblend"])

    assert outcome.status == "failed"
    assert outcome.error_code == "TOOL_FAILED"
    assert "pto_gen" in (outcome.error_message or "")
    assert "готовую сферу" in (outcome.recovery or "")
    assert capture_row()["state"] == "failed"
    assert asset_rows() == []


def test_stitch_error_keeps_job_failed_and_bounded(worker_env):
    create_capture()

    outcome = process_one_capture(stitcher=failing_stitcher(), tools_check=lambda: [])

    assert outcome.status == "failed"
    assert outcome.error_code == "NOT_ENOUGH_OVERLAP"
    row = capture_row()
    assert row["state"] == "failed"
    assert row["error_message"] == "Too little overlap"
    # Failed jobs must stay below 100 % and keep a recovery action.
    assert 0 < row["progress"] < 100
    assert recovery_hint(row["error_code"]).startswith("Мало перекрытия")
    assert asset_rows() == []


def test_unexpected_exception_is_reported_as_tool_failure(worker_env):
    create_capture()

    outcome = process_one_capture(stitcher=exploding_stitcher(), tools_check=lambda: [])

    assert outcome.status == "failed"
    assert outcome.error_code == "TOOL_FAILED"
    assert "unexpected hugin crash" in (outcome.error_message or "")
    assert capture_row()["state"] == "failed"


def test_worker_survives_a_broken_job_and_processes_the_next_one(worker_env):
    create_capture()
    first = process_one_capture(stitcher=exploding_stitcher(), tools_check=lambda: [])
    assert first.status == "failed"

    second_capture = "00000000-0000-4000-8000-0000000a0004"
    create_capture(capture_id=second_capture)
    second = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert second.status == "succeeded"
    assert second.capture_id == second_capture


@pytest.mark.parametrize(
    ("code", "hint"),
    [
        ("INPUT_EXPIRED", "переснимите"),
        ("INSUFFICIENT_COVERAGE", "не наклоняйте"),
        ("TIMEOUT", "лимит времени"),
        ("QUALITY_REJECTED", "контроль качества"),
    ],
)
def test_every_error_code_has_a_recovery_hint(code: str, hint: str):
    assert hint in recovery_hint(code)


def test_unknown_error_code_falls_back_to_generic_hint():
    assert "Повторите склейку" in recovery_hint("SOMETHING_NEW")
    assert "Повторите склейку" in recovery_hint(None)
