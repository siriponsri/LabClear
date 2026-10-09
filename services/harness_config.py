"""Versioned, manager-owned runtime configuration. Permissions remain code-owned.

One snapshot is taken per turn. No database lock spans a provider request. Edits
are encrypted and audited, with optimistic revision checks and reversible history.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from config import settings
from services import business_store as db
from services.conversation_transport import ConversationError

ID = "configuration_harness"
LOCKED = {"core.md", "evidence-citation.md", "scope-uncertainty.md"}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SkillSetting(Strict):
    enabled: bool = True
    # Supplements the checked-in instruction. It can never remove the base policy.
    guidance: str = Field(default="", max_length=4000)


class ToolSetting(Strict):
    enabled: bool = True
    timeout_seconds: float = Field(default=2, ge=.1, le=10)
    max_items: int = Field(default=8, ge=1, le=40)


class HarnessInput(Strict):
    revision: int = Field(ge=0)
    skills_enabled: bool = True
    retrieval_limit: int = Field(default=6, ge=1, le=8)
    writer_max_tokens: int = Field(default=2400, ge=500, le=4000)
    skills: dict[str, SkillSetting] = Field(default_factory=dict, max_length=12)
    tools: dict[str, ToolSetting] = Field(default_factory=dict, max_length=12)


def defaults():
    return {"revision": 0, "skills_enabled": settings.RUNTIME_SKILLS_ENABLED,
            "retrieval_limit": 6, "writer_max_tokens": 2400, "skills": {}, "tools": {}}


def load(tx=None):
    if tx is None:
        if db.cloud() and not __import__('os').getenv('DATABASE_URL'):
            return defaults()
        with db.transaction() as active:
            return load(active)
    row = tx.get(ID)
    return {**defaults(), **(row['data'] if row else {})}


def digest(config):
    return hashlib.sha256(json.dumps(config, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def save(tx, actor, value: HarnessInput):
    from services import agent_tools, runtime_skills
    current = load(tx)
    if current['revision'] != value.revision:
        raise ConversationError('revision_conflict', 'Settings changed in another tab. Reload before saving.', 409)
    meta = runtime_skills._manifest()['module_meta']
    if set(value.skills) - set(meta) or set(value.tools) - set(agent_tools.TOOLS):
        raise ConversationError('harness_invalid', 'Choose a registered skill or typed tool.', 422)
    for name, item in value.skills.items():
        if name in LOCKED and not item.enabled:
            raise ConversationError('harness_boundary', 'Core evidence and scope policies stay enabled.', 422)
    for name, item in value.tools.items():
        tool = agent_tools.TOOLS[name]
        if item.timeout_seconds > tool.timeout_seconds or item.max_items > tool.max_items:
            raise ConversationError('harness_boundary', 'Tool limits cannot exceed their registered ceiling.', 422)
    data = value.model_dump()
    data.update(revision=current['revision'] + 1, updated_at=datetime.now(timezone.utc).isoformat())
    tx.put(f'harness_revision_{current["revision"]}', 'harness_revision', 'system', current)
    tx.put(ID, 'configuration', 'system', data)
    tx.audit(actor, 'harness.saved', f'revision:{data["revision"]}')
    return data


def public_view(tx):
    from services import agent_tools, runtime_skills
    config = load(tx)
    manifest = runtime_skills._manifest()
    return {"config": config, "sha256": digest(config), "policy": "labclear-harness-1.1",
            "locked_skills": sorted(LOCKED),
            "skills": [{"file": name, **meta, "instructions": runtime_skills._read(name, manifest),
                        "sha256": manifest['modules'][name]} for name, meta in manifest['module_meta'].items()],
            "tools": agent_tools.describe(),
            "revisions": sorted([r['data']['revision'] for r in tx.find('harness_revision')], reverse=True)[:20]}
