"""
Report Assembly and HTML Generator
====================================
Builds a standalone, responsive HTML report from the FullReportResponse data.
Includes inline SVG charts (pie chart for equity/loan split, bar chart for amortization).
"""

import base64
import math
from typing import Any, Dict, List


def generate_pie_chart_svg(margin_pct: float = 10.0, loan_pct: float = 90.0) -> str:
    """Generate an inline SVG pie chart showing own capital vs loan split."""
    cx, cy, r = 80, 80, 70
    angle = margin_pct / 100 * 2 * math.pi
    x1 = cx + r * math.sin(0)
    y1 = cy - r * math.cos(0)
    x2 = cx + r * math.sin(angle)
    y2 = cy - r * math.cos(angle)
    large_arc = 1 if angle > math.pi else 0

    return f"""<svg width="160" height="160" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="#2563eb" />
  <path d="M{cx},{cy} L{x1:.2f},{y1:.2f} A{r},{r} 0 {large_arc},1 {x2:.2f},{y2:.2f} Z"
        fill="#10b981" />
  <text x="80" y="150" text-anchor="middle" font-size="10" fill="#374151">
    <tspan fill="#10b981">■</tspan> Own {margin_pct:.0f}%
    <tspan fill="#2563eb"> ■</tspan> Loan {loan_pct:.0f}%
  </text>
</svg>"""


