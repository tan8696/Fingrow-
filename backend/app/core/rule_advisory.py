"""
Rule-based narrative — used when no language model can be reached
====================================================================
The feasibility narrative and the stress test normally come from an LLM. When
that fails — no key configured, or the provider refusing the network, which is
exactly what Groq does from some Indian ISPs — the report used to fail outright
with a 500, taking the deterministic figures down with it.

This module produces the same shapes from rules instead. Every sentence is
derived from a value the app measured or computed: the Overpass competitor
count, the scheme terms, the crop-calendar income pattern. Nothing is invented,
and the decision receipt records that the narrative was rule-based rather than
model-written, so the substitution is never hidden.
"""

from typing import Any, Dict, List, Optional

from app.core.crop_calendar import income_pattern

# What a small operator in each trade typically depends on. General knowledge
# about the trade, not claims about the specific location.
TRADE_PROFILES: Dict[str, Dict[str, str]] = {
    "dairy": {
        "channel": "daily milk collection by the village cooperative or a direct doorstep round",
        "input": "fodder and cattle feed",
        "risk": "fodder prices rising in the dry months while milk procurement prices stay fixed",
        "edge": "a reliable morning and evening supply that households can plan around",
    },
    "poultry": {
        "channel": "weekly sales to local meat shops, hotels and the block-level haat",
        "input": "chicks and commercial feed",
        "risk": "disease outbreaks wiping out a batch before it reaches sale weight",
        "edge": "fresher birds than stock trucked in from district towns",
    },
    "vegetables": {
        "channel": "the weekly village haat and direct sales to nearby households",
        "input": "seed, fertiliser and irrigation",
        "risk": "gluts at harvest pushing mandi prices below the cost of transport",
        "edge": "same-day freshness that trucked produce cannot match",
    },
    "grocery": {
        "channel": "walk-in trade from households within walking distance",
        "input": "wholesale stock bought on short credit",
        "risk": "working capital tied up in slow-moving stock and customer credit",
        "edge": "extending small credit to known customers, which chain stores do not",
    },
    "general_store": {
        "channel": "walk-in trade from households within walking distance",
        "input": "wholesale stock bought on short credit",
        "risk": "working capital tied up in slow-moving stock and customer credit",
        "edge": "convenience and credit for regular customers",
    },
    "tailoring": {
        "channel": "orders from households, schools and wedding-season demand",
        "input": "fabric, thread and machine maintenance",
        "risk": "income concentrated in festival and wedding months",
        "edge": "fittings and alterations that ready-made clothing cannot offer",
    },
    "bakery": {
        "channel": "daily walk-in trade and supply to tea stalls",
        "input": "flour, sugar, oil and fuel",
        "risk": "wastage of unsold stock with a short shelf life",
        "edge": "fresh daily bake against packaged goods",
    },
    "flour_mill": {
        "channel": "custom milling for farming households after each harvest",
        "input": "electricity and machine upkeep",
        "risk": "long idle stretches between harvests with fixed power costs",
        "edge": "milling on the spot rather than a trip to town",
    },
    "cattle_feed": {
        "channel": "sales to dairy farmers across the surrounding villages",
        "input": "bulk ingredients bought ahead of the season",
        "risk": "ingredient prices moving faster than feed can be repriced",
        "edge": "being nearer than the district distributor",
    },
    "fertilizer": {
        "channel": "sales to farmers at Kharif and Rabi sowing",
        "input": "licensed stock bought ahead of each sowing season",
        "risk": "all annual income arriving in two short sowing windows",
        "edge": "stock on hand exactly when farmers need to sow",
    },
}

DEFAULT_PROFILE = {
    "channel": "direct trade with households and small businesses nearby",
    "input": "stock and working capital",
    "risk": "slow early months while a regular customer base is built",
    "edge": "being local and known to customers",
}


def _profile(category: str) -> Dict[str, str]:
    return TRADE_PROFILES.get(str(category or "").strip().lower(), DEFAULT_PROFILE)


def _label(category: str) -> str:
    return str(category or "business").replace("_", " ")


def _inr(amount: float) -> str:
    amount = float(amount or 0)
    if amount >= 100_000:
        return f"Rs {amount / 100_000:.2f} lakh"
    return f"Rs {amount:,.0f}"


