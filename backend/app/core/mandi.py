"""
Mandi Price Feed — AGMARKNET via data.gov.in
=============================================
Fetches real daily APMC arrivals (min / max / modal price per quintal) from the
Government of India open-data platform.

Set ``DATA_GOV_API_KEY`` in ``backend/.env`` (free key from https://data.gov.in).
Without a key, or if the upstream call fails, the feed degrades to a clearly
labelled sample set — ``is_live`` is False and ``source`` says so, so the UI can
badge it honestly rather than passing simulated numbers off as live.

Day-over-day trend is computed from the two most recent arrival dates present in
the same response, so no price history needs to be stored.
"""

import logging
import os
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# "Variety-wise Daily Market Prices Data of Commodity" — AGMARKNET
RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
API_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"
DEFAULT_STATE = os.getenv("MANDI_STATE", "Maharashtra")

# Commodity -> (display category, material-symbols icon)
CATEGORY_MAP: Dict[str, tuple] = {
    "wheat": ("Cereals", "grass"),
    "paddy": ("Cereals", "rice_bowl"),
    "rice": ("Cereals", "rice_bowl"),
    "jowar": ("Cereals", "grass"),
    "bajra": ("Cereals", "grass"),
    "maize": ("Cereals", "grass"),
    "soyabean": ("Oilseeds", "eco"),
    "soybean": ("Oilseeds", "eco"),
    "groundnut": ("Oilseeds", "eco"),
    "mustard": ("Oilseeds", "eco"),
    "sunflower": ("Oilseeds", "eco"),
    "cotton": ("Cash Crops", "local_florist"),
    "sugarcane": ("Cash Crops", "local_florist"),
    "arhar": ("Pulses", "eco"),
    "tur": ("Pulses", "eco"),
    "gram": ("Pulses", "eco"),
    "moong": ("Pulses", "eco"),
    "urad": ("Pulses", "eco"),
    "lentil": ("Pulses", "eco"),
    "onion": ("Vegetables", "adjust"),
    "potato": ("Vegetables", "adjust"),
    "tomato": ("Vegetables", "adjust"),
}


def _classify(commodity: str) -> tuple:
    key = commodity.strip().lower()
    for token, pair in CATEGORY_MAP.items():
        if token in key:
            return pair
    return ("Other", "inventory_2")


def _parse_date(value: str) -> Optional[datetime]:
    """AGMARKNET arrival dates arrive as DD/MM/YYYY."""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except (ValueError, TypeError):
            continue
    return None


def _num(value: Any) -> Optional[float]:
    try:
        return float(str(value).strip())
    except (ValueError, TypeError, AttributeError):
        return None


def _style(trend: str) -> Dict[str, str]:
    """UI class bundle — matches the tokens the MarketPrices card expects."""
    if trend == "up":
        return {
            "status": "High Demand",
            "trendColor": "text-primary",
            "trendBg": "bg-primary-container/20 text-on-primary-container",
            "barColor": "bg-primary/20",
        }
    if trend == "down":
        return {
            "status": "Low Demand",
            "trendColor": "text-error",
            "trendBg": "bg-error-container/20 text-on-error-container",
            "barColor": "bg-outline/20",
        }
    return {
        "status": "Stable",
        "trendColor": "text-on-surface-variant",
        "trendBg": "bg-surface-variant text-on-surface-variant",
        "barColor": "bg-outline/20",
    }


def _to_card(record: Dict[str, Any], prior_modal: Optional[float], index: int) -> Optional[Dict[str, Any]]:
    """Normalise one AGMARKNET record into the shape the price grid renders."""
    modal = _num(record.get("modal_price"))
    if modal is None or modal <= 0:
        return None

    low = _num(record.get("min_price")) or modal
    high = _num(record.get("max_price")) or modal
    commodity = str(record.get("commodity") or "Commodity").strip()
    category, icon = _classify(commodity)

    if prior_modal and prior_modal > 0:
        diff = modal - prior_modal
        trend = "up" if diff > 0 else ("down" if diff < 0 else "flat")
        trend_percent = round(abs(diff) / prior_modal * 100, 1)
        trend_basis = "day-on-day modal price"
    else:
        diff, trend, trend_percent = 0.0, "flat", 0.0
        trend_basis = "no prior arrival in feed"

    # Bar shows where today's modal sits inside the day's min-max band.
    span = high - low
    position = ((modal - low) / span * 100) if span > 0 else 50.0

    return {
        "id": index,
        "name": commodity,
        "grade": str(record.get("grade") or record.get("variety") or "—").strip(),
        "mandi": str(record.get("market") or "APMC").strip(),
        "district": str(record.get("district") or "").strip(),
        "category": category,
        "icon": icon,
        "price": int(round(modal)),
        "minPrice": int(round(low)),
        "maxPrice": int(round(high)),
        "unit": "quintal",
        "arrivalDate": record.get("arrival_date"),
        "trend": trend,
        "trendAmount": int(round(abs(diff))),
        "trendPercent": trend_percent,
        "trendBasis": trend_basis,
        "barHeight": f"{max(8, min(100, round(position)))}%",
        **_style(trend),
    }


