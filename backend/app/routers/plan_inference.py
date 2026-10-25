"""Inferred 2D plan generation from a panorama."""
from __future__ import annotations

import math
from uuid import uuid4

from PIL import Image
from fastapi import APIRouter, Depends, Header

from backend.app.auth import require_session
from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.errors import ApiError
from backend.app.modules.maps.plan_detector import MODEL, DetectionFailed, detect_room
from backend.app.modules.maps.snapshots import _owned_map, _snapshot

router = APIRouter(prefix="/api/v1", tags=["plan_inference"])


def _owned_panorama(connection, panorama_id: str, user_id: str) -> tuple[dict, dict]:
    """Returns (map_row, panorama) where panorama is from document.panoramas[]."""
    maps = connection.execute(
        "SELECT * FROM maps WHERE owner_id=?", (user_id,)
    ).fetchall()
    for map_row in maps:
        result = _snapshot(connection, map_row, public=False)
        snapshot = result if "document" in result else result["snapshot"]
        for pano in snapshot["document"].get("panoramas", []):
            if pano["id"] == panorama_id:
                return map_row, pano
    raise ApiError(404, "NOT_FOUND", "Panorama not found or you do not have access")


def _inferred_shapes(panorama_id: str, room, x_pano: float, y_pano: float, angle_deg: float,
                     camera_height_m: float, floor_id: str | None) -> dict:
    corners = room.fit.corners()  # (x, y) in camera heights
    scale = camera_height_m
    # Plan coordinates use Y down, math uses Y up; rotate the frame by angle, flip Y, then translate to pano position.
    cos_a, sin_a = math.cos(math.radians(angle_deg)), math.sin(math.radians(angle_deg))

    def to_plan(x_local: float, y_local: float) -> dict:
        x_rot = x_local * cos_a - y_local * sin_a
        y_rot = x_local * sin_a + y_local * cos_a
        return {"x": x_pano + x_rot * scale, "y": y_pano - y_rot * scale}

    room_id = str(uuid4())
    points = [to_plan(x, y) for x, y in corners]
    shapes = [{"id": room_id, "kind": "room", "label": "Inferred room", "points": points,
               "floor_id": floor_id, "height_m": None}]

    for opening in room.openings:
        a, b = corners[opening.wall], corners[(opening.wall + 1) % 4]
        t0, t1 = opening.t_start, opening.t_end
        wall_points = [to_plan(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) for t in (t0, t1)]
        label = {"door": "Door", "window": "Window"}.get(opening.kind, opening.kind.capitalize())
        shapes.append({"id": str(uuid4()), "kind": "wall", "label": label, "points": wall_points,
                       "floor_id": floor_id, "height_m": 1.0 if opening.kind == "door" else 2.1})

    return {
        "source_panorama_id": panorama_id,
        "model": MODEL,
        "confidence": room.confidence,
        "camera_height_m": camera_height_m,
        "angle_deg": angle_deg,
        "shapes": shapes,
    }


@router.post("/panoramas/{panorama_id}/inferred-plan")
def infer_plan(
    panorama_id: str,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    row=Depends(require_session),
):
    """Analyze a rectangular room from the panorama and return suggested shapes (not saved to map)."""
    from backend.app.auth import require_csrf
    require_csrf(row, csrf_token)

    with database() as connection:
        map_row, pano = _owned_panorama(connection, panorama_id, row["user_id"])

    scale = map_row["scale_m_per_unit"]
    if scale is None or scale <= 0:
        raise ApiError(422, "VALIDATION_ERROR", "Set the map scale before inferring a plan from a panorama",
                       issues=[{"path": "scale_m_per_unit", "message": "Required to convert distances to plan units"}])

    # Load asset metadata
    with database() as connection:
        asset_row = connection.execute(
            "SELECT mobile_key, vaov_deg, v_offset_deg FROM assets WHERE id=?",
            (pano["asset_id"],),
        ).fetchone()
    if asset_row is None:
        raise ApiError(404, "NOT_FOUND", "Asset not found")

    path = (settings.media_path / asset_row["mobile_key"]).resolve()
    if settings.media_path not in path.parents or not path.is_file():
        raise ApiError(503, "SERVICE_UNAVAILABLE", "Panorama media is missing")

    camera_height_m = 1.5  # typical handheld or tripod height
    try:
        with Image.open(path) as image:
            observation = detect_room(image, asset_row["vaov_deg"], asset_row["v_offset_deg"], timeout_s=15)
    except DetectionFailed as exc:
        raise ApiError(422, "VALIDATION_ERROR", str(exc),
                       issues=[{"path": "asset_id", "message": "This panorama cannot be auto-analyzed"}]) from exc

    return _inferred_shapes(
        panorama_id, observation, pano["x"], pano["y"],
        pano["heading_offset_deg"] + observation.fit.angle, camera_height_m, pano.get("floor_id")
    )
