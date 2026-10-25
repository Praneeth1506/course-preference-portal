"""Environment-driven application configuration.

The project is a one-day MVP, so a small dataclass loaded from environment
variables keeps configuration explicit without introducing a larger settings
framework. ``python-dotenv`` is used only to make local ``.env`` files
convenient; real environment variables always win.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str
    mongo_uri: str
    mongo_db_name: str
    frontend_base_url: str
    cors_origins: tuple[str, ...]
    jwt_secret: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    admin_username: str
    admin_password: str | None
    admin_password_hash: str | None
    public_token_bytes: int
    mongo_timeout_ms: int

    @property
    def cors_origin_list(self) -> list[str]:
        return list(self.cors_origins)


def _split_csv(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name="Course Preference Portal API",
        mongo_uri=os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017"),
        mongo_db_name=os.getenv("MONGO_DB_NAME", "course_preference_portal"),
        frontend_base_url=os.getenv(
            "FRONTEND_BASE_URL", "http://localhost:5173"
        ).rstrip("/"),
        cors_origins=_split_csv(
            os.getenv("CORS_ORIGINS", "http://localhost:5173")
        ),
        jwt_secret=os.getenv(
            "JWT_SECRET", "dev-only-insecure-jwt-secret-change-me"
        ),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=_get_int(
            "ACCESS_TOKEN_EXPIRE_MINUTES", 480
        ),
        admin_username=os.getenv("ADMIN_USERNAME", "admin"),
        admin_password=os.getenv("ADMIN_PASSWORD", "admin123"),
        admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH") or None,
        public_token_bytes=max(_get_int("PUBLIC_TOKEN_BYTES", 32), 32),
        mongo_timeout_ms=_get_int("MONGO_TIMEOUT_MS", 3000),
    )


settings = get_settings()
