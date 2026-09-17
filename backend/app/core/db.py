"""
Shared SQLite helpers
======================
Small utilities the per-feature stores share. Kept separate so the migration
logic exists once rather than being copied into every store.
"""

import sqlite3
from typing import Any, Dict, List


def ensure_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    """
    Add a column if the table does not already have it.

    SQLite has no ``ADD COLUMN IF NOT EXISTS``, and these databases exist on
    developer machines and demo laptops from before user accounts were added,
    so the stores migrate themselves on open rather than requiring the file to
    be deleted.
    """
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def owned_by(rows: List[Dict[str, Any]], user_id: str) -> List[Dict[str, Any]]:
    """
    Filter already-loaded records down to one owner.

    Rows written before accounts existed have no owner. They stay invisible to
    every account rather than being handed to whoever logs in first.
    """
    return [row for row in rows if row.get("user_id") == user_id]
