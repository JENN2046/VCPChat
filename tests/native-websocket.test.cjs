'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const clientInstanceId='00000000-0000-4000-8000-000000000001';
const {createNativeWebSocketClient}=require('../modules/services/trustedConversation/webSocket.cjs');
const {createNativeTransport}=require('../modules/services/trustedConversation/transport.cjs');
function socket(){return Object.assign(new EventEmitter(),{readyState:1,url:'ws://127.0.0.1:12345',frames:[],send(text){this.frames.push(JSON.parse(text));}});}
test('native requests correlate same socket only; ordinary tool results cannot satisfy',async()=>{const c=createNativeWebSocketClient(),s=socket(),other=socket();c.bind(s);const p=c.request({clientInstanceId,toolName:'Example',authorization:'Bearer synthetic',body:{action:'status',payload:{}}});const id=s.frames[0].requestId;assert.equal(c.receive(s,{type:'tool_result',requestId:id}),false);c.receive(other,{type:'native_conversation_response',requestId:id,result:{ok:false}});c.receive(s,{type:'native_conversation_response',requestId:id,result:{ok:true}});assert.deepEqual(await p,{ok:true});c.close(s);});
test('disconnect rejects pending, new socket receives no replay; correlation namespace persists',async()=>{const c=createNativeWebSocketClient(),s=socket();c.bind(s);const p=c.request({clientInstanceId,body:{action:'execute',payload:{sourceId:'synthetic'}}});const denied=assert.rejects(p,/UNAVAILABLE/);s.emit('close');await denied;const next=socket();c.bind(next);assert.equal(next.frames.length,0);const q=c.request({clientInstanceId,body:{action:'recover',payload:{}}});assert.equal(next.frames[0].sessionId,s.frames[0].sessionId);c.receive(next,{type:'native_conversation_response',requestId:next.frames[0].requestId,result:{ok:true}});await q;c.close(next);});
test('timeout is unknown, late response ignored and not resent',async()=>{const c=createNativeWebSocketClient({timeoutMs:5}),s=socket();c.bind(s);await assert.rejects(c.request({clientInstanceId,body:{action:'execute',payload:{}}}),/UNKNOWN/);assert.equal(s.frames.length,1);c.receive(s,{type:'native_conversation_response',requestId:s.frames[0].requestId,result:{ok:true}});c.close(s);});
test('websocket binding does not consume model API settings or HTTP transport key',async()=>{let request;const t=createNativeTransport({binding:{transport:'vcp-websocket',clientInstanceId,toolName:'Example',applicationAuthorizationEnv:'OWNER'},env:{OWNER:'Bearer '+'x'.repeat(40)},nativeRequest:async r=>{request=r;return {ok:true};}});assert.deepEqual(await t.request('status'),{ok:true});assert.equal(request.body.action,'status');assert.equal(request.toolName,'Example');assert.equal(request.authorization,'Bearer '+'x'.repeat(40));});

test('stable non-secret client binding survives a fresh main process',async()=>{const a=createNativeWebSocketClient(),b=createNativeWebSocketClient(),s=socket(),u=socket();a.bind(s);b.bind(u);const x=a.request({clientInstanceId,body:{action:'recover',payload:{}}}),y=b.request({clientInstanceId,body:{action:'recover',payload:{}}});assert.equal(s.frames[0].sessionId,u.frames[0].sessionId);for(const [c,w] of [[a,s],[b,u]])c.receive(w,{type:'native_conversation_response',requestId:w.frames[0].requestId,result:{ok:true}});await Promise.all([x,y]);a.close(s);b.close(u);});

test('public plaintext WS never receives application authorization',async()=>{const c=createNativeWebSocketClient(),s=socket();s.url='ws://example.invalid';c.bind(s);await assert.rejects(c.request({clientInstanceId,authorization:'Bearer synthetic',body:{action:'status',payload:{}}}),/SECURE_CHANNEL/);assert.equal(s.frames.length,0);c.close(s);});

