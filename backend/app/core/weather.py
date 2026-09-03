"""
Live Weather & Crop-Risk Module
=================================
Fetches real forecast data from the free Open-Meteo API (no key required) and
turns it into a district-level agro-climatic advisory:

  - Current conditions (temperature, humidity, wind, WMO weather code)
  - 5-day daily forecast
  - A deterministic 0-10 crop risk score with human-readable factors
  - Rule-based advisories (irrigation, pest scouting, heat stress, spraying)

Coordinates come from the location name via Nominatim (see geocoder.py), and
fall back to the Akola/Vidarbha district centroid when geocoding fails.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.geocoder import LocationNotFoundError, geocode_location

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Akola district centroid (Vidarbha) — used when no location can be resolved
DEFAULT_COORDS: Dict[str, Any] = {
    "latitude": 20.7044,
    "longitude": 77.0025,
    "display_name": "Akola, Vidarbha, Maharashtra",
}

USER_AGENT = "FinGrow-Advisory/1.0 (contact@fingrow.in)"


@dataclass(frozen=True)
class WeatherUnavailableError(Exception):
    detail: str


# ---------------------------------------------------------------------------
# WMO weather code -> (label, material icon)
# ---------------------------------------------------------------------------

def wmo_condition(code: int) -> Dict[str, Any]:
    """Map a WMO weather code to a friendly label + material-symbols icon."""
    if code == 0:
        return {"code": code, "label": "Clear sky", "icon": "wb_sunny"}
    if code in (1, 2):
        return {"code": code, "label": "Partly cloudy", "icon": "partly_cloudy_day"}
    if code == 3:
        return {"code": code, "label": "Overcast", "icon": "cloud"}
    if code in (45, 48):
        return {"code": code, "label": "Fog", "icon": "foggy"}
    if code in (51, 53, 55, 56, 57):
        return {"code": code, "label": "Drizzle", "icon": "rainy"}
    if code in (61, 63, 65, 66, 67):
        return {"code": code, "label": "Rain", "icon": "rainy"}
    if code in (71, 73, 75, 77):
        return {"code": code, "label": "Snow", "icon": "weather_snowy"}
    if code in (80, 81, 82):
        return {"code": code, "label": "Rain showers", "icon": "rainy"}
    if code in (85, 86):
        return {"code": code, "label": "Snow showers", "icon": "weather_snowy"}
    if code >= 95:
        return {"code": code, "label": "Thunderstorm", "icon": "thunderstorm"}
    return {"code": code, "label": "Unknown", "icon": "cloud"}


# ---------------------------------------------------------------------------
# Deterministic crop-risk rules
# ---------------------------------------------------------------------------

def _fmt_date(value: str) -> str:
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").strftime("%a, %d %b")
    except (ValueError, TypeError):
        return value


def compute_crop_risk(daily: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Score forecast risk 0-10 and emit rule-based advisories.

    daily items carry at least: temperature_2m_max, temperature_2m_min,
    precipitation_probability_max, precipitation_sum, wind_speed_10m_max,
    relative_humidity_2m_mean, weather_code.
    """
    if not daily:
        return {"score": 0, "level": "Low", "factors": [], "advisories": []}

    max_precip_prob = max(float(d.get("precipitation_probability_max") or 0) for d in daily)
    total_precip = sum(float(d.get("precipitation_sum") or 0) for d in daily)
    max_temp = max(float(d.get("temperature_2m_max") or 0) for d in daily)
    mean_humidity = sum(float(d.get("relative_humidity_2m_mean") or 0) for d in daily) / len(daily)
    max_wind = max(float(d.get("wind_speed_10m_max") or 0) for d in daily)
    has_storm = any(int(d.get("weather_code") or 0) >= 95 for d in daily)
    next_rain_day = next(
        (d for d in daily if float(d.get("precipitation_probability_max") or 0) >= 60),
        None,
    )

    factors: List[str] = []
    advisories: List[Dict[str, Any]] = []
    score = 1

    if next_rain_day is not None and float(next_rain_day.get("precipitation_probability_max") or 0) >= 60:
        score += 3
        factors.append(
            f"{_fmt_date(next_rain_day['date'])}: {float(next_rain_day['precipitation_probability_max']):.0f}% rain probability "
            f"({float(next_rain_day.get('precipitation_sum') or 0):.1f} mm expected)"
        )
        advisories.append({
            "title": "Plan around incoming rain",
            "detail": "Delay irrigation and open harvesting by a day; rain of 5+ mm can damage standing produce "
                      "and make fields too soft for machinery.",
            "icon": "water_drop",
            "severity": "warning",
        })

    if mean_humidity >= 70:
        score += 2
        factors.append(f"High humidity window ({mean_humidity:.0f}% avg) over the forecast period")
        advisories.append({
            "title": "Scout for pest & fungal pressure",
            "detail": f"Humidity averaging {mean_humidity:.0f}% is favourable for bollworm and blight. "
                      "Monitor crops twice daily and keep a neem-based foliar spray ready for early outbreaks.",
            "icon": "pest_control",
            "severity": "warning",
        })

    if max_temp >= 38:
        score += 3
        factors.append(f"Peak temperature reaching {max_temp:.0f}°C — heat stress risk for crops and poultry")
        advisories.append({
            "title": "Heat-stress management",
            "detail": f"With {max_temp:.0f}°C peaks, irrigate early morning/evening, provide shade or ventilation "
                      "for livestock, and avoid midday field operations.",
            "icon": "device_thermostat",
            "severity": "warning",
        })

    if max_wind >= 35:
        score += 1
        factors.append(f"Gusty winds up to {max_wind:.0f} km/h")
        advisories.append({
            "title": "Hold off on spraying",
            "detail": f"Winds up to {max_wind:.0f} km/h cause spray drift — postpone pesticide/foliar application "
                      "until winds drop below 15 km/h.",
            "icon": "air",
            "severity": "info",
        })

    if has_storm:
        score += 1
        factors.append("Thunderstorms in the forecast")
        advisories.append({
            "title": "Storm watch",
            "detail": "Secure polyhouses, shade nets and loose structures; keep livestock sheltered during "
                      "thunderstorm windows.",
            "icon": "thunderstorm",
            "severity": "critical",
        })

    score = max(0, min(10, score))
    if score <= 2:
        level = "Low"
    elif score <= 5:
        level = "Moderate"
    elif score <= 7:
        level = "High"
    else:
        level = "Severe"

    if not advisories:
        advisories.append({
            "title": "Conditions favourable for field work",
            "detail": "No major weather triggers in the next 5 days — a good window for sowing, harvesting and "
                      "plant-protection operations.",
            "icon": "check_circle",
            "severity": "info",
        })

    return {
        "score": score,
        "level": level,
        "factors": factors,
        "advisories": advisories,
    }


