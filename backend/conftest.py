# Required for pytest to find backend/app modules.
#
# Point the SQLite stores at a throwaway temp directory BEFORE any app module
# is imported, so tests never create databases inside the repository.
import os
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="fingrow-tests-")

# Never let the suite write to a real database. A developer with DATABASE_URL
# exported for a deployment would otherwise run every test against it. The
# suite uses throwaway SQLite files unless Postgres is asked for explicitly via
# TEST_DATABASE_URL, which should point at a disposable database.
for _var in ("DATABASE_URL", "POSTGRES_URL"):
    os.environ.pop(_var, None)
if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("SESSION_DB_PATH", os.path.join(_TEST_DATA_DIR, "sessions.db"))
os.environ.setdefault("LOANS_DB_PATH", os.path.join(_TEST_DATA_DIR, "loans.db"))
os.environ.setdefault("HARVEST_DB_PATH", os.path.join(_TEST_DATA_DIR, "harvest.db"))
os.environ.setdefault("ADVISORY_DB_PATH", os.path.join(_TEST_DATA_DIR, "advisory.db"))
os.environ.setdefault("USERS_DB_PATH", os.path.join(_TEST_DATA_DIR, "users.db"))

import uuid

import pytest


@pytest.fixture
def account():
    """A freshly registered account: {user_id, phone, token, headers}."""
    from app.core.auth import create_token, create_user

    phone = f"9{uuid.uuid4().int % 10**9:09d}"
    user = create_user(phone, "test-password", "Test Farmer")
    token = create_token(user["user_id"])
    return {
        "user_id": user["user_id"],
        "phone": phone,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture
def client(account):
    """
    A TestClient that is signed in as `account`.

    Every data route requires a session, so tests use this rather than a bare
    TestClient. Use `anon_client` to exercise the unauthenticated case.
    """
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    c.headers.update(account["headers"])
    return c


@pytest.fixture
def anon_client():
    """A TestClient with no session, for checking routes actually reject."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def other_account():
    """A second account, for proving one user cannot read another's data."""
    from app.core.auth import create_token, create_user

    phone = f"8{uuid.uuid4().int % 10**9:09d}"
    user = create_user(phone, "test-password", "Other Farmer")
    token = create_token(user["user_id"])
    return {
        "user_id": user["user_id"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


# ---------------------------------------------------------------------------
# Postgres mode (opt-in via TEST_DATABASE_URL, which must be disposable)
# ---------------------------------------------------------------------------
# SQLite gives each test its own throwaway files. Postgres is one shared
# database, so wipe the app's tables once per run and the per-user data tables
# before every test. Accounts are kept between tests: some modules create a
# signed-in user at import time, and every test user has a unique phone.

_PG_DATA_TABLES = (
    "loan_applications", "harvest_logs", "report_sessions",
    "insurance_claims", "field_reminders",
)

if os.getenv("TEST_DATABASE_URL"):
    import psycopg as _psycopg

    with _psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as _conn:
        for _table in _PG_DATA_TABLES + ("users", "sessions"):
            _conn.execute(f"DROP TABLE IF EXISTS {_table}")

    @pytest.fixture(autouse=True)
    def _clean_postgres_data():
        with _psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as conn:
            existing = {
                row[0] for row in conn.execute(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                )
            }
            for table in _PG_DATA_TABLES:
                if table in existing:
                    conn.execute(f"TRUNCATE {table}")
        yield
