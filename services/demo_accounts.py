"""Shared demonstration accounts for trying LabClear without registering.

    test-01  customer on the Free plan
    test-02  customer with LabClear Plus (simulated, no payment)
    admin    manager with full access to the service desk, including AI providers

All three use the password 1234 and are shared by everyone who signs in with them.

They exist only while DEMO_ACCOUNTS is on. It defaults to on for a local run and off
on a hosted deployment, where the owner turns it on explicitly. Turning it off again
blocks sign-in and ends any open session of these accounts at the next request.
"""
from __future__ import annotations

import os
import time

from services import business_store as db

PASSWORD = "1234"
ACCOUNTS = (
    {"username": "test-01", "role": "customer", "plan": "free", "label": "Customer, Free plan"},
    {"username": "test-02", "role": "customer", "plan": "plus", "label": "Customer, LabClear Plus"},
    {"username": "admin", "role": "manager", "plan": "plus", "label": "Manager, full access"},
)
_NAMES = {a["username"] for a in ACCOUNTS}


def enabled() -> bool:
    value = os.getenv("DEMO_ACCOUNTS", "").strip().lower()
    if value in {"true", "1", "yes", "on"}:
        return True
    if value in {"false", "0", "no", "off"}:
        return False
    return not db.cloud()


def public() -> list[dict]:
    return [{"username": a["username"], "label": a["label"]} for a in ACCOUNTS] if enabled() else []


def is_demo_name(identifier: str) -> bool:
    return identifier.strip().lower() in _NAMES


def ensure(tx) -> None:
    """Create the accounts (and test-02's Plus period) when missing. Idempotent."""
    if not enabled():
        return
    for a in ACCOUNTS:
        uid = "demo_" + a["username"].replace("-", "")
        index = "email_" + db.digest(a["username"])
        if not tx.get(uid):
            data = {"email": a["username"], "username": a["username"], "password": db.password_hash(PASSWORD),
                    "role": a["role"], "branch": "BKK01" if a["role"] != "customer" else "", "demo": True}
            tx.put(uid, "user", uid, data)
            tx.put(index, "email", uid, {})
            tx.audit("system", "demo.account_created", uid)
        if a["plan"] == "plus":
            sub_id = "sub_demo_" + a["username"].replace("-", "")
            sub = tx.get(sub_id)
            if not sub or sub["state"] != "active" or sub["data"].get("period_end", 0) < time.time() + 86400:
                now = time.time()
                tx.put(sub_id, "subscription", uid, {
                    "plan": "plus", "price_thb": 0, "period_days": 365, "payment_status": "paid", "demo": True,
                    "period_start": now, "period_end": now + 365 * 86400, "renews": "", "requested_at": now}, "active")


def blocked(user_row: dict | None) -> bool:
    """A demonstration account cannot be used while the feature is off."""
    return bool(user_row and user_row["data"].get("demo") and not enabled())
