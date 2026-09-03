"""
Pydantic Schemas — Request & Response Models
=============================================
All API input/output is validated here. Financial fields are never optional
on the response side — the calculator guarantees their presence.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Supported Languages
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "हिन्दी (Hindi)",
    "mr": "मराठी (Marathi)",
    "ta": "தமிழ் (Tamil)",
    "te": "తెలుగు (Telugu)",
    "bn": "বাংলা (Bengali)",
    "gu": "ગુજરાતી (Gujarati)",
    "kn": "ಕನ್ನಡ (Kannada)",
    "ml": "മലയാളം (Malayalam)",
    "pa": "ਪੰਜਾਬੀ (Punjabi)",
    "or": "ଓଡ଼ିଆ (Odia)",
}

SUPPORTED_CATEGORIES = list([
    "dairy", "grocery", "vegetables", "pharmacy", "tailoring",
    "electronics", "restaurant", "bakery", "hardware", "clothing",
    "cattle_feed", "flour_mill", "beauty_parlour", "poultry",
    "fuel", "auto_repair", "stationery", "fertilizer", "general_store",
])


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class AdvisoryRequest(BaseModel):
    """Main request body for the full report generation endpoint."""
    location: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description="Village, Block, District location (e.g., 'Rampur Village, Barabanki, UP')",
        examples=["Rampur Village, Barabanki, UP"],
    )
    margin_capital: float = Field(
        ...,
        gt=0,
        description="User's own available capital in INR (₹). Must be positive.",
        examples=[25000],
    )
    business_category: str = Field(
        ...,
        description="Proposed business type.",
        examples=["dairy"],
    )
    language: str = Field(
        default="en",
        description="Output language code (e.g., 'hi' for Hindi, 'en' for English).",
        examples=["hi"],
    )
    radius_km: float = Field(
        default=10.0,
        ge=1.0,
        le=25.0,
        description="Competitor search radius in kilometers (default 10km).",
    )

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language '{v}'. Supported: {list(SUPPORTED_LANGUAGES.keys())}")
        return v

    @field_validator("business_category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        return v.lower().strip().replace(" ", "_")


class CalculatorRequest(BaseModel):
    """Standalone financial calculator request (no LLM, no APIs required)."""
    margin_capital: float = Field(..., gt=0, description="User's own capital in INR (₹).")


class HarvestRequest(BaseModel):
    """A harvest lot logged from the dashboard."""
    produce: str = Field(..., min_length=2, max_length=80, description="Crop/produce name (e.g. Soybean).")
    quantity_qtl: float = Field(..., gt=0, le=100000, description="Quantity harvested in quintals.")
    price_per_qtl: float = Field(..., ge=0, le=1000000, description="Price realised per quintal (INR).")
    harvest_date: Optional[str] = Field(None, description="ISO date of harvest (defaults to today).")
    notes: Optional[str] = Field(None, max_length=300)


class LoanApplicationRequest(BaseModel):
    """Payload submitted from the report page's 'Apply for this Loan' flow."""
    applicant_name: str = Field(..., min_length=2, max_length=100)
    mobile: str = Field(..., pattern=r"^\d{10}$", description="10-digit mobile number.")
    branch: str = Field(..., min_length=3, max_length=150)
    business_category: str = Field(..., min_length=2, max_length=50)
    scheme_name: str = Field(..., min_length=2, max_length=100)
    loan_amount: float = Field(..., gt=0, description="Requested loan amount in INR (₹).")
    subsidy_amount: float = Field(..., ge=0, description="Eligible capital subsidy in INR (₹).")
    annual_rate_pct: Optional[float] = Field(
        None, gt=0, le=30,
        description="Interest rate (% p.a.) quoted by the report calculator — approval defaults to this unless the officer overrides.",
    )
    tenure_months: Optional[int] = Field(
        None, ge=1, le=240,
        description="Tenure (months) quoted by the report calculator — approval defaults to this unless the officer overrides.",
    )


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class SchemeResultResponse(BaseModel):
    margin_contribution: float
    project_cost: float
    loan_amount: float
    selected_scheme: str
    interest_rate_pct: float
    tenure_months: int
    moratorium_months: int


