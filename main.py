from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartParser
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from services.release_info import VERSION, build_commit
from routers.ai_admin import router as ai_admin_router
from routers.harness_admin import router as harness_admin_router
from routers.knowledge_admin import router as knowledge_admin_router
from routers.business import router as business_router
from routers.google_auth import router as google_auth_router
from routers.chats import router as chats_router
from routers.business_ops import router as business_ops_router
from routers.samples import router as samples_router
from routers.site import router as site_router
from routers.organization_sources import router as organization_sources_router
from routers.public import router as public_router
from services.conversation_transport import ConversationError
from services import execution
from starlette.datastructures import MutableHeaders
from fastapi.responses import FileResponse, JSONResponse

BASE_DIR = Path(__file__).resolve().parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Business upload requests are capped at 10 MiB before parsing below. Keep
# their temporary multipart files in memory as well, including guest images.
MultiPartParser.spool_max_size = 10 * 1024 * 1024

@asynccontextmanager
async def lifespan(_app):
    """Startup creates the storage tables once (readiness only reads); shutdown cancels any workflow
    still running after the drain started by scripts/run_business.py on SIGTERM."""
    from services import business_store as db
    try:
        await asyncio.wait_for(execution.offload(db.ensure_schema), 15)
    except Exception as exc:  # noqa: BLE001 - readiness reports storage; the site still starts
        execution.log_event("startup_storage", storage=type(exc).__name__)
    execution.lifecycle.started = True
    execution.log_event("startup", in_flight=0)
    yield
    if execution.ACTIVE:
        await execution.lifecycle.drain(0)


app = FastAPI(
    title=settings.APP_NAME,
    description="Health-check chatbot with Thai RAG, lab report reading and multi-provider AI.",
    version=VERSION,
    lifespan=lifespan,
)

cors_origins = [
    origin.strip()
    for origin in settings.CORS_ALLOWED_ORIGINS.split(",")
    if origin.strip()
]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
    )

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
# One template environment for every page, with the interface-language helpers (routers/site.py).
from routers.site import templates  # noqa: E402
app.include_router(samples_router)
app.include_router(ai_admin_router)
app.include_router(harness_admin_router)
app.include_router(knowledge_admin_router)
app.include_router(google_auth_router)
app.include_router(business_router)
app.include_router(chats_router)
app.include_router(business_ops_router)
app.include_router(site_router)
app.include_router(organization_sources_router)
app.include_router(public_router)

