'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const file=path.resolve(__dirname,'../modules/ipc/nativeConversationHandlers.js');
function load(transport){const handlers=new Map(),module={exports:{}},base=createRequire(file);const require=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:()=>transport}:p.includes('ChartControllerService')?{initialize(){}}:base(p);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require,process,setInterval,clearInterval},{filename:file});return {handlers,initialize:async opts=>{const wc=opts.mainWindow.webContents,execute=wc.executeJavaScript;if(execute)wc.executeJavaScript=code=>code.includes("root.querySelectorAll('.message-item')")?Promise.resolve(true):execute(code);return module.exports.initialize(opts);}};}
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

for(const key of ['Enter',' ','Space'])test('focused Send keyboard activation uses actual DOM snapshot: '+JSON.stringify(key),async()=>{
 const input={value:'可以'},button={dataset:{},disabled:false},document={activeElement:button,getElementById:id=>id==='messageInput'?input:button};
 const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>action==='prepare'?{ok:true,handled:true,sourceId:p.messageId}:{ok:true}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>vm.runInNewContext(code,{document,window:{__nativeConversationContext:{conversationId:'C'}}});
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const event={sender:wc,senderFrame:wc.mainFrame},prepare=()=>handlers.get('native-conversation:prepare')(event,{text:'可以',conversationId:'C'});
 try{wc.emit('before-input-event',{}, {type:'keyDown',key});assert.ok((await prepare()).sourceId);assert.equal((await prepare()).code,'NATIVE_SOURCE_REQUIRED');
 for(const variant of ['disabled','interrupt','input']){button.disabled=variant==='disabled';button.dataset.mode=variant==='interrupt'?'interrupt':'';document.activeElement=variant==='input'?input:button;if(variant==='input'&&key==='Enter')continue;wc.emit('before-input-event',{}, {type:'keyDown',key});assert.equal((await prepare()).code,'NATIVE_SOURCE_REQUIRED');}
 }finally{wc.emit('destroyed');}
});
test('removed proposal cannot reach prepare until host invalidation succeeds',async()=>{
 let invalidates=0,prepares=0,allow=false;const plan={id:'P',presentation:'exact',conversationId:'C',messageId:'M'};
 const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action==='propose')return {ok:true,plan};if(action==='invalidate'){invalidates++;return {ok:allow}}if(action==='prepare'){prepares++;return {ok:true}}return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?'C':code.includes('querySelectorAll')?false:{eligible:true,text:'可以',conversationId:'C'};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame};
 try{await handlers.get('native-conversation:propose')(e,{tool:'T',conversationId:'C',messageId:'M',payload:{}});wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});assert.equal((await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'})).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(prepares,0);allow=true;wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});assert.equal(prepares,1);assert.equal(invalidates,2);}finally{wc.emit('destroyed');}
});

test('replacement proposal retires old main-process record without invalidating visible replacement',async()=>{
 let number=0,invalidates=0,prepares=0;const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action==='propose')return {ok:true,plan:{id:'P'+(++number),messageId:'M',conversationId:'C',presentation:'visible'}};if(action==='invalidate')invalidates++;if(action==='prepare')prepares++;return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?'C':code.includes('querySelectorAll')?code.includes('"P2"'):{eligible:true,text:'可以',conversationId:'C'};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},args={tool:'T',conversationId:'C',messageId:'M',payload:{}};
 try{await handlers.get('native-conversation:propose')(e,args);await handlers.get('native-conversation:invalidate')(e,{conversationId:'C',messageId:'M'});await handlers.get('native-conversation:propose')(e,args);wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});assert.equal(prepares,1);assert.equal(invalidates,1);}finally{wc.emit('destroyed');}
});

test('replacement during prepare display snapshot does not invalidate the new plan',async()=>{
 let number=0,invalidates=0,release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action==='propose')return {ok:true,plan:{id:'P'+(++number),messageId:'M',conversationId:'C',presentation:'visible'}};if(action==='invalidate')invalidates++;return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>{if(code==='window.__nativeConversationContext?.conversationId')return 'C';if(code.includes('querySelectorAll')){if(code.includes('"P1"')){entered();await gate;return false;}return true;}return {eligible:true,text:'可以',conversationId:'C'}};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},args={tool:'T',conversationId:'C',messageId:'M',payload:{}};
 try{await handlers.get('native-conversation:propose')(e,args);wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});const pending=handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});await started;await handlers.get('native-conversation:propose')(e,args);release();await pending;assert.equal(invalidates,0);}finally{wc.emit('destroyed');}
});

