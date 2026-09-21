"""
Sessions that survive serverless instance churn.

On Vercel each function instance has its own /tmp database, and instances come
and go. With database-backed session tokens, people were signed out
mid-session whenever the next request landed on an instance that had not
issued their token. These tests simulate that by deleting the account from the
local database — exactly what a fresh instance looks like — and checking the
signed token alone still works.
"""

from app.api import auth_routes
from app.core import auth
from app.core.db import connect


def _forget_account(user_id):
    """
    Make this process look like a fresh instance that never saw the account.

    Goes through app.core.db rather than opening the SQLite file directly, so
    the suite exercises the same path whether it runs on SQLite or Postgres.
    """
    conn = connect(auth.DB_PATH)
    try:
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def test_a_token_works_on_an_instance_that_never_saw_the_account(client, account):
    assert client.get("/api/auth/me").status_code == 200

    _forget_account(account["user_id"])

    me = client.get("/api/auth/me")
    assert me.status_code == 200, "signed out because this instance lacked the account"
    assert me.json()["user"]["user_id"] == account["user_id"]
    # Data routes keep working too, rather than bouncing to the login screen.
    assert client.get("/api/portfolio").status_code == 200


def test_profile_changes_travel_with_the_token(client, account):
    changed = client.patch("/api/auth/profile", json={"profile": {"type": "farmer"}}).json()
    assert changed["user"]["profile"]["type"] == "farmer"

    _forget_account(account["user_id"])
    client.headers["Authorization"] = f"Bearer {changed['token']}"

    # A fresh instance learns the profile from the token, so onboarding is not
    # shown again to someone who already completed it.
    assert client.get("/api/auth/me").json()["user"]["profile"]["type"] == "farmer"


def test_sample_data_is_rebuilt_on_an_instance_that_never_seeded_it(client, account):
    seeded = client.post("/api/demo/seed").json()
    client.headers["Authorization"] = f"Bearer {seeded['token']}"

    # Fresh instance: no account row, no sample records, no memory of either.
    client.delete("/api/demo/seed")
    _forget_account(account["user_id"])
    auth_routes._demo_reconciled.pop(account["user_id"], None)

    portfolio = client.get("/api/portfolio").json()
    assert portfolio["active_loans"] == 1, "sample data was not restored from the token"


def test_a_stale_token_never_deletes_seeded_data(client):
    """
    The settings page reloads straight after seeding, so the next request may
    carry the token from before the seed. That must not wipe the new data.
    """
    client.post("/api/demo/seed")  # deliberately ignore the new token

    assert client.get("/api/portfolio").json()["active_loans"] == 1
    assert client.get("/api/portfolio").json()["active_loans"] == 1


def test_forged_and_tampered_tokens_are_refused(anon_client, account):
    body, signature = account["token"].split(".")
    forged_payload = body[:-4] + ("AAAA" if not body.endswith("AAAA") else "BBBB")

    for bad in (f"{forged_payload}.{signature}", f"{body}.{signature[:-3]}xyz", "not-a-token", ""):
        res = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401, bad


def test_the_token_does_not_carry_a_profile_photo():
    """A base64 photo in every request header would exceed server limits."""
    photo = "data:image/png;base64," + "A" * 60_000
    token = auth.issue_token({
        "user_id": "u", "phone": "9000000000", "name": "N",
        "profile": {"type": "farmer", "avatar": photo},
    })
    assert len(token) < 2_000
    assert "avatar" not in auth.decode_token(token)["profile"]
