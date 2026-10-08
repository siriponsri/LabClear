from datetime import date
import json

import pytest

from services.hospital_links import ROOT, catalog, present, safe_url


def row():
    return json.loads((ROOT / 'business_data/hospital_links.json').read_text(encoding='utf-8'))['offers'][0]


def test_exact_variant_price_and_freshness():
    offer = present(row(), date(2026, 10, 8))
    assert offer['price_thb'] == 7500 and offer['current_offer']
    assert offer['branch'].startswith('สุขุมวิท')
    assert not offer['booking_confirmed'] and not offer['partnership_verified']
    stale = present(row(), date(2026, 10, 9))
    assert stale['state'] == 'STALE' and stale['price_thb'] is None
    unknown = catalog(date(2026, 10, 8))[1]
    assert unknown['price_thb'] is None and not unknown['current_offer']


def test_sale_expiry_cannot_use_service_date_to_appear_current():
    expired = {**row(), 'sale_until': '2026-03-31', 'service_until': '2026-10-31'}
    offer = present(expired, date(2026, 10, 8))
    assert offer['state'] == 'EXPIRED_SALE' and not offer['current_offer'] and offer['price_thb'] is None


@pytest.mark.parametrize('url', ['https://www.samitivejhospitals.com/?patient=x', 'https://www.samitivejhospitals.com/#token', 'https://evil.invalid', 'http://127.0.0.1', 'https://www.samitivejhospitals.com.evil.invalid', 'https://u:p@www.samitivejhospitals.com'])
def test_outbound_url_never_carries_phi_or_unapproved_host(url):
    with pytest.raises(ValueError):
        safe_url(url)
