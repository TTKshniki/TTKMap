"""Bearer transport for native clients: no Origin/CSRF, but strictly separate from cookies."""
from __future__ import annotations

from backend.app.auth import create_organizer
from backend.tests.auth.test_auth import client  # noqa: F401  (fixture)

PASSWORD = "valid-password-123"
MAP = {"title": "M", "description": "", "width_units": 100, "height_units": 100,
       "scale_m_per_unit": None, "max_walk_gap_units": 10}


def _token(client, email="org@example.test"):
    response = client.post("/api/v1/tokens", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer" and body["user"]["email"] == email
    return body["token"]


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_bearer_mutates_without_origin_or_csrf(client):
    create_organizer("org@example.test", PASSWORD)
    headers = _bearer(_token(client))
    created = client.post("/api/v1/maps", json=MAP, headers=headers)
    assert created.status_code == 201
    assert client.get("/api/v1/auth/session", headers=headers).status_code == 200
    assert client.get("/api/v1/maps", headers=headers).json()[0]["id"] == created.json()["snapshot"]["id"]


def test_transports_do_not_cross(client):
    create_organizer("org@example.test", PASSWORD)
    origin = {"Origin": "http://testserver"}
    login = client.post("/api/v1/auth/login", json={"email": "org@example.test", "password": PASSWORD}, headers=origin)
    cookie_token = client.cookies.get("ttk_session")
    csrf = {"X-CSRF-Token": login.json()["csrf_token"]}
    bearer_token = _token(client)

    # A cookie session presented as Bearer would skip CSRF; it must be rejected.
    client.cookies.clear()
    assert client.post("/api/v1/maps", json=MAP, headers=_bearer(cookie_token)).status_code == 401
    # A Bearer token placed in the cookie must not authenticate either.
    client.cookies.set("ttk_session", bearer_token)
    assert client.get("/api/v1/maps").status_code == 401

    # Any Authorization header disables the cookie: no fallback, no Origin bypass.
    client.cookies.set("ttk_session", cookie_token)
    for value in ("Bearer ", "Bearer", "Basic abc", "Bearer not-a-token"):
        response = client.post("/api/v1/maps", json=MAP, headers={"Authorization": value, **csrf})
        assert response.status_code == 401, value
    # The cookie transport keeps full Origin + CSRF enforcement.
    assert client.post("/api/v1/maps", json=MAP, headers=csrf).status_code == 403
    assert client.post("/api/v1/maps", json=MAP, headers={**origin, **csrf}).status_code == 201


def test_logout_and_revocation_really_revoke(client):
    create_organizer("org@example.test", PASSWORD)
    first, second, third = _token(client), _token(client), _token(client)

    assert client.post("/api/v1/auth/logout", headers=_bearer(first)).status_code == 204
    assert client.get("/api/v1/maps", headers=_bearer(first)).status_code == 401
    assert client.delete("/api/v1/tokens", headers=_bearer(second)).status_code == 204
    assert client.get("/api/v1/maps", headers=_bearer(second)).status_code == 401
    assert client.get("/api/v1/maps", headers=_bearer(third)).status_code == 200

    # "Sign out all devices" from the browser keeps the browser session itself.
    origin = {"Origin": "http://testserver"}
    login = client.post("/api/v1/auth/login", json={"email": "org@example.test", "password": PASSWORD}, headers=origin)
    revoke = client.delete("/api/v1/tokens/all", headers={**origin, "X-CSRF-Token": login.json()["csrf_token"]})
    assert revoke.status_code == 204
    assert client.get("/api/v1/maps", headers=_bearer(third)).status_code == 401
    assert client.get("/api/v1/maps").status_code == 200
    # Revoking "current token" is meaningless for a cookie session.
    assert client.delete("/api/v1/tokens").status_code == 400


def test_bearer_ownership_and_rate_limit(client):
    create_organizer("org@example.test", PASSWORD)
    create_organizer("other@example.test", PASSWORD)
    owner = _bearer(_token(client))
    stranger = _bearer(_token(client, "other@example.test"))
    map_id = client.post("/api/v1/maps", json=MAP, headers=owner).json()["snapshot"]["id"]
    assert client.get(f"/api/v1/maps/{map_id}", headers=stranger).status_code == 404

    for _ in range(5):
        bad = client.post("/api/v1/tokens", json={"email": "org@example.test", "password": "wrong-password-1"})
        assert bad.status_code == 401
        assert bad.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert client.post("/api/v1/tokens", json={"email": "org@example.test", "password": PASSWORD}).status_code == 429
