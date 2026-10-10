"""Chat list and projects for the customer workspace (see services/chat_sessions.py)."""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import Field
from services.response_style import Tone

from routers.business import Strict, session_row
from services import business_store as db
from services import chat_sessions as chats

router = APIRouter(prefix="/api/business")


class NewChat(Strict):
    project_id: str = Field(default="", max_length=40)


class ChatChange(Strict):
    tone: Tone | None = None
    title: str | None = Field(default=None, min_length=1, max_length=80)
    project_id: str | None = Field(default=None, max_length=40)


class ProjectInput(Strict):
    name: str = Field(min_length=1, max_length=60)


def _owner(tx, request: Request, mutation: bool = True) -> str:
    user, _ = session_row(tx, request, mutation)
    return user["id"]


@router.get("/chats")
def list_chats(request: Request):
    with db.transaction() as tx:
        return chats.listing(tx, _owner(tx, request, False))


@router.post("/chats")
def create_chat(body: NewChat, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.new_chat(tx, owner, body.project_id)
        return chats.listing(tx, owner)


@router.post("/chats/{chat_id}/open")
def open_chat(chat_id: str, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.open_chat(tx, owner, chat_id)
        return chats.listing(tx, owner)


@router.patch("/chats/{chat_id}")
def change_chat(chat_id: str, body: ChatChange, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.update_chat(tx, owner, chat_id, body.title, body.project_id, body.tone)
        return chats.listing(tx, owner)


@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.delete_chat(tx, owner, chat_id)
        tx.audit(owner, "chat.deleted", chat_id)
        return chats.listing(tx, owner)


@router.post("/projects")
def create_project(body: ProjectInput, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        project = chats.create_project(tx, owner, body.name)
        return {**chats.listing(tx, owner), "project": project}


@router.patch("/projects/{project_id}")
def rename_project(project_id: str, body: ProjectInput, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.rename_project(tx, owner, project_id, body.name)
        return chats.listing(tx, owner)


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, request: Request):
    with db.transaction() as tx:
        owner = _owner(tx, request)
        chats.delete_project(tx, owner, project_id)
        return chats.listing(tx, owner)
