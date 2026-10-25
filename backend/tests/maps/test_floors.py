"""Buildings/floors: additive v2 document, inter-floor routing and v1-client safety."""
from __future__ import annotations

import copy
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.auth import create_organizer
from backend.tests.maps.test_maps import client  # noqa: F401  (fixture)

ORIGIN = {"Origin": "http://testserver"}


def _setup(client: TestClient):
    create_organizer("org@example.test", "valid-password-123")
    login = client.post("/api/v1/auth/login", json={"email": "org@example.test", "password": "valid-password-123"}, headers=ORIGIN)
    headers = {**ORIGIN, "X-CSRF-Token": login.json()["csrf_token"]}
    created = client.post("/api/v1/maps", headers=headers, json={
        "title": "Campus", "description": "", "width_units": 100, "height_units": 100,
        "scale_m_per_unit": 1.0, "max_walk_gap_units": 50})
    return created.json()["snapshot"], headers, created.headers["ETag"]


def _two_floor_document(snapshot):
    ids = {name: str(uuid4()) for name in ("building", "ground", "first", "entry", "stairs_g", "stairs_f", "office",
                                            "e_walk_g", "e_stairs", "e_walk_f", "poi_entry", "poi_office")}
    doc = copy.deepcopy(snapshot["document"])
    doc.update(
        is_published=True,
        buildings=[{"id": ids["building"], "title": "Main", "kind": "building", "outline_json": None, "sort_order": 0}],
        floors=[
            {"id": ids["ground"], "building_id": ids["building"], "level": 0, "title": "Ground", "elevation_m": 0, "height_m": 3, "background_asset_id": None},
            {"id": ids["first"], "building_id": ids["building"], "level": 1, "title": "First", "elevation_m": 3, "height_m": 3, "background_asset_id": None},
        ],
        nodes=[
            {"id": ids["entry"], "x": 10, "y": 10, "floor_id": ids["ground"]},
            {"id": ids["stairs_g"], "x": 50, "y": 10, "floor_id": ids["ground"]},
            {"id": ids["stairs_f"], "x": 50, "y": 10, "floor_id": ids["first"]},
            {"id": ids["office"], "x": 50, "y": 60, "floor_id": ids["first"]},
        ],
        pois=[
            {"id": ids["poi_entry"], "title": "Entrance", "category": "entrance", "category_label": None, "description": "",
             "x": 10, "y": 10, "nav_node_id": ids["entry"], "floor_id": ids["ground"]},
            {"id": ids["poi_office"], "title": "Office", "category": "hall", "category_label": None, "description": "",
             "x": 50, "y": 60, "nav_node_id": ids["office"], "floor_id": ids["first"]},
        ],
    )
    def edge(edge_id, a, b, **extra):
        return {"id": edge_id, "a": min(a, b), "b": max(a, b), **extra}
    doc["edges"] = [
        edge(ids["e_walk_g"], ids["entry"], ids["stairs_g"]),
        edge(ids["e_stairs"], ids["stairs_g"], ids["stairs_f"], kind="stairs", cost_units=5.0),
        edge(ids["e_walk_f"], ids["stairs_f"], ids["office"]),
    ]
    return doc, ids


def test_floors_round_trip_and_inter_floor_route(client):
    snapshot, headers, etag = _setup(client)
    doc, ids = _two_floor_document(snapshot)
    saved = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
    assert saved.status_code == 200, saved.json()

    loaded = client.get(f"/api/v1/maps/{snapshot['id']}").json()["snapshot"]["document"]
    assert [f["level"] for f in loaded["floors"]] == [0, 1]
    assert loaded["buildings"][0]["id"] == ids["building"]
    stairs = next(e for e in loaded["edges"] if e["id"] == ids["e_stairs"])
    assert (stairs["kind"], stairs["cost_units"]) == ("stairs", 5.0)
    assert next(n for n in loaded["nodes"] if n["id"] == ids["office"])["floor_id"] == ids["first"]
    assert next(p for p in loaded["pois"] if p["id"] == ids["poi_office"])["floor_id"] == ids["first"]
    assert client.get(f"/api/v1/public/maps/{snapshot['slug']}").json()["document"]["floors"][1]["id"] == ids["first"]

    route = client.post(f"/api/v1/public/maps/{snapshot['slug']}/route",
                        json={"revision": 2, "from_node_id": ids["entry"], "to_node_id": ids["office"]})
    assert route.status_code == 200, route.json()
    body = route.json()
    assert body["node_ids"] == [ids["entry"], ids["stairs_g"], ids["stairs_f"], ids["office"]]
    assert body["distance_units"] == 40 + 5 + 50  # stairs cost replaces zero plan distance


def test_v1_client_cannot_wipe_floors(client):
    snapshot, headers, etag = _setup(client)
    doc, _ = _two_floor_document(snapshot)
    saved = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
    assert saved.status_code == 200

    legacy = {key: value for key, value in doc.items() if key not in ("buildings", "floors")}
    for collection in ("nodes", "pois"):
        legacy[collection] = [{k: v for k, v in item.items() if k != "floor_id"} for item in legacy[collection]]
    legacy["edges"] = [{k: v for k, v in item.items() if k in ("id", "a", "b")} for item in legacy["edges"]]
    rejected = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=legacy, headers={**headers, "If-Match": saved.headers["ETag"]})
    assert rejected.status_code == 409
    after = client.get(f"/api/v1/maps/{snapshot['id']}").json()["snapshot"]
    assert after["revision"] == 2 and len(after["document"]["floors"]) == 2


def test_floor_rules_reject_without_changes(client):
    snapshot, headers, etag = _setup(client)
    base, ids = _two_floor_document(snapshot)

    def broken(mutate):
        doc = copy.deepcopy(base)
        mutate(doc)
        return doc

    def stairs_edge(doc):
        return next(e for e in doc["edges"] if e["id"] == ids["e_stairs"])

    cases = {
        "nodes.0.floor_id": broken(lambda d: d["nodes"][0].update(floor_id=None)),
        "edges.1.kind": broken(lambda d: stairs_edge(d).update(kind="walk")),
        "edges.1.cost_units": broken(lambda d: stairs_edge(d).update(cost_units=None)),
        "pois.1.floor_id": broken(lambda d: d["pois"][1].update(floor_id=ids["ground"])),
        "floors.1.level": broken(lambda d: d["floors"][1].update(level=0)),
    }
    for path, doc in cases.items():
        response = client.put(f"/api/v1/maps/{snapshot['id']}/document", json=doc, headers={**headers, "If-Match": etag})
        assert response.status_code == 422, (path, response.json())
        assert path in [issue["path"] for issue in response.json()["error"]["issues"]], (path, response.json())
    unchanged = client.get(f"/api/v1/maps/{snapshot['id']}").json()["snapshot"]
    assert unchanged["revision"] == 1 and unchanged["document"]["floors"] == []
