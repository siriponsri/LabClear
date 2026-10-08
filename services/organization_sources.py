"""Organization reference lifecycle in the existing encrypted store; no new schema.

Membership is provisioned by an authenticated manager, never taken from an upload.
Only UTF-8 text/Markdown is supported. Retrieval returns excerpts, not medical advice.
"""
import hashlib
from pathlib import PurePosixPath
import secrets
import time

from config import settings
from services.conversation_transport import ConversationError
from services.evidence_search import tokens

MAX_BYTES = 256 * 1024


def scope(user, write=False):
    if not settings.ORG_DOCUMENTS_ENABLED:
        raise ConversationError('feature_disabled', 'Organization references are disabled.', 404)
    organization = user['data'].get('organization_id')
    if user['id'].startswith('guest_') or not organization:
        raise ConversationError('forbidden', 'Organization membership is required.', 403)
    if write and user['data'].get('organization_role') != 'editor':
        raise ConversationError('forbidden', 'Organization editor access is required.', 403)
    return organization


def source(tx, user, sid, preview=False):
    org = scope(user)
    row = tx.get(sid)
    if not row or row['kind'] != 'organization_source' or row['owner'] != org:
        raise ConversationError('not_found', 'Source unavailable.', 404)
    if row['state'] != 'approved' and not (preview and user['data'].get('organization_role') == 'editor' and row['state'] in {'draft', 'rejected'}):
        raise ConversationError('not_found', 'Source unavailable.', 404)
    return row


def upload(tx, user, filename, raw, title, previous_id=None):
    org = scope(user, write=True)
    if not raw or len(raw) > MAX_BYTES:
        raise ConversationError('file_size', 'Use a non-empty file of at most 256 KiB.', 422)
    if '\\' in filename or PurePosixPath(filename).name != filename or PurePosixPath(filename).suffix.lower() not in {'.txt', '.md'}:
        raise ConversationError('file_type', 'Use UTF-8 TXT or Markdown. PDF, DOCX and OCR are not supported here.', 422)
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeError:
        raise ConversationError('file_encoding', 'Save this document as UTF-8 text.', 422) from None
    if not text.strip() or any(ord(c) < 32 and c not in '\n\r\t' for c in text):
        raise ConversationError('file_content', 'The file is not plain text.', 422)
    digest = hashlib.sha256(raw).hexdigest()
    rows = tx.find('organization_source', org)
    if len(rows) >= 100:
        raise ConversationError('source_limit', 'Organization source limit reached.', 409)
    if any(r['data'].get('sha256') == digest and r['state'] != 'deleted' for r in rows):
        raise ConversationError('duplicate_source', 'This file already exists in your organization.', 409)
    previous = source(tx, user, previous_id) if previous_id else None
    sid = 'orgsrc_' + secrets.token_hex(12)
    data = {'title': title, 'filename': filename, 'text': text, 'sha256': digest,
            'version': previous['data']['version'] + 1 if previous else 1,
            'family': previous['data']['family'] if previous else sid,
            'previous_id': previous_id, 'uploaded_by': user['id'], 'uploaded_at': time.time(),
            'scope': 'organization_private', 'source_type': 'organization_reference',
            'reviewed_by': None, 'reviewed_at': None, 'synthetic_only': True}
    row = tx.put(sid, 'organization_source', org, data, 'draft')
    tx.audit(user['id'], 'organization_source.uploaded', sid)
    return row


def transition(tx, user, sid, action):
    org = scope(user, write=True)
    row = tx.get(sid)
    if not row or row['kind'] != 'organization_source' or row['owner'] != org or row['state'] == 'deleted':
        raise ConversationError('not_found', 'Source unavailable.', 404)
    allowed = {'approve': {'draft'}, 'reject': {'draft'}, 'revoke': {'approved'},
               'delete': {'draft', 'rejected', 'revoked', 'approved'}}
    if action not in allowed or row['state'] not in allowed[action]:
        raise ConversationError('source_state', 'This source cannot make that transition.', 409)
    data = row['data']
    if action == 'approve':
        # Prevent competing draft versions from superseding a newer revision.
        active = [r for r in tx.find('organization_source', org, 'approved') if r['data']['family'] == data['family']]
        if data['previous_id'] and (len(active) != 1 or active[0]['id'] != data['previous_id']):
            raise ConversationError('version_conflict', 'The approved version changed. Upload against the current version.', 409)
        for old in active:
            tx.put(old['id'], old['kind'], org, old['data'], 'revoked')
        data.update(reviewed_by=user['id'], reviewed_at=time.time())
    if action == 'delete':
        data.pop('text', None)
        data.pop('filename', None)
    state = {'approve': 'approved', 'reject': 'rejected', 'revoke': 'revoked', 'delete': 'deleted'}[action]
    row = tx.put(sid, row['kind'], org, data, state)
    tx.audit(user['id'], 'organization_source.' + action, sid)
    return row


def retrieve(tx, user, query):
    org = scope(user)
    words = set(tokens(query))
    found = []
    # No shared cache: revocation/membership changes take effect on the next read.
    for row in tx.find('organization_source', org, 'approved'):
        for number, line in enumerate(row['data']['text'].splitlines(), 1):
            score = len(words.intersection(tokens(line)))
            if score:
                found.append((score, {'id': row['id'], 'version': row['data']['version'],
                    'title': row['data']['title'], 'section': f'line {number}', 'content': line[:2000],
                    'sha256': row['data']['sha256'], 'data_class': 'organization_private',
                    'url': '/api/business/organization-documents/' + row['id'] + '/download'}))
    return [r for _, r in sorted(found, key=lambda x: -x[0])[:6]]
