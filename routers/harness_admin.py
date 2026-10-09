"""No-code harness controls. All mutations use the existing manager/CSRF boundary."""
from fastapi import APIRouter, Request
from pydantic import Field

from routers.ai_admin import _manager
from services import business_store as db, harness_config
from services.conversation_transport import ConversationError

router = APIRouter(prefix='/api/business/staff/harness')


@router.get('')
def view(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
        return harness_config.public_view(tx)


@router.put('')
def update(request: Request, body: harness_config.HarnessInput):
    with db.transaction() as tx:
        user = _manager(tx, request)
        harness_config.save(tx, user['id'], body)
        return harness_config.public_view(tx)


class Restore(harness_config.Strict):
    revision: int = Field(ge=0)
    target_revision: int = Field(ge=0)


@router.post('/restore')
def restore(request: Request, body: Restore):
    with db.transaction() as tx:
        user = _manager(tx, request)
        row = tx.get(f'harness_revision_{body.target_revision}')
        if not row:
            raise ConversationError('not_found', 'Revision not found.', 404)
        data = {k: v for k, v in row['data'].items() if k in harness_config.HarnessInput.model_fields}
        data['revision'] = body.revision
        harness_config.save(tx, user['id'], harness_config.HarnessInput(**data))
        return harness_config.public_view(tx)
