"""
LLM Advisory Engine — Gemini 1.5 Flash
========================================
Generates the qualitative business feasibility analysis (SWOT, market reach,
threats, pricing strategy) using a strict, bounded system prompt.

CRITICAL CONSTRAINTS:
  1. The LLM is NEVER shown or asked to calculate financial numbers.
  2. All OSM competitor data is injected verbatim — the LLM cannot invent it.
  3. Response is validated against the FeasibilityReport Pydantic schema.
     If validation fails, one retry is attempted before raising an error.
  4. The system prompt explicitly forbids demographic invention.
"""

import json
import logging
import os
from typing import Any, Dict

from groq import Groq
from pydantic import ValidationError

from app.api.models import FeasibilityReport
from app.core.osm_fetcher import OSMResult

logger = logging.getLogger(__name__)

# llama-3.1-70b-versatile was decommissioned by Groq; gpt-oss-120b is the
# current recommended replacement (override via GROQ_MODEL env var).
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


# ---------------------------------------------------------------------------
# System Prompt Template
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
Role & Persona:
You are an expert Rural Business Advisor and Credit Risk Assessor for Indian \
micro-enterprises. Your objective is to evaluate the viability of a proposed \
business in a specific geographic location and generate a highly localized, \
data-driven Business Feasibility Report.

STRICT RULES — Violations will invalidate the report:
1. Do NOT invent or assume any demographic statistics, population figures, or \
income data not derivable from the provided inputs.
2. Do NOT mention AI, machine learning, or that this analysis is generated automatically.
3. Do NOT use conversational filler phrases.
4. Base your competitor analysis EXCLUSIVELY on the OSM competitor data provided below.
5. You MUST return ONLY a raw JSON object matching the schema. Do not wrap it in markdown \
code fences, do not include any other text before or after the JSON.

Input Data (Ground Truth):
- Geographic Location: {location}
- Proposed Business Category: {category}
- Total Project Cost: ₹{project_cost:,.0f} (Own Margin: ₹{margin:,.0f} + Loan: ₹{loan:,.0f})
- Competitor Density (OSM API): {competitor_count} businesses found within {radius}km
- Density Classification: {density_level}
- Sample Competitor Names (OSM): {competitor_names}
- OSM Tags Queried: {osm_tags}

Required Output Schema (strict JSON, no markdown):
{{
  "market_reach": "Detailed paragraph on how the business will access consumers \
within 5–10 km. Mention specific distribution channels like village haats, block-level \
mandis, direct-to-household, or road-side vending.",
  "opportunity_analysis": "Paragraph on unserved or underserved niches for \
{category} in this specific local economy.",
  "competitor_mapping": "Analysis based STRICTLY on the {competitor_count} \
competitors found by OSM. If sparse, identify first-mover advantage or reasons \
for the gap. If dense, suggest differentiation strategies for a ₹{project_cost:,.0f} enterprise.",
  "swot": {{
    "strengths": ["Point 1", "Point 2", "Point 3"],
    "weaknesses": ["Point 1", "Point 2", "Point 3"],
    "opportunities": ["Point 1", "Point 2", "Point 3"],
    "threats": ["Point 1", "Point 2", "Point 3"]
  }},
  "hyper_local_threats": [
    "Risk specific to supply chain/logistics in semi-rural India",
    "Seasonal or weather-driven demand risk",
    "Single-buyer or middleman dependency risk",
    "Any other hyper-local risk relevant to {location}"
  ],
  "pricing_strategy": "Paragraph on optimal pricing based on rural purchasing power. \
Recommend low-margin/high-volume vs premium local quality. Suggest concrete price points."
}}
"""


# ---------------------------------------------------------------------------
# Core Function
# ---------------------------------------------------------------------------
def _get_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY environment variable is not set.")
    return Groq(api_key=api_key)


def generate_feasibility_report(
    location: str,
    category: str,
    project_cost: float,
    margin_capital: float,
    loan_amount: float,
    osm_result: OSMResult,
) -> FeasibilityReport:
    """
    Generate a structured, bounded feasibility report via Groq.

    The LLM prompt is constructed with all real data injected - the model
    cannot invent market or competitor information because it is all supplied.

    Args:
        location:       Normalized location string (village, block, district).
        category:       Business category (e.g., "dairy", "grocery").
        project_cost:   Total project cost in INR.
        margin_capital: User's own capital (10% of project cost).
        loan_amount:    Loan component (90% of project cost).
        osm_result:     OSMResult from the Overpass API fetch.

    Returns:
        Validated FeasibilityReport Pydantic model.

    Raises:
        EnvironmentError:  If API key is missing.
        ValueError:        If LLM returns invalid JSON after retry.
    """
    client = _get_groq_client()

    competitor_names = (
        ", ".join([c.name for c in osm_result.competitors[:10]])
        if osm_result.competitors
        else "No named competitors found in OSM data"
    )

    prompt = SYSTEM_PROMPT.format(
        location=location,
        category=category,
        project_cost=project_cost,
        margin=margin_capital,
        loan=loan_amount,
        competitor_count=osm_result.competitor_count,
        radius=osm_result.radius_km,
        density_level=osm_result.density_level,
        competitor_names=competitor_names,
        osm_tags=", ".join(osm_result.osm_tags_used),
    )

    def _call_and_validate() -> FeasibilityReport:
        response = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=GROQ_MODEL,
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2048,
        )
        raw_text = response.choices[0].message.content.strip()
        # Strip any accidental markdown fences
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        parsed: Dict[str, Any] = json.loads(raw_text)
        return FeasibilityReport(**parsed)

    # First attempt
    try:
        logger.info(f"Calling Groq ({GROQ_MODEL}) for feasibility report: {category} @ {location}")
        return _call_and_validate()
    except (json.JSONDecodeError, ValidationError) as first_err:
        logger.warning(f"First LLM attempt failed: {first_err}. Retrying once.")

    # One retry
    try:
        return _call_and_validate()
    except (json.JSONDecodeError, ValidationError) as final_err:
        raise ValueError(
            f"LLM returned invalid JSON after 2 attempts. Final error: {final_err}"
        ) from final_err
