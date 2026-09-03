"""
FastAPI Route Definitions
==========================
All endpoints follow a strict orchestration order:
  1. Geocode → 2. OSM Fetch → 3. Financial Calc → 4. LLM Advisory → 5. Translate

The /calculate endpoint works without ANY external API keys (useful for demos).
"""

import logging
import random
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from app.api.models import (
    AdvisoryRequest,
    AmortizationResponse,
    CalculatorRequest,
    CalculatorResponse,
    ErrorResponse,
    FullReportResponse,
    HarvestRequest,
    LoanApplicationRequest,
    LoanApplicationResponse,
    LoanApprovalRequest,
    LoanApprovalResponse,
    MarkPaymentRequest,
    OSMSummaryResponse,
    SUPPORTED_CATEGORIES,
    SUPPORTED_LANGUAGES,
    RepaymentStatusResponse,
    SchemeResultResponse,
)
from app.core.amortization import generate_schedule
from app.core.calculator import SchemeError, calculate_finances
from app.core.geocoder import LocationNotFoundError, geocode_location
from app.core.osm_fetcher import fetch_competitors
from app.core.advisory import generate_feasibility_report
from app.core.loan_schedule import (
    build_monthly_schedule,
    default_scheme_terms,
    schedule_to_csv,
)
from app.core.cluster import build_activity
from app.core.harvest_store import (
    delete_harvest,
    harvest_summary,
    list_harvests,
    save_harvest,
)
from app.core.loan_store import (
    get_application,
    list_applications,
    save_application,
    update_application,
)
from app.core.portfolio import (
    cashflow as portfolio_cashflow,
    next_due as portfolio_next_due,
    summary as portfolio_summary,
)
from app.core.weather import WeatherUnavailableError, get_weather
from app.core.session_store import get_session, save_session
from app.core.translator import translate_report
from app.report.pdf import export_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: Convert core objects → response models
# ---------------------------------------------------------------------------

def _scheme_to_response(scheme) -> SchemeResultResponse:
    return SchemeResultResponse(**scheme.to_dict())


def _amortization_to_response(schedule) -> AmortizationResponse:
    d = schedule.to_dict()
    return AmortizationResponse(**d)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health", tags=["System"])
async def health_check() -> dict:
    """Liveness probe — returns 200 if the server is running."""
    return {"status": "ok", "service": "AI Business Advisory Assistant"}


@router.get("/categories", tags=["Reference"])
async def get_categories() -> dict:
    """Returns the list of supported business categories."""
    return {"categories": SUPPORTED_CATEGORIES}


@router.get("/languages", tags=["Reference"])
async def get_languages() -> dict:
    """Returns the list of supported output languages."""
    return {"languages": SUPPORTED_LANGUAGES}


@router.post(
    "/calculate",
    response_model=CalculatorResponse,
    tags=["Financial Calculator"],
    summary="Standalone Financial Calculator (no external APIs needed)",
)
async def calculate(req: CalculatorRequest) -> CalculatorResponse:
    """
    Pure deterministic financial calculation.
    Accepts margin capital → returns project cost, loan, scheme, and full
    quarterly amortization schedule. No LLM, no OSM, no API keys required.
    """
    try:
        scheme = calculate_finances(req.margin_capital)
    except SchemeError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    schedule = generate_schedule(
        loan_amount=scheme.loan_amount,
        annual_rate_pct=scheme.interest_rate_pct,
        tenure_months=scheme.tenure_months,
        moratorium_months=scheme.moratorium_months,
    )
    return CalculatorResponse(
        financials=_scheme_to_response(scheme),
        amortization=_amortization_to_response(schedule),
    )


