"""
Demo data seeding
==================
The app starts genuinely empty, which is correct but makes a cold demo hard to
present. This module fills one account with a realistic portfolio on request,
and removes it again just as easily.

Two rules keep this from re-creating the problem it replaces:

  1. Nothing is seeded implicitly. It happens only when someone calls
     POST /api/demo/seed for their own account.
  2. Every seeded record carries ``"demo": True``, so the UI can label it and
     the wipe knows exactly what it put there. Real records the account created
     itself are never touched by the wipe.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

from app.core.amortization import generate_schedule
from app.core.calculator import calculate_finances
from app.core.harvest_store import delete_harvest, list_harvests, save_harvest
from app.core.loan_schedule import build_monthly_schedule
from app.core.loan_store import list_applications, save_application, update_application

logger = logging.getLogger(__name__)

DEMO_FLAG = "demo"


def _prefix(user_id: str) -> str:
    """Per-account id namespace, stable so re-seeding stays idempotent."""
    return f"DEMO-{user_id.replace('-', '')[:8].upper()}"


def _iso(d: date) -> str:
    return d.isoformat()


def _demo_applications(today: date, prefix: str = "DEMO") -> List[Dict[str, Any]]:
    """
    Two loans that tell a story: one active and part-repaid, one still pending.

    The financials come from the same deterministic engine the real flow uses,
    so the seeded numbers are internally consistent rather than made up.
    """
    active_scheme = calculate_finances(50_000)      # -> Rs 5,00,000 project, Term Loan
    pending_scheme = calculate_finances(12_000)     # -> Rs 1,20,000 project, Micro Finance

    disbursed_on = today - timedelta(days=210)
    built = build_monthly_schedule(
        principal=active_scheme.loan_amount,
        annual_rate_pct=active_scheme.interest_rate_pct,
        tenure_months=active_scheme.tenure_months,
        start_date=disbursed_on,
    )
    active_schedule = built["schedule"]

    # Six instalments already met, so progress bars and "next due" have meaning.
    payments = [
        {
            "month": row["month"],
            "amount": row["total_payment"],
            "paid_on": row["payment_date"],
        }
        for row in active_schedule[:6]
    ]

    return [
        {
            "id": f"{prefix}-LN-0001",
            "demo": True,
            "applicant_name": "Demo Portfolio",
            "mobile": "9000000000",
            "branch": "Akola Main Branch",
            "business_category": "dairy",
            "scheme_name": active_scheme.selected_scheme,
            "loan_amount": active_scheme.loan_amount,
            "approved_amount": active_scheme.loan_amount,
            "subsidy_amount": round(active_scheme.project_cost * 0.25, 2),
            "annual_rate_pct": active_scheme.interest_rate_pct,
            "tenure_months": active_scheme.tenure_months,
            "status": "Active",
            "applied_at": _iso(disbursed_on - timedelta(days=14)),
            "approved_at": _iso(disbursed_on),
            "monthly_emi": built["monthly_emi"],
            "first_payment_date": built["first_payment_date"],
            "total_interest": built["total_interest"],
            "total_payable": built["total_payable"],
            "schedule": active_schedule,
            "payments": payments,
        },
        {
            "id": f"{prefix}-LN-0002",
            "demo": True,
            "applicant_name": "Demo Portfolio",
            "mobile": "9000000000",
            "branch": "Akola Main Branch",
            "business_category": "vegetables",
            "scheme_name": pending_scheme.selected_scheme,
            "loan_amount": pending_scheme.loan_amount,
            "subsidy_amount": round(pending_scheme.project_cost * 0.25, 2),
            "annual_rate_pct": pending_scheme.interest_rate_pct,
            "tenure_months": pending_scheme.tenure_months,
            "status": "Pending",
            "applied_at": _iso(today - timedelta(days=9)),
            "schedule": [],
            "payments": [],
        },
    ]


def _demo_harvests(today: date, prefix: str = "DEMO") -> List[Dict[str, Any]]:
    """A few lots across the last two seasons, so revenue charts have shape."""
    lots = [
        ("Soybean", 18.5, 4820, 120),
        ("Tur (Arhar)", 9.0, 10400, 75),
        ("Wheat", 22.0, 2450, 25),
        ("Onion", 14.5, 2200, 8),
    ]
    return [
        {
            "id": f"{prefix}-HV-{i:04d}",
            "demo": True,
            "produce": produce,
            "quantity_qtl": qty,
            "price_per_qtl": price,
            "harvest_date": _iso(today - timedelta(days=days_ago)),
            "revenue": round(qty * price, 2),
            "notes": "Seeded demonstration record",
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        for i, (produce, qty, price, days_ago) in enumerate(lots, start=1)
    ]


def seed(user_id: str) -> Dict[str, Any]:
    """
    Fill an account with a demonstration portfolio.

    Idempotent: seeding twice does not double the data, because the records use
    fixed ids and the store refuses duplicates.
    """
    today = date.today()
    # Ids are unique per table, not per account, so they are namespaced by user
    # — otherwise only the first account to seed could ever succeed.
    prefix = _prefix(user_id)
    applications = _demo_applications(today, prefix)
    harvests = _demo_harvests(today, prefix)

    loans_added = 0
    for application in applications:
        if save_application(application["id"], application, user_id=user_id):
            loans_added += 1
        else:
            # Already present from an earlier seed — refresh it so a changed
            # seed definition still takes effect.
            update_application(application["id"], application, user_id=user_id)

    harvests_added = 0
    for lot in harvests:
        if save_harvest(lot["id"], lot, user_id=user_id):
            harvests_added += 1

    logger.info(
        "Seeded demo data for %s: %d loans, %d harvest lots",
        user_id, loans_added, harvests_added,
    )
    return {
        "seeded": True,
        "loans": len(applications),
        "harvest_lots": len(harvests),
        "loans_created": loans_added,
        "harvest_lots_created": harvests_added,
    }


def wipe(user_id: str) -> Dict[str, Any]:
    """
    Remove only the seeded records, leaving anything the account created itself.

    Identification is by the ``demo`` flag rather than by id prefix, so a record
    the user genuinely created can never be deleted by this.
    """
    removed_harvests = 0
    for lot in list_harvests(user_id=user_id):
        if lot.get(DEMO_FLAG) is True:
            if delete_harvest(lot["id"], user_id=user_id):
                removed_harvests += 1

    # Loans have no delete in the store (applications are an audit trail), so
    # they are marked withdrawn instead of vanishing.
    removed_loans = 0
    for application in list_applications(user_id=user_id):
        if application.get(DEMO_FLAG) is True and application.get("status") != "Withdrawn":
            update_application(
                application["id"],
                {"status": "Withdrawn", "withdrawn_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
                user_id=user_id,
            )
            removed_loans += 1

    logger.info("Wiped demo data for %s: %d loans, %d harvest lots", user_id, removed_loans, removed_harvests)
    return {"wiped": True, "loans": removed_loans, "harvest_lots": removed_harvests}


def status(user_id: str) -> Dict[str, Any]:
    """Whether this account currently holds seeded data."""
    loans = [a for a in list_applications(user_id=user_id) if a.get(DEMO_FLAG) is True]
    lots = [h for h in list_harvests(user_id=user_id) if h.get(DEMO_FLAG) is True]
    active_demo_loans = [a for a in loans if a.get("status") != "Withdrawn"]
    return {
        "has_demo_data": bool(active_demo_loans or lots),
        "loans": len(active_demo_loans),
        "harvest_lots": len(lots),
    }