@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    # Website visitors get a page with a way back; API callers keep the JSON error contract.
    accepts_html = "text/html" in request.headers.get("accept", "")
    if exc.status_code == 404 and accepts_html and not request.url.path.startswith(("/api/", "/static/")):
        return templates.TemplateResponse(request, "site/not_found.html", {"title": "Page not found | LabClear", "description": "This page does not exist.", "path": request.url.path, "what": "page"}, status_code=404)
    return JSONResponse({"detail": exc.detail, "request_id": execution.REQUEST_ID.get() or None}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(ConversationError)
async def business_error(request: Request, exc: ConversationError):
    # The error contract (docs/api.md): code, message, origin and the request ID; Retry-After when
    # waiting helps (server_busy, server_draining).
    headers = {"Cache-Control": "no-store"}
    if exc.retry_after:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse({"code": exc.code, "message": str(exc), "origin": exc.origin, "request_id": execution.REQUEST_ID.get() or None},
                        status_code=exc.status, headers=headers)


CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; "
       "connect-src 'self'; frame-src 'self' https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


class RequestBoundary:
    """Outermost application middleware (pure ASGI, so streaming and client disconnects pass through
    untouched): request ID, request-size limits, security headers and one structured log line.

    Every response carries X-Request-ID; JSON errors and stream events repeat it. A response without
    it did not come from LabClear (for example a gateway error page)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = execution.new_request_id()
        token = execution.REQUEST_ID.set(request_id)
        path, method = scope["path"], scope["method"]
        loop = asyncio.get_running_loop()
        started, state = loop.time(), {"status": 0}

        async def respond_with(response):
            await response(scope, receive, send_with_headers)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                if path.startswith("/static/") and "v=" in scope.get("query_string", b"").decode("latin-1"):
                    # Versioned URLs (?v=<content hash>) never change: let browsers keep them.
                    headers["Cache-Control"] = "public, max-age=31536000, immutable"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
                if path.startswith("/api/"):
                    headers["Cache-Control"] = "no-store"
                # Coursework simulation: never ask search engines to index simulated clinics or prices.
                headers["X-Robots-Tag"] = "noindex, nofollow"
                html_page = not path.startswith(("/static", "/api", "/docs", "/redoc", "/openapi.json"))
                if html_page or path.startswith("/api/business"):
                    headers["Content-Security-Policy"] = CSP
            await send(message)

        try:
            if path.startswith("/api/business") and method in {"POST", "PUT", "PATCH"}:
                # Report reading accepts up to three files of 3 MB each; everything else stays at 4 MB.
                mb = 10 if path in {"/api/business/reports/read", "/api/business/chat/report"} else 4
                limit = mb * 1024 * 1024
                too_large = JSONResponse({"code": "request_too_large", "message": f"The request exceeds the {mb} MB limit.", "request_id": request_id}, status_code=413)
                length = dict(scope["headers"]).get(b"content-length", b"0")
                try:
                    if int(length) > limit:
                        return await respond_with(too_large)
                except ValueError:
                    return await respond_with(JSONResponse({"code": "request_invalid", "message": "Invalid request size.", "request_id": request_id}, status_code=400))
                # The body is read here, within the limit, then replayed to the application; after it,
                # receive() passes through so a client disconnect still reaches the route.
                messages, size = [], 0
                while True:
                    message = await receive()
                    if message["type"] != "http.request":
                        messages.append(message)
                        break
                    size += len(message.get("body", b""))
                    if size > limit:
                        return await respond_with(too_large)
                    messages.append(message)
                    if not message.get("more_body", False):
                        break
                replay = iter(messages)

                async def receive_replayed():
                    for message in replay:
                        return message
                    return await receive()
                downstream = receive_replayed
            else:
                downstream = receive
            if path == "/static/i18n/th.js" and b"gzip" in dict(scope["headers"]).get(b"accept-encoding", b"") and (BASE_DIR / "static/i18n/th.js.gz").exists():
                # The Thai dictionary is large; serve its pre-compressed copy (written by scripts/build_i18n.mjs).
                return await respond_with(FileResponse(BASE_DIR / "static/i18n/th.js.gz", media_type="text/javascript; charset=utf-8",
                                                       headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"}))
            await self.app(scope, downstream, send_with_headers)
        except Exception:
            if not state["status"]:
                # Unexpected failure before a response: still a JSON body with the request ID.
                await respond_with(JSONResponse({"code": "server_error", "message": "Something went wrong on our side. Please try again.",
                                                 "origin": "app", "request_id": request_id}, status_code=500))
            raise
        finally:
            status = state["status"]
            if path.startswith("/api/") and (method != "GET" or status >= 400) or (path == "/ready" and status != 200):
                route = getattr(scope.get("route"), "path", None) or path
                execution.log_event("http", method=method, route=route, status=status,
                                    duration_ms=round((loop.time() - started) * 1000))
            execution.REQUEST_ID.reset(token)


app.add_middleware(RequestBoundary)


@app.get("/health")
async def health():
    """Liveness: the process and its event loop answer. No storage, no providers."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "version": VERSION,
        "commit": build_commit(),
    }


_probe: dict = {"future": None, "ok_at": 0.0}
READY_PROBE_SECONDS = 1.0


async def _storage_state() -> str:
    """One read-only storage probe at a time, at most READY_PROBE_SECONDS; a success is reused for 2 s."""
    from services import business_store as db
    loop = asyncio.get_running_loop()
    if loop.time() - _probe["ok_at"] < 2.0:
        return "ok"
    if _probe["future"] is None or _probe["future"].done():
        _probe["future"] = asyncio.ensure_future(execution.offload(db.probe, READY_PROBE_SECONDS))
    try:
        await asyncio.wait_for(asyncio.shield(_probe["future"]), READY_PROBE_SECONDS)
    except TimeoutError:
        return "timeout"
    except ConversationError as exc:
        return "unconfigured" if exc.code == "storage_setup" else "unavailable"
    except Exception:  # noqa: BLE001 - details stay in the server log, never in the probe body
        return "unavailable"
    _probe["ok_at"] = loop.time()
    return "ok"


@app.get("/ready")
async def ready():
    """Readiness for routing and deploys (Render healthCheckPath): started, not draining and storage
    reachable. Never calls an AI provider or OCR, so a provider outage does not restart the service."""
    storage = await _storage_state()
    lifecycle = execution.lifecycle
    ok = lifecycle.started and not lifecycle.draining and storage == "ok"
    body = {"status": "ready" if ok else "not_ready",
            "checks": {"startup": "done" if lifecycle.started else "pending", "draining": lifecycle.draining, "storage": storage},
            "load": execution.admission.snapshot(), "version": VERSION, "commit": build_commit()}
    return JSONResponse(body, status_code=200 if ok else 503, headers={"Cache-Control": "no-store"})


@app.get("/app")
def business_app(request: Request):
    from services import business_dots
    return templates.TemplateResponse(request, "workspace.html", {"staff_mode": False, "title": "Your workspace — LabClear", "dots": business_dots.public_roster()})

@app.get("/staff")
def business_staff(request: Request):
    return templates.TemplateResponse(request, "workspace.html", {"staff_mode": True, "title": "Service desk — LabClear"})
