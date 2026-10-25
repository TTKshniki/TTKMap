"""Dollhouse GLB from a map document: textured floor slabs, extruded walls, glass rooms, POI pins.

Plan (x, y) maps to glTF (X, Z) in metres with Y up; floors are stacked by elevation_m.
"""
from __future__ import annotations

import math
from typing import Callable

from backend.app.modules.model3d.glb_builder import GLBBuilder

WALL_THICKNESS_M = 0.15
SLAB_THICKNESS_M = 0.12
LEGACY_HEIGHT_M = 3.0
POI_HEX = {"booth": "E31B23", "hall": "1D6860", "entrance": "16A34A",
           "service_desk": "7C3AED", "wifi": "2563EB", "custom": "475569"}  # Android app palette


class MediaMissing(Exception):
    pass


def _linear(hex_rgb: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (*(channel(int(hex_rgb[i:i + 2], 16)) for i in (0, 2, 4)), alpha)


class _Soup:
    """Triangle soup with flat normals oriented away from a reference point."""

    def __init__(self) -> None:
        self.positions: list[float] = []
        self.normals: list[float] = []
        self.uvs: list[float] = []

    def tri(self, a, b, c, outward_from=None, normal=None, uv=None) -> None:
        if normal is None:
            u = [b[i] - a[i] for i in range(3)]
            v = [c[i] - a[i] for i in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            length = math.sqrt(sum(x * x for x in n))
            if length < 1e-12:
                return
            n = [x / length for x in n]
            if outward_from is not None:
                centre = [(a[i] + b[i] + c[i]) / 3 - outward_from[i] for i in range(3)]
                if sum(n[i] * centre[i] for i in range(3)) < 0:
                    n = [-x for x in n]
            normal = n
        for point in (a, b, c):
            self.positions.extend(point)
            self.normals.extend(normal)
        if uv is not None:
            for coords in uv:
                self.uvs.extend(coords)

    def quad(self, a, b, c, d, outward_from=None) -> None:
        self.tri(a, b, c, outward_from)
        self.tri(a, c, d, outward_from)

    def box(self, bottom: list[tuple[float, float]], y0: float, y1: float) -> None:
        """Prism over a convex footprint (4 corners in order)."""
        lo = [(x, y0, z) for x, z in bottom]
        hi = [(x, y1, z) for x, z in bottom]
        centre = (sum(p[0] for p in lo) / 4, (y0 + y1) / 2, sum(p[2] for p in lo) / 4)
        self.quad(*hi, outward_from=centre)
        self.quad(*lo, outward_from=centre)
        for i in range(4):
            j = (i + 1) % 4
            self.quad(lo[i], lo[j], hi[j], hi[i], outward_from=centre)


def triangulate(polygon: list[tuple[float, float]]) -> list[tuple[int, int, int]]:
    """Ear clipping for the simple polygons the document validator accepts (convex or concave).

    Returns triangles as indices into the input list; collinear vertices are dropped first.
    """
    points = list(polygon)
    if len(points) > 3 and points[0] == points[-1]:
        points.pop()

    def cross(a, b, c):  # turn at b; > 0 means a left turn in (x, y)
        return (points[b][0] - points[a][0]) * (points[c][1] - points[b][1]) - \
               (points[b][1] - points[a][1]) * (points[c][0] - points[b][0])

    def side(p, a, b):
        return (points[b][0] - points[a][0]) * (points[p][1] - points[a][1]) - \
               (points[b][1] - points[a][1]) * (points[p][0] - points[a][0])

    order = list(range(len(points)))
    if sum(points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1] for i in order) < 0:
        order.reverse()  # make every convex corner a left turn
    removed = True
    while removed and len(order) > 3:
        removed = False
        for k in range(len(order)):
            if abs(cross(order[k - 1], order[k], order[(k + 1) % len(order)])) < 1e-12:
                order.pop(k)
                removed = True
                break

    triangles = []
    while len(order) > 3:
        for k in range(len(order)):
            a, b, c = order[k - 1], order[k], order[(k + 1) % len(order)]
            if cross(a, b, c) <= 1e-12:
                continue
            if any(side(p, a, b) >= 0 and side(p, b, c) >= 0 and side(p, c, a) >= 0
                   for p in order if p not in (a, b, c)):
                continue
            triangles.append((a, b, c))
            order.pop(k)
            break
        else:
            raise ValueError("Polygon cannot be triangulated")
    if len(order) == 3 and abs(cross(*order)) >= 1e-12:
        triangles.append(tuple(order))
    return triangles


def build_dollhouse(document: dict, width_units: float, height_units: float, scale: float,
                    load_texture: Callable[[str], bytes]) -> bytes:
    """load_texture(asset_id) returns JPEG bytes or raises MediaMissing."""
    if scale is None or scale <= 0:
        raise ValueError("scale_m_per_unit is required")
    width, depth = width_units * scale, height_units * scale
    builder = GLBBuilder()
    plain = builder.add_material("slab", _linear("E7ECE9"))
    outdoor = builder.add_material("outdoor", _linear("A7C4A0"))
    wall = builder.add_material("wall", _linear("F3F6F4"))
    room_floor = builder.add_material("room", _linear("1D6860", 0.35))
    corridor_floor = builder.add_material("corridor", _linear("DCE3DF", 0.6))
    glass = builder.add_material("glass", _linear("203C3C", 0.18))
    pin_meshes: dict[str, int] = {}
    textures: dict[str, int] = {}

    kinds = {b["id"]: b["kind"] for b in document.get("buildings") or []}
    floors = document.get("floors") or []
    levels = [(f["id"], f["title"], f["elevation_m"], f["height_m"], f.get("background_asset_id"),
               kinds.get(f["building_id"]) == "outdoor", {"building_id": f["building_id"], "level": f["level"]})
              for f in floors] or [(None, document.get("title") or "Ground", 0.0, LEGACY_HEIGHT_M,
                                    document.get("background_asset_id"), False, {})]

    level_nodes = []
    for floor_id, title, elevation, floor_height, background, is_outdoor, info in levels:
        children = []
        slab_top, slab_sides = _Soup(), _Soup()
        slab_top.tri((0, 0, 0), (0, 0, depth), (width, 0, depth), normal=[0, 1, 0], uv=[(0, 0), (0, 1), (1, 1)])
        slab_top.tri((0, 0, 0), (width, 0, depth), (width, 0, 0), normal=[0, 1, 0], uv=[(0, 0), (1, 1), (1, 0)])
        corners = [(0, 0), (width, 0), (width, depth), (0, depth)]
        centre = (width / 2, -SLAB_THICKNESS_M / 2, depth / 2)
        for i in range(4):
            (x0, z0), (x1, z1) = corners[i], corners[(i + 1) % 4]
            slab_sides.quad((x0, -SLAB_THICKNESS_M, z0), (x1, -SLAB_THICKNESS_M, z1), (x1, 0, z1), (x0, 0, z0), centre)
        if background:
            if background not in textures:
                textures[background] = builder.add_material(
                    f"plan-{background}", (1, 1, 1, 1), texture=builder.add_texture(load_texture(background)))
            top_material = textures[background]
        else:
            top_material = outdoor if is_outdoor else plain
        slab = builder.add_mesh(f"{title} slab", [(top_material, slab_top.positions, slab_top.normals, slab_top.uvs),
                                                  (plain, slab_sides.positions, slab_sides.normals, None)])
        children.append(builder.add_node(f"{title} slab", mesh=slab))

        walls, rooms, corridors, glass_walls = _Soup(), _Soup(), _Soup(), _Soup()
        for shape in document.get("shapes", []):
            if shape.get("floor_id") != floor_id:
                continue
            points = [(p["x"] * scale, p["y"] * scale) for p in shape["points"]]
            top = shape.get("height_m") or floor_height
            if shape["kind"] == "wall":
                for (x0, z0), (x1, z1) in zip(points, points[1:]):
                    length = math.hypot(x1 - x0, z1 - z0)
                    if length < 1e-9:
                        continue
                    ox, oz = -(z1 - z0) / length * WALL_THICKNESS_M / 2, (x1 - x0) / length * WALL_THICKNESS_M / 2
                    walls.box([(x0 + ox, z0 + oz), (x1 + ox, z1 + oz), (x1 - ox, z1 - oz), (x0 - ox, z0 - oz)], 0, top)
                continue
            if len(points) >= 3:  # Only triangulate valid polygons
                target = rooms if shape["kind"] == "room" else corridors
                for a, b, c in triangulate(points):
                    target.tri(*[(points[i][0], 0.02, points[i][1]) for i in (a, b, c)], normal=[0, 1, 0])
                ring = points if points[0] != points[-1] else points[:-1]
                for (x0, z0), (x1, z1) in zip(ring, ring[1:] + ring[:1]):
                    glass_walls.quad((x0, 0, z0), (x1, 0, z1), (x1, top, z1), (x0, top, z0))
        structure = builder.add_mesh(f"{title} structure", [
            (wall, walls.positions, walls.normals, None), (room_floor, rooms.positions, rooms.normals, None),
            (corridor_floor, corridors.positions, corridors.normals, None),
            (glass, glass_walls.positions, glass_walls.normals, None)])
        if structure is not None:
            children.append(builder.add_node(f"{title} structure", mesh=structure))

        for poi in document.get("pois", []):
            if poi.get("floor_id") != floor_id:
                continue
            category = poi["category"]
            if category not in pin_meshes:
                pin_meshes[category] = _pin_mesh(builder, builder.add_material(f"poi-{category}", _linear(POI_HEX[category])))
            children.append(builder.add_node(poi["title"], mesh=pin_meshes[category],
                                             translation=(poi["x"] * scale, 0, poi["y"] * scale),
                                             extras={"poi_id": poi["id"], "category": category}))

        level_nodes.append(builder.add_node(title, children=children, translation=(0, elevation, 0),
                                            extras={"floor_id": floor_id, "elevation_m": elevation,
                                                    "height_m": floor_height, **info}))
    builder.add_node("TTKMap", children=level_nodes, root=True)
    return builder.build()


def _pin_mesh(builder: GLBBuilder, material: int) -> int:
    pin = _Soup()
    r = 0.04
    pin.box([(-r, -r), (r, -r), (r, r), (-r, r)], 0, 1.4)
    centre, size = (0, 1.65, 0), 0.25
    tips = [(0, 1.65 + size, 0), (0, 1.65 - size, 0)]
    ring = [(size, 1.65, 0), (0, 1.65, size), (-size, 1.65, 0), (0, 1.65, -size)]
    for tip in tips:
        for i in range(4):
            pin.tri(ring[i], ring[(i + 1) % 4], tip, outward_from=centre)
    return builder.add_mesh("poi pin", [(material, pin.positions, pin.normals, None)])
