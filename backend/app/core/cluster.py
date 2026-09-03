"""
Cluster Co-op Pulse (Community Activity)
=========================================
Builds the "Cluster Co-op Pulse" feed purely from records the app already
stores: loan applications, officer approvals, recorded repayments and logged
harvest lots. No fabricated members — every name shown has actually used the
portal.

Dates inside stored records arrive in two formats ("Sep 03, 2026" from the
apply flow, ISO dates from approvals/payments/harvests), so we normalise
everything to ISO before sorting.
"""

from datetime import datetime
from typing import Any, Dict, List


def _to_iso(value: Any) -> str:
    """Normalise 'Sep 03, 2026' or '2026-09-03' into '2026-09-03'."""
    if not value:
        return ""
    text = str(value).strip()
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date().isoformat()
    except (ValueError, TypeError):
        pass
    try:
        return datetime.strptime(text, "%b %d, %Y").date().isoformat()
    except (ValueError, TypeError):
        return ""


def initials(name: str) -> str:
    """Two-letter initials from a display name (e.g. 'Ramesh Kumar' -> 'RK')."""
    parts = [p for p in str(name or "?").split() if p]
    if not parts:
        return "?"
    letters = "".join(p[0] for p in parts[:2]).upper()
    return letters or "?"


def build_activity(applications: List[Dict[str, Any]], harvests: List[Dict[str, Any]], limit: int = 8) -> Dict[str, Any]:
    """
    Compose a chronologically sorted activity feed (newest first).

    Event kinds:
      - application : a farmer applied for a loan
      - approval    : an officer sanctioned an application
      - repayment   : an EMI instalment was recorded as paid
      - harvest     : a harvest lot was logged
    """
    events: List[Dict[str, Any]] = []

    for app in applications:
        name = app.get("applicant_name") or "Cluster farmer"
        category = app.get("business_category", "Business").replace("_", " ").title()
        applied = _to_iso(app.get("applied_at"))
        events.append({
            "id": f"applied-{app.get('id')}",
            "kind": "application",
            "ts": applied,
            "member": name,
            "title": f"{name} applied for a {category} loan",
            "detail": f"{app.get('id')} — ₹{float(app.get('loan_amount') or 0):,.0f} requested via {app.get('branch', 'branch')}.",
        })

        if app.get("status") == "Active" and app.get("approved_at"):
            events.append({
                "id": f"approved-{app.get('id')}",
                "kind": "approval",
                "ts": _to_iso(app.get("approved_at")),
                "member": "Bank Officer",
                "title": f"{category} loan {app.get('id')} sanctioned",
                "detail": f"₹{float(app.get('approved_amount') or app.get('loan_amount') or 0):,.0f} at "
                          f"{app.get('annual_rate_pct')}% p.a. for {app.get('tenure_months')} months.",
            })

        for payment in app.get("payments") or []:
            events.append({
                "id": f"paid-{app.get('id')}-{payment.get('month')}",
                "kind": "repayment",
                "ts": _to_iso(payment.get("paid_on")),
                "member": name,
                "title": f"{name} cleared EMI instalment {payment.get('month')}",
                "detail": f"{app.get('id')} — ₹{float(payment.get('amount') or 0):,.2f} recorded.",
            })

    for lot in harvests:
        name = "Your Farm"
        events.append({
            "id": f"harvest-{lot.get('id')}",
            "kind": "harvest",
            "ts": _to_iso(lot.get("harvest_date")),
            "member": name,
            "title": f"{lot.get('produce')} harvest logged",
            "detail": f"{float(lot.get('quantity_qtl') or 0):,.1f} quintals at "
                      f"₹{float(lot.get('price_per_qtl') or 0):,.0f}/qtl → "
                      f"₹{float(lot.get('quantity_qtl') or 0) * float(lot.get('price_per_qtl') or 0):,.0f}.",
        })

    events.sort(key=lambda e: e.get("ts") or "", reverse=True)
    members: List[Dict[str, str]] = []
    seen = set()
    for app in applications:
        name = app.get("applicant_name")
        if name and name not in seen:
            seen.add(name)
            members.append({"name": name, "initials": initials(name), "role": "Farmer member"})

    repayments = sum(len(app.get("payments") or []) for app in applications)
    active = sum(1 for app in applications if app.get("status") == "Active")
    pending = sum(1 for app in applications if app.get("status") == "Pending")

    return {
        "events": events[:limit],
        "members": members,
        "stats": {
            "members": len(members) + 1,  # + the farmer's own profile
            "applications": len(applications),
            "active_loans": active,
            "pending": pending,
            "repayments_recorded": repayments,
            "harvest_lots": len(harvests),
        },
    }
