from datetime import date
import json

import pytest

from services.hospital_links import ROOT, catalog, present, safe_url


def row():
    return json.loads((ROOT / 'business_data/hospital_links.json').read_text(encoding='utf-8'))['offers'][0]


def test_exact_variant_price_and_freshness():
    # 4.0.0-rc3: the offers were re-read on 2026-10-09 and stay current until review_until.
    first = row()
    checked, until = date.fromisoformat(first['checked_at']), date.fromisoformat(first['review_until'])
    offer = present(first, checked)
    assert offer['price_thb'] == 7500 and offer['current_offer']
    assert offer['branch'].startswith('สุขุมวิท')
    assert not offer['booking_confirmed'] and not offer['partnership_verified']
    stale = present(first, date.fromordinal(until.toordinal() + 1))
    assert stale['state'] == 'STALE' and stale['price_thb'] is None
    offers = {o['id']: o for o in catalog(checked)}
    # A programme without a purchase deadline, a page that was not re-read and an ended sale never show a price.
    assert offers['HOSP-004']['state'] == 'UNVERIFIED' and offers['HOSP-004']['price_thb'] is None
    assert offers['HOSP-005']['state'] == 'UNVERIFIED' and not offers['HOSP-005']['current_offer']
    assert offers['HOSP-006']['state'] == 'EXPIRED_SALE' and offers['HOSP-006']['price_thb'] is None
    assert sum(o['current_offer'] for o in offers.values()) == 4


def test_every_offer_link_is_an_allowlisted_official_page():
    for o in catalog(date(2026, 10, 9)):
        assert o['url'].startswith('https://') and not o['booking_confirmed'] and not o['partnership_verified']
        if o.get('detail_url'):
            assert safe_url(o['detail_url']) == o['detail_url']


def test_sale_expiry_cannot_use_service_date_to_appear_current():
    expired = {**row(), 'sale_until': '2026-03-31', 'service_until': '2026-10-31'}
    offer = present(expired, date(2026, 10, 8))
    assert offer['state'] == 'EXPIRED_SALE' and not offer['current_offer'] and offer['price_thb'] is None


@pytest.mark.parametrize('url', ['https://www.samitivejhospitals.com/?patient=x', 'https://www.samitivejhospitals.com/#token', 'https://evil.invalid', 'http://127.0.0.1', 'https://www.samitivejhospitals.com.evil.invalid', 'https://u:p@www.samitivejhospitals.com'])
def test_outbound_url_never_carries_phi_or_unapproved_host(url):
    with pytest.raises(ValueError):
        safe_url(url)
