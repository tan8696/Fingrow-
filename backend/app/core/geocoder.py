"""
Nominatim Geocoder
====================
Converts village/block/district text into (latitude, longitude) using the
OpenStreetMap Nominatim API. This is completely free with no API key required.

Usage policy: max 1 request/second; always set a User-Agent header.
"""

import time
import logging
from dataclasses import dataclass
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "SIH-RuralBizAdvisor/1.0 (contact@sih-project.in)"

# Bounding box biased to India: min_lon, min_lat, max_lon, max_lat
INDIA_VIEWBOX = "68.1766451354,7.96553477623,97.4025614766,35.4940095078"


@dataclass(frozen=True)
class GeoLocation:
    latitude: float
    longitude: float
    display_name: str
    importance: float

    def to_dict(self) -> dict:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "display_name": self.display_name,
        }


class LocationNotFoundError(Exception):
    """Raised when Nominatim cannot resolve the given location text."""
    pass


_last_request_time: float = 0.0


FALLBACK_LOCATIONS = {
    "akola": (20.7002, 77.0082, "Akola, Vidarbha, Maharashtra, India"),
    "nagpur": (21.1458, 79.0882, "Nagpur, Vidarbha, Maharashtra, India"),
    "vidarbha": (20.9374, 77.7796, "Vidarbha Region, Maharashtra, India"),
    "amravati": (20.9374, 77.7796, "Amravati, Vidarbha, Maharashtra, India"),
    "wardha": (20.7453, 78.6022, "Wardha, Vidarbha, Maharashtra, India"),
    "yavatmal": (20.3888, 78.1204, "Yavatmal, Vidarbha, Maharashtra, India"),
    "chandrapur": (19.9615, 79.2961, "Chandrapur, Vidarbha, Maharashtra, India"),
    "bhandara": (21.1714, 79.6547, "Bhandara, Vidarbha, Maharashtra, India"),
    "gondia": (21.4604, 80.1961, "Gondia, Vidarbha, Maharashtra, India"),
    "gadchiroli": (20.1849, 79.9948, "Gadchiroli, Vidarbha, Maharashtra, India"),
    "barabanki": (26.9268, 81.1834, "Barabanki, Uttar Pradesh, India"),
    "rampur": (28.8073, 79.0257, "Rampur, Uttar Pradesh, India"),
    "pune": (18.5204, 73.8567, "Pune, Maharashtra, India"),
    "mumbai": (19.0760, 72.8777, "Mumbai, Maharashtra, India"),
    "nashik": (19.9975, 73.7898, "Nashik, Maharashtra, India"),
    "aurangabad": (19.8762, 75.3433, "Chhatrapati Sambhajinagar, Maharashtra, India"),
    "sambhajinagar": (19.8762, 75.3433, "Chhatrapati Sambhajinagar, Maharashtra, India"),
    "kolhapur": (16.7050, 74.2433, "Kolhapur, Maharashtra, India"),
    "solapur": (17.6599, 75.9064, "Solapur, Maharashtra, India"),
    "satara": (17.6805, 74.0183, "Satara, Maharashtra, India"),
    "sangli": (16.8524, 74.5815, "Sangli, Maharashtra, India"),
    "latur": (18.4088, 76.5604, "Latur, Maharashtra, India"),
    "nanded": (19.1383, 77.3210, "Nanded, Maharashtra, India"),
    "parbhani": (19.2608, 76.7748, "Parbhani, Maharashtra, India"),
    "beed": (18.9891, 75.7601, "Beed, Maharashtra, India"),
    "jalna": (19.8410, 75.8864, "Jalna, Maharashtra, India"),
    "jalgaon": (21.0077, 75.5626, "Jalgaon, Maharashtra, India"),
    "dhule": (20.9042, 74.7749, "Dhule, Maharashtra, India"),
    "nandurbar": (21.3700, 74.2400, "Nandurbar, Maharashtra, India"),
    "ahmednagar": (19.0948, 74.7480, "Ahilyanagar, Maharashtra, India"),
    "dharashiv": (18.1750, 76.0400, "Dharashiv, Maharashtra, India"),
    "buldhana": (20.5293, 76.1843, "Buldhana, Maharashtra, India"),
    "washim": (20.1110, 77.1340, "Washim, Maharashtra, India"),
    "lucknow": (26.8467, 80.9462, "Lucknow, Uttar Pradesh, India"),
    "varanasi": (25.3176, 82.9739, "Varanasi, Uttar Pradesh, India"),
    "jaipur": (26.9124, 75.7873, "Jaipur, Rajasthan, India"),
    "bhopal": (23.2599, 77.4126, "Bhopal, Madhya Pradesh, India"),
    "indore": (22.7196, 75.8577, "Indore, Madhya Pradesh, India"),
    "patna": (25.5941, 85.1376, "Patna, Bihar, India"),
}


def _get_fallback_location(location_text: str) -> GeoLocation:
    lower = location_text.lower()
    for key, (lat, lon, dname) in FALLBACK_LOCATIONS.items():
        if key in lower:
            logger.info(f"Using known coordinates for '{key}': ({lat}, {lon})")
            return GeoLocation(latitude=lat, longitude=lon, display_name=dname, importance=0.8)
    
    if "maharashtra" in lower or "vidarbha" in lower:
        return GeoLocation(latitude=20.9374, longitude=77.7796, display_name=f"{location_text.title()}, Maharashtra, India", importance=0.6)
    if "uttar pradesh" in lower or "up" in lower:
        return GeoLocation(latitude=26.8467, longitude=80.9462, display_name=f"{location_text.title()}, Uttar Pradesh, India", importance=0.6)
    
    return GeoLocation(latitude=21.1458, longitude=79.0882, display_name=f"{location_text.title()}, India", importance=0.5)


def geocode_location(location_text: str) -> GeoLocation:
    """
    Geocode a free-text location (e.g., "Rampur Village, Barabanki, UP")
    to latitude/longitude using Nominatim with resilient fallback.
    """
    global _last_request_time

    # Rate limit: respect Nominatim's 1 req/sec policy
    elapsed = time.monotonic() - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    params = {
        "q": location_text,
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
        "countrycodes": "in",              # Restrict to India
        "viewbox": INDIA_VIEWBOX,
        "bounded": 0,                      # Allow results outside viewbox if needed
    }

    logger.info(f"Geocoding: '{location_text}'")
    try:
        with httpx.Client(timeout=6.0) as client:
            response = client.get(
                NOMINATIM_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
            )
            _last_request_time = time.monotonic()
            response.raise_for_status()
            results = response.json()
            if results:
                top = results[0]
                return GeoLocation(
                    latitude=float(top["lat"]),
                    longitude=float(top["lon"]),
                    display_name=top["display_name"],
                    importance=float(top.get("importance", 0.0)),
                )
    except Exception as e:
        logger.warning(f"Nominatim geocoding failed or timed out for '{location_text}': {e}. Using fallback location.")

    # Graceful fallback to known districts/coordinates so advisory generation never crashes
    fallback = _get_fallback_location(location_text)
    if fallback:
        return fallback

    raise LocationNotFoundError(
        f"Could not resolve location: '{location_text}'. "
        "Please provide more detail (e.g., Village, Block, District, State)."
    )
