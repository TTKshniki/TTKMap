"""Minimal glTF 2.0 binary (GLB) writer: non-indexed triangle primitives, JPEG textures, node tree."""
from __future__ import annotations

import json
import struct

FLOAT, ARRAY_BUFFER = 5126, 34962


class GLBBuilder:
    def __init__(self) -> None:
        self._gltf: dict = {"asset": {"version": "2.0", "generator": "TTKMap dollhouse"},
                            "scene": 0, "scenes": [{"nodes": []}]}
        self._binary = bytearray()

    def _append(self, key: str, item: dict) -> int:
        items = self._gltf.setdefault(key, [])  # glTF forbids empty top-level arrays
        items.append(item)
        return len(items) - 1

    def _view(self, data: bytes, target: int | None = None) -> int:
        self._binary.extend(b"\x00" * (-len(self._binary) % 4))
        view = {"buffer": 0, "byteOffset": len(self._binary), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self._binary.extend(data)
        return self._append("bufferViews", view)

    def _accessor(self, values: list[float], width: int, kind: str, bounds: bool = False) -> int:
        data = struct.pack(f"<{len(values)}f", *values)
        accessor = {"bufferView": self._view(data, ARRAY_BUFFER),
                    "componentType": FLOAT, "count": len(values) // width, "type": kind}
        if bounds:  # required for POSITION; recompute from packed float32 to match actual precision
            packed = struct.unpack(f"<{len(values)}f", data)
            accessor["min"] = [min(packed[i::width]) for i in range(width)]
            accessor["max"] = [max(packed[i::width]) for i in range(width)]
        return self._append("accessors", accessor)

    def add_texture(self, jpeg: bytes) -> int:
        image = self._append("images", {"bufferView": self._view(jpeg), "mimeType": "image/jpeg"})
        if "samplers" not in self._gltf:
            self._append("samplers", {"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071})
        return self._append("textures", {"source": image, "sampler": 0})

    def add_material(self, name: str, rgba: tuple[float, float, float, float], texture: int | None = None) -> int:
        pbr = {"baseColorFactor": list(rgba), "metallicFactor": 0.0, "roughnessFactor": 0.85}
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        material = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": True}
        if rgba[3] < 1:
            material["alphaMode"] = "BLEND"
        return self._append("materials", material)

    def add_mesh(self, name: str, primitives: list[tuple[int, list[float], list[float], list[float] | None]]) -> int | None:
        """primitives: (material, xyz positions, xyz normals, uv or None). Empty primitives are dropped."""
        result = []
        for material, positions, normals, uvs in primitives:
            if not positions:
                continue
            attributes = {"POSITION": self._accessor(positions, 3, "VEC3", bounds=True),
                          "NORMAL": self._accessor(normals, 3, "VEC3")}
            if uvs is not None:
                attributes["TEXCOORD_0"] = self._accessor(uvs, 2, "VEC2")
            result.append({"attributes": attributes, "material": material, "mode": 4})
        if not result:
            return None
        return self._append("meshes", {"name": name, "primitives": result})

    def add_node(self, name: str, *, mesh: int | None = None, translation: tuple[float, float, float] | None = None,
                 children: list[int] | None = None, extras: dict | None = None, root: bool = False) -> int:
        node: dict = {"name": name}
        if mesh is not None:
            node["mesh"] = mesh
        if translation is not None:
            node["translation"] = list(translation)
        if children:
            node["children"] = children
        if extras:
            node["extras"] = extras
        index = self._append("nodes", node)
        if root:
            self._gltf["scenes"][0]["nodes"].append(index)
        return index

    def build(self) -> bytes:
        self._binary.extend(b"\x00" * (-len(self._binary) % 4))
        if self._binary:
            self._gltf["buffers"] = [{"byteLength": len(self._binary)}]
        document = json.dumps(self._gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        document += b" " * (-len(document) % 4)
        chunks = [struct.pack("<I4s", len(document), b"JSON"), document]
        if self._binary:
            chunks += [struct.pack("<I4s", len(self._binary), b"BIN\x00"), bytes(self._binary)]
        body = b"".join(chunks)
        return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body
