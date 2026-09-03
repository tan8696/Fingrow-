"""
Unit Tests — Report Generator & PDF Export
===========================================
Validates that HTML report assembly produces valid HTML with charts and tables,
and that WeasyPrint can render it to PDF bytes.
"""

import pytest
from app.report.generator import generate_html_report, generate_pie_chart_svg, generate_bar_chart_svg
from app.report.pdf import export_pdf

SAMPLE_REPORT_DATA = {
    "session_id": "test-session-12345678",
    "location": "Rampur Village, Barabanki, UP",
    "display_name": "Rampur, Barabanki, Uttar Pradesh, India",
    "business_category": "dairy",
    "language": "en",
    "financials": {
        "margin_contribution": 25000.0,
        "project_cost": 250000.0,
        "loan_amount": 225000.0,
        "selected_scheme": "Term Loan Scheme",
        "interest_rate_pct": 8.0,
        "tenure_months": 84,
        "moratorium_months": 6,
    },
    "amortization": {
        "loan_amount": 225000.0,
        "annual_rate_pct": 8.0,
        "tenure_months": 84,
        "moratorium_months": 6,
        "quarterly_emi": 11155.0,
        "total_quarters": 28,
        "total_interest_paid": 74030.0,
        "total_amount_paid": 299030.0,
        "schedule": [
            {
                "quarter": 1,
                "payment_type": "Moratorium (Interest Only)",
                "opening_balance": 225000.0,
                "principal": 0.0,
                "interest": 4500.0,
                "total_payment": 4500.0,
                "closing_balance": 225000.0,
            },
            {
                "quarter": 2,
                "payment_type": "Moratorium (Interest Only)",
                "opening_balance": 225000.0,
                "principal": 0.0,
                "interest": 4500.0,
                "total_payment": 4500.0,
                "closing_balance": 225000.0,
            },
            {
                "quarter": 3,
                "payment_type": "EMI",
                "opening_balance": 225000.0,
                "principal": 6655.0,
                "interest": 4500.0,
                "total_payment": 11155.0,
                "closing_balance": 218345.0,
            },
        ],
    },
    "market_intelligence": {
        "market_reach": "Reaching households within 5km radius and local village haat.",
        "opportunity_analysis": "Underserved demand for hygienic packaged milk.",
        "competitor_mapping": "Only 2 unorganized milkmen operating in the area.",
        "swot": {
            "strengths": ["Direct farm sourcing", "Low logistics overhead"],
            "weaknesses": ["Lack of cold storage equipment"],
            "opportunities": ["Supplying to nearby town sweets shops"],
            "threats": ["Cattle health issues during monsoon"],
        },
        "hyper_local_threats": [
            "Lack of refrigerated transport in summer",
            "Monsoon road waterlogging",
        ],
        "pricing_strategy": "Affordable competitive pricing at ₹55/liter.",
    },
    "osm_summary": {
        "competitor_count": 2,
        "density_level": "Sparse",
        "radius_km": 10.0,
        "sample_competitors": [],
        "osm_tags_queried": ["shop=dairy"],
    },
}


def test_html_report_generation():
    html = generate_html_report(SAMPLE_REPORT_DATA)
    assert "<!DOCTYPE html>" in html
    assert "Business Feasibility Report" in html
    assert "Rampur" in html
    assert "Term Loan Scheme" in html
    assert "data:image/svg+xml;base64," in html
    assert "Direct farm sourcing" in html
    assert "Cattle health issues during monsoon" in html


def test_pie_chart_svg():
    svg = generate_pie_chart_svg(10, 90)
    assert "<svg" in svg
    assert "Own 10%" in svg
    assert "Loan 90%" in svg


def test_bar_chart_svg():
    svg = generate_bar_chart_svg(SAMPLE_REPORT_DATA["amortization"]["schedule"])
    assert "<svg" in svg
    assert "Quarterly Repayment" in svg


def test_export_pdf():
    pdf_bytes = export_pdf(SAMPLE_REPORT_DATA)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF")
