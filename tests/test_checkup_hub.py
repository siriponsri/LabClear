"""Hub tests run offline against synthetic data, never production storage."""
import json
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers.checkup_hub import router
from services import checkup_hub as hub

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        yield client

def test_all_records_are_fictional_and_non_bookable():
    rows = hub.catalog()["packages"]
    assert len(rows) == 6 and len({p["id"] for p in rows}) == 6
    assert {p["provider_type"] for p in rows} == {"hospital", "clinic"}
    assert {p["location"] for p in rows} == set(hub.LOCATIONS)
    for p in rows:
        assert p["synthetic"] and not p["bookable"] and not p["partnership_verified"]
        assert p["provider"].startswith("Demo ")
        assert not any(k in p for k in ("url", "phone", "email", "discount", "rating"))

def test_filters_intersect_and_search_accepts_thai_aliases():
    assert [p["id"] for p in hub.search(location="bangkok", provider_type="clinic", max_price=1000)["packages"]] == ["HUB-001"]
    assert hub.search(q="เชียงใหม่", category="metabolic")["total"] == 2
    assert hub.search(q="zzzzzz")["total"] == 0
    assert hub.search(location="khon-kaen", max_price=0)["total"] == 0
    assert hub.search()["total"] == 6
    prices = [p["demo_price_thb"] for p in hub.search(sort="price_asc")["packages"]]
    assert prices == sorted(prices)

def test_comparison_bounds_and_unknown_ids():
    rows, error = hub.compare("HUB-001,HUB-001,HUB-002")
    assert len(rows) == 2 and not error
    assert hub.compare("HUB-001,HUB-002,HUB-003,HUB-004")[1]
    assert hub.compare("HUB-001,missing")[0] == []
    assert hub.detail("../../.env") is None

@pytest.mark.parametrize("path", ["/hub", "/hub?q=&location=&provider_type=&category=&max_price=&sort=listed", "/hub/HUB-001", "/hub/compare?ids=HUB-001,HUB-002"])
def test_public_pages_disclose_simulation(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "Demo only. No partnership agreements." in response.text
    assert "Fictional price and test list" in response.text
    assert "No real booking, payment or contact takes place." in response.text

@pytest.mark.parametrize("query", ["max_price=-1", "max_price=100001", "max_price=abc", "location=missing", "category=missing", "provider_type=missing", "sort=anything", "q="+"a"*81])
def test_invalid_filters_are_rejected(client, query):
    assert client.get("/hub?"+query).status_code == 422

def test_empty_detail_and_comparison_states(client):
    assert "No demo packages match" in client.get("/hub?q=no-such-test").text
    assert client.get("/hub/HUB-missing").status_code == 404
    assert "Choose two or three Hub packages" in client.get("/hub/compare").text
    assert "Choose at most three Hub packages." in client.get("/hub/compare?ids=HUB-001,HUB-002,HUB-003,HUB-004").text
    assert "unavailable" in client.get("/hub/compare?ids=unknown,HUB-001").text

def test_no_booking_endpoint_or_contact_collection(client):
    assert client.post("/hub/HUB-001", json={}).status_code == 405
    html = client.get("/hub/HUB-001").text
    assert "No appointment was created" in html
    assert 'type="email"' not in html and 'type="tel"' not in html
    assert 'name="time"' in html and 'name="topic"' in html
    assert 'data-hub-inquiry' in html

def test_existing_three_center_catalog_is_separate():
    root = Path(__file__).resolve().parents[1]
    branches = json.loads((root/"business_data/branches.json").read_text(encoding="utf-8"))
    packages = json.loads((root/"business_data/catalog.json").read_text(encoding="utf-8"))
    assert len(branches["branches"]) == 3
    assert not any(p["id"].startswith("HUB-") for p in packages["packages"])
