"""Tests for the adversarial stress test: grounding, validation, and wiring."""

import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.models import StressTestReport
from app.core import stress
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

VALID_PAYLOAD = {
    "verdict": "reconsider",
    "headline": "Three instalments fall due before this business earns anything.",
    "failure_modes": [
        {
            "risk": "Instalment before first harvest",
            "severity": "high",
            "mechanism": "The quarterly payment falls due in July with no crop income until October.",
            "evidence": "13 principal instalments fall in months with no harvest income",
            "mitigation": "Ask the branch for a 9-month moratorium.",
        }
    ],
    "what_would_have_to_be_true": ["The Rabi crop reaches market by March."],
    "break_even_pressure": "July and January are the tightest months.",
}


class _FakeCompletion:
    def __init__(self, payload):
        self._payload = payload

    class _Choice:
        def __init__(self, content):
            self.message = type("M", (), {"content": content})()

    @property
    def choices(self):
        return [self._Choice(self._payload)]


def _fake_client(payloads):
    """A Groq stand-in that returns each payload in turn."""
    sent = []
    remaining = list(payloads)

    class Client:
        class chat:
            class completions:
                @staticmethod
                def create(messages, **kwargs):
                    sent.append(messages[0]["content"])
                    return _FakeCompletion(remaining.pop(0))

    return Client(), sent


def _stored_report():
    return {
        "display_name": "Akola, Maharashtra",
        "business_category": "vegetables",
        "financials": {
            "project_cost": 500000, "margin_contribution": 50000, "loan_amount": 450000,
            "interest_rate_pct": 8.0, "tenure_months": 84,
        },
        "amortization": {"quarterly_emi": 22364.65, "total_interest_paid": 190000},
        "osm_summary": {
            "competitor_count": 4, "density_level": "Sparse", "radius_km": 5,
            "competitors": [{"name": "Sharma Vegetables"}, {"name": "Akola Sabzi Mandi"}],
        },
        "repayment_alignment": {
            "income_month_names": ["March", "April", "October", "November"],
            "income_months": [3, 4, 10, 11],
            "pattern_note": "Rabi harvest Mar-Apr and Kharif harvest Oct-Nov",
            "at_risk_count": 13,
            "at_risk_amount": 290740,
        },
    }


def test_prompt_carries_the_deterministic_facts(monkeypatch):
    """
    The critique is only worth anything if it is grounded in this proposal's
    figures rather than generic caution about rural lending.
    """
    client, sent = _fake_client([json.dumps(VALID_PAYLOAD)])
    monkeypatch.setattr(stress, "_get_groq_client", lambda: client)

    report = _stored_report()
    stress.generate_stress_test(
        location="Akola", category="vegetables",
        financials=report["financials"], amortization=report["amortization"],
        osm_summary=report["osm_summary"], alignment=report["repayment_alignment"],
        capacity={"assessable": True, "annual_repayment": 89458, "expected_annual_income": 260000,
                  "debt_service_ratio": 0.344, "verdict": "manageable"},
        competitor_names=["Sharma Vegetables"],
    )

    prompt = sent[0]
    assert "13 principal instalments" in prompt
    assert "March, April, October, November" in prompt
    assert "Sharma Vegetables" in prompt
    assert "debt service ratio 0.344" in prompt
    assert "4 (Sparse)" in prompt


def test_unverified_capacity_is_stated_as_unproven(monkeypatch):
    """Silence about repayment capacity would read as approval."""
    client, sent = _fake_client([json.dumps(VALID_PAYLOAD)])
    monkeypatch.setattr(stress, "_get_groq_client", lambda: client)

    stress.generate_stress_test(
        location="Akola", category="dairy",
        financials={"project_cost": 1, "margin_contribution": 1, "loan_amount": 1},
        amortization={}, osm_summary={}, alignment=None, capacity=None,
    )
    assert "has NOT been verified" in sent[0]


def test_invalid_json_is_retried_once_then_raises(monkeypatch):
    client, _ = _fake_client(["not json at all", json.dumps(VALID_PAYLOAD)])
    monkeypatch.setattr(stress, "_get_groq_client", lambda: client)

    result = stress.generate_stress_test(
        location="Akola", category="dairy",
        financials={"project_cost": 1, "margin_contribution": 1, "loan_amount": 1},
        amortization={}, osm_summary={},
    )
    assert result.verdict == "reconsider"

    client, _ = _fake_client(["nope", "still nope"])
    monkeypatch.setattr(stress, "_get_groq_client", lambda: client)
    with pytest.raises(ValueError, match="invalid JSON after 2 attempts"):
        stress.generate_stress_test(
            location="Akola", category="dairy",
            financials={"project_cost": 1, "margin_contribution": 1, "loan_amount": 1},
            amortization={}, osm_summary={},
        )


def test_markdown_fenced_response_is_still_parsed(monkeypatch):
    client, _ = _fake_client(["```json\n" + json.dumps(VALID_PAYLOAD) + "\n```"])
    monkeypatch.setattr(stress, "_get_groq_client", lambda: client)

    result = stress.generate_stress_test(
        location="Akola", category="dairy",
        financials={"project_cost": 1, "margin_contribution": 1, "loan_amount": 1},
        amortization={}, osm_summary={},
    )
    assert result.headline.startswith("Three instalments")


def test_report_rejects_an_unknown_verdict():
    with pytest.raises(ValidationError):
        StressTestReport(**{**VALID_PAYLOAD, "verdict": "looks fine to me"})


def test_report_requires_at_least_one_failure_mode():
    """A stress test that finds nothing wrong has not been run."""
    with pytest.raises(ValidationError):
        StressTestReport(**{**VALID_PAYLOAD, "failure_modes": []})


def test_endpoint_runs_against_the_stored_report(monkeypatch):
    client, sent = _fake_client([json.dumps(VALID_PAYLOAD)])
    monkeypatch.setattr("app.core.stress._get_groq_client", lambda: client)
    api = _authed_client()
    save_session("stress-demo", _stored_report(), user_id=api.user_id)

    body = api.post(
        "/api/stress-test/stress-demo", json={"expected_annual_income": 260000}
    ).json()

    assert body["verdict"] == "reconsider"
    assert body["failure_modes"][0]["severity"] == "high"
    # Grounded in what the crop calendar actually flagged for this report.
    assert "13 principal instalments" in sent[0]


def test_endpoint_404s_on_unknown_session():
    assert _authed_client().post("/api/stress-test/nope", json={}).status_code == 404


def test_endpoint_falls_back_to_rules_when_the_llm_is_unavailable(monkeypatch):
    """
    A missing or unreachable LLM must not fail the stress test. Groq refuses
    some Indian networks outright, which used to take the feature down with a
    500 mid-demo; the rules produce the same shape from the same facts.
    """
    def _no_key():
        raise EnvironmentError("GROQ_API_KEY environment variable is not set.")

    monkeypatch.setattr("app.core.stress._get_groq_client", _no_key)
    api = _authed_client()
    save_session("stress-nokey", _stored_report(), user_id=api.user_id)

    res = api.post("/api/stress-test/stress-nokey", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] in {"proceed", "proceed_with_changes", "reconsider"}
    assert body["failure_modes"]
    # Grounded in the report's own facts, not generic caution.
    assert any("13" in m["mechanism"] for m in body["failure_modes"])