from __future__ import annotations

from datetime import datetime, timedelta, timezone
import threading


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def lease_expiry(seconds: int) -> str:
    deadline = datetime.now(timezone.utc) + timedelta(seconds=seconds)
    return deadline.isoformat().replace("+00:00", "Z")


class LeaseKeeper:
    """Renews the capture lease while a long Hugin run is in progress.

    A single claim lasts ``lease_seconds`` (120 s by default) while a full
    stitch can take several minutes. Without renewal another worker would
    re-claim the capture mid-run, both would write an asset and the loser's
    spheres would be orphaned in storage. The keeper renews the lease in a
    background thread and flips ``lost`` as soon as the row no longer belongs
    to this worker (cancelled, re-queued after expiry, or re-claimed).
    """

    def __init__(
        self,
        capture_id: str,
        lease_token: str,
        connection_factory,
        *,
        lease_seconds: int = 120,
        renew_every_seconds: float = 30.0,
    ) -> None:
        self.capture_id = capture_id
        self.lease_token = lease_token
        self._connection_factory = connection_factory
        self.lease_seconds = lease_seconds
        self.renew_every_seconds = renew_every_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self.lost = False
        self.renewals = 0

    # -- lease state -----------------------------------------------------
    def owns_lease(self) -> bool:
        from backend.app.db import database

        with database() as connection:
            row = connection.execute(
                "SELECT state,lease_token FROM captures WHERE id=?", (self.capture_id,)
            ).fetchone()
        return bool(row) and row["state"] == "running" and row["lease_token"] == self.lease_token

    def renew(self) -> bool:
        """Extends the lease; returns False when it is no longer ours."""
        from backend.app.db import database, transaction

        with database() as connection:
            with transaction(connection, immediate=True):
                row = connection.execute(
                    "SELECT state,lease_token FROM captures WHERE id=?", (self.capture_id,)
                ).fetchone()
                if row is None or row["state"] != "running" or row["lease_token"] != self.lease_token:
                    with self._lock:
                        self.lost = True
                    return False
                connection.execute(
                    "UPDATE captures SET lease_expires_at=?,updated_at=? WHERE id=? AND lease_token=?",
                    (lease_expiry(self.lease_seconds), now_iso(), self.capture_id, self.lease_token),
                )
        with self._lock:
            self.renewals += 1
        return True

    def is_cancelled(self) -> bool:
        return self.lost or not self.owns_lease()

    # -- lifecycle -------------------------------------------------------
    def _loop(self) -> None:
        while not self._stop.wait(self.renew_every_seconds):
            if not self.renew():
                return

    def start(self) -> "LeaseKeeper":
        self._thread = threading.Thread(target=self._loop, name=f"lease-{self.capture_id[:8]}", daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def __enter__(self) -> "LeaseKeeper":
        return self.start()

    def __exit__(self, *exc_info) -> None:
        self.stop()


class ProgressTracker:
    """Writes monotonic progress for the current lease.

    Progress drops are ignored so a late callback cannot move the bar
    backwards, and every write is guarded by ``lease_token``.
    """

    STEPS: dict[str, int] = {
        "validate": 10,
        "features": 30,
        "optimise": 50,
        "render": 70,
        "blend": 85,
        "quality": 95,
    }

    def __init__(self, capture_id: str, lease_token: str, keeper: LeaseKeeper | None = None) -> None:
        self.capture_id = capture_id
        self.lease_token = lease_token
        self.keeper = keeper
        self.current = 0
        self.history: list[int] = []

    def step(self, name: str) -> None:
        self.set(self.STEPS.get(name, self.current))

    def set(self, value: int) -> None:
        from backend.app.db import database, transaction

        bounded = max(1, min(95, int(value)))
        if bounded <= self.current:
            return
        self.current = bounded
        self.history.append(bounded)
        with database() as connection:
            with transaction(connection, immediate=True):
                connection.execute(
                    "UPDATE captures SET progress=?,updated_at=? WHERE id=? AND lease_token=? AND state='running'",
                    (bounded, now_iso(), self.capture_id, self.lease_token),
                )
