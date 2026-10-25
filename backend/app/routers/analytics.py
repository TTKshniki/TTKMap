from __future__ import annotations

import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field

from backend.app.auth import require_session
from backend.app.db import database, transaction
from backend.app.errors import ApiError
from backend.app.modules.maps.snapshots import _owned_map
from backend.app.schemas import UUID, StrictModel


router = APIRouter(prefix="/api/v1", tags=["analytics"])

EVENT_TYPES = ("map_view", "poi_click", "route_built")
# Offline clients deliver late; older or future-dated events are rejected, not stored.
MAX_EVENT_AGE = timedelta(days=30)
MAX_CLOCK_SKEW = timedelta(minutes=5)
_RATE_WINDOW_SECONDS = 60.0
_RATE_MAX_REQUESTS = 60
_requests: dict[str, list[float]] = defaultdict(list)
_requests_lock = threading.Lock()


class AnalyticsEvent(StrictModel):
    id: UUID
    event_type: Literal["map_view", "poi_click", "route_built"]
    poi_id: UUID | None = None
    occurred_at: datetime


class AnalyticsBatch(StrictModel):
    visitor_id: UUID
    source: Literal["web", "embed", "android"]
    events: list[AnalyticsEvent] = Field(min_length=1, max_length=100)


def clear_analytics_rate_limit() -> None:
    with _requests_lock:
        _requests.clear()


def _check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    cutoff = now - _RATE_WINDOW_SECONDS
    with _requests_lock:
        if len(_requests) > 10000:
            for key in [key for key, stamps in _requests.items() if not stamps or stamps[-1] <= cutoff]:
                del _requests[key]
        recent = [stamp for stamp in _requests[client_ip] if stamp > cutoff]
        if len(recent) >= _RATE_MAX_REQUESTS:
            _requests[client_ip] = recent
            raise ApiError(429, "RATE_LIMITED", "Too many analytics requests, please retry later")
        recent.append(now)
        _requests[client_ip] = recent


def _utc(value: datetime) -> str:
    # Whole seconds keep stored timestamps lexicographically comparable.
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.post("/public/maps/{slug}/analytics")
def submit_analytics(slug: str, payload: AnalyticsBatch, request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")
    now = datetime.now(timezone.utc)
    received_at = _utc(now)
    accepted = duplicates = rejected = 0
    with database() as connection:
        with transaction(connection, immediate=True):
            row = connection.execute("SELECT id FROM maps WHERE slug=? AND is_published=1", (slug,)).fetchone()
            if row is None:
                raise ApiError(404, "NOT_FOUND", "Published map not found")
            poi_ids = {item["id"] for item in connection.execute("SELECT id FROM pois WHERE map_id=?", (row["id"],))}
            for event in payload.events:
                occurred = event.occurred_at
                in_window = occurred.tzinfo is not None and now - MAX_EVENT_AGE <= occurred <= now + MAX_CLOCK_SKEW
                # map_view has no POI, poi_click needs one, route_built may name its destination.
                poi_shape = {"map_view": event.poi_id is None, "poi_click": event.poi_id is not None,
                             "route_built": True}[event.event_type]
                known_poi = event.poi_id is None or event.poi_id in poi_ids
                if not (in_window and poi_shape and known_poi):
                    rejected += 1
                    continue
                cursor = connection.execute(
                    "INSERT OR IGNORE INTO analytics_events(id,map_id,event_type,poi_id,visitor_id,source,occurred_at,received_at) "
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (event.id, row["id"], event.event_type, event.poi_id, payload.visitor_id, payload.source,
                     _utc(occurred), received_at),
                )
                if cursor.rowcount:
                    accepted += 1
                else:
                    duplicates += 1
    return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}


@router.get("/maps/{map_id}/analytics")
def analytics_report(
    map_id: str,
    row=Depends(require_session),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    end = date_to or datetime.now(timezone.utc).date()
    start = date_from or end - timedelta(days=29)
    if start > end or (end - start).days > 366:
        raise ApiError(422, "VALIDATION_ERROR", "Report range must be 1..367 days with from <= to")
    window = (map_id, f"{start.isoformat()}T00:00:00Z", f"{(end + timedelta(days=1)).isoformat()}T00:00:00Z")
    scope = "FROM analytics_events WHERE map_id=? AND occurred_at>=? AND occurred_at<?"
    with database() as connection:
        with transaction(connection):
            _owned_map(connection, map_id, row["user_id"])
            totals = dict.fromkeys(EVENT_TYPES, 0)
            for item in connection.execute(f"SELECT event_type, COUNT(*) AS n {scope} GROUP BY event_type", window):
                totals[item["event_type"]] = item["n"]
            unique_visitors = connection.execute(f"SELECT COUNT(DISTINCT visitor_id) {scope}", window).fetchone()[0]
            by_day: dict[str, dict] = {}
            for item in connection.execute(
                    f"SELECT substr(occurred_at,1,10) AS day, event_type, COUNT(*) AS n {scope} GROUP BY day, event_type ORDER BY day",
                    window):
                by_day.setdefault(item["day"], {"date": item["day"], **dict.fromkeys(EVENT_TYPES, 0)})[item["event_type"]] = item["n"]
            top_pois = [
                {"poi_id": item["poi_id"], "title": item["title"], "clicks": item["clicks"]}
                for item in connection.execute(
                    "SELECT a.poi_id, p.title, COUNT(*) AS clicks FROM analytics_events a "
                    "LEFT JOIN pois p ON p.id=a.poi_id AND p.map_id=a.map_id "
                    "WHERE a.map_id=? AND a.occurred_at>=? AND a.occurred_at<? AND a.event_type='poi_click' "
                    "GROUP BY a.poi_id ORDER BY clicks DESC, a.poi_id LIMIT 20",
                    window)
            ]
    return {"from": start.isoformat(), "to": end.isoformat(), "totals": totals, "unique_visitors": unique_visitors,
            "by_day": list(by_day.values()), "top_pois": top_pois}
