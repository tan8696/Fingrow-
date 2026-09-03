"""
Deterministic Financial Engine
================================
All financial computations are strictly rule-based. This module MUST NOT
be replaced or supplemented with LLM-generated values under any circumstances.

Scheme Routing Rules (hardcoded from SCA/CA policy):
  - Micro Finance Scheme : Project Cost ≤ ₹1,40,000
  - Term Loan Scheme     : ₹1,40,000 < Project Cost ≤ ₹50,00,000
  - Exceeds limits       : Returns an error — no scheme applies
"""

from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Constants — edit here only if the government scheme parameters change
# ---------------------------------------------------------------------------

MARGIN_PERCENTAGE: float = 0.10  # User's own contribution = 10% of project cost

MICRO_FINANCE = {
    "max_project_cost": 140_000.00,   # ₹1,40,000
    "interest_rate_pct": 6.5,
    "tenure_months": 36,              # 3 years
    "moratorium_months": 3,
    "label": "Micro Finance Scheme",
}

TERM_LOAN = {
    "max_project_cost": 5_000_000.00, # ₹50,00,000
    "interest_rate_pct": 8.0,
    "tenure_months": 84,              # 7 years
    "moratorium_months": 6,
    "label": "Term Loan Scheme",
}


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SchemeResult:
    margin_contribution: float
    project_cost: float
    loan_amount: float
    selected_scheme: str
    interest_rate_pct: float
    tenure_months: int
    moratorium_months: int

    def to_dict(self) -> dict:
        return {
            "margin_contribution": round(self.margin_contribution, 2),
            "project_cost": round(self.project_cost, 2),
            "loan_amount": round(self.loan_amount, 2),
            "selected_scheme": self.selected_scheme,
            "interest_rate_pct": self.interest_rate_pct,
            "tenure_months": self.tenure_months,
            "moratorium_months": self.moratorium_months,
        }


class SchemeError(ValueError):
    """Raised when no scheme applies to the given margin capital."""
    pass


# ---------------------------------------------------------------------------
# Core Function
# ---------------------------------------------------------------------------

def calculate_finances(margin_capital: float) -> SchemeResult:
    """
    Calculate the project cost, loan amount, and applicable government scheme
    from the user's available margin (own) capital.

    Formula:
        Project Cost = Margin Capital / 0.10
        Loan Amount  = Project Cost   * 0.90

    Args:
        margin_capital: The user's own capital contribution in INR (₹).
                        Must be > 0.

    Returns:
        SchemeResult dataclass with all financial parameters.

    Raises:
        ValueError:   If margin_capital is zero or negative.
        SchemeError:  If the resulting project cost exceeds all scheme limits.
    """
    if margin_capital <= 0:
        raise ValueError(f"Margin capital must be positive. Received: ₹{margin_capital}")

    project_cost = margin_capital / MARGIN_PERCENTAGE
    loan_amount = project_cost * 0.90

    # Route to the correct scheme using strict threshold comparisons
    if project_cost <= MICRO_FINANCE["max_project_cost"]:
        scheme = MICRO_FINANCE
    elif project_cost <= TERM_LOAN["max_project_cost"]:
        scheme = TERM_LOAN
    else:
        raise SchemeError(
            f"Project cost of ₹{project_cost:,.0f} exceeds the maximum "
            f"scheme limit of ₹{TERM_LOAN['max_project_cost']:,.0f}. "
            "No applicable government scheme found."
        )

    return SchemeResult(
        margin_contribution=margin_capital,
        project_cost=project_cost,
        loan_amount=loan_amount,
        selected_scheme=scheme["label"],
        interest_rate_pct=scheme["interest_rate_pct"],
        tenure_months=scheme["tenure_months"],
        moratorium_months=scheme["moratorium_months"],
    )
