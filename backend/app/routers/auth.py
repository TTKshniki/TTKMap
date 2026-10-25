from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Header, Request, Response

from backend.app.auth import (
    bearer_from_header,
    check_login_rate_limit,
    create_organizer,
    release_successful_login,
    create_session,
    require_csrf,
    require_origin,
    require_session,
    revoke_session,
    verify_login_password,
)
from backend.app.config import settings
from backend.app.db import database
from backend.app.errors import ApiError
from backend.app.schemas import LoginRequest, RegisterRequest, Session, User


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _session_response(row, csrf_token: str, expires_at: str) -> Session:
    return Session(
        user=User(id=row["user_id"] if "user_id" in row.keys() else row["id"], email=row["email"], role=row["role"]),
        csrf_token=csrf_token,
        expires_at=expires_at,
    )


@router.post("/login", response_model=Session)
def login(payload: LoginRequest, request: Request, response: Response, _: None = Depends(require_origin)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    normalized_email = payload.email.strip().lower()
    reservation = check_login_rate_limit(client_ip, normalized_email)
    with database() as connection:
        row = connection.execute(
            "SELECT id,email,role,password_hash FROM users WHERE email=?",
            (normalized_email,),
        ).fetchone()
    if not verify_login_password(row["password_hash"] if row is not None else None, payload.password):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is invalid")
    release_successful_login(client_ip, normalized_email, reservation)
    token, csrf_token, expires_at = create_session(row["id"])
    response.set_cookie("ttk_session", token, httponly=True, secure=settings.cookie_secure,
                        samesite="lax", max_age=settings.session_ttl_seconds, path="/")
    return _session_response(row, csrf_token, expires_at.isoformat().replace("+00:00", "Z"))


@router.post("/register", response_model=Session, status_code=201)
def register(payload: RegisterRequest, request: Request, response: Response, _: None = Depends(require_origin)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    normalized_email = payload.email.strip().lower()
    reservation = check_login_rate_limit(client_ip, normalized_email)
    with database() as connection:
        existing = connection.execute("SELECT id FROM users WHERE email=?", (normalized_email,)).fetchone()
        if existing is not None:
            raise ApiError(409, "CONFLICT", "An account with this email already exists")
    user_id = create_organizer(normalized_email, payload.password)
    release_successful_login(client_ip, normalized_email, reservation)
    token, csrf_token, expires_at = create_session(user_id)
    response.set_cookie("ttk_session", token, httponly=True, secure=settings.cookie_secure,
                        samesite="lax", max_age=settings.session_ttl_seconds, path="/")
    row = {"id": user_id, "email": normalized_email, "role": "organizer"}
    return _session_response(row, csrf_token, expires_at.isoformat().replace("+00:00", "Z"))


@router.get("/session", response_model=Session)
def session(row=Depends(require_session)):
    return _session_response(row, row["csrf_token"], row["expires_at"])


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    _: None = Depends(require_origin),
    row=Depends(require_session),
    ttk_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    require_csrf(row, csrf_token)
    revoke_session(bearer_from_header(authorization) if row["kind"] == "bearer" else ttk_session)
    response.delete_cookie("ttk_session", httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
