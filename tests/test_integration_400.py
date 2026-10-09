"""Integration 4.0: additive API for the Next.js website and the optional trusted web origin.

Synthetic, offline data only. These tests also pin that the Codex defaults are unchanged:
no trusted origin unless configured, every new page flag off, active corpus still 58 records.
"""
import pytest
from fastapi.testclient import TestClient

from config import settings
from main import app
from tests.test_business_v3 import client, isolated, promote  # noqa: F401

SITE = '/api/business/site'


def test_public_site_api_reads_the_reviewed_corpus_and_catalog():
    c = TestClient(app)
    common = c.get(SITE + '/common').json()
    assert common['sources'] == {'count': 148, 'publishers': 29, 'publisher_types': {
        'international_reference': 41, 'thai_hospital': 62, 'international_agency': 27, 'thai_professional_society': 13, 'thai_government': 5}}
    assert common['catalog']['packages'] and common['branches'] and common['plans']
    assert common['features'] == {'org_documents': False, 'org_reference_inference': False, 'hospital_links': False, 'landing_preview': False}
    home = c.get(SITE + '/home').json()
    assert home['source_count'] == 148 and home['featured']['id'] == 'P02'
    sources = c.get(SITE + '/sources').json()
    assert len(sources['records']) == 148
    assert {r['publisher_type'] for r in sources['records']} == {
        'thai_hospital', 'international_reference', 'international_agency', 'thai_professional_society', 'thai_government'}
    assert c.get(SITE + '/packages/P02').json()['package']['id'] == 'P02'
    assert c.get(SITE + '/compare', params={'ids': 'P01,P02'}).json()['comparison']
    assert c.get(SITE + '/compare', params={'ids': 'P01'}).json()['comparison'] is None


def test_public_site_api_never_creates_a_session_or_returns_personal_data():
    c = TestClient(app)
    r = c.get(SITE + '/common')
    assert 'set-cookie' not in r.headers
    body = r.text
    for secret in ('api_key', 'password', 'BUSINESS_DATA_KEY', 'csrf'):
        assert secret not in body


def test_hospital_links_follow_the_codex_flag(monkeypatch):
    c = TestClient(app)
    assert c.get(SITE + '/hospital-links').status_code == 404
    monkeypatch.setattr(settings, 'HOSPITAL_LINKS_ENABLED', True)
    data = c.get(SITE + '/hospital-links').json()
    import json
    with open('business_data/hospital_links.json', encoding='utf-8') as f:
        recorded = json.load(f)['offers']
    assert data['affiliation'] == 'NO_PARTNERSHIP_VERIFIED' and len(data['offers']) == len(recorded) >= 2
    for offer in data['offers']:
        assert not offer['booking_confirmed'] and not offer['partnership_verified']
        assert offer['url'].startswith('https://')
        if not offer['current_offer']:
            assert offer['price_thb'] is None
    assert c.get(SITE + '/features').json()['hospital_links'] is True


def test_web_origin_is_rejected_unless_listed_exactly(monkeypatch):
    c = client(False)
    body = {'guest_token': c.headers['X-LabClear-Guest'], 'csrf': c.headers['X-Business-CSRF']}
    web = 'https://labclear-web.example.invalid'
    assert c.post('/api/business/guest/close', json=body, headers={'Origin': web}).status_code == 403
    for near_miss in ('https://labclear-web.example.invalid.evil.invalid', 'http://labclear-web.example.invalid',
                      'https://evil.invalid', 'https://labclear-web.example.invalid:8443'):
        monkeypatch.setattr(settings, 'TRUSTED_ORIGINS', web)
        assert c.post('/api/business/guest/close', json=body, headers={'Origin': near_miss}).status_code == 403
    monkeypatch.setattr(settings, 'TRUSTED_ORIGINS', 'https://evil.invalid, ' + web + '/')
    assert c.post('/api/business/guest/close', json=body, headers={'Origin': web}).status_code == 200
    # A cross-site fetch is still refused even from a listed origin.
    assert c.post('/api/business/guest/close', json=body, headers={'Origin': web, 'Sec-Fetch-Site': 'cross-site'}).status_code == 403