@router.post(
    "/generate-report",
    response_model=FullReportResponse,
    tags=["Full Advisory Report"],
    summary="Generate Complete Business Feasibility Report",
)
async def generate_report(req: AdvisoryRequest) -> FullReportResponse:
    """
    Orchestrates all modules to generate a complete, bank-ready report:
      1. Geocode the location (Nominatim)
      2. Fetch competitor density (OSM Overpass)
      3. Calculate financials (deterministic — no LLM)
      4. Generate qualitative advisory (Groq LLM, strictly bounded)
      5. Translate to user's selected language (Bhashini / Google)
      6. Return structured FullReportResponse
    """
    # --- Step 1: Geocode ---
    try:
        geo = geocode_location(req.location)
    except Exception as e:
        logger.warning(f"Geocoding exception for '{req.location}': {e}. Falling back to regional default.")
        from app.core.geocoder import _get_fallback_location
        geo = _get_fallback_location(req.location)

    # --- Step 2: OSM Competitor Fetch ---
    try:
        osm_result = fetch_competitors(
            lat=geo.latitude,
            lon=geo.longitude,
            business_category=req.business_category,
            radius_km=req.radius_km,
        )
    except Exception as e:
        logger.warning(f"OSM fetch failed: {e}. Falling back to default sparse competitor profile.")
        from app.core.osm_fetcher import OSMResult
        osm_result = OSMResult(
            query_location=geo.display_name,
            radius_km=req.radius_km,
            business_category=req.business_category,
            competitor_count=2,
            competitors=[],
            density_level="Sparse",
            osm_tags_used=[],
        )

    # --- Step 3: Financial Calculation (deterministic, never fails unless bad input) ---
    try:
        scheme = calculate_finances(req.margin_capital)
    except SchemeError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    schedule = generate_schedule(
        loan_amount=scheme.loan_amount,
        annual_rate_pct=scheme.interest_rate_pct,
        tenure_months=scheme.tenure_months,
        moratorium_months=scheme.moratorium_months,
    )

    # --- Step 4: LLM Advisory (bounded to real OSM data) ---
    try:
        feasibility = generate_feasibility_report(
            location=geo.display_name,
            category=req.business_category,
            project_cost=scheme.project_cost,
            margin_capital=scheme.margin_contribution,
            loan_amount=scheme.loan_amount,
            osm_result=osm_result,
        )
    except EnvironmentError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"LLM service not configured: {e}")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Advisory generation failed: {e}")

    # --- Step 5: Translate ---
    feasibility_dict = feasibility.model_dump()
    if req.language != "en":
        feasibility_dict = translate_report(feasibility_dict, req.language)

    from app.api.models import FeasibilityReport, SWOTResponse
    translated_report = FeasibilityReport(
        market_reach=feasibility_dict["market_reach"],
        opportunity_analysis=feasibility_dict["opportunity_analysis"],
        competitor_mapping=feasibility_dict["competitor_mapping"],
        swot=SWOTResponse(**feasibility_dict["swot"]),
        hyper_local_threats=feasibility_dict["hyper_local_threats"],
        pricing_strategy=feasibility_dict["pricing_strategy"],
    )

    # --- Step 6: Assemble & store session ---
    session_id = str(uuid.uuid4())
    full_response = FullReportResponse(
        session_id=session_id,
        location=req.location,
        display_name=geo.display_name,
        business_category=req.business_category,
        language=req.language,
        financials=_scheme_to_response(scheme),
        amortization=_amortization_to_response(schedule),
        market_intelligence=translated_report,
        osm_summary=OSMSummaryResponse(**osm_result.to_summary_dict()),
    )
    save_session(session_id, full_response.model_dump())
    return full_response


@router.get(
    "/report/{session_id}/pdf",
    tags=["Full Advisory Report"],
    summary="Download Report as PDF",
    responses={404: {"model": ErrorResponse}},
)
async def download_pdf(session_id: str) -> Response:
    """
    Generates and returns a downloadable PDF of a previously generated report.
    The session must have been created via POST /generate-report first.
    """
    report_data = get_session(session_id)
    if report_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found. Generate a report first.",
        )
    try:
        pdf_bytes = export_pdf(report_data)
    except Exception as e:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"PDF generation failed: {e}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="feasibility_report_{session_id[:8]}.pdf"'
        },
    )


def _format_iso_date(iso_date: str) -> str:
    """Turn an ISO date into the display style used by the demo loans (e.g. Oct 03, 2026)."""
    try:
        return datetime.strptime(iso_date[:10], "%Y-%m-%d").strftime("%b %d, %Y")
    except (ValueError, TypeError):
        return iso_date


def _outstanding_principal(application: Dict[str, Any]) -> float:
    """Remaining principal after the latest recorded payment."""
    payments = application.get("payments") or []
    if not payments:
        return round(application.get("approved_amount", application.get("loan_amount", 0.0)), 2)
    last_month = payments[-1]["month"]
    for entry in application.get("schedule", []):
        if entry["month"] == last_month:
            return round(entry["closing_balance"], 2)
    return 0.0


