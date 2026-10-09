from typing import Literal

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import Field

from config import settings
from routers.business import Strict, session_row
from routers.ai_admin import _manager
from services import business_store as db, organization_sources as sources
from services.conversation_transport import ConversationError

router = APIRouter(prefix='/api/business/organization-documents')


def enabled():
    if not settings.ORG_DOCUMENTS_ENABLED:
        raise ConversationError('feature_disabled', 'Organization references are disabled.', 404)


class Membership(Strict):
    user_id: str = Field(min_length=1, max_length=100)
    organization_id: str = Field(pattern=r'^org_[a-z0-9_-]{1,60}$')
    role: Literal['reader', 'editor']


@router.put('/membership')
def membership(body: Membership, request: Request):
    enabled()
    with db.transaction() as tx:
        actor = _manager(tx, request)
        user = tx.get(body.user_id)
        if not user or user['kind'] != 'user' or user['id'].startswith('guest_'):
            raise ConversationError('not_found', 'Registered account required.', 404)
        user['data'].update(organization_id=body.organization_id, organization_role=body.role)
        tx.put(user['id'], 'user', user['owner'], user['data'], user['state'], user['branch'])
        tx.audit(actor['id'], 'organization.membership', user['id'])
    return {'status': 'saved'}


@router.get('')
def listing(request: Request):
    enabled()
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        org = sources.scope(user)
        editor = user['data'].get('organization_role') == 'editor'
        return {'can_edit': editor, 'documents': [{'id': r['id'], 'state': r['state'], **{k: r['data'].get(k) for k in ('title', 'version', 'sha256', 'reviewed_at')}}
                              for r in tx.find('organization_source', org) if r['state'] == 'approved' or editor]}


class Search(Strict):
    q: str = Field(min_length=1, max_length=500)


@router.post('/search')
def search(body: Search, request: Request):
    enabled()
    with db.transaction() as tx:
        user, _ = session_row(tx, request)
        return {'sources': sources.retrieve(tx, user, body.q), 'mode': 'source_excerpts_only'}


@router.post('')
async def upload(request: Request, file: UploadFile = File(...), title: str = Form(..., min_length=1, max_length=160), previous_id: str = Form('')):
    enabled()
    from services import execution
    def allowed(tx):
        user, _ = session_row(tx, request)
        sources.scope(user, write=True)
    await execution.offload(_in_tx, allowed)
    raw = await file.read(sources.MAX_BYTES + 1)
    def store(tx):
        user, _ = session_row(tx, request)
        row = sources.upload(tx, user, file.filename or '', raw, title, previous_id or None)
        return {'id': row['id'], 'state': row['state'], 'preview': row['data']['text'], 'version': row['data']['version']}
    return await execution.offload(_in_tx, store)


def _in_tx(fn):
    with db.transaction() as tx:
        return fn(tx)


@router.get('/{sid}/download')
def download(sid: str, request: Request):
    enabled()
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        row = sources.source(tx, user, sid)
        return Response(row['data']['text'], media_type='text/plain', headers={'Content-Disposition': 'attachment; filename="reference.txt"', 'Cache-Control': 'no-store'})


@router.get('/{sid}')
def preview(sid: str, request: Request):
    enabled()
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        row = sources.source(tx, user, sid, preview=True)
        return {'id': sid, 'state': row['state'], **row['data']}


@router.post('/{sid}/{action}')
def transition(sid: str, action: Literal['approve', 'reject', 'revoke', 'delete'], request: Request):
    enabled()
    with db.transaction() as tx:
        user, _ = session_row(tx, request)
        row = sources.transition(tx, user, sid, action)
        return {'id': sid, 'state': row['state']}
