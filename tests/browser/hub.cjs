/* Offline Hub UI checks. Own fixture, fresh browser context, no live services. */
const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'test-results/hub-browser');
const base=process.env.BASE || 'http://127.0.0.1:8107';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname)) throw Error('Hub checks require a loopback fixture');
const port=Number(new URL(base).port || 80),wait=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(out,{recursive:true});
let browser,server;const records=[],errors=[],external=[];
const pass=(id,checks)=>records.push({id,status:'PASS',checks});
(async()=>{try{
  if(!process.env.BASE){
    try{await fetch(base+'/health');throw Error('Test port is already in use');}catch(e){if(e.message==='Test port is already in use')throw e;}
    server=spawn(path.join(root,'.venv/Scripts/python.exe'),['scripts/offline_check.py','browser',String(port)],{cwd:root,windowsHide:true,stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===79)throw Error('Fixture unavailable');await wait(250);}
  }
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1440]){
    const ctx=await browser.newContext({viewport:{width,height:950}});
    await ctx.route('**/*',route=>{
      if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();
      external.push(route.request().url());return route.abort();
    });
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base+'/hub');await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-card]').count(),6);
    assert.equal(await p.locator('html').getAttribute('lang'),'th');
    assert((await p.locator('.hub-notice').innerText()).includes('สาธิต ยังไม่มีข้อตกลงพาร์ตเนอร์'));
    // Native GET filters, including a blank maximum budget.
    await p.locator('[name=location]').selectOption('bangkok');
    await p.locator('.hub-filters button[type=submit]').click();
    await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-card]').count(),2);
    await p.locator('[name=provider_type]').selectOption('clinic');
    await p.locator('[name=max_price]').selectOption('1000');
    await p.locator('.hub-filters button[type=submit]').click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-card]').count(),1);
    await p.locator('[name=q]').fill('no-such-demo');
    await p.locator('.hub-filters button[type=submit]').click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-empty]').count(),1);
    await p.locator('[data-hub-empty] a').click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-card]').count(),6);
    pass('filters-'+width,'default blank budget; intersecting filters; empty result; clear/reset');

    const picks=p.locator('[data-hub-select]');
    for(let i=0;i<3;i++)await picks.nth(i).check();
    await picks.nth(3).click();assert.equal(await picks.nth(3).isChecked(),false);
    assert((await p.locator('[data-hub-feedback]').innerText()).includes('สาม'));
    for(const lang of ['en','th']){
      await p.locator('button[data-lang="'+lang+'"]').first().click();
      await p.waitForFunction(expected=>document.querySelector(".hub-notice").innerText.includes(expected),lang==="th"?"สาธิต ยังไม่มีข้อตกลงพาร์ตเนอร์":"Demo only. No partnership agreements.");
      assert.equal(await p.locator(".hub-provider span").first().innerText(),lang==="th"?"คลินิกริมธารสมมติ":"Demo Riverside Clinic");
      assert.equal(await picks.nth(0).isChecked(),true);
      assert.equal(await p.locator('[name=q]').inputValue(),'');
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert((await p.locator('.hub-notice').innerText()).includes(lang==='th'?'สาธิต ยังไม่มีข้อตกลงพาร์ตเนอร์':'Demo only. No partnership agreements.'));
    }
    await p.evaluate(()=>scrollTo(0,0));
    if([390,1440].includes(width))await p.screenshot({path:path.join(out,'hub-'+width+'-th.png'),fullPage:true});
    await p.locator('[data-hub-compare-link]').click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('.hub-comparison thead th').count(),4);
    await p.locator('.hub-comparison thead th a.small').first().click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('.hub-comparison thead th').count(),3);
    await p.locator('a[href="/hub/compare"]').last().click();await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('[data-hub-compare-empty]').count(),1);
    pass('compare-language-'+width,'three-item cap; language retains selections; compare/remove/clear; no page overflow');

    await p.goto(base+'/hub/HUB-001');await p.waitForLoadState('networkidle');
    const requestLog=[];p.on('request',r=>requestLog.push(r.url()));
    const storageBefore=await p.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
    await p.locator('[name=time]').selectOption('morning');
    await p.locator('[name=topic]').selectOption('preparation');
    await p.locator('button[data-lang=en]').first().click();
    assert.equal(await p.locator('[name=time]').inputValue(),'morning');
    await p.locator('[data-hub-simulate]').click();
    assert.equal(await p.locator('[data-hub-confirmation]').isVisible(),true);
    assert((await p.locator('[data-hub-confirmation]').innerText()).includes('nothing was sent'));
    assert.equal(await p.locator('[data-hub-confirm-time]').innerText(),'Morning');
    assert.equal(await p.evaluate(()=>document.activeElement.hasAttribute('data-hub-confirmation')),true);
    await p.locator('button[data-lang=th]').first().click();
    await p.waitForFunction(()=>document.querySelector("[data-hub-confirm-time]").textContent==="ช่วงเช้า");
    assert.equal(await p.locator('[data-hub-confirm-time]').innerText(),'ช่วงเช้า');
    assert.equal(await p.locator('[data-hub-confirm-topic]').innerText(),'สอบถามการเตรียมตัว');
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await p.evaluate(()=>scrollTo(0,0));
    if([390,1440].includes(width))await p.screenshot({path:path.join(out,'hub-detail-'+width+'-th.png'),fullPage:true});
    await p.locator('[data-hub-inquiry-reset]').click();
    assert.equal(await p.locator('[name=time]').inputValue(),'');
    assert.equal(await p.locator('[data-hub-confirmation]').isVisible(),false);
    assert.equal(await p.evaluate(()=>document.activeElement.name),'time');
    assert.deepEqual(await p.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),storageBefore);
    assert.deepEqual(requestLog,[]);
    pass('inquiry-'+width,'detail; fixed synthetic choices; language preserves draft; translated receipt; focus/reset; zero requests or storage writes');
    await ctx.close();
  }
  const ctx=await browser.newContext({javaScriptEnabled:false}),p=await ctx.newPage();
  await p.goto(base+'/hub');
  await p.locator('[name=location]').selectOption('bangkok');
  await p.locator('.hub-filters button[type=submit]').click();
  assert.equal(await p.locator('[data-hub-card]').count(),2);
  await p.goto(base+'/centers');assert.equal(await p.locator('.center-row').count(),3);
  pass('progressive-and-catalog','no-JavaScript native blank-budget form; existing three centers preserved');
  await ctx.close();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}catch(e){records.push({status:'FAIL',error:e.stack});process.exitCode=1;}finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({mode:'OFFLINE_SYNTHETIC_ONLY',records,errors,external},null,2));
  console.log(JSON.stringify(records,null,2));await browser?.close();server?.kill();
}})();
