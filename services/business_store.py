"""Encrypted durable business state. SQLite locally; PostgreSQL on hosted runtimes.

A single database mutex serializes the small-pilot state transitions across processes.
Provider requests MUST run outside this transaction. No health data is logged.
"""
from __future__ import annotations
import hashlib, json, os, secrets, sqlite3, time
from contextlib import contextmanager
from pathlib import Path
from cryptography.fernet import Fernet
from services.conversation_transport import ConversationError
from services import guest_memory as gm

ROOT=Path(__file__).resolve().parents[1]

def cloud():
    return bool(os.getenv('RENDER') or os.getenv('VERCEL') or os.getenv('APP_ENV')=='production')

def cipher():
    key=os.getenv('BUSINESS_DATA_KEY','')
    if not key:
        if cloud(): raise ConversationError('storage_setup','Configure BUSINESS_DATA_KEY and DATABASE_URL before using accounts.')
        path=Path(os.getenv('BUSINESS_KEY_PATH',str(ROOT/'data/business.key')))
        path.parent.mkdir(parents=True,exist_ok=True)
        try:
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as f:f.write(Fernet.generate_key())
        except FileExistsError:pass
        key=path.read_text().strip()
    try:return Fernet(key.encode())
    except Exception:raise ConversationError('storage_setup','BUSINESS_DATA_KEY must be a valid Fernet key.') from None

class Tx:
    def __init__(self,c,pg):
        self.c,self.pg=c,pg;self.crypto=cipher();self.temporary={};self.revoked=set()
    def sql(self,q,args=()):return self.c.execute(q.replace('?', '%s') if self.pg else q,args)
    def get(self,id):
        row=self.temporary.get(id) if id in self.temporary else gm.ROWS.get(id)
        if id in self.temporary or row:
            return gm.copy(row) if row and row['owner'] not in self.revoked and gm.active(row['owner']) else None
        r=self.sql('SELECT * FROM rs_entities WHERE id=?',(id,)).fetchone()
        if not r:return None
        d=dict(r)
        d['data']=json.loads(self.crypto.decrypt(d['payload'].encode()))
        del d['payload']
        return d
    def find(self,kind,owner=None,state=None):
        if owner and owner.startswith('guest_'):
            rows={**gm.ROWS,**self.temporary}
            return [gm.copy(r) for r in rows.values() if r and r['owner']==owner and r['kind']==kind and (state is None or r['state']==state) and owner not in self.revoked and gm.active(owner)]
        q='SELECT id FROM rs_entities WHERE kind=?';a=[kind]
        if owner is not None:q+=' AND owner=?';a.append(owner)
        if state is not None:q+=' AND state=?';a.append(state)
        return [self.get(r['id']) for r in self.sql(q+' ORDER BY created',a).fetchall()]
    def put(self,id,kind,owner,data,state='',branch=''):
        if owner.startswith('guest_'):
            if owner in self.revoked or not gm.active(owner):
                raise ConversationError('login_required','Temporary chat expired. Reload to start a new one.',401)
            old=self.get(id)
            self.temporary[id]={'id':id,'kind':kind,'owner':owner,'data':gm.copy(data),'state':state,'branch':branch,'created':old['created'] if old else time.time()}
            gm.check_capacity(self.temporary)
            return self.get(id)
        raw=self.crypto.encrypt(json.dumps(data,ensure_ascii=False).encode()).decode()
        self.sql('INSERT INTO rs_entities(id,kind,owner,state,branch,payload,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,state=excluded.state,branch=excluded.branch,payload=excluded.payload',(id,kind,owner,state,branch,raw,time.time()))
        return self.get(id)
    def delete(self,id):
        if id in self.temporary or id in gm.ROWS:self.temporary[id]=None
        else:self.sql('DELETE FROM rs_entities WHERE id=?',(id,))
    def forget_guest(self,owner):
        if owner.startswith('guest_'):self.revoked.add(owner)
    def touch_guest(self,owner):
        if owner.startswith('guest_') and gm.active(owner):gm.OWNERS[owner]=time.time()+gm.TTL
    def commit_guest(self):
        for owner in self.revoked:gm.revoke(owner)
        for key,row in self.temporary.items():
            if row and row['owner'] not in self.revoked and gm.active(row['owner']):gm.ROWS[key]=row
            else:gm.ROWS.pop(key,None)
    def own(self,id,owner,kind=None):
        r=self.get(id)
        if not r or r['owner']!=owner or (kind and r['kind']!=kind):raise ConversationError('not_found','This record is unavailable.',404)
        return r
    def audit(self,actor,action,object_id):
        self.put('audit_'+secrets.token_hex(12),'audit',actor,{'action':action,'object_id':object_id})

_PURGED=set()

