"""Copy the retained report example; optionally activate automatic caption numbering."""
import argparse
from pathlib import Path
from apply_toc_format import apply_parts
from apply_text_layout import apply_parts as apply_text_layout
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def create(output,number_captions=False):
 source=Path(__file__).resolve().parents[1]/'assets/reference.docx'
 target=Path(output).expanduser().resolve()
 if target.exists():raise FileExistsError(f'Output already exists: {target}')
 target.parent.mkdir(parents=True,exist_ok=True)
 with ZipFile(source) as z:parts={n:z.read(n) for n in z.namelist()}
 apply_parts(parts)
 apply_text_layout(parts)
 root=E.fromstring(parts['word/document.xml']);stack=[];changed=0
 for node in root.iter():
  if node.tag==W+'fldChar':
   kind=node.get(W+'fldCharType')
   if kind=='begin':stack.append([node,''])
   elif kind=='separate' and stack:
    start,code=stack[-1]
    if number_captions and code.strip().startswith('SEQ '):
     start.attrib.pop(W+'fldLock',None);start.set(W+'dirty','true');changed+=1
   elif kind=='end' and stack:stack.pop()
  elif node.tag==W+'instrText' and stack:stack[-1][1]+=node.text or ''
 parts['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
 settings=E.fromstring(parts['word/settings.xml']);uf=settings.find(W+'updateFields')
 if uf is None:uf=E.SubElement(settings,W+'updateFields')
 uf.set(W+'val','true');parts['word/settings.xml']=E.tostring(settings,xml_declaration=True,encoding='UTF-8',standalone=True)
 with ZipFile(target,'x',ZIP_DEFLATED) as z:
  for n,data in parts.items():z.writestr(n,data)
 return changed
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',required=True);parser.add_argument('--number-captions',action='store_true');args=parser.parse_args()
 count=create(args.output,args.number_captions)
 print(f'Created {Path(args.output).resolve()}; unlocked {count} caption fields. Refresh fields and all tables of contents in Word before delivery.')
