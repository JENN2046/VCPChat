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
async function renderer(result){
 const s=fs.readFileSync(path.join(root,'modules/chatManager.js'),'utf8');
 const chunk=s.slice(s.indexOf('        let nativeResult = null;'),s.indexOf('        const thinkingMessageId',s.indexOf('        let nativeResult = null;')));
 const run=new AF('result',`const history=[],toasts=[],rendered=[];let current=[];const request=null,attachedFiles=[],content='把合成排期延后1分钟',currentSelectedItem={id:'A',type:'agent',name:'fixture'},currentTopicId='T',globalSettings={vcpServerUrl:'http://unused.invalid'},sendContext={topicId:'T'},messageInput={value:content},input=messageInput,attachedFilesRef={get:()=>attachedFiles,set(){}},mainRendererFunctions={},isCanvasWindowOpen=false,itemListManager=null;const uiHelper={showToastNotification:m=>toasts.push(m),autoResizeTextarea(){}},setNextUiEmptyStateActive=()=>{},isSendContextCurrent=()=>true,sendHistoryRef={get:()=>current,set:v=>current=v},renderTarget={renderMessage:async m=>{rendered.push(m);return {remove(){}}}},persistOutgoingUserMessage=async(c,m)=>{history.push(m);return history},electronAPI={prepareNativeConversation:async()=>result,setTopicUnread:async()=>({success:true}),executeNativeConversation:async()=>{throw Error('unexpected execute')}};async function send(){${chunk}}const returned=await send();return {returned,input:input.value,history:history.map(m=>({role:m.role,content:m.content})),toasts};`);
 return run(result);
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
