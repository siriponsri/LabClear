"""Validate an uploaded report image: real PNG/JPEG bytes, size and pixel limits, metadata stripped.

The checks live in services/document_render.py, which the document worker process runs for every
upload; this module keeps the in-process API with the configured limits."""
from __future__ import annotations

from config import settings
from services.document_render import RenderError, ValidatedImage, validate_image

__all__ = ["ImageValidationError", "ValidatedImage", "validate_image_bytes"]


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def validate_image_bytes(data: bytes) -> ValidatedImage:
    try:
        return validate_image(data, settings.IMAGE_MAX_BYTES, settings.IMAGE_MAX_PIXELS)
    except RenderError as exc:
        raise ImageValidationError(exc.code, exc.message, exc.status) from exc