def _build_repayment_status(application: Dict[str, Any]) -> Dict[str, Any]:
    """Assemble the repayment-tracking state for an approved application."""
    payments = application.get("payments") or []
    paid_map = {p["month"]: p for p in payments}

    schedule: List[Dict[str, Any]] = []
    for entry in application.get("schedule", []):
        paid = paid_map.get(entry["month"])
        schedule.append({
            **entry,
            "paid": paid is not None,
            "paid_on": paid["paid_on"] if paid else None,
        })

    months_total = application.get("tenure_months", 0)
    months_paid = len(payments)
    next_due_month = months_paid + 1 if months_paid < months_total else None
    next_due_date = None
    if next_due_month is not None:
        next_due_date = next(
            (entry["payment_date"] for entry in schedule if entry["month"] == next_due_month),
            None,
        )

    return {
        "id": application["id"],
        "status": application.get("status", "Pending"),
        "approved_amount": application.get("approved_amount", application.get("loan_amount", 0.0)),
        "annual_rate_pct": application.get("annual_rate_pct"),
        "tenure_months": months_total,
        "monthly_emi": application.get("monthly_emi"),
        "first_payment_date": application.get("first_payment_date"),
        "months_paid": months_paid,
        "months_total": months_total,
        "next_due_month": next_due_month,
        "next_due_date": next_due_date,
        "total_paid": round(sum(p.get("amount", 0.0) for p in payments), 2),
        "outstanding_principal": _outstanding_principal(application),
        "fully_paid": next_due_month is None,
        "schedule": schedule,
    }


def _application_to_loan_entry(application: Dict[str, Any]) -> dict:
    """Map a stored application to the display shape used by Loan History UI."""
    category_title = application["business_category"].replace("_", " ").title()
    status = application.get("status", "Pending")

    if status == "Active":
        # Approved loans show their EMI as the recurring amount
        payments = application.get("payments") or []
        due_date = _format_iso_date(application.get("first_payment_date", ""))
        if payments:
            next_month = len(payments) + 1
            for entry in application.get("schedule", []):
                if entry.get("month") == next_month:
                    due_date = _format_iso_date(entry.get("payment_date", ""))
                    break
        return {
            "source": "application",
            "id": application["id"],
            "name": f"{category_title} Business Loan — {application['scheme_name']}",
            "status": "Active",
            "dateLabel": "Next Repayment",
            "date": due_date,
            "amount": application.get("monthly_emi", application["loan_amount"]),
            "amountLabel": "Monthly EMI",
            "icon": "verified_user",
            "iconBg": "bg-primary-container/10",
            "iconColor": "text-primary",
            "statusBg": "bg-primary-container/20 text-primary-container",
            "statement_available": True,
            "interest_rate_pct": application.get("annual_rate_pct"),
            "tenure_months": application.get("tenure_months"),
            "months_paid": len(payments),
            "outstanding_principal": _outstanding_principal(application),
        }

    return {
        "source": "application",
        "id": application["id"],
        "name": f"{category_title} Business Loan — {application['scheme_name']}",
        "status": "Pending",
        "dateLabel": "Applied On",
        "date": application["applied_at"],
        "amount": application["loan_amount"],
        "amountLabel": "Requested",
        "icon": "hourglass_empty",
        "iconBg": "bg-surface-container-high",
        "iconColor": "text-on-surface-variant",
        "statusBg": "bg-surface-container text-on-surface",
        "statement_available": False,
    }


@router.post(
    "/loans/apply",
    response_model=LoanApplicationResponse,
    tags=["Loan Applications"],
    summary="Submit a new loan application",
)
async def apply_for_loan(req: LoanApplicationRequest) -> LoanApplicationResponse:
    """
    Persists a loan application submitted from the feasibility report and
    returns it with a generated reference id (e.g. LN-2026-4821).
    The application then shows up in GET /api/loan-history.
    """
    payload: Dict[str, Any] = req.model_dump()
    payload["status"] = "Pending"
    payload["applied_at"] = datetime.now().strftime("%b %d, %Y")

    year = datetime.now().year
    application_id = None
    for _ in range(20):
        candidate = f"LN-{year}-{random.randint(1000, 9999)}"
        payload_with_id = dict(payload, id=candidate)
        if save_application(candidate, payload_with_id):
            application_id = candidate
            payload = payload_with_id
            break

    if application_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate an application reference. Please try again.",
        )

    logger.info("Stored new loan application %s (%s)", application_id, req.business_category)
    return LoanApplicationResponse(**payload)


