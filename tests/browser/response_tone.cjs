/* Offline UI regression: real guest storage/routes; fixture replies are NOT live model evidence. */
const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/review-tone-browser');
fs.mkdirSync(out,{recursive:true});
const port=8103,base='http://127.0.0.1:'+port,wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser,server;const records=[],errors=[];
(async()=>{try{
  try{await fetch(base+'/health');throw Error('Test port is already in use');}catch(e){if(e.message==='Test port is already in use')throw e;}
  server=spawn(path.join(root,'.venv/Scripts/python.exe'),['scripts/offline_check.py','browser',String(port)],{cwd:root,windowsHide:true,stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===79)throw Error('Fixture unavailable');await wait(250);}
  browser=await chromium.launch({headless:true});
  for(const width of [390,768,1440]){
    const ctx=await browser.newContext({viewport:{width,height:950}}),p=await ctx.newPage();
    p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/app');
    const tone=p.locator('#response-tone'),draft=p.locator('#message');
    await p.waitForFunction(()=>document.getElementById('chat-list')?.textContent.includes('Guest') || document.getElementById('chat-list')?.textContent.includes('ผู้เยี่ยมชม') || document.getElementById('chat-list')?.querySelector('.cl-new')); 
    assert.equal(await tone.inputValue(),'normal');
    await draft.fill('Synthetic draft 101 mg/dL — keep this text');
    for(const lang of ['th','en']){
      await p.locator('button[data-lang="'+lang+'"]').first().click();
      await p.waitForFunction(l=>document.documentElement.lang===l,lang);
      for(const value of ['professional','playful','normal']){
        const patch=p.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/chats/'));
        await tone.selectOption(value);assert.equal((await patch).status(),200);
        await p.waitForFunction(()=>!document.getElementById('response-tone').disabled);
        assert.equal(await draft.inputValue(),'Synthetic draft 101 mg/dL — keep this text');
      }
      assert.equal(await p.locator('label[for="response-tone"]').textContent(),lang==='th'?'โทนคำตอบ':'Response tone');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await p.screenshot({path:path.join(out,`tone-${width}-${lang}.png`),fullPage:true});
      records.push({id:`tone-${width}-${lang}`,status:'PASS',checks:'default; three styles; draft preserved; translated label; no overflow'});
    }
    await tone.selectOption('playful');await p.waitForFunction(()=>!document.getElementById('response-tone').disabled);
    await draft.fill('UI_TEST_SOURCES');await p.locator('#send').click();
    await p.waitForFunction(()=>!document.getElementById('send').disabled);
    assert.equal(await tone.inputValue(),'playful');
    await draft.fill('UI_TEST_SOURCES');await p.locator('#send').click();await p.waitForFunction(()=>!document.getElementById('send').disabled);
    assert.equal(await tone.inputValue(),'playful');
    await p.locator(width>=1000?'.cl-new':'#new-chat').click();await p.waitForFunction(()=>document.getElementById('response-tone').value==='normal');
    assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>/tone|chat|guest|message/i.test(k)).length+Object.keys(sessionStorage).filter(k=>/tone|chat|guest|message/i.test(k)).length),0);
    await tone.selectOption('professional');await p.waitForFunction(()=>!document.getElementById('response-tone').disabled);
    await p.reload();await p.waitForFunction(()=>document.getElementById('response-tone').value==='normal');
    records.push({id:`lifecycle-${width}`,status:'PASS',checks:'two turns retain tone; new chat and guest reload reset; no browser tone/history storage'});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);
}catch(e){records.push({status:'FAIL',error:e.stack});process.exitCode=1;}finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({mode:'MOCKED_TEST_ONLY',records,errors},null,2));console.log(JSON.stringify(records,null,2));await browser?.close();server?.kill();
}})();
