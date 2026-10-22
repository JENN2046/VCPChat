'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertRestoredProjection:verify}=require('../scripts/native-sync-r9-install-recovery.cjs');
const original=()=>({messages:[{id:'before',hash:'unchanged'}],executions:[{id:'complete',state:'completed',own:true},{id:'cancel',state:'cancelled',own:false}]});
test('installed recovery preserves anchors while allowing additional legitimate chat messages',()=>{
 const before=original(),after=original();after.messages.push({id:'new-user',hash:'new'});after.executions.push({id:'new-job',state:'completed',own:true});verify(before,after);
});
test('installed recovery refuses dropped/overwritten messages, changed ownership, terminal regression and duplicates',()=>{
 for(const change of [x=>x.messages.pop(),x=>x.messages[0].hash='overwritten',x=>x.executions[0].own=false,x=>x.executions[1].state='running',x=>x.messages.push({...x.messages[0]})]){const after=original();change(after);assert.throws(()=>verify(original(),after));}
});
test('live recovery refuses another workspace or non-loopback/non-owned origin before creating resources',async()=>{
 const path=require('node:path'),{attach}=require('../scripts/native-sync-r9-live-transport.cjs');
 const root=path.resolve(__dirname,'../../../artifacts/native-sync-r9/run-123');
 await assert.rejects(attach({localRoot:path.resolve(root,'../wrong'),url:'http://127.0.0.1:53218',origin:'https://owned.trycloudflare.com'}),/R9_LIVE_ROOT_REQUIRED/);
 for(const url of ['https://127.0.0.1:53218','http://remote.example:53218','http://127.0.0.1:53218/?key=synthetic','http://user:synthetic@127.0.0.1:53218'])await assert.rejects(attach({localRoot:root,url,origin:'https://owned.trycloudflare.com'}),/R9_LIVE_LOOPBACK_REQUIRED/);
 await assert.rejects(attach({localRoot:root,url:'http://127.0.0.1:53218',origin:'https://production.example'}),/R9_LIVE_ORIGIN_REQUIRED/);
});
