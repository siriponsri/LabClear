"""Manager-only knowledge browser with same-origin PDF and page previews."""
from io import BytesIO
from threading import Lock

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import Field

from routers.ai_admin import _manager
from services import business_store as db, evidence_search, knowledge_admin as knowledge
from services.conversation_transport import ConversationError
from services.harness_config import Strict

router = APIRouter(prefix='/api/business/staff/knowledge')
PDF_LOCK = Lock()  # PDFium is not thread safe.


def authorized(request):
    with db.transaction() as tx:
        return _manager(tx, request)


@router.get('')
def index(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
        overrides = knowledge.state(tx)
    return {'version': 'knowledge-148-v1', 'records': [{
        **{k:r.get(k) for k in ('id','title','publisher','url','data_class','content','content_sha256','reviewed_at','verification_status','owner_approved_at')},
        'approval':r.get('rag_approval', 'LEGACY_REVIEWED'), 'enabled':overrides.get(r['id'],{}).get('enabled',True),
        'document_kind':'publisher_document' if r.get('source_file') else 'labclear_summary',
        'document_url':f'/api/business/staff/knowledge/{r["id"]}/document.pdf'
    } for r in evidence_search.corpus()]}


class Publication(Strict):
    enabled: bool
    reason: str = Field(min_length=3, max_length=300)


@router.put('/{source_id}')
def publish(source_id: str, request: Request, body: Publication):
    with db.transaction() as tx:
        user = _manager(tx, request)
        knowledge.record(source_id)
        state = knowledge.state(tx)
        state[source_id] = body.model_dump()
        tx.put('configuration_knowledge', 'configuration', 'system', state)
        tx.audit(user['id'], 'knowledge.enabled' if body.enabled else 'knowledge.paused', source_id)
    return {'id':source_id, **body.model_dump()}


@router.get('/{source_id}/document.pdf')
def document(source_id: str, request: Request):
    authorized(request)
    with PDF_LOCK:
        raw, _ = knowledge.document_bytes(knowledge.record(source_id))
    return Response(raw, media_type='application/pdf', headers={'Cache-Control':'private, no-store', 'Content-Disposition':f'inline; filename="{source_id}.pdf"'})


@router.get('/{source_id}/pages/{page}')
def page_image(source_id: str, page: int, request: Request):
    authorized(request)
    if page < 1 or page > 1000:
        raise ConversationError('page_invalid','Page not found.',404)
    import pypdfium2 as pdfium
    with PDF_LOCK:
        raw, kind = knowledge.document_bytes(knowledge.record(source_id))
        with pdfium.PdfDocument(raw) as doc:
            if page > len(doc):
                raise ConversationError('page_invalid','Page not found.',404)
            count = len(doc)
            pdf_page = doc[page-1]
            try:
                bitmap = pdf_page.render(scale=1.5)
                image = bitmap.to_pil()
                buf = BytesIO(); image.save(buf,format='PNG'); image.close(); bitmap.close()
            finally:
                pdf_page.close()
    return Response(buf.getvalue(),media_type='image/png',headers={'Cache-Control':'private, no-store','X-Page-Count':str(count),'X-Document-Kind':kind})
