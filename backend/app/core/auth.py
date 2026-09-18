"""
Accounts & Sessions
====================
Real user accounts, so that one person's loans, harvests and reports are not
visible to everyone else who opens the app.

Design notes:

  - Passwords are hashed with ``hashlib.scrypt`` (stdlib, memory-hard). Each
    user gets a fresh 16-byte salt, stored alongside the hash. Verification is
    a constant-time compare.
  - Sessions are opaque random tokens rather than JWTs. They need no extra
    dependency, and unlike a JWT they can be revoked server-side on logout.
    Only the SHA-256 of a token is stored, so a copy of the database does not
    hand an attacker a set of live sessions.
  - Login does not reveal whether an account exists: a wrong password and an
    unknown phone number return the same failure.

The store follows the same per-call-connection SQLite pattern as the other
stores in this package.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "users.db"
DB_PATH = Path(os.getenv("USERS_DB_PATH", str(DEFAULT_DB_PATH)))

SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))

# scrypt cost parameters. n=2**14 keeps a single hash around ~50ms, which is
# slow enough to make offline guessing expensive and fast enough for a login.
_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 32

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    phone         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    profile_json  TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""

_init_lock = threading.Lock()
_initialized_paths = set()


class AuthError(Exception):
    """Raised for any credential problem the caller may surface to the user."""


def _resolve(db_path: Optional[Path]) -> Path:
    return Path(db_path) if db_path is not None else DB_PATH


def _ensure_schema(db_path: Path) -> None:
    resolved = db_path.resolve()
    if resolved in _initialized_paths:
        return
    with _init_lock:
        if resolved in _initialized_paths:
            return
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        try:
            conn.executescript(_SCHEMA)
            conn.commit()
        finally:
            conn.close()
        _initialized_paths.add(resolved)


def _connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a password as ``scrypt$<salt hex>$<key hex>``."""
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(
        password.encode("utf-8"), salt=salt,
        n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_KEY_LEN,
    )
    return f"scrypt${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a password against a stored hash."""
    try:
        scheme, salt_hex, key_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = bytes.fromhex(key_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=bytes.fromhex(salt_hex),
            n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=len(expected),
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(expected, actual)


def _normalise_phone(phone: str) -> str:
    """Strip formatting so '+91 98765 43210' and '9876543210' are one account."""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    return digits[-10:] if len(digits) > 10 else digits


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def _row_to_user(row: sqlite3.Row) -> Dict[str, Any]:
    """Public shape of a user — never includes the password hash."""
    return {
        "user_id": row["user_id"],
        "phone": row["phone"],
        "name": row["name"],
        "profile": json.loads(row["profile_json"] or "{}"),
        "created_at": row["created_at"],
    }


def create_user(
    phone: str,
    password: str,
    name: str,
    profile: Optional[Dict[str, Any]] = None,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Register an account. Raises AuthError when the phone is already taken or
    the inputs fail the minimum requirements.
    """
    normalised = _normalise_phone(phone)
    if len(normalised) != 10:
        raise AuthError("Enter a 10-digit mobile number.")
    if len(password) < 6:
        raise AuthError("Password must be at least 6 characters.")
    if not str(name).strip():
        raise AuthError("Name is required.")

    user_id = str(uuid.uuid4())
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO users (user_id, phone, name, password_hash, profile_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                user_id, normalised, str(name).strip(), hash_password(password),
                json.dumps(profile or {}, ensure_ascii=False),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise AuthError("An account with this mobile number already exists.")
    finally:
        conn.close()

    logger.info("Registered account %s", user_id)
    return _row_to_user(row)


def authenticate(phone: str, password: str, db_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Verify credentials and return the user.

    Raises AuthError with the same message whether the account is unknown or
    the password is wrong, so the response cannot be used to discover which
    mobile numbers are registered.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE phone = ?", (_normalise_phone(phone),)
        ).fetchone()
    finally:
        conn.close()

    if row is None or not verify_password(password, row["password_hash"]):
        raise AuthError("Mobile number or password is incorrect.")
    return _row_to_user(row)


def get_user(user_id: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    conn = _connect(db_path)
    try:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
    return _row_to_user(row) if row else None


def update_profile(
    user_id: str,
    profile: Dict[str, Any],
    name: Optional[str] = None,
    db_path: Optional[Path] = None,
) -> Optional[Dict[str, Any]]:
    """Merge into the stored profile blob (language, role, avatar, KYC flag)."""
    current = get_user(user_id, db_path=db_path)
    if current is None:
        return None

    merged = {**current["profile"], **(profile or {})}
    conn = _connect(db_path)
    try:
        conn.execute(
            "UPDATE users SET profile_json = ?, name = COALESCE(?, name) WHERE user_id = ?",
            (json.dumps(merged, ensure_ascii=False), name, user_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_user(user_id, db_path=db_path)


# ---------------------------------------------------------------------------
# Sessions — signed, self-contained tokens
# ---------------------------------------------------------------------------
#
# Tokens used to be random strings looked up in the sessions table. On Vercel
# every function instance has its own /tmp database, so a token issued by one
# instance was unknown to the next and people were signed out mid-session.
#
# A token is now `payload.signature`: the payload carries the account's
# identity and profile, and the HMAC proves it was issued here. Any instance
# can verify it without a lookup.
#
# Revocation is per-process (a denylist in memory). On a single server that is
# exact; on serverless a logged-out token may still verify on another instance
# until it expires. The client discards it on logout either way.

_revoked: set = set()

# Profile fields small enough to ride in every request header. Anything else —
# notably a base64 profile photo — stays out, or the header would carry the
# whole image and exceed server limits.
TOKEN_PROFILE_KEYS = {
    "type", "language", "kycVerified", "gender", "socialCategory",
    "district", "demo_seeded", "insurance_policy",
}


def _secret() -> bytes:
    """
    The signing key. SESSION_SECRET should be set in production.

    Without it, the key is derived from values that are identical across every
    instance of one Vercel deployment, so tokens verify on any of them. It
    changes on each redeploy, which signs everyone out — acceptable, since a
    redeploy also starts every instance with an empty database.
    """
    explicit = os.getenv("SESSION_SECRET", "").strip()
    if explicit:
        return explicit.encode("utf-8")
    parts = [os.getenv(name, "") for name in ("VERCEL_DEPLOYMENT_ID", "VERCEL_GIT_COMMIT_SHA", "VERCEL_URL")]
    return hashlib.sha256(("|".join(parts) + "|fingrow-session-key").encode("utf-8")).digest()


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _sign(body: str) -> str:
    return _b64encode(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())


def issue_token(user: Dict[str, Any]) -> str:
    """A signed token carrying this account's identity and small profile fields."""
    now = int(datetime.now(timezone.utc).timestamp())
    profile = {k: v for k, v in (user.get("profile") or {}).items() if k in TOKEN_PROFILE_KEYS}
    payload = {
        "sub": user["user_id"],
        "phone": user.get("phone"),
        "name": user.get("name"),
        "profile": profile,
        "created_at": user.get("created_at"),
        "iat": now,
        "exp": now + SESSION_TTL_DAYS * 86400,
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """The verified payload, or None if the token is forged, expired or revoked."""
    if not token or token.count(".") != 1:
        return None
    body, signature = token.split(".")
    if not hmac.compare_digest(signature, _sign(body)):
        return None
    try:
        payload = json.loads(_b64decode(body))
    except (ValueError, UnicodeDecodeError):
        return None
    if int(payload.get("exp") or 0) <= int(datetime.now(timezone.utc).timestamp()):
        return None
    if _token_hash(token) in _revoked:
        return None
    return payload


def user_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """The same public user shape get_user returns, built from a token alone."""
    return {
        "user_id": payload["sub"],
        "phone": payload.get("phone"),
        "name": payload.get("name"),
        "profile": payload.get("profile") or {},
        "created_at": payload.get("created_at"),
    }


def create_token(user_id: str, db_path: Optional[Path] = None) -> str:
    """Issue a token for an account known to this instance."""
    user = get_user(user_id, db_path=db_path)
    if user is None:
        raise AuthError("Unknown account.")
    return issue_token(user)


def resolve_token(token: str, db_path: Optional[Path] = None) -> Optional[str]:
    """The user_id behind a valid token, or None."""
    payload = decode_token(token)
    return payload["sub"] if payload else None


def revoke_token(token: str, db_path: Optional[Path] = None) -> bool:
    """Log out one session. Returns True when a live token was revoked."""
    if decode_token(token) is None:
        return False
    _revoked.add(_token_hash(token))
    return True


def count_users(db_path: Optional[Path] = None) -> int:
    conn = _connect(db_path)
    try:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    finally:
        conn.close()
