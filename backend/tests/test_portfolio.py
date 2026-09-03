"""
Portfolio Aggregation Tests
=============================
Pure-data tests for outstanding balance, next-due, summary KPIs and the
cashflow/ledger builders used by the dashboard.
"""

from app.core.portfolio import cashflow, next_due, outstanding_principal, summary


def _active_app(**overrides):
    app = {
        "id": "LN-2026-0001",
        "applicant_name": "Ramesh Kumar",
        "business_category": "poultry",
        "scheme_name": "Term Loan Scheme",
        "loan_amount": 480000.0,
        "subsidy_amount": 120000.0,
        "status": "Active",
        "approved_amount": 480000.0,
        "annual_rate_pct": 8.0,
        "tenure_months": 3,
        "monthly_emi": 162078.0,
        "first_payment_date": "2026-10-10",
        "schedule": [
            {"month": 1, "payment_date": "2026-10-10", "opening_balance": 480000.0,
             "interest": 3200.0, "principal": 158878.0, "total_payment": 162078.0, "closing_balance": 321122.0},
            {"month": 2, "payment_date": "2026-11-10", "opening_balance": 321122.0,
             "interest": 2140.8, "principal": 159937.2, "total_payment": 162078.0, "closing_balance": 161184.8},
            {"month": 3, "payment_date": "2026-12-10", "opening_balance": 161184.8,
             "interest": 1074.6, "principal": 161184.8, "total_payment": 162259.4, "closing_balance": 0.0},
        ],
        "payments": [],
    }
    app.update(overrides)
    return app


def test_outstanding_principal_no_payments():
    assert outstanding_principal(_active_app()) == 480000.0


def test_outstanding_principal_after_payments():
    app = _active_app(payments=[{"month": 1, "amount": 162078.0, "paid_on": "2026-10-10"}])
    assert outstanding_principal(app) == 321122.0


def test_next_due_advances_with_payments():
    due = next_due(_active_app())
    assert due == {"date": "2026-10-10", "amount": 162078.0, "month": 1}

    paid = _active_app(payments=[{"month": 1, "amount": 162078.0, "paid_on": "2026-10-10"}])
    due = next_due(paid)
    assert due["month"] == 2
    assert due["date"] == "2026-11-10"


def test_next_due_none_when_fully_paid():
    app = _active_app(
        payments=[
            {"month": 1, "amount": 162078.0, "paid_on": "2026-10-10"},
            {"month": 2, "amount": 162078.0, "paid_on": "2026-11-10"},
            {"month": 3, "amount": 162259.4, "paid_on": "2026-12-10"},
        ]
    )
    assert next_due(app) is None


def test_summary_aggregates_active_and_pending():
    pending = dict(
        _active_app(id="LN-2026-0002", status="Pending", loan_amount=90000.0, subsidy_amount=22500.0),
        monthly_emi=None, schedule=[], payments=[],
    )
    data = summary([_active_app(), pending])
    assert data["active_loans"] == 1
    assert data["pending_applications"] == 1
    assert data["outstanding_total"] == 480000.0
    assert data["monthly_emi_total"] == 162078.0
    assert data["next_due_date"] == "2026-10-10"
    assert data["subsidy_approved_total"] == 120000.0
    assert data["subsidy_pipeline_total"] == 22500.0
    assert data["requested_pipeline_total"] == 90000.0
    assert round(data["utilization_pct"], 1) == round(480000 / 2500000 * 100, 1)


def test_summary_tracks_repayment_progress():
    paid = _active_app(payments=[{"month": 1, "amount": 162078.0, "paid_on": "2026-10-10"}])
    data = summary([paid])
    assert data["months_paid"] == 1
    assert data["months_total"] == 3
    assert round(data["repayment_progress_pct"], 1) == 33.3


def test_cashflow_buckets_future_emis_only():
    app = _active_app(
        payments=[
            {"month": 1, "amount": 162078.0, "paid_on": "2026-10-10"},
            {"month": 2, "amount": 162078.0, "paid_on": "2026-11-10"},
        ]
    )
    data = cashflow([app], horizon=6)
    # Months 1-2 already paid must not appear as future obligations
    labels = [m["label"] for m in data["months"]]
    assert labels == ["Dec 26"]
    assert data["months"][0]["total_emi"] == 162259.4
    assert data["months"][0]["loans"] == 1

    ledger = data["ledger"]
    assert len(ledger) == 1
    assert ledger[0]["rows"][0]["name"] == "Poultry"
    assert ledger[0]["rows"][0]["balance"] == 0.0


def test_cashflow_empty_when_no_active_loans():
    data = cashflow([], horizon=6)
    assert data["months"] == []
    assert data["ledger"] == []
