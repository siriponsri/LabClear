const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=process.argv[2],out=process.argv[3],fixture=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
const {chromium}=require(path.join(root,'node_modules/playwright'));
const base='http://127.0.0.1:8135',pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,browser;const checks=[],errors=[];fs.mkdirSync(out,{recursive:true});
(async()=>{try{
 try{await fetch(base+'/health');throw Error('Test port occupied');}catch(e){if(e.message==='Test port occupied')throw e;}
 server=spawn(path.join(root,'.venv/Scripts/python.exe'),['scripts/offline_check.py','browser','8135'],{cwd:root,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===79)throw Error('Fixture startup timeout');await pause(250);}
 browser=await chromium.launch({headless:true});
 for(const language of ['en','th']){
   const context=await browser.newContext({viewport:{width:1100,height:1100}});
   await context.addCookies([{name:'labclear_language',value:language,url:base}]);
   await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/business/workspace',async route=>{
     const response=await route.fetch(),data=await response.json();data.conversation.messages=[fixture[language]];
     await route.fulfill({response,json:data});
   });
   await page.goto(base+'/app',{waitUntil:'networkidle'});
   const body=page.locator('#messages .message-body');await body.waitFor();const visible=await body.innerText();
   for(const exact of ['Alpha อัลฟา','17.00','10⁹/µL','2.0–9.0','<5','>=3'])assert(visible.includes(exact),'Missing exact visible cell '+exact);
   assert(!visible.includes('permanently stopped functioning'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,language+'.png'),fullPage:true});
   fs.writeFileSync(path.join(out,language+'-visible.txt'),visible);
   checks.push(language+': exact bilingual names, decimals, superscripts and comparator glyphs remain visible; no page overflow');
   await context.close();
 }
 assert.deepEqual(errors,[]);
}catch(e){errors.push(e.stack);process.exitCode=1;}finally{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({mode:'OFFLINE_RENDER_ONLY',scope:'Server-rendered synthetic replies injected into workspace response; real UI renderer; no model/OCR quality claim',checks,errors},null,2));
 console.log(JSON.stringify({checks,errors},null,2));await browser?.close();server?.kill();
}})();
