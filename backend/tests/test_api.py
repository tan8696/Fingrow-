"""
API Endpoint Tests
==================
Tests FastAPI routes using TestClient:
  - GET  /api/health
  - GET  /api/categories
  - GET  /api/languages
  - POST /api/calculate (Micro Finance & Term Loan)
  - POST /api/calculate error handling
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_categories():
    response = client.get("/api/categories")
    assert response.status_code == 200
    categories = response.json()["categories"]
    assert "dairy" in categories
    assert "grocery" in categories


def test_get_languages():
    response = client.get("/api/languages")
    assert response.status_code == 200
    languages = response.json()["languages"]
    assert "en" in languages
    assert "hi" in languages


def test_calculate_micro_scheme():
    """₹10,000 margin -> Micro Finance Scheme."""
    response = client.post("/api/calculate", json={"margin_capital": 10000})
    assert response.status_code == 200
    data = response.json()
    assert data["financials"]["project_cost"] == 100000
    assert data["financials"]["loan_amount"] == 90000
    assert data["financials"]["selected_scheme"] == "Micro Finance Scheme"
    assert data["financials"]["interest_rate_pct"] == 6.5
    assert data["financials"]["tenure_months"] == 36
    assert data["financials"]["moratorium_months"] == 3
    assert len(data["amortization"]["schedule"]) == 12


def test_calculate_term_scheme():
    """₹25,000 margin -> Term Loan Scheme."""
    response = client.post("/api/calculate", json={"margin_capital": 25000})
    assert response.status_code == 200
    data = response.json()
    assert data["financials"]["project_cost"] == 250000
    assert data["financials"]["loan_amount"] == 225000
    assert data["financials"]["selected_scheme"] == "Term Loan Scheme"
    assert data["financials"]["interest_rate_pct"] == 8.0
    assert data["financials"]["tenure_months"] == 84
    assert data["financials"]["moratorium_months"] == 6
    assert len(data["amortization"]["schedule"]) == 28


def test_calculate_invalid_margin():
    """Negative margin -> 400 Bad Request."""
    response = client.post("/api/calculate", json={"margin_capital": -1000})
    assert response.status_code == 422  # Pydantic gt=0 validation error


def test_calculate_exceeds_limit():
    """Margin > ₹5,00,000 -> 422 Unprocessable Entity."""
    response = client.post("/api/calculate", json={"margin_capital": 600000})
    assert response.status_code == 422
    assert "exceeds" in response.json()["detail"].lower()


SAMPLE_APPLICATION = {
    "applicant_name": "Ramesh Kumar",
    "mobile": "9876543210",
    "branch": "State Bank of India — Vidarbha Branch",
    "business_category": "poultry",
    "scheme_name": "Term Loan Scheme",
    "loan_amount": 480000.0,
    "subsidy_amount": 150000.0,
}


def test_apply_for_loan(monkeypatch):
    """POST /api/loans/apply persists and returns a generated reference."""
    saved = {}

    def fake_save(app_id, payload):
        saved[app_id] = payload
        return True

    monkeypatch.setattr("app.api.routes.save_application", fake_save)

    response = client.post("/api/loans/apply", json=SAMPLE_APPLICATION)
    assert response.status_code == 200
    data = response.json()
    assert data["id"].startswith("LN-2026-")
    assert len(data["id"].split("-")[-1]) == 4
    assert data["status"] == "Pending"
    assert data["applied_at"]
    assert data["applicant_name"] == "Ramesh Kumar"
    assert data["loan_amount"] == 480000.0
    # The payload must have been handed to the store with its reference id
    assert saved[data["id"]]["id"] == data["id"]


def test_apply_for_loan_invalid_mobile():
    """Invalid mobile number -> 422."""
    bad = dict(SAMPLE_APPLICATION, mobile="98765")
    response = client.post("/api/loans/apply", json=bad)
    assert response.status_code == 422


def test_apply_persists_requested_terms(monkeypatch):
    """Calculator-quoted rate/tenure ride along on the application."""
    saved = {}

    def fake_save(app_id, payload):
        saved[app_id] = payload
        return True

    monkeypatch.setattr("app.api.routes.save_application", fake_save)

    payload = dict(SAMPLE_APPLICATION, annual_rate_pct=6.75, tenure_months=60)
    response = client.post("/api/loans/apply", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["annual_rate_pct"] == 6.75
    assert data["tenure_months"] == 60
    assert saved[data["id"]]["annual_rate_pct"] == 6.75
    assert saved[data["id"]]["tenure_months"] == 60


def test_apply_rejects_unreasonable_terms():
    """Rate > 30% or tenure > 20 years -> 422."""
    bad = dict(SAMPLE_APPLICATION, annual_rate_pct=45)
    response = client.post("/api/loans/apply", json=bad)
    assert response.status_code == 422

    bad = dict(SAMPLE_APPLICATION, tenure_months=300)
    response = client.post("/api/loans/apply", json=bad)
    assert response.status_code == 422


def test_loan_history_merges_stored_applications(monkeypatch):
    """GET /api/loan-history lists submitted applications before demo loans."""
    stored = [
        {
            "id": "LN-2026-4821",
            "applicant_name": "Ramesh Kumar",
            "mobile": "9876543210",
            "branch": "SBI",
            "business_category": "poultry",
            "scheme_name": "Term Loan Scheme",
            "loan_amount": 480000.0,
            "subsidy_amount": 120000.0,
            "status": "Pending",
            "applied_at": "Sep 03, 2026",
        }
    ]
    monkeypatch.setattr("app.api.routes.list_applications", lambda: stored)

    response = client.get("/api/loan-history")
    assert response.status_code == 200
    loans = response.json()["loans"]
    assert len(loans) == 4  # 1 stored + 3 demo loans
    assert loans[0]["id"] == "LN-2026-4821"
    assert loans[0]["status"] == "Pending"
    assert loans[0]["amountLabel"] == "Requested"
    assert loans[0]["statement_available"] is False
    assert loans[0]["source"] == "application"
    assert "Poultry" in loans[0]["name"]
    assert loans[1]["id"] == "LN-2023-8942"  # demo loans still present after


PENDING_APP = {
    "id": "LN-2026-4821",
    "applicant_name": "Ramesh Kumar",
    "mobile": "9876543210",
    "branch": "SBI",
    "business_category": "poultry",
    "scheme_name": "Term Loan Scheme",
    "loan_amount": 480000.0,
    "subsidy_amount": 120000.0,
    "status": "Pending",
    "applied_at": "Sep 03, 2026",
}


def test_approve_unknown_application(monkeypatch):
    monkeypatch.setattr("app.api.routes.get_application", lambda _: None)
    response = client.post("/api/loans/LN-2026-9999/approve", json={})
    assert response.status_code == 404


def test_approve_pending_application(monkeypatch):
    """Approval flips status to Active and adds scheme-default EMI terms."""
    updated = dict(PENDING_APP)

    def fake_get(app_id):
        return dict(PENDING_APP)

    def fake_update(app_id, updates):
        updated.update(updates)
        return dict(updated)

    monkeypatch.setattr("app.api.routes.get_application", fake_get)
    monkeypatch.setattr("app.api.routes.update_application", fake_update)

    response = client.post("/api/loans/LN-2026-4821/approve", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Active"
    assert data["approved_at"]
    assert data["approved_amount"] == 480000.0
    assert data["annual_rate_pct"] == 8.0  # Term Loan Scheme defaults
    assert data["tenure_months"] == 84
    assert round(data["monthly_emi"]) == 7481
    assert data["first_payment_date"]
    assert data["total_interest"] > 0


def test_approve_with_officer_overrides(monkeypatch):
    updated = dict(PENDING_APP)

    def fake_get(app_id):
        return dict(PENDING_APP)

    def fake_update(app_id, updates):
        updated.update(updates)
        return dict(updated)

    monkeypatch.setattr("app.api.routes.get_application", fake_get)
    monkeypatch.setattr("app.api.routes.update_application", fake_update)

    response = client.post(
        "/api/loans/LN-2026-4821/approve",
        json={"approved_amount": 400000, "annual_rate_pct": 7.0, "tenure_months": 60, "officer_note": "Priority sector review"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["approved_amount"] == 400000.0
    assert data["annual_rate_pct"] == 7.0
    assert data["tenure_months"] == 60
    assert data["officer_note"] == "Priority sector review"


def test_approve_uses_calculator_quoted_terms(monkeypatch):
    """When the applicant quoted custom terms, approval defaults to them."""
    from app.core.loan_schedule import compute_monthly_emi

    pending = dict(PENDING_APP, annual_rate_pct=6.75, tenure_months=60)
    updated = dict(pending)

    def fake_get(app_id):
        return dict(pending)

    def fake_update(app_id, updates):
        updated.update(updates)
        return dict(updated)

    monkeypatch.setattr("app.api.routes.get_application", fake_get)
    monkeypatch.setattr("app.api.routes.update_application", fake_update)

    response = client.post("/api/loans/LN-2026-4821/approve", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Active"
    assert data["annual_rate_pct"] == 6.75  # quoted terms, not the 8% scheme default
    assert data["tenure_months"] == 60
    assert data["monthly_emi"] == round(compute_monthly_emi(480000.0, 6.75, 60), 2)

    # An officer override still wins over the quoted terms
    response = client.post(
        "/api/loans/LN-2026-4821/approve",
        json={"annual_rate_pct": 9.0, "tenure_months": 48},
    )
    data = response.json()
    assert data["annual_rate_pct"] == 9.0
    assert data["tenure_months"] == 48


def test_approve_already_active_rejected(monkeypatch):
    active = dict(PENDING_APP, status="Active", monthly_emi=7000.0)

    def fake_get(app_id):
        return dict(active)

    monkeypatch.setattr("app.api.routes.get_application", fake_get)
    response = client.post("/api/loans/LN-2026-4821/approve", json={})
    assert response.status_code == 409


def test_loan_history_maps_active_application(monkeypatch):
    """Approved applications show as Active with EMI info and statements."""
    active = dict(
        PENDING_APP,
        status="Active",
        approved_at="2026-09-10",
        approved_amount=480000.0,
        annual_rate_pct=8.0,
        tenure_months=84,
        monthly_emi=7481.11,
        first_payment_date="2026-10-10",
        total_interest=148000.0,
        total_payable=628000.0,
        schedule=[],
    )
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [active])

    response = client.get("/api/loan-history")
    loans = response.json()["loans"]
    first = loans[0]
    assert first["status"] == "Active"
    assert first["amountLabel"] == "Monthly EMI"
    assert first["amount"] == 7481.11
    assert first["statement_available"] is True
    assert first["dateLabel"] == "Next Repayment"
    assert first["date"] == "Oct 10, 2026"


def test_loan_history_shows_next_due_after_payments(monkeypatch):
    """Once instalments are paid, the history card shows the actual next due date."""
    active = dict(
        ACTIVE_APP,
        payments=[
            {"month": 1, "amount": 162078.0, "paid_on": "2026-09-10"},
        ],
    )
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [active])

    response = client.get("/api/loan-history")
    loans = response.json()["loans"]
    first = loans[0]
    assert first["dateLabel"] == "Next Repayment"
    assert first["date"] == "Nov 10, 2026"
    assert first["months_paid"] == 1


def test_statement_requires_approval(monkeypatch):
    monkeypatch.setattr("app.api.routes.get_application", lambda _: dict(PENDING_APP))
    response = client.get("/api/loans/LN-2026-4821/statement")
    assert response.status_code == 409


def test_statement_download_for_active_loan(monkeypatch):
    active = dict(
        PENDING_APP,
        status="Active",
        approved_amount=480000.0,
        annual_rate_pct=8.0,
        tenure_months=3,
        monthly_emi=162078.0,
        first_payment_date="2026-10-10",
        total_interest=6000.0,
        total_payable=486000.0,
        schedule=[
            {"month": 1, "payment_date": "2026-10-10", "opening_balance": 480000.0,
             "interest": 3200.0, "principal": 158878.0, "total_payment": 162078.0, "closing_balance": 321122.0},
            {"month": 2, "payment_date": "2026-11-10", "opening_balance": 321122.0,
             "interest": 2140.8, "principal": 159937.2, "total_payment": 162078.0, "closing_balance": 161184.8},
            {"month": 3, "payment_date": "2026-12-10", "opening_balance": 161184.8,
             "interest": 1074.6, "principal": 160110.2, "total_payment": 161184.8, "closing_balance": 0.0},
        ],
    )
    monkeypatch.setattr("app.api.routes.get_application", lambda _: dict(active))

    response = client.get("/api/loans/LN-2026-4821/statement")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert "Loan Repayment Statement" in response.text
    assert "Month,Payment Date,Opening Balance" in response.text
    assert "2026-10-10" in response.text


ACTIVE_APP = dict(
    PENDING_APP,
    status="Active",
    approved_at="2026-09-10",
    approved_amount=480000.0,
    annual_rate_pct=8.0,
    tenure_months=3,
    monthly_emi=162078.0,
    first_payment_date="2026-10-10",
    total_interest=6000.0,
    total_payable=486000.0,
    schedule=[
        {"month": 1, "payment_date": "2026-10-10", "opening_balance": 480000.0,
         "interest": 3200.0, "principal": 158878.0, "total_payment": 162078.0, "closing_balance": 321122.0},
        {"month": 2, "payment_date": "2026-11-10", "opening_balance": 321122.0,
         "interest": 2140.8, "principal": 159937.2, "total_payment": 162078.0, "closing_balance": 161184.8},
        {"month": 3, "payment_date": "2026-12-10", "opening_balance": 161184.8,
         "interest": 1074.6, "principal": 160110.2, "total_payment": 161184.8, "closing_balance": 0.0},
    ],
    payments=[],
)


def test_repayment_status_unknown_application(monkeypatch):
    monkeypatch.setattr("app.api.routes.get_application", lambda _: None)
    response = client.get("/api/loans/LN-2026-9999/repayment")
    assert response.status_code == 404


def test_repayment_status_requires_approval(monkeypatch):
    monkeypatch.setattr("app.api.routes.get_application", lambda _: dict(PENDING_APP))
    response = client.get("/api/loans/LN-2026-4821/repayment")
    assert response.status_code == 409


def test_repayment_status_initial_state(monkeypatch):
    monkeypatch.setattr("app.api.routes.get_application", lambda _: dict(ACTIVE_APP))
    response = client.get("/api/loans/LN-2026-4821/repayment")
    assert response.status_code == 200
    data = response.json()
    assert data["months_paid"] == 0
    assert data["months_total"] == 3
    assert data["next_due_month"] == 1
    assert data["next_due_date"] == "2026-10-10"
    assert data["outstanding_principal"] == 480000.0
    assert data["total_paid"] == 0.0
    assert data["fully_paid"] is False
    assert len(data["schedule"]) == 3
    assert all(entry["paid"] is False for entry in data["schedule"])


def test_mark_repayment_paid(monkeypatch):
    updated = dict(ACTIVE_APP)

    def fake_get(app_id):
        return dict(updated)

    def fake_update(app_id, updates):
        updated.update(updates)
        return dict(updated)

    monkeypatch.setattr("app.api.routes.get_application", fake_get)
    monkeypatch.setattr("app.api.routes.update_application", fake_update)

    response = client.post("/api/loans/LN-2026-4821/repayments/1", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["months_paid"] == 1
    assert data["next_due_month"] == 2
    assert data["next_due_date"] == "2026-11-10"
    assert data["total_paid"] == 162078.0
    assert data["outstanding_principal"] == 321122.0
    assert data["schedule"][0]["paid"] is True
    assert data["schedule"][0]["paid_on"]
    assert data["schedule"][1]["paid"] is False

    # Paying out of order is rejected
    response = client.post("/api/loans/LN-2026-4821/repayments/3", json={})
    assert response.status_code == 409

    # Paying the same month again is rejected
    response = client.post("/api/loans/LN-2026-4821/repayments/1", json={})
    assert response.status_code == 409

    # Complete remaining instalments -> fully paid
    client.post("/api/loans/LN-2026-4821/repayments/2", json={})
    response = client.post("/api/loans/LN-2026-4821/repayments/3", json={})
    data = response.json()
    assert data["fully_paid"] is True
    assert data["next_due_month"] is None
    assert data["outstanding_principal"] == 0.0

    # Nothing left to pay
    response = client.post("/api/loans/LN-2026-4821/repayments/4", json={})
    assert response.status_code == 409


def test_repayment_status_reflects_existing_payments(monkeypatch):
    active = dict(ACTIVE_APP, payments=[
        {"month": 1, "paid_on": "2026-10-10", "amount": 162078.0},
        {"month": 2, "paid_on": "2026-11-10", "amount": 162078.0},
    ])
    monkeypatch.setattr("app.api.routes.get_application", lambda _: dict(active))
    response = client.get("/api/loans/LN-2026-4821/repayment")
    data = response.json()
    assert data["months_paid"] == 2
    assert data["next_due_month"] == 3
    assert data["total_paid"] == 324156.0
    assert data["outstanding_principal"] == 161184.8
    assert data["schedule"][1]["paid"] is True
    assert data["schedule"][1]["paid_on"] == "2026-11-10"


def test_loan_history_maps_payment_progress(monkeypatch):
    active = dict(
        ACTIVE_APP,
        payments=[{"month": 1, "paid_on": "2026-10-10", "amount": 162078.0}],
    )
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [active])
    response = client.get("/api/loan-history")
    first = response.json()["loans"][0]
    assert first["months_paid"] == 1
    assert first["outstanding_principal"] == 321122.0
    assert first["status"] == "Active"


# ---------------------------------------------------------------------------
# Dashboard data endpoints (weather, harvest, portfolio, cluster, notifications)
# ---------------------------------------------------------------------------


def test_harvest_round_trip():
    """POST /api/harvest persists to the (temp) store; GET lists it with summary."""
    payload = {
        "produce": "Soybean",
        "quantity_qtl": 12.5,
        "price_per_qtl": 4800.0,
        "notes": "Kharif batch A",
    }
    response = client.post("/api/harvest", json=payload)
    assert response.status_code == 200
    lot = response.json()
    assert lot["id"].startswith("HV-")
    assert lot["revenue"] == 60000.0
    assert lot["harvest_date"]  # defaulted to today

    response = client.get("/api/harvest")
    data = response.json()
    ids = [item["id"] for item in data["lots"]]
    assert lot["id"] in ids
    assert data["summary"]["lots"] >= 1
    assert data["summary"]["total_revenue"] >= 60000.0

    # Clean up so other tests stay deterministic
    response = client.delete(f"/api/harvest/{lot['id']}")
    assert response.status_code == 200


def test_harvest_delete_unknown_returns_404():
    response = client.delete("/api/harvest/HV-2099-9999")
    assert response.status_code == 404


def test_harvest_rejects_bad_input():
    response = client.post("/api/harvest", json={"produce": "X", "quantity_qtl": -5, "price_per_qtl": 100})
    assert response.status_code == 422


def test_portfolio_overview_from_stored_applications(monkeypatch):
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [dict(ACTIVE_APP)])
    response = client.get("/api/portfolio")
    assert response.status_code == 200
    data = response.json()
    assert data["active_loans"] == 1
    assert data["outstanding_total"] == 480000.0
    assert data["monthly_emi_total"] == 162078.0
    assert data["next_due_date"] == "2026-10-10"
    assert data["credit_limit"] == 2500000.0


def test_portfolio_cashflow_from_stored_applications(monkeypatch):
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [dict(ACTIVE_APP)])
    response = client.get("/api/portfolio/cashflow?horizon=6")
    assert response.status_code == 200
    data = response.json()
    assert [m["label"] for m in data["months"]] == ["Oct 26", "Nov 26", "Dec 26"]
    assert data["months"][0]["total_emi"] == 162078.0
    assert len(data["ledger"]) == 3
    assert data["ledger"][0]["rows"][0]["name"] == "Poultry"


def test_weather_endpoint_returns_payload(monkeypatch):
    canned = {
        "location": {"name": "Akola, Vidarbha", "latitude": 20.7, "longitude": 77.0},
        "current": {"temperature_c": 28.0, "condition": {"label": "Partly cloudy", "icon": "partly_cloudy_day"}},
        "daily": [],
        "risk": {"score": 1, "level": "Low", "factors": [], "advisories": []},
    }
    monkeypatch.setattr("app.api.routes.get_weather", lambda location=None, days=5: canned)
    response = client.get("/api/weather?location=Akola")
    assert response.status_code == 200
    data = response.json()
    assert data["location"]["name"] == "Akola, Vidarbha"
    assert data["risk"]["score"] == 1


def test_weather_endpoint_502_when_service_down(monkeypatch):
    from app.core.weather import WeatherUnavailableError

    def boom(location=None, days=5):
        raise WeatherUnavailableError("Weather service unavailable: timeout")

    monkeypatch.setattr("app.api.routes.get_weather", boom)
    response = client.get("/api/weather")
    assert response.status_code == 502
    assert "Weather service" in response.json()["detail"]


def test_cluster_activity_built_from_real_records(monkeypatch):
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [dict(ACTIVE_APP)])
    monkeypatch.setattr("app.api.routes.list_harvests", lambda: [])
    response = client.get("/api/cluster/activity")
    assert response.status_code == 200
    data = response.json()
    assert data["stats"]["active_loans"] == 1
    assert any(e["kind"] == "application" for e in data["events"])
    assert data["members"][0]["name"] == "Ramesh Kumar"


def test_notifications_include_due_emi(monkeypatch):
    from datetime import datetime, timedelta

    due = (datetime.now().date() + timedelta(days=2)).isoformat()
    app = dict(ACTIVE_APP, schedule=[dict(ACTIVE_APP["schedule"][0], payment_date=due)])
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [app])
    monkeypatch.setattr("app.api.routes._cached_weather_notification", lambda: None)

    response = client.get("/api/notifications")
    assert response.status_code == 200
    data = response.json()
    types = [n["type"] for n in data["notifications"]]
    assert "emi" in types


def test_notifications_include_weather_alert(monkeypatch):
    alert = {
        "id": "weather-risk",
        "type": "weather",
        "title": "High crop-risk alert",
        "body": "Rain & heat factors",
        "time": "Live",
        "view": "weather",
    }
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [])
    monkeypatch.setattr("app.api.routes._cached_weather_notification", lambda: alert)

    response = client.get("/api/notifications")
    data = response.json()
    assert any(n["type"] == "weather" for n in data["notifications"])


# ---------------------------------------------------------------------------
# Weather & Crop Risk — insurance policy, claims, reminders, protocol
# ---------------------------------------------------------------------------

_FAKE_DAILY = [
    {"date": "2026-09-10", "weather_code": 1, "precipitation_probability_max": 20.0,
     "precipitation_sum": 0.0, "wind_speed_10m_max": 9.0, "relative_humidity_2m_mean": 58.0,
     "temperature_2m_max": 31.0, "temperature_2m_min": 22.0},
    {"date": "2026-09-11", "weather_code": 3, "precipitation_probability_max": 45.0,
     "precipitation_sum": 3.0, "wind_speed_10m_max": 14.0, "relative_humidity_2m_mean": 66.0,
     "temperature_2m_max": 30.0, "temperature_2m_min": 22.0},
    {"date": "2026-09-12", "weather_code": 61, "precipitation_probability_max": 80.0,
     "precipitation_sum": 12.0, "wind_speed_10m_max": 18.0, "relative_humidity_2m_mean": 74.0,
     "temperature_2m_max": 28.0, "temperature_2m_min": 21.0},
]

_FAKE_WEATHER_PAYLOAD = {
    "fetched_at": "2026-09-10T06:00:00Z",
    "location": {"name": "Akola, Maharashtra", "latitude": 20.7, "longitude": 77.0},
    "current": {"temperature_c": 27, "humidity_pct": 62, "wind_kph": 10,
                "condition": {"label": "Partly cloudy", "icon": "partly_cloudy_day"}},
    "daily": _FAKE_DAILY,
    "risk": {"score": 4, "level": "Moderate", "factors": [], "advisories": []},
}


def _stub_weather(monkeypatch, payload=None):
    def fake_get_weather(location=None, days=5):
        return payload if payload is not None else _FAKE_WEATHER_PAYLOAD
    monkeypatch.setattr("app.api.routes.get_weather", fake_get_weather)


def test_insurance_policy_returns_triggers(monkeypatch):
    _stub_weather(monkeypatch)
    response = client.get("/api/insurance/policy")
    assert response.status_code == 200
    data = response.json()
    assert data["policy"]["sum_insured"] == 850000
    assert len(data["triggers"]) == 3
    assert any(t["key"] == "excess_rain" and t["status"] == "SAFE" for t in data["triggers"])
    assert data["payout_history"][0]["amount"] == 42000
    assert data["weather_error"] is None


def test_insurance_policy_degrades_when_weather_offline(monkeypatch):
    from app.core.weather import WeatherUnavailableError

    def boom(location=None, days=5):
        raise WeatherUnavailableError("Weather service unavailable: timeout")
    monkeypatch.setattr("app.api.routes.get_weather", boom)
    response = client.get("/api/insurance/policy")
    assert response.status_code == 200
    data = response.json()
    assert all(t["status"] == "Offline" for t in data["triggers"])
    assert data["weather_error"]


def test_insurance_claim_roundtrip(monkeypatch):
    _stub_weather(monkeypatch)
    response = client.post("/api/insurance/claims", json={
        "damage_type": "hailstorm", "area_acres": 4.0, "mobile": "9876543210",
        "note": "Hail damage to soybean pods",
    })
    assert response.status_code == 200
    claim = response.json()
    assert claim["id"].startswith("CLM-")
    assert claim["status"] == "Submitted"
    assert claim["estimate_amount"] > 0

    listed = client.get("/api/insurance/policy").json()
    assert any(c["id"] == claim["id"] for c in listed["claims"])

    deleted = client.delete(f"/api/insurance/claims/{claim['id']}")
    assert deleted.status_code == 200


def test_insurance_claim_rejects_unknown_damage_type():
    response = client.post("/api/insurance/claims", json={
        "damage_type": "alien_invasion", "area_acres": 2.0,
    })
    assert response.status_code == 422


def test_reminders_crud():
    created = client.post("/api/reminders", json={
        "kind": "sms", "contact": "9876543210", "target_date": "2026-09-11",
        "time_slot": "06:30 AM – 10:30 AM", "note": "Foliar zinc spray",
    })
    assert created.status_code == 200
    reminder = created.json()
    assert reminder["id"].startswith("RM-")

    listed = client.get("/api/reminders").json()
    assert any(r["id"] == reminder["id"] for r in listed["reminders"])

    deleted = client.delete(f"/api/reminders/{reminder['id']}")
    assert deleted.status_code == 200
    assert client.delete(f"/api/reminders/{reminder['id']}").status_code == 404


def test_weather_protocol_download(monkeypatch):
    _stub_weather(monkeypatch)
    response = client.get("/api/weather/protocol")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]
    body = response.text
    assert "Akola, Maharashtra" in body
    assert "1800-180-1551" in body


def test_weather_protocol_502_when_offline(monkeypatch):
    from app.core.weather import WeatherUnavailableError

    def boom(location=None, days=5):
        raise WeatherUnavailableError("Weather service unavailable: timeout")
    monkeypatch.setattr("app.api.routes.get_weather", boom)
    assert client.get("/api/weather/protocol").status_code == 502


def test_notifications_include_weather_claims(monkeypatch):
    claim = {"id": "CLM-2099", "damage_type": "excess_rain",
             "area_acres": 5.0, "estimate_amount": 37280.70, "status": "Submitted"}
    monkeypatch.setattr("app.api.routes.list_applications", lambda: [])
    monkeypatch.setattr("app.api.routes._cached_weather_notification", lambda: None)
    monkeypatch.setattr("app.api.routes.list_claims", lambda: [claim])

    response = client.get("/api/notifications")
    data = response.json()
    assert any(n["type"] == "claim" and n["title"].startswith("Weather claim CLM-2099") for n in data["notifications"])

