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
    create_user,
    decode_token,
    get_user,
    issue_token,
    revoke_token,
    update_profile,
    user_from_payload,
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

# The sample-data state this instance last reconciled each account to.
_demo_reconciled: Dict[str, bool] = {}


def reconcile_demo_data(user: Dict[str, Any]) -> None:
    """
    Make this instance's copy of an account's sample data match its token.

    Seeded data is deterministic, so any instance can rebuild it. Without this,
    a serverless instance other than the one that seeded would show an empty
    dashboard to someone who had just loaded the sample portfolio. Checked
    once per account per instance.
    """
    user_id = user["user_id"]
    wanted = bool((user.get("profile") or {}).get("demo_seeded"))
    if not wanted or _demo_reconciled.get(user_id):
        return
    from app.core import demo_seed  # local import: demo_seed imports the stores

    # Restore only, never delete. A client still holding an older token would
    # otherwise wipe data it had just seeded — and the settings page reloads
    # straight after seeding, which would do exactly that.
    if not demo_seed.status(user_id)["has_demo_data"]:
        demo_seed.seed(user_id)
    _demo_reconciled[user_id] = True


def current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Dict[str, Any]:
    """
    Resolve the bearer token to a user, or reject the request.

    Identity comes from the signed token itself rather than a database lookup,
    so it holds whichever serverless instance serves the request.
    """
    payload = decode_token(credentials.credentials if credentials else "")
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = user_from_payload(payload)

    # Where this instance holds the account, its database is the freshest
    # record, so it wins over the token. That keeps a single server — including
    # local development — exact even for a client holding an older token. The
    # token's copy only fills in on a serverless instance that never saw the
    # account.
    stored = get_user(user["user_id"])
    if stored is not None:
        user = {**user, "name": stored["name"], "profile": {**user["profile"], **stored["profile"]}}

    reconcile_demo_data(user)
    return user


def optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[Dict[str, Any]]:
    """Same, but returns None for anonymous callers instead of rejecting."""
    payload = decode_token(credentials.credentials) if credentials else None
    return user_from_payload(payload) if payload else None


def reissue(user: Dict[str, Any], profile_changes: Dict[str, Any], name: Optional[str] = None) -> Dict[str, Any]:
    """
    Apply profile changes and return {user, token}.

    The token is the source of truth for the profile, so every change must come
    back with a fresh one. The local database is updated as well when this
    instance has the account; on a serverless instance that never saw it, that
    write simply finds nothing, and the token still carries the change.
    """
    merged = {
        **user,
        "name": name or user.get("name"),
        "profile": {**(user.get("profile") or {}), **(profile_changes or {})},
    }
    update_profile(user["user_id"], profile_changes or {}, name=name)
    return {"user": merged, "token": issue_token(merged)}


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
    return AuthResponse(token=issue_token(user), user=user)


@router.post("/login", response_model=AuthResponse, summary="Sign in")
async def login(req: LoginRequest) -> AuthResponse:
    try:
        user = authenticate(req.phone, req.password)
    except AuthError as exc:
        # 401 rather than 400: the credentials were understood and refused.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return AuthResponse(token=issue_token(user), user=user)


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
    return reissue(user, req.profile, name=req.name)
