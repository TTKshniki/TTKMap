from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.app.db import database, transaction
from backend.worker.jobs import process_one_capture
from backend.worker.lease import LeaseKeeper, ProgressTracker
from backend.tests.stitch.conftest import (
    CAPTURE_ID,
    asset_rows,
    capture_row,
    create_capture,
    fake_stitcher,
)


def cancel_capture(capture_id: str = CAPTURE_ID) -> None:
    """Simulates the organizer pressing Cancel while Hugin is running."""
    from backend.worker.lease import now_iso

    with database() as connection:
        with transaction(connection, immediate=True):
            connection.execute(
                "UPDATE captures SET state='cancelled',finished_at=?,lease_token=NULL,lease_expires_at=NULL,"
                "updated_at=? WHERE id=?",
                (now_iso(), now_iso(), capture_id),
            )


def test_keeper_renews_the_lease(worker_env):
    create_capture(state="running", lease_token="token-1", lease_expires_at="2026-10-24T08:02:00Z")
    keeper = LeaseKeeper(CAPTURE_ID, "token-1", database, lease_seconds=120, renew_every_seconds=0.05)

    assert keeper.renew() is True
    assert keeper.renewals == 1
    row = capture_row()
    assert row["lease_expires_at"] > "2026-10-24T08:02:00Z"
    assert keeper.lost is False


def test_keeper_detects_a_cancelled_capture(worker_env):
    create_capture(state="running", lease_token="token-1", lease_expires_at="2026-10-24T08:02:00Z")
    keeper = LeaseKeeper(CAPTURE_ID, "token-1", database)

    cancel_capture()

    assert keeper.renew() is False
    assert keeper.lost is True
    assert keeper.is_cancelled() is True


def test_keeper_detects_a_reclaimed_lease(worker_env):
    create_capture(state="running", lease_token="token-1", lease_expires_at="2026-10-24T08:02:00Z")
    keeper = LeaseKeeper(CAPTURE_ID, "token-1", database)

    with database() as connection:
        with transaction(connection, immediate=True):
            connection.execute("UPDATE captures SET lease_token='token-2' WHERE id=?", (CAPTURE_ID,))

    assert keeper.renew() is False
    assert keeper.is_cancelled() is True


def test_progress_is_monotonic_and_lease_guarded(worker_env):
    create_capture(state="running", lease_token="token-1", lease_expires_at="2026-10-24T08:02:00Z")

    tracker = ProgressTracker(CAPTURE_ID, "token-1")
    tracker.step("validate")
    tracker.step("features")
    tracker.step("features")  # repeated step must not move the bar backwards
    tracker.step("validate")  # late callback from an earlier stage
    assert tracker.history == [10, 30]
    assert capture_row()["progress"] == 30

    # A stale worker with an old token cannot touch progress any more.
    stale = ProgressTracker(CAPTURE_ID, "token-0")
    stale.set(95)
    assert capture_row()["progress"] == 30

    # Progress is capped below 100 until the job really succeeds.
    tracker.set(100)
    assert capture_row()["progress"] == 95


def test_cancelled_job_keeps_terminal_state_and_writes_no_asset(worker_env):
    create_capture()

    def stitcher(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        if on_step is not None:
            on_step("features")
        cancel_capture()
        if is_cancelled is not None and is_cancelled():
            from backend.worker.stitching import StitchCancelled

            raise StitchCancelled()

    outcome = process_one_capture(stitcher=stitcher, tools_check=lambda: [])

    assert outcome.status == "cancelled"
    row = capture_row()
    assert row["state"] == "cancelled"
    assert row["result_asset_id"] is None
    assert row["error_code"] is None
    assert asset_rows() == []


def test_lease_lost_mid_run_discards_the_result(worker_env):
    create_capture()

    def stitcher(frames, work_root, hfov, *, on_step=None, is_cancelled=None, frame_count=16):
        # Another worker re-claims the job while Hugin is still rendering.
        with database() as connection:
            with transaction(connection, immediate=True):
                connection.execute("UPDATE captures SET lease_token='someone-else' WHERE id=?", (CAPTURE_ID,))
        if on_step is not None:
            on_step("render")
        return fake_stitcher()(frames, work_root, hfov, on_step=on_step, is_cancelled=is_cancelled)

    outcome = process_one_capture(stitcher=stitcher, tools_check=lambda: [])

    assert outcome.status == "lease_lost"
    assert asset_rows() == []
    assert capture_row()["state"] == "running"


def test_expired_lease_is_requeued_with_incremented_attempt(worker_env):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
    create_capture(state="running", attempt=1, lease_token="dead-worker", lease_expires_at=expired)

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    # claim_next_capture re-queues the stale job (attempt 1 -> 2) and immediately re-claims it.
    assert outcome.status == "succeeded"
    row = capture_row()
    assert row["state"] == "succeeded"
    assert row["attempt"] == 2


def test_stale_lease_after_two_attempts_fails_with_worker_lost(worker_env):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
    create_capture(state="running", attempt=2, lease_token="dead-worker", lease_expires_at=expired)

    outcome = process_one_capture(stitcher=fake_stitcher(), tools_check=lambda: [])

    assert outcome.processed is False
    row = capture_row()
    assert row["state"] == "failed"
    assert row["error_code"] == "WORKER_LOST"
    assert asset_rows() == []