@pytest.mark.parametrize('value', ['https://*.onrender.com', 'https://user:pw@web.invalid', 'https://web.invalid/path', 'ftp://web.invalid', ''])
def test_malformed_trusted_origin_entries_match_nothing(monkeypatch, value):
    from services import trusted_origins
    monkeypatch.setattr(settings, 'TRUSTED_ORIGINS', value)
    assert trusted_origins.configured() == set()
    assert not trusted_origins.allowed('https://web.invalid')


def _request(origin):
    from starlette.requests import Request
    scope = {'type': 'http', 'method': 'POST', 'path': '/api/business/chat', 'scheme': 'https', 'server': ('api.example.invalid', 443),
             'headers': [(b'host', b'api.example.invalid'), (b'origin', origin.encode())], 'client': ('203.0.113.9', 1), 'query_string': b''}
    return Request(scope)


def test_ai_request_check_accepts_only_the_listed_web_origin(monkeypatch):
    from routers import samples
    from services.conversation_transport import ConversationError
    from services.request_limits import request_rate_limiter
    monkeypatch.setattr(request_rate_limiter, 'allow', lambda request: True)
    web = 'https://labclear-web.example.invalid'
    samples.authorize(_request('https://api.example.invalid'))
    with pytest.raises(ConversationError):
        samples.authorize(_request(web))
    monkeypatch.setattr(settings, 'TRUSTED_ORIGINS', web)
    samples.authorize(_request(web))
    with pytest.raises(ConversationError):
        samples.authorize(_request('https://evil.invalid'))


def test_membership_reports_only_the_callers_own_role(monkeypatch):
    anonymous = TestClient(app)
    assert anonymous.get(SITE + '/membership').json() == {'enabled': False, 'member': False, 'role': ''}
    monkeypatch.setattr(settings, 'ORG_DOCUMENTS_ENABLED', True)
    assert anonymous.get(SITE + '/membership').json() == {'enabled': True, 'member': False, 'role': ''}
    guest = client(False)
    assert guest.get(SITE + '/membership').json()['member'] is False
    admin = client(email='manager@synthetic.invalid')
    promote(admin)
    member, other = client(email='member@synthetic.invalid'), client(email='other@synthetic.invalid')
    uid = member.get('/api/business/session').json()['user']['id']
    assert admin.put('/api/business/organization-documents/membership', json={'user_id': uid, 'organization_id': 'org_a', 'role': 'editor'}).status_code == 200
    body = member.get(SITE + '/membership').json()
    assert body == {'enabled': True, 'member': True, 'role': 'editor'} and 'org_a' not in str(body)
    assert other.get(SITE + '/membership').json()['member'] is False


def test_owner_approved_summaries_are_searched_and_labelled_as_pending_source_check():
    """2026-10-09: the owner approved the 90 offline-authored summaries for retrieval. They are
    searched like the 58 reviewed records but stay labelled: owner approval is not a source check."""
    import json
    from pathlib import Path
    from services import evidence_search
    root = Path(__file__).resolve().parents[1]
    active = json.loads((root / 'knowledge/evidence/catalog.json').read_text(encoding='utf-8'))['records']
    queue = json.loads((root / 'knowledge/acquisition/claude_candidates_400.json').read_text(encoding='utf-8'))
    assert queue['candidate_count'] == len(queue['entries']) == 90 and queue['baseline_record_count'] == 58
    approved = {r['id']: r for r in active if r.get('rag_approval') == 'OWNER_APPROVED'}
    assert len(active) == 148 and set(approved) == {e['id'] for e in queue['entries']}
    for r in approved.values():
        assert r['verification_status'] == 'OFFLINE_AUTHORED_NOT_FETCHED' and r['verification']['url_checked'] is False
        assert r['current_review_status'] == 'OWNER_APPROVED_SOURCE_CHECK_PENDING' and r['url'].startswith('https://')
    # A topic that exists only among the approved summaries (USPSTF colorectal screening) is now found.
    found = {r['id'] for r in evidence_search.lexical('USPSTF colorectal cancer screening FIT', limit=8)}
    assert found & set(approved)