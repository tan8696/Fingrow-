"""
Unit Tests — Amortization Schedule (amortization.py)
======================================================
Validates the correctness of quarterly EMI calculations,
moratorium behavior, and schedule integrity.
"""

import pytest
from app.core.amortization import AmortizationSchedule, generate_schedule


class TestMicroFinanceSchedule:
    """Test the Micro Finance schedule: 6.5%, 36 months, 3-month moratorium."""

    def setup_method(self):
        # ₹25,000 margin → project cost ₹2,50,000 → loan ₹2,25,000
        # But for micro example: ₹14,000 margin → project ₹1,40,000 → loan ₹1,26,000
        self.loan = 126_000
        self.schedule = generate_schedule(
            loan_amount=self.loan,
            annual_rate_pct=6.5,
            tenure_months=36,
            moratorium_months=3,
        )

    def test_returns_amortization_schedule(self):
        assert isinstance(self.schedule, AmortizationSchedule)

    def test_moratorium_quarters(self):
        """3-month moratorium = 1 moratorium quarter."""
        moratorium_entries = [e for e in self.schedule.schedule if "Moratorium" in e.payment_type]
        assert len(moratorium_entries) == 1

    def test_moratorium_no_principal_reduction(self):
        """During moratorium, principal balance must not change."""
        for entry in self.schedule.schedule:
            if "Moratorium" in entry.payment_type:
                assert entry.principal == 0.0
                assert entry.closing_balance == pytest.approx(entry.opening_balance)

    def test_total_quarters(self):
        """36-month tenure / 3 = 12 quarters total."""
        assert self.schedule.total_quarters == 12

    def test_closing_balance_reaches_zero(self):
        """Final closing balance must be zero (loan fully repaid)."""
        last = self.schedule.schedule[-1]
        assert last.closing_balance == pytest.approx(0.0, abs=1.0)

    def test_total_paid_exceeds_principal(self):
        """Total paid must be greater than loan (interest is charged)."""
        assert self.schedule.total_amount_paid > self.loan


class TestTermLoanSchedule:
    """Test the Term Loan schedule: 8%, 84 months, 6-month moratorium."""

    def setup_method(self):
        # ₹25,000 margin → loan ₹2,25,000
        self.loan = 225_000
        self.schedule = generate_schedule(
            loan_amount=self.loan,
            annual_rate_pct=8.0,
            tenure_months=84,
            moratorium_months=6,
        )

    def test_moratorium_quarters(self):
        """6-month moratorium = 2 moratorium quarters."""
        moratorium_entries = [e for e in self.schedule.schedule if "Moratorium" in e.payment_type]
        assert len(moratorium_entries) == 2

    def test_total_quarters(self):
        """84-month tenure / 3 = 28 quarters total."""
        assert self.schedule.total_quarters == 28

    def test_closing_balance_reaches_zero(self):
        last = self.schedule.schedule[-1]
        assert last.closing_balance == pytest.approx(0.0, abs=1.0)

    def test_emi_quarters_count(self):
        """84 - 6 = 78 months repayment = 26 EMI quarters."""
        emi_entries = [e for e in self.schedule.schedule if e.payment_type == "EMI"]
        assert len(emi_entries) == 26

    def test_schedule_balances_are_sequential(self):
        """Each opening balance must equal the previous quarter's closing balance."""
        schedule = self.schedule.schedule
        for i in range(1, len(schedule)):
            assert schedule[i].opening_balance == pytest.approx(
                schedule[i - 1].closing_balance, abs=1.0
            )


class TestInvalidInputs:
    def test_zero_loan_raises(self):
        with pytest.raises(ValueError):
            generate_schedule(0, 8.0, 84, 6)

    def test_moratorium_exceeds_tenure_raises(self):
        with pytest.raises(ValueError):
            generate_schedule(100_000, 8.0, 12, 24)

    def test_non_multiple_moratorium_raises(self):
        """Moratorium must be divisible by 3 (quarterly scheduling)."""
        with pytest.raises(ValueError):
            generate_schedule(100_000, 8.0, 84, 5)


class TestScheduleIntegrity:
    def test_interest_always_positive(self):
        schedule = generate_schedule(100_000, 8.0, 84, 6)
        for entry in schedule.schedule:
            assert entry.interest >= 0

    def test_payment_equals_principal_plus_interest(self):
        schedule = generate_schedule(100_000, 8.0, 84, 6)
        for entry in schedule.schedule:
            assert entry.total_payment == pytest.approx(
                entry.principal + entry.interest, abs=1.0
            )
