"""
Rule-based narrative fallback.

Groq refuses some networks outright, which used to fail every feasibility
report with a 500. These pin the fallback so the flagship feature cannot
silently go back to depending on the model being reachable.
"""

from unittest.mock import patch

from app.api.models import FeasibilityReport, StressTestReport
from app.core.osm_fetcher import Competitor, OSMResult
from app.core.rule_advisory import feasibility_report, offline_chat_reply, stress_test


def _osm(count, names=()):
    return OSMResult(
        query_location="Akola", radius_km=5, business_category="dairy",
        competitor_count=count,
        competitors=[Competitor(name=n, category="shop", distance_estimate="5km") for n in names],
        density_level="Sparse" if count <= 3 else "Dense (Saturated)",
        osm_tags_used=["shop=dairy"],
    )


def test_rule_report_satisfies_the_real_schema():
    report = feasibility_report("Akola", "dairy", 500000, 50000, 450000, _osm(2, ["Shree Dairy"]),
                                "Term Loan Scheme", 8.0)
    FeasibilityReport(**report)  # raises if any field is missing or mistyped


def test_rule_report_is_grounded_in_the_measured_competitors():
    report = feasibility_report("Akola", "dairy", 500000, 50000, 450000, _osm(2, ["Shree Dairy"]))
    assert "Shree Dairy" in report["competitor_mapping"]
    assert "2 mapped competitors" in report["competitor_mapping"]


def test_saturated_seasonal_scores_below_open_steady():
    open_steady = feasibility_report("A", "dairy", 1, 1, 1, _osm(1))["feasibility_score"]
    crowded_seasonal = feasibility_report("A", "vegetables", 1, 1, 1, _osm(15))["feasibility_score"]
    assert crowded_seasonal < open_steady


def test_rule_report_says_it_was_not_model_written():
    report = feasibility_report("A", "dairy", 1, 1, 1, _osm(0))
    assert "language model was unavailable" in report["analysis"]


def test_rule_stress_test_satisfies_the_real_schema():
    result = stress_test(
        "vegetables", {}, {"quarterly_emi": 22000},
        {"competitor_count": 13, "radius_km": 5},
        alignment={"at_risk_count": 20, "at_risk_amount": 447000, "income_month_names": ["March", "April"]},
    )
    StressTestReport(**result)
    assert result["verdict"] == "reconsider"


def test_offline_chat_still_navigates():
    assert offline_chat_reply("show me mandi prices")["navigate_to"] == "market"
    assert offline_chat_reply("मौसम कैसा है")["navigate_to"] == "weather"
    unknown = offline_chat_reply("tell me a joke")
    assert unknown["navigate_to"] is None
    assert "can't reach" in unknown["reply"]


def test_report_endpoint_survives_an_llm_that_refuses_the_network(client):
    """The exact production failure: Groq returning 403 for the network."""
    from app.core.geocoder import GeoLocation

    geo = GeoLocation(latitude=20.7, longitude=77.0, display_name="Akola", importance=0.5)

    class Refused(Exception):
        pass

    def refuse(**kwargs):
        raise Refused("Error code: 403 - Access denied. Please check your network settings.")

    with patch("app.api.routes.geocode_location", return_value=geo), \
         patch("app.api.routes.fetch_competitors", return_value=_osm(2, ["Shree Dairy"])), \
         patch("app.api.routes.fetch_suppliers", return_value=None), \
         patch("app.api.routes.generate_feasibility_report", side_effect=refuse):
        res = client.post("/api/generate-report", json={
            "location": "Akola", "margin_capital": 50000,
            "business_category": "dairy", "language": "en", "radius_km": 5,
        })

    assert res.status_code == 200, res.text
    body = res.json()
    narrative = next(s for s in body["receipt"]["sources"] if s["field"] == "market_intelligence")
    # The receipt must say the narrative came from rules, not claim a model wrote it.
    assert narrative["kind"] == "rule"
    assert "Refused" in narrative["detail"]
    assert client.get(f"/api/verify/{body['session_id']}").json()["status"] == "verified"