class PaymentEntryResponse(BaseModel):
    quarter: int
    payment_type: str
    opening_balance: float
    principal: float
    interest: float
    total_payment: float
    closing_balance: float


class AmortizationResponse(BaseModel):
    loan_amount: float
    annual_rate_pct: float
    tenure_months: int
    moratorium_months: int
    quarterly_emi: float
    total_quarters: int
    total_interest_paid: float
    total_amount_paid: float
    schedule: List[PaymentEntryResponse]


class SWOTResponse(BaseModel):
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    threats: List[str]


class FeasibilityReport(BaseModel):
    """The qualitative advisory output — schema must match LLM JSON output exactly."""
    market_reach: str
    opportunity_analysis: str
    competitor_mapping: str
    swot: SWOTResponse
    hyper_local_threats: List[str]
    pricing_strategy: str


class OSMSummaryResponse(BaseModel):
    competitor_count: int
    density_level: str
    radius_km: float
    sample_competitors: List[dict]
    osm_tags_queried: List[str]


class FullReportResponse(BaseModel):
    """Complete response combining all modules."""
    session_id: str
    location: str
    display_name: str               # Nominatim-resolved location name
    business_category: str
    language: str
    financials: SchemeResultResponse
    amortization: AmortizationResponse
    market_intelligence: FeasibilityReport
    osm_summary: OSMSummaryResponse


class CalculatorResponse(BaseModel):
    """Standalone calculator response."""
    financials: SchemeResultResponse
    amortization: AmortizationResponse


class LoanApplicationResponse(BaseModel):
    """A stored loan application as returned by POST /api/loans/apply."""
    id: str
    applicant_name: str
    mobile: str
    branch: str
    business_category: str
    scheme_name: str
    loan_amount: float
    subsidy_amount: float
    annual_rate_pct: Optional[float] = None
    tenure_months: Optional[int] = None
    status: str = "Pending"
    applied_at: str


class LoanApprovalRequest(BaseModel):
    """Optional terms a bank officer can adjust when approving an application.
    Omitted fields default to the application's scheme terms."""
    approved_amount: Optional[float] = Field(None, gt=0, description="Sanctioned amount (defaults to the requested loan amount).")
    annual_rate_pct: Optional[float] = Field(None, gt=0, le=30)
    tenure_months: Optional[int] = Field(None, ge=1, le=240)
    officer_note: Optional[str] = Field(None, max_length=300)


class LoanApprovalResponse(BaseModel):
    """An application after a bank officer approval, including EMI terms."""
    id: str
    applicant_name: str
    mobile: str
    branch: str
    business_category: str
    scheme_name: str
    loan_amount: float
    subsidy_amount: float
    status: str = "Pending"
    applied_at: str
    approved_at: Optional[str] = None
    approved_amount: Optional[float] = None
    annual_rate_pct: Optional[float] = None
    tenure_months: Optional[int] = None
    monthly_emi: Optional[float] = None
    first_payment_date: Optional[str] = None
    total_interest: Optional[float] = None
    total_payable: Optional[float] = None
    officer_note: Optional[str] = None


class MarkPaymentRequest(BaseModel):
    """Optional details for marking a scheduled EMI as paid."""
    paid_on: Optional[str] = Field(None, description="ISO date the instalment was paid (defaults to today).")
    amount: Optional[float] = Field(None, gt=0, description="Amount paid (defaults to the scheduled EMI).")


class RepaymentEntryResponse(BaseModel):
    """A scheduled monthly instalment with its payment status."""
    month: int
    payment_date: str
    opening_balance: float
    interest: float
    principal: float
    total_payment: float
    closing_balance: float
    paid: bool = False
    paid_on: Optional[str] = None


class RepaymentStatusResponse(BaseModel):
    """Full repayment tracking state for an approved loan."""
    id: str
    status: str
    approved_amount: float
    annual_rate_pct: Optional[float] = None
    tenure_months: int
    monthly_emi: Optional[float] = None
    first_payment_date: Optional[str] = None
    months_paid: int
    months_total: int
    next_due_month: Optional[int] = None
    next_due_date: Optional[str] = None
    total_paid: float
    outstanding_principal: float
    fully_paid: bool
    schedule: List[RepaymentEntryResponse]


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