# ---------------------------------------------------------------------------
# Open-Meteo client
# ---------------------------------------------------------------------------

def fetch_forecast(latitude: float, longitude: float, days: int = 5) -> Dict[str, Any]:
    """
    Call Open-Meteo for current conditions + a daily forecast.

    Raises WeatherUnavailableError when the network/API fails so callers can
    degrade gracefully.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "precipitation_probability_max,precipitation_sum,"
            "wind_speed_10m_max,relative_humidity_2m_mean"
        ),
        "timezone": "auto",
        "forecast_days": str(days),
    }
    try:
        with httpx.Client(timeout=10.0, headers={"User-Agent": USER_AGENT}) as client:
            response = client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception as e:  # noqa: BLE001 - surface any transport/API failure
        logger.warning("Open-Meteo request failed: %s", e)
        raise WeatherUnavailableError(f"Weather service unavailable: {e}") from e

    current = payload.get("current", {})
    daily_raw = payload.get("daily", {})

    daily: List[Dict[str, Any]] = []
    for idx, day in enumerate(daily_raw.get("time", [])):
        daily.append({
            "date": day,
            "weather_code": daily_raw.get("weather_code", [])[idx],
            "temperature_2m_max": daily_raw.get("temperature_2m_max", [])[idx],
            "temperature_2m_min": daily_raw.get("temperature_2m_min", [])[idx],
            "precipitation_probability_max": daily_raw.get("precipitation_probability_max", [])[idx],
            "precipitation_sum": daily_raw.get("precipitation_sum", [])[idx],
            "wind_speed_10m_max": daily_raw.get("wind_speed_10m_max", [])[idx],
            "relative_humidity_2m_mean": daily_raw.get("relative_humidity_2m_mean", [])[idx],
        })

    current_code = int(current.get("weather_code") or 0)
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "current": {
            "temperature_c": current.get("temperature_2m"),
            "apparent_temperature_c": current.get("apparent_temperature"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "wind_kph": current.get("wind_speed_10m"),
            "condition": wmo_condition(current_code),
        },
        "daily": daily,
        "risk": compute_crop_risk(daily),
    }


def resolve_coordinates(location: Optional[str] = None) -> Tuple[float, float, str]:
    """Resolve a location name to lat/lon; fall back to the district default."""
    if location:
        try:
            geo = geocode_location(location)
            return geo.latitude, geo.longitude, geo.display_name
        except LocationNotFoundError:
            logger.info("Could not geocode %r — using default district coordinates", location)
        except Exception as e:  # noqa: BLE001 - Nominatim hiccups shouldn't kill weather
            logger.warning("Geocoding failed for %r: %s", location, e)
    return DEFAULT_COORDS["latitude"], DEFAULT_COORDS["longitude"], DEFAULT_COORDS["display_name"]


def get_weather(location: Optional[str] = None, days: int = 5) -> Dict[str, Any]:
    """Full weather payload for a location name (geocode -> Open-Meteo)."""
    latitude, longitude, display_name = resolve_coordinates(location)
    forecast = fetch_forecast(latitude, longitude, days=days)
    return {
        "location": {
            "name": display_name,
            "latitude": latitude,
            "longitude": longitude,
        },
        **forecast,
    }
