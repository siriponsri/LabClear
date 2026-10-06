"""Two-sided Llama Guard boundary, adapted from chacharin/llama-guard-layer.

No verdict, malformed categories, timeouts and model failures all fail closed.
The guard checks safety, not truth. Evidence validation is a separate layer.
"""
from __future__ import annotations
import re
from typing import Literal

from config import settings
from services import conversation_transport as transport
from services.conversation_transport import ConversationError

_INJECTION = re.compile(r"ignore\s+(all\s+)?(previous|system)\s+(instructions|prompts)|reveal\s+(the\s+)?system\s+prompt|ลืมคำสั่ง|ละเลยคำสั่ง", re.I)


def parse_verdict(raw: str) -> tuple[bool, list[str]]:
    clean = raw.strip()
    if clean.lower() == "safe":
        return True, []
    match = re.fullmatch(r"unsafe\s+((?:S(?:[1-9]|1[0-4]))(?:\s*,\s*S(?:[1-9]|1[0-4]))*)", clean, re.I)
    if not match:
        raise ConversationError("guard_invalid", "The safety model could not verify this response. Please try again.", 502)
    return False, re.findall(r"S\d+", match.group(1).upper())


async def check(message: str, direction: Literal["input", "output"], user_message: str = "") -> None:
    if direction == "input" and _INJECTION.search(message):
        raise ConversationError("safety_blocked", "I can help with laboratory questions, but cannot override my safety instructions.", 422)
    if settings.GUARD_SERVICE_URL:
        headers = {"Content-Type": "application/json"}
        if settings.GUARD_SERVICE_TOKEN:
            headers["Authorization"] = f"Bearer {settings.GUARD_SERVICE_TOKEN}"
        data = await transport.post_json(settings.GUARD_SERVICE_URL.rstrip("/") + "/check", headers,
            {"message": message, "direction": direction}, "guard", settings.GUARD_TIMEOUT_SECONDS)
        if (data.get("direction") != direction or data.get("result") not in {"safe", "unsafe"}
                or not isinstance(data.get("categories"), list)):
            raise ConversationError("guard_invalid", "The safety service returned an invalid result.", 502)
        safe = data["result"] == "safe" and not data["categories"]
    else:
        # Match the teacher's role-sensitive contract; include user context when
        # classifying the assistant instead of relabelling it as a user message.
        messages = [{"role": "user", "content": message}] if direction == "input" else [
            {"role": "user", "content": user_message or "Explain laboratory information for education only."},
            {"role": "assistant", "content": message}]
        raw = await transport.complete(messages, slot="guard", max_tokens=100)
        safe, _ = parse_verdict(raw)
    if not safe:
        raise ConversationError("safety_blocked", "I cannot safely answer that request. Ask about the report's tests, wording or reference ranges, without requesting a diagnosis or treatment.", 422)
