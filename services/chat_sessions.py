"""Chats and projects for the customer workspace, like the chat list in Claude or ChatGPT.

The assistant always works on one *active* chat, stored as ``conversation_<owner>``; staff
hand-off, retries and actions all use it. Other chats are kept as ``archive_<chat_id>`` and
swapped in when the customer opens them. Projects only group chats; they add nothing to what
the model sees.
"""
from __future__ import annotations

import secrets
import time

from services.conversation_transport import ConversationError

MAX_PROJECTS = 30


def new_chat_data(project_id: str = "", version: int = 0) -> dict:
    return {"messages": [], "report_id": "", "mode": "bot", "version": version,
            "chat_id": "chat_" + secrets.token_hex(8), "title": "", "project_id": project_id, "updated": time.time()}


def conversation(tx, owner: str) -> dict:
    row = tx.get("conversation_" + owner)
    if not row:
        return tx.put("conversation_" + owner, "conversation", owner, new_chat_data())
    if not row["data"].get("chat_id"):
        row["data"]["chat_id"] = "chat_" + secrets.token_hex(8)
        row = tx.put(row["id"], "conversation", owner, row["data"])
    return row


def title_from(text: str) -> str:
    return " ".join((text or "").split())[:60]


def _archives(tx, owner: str) -> list[dict]:
    rows = tx.find("archive", owner)
    for row in rows:
        if not row["data"].get("chat_id"):  # chats saved before chat lists existed
            row["data"]["chat_id"] = "chat_" + row["id"].removeprefix("archive_")[:16]
    return rows


def find_archive(tx, owner: str, chat_id: str) -> dict | None:
    return next((r for r in _archives(tx, owner) if r["data"]["chat_id"] == chat_id), None)


def _summary(data: dict, created: float, active: bool) -> dict:
    messages = data.get("messages", [])
    first = next((m for m in messages if m["role"] == "user" and m.get("content")), None)
    uploads = any(m.get("attachments") for m in messages)
    title = data.get("title") or (title_from(first["content"]) if first else ("Lab report" if uploads else "New chat"))
    updated = data.get("updated") or (messages[-1]["at"] if messages else created)
    return {"id": data["chat_id"], "title": title, "project_id": data.get("project_id", ""), "updated": updated,
            "messages": len(messages), "active": active}


def listing(tx, owner: str) -> dict:
    current = conversation(tx, owner)
    chats = [_summary(r["data"], r["created"], False) for r in _archives(tx, owner)]
    if current["data"]["messages"]:  # an empty new chat is listed once it has a message
        chats.append(_summary(current["data"], current["created"], True))
    chats.sort(key=lambda c: c["updated"], reverse=True)
    projects = [{"id": p["id"], "name": p["data"]["name"], "created": p["created"]} for p in tx.find("project", owner)]
    return {"active": current["data"]["chat_id"], "active_project": current["data"].get("project_id", ""),
            "chats": chats, "projects": projects}


def _idle(current: dict) -> None:
    if current["data"]["mode"] != "bot":
        raise ConversationError("staff_active", "Finish the conversation with our team before switching chats.", 409)
    if current["data"].get("busy_until", 0) > time.time():
        raise ConversationError("busy", "Wait for the current reply before switching chats.", 409)


def _stash(tx, owner: str, current: dict) -> None:
    if current["data"]["messages"]:
        tx.put("archive_" + current["data"]["chat_id"], "archive", owner, current["data"])


def check_project(tx, owner: str, project_id: str) -> str:
    if project_id:
        tx.own(project_id, owner, "project")
    return project_id


def new_chat(tx, owner: str, project_id: str = "") -> dict:
    current = conversation(tx, owner)
    _idle(current)
    check_project(tx, owner, project_id)
    if not current["data"]["messages"]:
        current["data"]["project_id"] = project_id
        current["data"]["updated"] = time.time()
        return tx.put(current["id"], "conversation", owner, current["data"])
    _stash(tx, owner, current)
    return tx.put(current["id"], "conversation", owner, new_chat_data(project_id, current["data"]["version"] + 1))


