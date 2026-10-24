from __future__ import annotations

import json
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Response

from backend.app.auth import require_csrf, require_origin, require_session
from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.errors import ApiError
from backend.app.schemas import CreateMapRequest, MapDocument


router = APIRouter(prefix="/api/v1/maps", tags=["maps"])


def _slug() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz234567"
    value = secrets.token_bytes(16)
    number = int.from_bytes(value, "big")
    chars = []
    for _ in range(26):
        chars.append(alphabet[number & 31])
        number >>= 5
    return "".join(chars)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _snapshot(connection, map_row, *, public: bool = False) -> dict:
    map_id = map_row["id"]
    shapes = []
    for row in connection.execute("SELECT id,kind,label,points_json FROM shapes WHERE map_id=?", (map_id,)):
        shapes.append({"id": row["id"], "kind": row["kind"], "label": row["label"], "points": json.loads(row["points_json"])})
    nodes = [dict(row) for row in connection.execute("SELECT id,x,y FROM nav_nodes WHERE map_id=?", (map_id,))]
    edges = [dict(row) for row in connection.execute("SELECT id,a,b FROM nav_edges WHERE map_id=?", (map_id,))]
    pois = [dict(row) for row in connection.execute("SELECT id,title,category,category_label,description,x,y,nav_node_id FROM pois WHERE map_id=?", (map_id,))]
    panoramas = [dict(row) for row in connection.execute("SELECT id,asset_id,title,x,y,nav_node_id,heading_offset_deg FROM panoramas WHERE map_id=?", (map_id,))]
    hotspots = [dict(row) for row in connection.execute("SELECT id,panorama_id,kind,yaw_deg,pitch_deg,poi_id,target_panorama_id FROM hotspots WHERE map_id=?", (map_id,))]
    referenced_assets = {item["asset_id"] for item in panoramas}
    background = connection.execute("SELECT asset_id FROM map_backgrounds WHERE map_id=?", (map_id,)).fetchone()
    if background is not None:
        referenced_assets.add(background["asset_id"])
    assets = []
    if referenced_assets:
        placeholders = ",".join("?" for _ in referenced_assets)
        query = "SELECT id,kind,source,width_px,height_px,projection,haov_deg,vaov_deg,v_offset_deg,created_at FROM assets WHERE map_id=? AND id IN (" + placeholders + ")"
        for row in connection.execute(query, (map_id, *sorted(referenced_assets))):
            assets.append({**dict(row), "preview_url": f"/api/v1/media/{row['id']}/preview", "mobile_url": f"/api/v1/media/{row['id']}/mobile", "full_url": f"/api/v1/media/{row['id']}/full"})
    document = {
        "title": map_row["title"], "description": map_row["description"], "is_published": bool(map_row["is_published"]),
        "scale_m_per_unit": map_row["scale_m_per_unit"], "max_walk_gap_units": map_row["max_walk_gap_units"],
        "background_asset_id": background["asset_id"] if background is not None else None, "shapes": shapes, "nodes": nodes, "edges": edges,
        "pois": pois, "panoramas": panoramas, "hotspots": hotspots,
    }
    snapshot = {"id": map_id, "slug": map_row["slug"], "revision": map_row["revision"], "width_units": map_row["width_units"], "height_units": map_row["height_units"], "updated_at": map_row["updated_at"], "document": document, "assets": assets}
    if public:
        return snapshot
    return {"snapshot": snapshot, "owner_id": map_row["owner_id"], "created_at": map_row["created_at"]}


def _owned_map(connection, map_id: str, owner_id: str):
    row = connection.execute("SELECT * FROM maps WHERE id=? AND owner_id=?", (map_id, owner_id)).fetchone()
    if row is None:
        raise ApiError(404, "NOT_FOUND", "Map not found")
    return row


def _orientation(a, b, c) -> float:
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)


def _segments_intersect(a, b, c, d) -> bool:
    eps = 1e-9
    ab_c, ab_d = _orientation(a, b, c), _orientation(a, b, d)
    cd_a, cd_b = _orientation(c, d, a), _orientation(c, d, b)
    if ab_c * ab_d < -eps and cd_a * cd_b < -eps:
        return True

    def on_segment(p, q, r):
        return (min(p.x, r.x) - eps <= q.x <= max(p.x, r.x) + eps
                and min(p.y, r.y) - eps <= q.y <= max(p.y, r.y) + eps)

    return ((abs(ab_c) <= eps and on_segment(a, c, b))
            or (abs(ab_d) <= eps and on_segment(a, d, b))
            or (abs(cd_a) <= eps and on_segment(c, a, d))
            or (abs(cd_b) <= eps and on_segment(c, b, d)))