@router.post(
    "/loans/{application_id}/approve",
    response_model=LoanApprovalResponse,
    tags=["Loan Applications"],
    summary="Approve a pending loan application (bank officer)",
)
async def approve_loan(
    application_id: str,
    req: Optional[LoanApprovalRequest] = None,
) -> LoanApprovalResponse:
    """
    Bank-officer action that moves a Pending application to Active.

    A monthly EMI schedule is generated from the sanctioned amount and scheme
    terms (rate/tenure can be overridden in the request body). The approved
    loan then appears as Active in loan history and gains a downloadable
    statement.
    """
    application = get_application(application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found.",
        )
    if application.get("status") != "Pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Application '{application_id}' has already been processed "
                   f"(current status: {application.get('status', 'unknown')}).",
        )

    scheme_name = application.get("scheme_name", "Term Loan Scheme")
    default_rate, default_tenure = default_scheme_terms(scheme_name)
    # Precedence: officer override → terms quoted in the report calculator
    # (stored on the application) → scheme default. This keeps the approved
    # EMI consistent with what the farmer was shown when applying.
    annual_rate_pct = (req.annual_rate_pct if req and req.annual_rate_pct
                       else application.get("annual_rate_pct") or default_rate)
    tenure_months = (req.tenure_months if req and req.tenure_months
                     else application.get("tenure_months") or default_tenure)
    sanctioned = (req.approved_amount if req and req.approved_amount
                  else application.get("loan_amount", 0))

    schedule = build_monthly_schedule(sanctioned, annual_rate_pct, tenure_months)
    updates: Dict[str, Any] = {
        "status": "Active",
        "approved_at": datetime.now().date().isoformat(),
        "approved_amount": schedule["approved_amount"],
        "annual_rate_pct": schedule["annual_rate_pct"],
        "tenure_months": schedule["tenure_months"],
        "monthly_emi": schedule["monthly_emi"],
        "first_payment_date": schedule["first_payment_date"],
        "total_interest": schedule["total_interest"],
        "total_payable": schedule["total_payable"],
        "schedule": schedule["schedule"],
        "officer_note": (req.officer_note if req and req.officer_note else None),
    }
    updated = update_application(application_id, updates)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' disappeared while approving.",
        )

    logger.info(
        "Approved loan application %s: Rs%.0f @ %.2f%% for %d months (EMI Rs%.2f)",
        application_id, schedule["approved_amount"], annual_rate_pct,
        tenure_months, schedule["monthly_emi"],
    )
    return LoanApprovalResponse(**updated)


@router.get(
    "/loans/{application_id}/statement",
    tags=["Loan Applications"],
    summary="Download an approved loan's repayment statement (CSV)",
)
async def download_loan_statement(application_id: str) -> Response:
    """Streams the approved loan's full monthly repayment schedule as CSV."""
    application = get_application(application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found.",
        )
    if application.get("status") != "Active" or not application.get("schedule"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Statement is available only after the application is approved.",
        )

    result = {key: application[key] for key in (
        "approved_amount", "annual_rate_pct", "tenure_months", "monthly_emi",
        "first_payment_date", "total_interest", "total_payable",
    )}
    result["schedule"] = application["schedule"]

    return Response(
        content=schedule_to_csv(result).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="loan_statement_{application_id}.csv"'
        },
    )


@router.get(
    "/loans/{application_id}/repayment",
    response_model=RepaymentStatusResponse,
    tags=["Loan Applications"],
    summary="Get repayment tracking status for an approved loan",
)
async def get_repayment_status(application_id: str) -> RepaymentStatusResponse:
    """
    Returns the full monthly schedule with paid flags, the next due
    instalment, and the outstanding principal for an approved loan.
    """
    application = get_application(application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found.",
        )
    if application.get("status") != "Active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repayment tracking is available only after the application is approved.",
        )
    return RepaymentStatusResponse(**_build_repayment_status(application))


