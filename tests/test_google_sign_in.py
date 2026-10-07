"""Sign in with Google: state, PKCE and nonce, ID-token claims, customers only.

MOCKED_TEST_ONLY: Google's token endpoint is replaced; no network call is made.
"""
from __future__ import annotations

import base64
import json
import time
from urllib.parse import parse_qs, urlparse

import pytest

from routers import google_auth
from services import business_store as db
from tests.test_business_v3 import client, isolated  # noqa: F401

API = "/api/business"
CLIENT_ID = "test-client.apps.googleusercontent.com"


@pytest.fixture
def google(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-secret")
    claims = {}

    async def exchange(code, flow):
        assert code == "good-code" and flow["verifier"] and flow["redirect_uri"].endswith("/api/business/auth/google/callback")
        body = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "exp": time.time() + 600, "nonce": flow["nonce"],
                "email": "patient@example.com", "email_verified": True, "sub": "google-123", **claims}
        payload = base64.urlsafe_b64encode(json.dumps(body).encode()).rstrip(b"=").decode()
        return {"id_token": "header." + payload + ".signature"}
    monkeypatch.setattr(google_auth, "_exchange", exchange)
    return claims


def start(c):
    r = c.get(API + "/auth/google/start?next=/app", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"].startswith(google_auth.AUTH_URL)
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["client_id"] == [CLIENT_ID] and q["code_challenge_method"] == ["S256"] and q["scope"] == ["openid email profile"]
    assert "samesite=lax" in r.headers["set-cookie"].lower()
    return q["state"][0]


def test_off_until_configured():
    c = client(False)
    assert c.get(API + "/session").json()["google"] is False
    r = c.get(API + "/auth/google/start", follow_redirects=False)
    assert r.status_code == 200 and "not set up" in r.text


def test_a_customer_signs_in_and_keeps_their_guest_chat(google):
    c = client(False)
    assert c.get(API + "/session").json()["google"] is True
    guest = c.get(API + "/session").json()["user"]["id"]
    state = start(c)
    r = c.get(API + f"/auth/google/callback?state={state}&code=good-code")
    assert r.status_code == 200 and 'http-equiv="refresh"' in r.text and "labclear_session" in r.headers["set-cookie"]
    me = c.get(API + "/me").json()["user"]
    assert me["email"] == "patient@example.com" and me["registered"] and me["verified_email"] and me["id"] == guest
    # The same Google account later signs in to the same LabClear account; a password never works for it.
    other = client(False)
    other.get(API + f"/auth/google/callback?state={start(other)}&code=good-code")
    assert other.get(API + "/me").json()["user"]["id"] == guest
    assert client(False).post(API + "/login", json={"email": "patient@example.com", "password": "!google"}).status_code == 401


def test_state_is_single_use_and_must_match_the_cookie(google):
    c = client(False)
    state = start(c)
    assert "did not complete" in c.get(API + f"/auth/google/callback?state=wrong&code=good-code").text
    assert "Signed in" in c.get(API + f"/auth/google/callback?state={state}&code=good-code").text
    c.cookies.set("labclear_oauth", state, path="/api/business/auth/google")
    assert "did not complete" in c.get(API + f"/auth/google/callback?state={state}&code=good-code").text


@pytest.mark.parametrize("bad", [{"aud": "someone-else"}, {"iss": "https://evil.example"}, {"exp": 1}, {"email_verified": False}, {"nonce": "replayed"}])
def test_id_token_claims_are_checked(google, bad):
    google.update(bad)
    c = client(False)
    r = c.get(API + f"/auth/google/callback?state={start(c)}&code=good-code")
    assert "did not complete" in r.text and c.get(API + "/me").json()["user"] is None


def test_staff_accounts_keep_their_password(google):
    with db.transaction() as tx:
        tx.put("staff_g", "user", "staff_g", {"email": "patient@example.com", "password": db.password_hash("staff-password-123"), "role": "manager", "branch": "BKK01"})
        tx.put("email_" + db.digest("patient@example.com"), "email", "staff_g", {})
    c = client(False)
    r = c.get(API + f"/auth/google/callback?state={start(c)}&code=good-code")
    assert "Use your password" in r.text and c.get(API + "/me").json()["user"] is None


def test_next_never_leaves_the_site(google):
    c = client(False)
    c.get(API + "/auth/google/start?next=//evil.example/x", follow_redirects=False)
    with db.transaction() as tx:
        flows = tx.find("oauth", "")
    assert flows and all(f["data"]["next"] == "/app" for f in flows)
