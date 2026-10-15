'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Execute the actual receive method without loading configuration or starting the app.
const source=fs.readFileSync(path.join(__dirname,'../VCPDistributedServer/VCPDistributedServer.js'),'utf8');
const start=source.indexOf('    async handleMainServerMessage('),end=source.indexOf('    async handleToolExecutionRequest(',start);
assert.ok(start>=0&&end>start);
const create=new Function('console',`return ({${source.slice(start,end).trim()}}).handleMainServerMessage;`);
test('malformed sensitive response produces only fixed diagnostics and never evidence',async()=>{
 const logs=[],receive=create({error:(...a)=>logs.push(a),log:(...a)=>logs.push(a)});let captures=0,dispatches=0;
 const context={serverName:'SYNTHETIC_PRIVATE_NAME',debugMode:true,crownEvidenceService:{captureFrame(){captures++;}},handleToolExecutionRequest(){dispatches++;},nativeConversationClient:{receive:()=>false}};
 for(const frame of ['{"type":"native_conversation_response","result":SYNTHETIC_PRIVATE_RESULT}', 'SYNTHETIC_PRIVATE_FRAME', '{"secret":"SYNTHETIC_PRIVATE_VALUE"'])await receive.call(context,frame);
 assert.equal(captures,0);assert.equal(dispatches,0);assert.equal(logs.length,3);
 for(const args of logs)assert.deepEqual(args,['[DistributedServer] MAIN_SERVER_MESSAGE_INVALID']);
 assert.doesNotMatch(JSON.stringify(logs),/SYNTHETIC_PRIVATE|SyntaxError|stack/);
});
test('valid native response bypasses generic logs and evidence; ordinary tool dispatch remains',async()=>{
 const logs=[],receive=create({error:(...a)=>logs.push(a),log:(...a)=>logs.push(a)});let captures=0,dispatches=0,results=0;
 const context={debugMode:true,crownEvidenceService:{captureFrame(){captures++;return 'hash';}},handleToolExecutionRequest(data){assert.equal(data.toolName,'synthetic');dispatches++;},nativeConversationClient:{receive(_ws,m){if(m.type==='native_conversation_response'){results++;return true;}return false;}}};
 await receive.call(context,JSON.stringify({type:'native_conversation_response',result:{secret:'SYNTHETIC_PRIVATE_RESULT'}}));assert.equal(results,1);assert.equal(captures,0);assert.equal(logs.length,0);
 await receive.call(context,JSON.stringify({type:'execute_tool',data:{toolName:'synthetic'}}));assert.equal(captures,0);assert.equal(dispatches,1);assert.doesNotMatch(JSON.stringify(logs),/SYNTHETIC_PRIVATE/);
});