def _score(competitors: int, seasonal: bool, micro_scheme: bool) -> int:
    """
    A transparent score from three measured factors, so it can be explained
    line by line rather than taken on trust.
    """
    score = 60
    if competitors == 0:
        score += 12      # first mover, but unproven demand
    elif competitors <= 3:
        score += 15      # demand exists and is under-served
    elif competitors <= 10:
        score += 3
    else:
        score -= 15      # saturated
    score += -8 if seasonal else 5
    score += 5 if micro_scheme else 0
    return max(20, min(95, score))


def feasibility_report(
    location: str,
    category: str,
    project_cost: float,
    margin_capital: float,
    loan_amount: float,
    osm_result: Any,
    scheme_name: str = "",
    interest_rate_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """Build a FeasibilityReport-shaped dict from measured inputs only."""
    competitors = int(getattr(osm_result, "competitor_count", 0) or 0)
    radius = getattr(osm_result, "radius_km", 5)
    density = getattr(osm_result, "density_level", "Unknown")
    names = [c.name for c in (getattr(osm_result, "competitors", None) or [])[:5] if getattr(c, "name", None)]

    trade = _profile(category)
    label = _label(category)
    pattern = income_pattern(category)
    seasonal = not pattern["steady"]
    micro = "micro" in str(scheme_name).lower()
    score = _score(competitors, seasonal, micro)
    rate = f"{interest_rate_pct}%" if interest_rate_pct is not None else "the scheme rate"

    if density == "Not measured":
        competition = (
            f"The competitor lookup did not complete, so local competition was not "
            f"measured for this report. Count {label} businesses within {radius} km "
            f"on foot before relying on the score."
        )
        competitor_mapping = (
            f"Not measured: the OpenStreetMap lookup did not complete. Survey the "
            f"area within {radius} km before committing capital."
        )
    elif competitors == 0:
        competition = (
            f"OpenStreetMap lists no {label} businesses within {radius} km. That can mean "
            f"an unserved market, or simply that local shops are not mapped — worth "
            f"confirming on foot before committing capital."
        )
        competitor_mapping = (
            f"No mapped competitors within {radius} km. Treat this as a first-mover "
            f"position only after walking the area: informal businesses are often "
            f"missing from maps."
        )
    else:
        named = f" (including {', '.join(names)})" if names else ""
        competition = (
            f"OpenStreetMap lists {competitors} {label} business"
            f"{'es' if competitors != 1 else ''} within {radius} km{named}, "
            f"which classifies the area as {density.lower()}."
        )
        competitor_mapping = (
            f"{competitors} mapped competitor{'s' if competitors != 1 else ''} within "
            f"{radius} km{named}. "
            + (
                "Density is low enough that demand appears under-served; differentiate on "
                "reliability and service rather than price."
                if competitors <= 3
                else "Density is high, so compete on a niche, location or service the existing "
                "businesses do not cover rather than on price alone."
                if competitors > 10
                else "Competition is moderate: there is room for another operator that is "
                "clearly better on one dimension customers care about."
            )
        )

    seasonality = (
        f"Income for {label} is seasonal — {pattern['note'].lower()} — so repayments "
        f"falling outside those months need savings set aside in advance."
        if seasonal
        else f"{label.capitalize()} earns through the year ({pattern['note'].lower()}), "
        f"which suits a fixed monthly instalment."
    )

    analysis = (
        f"Score {score}/100, built from three measured factors. "
        f"Competition: {competition} "
        f"Income pattern: {seasonality} "
        f"Financing: a {_inr(project_cost)} project with {_inr(margin_capital)} of own "
        f"capital and a {_inr(loan_amount)} loan under the {scheme_name or 'selected scheme'} "
        f"at {rate}. "
        f"This narrative was produced by rules from those figures because the language "
        f"model was unavailable; the figures themselves are identical either way."
    )

    return {
        "analysis": analysis,
        "feasibility_score": score,
        "market_reach": (
            f"Reach customers within {radius} km of {location} through {trade['channel']}. "
            f"Start with the households and businesses closest to the site and widen the "
            f"radius as repeat customers are established."
        ),
        "opportunity_analysis": (
            f"The opening for a new {label} business here rests on {trade['edge']}. "
            + (
                "With few or no mapped competitors, the first task is proving demand at a "
                "small scale before spending the full project cost."
                if competitors <= 3
                else "With established competitors nearby, the opportunity is a specific gap "
                "they leave rather than the market as a whole."
            )
        ),
        "competitor_mapping": competitor_mapping,
        "swot": {
            "strengths": [
                f"Own contribution of {_inr(margin_capital)} shows commitment to the lender",
                f"Scheme financing at {rate} is cheaper than informal credit",
                f"Local advantage: {trade['edge']}",
            ],
            "weaknesses": [
                f"Dependence on {trade['input']}, whose costs are outside the owner's control",
                "No trading history yet to demonstrate repayment capacity",
                "Loan repayments begin before the business is fully established",
            ],
            "opportunities": [
                (
                    f"{competitors} mapped competitor{'s' if competitors != 1 else ''} within "
                    f"{radius} km suggests room to grow"
                    if competitors <= 3
                    else f"A niche the {competitors} existing businesses do not serve"
                ),
                "Capital subsidy under the scheme reduces the effective loan burden",
                "Selling directly to customers keeps the margin a middleman would take",
            ],
            "threats": [
                trade["risk"].capitalize(),
                (
                    f"{competitors} competitors already trading within {radius} km"
                    if competitors > 3
                    else "A competitor opening nearby once demand is visible"
                ),
                (
                    "Instalments due in months with no harvest income"
                    if seasonal
                    else "A slow first few months before regular customers are built"
                ),
            ],
        },
        "hyper_local_threats": [
            trade["risk"].capitalize(),
            "Monsoon disruption to road access and supply deliveries",
            "Dependence on a small number of suppliers or buyers setting the price",
        ],
        "pricing_strategy": (
            f"Price close to the {competitors} existing businesses rather than undercutting "
            f"them, and compete on {trade['edge']}. Review prices monthly against the cost "
            f"of {trade['input']}, which is the main margin risk."
            if competitors > 0
            else f"With no mapped competitors, set prices from cost: the full cost of "
            f"{trade['input']} plus a margin that covers the monthly instalment, then adjust "
            f"once real demand is known."
        ),
    }


def stress_test(
    category: str,
    financials: Dict[str, Any],
    amortization: Dict[str, Any],
    osm_summary: Dict[str, Any],
    alignment: Optional[Dict[str, Any]] = None,
    capacity: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a StressTestReport-shaped dict from the same measured facts."""
    label = _label(category)
    trade = _profile(category)
    competitors = int(osm_summary.get("competitor_count") or 0)
    radius = osm_summary.get("radius_km", 5)
    emi = float(amortization.get("quarterly_emi") or 0)
    at_risk = int((alignment or {}).get("at_risk_count") or 0)
    at_risk_amount = float((alignment or {}).get("at_risk_amount") or 0)
    months = ", ".join((alignment or {}).get("income_month_names", [])) or "every month"

    modes: List[Dict[str, str]] = []

    if at_risk:
        modes.append({
            "risk": "Instalments due with no income",
            "severity": "high",
            "mechanism": (
                f"{at_risk} principal instalments worth {_inr(at_risk_amount)} fall in months "
                f"when {label} earns nothing. Without savings set aside at harvest, each of "
                f"those is a missed payment."
            ),
            "evidence": f"{at_risk} instalments outside the earning months ({months})",
            "mitigation": "Ask the branch for a longer moratorium, or set aside part of each harvest in a recurring deposit.",
        })

    if capacity and capacity.get("assessable"):
        ratio = capacity.get("debt_service_ratio", 0)
        modes.append({
            "risk": "Repayment share of income",
            "severity": "high" if ratio > 0.5 else "medium" if ratio > 0.3 else "low",
            "mechanism": (
                f"Repayments take {ratio:.0%} of expected income. "
                + ("That leaves little margin for a bad season." if ratio > 0.3 else "That leaves reasonable headroom.")
            ),
            "evidence": f"Debt service ratio {ratio}",
            "mitigation": "Increase own contribution or extend the tenure to lower the instalment.",
        })
    else:
        modes.append({
            "risk": "Repayment capacity unproven",
            "severity": "medium",
            "mechanism": (
                f"No income estimate was given, so there is no evidence the business can "
                f"meet a {_inr(emi)} quarterly instalment."
            ),
            "evidence": "No expected income provided",
            "mitigation": "Estimate monthly income from comparable local businesses before applying.",
        })

    if competitors > 10:
        modes.append({
            "risk": "Saturated market",
            "severity": "high",
            "mechanism": f"{competitors} competitors within {radius} km will make it hard to win enough customers to cover the instalment.",
            "evidence": f"{competitors} mapped competitors within {radius} km",
            "mitigation": "Choose a location or niche the existing businesses do not serve.",
        })
    elif competitors == 0:
        modes.append({
            "risk": "Unproven demand",
            "severity": "medium",
            "mechanism": "No mapped competitors can mean an open market or a market with no demand. The loan assumes the former.",
            "evidence": f"0 mapped competitors within {radius} km",
            "mitigation": "Test demand at small scale before spending the full project cost.",
        })

    modes.append({
        "risk": "Input cost pressure",
        "severity": "medium",
        "mechanism": f"The margin depends on {trade['input']}; {trade['risk']}.",
        "evidence": f"Category: {label}",
        "mitigation": "Agree prices with suppliers in advance where possible and keep a cost buffer.",
    })

    severe = sum(1 for m in modes if m["severity"] == "high")
    verdict = "reconsider" if severe >= 2 else "proceed_with_changes" if severe == 1 or at_risk else "proceed"

    order = {"high": 0, "medium": 1, "low": 2}
    modes.sort(key=lambda m: order[m["severity"]])

    return {
        "verdict": verdict,
        "headline": modes[0]["mechanism"].split(". ")[0] + ".",
        "failure_modes": modes[:5],
        "what_would_have_to_be_true": [
            f"Enough customers within {radius} km to cover a {_inr(emi)} quarterly instalment",
            f"Costs of {trade['input']} staying near today's levels",
            (
                f"Income arriving in {months} as the crop calendar expects"
                if at_risk
                else "Sales holding steady through the first year"
            ),
        ],
        "break_even_pressure": (
            f"The tightest months are those outside {months}, when instalments fall due "
            f"without harvest income."
            if at_risk
            else f"Each quarter must generate at least {_inr(emi)} beyond running costs."
        ),
    }


# ---------------------------------------------------------------------------
# Offline assistant
# ---------------------------------------------------------------------------

# (keywords, page, English reply). Checked in order; the first match wins.
_NAV_RULES = [
    (("mandi", "price", "भाव", "किंमत", "bhav"), "market",
     "Opening Live Mandi Prices — daily APMC arrivals for your state."),
    (("weather", "rain", "मौसम", "हवामान", "insurance", "spray"), "weather",
     "Opening Weather & Crop Risk — the forecast, spray windows and insurance triggers."),
    (("loan", "emi", "repay", "ऋण", "कर्ज", "किस्त"), "history",
     "Opening Loan Management — your applications, schedules and repayments."),
    (("report", "feasibility", "business idea", "रिपोर्ट", "व्यवसाय"), "feasibility",
     "Opening Feasibility Reports — enter a location, capital and business to assess it."),
    (("scheme", "subsidy", "calculator", "eligib", "योजना", "सब्सिडी"), "calculator",
     "Opening the Scheme Calculator — work out eligibility, subsidy and instalments."),
    (("setting", "language", "profile", "सेटिंग"), "settings",
     "Opening Settings — profile, language and notification options."),
    (("home", "dashboard", "डैशबोर्ड"), "dashboard",
     "Back to your dashboard."),
]


def offline_chat_reply(message: str, language: str = "en") -> Dict[str, Any]:
    """
    Keyword-driven replies for when no language model is reachable. Covers the
    navigation requests people actually make in a demo, and says plainly that
    the full assistant is unavailable rather than pretending otherwise.
    """
    text = str(message or "").lower()
    for keywords, page, reply in _NAV_RULES:
        if any(k in text for k in keywords):
            return {
                "reply": reply,
                "navigate_to": page,
                "suggestions": ["Show mandi prices", "Check my loan EMI", "Run a feasibility report"],
            }
    return {
        "reply": (
            "The AI assistant can't reach its language model right now, so I can only "
            "help you find your way around. Try asking for mandi prices, weather, your "
            "loans, a feasibility report or the scheme calculator."
        ),
        "navigate_to": None,
        "suggestions": ["Show mandi prices", "Check my loan EMI", "Run a feasibility report"],
    }
