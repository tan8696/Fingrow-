"""
Amortization Schedule Generator
=================================
Generates a quarterly reducing-balance repayment schedule for the loan.

Moratorium Policy (Interest-Only during moratorium):
  During the moratorium period the borrower pays only the accrued monthly
  interest. Principal repayment begins after the moratorium ends.
  This is the standard Indian government micro-enterprise scheme policy.

Schedule unit: Quarterly (every 3 months), which is the standard for
  SCA/CA disbursed rural loans.
"""

from dataclasses import dataclass
from typing import List


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class PaymentEntry:
    quarter: int
    payment_type: str          # "Moratorium (Interest Only)" | "EMI"
    opening_balance: float
    principal: float
    interest: float
    total_payment: float
    closing_balance: float

    def to_dict(self) -> dict:
        return {
            "quarter": self.quarter,
            "payment_type": self.payment_type,
            "opening_balance": round(self.opening_balance, 2),
            "principal": round(self.principal, 2),
            "interest": round(self.interest, 2),
            "total_payment": round(self.total_payment, 2),
            "closing_balance": round(self.closing_balance, 2),
        }


@dataclass
class AmortizationSchedule:
    loan_amount: float
    annual_rate_pct: float
    tenure_months: int
    moratorium_months: int
    quarterly_emi: float
    total_quarters: int
    total_interest_paid: float
    total_amount_paid: float
    schedule: List[PaymentEntry]

    def to_dict(self) -> dict:
        return {
            "loan_amount": round(self.loan_amount, 2),
            "annual_rate_pct": self.annual_rate_pct,
            "tenure_months": self.tenure_months,
            "moratorium_months": self.moratorium_months,
            "quarterly_emi": round(self.quarterly_emi, 2),
            "total_quarters": self.total_quarters,
            "total_interest_paid": round(self.total_interest_paid, 2),
            "total_amount_paid": round(self.total_amount_paid, 2),
            "schedule": [entry.to_dict() for entry in self.schedule],
        }


# ---------------------------------------------------------------------------
# Core Function
# ---------------------------------------------------------------------------

def generate_schedule(
    loan_amount: float,
    annual_rate_pct: float,
    tenure_months: int,
    moratorium_months: int,
) -> AmortizationSchedule:
    """
    Generate a quarterly repayment schedule with a moratorium period.

    During moratorium: interest-only quarterly payments (no principal reduction).
    After moratorium:  standard reducing-balance quarterly EMI.

    Args:
        loan_amount:       Principal loan amount in INR (₹).
        annual_rate_pct:   Annual interest rate (e.g., 6.5 or 8.0).
        tenure_months:     Total loan tenure including moratorium (months).
        moratorium_months: Moratorium period at the start (months).

    Returns:
        AmortizationSchedule with full payment schedule.

    Raises:
        ValueError: On invalid inputs.
    """
    if loan_amount <= 0:
        raise ValueError("Loan amount must be positive.")
    if tenure_months <= moratorium_months:
        raise ValueError("Tenure must be greater than moratorium period.")
    if moratorium_months % 3 != 0:
        raise ValueError("Moratorium months must be a multiple of 3 for quarterly scheduling.")

    # Convert to quarterly rates
    quarterly_rate = annual_rate_pct / 100 / 4

    # Repayment months = total tenure minus moratorium
    repayment_months = tenure_months - moratorium_months
    repayment_quarters = repayment_months // 3
    moratorium_quarters = moratorium_months // 3

    # Standard reducing-balance quarterly EMI formula:
    # EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    # where r = quarterly rate, n = repayment quarters
    r = quarterly_rate
    n = repayment_quarters
    if r == 0:
        quarterly_emi = loan_amount / n
    else:
        quarterly_emi = loan_amount * r * ((1 + r) ** n) / (((1 + r) ** n) - 1)

    schedule: List[PaymentEntry] = []
    balance = loan_amount
    quarter_num = 0
    total_interest = 0.0
    total_paid = 0.0

    # -- Moratorium quarters (interest-only) --
    for _ in range(moratorium_quarters):
        quarter_num += 1
        interest = balance * quarterly_rate
        total_interest += interest
        total_paid += interest
        schedule.append(PaymentEntry(
            quarter=quarter_num,
            payment_type="Moratorium (Interest Only)",
            opening_balance=balance,
            principal=0.0,
            interest=interest,
            total_payment=interest,
            closing_balance=balance,   # principal unchanged
        ))

    # -- Repayment quarters (standard EMI) --
    for _ in range(repayment_quarters):
        quarter_num += 1
        interest = balance * quarterly_rate
        principal = quarterly_emi - interest

        # Last quarter adjustment to clear residual balance exactly
        if _ == repayment_quarters - 1:
            principal = balance
            payment = principal + interest
        else:
            payment = quarterly_emi

        closing_balance = max(balance - principal, 0.0)
        total_interest += interest
        total_paid += payment

        schedule.append(PaymentEntry(
            quarter=quarter_num,
            payment_type="EMI",
            opening_balance=balance,
            principal=round(principal, 2),
            interest=round(interest, 2),
            total_payment=round(payment, 2),
            closing_balance=round(closing_balance, 2),
        ))
        balance = closing_balance

    return AmortizationSchedule(
        loan_amount=loan_amount,
        annual_rate_pct=annual_rate_pct,
        tenure_months=tenure_months,
        moratorium_months=moratorium_months,
        quarterly_emi=quarterly_emi,
        total_quarters=quarter_num,
        total_interest_paid=total_interest,
        total_amount_paid=total_paid,
        schedule=schedule,
    )
