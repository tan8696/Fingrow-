"""
Unit Tests — Loan Repayment Schedule
=====================================
Validates the monthly EMI math, balance continuity, zero final balance, and
the CSV statement rendering for approved loans.
"""

from datetime import date

from app.core.loan_schedule import (
    build_monthly_schedule,
    compute_monthly_emi,
    default_scheme_terms,
    schedule_to_csv,
)


def test_known_emi_amount():
    """₹4,80,000 @ 8% p.a. for 84 months -> ~₹7,481/month (matches report page)."""
    emi = compute_monthly_emi(480000, 8.0, 84)
    assert round(emi) == 7481


def test_micro_finance_emi():
    """₹90,000 @ 6.5% p.a. for 36 months -> ~₹2,758/month."""
    emi = compute_monthly_emi(90000, 6.5, 36)
    assert round(emi) == 2758


def test_schedule_balances_and_totals():
    result = build_monthly_schedule(480000, 8.0, 84)
    entries = result["schedule"]
    assert len(entries) == 84
    assert result["monthly_emi"] == round(compute_monthly_emi(480000, 8.0, 84), 2)

    total_principal = 0.0
    prev_closing = 480000.0
    for entry in entries:
        assert entry["opening_balance"] == round(prev_closing, 2)
        total_principal += entry["principal"]
        prev_closing = entry["closing_balance"]

    assert round(total_principal) == 480000  # principal fully repaid
    assert entries[-1]["closing_balance"] == 0.0  # ends at zero
    assert entries[-1]["principal"] == entries[-1]["opening_balance"]  # final clearing


def test_schedule_totals_match_sum_of_payments():
    result = build_monthly_schedule(100000, 10.0, 24)
    paid = sum(e["total_payment"] for e in result["schedule"])
    assert round(paid, 2) == round(result["total_payable"], 2)
    assert round(result["total_payable"] - result["approved_amount"], 2) == round(
        result["total_interest"], 2
    )


def test_zero_rate_schedule():
    result = build_monthly_schedule(120000, 0.0, 12)
    assert result["monthly_emi"] == 10000.0
    assert result["total_interest"] == 0.0
    assert result["schedule"][-1]["closing_balance"] == 0.0


def test_scheme_terms_lookup():
    rate, tenure = default_scheme_terms("Micro Finance Scheme")
    assert (rate, tenure) == (6.5, 36)
    rate, tenure = default_scheme_terms("Term Loan Scheme")
    assert (rate, tenure) == (8.0, 84)
    # Unknown schemes fall back to Term Loan norms
    assert default_scheme_terms("Custom Rural Scheme") == (8.0, 84)


def test_csv_statement_render():
    result = build_monthly_schedule(480000, 8.0, 6, start_date=date(2026, 9, 3))
    csv_text = schedule_to_csv(result)

    assert csv_text.startswith("\uFEFF")
    assert "Loan Repayment Statement" in csv_text
    assert "Monthly EMI (INR)" in csv_text
    assert "Month,Payment Date,Opening Balance" in csv_text
    assert len(csv_text.splitlines()) == 16  # 8 summary + blank + header + 6 months

    # First payment date advances one month past the approval date
    assert result["first_payment_date"] == "2026-10-03"
