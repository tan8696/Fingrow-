"""
Authentication endpoints and the dependency every scoped route uses.

``current_user`` is the single gate: any route that touches stored data takes
it, so there is no path to a borrower's records that does not first resolve a
session token to a user.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.core.auth import (
    AuthError,
    authenticate,
    create_token,
    create_user,
    get_user,
    resolve_token,
    revoke_token,
    update_profile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Accounts"])

# auto_error=False so optional_user can fall through to None instead of 401.
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    phone: str = Field(..., description="10-digit Indian mobile number")
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1, max_length=100)
    profile: Optional[Dict[str, Any]] = Field(
        None, description="Optional onboarding data (role, language, village, avatar)."
    )


class LoginRequest(BaseModel):
    phone: str
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    profile: Dict[str, Any] = Field(default_factory=dict)


class AuthResponse(BaseModel):
    token: str
    user: Dict[str, Any]


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Dict[str, Any]:
    """Resolve the bearer token to a user, or reject the request."""
    token = credentials.credentials if credentials else ""
    user_id = resolve_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_user(user_id)
    if user is None:
        # Token outlived the account it belonged to.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[Dict[str, Any]]:
    """Same, but returns None for anonymous callers instead of rejecting."""
    if not credentials:
        return None
    user_id = resolve_token(credentials.credentials)
    return get_user(user_id) if user_id else None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED,
             summary="Create an account")
async def signup(req: SignupRequest) -> AuthResponse:
    try:
        user = create_user(req.phone, req.password, req.name, req.profile)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return AuthResponse(token=create_token(user["user_id"]), user=user)


@router.post("/login", response_model=AuthResponse, summary="Sign in")
async def login(req: LoginRequest) -> AuthResponse:
    try:
        user = authenticate(req.phone, req.password)
    except AuthError as exc:
        # 401 rather than 400: the credentials were understood and refused.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return AuthResponse(token=create_token(user["user_id"]), user=user)


@router.post("/logout", summary="Revoke the current session")
async def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Idempotent: logging out an already-dead session is still a success."""
    revoked = revoke_token(credentials.credentials) if credentials else False
    return {"status": "signed_out", "session_revoked": revoked}


@router.get("/me", summary="The signed-in account")
async def me(user: Dict[str, Any] = Depends(current_user)) -> dict:
    return {"user": user}


@router.patch("/profile", summary="Update name or profile details")
async def patch_profile(
    req: ProfileUpdate,
    user: Dict[str, Any] = Depends(current_user),
) -> dict:
    updated = update_profile(user["user_id"], req.profile, name=req.name)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    return {"user": updated}
