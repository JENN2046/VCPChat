'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),assert=require('node:assert/strict');
exports.run=async function(h){
 const original=JSON.parse(await fs.readFile(path.join(h.runRoot,'R9_MODEL_APP_RECEIPT.json'),'utf8'));
 await fs.writeFile(path.join(h.runRoot,'PRE_RESUMPTION_RECEIPT.json'),JSON.stringify(original,null,2));
 const before=await h.sync.providerSnapshot();assert.equal(before.calls,5);assert.equal(before.records.filter(r=>r.status===200).length,4);assert.equal(before.records.filter(r=>r.aborted).length,1);
 const cert=await fs.readFile(path.join(h.runRoot,'tls/server.crt'));let cookie;
 const request=(route,body,admin=false)=>new Promise((resolve,reject)=>{const q=https.request(h.sync.gateway.origin+route,{agent:false,method:body?'POST':'GET',ca:cert,headers:{Origin:h.sync.gateway.origin,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:'Bearer isolated-poc-token'}:{})}},res=>{let text='';if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0].split(';')[0];res.on('data',b=>text+=b);res.on('end',()=>res.statusCode<400?resolve(JSON.parse(text)):reject(Error('R9_API_'+res.statusCode)));});q.on('error',reject);q.end(body?JSON.stringify(body):undefined);});
 const grant=await request('/api/plugins/NativeSync/mobile/pairing',{},true);await request('/mobile/api/pair',{code:grant.pairingCode});
 const prior=await request('/mobile/api/conversations/test-topic');const long=prior.messages.find(x=>x.message?.role==='assistant'&&x.message.content.length>=700);assert.ok(long);
 const cancelled=prior.executions.find(x=>x.state==='cancelled');assert.ok(cancelled&&!prior.messages.some(x=>x.id===cancelled.replyMessageId));
 await h.sync.failNext();const body={requestId:'r9-recovery-resume-'+crypto.randomUUID(),text:'R9_REAL_RECOVERY_RESUME：请用中文简短说明网络恢复后的消息防重。'};const accepted=await request('/mobile/api/conversations/test-topic/messages',body);
 const recovered=await h.waitFor(async()=>{const d=await request('/mobile/api/conversations/test-topic'),j=d.executions.find(x=>x.id===accepted.id);if(j.state==='failed')throw Object.assign(Error('R9_RECOVERY_FAILED'),{terminal:true});return j.state==='completed';},'real model recovery after controlled outage',120000);
 const recoveryProof=await h.sync.providerSnapshot();assert.equal(recoveryProof.controlledFailures,1);assert.equal(recoveryProof.calls,before.calls+1);await request('/mobile/api/conversations/test-topic/messages',body);assert.equal((await h.sync.providerSnapshot()).calls,recoveryProof.calls);
 await h.sync.restartServerAndReconnect();await request('/mobile/api/conversations/test-topic/messages',body);assert.equal((await h.sync.providerSnapshot()).calls,recoveryProof.calls);
 for(const name of ['Windows-A','Windows-B']){
  const c=await h.start(name);await h.select(c);await h.visible(c,'R9_REAL_RECOVERY_RESUME');
  await h.waitFor(async()=>{const s=await h.syncState(name),m=await h.centerRequest('/api/v1/sync/status');return s.cursor===m.headSeq&&!s.pending&&!s.outbox.length;},'resumed real-model canonical checkpoint');
  await h.screenshot(c,name+'-resumed-real-model');await h.stop(c);
 }
 const off=await h.start('Sync-Off',{enabled:false});await h.select(off);await h.send(off,'R3_SINGLE_MACHINE');await h.stop(off);
 assert.equal((await h.sync.providerSnapshot()).calls,recoveryProof.calls);
 h.checks.push('original trial completed five actual provider requests: four HTTP200 results, one real in-flight cancellation; controlled failure recovered before restart','real-model messages published and restored through original full ToolBox/NativeSync/CDS; formal Windows B screenshot captured in original trial','resumed A/B at latest real conversation marker; stale offscreen-marker UI predicate corrected in test driver; no further calls from idempotent retry/UI checks','same persisted real-model history and cursor converge after restart; original single-machine save remains functional');
 await fs.writeFile(path.join(h.runRoot,'REAL_MODEL_ACCEPTANCE.json'),JSON.stringify({result:'REAL_MODEL_SERVER_CORE_PASS',model:'doubao-seed-2.0-mini',provider:recoveryProof,longReply:{characters:long.message.content.length,sha256:crypto.createHash('sha256').update(long.message.content).digest('hex')},resumption:'reused four completed real replies and real cancellation; repeated only the recovery case, then completed A/B UI and single-machine checks',android:'NOT RUN in this server-core suite'},null,2));
};
