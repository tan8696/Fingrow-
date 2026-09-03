"""
Unit Tests — SQLite Session Store
==================================
Validates that generated reports round-trip through the SQLite-backed store
and survive new database connections (i.e. server restarts). All tests use a
temporary database file so the development/production store is never touched.
"""

import json

from app.core import session_store

SAMPLE_REPORT = {
    "session_id": "abc-123",
    "location": "Rampur Village, Barabanki, UP",
    "display_name": "Rampur, Barabanki, Uttar Pradesh, India",
    "business_category": "dairy",
    "language": "en",
    "financials": {
        "margin_contribution": 25000.0,
        "project_cost": 250000.0,
        "loan_amount": 225000.0,
        "selected_scheme": "Term Loan Scheme",
        "interest_rate_pct": 8.0,
        "tenure_months": 84,
        "moratorium_months": 6,
    },
    "amortization": {
        "quarterly_emi": 11155.0,
        "total_interest_paid": 74030.0,
        "schedule": [{"quarter": 1, "opening_balance": 225000.0, "closing_balance": 225000.0}],
    },
    "market_intelligence": {"opportunity_analysis": "Strong local demand."},
    "osm_summary": {"competitor_count": 0, "density_level": "None"},
}


def test_save_and_get_roundtrip(tmp_path):
    db = tmp_path / "sessions.db"
    session_store.save_session("abc-123", SAMPLE_REPORT, db_path=db)

    loaded = session_store.get_session("abc-123", db_path=db)
    assert loaded is not None
    assert loaded == SAMPLE_REPORT
    assert loaded["financials"]["loan_amount"] == 225000.0
    assert loaded["market_intelligence"]["opportunity_analysis"] == "Strong local demand."


def test_report_survives_new_connection(tmp_path):
    """Each store call opens a fresh connection; fetching again simulates a server restart."""
    db = tmp_path / "sessions.db"
    session_store.save_session("abc-123", SAMPLE_REPORT, db_path=db)

    # Re-open from a brand-new connection (as a restarted server would)
    loaded = session_store.get_session("abc-123", db_path=db)
    assert loaded == SAMPLE_REPORT

    # The data was actually written to disk, not kept in memory
    assert db.exists()
    assert db.stat().st_size > len(json.dumps(SAMPLE_REPORT, ensure_ascii=False))


def test_get_unknown_session_returns_none(tmp_path):
    db = tmp_path / "sessions.db"
    session_store.save_session("known-id", SAMPLE_REPORT, db_path=db)
    assert session_store.get_session("missing-id", db_path=db) is None


def test_save_replaces_existing_session(tmp_path):
    db = tmp_path / "sessions.db"
    updated = dict(SAMPLE_REPORT, location="Updated Village, Wardha, Maharashtra")

    session_store.save_session("abc-123", SAMPLE_REPORT, db_path=db)
    session_store.save_session("abc-123", updated, db_path=db)

    loaded = session_store.get_session("abc-123", db_path=db)
    assert loaded is not None
    assert loaded["location"] == "Updated Village, Wardha, Maharashtra"


def test_delete_session(tmp_path):
    db = tmp_path / "sessions.db"
    session_store.save_session("abc-123", SAMPLE_REPORT, db_path=db)

    assert session_store.delete_session("abc-123", db_path=db) is True
    assert session_store.get_session("abc-123", db_path=db) is None
    assert session_store.delete_session("abc-123", db_path=db) is False
