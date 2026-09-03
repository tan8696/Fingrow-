"""
Unit Tests — Financial Calculator (calculator.py)
===================================================
Tests every boundary case and scheme routing rule.
All tests are fully deterministic — no mocks, no external APIs.
"""

import pytest
from app.core.calculator import (
    MICRO_FINANCE,
    TERM_LOAN,
    SchemeError,
    SchemeResult,
    calculate_finances,
)


# ---------------------------------------------------------------------------
# Basic Happy-Path Tests
# ---------------------------------------------------------------------------

class TestMicroFinanceScheme:
    def test_basic_micro(self):
        """₹10,000 margin → ₹1,00,000 project cost → Micro Finance."""
        result = calculate_finances(10_000)
        assert result.project_cost == pytest.approx(100_000)
        assert result.loan_amount == pytest.approx(90_000)
        assert result.selected_scheme == MICRO_FINANCE["label"]
        assert result.interest_rate_pct == 6.5
        assert result.tenure_months == 36
        assert result.moratorium_months == 3

    def test_margin_equals_exactly_14000(self):
        """₹14,000 margin → exactly ₹1,40,000 project cost → Micro Finance (boundary inclusive)."""
        result = calculate_finances(14_000)
        assert result.project_cost == pytest.approx(140_000)
        assert result.selected_scheme == MICRO_FINANCE["label"]

    def test_very_small_margin(self):
        """₹500 margin → ₹5,000 project cost → Micro Finance."""
        result = calculate_finances(500)
        assert result.project_cost == pytest.approx(5_000)
        assert result.selected_scheme == MICRO_FINANCE["label"]


class TestTermLoanScheme:
    def test_basic_term_loan(self):
        """₹25,000 margin → ₹2,50,000 project cost → Term Loan. (Spec's reference example)"""
        result = calculate_finances(25_000)
        assert result.project_cost == pytest.approx(250_000)
        assert result.loan_amount == pytest.approx(225_000)
        assert result.selected_scheme == TERM_LOAN["label"]
        assert result.interest_rate_pct == 8.0
        assert result.tenure_months == 84
        assert result.moratorium_months == 6

    def test_margin_just_above_14000(self):
        """₹14,001 margin → ₹1,40,010 project cost → Term Loan (just above boundary)."""
        result = calculate_finances(14_001)
        assert result.project_cost == pytest.approx(140_010)
        assert result.selected_scheme == TERM_LOAN["label"]

    def test_maximum_allowed_margin(self):
        """₹5,00,000 margin → ₹50,00,000 project cost → Term Loan (max limit exactly)."""
        result = calculate_finances(500_000)
        assert result.project_cost == pytest.approx(5_000_000)
        assert result.selected_scheme == TERM_LOAN["label"]


# ---------------------------------------------------------------------------
# Boundary / Edge Case Tests
# ---------------------------------------------------------------------------

class TestBoundaryCases:
    def test_exactly_at_micro_max_boundary(self):
        """The ₹1,40,000 threshold must map to Micro Finance, not Term Loan."""
        result = calculate_finances(14_000)
        assert result.selected_scheme == MICRO_FINANCE["label"]
        # One rupee over — must flip to Term Loan
        result_over = calculate_finances(14_000.01)
        assert result_over.selected_scheme == TERM_LOAN["label"]

    def test_margin_contribution_preserved(self):
        """The margin capital passed in must be returned unchanged."""
        margin = 33_333.33
        result = calculate_finances(margin)
        assert result.margin_contribution == pytest.approx(margin)

    def test_loan_is_exactly_90_percent(self):
        """Loan must always be exactly 90% of project cost."""
        for margin in [1_000, 14_000, 50_000, 2_50_000]:
            result = calculate_finances(margin)
            assert result.loan_amount == pytest.approx(result.project_cost * 0.90)

    def test_project_cost_is_10x_margin(self):
        """Project cost must always be exactly 10× the margin capital."""
        for margin in [500, 10_000, 14_000, 25_000, 100_000]:
            result = calculate_finances(margin)
            assert result.project_cost == pytest.approx(margin / 0.10)


# ---------------------------------------------------------------------------
# Error / Invalid Input Tests
# ---------------------------------------------------------------------------

class TestInvalidInputs:
    def test_zero_margin_raises(self):
        with pytest.raises(ValueError):
            calculate_finances(0)

    def test_negative_margin_raises(self):
        with pytest.raises(ValueError):
            calculate_finances(-5_000)

    def test_exceeds_max_scheme_raises(self):
        """₹5,00,001 margin → project cost > ₹50L → SchemeError."""
        with pytest.raises(SchemeError):
            calculate_finances(500_001)

    def test_scheme_error_message_informative(self):
        """SchemeError must mention the project cost and limit."""
        with pytest.raises(SchemeError) as exc_info:
            calculate_finances(1_000_000)
        assert "5,000,000" in str(exc_info.value) or "50,00,000" in str(exc_info.value) or "5000000" in str(exc_info.value)



# ---------------------------------------------------------------------------
# Return Type Tests
# ---------------------------------------------------------------------------

class TestReturnType:
    def test_returns_scheme_result(self):
        result = calculate_finances(25_000)
        assert isinstance(result, SchemeResult)

    def test_to_dict_has_all_keys(self):
        result = calculate_finances(25_000)
        d = result.to_dict()
        expected_keys = {
            "margin_contribution", "project_cost", "loan_amount",
            "selected_scheme", "interest_rate_pct", "tenure_months", "moratorium_months"
        }
        assert expected_keys.issubset(d.keys())
