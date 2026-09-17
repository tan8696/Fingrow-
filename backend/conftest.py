# Required for pytest to find backend/app modules.
#
# Point the SQLite stores at a throwaway temp directory BEFORE any app module
# is imported, so tests never create databases inside the repository.
import os
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="fingrow-tests-")
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
