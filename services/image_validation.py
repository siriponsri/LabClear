"""Validate an uploaded report image: real PNG/JPEG bytes, size and pixel limits, metadata stripped."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps
from PIL.Image import DecompressionBombError, UnidentifiedImageError

from config import settings


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass(frozen=True)
class ValidatedImage:
    normalized_bytes: bytes
    media_type: str
    image_format: str
    width: int
    height: int


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
