"""Integration 4.0 rc3: the no-code Company Harness and the Knowledge library in Admin.

Synthetic, offline data only. The manager may tune runtime skills and typed tools, but only inside
code-owned limits: the core, citation and scope modules stay on, a tool can never exceed its
registered timeout or item ceiling, and every save is a new audited revision that can be restored.
The knowledge library serves publisher PDFs (integrity-checked) or clearly labelled LabClear
summary PDFs, and a paused record is no longer searched.
"""
from __future__ import annotations

import pytest

from services import evidence_search, runtime_skills
from tests.test_business_v3 import client, isolated, promote  # noqa: F401

H = '/api/business/staff/harness'
K = '/api/business/staff/knowledge'


def manager():
    c = client()
    promote(c)
    return c


def test_harness_is_manager_only(isolated):  # noqa: F811
    assert client().get(H).status_code == 403
    assert client(register=False).get(H).status_code in (401, 403)


def test_harness_view_lists_registered_skills_and_tools(isolated):  # noqa: F811
    data = manager().get(H).json()
    assert data['config']['revision'] == 0 and len(data['sha256']) == 64
    assert data['locked_skills'] == ['core.md', 'evidence-citation.md', 'scope-uncertainty.md']
    files = {s['file'] for s in data['skills']}
    assert set(data['locked_skills']) <= files and all(s['instructions'] for s in data['skills'])
    assert {'lookup_packages', 'retrieve_evidence', 'get_external_hospital_offer'} <= {t['name'] for t in data['tools']}


def test_harness_saves_revisions_within_limits_and_restores(isolated):  # noqa: F811
    c = manager()
    body = {'revision': 0, 'skills_enabled': True, 'retrieval_limit': 4, 'writer_max_tokens': 1800,
            'skills': {'thai-style.md': {'enabled': True, 'guidance': 'ใช้ภาษาสุภาพ กระชับ'}},
            'tools': {'lookup_policies': {'enabled': True, 'timeout_seconds': 1, 'max_items': 1}}}
    saved = c.put(H, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()['config']['revision'] == 1 and saved.json()['config']['retrieval_limit'] == 4
    # A second tab still holding revision 0 cannot overwrite revision 1.
    assert c.put(H, json=body).status_code == 409
    for bad in ({'skills': {'core.md': {'enabled': False}}},                       # locked safety module
                {'skills': {'not-a-skill.md': {'enabled': True}}},                  # unregistered skill
                {'tools': {'lookup_policies': {'timeout_seconds': 9}}},             # above the 2 s ceiling
                {'tools': {'retrieve_evidence': {'max_items': 40}}},                # above the 8-item ceiling
                {'tools': {'delete_everything': {'enabled': True}}},                # unregistered tool
                {'retrieval_limit': 50}, {'unexpected': True}):
        assert c.put(H, json={**body, 'revision': 1, **bad}).status_code == 422, bad
    restored = c.post(H + '/restore', json={'revision': 1, 'target_revision': 0})
    assert restored.status_code == 200
    config = restored.json()['config']
    assert config['revision'] == 2 and config['retrieval_limit'] == 6 and config['skills'] == {}
    assert restored.json()['revisions'][:2] == [1, 0]


def test_disabled_skill_is_skipped_but_core_policy_is_not():
    role = {'id': 'advisor', 'actions': ['answer', 'quote'], 'reads': ['catalog', 'medical']}
    config = {'skills': {'core.md': {'enabled': False}, 'thai-style.md': {'enabled': False},
                         'evidence-citation.md': {'guidance': 'Name the publisher once.'}}}
    chosen = runtime_skills.select(role, 'answer', False, {'public_reference'}, ['retrieve_evidence'], config=config)
    ids = [m['id'] for m in chosen['modules']]
    # The administrator's switch removes an optional module; it cannot remove the core policy.
    assert 'core' in ids and 'thai-style' not in ids and chosen['skipped']['thai-style.md'] == 'disabled by administrator'
    assert 'thai-style' in [m['id'] for m in runtime_skills.select(role, 'answer', False, {'public_reference'}, ['retrieve_evidence'])['modules']]
    # Company guidance is appended under the reviewed text, never instead of it.
    assert 'Name the publisher once.' in chosen['instructions']
    assert chosen['instructions'].index('Name the publisher once.') > chosen['instructions'].index('subordinate to the application policy') - 200
    assert next(m for m in chosen['modules'] if m['id'] == 'evidence-citation')['customized'] is True


def test_knowledge_library_is_manager_only_and_lists_every_record(isolated):  # noqa: F811
    assert client().get(K).status_code == 403
    data = manager().get(K).json()
    assert data['version'] == 'knowledge-148-v1' and len(data['records']) == 148
    kinds = {r['document_kind'] for r in data['records']}
    assert kinds == {'publisher_document', 'labclear_summary'}
    approved = [r for r in data['records'] if r['approval'] == 'OWNER_APPROVED']
    assert len(approved) == 90 and all(r['verification_status'] == 'OFFLINE_AUTHORED_NOT_FETCHED' for r in approved)


@pytest.mark.parametrize('kind', ['publisher_document', 'labclear_summary'])
def test_knowledge_pdf_and_page_preview(isolated, kind):  # noqa: F811
    c = manager()
    row = next(r for r in c.get(K).json()['records'] if r['document_kind'] == kind)
    pdf = c.get(row['document_url'])
    assert pdf.status_code == 200 and pdf.headers['content-type'] == 'application/pdf' and pdf.content[:5] == b'%PDF-'
    assert 'no-store' in pdf.headers['cache-control']
    page = c.get(f"{K}/{row['id']}/pages/1")
    assert page.status_code == 200 and page.headers['content-type'] == 'image/png' and page.content[:4] == b'\x89PNG'
    assert int(page.headers['x-page-count']) >= 1 and page.headers['x-document-kind'] == kind
    assert c.get(f"{K}/{row['id']}/pages/999").status_code == 404
    assert c.get(f'{K}/not-a-record/document.pdf').status_code == 404


def test_paused_record_is_not_searched_and_the_change_is_audited(isolated):  # noqa: F811
    c = manager()
    query = 'USPSTF colorectal cancer screening FIT'
    target = evidence_search.lexical(query, limit=1)[0]['id']
    assert c.put(f'{K}/{target}', json={'enabled': False}).status_code == 422          # a reason is required
    assert c.put(f'{K}/{target}', json={'enabled': False, 'reason': 'Source check pending'}).status_code == 200
    assert target not in {r['id'] for r in evidence_search.lexical(query, limit=8)}
    assert next(r for r in c.get(K).json()['records'] if r['id'] == target)['enabled'] is False
    assert c.put(f'{K}/{target}', json={'enabled': True, 'reason': 'Reviewed'}).status_code == 200
    assert target in {r['id'] for r in evidence_search.lexical(query, limit=8)}
