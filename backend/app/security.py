"""Administrator authentication.

There was no pre-existing authentication implementation in the repository, so
this module provides the smallest secure mechanism that fits an MVP: a
single administrator configured through environment variables and short-lived
HMAC-signed bearer tokens. Passwords may be supplied in plaintext through the
environment (for local development) or as a bcrypt hash.

Once the administrator changes the password in the app, its bcrypt hash is
stored in the ``admin_credentials`` collection and replaces the environment
password. Each change bumps a version number that tokens carry (``pv``), so
tokens issued before the change stop working.
"""

from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import PyMongoError

from .config import settings
from .database import get_database
from .utils import utcnow

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _database_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Sign-in is unavailable because the database cannot be reached.",
    )


def stored_credentials(db: Database) -> dict[str, Any] | None:
    """The administrator's password record, once it has been changed in the app.

    Raises HTTP 503 if MongoDB cannot be reached: without the record the
    environment password might be accepted after it was replaced.
    """
    try:
        return db.admin_credentials.find_one({"_id": settings.admin_username})
    except PyMongoError as exc:
        raise _database_unavailable() from exc


def password_version(stored: dict[str, Any] | None) -> int:
    return int((stored or {}).get("version") or 0)


def _check_hash(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def verify_admin_credentials(
    username: str, password: str, stored: dict[str, Any] | None = None
) -> bool:
    """Constant-time comparison of the administrator credentials.

    ``stored`` is the record from :func:`stored_credentials`; its hash, when
    present, replaces the environment password.
    """
    if not isinstance(username, str) or not isinstance(password, str):
        return False
    username_ok = hmac.compare_digest(
        username.encode("utf-8"), settings.admin_username.encode("utf-8")
    )

    # The password is always checked, so a wrong username takes as long as a
    # wrong password and does not reveal which one was incorrect.
    if stored and stored.get("password_hash"):
        password_ok = _check_hash(password, stored["password_hash"])
    elif settings.admin_password_hash:
        password_ok = _check_hash(password, settings.admin_password_hash)
    elif settings.admin_password:
        password_ok = hmac.compare_digest(
            password.encode("utf-8"), settings.admin_password.encode("utf-8")
        )
    else:
        password_ok = False

    return username_ok and password_ok


def set_admin_password(db: Database, new_password: str) -> dict[str, Any]:
    """Store a new password hash, invalidating every existing token."""
    password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())
    return db.admin_credentials.find_one_and_update(
        {"_id": settings.admin_username},
        {
            "$set": {"password_hash": password_hash.decode("ascii"), "changed_at": utcnow()},
            "$inc": {"version": 1},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )


def create_access_token(
    subject: str, expires_minutes: int | None = None, version: int = 0
) -> tuple[str, int]:
    """Create a signed admin token and return it with its lifetime in seconds.

    ``version`` is the password version the token was issued under.
    """
    minutes = expires_minutes or settings.access_token_expire_minutes
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=minutes)
    payload = {
        "sub": subject,
        "role": "admin",
        "pv": version,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    return token, minutes * 60


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Database = Depends(get_database),
) -> str:
    """FastAPI dependency enforcing a valid administrator bearer token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Authentication required.")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
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
    # Tokens from before the last password change no longer count. Tokens
    # issued before passwords could be changed have no "pv" (version 0).
    if payload.get("pv", 0) != password_version(stored_credentials(db)):
        raise _unauthorized("Your password was changed. Please sign in again.")
    return subject
