'use strict';
const http=require('node:http');
const {allowed}=require('./native-sync-r9-public-gateway.cjs');
exports.create=async function(target){
 let origin=null;const counts={allowed:0,denied:0};
 const server=http.createServer((req,res)=>{
  res.setHeader('X-VCP-R9-Gateway','mobile-only');
  if(!allowed(req.method,req.url)){counts.denied++;res.writeHead(404);return res.end();}
  if(!origin||req.headers.host!==new URL(origin).host){res.writeHead(421);return res.end();}
  if(req.method==='POST'&&req.headers.origin!==origin){res.writeHead(403);return res.end();}
  const url=target();if(!url){res.writeHead(503);return res.end();}
  if(Number(req.headers['content-length']||0)>32768){res.writeHead(413);return res.end();}
  const parsed=new URL(req.url,origin),headers={host:new URL(url).host,'x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1'};
  for(const name of ['cookie','origin','accept','content-type','if-none-match','if-modified-since'])if(req.headers[name])headers[name]=req.headers[name];
  const proxy=http.request(url+parsed.pathname+parsed.search,{method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});let size=0;
  req.on('data',b=>{size+=b.length;if(size>32768){proxy.destroy();req.destroy();}});req.on('aborted',()=>proxy.destroy());proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});counts.allowed++;req.pipe(proxy);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {localPort:server.address().port,counts,setOrigin(value){if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(value))throw Error('R9_PUBLIC_ORIGIN_INVALID');origin=value;},get origin(){return origin;},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
};
