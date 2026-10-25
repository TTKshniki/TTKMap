from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4

from fastapi import Cookie, Header

from backend.app.config import settings
from backend.app.db import database
from backend.app.errors import ApiError


from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError

_LOGIN_WINDOW_SECONDS = 60.0
_LOGIN_MAX_FAILURES = 5
_login_failures: dict[str, list[float]] = defaultdict(list)
_login_lock = threading.Lock()
_ph = PasswordHasher()
_dummy_password_hash = _ph.hash(secrets.token_urlsafe(32))


def clear_login_failures(client_ip: str | None = None, email: str | None = None) -> None:
    with _login_lock:
        if client_ip is None or email is None:
            _login_failures.clear()
            return
        _login_failures.pop(f"ip:{client_ip}", None)
        _login_failures.pop(f"email:{email.strip().lower()}", None)


def _prune_failures(key: str, now: float) -> list[float]:
    cutoff = now - _LOGIN_WINDOW_SECONDS
    recent = [ts for ts in _login_failures.get(key, []) if ts > cutoff]
    if recent:
        _login_failures[key] = recent
    else:
        _login_failures.pop(key, None)
    return recent


def check_login_rate_limit(client_ip: str, email: str) -> float:
    now = time.monotonic()
    ip_key = f"ip:{client_ip}"
    email_key = f"email:{email.strip().lower()}"
    with _login_lock:
        for key in list(_login_failures):
            _prune_failures(key, now)
        if len(_login_failures) > 10000:
            raise ApiError(429, 'RATE_LIMITED', 'Please try again later')
        if len(_prune_failures(ip_key, now)) >= _LOGIN_MAX_FAILURES or len(_prune_failures(email_key, now)) >= _LOGIN_MAX_FAILURES:
            raise ApiError(429, "RATE_LIMITED", "Too many login attempts, please try again later")
        for key in (ip_key, email_key):
            _login_failures[key].append(now)
    return now


def release_successful_login(client_ip: str, email: str, reservation: float) -> None:
    """Release only this successful attempt; retain concurrent failures."""
    with _login_lock:
        for key in (f'ip:{client_ip}', f'email:{email.strip().lower()}'):
            recent = list(_login_failures.get(key, []))
            if reservation in recent:
                recent.remove(reservation)
            if recent:
                _login_failures[key] = recent
            else:
                _login_failures.pop(key, None)


def verify_login_password(password_hash: str | None, password: str) -> bool:
    """Verify unknown users with the same Argon2 work factor as known users."""
    if password_hash is None:
        if _dummy_password_hash is not None:
            verify_password(_dummy_password_hash, password)
        return False
    return verify_password(password_hash, password)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _ph.verify(password_hash, password)
        return True
    except (VerificationError, InvalidHashError, ValueError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def bearer_from_header(authorization: str | None) -> str | None:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    return authorization[7:].strip() or None


def create_session(user_id: str, kind: str = "cookie") -> tuple[str, str, datetime]:
    """Bearer sessions keep a CSRF value only to satisfy the Session DTO; it is never checked."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _token_hash(raw_token)
    csrf_token = secrets.token_hex(32)
    ttl = settings.session_ttl_seconds if kind == "cookie" else settings.bearer_ttl_seconds
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
    with database() as connection:
        connection.execute(
            "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,kind) VALUES(?,?,?,?,?)",
            (token_hash, user_id, csrf_token, expires_at.isoformat().replace("+00:00", "Z"), kind),
        )
    return raw_token, csrf_token, expires_at


def _session_row(raw_token: str | None):
    if not raw_token:
        return None
    with database() as connection:
        return connection.execute(
            "SELECT s.*, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id "
            "WHERE s.token_hash=? AND julianday(s.expires_at)>julianday('now')",
            (_token_hash(raw_token),),
        ).fetchone()


def _request_session(ttk_session: str | None, authorization: str | None):
    """Resolve exactly one transport. An Authorization header disables the cookie,
    and a session is only valid on the transport it was issued for."""
    if authorization is not None:
        token = bearer_from_header(authorization)
        row = _session_row(token) if token else None
        return row if row is not None and row["kind"] == "bearer" else None
    row = _session_row(ttk_session)
    return row if row is not None and row["kind"] == "cookie" else None


def get_optional_session(ttk_session: Annotated[str | None, Cookie()] = None,
                         authorization: Annotated[str | None, Header()] = None):
    return _request_session(ttk_session, authorization)


def require_session(ttk_session: Annotated[str | None, Cookie()] = None,
                    authorization: Annotated[str | None, Header()] = None):
    row = _request_session(ttk_session, authorization)
    if row is None:
        raise ApiError(401, "AUTH_REQUIRED", "Authentication required")
    return row


def require_origin(origin: Annotated[str | None, Header()] = None,
                   authorization: Annotated[str | None, Header()] = None) -> None:
    # Browsers cannot attach Authorization cross-site without a CORS preflight
    # (none is configured), and such requests never fall back to the cookie.
    if authorization is not None:
        return
    if origin != settings.app_origin:
        raise ApiError(403, "FORBIDDEN", "Request origin is not allowed")


def require_csrf(
    row,
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    """Bearer sessions are immune to CSRF; cookie sessions require matching CSRF token."""
    if row["kind"] == "bearer":
        return
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
