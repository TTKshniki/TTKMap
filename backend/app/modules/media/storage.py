from __future__ import annotations

from email.parser import BytesParser
from email.policy import default as default_email_policy
import io
import os
from pathlib import Path
import struct
from uuid import uuid4

from fastapi import Request

from backend.app.errors import ApiError

try:
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000
except ImportError:  # pragma: no cover
    Image = None
    ImageOps = None

PLAN_MAX_BYTES = 15 * 1024 * 1024
PANORAMA_MAX_BYTES = 40 * 1024 * 1024
FRAME_MAX_BYTES = 12 * 1024 * 1024
MAX_DIMENSION = 8192
MAX_PIXELS = 40_000_000


def _parse_png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Invalid PNG header")
    width, height = struct.unpack(">II", data[16:24])
    return int(width), int(height)


def _parse_webp_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 30:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Invalid WebP header")
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        w = 1 + int.from_bytes(data[24:27], "little")
        h = 1 + int.from_bytes(data[27:30], "little")
        return w, h
    if chunk == b"VP8L" and len(data) >= 25:
        b0, b1, b2, b3 = data[21], data[22], data[23], data[24]
        w = 1 + (((b1 & 0x3F) << 8) | b0)
        h = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
        return w, h
    if chunk == b"VP8 " and len(data) >= 30:
        w, h = struct.unpack("<HH", data[26:30])
        return int(w & 0x3FFF), int(h & 0x3FFF)
    raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported WebP format")


def _parse_jpeg_dimensions(data: bytes) -> tuple[int, int]:
    idx = 2
    size = len(data)
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while idx < size - 1:
        if data[idx] != 0xFF:
            idx += 1
            continue
        while idx < size and data[idx] == 0xFF:
            idx += 1
        if idx >= size:
            break
        marker = data[idx]
        idx += 1
        if marker in {0xD8, 0xD9} or (0xD0 <= marker <= 0xD7):
            continue
        if idx + 2 > size:
            break
        seg_len = struct.unpack(">H", data[idx:idx + 2])[0]
        if seg_len < 2 or idx + seg_len > size:
            break
        if marker in sof_markers:
            if idx + 7 > size:
                break
            height, width = struct.unpack(">HH", data[idx + 3:idx + 7])
            return int(width), int(height)
        idx += seg_len
    raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Invalid JPEG stream")


def inspect_image_bytes(data: bytes, max_bytes: int) -> tuple[str, int, int]:
    if len(data) > max_bytes:
        raise ApiError(413, "MEDIA_TOO_LARGE", "Uploaded file exceeds maximum allowed size")
    if len(data) < 12:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported or empty image file")

    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        fmt = "png"
    elif data.startswith(b"\xff\xd8\xff"):
        fmt = "jpeg"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        fmt = "webp"
    else:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Only JPEG, PNG and WebP images are supported")

    if Image is not None:
        try:
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
            with Image.open(io.BytesIO(data)) as img:
                transposed = ImageOps.exif_transpose(img) if ImageOps is not None else img
                width, height = transposed.size
        except Image.DecompressionBombError as exc:
            raise ApiError(413, "MEDIA_TOO_LARGE", "Image pixel count exceeds safety limit") from exc
        except Exception as exc:
            raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Corrupted or invalid image content") from exc
    else:
        if fmt == "png":
            width, height = _parse_png_dimensions(data)
        elif fmt == "webp":
            width, height = _parse_webp_dimensions(data)
        else:
            width, height = _parse_jpeg_dimensions(data)

    if width <= 0 or height <= 0:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Invalid image dimensions")
    if width * height > MAX_PIXELS:
        raise ApiError(413, "MEDIA_TOO_LARGE", "Image pixel count exceeds maximum allowed")
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ApiError(422, "VALIDATION_ERROR", f"Image dimensions ({width}x{height}) exceed {MAX_DIMENSION}px")
    return fmt, int(width), int(height)


async def parse_multipart_fields(request: Request, max_bytes: int) -> dict[str, tuple[str | None, bytes]]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type.lower():
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected multipart/form-data request")
    body = await request.body()
    if len(body) > max_bytes + 65536:
        raise ApiError(413, "MEDIA_TOO_LARGE", "Multipart payload exceeds maximum allowed size")
    raw_headers = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
    msg = BytesParser(policy=default_email_policy).parsebytes(raw_headers + body)
    if not msg.is_multipart():
        raise ApiError(400, "BAD_REQUEST", "Malformed multipart body")
    fields: dict[str, tuple[str | None, bytes]] = {}
    for part in msg.iter_parts():
        disposition = part.get_content_disposition()
        if disposition != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if name:
            fields[str(name)] = (filename, payload)
    return fields


class AssetStore:
    """Small storage seam shared by media and capture agents.

    The media feature owns validation and derivative generation. This class only
    provides a stable path boundary for atomic writes on one local volume.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def asset_dir(self, asset_id: str) -> Path:
        path = self.root / asset_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def write_atomic(self, relative_key: str, data: bytes) -> Path:
        target = (self.root / relative_key).resolve()
        root_resolved = self.root.resolve()
        if root_resolved != target and root_resolved not in target.parents:
            raise ValueError("Invalid storage key outside media root")
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
        tmp_path.write_bytes(data)
        os.replace(tmp_path, target)
        return target

    def store_asset_variants(self, asset_id: str, raw_bytes: bytes, width: int, height: int) -> tuple[str, str, str, int, int]:
        preview_key = f"{asset_id}/preview.webp"
        mobile_key = f"{asset_id}/mobile.webp"
        full_key = f"{asset_id}/full.webp"
        final_w = min(width, 4096)
        final_h = min(height, 4096)

        if Image is not None:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                base = ImageOps.exif_transpose(img) if ImageOps is not None else img
                if base.mode not in ("RGB", "RGBA"):
                    base = base.convert("RGB")
                for key, max_side, quality in (
                    (preview_key, 640, 75),
                    (mobile_key, 2048, 82),
                    (full_key, 4096, 88),
                ):
                    copy_img = base.copy()
                    copy_img.thumbnail((max_side, max_side))
                    if key == full_key:
                        final_w, final_h = copy_img.size
                    buf = io.BytesIO()
                    copy_img.save(buf, format="WEBP", quality=quality)
                    self.write_atomic(key, buf.getvalue())
        else:
            if width > 4096 or height > 4096:
                scale = min(4096 / width, 4096 / height)
                final_w = max(1, int(round(width * scale)))
                final_h = max(1, int(round(height * scale)))
            self.write_atomic(preview_key, raw_bytes)
            self.write_atomic(mobile_key, raw_bytes)
            self.write_atomic(full_key, raw_bytes)

        return preview_key, mobile_key, full_key, final_w, final_h
