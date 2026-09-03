"""
Agro Insights & Advisory Store Tests (pure — no network)
==========================================================
Validates spray-window rules, the pest-threat estimate, parametric-insurance
trigger evaluation, claim payout math, the protocol document renderer, and the
SQLite claims/reminders store.
"""

import pytest

from app.core.advisory_store import (
    delete_claim,
    delete_reminder,
    list_claims,
    list_reminders,
    save_claim,
    save_reminder,
)
from app.core.agro import (
    CLAIM_FACTORS,
    POLICY,
    best_spray_window,
    estimate_claim,
    evaluate_triggers,
    pest_threat,
    protocol_document,
    spray_window_status,
    spray_windows,
)


def _day(date="2026-09-10", code=1, p=10.0, mm=0.0, wind=8.0, hum=55.0, tmax=29.0):
    return {
        "date": date, "weather_code": code,
        "precipitation_probability_max": p, "precipitation_sum": mm,
        "wind_speed_10m_max": wind, "relative_humidity_2m_mean": hum,
        "temperature_2m_max": tmax, "temperature_2m_min": 21.0,
    }


def test_spray_window_optimal_good_marginal_avoid():
    assert spray_window_status(_day())["key"] == "optimal"
    assert spray_window_status(_day(wind=18.0, p=50.0))["key"] == "good"
    assert spray_window_status(_day(wind=12.0, p=70.0))["key"] == "marginal"
    assert spray_window_status(_day(p=90.0))["key"] == "avoid"
    assert spray_window_status(_day(code=95, p=10.0))["key"] == "avoid"
    assert spray_window_status(_day(mm=14.0, p=70.0))["key"] == "avoid"


def test_spray_windows_annotate_days():
    windows = spray_windows([_day("2026-09-10"), _day("2026-09-11", p=90)])
    assert windows[0]["label"] == "Optimal Spray"
    assert windows[1]["label"] == "Avoid Spray"
    assert windows[0]["date"] == "2026-09-10"
    assert windows[0]["day_label"]


def test_best_spray_window_picks_first_good_day():
    daily = [_day("2026-09-10", p=90), _day("2026-09-11"), _day("2026-09-12")]
    best = best_spray_window(daily)
    assert best["date"] == "2026-09-11"
    assert best["time_slot"].startswith("06:30")
    assert "rain-free" in best["detail"]


def test_best_spray_window_none_when_all_wet():
    daily = [_day(d, p=95) for d in ("2026-09-10", "2026-09-11")]
    assert best_spray_window(daily, horizon_days=2) is None


def test_pest_threat_levels():
    wet = pest_threat([_day(hum=80.0, mm=4.0, code=61), _day("2026-09-11", hum=78.0, mm=2.0)])
    assert wet["level"] == 3
    assert "Bollworm" in wet["vector"]

    mild = pest_threat([_day(hum=66.0), _day("2026-09-11", hum=64.0)])
    assert mild["level"] == 2

    dry = pest_threat([_day(hum=45.0), _day("2026-09-11", hum=42.0)])
    assert dry["level"] == 1

    assert pest_threat([])["risk_pct"] == 0


def test_evaluate_triggers_all_safe():
    daily = [_day() for _ in range(3)]
    result = evaluate_triggers({"daily": daily})
    assert result["policy_health"] == "Safe"
    statuses = {t["key"]: t["status"] for t in result["triggers"]}
    assert statuses == {"excess_rain": "SAFE", "deficit": "SAFE", "heat": "SAFE"}


def test_evaluate_triggers_excess_rain_watch_and_trigger():
    daily = [_day(mm=45.0, p=90.0)]
    statuses = {t["key"]: t["status"] for t in evaluate_triggers({"daily": daily})["triggers"]}
    assert statuses["excess_rain"] == "WATCHLIST"

    daily = [_day(mm=80.0, p=95.0)]
    result = evaluate_triggers({"daily": daily})
    assert result["policy_health"] == "Triggered"
    statuses = {t["key"]: t["status"] for t in result["triggers"]}
    assert statuses["excess_rain"] == "TRIGGERED"


def test_evaluate_triggers_dry_spell_watchlist():
    daily = [_day(d, mm=0.0) for d in ("2026-09-10", "2026-09-11", "2026-09-12",
                                       "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16")]
    statuses = {t["key"]: t["status"] for t in evaluate_triggers({"daily": daily})["triggers"]}
    assert statuses["deficit"] == "WATCHLIST"


def test_evaluate_triggers_heat_wave():
    daily = [_day(tmax=42.0), _day("2026-09-11", tmax=43.0), _day("2026-09-12", tmax=42.0)]
    result = evaluate_triggers({"daily": daily})
    statuses = {t["key"]: t["status"] for t in result["triggers"]}
    assert statuses["heat"] == "TRIGGERED"
    assert result["policy_health"] == "Triggered"


def test_estimate_claim_scales_by_area():
    est = estimate_claim("excess_rain", POLICY["area_acres"])
    assert est["estimate_amount"] == pytest.approx(POLICY["sum_insured"] * 0.25)
    half = estimate_claim("excess_rain", POLICY["area_acres"] / 2)
    assert half["estimate_amount"] == pytest.approx(est["estimate_amount"] / 2)
    assert estimate_claim("excess_rain", 0.0)["estimate_amount"] == 0.0
    assert "excess_rain" in CLAIM_FACTORS


def test_protocol_document_renders_live_data():
    daily = [_day("2026-09-10", hum=78.0, mm=12.0, p=80.0, code=61),
             _day("2026-09-11")]
    payload = {
        "location": {"name": "Akola, Maharashtra"},
        "fetched_at": "2026-09-10T06:00:00Z",
        "current": {"temperature_c": 27, "humidity_pct": 74, "wind_kph": 12,
                    "condition": {"label": "Rain"}},
        "daily": daily,
        "risk": {"score": 6, "level": "High", "advisories": [
            {"title": "Scout for pest pressure", "detail": "Humidity is high.", "severity": "warning"}]},
    }
    doc = protocol_document(payload)
    assert doc["filename"].endswith(".html")
    html = doc["html"]
    assert "Akola, Maharashtra" in html
    assert "Scout for pest pressure" in html
    assert "1800-180-1551" in html
    assert "Avoid Spray" in html or "Optimal Spray" in html


def test_advisory_store_claims_roundtrip(tmp_path):
    db = tmp_path / "advisory.db"
    claim = {"id": "CLM-1", "damage_type": "hailstorm", "area_acres": 4.0,
             "estimate_amount": 41754.39, "status": "Submitted"}
    assert save_claim("CLM-1", claim, db) is True
    assert save_claim("CLM-1", claim, db) is False  # no overwrite
    assert list_claims(db)[0]["id"] == "CLM-1"
    assert delete_claim("CLM-1", db) is True
    assert list_claims(db) == []


def test_advisory_store_reminders_roundtrip(tmp_path):
    db = tmp_path / "advisory.db"
    reminder = {"id": "RM-1", "kind": "sms", "contact": "9876543210",
                "target_date": "2026-09-11", "time_slot": "06:30 AM – 10:30 AM"}
    assert save_reminder("RM-1", reminder, db) is True
    assert list_reminders(db)[0]["contact"] == "9876543210"
    assert delete_reminder("RM-1", db) is True
    assert list_reminders(db) == []
