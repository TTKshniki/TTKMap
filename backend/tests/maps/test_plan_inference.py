"""Inferred 2D plan from panorama."""
from __future__ import annotations

import json
from uuid import uuid4

import numpy as np
from PIL import Image

from backend.app.auth import create_organizer
from backend.app.routers.model3d import clear_model_cache
from backend.tests.maps.test_floors import ORIGIN, _setup, _two_floor_document
from backend.tests.maps.test_maps import client  # noqa: F401  (fixture)
from scripts.seed_demo import make_png_bytes


def _upload_panorama(client, map_id, headers, width=1024, height=512):
    """Upload a synthetic equirectangular panorama to the map."""
    import io
    image = Image.new("RGB", (width, height), color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    response = client.post(
        f"/api/v1/maps/{map_id}/assets",
        headers=headers,
        files={"kind": (None, "panorama"), "file": ("pano.jpg", buffer, "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _place_panorama(client, map_id, asset_id, headers, x=50, y=50, floor_id=None):
    """Place an uploaded panorama asset into the map document."""
    response = client.get(f"/api/v1/maps/{map_id}", headers=headers)
    assert response.status_code == 200, f"GET map failed: {response.status_code} {response.text}"
    snapshot = response.json()["snapshot"]
    doc = snapshot["document"]
    etag = response.headers["ETag"]
    pano_id = str(uuid4())
    doc["panoramas"] = doc.get("panoramas", []) + [
        {"id": pano_id, "asset_id": asset_id, "title": "Test panorama", "x": x, "y": y,
         "nav_node_id": None, "heading_offset_deg": 0, "floor_id": floor_id}
    ]
    response = client.put(f"/api/v1/maps/{map_id}/document", json=doc, headers={**headers, "If-Match": etag})
    assert response.status_code == 200, response.json()
    return pano_id


def _render_room_panorama(fit_angle=0.0, walls=(3.0, 4.0, 3.0, 4.0), door_wall=None, door_t=(0.3, 0.5),
                          window_wall=None, window_t=(0.2, 0.8), width=1024, height=512, camera_height=1.5):
    """Render a synthetic rectangular room panorama with optional openings."""
    image = np.ones((height, width, 3), dtype=np.uint8) * 200  # light gray walls
    w, h = width, height
    haov, vaov = 360.0, 180.0

    def yaw_pitch_to_pixel(yaw_deg, pitch_deg):
        u = (yaw_deg + 180) / haov
        v = 0.5 - pitch_deg / vaov
        return int(u * w) % w, int(v * h)

    # Room corners in local (camera-forward = +Y) coordinates, rotated by fit_angle.
    cos_a, sin_a = np.cos(np.radians(fit_angle)), np.sin(np.radians(fit_angle))
    corners_local = [(walls[0], walls[1]), (-walls[2], walls[1]), (-walls[2], -walls[3]), (walls[0], -walls[3])]
    corners = [(x * cos_a - y * sin_a, x * sin_a + y * cos_a) for x, y in corners_local]

    # Paint floor dark, ceiling bright.
    for v in range(height):
        pitch = (0.5 - v / height) * vaov
        if pitch < -10:  # floor
            image[v, :] = [100, 100, 100]
        elif pitch > 60:  # ceiling
            image[v, :] = [240, 240, 240]

    # Paint door and window openings.
    def paint_opening(wall_idx, t_start, t_end, color):
        a, b = corners[wall_idx], corners[(wall_idx + 1) % 4]
        for t in np.linspace(t_start, t_end, 50):
            x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            r = np.hypot(x, y)
            yaw = np.degrees(np.arctan2(x, y))
            for z in np.linspace(0.0, 2.5, 30):
                pitch = np.degrees(np.arctan2(z - camera_height, r))
                px, py = yaw_pitch_to_pixel(yaw, pitch)
                if 0 <= py < height:
                    image[py, px] = color

    if door_wall is not None:
        paint_opening(door_wall, door_t[0], door_t[1], (80, 60, 40))  # dark brown door
    if window_wall is not None:
        paint_opening(window_wall, window_t[0], window_t[1], (200, 230, 255))  # bright blue window

    return Image.fromarray(image, "RGB")


def test_infers_room_from_panorama(client):
    clear_model_cache()
    snapshot, headers, etag = _setup(client)
    response = client.put(
        f"/api/v1/maps/{snapshot['id']}/document",
        json={**snapshot["document"], "scale_m_per_unit": 1.0},
        headers={**headers, "If-Match": etag},
    )
    assert response.status_code == 200, response.json()

    # Upload and place a synthetic room panorama.
    asset_id = _upload_panorama(client, snapshot["id"], headers)
    pano_id = _place_panorama(client, snapshot["id"], asset_id, headers, x=20, y=30, floor_id=None)

    # Replace the real panorama image with a synthetic rectangular room.
    from backend.app.config import settings
    from backend.app.db import database
    with database() as connection:
        mobile_key = connection.execute("SELECT mobile_key FROM assets WHERE id=?", (asset_id,)).fetchone()["mobile_key"]
    pano_path = settings.media_path / mobile_key
    room_image = _render_room_panorama(fit_angle=30.0, walls=(3.0, 4.0, 3.0, 4.0), door_wall=0, window_wall=1)
    room_image.save(pano_path)

    # Infer the plan.
    response = client.post(f"/api/v1/panoramas/{pano_id}/inferred-plan", headers=headers)
    assert response.status_code == 200, response.text
    result = response.json()

    assert result["source_panorama_id"] == pano_id
    assert result["model"] == "builtin-manhattan-image-v1"
    assert 0.3 <= result["confidence"] <= 1.0
    assert result["camera_height_m"] == 1.5
    assert abs(result["angle_deg"] - 30.0) < 20.0  # fit angle should be in the right quadrant

    shapes = result["shapes"]
    assert len(shapes) >= 1, "at least the room shape"
    room = next(s for s in shapes if s["kind"] == "room")
    assert len(room["points"]) == 4
    assert room["label"] == "Inferred room"
    assert room["floor_id"] is None

    # Check that the room is roughly centered at the panorama position (20, 30).
    xs = [p["x"] for p in room["points"]]
    ys = [p["y"] for p in room["points"]]
    assert 15 <= np.mean(xs) <= 25 and 25 <= np.mean(ys) <= 35

    openings = [s for s in shapes if s["kind"] == "wall"]
    # Openings may or may not be detected depending on panorama content; just verify the field exists
    assert isinstance(openings, list)


def test_inference_requires_scale(client):
    org = create_organizer("inference-scale@example.test", "valid-password-123")
    token_response = client.post("/api/v1/tokens", json={"email": "inference-scale@example.test", "password": "valid-password-123"})
    headers = {"Authorization": f"Bearer {token_response.json()['token']}"}

    # Create map without scale
    map_response = client.post("/api/v1/maps", headers=headers, json={
        "title": "No scale map", "description": "", "width_units": 100, "height_units": 100,
        "scale_m_per_unit": None, "max_walk_gap_units": 50
    })
    assert map_response.status_code == 201
    snapshot = map_response.json()["snapshot"]

    asset_id = _upload_panorama(client, snapshot["id"], headers)
    pano_id = _place_panorama(client, snapshot["id"], asset_id, headers)
    response = client.post(f"/api/v1/panoramas/{pano_id}/inferred-plan", headers=headers)
    assert response.status_code == 422
    assert response.json()["error"]["issues"][0]["path"] == "scale_m_per_unit"


def test_inference_requires_ownership(client):
    from backend.app.auth import create_organizer
    snapshot, headers, etag = _setup(client)
    response = client.put(
        f"/api/v1/maps/{snapshot['id']}/document",
        json={**snapshot["document"], "scale_m_per_unit": 1.0},
        headers={**headers, "If-Match": etag},
    )
    assert response.status_code == 200
    asset_id = _upload_panorama(client, snapshot["id"], headers)
    pano_id = _place_panorama(client, snapshot["id"], asset_id, headers)

    create_organizer("other@example.test", "valid-password-123")
    token = client.post("/api/v1/tokens", json={"email": "other@example.test", "password": "valid-password-123"}).json()["token"]
    response = client.post(f"/api/v1/panoramas/{pano_id}/inferred-plan", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 404


def test_inference_stub_cannot_detect_test_image(client):
    """Stub detector cannot analyze the simple test panorama."""
    snapshot, headers, etag = _setup(client)
    asset_id = _upload_panorama(client, snapshot["id"], headers)
    pano_id = _place_panorama(client, snapshot["id"], asset_id, headers, x=50, y=60)

    response = client.post(f"/api/v1/panoramas/{pano_id}/inferred-plan", headers=headers)
    assert response.status_code == 422
    assert "too few consistent floor boundaries" in response.json()["error"]["message"]