def _validate_document(connection, map_row, document: MapDocument) -> None:
    width, height = map_row["width_units"], map_row["height_units"]
    for shape in document.shapes:
        points = shape.points
        if any(point.x > width or point.y > height for point in points):
            raise ApiError(422, "VALIDATION_ERROR", "Shape is outside map bounds")
        if any(points[index].x == points[index + 1].x and points[index].y == points[index + 1].y
               for index in range(len(points) - 1)):
            raise ApiError(422, "VALIDATION_ERROR", "Shape contains a zero-length segment")
        if shape.kind != "wall":
            polygon = points[:-1] if len(points) > 3 and points[0] == points[-1] else points
            if len(polygon) < 3:
                raise ApiError(422, "VALIDATION_ERROR", "Room and corridor polygons need at least three points")
            area = sum(polygon[i].x * polygon[(i + 1) % len(polygon)].y - polygon[(i + 1) % len(polygon)].x * polygon[i].y for i in range(len(polygon)))
            if abs(area) < 1e-8:
                raise ApiError(422, "VALIDATION_ERROR", "Room and corridor polygon has zero area")
            for first in range(len(polygon)):
                a, b = polygon[first], polygon[(first + 1) % len(polygon)]
                for second in range(first + 1, len(polygon)):
                    if second == first or second == (first + 1) % len(polygon) or first == (second + 1) % len(polygon):
                        continue
                    c, d = polygon[second], polygon[(second + 1) % len(polygon)]
                    if _segments_intersect(a, b, c, d):
                        raise ApiError(422, "VALIDATION_ERROR", "Room and corridor polygon self-intersects")
    for node in document.nodes:
        if node.x > width or node.y > height:
            raise ApiError(422, "VALIDATION_ERROR", "Navigation node is outside map bounds")
    node_ids = {node.id for node in document.nodes}
    for poi in document.pois:
        if poi.x > width or poi.y > height:
            raise ApiError(422, "VALIDATION_ERROR", "POI is outside map bounds")
        if poi.nav_node_id is not None and poi.nav_node_id not in node_ids:
            raise ApiError(422, "VALIDATION_ERROR", "POI navigation node is not in this map")
    for panorama in document.panoramas:
        if panorama.x > width or panorama.y > height:
            raise ApiError(422, "VALIDATION_ERROR", "Panorama is outside map bounds")
        if panorama.nav_node_id is not None and panorama.nav_node_id not in node_ids:
            raise ApiError(422, "VALIDATION_ERROR", "Panorama navigation node is not in this map")
        asset = connection.execute("SELECT kind FROM assets WHERE id=? AND map_id=?", (panorama.asset_id, map_row["id"])).fetchone()
        if asset is None or asset["kind"] != "panorama":
            raise ApiError(422, "VALIDATION_ERROR", "Panorama must reference a panorama asset owned by this map")
    panorama_node_ids = [panorama.nav_node_id for panorama in document.panoramas if panorama.nav_node_id is not None]
    if len(panorama_node_ids) != len(set(panorama_node_ids)):
        raise ApiError(422, "VALIDATION_ERROR", "Only one panorama may be attached to each navigation node")
    panorama_ids = {panorama.id for panorama in document.panoramas}
    poi_ids = {poi.id for poi in document.pois}
    for hotspot in document.hotspots:
        if hotspot.panorama_id not in panorama_ids:
            raise ApiError(422, "VALIDATION_ERROR", "Hotspot panorama must belong to this map")
        if hotspot.kind == "poi" and hotspot.poi_id not in poi_ids:
            raise ApiError(422, "VALIDATION_ERROR", "Hotspot POI must belong to this map")
        if hotspot.kind == "transition" and hotspot.target_panorama_id not in panorama_ids:
            raise ApiError(422, "VALIDATION_ERROR", "Hotspot target panorama must belong to this map")
    for edge in document.edges:
        if edge.a not in node_ids or edge.b not in node_ids:
            raise ApiError(422, "VALIDATION_ERROR", "Navigation edge endpoints must belong to this map")
    edge_pairs = [(edge.a, edge.b) for edge in document.edges]
    if len(edge_pairs) != len(set(edge_pairs)):
        raise ApiError(422, "VALIDATION_ERROR", "Navigation edges must be unique")
    if document.background_asset_id is not None:
        asset = connection.execute("SELECT kind FROM assets WHERE id=? AND map_id=?", (document.background_asset_id, map_row["id"])).fetchone()
        if asset is None or asset["kind"] != "plan":
            raise ApiError(422, "VALIDATION_ERROR", "Map background must reference a plan asset owned by this map")
    if document.is_published:
        if not document.pois:
            raise ApiError(422, "PUBLISH_BLOCKED", "A published map needs at least one POI")


