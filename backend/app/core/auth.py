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
# Sessions
# ---------------------------------------------------------------------------

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_token(user_id: str, db_path: Optional[Path] = None) -> str:
    """Issue a session token. Only its hash is stored."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_token_hash(token), user_id, expires.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def resolve_token(token: str, db_path: Optional[Path] = None) -> Optional[str]:
    """The user_id behind a token, or None when it is unknown or expired."""
    if not token:
        return None
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
            (_token_hash(token),),
        ).fetchone()
        if row is None:
            return None
        try:
            expires = datetime.fromisoformat(row["expires_at"])
        except ValueError:
            return None
        if expires <= datetime.now(timezone.utc):
            # Clear it out rather than leaving dead rows behind.
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
            conn.commit()
            return None
        return row["user_id"]
    finally:
        conn.close()


def revoke_token(token: str, db_path: Optional[Path] = None) -> bool:
    """Log out one session. Returns True when a session was actually removed."""
    conn = _connect(db_path)
    try:
        cur = conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def count_users(db_path: Optional[Path] = None) -> int:
    conn = _connect(db_path)
    try:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    finally:
        conn.close()
