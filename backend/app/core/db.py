"""
Shared database layer
======================
Every store talks to its database through ``connect()`` here, which returns
SQLite by default and Postgres when a database URL is configured.

Why both: SQLite needs no setup, so local development and the test suite use
it. But a serverless deployment (Vercel) has a read-only filesystem apart from
/tmp, and /tmp is wiped whenever the instance is recycled — so a deployed
SQLite database silently loses every account. Connecting a Postgres database
(Neon or Supabase from the Vercel Storage tab) sets DATABASE_URL or
POSTGRES_URL, and the same store code then writes somewhere durable.

The stores are written in SQLite's dialect. On Postgres, ``PgConnection``
rewrites the few constructs that differ, all in ``_to_postgres``:

  - ``?`` placeholders become ``%s``
  - ``rowid`` (SQLite's implicit insertion order) becomes ``seq``, a
    BIGSERIAL column added to every table created here
  - ``datetime('now')`` defaults become the equivalent UTC ``to_char``

Anything else a store needs must be valid in both dialects. In particular,
duplicates are handled with ``INSERT ... ON CONFLICT`` and a row count rather
than by catching a failed insert: on Postgres a failed statement aborts the
whole transaction, which then has to be rolled back before anything else.
"""

import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Union
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Neon, via Vercel, injects DATABASE_URL; Supabase injects POSTGRES_URL.
DATABASE_URL = (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "").strip()
USING_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

# Query parameters libpq understands. Hosting providers append their own
# (Supabase adds `supa=base-pooler.x`), and libpq refuses to connect when it
# meets one it does not recognise.
_LIBPQ_PARAMS = {
    "sslmode", "sslrootcert", "sslcert", "sslkey", "sslnegotiation",
    "channel_binding", "connect_timeout", "application_name", "options",
    "target_session_attrs", "gssencmode", "keepalives", "keepalives_idle",
}

try:  # psycopg is only needed when Postgres is configured.
    import psycopg
except ImportError:  # pragma: no cover - exercised only without psycopg installed
    psycopg = None


# ---------------------------------------------------------------------------
# Postgres dialect translation
# ---------------------------------------------------------------------------

_PLACEHOLDER = re.compile(r"\?")
_ROWID = re.compile(r"\browid\b", re.IGNORECASE)
_NOW_DEFAULT = re.compile(r"datetime\('now'\)", re.IGNORECASE)
_CREATE_TABLE = re.compile(r"(CREATE TABLE IF NOT EXISTS\s+\w+\s*\()", re.IGNORECASE)


def _to_postgres(sql: str) -> str:
    """Rewrite SQLite-dialect SQL for Postgres. See the module docstring."""
    sql = sql.replace("%", "%%")  # psycopg treats a bare % as a placeholder
    sql = _PLACEHOLDER.sub("%s", sql)
    sql = _ROWID.sub("seq", sql)
    sql = _NOW_DEFAULT.sub(
        "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')", sql
    )
    # Postgres has no implicit insertion order, so every table gets an explicit
    # one for the `ORDER BY rowid` queries to sort on.
    sql = _CREATE_TABLE.sub(r"\1\n    seq BIGSERIAL,", sql)
    return sql


def _statements(script: str) -> List[str]:
    """Split a schema script into single statements (no semicolons in strings)."""
    return [part.strip() for part in script.split(";") if part.strip()]


def _clean_url(url: str) -> str:
    """Drop query parameters libpq would reject."""
    parts = urlsplit(url)
    kept = [(k, v) for k, v in parse_qsl(parts.query) if k in _LIBPQ_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


class _Row(tuple):
    """
    A result row readable by position and by column name, like sqlite3.Row,
    so store code reads rows identically whichever database is behind it.
    """

    def __new__(cls, values: Sequence[Any], index: Dict[str, int]):
        row = super().__new__(cls, values)
        row._index = index
        return row

    def __getitem__(self, key: Union[int, slice, str]):
        if isinstance(key, str):
            return tuple.__getitem__(self, self._index[key])
        return tuple.__getitem__(self, key)

    def keys(self) -> List[str]:
        return list(self._index)


def _row_factory(cursor):
    index = {column.name: i for i, column in enumerate(cursor.description or [])}
    return lambda values: _Row(values, index)


class PgConnection:
    """
    The subset of the sqlite3.Connection interface the stores use, backed by
    Postgres. Connections are opened per call, like the SQLite stores do,
    which suits serverless functions that may be frozen between requests.
    """

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params: Iterable[Any] = ()):
        return self._conn.execute(_to_postgres(sql), tuple(params))

    def executescript(self, script: str) -> None:
        for statement in _statements(script):
            self._conn.execute(_to_postgres(statement))

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


def connect(sqlite_path: Union[str, Path]):
    """
    A connection for one store call.

    With a database URL configured this is Postgres and ``sqlite_path`` is
    ignored; otherwise it is the SQLite file at that path.
    """
    if USING_POSTGRES:
        if psycopg is None:
            raise RuntimeError(
                "DATABASE_URL points at Postgres but psycopg is not installed. "
                "Add psycopg[binary] to requirements.txt."
            )
        return PgConnection(
            psycopg.connect(
                _clean_url(DATABASE_URL),
                row_factory=_row_factory,
                # Poolers such as Neon's and Supabase's run in transaction
                # mode, where server-side prepared statements break.
                prepare_threshold=None,
                connect_timeout=10,
            )
        )

    conn = sqlite3.connect(str(sqlite_path))
    conn.row_factory = sqlite3.Row
    return conn


def storage_info() -> Dict[str, Any]:
    """
    What the app is storing data in, and whether it survives a restart.

    SQLite is durable on a normal disk but not on a serverless platform, where
    the only writable path is a /tmp that is wiped when the instance recycles.
    """
    if USING_POSTGRES:
        return {"engine": "postgres", "persistent": True}
    ephemeral = bool(os.getenv("VERCEL"))
    return {
        "engine": "sqlite",
        "persistent": not ephemeral,
        "note": (
            "Serverless storage is temporary: accounts and records are wiped "
            "when the server restarts. Connect a Postgres database to keep them."
            if ephemeral else None
        ),
    }


# ---------------------------------------------------------------------------
# Helpers shared by the stores
# ---------------------------------------------------------------------------

def ensure_column(conn, table: str, column: str, decl: str) -> None:
    """
    Add a column if the table does not already have it.

    SQLite has no ``ADD COLUMN IF NOT EXISTS``, and these databases exist on
    developer machines and demo laptops from before user accounts were added,
    so the stores migrate themselves on open rather than requiring the file to
    be deleted. Postgres tables are always created with the column, but the
    statement is harmless there.
    """
    if isinstance(conn, PgConnection):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {decl}")
        return
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
