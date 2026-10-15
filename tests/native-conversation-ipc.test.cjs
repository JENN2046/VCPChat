'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const file=path.resolve(__dirname,'../modules/ipc/nativeConversationHandlers.js');
function load(transport,{clock}={}){const handlers=new Map(),module={exports:{}},base=createRequire(file);const require=p=>p==='electron'?{ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)}}:p.endsWith('/transport.cjs')?{createNativeTransport:()=>transport}:p.includes('ChartControllerService')?{initialize(){}}:base(p);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require,process,setInterval:clock?.setInterval||setInterval,clearInterval:clock?.clearInterval||clearInterval},{filename:file});return {handlers,initialize:async opts=>{const wc=opts.mainWindow.webContents,execute=wc.executeJavaScript;if(execute)wc.executeJavaScript=code=>code.includes("root.querySelectorAll('.message-item')")?Promise.resolve(true):execute(code);return module.exports.initialize(opts);}};}
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
 const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};if(action==='propose')return {ok:true,plan};if(action==='invalidate'){invalidates++;return {ok:allow}}if(action==='prepare'){prepares++;return {ok:true}}return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?'C':code.includes('querySelectorAll')?false:{eligible:true,text:'可以',conversationId:'C'};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame};
 try{await handlers.get('native-conversation:propose')(e,{tool:'T',conversationId:'C',messageId:'M',payload:{}});wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});assert.equal((await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'})).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(prepares,0);allow=true;await handlers.get('native-conversation:invalidate')(e,{conversationId:'C',messageId:'M'});wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});assert.equal(prepares,1);assert.equal(invalidates,2);}finally{wc.emit('destroyed');}
});

test('replacement proposal retires old main-process record without invalidating visible replacement',async()=>{
 let number=0,invalidates=0,prepares=0;const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};if(action==='propose')return {ok:true,plan:{id:'P'+(++number),messageId:'M',conversationId:'C',presentation:'visible'}};if(action==='invalidate')invalidates++;if(action==='prepare')prepares++;return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?'C':code.includes('querySelectorAll')?code.includes('"P2"'):{eligible:true,text:'可以',conversationId:'C'};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},args={tool:'T',conversationId:'C',messageId:'M',payload:{}};
 try{await handlers.get('native-conversation:propose')(e,args);await handlers.get('native-conversation:invalidate')(e,{conversationId:'C',messageId:'M'});await handlers.get('native-conversation:propose')(e,args);wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});await handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});assert.equal(prepares,1);assert.equal(invalidates,1);}finally{wc.emit('destroyed');}
});

test('replacement during prepare display snapshot does not invalidate the new plan',async()=>{
 let number=0,invalidates=0,release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};if(action==='propose')return {ok:true,plan:{id:'P'+(++number),messageId:'M',conversationId:'C',presentation:'visible'}};if(action==='invalidate')invalidates++;return {ok:true}}});const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async code=>{if(code==='window.__nativeConversationContext?.conversationId')return 'C';if(code.includes('querySelectorAll')){if(code.includes('"P1"')){entered();await gate;return false;}return true;}return {eligible:true,text:'可以',conversationId:'C'}};
 await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame},args={tool:'T',conversationId:'C',messageId:'M',payload:{}};
 try{await handlers.get('native-conversation:propose')(e,args);wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});const pending=handlers.get('native-conversation:prepare')(e,{text:'可以',conversationId:'C'});await started;await handlers.get('native-conversation:propose')(e,args);release();await pending;assert.equal(invalidates,0);}finally{wc.emit('destroyed');}
});

for(const reverse of [false,true])test('propose request order owns visible plan, reverse responses='+reverse,async()=>{
 const responses=[],calls=[];let visible='P2';
 const transport={sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};calls.push(action);if(action==='propose')return new Promise(resolve=>responses.push({resolve,p}));return {ok:true}},project:async r=>r};
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
 let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};if(action==='propose'){entered();await gate;return {ok:true,plan:{id:'late',messageId:'M',conversationId:'C',presentation:'late'}}}return {ok:true}}});
 const wc=new EventEmitter();wc.mainFrame={};wc.executeJavaScript=async()=> 'C';await initialize({mainWindow:{webContents:wc,isFocused:()=>true,isDestroyed:()=>false},binding:{toolName:'T'}});const e={sender:wc,senderFrame:wc.mainFrame};
 try{const pending=handlers.get('native-conversation:propose')(e,{tool:'T',conversationId:'C',messageId:'M',payload:{}});await started;await handlers.get('native-conversation:invalidate')(e,{conversationId:'C',...(wholeConversation?{}:{messageId:'M'})});release();assert.equal((await pending).code,'PROPOSAL_SUPERSEDED');assert.equal((await handlers.get('native-conversation:presented')(e,{planId:'late'})).ok,false);}finally{wc.emit('destroyed');}
});
test('request generation is captured before delayed conversation DOM readback',async()=>{
 let release,entered,reads=0,proposes=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const {handlers,initialize}=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};if(action==='propose'){proposes++;return {ok:true,plan:{id:'current',messageId:'M',conversationId:'C',presentation:'current'}}}return {ok:true}}});
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
 // These message-level cases use a healthy initial whole-conversation handshake.
 const calls=[],wc=new EventEmitter();wc.mainFrame={};let conversationId='C';
 wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?conversationId:{eligible:true,text:'可以',conversationId};
 const f=load({sequence:()=>0,request:async(action,p)=>{if(action==='invalidate'&&!p.messageId)return {ok:true};calls.push({action,p});return request(action,p);},project:async r=>r});
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

