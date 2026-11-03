"""Administrator authentication endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.database import Database
from pymongo.errors import PyMongoError

from ..database import get_database
from ..schemas import AdminInfo, ChangePasswordRequest, LoginRequest, TokenResponse
from ..security import (
    create_access_token,
    get_current_admin,
    password_version,
    set_admin_password,
    stored_credentials,
    verify_admin_credentials,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Database = Depends(get_database)) -> TokenResponse:
    stored = stored_credentials(db)
    if not verify_admin_credentials(payload.username, payload.password, stored):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_in = create_access_token(
        payload.username, version=password_version(stored)
    )
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        username=payload.username,
    )


@router.post("/password", response_model=TokenResponse)
def change_password(
    payload: ChangePasswordRequest,
    username: str = Depends(get_current_admin),
    db: Database = Depends(get_database),
) -> TokenResponse:
    """Replace the administrator password and sign out every other session.

    Returns a fresh token so the session that made the change stays signed in.
    A wrong current password is 400, not 401, so the client does not treat it
    as an expired session.
    """
    stored = stored_credentials(db)
    if not verify_admin_credentials(username, payload.current_password, stored):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current password is incorrect.",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new password must be different from the current one.",
        )
    try:
        updated = set_admin_password(db, payload.new_password)
    except PyMongoError as exc:
        logger.exception("Database error while changing the admin password")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not change the password.",
        ) from exc
    token, expires_in = create_access_token(
        username, version=password_version(updated)
    )
    return TokenResponse(access_token=token, expires_in=expires_in, username=username)


@router.get("/me", response_model=AdminInfo)
def me(username: str = Depends(get_current_admin)) -> AdminInfo:
    return AdminInfo(username=username)
