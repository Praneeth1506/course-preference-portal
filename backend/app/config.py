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


MIN_JWT_SECRET_LENGTH = 32
# Publicly known placeholder values that must never sign real tokens.
_PLACEHOLDER_SECRETS = {
    "dev-only-insecure-jwt-secret-change-me",
    "replace-with-a-long-random-secret",
}


class ConfigError(RuntimeError):
    """Raised at startup when required settings are missing or unsafe."""


def _validate(settings: Settings) -> None:
    problems = []
    if not settings.mongo_uri:
        problems.append("MONGO_URI is not set")
    if not settings.jwt_secret:
        problems.append("JWT_SECRET is not set")
    elif settings.jwt_secret in _PLACEHOLDER_SECRETS:
        problems.append("JWT_SECRET is still the example placeholder")
    elif len(settings.jwt_secret) < MIN_JWT_SECRET_LENGTH:
        problems.append(
            f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters"
        )
    if not settings.admin_username:
        problems.append("ADMIN_USERNAME is not set")
    if not settings.admin_password_hash and not settings.admin_password:
        problems.append("set ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD for local use)")
    if problems:
        raise ConfigError(
            "Invalid backend configuration: "
            + "; ".join(problems)
            + ". See backend/.env.example."
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings(
        app_name="Course Preference Portal API",
        mongo_uri=os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017").strip(),
        mongo_db_name=os.getenv("MONGO_DB_NAME", "course_preference_portal"),
        frontend_base_url=os.getenv(
            "FRONTEND_BASE_URL", "http://localhost:5173"
        ).rstrip("/"),
        cors_origins=_split_csv(
            os.getenv("CORS_ORIGINS", "http://localhost:5173")
        ),
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=_get_int(
            "ACCESS_TOKEN_EXPIRE_MINUTES", 480
        ),
        admin_username=os.getenv("ADMIN_USERNAME", "admin").strip(),
        admin_password=os.getenv("ADMIN_PASSWORD") or None,
        admin_password_hash=os.getenv("ADMIN_PASSWORD_HASH") or None,
        public_token_bytes=max(_get_int("PUBLIC_TOKEN_BYTES", 32), 32),
        mongo_timeout_ms=_get_int("MONGO_TIMEOUT_MS", 3000),
    )
    _validate(settings)
    return settings


settings = get_settings()
