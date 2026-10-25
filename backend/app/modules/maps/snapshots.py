import json
from backend.app.errors import ApiError

def _snapshot(connection, map_row, *, public: bool = False) -> dict:
    map_id = map_row["id"]
    shapes = []
    for row in connection.execute("SELECT id,kind,label,points_json,floor_id,height_m FROM shapes WHERE map_id=?", (map_id,)):
        shapes.append({"id": row["id"], "kind": row["kind"], "label": row["label"], "points": json.loads(row["points_json"]),
                       "floor_id": row["floor_id"], "height_m": row["height_m"]})
    buildings = []
    for row in connection.execute("SELECT id,title,kind,outline_json,sort_order FROM buildings WHERE map_id=? ORDER BY sort_order,id", (map_id,)):
        buildings.append({**dict(row), "outline_json": None if row["outline_json"] is None else json.loads(row["outline_json"])})
    floors = [dict(row) for row in connection.execute("SELECT id,building_id,level,title,elevation_m,height_m,background_asset_id FROM floors WHERE map_id=? ORDER BY building_id,level", (map_id,))]
    nodes = [dict(row) for row in connection.execute("SELECT id,x,y,floor_id FROM nav_nodes WHERE map_id=?", (map_id,))]
    edges = [dict(row) for row in connection.execute("SELECT id,a,b,kind,cost_units FROM nav_edges WHERE map_id=?", (map_id,))]
    pois = [dict(row) for row in connection.execute("SELECT id,title,category,category_label,description,x,y,nav_node_id,floor_id FROM pois WHERE map_id=?", (map_id,))]
    panoramas = [dict(row) for row in connection.execute("SELECT id,asset_id,title,x,y,nav_node_id,heading_offset_deg,floor_id FROM panoramas WHERE map_id=?", (map_id,))]
    hotspots = [dict(row) for row in connection.execute("SELECT id,panorama_id,kind,yaw_deg,pitch_deg,poi_id,target_panorama_id FROM hotspots WHERE map_id=?", (map_id,))]
    referenced_assets = {item["asset_id"] for item in panoramas}
    referenced_assets.update(item["background_asset_id"] for item in floors if item["background_asset_id"] is not None)
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
        "background_asset_id": background["asset_id"] if background is not None else None,
        "buildings": buildings, "floors": floors, "shapes": shapes, "nodes": nodes, "edges": edges,
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
