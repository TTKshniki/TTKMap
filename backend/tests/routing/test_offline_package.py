"""Offline package lists exactly the published media a client must mirror."""
from __future__ import annotations

import copy
from uuid import uuid4

from backend.app.config import settings
from backend.tests.integration.test_runtime_contract import validate
from backend.tests.maps.test_floors import ORIGIN, _setup
from backend.tests.maps.test_maps import client  # noqa: F401  (fixture)
from scripts.seed_demo import make_png_bytes


def _upload_plan(client, map_id, headers):
    response = client.post(f"/api/v1/maps/{map_id}/assets", headers=headers,
                           files={"kind": (None, "plan"), "file": ("plan.png", make_png_bytes(40, 30), "image/png")})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_offline_package_mirrors_published_media(client):
    snapshot, headers, etag = _setup(client)
    map_id, slug = snapshot["id"], snapshot["slug"]
    site_plan, floor_plan, unattached = (_upload_plan(client, map_id, headers) for _ in range(3))
    assert client.get(f"/api/v1/public/maps/{slug}/offline-package").status_code == 404

    building, floor, node, poi = (str(uuid4()) for _ in range(4))
    doc = copy.deepcopy(snapshot["document"])
    doc.update(is_published=True, background_asset_id=site_plan,
               buildings=[{"id": building, "title": "Main", "kind": "building", "outline_json": None, "sort_order": 0}],
               floors=[{"id": floor, "building_id": building, "level": 0, "title": "Ground",
                        "elevation_m": 0, "height_m": 3, "background_asset_id": floor_plan}],
               nodes=[{"id": node, "x": 10, "y": 10, "floor_id": floor}],
               pois=[{"id": poi, "title": "Entrance", "category": "entrance", "category_label": None,
                      "description": "", "x": 10, "y": 10, "nav_node_id": node, "floor_id": floor}])
    saved = client.put(f"/api/v1/maps/{map_id}/document", json=doc, headers={**headers, "If-Match": etag})
    assert saved.status_code == 200, saved.json()

    client.cookies.clear()  # visitors are anonymous
    response = client.get(f"/api/v1/public/maps/{slug}/offline-package")
    assert response.status_code == 200, response.json()
    package = response.json()
    validate("OfflinePackage", package)
    assert package["revision"] == 2 and package["snapshot"]["document"]["floors"][0]["background_asset_id"] == floor_plan
    assert {(m["asset_id"], m["variant"]) for m in package["media"]} == {
        (asset, variant) for asset in (site_plan, floor_plan) for variant in ("preview", "mobile", "full")}
    assert unattached not in {m["asset_id"] for m in package["media"]}
    for entry in package["media"]:
        media = client.get(entry["url"])
        assert media.status_code == 200 and len(media.content) == entry["size_bytes"], entry

    assert client.get(f"/api/v1/public/maps/{slug}/offline-package",
                      headers={"If-None-Match": response.headers["ETag"]}).status_code == 304

    # A missing file must fail loudly instead of producing an incomplete package.
    (settings.media_path / floor_plan / "mobile.webp").unlink()
    broken = client.get(f"/api/v1/public/maps/{slug}/offline-package")
    assert broken.status_code == 503 and broken.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_offline_package_etag_follows_revision(client):
    snapshot, headers, etag = _setup(client)
    node, poi = str(uuid4()), str(uuid4())
    doc = copy.deepcopy(snapshot["document"])
    doc.update(is_published=True, nodes=[{"id": node, "x": 1, "y": 1}],
               pois=[{"id": poi, "title": "A", "category": "wifi", "category_label": None, "description": "",
                      "x": 1, "y": 1, "nav_node_id": node}])
    first = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
    old_etag = client.get(f"/api/v1/public/maps/{snapshot['slug']}/offline-package").headers["ETag"]
    doc["title"] = "Renamed"
    client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": first.headers["ETag"]})
    refreshed = client.get(f"/api/v1/public/maps/{snapshot['slug']}/offline-package", headers={"If-None-Match": old_etag})
    assert refreshed.status_code == 200 and refreshed.json()["revision"] == 3
    assert refreshed.json()["media"] == []
