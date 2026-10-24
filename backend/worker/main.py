from __future__ import annotations

import logging
import os
import signal
import sys
import threading
import time

from backend.app.config import settings
from backend.app.db import initialize_database
from backend.worker.jobs import process_one_capture
from backend.worker.stitching import missing_tools


LOG = logging.getLogger("ttkmap.worker")

_stop = threading.Event()


def _handle_signal(signum: int, _frame) -> None:
    LOG.info("Received signal %s, finishing the current job and stopping", signum)
    _stop.set()


def poll_interval() -> float:
    try:
        return max(0.2, float(os.getenv("WORKER_POLL_SECONDS", "2")))
    except ValueError:
        return 2.0


def run_once() -> bool:
    """Processes one capture; returns False when the queue was empty."""
    outcome = process_one_capture()
    if not outcome.processed:
        return False
    if outcome.status == "succeeded":
        LOG.info("Capture %s stitched successfully", outcome.capture_id)
    elif outcome.status == "failed":
        LOG.warning(
            "Capture %s failed (%s): %s | recovery: %s",
            outcome.capture_id,
            outcome.error_code,
            outcome.error_message,
            outcome.recovery,
        )
    elif outcome.status == "cancelled":
        LOG.info("Capture %s cancelled by the organizer", outcome.capture_id)
    elif outcome.status == "lease_lost":
        LOG.warning("Capture %s lease was lost, result discarded", outcome.capture_id)
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    initialize_database()
    settings.media_path.mkdir(parents=True, exist_ok=True)

    unavailable = missing_tools()
    if unavailable:
        # The worker keeps running: jobs fail with TOOL_FAILED and a recovery
        # action instead of silently disappearing from the queue.
        LOG.warning("Hugin/enblend tools are missing: %s", ", ".join(unavailable))
    else:
        LOG.info("Hugin/enblend pipeline is available")

    LOG.info("TTKMap worker started, polling the durable capture queue")
    interval = poll_interval()
    while not _stop.is_set():
        try:
            processed = run_once()
        except Exception:  # noqa: BLE001 - a single bad job must not kill the worker
            LOG.exception("Unhandled worker error, continuing")
            processed = False
        if not processed:
            _stop.wait(interval)
    LOG.info("TTKMap worker stopped")


if __name__ == "__main__":
    sys.exit(main())
