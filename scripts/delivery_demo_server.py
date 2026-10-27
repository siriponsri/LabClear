"""Isolated local demo server, explicit doubles and no external connections."""
import os,sys,socket,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];state=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012/demo-state';state.mkdir(exist_ok=True)
os.environ.update(PROVIDER_NETWORK_ENABLED='false',DEMO_ACCOUNTS='false',LLM_API_KEY='',GUARD_API_KEY='',VISION_API_KEY='',DATABASE_URL='',BUSINESS_DATA_KEY='',BUSINESS_DB_PATH=str(state/'business.sqlite3'),BUSINESS_KEY_PATH=str(state/'business.key'))
old=socket.socket.connect
def local(sock,address):
 if isinstance(address,tuple) and address[0] in ['127.0.0.1','::1']:return old(sock,address)
 raise RuntimeError('OFFLINE_DEMO_EXTERNAL_NETWORK_FORBIDDEN')
socket.socket.connect=local
sys.path.insert(0,str(ROOT));spec=importlib.util.spec_from_file_location('offline_fixture',ROOT/'tests/browser/fixture_server.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
import uvicorn
uvicorn.run(module.app,host='127.0.0.1',port=8109,log_level='error')
