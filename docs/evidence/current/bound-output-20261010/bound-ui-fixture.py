import json,os,sys,tempfile
from pathlib import Path
root=Path(sys.argv[1]);out=Path(sys.argv[2])
keep={'systemroot','windir','path','pathext','temp','tmp','userprofile','localappdata','appdata','comspec','home'}
for key in list(os.environ):
    if key.lower() not in keep:del os.environ[key]
with tempfile.TemporaryDirectory(prefix='labclear-bound-ui-') as folder:
    os.chdir(folder);sys.path.insert(0,str(root))
    os.environ.update(APP_ENV='test',PROVIDER_NETWORK_ENABLED='false',BUSINESS_DB_PATH=str(Path(folder)/'synthetic.sqlite'),BUSINESS_KEY_PATH=str(Path(folder)/'synthetic.key'),DATABASE_URL='')
    from services.conversation_agent import Answer,validate_answer
    from services.report_binding import render
    from services.answer_checks import critical_note
    report={'confirmed':True,'fields':[
      {'id':'a','name':'Alpha อัลฟา','value':'17.00','unit':'10⁹/µL','reference':'2.0–9.0','printed_flag':'H','status':'high'},
      {'id':'b','name':'Beta','value':'4','unit':'g/L','reference':'<5','printed_flag':'','status':'within'},
      {'id':'c','name':'Gamma','value':'4','unit':'g/L','reference':'>=3','printed_flag':'','status':'within'}]}
    replies={}
    for language in ('en','th'):
        a=Answer(reply='Neutral',observation_ids=['a','b','c'])
        binding=render(a,report,[],language,'Explain' if language=='en' else 'อธิบายผล')
        validate_answer(a,[],report)
        replies[language]={'id':'synthetic-bound-ui','role':'assistant','kind':'message','content':a.reply,'sources':[],
            'observations':[o.model_dump() for o in a.observations], 'dot':{'id':'explainer','name':'Report Explainer'}}
    out.write_text(json.dumps(replies,ensure_ascii=False,indent=2),encoding='utf-8')
    os.chdir(root)
