from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Header

from backend.app.config import settings
from backend.app.db import database
from backend.app.errors import ApiError


try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError
except ImportError:  # pragma: no cover - dependencies are installed in the backend image
    PasswordHasher = None
    VerifyMismatchError = Exception


def hash_password(password: str) -> str:
    if PasswordHasher is None:
        raise RuntimeError("argon2-cffi is required for organizer passwords")
    return PasswordHasher().hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    if PasswordHasher is None:
        return False
    try:
        return PasswordHasher().verify(password_hash, password)
    except (VerifyMismatchError, ValueError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: str) -> tuple[str, str, datetime]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _token_hash(raw_token)
    csrf_token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.session_ttl_seconds)
    with database() as connection:
        connection.execute(
            "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)",
            (token_hash, user_id, csrf_token, expires_at.isoformat().replace("+00:00", "Z")),
        )
    return raw_token, csrf_token, expires_at


def _session_row(raw_token: str | None):
    if not raw_token:
        return None
    with database() as connection:
        return connection.execute(
            "SELECT s.*, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id "
            "WHERE s.token_hash=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%SZ','now')",
            (_token_hash(raw_token),),
        ).fetchone()


def require_session(ttk_session: Annotated[str | None, Cookie()] = None):
    row = _session_row(ttk_session)
    if row is None:
        raise ApiError(401, "AUTH_REQUIRED", "Authentication required")
    return row


def require_origin(origin: Annotated[str | None, Header()] = None) -> None:
    if origin != settings.app_origin:
        raise ApiError(403, "FORBIDDEN", "Request origin is not allowed")


def require_csrf(
    row,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    if not csrf_token or not secrets.compare_digest(csrf_token, row["csrf_token"]):
        raise ApiError(403, "FORBIDDEN", "CSRF token is invalid")


def revoke_session(raw_token: str | None) -> None:
    if not raw_token:
        return
    with database() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash=?", (_token_hash(raw_token),))


def get_user(user_id: str):
    with database() as connection:
        return connection.execute("SELECT id,email,role FROM users WHERE id=?", (user_id,)).fetchone()


def create_organizer(email: str, password: str) -> str:
    user_id = str(uuid4())
    with database() as connection:
        connection.execute(
            "INSERT INTO users(id,email,password_hash) VALUES(?,?,?)",
            (user_id, email.strip().lower(), hash_password(password)),
        )
    return user_id
