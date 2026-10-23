'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const source=path.resolve(process.env.VCP_FINAL_P1_SOURCE||path.join(__dirname,'..'));
const req=createRequire(path.join(source,'package.json'));
const {HistoryMutationQueue}=req('./modules/services/historyMutationQueue');
const {NativeSyncAdapter}=req('./modules/services/nativeSync/adapter');
const {messageKey,messageHash}=req('./modules/services/nativeSync/protocol');
const quiet={log(){},warn(){},error(){}};
const topic={itemId:'synthetic-agent',itemType:'agent',topicId:'shared'};
function load(relative,overrides=new Map(),globals={}){
 const file=path.join(source,relative),mod={exports:{}},fallback=createRequire(file);
 return fs.readFile(file,'utf8').then(code=>{
  vm.runInNewContext('(function(require,module,exports,__dirname){'+code+'\n})',{console:quiet,Buffer,URL,TextDecoder,TextEncoder,fetch,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,process,...globals},{filename:file})(n=>overrides.has(n)?overrides.get(n):fallback(n),mod,mod.exports,path.dirname(file));return mod.exports;
 });
}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'final-p1-')),userDataDir=path.join(root,'UserData');
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const queue=new HistoryMutationQueue({userDataDir,logger:quiet});t.after(()=>queue.dispose());
 const history=[{id:'old',role:'user',content:'synthetic original',timestamp:1}];
 await fs.mkdir(path.dirname(queue.getHistoryPath(topic.itemId,topic.topicId)),{recursive:true});await fs.writeFile(queue.getHistoryPath(topic.itemId,topic.topicId),JSON.stringify(history));
 const config={name:'Synthetic',topics:[{id:'shared'},{id:'other'}]};
 const AGENT_DIR=path.join(root,'Agents');await fs.mkdir(path.join(AGENT_DIR,topic.itemId),{recursive:true});await fs.writeFile(path.join(AGENT_DIR,topic.itemId,'config.json'),JSON.stringify(config));
 const manager={readAgentConfig:async()=>structuredClone(config),updateAgentConfig:async(_id,fn)=>{Object.assign(config,fn(structuredClone(config)));return structuredClone(config);}};
 const routes=new Map(),ipcMain={handle:(n,f)=>routes.set(n,f),removeHandler(){},on(){}};
 const trajectory={clearTrajectoriesOfOwner:async()=>{},clearTrajectoryOf:async()=>{},beginTrajectoryCall:()=>({}),sessionKeyFromContext(){},sourceFromContext(){}};
 const common=new Map([['electron',{ipcMain,dialog:{},BrowserWindow:{}}],['../modelTrajectory',trajectory]]);
 const agent=await load('modules/ipc/agentHandlers.js',new Map([...common,['../services/agentPortraitImages',{forgetPortraitDisplayImages:async()=>{}}]]));
 agent.initialize({AGENT_DIR,USER_DATA_DIR:userDataDir,agentConfigManager:manager,historyMutationQueue:queue});
 const chat=await load('modules/ipc/chatHandlers.js',new Map([...common,['../services/attachmentDialogState',{}],['../../Groupmodules/topicTitleManager',{}],['./workspaceHandlers',{}],['./sideChatHandlers',{removeSideChatChildrenOfParent:async()=>{}}]]));
 chat.initialize(null,{AGENT_DIR,USER_DATA_DIR:userDataDir,APP_DATA_ROOT_IN_PROJECT:root,agentConfigManager:manager,historyMutationQueue:queue});
 return {root,queue,history,config,call:(name,...args)=>routes.get(name)({},...args)};
}
test('shared Topic/Agent delete IPC refuses before any config/history change, including concurrent Queue work',async t=>{
 const f=await fixture(t);f.queue.configureSync({topics:[topic]});
 let release;const gate=new Promise(r=>release=r),pending=f.queue.run(topic,()=>gate);
 const before=await fs.readFile(f.queue.getHistoryPath(topic.itemId,topic.topicId));
 try{for(const [name,args]of [['delete-topic',[topic.itemId,topic.topicId]],['delete-agent',[topic.itemId]]]){
  const result=await f.call(name,...args);assert.equal(result.code,'SYNC_WRITER_EXCLUDED');
  assert.deepEqual(await fs.readFile(f.queue.getHistoryPath(topic.itemId,topic.topicId)),before);assert.equal(f.config.topics.length,2);
 }}finally{release();await pending;}
});
test('nonshared Topic delete and NativeSync-off Agent delete preserve original behavior',async t=>{
 const f=await fixture(t);f.queue.configureSync({topics:[topic]});
 assert.equal((await f.call('delete-topic',topic.itemId,'other')).success,true);
 f.queue.configureSync();assert.equal((await f.call('delete-agent',topic.itemId)).success,true);
 await assert.rejects(fs.stat(path.join(f.queue.userDataDir,topic.itemId)),e=>e.code==='ENOENT');
});
test('cached daily state starts offline, captures durable Outbox under writer exclusion, then reconnects exactly once',async t=>{
 const f=await fixture(t),statePath=path.join(f.root,'.native-sync/state.json'),wire={ownerType:'agent',ownerId:topic.itemId,topicId:topic.topicId,msgId:'old'};
 await fs.mkdir(path.dirname(statePath),{recursive:true});await fs.writeFile(statePath,JSON.stringify({version:1,deviceId:'synthetic-device',topics:[topic],cursor:1,acked:{[messageKey(wire)]:{hash:messageHash(f.history[0]),deleted:false,seq:1}},outbox:[],pending:null}));
 let online=false,registrations=0,pushes=0,catalogs=0,closed=false;const operations=new Map();
 const daily={url:'http://127.0.0.1:1',deviceId:'synthetic-device',token:'synthetic-key',topics:[topic],ssh:{alias:'wp08',remotePort:8888},registerCredential:async()=>{registrations++;if(!online)throw Object.assign(Error(),{code:'SSH_TRANSPORT_UNAVAILABLE'});}};
 const runtime=await load('modules/services/nativeSync/runtime.js',new Map([
  ['./dailyConnection',{dailyConnection:async()=>daily}],
  ['./sshTransport',{openSshTransport:async options=>{if(!online&&options.background!==true)throw Object.assign(Error(),{code:'SSH_TRANSPORT_UNAVAILABLE'});return {close:async()=>{closed=true;},request:async(route,{body}={})=>{
   if(!online)throw Object.assign(Error(),{code:'NETWORK_UNAVAILABLE'});
   if(route.endsWith('/catalog')){catalogs++;return {published:1};}
   if(route.endsWith('/push')){pushes++;let result=operations.get(body.opId);if(!result){result={seq:operations.size+2,hash:messageHash(body.message),deleted:false};operations.set(body.opId,result);}return result;}
   return {events:[],headSeq:operations.size+1,nextSeq:operations.size+1,hasMore:false};
  }}}}],
 ]));
 const running=await runtime.createNativeSyncRuntime({queue:f.queue,appDataRoot:f.root,readAgentConfig:async()=>f.config,intervalMs:10});t.after(()=>running.close());
 assert.equal(f.queue.isSyncEnabled(topic),true);
 assert.equal((await f.call('delete-topic',topic.itemId,topic.topicId)).code,'SYNC_WRITER_EXCLUDED');
 await f.queue.mutate(topic,h=>[...h,{id:'offline',role:'user',content:'saved offline',timestamp:2}]);
 assert.equal(JSON.parse(await fs.readFile(statePath,'utf8')).outbox.length,1);
 await new Promise(r=>setTimeout(r,35));assert.equal(pushes,0);assert.ok(running.adapter.degraded);
 online=true;const end=Date.now()+1500;while(running.adapter.state.outbox.length||catalogs===0||running.adapter.state.cursor!==2||running.adapter.busy){assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,10));}
 assert.equal(operations.size,1);assert.equal(pushes,1);assert.equal(running.adapter.state.cursor,2);assert.equal(running.adapter.state.pending,null);assert.ok(registrations>=2);
 await running.close();assert.equal(closed,true);
});
test('deferred sealed credential avoids startup SSH and reuses the same identity for retries',async t=>{
 const f=await fixture(t),{desktopCredential}=req('./modules/services/nativeSync/desktopCredential');await fs.mkdir(path.join(f.root,'.native-sync'),{recursive:true});
 const connection={credentialSource:'desktop-sync-session',serverUrl:'http://wp10.unicorn.org.cn:13546',ssh:{alias:'wp08',remotePort:8888},deviceId:'synthetic',topics:[topic]};
 // Synthetic reversible fixture only; real runtime continues using Electron safeStorage.
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('sealed:'+s),decryptString:b=>b.toString().slice(7)};
 let calls=0,first;const register=async grant=>{calls++;if(first)assert.equal(grant.token,first);first=grant.token;throw Object.assign(Error(),{code:'NETWORK_UNAVAILABLE'});};
 const a=await desktopCredential({appDataRoot:f.root,connection,safeStorage,register,deferRegistration:true});assert.equal(calls,0);
 await assert.rejects(a.register(),e=>e.code==='NETWORK_UNAVAILABLE');const b=await desktopCredential({appDataRoot:f.root,connection,safeStorage,register,deferRegistration:true});assert.equal(b.token,a.token);await assert.rejects(b.register());assert.equal(calls,2);
});
test('daily launcher starts Electron while its model SSH is offline, without waiting for a listener',async()=>{
 const children=[],writes=new Map();const spawn=(exe,args)=>{const child=new EventEmitter();child.pid=100+children.length;child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{};children.push({exe,args,child});return child;};
 const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{argv:['node','launcher','synthetic-data-root'],env:{},pid:99});
 let now=0;class Clock extends Date{static now(){now+=30000;return now;}}
 const net={createConnection:()=>{const socket=new EventEmitter();socket.setTimeout=()=>{};socket.destroy=()=>{};queueMicrotask(()=>socket.emit('error',Error('synthetic offline')));return socket;}};
 await load('scripts/launch-r10-client.cjs',new Map([['node:child_process',{spawn}],['node:fs',{writeFileSync:(p,v)=>writes.set(p,v)}],['node:net',net]]),{process:fakeProcess,Date:Clock});
 await new Promise(r=>setImmediate(r));assert.equal(children.length,2);assert.equal(children[0].exe,'ssh');assert.match(children[1].exe,/electron/);
 children[0].child.emit('exit',255);children[1].child.emit('exit',0,null);assert.ok([...writes.keys()].some(p=>p.endsWith('LAST_EXIT.json')));
});
test('background SSH verifies the same TLS host/service identity before sending any device token',async()=>{
 const calls=[];let correct=false;const child=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>queueMicrotask(()=>child.emit('exit',0));child.kill=()=>{};
 const https={request:(options,callback)=>{
  calls.push(options);assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'dnvcp.skmt617.top');
  const request=new EventEmitter();request.setTimeout=()=>{};request.end=()=>queueMicrotask(()=>{
   const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};callback(response);
   response.emit('data',JSON.stringify(options.path==='/healthz'?{service:correct?'VCPMobileGateway':'other-service',port:8888,httpsReady:true}:{events:[]}));response.emit('end');
  });return request;
 }};
 const {openSshTransport}=await load('modules/services/nativeSync/sshTransport.js',new Map([['node:https',https],['node:child_process',{spawn:()=>child}]]));
 const transport=await openSshTransport({url:'http://127.0.0.1:12345',ssh:{alias:'wp08',remotePort:8888},token:'synthetic-scoped-token',background:true});
 try{
  assert.equal(calls.length,0);await assert.rejects(transport.request('/api/v1/sync/pull'),e=>e.code==='SSH_TRANSPORT_UNAVAILABLE');
  assert.equal(calls.length,1);assert.equal(calls[0].headers.Authorization,undefined);
  correct=true;await transport.request('/api/v1/sync/pull');assert.equal(calls[1].path,'/healthz');assert.equal(calls[2].headers.Authorization,'Bearer synthetic-scoped-token');
 }finally{await transport.close();}
});
