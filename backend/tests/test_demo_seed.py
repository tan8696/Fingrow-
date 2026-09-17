"""
Demo seeding.

The app must start empty, but a cold demo needs data on request. These tests
hold both halves of that: nothing appears on its own, and what the seeder adds
it can take away again without touching the account's real records.
"""

from app.core import demo_seed


def test_nothing_is_seeded_until_asked(client):
    assert client.get("/api/demo/status").json()["has_demo_data"] is False
    assert client.get("/api/loan-history").json()["loans"] == []
    assert client.get("/api/harvest").json()["lots"] == []


def test_seeding_produces_a_coherent_portfolio(client):
    result = client.post("/api/demo/seed").json()
    assert result["seeded"] is True

    loans = client.get("/api/loan-history").json()["loans"]
    assert {l["status"] for l in loans} == {"Active", "Pending"}

    portfolio = client.get("/api/portfolio").json()
    assert portfolio["active_loans"] == 1
    assert portfolio["outstanding"] > 0
    # A believable monthly instalment, not the six-figure nonsense the
    # hardcoded demo loans used to produce.
    assert 1_000 < portfolio["monthly_emi_total"] < 50_000
    # Part-repaid, so progress bars have something to show.
    assert 0 < portfolio["repayment_progress_pct"] < 100
    assert len(client.get("/api/harvest").json()["lots"]) == 4


def test_seeding_twice_does_not_duplicate(client):
    client.post("/api/demo/seed")
    first = len(client.get("/api/loan-history").json()["loans"])

    again = client.post("/api/demo/seed").json()
    assert again["loans_created"] == 0

    assert len(client.get("/api/loan-history").json()["loans"]) == first


def test_wipe_returns_the_account_to_empty(client):
    client.post("/api/demo/seed")
    assert client.get("/api/demo/status").json()["has_demo_data"] is True

    client.delete("/api/demo/seed")

    assert client.get("/api/demo/status").json()["has_demo_data"] is False
    assert client.get("/api/harvest").json()["lots"] == []
    portfolio = client.get("/api/portfolio").json()
    assert portfolio["active_loans"] == 0
    assert portfolio["outstanding"] == 0


def test_wipe_leaves_records_the_account_created_itself(client):
    """The wipe must never delete a borrower's real harvest lot."""
    client.post("/api/harvest", json={
        "produce": "Real Soybean", "quantity_qtl": 5.0, "price_per_qtl": 4800,
    })
    client.post("/api/demo/seed")
    assert len(client.get("/api/harvest").json()["lots"]) == 5

    client.delete("/api/demo/seed")

    remaining = client.get("/api/harvest").json()["lots"]
    assert len(remaining) == 1
    assert remaining[0]["produce"] == "Real Soybean"


def test_seeded_records_are_flagged_so_the_ui_can_label_them(client):
    client.post("/api/demo/seed")

    assert all(l.get("demo") is True for l in client.get("/api/harvest").json()["lots"])


def test_seeded_data_is_private_to_the_account(client, other_account, anon_client):
    client.post("/api/demo/seed")

    assert anon_client.get(
        "/api/loan-history", headers=other_account["headers"]
    ).json()["loans"] == []
    assert anon_client.get(
        "/api/demo/status", headers=other_account["headers"]
    ).json()["has_demo_data"] is False


def test_demo_routes_require_a_session(anon_client):
    assert anon_client.post("/api/demo/seed").status_code == 401
    assert anon_client.delete("/api/demo/seed").status_code == 401
    assert anon_client.get("/api/demo/status").status_code == 401


def test_seeded_financials_come_from_the_real_engine():
    """
    Seeded numbers must be internally consistent, or the demo shows figures the
    app's own verification would reject.
    """
    from datetime import date

    applications = demo_seed._demo_applications(date.today())
    active = next(a for a in applications if a["status"] == "Active")

    assert active["approved_amount"] == active["loan_amount"]
    assert active["monthly_emi"] > 0
    assert len(active["schedule"]) == active["tenure_months"]
    assert len(active["payments"]) == 6
    # The final instalment clears the loan exactly.
    assert active["schedule"][-1]["closing_balance"] == 0
