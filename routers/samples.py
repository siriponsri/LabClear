"""Synthetic sample lab reports and the shared request check for AI endpoints."""
from __future__ import annotations

import hmac
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from config import settings
from services.conversation_transport import ConversationError
from services.request_limits import request_rate_limiter
from services import trusted_origins

router = APIRouter(prefix="/api/samples")
ROOT = Path(__file__).resolve().parents[1]
DEMO_ROOT = ROOT / "examples" / "thai_lab_reference_v3"
DEMOS = [
    ("01_A_Liver", "Liver panel", "Enzymes, proteins and bilirubin", "A"),
    ("02_A_Renal", "Kidney & electrolytes", "Renal markers and a printed critical flag", "A"),
    ("03_B_Lipid", "Lipid profile", "Measured and calculated results", "B"),
    ("04_B_Glucose_Urine", "Glucose & urine", "Numeric and qualitative results together", "B"),
    ("05_C_Hematology", "Complete blood count", "Blood-cell indices and morphology", "C"),
    ("06_C_Thyroid", "Thyroid panel", "Hormones and antibody results", "C"),
]


def authorize(request: Request) -> None:
    """Same-origin, optional demo access code, then the per-client rate limit."""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
        # Proxies may report http for an HTTPS browser origin. Compare the
        # full browser authority to the forwarded Host, never a suffix match.
        parsed = urlparse(origin)
        if (parsed.netloc != request.headers.get("host") or parsed.scheme not in {"https", "http"}) and not trusted_origins.allowed(origin):
            raise ConversationError("origin_rejected", "Use this application's own page to send requests.", 403)
    if settings.DEMO_ACCESS_CODE:
        supplied = request.headers.get("X-LabClear-Access", "")
        if not hmac.compare_digest(supplied.encode(), settings.DEMO_ACCESS_CODE.encode()):
            raise ConversationError("access_required",
                "Enter the demo access code: click the assistant status at the top of the page.", 401)
    if not request_rate_limiter.allow(request):
        raise ConversationError("rate_limited", "Too many requests. Please wait a moment.", 429)


@router.get("/{demo_id}/{format}")
def sample_file(demo_id: str, format: str):
    if demo_id not in {d[0] for d in DEMOS} or format not in {"png", "pdf"}:
        raise ConversationError("demo_not_found", "That sample report is unavailable.", 404)
    return FileResponse(DEMO_ROOT / format / f"{demo_id}.{format}",
                        media_type="image/png" if format == "png" else "application/pdf")