def generate_bar_chart_svg(schedule: List[Dict]) -> str:
    """Generate an inline SVG bar chart of the quarterly repayment schedule."""
    if not schedule:
        return ""
    max_payment = max(e.get("total_payment", 0) for e in schedule) or 1
    bar_w = max(4, min(20, 400 // len(schedule)))
    width = len(schedule) * (bar_w + 2) + 40
    height = 120

    bars = ""
    for i, entry in enumerate(schedule):
        h = int((entry.get("total_payment", 0) / max_payment) * 80)
        x = 30 + i * (bar_w + 2)
        color = "#f59e0b" if "Moratorium" in entry.get("payment_type", "") else "#2563eb"
        bars += f'<rect x="{x}" y="{100 - h}" width="{bar_w}" height="{h}" fill="{color}" rx="1"/>'

    return f"""<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="12" font-size="9" fill="#6b7280">Quarterly Repayment (₹)</text>
  {bars}
  <text x="0" y="{height - 2}" font-size="8" fill="#f59e0b">■ Moratorium</text>
  <text x="70" y="{height - 2}" font-size="8" fill="#2563eb">■ EMI</text>
</svg>"""


def svg_to_data_uri(svg: str) -> str:
    encoded = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{encoded}"


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Business Feasibility Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Inter', sans-serif; color: #1f2937; background: #fff; font-size: 13px; }}
  .page {{ padding: 32px; max-width: 800px; margin: auto; }}
  h1 {{ font-size: 22px; font-weight: 700; color: #1e3a8a; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; font-weight: 600; color: #1e40af; margin: 24px 0 8px; border-bottom: 2px solid #dbeafe; padding-bottom: 4px; }}
  h3 {{ font-size: 13px; font-weight: 600; color: #374151; margin: 12px 0 6px; }}
  .meta {{ color: #6b7280; font-size: 11px; margin-bottom: 20px; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }}
  .badge-micro {{ background: #d1fae5; color: #065f46; }}
  .badge-term {{ background: #dbeafe; color: #1e40af; }}
  .financials-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }}
  .fin-card {{ background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px; text-align: center; }}
  .fin-card .amount {{ font-size: 18px; font-weight: 700; color: #0369a1; }}
  .fin-card .label {{ font-size: 10px; color: #6b7280; margin-top: 2px; }}
  .charts {{ display: flex; gap: 24px; align-items: flex-start; margin: 16px 0; }}
  .swot-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }}
  .swot-card {{ border-radius: 8px; padding: 10px 12px; }}
  .swot-s {{ background: #d1fae5; border-left: 4px solid #10b981; }}
  .swot-w {{ background: #fef3c7; border-left: 4px solid #f59e0b; }}
  .swot-o {{ background: #dbeafe; border-left: 4px solid #3b82f6; }}
  .swot-t {{ background: #fee2e2; border-left: 4px solid #ef4444; }}
  .swot-card h3 {{ font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }}
  .swot-card ul {{ padding-left: 14px; }}
  .swot-card li {{ margin-bottom: 3px; font-size: 11px; }}
  .threats {{ margin: 10px 0; }}
  .threat-pill {{ display: inline-block; background: #fef2f2; border: 1px solid #fca5a5;
                  color: #b91c1c; border-radius: 999px; padding: 2px 10px; font-size: 10px;
                  margin: 3px 3px 3px 0; }}
  p {{ line-height: 1.6; color: #374151; margin: 6px 0; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }}
  th {{ background: #1e3a8a; color: #fff; padding: 6px 8px; text-align: right; }}
  th:first-child {{ text-align: center; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; }}
  td:first-child {{ text-align: center; }}
  tr.moratorium td {{ background: #fffbeb; color: #92400e; }}
  tr:last-child td {{ border-bottom: none; font-weight: 600; }}
  .footer {{ margin-top: 32px; font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }}
</style>
</head>
<body>
<div class="page">

  <h1>Business Feasibility Report</h1>
  <div class="meta">
    Generated for: <strong>{location}</strong> &nbsp;|&nbsp;
    Business: <strong>{category}</strong> &nbsp;|&nbsp;
    Session: {session_id}
  </div>

  <!-- FINANCIAL SUMMARY -->
  <h2>Financial Structure</h2>
  <div class="financials-grid">
    <div class="fin-card"><div class="amount">₹{margin:,.0f}</div><div class="label">Your Own Capital (10%)</div></div>
    <div class="fin-card"><div class="amount">₹{project_cost:,.0f}</div><div class="label">Total Project Cost</div></div>
    <div class="fin-card"><div class="amount">₹{loan:,.0f}</div><div class="label">Government Loan (90%)</div></div>
  </div>
  <p>
    <span class="badge {badge_class}">{scheme_name}</span>
    &nbsp; Interest: <strong>{rate}%</strong> &nbsp;|&nbsp;
    Tenure: <strong>{tenure_months} months ({tenure_years} years)</strong> &nbsp;|&nbsp;
    Moratorium: <strong>{moratorium_months} months</strong> &nbsp;|&nbsp;
    Quarterly EMI: <strong>₹{emi:,.0f}</strong>
  </p>

  <div class="charts">
    <img src="{pie_chart}" width="160" height="160" alt="Capital Split Pie Chart"/>
    <img src="{bar_chart}" height="120" alt="Repayment Schedule Chart"/>
  </div>

  <!-- MARKET INTELLIGENCE -->
  <h2>Market Intelligence</h2>

  <h3>Market Reach</h3>
  <p>{market_reach}</p>

  <h3>Opportunity Analysis</h3>
  <p>{opportunity_analysis}</p>

  <h3>Competitor Analysis ({competitor_count} businesses found within {radius}km)</h3>
  <p>{competitor_mapping}</p>

  <h3>SWOT Analysis</h3>
  <div class="swot-grid">
    <div class="swot-card swot-s"><h3>💪 Strengths</h3><ul>{strengths_html}</ul></div>
    <div class="swot-card swot-w"><h3>⚠️ Weaknesses</h3><ul>{weaknesses_html}</ul></div>
    <div class="swot-card swot-o"><h3>🚀 Opportunities</h3><ul>{opportunities_html}</ul></div>
    <div class="swot-card swot-t"><h3>🔴 Threats</h3><ul>{threats_html}</ul></div>
  </div>

  <h3>Hyper-Local Threats</h3>
  <div class="threats">{threat_pills}</div>

  <h3>Pricing Strategy</h3>
  <p>{pricing_strategy}</p>

  <!-- REPAYMENT SCHEDULE -->
  <h2>Quarterly Repayment Schedule</h2>
  <table>
    <thead>
      <tr>
        <th>Qtr</th><th>Type</th><th>Opening Balance (₹)</th>
        <th>Principal (₹)</th><th>Interest (₹)</th><th>Payment (₹)</th><th>Closing Balance (₹)</th>
      </tr>
    </thead>
    <tbody>{schedule_rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:right">Total Amount Paid</td>
        <td>₹{total_paid:,.0f}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    This report is generated by the AI Business Advisory Assistant (SIH Project).<br/>
    Financial calculations are deterministic. Market analysis is AI-generated based on OpenStreetMap data.<br/>
    This report does not constitute financial advice. Consult your State Channelizing Agency (SCA) before applying.
  </div>
</div>
</body>
</html>"""


def generate_html_report(report_data: Dict[str, Any]) -> str:
    """
    Renders the report data as a self-contained HTML document.
    """
    fin = report_data["financials"]
    amort = report_data["amortization"]
    intel = report_data["market_intelligence"]
    swot = intel["swot"]
    osm = report_data["osm_summary"]
    schedule = amort["schedule"]

    pie_svg = generate_pie_chart_svg()
    bar_svg = generate_bar_chart_svg(schedule)

    def _li_items(items: list) -> str:
        return "".join(f"<li>{item}</li>" for item in items)

    threat_pills = "".join(
        f'<span class="threat-pill">{t}</span>' for t in intel.get("hyper_local_threats", [])
    )

    rows = ""
    for e in schedule:
        cls = 'class="moratorium"' if "Moratorium" in e.get("payment_type", "") else ""
        rows += (
            f'<tr {cls}>'
            f'<td>{e["quarter"]}</td>'
            f'<td style="text-align:left">{e["payment_type"]}</td>'
            f'<td>₹{e["opening_balance"]:,.0f}</td>'
            f'<td>₹{e["principal"]:,.0f}</td>'
            f'<td>₹{e["interest"]:,.0f}</td>'
            f'<td>₹{e["total_payment"]:,.0f}</td>'
            f'<td>₹{e["closing_balance"]:,.0f}</td>'
            f'</tr>'
        )

    scheme_name = fin["selected_scheme"]
    badge_class = "badge-micro" if "Micro" in scheme_name else "badge-term"

    return HTML_TEMPLATE.format(
        location=report_data.get("display_name", report_data.get("location", "")),
        category=report_data.get("business_category", ""),
        session_id=report_data.get("session_id", "")[:8],
        margin=fin["margin_contribution"],
        project_cost=fin["project_cost"],
        loan=fin["loan_amount"],
        scheme_name=scheme_name,
        badge_class=badge_class,
        rate=fin["interest_rate_pct"],
        tenure_months=fin["tenure_months"],
        tenure_years=fin["tenure_months"] // 12,
        moratorium_months=fin["moratorium_months"],
        emi=amort["quarterly_emi"],
        pie_chart=svg_to_data_uri(pie_svg),
        bar_chart=svg_to_data_uri(bar_svg),
        market_reach=intel.get("market_reach", ""),
        opportunity_analysis=intel.get("opportunity_analysis", ""),
        competitor_mapping=intel.get("competitor_mapping", ""),
        competitor_count=osm.get("competitor_count", 0),
        radius=osm.get("radius_km", 10),
        strengths_html=_li_items(swot.get("strengths", [])),
        weaknesses_html=_li_items(swot.get("weaknesses", [])),
        opportunities_html=_li_items(swot.get("opportunities", [])),
        threats_html=_li_items(swot.get("threats", [])),
        threat_pills=threat_pills,
        pricing_strategy=intel.get("pricing_strategy", ""),
        schedule_rows=rows,
        total_paid=amort.get("total_amount_paid", 0),
    )
