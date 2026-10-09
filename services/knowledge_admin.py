"""Knowledge publication overlay and read-only PDF artifacts. No remote fetches."""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from services import business_store as db
from services.conversation_transport import ConversationError

ROOT = Path(__file__).resolve().parents[1]


def state(tx=None):
    if tx is None:
        if db.cloud() and not __import__('os').getenv('DATABASE_URL'):
            return {}
        with db.transaction() as active:
            return state(active)
    row = tx.get('configuration_knowledge')
    return row['data'] if row else {}


def active_records(records):
    disabled = {key for key, value in state().items() if not value.get('enabled', True)}
    return [r for r in records if r['id'] not in disabled]


def record(source_id):
    from services.evidence_search import corpus
    item = next((r for r in corpus() if r['id'] == source_id), None)
    if not item:
        raise ConversationError('not_found', 'Knowledge record not found.', 404)
    return item


def document_bytes(row):
    if row.get('source_file'):
        path = (ROOT / row['source_file']).resolve()
        if not path.is_relative_to((ROOT/'knowledge/medical_sources/raw').resolve()) or path.suffix != '.pdf':
            raise ConversationError('source_invalid', 'The source path is unavailable.', 422)
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != row.get('source_sha256'):
            raise ConversationError('source_invalid', 'Source integrity check failed.', 409)
        return raw, 'publisher_document'
    # The PDF is explicitly a LabClear brief. It never impersonates the linked publisher.
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    if 'LabClearThai' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('LabClearThai', str(ROOT/'static/fonts/IBMPlexSansThai-Regular.ttf')))
    out = BytesIO()
    doc = SimpleDocTemplate(out, pagesize=(595.28, 841.89), leftMargin=48, rightMargin=48, topMargin=44, bottomMargin=44)
    body = ParagraphStyle('Body', fontName='LabClearThai', fontSize=11, leading=18, spaceAfter=12, wordWrap='CJK')
    heading = ParagraphStyle('Title', parent=body, fontSize=22, leading=29, textColor=HexColor('#26232c'))
    caption = ParagraphStyle('Caption', parent=body, fontSize=9, leading=14, textColor=HexColor('#625d69'))
    parts = [Paragraph('LABCLEAR / KNOWLEDGE BRIEF', caption), Paragraph(escape(row['title']), heading),
             Paragraph('Application summary. This is not the publisher\'s original PDF.', caption), Spacer(1,12),
             Paragraph(escape(row['content']), body), Spacer(1,18)]
    for label, value in [('Record', row['id']), ('Publisher', row.get('publisher')), ('Original source', row['url']),
                         ('Approval', row.get('rag_approval', 'LEGACY_REVIEWED')), ('Source check', row.get('verification_status', 'LEGACY_REVIEWED')),
                         ('Owner approved', row.get('owner_approved_at', 'Not separately recorded')),
                         ('Content SHA-256', row['content_sha256'])]:
        parts.append(Paragraph(escape(label+': '+str(value)), caption))
    parts.append(Paragraph('General information only. Reference intervals on the confirmed laboratory report take precedence. Owner approval does not establish clinical validation.', caption))
    doc.build(parts)
    return out.getvalue(), 'labclear_summary'
