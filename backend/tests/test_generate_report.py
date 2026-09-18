"""
End-to-end tests for POST /api/generate-report with the network stubbed.

This path was previously unexercised, which let a dropped-field bug sit in the
flagship endpoint: it rebuilt FeasibilityReport field by field and omitted two
required ones, so every call raised. The frontend's silent fallback hid it.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.models import FeasibilityReport, SWOTResponse
from app.core.geocoder import GeoLocation
from app.core.osm_fetcher import Competitor, OSMResult
from app.main import app


def _authed_client():
    """A TestClient signed in as a fresh account (every data route needs one)."""
    import uuid

    from app.core.auth import create_token, create_user

    user = create_user(f"9{uuid.uuid4().int % 10**9:09d}", "test-password", "Test User")
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {create_token(user['user_id'])}"})
    c.user_id = user["user_id"]
    return c

GEO = GeoLocation(latitude=20.7, longitude=77.0, display_name="Akola, Maharashtra", importance=0.5)

OSM = OSMResult(
    query_location="Akola",
    radius_km=5,
    business_category="vegetables",
    competitor_count=4,
    competitors=[Competitor(name="Sharma Vegetables", category="greengrocer", distance_estimate="within 5km")],
    density_level="Sparse",
    osm_tags_used=["shop=greengrocer"],
)

FEASIBILITY = FeasibilityReport(
    analysis="Chain of thought about the local market.",
    feasibility_score=62,
    market_reach="Reaches nearby villages.",
    opportunity_analysis="Gap in organic supply.",
    competitor_mapping="Four greengrocers within 5 km.",
    swot=SWOTResponse(strengths=["a"], weaknesses=["b"], opportunities=["c"], threats=["d"]),
    hyper_local_threats=["Monsoon logistics"],
    pricing_strategy="Low margin, high volume.",
)

REQUEST = {
    "location": "Akola",
    "margin_capital": 50_000,
    "business_category": "vegetables",
    "language": "en",
    "radius_km": 5,
}


@pytest.fixture
def report(monkeypatch):
    """A generated report with geocoding, OSM and the LLM all stubbed."""
    client = _authed_client()
    with patch("app.api.routes.geocode_location", return_value=GEO), \
         patch("app.api.routes.fetch_competitors", return_value=OSM), \
         patch("app.api.routes.fetch_suppliers", side_effect=Exception("offline")), \
         patch("app.api.routes.generate_feasibility_report", return_value=FEASIBILITY):
        res = client.post("/api/generate-report", json=REQUEST)
    assert res.status_code == 200, res.text
    # Follow-up requests must come from the account that owns the report.
    body = res.json()
    body["_client"] = client
    return body


def test_every_advisory_field_survives_the_response(report):
    """The regression: analysis and feasibility_score were being dropped."""
    mi = report["market_intelligence"]
    assert mi["feasibility_score"] == 62
    assert mi["analysis"] == FEASIBILITY.analysis
    assert mi["pricing_strategy"] == FEASIBILITY.pricing_strategy
    assert mi["swot"]["strengths"] == ["a"]


def test_report_carries_a_receipt_covering_every_section(report):
    fields = {s["field"]: s["kind"] for s in report["receipt"]["sources"]}

    assert fields["financials"] == "rule"
    assert fields["amortization"] == "rule"
    assert fields["repayment_alignment"] == "rule"
    assert fields["osm_summary"] == "observation"
    assert fields["display_name"] == "observation"
    assert fields["market_intelligence"] == "model"


def test_generated_report_verifies_against_its_own_receipt(report):
    body = report["_client"].get(f"/api/verify/{report['session_id']}").json()

    assert body["status"] == "verified"
    assert body["short_hash"] == report["receipt"]["short_hash"]


def test_report_places_instalments_against_earning_months(report):
    alignment = report["repayment_alignment"]

    assert alignment["steady_income"] is False
    assert alignment["income_months"] == [3, 4, 10, 11]
    assert alignment["at_risk_count"] > 0


def test_pdf_renders_for_a_generated_report(report):
    res = report["_client"].get(f"/api/report/{report['session_id']}/pdf")
    assert res.status_code == 200
    assert res.content[:4] == b"%PDF"


def test_failed_supplier_lookup_does_not_fail_the_report(report):
    """fetch_suppliers raised in the fixture; the report must still come back."""
    assert report["osm_summary"]["suppliers"] == []
    assert report["osm_summary"]["competitor_count"] == 4


def test_unreachable_overpass_is_not_reported_as_a_measurement():
    """A fallback density must not be presented as something Overpass observed."""
    with patch("app.api.routes.geocode_location", return_value=GEO), \
         patch("app.api.routes.fetch_competitors", side_effect=Exception("overpass down")), \
         patch("app.api.routes.fetch_suppliers", side_effect=Exception("offline")), \
         patch("app.api.routes.generate_feasibility_report", return_value=FEASIBILITY):
        body = _authed_client().post("/api/generate-report", json=REQUEST).json()

    osm_source = next(s for s in body["receipt"]["sources"] if s["field"] == "osm_summary")
    assert "Overpass unreachable" in osm_source["detail"]
    assert osm_source["source"] == "not measured"
    # It used to report two competitors nobody had counted; the narrative then
    # repeated that as fact.
    assert body["osm_summary"]["competitor_count"] == 0
    assert body["osm_summary"]["density_level"] == "Not measured"


def test_margin_beyond_every_scheme_limit_is_rejected():
    with patch("app.api.routes.geocode_location", return_value=GEO), \
         patch("app.api.routes.fetch_competitors", return_value=OSM), \
         patch("app.api.routes.fetch_suppliers", return_value=None), \
         patch("app.api.routes.generate_feasibility_report", return_value=FEASIBILITY):
        res = _authed_client().post("/api/generate-report", json={**REQUEST, "margin_capital": 10_000_000})

    assert res.status_code == 422
