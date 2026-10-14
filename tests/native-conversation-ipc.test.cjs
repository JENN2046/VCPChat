'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const file=path.resolve(__dirname,'../modules/ipc/nativeConversationHandlers.js');
function load(transport){const handlers=new Map(),module={exports:{}},base=createRequire(file);const require=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:()=>transport}:p.includes('ChartControllerService')?{initialize(){}}:base(p);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require,process,setInterval,clearInterval},{filename:file});return {handlers,initialize:module.exports.initialize};}
test('real generic IPC wiring rejects fabricated renderer source, binds one event and cleans up without UI',async()=>{
 let sequence=0,text='可以',calls=[];const transport={sequence:()=>sequence,request:async(action,payload)=>{calls.push({action,payload});if(action==='prepare')return {ok:true,handled:true,sourceId:payload.messageId};if(action==='execute')return {ok:true,committed:true};return {ok:true};},project:async r=>r};
 const {handlers,initialize}=load(transport);const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>({eligible:true,text,conversationId:'C1'});const window={webContents:wc,isFocused:()=>true,isDestroyed:()=>false};await initialize({mainWindow:window,binding:{toolName:'Example'},chartService:{}});const event={sender:wc,senderFrame:wc.mainFrame};
 const prepare=handlers.get('native-conversation:prepare'),execute=handlers.get('native-conversation:execute');
 assert.equal((await prepare(event,{text,conversationId:'C1',human:true,role:'user'})).code,'NATIVE_SOURCE_REQUIRED');assert.equal(calls.filter(c=>c.action==='prepare').length,0);
 wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});const ready=await prepare(event,{text,conversationId:'C1'});assert.ok(ready.sourceId);
 assert.equal((await execute({sender:{},senderFrame:{}},{sourceId:ready.sourceId})).code,'SOURCE_UNKNOWN');assert.equal((await execute(event,{sourceId:ready.sourceId})).committed,true);assert.equal((await execute(event,{sourceId:ready.sourceId})).code,'SOURCE_UNKNOWN');assert.equal(calls.filter(c=>c.action==='execute').length,1);
 wc.emit('destroyed');assert.equal(handlers.size,0);
});
test('unconfigured optional integration creates no UI or requests and removes handlers',async()=>{const {handlers,initialize}=load({request:()=>{throw Error('unexpected')}});const wc=new EventEmitter();await initialize({mainWindow:{webContents:wc},binding:null});assert.equal(handlers.size,5);assert.equal((await handlers.get('native-conversation:prepare')()).handled,false);wc.emit('destroyed');assert.equal(handlers.size,0);});

test('configured session rejection stays handled and cannot fall through to model execution',async()=>{const {handlers,initialize}=load({sequence:()=>0,request:async action=>action==='prepare'?{ok:false,code:'APPLICATION_SESSION_REQUIRED'}:{ok:true}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>({eligible:true,text:'可以',conversationId:'C1'});await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'Example'}});wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});const r=await handlers.get('native-conversation:prepare')({sender:wc,senderFrame:wc.mainFrame},{text:'可以',conversationId:'C1'});assert.equal(r.handled,true);assert.equal(r.code,'APPLICATION_SESSION_REQUIRED');assert.equal(r.sourceId,undefined);wc.emit('destroyed');});

for(const [name,response,expected] of [
 ['read-only',{handled:false,ok:false,code:'READ_ONLY_POLICY'},false],
 ['authentication',{handled:false,ok:false,code:'APPLICATION_SESSION_REQUIRED'},true],
 ...['fetch failed','timeout','invalid JSON'].map(message=>[message,new Error(message),true])
])test('configured prepare boundary: '+name,async()=>{
 const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action!=='prepare')return {ok:true};if(response instanceof Error)throw response;return response;}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>({eligible:true,text:'你好',conversationId:'C1'});
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'Example'}});
 try{wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});const result=await handlers.get('native-conversation:prepare')({sender:wc,senderFrame:wc.mainFrame},{text:'你好',conversationId:'C1'});assert.equal(result.handled,expected);if(response instanceof Error)assert.equal(result.code,'NATIVE_TRANSPORT_UNAVAILABLE');}finally{wc.emit('destroyed');}
});