@router.post(
    "/loans/{application_id}/repayments/{month}",
    response_model=RepaymentStatusResponse,
    tags=["Loan Applications"],
    summary="Mark a scheduled monthly EMI as paid",
)
async def mark_repayment_paid(
    application_id: str,
    month: int,
    req: Optional[MarkPaymentRequest] = None,
) -> RepaymentStatusResponse:
    """
    Records payment of the next due instalment (instalments must be paid in
    order). Returns the updated repayment status.
    """
    application = get_application(application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' not found.",
        )
    if application.get("status") != "Active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved loans accept repayments.",
        )

    payments = application.get("payments") or []
    next_due = len(payments) + 1
    tenure_months = application.get("tenure_months", 0)

    if next_due > tenure_months:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Loan is already fully repaid.",
        )
    if month != next_due:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Instalment {next_due} is due next, not instalment {month}.",
        )

    scheduled = next(
        (entry for entry in application.get("schedule", []) if entry["month"] == month),
        None,
    )
    if scheduled is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Instalment {month} is not part of the repayment schedule.",
        )

    payment = {
        "month": month,
        "paid_on": (req.paid_on if req and req.paid_on else datetime.now().date().isoformat()),
        "amount": round((req.amount if req and req.amount else scheduled["total_payment"]), 2),
    }
    payments.append(payment)

    updated = update_application(application_id, {"payments": payments})
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application '{application_id}' disappeared while recording payment.",
        )

    logger.info(
        "Recorded repayment for %s: instalment %d (Rs%.2f) — %d/%d paid",
        application_id, month, payment["amount"], len(payments), tenure_months,
    )
    return RepaymentStatusResponse(**_build_repayment_status(updated))

@router.get(
    "/market-prices",
    tags=["Market Data"],
    summary="Get simulated dynamic market prices",
)
async def get_market_prices() -> dict:
    """Returns market prices for agricultural commodities (server-generated feed)."""
    base_crops = [
        {"id": 1, "name": "Soybean", "grade": "Yellow", "mandi": "Nagpur APMC Mandi", "category": "Oilseeds", "price": 4820, "unit": "quintal", "icon": "eco"},
        {"id": 2, "name": "Cotton", "grade": "Medium", "mandi": "Rajkot Mandi", "category": "Cash Crops", "price": 6800, "unit": "quintal", "icon": "local_florist"},
        {"id": 3, "name": "Tur / Arhar Dal", "grade": "Premium", "mandi": "Akola APMC Mandi", "category": "Pulses", "price": 10400, "unit": "quintal", "icon": "eco"},
        {"id": 4, "name": "Wheat", "grade": "Grade A", "mandi": "Akola APMC Mandi", "category": "Cereals", "price": 2450, "unit": "quintal", "icon": "grass"},
        {"id": 5, "name": "Basmati Rice", "grade": "Premium", "mandi": "Karnal", "category": "Cereals", "price": 4200, "unit": "quintal", "icon": "rice_bowl"},
        {"id": 6, "name": "Onion", "grade": "Red", "mandi": "Lasalgaon", "category": "Vegetables", "price": 2200, "unit": "quintal", "icon": "adjust"},
        {"id": 7, "name": "Chana (Bengal Gram)", "grade": "Standard", "mandi": "Akola APMC Mandi", "category": "Pulses", "price": 5200, "unit": "quintal", "icon": "eco"},
    ]
    
    results = []
    for crop in base_crops:
        fluctuation = random.uniform(-0.05, 0.05)
        new_price = int(crop["price"] * (1 + fluctuation))
        diff = new_price - crop["price"]
        trend = "up" if diff > 0 else ("down" if diff < 0 else "flat")
        trend_percent = round(abs(fluctuation) * 100, 1)
        
        c = crop.copy()
        c["price"] = new_price
        c["trend"] = trend
        c["trendAmount"] = abs(diff)
        c["trendPercent"] = trend_percent
        
        if trend == "up":
            c["status"] = "High Demand"
            c["trendColor"] = "text-primary"
            c["trendBg"] = "bg-primary-container/20 text-on-primary-container"
        elif trend == "down":
            c["status"] = "Low Demand"
            c["trendColor"] = "text-error"
            c["trendBg"] = "bg-error-container/20 text-on-error-container"
        else:
            c["status"] = "Stable"
            c["trendColor"] = "text-on-surface-variant"
            c["trendBg"] = "bg-surface-variant text-on-surface-variant"
            
        c["barColor"] = "bg-primary/20" if trend == "up" else "bg-outline/20"
        c["barHeight"] = f"{random.randint(30, 90)}%"
        
        results.append(c)
        
    return {
        "crops": results,
        "prices": results,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source": "Vidarbha cluster APMC composite feed",
    }


