import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone
from importlib.metadata import version

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont


REPORTS = {
    "business": Path("docs/report/LabClear_Business_Report_TH.pdf"),
    "architecture": Path("docs/report/LabClear_Architecture_Report_TH.pdf"),
    "slides": Path("docs/report/LabClear_Slides.pdf"),
}
THAI = re.compile(r"[\u0e00-\u0e7f]")
REPLACEMENT = "\ufffd"


def render_contact_sheets(name, pages, output, batch_size=10):
    for start in range(0, len(pages), batch_size):
        batch = pages[start:start + batch_size]
        cell_width, gap, label_height = 360, 12, 28
        columns = 3
        rows = (len(batch) + columns - 1) // columns
        sample = batch[0].render(scale=0.62).to_pil().convert("RGB")
        cell_height = round(sample.height * cell_width / sample.width)
        sheet = Image.new("RGB", (gap + columns * (cell_width + gap), gap + rows * (cell_height + label_height + gap)), "#ece9f2")
        draw = ImageDraw.Draw(sheet)
        for offset, page in enumerate(batch):
            number = start + offset + 1
            x = gap + (offset % columns) * (cell_width + gap)
            y = gap + (offset // columns) * (cell_height + label_height + gap)
            image = page.render(scale=0.62).to_pil().convert("RGB")
            image.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)
            sheet.paste(image, (x, y))
            draw.text((x + 4, y + cell_height + 5), f"{name} page {number:02d}", fill="#282332")
        file = output / f"{name}-pages-{start + 1:02d}-{start + len(batch):02d}.png"
        sheet.save(file, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    status = subprocess.run(["git", "status", "--porcelain"], check=True, capture_output=True, text=True).stdout
    manifest = {
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "candidate_head": subprocess.run(["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip(),
        "worktree": {"dirty_path_count": len(status.splitlines()), "status_sha256": hashlib.sha256(status.encode()).hexdigest()},
        "environment": {"platform": platform.platform(), "python": sys.version.split()[0], "pypdfium2": version("pypdfium2"), "pillow": version("pillow")},
        "renderer": "pypdfium2",
        "reports": {},
        "summary": {},
    }
    for name, relative_path in REPORTS.items():
        source = Path.cwd() / relative_path
        data = source.read_bytes()
        document = pdfium.PdfDocument(str(source))
        pages = list(document)
        page_results = []
        for index, page in enumerate(pages):
            text = page.get_textpage().get_text_range()
            objects = list(page.get_objects())
            page_results.append({
                "page": index + 1,
                "text_characters": len(text.strip()),
                "has_thai_text": bool(THAI.search(text)),
                "replacement_glyphs": text.count(REPLACEMENT),
                "image_objects": sum(obj.type == pdfium.raw.FPDF_PAGEOBJ_IMAGE for obj in objects),
            })
        render_contact_sheets(name, pages, args.output)
        representative = [0, len(pages) // 2, len(pages) - 1]
        for index in sorted(set(representative)):
            pages[index].render(scale=1.5).to_pil().save(args.output / f"{name}-page-{index + 1:02d}.png", optimize=True)
        manifest["reports"][name] = {
            "source": relative_path.as_posix(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "signature": data[:5].decode("ascii", errors="replace"),
            "page_count": len(pages),
            "pages": page_results,
        }
        document.close()
    all_pages = [page for report in manifest["reports"].values() for page in report["pages"]]
    manifest["summary"] = {
        "reports": len(manifest["reports"]),
        "pages": len(all_pages),
        "empty_pages": sum(page["text_characters"] == 0 for page in all_pages),
        "pages_without_thai": sum(not page["has_thai_text"] for report in manifest["reports"].values() for page in report["pages"]),
        "replacement_glyphs": sum(page["replacement_glyphs"] for page in all_pages),
        "image_objects": sum(page["image_objects"] for page in all_pages),
    }
    manifest["status"] = "PASS" if (
        all(item["signature"] == "%PDF-" and item["page_count"] > 0 for item in manifest["reports"].values())
        and manifest["summary"]["empty_pages"] == 0
        and manifest["summary"]["pages_without_thai"] == 0
        and manifest["summary"]["replacement_glyphs"] == 0
    ) else "FAIL"
    (args.output / "report-render-qa.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], **manifest["summary"]}, ensure_ascii=False, indent=2))
    if manifest["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
