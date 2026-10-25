"""Administrator authentication.

There was no pre-existing authentication implementation in the repository, so
this module provides the smallest secure mechanism that fits an MVP: a
single administrator configured through environment variables and short-lived
HMAC-signed bearer tokens. Passwords may be supplied in plaintext through the
environment (for local development) or as a bcrypt hash.
"""

from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_admin_credentials(username: str, password: str) -> bool:
    """Constant-time comparison of the configured administrator credentials."""
    if not isinstance(username, str) or not isinstance(password, str):
        return False
    if not hmac.compare_digest(
        username.encode("utf-8"), settings.admin_username.encode("utf-8")
    ):
        return False

    if settings.admin_password_hash:
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                settings.admin_password_hash.encode("utf-8"),
            )
        except (ValueError, TypeError):
            return False

    if not settings.admin_password:
        return False
    return hmac.compare_digest(
        password.encode("utf-8"), settings.admin_password.encode("utf-8")
    )


def create_access_token(
    subject: str, expires_minutes: int | None = None
) -> tuple[str, int]:
    """Create a signed admin token and return it with its lifetime in seconds."""
    minutes = expires_minutes or settings.access_token_expire_minutes
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=minutes)
    payload = {
        "sub": subject,
        "role": "admin",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    return token, minutes * 60


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """FastAPI dependency enforcing a valid administrator bearer token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Authentication required.")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Authentication token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized() from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthorized()
    if not hmac.compare_digest(
        subject.encode("utf-8"), settings.admin_username.encode("utf-8")
    ):
        raise _unauthorized()
    return subject
