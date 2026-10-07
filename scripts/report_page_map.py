"""Map actual PDF headings/captions to cached Word contents page numbers."""
import argparse,json,re,unicodedata
from pathlib import Path
import fitz
from docx import Document

def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFC',s)).replace('\u200b','')
ap=argparse.ArgumentParser();ap.add_argument('docx');ap.add_argument('pdf');ap.add_argument('out');a=ap.parse_args()
d=Document(a.docx);pdf=fitz.open(a.pdf)
texts=[norm(p.get_text()) for p in pdf]
# Body begins with the standalone executive summary heading, after the front matter.
start=next(i for i,p in enumerate(pdf) if 'บทสรุป' in p.get_text() and 'โครงงานนี้พัฒนา' in norm(p.get_text()))
keys=[]
for p in d.paragraphs:
 if p.style and (p.style.name.startswith('Heading') or p.style.name=='Caption') and p.text.strip():
  keys.append(p.text.strip())
out={};missing=[]
for key in keys:
 matches=[i for i in range(start,len(pdf)) if norm(key) in texts[i]]
 if matches:out[key]=matches[0]-start+1
 else:missing.append(key)
if missing:raise SystemExit('Unmapped headings/captions: '+repr(missing))
Path(a.out).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print(f'{len(out)} entries; body starts on physical page {start+1}')
