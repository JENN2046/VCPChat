'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {dailyConnection}=require('../modules/services/nativeSync/dailyConnection');
const {initialImport}=require('../modules/services/nativeSync/initialImport');
const {catalog}=require('../modules/services/nativeSync/catalog');
const {messageHash,tombstoneHash}=require('../modules/services/nativeSync/protocol');
const topic={itemId:'actual-id',itemType:'agent',topicId:'old-topic'},wire={ownerId:topic.itemId,ownerType:'agent',topicId:topic.topicId};
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'vcp-r10-desktop-'));const dir=path.join(root,'.native-sync');await fs.mkdir(dir);const history=[{id:'old-id',role:'user',content:'synthetic original content',timestamp:10}];const historyFile=path.join(root,'UserData',topic.itemId,'topics',topic.topicId,'history.json');await fs.mkdir(path.dirname(historyFile),{recursive:true});const bytes=JSON.stringify(history);await fs.writeFile(historyFile,bytes);const config={version:1,enabled:true,historySelectionApproved:true,deviceId:'existing-desktop',topics:[topic],transportUrl:'http://127.0.0.1:53218',serverUrl:'http://wp10.unicorn.org.cn:13546',credentialSource:'existing-vcp-settings',approvedHistory:[{...topic,rawFileSha256:crypto.createHash('sha256').update(bytes).digest('hex')}]};return {root,config,history,historyFile,write:()=>fs.writeFile(path.join(dir,'connection.json'),JSON.stringify(config)),queue:{userDataDir:path.join(root,'UserData'),getHistoryPath:()=>historyFile}};}
const settings=async()=>({vcpServerUrl:'http://wp10.unicorn.org.cn:13546/v1/chat/completions',vcpApiKey:'synthetic-existing-desktop-key'});
test('daily sync remains off with no opt-in and never reads settings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vcp-r10-off-'));assert.equal(await dailyConnection({appDataRoot:root,readSettings:()=>assert.fail('settings read while disabled')}),null);assert.deepEqual(await fs.readdir(root),[]);
});
test('daily mode binds the approved server, selection and protected loopback; credentials never enter connection file',async()=>{
 const f=await fixture();await f.write();const result=await dailyConnection({appDataRoot:f.root,readSettings:settings});assert.equal(result.url,f.config.transportUrl);assert.equal(result.token,'synthetic-existing-desktop-key');assert.equal((await fs.readFile(path.join(f.root,'.native-sync/connection.json'),'utf8')).includes(result.token),false);
 for(const url of ['http://remote.invalid:1234','https://127.0.0.1:1234','http://127.0.0.1:1234/?secret=x']){f.config.transportUrl=url;await f.write();await assert.rejects(dailyConnection({appDataRoot:f.root,readSettings:settings}),e=>e.code==='PROTECTED_DESKTOP_TRANSPORT_REQUIRED');}
 f.config.transportUrl='http://127.0.0.1:53218';f.config.serverUrl='http://other.invalid';await f.write();await assert.rejects(dailyConnection({appDataRoot:f.root,readSettings:settings}),e=>e.code==='DESKTOP_BACKEND_IDENTITY_MISMATCH');
});
test('first import identifies identical history without mutating source or central state',async()=>{
 const f=await fixture(),before=await fs.readFile(f.historyFile);let requests=0;
 const proof=await initialImport({queue:f.queue,appDataRoot:f.root,connection:f.config,request:async route=>{requests++;assert.match(route,/^\/api\/v1\/sync\/pull\?/);return {events:[{...wire,msgId:'old-id',seq:1,action:'upsert',message:f.history[0],hash:messageHash(f.history[0])}],headSeq:1,hasMore:false};}});
 assert.equal(requests,1);assert.equal(proof.identicalRemoteMessages,1);assert.equal(proof.newLocalMessages,0);assert.equal(proof.centralWritten,false);assert.deepEqual(await fs.readFile(f.historyFile),before);assert.deepEqual(await fs.readdir(path.join(f.root,'.native-sync')),[]);
});
test('first import refuses changed approved files before any network, and refuses remote conflicts/tombstones/other owners',async()=>{
 const f=await fixture();await fs.appendFile(f.historyFile,' ');await assert.rejects(initialImport({queue:f.queue,appDataRoot:f.root,connection:f.config,request:()=>assert.fail('network before source approval check')}),e=>e.code==='APPROVED_HISTORY_CHANGED');await fs.writeFile(f.historyFile,JSON.stringify(f.history));
 for(const variant of ['conflict','deleted','other']){
  const event={...wire,msgId:'old-id',seq:1,action:'upsert',message:{...f.history[0],content:variant},hash:null};event.hash=messageHash(event.message);
  if(variant==='deleted'){event.action='delete';event.hash=tombstoneHash(event);delete event.message;}
  if(variant==='other')event.ownerId='unselected-owner';
  await assert.rejects(initialImport({queue:f.queue,appDataRoot:f.root,connection:f.config,request:async()=>({events:[event],headSeq:1,hasMore:false})}),e=>['INITIAL_IMPORT_CONTENT_CONFLICT','INITIAL_IMPORT_REMOTE_TOMBSTONE','CENTRAL_CONTAINS_UNSELECTED_TOPICS'].includes(e.code));
 }
});
test('catalog projection retains old IDs and exposes no Agent prompt, provider configuration or filesystem path',async()=>{
 const f=await fixture();const result=await catalog({appDataRoot:f.root,topics:[topic],readAgentConfig:async()=>({name:'Existing Agent',topics:[{id:topic.topicId,name:'Existing history'}],systemPrompt:'PRIVATE_PROMPT_MARKER',apiKey:'PRIVATE_KEY_MARKER',providerUrl:'PRIVATE_PROVIDER_MARKER'})});
 assert.equal(result.topics[0].ownerId,topic.itemId);assert.equal(result.topics[0].topicId,topic.topicId);const text=JSON.stringify(result);for(const value of ['PRIVATE_PROMPT','PRIVATE_KEY','PRIVATE_PROVIDER',f.root])assert.equal(text.includes(value),false);
});
test('automatic desktop tunnel refuses another SSH host or public target before launching a process',async()=>{
 const {openSshTransport}=require('../modules/services/nativeSync/sshTransport');
 await assert.rejects(openSshTransport({url:'http://127.0.0.1:28888',ssh:{alias:'another-host',remotePort:8888}}),e=>e.code==='UNAPPROVED_SSH_TRANSPORT');
 await assert.rejects(openSshTransport({url:'http://public.invalid:28888',ssh:{alias:'wp08',remotePort:8888}}),e=>e.code==='UNAPPROVED_SSH_TRANSPORT');
});

