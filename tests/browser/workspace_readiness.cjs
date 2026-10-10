/* Offline browser regression: delayed real workspace responses, no model requests. */
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/workspace-readiness');
const base='http://127.0.0.1:8123',pause=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(out,{recursive:true});let browser,server;const checks=[],errors=[];
(async()=>{try{
 try{await fetch(base+'/health');throw Error('Test port already occupied');}catch(e){if(e.message==='Test port already occupied')throw e;}
 server=spawn(path.join(root,'.venv/Scripts/python.exe'),['scripts/offline_check.py','browser','8123'],{cwd:root,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===79)throw Error('Fixture unavailable');await pause(250);}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage();
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 page.on('pageerror',e=>errors.push(e.message));
 let initialRelease,initialSeen,turnRelease,turnSeen,holdTurn=false,count=0,posts=0;
 const initialBlocked=new Promise(r=>initialSeen=r),turnBlocked=new Promise(r=>turnSeen=r);
 const initialGate=new Promise(r=>initialRelease=r),turnGate=new Promise(r=>turnRelease=r);
 await page.route('**/api/business/workspace',async route=>{
  const response=await route.fetch();count++;
  if(count===1){initialSeen();await initialGate;}
  else if(holdTurn){holdTurn=false;turnSeen();await turnGate;}
  await route.fulfill({response});
 });
 page.on('request',r=>{if(r.method()==='POST'&&r.url()===base+'/api/business/chat'){posts++;holdTurn=true;}});
 await page.goto(base+'/app',{waitUntil:'domcontentloaded'});await initialBlocked;
 assert(await page.locator('#send').isDisabled());assert(await page.locator('#response-tone').isDisabled());
 checks.push('Initial chat and tone controls remain disabled until workspace is ready');initialRelease();
 await page.waitForFunction(()=>!document.getElementById('send').disabled&&!document.getElementById('response-tone').disabled);
 await page.locator('button[data-lang="en"]').first().click();
 const patch=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/chats/'));
 await page.locator('#response-tone').selectOption('professional');assert.equal((await patch).status(),200);
 await page.waitForFunction(()=>!document.getElementById('response-tone').disabled);
 checks.push('Professional tone is saved on the initialized guest chat');
 await page.locator('#message').fill('UI_TEST_SOURCES');await page.locator('#send').click();await turnBlocked;
 assert(await page.locator('#send').isDisabled());assert(await page.locator('#response-tone').isDisabled());
 checks.push('Terminal stream does not unlock another turn before workspace renders');turnRelease();
 await page.waitForFunction(()=>!document.getElementById('send').disabled);
 assert.equal(await page.locator('#messages .turn.ai').count(),1);
 assert.equal(posts,1);assert.equal(await page.locator('#response-tone').inputValue(),'professional');
 checks.push('One submitted question yields one rendered assistant response before controls unlock');
 await page.screenshot({path:path.join(out,'completed.png'),fullPage:true});
 assert.deepEqual(errors,[]);await context.close();
}catch(e){errors.push(e.stack);process.exitCode=1;}finally{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({mode:'MOCKED_TEST_ONLY',checks,errors},null,2));
 console.log(JSON.stringify({checks,errors},null,2));await browser?.close();server?.kill();
}})();
