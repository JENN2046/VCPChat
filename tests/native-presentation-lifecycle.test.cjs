const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/renderer/nativeConversationPresentation.js'),'utf8');
const load=()=>new Function(source.replace('export async function','async function')+';return presentNativeProposal')();
test('ordinary text with no prior plan never waits on remote invalidation',async()=>{
 let invalidates=0;const present=load();await present({element:{isConnected:true},content:'普通回答',messageId:'M',conversationId:'C',api:{proposeNativeConversation(){throw Error('unused')},invalidateNativeConversation(){invalidates++;return new Promise(()=>{})}}});assert.equal(invalidates,0);
});
test('proposal replaced by ordinary text invalidates even when renderer element is replaced',async()=>{
 let invalidates=0;const present=load(),api={proposeNativeConversation:async()=>({ok:false}),invalidateNativeConversation:async()=>{invalidates++}};
 await present({element:{isConnected:true},content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 await present({element:{isConnected:true},content:'改成普通文本',messageId:'M',conversationId:'C',api});assert.equal(invalidates,2);
 await present({element:{isConnected:true},content:'普通文本',messageId:'M',conversationId:'C',api});assert.equal(invalidates,2);
});
test('ordinary edit while first invalidation is pending prevents stale propose',async()=>{
 const present=load();let release,invalidates=0,proposes=0;const gate=new Promise(r=>release=r);
 const api={invalidateNativeConversation:()=>++invalidates===1?gate:Promise.resolve(),proposeNativeConversation:async()=>{proposes++;return {ok:false}}};
 const first=present({element:{isConnected:true},content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 await present({element:{isConnected:true},content:'普通编辑',messageId:'M',conversationId:'C',api});release();await first;assert.equal(invalidates,2);assert.equal(proposes,0);
});
test('replacement during display readback prevents acknowledging stale plan',async()=>{
 const present=load();let frame,acks=0,removed=0;
 const element={isConnected:true,querySelector:()=>null,querySelectorAll:()=>[],append(){},ownerDocument:{createElement:()=>({dataset:{},remove(){removed++}}),defaultView:{requestAnimationFrame:cb=>{frame=cb}}}};
 const api={invalidateNativeConversation:async()=>{},proposeNativeConversation:async()=>({ok:true,plan:{id:'old-plan',presentation:'old presentation'}}),presentNativeConversation:async()=>{acks++}};
 const old=present({element,content:'```vcp-tool-proposal\n{"tool":"T","payload":{}}\n```',messageId:'M',conversationId:'C',api});
 while(!frame)await new Promise(r=>setImmediate(r));await present({element:{isConnected:true},content:'普通文本',messageId:'M',conversationId:'C',api});frame();await old;assert.equal(acks,0);assert.equal(removed,1);
});
