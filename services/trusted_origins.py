"""Optional allowlist of browser origins for a separate web front end (integration 4.0).

The Next.js web service on Render proxies /api to this FastAPI service. The browser then sends
``Origin: https://<web host>`` while the request reaches this service with its own Host, so the
original same-origin rule would reject it. TRUSTED_ORIGINS lists the exact web origins that may
do this. It is empty by default, which keeps the original rule unchanged.

Matching is exact on scheme, host and port: no wildcards, suffixes, paths or credentials.
"""
from __future__ import annotations

import re
from urllib.parse import urlsplit

from config import settings


_HOST = re.compile(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?")  # DNS names and IPv4 only; no wildcards


def _normal(value: str) -> str:
    parts = urlsplit(value.strip())
    if parts.scheme not in {"https", "http"} or not parts.hostname or not _HOST.fullmatch(parts.hostname):
        return ""
    try:
        parts.port  # rejects a malformed port
    except ValueError:
        return ""
    if parts.username or parts.password or parts.query or parts.fragment or parts.path not in {"", "/"}:
        return ""
    return f"{parts.scheme}://{parts.netloc}".lower()


def configured() -> set[str]:
    return {item for item in (_normal(x) for x in settings.TRUSTED_ORIGINS.split(",")) if item}


def allowed(origin: str | None) -> bool:
    """True only when the browser Origin exactly equals one configured trusted origin."""
    if not origin:
        return False
    wanted = _normal(origin)
    return bool(wanted) and wanted in configured()
