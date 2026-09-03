"""
SQLite-Backed Advisory Store (insurance claims + SMS reminders)
================================================================
Persists parametric-insurance damage claims and spray/field reminders so the
Weather & Crop Risk page survives server restarts.

The database file defaults to ``<backend>/advisory.db`` and can be overridden
with the ``ADVISORY_DB_PATH`` environment variable. One file, two tables.

Each function opens a fresh connection per call (safe for async handlers and
multi-worker deployments). Schema initialization is thread-safe and performed
once per database file.
"""

import json
import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# <backend>/advisory.db unless ADVISORY_DB_PATH is set
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "advisory.db"
DB_PATH = Path(os.getenv("ADVISORY_DB_PATH", str(DEFAULT_DB_PATH)))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS insurance_claims (
    claim_id    TEXT PRIMARY KEY,
    claim_json  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS field_reminders (
    reminder_id  TEXT PRIMARY KEY,
    reminder_json TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_init_lock = threading.Lock()
_initialized_paths = set()


def _resolve(db_path: Optional[Path]) -> Path:
    return Path(db_path) if db_path is not None else DB_PATH


def _ensure_schema(db_path: Path) -> None:
    """Create the tables once per database file (thread-safe)."""
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


# ---------------------------------------------------------------------------
# Insurance claims
# ---------------------------------------------------------------------------

def save_claim(claim_id: str, claim_data: Dict[str, Any], db_path: Optional[Path] = None) -> bool:
    """Insert a new insurance claim. Returns True when inserted (no overwrite)."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "INSERT INTO insurance_claims (claim_id, claim_json) VALUES (?, ?)",
            (claim_id, json.dumps(claim_data, ensure_ascii=False)),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        return False
    finally:
        conn.close()


def list_claims(db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Return stored claims, newest first."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        rows = conn.execute(
            "SELECT claim_id, claim_json FROM insurance_claims ORDER BY rowid DESC"
        ).fetchall()
    finally:
        conn.close()

    claims = []
    for row in rows:
        data = json.loads(row[1])
        data.setdefault("id", row[0])
        claims.append(data)
    return claims


def delete_claim(claim_id: str, db_path: Optional[Path] = None) -> bool:
    """Remove a stored claim. Returns True if a row was deleted."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.execute(
            "DELETE FROM insurance_claims WHERE claim_id = ?", (claim_id,)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Field reminders (SMS / spray reminders)
# ---------------------------------------------------------------------------

def save_reminder(reminder_id: str, reminder_data: Dict[str, Any], db_path: Optional[Path] = None) -> bool:
    """Insert a new field reminder. Returns True when inserted (no overwrite)."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "INSERT INTO field_reminders (reminder_id, reminder_json) VALUES (?, ?)",
            (reminder_id, json.dumps(reminder_data, ensure_ascii=False)),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        return False
    finally:
        conn.close()


def list_reminders(db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Return stored reminders, newest first."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        rows = conn.execute(
            "SELECT reminder_id, reminder_json FROM field_reminders ORDER BY rowid DESC"
        ).fetchall()
    finally:
        conn.close()

    reminders = []
    for row in rows:
        data = json.loads(row[1])
        data.setdefault("id", row[0])
        reminders.append(data)
    return reminders


def delete_reminder(reminder_id: str, db_path: Optional[Path] = None) -> bool:
    """Remove a stored reminder. Returns True if a row was deleted."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.execute(
            "DELETE FROM field_reminders WHERE reminder_id = ?", (reminder_id,)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
