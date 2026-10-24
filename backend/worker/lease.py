from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import threading
import time

from backend.app.db import database, transaction
from backend.worker.processes import LeaseLost, StitchError


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Lease:
    def __init__(self, capture_id: str, token: str, *, seconds: int = 120,
                 heartbeat_seconds: float = 5, stop: threading.Event | None = None,
                 timeout_seconds: float = 900):
        if seconds <= 0 or not 0 < heartbeat_seconds < seconds:
            raise ValueError("Heartbeat interval must be shorter than the positive lease duration")
        self.capture_id = capture_id
        self.token = token
        self.seconds = seconds
        self.heartbeat_seconds = heartbeat_seconds
        self.stop = stop if stop is not None else threading.Event()
        self.closed = threading.Event()
        self.lost = threading.Event()
        self.deadline = time.monotonic() + timeout_seconds
        self.thread = threading.Thread(target=self._heartbeat, name="capture-lease", daemon=True)

    def check(self):
        if self.stop.is_set() or self.lost.is_set():
            raise LeaseLost("Capture lease no longer belongs to this worker")
        if time.monotonic() >= self.deadline:
            raise StitchError("TIMEOUT", "Stitch attempt exceeded its time limit")

    def renew(self, progress: int | None = None):
        self.check()
        with database() as db:
            with transaction(db, immediate=True):
                now_dt = datetime.now(timezone.utc)
                now = now_dt.isoformat().replace("+00:00", "Z")
                expires = (now_dt + timedelta(seconds=self.seconds)).isoformat().replace("+00:00", "Z")
                result = db.execute(
                    "UPDATE captures SET lease_expires_at=?,updated_at=?,progress=MAX(progress,COALESCE(?,progress)) "
                    "WHERE id=? AND state='running' AND lease_token=? AND julianday(lease_expires_at)>julianday(?)",
                    (expires, now, None if progress is None else min(max(progress, 1), 99), self.capture_id, self.token, now),
                )
                if result.rowcount != 1:
                    self.lost.set()
                    raise LeaseLost("Capture was cancelled, reclaimed or its lease expired")

    def _heartbeat(self):
        while not self.closed.wait(self.heartbeat_seconds):
            try:
                self.renew()
            except LeaseLost:
                self.lost.set()
                return
            except StitchError:
                # Let the foreground observe TIMEOUT and record a failed job.
                return
            except Exception:
                logging.exception("Capture heartbeat failed for %s", self.capture_id)
                self.lost.set()
                return

    def __enter__(self):
        self.renew()
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.closed.set()
        self.thread.join(timeout=10)