test('WS failure never falls back to the separately configured HTTP path',async()=>{
 let httpCalls=0;const t=createNativeTransport({binding:{transport:'vcp-websocket',clientInstanceId,toolboxUrl:'http://127.0.0.1:1',transportTokenEnv:'KEY',toolName:'Example',applicationAuthorizationEnv:'OWNER'},env:{OWNER:'Bearer '+'x'.repeat(40),KEY:'synthetic'},fetchImpl:async()=>{httpCalls++;throw Error('unexpected HTTP');},nativeRequest:async()=>{throw Error('NATIVE_RESULT_UNKNOWN');}});
 await assert.rejects(t.request('execute',{sourceId:'synthetic'}),/NATIVE_RESULT_UNKNOWN/);assert.equal(httpCalls,0);
});

test('disconnect immediately retires the epoch; a late old close cannot retire a replacement',()=>{const c=createNativeWebSocketClient(),old=socket(),next=socket();c.bind(old);const before=c.epoch();old.emit('close');assert.ok(c.epoch()>before);c.bind(next);const current=c.epoch();old.emit('close');assert.equal(c.epoch(),current);c.close(next);});

// Combined lifecycle regressions: actual IPC/transport/port plus renderer send body;
// window, socket, DOM and persistence are isolated synthetic fixtures.
{
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),file=path.join(root,'modules/ipc/nativeConversationHandlers.js'),base=createRequire(file),source=fs.readFileSync(file,'utf8');
const AF=Object.getPrototypeOf(async()=>{}).constructor;
async function renderer(result,options={}){
 const s=fs.readFileSync(path.join(root,'modules/chatManager.js'),'utf8').replaceAll('\r\n','\n');
 const chunk=s.slice(s.indexOf('        let stopNativeDraftObservation;'),s.indexOf('        const thinkingMessageId',s.indexOf('        let nativeResult = null;')));
 const cleanup=s.slice(s.indexOf('        } finally {\n            stopNativeDraftObservation?.();'),s.indexOf('    async function createNewTopicForItem')).trim().replace(/}$/, '');
 const run=new AF('result','options',`const history=[...(options.history||[])],toasts=[],rendered=[],listeners=new Set();let current=[],active=true,executes=0,itemSelectionGeneration=0,topicSelectionGeneration=0;const pendingSendContexts=new Set(),sendSignature='A:T',request=null,attachedFiles=[],content='把合成排期延后1分钟',currentSelectedItem={id:'A',type:'agent',name:'fixture'},currentTopicId='T',globalSettings={vcpServerUrl:'http://unused.invalid'},sendContext={topicId:'T'},messageInput={value:content,addEventListener:(_k,f)=>listeners.add(f),removeEventListener:(_k,f)=>listeners.delete(f)},input=messageInput;let attachments=attachedFiles;const attachedFilesRef={get:()=>attachments,set:v=>attachments=v},mainRendererFunctions={},isCanvasWindowOpen=false,itemListManager=null;const controls={input,edit(value){input.value=value;for(const f of listeners)f();},switchTopic(){active=false;topicSelectionGeneration++;},returnTopic(){active=true;topicSelectionGeneration++;},attach(){attachments=[{synthetic:true}];}},uiHelper={showToastNotification:m=>toasts.push(m),autoResizeTextarea(){}},notifySendState=()=>{},setNextUiEmptyStateActive=()=>{},isSendContextCurrent=()=>active,sendHistoryRef={get:()=>current,set:v=>current=v},renderTarget={renderMessage:async m=>{rendered.push(m);return {remove(){}}}},persistOutgoingUserMessage=async(c,m)=>{if(m.role==='user')await options.beforeSave?.(controls);history.push({...m,topic:c.topicId});if(m.role==='user')await options.afterSave?.(controls);return history},electronAPI={prepareNativeConversation:async()=>{const pending=typeof result==='function'?result():result;await options.preparing?.(controls);return pending;},setTopicUnread:async()=>{await options.unread?.(controls);return {success:true};},executeNativeConversation:async p=>{executes++;if(!options.execute)throw Error('unexpected execute');return options.execute(p,controls);}};async function send(){${chunk}${cleanup}}const returned=await send();return {returned,input:input.value,history:history.map(m=>({role:m.role,content:m.content,topic:m.topic})),toasts,executes,listeners:listeners.size};`);
 return run(result,options);
}
async function ipc(mode){
 const handlers=new Map(),m={exports:{}},client=createNativeWebSocketClient();let prepareSent;
 const entered=new Promise(r=>prepareSent=r),socket=Object.assign(new EventEmitter(),{readyState:1,url:'ws://127.0.0.1:12345',send(text){const r=JSON.parse(text);if(r.body.action==='prepare'){prepareSent();return;}client.receive(socket,{type:'native_conversation_response',requestId:r.requestId,result:{ok:true}});}});
 client.bind(socket);
 const req=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:o=>createNativeTransport({...o,env:{SYNTHETIC:'Bearer '+'x'.repeat(40)}})}:p.includes('ChartControllerService')?{initialize(){}}:base(p);
 vm.runInNewContext(source,{require:req,module:m,exports:m.exports,process:{env:{}},setInterval:()=>({unref(){}}),clearInterval(){}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>({eligible:true,text:'把合成排期延后1分钟',conversationId:'A:T'});
 await m.exports.initialize({mainWindow:{webContents:wc,isDestroyed:()=>false,isFocused:()=>true},binding:{transport:'vcp-websocket',toolName:'Fixture',clientInstanceId:'00000000-0000-4000-8000-000000000001',applicationAuthorizationEnv:'SYNTHETIC'},nativeEpoch:client.epoch,nativeRequest:mode==='late-success'?async r=>{if(r.body.action==='prepare'){socket.emit('close');return {ok:true,handled:true,sourceId:'stale'};}return {ok:true};}:mode==='same-epoch-error'?async r=>{if(r.body.action==='prepare')throw Error('synthetic unavailable');return {ok:true};}:client.request});
 if(mode==='before')socket.emit('close');
 wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});
 const pending=handlers.get('native-conversation:prepare')({sender:wc,senderFrame:wc.mainFrame},{text:'把合成排期延后1分钟',conversationId:'A:T'});
 if(mode==='inflight'){await entered;socket.emit('close');}
 const result=await pending;wc.emit('destroyed');client.close(socket);return {ipc:result,renderer:await renderer(result)};
}
// Exercise the actual startup connect method: IPC exists before the distributed
// client, bind occurs while CONNECTING, and open does not advance its epoch.
async function lifecycle(t,options={}){
 const handlers=new Map(),m={exports:{}},frames=[],sockets=[],timers=new Set();let distributed=null,disposed=false;
 const req=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:o=>createNativeTransport({...o,env:{SYNTHETIC:'Bearer '+'x'.repeat(40)}})}:p.includes('ChartControllerService')?{initialize(){}}:base(p);
 vm.runInNewContext(source,{require:req,module:m,exports:m.exports,process:{env:{}},setInterval(fn){timers.add(fn);return {unref(){}};},clearInterval(){timers.clear();}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>({eligible:true,text:'把合成排期延后1分钟',conversationId:'A:T'});
 const event={sender:wc,senderFrame:wc.mainFrame},invoke=(action,p={})=>handlers.get('native-conversation:'+action)(event,p);
 await m.exports.initialize({mainWindow:{webContents:wc,isDestroyed:()=>disposed,isFocused:()=>true},binding:{transport:'vcp-websocket',toolName:'Fixture',clientInstanceId,applicationAuthorizationEnv:'SYNTHETIC'},nativeEpoch:()=>distributed?.nativeConversationClient?.epoch()??0,nativeRequest:r=>{if(!distributed?.nativeConversationClient)throw Error('NATIVE_TRANSPORT_UNAVAILABLE');return distributed.nativeConversationClient.request(r);}});
 const code=fs.readFileSync(path.join(root,'VCPDistributedServer/VCPDistributedServer.js'),'utf8');
 const connectSource=code.slice(code.indexOf('    connect() {'),code.indexOf('    scheduleReconnect()',code.indexOf('    connect() {')));
 class Wire extends EventEmitter{
  constructor(url){super();this.url=url;this.readyState=0;sockets.push(this);}
  send(text){const frame=JSON.parse(text);frames.push(frame);const reply=result=>distributed.nativeConversationClient.receive(this,{type:'native_conversation_response',requestId:frame.requestId,result});
   if(options.onFrame?.(frame,{reply,wire:this})===true)return;
   reply(frame.body.action==='prepare'?{ok:true,handled:true,sourceId:frame.body.payload.messageId}:frame.body.action==='execute'?{ok:true,committed:true,operationId:'synthetic-operation'}:frame.body.action==='recover'?{ok:true,results:[{ok:true,committed:true,operationId:'synthetic-operation'}]}:{ok:true});
  }
 }
 const connect=new Function('console','WebSocket','require',`return ({${connectSource.trim()}}).connect;`)({log(){},warn(){},error(){}},Wire,p=>p.endsWith('/webSocket.cjs')?{createNativeWebSocketClient,isSecureNativeWebSocketUrl:()=>true}:base(p));
 distributed={mainServerUrl:'http://127.0.0.1:12345',vcpKey:'synthetic',nativeConversationWebSocket:true,registerTools(){},async reportIPAddress(){},async pushMusicPlaylistUpdate(){},setupStaticPlaceholderUpdates(){},clearStaticPlaceholderUpdates(){},scheduleReconnect(){}};
 const bind=()=>{connect.call(distributed);return distributed.ws;},open=()=>{distributed.ws.readyState=1;distributed.ws.emit('open');};
 const close=()=>{distributed.ws.readyState=3;distributed.ws.emit('close');};
 const capture=()=>wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});
 t.after(()=>{disposed=true;wc.emit('destroyed');distributed.nativeConversationClient?.close(distributed.ws);});
 return {frames,invoke,bind,open,close,capture,epoch:()=>distributed.nativeConversationClient?.epoch()??0,reconnect(){close();bind();open();},async tick(){for(const fn of timers)await fn();},async prepare(){capture();return invoke('prepare',{text:'把合成排期延后1分钟',conversationId:'A:T'});}};
}
test('real distributed startup binds after IPC: first open and first physical send succeed',async t=>{
 const f=await lifecycle(t);assert.equal(f.epoch(),0);f.bind();assert.equal(f.epoch(),1);f.open();assert.equal(f.epoch(),1);
 const r=await renderer(()=>f.prepare(),{execute:p=>f.invoke('execute',p)});assert.equal(r.returned.committed,true);assert.equal(r.input,'');assert.equal(f.frames.filter(x=>x.body.action==='execute').length,1);assert.equal(r.listeners,0);
});
test('failed first connect followed by replacement is not treated as initial bind',async t=>{
 const f=await lifecycle(t);f.bind();f.close();f.bind();f.open();assert.ok(f.epoch()>1);
 const r=await renderer(()=>f.prepare());assert.equal(r.returned.code,'NATIVE_CONNECTION_CHANGED');assert.equal(r.input,'把合成排期延后1分钟');assert.equal(r.history.length,0);assert.equal(f.frames.filter(x=>['prepare','execute'].includes(x.body.action)).length,0);
});
for(const boundary of ['direct','timer','invalidation'])test('prepare to execute '+boundary+' retains exact draft and unrelated history with zero dispatch',async t=>{
 const f=await lifecycle(t);f.bind();f.open();const history=[{role:'assistant',content:'unrelated history',topic:'other'}];
 const r=await renderer(()=>f.prepare(),{history,async afterSave(){if(boundary==='invalidation')await f.invoke('invalidate',{conversationId:'A:T'});else{f.reconnect();if(boundary==='timer')await f.tick();}},execute:p=>f.invoke('execute',p)});
 assert.equal(r.returned.dispatched,false);assert.equal(r.returned.preserveInput,true);assert.equal(r.input,'把合成排期延后1分钟');assert.equal(r.history.length,3);assert.deepEqual(r.history[0],history[0]);assert.deepEqual(r.history.slice(1).map(x=>x.topic),['T','T']);assert.match(r.history[2].content,/本次未派发/);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,0);assert.equal(r.listeners,0);
 const source=f.frames.find(x=>x.body.action==='prepare').body.payload.messageId;assert.equal((await f.invoke('execute',{sourceId:source})).code,'SOURCE_UNKNOWN');
});
test('failed durable user save leaves draft, prior history and zero execute',async t=>{
 const f=await lifecycle(t);f.bind();f.open();const r=await renderer(()=>f.prepare(),{history:[{role:'assistant',content:'other',topic:'other'}],beforeSave(){throw Error('synthetic disk full');},execute:p=>f.invoke('execute',p)});
 assert.equal(r.input,'把合成排期延后1分钟');assert.equal(r.history.length,1);assert.equal(r.executes,0);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,0);assert.equal(r.listeners,0);
});
for(const change of ['same-text','topic-return'])test('prepare wait preserves replacement draft: '+change,async t=>{
 let deliver,entered;const started=new Promise(r=>entered=r);const f=await lifecycle(t,{onFrame(frame,{reply}){if(frame.body.action==='prepare'){deliver=()=>reply({ok:true,handled:true,sourceId:frame.body.payload.messageId});entered();return true;}}});f.bind();f.open();
 const r=await renderer(()=>f.prepare(),{async preparing(controls){await started;if(change==='same-text'){controls.edit('new draft');controls.edit('把合成排期延后1分钟');}else{controls.switchTopic();controls.returnTopic();}deliver();},execute:p=>f.invoke('execute',p)});
 assert.equal(r.returned.committed,true);assert.equal(r.input,'把合成排期延后1分钟');assert.equal(r.listeners,0);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,1);
});
for(const stage of ['beforeSave','afterSave','unread'])test('edit then restore identical text during '+stage+' is a new draft',async t=>{
 const f=await lifecycle(t);f.bind();f.open();const r=await renderer(()=>f.prepare(),{[stage](controls){controls.edit('new draft');controls.edit('把合成排期延后1分钟');},execute:p=>f.invoke('execute',p)});
 assert.equal(r.returned.committed,true);assert.equal(r.input,'把合成排期延后1分钟');assert.equal(r.listeners,0);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,1);
});
test('after-dispatch disconnect consumes original draft; recover and replay never execute again',async t=>{
 const f=await lifecycle(t,{onFrame(frame,{wire}){if(frame.body.action==='execute'){wire.readyState=3;wire.emit('close');return true;}}});f.bind();f.open();
 const r=await renderer(()=>f.prepare(),{execute:p=>f.invoke('execute',p)});assert.equal(r.returned.code,'RESULT_UNKNOWN');assert.equal(r.input,'');assert.match(r.history.at(-1).content,/不要重复提交/);assert.equal(r.listeners,0);
 f.bind();f.open();await f.tick();await f.tick();const source=f.frames.find(x=>x.body.action==='prepare').body.payload.messageId;const replay=await f.invoke('execute',{sourceId:source});assert.equal(replay.code,'SOURCE_UNKNOWN');assert.equal(replay.dispatched,undefined);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,1);assert.equal(f.frames.filter(x=>x.body.action==='recover').length,2);
});
test('host cannot label a dispatched reply as a retryable original draft',async t=>{
 const f=await lifecycle(t,{onFrame(frame,{reply}){if(frame.body.action==='execute'){reply({ok:false,preserveInput:true,dispatched:false,code:'SYNTHETIC_HOST_ERROR'});return true;}}});f.bind();f.open();
 const r=await renderer(()=>f.prepare(),{execute:p=>f.invoke('execute',p)});assert.equal(r.returned.dispatched,true);assert.equal(r.returned.preserveInput,false);assert.equal(r.input,'');assert.equal(r.listeners,0);
});
for(const change of ['new-text','same-text','attachment','topic','topic-return'])test('pending execute preserves user '+change+' and saves reply only in original topic',async t=>{
 let deliver;const f=await lifecycle(t,{onFrame(frame,{reply}){if(frame.body.action==='execute'){deliver=()=>reply({ok:true,committed:true,operationId:'synthetic-operation'});return true;}}});f.bind();f.open();
 const r=await renderer(()=>f.prepare(),{history:[{role:'assistant',content:'other history',topic:'other'}],async execute(p,controls){const pending=f.invoke('execute',p);if(change.startsWith('topic')){controls.switchTopic();if(change==='topic-return')controls.returnTopic();}else if(change==='attachment')controls.attach();else controls.edit(change==='same-text'?'把合成排期延后1分钟':'new user draft');deliver();return pending;}});
 assert.equal(r.input,change==='new-text'?'new user draft':'把合成排期延后1分钟');assert.equal(r.history[0].content,'other history');assert.deepEqual(r.history.slice(1).map(x=>x.topic),['T','T']);assert.equal(f.frames.filter(x=>x.body.action==='execute').length,1);assert.equal(r.listeners,0);
});

