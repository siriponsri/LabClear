from __future__ import annotations

import logging
from pathlib import Path

from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartParser
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import settings
from services.release_info import VERSION, build_commit
from routers.ai_admin import router as ai_admin_router
from routers.business import router as business_router
from routers.google_auth import router as google_auth_router
from routers.chats import router as chats_router
from routers.business_ops import router as business_ops_router
from routers.samples import router as samples_router
from routers.site import router as site_router
from routers.organization_sources import router as organization_sources_router
from services.conversation_transport import ConversationError
from fastapi.responses import JSONResponse

BASE_DIR = Path(__file__).resolve().parent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Business upload requests are capped at 10 MiB before parsing below. Keep
# their temporary multipart files in memory as well, including guest images.
MultiPartParser.spool_max_size = 10 * 1024 * 1024

app = FastAPI(
    title=settings.APP_NAME,
    description="Health-check chatbot with Thai RAG, lab report reading and multi-provider AI.",
    version=VERSION,
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
templates = Jinja2Templates(directory=BASE_DIR / "templates")
app.include_router(samples_router)
app.include_router(ai_admin_router)
app.include_router(google_auth_router)
app.include_router(business_router)
app.include_router(chats_router)
app.include_router(business_ops_router)
app.include_router(site_router)
app.include_router(organization_sources_router)

@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    # Website visitors get a page with a way back; API callers keep the JSON error contract.
    accepts_html = "text/html" in request.headers.get("accept", "")
    if exc.status_code == 404 and accepts_html and not request.url.path.startswith(("/api/", "/static/")):
        return templates.TemplateResponse(request, "site/not_found.html", {"title": "Page not found | LabClear", "description": "This page does not exist.", "path": request.url.path, "what": "page"}, status_code=404)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(ConversationError)
async def business_error(request: Request, exc: ConversationError):
    return JSONResponse({"code": exc.code, "message": str(exc)}, status_code=exc.status, headers={"Cache-Control": "no-store"})


@app.middleware("http")
async def request_boundary(request: Request, call_next):
    if request.url.path.startswith("/api/business") and request.method in {"POST", "PUT", "PATCH"}:
        # Report reading accepts up to three files of 3 MB each; everything else stays at 4 MB.
        mb = 10 if request.url.path in {"/api/business/reports/read", "/api/business/chat/report"} else 4
        limit = mb * 1024 * 1024
        too_large = JSONResponse({"message": f"The request exceeds the {mb} MB limit."}, status_code=413)
        try:
            if int(request.headers.get("content-length", "0")) > limit:
                return too_large
        except ValueError:
            return JSONResponse({"message": "Invalid request size."}, status_code=400)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > limit:
                return too_large
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    # Coursework simulation: never ask search engines to index simulated clinics or prices.
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    html_page = not request.url.path.startswith(("/static", "/api", "/docs", "/redoc", "/openapi.json"))
    if html_page or request.url.path.startswith("/api/business"):
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    return response


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "version": VERSION,
        "commit": build_commit(),
    }


@app.get("/app")
async def business_app(request: Request):
    from services import business_dots
    return templates.TemplateResponse(request, "workspace.html", {"staff_mode": False, "title": "Your workspace — LabClear", "dots": business_dots.public_roster()})

@app.get("/staff")
async def business_staff(request: Request):
    return templates.TemplateResponse(request, "workspace.html", {"staff_mode": True, "title": "Service desk — LabClear"})