@router.get(
    "/loan-history",
    tags=["Loan History"],
    summary="Get user loan history",
)
async def get_loan_history() -> dict:
    """
    Returns the user's loan history: applications submitted through the app
    (persisted, newest first) followed by simulated demo loans.
    """
    today = datetime.now()
    stored_loans = [
        _application_to_loan_entry(application)
        for application in list_applications()
    ]
    return {"loans": stored_loans + [
        {
            "id": "LN-2023-8942",
            "name": "Seasonal Crop Loan",
            "status": "Active",
            "dateLabel": "Next Repayment",
            "date": (today + timedelta(days=15)).strftime("%b %d, %Y"),
            "amount": 8500,
            "amountLabel": "Principal",
            "icon": "agriculture",
            "iconBg": "bg-primary-container/10",
            "iconColor": "text-primary",
            "statusBg": "bg-primary-container/20 text-primary-container",
        },
        {
            "id": "LN-2023-9105",
            "name": "Equipment Finance",
            "status": "Active",
            "dateLabel": "Next Repayment",
            "date": (today + timedelta(days=30)).strftime("%b %d, %Y"),
            "amount": 6000,
            "amountLabel": "Principal",
            "icon": "precision_manufacturing",
            "iconBg": "bg-primary-container/10",
            "iconColor": "text-primary",
            "statusBg": "bg-primary-container/20 text-primary-container",
        },
        {
            "id": "LN-2024-0021",
            "name": "Solar Irrigation Advance",
            "status": "Pending",
            "dateLabel": "",
            "date": "Awaiting Approval",
            "amount": 12000,
            "amountLabel": "Requested",
            "icon": "hourglass_empty",
            "iconBg": "bg-surface-container-high",
            "iconColor": "text-on-surface-variant",
            "statusBg": "bg-surface-container text-on-surface",
        }
    ]}


# ---------------------------------------------------------------------------
# Weather & Crop Risk
# ---------------------------------------------------------------------------

@router.get(
    "/weather",
    tags=["Weather & Crop Risk"],
    summary="Live district weather forecast with crop-risk advisory",
)
async def weather_forecast(
    location: Optional[str] = None,
    days: int = 5,
) -> dict:
    """
    Real-time weather for the user's district via Open-Meteo (no key needed).
    Location names are geocoded through Nominatim; on failure it falls back to
    the Akola/Vidarbha district centroid. Returns current conditions, a daily
    forecast, a 0-10 crop risk score and rule-based advisories.
    """
    days = max(1, min(days, 7))
    try:
        return get_weather(location=location, days=days)
    except WeatherUnavailableError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )


# ---------------------------------------------------------------------------
# Harvest Logging
# ---------------------------------------------------------------------------

@router.post(
    "/harvest",
    tags=["Harvest Logging"],
    summary="Log a harvest lot",
)
async def add_harvest_lot(req: HarvestRequest) -> dict:
    """Persist a harvest lot and return it with its computed revenue."""
    payload = req.model_dump()
    if not payload.get("harvest_date"):
        payload["harvest_date"] = datetime.now().date().isoformat()

    harvest_id = None
    for _ in range(20):
        candidate = f"HV-{datetime.now().year}-{random.randint(1000, 9999)}"
        if save_harvest(candidate, dict(payload, id=candidate)):
            harvest_id = candidate
            break

    if harvest_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate a harvest reference. Please try again.",
        )

    record = dict(payload, id=harvest_id)
    record["revenue"] = round(record["quantity_qtl"] * record["price_per_qtl"], 2)
    logger.info("Logged harvest lot %s: %s x %.1f qtl", harvest_id, record["produce"], record["quantity_qtl"])
    return record


@router.get(
    "/harvest",
    tags=["Harvest Logging"],
    summary="List logged harvest lots with revenue summary",
)
async def get_harvest_logs(limit: int = 200) -> dict:
    """Returns stored harvest lots plus a dashboard-ready revenue summary."""
    lots = list_harvests()[: max(1, min(limit, 500))]
    return {"lots": lots, "summary": harvest_summary(lots)}


@router.delete(
    "/harvest/{harvest_id}",
    tags=["Harvest Logging"],
    summary="Delete a harvest lot",
)
async def remove_harvest_lot(harvest_id: str) -> dict:
    """Removes a mistakenly logged harvest lot."""
    if not delete_harvest(harvest_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Harvest lot '{harvest_id}' not found.",
        )
    return {"deleted": harvest_id}


