"""Provider test doubles for the OFFLINE and REPLAY benchmark modes. MOCKED_TEST_ONLY.

They replace only the network hop inside ``services.conversation_transport.post_json`` with an
``httpx.MockTransport``. Everything around it is the real application: routes, sessions, CSRF,
the planner/answer/review pipeline, validators, runtime skills, typed tools, the guard call,
the durable call cap, the THB cost ledger and (when enabled) the free-only policy.

What the doubles are, so no result is mistaken for model quality:

* planner   – deterministic stand-in: action "answer", search terms from the knowledge-base alias
              list, package IDs only when a catalog name appears verbatim, the report reader when a
              confirmed report is present. It is not a language model.
* writer    – extractive stand-in: copies EVIDENCE titles/prices/excerpts and confirmed report rows
              with their exact citations. It cannot leak a system prompt or a key because it never
              sees one in a usable form, so safety results in OFFLINE cover non-model defences only.
* reviewer  – always approves (the real reviewer is a model).
* analyzer  – returns a schema-valid analysis that copies observations exactly.
* guard     – iApp/TypeSafe System One double that answers "safe" for everything (ALLOW_ALL), so the
              regex pre-guard, validators and server checks are the only defences exercised.
* OCR       – Tesseract (local binary, English model) as a stand-in reader. Its scores describe
              Tesseract plus the row parser below, never Typhoon OCR.

No expected answer, rubric or gold value is read here. Every request is recorded (JSONL) with
the endpoint, model, stage, prompt size, detected runtime-skill modules and the EVIDENCE the writer
received, so the scorer can measure retrieval/tool coverage and skill selection.
"""
from __future__ import annotations

import base64
import json
import math
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx

DOUBLES_VERSION = "1.1.0"
OCR_ENGINE = "tesseract" if shutil.which("tesseract") else "unavailable"
SKILL_HEADERS = {}  # "# Heading" line -> module file name, filled from the runtime-skill folder
_lock = threading.Lock()


def load_skill_headers(root: Path) -> None:
    for path in sorted(root.glob("*.md")):
        first = path.read_text(encoding="utf-8").splitlines()[0].strip() if path.stat().st_size else ""
        if first.startswith("# "):
            SKILL_HEADERS[first] = path.name


def _text_of(messages) -> str:
    out = []
    for m in messages or []:
        content = m.get("content")
        if isinstance(content, str):
            out.append(content)
        elif isinstance(content, list):
            out.extend(part.get("text", "") for part in content if isinstance(part, dict))
    return "\n".join(out)


def _images_of(messages) -> list[bytes]:
    found = []
    for m in messages or []:
        content = m.get("content")
        if isinstance(content, list):
            for part in content:
                url = ((part or {}).get("image_url") or {}).get("url", "") if isinstance(part, dict) else ""
                if url.startswith("data:") and "," in url:
                    found.append(base64.b64decode(url.split(",", 1)[1]))
    return found


def _stage(system: str, messages) -> str:
    if _images_of(messages):
        return "ocr"
    if system.startswith("You are LabClear's LLM conversation planner"):
        return "planner"
    if system.startswith("You are LabClear, a conversational"):
        return "writer"
    if system.startswith(("Verify this draft", "You independently verify a LabClear draft")):
        return "reviewer"
    if system.startswith("Read the laboratory report"):
        return "rows"
    if system.startswith("Analyze only the supplied evidence"):
        return "analyzer"
    return "other_llm"


# ------------------------------------------------------------------ OCR stand-in and row parser

def tesseract(image: bytes) -> str:
    if OCR_ENGINE != "tesseract":
        return ""
    done = subprocess.run(["tesseract", "-", "-", "--psm", "6", "-l", "eng"], input=image,
                          capture_output=True, timeout=120, check=False)
    return done.stdout.decode("utf-8", "replace")


QUALITATIVE = ("Not calculated", "Not detected", "Not established", "Negative", "Positive", "Trace", "Normal",
               "Increased", "Decreased", "Few", "Moderate", "Many", "Adequate", "Normocytic", "Normochromic",
               "Microcytic", "Hypochromic", "Reactive", "Non-reactive")
_VALUE = r"(?:[<>]=?\s*)?[-+]?\d+(?:[.,]\d+)?\+?|" + "|".join(re.escape(q) for q in QUALITATIVE)
_ROW = re.compile(rf"^(?P<name>[A-Za-z][A-Za-z0-9 ()/,.'+\-]*?)\s+(?P<value>{_VALUE})(?=\s|$)(?P<rest>.*)$")
_RANGE = re.compile(r"(?:[<>]=?|≤|≥)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?")
_FLAGS = {"H", "L", "HH", "LL", "N", "*", "-", "—"}


