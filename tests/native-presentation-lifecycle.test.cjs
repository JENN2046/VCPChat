const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/renderer/nativeConversationPresentation.js'),'utf8');
const load=()=>{const fn=new Function('marked',source.replaceAll('export async function','async function')+';return presentNativeProposal')(require('../vendor/marked.min.js'));return args=>{args.element.ownerDocument??={};args.element.ownerDocument.getElementById??=()=>({contains:()=>true});return fn(args);};};
test('ordinary text with no prior plan never waits on remote invalidation',async()=>{
 let invalidates=0;const present=load();await present({element:{isConnected:true,querySelector:()=>null},content:'普通回答',messageId:'M',conversationId:'C',api:{proposeNativeConversation(){throw Error('unused')},invalidateNativeConversation(){invalidates++;return new Promise(()=>{})}}});assert.equal(invalidates,0);
});
test('proposal replaced by ordinary text invalidates even when renderer element is replaced',async()=>{
 let invalidates=0;const present=load(),api={proposeNativeConversation:async()=>({ok:false}),invalidateNativeConversation:async()=>{invalidates++}};
 await present({element:{isConnected:true,querySelector:()=>null},content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 await present({element:{isConnected:true,querySelector:()=>null},content:'改成普通文本',messageId:'M',conversationId:'C',api});assert.equal(invalidates,2);
 await present({element:{isConnected:true,querySelector:()=>null},content:'普通文本',messageId:'M',conversationId:'C',api});assert.equal(invalidates,2);
});
test('ordinary edit while first invalidation is pending prevents stale propose',async()=>{
 const present=load();let release,invalidates=0,proposes=0;const gate=new Promise(r=>release=r);
 const api={invalidateNativeConversation:()=>++invalidates===1?gate:Promise.resolve(),proposeNativeConversation:async()=>{proposes++;return {ok:false}}};
 const first=present({element:{isConnected:true,querySelector:()=>null},content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 await present({element:{isConnected:true,querySelector:()=>null},content:'普通编辑',messageId:'M',conversationId:'C',api});release();await first;assert.equal(invalidates,2);assert.equal(proposes,0);
});
test('replacement during display readback prevents acknowledging stale plan',async()=>{
 const present=load();let frame,acks=0,removed=0;
 const element={isConnected:true,querySelector:()=>null,querySelectorAll:()=>[],append(){},ownerDocument:{getElementById:()=>({contains:()=>true}),createElement:()=>({dataset:{},remove(){removed++}}),defaultView:{requestAnimationFrame:cb=>{frame=cb}}}};
 const api={invalidateNativeConversation:async()=>{},proposeNativeConversation:async()=>({ok:true,plan:{id:'old-plan',presentation:'old presentation'}}),presentNativeConversation:async()=>{acks++}};
 const old=present({element,content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 while(!frame)await new Promise(r=>setImmediate(r));await present({element:{isConnected:true,querySelector:()=>null},content:'普通文本',messageId:'M',conversationId:'C',api});frame();await old;assert.equal(acks,0);assert.equal(removed,1);
});

const content='```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```';
function dom(){const nodes=[];return {nodes,isConnected:true,querySelector:()=>null,querySelectorAll:q=>q==='[data-native-plan-id]'?nodes.filter(n=>!n.removed&&n.dataset.nativePlanId):[],append:n=>nodes.push(n),ownerDocument:{getElementById:()=>({contains:()=>true}),createElement:()=>({dataset:{},remove(){this.removed=true}}),defaultView:{requestAnimationFrame:f=>f()}}};}
for(const mode of ['reject','denied'])test('failed presentation ack retracts confirmable text: '+mode,async()=>{
 const present=load(),element=dom();let invalidates=0;
 await present({element,content,messageId:'M',conversationId:'C',api:{invalidateNativeConversation:async()=>{invalidates++;return {ok:true}},proposeNativeConversation:async()=>({ok:true,plan:{id:'P',presentation:'回复可以执行'}}),presentNativeConversation:async()=>{if(mode==='reject')throw Error('offline');return {ok:false}}}});
 assert.equal(element.querySelectorAll('[data-native-plan-id]').length,0);assert.match(element.nodes[0].textContent,/不能执行/);assert.equal(invalidates,2);
});
test('retire during pending ack and historical rebuild never restore authorization',async()=>{
 const {presentNativeProposal:present,retireNativeProposal:retire}=new Function('marked',source.replaceAll('export async function','async function')+';return {presentNativeProposal,retireNativeProposal}')(require('../vendor/marked.min.js'));
 let release,entered,proposes=0,invalidates=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),element=dom();
 const api={invalidateNativeConversation:async()=>{invalidates++;return {ok:true}},proposeNativeConversation:async()=>{proposes++;return {ok:true,plan:{id:'P',presentation:'回复可以'}}},presentNativeConversation:async()=>{entered();await gate;return {ok:true}}};
 const pending=present({element,content,messageId:'M',conversationId:'C',api});await started;await retire(element);element.isConnected=false;release();await pending;assert.equal(element.nodes[0].removed,true);
 const restored=dom();await present({element:restored,content,messageId:'M',conversationId:'C',api,historical:true});assert.equal(proposes,1);assert.equal(invalidates,3);assert.match(restored.nodes[0].textContent,/历史方案已失效/);assert.equal(restored.querySelectorAll('[data-native-plan-id]').length,0);
 const renderer=fs.readFileSync(path.join(__dirname,'../modules/messageRenderer.js'),'utf8');assert.match(renderer,/function cleanupMessageDomResources[\s\S]*?retireNativeProposal\(messageItem\)/);
});
test('stream completion presents once with or without restored DOM using real hooks',async()=>{
 const renderer=fs.readFileSync(path.join(__dirname,'../modules/messageRenderer.js'),'utf8'),stream=fs.readFileSync(path.join(__dirname,'../modules/renderer/streamManager.js'),'utf8');
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const hook=renderer.split('\n').find(l=>l.includes('if (!renderContext.suppressNativePresentation')&&l.includes('presentNativeProposal'));
 const renderHook=new AsyncFunction('presentNativeProposal','messageItem','message','isInitialLoad','mainRendererReferences','window','renderContext',hook);
 const start=stream.indexOf('        if (!messageItem) {\r\n            const finalMessage ='),end=stream.indexOf('\n        if (messageItem) {',start);assert.ok(start>0&&end>start);
 const finalHook=stream.split('\n').find(l=>l.includes("if(finishReason==='completed'||finishReason==='stop')await presentNativeProposal"));
 const run=new AsyncFunction('messageItem','presentNativeProposal','refs','message','finalFullText','storedContext','messageId',`let finishReason='completed',expectedOperationId=null;${stream.slice(start,end)}\n${finalHook}`);
 for(const missing of [false,true]){let calls=0;const present=async()=>calls++,refs={electronAPI:{},renderMessage:async(m,initial,append,session,context)=>{const e=dom();await renderHook(present,e,m,initial,{}, {},context);return e}};await run(missing?null:dom(),present,refs,{role:'assistant'},content,{agentId:'A',topicId:'T'},'M');assert.equal(calls,1);}
});

test('cleanup of replaced DOM does not invalidate the newer generation',async()=>{
 const {presentNativeProposal:present,retireNativeProposal:retire}=new Function('marked',source.replaceAll('export async function','async function')+';return {presentNativeProposal,retireNativeProposal}')(require('../vendor/marked.min.js'));let invalidates=0;
 const api={invalidateNativeConversation:async()=>{invalidates++;return {ok:true}},proposeNativeConversation:async()=>({ok:false})},old=dom();await present({element:old,content,messageId:'M',conversationId:'C',api});await present({element:dom(),content,messageId:'M',conversationId:'C',api});await retire(old);assert.equal(invalidates,2);
});

test('late failed acknowledgement cannot invalidate a newer displayed plan',async()=>{
 const present=load();let reject,entered,number=0,invalidates=0;const gate=new Promise((_,r)=>reject=r),started=new Promise(r=>entered=r),old=dom(),next=dom();
 const api={invalidateNativeConversation:async()=>{invalidates++;return {ok:true}},proposeNativeConversation:async()=>({ok:true,plan:{id:'P'+(++number),presentation:'当前方案'}}),presentNativeConversation:async({planId})=>{if(planId==='P1'){entered();return gate;}return {ok:true}}};
 const pending=present({element:old,content,messageId:'M',conversationId:'C',api});await started;await present({element:next,content,messageId:'M',conversationId:'C',api});reject(Error('late failure'));await pending;assert.equal(invalidates,2);assert.equal(old.nodes[0].removed,true);assert.equal(next.nodes[0].dataset.nativePlanId,'P2');
});
