"""
Decision Receipt — provenance and reproducibility for every figure
===================================================================
A report is only trustworthy if a third party can tell where each number came
from and recompute the ones that matter. This module produces that record.

Two guarantees:

  1. Provenance — every section of a report carries a source entry saying
     whether the value was derived by rule, observed from an external feed, or
     written by a language model. The last kind is never allowed to feed the
     financial math, and the receipt says so explicitly.

  2. Reproducibility — the financial figures are hashed together with the exact
     inputs that produced them, the engine version, and a fingerprint of the
     scheme constants in force at the time. ``verify_receipt`` re-runs the
     deterministic engine against the stored inputs and reports whether the
     numbers still reproduce — and if not, whether it was the figures or the
     scheme rules that moved.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.amortization import generate_schedule
from app.core.calculator import (
    MARGIN_PERCENTAGE,
    MICRO_FINANCE,
    TERM_LOAN,
    calculate_finances,
)

# Bump on any change to the deterministic engine's behaviour.
ENGINE_VERSION = "1.0.0"

# Source kinds, in descending order of how much weight a figure may carry.
KIND_RULE = "rule"                # derived by the deterministic engine
KIND_OBSERVATION = "observation"  # measured by an external feed (OSM, weather, mandi)
KIND_MODEL = "model"              # written by a language model — narrative only


def _canonical(payload: Any) -> str:
    """Stable JSON: sorted keys, no incidental whitespace, so hashes reproduce."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def rules_fingerprint() -> str:
    """
    Short hash over the scheme constants that drive every financial figure.

    If a rate, tenure, moratorium or gate threshold is edited, this changes —
    which is how verification tells "the numbers were wrong" apart from "the
    scheme rules were amended after this report was issued".
    """
    rules = {
        "margin_percentage": MARGIN_PERCENTAGE,
        "micro_finance": MICRO_FINANCE,
        "term_loan": TERM_LOAN,
    }
    return hashlib.sha256(_canonical(rules).encode("utf-8")).hexdigest()[:16]


def source(
    field: str,
    kind: str,
    name: str,
    detail: str,
    observed_at: Optional[str] = None,
) -> Dict[str, Any]:
    """One provenance entry, attached to a named field of the report."""
    return {
        "field": field,
        "kind": kind,
        "source": name,
        "detail": detail,
        "observed_at": observed_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def scheme_gate(project_cost: float) -> str:
    """Plain-language statement of which routing gate the project cost fell into."""
    micro_cap = MICRO_FINANCE["max_project_cost"]
    term_cap = TERM_LOAN["max_project_cost"]
    if project_cost <= micro_cap:
        return f"project cost Rs {project_cost:,.0f} <= Rs {micro_cap:,.0f} -> {MICRO_FINANCE['label']}"
    if project_cost <= term_cap:
        return (
            f"Rs {micro_cap:,.0f} < project cost Rs {project_cost:,.0f} <= Rs {term_cap:,.0f} "
            f"-> {TERM_LOAN['label']}"
        )
    return f"project cost Rs {project_cost:,.0f} > Rs {term_cap:,.0f} -> no scheme applies"


def build_receipt(
    inputs: Dict[str, Any],
    financials: Dict[str, Any],
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Assemble the receipt for one report.

    Args:
        inputs:     exactly the values the deterministic engine consumed.
                    Anything not listed here is not covered by the hash.
        financials: the engine's output (see SchemeResult.to_dict).
        sources:    provenance entries built with ``source()``.

    Returns a dict safe to store alongside the report and to print on the PDF.
    """
    fingerprint = rules_fingerprint()
    body = {
        "engine_version": ENGINE_VERSION,
        "rules_fingerprint": fingerprint,
        "inputs": inputs,
        "financials": financials,
    }
    receipt_hash = hashlib.sha256(_canonical(body).encode("utf-8")).hexdigest()

    return {
        "receipt_hash": receipt_hash,
        "short_hash": receipt_hash[:12].upper(),
        "engine_version": ENGINE_VERSION,
        "rules_fingerprint": fingerprint,
        "issued_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs": inputs,
        "sources": sources,
        "note": (
            "Financial figures are computed by a fixed rule engine. The language "
            "model contributes narrative only and cannot alter any number above."
        ),
    }


def verify_receipt(receipt: Dict[str, Any], financials: Dict[str, Any]) -> Dict[str, Any]:
    """
    Re-run the deterministic engine against the receipt's stored inputs and
    report whether the issued figures still reproduce.

    Returns a verdict dict whose ``status`` is one of:
      - "verified"      recomputed figures match the issued ones exactly
      - "rules_changed" figures differ and the scheme constants have moved since
                        issue, so the original was correct at the time
      - "mismatch"      figures differ under unchanged rules (investigate)
      - "unverifiable"  the receipt lacks the inputs needed to recompute
    """
    inputs = receipt.get("inputs") or {}
    margin = inputs.get("margin_capital")
    if margin is None:
        return {
            "status": "unverifiable",
            "reason": "receipt does not carry the margin capital it was computed from",
        }

    current_fingerprint = rules_fingerprint()
    issued_fingerprint = receipt.get("rules_fingerprint")
    rules_moved = issued_fingerprint is not None and issued_fingerprint != current_fingerprint

    try:
        recomputed = calculate_finances(float(margin))
    except ValueError as exc:
        return {"status": "unverifiable", "reason": str(exc)}

    expected = recomputed.to_dict()
    differences = {
        key: {"issued": financials.get(key), "recomputed": value}
        for key, value in expected.items()
        if financials.get(key) != value
    }

    if differences:
        return {
            "status": "rules_changed" if rules_moved else "mismatch",
            "engine_version": ENGINE_VERSION,
            "issued_rules_fingerprint": issued_fingerprint,
            "current_rules_fingerprint": current_fingerprint,
            "rules_changed_since_issue": rules_moved,
            "differences": differences,
            "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

    # The repayment schedule derives from the same figures, so recompute its
    # headline total rather than trusting that matching inputs imply it.
    schedule = generate_schedule(
        loan_amount=recomputed.loan_amount,
        annual_rate_pct=recomputed.interest_rate_pct,
        tenure_months=recomputed.tenure_months,
        moratorium_months=recomputed.moratorium_months,
    )

    return {
        "status": "verified",
        "engine_version": ENGINE_VERSION,
        "rules_fingerprint": current_fingerprint,
        "rules_changed_since_issue": rules_moved,
        "recomputed": expected,
        "total_interest_recomputed": round(schedule.total_interest_paid, 2),
        "gate": scheme_gate(recomputed.project_cost),
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
