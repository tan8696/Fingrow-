"""
Agro Insights & Parametric Insurance (pure logic)
===================================================
Deterministic helpers that turn a weather payload (see ``weather.get_weather``)
into the pieces the Weather & Crop Risk page shows:

  - Per-day spray-window status (Optimal / Good / Marginal / Avoid)
  - A pest-threat estimate derived from humidity / rain / heat
  - Parametric-insurance trigger evaluation against the live forecast
  - Claim payout estimation and a downloadable spray-protocol document

Everything here is pure — no I/O — so it is unit-testable offline.
"""

from datetime import datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Static policy facts (used for display + claim estimation)
# ---------------------------------------------------------------------------

POLICY: Dict[str, Any] = {
    "policy_id": "PMFBY-AIC-MHA-89218",
    "scheme": "PMFBY · AWS-Linked Parametric Weather Insurance",
    "insurer": "Agriculture Insurance Company (AIC)",
    "sum_insured": 850000,
    "area_acres": 28.5,
    "crop": "Kharif mix — Soybean, Cotton, Tur",
    "season": "Kharif 2024-25",
    "status": "Active",
}

PAYOUT_HISTORY: List[Dict[str, Any]] = [
    {
        "date": "2023-11-14",
        "label": "Nov 14, 2023",
        "amount": 42000,
        "reason": "Kharif terminal drought (deficit-trigger payout)",
        "mode": "DBT — Bank of Maharashtra A/c",
    }
]

# Share of the sum insured paid per damage type when the trigger fires.
CLAIM_FACTORS: Dict[str, float] = {
    "excess_rain": 0.25,   # > 65 mm in a single 24h window
    "hailstorm": 0.35,     # verified hail / high-wind damage
    "drought_deficit": 0.20,  # prolonged dry spell (> 35% deficit)
    "heat_wave": 0.15,     # heat index > threshold during flowering
    "wind": 0.15,
}

DAMAGE_TYPES: List[Dict[str, str]] = [
    {"key": "excess_rain", "label": "Excess rain / flooding (24h > 65 mm)"},
    {"key": "hailstorm", "label": "Hailstorm / squall damage"},
    {"key": "drought_deficit", "label": "Dry spell / rainfall deficit"},
    {"key": "heat_wave", "label": "Heat-wave stress during flowering"},
    {"key": "wind", "label": "High-wind lodging"},
]

_DAY_FORMAT = "%a, %d %b"


def _fmt_day(date_str: Optional[str]) -> str:
    try:
        return datetime.strptime(str(date_str)[:10], "%Y-%m-%d").strftime(_DAY_FORMAT)
    except (ValueError, TypeError):
        return str(date_str or "—")


# ---------------------------------------------------------------------------
# Spray windows
# ---------------------------------------------------------------------------

def spray_window_status(day: Dict[str, Any]) -> Dict[str, str]:
    """Classify a forecast day for spraying (deterministic rules)."""
    rain_prob = float(day.get("precipitation_probability_max") or 0)
    wind = float(day.get("wind_speed_10m_max") or 0)
    code = int(day.get("weather_code") or 0)
    rain_mm = float(day.get("precipitation_sum") or 0)

    if code >= 95 or rain_prob >= 85 or (rain_mm >= 10 and rain_prob >= 60):
        return {"key": "avoid", "label": "Avoid Spray", "class": "bg-tertiary text-on-tertiary"}
    if rain_prob < 35 and wind < 15:
        return {"key": "optimal", "label": "Optimal Spray", "class": "bg-primary text-on-primary"}
    if rain_prob < 60 and wind < 20:
        return {"key": "good", "label": "Good Window", "class": "bg-primary/10 text-primary"}
    return {"key": "marginal", "label": "Marginal", "class": "bg-surface-container-high text-on-surface-variant"}