def open_chat(tx, owner: str, chat_id: str) -> dict:
    current = conversation(tx, owner)
    if current["data"]["chat_id"] == chat_id:
        return current
    _idle(current)
    row = find_archive(tx, owner, chat_id)
    if not row:
        raise ConversationError("not_found", "This chat is unavailable.", 404)
    data = row["data"]
    _stash(tx, owner, current)
    tx.delete(row["id"])
    # A report removed or never confirmed since then must not come back into context.
    for key in ("report_id", "compare_report_id"):
        rid = data.get(key)
        rep = tx.get(rid) if rid else None
        if rid and (not rep or rep["owner"] != owner or not rep["data"].get("confirmed")):
            data[key] = ""
    data.update(mode="bot", busy_until=0, version=current["data"]["version"] + 1, updated=time.time())
    data.pop("turn_id", None)
    return tx.put(current["id"], "conversation", owner, data)


def update_chat(tx, owner: str, chat_id: str, title: str | None, project_id: str | None) -> None:
    current = conversation(tx, owner)
    row = current if current["data"]["chat_id"] == chat_id else find_archive(tx, owner, chat_id)
    if not row:
        raise ConversationError("not_found", "This chat is unavailable.", 404)
    if title is not None:
        row["data"]["title"] = title_from(title)
    if project_id is not None:
        row["data"]["project_id"] = check_project(tx, owner, project_id)
    tx.put(row["id"], row["kind"], owner, row["data"], row["state"], row["branch"])


def delete_chat(tx, owner: str, chat_id: str) -> None:
    current = conversation(tx, owner)
    if current["data"]["chat_id"] == chat_id:
        _idle(current)
        tx.put(current["id"], "conversation", owner, new_chat_data(current["data"].get("project_id", ""), current["data"]["version"] + 1))
        return
    row = find_archive(tx, owner, chat_id)
    if not row:
        raise ConversationError("not_found", "This chat is unavailable.", 404)
    tx.delete(row["id"])


def create_project(tx, owner: str, name: str) -> dict:
    if len(tx.find("project", owner)) >= MAX_PROJECTS:
        raise ConversationError("project_limit", f"You can keep up to {MAX_PROJECTS} projects.", 409)
    row = tx.put("project_" + secrets.token_hex(8), "project", owner, {"name": " ".join(name.split())[:60]})
    return {"id": row["id"], "name": row["data"]["name"], "created": row["created"]}


def rename_project(tx, owner: str, project_id: str, name: str) -> None:
    row = tx.own(project_id, owner, "project")
    row["data"]["name"] = " ".join(name.split())[:60]
    tx.put(row["id"], "project", owner, row["data"])


def delete_project(tx, owner: str, project_id: str) -> None:
    """Chats in the project are kept and move back to the main list."""
    tx.own(project_id, owner, "project")
    current = conversation(tx, owner)
    for row in [current, *_archives(tx, owner)]:
        if row["data"].get("project_id") == project_id:
            row["data"]["project_id"] = ""
            tx.put(row["id"], row["kind"], owner, row["data"], row["state"], row["branch"])
    tx.delete(project_id)


def use_report(data: dict, report_id: str) -> None:
    """Remember every report a chat has used, so deleting it later clears that chat."""
    if report_id and report_id not in data.setdefault("used_reports", []):
        data["used_reports"].append(report_id)


def mentions_report(data: dict, report_id: str) -> bool:
    if report_id in (data.get("report_id"), data.get("compare_report_id"), *data.get("used_reports", [])):
        return True
    return any(m.get("report_id") == report_id or any(a.get("report_id") == report_id for a in m.get("attachments", []))
               for m in data.get("messages", []))


def forget_report(tx, owner: str, report_id: str) -> int:
    """Clear every chat that used a deleted report so its values cannot come back."""
    cleared = 0
    current = conversation(tx, owner)
    if mentions_report(current["data"], report_id):
        data = current["data"]
        for key in ("report_id", "compare_report_id"):
            if data.get(key) == report_id:
                data[key] = ""
        data["used_reports"] = [r for r in data.get("used_reports", []) if r != report_id]
        data["messages"] = []
        data["version"] += 1
        tx.put(current["id"], "conversation", owner, data)
        cleared += 1
    for row in _archives(tx, owner):
        if mentions_report(row["data"], report_id):
            tx.delete(row["id"])
            cleared += 1
    return cleared