function rebuiltWindows(t,request,{acknowledgeColdStart=true}={}){
 // Retry/rebuild cases inject message-level failures; cold-start failures are
 // exercised separately below with acknowledgeColdStart=false.
 const timers=new Set(),calls=[],windows=[];
 const clock={setInterval(fn){timers.add(fn);return fn;},clearInterval(fn){timers.delete(fn);}};
 const f=load({sequence:()=>0,request:async(action,p)=>{if(acknowledgeColdStart&&action==='invalidate'&&!p.messageId)return {ok:true};calls.push({action,p});return request(action,p);},project:async r=>r,retryProjections:async()=>{}},{clock});
 t.after(()=>windows.forEach(w=>w.destroy()));
 return {calls,async tick(){await Promise.all([...timers].map(fn=>fn()));},async open(binding={toolName:'T'}){
  let destroyed=false,conversationId='C';const wc=new EventEmitter();wc.mainFrame={};
  wc.executeJavaScript=async code=>code==='window.__nativeConversationContext?.conversationId'?conversationId:{eligible:true,text:'可以',conversationId};
  const window={webContents:wc,isFocused:()=>true,isDestroyed:()=>destroyed},event={sender:wc,senderFrame:wc.mainFrame};
  await f.initialize({mainWindow:window,binding});
  const invoke=(action,p)=>f.handlers.get('native-conversation:'+action)(event,p);
  const w={wc,invoke,destroy(){if(!destroyed){destroyed=true;wc.emit('destroyed');}},async prepare(c='C'){conversationId=c;wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});return invoke('prepare',{conversationId:c,text:'可以'});}};
  windows.push(w);return w;
 }};
}
const readyResponse=(action,p)=>action==='prepare'?{ok:true,sourceId:p.messageId}:{ok:true};