def spray_windows(daily: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Annotate each forecast day with its spray-window status."""
    out = []
    for day in daily:
        entry = spray_window_status(day)
        entry["date"] = day.get("date")
        entry["day_label"] = _fmt_day(day.get("date"))
        out.append(entry)
    return out


def best_spray_window(daily: List[Dict[str, Any]], horizon_days: int = 2) -> Optional[Dict[str, Any]]:
    """
    Recommend the best spray window inside the next ``horizon_days``:
    the first Optimal day (falling back to a Good day) plus a safe time slot.
    """
    candidates = [d for d in daily[:max(1, horizon_days)]]
    ranked = [d for d in candidates if spray_window_status(d)["key"] == "optimal"] or \
             [d for d in candidates if spray_window_status(d)["key"] == "good"]
    if not ranked:
        return None
    best = ranked[0]
    return {
        "date": best.get("date"),
        "day_label": _fmt_day(best.get("date")),
        "window": spray_window_status(best),
        "time_slot": "06:30 AM – 10:30 AM",
        "detail": (
            f"Wind {float(best.get('wind_speed_10m_max') or 0):.0f} km/h, rain "
            f"{float(best.get('precipitation_probability_max') or 0):.0f}% — a rain-free "
            "morning window gives the best chemical absorption."
        ),
    }


# ---------------------------------------------------------------------------
# Pest threat (humidity-driven estimate)
# ---------------------------------------------------------------------------

def pest_threat(daily: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Derive a pest-outbreak probability + vector from the forecast."""
    if not daily:
        return {"risk_pct": 0, "level": 1, "level_label": "Level 1", "vector": "None",
                "note": "No forecast available.", "icon": "pest_control"}

    humidities = [float(d.get("relative_humidity_2m_mean") or 0) for d in daily]
    avg_humidity = sum(humidities) / len(humidities)
    rainy_days = sum(1 for d in daily if float(d.get("precipitation_sum") or 0) >= 1)

    if avg_humidity >= 70 and rainy_days >= 2:
        pct = min(95, 35 + (avg_humidity - 70) * 4)
        return {"risk_pct": round(pct), "level": 3, "level_label": "Level 3 Alert",
                "vector": "Pink Bollworm & YMV", "icon": "pest_control",
                "note": "Warm, humid stretch favours bollworm egg-lay and yellow-mosaic virus — scout traps twice daily.",
                "protocol": "Deploy 5 pheromone traps/acre. Release Trichogramma bactrae @ 60,000 parasitoids/acre if egg count > 10%."}
    if avg_humidity >= 60:
        pct = min(70, 30 + (avg_humidity - 60) * 3)
        return {"risk_pct": round(pct), "level": 2, "level_label": "Level 2 Watch",
                "vector": "Stem Fly & Blight", "icon": "bug_report",
                "note": "Moderate humidity favours stem fly and charcoal rot — keep foliage dry and monitor lower leaves.",
                "protocol": "Spray Chlorantraniliprole 18.5 SC @ 3 ml/10 L water; apply Trichoderma to stem base in wet patches."}
    return {"risk_pct": round(max(15, 35 - (60 - avg_humidity) * 1.5)), "level": 1,
            "level_label": "Level 1 Low", "vector": "Aphids / Thrips (low)",
            "icon": "eco", "note": "Dry conditions keep pest pressure low — routine scouting only.",
            "protocol": "Maintain weekly scouting. Keep neem-based foliar spray ready for early outbreaks."}


# ---------------------------------------------------------------------------
# Parametric insurance triggers (evaluated against the live forecast)
# ---------------------------------------------------------------------------

def evaluate_triggers(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate policy triggers against the 7-day forecast.

    Returns ``{policy_health, triggers: [...]}``. Each trigger carries
    ``status`` (SAFE / WATCHLIST / TRIGGERED), a human ``note`` and the
    ``current`` reading that was measured/projected.
    """
    daily: List[Dict[str, Any]] = payload.get("daily") or []
    triggers: List[Dict[str, Any]] = []
    policy_health = "Safe"

    # 1 — Excess precipitation (24h peak)
    if daily:
        peak = max(daily, key=lambda d: float(d.get("precipitation_sum") or 0))
        peak_mm = float(peak.get("precipitation_sum") or 0)
        if peak_mm >= 65:
            status, note = "TRIGGERED", f"Automatic payout due — {peak_mm:.0f} mm recorded on {_fmt_day(peak.get('date'))}."
            policy_health = "Triggered"
        elif peak_mm >= 40:
            status, note = "WATCHLIST", f"Projected peak {peak_mm:.0f} mm on {_fmt_day(peak.get('date'))} — close to the 65 mm payout threshold."
        else:
            status, note = "SAFE", f"Projected peak {peak_mm:.0f} mm on {_fmt_day(peak.get('date'))}."
        triggers.append({
            "key": "excess_rain",
            "label": "Excess Precipitation (24h Peak)",
            "threshold": "> 65 mm in 24 hours at the Akola AWS station",
            "status": status,
            "note": note,
            "current": f"{peak_mm:.0f} mm peak",
        })

        # 2 — Dry spell / deficit rainfall
        dry_days = 0
        for d in daily:
            if float(d.get("precipitation_sum") or 0) < 0.5:
                dry_days += 1
            else:
                break
        if dry_days >= 21:
            status, note = "TRIGGERED", f"{dry_days} consecutive rainless days — deficit payout due."
            policy_health = "Triggered"
        elif dry_days >= 7:
            status, note = "WATCHLIST", f"{dry_days} dry day(s) so far this stretch — deficit window opening."
        else:
            status, note = "SAFE", "Continuous moisture — no deficit in the forecast window."
        triggers.append({
            "key": "deficit",
            "label": "Dry Spell / Deficit Rainfall",
            "threshold": "> 21 consecutive rainless days or > 35% seasonal deficit",
            "status": status,
            "note": note,
            "current": f"{dry_days} dry day{'s' if dry_days != 1 else ''} in window",
        })

        # 3 — Heat / thermal stress
        hot_streak = 0
        max_hot = 0.0
        for d in daily:
            temp = float(d.get("temperature_2m_max") or 0)
            max_hot = max(max_hot, temp)
            hot_streak = hot_streak + 1 if temp >= 41 else 0
        if hot_streak >= 3:
            status, note = "TRIGGERED", f"{hot_streak} consecutive days above 41°C during flowering — heat payout due."
            policy_health = "Triggered"
        elif hot_streak == 2:
            status, note = "WATCHLIST", "Two consecutive days above 41°C — one more triggers the heat clause."
        else:
            status, note = "SAFE", "Daytime peaks stay within the tolerable band."
        triggers.append({
            "key": "heat",
            "label": "Thermal Inversion / Heat Index",
            "threshold": "> 3 consecutive days above 41°C during flowering",
            "status": status,
            "note": note,
            "current": f"Peak {max_hot:.0f}°C",
        })
    else:
        triggers = [
            {"key": k, "label": l, "threshold": t, "status": "Offline", "note": "Forecast unavailable.", "current": "—"}
            for k, l, t in (
                ("excess_rain", "Excess Precipitation (24h Peak)", "> 65 mm in 24 hours"),
                ("deficit", "Dry Spell / Deficit Rainfall", "> 21 rainless days"),
                ("heat", "Thermal Inversion / Heat Index", "> 3 days above 41°C"),
            )
        ]

    return {"policy_health": policy_health, "triggers": triggers}


def estimate_claim(damage_type: str, area_acres: float) -> Dict[str, Any]:
    """
    Deterministic payout estimate: share of the sum insured scaled by the
    affected area relative to the policy's total insured acreage.
    """
    factor = CLAIM_FACTORS.get(damage_type, 0.15)
    share = max(0.0, min(1.0, float(area_acres) / float(POLICY["area_acres"])))
    amount = round(float(POLICY["sum_insured"]) * factor * share, 2)
    return {
        "damage_type": damage_type,
        "factor": factor,
        "area_acres": area_acres,
        "estimate_amount": amount,
        "basis": (
            f"{factor * 100:.0f}% of the ₹{POLICY['sum_insured']:,} sum insured "
            f"× affected {area_acres:.1f} of {POLICY['area_acres']:.1f} insured acres"
        ),
    }


# ---------------------------------------------------------------------------
# Downloadable spray-protocol document (built from the live forecast)
# ---------------------------------------------------------------------------

def protocol_document(payload: Dict[str, Any]) -> Dict[str, str]:
    """Render a printable spray-protocol HTML file from a weather payload."""
    current = payload.get("current") or {}
    daily = payload.get("daily") or []
    risk = payload.get("risk") or {}
    location = payload.get("location") or {}
    pests = pest_threat(daily)
    best = best_spray_window(daily)
    generated = datetime.now(timezone.utc).astimezone().strftime("%d %b %Y, %I:%M %p")

    rows = []
    for day in daily:
        status = spray_window_status(day)
        rows.append(
            "<tr>"
            f"<td>{escape(_fmt_day(day.get('date')))}</td>"
            f"<td>{float(day.get('temperature_2m_max') or 0):.0f}° / {float(day.get('temperature_2m_min') or 0):.0f}°</td>"
            f"<td>{float(day.get('precipitation_probability_max') or 0):.0f}% ({float(day.get('precipitation_sum') or 0):.1f} mm)</td>"
            f"<td>{float(day.get('wind_speed_10m_max') or 0):.0f} km/h</td>"
            f"<td>{float(day.get('relative_humidity_2m_mean') or 0):.0f}%</td>"
            f"<td><strong>{status['label']}</strong></td>"
            "</tr>"
        )

    advisory_html = "".join(
        f"<li><strong>{escape(a.get('title', ''))}</strong> — {escape(a.get('detail', ''))}</li>"
        for a in (risk.get("advisories") or [])
    )
    best_line = (
        f"Recommended: {best['day_label']} between {best['time_slot']} — {escape(best['detail'])}"
        if best else "No safe spray window inside the next 48 hours — postpone plant-protection operations."
    )

    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Spray Protocol — FinGrow Agro Advisory</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #171d19; margin: 32px; line-height: 1.5; }}
  h1 {{ color: #006948; font-size: 22px; margin-bottom: 2px; }}
  h2 {{ color: #006948; font-size: 15px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .04em; }}
  .muted {{ color: #3d4a42; font-size: 13px; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
  th, td {{ border: 1px solid #bccac0; padding: 7px 9px; text-align: left; }}
  th {{ background: #e9efe9; }}
  li {{ margin-bottom: 4px; }}
  .box {{ border: 1px solid #006948; background: #f5fbf5; padding: 10px 14px; border-radius: 8px; font-size: 13px; }}
  footer {{ margin-top: 28px; color: #6d7a72; font-size: 11px; }}
</style></head><body>
<h1>FinGrow Spray &amp; Crop-Protection Protocol</h1>
<p class="muted">{escape(location.get('name') or 'Akola, Vidarbha, Maharashtra')} · Generated {generated} · Data: Open-Meteo live feed</p>

<h2>Current conditions</h2>
<p class="box">
  {escape((current.get('condition') or {}).get('label') or '—')} ·
  {current.get('temperature_c') if current.get('temperature_c') is not None else '—'}°C ·
  Humidity {current.get('humidity_pct') if current.get('humidity_pct') is not None else '—'}% ·
  Wind {current.get('wind_kph') if current.get('wind_kph') is not None else '—'} km/h ·
  Crop risk {risk.get('score', 0)}/10 ({risk.get('level', 'Low')})
</p>

<h2>7-day forecast &amp; spray windows</h2>
<table>
<tr><th>Day</th><th>High / Low</th><th>Rain chance</th><th>Wind</th><th>Humidity</th><th>Window</th></tr>
{''.join(rows)}
</table>

<h2>Recommendation</h2>
<p>{escape(best_line)}</p>
<p>Spray only when wind is below 12 km/h, skies are rain-free for 48 hours, and temperature is below 32°C.</p>

<h2>Pest outlook ({pests['vector']} — {pests['risk_pct']}% risk)</h2>
<p>{escape(pests['note'])}</p>
<p>{escape(pests.get('protocol', ''))}</p>

<h2>Live advisories</h2>
<ul>{advisory_html}</ul>

<footer>
  Issued by the FinGrow agro-advisory engine using the live district forecast. Verify with the local
  KVK / Tahsildar office before large-scale application. Helpline: 1800-180-1551 (toll free).
</footer>
</body></html>"""
    return {"filename": f"spray_protocol_{datetime.now().strftime('%Y%m%d')}.html", "html": html}
