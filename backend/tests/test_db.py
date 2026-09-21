"""
The database adapter's Postgres translation.

The normal test run uses SQLite, so it never reaches these code paths — they
only run when DATABASE_URL points at Postgres. These pin down the pure pieces
so a regression shows up without a Postgres server. The whole suite also runs
against real Postgres via TEST_DATABASE_URL (see conftest.py).
"""

from app.core import db


def test_placeholders_become_psycopg_style():
    assert db._to_postgres("SELECT x FROM t WHERE a = ? AND b = ?") == (
        "SELECT x FROM t WHERE a = %s AND b = %s"
    )


def test_literal_percent_is_escaped_so_it_is_not_read_as_a_placeholder():
    assert db._to_postgres("SELECT '5%' WHERE a = ?") == "SELECT '5%%' WHERE a = %s"


def test_rowid_ordering_uses_the_explicit_sequence_column():
    assert db._to_postgres("SELECT id FROM t ORDER BY rowid DESC") == (
        "SELECT id FROM t ORDER BY seq DESC"
    )


def test_create_table_gains_a_sequence_column_and_a_utc_timestamp_default():
    sql = db._to_postgres(
        "CREATE TABLE IF NOT EXISTS t (\n"
        "    id TEXT PRIMARY KEY,\n"
        "    created_at TEXT NOT NULL DEFAULT (datetime('now'))\n"
        ")"
    )
    assert "seq BIGSERIAL," in sql
    assert "datetime('now')" not in sql
    assert "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')" in sql


def test_schema_scripts_split_into_single_statements():
    script = "CREATE TABLE a (x TEXT);\nCREATE INDEX IF NOT EXISTS i ON a(x);\n"
    assert db._statements(script) == [
        "CREATE TABLE a (x TEXT)",
        "CREATE INDEX IF NOT EXISTS i ON a(x)",
    ]


def test_provider_specific_url_parameters_are_dropped():
    """libpq refuses to connect when it meets a parameter it does not know."""
    cleaned = db._clean_url(
        "postgresql://u:p@host:6543/postgres?sslmode=require&supa=base-pooler.x"
    )
    assert "sslmode=require" in cleaned
    assert "supa" not in cleaned
    assert cleaned.startswith("postgresql://u:p@host:6543/postgres")


def test_rows_read_by_position_and_by_column_name():
    row = db._Row(("u1", "9876543210"), {"user_id": 0, "phone": 1})
    assert row[0] == "u1"
    assert row["phone"] == "9876543210"
    assert row.keys() == ["user_id", "phone"]


def test_storage_is_reported_as_temporary_on_serverless(monkeypatch):
    """The one condition that silently breaks logging back in."""
    monkeypatch.setattr(db, "USING_POSTGRES", False)

    monkeypatch.delenv("VERCEL", raising=False)
    assert db.storage_info()["persistent"] is True

    monkeypatch.setenv("VERCEL", "1")
    info = db.storage_info()
    assert info["persistent"] is False
    assert "Postgres" in info["note"]


def test_postgres_storage_is_reported_as_persistent(monkeypatch):
    monkeypatch.setattr(db, "USING_POSTGRES", True)
    assert db.storage_info() == {"engine": "postgres", "persistent": True}
