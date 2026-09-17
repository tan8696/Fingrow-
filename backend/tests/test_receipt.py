"""Tests for decision receipts: provenance, hashing, and re-derivation."""

import pytest
from fastapi.testclient import TestClient

from app.core import receipt as receipt_mod
from app.core.calculator import calculate_finances
from app.core.receipt import (
    KIND_MODEL,
    KIND_OBSERVATION,
    KIND_RULE,
    build_receipt,
    rules_fingerprint,
    scheme_gate,
    source,
    verify_receipt,
)
from app.core.session_store import save_session
from app.main import app


def _authed_client():
    """A TestClient signed in as a fresh account (every data route needs one)."""
    import uuid

    from app.core.auth import create_token, create_user

    user = create_user(f"9{uuid.uuid4().int % 10**9:09d}", "test-password", "Test User")
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {create_token(user['user_id'])}"})
    c.user_id = user["user_id"]
    return c


def _receipt_for(margin: float):
    scheme = calculate_finances(margin)
    financials = scheme.to_dict()
    return (
        build_receipt(
            inputs={"margin_capital": margin, "location": "Akola", "business_category": "dairy"},
            financials=financials,
            sources=[
                source("financials", KIND_RULE, "deterministic engine", scheme_gate(scheme.project_cost)),
                source("osm_summary", KIND_OBSERVATION, "Overpass", "4 competitors within 5 km"),
                source("market_intelligence", KIND_MODEL, "Groq", "narrative only"),
            ],
        ),
        financials,
    )


def test_hash_is_independent_of_key_order():
    """Two receipts over the same facts must hash identically, or nothing reproduces."""
    scheme = calculate_finances(50_000)
    a = build_receipt({"margin_capital": 50_000, "location": "Akola"}, scheme.to_dict(), [])
    b = build_receipt({"location": "Akola", "margin_capital": 50_000}, scheme.to_dict(), [])
    assert a["receipt_hash"] == b["receipt_hash"]


def test_hash_changes_when_an_input_changes():
    scheme = calculate_finances(50_000)
    a = build_receipt({"margin_capital": 50_000}, scheme.to_dict(), [])
    b = build_receipt({"margin_capital": 50_001}, scheme.to_dict(), [])
    assert a["receipt_hash"] != b["receipt_hash"]


def test_clean_report_verifies():
    rec, financials = _receipt_for(50_000)
    verdict = verify_receipt(rec, financials)
    assert verdict["status"] == "verified"
    assert verdict["rules_changed_since_issue"] is False
    assert verdict["total_interest_recomputed"] > 0


def test_tampered_figure_is_caught_and_named():
    rec, financials = _receipt_for(50_000)
    financials = {**financials, "loan_amount": 1.0}

    verdict = verify_receipt(rec, financials)
    assert verdict["status"] == "mismatch"
    assert "loan_amount" in verdict["differences"]
    assert verdict["differences"]["loan_amount"]["issued"] == 1.0


def test_amended_scheme_rules_are_distinguished_from_a_bad_report(monkeypatch):
    """
    A report issued before a rate change must not be reported as wrong. It was
    correct under the rules in force at the time, and the verdict says so.
    """
    rec, financials = _receipt_for(50_000)

    amended = {**receipt_mod.TERM_LOAN, "interest_rate_pct": 9.5}
    monkeypatch.setattr(receipt_mod, "TERM_LOAN", amended)
    monkeypatch.setattr("app.core.calculator.TERM_LOAN", amended)

    verdict = verify_receipt(rec, financials)
    assert verdict["status"] == "rules_changed"
    assert verdict["rules_changed_since_issue"] is True
    assert "interest_rate_pct" in verdict["differences"]


def test_receipt_without_inputs_is_unverifiable_not_wrong():
    verdict = verify_receipt({"rules_fingerprint": rules_fingerprint()}, {})
    assert verdict["status"] == "unverifiable"


def test_sources_separate_model_narrative_from_rule_derived_figures():
    rec, _ = _receipt_for(50_000)
    by_field = {s["field"]: s for s in rec["sources"]}

    assert by_field["financials"]["kind"] == KIND_RULE
    assert by_field["market_intelligence"]["kind"] == KIND_MODEL
    assert by_field["osm_summary"]["kind"] == KIND_OBSERVATION
    assert "cannot alter any number" in rec["note"]


def test_scheme_gate_states_the_threshold_that_applied():
    assert "Micro Finance Scheme" in scheme_gate(100_000)
    assert "Term Loan Scheme" in scheme_gate(500_000)
    assert "no scheme applies" in scheme_gate(60_000_000)


def test_verify_endpoint_returns_the_verdict_for_a_stored_report():
    rec, financials = _receipt_for(50_000)
    client = _authed_client()
    # The report must belong to the account asking about it.
    save_session("test-receipt-ok", {"financials": financials, "receipt": rec},
                 user_id=client.user_id)

    body = client.get("/api/verify/test-receipt-ok").json()
    assert body["status"] == "verified"
    assert body["short_hash"] == rec["short_hash"]
    assert len(body["sources"]) == 3


def test_verify_endpoint_flags_a_report_issued_before_receipts_existed():
    client = _authed_client()
    save_session("test-receipt-legacy", {"financials": {"loan_amount": 1}},
                 user_id=client.user_id)

    body = client.get("/api/verify/test-receipt-legacy").json()
    assert body["status"] == "unverifiable"
    assert "predates" in body["reason"]


def test_verify_endpoint_404s_on_unknown_session():
    assert _authed_client().get("/api/verify/does-not-exist").status_code == 404


def test_pdf_embeds_the_receipt_reference():
    from app.core.amortization import generate_schedule
    from app.report.pdf import export_pdf

    rec, financials = _receipt_for(50_000)
    scheme = calculate_finances(50_000)
    schedule = generate_schedule(
        scheme.loan_amount, scheme.interest_rate_pct, scheme.tenure_months, scheme.moratorium_months
    )

    pdf = export_pdf({
        "session_id": "test-receipt-ok",
        "display_name": "Akola, Maharashtra",
        "business_category": "dairy",
        "financials": financials,
        "amortization": schedule.to_dict(),
        "market_intelligence": {},
        "osm_summary": {},
        "receipt": rec,
    })
    assert pdf[:4] == b"%PDF"
    # A receipt-less report must still render, so the section is conditional.
    bare = export_pdf({
        "display_name": "Akola",
        "business_category": "dairy",
        "financials": financials,
        "amortization": schedule.to_dict(),
        "market_intelligence": {},
        "osm_summary": {},
    })
    assert bare[:4] == b"%PDF"
    assert len(pdf) > len(bare), "receipt section should add content to the PDF"
