"""
Loan Repayment Schedule Generator
==================================
Builds the standard monthly reducing-balance EMI schedule used for approved
loan applications (and their downloadable statements).

Parameters default to the applicable government scheme's terms (see
calculator.py constants) but can be overridden by the approving officer.
The EMI math mirrors the front-end feasibility calculator so displayed
monthly repayments are consistent across the product.
"""

import calendar
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

from app.core.calculator import MICRO_FINANCE, TERM_LOAN

# Label -> (default interest rate % p.a., default tenure in months)
SCHEME_TERMS: Dict[str, Tuple[float, int]] = {
    MICRO_FINANCE["label"]: (MICRO_FINANCE["interest_rate_pct"], MICRO_FINANCE["tenure_months"]),
    TERM_LOAN["label"]: (TERM_LOAN["interest_rate_pct"], TERM_LOAN["tenure_months"]),
}

# Officer may approve a scheme we don't know — fall back to Term Loan norms
_FALLBACK_TERMS = (TERM_LOAN["interest_rate_pct"], TERM_LOAN["tenure_months"])


def default_scheme_terms(scheme_name: str) -> Tuple[float, int]:
    """Return (interest_rate_pct, tenure_months) defaults for a scheme label."""
    return SCHEME_TERMS.get(scheme_name, _FALLBACK_TERMS)


def compute_monthly_emi(principal: float, annual_rate_pct: float, tenure_months: int) -> float:
    """Standard monthly reducing-balance EMI: P * r * (1+r)^n / ((1+r)^n - 1)."""
    if principal <= 0:
        raise ValueError("Principal must be positive.")
    if tenure_months <= 0:
        raise ValueError("Tenure must be positive.")
    monthly_rate = annual_rate_pct / 100 / 12
    if monthly_rate == 0:
        return principal / tenure_months
    factor = (1 + monthly_rate) ** tenure_months
    return principal * monthly_rate * factor / (factor - 1)


def _add_months(day: date, months: int) -> date:
    """Advance a date by whole months, clamping the day to the target month."""
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last_day))


def build_monthly_schedule(
    principal: float,
    annual_rate_pct: float,
    tenure_months: int,
    start_date: date | None = None,
) -> Dict[str, Any]:
    """
    Build a full monthly repayment schedule.

    Returns a dict with the loan terms, monthly EMI, totals, and per-month
    entries (month, payment_date, opening_balance, interest, principal,
    total_payment, closing_balance). The final payment clears any residual
    balance so the loan ends at exactly zero.
    """
    if principal <= 0:
        raise ValueError("Principal must be positive.")
    if tenure_months <= 0:
        raise ValueError("Tenure must be positive.")

    emi = compute_monthly_emi(principal, annual_rate_pct, tenure_months)
    emi = round(emi, 2)  # the fixed monthly instalment borrowers actually pay
    monthly_rate = annual_rate_pct / 100 / 12
    first_payment = _add_months(start_date or date.today(), 1)

    schedule: List[Dict[str, Any]] = []
    balance = principal
    fully_repaid = False

    for month in range(1, tenure_months + 1):
        opening = round(balance, 2)
        if fully_repaid:
            # Loan already cleared early (only possible in pathological rounding)
            schedule.append({
                "month": month,
                "payment_date": _add_months(first_payment, month - 1).isoformat(),
                "opening_balance": 0.0,
                "interest": 0.0,
                "principal": 0.0,
                "total_payment": 0.0,
                "closing_balance": 0.0,
            })
            continue

        interest = round(opening * monthly_rate, 2)
        is_last = month == tenure_months

        if is_last:
            # Final payment clears the exact remaining balance
            principal_part = opening
            payment = round(opening + interest, 2)
            closing = 0.0
        else:
            payment = emi
            principal_part = round(payment - interest, 2)
            if principal_part >= opening:
                # Instalment would clear the balance early: pay it off now
                principal_part = opening
                payment = round(opening + interest, 2)
                closing = 0.0
                fully_repaid = True
            else:
                closing = round(opening - principal_part, 2)

        schedule.append({
            "month": month,
            "payment_date": _add_months(first_payment, month - 1).isoformat(),
            "opening_balance": opening,
            "interest": interest,
            "principal": principal_part,
            "total_payment": payment,
            "closing_balance": closing,
        })
        balance = closing

    # Totals are derived from the rounded per-month entries so statements are
    # internally consistent (sum of rows == displayed totals).
    total_interest_display = round(sum(entry["interest"] for entry in schedule), 2)
    total_payable_display = round(sum(entry["total_payment"] for entry in schedule), 2)

    return {
        "approved_amount": round(principal, 2),
        "annual_rate_pct": annual_rate_pct,
        "tenure_months": tenure_months,
        "monthly_emi": round(emi, 2),
        "first_payment_date": first_payment.isoformat(),
        "total_interest": total_interest_display,
        "total_payable": total_payable_display,
        "schedule": schedule,
    }


def schedule_to_csv(schedule_result: Dict[str, Any]) -> str:
    """Render a schedule dict into a bank-statement style CSV (BOM-prefixed)."""
    def fmt(v: float) -> str:
        return f"{v:,.2f}"

    lines = [
        ["Loan Repayment Statement"],
        ["Sanctioned Amount (INR)", fmt(schedule_result["approved_amount"])],
        ["Interest Rate (% p.a.)", f"{schedule_result['annual_rate_pct']:.2f}"],
        ["Tenure (months)", str(schedule_result["tenure_months"])],
        ["Monthly EMI (INR)", fmt(schedule_result["monthly_emi"])],
        ["Total Interest (INR)", fmt(schedule_result["total_interest"])],
        ["Total Repayable (INR)", fmt(schedule_result["total_payable"])],
        ["First Payment Date", schedule_result["first_payment_date"]],
        [],
        ["Month", "Payment Date", "Opening Balance", "EMI", "Principal", "Interest", "Closing Balance"],
    ]

    for entry in schedule_result["schedule"]:
        lines.append([
            str(entry["month"]),
            entry["payment_date"],
            fmt(entry["opening_balance"]),
            fmt(entry["total_payment"]),
            fmt(entry["principal"]),
            fmt(entry["interest"]),
            fmt(entry["closing_balance"]),
        ])

    return "\uFEFF" + "\n".join(",".join(row) for row in lines)
