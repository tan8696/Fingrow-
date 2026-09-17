"""Tests for harvest-aligned repayment scheduling and capacity checks."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.amortization import generate_schedule
from app.core.calculator import calculate_finances
from app.core.crop_calendar import (
    align_schedule,
    income_pattern,
    repayment_capacity,
)
from app.main import app


@pytest.fixture
def schedule_rows():
    scheme = calculate_finances(50_000)
    return generate_schedule(
        scheme.loan_amount, scheme.interest_rate_pct, scheme.tenure_months, scheme.moratorium_months
    ).to_dict()["schedule"]


def test_steady_business_gets_no_harvest_advice(schedule_rows):
    """Dairy earns monthly, so there is no harvest to align instalments to."""
    out = align_schedule(schedule_rows, "dairy", date(2026, 1, 15), 6)

    assert out["steady_income"] is True
    assert out["recommendation"] is None
    assert out["at_risk_count"] == 0


def test_unknown_category_is_treated_as_steady_not_guessed(schedule_rows):
    """Inventing a harvest calendar for an unrecognised trade would be worse than silence."""
    out = align_schedule(schedule_rows, "spaceship_repair", date(2026, 1, 15), 6)

    assert out["steady_income"] is True
    assert out["recommendation"] is None
    assert "No seasonal pattern on record" in out["pattern_note"]


def test_seasonal_business_flags_instalments_in_no_income_months(schedule_rows):
    out = align_schedule(schedule_rows, "vegetables", date(2026, 1, 15), 6)

    assert out["steady_income"] is False
    assert out["at_risk_count"] > 0
    assert out["at_risk_amount"] > 0
    # Every flagged instalment must genuinely fall outside an earning month.
    income = set(out["income_months"])
    for row in out["at_risk_instalments"]:
        assert row["due_month"] not in income
        assert "Moratorium" not in row["payment_type"]


def test_moratorium_instalments_are_not_flagged(schedule_rows):
    """Interest-only payments are small enough to bridge; only principal is at risk."""
    out = align_schedule(schedule_rows, "vegetables", date(2026, 1, 15), 6)
    assert all("Moratorium" not in r["payment_type"] for r in out["at_risk_instalments"])


def test_suggestion_never_shortens_the_scheme_moratorium(schedule_rows):
    """
    The moratorium covers the enterprise's gestation period. Trading it away to
    hit a harvest month would be worse advice than the collision it fixes, so a
    recommendation may only ever extend it.
    """
    for month in range(1, 13):
        out = align_schedule(schedule_rows, "vegetables", date(2026, month, 15), 6)
        rec = out["recommendation"]
        if rec is not None:
            assert rec["suggested_moratorium_months"] > 6, f"month {month} suggested a shorter moratorium"


def test_recommendation_reports_what_it_actually_buys(schedule_rows):
    """Quarterly instalments rarely clear every collision — the advice must not oversell."""
    out = align_schedule(schedule_rows, "vegetables", date(2026, 8, 15), 6)
    rec = out["recommendation"]

    assert rec is not None
    assert rec["at_risk_after"] < rec["at_risk_now"]
    assert str(rec["at_risk_after"]) in rec["reason"]


def test_no_recommendation_when_the_current_schedule_already_aligns(schedule_rows):
    """A January disbursement puts the first EMI in October, an earning month."""
    out = align_schedule(schedule_rows, "vegetables", date(2026, 1, 15), 6)
    assert out["recommendation"] is None


def test_first_instalment_falls_a_quarter_after_disbursement(schedule_rows):
    out = align_schedule(schedule_rows, "vegetables", date(2026, 1, 15), 6)
    first = out["instalments"][0]
    assert first["due_month_name"] == "April"
    assert first["due_year"] == 2026


def test_instalment_placement_rolls_over_the_year_end(schedule_rows):
    out = align_schedule(schedule_rows, "vegetables", date(2026, 11, 20), 6)
    first = out["instalments"][0]
    assert (first["due_month_name"], first["due_year"]) == ("February", 2027)


def test_fertilizer_earns_at_sowing_not_harvest():
    """Input dealers are paid when farmers plant, which is the opposite season."""
    assert income_pattern("fertilizer")["income_months"] == [6, 7, 10, 11]


@pytest.mark.parametrize(
    "income,expected",
    [(1_000_000, "comfortable"), (250_000, "manageable"), (120_000, "strained")],
)
def test_capacity_verdicts_track_the_debt_service_ratio(income, expected):
    assert repayment_capacity(25_000, income, 4)["verdict"] == expected


def test_capacity_is_not_assessable_without_an_income_estimate():
    out = repayment_capacity(25_000, 0, 4)
    assert out["assessable"] is False
    assert "annual_repayment" in out


def test_repayment_plan_endpoint_returns_alignment_and_capacity():
    body = TestClient(app).post("/api/repayment-plan", json={
        "margin_capital": 50_000,
        "business_category": "vegetables",
        "expected_annual_income": 260_000,
        "disbursement_date": "2026-08-15",
    }).json()

    assert body["alignment"]["at_risk_count"] > 0
    assert body["capacity"]["verdict"] == "manageable"
    assert body["financials"]["selected_scheme"]


def test_repayment_plan_rejects_a_malformed_date():
    res = TestClient(app).post("/api/repayment-plan", json={
        "margin_capital": 50_000,
        "business_category": "dairy",
        "disbursement_date": "15-08-2026",
    })
    assert res.status_code == 422