def _fetch_records(state: str, limit: int) -> List[Dict[str, Any]]:
    """Raw AGMARKNET records for a state. Split out so tests can stub the network."""
    api_key = os.getenv("DATA_GOV_API_KEY", "")
    if not api_key:
        raise EnvironmentError("DATA_GOV_API_KEY is not set")

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(
            API_URL,
            params={
                "api-key": api_key,
                "format": "json",
                "limit": limit,
                "filters[state]": state,
            },
        )
        resp.raise_for_status()
        return resp.json().get("records", [])


def fetch_live_prices(state: str = DEFAULT_STATE, limit: int = 400) -> List[Dict[str, Any]]:
    """
    Pull recent arrivals for `state` and return one card per (commodity, market),
    using the most recent arrival date and diffing against the previous one.

    Raises on missing key or upstream failure — the caller decides the fallback.
    """
    records = _fetch_records(state, limit)
    if not records:
        raise ValueError(f"AGMARKNET returned no records for state={state}")

    # Group by (commodity, market) and keep observations sorted newest-first.
    grouped: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = (
            str(record.get("commodity") or "").strip().lower(),
            str(record.get("market") or "").strip().lower(),
        )
        if key[0]:
            grouped[key].append(record)

    cards: List[Dict[str, Any]] = []
    for index, observations in enumerate(grouped.values(), start=1):
        observations.sort(
            key=lambda r: _parse_date(r.get("arrival_date")) or datetime.min,
            reverse=True,
        )
        latest = observations[0]
        prior = _num(observations[1].get("modal_price")) if len(observations) > 1 else None
        card = _to_card(latest, prior, index)
        if card:
            cards.append(card)

    # Busiest markets first, then alphabetical — keeps the grid stable.
    cards.sort(key=lambda c: (c["category"], c["name"]))
    return cards


# ---------------------------------------------------------------------------
# Labelled fallback — used only when the live feed is unavailable
# ---------------------------------------------------------------------------

_SAMPLE_RECORDS: List[Dict[str, Any]] = [
    {"commodity": "Soyabean", "variety": "Yellow", "market": "Nagpur", "district": "Nagpur", "min_price": 4600, "max_price": 5010, "modal_price": 4820},
    {"commodity": "Cotton", "variety": "Medium Staple", "market": "Rajkot", "district": "Rajkot", "min_price": 6400, "max_price": 7150, "modal_price": 6800},
    {"commodity": "Arhar (Tur)", "variety": "Premium", "market": "Akola", "district": "Akola", "min_price": 9900, "max_price": 10850, "modal_price": 10400},
    {"commodity": "Wheat", "variety": "Grade A", "market": "Akola", "district": "Akola", "min_price": 2310, "max_price": 2580, "modal_price": 2450},
    {"commodity": "Onion", "variety": "Red", "market": "Lasalgaon", "district": "Nashik", "min_price": 1750, "max_price": 2600, "modal_price": 2200},
    {"commodity": "Gram (Chana)", "variety": "Standard", "market": "Akola", "district": "Akola", "min_price": 4950, "max_price": 5450, "modal_price": 5200},
]


def sample_prices() -> List[Dict[str, Any]]:
    """
    Static reference prices for offline demos. Nothing is randomised and no
    trend is invented — callers must surface ``is_live: false`` alongside these.
    """
    cards = []
    for index, record in enumerate(_SAMPLE_RECORDS, start=1):
        card = _to_card(record, prior_modal=None, index=index)
        if card:
            card["grade"] = record["variety"]
            card["arrivalDate"] = None
            card["trendBasis"] = "sample data — no live arrival"
            cards.append(card)
    return cards
