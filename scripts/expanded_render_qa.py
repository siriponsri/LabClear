"""Render report PDFs and all-page contact sheets, preserving every evidence file."""
import sys,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
source=Path(sys.argv[1]); out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
doc=pdfium.PdfDocument(str(source));rows=[];thumbs=[]
for i in range(len(doc)):
    page=doc[i]; text=page.get_textpage().get_text_range(); image=page.render(scale=1.2).to_pil().convert('RGB')
    p=out/f'page-{i+1:03}.png';image.save(p)
    thumb=image.copy();thumb.thumbnail((300,425));thumbs.append(thumb)
    rows.append({'page':i+1,'text_characters':len(text),'replacement_glyphs':text.count('\ufffd'),'image':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
for start in range(0,len(thumbs),12):
    sheet=Image.new('RGB',(960,1900),'#eeeaf4');draw=ImageDraw.Draw(sheet)
    for j,thumb in enumerate(thumbs[start:start+12]):
        x=10+(j%3)*320;y=10+(j//3)*470;sheet.paste(thumb,(x,y));draw.text((x,y+435),f'Page {start+j+1}',fill='black')
    sheet.save(out/f'contact-{start+1:03}-{min(start+12,len(thumbs)):03}.png')
result={'source':str(source.resolve()),'pdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'at':datetime.now(timezone.utc).isoformat(),'pages':len(rows),'page_checks':rows,'visual_review':'PENDING'}
(out/'render-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps({'pages':len(rows),'replacement_glyphs':sum(r['replacement_glyphs'] for r in rows)}));doc.close()
