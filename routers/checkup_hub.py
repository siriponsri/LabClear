"""Public, read-only demo Hub in the existing FastAPI service."""
from typing import Literal
from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse
from routers.site import page
from services import checkup_hub as hub

router = APIRouter()

def shared():
    return dict(locations=hub.LOCATIONS, categories=hub.CATEGORIES, provider_types=hub.PROVIDER_TYPES, sorts=hub.SORTS)

@router.get("/hub", response_class=HTMLResponse)
def listing(request: Request, q: str = Query("", max_length=80),
            location: Literal["", "bangkok", "chiang-mai", "khon-kaen"] = "",
            category: Literal["", "general", "metabolic", "blood"] = "",
            provider_type: Literal["", "hospital", "clinic"] = "",
            max_price: str = Query("", pattern=r"^(?:[0-9]{1,5}|100000)?$"),
            sort: Literal["listed", "price_asc", "price_desc"] = "listed"):
    return page(request, "site/hub.html", "Checkup Hub | LabClear",
                "Explore and compare clearly labelled synthetic hospital and clinic packages.",
                result=hub.search(q, location, category, provider_type, int(max_price) if max_price else None, sort), **shared())

@router.get("/hub/compare", response_class=HTMLResponse)
def comparison(request: Request, ids: str = Query("", max_length=100)):
    packages, error = hub.compare(ids)
    tests = list(dict.fromkeys(t for p in packages for t in p["included_tests"]))
    return page(request, "site/hub_compare.html", "Compare Hub packages | LabClear",
                "Compare synthetic package examples. No partnership, booking or payment.",
                packages=packages, tests=tests, error=error, **shared())

@router.get("/hub/{package_id}", response_class=HTMLResponse)
def package_detail(request: Request, package_id: str):
    package = hub.detail(package_id)
    if package is None:
        return page(request, "site/not_found.html", "Demo package not found | LabClear",
                    "This demo package is unavailable.", status=404, what="demo package")
    return page(request, "site/hub_detail.html", "Demo package details | LabClear",
                "Synthetic package details and an on-screen inquiry simulation.",
                p=package, **shared())
