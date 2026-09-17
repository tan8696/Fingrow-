"""
Stress Test — the case against the recommendation
==================================================
The advisory pass in ``advisory.py`` describes why a business could work. This
one is asked the opposite question: given the same ground truth, what would
make it fail, and what would have to be true for it to succeed anyway.

An advisory tool that only ever flatters the borrower is worse than useless to
someone staking their savings on it. A farmer who is told plainly that the
numbers do not hold has been served better than one who is congratulated into
a default.

The prompt is bounded the same way the advisory prompt is: every figure the
model is allowed to reason about is supplied from the deterministic engine or a
measured feed, and it is told not to invent new ones. The severities it assigns
are its own judgement, but the facts underneath them are not.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.api.models import StressTestReport
from app.core.advisory import _get_groq_client

logger = logging.getLogger(__name__)

STRESS_MODEL = os.getenv("GROQ_STRESS_MODEL", os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"))


SYSTEM_PROMPT = """\
Role:
You are a sceptical credit risk officer reviewing a rural micro-enterprise loan
proposal that another analyst has already recommended. Your job is NOT to be
balanced. Your job is to find every reason this specific proposal could fail,
so the borrower learns it from you rather than from losing their savings.

STRICT RULES — violations invalidate the review:
1. Use ONLY the figures supplied below. Do not invent competitor counts,
   demographics, prices, yields, or income data.
2. Every risk you raise must trace to a supplied figure. If the evidence is not
   in the data below, do not raise the risk.
3. Do not hedge. Do not write "however, with proper planning". State the failure.
4. Do not mention AI or that this was generated automatically.
5. Return ONLY a raw JSON object. No markdown fences, no text around it.

Proposal under review (ground truth — all figures already verified):
- Location: {location}
- Business: {category}
- Total project cost: Rs {project_cost:,.0f}
- Borrower's own capital at risk: Rs {margin:,.0f}
- Loan to repay: Rs {loan:,.0f} at {rate}% over {tenure_months} months
- Quarterly instalment after moratorium: Rs {quarterly_emi:,.0f}
- Total interest payable over the term: Rs {total_interest:,.0f}
- Competitors within {radius} km (OpenStreetMap): {competitor_count} ({density})
{extra_facts}

Required output (strict JSON):
{{
  "verdict": "One of: proceed, proceed_with_changes, reconsider. Be willing to say reconsider.",
  "headline": "One blunt sentence a farmer would understand, stating the single biggest threat to this proposal.",
  "failure_modes": [
    {{
      "risk": "Short name for the failure mode",
      "severity": "high | medium | low",
      "mechanism": "Concretely how this leads to a missed repayment or a closed business. Reference the specific figure that makes it a risk.",
      "evidence": "The exact supplied figure this is based on.",
      "mitigation": "One specific, affordable action the borrower could take. Say plainly if there isn't one."
    }}
  ],
  "what_would_have_to_be_true": [
    "A concrete, checkable assumption this proposal depends on — something the borrower could go and verify this week.",
    "Another such assumption."
  ],
  "break_even_pressure": "What has to go right on revenue and timing for the quarterly instalment above to be met. Name the months that are tightest."
}}

Produce between 3 and 5 failure modes, ordered most severe first.
"""


def _fact_lines(
    alignment: Optional[Dict[str, Any]],
    capacity: Optional[Dict[str, Any]],
    competitors: Optional[List[str]],
) -> str:
    """
    Extra ground truth the reviewer may reason about.

    Only facts the deterministic engine or a measured feed produced are added
    here — this is what keeps the critique specific to this proposal rather than
    generic scepticism about rural lending.
    """
    lines: List[str] = []

    if competitors:
        lines.append(f"- Named competitors found nearby: {', '.join(competitors[:10])}")

    if alignment:
        months = ", ".join(alignment.get("income_month_names", [])) or "not seasonal"
        lines.append(f"- Months this business actually earns in: {months}")
        if alignment.get("pattern_note"):
            lines.append(f"- Income pattern: {alignment['pattern_note']}")
        at_risk = alignment.get("at_risk_count", 0)
        if at_risk:
            lines.append(
                f"- {at_risk} principal instalments totalling Rs {alignment.get('at_risk_amount', 0):,.0f} "
                f"fall due in months with no harvest income"
            )
        else:
            lines.append("- Every principal instalment falls in a month the business earns in")

    if capacity and capacity.get("assessable"):
        lines.append(
            f"- Annual repayment Rs {capacity['annual_repayment']:,.0f} against expected annual income "
            f"Rs {capacity['expected_annual_income']:,.0f} (debt service ratio "
            f"{capacity['debt_service_ratio']}, assessed as {capacity['verdict']})"
        )
    else:
        lines.append(
            "- No income estimate was provided, so repayment capacity has NOT been verified. "
            "Treat the ability to repay as unproven."
        )

    return "\n".join(lines)


def generate_stress_test(
    location: str,
    category: str,
    financials: Dict[str, Any],
    amortization: Dict[str, Any],
    osm_summary: Dict[str, Any],
    alignment: Optional[Dict[str, Any]] = None,
    capacity: Optional[Dict[str, Any]] = None,
    competitor_names: Optional[List[str]] = None,
) -> StressTestReport:
    """
    Run the adversarial review against an already-generated proposal.

    Raises:
        EnvironmentError: if the LLM is not configured.
        ValueError:       if the model returns unusable JSON after one retry.
    """
    client = _get_groq_client()

    prompt = SYSTEM_PROMPT.format(
        location=location,
        category=category,
        project_cost=float(financials.get("project_cost") or 0),
        margin=float(financials.get("margin_contribution") or 0),
        loan=float(financials.get("loan_amount") or 0),
        rate=financials.get("interest_rate_pct", "?"),
        tenure_months=financials.get("tenure_months", "?"),
        quarterly_emi=float(amortization.get("quarterly_emi") or 0),
        total_interest=float(amortization.get("total_interest_paid") or 0),
        radius=osm_summary.get("radius_km", 5),
        competitor_count=osm_summary.get("competitor_count", 0),
        density=osm_summary.get("density_level", "unknown"),
        extra_facts=_fact_lines(alignment, capacity, competitor_names),
    )

    def _call() -> StressTestReport:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=STRESS_MODEL,
            response_format={"type": "json_object"},
            # Lower than the advisory pass: a risk review should be consistent
            # run to run, not creative.
            temperature=0.2,
            max_tokens=2048,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return StressTestReport(**json.loads(raw))

    try:
        logger.info("Running stress test (%s) for %s @ %s", STRESS_MODEL, category, location)
        return _call()
    except (json.JSONDecodeError, ValidationError) as first:
        logger.warning("Stress test returned invalid JSON (%s). Retrying once.", first)

    try:
        return _call()
    except (json.JSONDecodeError, ValidationError) as final:
        raise ValueError(f"Stress test returned invalid JSON after 2 attempts: {final}") from final
