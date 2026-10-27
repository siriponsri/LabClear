"""Read-only upstream audit; downloads declarative docs/licenses, never scripts."""
import json,urllib.request,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'docs/evidence/current/report-skill-review-20261012'
root.mkdir(parents=True,exist_ok=True)
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'LabClear-owner-authorized-source-review'})
 with urllib.request.urlopen(req,timeout=30) as r:return r.read()
for repo,skill in [('cathrynlavery/diagram-design','skills/diagram-design/'),('chakrit/kien-thai','skills/kien-thai/')]:
 sha=json.loads(fetch('https://api.github.com/repos/'+repo+'/commits/main'))['sha']
 tree=json.loads(fetch('https://api.github.com/repos/'+repo+'/git/trees/'+sha+'?recursive=1'))['tree']
 target=root/repo.split('/')[1];target.mkdir(exist_ok=True)
 files=[];executables=[]
 for entry in tree:
  path=entry['path']
  if entry['type']!='blob':continue
  if path.startswith(skill) and (path.endswith('.py') or path.endswith('.js') or path.endswith('.mjs') or path.endswith('.sh')):executables.append(path)
  if path in {'LICENSE','README.md','PRIVACY.md','SECURITY.md','package.json','pyproject.toml'} or path.startswith(skill) and path.endswith('.md'):
   raw=fetch('https://raw.githubusercontent.com/'+repo+'/'+sha+'/'+path)
   out=target/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(raw)
   files.append({'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
 manifest={'repo':repo,'commit':sha,'downloaded_declarative_files':files,'upstream_executable_paths_not_downloaded_or_run':executables,
           'actions':'Public HTTP read only; no repository scripts, npm hooks, installer, provider settings or auth changes'}
 (target/'SOURCE_REVIEW.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print(repo,sha,'review files',len(files),'unexecuted script paths',len(executables),flush=True)
