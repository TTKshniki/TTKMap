from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import Response

from backend.app.config import settings
from backend.app.db import database, initialize_database
from backend.app.errors import install_error_handlers
from backend.app.routers import auth, maps, public


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    settings.media_path.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="TTKMap Space Map API", version="0.1.0", lifespan=lifespan)
    install_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(maps.router)
    app.include_router(public.router)

    @app.middleware("http")
    async def cache_policy(request: Request, call_next) -> Response:
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/v1/public/maps/"):
            response.headers.setdefault("Cache-Control", "no-cache")
        elif path.startswith("/api/v1/media/"):
            response.headers.setdefault("Cache-Control", "private, no-cache")
        elif path.startswith("/api/v1/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.get("/healthz", tags=["system"])
    def health() -> dict[str, str]:
        with database() as connection:
            connection.execute("SELECT 1").fetchone()
        return {"status": "ok"}

    return app


app = create_app()
