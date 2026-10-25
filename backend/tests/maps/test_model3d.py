"""Dollhouse GLB: structurally valid glTF built from the real saved document and plan media."""
from __future__ import annotations

import copy
import json
import struct
from io import BytesIO
from uuid import uuid4

from PIL import Image

from backend.app.auth import create_organizer
from backend.app.config import settings
from backend.app.modules.model3d.scene_generator import triangulate
from backend.app.routers.model3d import clear_model_cache
from backend.tests.maps.test_floors import ORIGIN, _setup, _two_floor_document
from backend.tests.maps.test_maps import client  # noqa: F401  (fixture)
from scripts.seed_demo import make_png_bytes


def parse_glb(data: bytes):
    """Strict structural checks a viewer relies on; returns (gltf json, binary chunk)."""
    magic, version, length = struct.unpack_from("<4sII", data)
    assert (magic, version, length) == (b"glTF", 2, len(data))
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    assert json_type == b"JSON" and json_length % 4 == 0
    gltf = json.loads(data[20:20 + json_length])
    bin_length, bin_type = struct.unpack_from("<I4s", data, 20 + json_length)
    assert bin_type == b"BIN\x00" and bin_length % 4 == 0
    binary = data[28 + json_length:28 + json_length + bin_length]
    assert gltf["buffers"] == [{"byteLength": bin_length}]
    assert all(value != [] for value in gltf.values()), "glTF forbids empty top-level arrays"
    for view in gltf["bufferViews"]:
        assert view["byteOffset"] % 4 == 0 and view["byteOffset"] + view["byteLength"] <= bin_length
    for accessor in gltf["accessors"]:
        view = gltf["bufferViews"][accessor["bufferView"]]
        width = {"VEC2": 2, "VEC3": 3}[accessor["type"]]
        assert accessor["count"] * width * 4 == view["byteLength"]
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            assert primitive["material"] < len(gltf["materials"])
            position = gltf["accessors"][primitive["attributes"]["POSITION"]]
            assert position["count"] % 3 == 0 and "min" in position and "max" in position
            values = _floats(gltf, binary, primitive["attributes"]["POSITION"])
            for axis in range(3):
                assert min(values[axis::3]) == position["min"][axis] and max(values[axis::3]) == position["max"][axis]
    for node in gltf["nodes"]:
        assert node.get("mesh", 0) < len(gltf["meshes"])
        assert all(child < len(gltf["nodes"]) for child in node.get("children", []))
    for image in gltf.get("images", []):
        view = gltf["bufferViews"][image["bufferView"]]
        assert image["mimeType"] == "image/jpeg"
        with Image.open(BytesIO(binary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]])) as decoded:
            assert decoded.format == "JPEG"
    return gltf, binary