def parse_rows(text: str) -> list[dict]:
    """Generic whitespace-table parser for the stand-in OCR text. Rows only after a 'Result' header."""
    rows, started = [], False
    for raw in text.splitlines():
        line = raw.strip().lstrip("+-•*·").strip()
        if not line:
            continue
        if not started:
            started = bool(re.search(r"\bResults?\b", line))
            continue
        if re.match(r"(REPORTED BY|APPROVED BY|PRINTED|Page \d)", line, re.I):
            break
        m = _ROW.match(line)
        if not m or len(re.sub(r"[^A-Za-z]", "", m["name"])) < 2:
            continue
        tokens = m["rest"].split()
        flag = unit = ""
        if tokens and tokens[0] in _FLAGS:
            flag = tokens.pop(0)
        if tokens and not re.match(r"^[<>≤≥]?\d", tokens[0]) and tokens[0] not in _FLAGS and tokens[0] not in QUALITATIVE:
            unit = tokens.pop(0)
        if tokens and tokens[0] in _FLAGS and not flag:
            flag = tokens.pop(0)
        rest = " ".join(tokens)
        found = _RANGE.search(rest)
        if found:
            reference = found.group(0)
        else:
            words = rest.split()
            reference = " ".join(words[:2]) if words[:1] == ["Not"] else " ".join(words[:1])
        rows.append({"name": m["name"].strip(), "value": m["value"].strip(), "unit": unit,
                     "reference": reference.strip(), "printed_flag": "" if flag in {"-", "—"} else flag})
    return rows[:60]


# ------------------------------------------------------------------ LLM stand-ins

def _planner(messages) -> dict:
    from services import answer_checks
    data = json.loads(messages[-1]["content"])
    message = data.get("message", "")
    packages = (((data.get("business") or {}).get("catalog") or {}).get("packages") or [])
    named = [p["id"] for p in packages if p.get("active", True) and p["name"].casefold() in message.casefold()]
    return {"action": "answer", "query": " ".join(answer_checks.medical_terms(message))[:700], "language": "Thai",
            "package_ids": named[:5], "dot": "explainer" if (data.get("report") or {}).get("available") else "",
            "reason": "OFFLINE planner stand-in (not a language model)"}


