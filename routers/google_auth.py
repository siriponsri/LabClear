"""Sign in with Google (OpenID Connect, authorization code flow with PKCE).

On only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Customers only: staff and
manager accounts keep signing in with their password. The ID token comes straight from Google's
token endpoint over TLS, so its claims (issuer, audience, expiry, nonce, verified email) are checked
without fetching signing keys (OpenID Connect Core 3.1.3.7).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from routers import business
from services import business_store as db, demo_accounts as demo

router = APIRouter(prefix="/api/business/auth/google")
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
STATE_COOKIE = "labclear_oauth"
CALLBACK = "/api/business/auth/google/callback"
NO_PASSWORD = "!google"  # never matches a password, but marks the account as registered


def enabled() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def _redirect_uri(request: Request) -> str:
    if os.getenv("GOOGLE_REDIRECT_URI"):
        return os.environ["GOOGLE_REDIRECT_URI"]
    base = os.getenv("BUSINESS_PUBLIC_URL", "").rstrip("/")
    if not base:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
        base = f"{proto}://{request.headers.get('host', request.url.netloc)}"
    return base + CALLBACK


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _claims(id_token: str) -> dict:
    try:
        payload = id_token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return {}


def _page(title: str, text: str, target: str = "/app", go: bool = False) -> HTMLResponse:
    """A tiny same-site page. Moving on from here (not a redirect) lets the browser send the new
    SameSite=Strict session cookie with the next page."""
    refresh = f'<meta http-equiv="refresh" content="0;url={html.escape(target)}">' if go else ""
    body = (f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"{refresh}<title>{html.escape(title)}</title><style>body{{font:16px system-ui,sans-serif;margin:15vh auto;max-width:32rem;padding:0 1rem;color:#1f1d24}}"
            f"a{{color:inherit}}</style></head><body><h1 style='font-size:1.3rem'>{html.escape(title)}</h1><p>{html.escape(text)}</p>"
            f"<p><a href='{html.escape(target)}'>Continue to LabClear</a></p></body></html>")
    return HTMLResponse(body, headers={"Cache-Control": "no-store"})


def _safe_next(value: str) -> str:
    return value if value.startswith("/") and not value.startswith("//") and "\\" not in value else "/app"


@router.get("/start")
async def start(request: Request, next: str = "/app"):
    if not enabled():
        return _page("Google sign-in is not set up", "Sign in with your email and password instead.")
    state, verifier, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(48), secrets.token_urlsafe(16)
    redirect_uri = _redirect_uri(request)
    guest = request.cookies.get(business.COOKIE, "")
    with db.transaction() as tx:
        session = tx.get("session_" + db.digest(guest)) if guest else None
        tx.put("oauth_" + db.digest(state), "oauth", "", {
            "verifier": verifier, "nonce": nonce, "redirect_uri": redirect_uri, "next": _safe_next(next),
            "expires": time.time() + 600, "guest": session["owner"] if session else "", "guest_session": session["id"] if session else ""})
    query = urlencode({"client_id": os.environ["GOOGLE_CLIENT_ID"], "redirect_uri": redirect_uri, "response_type": "code",
                       "scope": "openid email profile", "state": state, "nonce": nonce, "prompt": "select_account",
                       "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()), "code_challenge_method": "S256"})
    response = RedirectResponse(AUTH_URL + "?" + query, status_code=302)
    # Lax, so it comes back on Google's redirect; the session cookie itself stays Strict.
    response.set_cookie(STATE_COOKIE, state, httponly=True, secure=db.cloud(), samesite="lax", max_age=600, path="/api/business/auth/google")
    return response


async def _exchange(code: str, flow: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(TOKEN_URL, data={
            "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"], "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": flow["redirect_uri"], "grant_type": "authorization_code", "code_verifier": flow["verifier"]})
    return r.json() if r.status_code == 200 else {}


@router.get("/callback")
async def callback(request: Request, state: str = "", code: str = "", error: str = ""):
    failed = _page("Google sign-in did not complete", "Nothing was changed. You can try again or sign in with your email and password.")
    cookie = request.cookies.get(STATE_COOKIE, "")
    if not enabled() or error or not code or not state or not cookie or not hmac.compare_digest(cookie, state):
        return failed
    with db.transaction() as tx:
        row = tx.get("oauth_" + db.digest(state))
        if row:
            tx.delete(row["id"])  # single use
    if not row or row["data"]["expires"] < time.time():
        return failed
    flow = row["data"]
    try:
        token = await _exchange(code, flow)
    except httpx.HTTPError:
        return failed
    c = _claims(token.get("id_token", ""))
    email = str(c.get("email", "")).strip().lower()
    if (c.get("iss") not in ISSUERS or c.get("aud") != os.environ["GOOGLE_CLIENT_ID"] or float(c.get("exp", 0)) < time.time()
            or not hmac.compare_digest(str(c.get("nonce", "")), flow["nonce"]) or c.get("email_verified") not in (True, "true") or not email):
        return failed
    with db.transaction() as tx:
        index = "email_" + db.digest(email)
        found = tx.get(index)
        user = tx.get(found["owner"]) if found else None
        if user and (user["data"].get("role", "customer") != "customer" or demo.blocked(user) or user["data"].get("demo")):
            return _page("Use your password for this account", "Staff and demonstration accounts sign in with their password.")
        if not user:
            guest = tx.get(flow["guest"]) if flow["guest"] else None
            if guest and guest["data"].get("role") == "customer" and not guest["data"].get("password"):
                user = guest  # keep the chats and reports made before signing in, as registering does
            else:
                uid = "customer_" + secrets.token_hex(12)
                user = tx.put(uid, "user", uid, {"role": "customer", "email": "", "password": ""})
            data = {**user["data"], "email": email, "password": NO_PASSWORD, "google_sub": str(c.get("sub", ""))}
            user = tx.put(user["id"], "user", user["id"], data)
            tx.put(index, "email", user["id"], {})
            tx.audit(user["id"], "account.google_created", user["id"])
        if flow.get("guest_session"):
            tx.delete(flow["guest_session"])
        response = _page("Signed in", "Taking you back to LabClear.", flow["next"], go=True)
        business.set_session(tx, response, user["id"])
    response.delete_cookie(STATE_COOKIE, path="/api/business/auth/google")
    return response