def _floats(gltf, binary, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    count = view["byteLength"] // 4
    return struct.unpack_from(f"<{count}f", binary, view["byteOffset"])


def _upload_plan(client, map_id, headers):
    response = client.post(f"/api/v1/maps/{map_id}/assets", headers=headers,
                           files={"kind": (None, "plan"), "file": ("plan.png", make_png_bytes(400, 300), "image/png")})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _saved_dollhouse(client):
    clear_model_cache()
    snapshot, headers, etag = _setup(client)
    doc, ids = _two_floor_document(snapshot)
    plan = _upload_plan(client, snapshot["id"], headers)
    doc["floors"][0]["background_asset_id"] = plan
    ground, first = ids["ground"], ids["first"]
    doc["shapes"] = [
        {"id": str(uuid4()), "kind": "room", "label": "L-shaped hall", "floor_id": ground, "height_m": None,
         "points": [{"x": 10, "y": 10}, {"x": 60, "y": 10}, {"x": 60, "y": 30}, {"x": 30, "y": 30},
                    {"x": 30, "y": 60}, {"x": 10, "y": 60}]},
        {"id": str(uuid4()), "kind": "wall", "label": "", "floor_id": first, "height_m": 2.5,
         "points": [{"x": 5, "y": 5}, {"x": 95, "y": 5}, {"x": 95, "y": 95}]},
    ]
    saved = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
    assert saved.status_code == 200, saved.json()
    return snapshot, headers, ids, plan


def test_dollhouse_is_valid_and_reflects_document(client):
    snapshot, _, ids, _ = _saved_dollhouse(client)
    response = client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "model/gltf-binary"
    gltf, binary = parse_glb(response.content)

    root = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]
    levels = [gltf["nodes"][i] for i in root["children"]]
    assert [(n["extras"]["floor_id"], n["translation"][1]) for n in levels] == [(ids["ground"], 0), (ids["first"], 3)]
    pois = {n["extras"]["poi_id"]: n for n in gltf["nodes"] if "poi_id" in n.get("extras", {})}
    assert set(pois) == {ids["poi_entry"], ids["poi_office"]}
    assert pois[ids["poi_office"]]["translation"] == [50.0, 0, 60.0]  # scale 1 m/unit, plan y -> glTF z
    assert len(gltf["images"]) == 1  # only the ground floor has a plan

    # The L-shaped room floor must cover exactly its area (fan triangulation would not).
    room_floor = next(p for m in gltf["meshes"] for p in m["primitives"]
                      if gltf["materials"][p["material"]]["name"] == "room")
    xyz = _floors = _floats(gltf, binary, room_floor["attributes"]["POSITION"])
    area = sum(abs((xyz[i + 3] - xyz[i]) * (xyz[i + 8] - xyz[i + 2]) - (xyz[i + 6] - xyz[i]) * (xyz[i + 5] - xyz[i + 2])) / 2
               for i in range(0, len(xyz), 9))
    assert abs(area - (50 * 20 + 20 * 30)) < 1e-6
    wall = next(p for m in gltf["meshes"] for p in m["primitives"] if gltf["materials"][p["material"]]["name"] == "wall")
    assert gltf["accessors"][wall["attributes"]["POSITION"]]["max"][1] == 2.5  # shape height_m wins


def test_public_model_cache_and_access(client):
    snapshot, headers, _, plan = _saved_dollhouse(client)
    owner = client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb")
    client.cookies.clear()
    assert client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb").status_code == 401
    public = client.get(f"/api/v1/public/maps/{snapshot['slug']}/model3d.glb")
    assert public.status_code == 200 and public.content == owner.content
    assert client.get(f"/api/v1/public/maps/{snapshot['slug']}/model3d.glb",
                      headers={"If-None-Match": public.headers["ETag"]}).status_code == 304
    assert client.get("/api/v1/public/maps/" + "a" * 26 + "/model3d.glb").status_code == 404

    create_organizer("other@example.test", "valid-password-123")
    token = client.post("/api/v1/tokens", json={"email": "other@example.test", "password": "valid-password-123"}).json()["token"]
    foreign = client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb", headers={"Authorization": f"Bearer {token}"})
    assert foreign.status_code == 404


def test_missing_scale_and_media_fail_loudly(client):
    snapshot, headers, _, plan = _saved_dollhouse(client)
    clear_model_cache()
    (settings.media_path / plan / "mobile.webp").unlink()
    missing = client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb")
    assert missing.status_code == 503 and missing.json()["error"]["code"] == "SERVICE_UNAVAILABLE"

    unscaled = client.post("/api/v1/maps", headers=headers, json={
        "title": "No scale", "description": "", "width_units": 100, "height_units": 100,
        "scale_m_per_unit": None, "max_walk_gap_units": 50}).json()["snapshot"]
    response = client.get(f"/api/v1/maps/{unscaled['id']}/model3d.glb")
    assert response.status_code == 422 and response.json()["error"]["issues"][0]["path"] == "scale_m_per_unit"


def test_legacy_map_without_floors(client):
    clear_model_cache()
    snapshot, headers, etag = _setup(client)
    plan = _upload_plan(client, snapshot["id"], headers)
    doc = copy.deepcopy(snapshot["document"])
    doc["background_asset_id"] = plan
    doc["shapes"] = [{"id": str(uuid4()), "kind": "wall", "label": "", "points": [{"x": 0, "y": 0}, {"x": 100, "y": 0}]}]
    assert client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag}).status_code == 200
    gltf, _ = parse_glb(client.get(f"/api/v1/maps/{snapshot['id']}/model3d.glb").content)
    root = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]
    assert len(root["children"]) == 1 and len(gltf["images"]) == 1


def test_triangulate_concave_and_collinear():
    l_shape = [(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]
    assert len(triangulate(l_shape)) == 4
    with_collinear = [(0, 0), (1, 0), (2, 0), (2, 2), (0, 2)]
    assert len(triangulate(with_collinear)) == 2
