"""
Crop Calendar & Harvest-Aligned Repayment
==========================================
A rural borrower's income is not a monthly salary. For a crop-linked
enterprise it arrives in a few weeks after harvest and is close to zero for the
rest of the year. A repayment schedule that ignores that will place
instalments in months when the household has nothing coming in — which is how
an otherwise viable loan turns into a default.

This module overlays the repayment schedule on the borrower's actual income
months and reports where they collide, then works out the moratorium that
would move the first principal instalment past the first harvest.

Everything here is pure (no I/O) and deterministic, so it carries the same
weight as the rest of the financial engine and is covered by the same receipt.

Season reference (North/Central India, Kharif & Rabi):
  Kharif — sown Jun/Jul, harvested Sep-Nov
  Rabi   — sown Oct/Nov, harvested Feb-Apr
"""

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Income pattern per business category.
#   income_months: 1-indexed calendar months in which cash actually arrives.
#   steady:        True when income is broadly month-to-month rather than
#                  concentrated around a harvest.
#
# A steady business still has weak months, but it has no harvest to align to,
# so no moratorium recommendation is made for it.
INCOME_PATTERNS: Dict[str, Dict[str, Any]] = {
    # --- Crop-linked: income concentrated at harvest ---
    "vegetables": {
        "steady": False,
        "income_months": [3, 4, 10, 11],
        "note": "Rabi harvest Mar-Apr and Kharif harvest Oct-Nov",
    },
    "fertilizer": {
        "steady": False,
        # Demand peaks at sowing, not harvest — input dealers earn when farmers plant.
        "income_months": [6, 7, 10, 11],
        "note": "Sales peak at Kharif sowing (Jun-Jul) and Rabi sowing (Oct-Nov)",
    },
    "cattle_feed": {
        "steady": False,
        "income_months": [6, 7, 8, 9, 11, 12, 1],
        "note": "Demand rises in the monsoon and again in the dry Rabi months",
    },
    "flour_mill": {
        "steady": False,
        "income_months": [3, 4, 5, 10, 11],
        "note": "Milling volume follows wheat (Mar-May) and paddy (Oct-Nov) arrivals",
    },

    # --- Steady trade and services ---
    "dairy": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily milk pouring gives near-monthly income"},
    "poultry": {"steady": True, "income_months": list(range(1, 13)), "note": "Batch cycles of 6-8 weeks give year-round income"},
    "grocery": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily retail turnover"},
    "general_store": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily retail turnover"},
    "bakery": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily retail turnover"},
    "restaurant": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily footfall"},
    "tailoring": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with festival and wedding season peaks"},
    "beauty_parlour": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with wedding season peaks"},
    "pharmacy": {"steady": True, "income_months": list(range(1, 13)), "note": "Daily retail turnover"},
    "clothing": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with festival peaks"},
    "electronics": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with festival peaks"},
    "hardware": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with a post-harvest construction peak"},
    "stationery": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady, with a school-session peak"},
    "auto_repair": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady demand"},
    "fuel": {"steady": True, "income_months": list(range(1, 13)), "note": "Steady demand"},
}

# Used when the category is unknown. Treated as steady so no spurious
# harvest-alignment advice is produced for a business we have no pattern for.
DEFAULT_PATTERN: Dict[str, Any] = {
    "steady": True,
    "income_months": list(range(1, 13)),
    "note": "No seasonal pattern on record for this category — treated as steady income",
}


def income_pattern(business_category: str) -> Dict[str, Any]:
    """The income pattern for a category, falling back to a steady default."""
    return INCOME_PATTERNS.get(str(business_category or "").strip().lower(), DEFAULT_PATTERN)


def _add_months(start: date, months: int) -> date:
    """Calendar month arithmetic, clamped to the 1st (we only need the month)."""
    total = (start.year * 12 + start.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


@dataclass(frozen=True)
class InstalmentMonth:
    """One scheduled payment placed on the calendar against income months."""
    quarter: int
    payment_type: str
    total_payment: float
    due_month: int          # 1-indexed calendar month
    due_month_name: str
    due_year: int
    has_income: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "quarter": self.quarter,
            "payment_type": self.payment_type,
            "total_payment": round(self.total_payment, 2),
            "due_month": self.due_month,
            "due_month_name": self.due_month_name,
            "due_year": self.due_year,
            "has_income": self.has_income,
        }


