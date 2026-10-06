from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, Literal

from PIL import Image, ImageOps
from PIL.Image import DecompressionBombError, UnidentifiedImageError

from config import settings
from services.vision_client import VisionFieldPayload


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class ExtractionValidationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class ValidatedImage:
    normalized_bytes: bytes
    media_type: str
    image_format: str
    width: int
    height: int


_NUMBER = re.compile(r"^\s*(?P<operator><=|>=|<|>)?\s*(?P<number>[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*$")
_FIELD_ID = re.compile(r"^field-[0-9]{1,3}$")


def _image_signature(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG", "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG", "image/jpeg"
    return None


def validate_image_bytes(data: bytes) -> ValidatedImage:
    if not data:
        raise ImageValidationError("empty_image", "The uploaded image is empty.", 400)
    if len(data) > settings.IMAGE_MAX_BYTES:
        raise ImageValidationError("image_too_large", "The uploaded image exceeds the size limit.", 413)
    signature = _image_signature(data)
    if signature is None:
        raise ImageValidationError("unsupported_image", "Only JPEG and PNG images are supported.", 415)
    image_format, media_type = signature
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format != image_format:
                raise ImageValidationError("invalid_image", "The image content does not match its format.", 400)
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > settings.IMAGE_MAX_PIXELS:
                raise ImageValidationError("image_dimensions_too_large", "The decoded image exceeds the pixel limit.", 413)
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
            clean = ImageOps.exif_transpose(image).copy()
            clean.info.clear()
            output = BytesIO()
            if image_format == "JPEG" and clean.mode not in {"RGB", "L"}:
                clean = clean.convert("RGB")
            clean.save(output, format=image_format, **({"quality": 95} if image_format == "JPEG" else {}))
            normalized = output.getvalue()
    except ImageValidationError:
        raise
    except (DecompressionBombError, MemoryError) as exc:
        raise ImageValidationError("image_dimensions_too_large", "The decoded image exceeds the pixel limit.", 413) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageValidationError("invalid_image", "The uploaded image could not be decoded.", 400) from exc
    return ValidatedImage(normalized, media_type, image_format, width, height)


def _clean_text(value: Any, *, field: str, max_length: int = 160) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ExtractionValidationError(f"{field} must be text or null.")
    clean = value.strip()
    if not clean:
        return None
    if len(clean) > max_length:
        raise ExtractionValidationError(f"{field} is too long.")
    return clean


def _decimal_text(value: str | None) -> tuple[str | None, str | None, Decimal | None]:
    if value is None:
        return None, None, None
    match = _NUMBER.match(value)
    if not match:
        return None, None, None
    number_text = match.group("number")
    normalized = number_text
    if "," in normalized and "." in normalized:
        normalized = normalized.replace(",", "") if normalized.rfind(",") < normalized.rfind(".") else normalized.replace(".", "").replace(",", ".")
    else:
        normalized = normalized.replace(",", ".")
    try:
        return match.group("operator"), number_text, Decimal(normalized)
    except InvalidOperation:
        return None, None, None


def _range_values(source: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    low = source.get("reference_low")
    high = source.get("reference_high")
    raw_range = source.get("reference_range")
    if isinstance(raw_range, dict):
        low = raw_range.get("low", low)
        high = raw_range.get("high", high)
    elif isinstance(raw_range, (list, tuple)) and len(raw_range) == 2:
        low, high = raw_range
    low_text = _clean_text(low, field="reference_low", max_length=80)
    high_text = _clean_text(high, field="reference_high", max_length=80)
    raw_text = _clean_text(source.get("reference_range_raw"), field="reference_range_raw", max_length=160)
    if raw_text is None and (low_text is not None or high_text is not None):
        raw_text = f"{low_text or '?'}-{high_text or '?'}"
    return low_text, high_text, raw_text


def _flag(value: Decimal | None, low: Decimal | None, high: Decimal | None) -> Literal["low", "high", "within", "unknown"]:
    if value is None or low is None or high is None or low > high:
        return "unknown"
    if value < low:
        return "low"
    if value > high:
        return "high"
    return "within"


def normalize_field(source: VisionFieldPayload | dict[str, Any], index: int, provenance: Literal["image", "user"] = "image") -> tuple[dict[str, Any], list[str]]:
    data = source.model_dump() if isinstance(source, VisionFieldPayload) else dict(source)
    marker = _clean_text(data.get("marker"), field="marker", max_length=120)
    if marker is None:
        raise ExtractionValidationError("Every extracted field needs a marker.")
    field_id = _clean_text(data.get("field_id"), field="field_id", max_length=32) or f"field-{index + 1}"
    if not _FIELD_ID.match(field_id):
        raise ExtractionValidationError("Invalid extraction field id.")
    raw_value = _clean_text(data.get("raw_value"), field="raw_value")
    unit = _clean_text(data.get("unit"), field="unit", max_length=80)
    operator, numeric_value, decimal_value = _decimal_text(raw_value)
    low_text, high_text, range_raw = _range_values(data)
    _, _, low_decimal = _decimal_text(low_text)
    _, _, high_decimal = _decimal_text(high_text)
    warnings: list[str] = []
    status = "read"
    if raw_value is None or decimal_value is None:
        status = "unknown"
        if raw_value is not None:
            warnings.append(f"{marker}: value could not be normalized and remains unknown.")
    if low_text is None or high_text is None or low_decimal is None or high_decimal is None or low_decimal > high_decimal:
        warnings.append(f"{marker}: no valid reference range was available; status remains unknown.")
    flag = _flag(decimal_value, low_decimal, high_decimal)
    return (
        {
            "field_id": field_id,
            "marker": marker,
            "raw_value": raw_value,
            "numeric_value": numeric_value,
            "comparator": operator,
            "unit": unit,
            "reference_low": low_text,
            "reference_high": high_text,
            "reference_range_raw": range_raw,
            "flag": flag,
            "status": status,
            "provenance": provenance,
        },
        warnings,
    )


def normalize_fields(fields: list[VisionFieldPayload | dict[str, Any]], provenance: Literal["image", "user"] = "image") -> tuple[list[dict[str, Any]], list[str]]:
    if len(fields) > settings.MAX_EXTRACTION_FIELDS:
        raise ExtractionValidationError("The extraction contains too many fields.")
    normalized: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()
    for index, field in enumerate(fields):
        row, row_warnings = normalize_field(field, index, provenance)
        if row["field_id"] in seen_ids:
            raise ExtractionValidationError("Extraction field ids must be unique.")
        seen_ids.add(row["field_id"])
        normalized.append(row)
        warnings.extend(row_warnings)
    return normalized, warnings


def confirmed_extraction_context(document_type: str, fields: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    return {
        "document_type": document_type,
        "fields": fields,
        "warnings": warnings,
        "source": "user-confirmed-image-extraction",
    }
