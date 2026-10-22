'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {open,resolveWebApk,launchWebApk}=require('./native-sync-r9-android.cjs');
const {messageHash}=require('../modules/services/nativeSync/protocol');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function assertRestoredProjection(before,after){
 const messages=new Map(after.messages.map(x=>[x.id,x])),jobs=new Map(after.executions.map(x=>[x.id,x]));
 assert.equal(messages.size,after.messages.length);assert.equal(jobs.size,after.executions.length);
 for(const old of before.messages)assert.deepEqual(messages.get(old.id),old,'previously committed message must survive unchanged');
 for(const old of before.executions){const current=jobs.get(old.id);assert.ok(current,'previous task must survive');assert.equal(current.own,old.own,'task ownership must survive');if(['completed','cancelled','failed'].includes(old.state))assert.equal(current.state,old.state,'terminal task cannot regress');}
}
exports.assertRestoredProjection=assertRestoredProjection;

exports.run=async function(h){
 const {sync,runRoot,waitFor}=h,evidence={result:'IN PROGRESS',checks:[],deviceSecurityChanged:false};let phone;
 const save=()=>fs.writeFile(path.join(runRoot,'INSTALL_RECOVERY_ACCEPTANCE.json'),JSON.stringify(evidence,null,2));
 async function checkpoint(phase){evidence.phase=phase;await save();process.stdout.write(JSON.stringify({event:'R9_INSTALL_CHECKPOINT',phase})+'\n');}
 async function action(phase,instruction){evidence.phase=phase;await save();await fs.writeFile(path.join(runRoot,'ANDROID_ACTION_REQUIRED.json'),JSON.stringify({phase,instruction,origin:sync.mobileOrigin,installName:'VCP R9 验收'},null,2));}
 async function snap(){const r=await sync.snapshot('r9-install-poll');sync.evidence.snapshots=sync.evidence.snapshots.filter(x=>x.label!=='r9-install-poll');if(sync.server?.record&&r.requestId)sync.server.record.events=sync.server.record.events.filter(x=>x.requestId!==r.requestId);return r;}
 const data=()=>phone.page.evaluate("fetch('/mobile/api/conversations/test-topic',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('SESSION_HTTP_'+r.status);return r.json()})");
 function project(d){assert.equal(d.hasMore,false);return {messages:d.messages.map(x=>({id:x.id,hash:messageHash(x.message)})).sort((a,b)=>a.id.localeCompare(b.id)),executions:d.executions.map(x=>({id:x.id,state:x.state,own:x.own})).sort((a,b)=>a.id.localeCompare(b.id))};}
 async function completed(id){return waitFor(async()=>{const r=await snap(),job=r.mobile.executions.find(x=>x.id===id);if(job?.state==='failed')throw Object.assign(Error('R9_INSTALL_MODEL_FAILED'),{terminal:true});return job?.state==='completed';},'installed app real model result publication',120000);}
 async function submit(text){
  const old=(await data()).executions.map(x=>x.id);
  await phone.page.evaluate("(()=>{const e=document.querySelector('#message-text');e.focus();e.setSelectionRange(0,e.value.length)})()");await phone.page.send('Input.insertText',{text});await pause(450);
  await waitFor(()=>phone.page.evaluate("!document.querySelector('#send').disabled"),'installed Vue composer enabled');
  const r=await phone.page.evaluate("(()=>{const r=document.querySelector('#send').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,bottom:r.bottom,limit:visualViewport.offsetTop+visualViewport.height}})()");assert.ok(r.bottom<=r.limit+2);
  await phone.page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]});await phone.page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  return waitFor(()=>phone.page.evaluate(`(()=>{const old=${JSON.stringify(old)};return [...document.querySelectorAll('[data-exec-id]')].map(x=>x.dataset.execId).find(x=>!old.includes(x))})()`),'installed PWA durable acceptance',60000);
 }
 async function standalone(timeoutMs=1200000){phone.page.close();let launched=false;await waitFor(async()=>{await pause(1000);try{if(!resolveWebApk(sync.mobileOrigin))return false;if(!launched){(evidence.launchInvocations??=[]).push(launchWebApk(sync.mobileOrigin));launched=true;await pause(500);}await phone.reconnect();return await phone.page.evaluate("document.visibilityState==='visible'&&matchMedia('(display-mode: standalone)').matches&&Boolean(document.querySelector('#message-text'))");}catch{return false;}},'real installed home-screen Launcher entry with restored session',timeoutMs);const installed=resolveWebApk(sync.mobileOrigin);assert.ok(installed,'a real WebAPK must match the exact test origin');return installed;}
 async function capture(name,installed=true){await waitFor(async()=>{try{if(await phone.page.evaluate("document.visibilityState==='visible'"))return !installed||await phone.page.evaluate("matchMedia('(display-mode: standalone)').matches");await phone.reconnect();return await phone.page.evaluate("document.visibilityState==='visible'"+ (installed?"&&matchMedia('(display-mode: standalone)').matches":""));}catch{return false;}},'current visible owned app screenshot',30000);await phone.screenshot(name);}
 try{
  try{const old=await fs.readFile(path.join(runRoot,'INSTALL_RECOVERY_ACCEPTANCE.json'));await fs.writeFile(path.join(runRoot,'INSTALL_RECOVERY_ATTEMPT_'+Date.now()+'.json'),old,{flag:'wx'});}catch(e){if(e.code!=='ENOENT')throw e;}
  const previousBytes=await fs.readFile(path.join(path.dirname(runRoot),'R9_FINAL_REPORT.json'));
  const previous=JSON.parse(previousBytes);assert.equal(previous.realModel.result,'PASS');assert.ok(['PARTIAL','PASS'].includes(previous.android.result));
  await fs.writeFile(path.join(runRoot,'PREVIOUS_R9_REPORT.json'),previousBytes);
  evidence.previousEvidence={reportSha256:crypto.createHash('sha256').update(previousBytes).digest('hex'),report:path.join(runRoot,'PREVIOUS_R9_REPORT.json'),manualChineseAndBackground:previous.android.manualChineseAndBackgroundProof,realModel:previous.realModel.coreEvidence,regressions:previous.regressions};
  await action('preparing','请保持测试手机解锁并保留当前可访问 Google WebAPK 的网络；会自动打开新的隔离测试页。');
  phone=await open({origin:sync.mobileOrigin,CDP:h.CDP,waitFor,runRoot});evidence.device=phone.metadata;assert.equal(evidence.device.model,previous.android.device.model);await checkpoint('phone-connected');
  const initial=await waitFor(()=>phone.page.evaluate("(async()=>{if(document.visibilityState!=='visible')return false;if(document.querySelector('#message-text'))return 'paired';if(document.querySelector('#pair-code')){const r=await fetch('/mobile/api/session',{cache:'no-store'});return r.status===401?'pair-form':false;}return false;})()"),'isolated mobile session readiness',180000);
  evidence.pairingPerformedThisAttempt=initial==='pair-form';
  await checkpoint('session-readiness-'+initial);
  if(initial==='pair-form'){
   if(resolveWebApk(sync.mobileOrigin))throw Error('R9_INSTALLED_SESSION_LOST');
   const grant=await sync.gateway.request('/api/plugins/NativeSync/mobile/pairing',{body:{},admin:true});assert.equal(grant.status,200);
   await phone.page.evaluate(`(()=>{const e=document.querySelector('#pair-code');e.value=${JSON.stringify(grant.body.pairingCode)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await phone.page.evaluate("document.querySelector('#pair-submit').click()");
  }
  await waitFor(()=>phone.page.evaluate("Boolean(document.querySelector('#message-text'))&&Boolean(navigator.serviceWorker.controller)"),'paired mobile service worker');
  await checkpoint('paired-service-worker');
  const restoredBeforeSubmit=await data();
  await checkpoint('existing-history-read');
  if(!restoredBeforeSubmit.executions.some(x=>x.state==='completed')){const seed=await submit('R9_INSTALL_SESSION：这是隔离安装验收，请仅回复 R9_INSTALL_READY。');await completed(seed);}else evidence.reusedPersistedSeed=true;
  let cancelled=restoredBeforeSubmit.executions.find(x=>x.own&&x.state==='cancelled')?.id;
  if(!cancelled){cancelled=await submit('R9_INSTALL_QUEUED_CANCEL：隔离队列取消状态恢复测试。');await phone.page.evaluate(`document.querySelector('[data-cancel-id="${cancelled}"]').click()`);}
  await waitFor(async()=>(await snap()).mobile.executions.find(x=>x.id===cancelled)?.state==='cancelled','queued cancellation persisted');
  await checkpoint('cancelled-state-confirmed');
  evidence.beforeInstall=project(await data());assert.equal(evidence.beforeInstall.executions.find(x=>x.id===cancelled).own,true);const expectedSessions=(await snap()).mobile.sessionCount;evidence.sessionCountAfterOnlyPairing=expectedSessions;
  await phone.page.send('Page.reload');await waitFor(()=>phone.page.evaluate("Boolean(document.querySelector('#message-text'))&&Boolean(navigator.serviceWorker.controller)"),'same paired browser session after install-state refresh',60000);
  await checkpoint('ordinary-reload-restored');
  const manifest=await phone.page.send('Page.getAppManifest'),manifestData=JSON.parse(manifest.data);assert.equal(manifest.errors.length,0);evidence.manifest={name:manifestData.name,display:manifestData.display,icons:manifestData.icons.map(x=>({src:x.src,sizes:x.sizes}))};
  evidence.installability=await phone.page.send('Page.getInstallabilityErrors');assert.equal(evidence.installability.installabilityErrors.length,0);assertRestoredProjection(evidence.beforeInstall,project(await data()));
  await phone.page.evaluate("document.querySelector('#message-text').blur()");await capture('android-browser-before-install',false);
  await action(resolveWebApk(sync.mobileOrigin)?'launch-existing-icon':'install-and-launch','请从本入口对应的“VCP R9 验收”桌面图标打开；若尚未安装，在当前页面安装后再从桌面打开。');
  evidence.installed=await standalone();evidence.firstLaunch=project(await data());assertRestoredProjection(evidence.beforeInstall,evidence.firstLaunch);assert.equal((await snap()).mobile.sessionCount,expectedSessions);
  evidence.https=await phone.page.evaluate("({secure:isSecureContext,standalone:matchMedia('(display-mode: standalone)').matches,serviceWorker:Boolean(navigator.serviceWorker.controller),cookieReadable:document.cookie.length>0,localStorage:localStorage.length,sessionStorage:sessionStorage.length})");assert.equal(evidence.https.secure,true);assert.equal(evidence.https.cookieReadable,false);assert.equal(evidence.https.standalone,true);
  await capture('android-installed-first-launch');
  const origin=sync.mobileOrigin,beforeHostRestart=await snap(),providerBeforeRestart=await sync.providerSnapshot();await sync.restartServerAndReconnect();assert.equal(sync.mobileOrigin,origin);
  await waitFor(async()=>{try{return (await phone.page.evaluate("fetch('/mobile/api/session',{cache:'no-store'}).then(r=>r.json()).then(x=>x.authenticated===true)"));}catch{return false;}},'installed session after complete ToolBox restart');
  evidence.afterHostRestart=project(await data());assertRestoredProjection(evidence.beforeInstall,evidence.afterHostRestart);const afterHostRestart=await snap();assert.equal(afterHostRestart.mobile.sessionCount,expectedSessions);for(const old of beforeHostRestart.mobile.executions.filter(x=>['completed','cancelled','failed'].includes(x.state)))assert.equal(afterHostRestart.mobile.executions.find(x=>x.id===old.id).attempts,old.attempts);evidence.providerCallsAcrossRestart={before:providerBeforeRestart.calls,after:(await sync.providerSnapshot()).calls};
  await capture('android-installed-host-restart');
  const backgroundText='R9_INSTALL_BACKGROUND：请写约1200汉字的中文测试文章，说明手机应用关闭后持久任务仍能由服务器独立完成，不使用工具。';const background=await submit(backgroundText);
  await waitFor(async()=>{const p=await sync.providerSnapshot(),s=await snap();return p.active>0&&s.mobile.executions.find(x=>x.id===background)?.state==='running';},'installed PWA task actively executing');
  await capture('android-installed-task-running');const target=phone.page.targetId;
  await action('closing-installed-page','即将只关闭本次验收 PWA 的页面，服务端继续生成。完成后再从“VCP R9 验收”图标打开。');
  await phone.page.send('Page.close').catch(()=>{});await waitFor(async()=>!await phone.hasTarget(target),'owned standalone document actually closed',20000);
  const whileClosed=await snap();assert.equal(whileClosed.mobile.executions.find(x=>x.id===background).state,'running');evidence.closedTask={id:background,targetClosed:true,stateAfterClose:'running',closedAt:Date.now()};await completed(background);evidence.closedTask.completedBeforeReopen=true;await save();
  await action('reopen-from-icon','服务端已在应用页面关闭后保存最终回复。请从手机桌面的“VCP R9 验收”图标重新打开。');
  assert.deepEqual(await standalone(600000),evidence.installed);const restored=await data();evidence.restored=project(restored);assertRestoredProjection(evidence.beforeInstall,evidence.restored);assert.equal(evidence.restored.executions.find(x=>x.id===background).own,true);assert.equal(evidence.restored.executions.find(x=>x.id===background).state,'completed');assert.equal(evidence.restored.executions.find(x=>x.id===cancelled).state,'cancelled');assert.equal((await snap()).mobile.sessionCount,expectedSessions);
  const reply=restored.messages.find(x=>x.id==='reply_'+background)?.message.content;assert.ok(reply?.length>=700);evidence.finalReply={characters:reply.length,sha256:crypto.createHash('sha256').update(reply).digest('hex')};
  await waitFor(()=>phone.page.evaluate("[...document.querySelectorAll('[data-exec-id]')].some(x=>x.dataset.execId==="+JSON.stringify(background)+"&&x.dataset.state==='completed')"),'restored final execution visible');await capture('android-installed-restored-final');
  const anchor=restored.executions.find(x=>x.id===background);const replay=await phone.page.evaluate(`fetch('/mobile/api/conversations/test-topic/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({requestId:anchor.requestId,text:backgroundText})})}).then(r=>r.json())`);assert.equal(replay.id,background);assert.equal(replay.replayed,true);assert.equal(replay.attempts,anchor.attempts);const afterReplay=await data();assertRestoredProjection(evidence.restored,project(afterReplay));for(const id of [anchor.userMessageId,anchor.replyMessageId])assert.equal(afterReplay.messages.filter(x=>x.id===id).length,1);evidence.idempotentRestoredRetry={execution:background,replayed:true,attemptsUnchanged:true};
  evidence.windows=[];for(const name of ['Windows-A','Windows-B']){const client=await h.start(name);await h.select(client);await h.visible(client,'R9_INSTALL_BACKGROUND');await waitFor(async()=>{const s=await h.syncState(name),m=await h.centerRequest('/api/v1/sync/status');return s.cursor===m.headSeq&&!s.pending&&!s.outbox.length;},'installed phone conversation reaches formal Windows Renderer');evidence.windows.push(await require('./native-sync-r8-pwa-cds.cjs').verify(client,h.history,waitFor,{expectedMessages:(await h.history(name)).length,searchMarker:'R9_INSTALL_BACKGROUND'}));await h.screenshot(client,name+'-installed-recovery');await h.stop(client);}
  const off=await h.start('Sync-Off',{enabled:false});await h.select(off);await h.send(off,'R3_SINGLE_MACHINE');evidence.syncOff=await require('./native-sync-r8-pwa-cds.cjs').verify(off,h.history,waitFor,{expectedMessages:2,searchMarker:'R3_SINGLE_MACHINE'});await h.stop(off);
  evidence.provider=await sync.providerSnapshot();evidence.result='PASS';evidence.phase='completed';evidence.checks=['real installed WebAPK uses its actual Android home-screen MAIN/LAUNCHER entry, ordinary trusted HTTPS and standalone mode; earlier manual desktop-icon evidence retained separately','one original pairing restores completed/cancelled messages and task ownership; no second pairing or cookie extraction','full ToolBox restart preserves the same HTTPS origin, mobile session, task records and provider ledger','owned installed PWA document closed while real model running; final reply persists before installed Launcher reopen','reopened installed app restores authenticated session, full message hashes, completed/cancelled states and idempotent retry','formal Windows A/B Renderer, real Rust CDS/MobileSync read projections and sync-off index control converge'];h.checks.push(...evidence.checks);await save();
 }catch(error){evidence.result='PARTIAL';evidence.failure=error.message;await save();if(phone)try{await phone.screenshot('android-install-recovery-failure');}catch{}throw error;}
 finally{await phone?.close();}
};