async function startup(config, env={}, mainServerUrl='http://example.invalid') {
 const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
 const chunk=main.slice(main.indexOf('function startDistributedServerAfterRenderer()'),main.indexOf('function toggleDevToolsForWindow',main.indexOf('function startDistributedServerAfterRenderer()')));
 const distributed=fs.readFileSync(path.join(root,'VCPDistributedServer/VCPDistributedServer.js'),'utf8');
 const connectSource=distributed.slice(distributed.indexOf('    connect() {'),distributed.indexOf('    scheduleReconnect()',distributed.indexOf('    connect() {')));
 let reads=0,constructed=0,initialized=0,errors=0,wsEnabled=null,sockets=0;
 const logs=[],diagnostics={log(){},error:(...a)=>logs.push(a),warn:(...a)=>logs.push(a)};
 const connect=new Function('console','WebSocket','require',`return ({${connectSource.trim()}}).connect;`)(diagnostics,function(){sockets++;return new EventEmitter();},require);
 const realTransport=base('../services/trustedConversation/transport.cjs');
 const transport={validateNativeBinding:options=>realTransport.validateNativeBinding({...options,env}),createNativeTransport:options=>realTransport.createNativeTransport({...options,env,fetchImpl:async()=>({status:200,json:async()=>({ok:true})})})};
 const bindingModule={exports:{}},handlers=new Map();
 const req=p=>p==='node:fs'?{readFileSync(){reads++;if(config==='missing')throw Error('ENOENT');return config;}}:p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?transport:p.includes('ChartControllerService')?{initialize(){}}:base(p);
 vm.runInNewContext(source,{module:bindingModule,exports:bindingModule.exports,require:req,process:{env:config===undefined?{}:{VCPCHAT_NATIVE_TOOL_BINDING_FILE:'synthetic-binding'}},setInterval:()=>({unref(){}}),clearInterval(){}});
 const mainWindow={isDestroyed:()=>false,webContents:new EventEmitter()};
 await bindingModule.exports.initialize({mainWindow,nativeRequest:async()=>({ok:true})});
 const nativeCode=(await handlers.get('native-conversation:prepare')({},{})).code;
 const noop={},ctx={distributedServerStartPromise:null,distributedServer:null,isFinalizingQuit:false,app:{isQuitting:false},appSettingsManager:{readSettings:async()=>({enableDistributedServer:true,vcpLogUrl:mainServerUrl,vcpLogKey:'SYNTHETIC_KEY'})},mainWindow,console:{...diagnostics,error(){errors++;}},require:p=>p.endsWith('nativeConversationHandlers')?bindingModule.exports:p.endsWith('/transport.cjs')?transport:class{constructor(options){constructed++;wsEnabled=options.nativeConversationWebSocket;Object.assign(this,options);}async initialize(){initialized++;connect.call(this);}},musicHandlers:noop,diceHandlers:noop,desktopRemoteHandlers:noop,chatDataService:noop,loomManager:noop,scriptoriumAgentControl:noop,pluginAgentOperationService:noop,chartService:noop,gameService:noop,workspaceHandlers:noop};
 vm.createContext(ctx);vm.runInContext(chunk,ctx);await ctx.startDistributedServerAfterRenderer();await ctx.startDistributedServerAfterRenderer();
 mainWindow.webContents.emit('destroyed');ctx.distributedServer?.nativeConversationClient?.close(ctx.distributedServer.ws);
 assert.doesNotMatch(JSON.stringify(logs),/SYNTHETIC_KEY|Bearer |VCP_Key=/);
 return {reads,constructed,initialized,errors,wsEnabled,sockets,nativeCode,logs};
}

