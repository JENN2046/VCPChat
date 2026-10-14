'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {installNativeConversationPort}=require('../modules/services/trustedConversation/nativePort.cjs');
test('generic native port accepts exact source once; model flags, edits and expired session mint nothing',async()=>{
 const wc=new EventEmitter();let enabled=true,now=0,text='可以';const window={webContents:wc,isDestroyed:()=>false,isFocused:()=>true};
 const port=installNativeConversationPort({window,clock:()=>now,isSessionCurrent:async()=>enabled,observedSequence:()=>7,snapshot:async()=>({eligible:true,text,conversationId:'C1'})});
 await assert.rejects(port.consume({text,conversationId:'C1',human:true,isTrusted:true}),/NATIVE_CONVERSATION/);
 const arm=()=>wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});
 arm();await assert.rejects(port.consume({text:'执行别的',conversationId:'C1'}));
 arm();const context=await port.consume({text,conversationId:'C1'});assert.equal(port.read(context).text,'可以');assert.equal(port.read(context).observedSequence,7);assert.equal(port.read({...context}),null);await assert.rejects(port.consume({text,conversationId:'C1'}));
 arm();enabled=false;await assert.rejects(port.consume({text,conversationId:'C1'}));enabled=true;
 arm();await new Promise(resolve=>setImmediate(resolve));now=4000;await assert.rejects(port.consume({text,conversationId:'C1'}));port.dispose();
});
test('native event retains pre-display sequence across delayed session verification',async()=>{
 const wc=new EventEmitter();let sequence=1,release;const gate=new Promise(r=>release=r);let first=true;
 const port=installNativeConversationPort({window:{webContents:wc,isDestroyed:()=>false,isFocused:()=>true},observedSequence:()=>sequence,isSessionCurrent:async()=>{if(first){first=false;await gate;}return true;},snapshot:async()=>({eligible:true,text:'可以',conversationId:'C'})});
 wc.emit('before-input-event',{}, {type:'keyDown',key:'Enter'});sequence=2;release();const ctx=await port.consume({text:'可以',conversationId:'C'});assert.equal(port.read(ctx).observedSequence,1);port.dispose();
});
