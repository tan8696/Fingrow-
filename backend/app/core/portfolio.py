"""
Portfolio Aggregation (Dashboard Data)
=======================================
Pure, deterministic aggregation over the stored loan applications (and demo
loan entries) that powers the dashboard's KPIs, cashflow chart and repayment
ledger.

Nothing here touches the network or the database directly — callers pass the
application dicts (see loan_store.list_applications) so every function stays
trivially testable.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

# Pre-approved credit limit shown across the UI (₹25,00,000)
PORTFOLIO_LIMIT = 2_500_000.0


def _payments(application: Dict[str, Any]) -> List[Dict[str, Any]]:
    return application.get("payments") or []


def _schedule_rows(application: Dict[str, Any]) -> List[Dict[str, Any]]:
    return application.get("schedule") or []


def outstanding_principal(application: Dict[str, Any]) -> float:
    """Remaining principal after the latest recorded payment."""
    payments = _payments(application)
    if not payments:
        return round(float(application.get("approved_amount") or application.get("loan_amount") or 0.0), 2)
    last_month = payments[-1]["month"]
    for entry in _schedule_rows(application):
        if entry.get("month") == last_month:
            return round(float(entry.get("closing_balance") or 0.0), 2)
    return 0.0


def next_due(application: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The next unpaid instalment for an Active application, if any."""
    if application.get("status") != "Active":
        return None
    months_paid = len(_payments(application))
    tenure = int(application.get("tenure_months") or 0)
    if months_paid >= tenure:
        return None
    due_month = months_paid + 1
    for entry in _schedule_rows(application):
        if entry.get("month") == due_month:
            return {
                "date": entry.get("payment_date"),
                "amount": round(float(entry.get("total_payment") or 0.0), 2),
                "month": due_month,
            }
    return None


def summary(applications: List[Dict[str, Any]], limit: float = PORTFOLIO_LIMIT) -> Dict[str, Any]:
    """Aggregate portfolio figures across all stored applications."""
    active = [a for a in applications if a.get("status") == "Active"]
    pending = [a for a in applications if a.get("status") == "Pending"]

    outstanding_total = round(sum(outstanding_principal(a) for a in active), 2)
    monthly_emi_total = round(
        sum(float(a.get("monthly_emi") or 0.0) for a in active if a.get("monthly_emi")), 2
    )

    dues = [d for d in (next_due(a) for a in active) if d]
    next_due_date = min((d["date"] for d in dues), default=None) if dues else None
    next_due_amount = round(
        sum(d["amount"] for d in dues if d["date"] == next_due_date), 2
    ) if next_due_date else 0.0

    months_paid = sum(len(_payments(a)) for a in active)
    months_total = sum(int(a.get("tenure_months") or 0) for a in active)
    subsidy_approved = round(
        sum(float(a.get("subsidy_amount") or 0.0) for a in active if a.get("status") == "Active"), 2
    )
    subsidy_pipeline = round(
        sum(float(a.get("subsidy_amount") or 0.0) for a in pending), 2
    )
    requested_pipeline = round(sum(float(a.get("loan_amount") or 0.0) for a in pending), 2)

    utilization = min(100.0, round(outstanding_total / limit * 100, 1)) if limit > 0 else 0.0

    return {
        "active_loans": len(active),
        "pending_applications": len(pending),
        "outstanding_total": outstanding_total,
        "monthly_emi_total": monthly_emi_total,
        "next_due_date": next_due_date,
        "next_due_amount": next_due_amount,
        "months_paid": months_paid,
        "months_total": months_total,
        "repayment_progress_pct": round(months_paid / months_total * 100, 1) if months_total else 0.0,
        "subsidy_approved_total": subsidy_approved,
        "subsidy_pipeline_total": subsidy_pipeline,
        "requested_pipeline_total": requested_pipeline,
        "utilization_pct": utilization,
        "credit_limit": limit,
    }


def _month_label(key: str) -> str:
    """Turn a 'YYYY-MM' key into a short 'Sep 2026' style label."""
    try:
        return datetime.strptime(key, "%Y-%m").strftime("%b %y")
    except (ValueError, TypeError):
        return key


def cashflow(applications: List[Dict[str, Any]], horizon: int = 6) -> Dict[str, Any]:
    """
    Build upcoming EMI obligations across active loans.

    For each active application we walk its schedule from the next unpaid
    instalment and bucket the payments by calendar month. Returns both the
    aggregated `months` (for the chart) and a per-loan `ledger` (for the
    detailed repayment view).
    """
    buckets: Dict[str, Dict[str, Any]] = {}
    ledger: List[Dict[str, Any]] = []
    horizon = max(1, min(horizon, 24))

    for application in applications:
        if application.get("status") != "Active":
            continue
        payments = _payments(application)
        months_paid = len(payments)
        tenure = int(application.get("tenure_months") or 0)
        schedule = _schedule_rows(application)
        name = application.get("business_category", "Loan").replace("_", " ").title()

        for offset in range(horizon):
            month = months_paid + 1 + offset
            if month > tenure:
                break
            entry = next((e for e in schedule if e.get("month") == month), None)
            if entry is None:
                break
            key = (entry.get("payment_date") or "")[:7]
            bucket = buckets.setdefault(key, {"emi": 0.0, "interest": 0.0, "principal": 0.0, "loans": set()})
            bucket["emi"] = round(bucket["emi"] + float(entry.get("total_payment") or 0.0), 2)
            bucket["interest"] = round(bucket["interest"] + float(entry.get("interest") or 0.0), 2)
            bucket["principal"] = round(bucket["principal"] + float(entry.get("principal") or 0.0), 2)
            bucket["loans"].add(application.get("id", "?"))

    months = [
        {
            "key": key,
            "label": _month_label(key),
            "total_emi": round(bucket["emi"], 2),
            "total_interest": round(bucket["interest"], 2),
            "total_principal": round(bucket["principal"], 2),
            "loans": len(bucket["loans"]),
        }
        for key, bucket in sorted(buckets.items())
    ]

    # Detailed ledger: month-by-month rows with per-loan breakdowns
    detail_buckets: Dict[str, Dict[str, Any]] = {}
    for application in applications:
        if application.get("status") != "Active":
            continue
        payments = _payments(application)
        months_paid = len(payments)
        tenure = int(application.get("tenure_months") or 0)
        name = application.get("business_category", "Loan").replace("_", " ").title()

        for offset in range(horizon):
            month = months_paid + 1 + offset
            if month > tenure:
                break
            entry = next((e for e in _schedule_rows(application) if e.get("month") == month), None)
            if entry is None:
                break
            key = (entry.get("payment_date") or "")[:7]
            detail = detail_buckets.setdefault(key, {
                "label": _month_label(key),
                "date": entry.get("payment_date"),
                "total_emi": 0.0,
                "rows": [],
            })
            detail["total_emi"] = round(detail["total_emi"] + float(entry.get("total_payment") or 0.0), 2)
            detail["rows"].append({
                "id": application.get("id"),
                "name": name,
                "emi": round(float(entry.get("total_payment") or 0.0), 2),
                "principal": round(float(entry.get("principal") or 0.0), 2),
                "interest": round(float(entry.get("interest") or 0.0), 2),
                "balance": round(float(entry.get("closing_balance") or 0.0), 2),
            })

    for key, detail in sorted(detail_buckets.items()):
        detail["rows"] = sorted(detail["rows"], key=lambda r: r["emi"], reverse=True)
        ledger.append(detail)

    return {"months": months, "ledger": ledger}
