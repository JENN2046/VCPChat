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
async function startup(config){
 const s=fs.readFileSync(path.join(root,'main.js'),'utf8');
 const chunk=s.slice(s.indexOf('function startDistributedServerAfterRenderer()'),s.indexOf('function toggleDevToolsForWindow',s.indexOf('function startDistributedServerAfterRenderer()')));
 let reads=0,constructed=0,initialized=0,errors=0,wsEnabled=null;
 const bindingModule={exports:{}};
 vm.runInNewContext(source,{module:bindingModule,exports:bindingModule.exports,require:p=>p==='node:fs'?{readFileSync(){reads++;if(config==='missing')throw Error('ENOENT');return config;}}:p==='electron'?{ipcMain:{}}:base(p),process:{env:config===undefined?{}:{VCPCHAT_NATIVE_TOOL_BINDING_FILE:'synthetic-binding'}}});
 const noop={},ctx={distributedServerStartPromise:null,distributedServer:null,isFinalizingQuit:false,app:{isQuitting:false},appSettingsManager:{readSettings:async()=>({enableDistributedServer:true})},mainWindow:{isDestroyed:()=>false,webContents:{}},console:{log(){},error(){errors++;},warn(){}},require:p=>p.endsWith('nativeConversationHandlers')?bindingModule.exports:class{constructor(options){constructed++;wsEnabled=options.nativeConversationWebSocket;}async initialize(){initialized++;}},musicHandlers:noop,diceHandlers:noop,desktopRemoteHandlers:noop,chatDataService:noop,loomManager:noop,scriptoriumAgentControl:noop,pluginAgentOperationService:noop,chartService:noop,gameService:noop,workspaceHandlers:noop};
 vm.createContext(ctx);vm.runInContext(chunk,ctx);await ctx.startDistributedServerAfterRenderer();await ctx.startDistributedServerAfterRenderer();return {reads,constructed,initialized,errors,wsEnabled,promiseRetained:!!ctx.distributedServerStartPromise};
}

for(const mode of ['before','inflight','late-success'])test('prepare connection change retains draft without history: '+mode,async()=>{
 const r=await ipc(mode);assert.equal(r.ipc.code,'NATIVE_CONNECTION_CHANGED');assert.equal(r.ipc.preserveInput,true);assert.equal(r.ipc.sourceId,undefined);assert.equal(r.renderer.input,'把合成排期延后1分钟');assert.equal(r.renderer.history.length,0);assert.equal(r.renderer.toasts.length,1);
});
test('unchanged epoch transport failure keeps existing history semantics',async()=>{const r=await ipc('same-epoch-error');assert.equal(r.ipc.code,'NATIVE_TRANSPORT_UNAVAILABLE');assert.equal(r.renderer.input,'');assert.equal(r.renderer.history.length,2);});
for(const config of ['missing','{','null','[]',undefined,'{"transport":"http"}','{"transport":"vcp-websocket"}'])test('optional native binding does not abort distributed startup: '+String(config),async()=>{
 const r=await startup(config);assert.equal(r.constructed,1);assert.equal(r.initialized,1);assert.equal(r.errors,0);assert.equal(r.wsEnabled,config==='{"transport":"vcp-websocket"}');
});
}
