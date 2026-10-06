"""Provision a coursework staff account locally; no default password is shipped."""
import argparse,getpass,os,sys,secrets
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1]/'.env')
from services import business_store as db
p=argparse.ArgumentParser();p.add_argument('--email',required=True);p.add_argument('--role',choices=['manager','staff','clinical'],default='staff');p.add_argument('--branch',choices=['BKK01','CNX01','KKC01'],default='BKK01');a=p.parse_args()
password=getpass.getpass('New staff password (12+ characters): ')
if len(password)<12:raise SystemExit('Password must contain at least 12 characters.')
with db.transaction() as tx:
    index='email_'+db.digest(a.email.strip().lower())
    if tx.get(index):raise SystemExit('An account already exists. No changes made.')
    id='staff_'+secrets.token_hex(12);tx.put(id,'user',id,{'email':a.email.strip().lower(),'password':db.password_hash(password),'role':a.role,'branch':a.branch});tx.put(index,'email',id,{})
    tx.audit('local_operator','staff.created',id)
print('Staff account created. Sign in through /staff.')
