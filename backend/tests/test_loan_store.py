"""
Unit Tests — SQLite Loan Application Store
===========================================
Validates that loan applications round-trip through the store, list newest
first, and that duplicate reference ids are rejected (never overwritten).
"""

from app.core import loan_store

SAMPLE_APP = {
    "id": "LN-2026-1234",
    "applicant_name": "Ramesh Kumar",
    "mobile": "9876543210",
    "branch": "State Bank of India — Vidarbha Branch",
    "business_category": "poultry",
    "scheme_name": "Term Loan Scheme",
    "loan_amount": 480000.0,
    "subsidy_amount": 150000.0,
    "status": "Pending",
    "applied_at": "Sep 03, 2026",
}


def test_save_and_get_roundtrip(tmp_path):
    db = tmp_path / "loans.db"
    assert loan_store.save_application("LN-2026-1234", SAMPLE_APP, db_path=db) is True

    loaded = loan_store.get_application("LN-2026-1234", db_path=db)
    assert loaded == SAMPLE_APP
    assert loaded["scheme_name"] == "Term Loan Scheme"


def test_duplicate_id_is_rejected_not_overwritten(tmp_path):
    db = tmp_path / "loans.db"
    changed = dict(SAMPLE_APP, applicant_name="Someone Else")

    assert loan_store.save_application("LN-2026-1234", SAMPLE_APP, db_path=db) is True
    assert loan_store.save_application("LN-2026-1234", changed, db_path=db) is False

    loaded = loan_store.get_application("LN-2026-1234", db_path=db)
    assert loaded["applicant_name"] == "Ramesh Kumar"


def test_list_applications_newest_first(tmp_path):
    db = tmp_path / "loans.db"
    first = dict(SAMPLE_APP, id="LN-2026-1000")
    second = dict(SAMPLE_APP, id="LN-2026-2000")

    loan_store.save_application(first["id"], first, db_path=db)
    loan_store.save_application(second["id"], second, db_path=db)

    apps = loan_store.list_applications(db_path=db)
    assert [a["id"] for a in apps] == ["LN-2026-2000", "LN-2026-1000"]


def test_list_applications_empty_database(tmp_path):
    db = tmp_path / "empty.db"
    assert loan_store.list_applications(db_path=db) == []


def test_legacy_row_without_id_is_hydrated(tmp_path):
    """Rows stored before the id was part of the payload get it from the PK."""
    db = tmp_path / "loans.db"
    legacy = {k: v for k, v in SAMPLE_APP.items() if k != "id"}

    assert loan_store.save_application("LN-2026-7777", legacy, db_path=db) is True

    apps = loan_store.list_applications(db_path=db)
    assert len(apps) == 1
    assert apps[0]["id"] == "LN-2026-7777"
    assert apps[0]["scheme_name"] == "Term Loan Scheme"