test('desktop SSH requests use verified TLS with the public hostname and never fall back to HTTP',async t=>{
 const {requestOverTls}=require('../modules/services/nativeSync/sshTransport');
 await assert.rejects(requestOverTls({port:1,token:'synthetic',route:'http://other.invalid'}),e=>e.code==='UNAPPROVED_SYNC_ROUTE');
 const cp=require('node:child_process'),https=require('node:https'),util=require('node:util');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vcp-r10-tls-client-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cert=path.join(root,'cert.crt'),key=path.join(root,'private.key');
 cp.execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=wp10.unicorn.org.cn','-addext','subjectAltName=DNS:wp10.unicorn.org.cn','-keyout',key,'-out',cert],{stdio:'ignore'});
 let accepted=0;const server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(q,r)=>{accepted++;assert.equal(q.headers.host,'wp10.unicorn.org.cn:13848');assert.equal(q.headers.authorization,'Bearer synthetic-tls-client-key');r.setHeader('Content-Type','application/json');r.end('{"ok":true}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const port=server.address().port;
 await assert.rejects(requestOverTls({port,token:'synthetic-tls-client-key',route:'/api/v1/sync/status'}),e=>e.code==='NETWORK_UNAVAILABLE');assert.equal(accepted,0);
 const script="require(process.argv[1]).requestOverTls({port:Number(process.argv[2]),token:'synthetic-tls-client-key',route:'/api/v1/sync/status'}).then(x=>process.stdout.write(JSON.stringify(x))).catch(()=>process.exit(1))";
 const result=await util.promisify(cp.execFile)(process.execPath,['-e',script,require.resolve('../modules/services/nativeSync/sshTransport'),String(port)],{env:{...process.env,NODE_EXTRA_CA_CERTS:cert},timeout:10000});assert.deepEqual(JSON.parse(result.stdout),{ok:true});assert.equal(accepted,1);
});