test('deleted proposal stays blocked across window rebuild and reconnect retries without renderer ownership',async t=>{
 let online=false;const f=rebuiltWindows(t,async(action,p)=>{if(action==='invalidate'&&!online)throw Error('offline');return readyResponse(action,p);});
 const old=await f.open();const prepared=await old.prepare();
 assert.equal((await old.invoke('invalidate',{conversationId:'C',messageId:'deleted'})).ok,false);old.destroy();
 const next=await f.open();await f.tick();
 assert.equal((await next.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
 assert.equal((await next.invoke('propose',{tool:'T',conversationId:'C',messageId:'new',payload:{}})).code,'PRESENTATION_INVALIDATION_REQUIRED');
 assert.equal((await next.invoke('execute',{sourceId:prepared.sourceId})).ok,false);
 assert.ok((await next.prepare('unrelated')).sourceId);
 online=true;await f.tick();assert.ok((await next.prepare()).sourceId);
 assert.equal(f.calls.filter(c=>c.action==='execute').length,0);
 assert.ok(f.calls.filter(c=>c.action==='invalidate').every(c=>c.p.messageId==='deleted'));
});

for(const failure of ['throw','denied','missing'])test('timer retries transient '+failure+' even when recovery fails, unlocks only on exact ok',async t=>{
 let online=false,invalidates=0;
 const f=rebuiltWindows(t,async(action,p)=>{if(action==='recover')throw Error('recover unavailable');if(action==='invalidate'){invalidates++;if(online)return {ok:true};if(failure==='throw')throw Error('offline');return failure==='missing'?undefined:{ok:false};}return readyResponse(action,p);});
 const w=await f.open();await w.invoke('invalidate',{conversationId:'C',messageId:'M'});
 await f.tick();assert.equal(invalidates,2);assert.equal((await w.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
 online=true;await f.tick();assert.equal(invalidates,3);assert.ok((await w.prepare()).sourceId);
 await f.tick();assert.equal(invalidates,3,'acknowledged work must leave the retry queue');
});

test('old-window acknowledgement cannot clear newer revoke; overlapping retry ticks stay single-flight',async t=>{
 const responses=[],f=rebuiltWindows(t,async(action,p)=>action==='invalidate'?new Promise(resolve=>responses.push({resolve,p})):readyResponse(action,p));
 const old=await f.open();const first=old.invoke('invalidate',{conversationId:'C',messageId:'M'});old.destroy();
 const next=await f.open();assert.equal(responses.length,1,'rebuild must not duplicate an in-flight revoke');
 const newer=next.invoke('invalidate',{conversationId:'C',messageId:'M'});responses[1].resolve({ok:false});await newer;
 responses[0].resolve({ok:true});assert.equal((await first).ok,false);assert.equal((await next.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
 const a=f.tick(),b=f.tick();assert.equal(responses.length,3);assert.equal((await next.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
 responses[2].resolve({ok:true});await Promise.all([a,b]);assert.ok((await next.prepare()).sourceId);
});

test('another message acknowledgement never releases the conversation before its failed revoke retries',async t=>{
 let allowA=false;const f=rebuiltWindows(t,async(action,p)=>action==='invalidate'?{ok:p.messageId==='B'||allowA}:readyResponse(action,p));
 const old=await f.open();await old.invoke('invalidate',{conversationId:'C',messageId:'A'});old.destroy();
 const next=await f.open();await next.invoke('invalidate',{conversationId:'C',messageId:'B'});await f.tick();
 assert.equal((await next.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');allowA=true;await f.tick();assert.ok((await next.prepare()).sourceId);
});

test('retained revokes are isolated by binding and restored when the original binding returns',async t=>{
 const f=rebuiltWindows(t,async(action,p)=>action==='invalidate'?{ok:false}:readyResponse(action,p));
 const first=await f.open({toolName:'T',toolboxUrl:'http://127.0.0.1:1001'});await first.invoke('invalidate',{conversationId:'C',messageId:'M'});first.destroy();
 const count=f.calls.filter(c=>c.action==='invalidate').length;
 const other=await f.open({toolName:'T',toolboxUrl:'http://127.0.0.1:1002'});await f.tick();assert.equal(f.calls.filter(c=>c.action==='invalidate').length,count);assert.ok((await other.prepare()).sourceId);other.destroy();
 const original=await f.open({toolName:'T',toolboxUrl:'http://127.0.0.1:1001'});assert.equal((await original.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');
});

test('fresh main process reconciles a deleted remote plan before any confirmation or new proposal',async t=>{
 let online=true,remotePlan=false,prepares=0;
 const remote=async(action,p)=>{
  if(action==='invalidate'){if(!online)throw Error('offline');remotePlan=false;return {ok:true};}
  if(action==='propose'){remotePlan=true;return {ok:true,plan:{id:'P',presentation:'exact',conversationId:'C',messageId:'deleted'}};}
  if(action==='prepare'){prepares++;assert.equal(remotePlan,false,'stale remote plan must be gone before confirmation');}
  return readyResponse(action,p);
 };
 const before=rebuiltWindows(t,remote,{acknowledgeColdStart:false}),old=await before.open();
 await old.invoke('propose',{tool:'T',conversationId:'C',messageId:'deleted',payload:{}});assert.equal(remotePlan,true);
 online=false;await old.invoke('invalidate',{conversationId:'C',messageId:'deleted'});old.destroy();
 // A new VM-loaded module represents complete loss of the old main-process maps.
 const after=rebuiltWindows(t,remote,{acknowledgeColdStart:false}),next=await after.open();
 assert.equal((await next.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(prepares,0);
 assert.equal((await next.invoke('propose',{tool:'T',conversationId:'C',messageId:'new',payload:{}})).code,'PRESENTATION_INVALIDATION_REQUIRED');
 online=true;await after.tick();assert.equal(remotePlan,false);assert.ok((await next.prepare()).sourceId);assert.equal(prepares,1);
 assert.ok(after.calls.some(c=>c.action==='invalidate'&&c.p.conversationId==='C'&&!c.p.messageId));
});

test('cold-start proposal waits for acknowledgement and concurrent physical confirmation stays blocked',async t=>{
 let release,proposes=0;const gate=new Promise(r=>release=r);
 const f=rebuiltWindows(t,async(action,p)=>{if(action==='invalidate')return gate;if(action==='propose')proposes++;return readyResponse(action,p);},{acknowledgeColdStart:false});
 const w=await f.open(),pending=w.invoke('propose',{tool:'T',conversationId:'C',messageId:'M',payload:{}});
 assert.equal((await w.prepare()).code,'PRESENTATION_INVALIDATION_REQUIRED');assert.equal(proposes,0);
 release({ok:true});assert.equal((await pending).ok,true);assert.equal(proposes,1);
});
