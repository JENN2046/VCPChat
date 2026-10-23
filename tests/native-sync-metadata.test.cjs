'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {HistoryMutationQueue,quiet}=require('./helpers/nativeSyncFixture.cjs');
const {NativeSyncAdapter}=require('../modules/services/nativeSync/adapter');
const {startSyncService}=require('./helpers/nativeSyncHttpService.cjs');
const {durableJson}=require('../modules/services/nativeSync/durableJson');
const {messageHash}=require('../modules/services/nativeSync/protocol');
const topic={itemType:'agent',itemId:'synthetic-agent',topicId:'synthetic-topic'};
const original={id:'checkpoint',role:'user',content:'SYNTHETIC_CHECKPOINT',timestamp:10};
const checkpoint={kind:'vchat-context-checkpoint',version:1,checkpoint:original.content};
test('Queue publishes a same-hash checkpoint backfill, second client applies metadata, restart has no echo',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'seamless-metadata-clients-'));const service=await startSyncService({dbPath:path.join(root,'central.sqlite'),token:'synthetic'});const clients=[];
 t.after(async()=>{for(const c of clients){await c.adapter.close();await c.queue.dispose();}await service.close();await fs.rm(root,{recursive:true,force:true});});
 async function client(name,persist){const queue=new HistoryMutationQueue({userDataDir:path.join(root,name,'UserData'),logger:quiet}),options={queue,statePath:path.join(root,name,'state.json'),deviceId:name,url:service.url,token:'synthetic',topics:[topic],...(persist?{persist}:{})},adapter=await NativeSyncAdapter.open(options);const c={queue,adapter,options};clients.push(c);return c;}
 const a=await client('A'),b=await client('B');await a.queue.mutate(topic,()=>[original]);await a.adapter.synchronize();await b.adapter.synchronize();
 assert.equal(service.store.metrics().journalRows,1);const fingerprint=messageHash(original);
 await a.queue.mutate(topic,h=>h.map(m=>({...m,contextCompaction:checkpoint})));assert.equal(a.adapter.state.outbox[0].metadata.version,1);
 await a.adapter.synchronize();await b.adapter.synchronize();
 assert.equal(service.store.metrics().journalRows,2);const history=await b.queue.read(topic);assert.equal(history[0].contextCompaction.kind,checkpoint.kind);assert.equal(messageHash(history[0]),fingerprint);assert.equal(b.adapter.state.outbox.length,0);
 await b.adapter.close();b.adapter=await NativeSyncAdapter.open(b.options);await b.adapter.synchronize();assert.equal(service.store.metrics().journalRows,2);
});
test('metadata Pending recovery completes the committed Queue projection without duplicates or content mutation',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'seamless-metadata-pending-'));const service=await startSyncService({dbPath:path.join(root,'central.sqlite'),token:'synthetic'});
 const queue=new HistoryMutationQueue({userDataDir:path.join(root,'UserData'),logger:quiet});let fail=false;
 const options={queue,statePath:path.join(root,'state.json'),deviceId:'B',url:service.url,token:'synthetic',topics:[topic],persist:async(file,state)=>{if(fail&&!state.pending&&state.cursor>1){fail=false;throw Error('synthetic acknowledgement gap');}await durableJson(file,state);}};
 let adapter=await NativeSyncAdapter.open(options);
 t.after(async()=>{await adapter.close();await queue.dispose();await service.close();await fs.rm(root,{recursive:true,force:true});});
 const id={ownerType:'agent',ownerId:topic.itemId,topicId:topic.topicId,msgId:original.id,deviceId:'A',action:'upsert',baseHash:null};service.store.apply({...id,opId:'initial',message:original});await adapter.synchronize();
 const message={...original,contextCompaction:checkpoint},metadata=require('../modules/services/nativeSync/metadata').envelopeFor(message,1);
 service.store.apply({...id,opId:'metadata',baseHash:messageHash(original),message,metadata},{metadataPublisher:true});fail=true;
 await assert.rejects(()=>adapter.pull());assert.ok(adapter.state.pending);assert.equal((await queue.read(topic))[0].contextCompaction.kind,checkpoint.kind);
 await adapter.close();adapter=await NativeSyncAdapter.open(options);await adapter.synchronize();assert.equal(adapter.state.pending,null);assert.equal(adapter.state.cursor,2);assert.equal(adapter.state.outbox.length,0);assert.equal(service.store.metrics().journalRows,2);
});
