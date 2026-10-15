'use strict';
const {randomUUID}=require('node:crypto');
function createNativeWebSocketClient({timeoutMs=25000}={}){
 const pending=new Map();let socket=null,epoch=0;
 function close(ws){if(ws!==socket)return;socket=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('NATIVE_TRANSPORT_UNAVAILABLE'));}pending.clear();}
 function bind(ws){if(socket)close(socket);socket=ws;epoch++;ws.once('close',()=>close(ws));}
 function receive(ws,message){
  if(message?.type!=='native_conversation_response')return false;
  if(ws!==socket)return true;
  const p=pending.get(message.requestId);if(!p)return true;
  pending.delete(message.requestId);clearTimeout(p.timer);
  p.resolve(message.result);return true;
 }
 function request({toolName,authorization,body,clientInstanceId}){
  if(!/^[a-f0-9-]{36}$/.test(clientInstanceId||''))return Promise.reject(Error('NATIVE_CLIENT_BINDING_REQUIRED'));
  const ws=socket;if(!ws||ws.readyState!==1)return Promise.reject(Error('NATIVE_TRANSPORT_UNAVAILABLE'));
  let target;try{target=new URL(ws.url);}catch{return Promise.reject(Error('NATIVE_SECURE_CHANNEL_REQUIRED'));}
  if(target.protocol!=='wss:'&&!(target.protocol==='ws:'&&['127.0.0.1','[::1]'].includes(target.hostname)))return Promise.reject(Error('NATIVE_SECURE_CHANNEL_REQUIRED'));
  if(pending.size>=16)return Promise.reject(Error('NATIVE_REQUEST_BUSY'));
  const requestId=randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('NATIVE_RESULT_UNKNOWN'));},timeoutMs);
   pending.set(requestId,{resolve,reject,timer});
   try{ws.send(JSON.stringify({type:'native_conversation_request',requestId,sessionId:clientInstanceId,toolName,authorization,body}));}
   catch{pending.delete(requestId);clearTimeout(timer);reject(Error('NATIVE_RESULT_UNKNOWN'));}
  });
 }
 return {bind,receive,request,close,epoch:()=>epoch};
}
module.exports={createNativeWebSocketClient};
