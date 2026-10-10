"""Read-only coursework marketplace. Synthetic offers never enter booking or AI catalogs."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCATIONS = {"bangkok": "Bangkok", "chiang-mai": "Chiang Mai", "khon-kaen": "Khon Kaen"}
CATEGORIES = {"general": "General check", "metabolic": "Metabolic tests", "blood": "Blood count"}
PROVIDER_TYPES = {"hospital": "Hospital", "clinic": "Clinic"}
SORTS = {"listed": "Listed order", "price_asc": "Demo price: low to high", "price_desc": "Demo price: high to low"}

def catalog():
    data = json.loads((ROOT / "business_data/checkup_hub.json").read_text(encoding="utf-8"))
    # Fail closed if a future data edit accidentally turns a demo into a real offer.
    for p in data["packages"]:
        if p.get("synthetic") is not True or p.get("partnership_verified") is not False or p.get("bookable") is not False:
            raise ValueError("Hub requires explicitly synthetic, non-partner, non-bookable offers")
    return data

def search(q="", location="", category="", provider_type="", max_price=None, sort="listed"):
    data = catalog()
    applied = dict(q=q[:80].strip(), location=location, category=category, provider_type=provider_type,
                   max_price=max_price, sort=sort)
    words = applied["q"].casefold().split()
    rows = []
    for p in data["packages"]:
        haystack = " ".join([p["name"], p["provider"], p["description"], p["search_terms"], *p["included_tests"]]).casefold()
        if any(word not in haystack for word in words):
            continue
        if location and p["location"] != location or category and p["category"] != category:
            continue
        if provider_type and p["provider_type"] != provider_type:
            continue
        if max_price is not None and p["demo_price_thb"] > max_price:
            continue
        rows.append(p)
    if sort in ("price_asc", "price_desc"):
        rows.sort(key=lambda p: (p["demo_price_thb"], p["id"]), reverse=sort == "price_desc")
    return {"packages": rows, "total": len(rows), "applied": applied, "version": data["version"]}

def detail(package_id):
    return next((p for p in catalog()["packages"] if p["id"] == package_id), None)

def compare(ids):
    selected = list(dict.fromkeys(i.strip() for i in ids.split(",") if i.strip()))
    if len(selected) > 3:
        return [], "Choose at most three Hub packages."
    if any(detail(i) is None for i in selected):
        return [], "A selected demo package is unavailable. Choose again from the Hub."
    return [detail(i) for i in selected], ""
