"""Visitor analytics: validated, idempotent ingestion and owner-only reports."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from backend.app.auth import create_organizer
from backend.app.routers.analytics import clear_analytics_rate_limit
from backend.tests.integration.test_runtime_contract import validate
from backend.tests.maps.test_floors import ORIGIN, _setup, _two_floor_document
from backend.tests.maps.test_maps import client  # noqa: F401  (fixture)


def _published(client):
    clear_analytics_rate_limit()
    snapshot, headers, etag = _setup(client)
    doc, ids = _two_floor_document(snapshot)
    saved = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
    assert saved.status_code == 200, saved.json()
    return snapshot, headers, ids


def _event(event_type, poi_id=None, when=None):
    when = when or datetime.now(timezone.utc) - timedelta(minutes=1)
    return {"id": str(uuid4()), "event_type": event_type, "poi_id": poi_id,
            "occurred_at": when.isoformat().replace("+00:00", "Z")}


def test_ingestion_validates_and_is_idempotent(client):
    snapshot, _, ids = _published(client)
    url = f"/api/v1/public/maps/{snapshot['slug']}/analytics"
    long_ago = datetime.now(timezone.utc) - timedelta(days=400)
    good = [_event("map_view"), _event("poi_click", ids["poi_office"]), _event("route_built", ids["poi_office"]),
            _event("route_built")]
    bad = [_event("route_built", when=long_ago),  # precedence regression: old route_built must not slip through
           _event("map_view", ids["poi_office"]), _event("poi_click"), _event("poi_click", str(uuid4())),
           _event("map_view", when=datetime.now(timezone.utc) + timedelta(hours=1)),
           {**_event("map_view"), "occurred_at": "2026-01-01T00:00:00"}]
    batch = {"visitor_id": str(uuid4()), "source": "android", "events": good + bad}

    client.cookies.clear()
    first = client.post(url, json=batch)
    assert first.status_code == 200, first.json()
    validate("AnalyticsBatchResult", first.json())
    assert first.json() == {"accepted": 4, "duplicates": 0, "rejected": 6}
    # An offline queue resends after a lost response: nothing is counted twice.
    assert client.post(url, json=batch).json() == {"accepted": 0, "duplicates": 4, "rejected": 6}

    assert client.post(url, json={**batch, "source": "desktop"}).status_code == 422
    assert client.post(url, json={**batch, "events": []}).status_code == 422
    assert client.post(url, json={**batch, "events": [_event("map_view")] * 101}).status_code == 422
    assert client.post("/api/v1/public/maps/" + "a" * 26 + "/analytics", json=batch).status_code == 404


def test_report_is_owner_only_and_aggregates(client):
    snapshot, headers, ids = _published(client)
    url = f"/api/v1/public/maps/{snapshot['slug']}/analytics"
    visitor_a, visitor_b = str(uuid4()), str(uuid4())
    client.post(url, json={"visitor_id": visitor_a, "source": "web", "events": [
        _event("map_view"), _event("poi_click", ids["poi_office"]), _event("poi_click", ids["poi_office"])]})
    client.post(url, json={"visitor_id": visitor_b, "source": "embed", "events": [
        _event("map_view"), _event("poi_click", ids["poi_entry"]), _event("route_built", ids["poi_office"])]})

    report = client.get(f"/api/v1/maps/{snapshot['id']}/analytics")
    assert report.status_code == 200, report.json()
    body = report.json()
    validate("AnalyticsReport", body)
    assert body["totals"] == {"map_view": 2, "poi_click": 3, "route_built": 1}
    assert body["unique_visitors"] == 2
    assert sum(day["poi_click"] for day in body["by_day"]) == 3
    assert body["top_pois"][0] == {"poi_id": ids["poi_office"], "title": "Office", "clicks": 2}

    assert client.get(f"/api/v1/maps/{snapshot['id']}/analytics?from=2026-02-01&to=2026-01-01").status_code == 422
    assert client.get(f"/api/v1/maps/{snapshot['id']}/analytics?from=2020-01-01&to=2026-01-01").status_code == 422

    create_organizer("other@example.test", "valid-password-123")
    token = client.post("/api/v1/tokens", json={"email": "other@example.test", "password": "valid-password-123"}).json()["token"]
    client.cookies.clear()
    assert client.get(f"/api/v1/maps/{snapshot['id']}/analytics").status_code == 401
    foreign = client.get(f"/api/v1/maps/{snapshot['id']}/analytics", headers={"Authorization": f"Bearer {token}"})
    assert foreign.status_code == 404


def test_ingestion_is_rate_limited(client):
    snapshot, _, _ = _published(client)
    url = f"/api/v1/public/maps/{snapshot['slug']}/analytics"
    batch = {"visitor_id": str(uuid4()), "source": "web", "events": [_event("map_view")]}
    statuses = [client.post(url, json=batch).status_code for _ in range(61)]
    assert statuses[:60] == [200] * 60 and statuses[60] == 429
    clear_analytics_rate_limit()
