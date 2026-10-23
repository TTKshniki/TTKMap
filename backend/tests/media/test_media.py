from __future__ import annotations

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.auth import clear_login_failures, create_organizer
from backend.app.config import settings
from backend.app.db import initialize_database
from backend.app.main import create_app
from scripts.seed_demo import make_png_bytes


@pytest.fixture()
def client(tmp_path: Path):
    db_file = tmp_path / "media_test.sqlite"
    media_dir = tmp_path / "media"
    orig_db, orig_media, orig_origin = settings.database_path, settings.media_path, settings.app_origin
    object.__setattr__(settings, "database_path", db_file)
    object.__setattr__(settings, "media_path", media_dir)
    object.__setattr__(settings, "app_origin", "http://testserver")
    try:
        clear_login_failures()
        initialize_database(db_file)
        media_dir.mkdir(parents=True, exist_ok=True)
        with TestClient(create_app()) as c:
            yield c
    finally:
        object.__setattr__(settings, "database_path", orig_db)
        object.__setattr__(settings, "media_path", orig_media)
        object.__setattr__(settings, "app_origin", orig_origin)


def test_media_upload_validation_and_access_control(client: TestClient):
    create_organizer("org@example.test", "valid-password-123")
    origin = {"Origin": "http://testserver"}
    login = client.post("/api/v1/auth/login", json={"email": "org@example.test", "password": "valid-password-123"}, headers=origin)
    headers = {**origin, "X-CSRF-Token": login.json()["csrf_token"]}
    created = client.post("/api/v1/maps", json={"title": "M", "description": "", "width_units": 500, "height_units": 500, "scale_m_per_unit": None, "max_walk_gap_units": 100}, headers=headers)
    map_id = created.json()["snapshot"]["id"]

    # Reject spoofed SVG as 415
    svg_res = client.post(f"/api/v1/maps/{map_id}/assets", files={"kind": (None, "plan"), "file": ("plan.png", b"<svg></svg>", "image/png")}, headers=headers)
    assert svg_res.status_code == 415

    # Upload valid plan PNG
    plan_res = client.post(f"/api/v1/maps/{map_id}/assets", files={"kind": (None, "plan"), "file": ("plan.png", make_png_bytes(400, 300), "image/png")}, headers=headers)
    assert plan_res.status_code == 201
    asset_id = plan_res.json()["id"]

    # Owner can fetch media, guest cannot fetch unattached media
    assert client.get(f"/api/v1/media/{asset_id}/preview").status_code == 200
    client.post("/api/v1/auth/logout", headers=headers)
    assert client.get(f"/api/v1/media/{asset_id}/preview").status_code == 404
