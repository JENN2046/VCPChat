'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {HistoryMutationQueue,quiet}=require('./helpers/nativeSyncFixture.cjs');
const {NativeSyncAdapter}=require('../modules/services/nativeSync/adapter');
const {DesktopAttachments}=require('../modules/services/nativeSync/attachments');
const {messageHash,canonicalMessage}=require('../modules/services/nativeSync/protocol');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const topic={itemType:'agent',itemId:'synthetic',topicId:'topic'},wire={key:'attachments',ownerType:'agent',ownerId:'synthetic',topicId:'topic'};
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'seamless-desktop-files-')),queue=new HistoryMutationQueue({userDataDir:path.join(root,'UserData'),logger:quiet});t.after(async()=>{await queue.dispose();await fs.rm(root,{recursive:true,force:true});});return {root,queue};}
test('desktop uploads only its native attachment root and actual bytes, never a host path in the request',async t=>{
 const {root,queue}=await fixture(t),bytes=Buffer.from('synthetic native text'),value=digest(bytes),dir=path.join(root,'UserData/attachments');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,value+'.txt');await fs.writeFile(file,bytes);
 const a={id:'attachment_'+value,name:'native.txt',type:'text/plain',hash:value,internalPath:'file://'+file},m={id:'message',role:'user',content:'attachment',timestamp:1,attachments:[a]};await queue.mutate(topic,()=>[m]);
 const requests=[],uploads=new Map();const send=async(route,{body}={})=>{if(!body)return {topics:[wire]};requests.push(body);if(route.endsWith('/uploads')){uploads.set('upload',{bytes:[],hash:body.expectedHash});return {uploadId:'upload',offset:0,state:'uploading'};}if(route.endsWith('/chunks')){uploads.get('upload').bytes.push(Buffer.from(body.data,'base64'));return {offset:body.offset+Buffer.from(body.data,'base64').length};}return {hash:uploads.get('upload').hash,state:'ready'};};
 const sync=new DesktopAttachments({queue,appDataRoot:root,connection:{topics:[topic]},send,download:()=>assert.fail('unexpected download')});await sync.uploadLocal();assert.deepEqual(Buffer.concat(uploads.get('upload').bytes),bytes);assert.equal(JSON.stringify(requests).includes(file),false);
 const count=requests.length;await sync.uploadLocal();assert.equal(requests.length,count);
 await queue.mutate(topic,h=>h.map(m=>({...m,attachments:[{...a,internalPath:path.join(root,'outside.txt')}]})));await fs.writeFile(path.join(root,'outside.txt'),'not approved');await sync.uploadLocal();assert.equal(sync.skipped,1);assert.equal(requests.length,count);
});
test('download verifies SHA before native storage and restores local handles through Queue without changing content fingerprint',async t=>{
 const {root,queue}=await fixture(t),bytes=Buffer.from('synthetic mobile text'),value=digest(bytes),a={id:'attachment_'+value,name:'mobile.txt',type:'text/plain',hash:value,blobHash:value,extractedText:bytes.toString()},m={id:'message',role:'user',content:'mobile',timestamp:1,attachments:[a]};await queue.mutate(topic,()=>[m]);let stored=0;
 const storeAttachment=async(buffer,name)=>{stored++;const file=path.join(root,'UserData/attachments',value+path.extname(name));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,buffer);return {hash:value,internalPath:'file://'+file,extractedText:'platform-specific text must not replace synced text'};};
 const sync=new DesktopAttachments({queue,appDataRoot:root,connection:{topics:[topic]},send:async()=>({topics:[wire]}),download:async()=>bytes,storeAttachment});await sync.restoreRemote();
 const restored=(await queue.read(topic))[0];assert.equal(messageHash(restored),messageHash(m));assert.equal(restored.attachments[0]._fileManagerData.extractedText,a.extractedText);assert.ok(restored.attachments[0].internalPath.includes(value));assert.equal(stored,1);await sync.restoreRemote();assert.equal(stored,1);
 const bad={...m,id:'bad',attachments:[{...a,hash:'0'.repeat(64),blobHash:'0'.repeat(64)}]};await queue.mutate(topic,h=>[...h,bad]);await assert.rejects(()=>sync.restoreRemote(),e=>e.code==='ATTACHMENT_HASH_MISMATCH');assert.equal(stored,1);
});
test('large native PDF image frames offload to CAS references under the same metadata version contract',async t=>{
 const {root,queue}=await fixture(t),sharp=require('sharp'),frame=await sharp(crypto.randomBytes(512*512*3),{raw:{width:512,height:512,channels:3}}).png().toBuffer(),pdf=Buffer.from('%PDF-synthetic-frame-transport'),value=digest(pdf),dir=path.join(root,'UserData/attachments');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,value+'.pdf');await fs.writeFile(file,pdf);
 const original={id:'pdf-message',role:'user',content:'scan',timestamp:1,attachments:[{id:'pdf',name:'scan.pdf',type:'application/pdf',hash:value,internalPath:'file://'+file,imageFrames:[frame.toString('base64')]}]};
 const adapter=await NativeSyncAdapter.open({queue,statePath:path.join(root,'state.json'),deviceId:'desktop',url:'http://127.0.0.1:1',token:'synthetic',topics:[topic]});t.after(()=>adapter.close());const saved=await queue.mutate(topic,()=>[original]);assert.equal(saved.sync.state,'degraded');
 let currentHash,frames=0;const send=async(route,{body}={})=>{if(!body)return {topics:[wire]};if(route.endsWith('/uploads')){currentHash=body.expectedHash;if(body.frameIndex!==undefined)frames++;return {uploadId:'upload',offset:0,state:'uploading'};}if(route.endsWith('/chunks'))return {offset:body.offset+Buffer.from(body.data,'base64').length};return {state:'ready',hash:currentHash};};
 const sync=new DesktopAttachments({queue,appDataRoot:root,connection:{topics:[topic]},send});await sync.uploadLocal();await adapter.recover();
 assert.equal(frames,1);assert.equal(adapter.state.outbox.length,1);const op=adapter.state.outbox[0];assert.equal(op.message.attachments[0].imageFrames,undefined);assert.deepEqual(op.message.attachments[0].frameHashes,[digest(frame)]);assert.equal(messageHash(op.message),messageHash(original));assert.ok(Buffer.byteLength(JSON.stringify(op))<10000);assert.equal(canonicalMessage((await queue.read(topic))[0]).attachments[0].imageFrames,undefined);
});
