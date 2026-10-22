'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {MobileBrowser,wait}=require('./native-sync-r7-browser.cjs');
module.exports.run=async function run(h){
 const {sync,runRoot,CDP,start,select,send,visible,screenshot,stop,history,syncState,checks}=h;
 const browserRecords=[],evidence={browserRecords,android:'NOT RUN',checks:[]};let mobile=null;
 const open=()=>MobileBrowser.open({root:runRoot,origin:sync.gateway.origin,spki:sync.gateway.spki,CDP,records:browserRecords});
 const snapshot=()=>sync.snapshot('r7-execution-state');
 const jobState=async(id,state)=>{const r=await snapshot();return r.mobile?.executions.find(j=>j.id===id&&j.state===state);};
 async function submit(text){
  const prior=await mobile.page.evaluate("[...document.querySelectorAll('[data-exec-id]')].map(x=>x.dataset.execId)");
  await mobile.page.evaluate(`(()=>{const input=document.querySelector('#message-text');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(()=>mobile.page.evaluate("!document.querySelector('#send').disabled"),'Vue composer enabled');
  await mobile.page.evaluate("document.querySelector('#send').click()");
  return wait(()=>mobile.page.evaluate(`(()=>{const known=${JSON.stringify(prior)};return [...document.querySelectorAll('[data-exec-id]')].map(x=>x.dataset.execId).find(id=>!known.includes(id))})()`),'durably accepted execution');
 }
 try{
  let a=await start('Windows-A');await select(a);await send(a,'R3_A_STREAM');await visible(a,'R3 synthetic response: R3_A_STREAM');
  await wait(async()=>{const s=await syncState('Windows-A');return s.cursor===2&&s.outbox.length===0;},'desktop seed sync');await stop(a);
  const grant=await sync.gateway.request('/api/plugins/NativeSync/mobile/pairing',{admin:true,body:{}});assert.equal(grant.status,200);
  mobile=await open();
  await mobile.page.evaluate(`(()=>{const input=document.querySelector('#pair-code');input.value=${JSON.stringify(grant.body.pairingCode)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#pair-submit').click()})()`);
  await wait(()=>mobile.page.evaluate("Boolean(document.querySelector('#message-text'))"),'scoped mobile pairing');
  await wait(()=>mobile.page.evaluate("document.querySelector('#history').innerText.includes('R3_A_STREAM')"),'desktop history in PWA');
  assert.equal(await mobile.page.evaluate('window.isSecureContext'),true);
  await wait(()=>mobile.page.evaluate('Boolean(navigator.serviceWorker.controller)'),'active HTTPS service worker');
  const cookies=await mobile.page.send('Network.getCookies',{urls:[sync.gateway.origin+'/mobile/']});
  const cookie=cookies.cookies.find(c=>c.name==='__Secure-vcp_mobile');assert.ok(cookie?.secure&&cookie?.httpOnly&&cookie?.sameSite==='Strict');
  evidence.authentication={secure:true,httpOnly:true,sameSite:cookie.sameSite,path:cookie.path,documentCookieVisible:await mobile.page.evaluate('document.cookie.length>0'),localStorageItems:await mobile.page.evaluate('localStorage.length'),sessionStorageItems:await mobile.page.evaluate('sessionStorage.length')};
  assert.equal(evidence.authentication.documentCookieVisible,false);assert.equal(evidence.authentication.localStorageItems,0);assert.equal(evidence.authentication.sessionStorageItems,0);
  assert.equal((await sync.gateway.request('/mobile/api/conversations')).status,401);
  assert.equal((await sync.gateway.request('/mobile/api/pair',{body:{code:grant.body.pairingCode}})).status,401);
  assert.equal(await mobile.page.evaluate("fetch('/mobile/api/conversations/not-allowed').then(r=>r.status)"),403);
  assert.equal(await mobile.page.evaluate("fetch('/api/v1/sync/status').then(r=>r.status)"),401);
  evidence.checks.push('real Vue PWA over certificate-pinned HTTPS; active service worker; scoped HttpOnly cookie; no global Key or browser storage credential');
  const text='R7_MOBILE_DISCONNECT\n完整文本 <b>只作为文本显示</b>：'+ '甲乙'.repeat(260);
  const first=await submit(text);await wait(()=>jobState(first,'running'),'server execution running');
  await mobile.screenshot('pwa-accepted-running');await mobile.close();mobile=null;
  const disconnected=await jobState(first,'running');assert.ok(disconnected,'model must still run after the browser process exits');
  evidence.disconnection={id:first,stateAfterBrowserExit:disconnected.state,browserExitedBeforeCompletion:true};
  await wait(()=>jobState(first,'completed'),'server completes after mobile disconnect',25000);
  mobile=await open();await wait(()=>mobile.page.evaluate("Boolean(document.querySelector('#message-text'))"),'session survives browser restart');
  await wait(()=>mobile.page.evaluate("document.querySelector('#history').innerText.includes('R7 server reply: R7_MOBILE_DISCONNECT')"),'reconnected persisted final reply');
  const queried=await mobile.page.evaluate("fetch('/mobile/api/conversations/test-topic').then(r=>r.json())");
  assert.ok(queried.messages.some(r=>r.message?.content===text));assert.equal(await mobile.page.evaluate("document.querySelectorAll('#history b').length"),0);
  evidence.fullText={characters:text.length,preserved:true,markupRenderedAsText:true};
  const before=(await snapshot()).metrics;
  await mobile.page.evaluate("document.querySelector('#retry-last').click()");
  await new Promise(r=>setTimeout(r,650));assert.deepEqual((await snapshot()).metrics,before);assert.equal((await snapshot()).mobile.executions.length,1);
  evidence.checks.push('202 accepted work survives closed Chrome process; final response uses server model pipeline, appears on reopen; retry has no duplicate journal or model job');
  const cancel=await submit('R7_CANCEL');await wait(()=>jobState(cancel,'running'),'cancellable server run');
  await mobile.page.evaluate(`document.querySelector('[data-cancel-id="${cancel}"]').click()`);await wait(()=>jobState(cancel,'cancelled'),'explicit cancellation');
  assert.ok(!(await snapshot()).entries.some(m=>m.msgId==='reply_'+cancel));
  const queued=await submit('R7_QUEUED_RESTART');await wait(()=>jobState(queued,'queued'),'queued persistent request');
  await mobile.close();mobile=null;await sync.restartServerAndReconnect();
  await wait(()=>jobState(queued,'completed'),'queued request recovers after full server restart',25000);
  mobile=await open();await wait(()=>mobile.page.evaluate("document.querySelector('#history')?.innerText.includes('R7 server reply: R7_QUEUED_RESTART')"),'PWA restores messages/status after host restart');
  await mobile.screenshot('pwa-reconnected-after-restart');
  evidence.cacheApiEntries=await mobile.page.evaluate("(async()=>{let n=0;for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())if(new URL(r.url).pathname.includes('/mobile/api/'))n++;return n})()");assert.equal(evidence.cacheApiEntries,0);
  const final=await snapshot();assert.equal(final.metrics.journalRows,7);assert.deepEqual(final.mobile.executions.map(j=>j.state).sort(),['cancelled','completed','completed']);
  evidence.executions=final.mobile.executions;evidence.checks.push('explicit cancel produces no assistant; queued request and scoped session recover through real full server.js restart; API responses never enter service-worker cache');
  await mobile.close();mobile=null;
  let b=await start('Windows-B');await select(b);await visible(b,'R7 server reply: R7_QUEUED_RESTART');await visible(b,'R7_MOBILE_DISCONNECT');
  await wait(async()=>{const s=await syncState('Windows-B');return s.cursor===7&&s.outbox.length===0&&!s.pending;},'B native cursor catches mobile conversation');
  if(process.argv.includes('--coexist-services')) evidence.cdsPeers=[await require('./native-sync-r8-pwa-cds.cjs').verify(b,history,wait)];
  assert.equal((await history('Windows-B')).length,7);await screenshot(b,'windows-B-mobile-conversation');await stop(b);
  a=await start('Windows-A');await select(a);await visible(a,'R7 server reply: R7_QUEUED_RESTART');if(process.argv.includes('--coexist-services'))evidence.cdsPeers.push(await require('./native-sync-r8-pwa-cds.cjs').verify(a,history,wait));await stop(a);
  const c=await start('Sync-Off',{enabled:false});await select(c);await send(c,'R3_SINGLE_MACHINE');await visible(c,'R3 synthetic response: R3_SINGLE_MACHINE');await screenshot(c,'sync-off-single-machine');await stop(c);
  await assert.rejects(fs.access(path.join(runRoot,'Sync-Off','.native-sync/state.json')));assert.equal((await snapshot()).metrics.journalRows,7);
  evidence.checks.push('official Windows VCPChat Renderer displays the same mobile-origin conversation; sync-disabled original local save remains unchanged');
  checks.push(...evidence.checks);sync.evidence.mobile.acceptance=evidence;
  await fs.writeFile(path.join(runRoot,'MOBILE_ACCEPTANCE.json'),JSON.stringify(evidence,null,2)+'\n');
 }catch(error){
  if(mobile){await mobile.screenshot('pwa-failure');await fs.writeFile(path.join(runRoot,'MOBILE_FAILURE.json'),JSON.stringify({message:error.message,ui:await mobile.page.evaluate("({notice:document.querySelector('#send-state')?.innerText,paired:Boolean(document.querySelector('#message-text')),states:[...document.querySelectorAll('[data-state]')].map(x=>x.dataset.state)})")},null,2));}
  throw error;
 }finally{if(mobile)await mobile.close();}
};