def _purge_legacy_guests(tx):
    # Old website guests were durable customer_* rows. Preserve every signed-in
    # account and channel identity. Remove guest attachments/history and notices.
    marker='migration_guest_privacy_302'
    if tx.get(marker):return
    guests=[u for u in tx.find('user') if u['id'].startswith('customer_') and not u['data'].get('password') and not u['data'].get('line_verified') and not tx.find('line_identity',u['id'])]
    removed=set()
    for u in guests:
        ids=[r['id'] for r in tx.sql('SELECT id FROM rs_entities WHERE owner=?',(u['id'],)).fetchall()]
        removed.update(ids)
        tx.sql('DELETE FROM rs_entities WHERE owner=?',(u['id'],))
    if removed:
        for kind in ('notification','audit'):
            for row in tx.find(kind):
                if row['data'].get('object_id') in removed or row['data'].get('ref') in removed:tx.delete(row['id'])
    tx.put(marker,'migration','system',{'legacy_guests_removed':len(guests),'at':time.time()})

@contextmanager
def transaction():
    url=os.getenv('DATABASE_URL','')
    pg=bool(url)
    if pg:
        if not url.startswith(('postgres://','postgresql://')):raise ConversationError('storage_setup','DATABASE_URL must use PostgreSQL.')
        try:
            import psycopg
            from psycopg.rows import dict_row
            c=psycopg.connect(url,connect_timeout=10,row_factory=dict_row)
        except Exception:raise ConversationError('storage_unavailable','The business database is unavailable.') from None
    else:
        if cloud():raise ConversationError('storage_setup','Hosted business features require a durable PostgreSQL DATABASE_URL.')
        p=Path(os.getenv('BUSINESS_DB_PATH',str(ROOT/'data/business.sqlite3')));p.parent.mkdir(parents=True,exist_ok=True)
        c=sqlite3.connect(p,timeout=20);c.row_factory=sqlite3.Row
    try:
        c.execute('CREATE TABLE IF NOT EXISTS rs_mutex(id INTEGER PRIMARY KEY)')
        c.execute('INSERT INTO rs_mutex(id) VALUES(1) ON CONFLICT(id) DO NOTHING')
        c.execute('CREATE TABLE IF NOT EXISTS rs_entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner TEXT NOT NULL,state TEXT NOT NULL,branch TEXT NOT NULL,payload TEXT NOT NULL,created DOUBLE PRECISION NOT NULL)')
        c.execute('CREATE INDEX IF NOT EXISTS rs_kind_owner ON rs_entities(kind,owner)')
        c.commit()
        if pg:c.execute('SELECT id FROM rs_mutex WHERE id=1 FOR UPDATE')
        else:c.execute('BEGIN IMMEDIATE')
        with gm.LOCK:
            gm.prune()
            tx=Tx(c,pg)
            identity=url or str(p)
            if identity not in _PURGED:_purge_legacy_guests(tx)
            yield tx
            c.commit()
            tx.commit_guest()
            _PURGED.add(identity)
    except Exception:
        c.rollback();raise
    finally:c.close()

def derived_secret(purpose:str)->bytes:
    """Purpose-bound secret derived from the stable data key (never the key itself)."""
    import hmac
    key=os.getenv('BUSINESS_DATA_KEY','')
    if not key:
        cipher()  # creates/validates the local key file or raises the hosted setup error
        key=Path(os.getenv('BUSINESS_KEY_PATH',str(ROOT/'data/business.key'))).read_text().strip()
    return hmac.new(key.encode(),('labclear:'+purpose).encode(),hashlib.sha256).digest()

def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def password_hash(value,salt=None):
    salt=salt or secrets.token_hex(16)
    return salt+':'+hashlib.pbkdf2_hmac('sha256',value.encode(),bytes.fromhex(salt),310000).hex()
def verify_password(value,stored):
    import hmac
    try:return hmac.compare_digest(password_hash(value,stored.split(':')[0]),stored)
    except Exception:return False

def configuration(name,tx=None):
    seed=json.loads((ROOT/'business_data'/f'{name}.json').read_text())
    if tx is not None:
        row=tx.get('configuration_'+name)
        return row['data'] if row else seed
    if cloud() and not os.getenv('DATABASE_URL'):return seed
    with transaction() as active:return configuration(name,active)
def catalog(tx=None):return configuration('catalog',tx)
def branches(tx=None):return configuration('branches',tx)
def policies(tx=None):return configuration('policies',tx)

def quote(ids,tx=None):
    if not ids or len(ids)>5 or len(set(ids))!=len(ids):raise ConversationError('package_invalid','Choose one to five distinct packages.',422)
    index={p['id']:p for p in catalog(tx)['packages'] if p.get('active',True)}
    if any(i not in index for i in ids):raise ConversationError('package_invalid','A package is unavailable.',422)
    selected=[index[i] for i in ids]
    if any(p['segment']=='organization' for p in selected):raise ConversationError('staff_quote','Organization packages require a staff quotation.',409)
    return {'package_ids':ids,'items':[{'id':p['id'],'name':p['name'],'price_thb':p['price_thb'],'price_unit':p['price_unit']} for p in selected], 'total_thb':sum(p['price_thb'] for p in selected),'currency':'THB','catalog_version':catalog(tx)['version'],'is_demo':True,'staff_review_required':any(p['staff_review_required'] for p in selected)}

def user_public(row):
    d=row['data'];return {'id':row['id'],'email':d.get('email',''),'role':d.get('role','customer'),'branch':d.get('branch',''),'registered':bool(d.get('password')),'verified_email':bool(d.get('google_sub')),'demo':bool(d.get('demo'))}