for(const mode of ['before','inflight','late-success'])test('prepare connection change retains draft without history: '+mode,async()=>{
 const r=await ipc(mode);assert.equal(r.ipc.code,'NATIVE_CONNECTION_CHANGED');assert.equal(r.ipc.preserveInput,true);assert.equal(r.ipc.sourceId,undefined);assert.equal(r.renderer.input,'把合成排期延后1分钟');assert.equal(r.renderer.history.length,0);assert.equal(r.renderer.toasts.length,1);
});
test('unchanged epoch transport failure keeps existing history semantics',async()=>{const r=await ipc('same-epoch-error');assert.equal(r.ipc.code,'NATIVE_TRANSPORT_UNAVAILABLE');assert.equal(r.renderer.input,'');assert.equal(r.renderer.history.length,2);});
const validBinding={transport:'vcp-websocket',clientInstanceId,toolName:'Fixture',applicationAuthorizationEnv:'OWNER'};
const validEnv={OWNER:'Bearer '+'x'.repeat(40)};
const invalidCases=[
 ['missing file','missing',{}],['bad JSON','{',{}],['null','null',{}],['array','[]',{}],['false','false',{}],
 ...['clientInstanceId','toolName'].flatMap(key=>[[`missing ${key}`,JSON.stringify({...validBinding,[key]:undefined}),validEnv],[`invalid ${key}`,JSON.stringify({...validBinding,[key]:'bad/value'}),validEnv]]),
 ...['-'.repeat(36),'a'.repeat(36),'0000000-00000-4000-8000-000000000001'].map((value,i)=>['malformed UUID '+i,JSON.stringify({...validBinding,clientInstanceId:value}),validEnv]),
 ['non-string client',JSON.stringify({...validBinding,clientInstanceId:[clientInstanceId]}),validEnv],
 ['non-string tool',JSON.stringify({...validBinding,toolName:123}),validEnv],
 ['missing bearer reference',JSON.stringify({...validBinding,applicationAuthorizationEnv:undefined}),validEnv],
 ['missing bearer value',JSON.stringify(validBinding),{}],
 ...['invalid','Bearer short','Bearer '+'x'.repeat(32)+'\n','Bearer '+'x'.repeat(4097)].map((value,i)=>['invalid bearer '+i,JSON.stringify(validBinding),{OWNER:value}]),
 ['HTTP bad URL',JSON.stringify({toolName:'Fixture',toolboxUrl:'bad'}),{}],
 ['HTTP remote URL',JSON.stringify({toolName:'Fixture',toolboxUrl:'http://example.invalid'}),{}],
 ['HTTP missing key',JSON.stringify({toolName:'Fixture',toolboxUrl:'http://127.0.0.1:1',applicationAuthorizationEnv:'OWNER'}),validEnv]
];
for(const [name,config,env] of invalidCases)test('invalid optional native configuration leaves ordinary connection available: '+name,async()=>{
 const r=await startup(config,env);assert.equal(r.constructed,1);assert.equal(r.initialized,1);assert.equal(r.errors,0);assert.equal(r.wsEnabled,false);assert.equal(r.sockets,1);assert.equal(r.nativeCode,'NATIVE_CONFIGURATION_UNAVAILABLE');
});
test('absent optional binding preserves ordinary distributed connection',async()=>{const r=await startup(undefined);assert.equal(r.wsEnabled,false);assert.equal(r.sockets,1);assert.equal(r.nativeCode,'NOT_CONFIGURED');});
for(const [url,allowed] of [['http://example.invalid',false],['https://example.invalid',true],['http://127.0.0.1:12345',true]])test('validated native WS keeps secure-channel gate: '+url,async()=>{
 const r=await startup(JSON.stringify(validBinding),validEnv,url);assert.equal(r.wsEnabled,true);assert.equal(r.nativeCode,'TRUSTED_CLIENT_REQUIRED');assert.equal(r.sockets,Number(allowed));if(!allowed)assert.ok(r.logs.some(args=>args[0]==='[DistributedServer] NATIVE_SECURE_CHANNEL_REQUIRED'));
});
test('validated HTTP binding does not enable native WS gate',async()=>{
 const r=await startup(JSON.stringify({toolName:'Fixture',toolboxUrl:'http://127.0.0.1:1',transportTokenEnv:'KEY',applicationAuthorizationEnv:'OWNER'}),{...validEnv,KEY:'synthetic'});assert.equal(r.wsEnabled,false);assert.equal(r.sockets,1);assert.equal(r.nativeCode,'TRUSTED_CLIENT_REQUIRED');
});
test('WS transport still rejects absent runtime request dependency',()=>assert.throws(()=>createNativeTransport({binding:validBinding,env:validEnv}),/NATIVE_CREDENTIAL_REFERENCE_REQUIRED/));
}

for(const value of ['-'.repeat(36),'a'.repeat(36),'0000000-00000-4000-8000-000000000001',undefined,[clientInstanceId]])test('WS client rejects malformed UUID without sending: '+JSON.stringify(value),async()=>{
 const c=createNativeWebSocketClient(),s=socket();c.bind(s);try{await assert.rejects(c.request({clientInstanceId:value,body:{action:'status',payload:{}}}),/NATIVE_CLIENT_BINDING_REQUIRED/);assert.equal(s.frames.length,0);}finally{c.close(s);}
});