def _sentence(text: str, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    cut = re.split(r"(?<=[.!?。])\s", text, maxsplit=1)[0]
    return (cut[:limit] + "…") if len(cut) > limit else cut


def _payload(messages) -> dict:
    """The writer payload is the last JSON user message; a rewrite request appends plain text after it."""
    for m in reversed(messages):
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            try:
                data = json.loads(m["content"])
            except ValueError:
                continue
            if isinstance(data, dict) and "EVIDENCE" in data:
                return data
    return {}


def _writer(messages) -> dict:
    payload = _payload(messages)
    evidence = payload.get("EVIDENCE") or []
    report = payload.get("REPORT") or {}
    medical = [e for e in evidence if e.get("data_class") in ("public_reference", "public_education")]
    lines = ["คำตอบทดสอบแบบคัดลอกจากหลักฐาน (OFFLINE test double ไม่ใช่โมเดลภาษา):"]
    observations = []
    if report.get("fields"):
        cite = f" [{medical[0]['id']}]" if medical else ""
        for f in report["fields"][:12]:
            lines.append(f"- {f.get('name')}: {f.get('value')} {f.get('unit', '')} "
                         f"(ช่วงที่พิมพ์บนใบรายงาน {f.get('reference') or 'ไม่ระบุ'}){cite}")
            observations.append({"field_id": f["id"], "value": f.get("value", ""), "unit": f.get("unit", ""),
                                 "reference": f.get("reference", ""), "status": f.get("status", "unknown")})
    for e in medical[:3]:
        # With a report, never quote another source's numbers next to the customer's rows
        # (the answer rules forbid replacing printed ranges); cite the topic only.
        excerpt = "" if report.get("fields") else ": " + _sentence(e.get("content", ""))
        lines.append(f"- {e.get('title')}{excerpt} [{e['id']}]")
    named = set((payload.get("decision") or {}).get("package_ids") or [])
    for e in evidence:
        if e.get("data_class") != "synthetic_business":
            continue
        if re.fullmatch(r"rs-p\d+", e["id"]):
            try:
                p = json.loads(e["content"])
            except ValueError:
                continue
            extra = (" ตรวจ: " + ", ".join(p.get("services", []))) if p.get("id") in named else ""
            lines.append(f"- {p.get('name')} {p.get('price_thb'):,} บาท [{e['id']}]{extra}")
        elif e["id"] == "rs-branches":
            try:
                for b in json.loads(e["content"]).get("branches", []):
                    lines.append(f"- {b.get('name')}: {b.get('hours')} [rs-branches]")
            except ValueError:
                pass
        elif e["id"] == "rs-policy":
            try:
                for key, value in json.loads(e["content"]).items():
                    if key.endswith("_policy") or key == "onsite_service":
                        lines.append(f"- {key}: {value} [rs-policy]")
            except ValueError:
                pass
    for e in evidence:
        # Official hospital pages (HOSPITAL_LINKS_ENABLED): a dated published price, never a booking.
        if e.get("data_class") != "official_external":
            continue
        try:
            o = json.loads(e["content"])
        except ValueError:
            continue
        price = o.get("advertised_price_thb")
        shown = f"ราคาที่เผยแพร่ {price:,} บาท" if price else "ไม่ระบุราคาปัจจุบัน"
        lines.append(f"- {o.get('hospital')} · {o.get('variant')}: {shown} (ตรวจข้อมูลเมื่อ {o.get('checked_at')}) [{e['id']}]")
    reply = "\n".join(lines)[:6000]
    return {"reply": reply, "evidence_ids": [], "observations": observations, "followups": []}


def _analyzer(messages) -> dict:
    packet = json.loads(messages[-1]["content"])
    sources = [s["source_id"] for s in packet.get("sources", [])]
    rows = [o["row_id"] for o in packet.get("observations", [])]
    claims = [{"claim_id": "c1", "claim_text": "OFFLINE analyzer double claim", "supporting_source_ids": sources[:1],
               "observation_ids": rows, "uncertainty": "test double", "applicability": "test double"}] if sources else []
    return {"observations": packet.get("observations", []), "claims": claims, "missing_context": [],
            "clarification_needed": False, "permitted_next_steps": []}


# ------------------------------------------------------------------ transport

class Recorder:
    def __init__(self, path: Path | None, policy: dict | None = None):
        self.path, self.seq = path, 0
        self.allow = {(e["host"], e["path"], e["model"]) for e in (policy or {}).get("endpoints", [])}

    def write(self, row: dict) -> None:
        if not self.path:
            return
        with _lock:
            self.seq += 1
            row = {"seq": self.seq, "ts": time.time(), **row}
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def _usage(prompt: str, completion: str) -> dict:
    return {"prompt_tokens": math.ceil(len(prompt.encode()) / 3), "completion_tokens": math.ceil(len(completion.encode()) / 3)}


class Handler:
    """Async MockTransport handler. The work runs in a worker thread so a slow stand-in (Tesseract)
    does not block the event loop and the streamed step events keep their real timing."""

    def __init__(self, sync):
        self.sync, self.record_to = sync, None

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        import asyncio
        import logging
        await request.aread()
        try:
            return await asyncio.to_thread(self.sync, request)
        except Exception:
            # A double failure must be visible as such, not as a provider outage.
            logging.getLogger("labclear.benchmark").exception("test_double_failed")
            raise


def make_handler(recorder: Recorder, replay=None) -> Handler:
    """Return the MockTransport handler. ``replay`` (ReplayQueue) serves recorded responses instead."""

    def handler(request: httpx.Request) -> httpx.Response:
        url = urlsplit(str(request.url))
        try:
            body = json.loads(request.content or b"{}")
        except ValueError:
            body = {}
        model = str(body.get("model") or ("openthai-systemone" if "systemone" in url.path else ""))
        tuple_ = (url.hostname or "", url.path, model)
        row = {"host": url.hostname, "path": url.path, "model": model, "policy_match": tuple_ in recorder.allow}
        if "systemone" in url.path:
            questions = (body.get("questions") or {})
            labels = sum(len((q or {}).get("criteria") or {}) for q in questions.values()) or 1
            row.update(stage="guard", direction=(body.get("state") or {}).get("direction"), questions=len(questions),
                       conservative_decisions=len(questions) * labels, prompt_chars=len(json.dumps(body, ensure_ascii=False)))
            result = replay.next("guard") if replay else {"answers": {"safety": {"choice": "safe"}}}
            row["double"] = "REPLAY" if replay else "GUARD_ALLOW_ALL"
            recorder.write(row)
            if replay is None and wrapper.record_to:
                wrapper.record_to.add("guard", result)
            return httpx.Response(200, json=result)
        if not url.path.endswith("/chat/completions"):
            row.update(stage="unexpected_endpoint")
            recorder.write(row)
            return httpx.Response(404, json={"error": "unknown endpoint in OFFLINE double"})
        messages = body.get("messages") or []
        system = next((m.get("content", "") for m in messages if m.get("role") == "system" and isinstance(m.get("content"), str)), "")
        stage = _stage(system, messages)
        prompt = _text_of(messages)
        row.update(stage=stage, prompt_chars=len(prompt), system_chars=len(system),
                   skill_modules=[name for header, name in SKILL_HEADERS.items() if header in system])
        if stage == "writer":
            try:
                payload = _payload(messages)
                row["evidence"] = [{"id": e.get("id"), "data_class": e.get("data_class"), "content": e.get("content", "")}
                                   for e in payload.get("EVIDENCE") or []]
                row["role"] = (payload.get("ROLE") or {}).get("id")
                row["has_report"] = bool(payload.get("REPORT"))
                row["validated_analysis"] = "VALIDATED_ANALYSIS" in payload
            except (ValueError, KeyError, TypeError):
                row["evidence"] = []
        if replay:
            content = replay.next(stage)
            row["double"] = "REPLAY"
        elif stage == "ocr":
            started = time.perf_counter()
            content = tesseract(_images_of(messages)[0])
            row.update(double="OCR_STAND_IN_" + OCR_ENGINE.upper(), ocr_ms=round((time.perf_counter() - started) * 1000))
        elif stage == "planner":
            content, row["double"] = json.dumps(_planner(messages), ensure_ascii=False), "PLANNER_STAND_IN"
        elif stage == "writer":
            content, row["double"] = json.dumps(_writer(messages), ensure_ascii=False), "EXTRACTIVE_WRITER"
        elif stage == "reviewer":
            content, row["double"] = json.dumps({"supported": True, "values_preserved": True, "within_scope": True}), "REVIEW_APPROVE_ALL"
        elif stage == "rows":
            transcription = json.loads(messages[-1]["content"]).get("untrusted_transcription", "")
            rows = parse_rows(transcription)
            content = json.dumps({"document_type": "laboratory_report" if rows else "other", "fields": rows, "warnings": []}, ensure_ascii=False)
            row["double"] = "ROW_PARSER_STAND_IN"
        elif stage == "analyzer":
            content, row["double"] = json.dumps(_analyzer(messages), ensure_ascii=False), "ANALYZER_COPY"
        else:
            content, row["double"] = "safe", "OTHER_SAFE"
        if getattr(wrapper, 'prompt_trace', None):
            safe_messages=[]
            for message in messages:
                clean=dict(message)
                if isinstance(clean.get('content'),list):
                    clean['content']=[({'type':'image','omitted':'Synthetic image bytes; see fixture SHA-256'} if p.get('type')=='image_url' else p) for p in clean['content']]
                safe_messages.append(clean)
            with wrapper.prompt_trace.open('a',encoding='utf-8') as out:
                out.write(json.dumps({'stage':stage,'model':model,'mode':'OFFLINE_DOUBLE','messages':safe_messages,'output':content},ensure_ascii=False)+'\n')
        row["completion_chars"] = len(content)
        recorder.write(row)
        if replay is None and wrapper.record_to:
            wrapper.record_to.add(stage, content)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
                                         "usage": _usage(prompt, content), "model": model})

    wrapper = Handler(handler)
    return wrapper


class ReplayQueue:
    """Serve recorded provider responses in their recorded order, per stage. A stage mismatch stops the
    run (REPLAY_MISMATCH) instead of improvising an answer."""

    def __init__(self, path: Path):
        self.items = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.index = 0

    def next(self, stage: str):
        with _lock:
            if self.index >= len(self.items):
                raise RuntimeError("REPLAY_EXHAUSTED")
            item = self.items[self.index]
            if item["stage"] != stage:
                raise RuntimeError(f"REPLAY_MISMATCH expected {item['stage']} got {stage}")
            self.index += 1
            return item["content"]


class ReplayWriter:
    def __init__(self, path: Path):
        self.path = path

    def add(self, stage: str, content) -> None:
        with _lock, self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"stage": stage, "content": content}, ensure_ascii=False) + "\n")
