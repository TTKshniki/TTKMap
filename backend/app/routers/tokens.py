from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request, Response

from backend.app.auth import (
    bearer_from_header,
    check_login_rate_limit,
    create_session,
    release_successful_login,
    require_csrf,
    require_origin,
    require_session,
    revoke_session,
    verify_login_password,
)
from backend.app.db import database
from backend.app.errors import ApiError
from backend.app.schemas import LoginRequest


# Native clients (Android) cannot satisfy the browser Origin/CSRF contract, so
# they exchange credentials for a Bearer session. Bearer is never read from a
# cookie and cookie sessions are never accepted as Bearer (see auth.py).
router = APIRouter(prefix="/api/v1/tokens", tags=["auth"])


@router.post("", status_code=201)
def issue_token(payload: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    reservation = check_login_rate_limit(client_ip, payload.email)
    with database() as connection:
        row = connection.execute(
            "SELECT id,email,role,password_hash FROM users WHERE email=?", (payload.email,)
        ).fetchone()
    if not verify_login_password(row["password_hash"] if row is not None else None, payload.password):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is invalid")
    release_successful_login(client_ip, payload.email, reservation)
    token, _, expires_at = create_session(row["id"], kind="bearer")
    return {
        "token": token,
        "token_type": "bearer",
        "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        "user": {"id": row["id"], "email": row["email"], "role": row["role"]},
    }


@router.delete("", status_code=204)
def revoke_current_token(row=Depends(require_session), authorization: str | None = Header(default=None)):
    if row["kind"] != "bearer":
        raise ApiError(400, "BAD_REQUEST", "Only a Bearer session can be revoked here; use logout")
    revoke_session(bearer_from_header(authorization))
    return Response(status_code=204)


@router.delete("/all", status_code=204)
def revoke_all_tokens(
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
    _: None = Depends(require_origin),
    row=Depends(require_session),
):
    """Sign out every device (e.g. a lost phone); browser cookie sessions stay."""
    require_csrf(row, csrf_token)
    with database() as connection:
        connection.execute("DELETE FROM sessions WHERE user_id=? AND kind='bearer'", (row["user_id"],))
    return Response(status_code=204)
