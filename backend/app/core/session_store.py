"""
SQLite-Backed Session Store
============================
Persists generated feasibility reports to a local SQLite database so that
report sessions (and their PDF downloads) survive server restarts.

The database file defaults to ``<backend>/sessions.db`` and can be overridden
with the ``SESSION_DB_PATH`` environment variable (e.g. point it at a mounted
volume in production).

All functions open a fresh connection per call, which keeps this safe to use
from FastAPI's async handlers and from multiple worker processes. A module-level
lock serializes schema initialization.
"""

import json
import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# <backend>/sessions.db unless SESSION_DB_PATH is set
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "sessions.db"
DB_PATH = Path(os.getenv("SESSION_DB_PATH", str(DEFAULT_DB_PATH)))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS report_sessions (
    session_id   TEXT PRIMARY KEY,
    report_json  TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
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


def save_session(session_id: str, report_data: Dict[str, Any], db_path: Optional[Path] = None) -> None:
    """
    Store (or replace) a full report payload for the given session id.

    Args:
        session_id:  UUID of the report session.
        report_data: JSON-serializable dict (e.g. FullReportResponse.model_dump()).
        db_path:     Override the database file (used by tests).
    """
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "INSERT OR REPLACE INTO report_sessions (session_id, report_json) VALUES (?, ?)",
            (session_id, json.dumps(report_data, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()
    logger.debug("Saved report session %s", session_id)


def get_session(session_id: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """
    Fetch a previously stored report payload.

    Returns None when the session id is unknown.
    """
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        row = conn.execute(
            "SELECT report_json FROM report_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        return None
    return json.loads(row[0])


def delete_session(session_id: str, db_path: Optional[Path] = None) -> bool:
    """Remove a stored session. Returns True if a row was deleted."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.execute(
            "DELETE FROM report_sessions WHERE session_id = ?", (session_id,)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
