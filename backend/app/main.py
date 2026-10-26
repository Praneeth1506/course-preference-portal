"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import database_is_reachable, ensure_indexes
from .routers import auth, courses, forms, public

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not database_is_reachable():
        logger.error(
            "MongoDB is not reachable at MONGO_URI (database %r). Start MongoDB "
            "or fix MONGO_URI in backend/.env; database endpoints will fail "
            "until it is reachable.",
            settings.mongo_db_name,
        )
    try:
        ensure_indexes()
    except Exception as exc:  # pragma: no cover - startup resilience
        # The app should still boot so /docs and the health check work while a
        # database is being started. Requests that need MongoDB return 500.
        logger.warning("Could not create MongoDB indexes at startup: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Backend for the Course Preference Portal. Administrators create and "
        "publish forms; faculty submit preferences through a public token link."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(forms.router)
app.include_router(public.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "database": "ok" if database_is_reachable() else "unavailable",
    }
