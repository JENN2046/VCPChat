'use strict';
const {spawn}=require('node:child_process');
const https=require('node:https');
const {fail}=require('./protocol');
function requestOverTls({port,token,route,body}){
 if(!/^\/api\/(?:v1\/sync\/(?:pull|push|status)|plugins\/NativeSync\/mobile\/catalog)(?:\?|$)/.test(route)&&route!=='/healthz')return Promise.reject(fail('UNAPPROVED_SYNC_ROUTE'));
 return new Promise((resolve,reject)=>{
  const q=https.request({hostname:'127.0.0.1',port,servername:'dnvcp.skmt617.top',rejectUnauthorized:true,agent:false,path:route,method:body?'POST':'GET',headers:{Host:'dnvcp.skmt617.top:13848','Content-Type':'application/json',...(route==='/healthz'?{}:{Authorization:`Bearer ${token}`})}},r=>{
   let text='',bytes=0;r.setEncoding('utf8');
   r.on('data',b=>{bytes+=Buffer.byteLength(b);if(bytes>16*1024*1024)r.destroy();else text+=b;});
   r.on('error',()=>reject(fail('NETWORK_UNAVAILABLE')));r.on('end',()=>{let value;try{value=JSON.parse(text);}catch{return reject(fail('INVALID_SYNC_RESPONSE'));}if(r.statusCode<200||r.statusCode>=300)return reject(fail(value.error?.code||'SYNC_HTTP_ERROR'));resolve(value);});
  });q.setTimeout(8000,()=>q.destroy());q.on('error',()=>reject(fail('NETWORK_UNAVAILABLE')));q.end(body?JSON.stringify(body):undefined);
 });
}
async function openSshTransport({url,ssh,token,background=false}){
 const endpoint=new URL(url);
 if(ssh?.alias!=='wp08'||ssh.remotePort!==8888||endpoint.protocol!=='http:'||endpoint.hostname!=='127.0.0.1'||!endpoint.port||endpoint.pathname!=='/'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw fail('UNAPPROVED_SSH_TRANSPORT');
 let stopped=false,child=null,retry=null,error=null,verified=false;
 function launch(){
  if(stopped)return;
  // This host's SSH front end requires a session channel. A stdin-only cat
  // keeps it alive without reading/writing remote files or running a worker.
  // Preserve the trusted Windows SSH configuration/agent environment. Explicitly
  // clear SendEnv so unrelated desktop/provider environment is not forwarded.
  child=spawn('ssh',['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','SendEnv=-*','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-L',`127.0.0.1:${endpoint.port}:127.0.0.1:8888`,'wp08','cat'],{windowsHide:true,stdio:['pipe','ignore','ignore']});
  child.stdin.on('error',()=>{});
  child.on('error',()=>{error=fail('SSH_TRANSPORT_UNAVAILABLE');});child.once('exit',()=>{child=null;verified=false;if(!stopped)retry=setTimeout(launch,3000);});
 }
 const close=async()=>{stopped=true;clearTimeout(retry);const c=child;if(c&&!c.killed){await new Promise(resolve=>{const timer=setTimeout(()=>{c.kill('SIGTERM');resolve();},5000);timer.unref();c.once('exit',()=>{clearTimeout(timer);resolve();});c.stdin.end();});}};
 launch();try{
  const end=Date.now()+30000;
  const rawRequest=(route,options={})=>requestOverTls({port:Number(endpoint.port),token,route,body:options.body});
  const request=async(route,options={})=>{
   if(!verified&&route!=='/healthz'){
    const info=await rawRequest('/healthz');
    if(info.service!=='VCPMobileGateway'||info.port!==8888||info.httpsReady!==true)throw fail('SSH_TRANSPORT_UNAVAILABLE');
    verified=true;
   }
   return rawRequest(route,options);
  };
  if(background)return {close,request};
  while(Date.now()<end){if(error)throw error;try{const info=await request('/healthz');if(info.service==='VCPMobileGateway'&&info.port===8888&&info.httpsReady===true){verified=true;return {close,request};}}catch{}await new Promise(r=>setTimeout(r,250));}
  throw fail('SSH_TRANSPORT_UNAVAILABLE');
 }catch(e){await close();throw e;}
}
module.exports={openSshTransport,requestOverTls};