def align_schedule(
    schedule: List[Dict[str, Any]],
    business_category: str,
    disbursement: Optional[date] = None,
    moratorium_months: int = 0,
) -> Dict[str, Any]:
    """
    Place each instalment on the calendar and report the collisions with
    zero-income months.

    Args:
        schedule:          the quarterly rows from AmortizationSchedule.to_dict().
        business_category: drives which months carry income.
        disbursement:      when the loan is paid out. Defaults to today.
        moratorium_months: the moratorium already built into the schedule,
                           used to suggest an alternative.

    Returns a dict with the placed instalments, the clashing ones, and — for a
    seasonal business — the moratorium that would clear the first principal
    instalment of the harvest.
    """
    start = disbursement or date.today()
    pattern = income_pattern(business_category)
    income_months = set(pattern["income_months"])

    placed: List[InstalmentMonth] = []
    for row in schedule:
        quarter = int(row.get("quarter") or 0)
        # Quarter 1 falls three months after disbursement, quarter 2 at six, etc.
        due = _add_months(start, quarter * 3)
        placed.append(InstalmentMonth(
            quarter=quarter,
            payment_type=str(row.get("payment_type") or ""),
            total_payment=float(row.get("total_payment") or 0.0),
            due_month=due.month,
            due_month_name=MONTHS[due.month - 1],
            due_year=due.year,
            has_income=due.month in income_months,
        ))

    # Only principal-bearing instalments are worth flagging: an interest-only
    # moratorium payment is small enough to bridge from savings.
    at_risk = [p for p in placed if not p.has_income and "Moratorium" not in p.payment_type]
    at_risk_amount = round(sum(p.total_payment for p in at_risk), 2)

    result: Dict[str, Any] = {
        "business_category": business_category,
        "steady_income": pattern["steady"],
        "income_months": sorted(income_months),
        "income_month_names": [MONTHS[m - 1] for m in sorted(income_months)],
        "pattern_note": pattern["note"],
        "disbursement_month": MONTHS[start.month - 1],
        "instalments": [p.to_dict() for p in placed],
        "at_risk_instalments": [p.to_dict() for p in at_risk],
        "at_risk_count": len(at_risk),
        "at_risk_amount": at_risk_amount,
        "recommendation": None,
    }

    if pattern["steady"]:
        result["summary"] = (
            f"{business_category.replace('_', ' ').title()} earns through the year, "
            "so instalments do not need to be aligned to a harvest."
        )
        return result

    first_emi = next((p for p in placed if "Moratorium" not in p.payment_type), None)
    if first_emi is None:
        result["summary"] = "No principal instalments in this schedule."
        return result

    if not at_risk:
        result["summary"] = (
            f"Every principal instalment already falls in an earning month "
            f"({', '.join(result['income_month_names'])})."
        )
        return result

    suggested = _suggest_moratorium(start, income_months, moratorium_months)
    if suggested is not None:
        target = _add_months(start, suggested + 3)
        # Say what the change actually buys. With quarterly instalments and a
        # short harvest window, alignment usually reduces the collisions rather
        # than removing them, and the advice should not pretend otherwise.
        remaining = _count_at_risk(start, income_months, len(placed), suggested)
        result["recommendation"] = {
            "suggested_moratorium_months": suggested,
            "current_moratorium_months": moratorium_months,
            "first_emi_moves_to": MONTHS[target.month - 1],
            "at_risk_now": len(at_risk),
            "at_risk_after": remaining,
            "reason": (
                f"Extending the moratorium to {suggested} months moves the first principal "
                f"instalment to {MONTHS[target.month - 1]}, an earning month for "
                f"{business_category.replace('_', ' ')}. Instalments falling in months with "
                f"no income drop from {len(at_risk)} to {remaining}."
            ),
        }

    result["summary"] = (
        f"{len(at_risk)} of {len(placed)} instalments "
        f"(₹{at_risk_amount:,.0f}) fall in months with no harvest income."
    )
    return result


def _count_at_risk(start: date, income_months: set, total_instalments: int, moratorium: int) -> int:
    """
    How many principal instalments would fall in a no-income month under a given
    moratorium. Quarterly cadence against a short harvest window means some
    collisions are unavoidable; this is what makes that visible.
    """
    moratorium_quarters = moratorium // 3
    return sum(
        1
        for quarter in range(moratorium_quarters + 1, total_instalments + 1)
        if _add_months(start, quarter * 3).month not in income_months
    )


def _suggest_moratorium(
    start: date,
    income_months: set,
    current: int,
    max_months: int = 12,
) -> Optional[int]:
    """
    The shortest moratorium that lands the first principal instalment in an
    earning month.

    Never returns less than the moratorium the scheme already grants: that
    period exists to cover the gestation of the enterprise, so trading it away
    to hit a harvest month would be worse advice than the collision it fixes.
    Returns None when no option up to ``max_months`` aligns, or when the current
    moratorium already does — a schedule that cannot align is not fixed by
    deferring it further.
    """
    # ponytail: searches quarterly steps up to one year. A disbursement month
    # whose quarterly cadence never crosses a harvest month (e.g. May against a
    # Mar/Apr/Oct/Nov window) returns None rather than a 15-month deferral;
    # widen max_months if schemes ever allow moratoria beyond a year.
    for candidate in range(current, max_months + 1, 3):
        if _add_months(start, candidate + 3).month in income_months:
            return None if candidate == current else candidate
    return None


def repayment_capacity(
    quarterly_emi: float,
    expected_annual_income: float,
    income_month_count: int,
) -> Dict[str, Any]:
    """
    Whether the earning months can actually carry the annual repayment.

    The engine sizes the loan from the borrower's margin capital, which says
    nothing about whether they can repay it. This is the missing check: four
    quarterly instalments a year against the income the business is expected to
    produce.

    A debt-service ratio above 0.5 means more than half of everything earned
    goes to the loan, which is where rural lending guidance puts the ceiling.
    """
    annual_repayment = quarterly_emi * 4
    if expected_annual_income <= 0:
        return {
            "assessable": False,
            "reason": "No expected income provided, so repayment capacity cannot be assessed.",
            "annual_repayment": round(annual_repayment, 2),
        }

    ratio = annual_repayment / expected_annual_income
    if ratio <= 0.3:
        verdict, comment = "comfortable", "Repayment takes under a third of expected income."
    elif ratio <= 0.5:
        verdict, comment = "manageable", "Repayment takes up to half of expected income — workable but tight."
    else:
        verdict, comment = "strained", (
            "Repayment takes more than half of expected income. Consider a longer "
            "tenure, a larger own contribution, or a smaller project."
        )

    return {
        "assessable": True,
        "annual_repayment": round(annual_repayment, 2),
        "expected_annual_income": round(expected_annual_income, 2),
        "debt_service_ratio": round(ratio, 3),
        "per_earning_month": round(annual_repayment / max(1, income_month_count), 2),
        "verdict": verdict,
        "comment": comment,
    }
