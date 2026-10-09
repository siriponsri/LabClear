"""Record observable prompts, tool calls and outputs from the real offline pipeline.
Only synthetic fixtures and in-process provider doubles. Never logs production prompts.
"""
import argparse,json,sys,tempfile
from pathlib import Path
import benchmark_labclear as bench


def capture(output):
    bench.verify_manifest('ocr-files')
    with tempfile.TemporaryDirectory(prefix='labclear-demo-') as temp:
        folder=Path(temp)
        run={'run_id':'notebook-demo','profile':'C','canary_key':'synthetic-demo-key','record_replay':False,'canaries':{}}
        server=bench.Server(folder,'OFFLINE',run,extra={'prompt_trace':str(folder/'prompts.jsonl'),'hospital_links':True})
        try:
            server.start();c=bench.Client(server.base);c.start()
            text=c.stream('/chat',json={'message':'HbA1c คืออะไร ช่วยอธิบายพร้อมแหล่งอ้างอิง'})
            # Package questions: a named hospital gets its reviewed offers as cited evidence; a general
            # package question gets official hospital links attached after every check.
            hospital=c.stream('/chat',json={'message':'โรงพยาบาลสมิติเวชมีแพ็กเกจตรวจสุขภาพราคาเท่าไร'})
            packages=c.stream('/chat',json={'message':'แนะนำแพ็กเกจตรวจสุขภาพประจำปีหน่อย'})
            image=bench.ROOT/'examples/ocr_owner_20261009/png/02_A_Renal.png'
            read=c.stream('/chat/report',data={'message':'ช่วยอ่านและอธิบายค่าที่พิมพ์ในรายงานจำลองนี้'},files=[('files',(image.name,image.read_bytes(),'image/png'))])
            result=read.get('result') or {}
            explain=c.stream('/chat/report/confirm',json={'message_id':result['card_id']}) if result.get('card_id') else None
            c.close()
            prompts=[json.loads(line) for line in (folder/'prompts.jsonl').read_text().splitlines()]
            out={'mode':'OFFLINE_DOUBLE','clinical_validation':False,'fixture_sha256':bench.sha256_file(image),
                 'note':'Confirmation is simulated as read. OCR mistakes remain visible. Prompts and outputs are observable artifacts, not private model reasoning.',
                 'source_digest':bench.source_digest(),'turns':{'question':text,'read':read,'explain':explain,'hospital':hospital,'packages':packages},'prompts':prompts}
            output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
            return out
        finally:server.stop()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=bench.ROOT/'docs/evidence/current/demo-rollout.json');a=p.parse_args()
    result=capture(a.out);print(f"Recorded {len(result['prompts'])} observable provider calls to {a.out}")
