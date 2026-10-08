"""External official offers, never booking/partner APIs or clinical evidence."""
from datetime import date, datetime
import json
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ALLOWED = {'www.samitivejhospitals.com', 'www.bangkokhospital.com'}
ROOT = Path(__file__).resolve().parents[1]


def safe_url(value):
    url = urlsplit(value)
    if url.scheme != 'https' or url.hostname not in ALLOWED or url.port not in (None, 443) or url.username or url.password or url.query or url.fragment:
        raise ValueError('Only reviewed official URLs without personal parameters are permitted')
    return value


def present(row, today=None):
    today = today or datetime.now(ZoneInfo('Asia/Bangkok')).date()
    result = {**row, 'url': safe_url(row['url']), 'mode': 'OFFICIAL_EXTERNAL', 'booking_confirmed': False,
              'partnership_verified': False, 'clinical_recommendation_approved': False}
    state = row['review_status']
    if state == 'REVOKED':
        result.update(state='REVOKED', price_thb=None, current_offer=False)
        return result
    if row.get('sale_until') and date.fromisoformat(row['sale_until']) < today:
        state = 'EXPIRED_SALE'
    elif row.get('service_until') and date.fromisoformat(row['service_until']) < today:
        state = 'EXPIRED_SERVICE'
    elif row.get('sale_from') and date.fromisoformat(row['sale_from']) > today:
        state = 'NOT_YET_ON_SALE'
    elif date.fromisoformat(row['checked_at']) > today or date.fromisoformat(row['review_until']) < today:
        state = 'STALE'
    elif not row.get('sale_until') or row.get('price_thb') is None or not row.get('variant'):
        state = 'UNVERIFIED'
    result.update(state=state, current_offer=state == 'VERIFIED')
    if state != 'VERIFIED':
        result['price_thb'] = None
    return result


def catalog(today=None):
    data = json.loads((ROOT / 'business_data/hospital_links.json').read_text(encoding='utf-8'))
    return [present(row, today) for row in data['offers'] if row['review_status'] != 'REVOKED']
