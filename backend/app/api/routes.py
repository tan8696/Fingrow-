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
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.api.auth_routes import current_user
from app.core.auth import update_profile
from app.api.models import (
    FeasibilityReport,
    InsuranceEnrolRequest,
    RepaymentPlanRequest,
    StressTestReport,
    StressTestRequest,
    AdvisoryRequest,
    AmortizationResponse,
    CalculatorRequest,
    CalculatorResponse,
    ChatRequest,
    ChatResponse,
    ErrorResponse,
    FullReportResponse,
    HarvestRequest,
    InsuranceClaimRequest,
    LoanApplicationRequest,
    LoanApplicationResponse,
    LoanApprovalRequest,
    LoanApprovalResponse,
    MarkPaymentRequest,
    OSMSummaryResponse,
    ReminderRequest,
    SUPPORTED_CATEGORIES,
    SUPPORTED_LANGUAGES,
    RepaymentStatusResponse,
    SchemeResultResponse,
)
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
    DAMAGE_TYPES,
    new_policy,
    estimate_claim,
    evaluate_triggers,
    protocol_document,
)
from app.core.amortization import generate_schedule
from app.core.calculator import SchemeError, calculate_finances
from app.core.geocoder import LocationNotFoundError, geocode_location
from app.core.mandi import DEFAULT_STATE, fetch_live_prices, sample_prices
from app.core.crop_calendar import align_schedule, repayment_capacity
from app.core.stress import generate_stress_test
from app.core.receipt import (
    ENGINE_VERSION,
    KIND_MODEL,
    KIND_OBSERVATION,
    KIND_RULE,
    build_receipt,
    scheme_gate,
    source,
    verify_receipt,
)
from app.core.osm_fetcher import fetch_competitors
from app.core.supplier_fetcher import fetch_suppliers
from app.core.advisory import GROQ_MODEL, generate_feasibility_report
from app.core.chat import chat as chat_with_llm
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
async def generate_report(req: AdvisoryRequest, user: Dict[str, Any] = Depends(current_user)) -> FullReportResponse:
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
    geo_live = True
    try:
        geo = geocode_location(req.location)
    except Exception as e:
        logger.warning(f"Geocoding exception for '{req.location}': {e}. Falling back to regional default.")
        from app.core.geocoder import _get_fallback_location
        geo = _get_fallback_location(req.location)
        geo_live = False

    # --- Step 2: OSM Competitor Fetch ---
    osm_live = True
    try:
        osm_result = fetch_competitors(
            lat=geo.latitude,
            lon=geo.longitude,
            business_category=req.business_category,
            radius_km=req.radius_km,
        )
    except Exception as e:
        logger.warning(f"OSM fetch failed: {e}. Falling back to default sparse competitor profile.")
        osm_live = False
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

    # --- Step 2.5: OSM Supplier Fetch ---
    try:
        supplier_result = fetch_suppliers(
            lat=geo.latitude,
            lon=geo.longitude,
            business_category=req.business_category,
            radius_km=req.radius_km * 2, # broader radius for suppliers
        )
        suppliers_list = [s.to_dict() for s in supplier_result.suppliers]
    except Exception as e:
        logger.warning(f"Supplier fetch failed: {e}. Defaulting to empty suppliers.")
        suppliers_list = []

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

    translated_report = FeasibilityReport(**feasibility_dict)

    # --- Step 5.5: Place the repayment schedule against real earning months ---
    alignment = align_schedule(
        schedule=schedule.to_dict()["schedule"],
        business_category=req.business_category,
        moratorium_months=scheme.moratorium_months,
    )

    # --- Step 6: Decision receipt (provenance + reproducible hash) ---
    financials_dict = scheme.to_dict()
    receipt = build_receipt(
        inputs={
            "margin_capital": req.margin_capital,
            "location": req.location,
            "business_category": req.business_category,
            "radius_km": req.radius_km,
        },
        financials=financials_dict,
        sources=[
            source(
                "financials", KIND_RULE, f"deterministic engine v{ENGINE_VERSION}",
                scheme_gate(scheme.project_cost),
            ),
            source(
                "amortization", KIND_RULE, f"deterministic engine v{ENGINE_VERSION}",
                f"quarterly reducing balance at {scheme.interest_rate_pct}% over "
                f"{scheme.tenure_months} months, {scheme.moratorium_months}-month moratorium",
            ),
            source(
                "display_name", KIND_OBSERVATION,
                "Nominatim (OpenStreetMap)" if geo_live else "regional fallback table",
                f"{geo.display_name} at {geo.latitude:.4f}, {geo.longitude:.4f}"
                + ("" if geo_live else " — geocoder unreachable, coarse district centroid used"),
            ),
            source(
                "osm_summary", KIND_OBSERVATION,
                "OpenStreetMap Overpass API" if osm_live else "default sparse profile",
                f"{osm_result.competitor_count} competitors within {osm_result.radius_km} km; "
                f"tags {', '.join(osm_result.osm_tags_used) or 'none'}"
                + ("" if osm_live else " — Overpass unreachable, density not measured"),
            ),
            source(
                "repayment_alignment", KIND_RULE, "crop calendar (deterministic)",
                alignment.get("summary", "") + " " + alignment.get("pattern_note", ""),
            ),
            source(
                "market_intelligence", KIND_MODEL, f"Groq {GROQ_MODEL}",
                "narrative only, grounded in the OSM counts above; excluded from all financial math",
            ),
        ],
    )

    # --- Step 7: Assemble & store session ---
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
        osm_summary=OSMSummaryResponse(**osm_result.to_summary_dict(), suppliers=suppliers_list),
        receipt=receipt,
        repayment_alignment=alignment,
    )
    save_session(session_id, full_response.model_dump(), user_id=user["user_id"])
    return full_response


