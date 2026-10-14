'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeTransport}=require('../modules/services/trustedConversation/transport.cjs');
test('committed projection retries once after transient failure and never resends business; newest version wins',async()=>{
 let fail=true,data={_nativeProjectionVersion:[1,1]},writes=0,requests=0;
 const transport=createNativeTransport({binding:{toolboxUrl:'http://127.0.0.1',toolName:'Example',transportTokenEnv:'T',applicationAuthorizationEnv:'A'},env:{T:'synthetic',A:'Bearer '+'x'.repeat(40)},fetchImpl:async()=>{requests++;throw Error('no business request expected');},chartService:{readManifest:async()=>{if(fail)throw Error('temporary');return {dataRevision:1};},readData:async()=>data},controller:{processToolCall:async command=>{writes++;data=command.data;}}});
 const result=v=>({ok:true,committed:true,operationId:'same-operation',chart:{projection:{create:{manifest:{id:'chart'}},data:{value:v},version:[v,v]}}});
 assert.equal((await transport.project(result(2))).chart.code,'CHART_REFRESH_PENDING');
 assert.equal((await transport.project(result(3))).chart.code,'CHART_REFRESH_PENDING');
 assert.equal((await transport.project(result(2))).chart.discarded,'older-response');
 fail=false;await transport.retryProjections();await transport.retryProjections();
 assert.equal(writes,1);assert.equal(data.value,3);assert.equal(requests,0);
 assert.equal((await transport.project(result(1))).chart.discarded,'older-response');assert.equal(writes,1);
});
