"""
Weather Module Tests (pure — no network)
==========================================
Validates the WMO code mapping and the deterministic crop-risk rule engine.
"""

import pytest

from app.core.weather import WeatherUnavailableError, compute_crop_risk, wmo_condition


def test_wmo_code_mapping():
    assert wmo_condition(0)["label"] == "Clear sky"
    assert wmo_condition(2)["icon"] == "partly_cloudy_day"
    assert wmo_condition(61)["label"] == "Rain"
    assert wmo_condition(95)["label"] == "Thunderstorm"
    assert wmo_condition(999)["label"] == "Thunderstorm"  # >=95 falls through to storm


def test_crop_risk_low_when_calm():
    daily = [{
        "date": "2026-09-10", "temperature_2m_max": 29.0, "temperature_2m_min": 21.0,
        "precipitation_probability_max": 10.0, "precipitation_sum": 0.0,
        "wind_speed_10m_max": 8.0, "relative_humidity_2m_mean": 55.0, "weather_code": 1,
    }] * 3
    risk = compute_crop_risk(daily)
    assert risk["score"] <= 2
    assert risk["level"] == "Low"
    assert any(a["severity"] == "info" for a in risk["advisories"])


def test_crop_risk_high_with_rain_humidity_heat():
    daily = [
        {"date": "2026-09-10", "temperature_2m_max": 39.0, "temperature_2m_min": 24.0,
         "precipitation_probability_max": 80.0, "precipitation_sum": 12.0,
         "wind_speed_10m_max": 20.0, "relative_humidity_2m_mean": 80.0, "weather_code": 61},
        {"date": "2026-09-11", "temperature_2m_max": 41.0, "temperature_2m_min": 25.0,
         "precipitation_probability_max": 20.0, "precipitation_sum": 0.0,
         "wind_speed_10m_max": 15.0, "relative_humidity_2m_mean": 75.0, "weather_code": 0},
    ]
    risk = compute_crop_risk(daily)
    assert risk["score"] >= 8
    assert risk["level"] in ("High", "Severe")
    titles = [a["title"] for a in risk["advisories"]]
    assert any("rain" in t.lower() for t in titles)
    assert any("pest" in t.lower() for t in titles)
    assert any("Heat" in t for t in titles)
    assert len(risk["factors"]) >= 3


def test_crop_risk_storm_flag():
    daily = [{
        "date": "2026-09-10", "temperature_2m_max": 31.0, "temperature_2m_min": 22.0,
        "precipitation_probability_max": 70.0, "precipitation_sum": 6.0,
        "wind_speed_10m_max": 40.0, "relative_humidity_2m_mean": 72.0, "weather_code": 95,
    }]
    risk = compute_crop_risk(daily)
    assert any("Storm" in a["title"] for a in risk["advisories"])
    assert any(a["severity"] == "critical" for a in risk["advisories"])
    assert any("winds" in f.lower() for f in risk["factors"])


def test_compute_crop_risk_empty():
    assert compute_crop_risk([])["score"] == 0


def test_weather_unavailable_error_raises():
    with pytest.raises(WeatherUnavailableError):
        raise WeatherUnavailableError("boom")
