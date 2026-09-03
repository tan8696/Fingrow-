"""
SQLite-Backed Harvest Log Store
=================================
Persists harvest lot entries logged by the farmer (produce, quantity,
price realized, date) so dashboard revenue figures survive restarts.

The database file defaults to ``<backend>/harvest.db`` and can be overridden
with the ``HARVEST_DB_PATH`` environment variable.

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

# <backend>/harvest.db unless HARVEST_DB_PATH is set
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "harvest.db"
DB_PATH = Path(os.getenv("HARVEST_DB_PATH", str(DEFAULT_DB_PATH)))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS harvest_logs (
    harvest_id   TEXT PRIMARY KEY,
    harvest_json TEXT NOT NULL,
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


def save_harvest(
    harvest_id: str,
    harvest_data: Dict[str, Any],
    db_path: Optional[Path] = None,
) -> bool:
    """
    Insert a new harvest lot. Returns True when inserted.

    Returns False (without overwriting) when the id already exists, so callers
    can regenerate reference ids on collision.
    """
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "INSERT INTO harvest_logs (harvest_id, harvest_json) VALUES (?, ?)",
            (harvest_id, json.dumps(harvest_data, ensure_ascii=False)),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_harvest(harvest_id: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """Fetch a single harvest lot, or None when unknown."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        row = conn.execute(
            "SELECT harvest_json FROM harvest_logs WHERE harvest_id = ?", (harvest_id,)
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        return None
    return json.loads(row[0])


def list_harvests(db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Return all harvest lots, newest first."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        rows = conn.execute(
            "SELECT harvest_id, harvest_json FROM harvest_logs ORDER BY rowid DESC"
        ).fetchall()
    finally:
        conn.close()

    harvests = []
    for row in rows:
        data = json.loads(row[1])
        # Heal rows written before the id was included in the payload
        data.setdefault("id", row[0])
        harvests.append(data)
    return harvests


def delete_harvest(harvest_id: str, db_path: Optional[Path] = None) -> bool:
    """Remove a stored harvest lot. Returns True if a row was deleted."""
    path = _resolve(db_path)
    _ensure_schema(path)
    conn = sqlite3.connect(str(path))
    try:
        cur = conn.execute(
            "DELETE FROM harvest_logs WHERE harvest_id = ?", (harvest_id,)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def harvest_summary(harvests: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate stored harvest lots into dashboard-ready figures.

    Returns lot count, total revenue, total quantity, weighted average price,
    and a month-by-month revenue/quantity breakdown (newest first).
    """
    by_month: Dict[str, Dict[str, float]] = {}
    total_quantity = 0.0
    total_revenue = 0.0

    for lot in harvests:
        quantity = float(lot.get("quantity_qtl") or 0.0)
        price = float(lot.get("price_per_qtl") or 0.0)
        revenue = round(quantity * price, 2)
        total_quantity += quantity
        total_revenue += revenue

        month = (lot.get("harvest_date") or "")[:7]
        bucket = by_month.setdefault(month, {"revenue": 0.0, "quantity_qtl": 0.0})
        bucket["revenue"] = round(bucket["revenue"] + revenue, 2)
        bucket["quantity_qtl"] = round(bucket["quantity_qtl"] + quantity, 2)

    months = [
        {"month": key, "revenue": round(val["revenue"], 2), "quantity_qtl": round(val["quantity_qtl"], 2)}
        for key, val in sorted(by_month.items(), reverse=True)
    ]

    return {
        "lots": len(harvests),
        "total_quantity_qtl": round(total_quantity, 2),
        "total_revenue": round(total_revenue, 2),
        "avg_price_per_qtl": round(total_revenue / total_quantity, 2) if total_quantity else 0.0,
        "by_month": months,
    }
