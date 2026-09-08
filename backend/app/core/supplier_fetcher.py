"""
OSM Overpass API — Supplier / Service-Provider Fetcher
======================================================
Queries OpenStreetMap for suppliers, service providers, and linkage
points relevant to the user's chosen business category.

This complements the competitor fetcher (osm_fetcher.py) by finding
the SUPPLY CHAIN — not competitors, but the businesses the user will
buy from or partner with.
"""

import logging
from typing import Dict, List

from app.core.osm_fetcher import (
    Competitor,
    OSMResult,
    _build_overpass_query,
    _classify_density,
    OVERPASS_URL,
    DEFAULT_RADIUS_KM,
)
import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Category → Supplier OSM Tag Mapping
# ---------------------------------------------------------------------------

SUPPLIER_TAG_MAP: Dict[str, List[tuple]] = {
    "dairy": [
        ("amenity", "veterinary"),
        ("shop", "agrarian"),
        ("shop", "farm_supply"),
        ("amenity", "marketplace"),
    ],
    "grocery": [
        ("shop", "wholesale"),
        ("amenity", "marketplace"),
        ("industrial", "warehouse"),
        ("shop", "frozen_food"),
    ],
    "vegetables": [
        ("amenity", "marketplace"),
        ("shop", "wholesale"),
        ("shop", "farm"),
        ("landuse", "farmland"),
    ],
    "pharmacy": [
        ("amenity", "hospital"),
        ("amenity", "clinic"),
        ("shop", "medical_supply"),
    ],
    "tailoring": [
        ("shop", "fabric"),
        ("shop", "sewing"),
        ("shop", "haberdashery"),
        ("amenity", "marketplace"),
    ],
    "electronics": [
        ("shop", "wholesale"),
        ("shop", "electronics"),
        ("amenity", "post_office"),   # logistics/courier
    ],
    "restaurant": [
        ("amenity", "marketplace"),
        ("shop", "wholesale"),
        ("shop", "greengrocer"),
        ("amenity", "fuel"),          # LPG
    ],
    "bakery": [
        ("shop", "wholesale"),
        ("amenity", "marketplace"),
        ("shop", "farm_supply"),      # flour
    ],
    "hardware": [
        ("shop", "wholesale"),
        ("industrial", "warehouse"),
        ("shop", "trade"),
    ],
    "clothing": [
        ("shop", "fabric"),
        ("shop", "wholesale"),
        ("amenity", "marketplace"),
    ],
    "cattle_feed": [
        ("amenity", "veterinary"),
        ("shop", "farm_supply"),
        ("industrial", "mill"),
    ],
    "flour_mill": [
        ("shop", "agrarian"),
        ("amenity", "marketplace"),
        ("shop", "farm"),
    ],
    "beauty_parlour": [
        ("shop", "cosmetics"),
        ("shop", "wholesale"),
    ],
    "poultry": [
        ("amenity", "veterinary"),
        ("shop", "agrarian"),
        ("shop", "farm_supply"),
    ],
    "fuel": [
        ("amenity", "fuel"),
        ("shop", "gas"),
    ],
    "auto_repair": [
        ("shop", "car_parts"),
        ("shop", "tyres"),
        ("amenity", "fuel"),
    ],
    "stationery": [
        ("shop", "wholesale"),
        ("amenity", "post_office"),
    ],
    "fertilizer": [
        ("shop", "agrarian"),
        ("shop", "farm_supply"),
        ("industrial", "warehouse"),
    ],
    "general_store": [
        ("shop", "wholesale"),
        ("amenity", "marketplace"),
        ("industrial", "warehouse"),
    ],
}

DEFAULT_SUPPLIER_TAGS = [("amenity", "marketplace"), ("shop", "wholesale")]


def fetch_suppliers(
    lat: float,
    lon: float,
    business_category: str,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> OSMResult:
    """
    Fetch nearby suppliers/service-providers for the given business category.

    Uses the same Overpass API mechanism as fetch_competitors but with
    supplier-oriented OSM tags.

    Args:
        lat:               Target latitude.
        lon:               Target longitude.
        business_category: The proposed business category.
        radius_km:         Search radius in km (default 10).

    Returns:
        OSMResult with supplier list and density classification.
    """
    category_key = business_category.lower().strip().replace(" ", "_")
    tags = SUPPLIER_TAG_MAP.get(category_key, DEFAULT_SUPPLIER_TAGS)
    radius_m = int(radius_km * 1000)
    tags_used = [f"{k}={v}" for k, v in tags]

    query = _build_overpass_query(lat, lon, radius_m, tags)
    logger.info(
        f"Fetching supplier data for category='{business_category}' "
        f"at ({lat},{lon}) r={radius_km}km"
    )

    with httpx.Client(timeout=30.0) as client:
        try:
            response = client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "AIBusinessAdvisor/1.0",
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as e:
            logger.error(f"Overpass API error (suppliers): {e}")
            data = {"elements": []}

    elements = data.get("elements", [])
    suppliers: list[Competitor] = []

    for el in elements:
        tags_el = el.get("tags", {})
        name = (
            tags_el.get("name:en")
            or tags_el.get("name")
            or tags_el.get("brand")
            or "Unnamed Supplier"
        )
        cat = (
            tags_el.get("shop")
            or tags_el.get("amenity")
            or tags_el.get("industrial")
            or "supplier"
        )
        suppliers.append(
            Competitor(
                name=name,
                category=cat,
                distance_estimate=f"within {radius_km}km radius",
                osm_id=str(el.get("id")),
            )
        )

    density = _classify_density(len(suppliers))
    logger.info(f"Found {len(suppliers)} suppliers. Density: {density}")

    return OSMResult(
        query_location=f"{lat},{lon}",
        radius_km=radius_km,
        business_category=business_category,
        competitor_count=len(suppliers),
        competitors=suppliers,
        density_level=density,
        osm_tags_used=tags_used,
    )