@router.post(
    "/stress-test/{session_id}",
    response_model=StressTestReport,
    tags=["Full Advisory Report"],
    summary="Argue the case against a generated report",
    responses={404: {"model": ErrorResponse}},
)
async def stress_test(session_id: str, req: Optional[StressTestRequest] = None, user: Dict[str, Any] = Depends(current_user)) -> StressTestReport:
    """
    Re-examine a stored report from the opposite direction: what would make
    this proposal fail.

    Runs against the same ground truth the recommendation used — the
    deterministic financials, the measured competitor density, and the
    instalments the crop calendar flagged as falling in months with no income —
    so the critique is specific to this proposal rather than generic caution.
    """
    report = get_session(session_id, user_id=user["user_id"])
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No report found for session '{session_id}'.",
        )

    osm_summary = report.get("osm_summary") or {}
    alignment = report.get("repayment_alignment")
    amortization = report.get("amortization") or {}

    capacity = None
    if req and req.expected_annual_income:
        capacity = repayment_capacity(
            quarterly_emi=float(amortization.get("quarterly_emi") or 0),
            expected_annual_income=req.expected_annual_income,
            income_month_count=len((alignment or {}).get("income_months", [])) or 12,
        )

    try:
        return generate_stress_test(
            location=report.get("display_name") or report.get("location") or "",
            category=report.get("business_category") or "",
            financials=report.get("financials") or {},
            amortization=amortization,
            osm_summary=osm_summary,
            alignment=alignment,
            capacity=capacity,
            competitor_names=[
                c.get("name") for c in (osm_summary.get("competitors") or []) if c.get("name")
            ],
        )
    except EnvironmentError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM service not configured: {e}",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post(
    "/repayment-plan",
    tags=["Full Advisory Report"],
    summary="Check a repayment schedule against the borrower's earning months",
)
async def repayment_plan(req: RepaymentPlanRequest) -> dict:
    """
    Two questions the loan-sizing rule alone cannot answer:

      1. Do the instalments land in months when this business actually earns?
      2. Can the expected income carry the annual repayment at all?

    The scheme sizes a loan from the borrower's margin capital, which says
    nothing about repayment capacity. Both checks here are deterministic.
    """
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

    disbursement = None
    if req.disbursement_date:
        try:
            disbursement = date.fromisoformat(req.disbursement_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"disbursement_date must be an ISO date (YYYY-MM-DD), got '{req.disbursement_date}'.",
            )

    alignment = align_schedule(
        schedule=schedule.to_dict()["schedule"],
        business_category=req.business_category,
        disbursement=disbursement,
        moratorium_months=scheme.moratorium_months,
    )

    return {
        "financials": scheme.to_dict(),
        "alignment": alignment,
        "capacity": repayment_capacity(
            quarterly_emi=schedule.quarterly_emi,
            expected_annual_income=req.expected_annual_income or 0.0,
            income_month_count=len(alignment["income_months"]),
        ),
    }


