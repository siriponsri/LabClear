"""One-process Cloudflare entrypoint. Refuse ephemeral storage in hosted mode."""
import asyncio,os,sys
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

def validate_environment():
    from cryptography.fernet import Fernet
    raw=os.getenv('DATABASE_URL','');u=urlsplit(raw)
    if u.scheme not in ('postgres','postgresql') or not u.hostname:
        raise ValueError('Set an external PostgreSQL DATABASE_URL before starting the container.')
    if parse_qs(u.query).get('sslmode',[''])[0] not in ('require','verify-ca','verify-full'):
        raise ValueError('DATABASE_URL must use sslmode=require or stricter for encrypted database traffic.')
    try:Fernet(os.environ['BUSINESS_DATA_KEY'].encode())
    except Exception:raise ValueError('Set the existing BUSINESS_DATA_KEY for this database.') from None
    if os.getenv('WEB_CONCURRENCY','1')!='1':raise ValueError('Guest chat requires one process for this release.')
    if os.getenv('APP_ENV')!='production':raise ValueError('Cloudflare containers must use APP_ENV=production.')

def check_storage():
    from services import business_store as db
    with db.transaction() as tx:
        # Decrypt a pre-existing row: catches mismatched DB/key pairs before traffic.
        row=tx.sql('SELECT id FROM rs_entities LIMIT 1').fetchone()
        if row:tx.get(row['id'])

if __name__=='__main__':
    try:
        validate_environment();check_storage()
    except Exception as exc:
        print('Startup validation failed: '+(str(exc) if isinstance(exc,ValueError) else 'Database connectivity or encryption-key validation failed.'),file=sys.stderr)
        sys.exit(1)
    from scripts.run_business import main
    asyncio.run(main())