for(const reverse of [false,true])test('propose request order owns visible plan, reverse responses='+reverse,async()=>{
 const responses=[],calls=[];let visible='P2';
 const transport={sequence:()=>0,request:async(action,p)=>{calls.push(action);if(action==='propose')return new Promise(resolve=>responses.push({resolve,p}));return {ok:true}},project:async r=>r};
 const {handlers,initialize}=load(transport),wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>{if(code==='window.__nativeConversationContext?.conversationId')return 'C';if(code.includes('querySelectorAll'))return code.includes('return {text:')?{text:'current',connected:true,conversationId:'C'}:code.includes(JSON.stringify(visible));return {eligible:true,text:'可以',conversationId:'C'}};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},args={tool:'T',conversationId:'C',messageId:'M',payload:{}},propose=()=>handlers.get('native-conversation:propose')(e,args),finish=(i,id)=>responses[i].resolve({ok:true,plan:{id,conversationId:'C',messageId:'M',presentation:'current'}});
 try{const first=propose();while(responses.length<1)await new Promise(r=>setImmediate(r));
  if(!reverse){finish(0,'P1');assert.equal((await first).plan.id,'P1');}
  const second=propose();while(responses.length<2)await new Promise(r=>setImmediate(r));finish(1,'P2');assert.equal((await second).plan.id,'P2');
  if(reverse){finish(0,'P1');assert.equal((await first).code,'PROPOSAL_SUPERSEDED');}
  assert.equal((await handlers.get('native-conversation:presented')(e,{planId:'P2'})).ok,true);assert.equal(calls.filter(x=>x==='presented').length,1);
  assert.equal((await handlers.get('native-conversation:presented')(e,{planId:'P1'})).ok,false);
  wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});assert.equal(calls.filter(x=>x==='invalidate').length,0);assert.equal(calls.filter(x=>x==='prepare').length,1);
 }finally{wc.emit('destroyed');}
});
for(const wholeConversation of [false,true])test('invalidate retires pending propose response, conversation='+wholeConversation,async()=>{
 let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action==='propose'){entered();await gate;return {ok:true,plan:{id:'late',messageId:'M',conversationId:'C',presentation:'late'}}}return {ok:true}}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=> 'C';await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame};
 try{const pending=handlers.get('native-conversation:propose')(e,{tool:'T',conversationId:'C',messageId:'M',payload:{}});await started;await handlers.get('native-conversation:invalidate')(e,{conversationId:'C',...(wholeConversation?{}:{messageId:'M'})});release();assert.equal((await pending).code,'PROPOSAL_SUPERSEDED');assert.equal((await handlers.get('native-conversation:presented')(e,{planId:'late'})).ok,false);}finally{wc.emit('destroyed');}
});
test('request generation is captured before delayed conversation DOM readback',async()=>{
 let release,entered,reads=0,proposes=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {handlers,initialize}=load({sequence:()=>0,request:async action=>{if(action==='propose'){proposes++;return {ok:true,plan:{id:'current',messageId:'M',conversationId:'C',presentation:'current'}}}return {ok:true}}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=>{if(++reads===1){entered();await gate;}return 'C'};await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},p={tool:'T',conversationId:'C',messageId:'M',payload:{}};
 try{const old=handlers.get('native-conversation:propose')(e,p);await started;assert.equal((await handlers.get('native-conversation:propose')(e,p)).plan.id,'current');release();assert.equal((await old).code,'PROPOSAL_SUPERSEDED');assert.equal(proposes,1);}finally{wc.emit('destroyed');}
});
test('disabled mouse Send leaves no source; a fresh enabled physical click works',async()=>{
 const input={value:'把晨拍延后10分钟'},button={dataset:{},disabled:true},document={activeElement:input,getElementById:id=>id==='messageInput'?input:button,elementFromPoint:()=>button};let prepares=0;
 const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='prepare'){prepares++;return {ok:true,handled:true,sourceId:p.messageId};}return {ok:true}}}),wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>vm.runInNewContext(code,{document,window:{__nativeConversationContext:{conversationId:'C'}}});
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const event={sender:wc,senderFrame:wc.mainFrame},prepare=()=>handlers.get('native-conversation:prepare')(event,{text:input.value,conversationId:'C'}),click=()=>wc.emit('before-mouse-event',{}, {type:'mouseDown',button:'left',x:1,y:1});
 try{click();await new Promise(r=>setImmediate(r));button.disabled=false;const refused=await prepare();assert.equal(refused.code,'NATIVE_SOURCE_REQUIRED');assert.equal(refused.handled,true);assert.equal(refused.preserveInput,true);assert.equal(prepares,0);click();assert.ok((await prepare()).sourceId);assert.equal(prepares,1);assert.equal((await prepare()).code,'NATIVE_SOURCE_REQUIRED');}finally{wc.emit('destroyed');}
});

