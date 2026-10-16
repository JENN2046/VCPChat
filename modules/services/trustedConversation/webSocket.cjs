'use strict';
const {randomUUID}=require('node:crypto');
// Only locally minted, pre-send failures prove zero dispatch. Codes/flags from
// sockets or host responses cannot manufacture this identity.
const notSentErrors=new WeakSet();
function notSent(code){const error=Error(code);notSentErrors.add(error);return error;}
function isNativeRequestNotSent(error){return notSentErrors.has(error);}
function isNativeClientInstanceId(value){return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);}
function isSecureNativeWebSocketUrl(value){try{const u=new URL(value);return !u.username&&!u.password&&!u.hash&&(u.protocol==='wss:'||(u.protocol==='ws:'&&['127.0.0.1','[::1]'].includes(u.hostname)));}catch{return false;}}
function createNativeWebSocketClient({timeoutMs=25000}={}){
 const pending=new Map();let socket=null,epoch=0;
 function close(ws){if(ws!==socket)return;socket=null;epoch++;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('NATIVE_TRANSPORT_UNAVAILABLE'));}pending.clear();}
 function bind(ws){if(socket)close(socket);socket=ws;epoch++;ws.once('close',()=>close(ws));}
 function receive(ws,message){
  if(message?.type!=='native_conversation_response')return false;
  if(ws!==socket)return true;
  const p=pending.get(message.requestId);if(!p)return true;
  pending.delete(message.requestId);clearTimeout(p.timer);
  p.resolve(message.result);return true;
 }
 function request(input={}){
  const {toolName,authorization,body,clientInstanceId}=input||{};
  if(!isNativeClientInstanceId(clientInstanceId))return Promise.reject(notSent('NATIVE_CLIENT_BINDING_REQUIRED'));
  const ws=socket;if(!ws||ws.readyState!==1)return Promise.reject(notSent('NATIVE_TRANSPORT_UNAVAILABLE'));
  if(!isSecureNativeWebSocketUrl(ws.url))return Promise.reject(notSent('NATIVE_SECURE_CHANNEL_REQUIRED'));
  if(pending.size>=16)return Promise.reject(notSent('NATIVE_REQUEST_BUSY'));
  let requestId,text;
  try{requestId=randomUUID();text=JSON.stringify({type:'native_conversation_request',requestId,sessionId:clientInstanceId,toolName,authorization,body});}
  catch{return Promise.reject(notSent('NATIVE_REQUEST_INVALID'));}
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('NATIVE_RESULT_UNKNOWN'));},timeoutMs);
   pending.set(requestId,{resolve,reject,timer});
   const unknown=()=>{if(!pending.has(requestId))return;pending.delete(requestId);clearTimeout(timer);reject(Error('NATIVE_RESULT_UNKNOWN'));};
   // Once send starts, never propagate a pre-send proof from thrown/callback errors.
   try{ws.send(text,error=>{if(error)unknown();});}catch{unknown();}
  });
 }
 return {bind,receive,request,close,epoch:()=>epoch};
}
module.exports={createNativeWebSocketClient,isSecureNativeWebSocketUrl,isNativeClientInstanceId,isNativeRequestNotSent};
