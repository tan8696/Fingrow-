"""
PDF Report Generator — ReportLab
=================================
Generates a professional, bank-ready PDF business feasibility report
using ReportLab. Fully self-contained with no external system dependencies
(runs on Windows, Linux, Docker, and macOS).
"""

import io
import logging
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)


def _format_inr(val: float) -> str:
    try:
        return "Rs. " + f"{val:,.0f}"
    except (ValueError, TypeError):
        return str(val)


def export_pdf(report_data: Dict[str, Any]) -> bytes:
    """
    Generate a PDF report from report_data dictionary and return bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=4,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4b5563"),
        spaceAfter=12,
    )

    h2_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=12,
        spaceAfter=6,
    )

    h3_style = ParagraphStyle(
        "SubSectionHeading",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=6,
        spaceAfter=3,
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    )

    badge_style = ParagraphStyle(
        "Badge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#065f46"),
    )

    bullet_style = ParagraphStyle(
        "Bullet",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#334155"),
        leftIndent=10,
        spaceAfter=2,
    )

    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#9ca3af"),
        alignment=1,  # Center
    )

    story = []

    # Title & Metadata
    location_name = report_data.get("display_name") or report_data.get("location", "Target Location")
    category = report_data.get("business_category", "Business").replace("_", " ").title()
    session_id = str(report_data.get("session_id", "N/A"))[:8]

    story.append(Paragraph("Business Feasibility & Financial Report", title_style))
    story.append(
        Paragraph(
            f"Location: <b>{location_name}</b> &nbsp;|&nbsp; Category: <b>{category}</b> &nbsp;|&nbsp; Ref: {session_id}",
            subtitle_style,
        )
    )
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#3b82f6"), spaceAfter=10))

    # --- Financial Summary Section ---
    fin = report_data.get("financials", {})
    amort = report_data.get("amortization", {})
    scheme_name = fin.get("selected_scheme", "Government Scheme")

    story.append(Paragraph("1. Financial Structure & Scheme Routing", h2_style))

    # 3 Key Financial Metrics Table
    fin_cards_data = [
        [
            Paragraph(f"<b>Own Margin (10%)</b><br/><font size=12 color='#059669'><b>{_format_inr(fin.get('margin_contribution', 0))}</b></font>", body_style),
            Paragraph(f"<b>Total Project Cost</b><br/><font size=12 color='#1e3a8a'><b>{_format_inr(fin.get('project_cost', 0))}</b></font>", body_style),
            Paragraph(f"<b>Govt. Loan (90%)</b><br/><font size=12 color='#2563eb'><b>{_format_inr(fin.get('loan_amount', 0))}</b></font>", body_style),
        ]
    ]
    fin_table = Table(fin_cards_data, colWidths=[180, 180, 180])
    fin_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#bbf7d0")),
            ("INNERGRID", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ])
    )
    story.append(fin_table)
    story.append(Spacer(1, 8))

    # Scheme Terms Row
    terms_text = (
        f"<b>Selected Scheme:</b> {scheme_name} &nbsp;|&nbsp; "
        f"<b>Interest Rate:</b> {fin.get('interest_rate_pct')}% p.a. &nbsp;|&nbsp; "
        f"<b>Tenure:</b> {fin.get('tenure_months')} mo ({fin.get('tenure_months', 0)//12} yrs) &nbsp;|&nbsp; "
        f"<b>Moratorium:</b> {fin.get('moratorium_months')} mo &nbsp;|&nbsp; "
        f"<b>Quarterly EMI:</b> {_format_inr(amort.get('quarterly_emi', 0))}"
    )
    story.append(Paragraph(terms_text, body_style))
    story.append(Spacer(1, 8))

    # --- Market Intelligence Section ---
    intel = report_data.get("market_intelligence", {})
    osm = report_data.get("osm_summary", {})
    swot = intel.get("swot", {})

    story.append(Paragraph("2. Local Market Intelligence", h2_style))

    # Competitor summary note
    comp_note = (
        f"<b>OpenStreetMap Market Survey:</b> {osm.get('competitor_count', 0)} direct competitors identified "
        f"within a {osm.get('radius_km', 10)} km radius. Market Density: <b>{osm.get('density_level', 'Unknown')}</b>."
    )
    story.append(Paragraph(comp_note, body_style))

    story.append(Paragraph("Market Reach & Distribution Channels", h3_style))
    story.append(Paragraph(intel.get("market_reach", "N/A"), body_style))

    story.append(Paragraph("Opportunity Analysis & Local Niches", h3_style))
    story.append(Paragraph(intel.get("opportunity_analysis", "N/A"), body_style))

    story.append(Paragraph("Competitor Strategy", h3_style))
    story.append(Paragraph(intel.get("competitor_mapping", "N/A"), body_style))

    # SWOT Table
    story.append(Paragraph("Micro-Enterprise SWOT Analysis", h3_style))

    def _make_swot_cell(title, color_hex, items):
        p_list = [Paragraph(f"<b><font color='{color_hex}'>{title}</font></b>", h3_style)]
        for it in items:
            p_list.append(Paragraph(f"• {it}", bullet_style))
        return p_list

    swot_table_data = [
        [
            _make_swot_cell("STRENGTHS", "#059669", swot.get("strengths", [])),
            _make_swot_cell("WEAKNESSES", "#d97706", swot.get("weaknesses", [])),
        ],
        [
            _make_swot_cell("OPPORTUNITIES", "#2563eb", swot.get("opportunities", [])),
            _make_swot_cell("THREATS", "#dc2626", swot.get("threats", [])),
        ],
    ]
    swot_table = Table(swot_table_data, colWidths=[270, 270])
    swot_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f0fdf4")),
            ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fffbeb")),
            ("BACKGROUND", (0, 1), (0, 1), colors.HexColor("#eff6ff")),
            ("BACKGROUND", (1, 1), (1, 1), colors.HexColor("#fef2f2")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(swot_table)
    story.append(Spacer(1, 8))

    # Hyper-local threats & pricing
    threats = intel.get("hyper_local_threats", [])
    if threats:
        story.append(Paragraph("Hyper-Local Risk Factors", h3_style))
        for t in threats:
            story.append(Paragraph(f"⚠️ {t}", bullet_style))
        story.append(Spacer(1, 6))

    story.append(Paragraph("Pricing & Purchasing Power Strategy", h3_style))
    story.append(Paragraph(intel.get("pricing_strategy", "N/A"), body_style))

    # --- Amortization Table Section ---
    schedule = amort.get("schedule", [])
    if schedule:
        story.append(Spacer(1, 6))
        story.append(Paragraph("3. Quarterly Repayment Schedule", h2_style))

        table_headers = [
            Paragraph("<b>Qtr</b>", body_style),
            Paragraph("<b>Payment Type</b>", body_style),
            Paragraph("<b>Opening</b>", body_style),
            Paragraph("<b>Principal</b>", body_style),
            Paragraph("<b>Interest</b>", body_style),
            Paragraph("<b>Payment</b>", body_style),
            Paragraph("<b>Closing</b>", body_style),
        ]
        amort_rows = [table_headers]

        for e in schedule:
            is_mora = "Moratorium" in e.get("payment_type", "")
            type_label = "Moratorium" if is_mora else "EMI"
            amort_rows.append([
                str(e.get("quarter")),
                type_label,
                _format_inr(e.get("opening_balance", 0)),
                _format_inr(e.get("principal", 0)),
                _format_inr(e.get("interest", 0)),
                _format_inr(e.get("total_payment", 0)),
                _format_inr(e.get("closing_balance", 0)),
            ])

        # Summary row
        amort_rows.append([
            "Total",
            "—",
            "—",
            _format_inr(fin.get("loan_amount", 0)),
            _format_inr(amort.get("total_interest_paid", 0)),
            _format_inr(amort.get("total_amount_paid", 0)),
            "Rs. 0",
        ])

        sched_table = Table(amort_rows, colWidths=[35, 80, 85, 85, 85, 85, 85])
        t_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (1, -1), "LEFT"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ]
        # Highlight moratorium rows
        for idx, e in enumerate(schedule, start=1):
            if "Moratorium" in e.get("payment_type", ""):
                t_style.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#fffbeb")))

        sched_table.setStyle(TableStyle(t_style))
        story.append(KeepTogether(sched_table))

    # --- Footer ---
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=6))
    story.append(
        Paragraph(
            "This report is generated by the AI Business Advisory Assistant (SIH Project). "
            "Financial calculations are deterministic rule-based computations. "
            "Market feasibility insights are grounded in OpenStreetMap location intelligence.",
            footer_style,
        )
    )

    doc.build(story)
    return buffer.getvalue()
