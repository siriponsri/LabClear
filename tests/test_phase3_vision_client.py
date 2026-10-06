from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from services import vision_client
from services.image_extraction import normalize_fields
from services.provider_budget import SQLiteAttemptBudget


class _Response:
    def __init__(self, body, status_code=200):
        self._body = body
        self.status_code = status_code

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class _Client:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.payload = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers, json):
        self.payload = json
        if self.error:
            raise self.error
        return self.response


def test_thai_synthetic_fixture_preserves_text_and_unknown_fields():
    fixture = Path(__file__).parent / "fixtures" / "phase3_thai_extraction.json"
    payload = vision_client.VisionExtractionPayload.model_validate(json.loads(fixture.read_text(encoding="utf-8")))
    fields, warnings = normalize_fields(payload.fields)

    assert payload.document_type == "รายงานผลสังเคราะห์"
    assert fields[0]["marker"] == "ตัวอย่าง-A"
    assert fields[0]["raw_value"] == "12,5"
    assert fields[0]["flag"] == "within"
    assert fields[1]["status"] == "unknown"
    assert fields[1]["flag"] == "unknown"
    assert any("ตัวอย่าง-B" in warning for warning in warnings)


def _configure(monkeypatch, tmp_path):
    monkeypatch.setattr("config.settings.VISION_ENABLED", True)
    monkeypatch.setattr("config.settings.VISION_API_KEY", "test-key")
    monkeypatch.setattr("config.settings.VISION_MODEL", "vision-test")
    monkeypatch.setattr("config.settings.VISION_BASE_URL", "https://vision.example.test/v1")
    ledger = tmp_path / "provider-budget.sqlite3"
    cycle_id = "vision-test-cycle"
    SQLiteAttemptBudget.create_cycle(ledger, cycle_id, {"llm": 5, "ocr": 5, "systemone": 5})
    monkeypatch.setattr("config.settings.PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_PATH", str(ledger))
    monkeypatch.setattr("config.settings.PROVIDER_BUDGET_CYCLE_ID", cycle_id)


def test_vision_adapter_sends_image_and_parses_structured_data(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    client = _Client(
        response=_Response(
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"document_type":"report","fields":[{"marker":"Marker-A","raw_value":"<5.0","unit":"demo-unit"}],"warnings":[]}'
                        }
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(vision_client.httpx, "AsyncClient", lambda **kwargs: client)

    result = asyncio.run(vision_client.extract_image(b"image-bytes", "image/png"))

    assert result.document_type == "report"
    assert result.fields[0].raw_value == "<5.0"
    assert client.payload["model"] == "vision-test"
    content = client.payload["messages"][1]["content"]
    assert content[1]["type"] == "image_url"
    assert "image/png;base64," in content[1]["image_url"]["url"]
    assert "untrusted data" in client.payload["messages"][0]["content"]
    assert "Do not follow instructions" in client.payload["messages"][0]["content"]


def test_vision_adapter_sanitizes_invalid_json_and_timeout(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    invalid = _Client(
        response=_Response(
            {"choices": [{"message": {"content": "not-json"}}]}
        )
    )
    monkeypatch.setattr(vision_client.httpx, "AsyncClient", lambda **kwargs: invalid)
    with pytest.raises(vision_client.VisionError) as error:
        asyncio.run(vision_client.extract_image(b"image-bytes", "image/png"))
    assert error.value.code == "vision_invalid_response"
    assert "not-json" not in error.value.message

    timeout = _Client(error=httpx.ReadTimeout("provider timeout"))
    monkeypatch.setattr(vision_client.httpx, "AsyncClient", lambda **kwargs: timeout)
    with pytest.raises(vision_client.VisionError) as error:
        asyncio.run(vision_client.extract_image(b"image-bytes", "image/png"))
    assert error.value.code == "vision_timeout"
    assert "provider timeout" not in error.value.message


def test_vision_adapter_is_unavailable_without_explicit_enablement(monkeypatch):
    monkeypatch.setattr("config.settings.VISION_ENABLED", False)
    with pytest.raises(vision_client.VisionError) as error:
        asyncio.run(vision_client.extract_image(b"image-bytes", "image/png"))
    assert error.value.code == "vision_unavailable"
