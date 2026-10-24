from fastapi import Request

from backend.app.errors import ApiError
from backend.app.modules.media.storage import FRAME_MAX_BYTES, parse_multipart_fields


async def read_frame_upload(request: Request) -> bytes:
    """Bound streaming bodies too; Content-Length is not trusted for limits."""
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > FRAME_MAX_BYTES + 65536:
            raise ApiError(413, "MEDIA_TOO_LARGE", "Multipart payload exceeds maximum allowed size")
        body.extend(chunk)

    async def receive():
        return {"type": "http.request", "body": bytes(body), "more_body": False}

    fields = await parse_multipart_fields(Request(request.scope, receive), FRAME_MAX_BYTES)
    file_entry = fields.get("file")
    if file_entry is None:
        raise ApiError(422, "VALIDATION_ERROR", "Multipart field 'file' is required")
    if len(file_entry[1]) > FRAME_MAX_BYTES:
        raise ApiError(413, "MEDIA_TOO_LARGE", "Uploaded frame exceeds maximum allowed size")
    return file_entry[1]
