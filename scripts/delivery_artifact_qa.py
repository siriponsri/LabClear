"""Inspect final document styles, PDF glyphs/captions/fonts and archive provenance."""
import sys,json,re,zipfile,hashlib,inspect
from pathlib import Path
import pypdfium2 as pdf
from xml.etree import ElementTree as etree
ROOT=Path(__file__).resolve().parents[1];EV=ROOT/'docs/evidence/current/delivery-audit-repairs-20261012'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
reports=['docs/report/LabClear_Final_Project_Report_TH','docs/report/LabClear_Final_Project_Appendix_TH','docs/presentation/LabClear_Academic_Demo_Storyboard_TH']
styles=[];pdfs=[]
for name in reports:
 with zipfile.ZipFile(ROOT/(name+'.docx')) as z:
  x=etree.fromstring(z.read('word/styles.xml'));checks=[]
  for id,size in [('Title',20),('Heading1',18),('Heading2',16),('Normal',14)]:
   st=x.find(f"{W}style[@{W}styleId='{id}']");rp=st.find(W+'rPr');rf=rp.find(W+'rFonts');sz=rp.findall(W+'sz');cs=rp.findall(W+'szCs')
   checks.append({'style':id,'families':[rf.get(W+a) for a in ['ascii','hAnsi','eastAsia','cs']],'theme_attributes':[k for k in rf.attrib if 'theme' in k.lower()],'size_values':[e.get(W+'val') for e in sz],'complex_size_values':[e.get(W+'val') for e in cs]})
  assert all(c['families']==['TH SarabunPSK']*4 and not c['theme_attributes'] and c['size_values']==[str(size*2)] and c['complex_size_values']==[str(size*2)] for c,(_,size) in zip(checks,[('Title',20),('Heading1',18),('Heading2',16),('Normal',14)]))
  styles.append({'file':name+'.docx','checks':checks})
for name in reports+['docs/presentation/LabClear_Presentation_TH']:
 p=ROOT/(name+'.pdf');d=pdf.PdfDocument(str(p));glyphs=0;captions_without_images=[];pages=[]
 for i,page in enumerate(d):
  t=page.get_textpage().get_text_range().replace('\u200b','').replace('\u2060','');glyphs+=t.count('\ufffd')
  if 'Appendix' in name:
   objects=list(page.get_objects(max_depth=10));images=sum(isinstance(o,pdf.PdfImage) for o in objects)
   if re.search(r'ภาพขั้นตอน\s',t) and images==0:captions_without_images.append(i+1)
  pages.append({'page':i+1,'text_characters':len(t)})
 raw=p.read_bytes();fontnames=sorted(set(n.decode('ascii') for n in re.findall(rb'/FontName\s*/([A-Za-z0-9+_-]+)',raw)))
 pdfs.append({'file':name+'.pdf','pages':len(d),'replacement_glyphs':glyphs,'font_descriptors':fontnames,'embedded_font_file_references':len(re.findall(rb'/FontFile[23]?\s',raw)),'caption_pages_without_image_objects':captions_without_images,'literal_markdown_bold_markers':sum('**' in page.get_textpage().get_text_range() for page in d) if 'Report_TH' in name else 'verbatim answers may contain markup'})
 d.close()
assert all(r['replacement_glyphs']==0 and not r['caption_pages_without_image_objects'] for r in pdfs)
assert not any('Calibri' in n or 'Browallia' in n for r in pdfs if 'Storyboard' in r['file'] for n in r['font_descriptors'])
result={'styles':styles,'pdfs':pdfs,'provider_calls':0,'raw_case_sha256':hashlib.sha256((ROOT/'docs/evidence/current/independent-text-20261012-01/cases.jsonl').read_bytes()).hexdigest(),'visual_review':'ALL_PAGE_CONTACT_SCAN_AND_FOCUSED_FULLSIZE_REVIEW_IN_PROGRESS'}
(EV/'final-document-qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdfs':pdfs,'style_checks_pass':True},ensure_ascii=False))
