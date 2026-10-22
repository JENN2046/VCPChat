'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {messageHash}=require('../modules/services/nativeSync/protocol');
exports.verify=async(client,history,wait)=>{
 const service=JSON.parse(await fs.readFile(path.join(client.record.appData,'R8_SERVICE_READY.json'),'utf8'));
 const rows=await history(client.record.name),headers={Authorization:'Bearer r8-synthetic-mobile-only','Content-Type':'application/json'};
 const proof=await wait(async()=>{
  const r=await fetch(`http://127.0.0.1:${service.httpPort}/api/mobile-sync/messages/pull`,{method:'POST',headers,body:JSON.stringify({topics:[{ownerType:'agent',ownerId:'R3Agent',topicId:'r3-topic',messageIds:rows.map(m=>m.id)}]})});
  const frame=(await r.text()).trim().split('\n').map(JSON.parse).find(x=>x.kind==='topic');if(!frame?.ok)return false;
  assert.equal(frame.messages.length,7);const index=new Map(frame.messages.map(m=>[m.id,messageHash(m)]));for(const m of rows)assert.equal(index.get(m.id),messageHash(m));
  const search=await fetch(`http://127.0.0.1:${service.httpPort}/__r8/search`,{method:'POST',headers,body:JSON.stringify({query:'R7_QUEUED_RESTART',ownerType:'agent',ownerId:'R3Agent',topicId:'r3-topic',limit:10})}).then(r=>r.json());
  assert.ok(search.hits.some(x=>x.message.contentText.includes('R7_QUEUED_RESTART')));
  const status=await fetch(`http://127.0.0.1:${service.httpPort}/__r8/status`,{headers}).then(r=>r.json());
  if(status.cds.indexedRevision!==status.cds.contentRevision)return false;
  assert.equal(status.cds.messages,7);assert.equal(status.cds.searchAvailable,true);
  return {client:client.record.name,messages:7,canonicalHashesEqual:true,cdsStatus:status.cds,nativeSync:status.queue};
 },'PWA-origin history converges in real Rust CDS and original MobileSync pull',20000);
 return proof;
};
