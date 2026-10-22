'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {allowed}=require('../scripts/native-sync-r9-public-gateway.cjs');
test('only mobile shell and bounded mobile session routes pass the public gateway',()=>{
 for(const p of ['/mobile/','/mobile/icon-192.png','/mobile/icon-512.png','/mobile/manifest.webmanifest','/mobile/sw.js','/mobile/assets/index-abc.js','/mobile/api/session','/mobile/api/conversations','/mobile/api/conversations/test-topic?after=0'])assert.equal(allowed('GET',p),true,p);
 for(const p of ['/mobile/api/pair','/mobile/api/conversations/test-topic/messages','/mobile/api/executions/job_123/cancel'])assert.equal(allowed('POST',p),true,p);
});
test('admin, native sync, arbitrary topics, traversal and proxy-style URLs never pass',()=>{
 for(const method of ['GET','POST'])for(const p of ['/','/api/v1/sync/push','/api/v1/sync/pull','/api/plugins/NativeSync/mobile/pairing','/admin','/config.env','/mobile/api/conversations/production','/mobile/%2e%2e/config.env','/mobile/../../config.env','https://elsewhere/mobile/','/mobile/assets/../../config.env'])assert.equal(allowed(method,p),false,p);
 assert.equal(allowed('DELETE','/mobile/api/session'),false);
 for(const p of ['http://[','//['])assert.equal(allowed('GET',p),false);
});
test('actual proxy enforces Host/Origin and strips the global authorization header',async()=>{
 const http=require('node:http'),{create}=require('../scripts/native-sync-r9-mobile-proxy.cjs');let received=[];
 const upstream=http.createServer(async(req,res)=>{for await(const _ of req){}received.push(req.headers);res.end('ok');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const proxy=await create(()=>`http://127.0.0.1:${upstream.address().port}`),origin='https://r9-unit.trycloudflare.com';proxy.setOrigin(origin);
 const request=(route,{method='GET',host=new URL(origin).host,requestOrigin=origin,body=''}={})=>new Promise((resolve,reject)=>{
  const q=http.request({host:'127.0.0.1',port:proxy.localPort,path:route,method,headers:{Host:host,Origin:requestOrigin,Authorization:'Bearer synthetic-global-key',Cookie:'mobile=synthetic','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});q.on('error',reject);q.end(body);
 });
 try{
  assert.equal(await request('/api/v1/sync/push',{method:'POST'}),404);
  assert.equal(await request('/mobile/api/session',{host:'untrusted.example'}),421);
  assert.equal(await request('/mobile/api/pair',{method:'POST',requestOrigin:'https://untrusted.example'}),403);
  assert.equal(await request('/mobile/api/pair',{method:'POST',body:'x'.repeat(32769)}),413);
  assert.equal(received.length,0);
  assert.equal(await request('/mobile/api/session'),200);assert.equal(received.length,1);
  assert.equal(received[0].authorization,undefined);assert.equal(received[0].cookie,'mobile=synthetic');assert.equal(received[0]['x-forwarded-proto'],'https');
 }finally{await proxy.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
});
