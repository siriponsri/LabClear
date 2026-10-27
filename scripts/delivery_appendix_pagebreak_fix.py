"""Use heading page breaks instead of empty carrier paragraphs; preserve all content."""
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'docs/evidence/current/reader-report-v2-20261012/runtime'))
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
p=ROOT/'docs/report/LabClear_Final_Project_Appendix_TH.docx';d=Document(p);fixed=0
for para in list(d.paragraphs):
 if not para.text.strip() and para._p.xpath('.//w:br[@w:type="page"]'):
  following=para._p.getnext()
  if following is not None and following.tag==qn('w:p'):
   pr=following.get_or_add_pPr()
   if pr.find(qn('w:pageBreakBefore')) is None:pr.append(OxmlElement('w:pageBreakBefore'))
   para._p.getparent().remove(para._p);fixed+=1
d.save(p);print('Empty page-break carriers replaced by heading breaks:',fixed)
