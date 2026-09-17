"""
Account isolation.

The app previously had no accounts at all: every visitor saw every other
visitor's loans, harvests and reports. These tests exist so that cannot come
back silently.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthError, create_user, hash_password, verify_password
from app.main import app

# Every route that reads or writes a borrower's own data.
PROTECTED_GETS = [
    "/api/loan-history",
    "/api/portfolio",
    "/api/portfolio/cashflow",
    "/api/harvest",
    "/api/notifications",
    "/api/reminders",
    "/api/insurance/policy",
    "/api/cluster/activity",
]


@pytest.mark.parametrize("path", PROTECTED_GETS)
def test_data_routes_reject_anonymous_callers(anon_client, path):
    assert anon_client.get(path).status_code == 401


def test_reference_routes_stay_public(anon_client):
    """Scheme maths and category lists carry no personal data."""
    assert anon_client.get("/api/health").status_code == 200
    assert anon_client.get("/api/categories").status_code == 200
    assert anon_client.post(
        "/api/calculate", json={"margin_capital": 50_000}
    ).status_code == 200


def test_a_new_account_starts_with_nothing(client):
    """The whole point: no seeded loans, no phantom EMI commitment."""
    loans = client.get("/api/loan-history").json()["loans"]
    assert loans == []

    portfolio = client.get("/api/portfolio").json()
    assert portfolio["active_loans"] == 0
    assert portfolio["outstanding"] == 0

    assert client.get("/api/harvest").json()["lots"] == []
    assert client.get("/api/reminders").json()["reminders"] == []


def test_one_account_cannot_see_anothers_loans(client, other_account, anon_client):
    applied = client.post("/api/loans/apply", json={
        "applicant_name": "Ramesh Kumar",
        "mobile": "9876543210",
        "branch": "Akola Main",
        "business_category": "dairy",
        "scheme_name": "Term Loan Scheme",
        "loan_amount": 450000,
        "subsidy_amount": 0,
    })
    assert applied.status_code in (200, 201), applied.text
    application_id = applied.json()["id"]

    # The owner sees it.
    assert any(l["id"] == application_id for l in client.get("/api/loan-history").json()["loans"])

    # The other account sees an empty portfolio, not somebody else's loan.
    others = anon_client.get("/api/loan-history", headers=other_account["headers"]).json()["loans"]
    assert others == []

    # And cannot reach it by guessing the reference id.
    assert anon_client.get(
        f"/api/loans/{application_id}/repayment", headers=other_account["headers"]
    ).status_code == 404


def test_one_account_cannot_see_anothers_harvest(client, other_account, anon_client):
    posted = client.post("/api/harvest", json={
        "produce": "Soybean", "quantity_qtl": 12.5, "price_per_qtl": 4800,
    })
    assert posted.status_code in (200, 201), posted.text
    assert len(client.get("/api/harvest").json()["lots"]) == 1
    assert anon_client.get(
        "/api/harvest", headers=other_account["headers"]
    ).json()["lots"] == []


def test_signup_rejects_a_duplicate_mobile_number(anon_client):
    body = {"phone": "9000000001", "password": "test-password", "name": "First"}
    assert anon_client.post("/api/auth/signup", json=body).status_code == 201
    second = anon_client.post("/api/auth/signup", json={**body, "name": "Second"})
    assert second.status_code == 400
    assert "already exists" in second.json()["detail"]


def test_login_does_not_reveal_whether_an_account_exists(anon_client):
    """A different message for 'no such user' would leak the customer list."""
    anon_client.post("/api/auth/signup", json={
        "phone": "9000000002", "password": "test-password", "name": "Real",
    })
    wrong_password = anon_client.post(
        "/api/auth/login", json={"phone": "9000000002", "password": "nope"}
    )
    unknown_user = anon_client.post(
        "/api/auth/login", json={"phone": "9000000003", "password": "nope"}
    )

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json()["detail"] == unknown_user.json()["detail"]


def test_logout_revokes_the_session(anon_client):
    signup = anon_client.post("/api/auth/signup", json={
        "phone": "9000000004", "password": "test-password", "name": "Temp",
    }).json()
    headers = {"Authorization": f"Bearer {signup['token']}"}

    assert anon_client.get("/api/auth/me", headers=headers).status_code == 200
    anon_client.post("/api/auth/logout", headers=headers)
    assert anon_client.get("/api/auth/me", headers=headers).status_code == 401


def test_password_is_never_returned_by_any_account_route(anon_client):
    signup = anon_client.post("/api/auth/signup", json={
        "phone": "9000000005", "password": "test-password", "name": "Temp",
    })
    body = signup.text
    assert "test-password" not in body
    assert "password_hash" not in body


def test_password_hashing_is_salted_and_verifiable():
    a, b = hash_password("same-password"), hash_password("same-password")
    assert a != b, "identical passwords must not produce identical hashes"
    assert verify_password("same-password", a)
    assert not verify_password("different", a)
    assert not verify_password("same-password", "not-a-valid-hash")


def test_account_creation_validates_its_inputs():
    with pytest.raises(AuthError):
        create_user("12345", "test-password", "Short Phone")
    with pytest.raises(AuthError):
        create_user("9000000006", "abc", "Weak Password")
    with pytest.raises(AuthError):
        create_user("9000000007", "test-password", "   ")
