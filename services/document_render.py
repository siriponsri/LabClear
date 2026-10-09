"""Report files to page images: signature, page and pixel limits checked before any rendering.

Runs in a separate process started by services/document_worker.py (``python -I document_render.py``)
with a time limit, an address-space limit and no writable files, so a malformed or hostile PDF
cannot block the web server's event loop or hold its memory. It imports only the standard library,
Pillow and pypdfium2, and never the application configuration or its secrets.

Child protocol: stdin is JSON {"files": [base64...], "limits": {...}}; stdout is JSON
{"ok": true, "pages": [[base64, media_type], ...]} or {"ok": false, "code", "message", "status"}.
"""
from __future__ import annotations

import base64
import json
import sys
from dataclasses import dataclass
from io import BytesIO

PDF_SCALE_MAX = 2.0
PDF_LONG_EDGE = 2200


class RenderError(Exception):
    def __init__(self, code: str, message: str, status: int) -> None:
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


@dataclass(frozen=True)
class Limits:
    max_bytes: int
    max_pixels: int
    max_pages: int = 3


@dataclass(frozen=True)
class ValidatedImage:
    normalized_bytes: bytes
    media_type: str
    image_format: str
    width: int
    height: int


def signature(data: bytes) -> str:
    """'pdf', 'png', 'jpeg' or '' from the first bytes; checked before any decoding."""
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    return ""


def validate_image(data: bytes, max_bytes: int, max_pixels: int) -> ValidatedImage:
    """Real PNG/JPEG bytes within the size and decoded-pixel limits, re-encoded without metadata."""
    from PIL import Image, ImageOps
    from PIL.Image import DecompressionBombError, UnidentifiedImageError
    if not data:
        raise RenderError("empty_image", "The uploaded image is empty.", 400)
    if len(data) > max_bytes:
        raise RenderError("image_too_large", "The uploaded image exceeds the size limit.", 413)
    kind = signature(data)
    if kind not in ("png", "jpeg"):
        raise RenderError("unsupported_image", "Only JPEG and PNG images are supported.", 415)
    image_format, media_type = ("PNG", "image/png") if kind == "png" else ("JPEG", "image/jpeg")
    try:
        with Image.open(BytesIO(data)) as image:  # reads the header only
            if image.format != image_format:
                raise RenderError("invalid_image", "The image content does not match its format.", 400)
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > max_pixels:
                raise RenderError("image_dimensions_too_large", "The decoded image exceeds the pixel limit.", 413)
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
            clean = ImageOps.exif_transpose(image).copy()
            clean.info.clear()
            output = BytesIO()
            if image_format == "JPEG" and clean.mode not in {"RGB", "L"}:
                clean = clean.convert("RGB")
            clean.save(output, format=image_format, **({"quality": 95} if image_format == "JPEG" else {}))
    except RenderError:
        raise
    except (DecompressionBombError, MemoryError) as exc:
        raise RenderError("image_dimensions_too_large", "The decoded image exceeds the pixel limit.", 413) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise RenderError("invalid_image", "The uploaded image could not be decoded.", 400) from exc
    return ValidatedImage(output.getvalue(), media_type, image_format, width, height)


def _pdf_pages(raw: bytes, limits: Limits, budget: int) -> list[tuple[bytes, str]]:
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(raw)
    try:
        count = len(document)
        if not 1 <= count <= limits.max_pages:
            raise RenderError("pdf_page_limit", "Upload one to three report pages at a time.", 422)
        if count > budget:
            raise RenderError("page_limit", "Read one to three pages or images at a time.", 422)
        # Every page's size is checked before the first one is rendered.
        sizes = []
        for i in range(count):
            page = document[i]
            try:
                width, height = page.get_size()
            finally:
                page.close()
            scale = min(PDF_SCALE_MAX, PDF_LONG_EDGE / max(width, height, 1))
            if width <= 0 or height <= 0 or width * height * scale * scale > limits.max_pixels:
                raise RenderError("pdf_invalid", "This PDF cannot be read. Try an unlocked PDF or a PNG image.", 422)
            sizes.append(scale)
        images = []
        for i, scale in enumerate(sizes):
            page = document[i]
            try:
                bitmap = page.render(scale=scale)
                try:
                    image = bitmap.to_pil().convert("RGB")
                    target = BytesIO()
                    image.save(target, format="JPEG", quality=90)
                    images.append((target.getvalue(), "image/jpeg"))
                finally:
                    bitmap.close()
            finally:
                page.close()
        return images
    finally:
        document.close()


def render(raws: list[bytes], limits: Limits) -> list[tuple[bytes, str]]:
    """All pages of up to three files, at most ``limits.max_pages`` in total."""
    for raw in raws:
        if len(raw) > limits.max_bytes:
            raise RenderError("file_too_large", "Choose a file smaller than 3 MB.", 413)
        if not raw:
            raise RenderError("empty_image", "The uploaded image is empty.", 400)
        if not signature(raw):
            raise RenderError("unsupported_image", "Use PDF, PNG or JPEG files.", 415)
    pages: list[tuple[bytes, str]] = []
    for raw in raws:
        budget = limits.max_pages - len(pages)
        if budget <= 0:
            raise RenderError("page_limit", "Read one to three pages or images at a time.", 422)
        if signature(raw) == "pdf":
            try:
                pages += _pdf_pages(raw, limits, budget)
            except RenderError:
                raise
            except MemoryError:
                raise RenderError("document_too_complex", "This file needs too much memory to prepare. Try a smaller PDF or a PNG image.", 422) from None
            except Exception:
                raise RenderError("pdf_invalid", "This PDF cannot be read. Try an unlocked PDF or a PNG image.", 422) from None
        else:
            image = validate_image(raw, limits.max_bytes, limits.max_pixels)
            pages.append((image.normalized_bytes, image.media_type))
    if not 1 <= len(pages) <= limits.max_pages:
        raise RenderError("page_limit", "Read one to three pages or images at a time.", 422)
    return pages


def _apply_process_limits(memory_mb: int, cpu_seconds: int) -> None:
    try:
        import resource
    except ImportError:  # Windows: the parent's wall-clock limit and kill still apply
        return
    memory = memory_mb * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))  # no files: nothing to leave behind


def _child() -> int:
    request = json.loads(sys.stdin.buffer.read())
    lim = request["limits"]
    _apply_process_limits(int(lim["memory_mb"]), int(lim["cpu_seconds"]))
    try:
        raws = [base64.b64decode(item) for item in request["files"]]
        pages = render(raws, Limits(int(lim["max_bytes"]), int(lim["max_pixels"]), int(lim.get("max_pages", 3))))
        reply = {"ok": True, "pages": [[base64.b64encode(data).decode(), media_type] for data, media_type in pages]}
    except RenderError as exc:
        reply = {"ok": False, "code": exc.code, "message": exc.message, "status": exc.status}
    except MemoryError:
        reply = {"ok": False, "code": "document_too_complex", "message": "This file needs too much memory to prepare. Try a smaller PDF or a PNG image.", "status": 422}
    sys.stdout.buffer.write(json.dumps(reply).encode())
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(_child())