function isolatedHistory(t,request){
 const calls=[],wc=new EventEmitter();wc.mainFrame={};let conversationId='C';
 wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?conversationId:{eligible:true,text:'可以',conversationId};
 const f=load({sequence:()=>0,request:async(action,p)=>{calls.push({action,p});return request(action,p);},project:async r=>r});
 const event={sender:wc,senderFrame:wc.mainFrame};t.after(()=>wc.emit('destroyed'));
 return {...f,wc,calls,start:()=>f.initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}}),invoke:(action,p)=>f.handlers.get('native-conversation:'+action)(event,p),async prepare(c='C'){conversationId=c;wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});return this.invoke('prepare',{text:'可以',conversationId:c});}};
}
for(const failure of ['denied','throw','missing'])test('fresh process blocks unknown historical plan after invalidation '+failure,async t=>{
 let allow=false;const f=isolatedHistory(t,async(action,p)=>{if(action==='invalidate'){if(!allow&&failure==='throw')throw Error('offline');return allow?{ok:true}:failure==='missing'?undefined:{ok:false}}return action==='prepare'?{ok:true,handled:true,sourceId:p.messageId}:{ok:true}});await f.start();
 assert.equal((await f.invoke('invalidate',{conversationId:'C',messageId:'history'})).ok,false);
 assert.equal((await f.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal((await f.invoke('propose',{tool:'T',conversationId:'C',messageId:'new',payload:{}})).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(f.calls.filter(c=>['prepare','propose','execute'].includes(c.action)).length,0);
 assert.ok((await f.prepare('unrelated')).sourceId);allow=true;assert.equal((await f.invoke('invalidate',{conversationId:'C',messageId:'history'})).ok,true);assert.ok((await f.prepare()).sourceId);
});
test('pending invalidation blocks prepare and revokes already prepared execution',async t=>{
 let release;const gate=new Promise(r=>release=r),f=isolatedHistory(t,async(action,p)=>action==='invalidate'?gate:action==='prepare'?{ok:true,sourceId:p.messageId}:{ok:true});await f.start();const ready=await f.prepare();
 const pending=f.invoke('invalidate',{conversationId:'C',messageId:'history'});assert.equal((await f.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal((await f.invoke('execute',{sourceId:ready.sourceId})).ok,false);release({ok:true});await pending;assert.equal((await f.invoke('execute',{sourceId:ready.sourceId})).ok,false);assert.equal(f.calls.filter(c=>c.action==='execute').length,0);
});
test('late prepare response after acknowledged invalidation cannot yield an executable source',async t=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),f=isolatedHistory(t,async(action)=>{if(action==='prepare'){entered();return gate;}return {ok:true}});await f.start();const pending=f.prepare();await started;await f.invoke('invalidate',{conversationId:'C',messageId:'history'});release({ok:true,sourceId:'stale'});assert.equal((await pending).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal((await f.invoke('execute',{sourceId:'stale'})).ok,false);assert.equal(f.calls.filter(c=>c.action==='execute').length,0);
});
test('old acknowledgement cannot clear newer failed invalidation or another message barrier',async t=>{
 const responses=[],f=isolatedHistory(t,async(action,p)=>action==='invalidate'?new Promise(r=>responses.push(r)):action==='prepare'?{ok:true,sourceId:p.messageId}:{ok:true});await f.start();
 const a=f.invoke('invalidate',{conversationId:'C',messageId:'A'}),newer=f.invoke('invalidate',{conversationId:'C',messageId:'A'}),b=f.invoke('invalidate',{conversationId:'C',messageId:'B'});
 responses[1]({ok:false});await newer;responses[0]({ok:true});assert.equal((await a).ok,false);responses[2]({ok:true});await b;assert.equal((await f.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
 const retry=f.invoke('invalidate',{conversationId:'C',messageId:'A'});responses[3]({ok:true});await retry;assert.ok((await f.prepare()).sourceId);
});
test('unowned invalidation cannot install a barrier',async t=>{
 const f=isolatedHistory(t,async(action,p)=>action==='prepare'?{ok:true,sourceId:p.messageId}:{ok:true});await f.start();assert.equal((await f.handlers.get('native-conversation:invalidate')({sender:{},senderFrame:{}},{conversationId:'C'})).ok,false);assert.ok((await f.prepare()).sourceId);assert.equal(f.calls.filter(c=>c.action==='invalidate').length,0);
});
