"""
SQLite-Backed Loan Application Store
======================================
Persists loan applications submitted through the app so they appear in
Loan History and survive server restarts.

The database file defaults to ``<backend>/loans.db`` and can be overridden
with the ``LOANS_DB_PATH`` environment variable.

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

# <backend>/loans.db unless LOANS_DB_PATH is set
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "loans.db"
DB_PATH = Path(os.getenv("LOANS_DB_PATH", str(DEFAULT_DB_PATH)))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS loan_applications (
    application_id   TEXT PRIMARY KEY,
    application_json TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_init_lock = threading.Lock()
_initialized_paths = set()


def _resolve(db_path: Optional[Path]) -> Path:
    return Path(db_path) if db_path is not None else DB_PATH


def _ensure_schema(db_path: Path) -> None:
    """Create the table once per database file (thread-safe)."""
    resolved = db_path.resolve()
    if resolved in _initialized_paths:
        return
    with _init_lock:
        if resolved in _initialized_paths:
            return
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute(_SCHEMA)
            conn.commit()
        finally:
            conn.close()
        _initialized_paths.add(resolved)


def save_application(
    application_id: str,
    application_data: Dict[str, Any],
    db_path: Optional[Path] = None,
) -> bool:
    """
    Insert a new loan application. Returns True when inserted.

    Returns False (without overwriting) when the application id already
    exists, so callers can regenerate reference ids on collision.
    """
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "INSERT INTO loan_applications (application_id, application_json) VALUES (?, ?)",
            (application_id, json.dumps(application_data, ensure_ascii=False)),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        return False
    finally:
        conn.close()


def update_application(
    application_id: str,
    updates: Dict[str, Any],
    db_path: Optional[Path] = None,
) -> Optional[Dict[str, Any]]:
    """
    Merge updates into a stored application (e.g. officer approval fields).

    Returns the updated application dict, or None when the id is unknown.
    """
    current = get_application(application_id, db_path=db_path)
    if current is None:
        return None

    current.update(updates)
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "UPDATE loan_applications SET application_json = ? WHERE application_id = ?",
            (json.dumps(current, ensure_ascii=False), application_id),
        )
        conn.commit()
    finally:
        conn.close()
    return current


def get_application(application_id: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """Fetch a single stored application, or None when unknown."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        row = conn.execute(
            "SELECT application_json FROM loan_applications WHERE application_id = ?",
            (application_id,),
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        return None
    return json.loads(row[0])


def list_applications(db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Return all stored applications, newest first."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        rows = conn.execute(
            "SELECT application_id, application_json FROM loan_applications ORDER BY rowid DESC"
        ).fetchall()
    finally:
        conn.close()

    applications = []
    for row in rows:
        data = json.loads(row[1])
        # Heal rows written before the id was included in the payload
        data.setdefault("id", row[0])
        applications.append(data)
    return applications