@router.get(
    "/verify/{session_id}",
    tags=["Full Advisory Report"],
    summary="Re-derive a report's financials and confirm they reproduce",
    responses={404: {"model": ErrorResponse}},
)
async def verify_report(session_id: str, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """
    Independently recompute the financial figures of a stored report from the
    inputs recorded on its receipt, and report whether they still match.

    This is what makes the report auditable: a lender can re-run it months
    later and get either an exact reproduction, or a precise statement of what
    changed. A report issued before a scheme amendment comes back as
    ``rules_changed`` rather than as an error — it was correct when issued.
    """
    report = get_session(session_id, user_id=user["user_id"])
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No report found for session '{session_id}'.",
        )

    receipt = report.get("receipt")
    if not receipt:
        return {
            "session_id": session_id,
            "status": "unverifiable",
            "reason": "this report predates decision receipts — regenerate it to get a verifiable copy",
        }

    verdict = verify_receipt(receipt, report.get("financials") or {})
    return {
        "session_id": session_id,
        "issued_at": receipt.get("issued_at"),
        "receipt_hash": receipt.get("receipt_hash"),
        "short_hash": receipt.get("short_hash"),
        "sources": receipt.get("sources", []),
        **verdict,
    }


@router.get(
    "/report/{session_id}/pdf",
    tags=["Full Advisory Report"],
    summary="Download Report as PDF",
    responses={404: {"model": ErrorResponse}},
)
async def download_pdf(session_id: str, user: Dict[str, Any] = Depends(current_user)) -> Response:
    """
    Generates and returns a downloadable PDF of a previously generated report.
    The session must have been created via POST /generate-report first.
    """
    report_data = get_session(session_id, user_id=user["user_id"])
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
async def apply_for_loan(req: LoanApplicationRequest, user: Dict[str, Any] = Depends(current_user)) -> LoanApplicationResponse:
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
        if save_application(candidate, payload_with_id, user_id=user["user_id"]):
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
    user: Dict[str, Any] = Depends(current_user),
) -> LoanApprovalResponse:
    """
    Bank-officer action that moves a Pending application to Active.

    A monthly EMI schedule is generated from the sanctioned amount and scheme
    terms (rate/tenure can be overridden in the request body). The approved
    loan then appears as Active in loan history and gains a downloadable
    statement.
    """
    application = get_application(application_id, user_id=user["user_id"])
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
    updated = update_application(application_id, updates, user_id=user["user_id"])
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
async def download_loan_statement(application_id: str, user: Dict[str, Any] = Depends(current_user)) -> Response:
    """Streams the approved loan's full monthly repayment schedule as CSV."""
    application = get_application(application_id, user_id=user["user_id"])
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
async def get_repayment_status(application_id: str, user: Dict[str, Any] = Depends(current_user)) -> RepaymentStatusResponse:
    """
    Returns the full monthly schedule with paid flags, the next due
    instalment, and the outstanding principal for an approved loan.
    """
    application = get_application(application_id, user_id=user["user_id"])
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
    user: Dict[str, Any] = Depends(current_user),
) -> RepaymentStatusResponse:
    """
    Records payment of the next due instalment (instalments must be paid in
    order). Returns the updated repayment status.
    """
    application = get_application(application_id, user_id=user["user_id"])
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

    updated = update_application(application_id, {"payments": payments}, user_id=user["user_id"])
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
    summary="Daily APMC mandi prices (AGMARKNET via data.gov.in)",
)
async def get_market_prices(state: Optional[str] = None) -> dict:
    """
    Real daily arrivals from the Government of India AGMARKNET feed.

    Requires ``DATA_GOV_API_KEY``. Without it — or if the upstream call fails —
    a clearly labelled sample set is returned with ``is_live: false`` so the UI
    badges it as demo data instead of presenting it as live.
    """
    target_state = state or DEFAULT_STATE
    try:
        crops = fetch_live_prices(target_state)
        return {
            "crops": crops,
            "prices": crops,
            "is_live": True,
            "source": f"AGMARKNET · data.gov.in · {target_state}",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        }
    except Exception as exc:  # missing key, network error, or empty upstream feed
        logger.warning("AGMARKNET fetch failed (%s) — serving labelled sample feed.", exc)
        crops = sample_prices()
        return {
            "crops": crops,
            "prices": crops,
            "is_live": False,
            "source": "Sample data — set DATA_GOV_API_KEY for live AGMARKNET prices",
            "notice": str(exc),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        }