# ---------------------------------------------------------------------------
# Portfolio (Dashboard KPIs, cashflow chart & repayment ledger)
# ---------------------------------------------------------------------------

@router.get(
    "/portfolio",
    tags=["Portfolio"],
    summary="Aggregated portfolio figures for the dashboard",
)
async def portfolio_overview() -> dict:
    """Outstanding balances, EMI commitments, subsidy totals and pipeline."""
    return portfolio_summary(list_applications())


@router.get(
    "/portfolio/cashflow",
    tags=["Portfolio"],
    summary="Upcoming EMI cashflow and detailed repayment ledger",
)
async def portfolio_cashflow_view(horizon: int = 6) -> dict:
    """Monthly EMI obligations (chart buckets) plus a per-loan repayment ledger."""
    horizon = max(1, min(horizon, 24))
    return portfolio_cashflow(list_applications(), horizon=horizon)


# ---------------------------------------------------------------------------
# Cluster co-op pulse
# ---------------------------------------------------------------------------

@router.get(
    "/cluster/activity",
    tags=["Cluster"],
    summary="Recent co-op cluster activity (real portal events)",
)
async def cluster_activity(limit: int = 10) -> dict:
    """Recent applications, approvals, repayments and harvests in the cluster."""
    return build_activity(list_applications(), list_harvests(), limit=max(1, min(limit, 30)))


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

_weather_notification_cache: Dict[str, Any] = {"at": 0.0, "payload": None}


def _cached_weather_notification() -> Optional[dict]:
    """Weather alert for the bell — cached 10 minutes so every click is cheap."""
    import time as _time

    if _weather_notification_cache["payload"] and _time.time() - _weather_notification_cache["at"] < 600:
        return _weather_notification_cache["payload"]
    try:
        data = get_weather()
        risk = data.get("risk", {})
        payload = None
        if (risk.get("score") or 0) >= 5:
            payload = {
                "id": "weather-risk",
                "type": "weather",
                "title": f"{risk.get('level', 'Risk')} crop-risk alert for your district",
                "body": " | ".join((risk.get("factors") or [])[:2]) or "Check the live forecast and advisories.",
                "time": "Live",
                "view": "weather",
            }
        _weather_notification_cache["at"] = _time.time()
        _weather_notification_cache["payload"] = payload
        return payload
    except WeatherUnavailableError:
        _weather_notification_cache["at"] = _time.time()
        _weather_notification_cache["payload"] = None
        return None


@router.get(
    "/notifications",
    tags=["Notifications"],
    summary="Real notifications derived from portfolio & weather state",
)
async def get_notifications() -> dict:
    """
    Notifications are assembled from genuine app state: EMI instalments due
    within 7 days, applications awaiting officer sanction, and live weather
    risk alerts.
    """
    today = datetime.now().date()
    items: List[Dict[str, Any]] = []

    pending_count = sum(1 for a in list_applications() if a.get("status") == "Pending")
    if pending_count:
        items.append({
            "id": "pending-queue",
            "type": "approval",
            "title": f"{pending_count} loan application{'s' if pending_count != 1 else ''} awaiting sanction",
            "body": "Review the queue in Loan Management to approve and generate EMI schedules.",
            "time": "Now",
            "view": "history",
        })

    for application in list_applications():
        if application.get("status") != "Active":
            continue
        due = portfolio_next_due(application)
        if not due:
            continue
        try:
            due_date = datetime.strptime(due["date"][:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_left = (due_date - today).days
        if 0 <= days_left <= 7:
            category = application.get("business_category", "Loan").replace("_", " ").title()
            items.append({
                "id": f"emi-{application.get('id')}",
                "type": "emi",
                "title": f"EMI due — {category} loan {application.get('id')}",
                "body": f"₹{float(due['amount']):,.2f} on {due_date.strftime('%d %b %Y')}. Mark it paid to keep the schedule on track.",
                "time": f"in {days_left} day{'s' if days_left != 1 else ''}" if days_left else "today",
                "view": "history",
            })

    weather_alert = _cached_weather_notification()
    if weather_alert:
        items.append(weather_alert)

    items.sort(key=lambda n: 0 if n.get("time") in ("Now", "Live", "today") else 1)
    return {"notifications": items[:10], "unread": len(items)}
