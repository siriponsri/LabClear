"""Downloadable business documents: quotation PDF and appointment iCalendar files.

The PDF writer is intentionally small (base-14 Helvetica, ASCII text, A4) so the
runtime needs no extra dependency. Documents are simulation artifacts: they are
labelled as quotations, never as tax invoices or receipts.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Bangkok")


def _ascii(text: object) -> str:
    value = str(text).replace("–", "-").replace("—", "-").replace("×", "x").replace("฿", "THB ")
    return value.encode("ascii", "replace").decode("ascii")


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap(text: str, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        if len(line) + len(word) + 1 > width and line:
            lines.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    lines.append(line)
    return lines


def render_pdf(blocks: list[tuple[str, str]]) -> bytes:
    """Render (style, text) blocks. Styles: title, heading, body, small, rule, row."""
    ops: list[str] = []
    pages: list[list[str]] = [ops]
    y = 800

    def need(height: int) -> None:
        nonlocal ops, y
        if y - height < 60:
            ops = []
            pages.append(ops)
            y = 800

    for style, raw in blocks:
        text = _ascii(raw)
        if style == "rule":
            need(14)
            ops.append(f"0.29 0 0.51 RG 0.8 w 56 {y} m 539 {y} l S")
            y -= 14
            continue
        size, font, width, gap = {
            "title": (20, "F2", 44, 28), "heading": (12, "F2", 80, 20),
            "body": (10, "F1", 95, 14), "small": (8, "F1", 120, 11), "row": (10, "F1", 95, 15),
        }[style]
        if style == "row":
            left, _, right = text.partition("|")
            need(gap)
            ops.append(f"BT /F1 10 Tf 0.13 0.09 0.18 rg 56 {y} Td ({_escape(left[:70])}) Tj ET")
            ops.append(f"BT /F2 10 Tf 0.13 0.09 0.18 rg 420 {y} Td ({_escape(right[:22])}) Tj ET")
            y -= gap
            continue
        for line in _wrap(text, width):
            need(gap)
            color = "0.29 0 0.51" if style == "title" else "0.13 0.09 0.18"
            ops.append(f"BT /{font} {size} Tf {color} rg 56 {y} Td ({_escape(line)}) Tj ET")
            y -= gap
        y -= 4

    objects: list[bytes] = []
    page_ids = []
    first_page = 3
    font1 = first_page + 2 * len(pages)
    font2 = font1 + 1
    for index, page_ops in enumerate(pages):
        page_id = first_page + 2 * index
        page_ids.append(page_id)
        stream = "\n".join(page_ops).encode("ascii")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font1} 0 R /F2 {font2} 0 R >> >> /Contents {page_id + 1} 0 R >>".encode())
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    kids = " ".join(f"{p} 0 R" for p in page_ids)
    head = [b"<< /Type /Catalog /Pages 2 0 R >>", f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode()]
    tail = [b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]
    all_objects = head + objects + tail
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(all_objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(all_objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(all_objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def quotation_pdf(quote: dict, branch_name: str) -> bytes:
    d = quote["data"]
    issued = datetime.fromtimestamp(quote.get("created") or 0, TZ).strftime("%Y-%m-%d")
    expires = datetime.fromtimestamp(d.get("expires", 0), TZ).strftime("%Y-%m-%d")
    blocks: list[tuple[str, str]] = [
        ("title", "LabClear - Organization quotation"),
        ("small", "SIMULATED BUSINESS DOCUMENT for coursework. Not a tax invoice, not a receipt and not a request for payment."),
        ("rule", ""),
        ("row", f"Quotation reference|{quote['id'][-12:]}"),
        ("row", f"Version|{d.get('version', 1)}"),
        ("row", f"Status|{quote.get('state', '')}"),
        ("row", f"Issued|{issued}"),
        ("row", f"Valid until|{expires}"),
        ("rule", ""),
        ("heading", "Service"),
        ("row", f"Package|{d.get('package_id', '')}"),
        ("body", str(d.get("items", [{}])[0].get("name", ""))),
        ("row", f"People|{d.get('people', '')}"),
        ("row", f"Service date|{d.get('date', '')} {d.get('time', '')}"),
        ("row", f"Coordinating center|{branch_name}"),
        ("body", f"Venue: {d.get('venue', '')}"),
        ("rule", ""),
        ("heading", "Price"),
        ("row", f"Unit price (THB)|{d.get('unit_price_thb', 0):,}"),
        ("row", f"Travel fee (THB)|{d.get('travel_fee_thb', 0):,}"),
        ("row", f"Total (THB)|{d.get('total_thb', 0):,}"),
        ("rule", ""),
        ("small", "Prices are coursework simulation values, not medical advice or a clinically approved package. "
                  "Each employee's laboratory results remain private to that employee; the organization receives coordination information only."),
    ]
    if d.get("note"):
        blocks.insert(-2, ("body", "Note from our team: " + str(d["note"])))
    return render_pdf(blocks)


def _ics_text(value: str) -> str:
    return re.sub(r"([,;\\])", r"\\\1", _ascii(value)).replace("\n", "\\n")


def appointment_ics(booking: dict, branch: dict) -> bytes:
    d = booking["data"]
    start = datetime.strptime(d["date"] + " " + d["time"], "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
    end = start + timedelta(hours=1)
    stamp = datetime.now(TZ).astimezone(ZoneInfo("UTC")).strftime("%Y%m%dT%H%M%SZ")
    names = ", ".join(item.get("name", "") for item in d.get("items", []))
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LabClear//Coursework simulation//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VTIMEZONE", "TZID:Asia/Bangkok", "BEGIN:STANDARD", "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0700", "TZOFFSETTO:+0700", "TZNAME:ICT", "END:STANDARD", "END:VTIMEZONE",
        "BEGIN:VEVENT",
        f"UID:{booking['id']}@labclear.invalid",
        f"DTSTAMP:{stamp}",
        f"DTSTART;TZID=Asia/Bangkok:{start.strftime('%Y%m%dT%H%M%S')}",
        f"DTEND;TZID=Asia/Bangkok:{end.strftime('%Y%m%dT%H%M%S')}",
        f"SUMMARY:{_ics_text('LabClear health check (simulation): ' + names)}",
        f"LOCATION:{_ics_text(branch.get('name', '') + ' - ' + branch.get('area', ''))}",
        f"DESCRIPTION:{_ics_text('Coursework simulation. No clinic operates at this location. ' + branch.get('address_disclaimer', ''))}",
        "STATUS:CONFIRMED",
        "END:VEVENT", "END:VCALENDAR",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("ascii")