@router.get("")
def list_maps(row=Depends(require_session)):
    with database() as connection:
        rows = connection.execute("SELECT id,slug,title,is_published,revision,updated_at FROM maps WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100", (row["user_id"],)).fetchall()
    return [dict(item) | {"is_published": bool(item["is_published"])} for item in rows]


@router.post("", status_code=201)
def create_map(payload: CreateMapRequest, response: Response, csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"), _: None = Depends(require_origin), row=Depends(require_session)):
    require_csrf(row, csrf_token)
    map_id = str(uuid4())
    now = _now()
    with database() as connection:
        with transaction(connection, immediate=True):
            connection.execute(
                "INSERT INTO maps(id,owner_id,slug,title,description,width_units,height_units,scale_m_per_unit,max_walk_gap_units,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (map_id, row["user_id"], _slug(), payload.title, payload.description, payload.width_units, payload.height_units, payload.scale_m_per_unit, payload.max_walk_gap_units, now, now),
            )
            map_row = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
            result = _snapshot(connection, map_row)
    response.headers["ETag"] = f'"map-{map_id}-v1"'
    return result


@router.get("/{map_id}")
def get_map(map_id: str, response: Response, row=Depends(require_session)):
    with database() as connection:
        with transaction(connection):
            map_row = _owned_map(connection, map_id, row["user_id"])
            response.headers["ETag"] = f'"map-{map_id}-v{map_row["revision"]}"'
            return _snapshot(connection, map_row)


@router.delete("/{map_id}", status_code=204)
def delete_map(map_id: str, response: Response, if_match: str = Header(..., alias="If-Match"),
               csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
               _: None = Depends(require_origin), row=Depends(require_session)):
    require_csrf(row, csrf_token)
    with database() as connection:
        with transaction(connection, immediate=True):
            map_row = _owned_map(connection, map_id, row["user_id"])
            expected = f'"map-{map_id}-v{map_row["revision"]}"'
            if if_match != expected:
                raise ApiError(412, "VERSION_CONFLICT", "Map changed since it was loaded", current_revision=map_row["revision"])
            asset_ids = [item["id"] for item in connection.execute("SELECT id FROM assets WHERE map_id=?", (map_id,))]
            frame_keys = [item["storage_key"] for item in connection.execute(
                "SELECT f.storage_key FROM capture_frames f JOIN captures c ON c.id=f.capture_id WHERE c.map_id=?",
                (map_id,),
            )]
            connection.execute("DELETE FROM maps WHERE id=?", (map_id,))
    media_root = settings.media_path.resolve()
    for asset_id in asset_ids:
        target = (media_root / asset_id).resolve()
        if media_root in target.parents:
            shutil.rmtree(target, ignore_errors=True)
    for key in frame_keys:
        target = (media_root / key).resolve()
        if media_root in target.parents:
            try:
                target.unlink(missing_ok=True)
            except OSError:
                pass
    response.status_code = 204
    return response


def _validate_document(connection, map_row, document: MapDocument) -> None:
    map_id = map_row["id"]
    width = float(map_row["width_units"])
    height = float(map_row["height_units"])
    issues: list[dict[str, str]] = []

    def check_bounds(x: float, y: float, path: str) -> None:
        if not (0.0 <= x <= width and 0.0 <= y <= height):
            issues.append({"path": path, "message": f"Coordinates ({x}, {y}) are outside map bounds ({width}x{height})"})

    if document.background_asset_id is not None:
        bg_row = connection.execute(
            "SELECT kind FROM assets WHERE map_id=? AND id=?",
            (map_id, document.background_asset_id),
        ).fetchone()
        if bg_row is None or bg_row["kind"] != "plan":
            issues.append({"path": "background_asset_id", "message": "Background asset must belong to this map and have kind 'plan'"})

    shape_ids: set[str] = set()
    for idx, shape in enumerate(document.shapes):
        path_prefix = f"shapes.{idx}"
        if shape.id in shape_ids:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate shape id"})
        shape_ids.add(shape.id)
        for p_idx, pt in enumerate(shape.points):
            check_bounds(pt.x, pt.y, f"{path_prefix}.points.{p_idx}")
        if shape.kind == "wall":
            for p_idx in range(len(shape.points) - 1):
                p1, p2 = shape.points[p_idx], shape.points[p_idx + 1]
                if abs(p1.x - p2.x) < 1e-6 and abs(p1.y - p2.y) < 1e-6:
                    issues.append({"path": f"{path_prefix}.points.{p_idx + 1}", "message": "Wall segment cannot have zero length"})
        else:
            if len(shape.points) < 3:
                issues.append({"path": f"{path_prefix}.points", "message": "Room or corridor polygon requires at least 3 points"})
            else:
                distinct = {(round(pt.x, 6), round(pt.y, 6)) for pt in shape.points}
                area2 = 0.0
                pts = shape.points
                for i in range(len(pts)):
                    j = (i + 1) % len(pts)
                    area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y
                if len(distinct) < 3 or abs(area2) < 1e-6:
                    issues.append({"path": f"{path_prefix}.points", "message": "Polygon must have non-zero area"})

    nodes_by_id: dict[str, object] = {}
    for idx, node in enumerate(document.nodes):
        path_prefix = f"nodes.{idx}"
        if node.id in nodes_by_id:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate node id"})
        nodes_by_id[node.id] = node
        check_bounds(node.x, node.y, path_prefix)

    edge_ids: set[str] = set()
    edge_pairs: set[tuple[str, str]] = set()
    for idx, edge in enumerate(document.edges):
        path_prefix = f"edges.{idx}"
        if edge.id in edge_ids:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate edge id"})
        edge_ids.add(edge.id)
        if edge.a not in nodes_by_id:
            issues.append({"path": f"{path_prefix}.a", "message": "Edge node 'a' does not exist"})
        if edge.b not in nodes_by_id:
            issues.append({"path": f"{path_prefix}.b", "message": "Edge node 'b' does not exist"})
        pair = (edge.a, edge.b)
        if pair in edge_pairs:
            issues.append({"path": path_prefix, "message": "Duplicate edge between the same nodes"})
        edge_pairs.add(pair)
        if edge.a in nodes_by_id and edge.b in nodes_by_id:
            na, nb = nodes_by_id[edge.a], nodes_by_id[edge.b]
            if abs(na.x - nb.x) < 1e-6 and abs(na.y - nb.y) < 1e-6:
                issues.append({"path": path_prefix, "message": "Edge endpoints cannot have identical coordinates"})

    poi_ids: set[str] = set()
    for idx, poi in enumerate(document.pois):
        path_prefix = f"pois.{idx}"
        if poi.id in poi_ids:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate POI id"})
        poi_ids.add(poi.id)
        check_bounds(poi.x, poi.y, path_prefix)
        if poi.nav_node_id is not None and poi.nav_node_id not in nodes_by_id:
            issues.append({"path": f"{path_prefix}.nav_node_id", "message": "POI nav_node_id does not exist"})

    panorama_ids: set[str] = set()
    panorama_nodes: set[str] = set()
    for idx, panorama in enumerate(document.panoramas):
        path_prefix = f"panoramas.{idx}"
        if panorama.id in panorama_ids:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate panorama id"})
        panorama_ids.add(panorama.id)
        check_bounds(panorama.x, panorama.y, path_prefix)
        asset_row = connection.execute(
            "SELECT kind FROM assets WHERE map_id=? AND id=?",
            (map_id, panorama.asset_id),
        ).fetchone()
        if asset_row is None or asset_row["kind"] != "panorama":
            issues.append({"path": f"{path_prefix}.asset_id", "message": "Panorama asset must belong to this map and have kind 'panorama'"})
        if panorama.nav_node_id is not None:
            if panorama.nav_node_id not in nodes_by_id:
                issues.append({"path": f"{path_prefix}.nav_node_id", "message": "Panorama nav_node_id does not exist"})
            elif panorama.nav_node_id in panorama_nodes:
                issues.append({"path": f"{path_prefix}.nav_node_id", "message": "At most one panorama can be attached to a navigation node"})
            else:
                panorama_nodes.add(panorama.nav_node_id)

    hotspot_ids: set[str] = set()
    hotspot_targets: set[tuple[str, str, str | None, str | None]] = set()
    for idx, hotspot in enumerate(document.hotspots):
        path_prefix = f"hotspots.{idx}"
        if hotspot.id in hotspot_ids:
            issues.append({"path": f"{path_prefix}.id", "message": "Duplicate hotspot id"})
        hotspot_ids.add(hotspot.id)
        if hotspot.panorama_id not in panorama_ids:
            issues.append({"path": f"{path_prefix}.panorama_id", "message": "Hotspot panorama_id does not exist"})
        if hotspot.kind == "poi":
            if hotspot.poi_id not in poi_ids:
                issues.append({"path": f"{path_prefix}.poi_id", "message": "Hotspot poi_id does not exist"})
        else:
            if hotspot.target_panorama_id not in panorama_ids:
                issues.append({"path": f"{path_prefix}.target_panorama_id", "message": "Hotspot target_panorama_id does not exist"})
            elif hotspot.target_panorama_id == hotspot.panorama_id:
                issues.append({"path": f"{path_prefix}.target_panorama_id", "message": "Transition hotspot cannot target its own panorama"})
        target_key = (hotspot.panorama_id, hotspot.kind, hotspot.poi_id, hotspot.target_panorama_id)
        if target_key in hotspot_targets:
            issues.append({"path": path_prefix, "message": "Duplicate hotspot target on the same panorama"})
        hotspot_targets.add(target_key)

    if issues:
        raise ApiError(422, "VALIDATION_ERROR", "Map document validation failed", issues=issues)

    if document.is_published and not document.pois:
        raise ApiError(422, "PUBLISH_BLOCKED", "A published map needs at least one POI")


@router.put("/{map_id}/document")
def replace_document(map_id: str, document: MapDocument, response: Response, if_match: str = Header(..., alias="If-Match"), csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"), _: None = Depends(require_origin), row=Depends(require_session)):
    require_csrf(row, csrf_token)
    with database() as connection:
        with transaction(connection, immediate=True):
            map_row = _owned_map(connection, map_id, row["user_id"])
            expected = f'"map-{map_id}-v{map_row["revision"]}"'
            if if_match != expected:
                raise ApiError(412, "VERSION_CONFLICT", "Map changed since it was loaded", current_revision=map_row["revision"])
            _validate_document(connection, map_row, document)
            now = _now()
            connection.execute("DELETE FROM hotspots WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM panoramas WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM pois WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM nav_edges WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM nav_nodes WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM shapes WHERE map_id=?", (map_id,))
            connection.execute("DELETE FROM map_backgrounds WHERE map_id=?", (map_id,))
            if document.background_asset_id is not None:
                connection.execute("INSERT INTO map_backgrounds(map_id,asset_id) VALUES(?,?)", (map_id, document.background_asset_id))
            connection.execute("UPDATE maps SET title=?,description=?,is_published=?,scale_m_per_unit=?,max_walk_gap_units=?,revision=revision+1,updated_at=? WHERE id=?", (document.title, document.description, int(document.is_published), document.scale_m_per_unit, document.max_walk_gap_units, now, map_id))
            for shape in document.shapes:
                points_json = json.dumps([point.model_dump() for point in shape.points], separators=(",", ":"))
                connection.execute("INSERT INTO shapes(id,map_id,kind,label,points_json) VALUES(?,?,?,?,?)", (shape.id, map_id, shape.kind, shape.label, points_json))
            for node in document.nodes:
                connection.execute("INSERT INTO nav_nodes(id,map_id,x,y) VALUES(?,?,?,?)", (node.id, map_id, node.x, node.y))
            for edge in document.edges:
                connection.execute("INSERT INTO nav_edges(id,map_id,a,b) VALUES(?,?,?,?)", (edge.id, map_id, edge.a, edge.b))
            for poi in document.pois:
                connection.execute("INSERT INTO pois(id,map_id,title,category,category_label,description,x,y,nav_node_id) VALUES(?,?,?,?,?,?,?,?,?)", (poi.id, map_id, poi.title, poi.category, poi.category_label, poi.description, poi.x, poi.y, poi.nav_node_id))
            for panorama in document.panoramas:
                connection.execute("INSERT INTO panoramas(id,map_id,asset_id,title,x,y,nav_node_id,heading_offset_deg) VALUES(?,?,?,?,?,?,?,?)", (panorama.id, map_id, panorama.asset_id, panorama.title, panorama.x, panorama.y, panorama.nav_node_id, panorama.heading_offset_deg))
            for hotspot in document.hotspots:
                connection.execute("INSERT INTO hotspots(id,map_id,panorama_id,kind,yaw_deg,pitch_deg,poi_id,target_panorama_id) VALUES(?,?,?,?,?,?,?,?)", (hotspot.id, map_id, hotspot.panorama_id, hotspot.kind, hotspot.yaw_deg, hotspot.pitch_deg, hotspot.poi_id, hotspot.target_panorama_id))
            refreshed = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
            result = _snapshot(connection, refreshed)
    response.headers["ETag"] = f'"map-{map_id}-v{result["snapshot"]["revision"]}"'
    return result
