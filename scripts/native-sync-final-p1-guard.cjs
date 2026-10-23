'use strict';
// Isolated acceptance transport only. main.js, preload, Queue, credentials,
// adapter, renderer and durable state remain the real application modules.
require('./native-sync-r3-guard.cjs');
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const appData=path.resolve(process.env.VCPCHAT_APP_DATA_DIR||''),run=path.resolve(process.env.VCPCHAT_R3_RUN_ROOT||'');
if(!appData.startsWith(run+path.sep)||process.env.VCP_FINAL_P1_ISOLATED!=='1')throw Error('FINAL_P1_ISOLATION_REQUIRED');
const center=new URL(process.env.VCP_FINAL_P1_CENTER||'');
if(center.protocol!=='http:'||center.hostname!=='127.0.0.1'||center.pathname!=='/')throw Error('FINAL_P1_LOOPBACK_REQUIRED');
const original=Module._load;
let registrations=0,pushes=0,lostAcks=0;
function receipt(){fs.writeFileSync(path.join(appData,'FINAL_TRANSPORT.json'),JSON.stringify({registrations,pushes,lostAcks,productionConnections:0}));}
Module._load=function(request,parent,...rest){
 const exported=original.call(this,request,parent,...rest);
 if(parent?.filename===path.join(__dirname,'../modules/services/nativeSync/runtime.js')){
  if(request==='./desktopCredential')return {...exported,desktopCredential:options=>exported.desktopCredential({...options,register:async grant=>{
   registrations++;receipt();if(!fs.existsSync(path.join(appData,'.online')))throw Object.assign(Error('synthetic offline'),{code:'SSH_TRANSPORT_UNAVAILABLE'});
   return {registered:true,deviceId:grant.deviceId,expires:Date.now()+86400000};
  }})};
  if(request==='./sshTransport')return {...exported,openSshTransport:async options=>{
   if(!options.background&&!fs.existsSync(path.join(appData,'.online')))throw Object.assign(Error('synthetic offline'),{code:'SSH_TRANSPORT_UNAVAILABLE'});
   return {close:async()=>{},request:async(route,{body}={})=>{
    if(!fs.existsSync(path.join(appData,'.online')))throw Object.assign(Error('synthetic offline'),{code:'NETWORK_UNAVAILABLE'});
    if(route.endsWith('/catalog'))return {published:body.topics.length};
    const response=await fetch(center.origin+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer final-isolated-token','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const result=await response.json();if(!response.ok)throw Object.assign(Error('synthetic center error'),{code:result.error?.code});
    if(route.endsWith('/push')){pushes++;if(!fs.existsSync(path.join(appData,'.lost-ack'))){lostAcks++;fs.writeFileSync(path.join(appData,'.lost-ack'),'1');receipt();throw Object.assign(Error('synthetic lost ACK'),{code:'NETWORK_UNAVAILABLE'});}receipt();}
    return result;
   }};
  }};
 }
 return exported;
};
