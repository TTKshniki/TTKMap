"""Dollhouse GLB: textured 3D scene generated from the saved map document."""
from __future__ import annotations

import threading
from collections import OrderedDict
from io import BytesIO

from fastapi import APIRouter, Depends, Header, Response
from PIL import Image

from backend.app.auth import require_session
from backend.app.config import settings
from backend.app.db import database, transaction
from backend.app.errors import ApiError
from backend.app.modules.maps.snapshots import _owned_map, _snapshot
from backend.app.modules.model3d.scene_generator import MediaMissing, build_dollhouse
from backend.app.routers.public import _etag_matches


router = APIRouter(prefix="/api/v1", tags=["model3d"])

_CACHE_SIZE = 8
_cache: OrderedDict[tuple[str, int], bytes] = OrderedDict()
_cache_lock = threading.Lock()


def _read(map_row) -> tuple[dict, dict[str, str]]:
    """Read the document and plan keys of exactly the revision the ETag names; a concurrent save is a 409."""
    with database() as connection:
        with transaction(connection):
            current = connection.execute("SELECT revision FROM maps WHERE id=?", (map_row["id"],)).fetchone()
            if current is None or current["revision"] != map_row["revision"]:
                raise ApiError(409, "CONFLICT", "Map changed while the model was requested")
            snapshot = _snapshot(connection, map_row, public=True)
            keys = {row["id"]: row["mobile_key"] for row in connection.execute(
                "SELECT id,mobile_key FROM assets WHERE map_id=? AND kind='plan'", (map_row["id"],))}
    return snapshot, keys


def _render(map_row, if_none_match: str | None, cache_control: str, read=_read) -> Response:
    etag = f'"model-{map_row["id"]}-v{map_row["revision"]}"'
    headers = {"ETag": etag, "Cache-Control": cache_control}
    if _etag_matches(if_none_match, etag):
        return Response(status_code=304, headers=headers)
    if map_row["scale_m_per_unit"] is None:
        raise ApiError(422, "VALIDATION_ERROR", "Set the map scale before generating a 3D model",
                       issues=[{"path": "scale_m_per_unit", "message": "Required for metric 3D geometry"}])
    key = (map_row["id"], map_row["revision"])
    with _cache_lock:
        glb = _cache.get(key)
        if glb is not None:
            _cache.move_to_end(key)
    if glb is None:
        snapshot, keys = read(map_row)
        media_root = settings.media_path.resolve()

        def load_texture(asset_id: str) -> bytes:
            path = (media_root / keys.get(asset_id, "")).resolve()
            if asset_id not in keys or media_root not in path.parents or not path.is_file():
                raise MediaMissing(asset_id)
            with Image.open(path) as image:  # stored as WebP; core glTF only allows PNG/JPEG
                output = BytesIO()
                image.convert("RGB").save(output, format="JPEG", quality=85)
            return output.getvalue()

        try:
            glb = build_dollhouse(snapshot["document"], map_row["width_units"], map_row["height_units"],
                                  map_row["scale_m_per_unit"], load_texture)
        except MediaMissing as exc:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "Plan media is missing; 3D model unavailable") from exc
        with _cache_lock:
            _cache[key] = glb
            while len(_cache) > _CACHE_SIZE:
                _cache.popitem(last=False)
    return Response(content=glb, media_type="model/gltf-binary", headers=headers)


def clear_model_cache() -> None:
    with _cache_lock:
        _cache.clear()


@router.get("/maps/{map_id}/model3d.glb")
def organizer_model(map_id: str, row=Depends(require_session),
                    if_none_match: str | None = Header(default=None, alias="If-None-Match")):
    with database() as connection:
        map_row = _owned_map(connection, map_id, row["user_id"])
    return _render(map_row, if_none_match, "private, no-cache")


@router.get("/public/maps/{slug}/model3d.glb")
def public_model(slug: str, if_none_match: str | None = Header(default=None, alias="If-None-Match")):
    with database() as connection:
        map_row = connection.execute("SELECT * FROM maps WHERE slug=? AND is_published=1", (slug,)).fetchone()
    if map_row is None:
        raise ApiError(404, "NOT_FOUND", "Published map not found")
    return _render(map_row, if_none_match, "no-cache")
