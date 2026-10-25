"""Administrator authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..schemas import AdminInfo, LoginRequest, TokenResponse
from ..security import (
    create_access_token,
    get_current_admin,
    verify_admin_credentials,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_in = create_access_token(payload.username)
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        username=payload.username,
    )


@router.get("/me", response_model=AdminInfo)
def me(username: str = Depends(get_current_admin)) -> AdminInfo:
    return AdminInfo(username=username)
