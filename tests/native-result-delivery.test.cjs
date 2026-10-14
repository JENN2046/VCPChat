const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/chatManager.js'),'utf8');
const start=source.indexOf('        if (nativeResult?.handled) {'),end=source.indexOf('        const thinkingMessageId',start);
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
const run=new AsyncFunction('electronAPI','persistOutgoingUserMessage','renderTarget','uiHelper','isSendContextCurrent',`let nativeResult={handled:true,sourceId:'native-fixture'};const sendContext={topicId:'original-topic'},currentSelectedItem={name:'fake'};${source.slice(start,end)}`);
for(const active of [true,false])test(`committed receipt survives failed history save (original topic active=${active})`,async()=>{
 let executes=0;const rendered=[],toasts=[];
 const result=await run({executeNativeConversation:async()=>{executes++;return {committed:true,operationId:'op-original',chart:{ok:true}}}},async()=>{throw Error('synthetic disk full')},{renderMessage:async r=>rendered.push(r)},{showToastNotification:s=>toasts.push(s)},()=>active);
 assert.equal(result.committed,true);assert.equal(executes,1);assert.equal(rendered.length,active?1:0);assert.equal(toasts.length,1);assert.match(toasts[0],/original-topic.*op-original/s);assert.match(toasts[0],/请勿重复提交/);if(active)assert.match(rendered[0].content,/op-original/);
});
test('render failure still reports confirmed receipt without re-execution',async()=>{
 let executes=0;const toasts=[];await run({executeNativeConversation:async()=>{executes++;return {committed:true,operationId:'op-original'}}},async()=>{}, {renderMessage:async()=>{throw Error('render failed')}},{showToastNotification:s=>toasts.push(s)},()=>true);assert.equal(executes,1);assert.match(toasts[0],/op-original/);
});
test('topic switch during render retracts stale DOM and delivers original receipt in toast',async()=>{
 let active=true,removed=0;const toasts=[];
 await run({executeNativeConversation:async()=>({committed:true,operationId:'op-original'})},async()=>{}, {renderMessage:async()=>{active=false;return {remove(){removed++}}}},{showToastNotification:s=>toasts.push(s)},()=>active);
 assert.equal(removed,1);assert.match(toasts[0],/original-topic.*op-original/s);
});
test('mixed cancellation and dispatched operations explicitly retain reconciliation warning',async()=>{
 const rendered=[];await run({executeNativeConversation:async()=>({ok:true,cancelled:1,reconciliation:[{operationId:'dispatched-op',committed:true}]})},async()=>{}, {renderMessage:async r=>rendered.push(r)},{showToastNotification(){}},()=>true);assert.match(rendered[0].content,/未取消.*dispatched-op.*已确认完成/);
});
