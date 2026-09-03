"""
OSM Overpass API — Competitor Density Fetcher
==============================================
Queries OpenStreetMap for existing businesses of the proposed category
within a configurable radius around the target location.

This data is treated as GROUND TRUTH for the LLM advisory engine.
The LLM must base its competitor analysis ONLY on this data.

Category→OSM Tag mapping is maintained here. Add new categories as needed.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_RADIUS_KM = 10


# ---------------------------------------------------------------------------
# Category → OSM Tag Mapping
# ---------------------------------------------------------------------------
# Each category maps to a list of (key, value) OSM tag pairs.
# All matching POIs are fetched and aggregated.

CATEGORY_TAG_MAP: Dict[str, List[tuple]] = {
    "dairy":          [("shop", "dairy"), ("amenity", "dairy"), ("shop", "farm")],
    "grocery":        [("shop", "convenience"), ("shop", "supermarket"), ("shop", "general")],
    "vegetables":     [("shop", "greengrocer"), ("amenity", "marketplace")],
    "pharmacy":       [("amenity", "pharmacy"), ("shop", "chemist")],
    "tailoring":      [("shop", "tailor"), ("craft", "tailor")],
    "electronics":    [("shop", "electronics"), ("shop", "mobile_phone")],
    "restaurant":     [("amenity", "restaurant"), ("amenity", "fast_food"), ("amenity", "cafe")],
    "bakery":         [("shop", "bakery"), ("amenity", "bakery")],
    "hardware":       [("shop", "hardware"), ("shop", "doityourself")],
    "clothing":       [("shop", "clothes"), ("shop", "fashion")],
    "cattle_feed":    [("shop", "agrarian"), ("shop", "farm_supply")],
    "flour_mill":     [("shop", "flour"), ("industrial", "mill")],
    "beauty_parlour": [("shop", "beauty"), ("shop", "hairdresser")],
    "poultry":        [("shop", "poultry"), ("landuse", "farmyard")],
    "fuel":           [("amenity", "fuel"), ("shop", "fuel")],
    "auto_repair":    [("shop", "car_repair"), ("shop", "motorcycle_repair")],
    "stationery":     [("shop", "stationery"), ("shop", "books")],
    "fertilizer":     [("shop", "agrarian"), ("shop", "agricultural_supplies")],
    "general_store":  [("shop", "general"), ("shop", "department_store")],
}

# Fallback tags for unrecognized categories
DEFAULT_TAGS = [("shop", "yes"), ("amenity", "marketplace")]


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class Competitor:
    name: str
    category: str
    distance_estimate: str  # e.g., "within 10km radius"
    osm_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "category": self.category,
            "distance_estimate": self.distance_estimate,
        }


@dataclass
class OSMResult:
    query_location: str
    radius_km: float
    business_category: str
    competitor_count: int
    competitors: List[Competitor] = field(default_factory=list)
    density_level: str = "Unknown"   # "Sparse" | "Moderate" | "Dense"
    osm_tags_used: List[str] = field(default_factory=list)

    def to_summary_dict(self) -> dict:
        return {
            "competitor_count": self.competitor_count,
            "density_level": self.density_level,
            "radius_km": self.radius_km,
            "sample_competitors": [c.to_dict() for c in self.competitors[:10]],
            "osm_tags_queried": self.osm_tags_used,
        }


# ---------------------------------------------------------------------------
# Density Classification
# ---------------------------------------------------------------------------

def _classify_density(count: int) -> str:
    if count == 0:
        return "None (First-Mover Opportunity)"
    elif count <= 3:
        return "Sparse"
    elif count <= 10:
        return "Moderate"
    else:
        return "Dense (Saturated)"


# ---------------------------------------------------------------------------
# Overpass Query Builder
# ---------------------------------------------------------------------------

def _build_overpass_query(lat: float, lon: float, radius_m: int, tags: List[tuple]) -> str:
    """Build an Overpass QL query for all given tags within radius."""
    union_parts = []
    for key, value in tags:
        union_parts.append(f'  node["{key}"="{value}"](around:{radius_m},{lat},{lon});')
        union_parts.append(f'  way["{key}"="{value}"](around:{radius_m},{lat},{lon});')

    union_body = "\n".join(union_parts)
    return f"""
[out:json][timeout:25];
(
{union_body}
);
out center tags;
""".strip()


# ---------------------------------------------------------------------------
# Core Function
# ---------------------------------------------------------------------------

def fetch_competitors(
    lat: float,
    lon: float,
    business_category: str,
    radius_km: float = DEFAULT_RADIUS_KM,
) -> OSMResult:
    """
    Fetch all existing businesses of the given category within radius_km
    of (lat, lon) using the OSM Overpass API.

    Args:
        lat:               Target latitude.
        lon:               Target longitude.
        business_category: The proposed business category (normalized lowercase).
        radius_km:         Search radius in kilometers. Default: 10.

    Returns:
        OSMResult with competitor list and density classification.

    Raises:
        httpx.HTTPError: On network failures.
    """
    category_key = business_category.lower().strip().replace(" ", "_")
    tags = CATEGORY_TAG_MAP.get(category_key, DEFAULT_TAGS)
    radius_m = int(radius_km * 1000)
    tags_used = [f"{k}={v}" for k, v in tags]

    query = _build_overpass_query(lat, lon, radius_m, tags)
    logger.info(f"Fetching OSM data for category='{business_category}' at ({lat},{lon}) r={radius_km}km")

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
            data: Dict[str, Any] = response.json()
        except httpx.HTTPError as e:
            logger.error(f"Overpass API error: {e}. Returning empty competitor list.")
            data = {"elements": []}

    elements = data.get("elements", [])
    competitors: List[Competitor] = []

    for el in elements:
        tags_el = el.get("tags", {})
        name = (
            tags_el.get("name:en")
            or tags_el.get("name")
            or tags_el.get("brand")
            or "Unnamed Business"
        )
        cat = tags_el.get("shop") or tags_el.get("amenity") or business_category
        competitors.append(Competitor(
            name=name,
            category=cat,
            distance_estimate=f"within {radius_km}km radius",
            osm_id=str(el.get("id")),
        ))

    density = _classify_density(len(competitors))
    logger.info(f"Found {len(competitors)} competitors. Density: {density}")

    return OSMResult(
        query_location=f"{lat},{lon}",
        radius_km=radius_km,
        business_category=business_category,
        competitor_count=len(competitors),
        competitors=competitors,
        density_level=density,
        osm_tags_used=tags_used,
    )
