"""Admin authentication and configuration checks (Member 1)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pytest

from app import config
from app.config import ConfigError, get_settings, settings


def _token(secret: str = settings.jwt_secret, **claims) -> str:
    payload = {
        "sub": "admin",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        **claims,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def _me(client, token: str):
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.parametrize("reachable, expected", [(True, "ok"), (False, "unavailable")])
def test_health_reports_database_status(client, monkeypatch, reachable, expected):
    from app import main

    monkeypatch.setattr(main, "database_is_reachable", lambda: reachable)
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": expected}


def test_login_does_not_leak_secrets(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-admin-password"},
    )

    assert response.status_code == 200
    assert "test-admin-password" not in response.text
    assert settings.jwt_secret not in response.text


def test_wrong_username_rejected(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "not-admin", "password": "test-admin-password"},
    )

    assert response.status_code == 401


def test_bcrypt_hash_takes_precedence(monkeypatch):
    from app import security

    hashed = bcrypt.hashpw(b"hashed-pass", bcrypt.gensalt(rounds=4)).decode()
    monkeypatch.setattr(
        security,
        "settings",
        config.Settings(**{**settings.__dict__, "admin_password_hash": hashed}),
    )

    assert security.verify_admin_credentials("admin", "hashed-pass")
    assert not security.verify_admin_credentials("admin", "test-admin-password")
    assert not security.verify_admin_credentials("other", "hashed-pass")


def test_valid_token_accepted(client):
    assert _me(client, _token()).status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        _token(secret="a-different-secret-that-is-long-enough-123"),
        _token(exp=datetime.now(timezone.utc) - timedelta(minutes=1)),
        _token(sub="someone-else"),
        jwt.encode({"sub": "admin"}, settings.jwt_secret, algorithm="HS256"),
    ],
    ids=["malformed", "wrong-secret", "expired", "wrong-subject", "no-expiry"],
)
def test_bad_tokens_rejected(client, token):
    response = _me(client, token)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_token_message(client):
    response = _me(client, _token(exp=datetime.now(timezone.utc) - timedelta(minutes=1)))

    assert response.json() == {"detail": "Authentication token has expired."}


def test_public_routes_do_not_require_admin_token(client):
    secured = {
        path
        for path, operations in client.app.openapi()["paths"].items()
        if path.startswith("/api/public") or path == "/api/health"
        for operation in operations.values()
        if operation.get("security")
    }

    assert secured == set()


@pytest.fixture
def fresh_settings(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "pw")
    monkeypatch.delenv("ADMIN_PASSWORD_HASH", raising=False)
    yield monkeypatch
    get_settings.cache_clear()


def test_valid_config_loads(fresh_settings):
    assert get_settings().jwt_secret == "x" * 32


@pytest.mark.parametrize(
    "secret, message",
    [
        ("", "JWT_SECRET is not set"),
        ("dev-only-insecure-jwt-secret-change-me", "placeholder"),
        ("too-short", "at least 32"),
    ],
)
def test_unsafe_jwt_secret_rejected(fresh_settings, secret, message):
    fresh_settings.setenv("JWT_SECRET", secret)

    with pytest.raises(ConfigError, match=message):
        get_settings()


@pytest.mark.parametrize("value", ["", "   "])
def test_empty_mongo_uri_rejected(fresh_settings, value):
    fresh_settings.setenv("MONGO_URI", value)

    with pytest.raises(ConfigError, match="MONGO_URI is not set"):
        get_settings()


def test_missing_admin_password_rejected(fresh_settings):
    fresh_settings.delenv("ADMIN_PASSWORD")

    with pytest.raises(ConfigError, match="ADMIN_PASSWORD_HASH"):
        get_settings()
