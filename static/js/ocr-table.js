'use strict';
/* Accessible, dependency-free table inspired by Origin UI's MIT table patterns.
   All values remain the OCR strings. Filtering never changes the confirmed payload. */
window.LabClearOCRTable = (fields, {onSource} = {}) => {
  const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const root=make('section',null,'ocr-results');
  const tx=s=>s;
  const toolbar=make('div',null,'ocr-toolbar'), search=make('input'), filter=make('select'), count=make('span',null,'ocr-count');
  search.type='search';search.placeholder=tx('Find a test or value');search.setAttribute('aria-label',search.placeholder);
  [['all','All results'],['flagged','Outside printed range'],['unknown','Not compared']].forEach(([v,s])=>filter.add(new Option(tx(s),v)));
  filter.setAttribute('aria-label',tx('Filter results'));count.setAttribute('aria-live','polite');
  toolbar.append(search,filter,count);
  const wrap=make('div',null,'ocr-scroll'), table=make('table',null,'data ocr-table'), caption=make('caption',tx('Extracted values — check against the original document.'));
  const head=make('thead'), hr=make('tr'), body=make('tbody');
  ['Test','Result','Unit','Printed range','Compared with range'].forEach(s=>{const th=make('th',tx(s));th.scope='col';hr.append(th);});
  head.append(hr);table.append(caption,head,body);wrap.append(table);root.append(toolbar,wrap);
  const status={high:['Above','high'],low:['Below','low'],within:['Within','within']};
  let sortAscending=null;
  const sort=make('button',tx('Test'),'ocr-sort');sort.type='button';sort.setAttribute('aria-label',tx('Sort by test name'));
  hr.firstChild.replaceChildren(sort);sort.onclick=()=>{sortAscending=sortAscending!==true;hr.firstChild.setAttribute('aria-sort',sortAscending?'ascending':'descending');render();};
  function render(){
    const query=search.value.toLocaleLowerCase().trim();
    let rows=fields.map((f,i)=>({...f,index:i})).filter(f=>(!query||[f.name,f.value,f.unit,f.reference].join(' ').toLocaleLowerCase().includes(query))&&(filter.value==='all'||filter.value==='flagged'&&['high','low'].includes(f.status)||filter.value==='unknown'&&!status[f.status]));
    if(sortAscending!==null)rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'')*(sortAscending?1:-1));
    body.replaceChildren();
    for(const f of rows){
      const tr=make('tr');tr.dataset.status=f.status||'unknown';
      const name=make('th',f.name);name.scope='row';name.dataset.noTranslate='';
      const result=make('td',f.value==null||f.value===''?'—':String(f.value),'ocr-value');
      result.dataset.noTranslate='';
      const range=make('td',f.reference||tx('None printed'),'ocr-reference');
      range.dataset.noTranslate='';
      const state=make('td'), [label,kind]=status[f.status]||['Not compared','unknown'];
      state.append(make('span',tx(label),'ocr-status '+kind));
      if(f.printed_flag)state.append(make('span','Flag '+f.printed_flag,'ocr-printed-flag'));
      if(f.page)name.append(make('small',tx('Page')+' '+f.page,'ocr-page-label'));
      tr.append(name,result,make('td',f.unit||'—','ocr-unit'),range,state);body.append(tr);
    }
    if(!rows.length){const tr=make('tr'),td=make('td',tx('No matching results'),'ocr-empty');td.colSpan=5;tr.append(td);body.append(tr);}
    count.textContent=rows.length+' / '+fields.length;
  }
  search.oninput=render;filter.onchange=render;render();
  const footer=make('div',null,'ocr-footer');footer.append(make('span',tx('Compared only with ranges printed on this report.'),'tiny muted'));
  if(onSource){const source=make('button',tx('View original'),'btn sm');source.type='button';source.onclick=onSource;footer.append(source);}
  root.append(footer);return root;
};