@router.get(
    "/loan-history",
    tags=["Loan History"],
    summary="Get user loan history",
)
async def get_loan_history(user: Dict[str, Any] = Depends(current_user)) -> dict:
    """
    The signed-in account's loan applications, newest first.

    A new account has none. Nothing is seeded here — use POST /api/demo/seed
    to populate a demonstration portfolio explicitly.
    """
    today = datetime.now()
    stored_loans = [
        _application_to_loan_entry(application)
        for application in list_applications(user_id=user["user_id"])
    ]
    return {"loans": stored_loans}


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
async def add_harvest_lot(req: HarvestRequest, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Persist a harvest lot and return it with its computed revenue."""
    payload = req.model_dump()
    if not payload.get("harvest_date"):
        payload["harvest_date"] = datetime.now().date().isoformat()

    harvest_id = None
    for _ in range(20):
        candidate = f"HV-{datetime.now().year}-{random.randint(1000, 9999)}"
        if save_harvest(candidate, dict(payload, id=candidate), user_id=user["user_id"]):
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
async def get_harvest_logs(limit: int = 200, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Returns stored harvest lots plus a dashboard-ready revenue summary."""
    lots = list_harvests(user_id=user["user_id"])[: max(1, min(limit, 500))]
    return {"lots": lots, "summary": harvest_summary(lots)}


@router.delete(
    "/harvest/{harvest_id}",
    tags=["Harvest Logging"],
    summary="Delete a harvest lot",
)
async def remove_harvest_lot(harvest_id: str, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Removes a mistakenly logged harvest lot."""
    if not delete_harvest(harvest_id, user_id=user["user_id"]):
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
async def portfolio_overview(user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Outstanding balances, EMI commitments, subsidy totals and pipeline."""
    return portfolio_summary(list_applications(user_id=user["user_id"]))


@router.get(
    "/portfolio/cashflow",
    tags=["Portfolio"],
    summary="Upcoming EMI cashflow and detailed repayment ledger",
)
async def portfolio_cashflow_view(horizon: int = 6, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Monthly EMI obligations (chart buckets) plus a per-loan repayment ledger."""
    horizon = max(1, min(horizon, 24))
    return portfolio_cashflow(list_applications(user_id=user["user_id"]), horizon=horizon)


# ---------------------------------------------------------------------------
# Cluster co-op pulse
# ---------------------------------------------------------------------------

@router.get(
    "/cluster/activity",
    tags=["Cluster"],
    summary="Recent co-op cluster activity (real portal events)",
)
async def cluster_activity(limit: int = 10, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Recent applications, approvals, repayments and harvests in the cluster."""
    return build_activity(list_applications(user_id=user["user_id"]), list_harvests(user_id=user["user_id"]), limit=max(1, min(limit, 30)))


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
async def get_notifications(user: Dict[str, Any] = Depends(current_user)) -> dict:
    """
    Notifications are assembled from genuine app state: EMI instalments due
    within 7 days, applications awaiting officer sanction, and live weather
    risk alerts.
    """
    today = datetime.now().date()
    items: List[Dict[str, Any]] = []

    pending_count = sum(1 for a in list_applications(user_id=user["user_id"]) if a.get("status") == "Pending")
    if pending_count:
        items.append({
            "id": "pending-queue",
            "type": "approval",
            "title": f"{pending_count} loan application{'s' if pending_count != 1 else ''} awaiting sanction",
            "body": "Review the queue in Loan Management to approve and generate EMI schedules.",
            "time": "Now",
            "view": "history",
        })

    for application in list_applications(user_id=user["user_id"]):
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

    for claim in list_claims(user_id=user["user_id"])[:3]:
        items.append({
            "id": f"claim-{claim.get('id')}",
            "type": "claim",
            "title": f"Weather claim {claim.get('id')} submitted",
            "body": f"₹{float(claim.get('estimate_amount') or 0):,.0f} estimated for {claim.get('damage_type', 'damage')} — track it in Weather & Crop Risk.",
            "time": "Now",
            "view": "weather",
        })

    items.sort(key=lambda n: 0 if n.get("time") in ("Now", "Live", "today") else 1)
    return {"notifications": items[:10], "unread": len(items)}


# ---------------------------------------------------------------------------
# Weather & Crop Risk — insurance, reminders & protocol
# ---------------------------------------------------------------------------

@router.get(
    "/insurance/policy",
    tags=["Weather & Crop Risk"],
    summary="Parametric insurance policy with live trigger evaluation & claims",
)
async def insurance_policy(location: Optional[str] = None, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """
    Trigger meters evaluated against the live 7-day forecast, plus the
    borrower's own policy and claims.

    ``policy`` is null and ``enrolled`` false until the account enrols via
    POST /api/insurance/enrol. The trigger meters still work without a policy —
    they read the weather, not the cover — so the page stays useful either way.
    """
    try:
        weather = get_weather(location=location, days=7)
        triggers = evaluate_triggers(weather)
        weather_error = None
    except WeatherUnavailableError as e:
        weather = {}
        triggers = evaluate_triggers(weather)
        triggers["triggers"] = [dict(t, status="Offline", note="Live feed unreachable — recheck later.") for t in triggers["triggers"]]
        weather_error = str(e)

    policy = (user.get("profile") or {}).get("insurance_policy")

    claims = list_claims(user_id=user["user_id"])
    for claim in claims:
        claim["estimate"] = estimate_claim(
            claim.get("damage_type", "excess_rain"),
            float(claim.get("area_acres") or 0),
            policy=policy,
        )

    return {
        "enrolled": policy is not None,
        "policy": policy,
        "damage_types": DAMAGE_TYPES,
        "claim_factors": CLAIM_FACTORS,
        "payout_history": [],
        "triggers": triggers.get("triggers", []),
        "policy_health": triggers.get("policy_health", "Offline"),
        "claims": claims,
        "weather_error": weather_error,
        "fetched_at": (weather or {}).get("fetched_at") or datetime.now(timezone.utc).isoformat(),
    }


@router.post(
    "/insurance/enrol",
    tags=["Weather & Crop Risk"],
    summary="Enrol this account in a crop insurance policy",
)
async def enrol_insurance(
    req: InsuranceEnrolRequest,
    user: Dict[str, Any] = Depends(current_user),
) -> dict:
    """
    Create the account's policy. Until this is called the account has no cover,
    and no claim can be filed against it.
    """
    profile = user.get("profile") or {}
    if profile.get("insurance_policy"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already enrolled in a policy.",
        )

    policy = new_policy(req.crop, req.area_acres, req.sum_insured, req.season)
    updated = update_profile(user["user_id"], {"insurance_policy": policy})
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    logger.info("Enrolled %s in policy %s", user["user_id"], policy["policy_id"])
    return {"enrolled": True, "policy": policy}


@router.post(
    "/insurance/claims",
    tags=["Weather & Crop Risk"],
    summary="File a parametric weather damage claim",
)
async def add_insurance_claim(req: InsuranceClaimRequest, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """
    Persists a claim with a deterministic payout estimate and returns the
    filed record (a notification is raised so the claim surfaces in the bell).
    """
    payload = req.model_dump()
    if payload.get("damage_type") not in CLAIM_FACTORS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported damage type '{payload['damage_type']}'. Choose from {list(CLAIM_FACTORS)}.",
        )

    policy = (user.get("profile") or {}).get("insurance_policy")
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enrol in a crop insurance policy before filing a claim.",
        )
    if float(payload["area_acres"]) > float(policy.get("area_acres") or 0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Claimed area ({payload['area_acres']} acres) exceeds the "
                f"{policy.get('area_acres')} acres insured under this policy."
            ),
        )

    estimate = estimate_claim(payload["damage_type"], float(payload["area_acres"]), policy=policy)

    claim_id = None
    for _ in range(20):
        candidate = f"CLM-{datetime.now().year}-{random.randint(1000, 9999)}"
        record = dict(
            payload,
            id=candidate,
            status="Submitted",
            created_at=datetime.now().isoformat(timespec="seconds"),
            estimate_amount=estimate["estimate_amount"],
            basis=estimate["basis"],
        )
        if save_claim(candidate, record, user_id=user["user_id"]):
            claim_id = candidate
            break

    if claim_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate a claim reference. Please try again.",
        )

    logger.info(
        "Filed weather claim %s: %s over %.1f acres — est Rs%.0f",
        claim_id, payload["damage_type"], payload["area_acres"], estimate["estimate_amount"],
    )
    return record


@router.delete(
    "/insurance/claims/{claim_id}",
    tags=["Weather & Crop Risk"],
    summary="Withdraw a submitted claim",
)
async def remove_insurance_claim(claim_id: str, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Removes a mistakenly filed claim."""
    if not delete_claim(claim_id, user_id=user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim '{claim_id}' not found.",
        )
    return {"deleted": claim_id}


@router.get(
    "/reminders",
    tags=["Weather & Crop Risk"],
    summary="List scheduled field reminders",
)
async def get_reminders(user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Return stored SMS/call/push field reminders, newest first."""
    return {"reminders": list_reminders(user_id=user["user_id"])}


@router.post(
    "/reminders",
    tags=["Weather & Crop Risk"],
    summary="Schedule a spray/field reminder",
)
async def add_reminder(req: ReminderRequest, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Persist a field reminder for the chosen spray window."""
    reminder_id = None
    for _ in range(20):
        candidate = f"RM-{datetime.now().year}-{random.randint(1000, 9999)}"
        record = dict(req.model_dump(), id=candidate, created_at=datetime.now().isoformat(timespec="seconds"))
        if save_reminder(candidate, record, user_id=user["user_id"]):
            reminder_id = candidate
            break
    if reminder_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate a reminder reference. Please try again.",
        )
    logger.info("Scheduled %s reminder %s for %s", req.kind, reminder_id, req.target_date)
    return record


@router.delete(
    "/reminders/{reminder_id}",
    tags=["Weather & Crop Risk"],
    summary="Cancel a scheduled reminder",
)
async def remove_reminder(reminder_id: str, user: Dict[str, Any] = Depends(current_user)) -> dict:
    """Cancel a previously scheduled reminder."""
    if not delete_reminder(reminder_id, user_id=user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reminder '{reminder_id}' not found.",
        )
    return {"deleted": reminder_id}


@router.get(
    "/weather/protocol",
    tags=["Weather & Crop Risk"],
    summary="Download the generated spray-protocol document (HTML, print to PDF)",
)
async def weather_protocol(location: Optional[str] = None) -> Response:
    """
    Renders a printable crop-protection protocol from the live forecast.
    Served as a file download; open it in a browser and 'Print → Save as PDF'.
    """
    try:
        weather = get_weather(location=location, days=7)
    except WeatherUnavailableError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e),
        )
    doc = protocol_document(weather)
    return Response(
        content=doc["html"].encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )


# ---------------------------------------------------------------------------
# Conversational Chat (LLM-powered)
# ---------------------------------------------------------------------------

@router.post(
    "/chat",
    response_model=ChatResponse,
    tags=["Chat Assistant"],
    summary="Send a message to the AI assistant",
)
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    """
    Conversational AI assistant powered by Groq LLM.

    Accepts a user message with optional conversation history and returns
    a contextual response. If the user asks to navigate to a page, the
    response includes a `navigate_to` field that the frontend uses to
    switch views.
    """
    try:
        history = [msg.model_dump() for msg in req.history] if req.history else []
        result = chat_with_llm(
            message=req.message,
            history=history,
            language=req.language,
            current_view=req.current_view,
        )
        return ChatResponse(**result)
    except EnvironmentError as e:
        logger.warning(f"Chat unavailable (no API key): {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat is not configured. Please set GROQ_API_KEY.",
        )
    except ValueError as e:
        logger.warning(f"Chat LLM response error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI response error: {e}",
        )
    except Exception as e:
        logger.error(f"Unexpected chat error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again.",
        )

