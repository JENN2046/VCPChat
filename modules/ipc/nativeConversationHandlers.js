'use strict';
const fs=require('node:fs'),{ipcMain}=require('electron');
const {installNativeConversationPort}=require('../services/trustedConversation/nativePort.cjs');
const {createNativeTransport}=require('../services/trustedConversation/transport.cjs');
function bindingFromEnvironment(){const file=process.env.VCPCHAT_NATIVE_TOOL_BINDING_FILE;if(!file)return null;const binding=JSON.parse(fs.readFileSync(file,'utf8'));if(!binding||typeof binding!=='object'||Array.isArray(binding))throw Error('NATIVE_CONFIGURATION_INVALID');return binding;}
const initializedWindows=new WeakSet();
// Main-process ownership: destroying a renderer must not forget a failed revoke.
// Keep bindings separate; only identifiers, never credentials or proposal content.
const invalidationScopes=new Map();
async function initialize({mainWindow,chartService,binding,nativeRequest,nativeEpoch=()=>0}){
 if(initializedWindows.has(mainWindow)||mainWindow.isDestroyed?.())return;
 const channels=['native-conversation:prepare','native-conversation:execute','native-conversation:propose','native-conversation:presented','native-conversation:invalidate'];
 const unavailable=(code,handled)=>{for(const c of channels)ipcMain.handle(c,()=>({handled,ok:false,code,...(handled?{preserveInput:true,message:'原生排期配置不可用，请检查配置后重启。待发送文本已保留。'}:{})}));initializedWindows.add(mainWindow);mainWindow.webContents.once('destroyed',()=>{initializedWindows.delete(mainWindow);for(const c of channels)ipcMain.removeHandler(c);});};
 let transport;
 try{
  if(binding===undefined)binding=bindingFromEnvironment();
  if(!binding){unavailable('NOT_CONFIGURED',false);return;}
  const controller=require('../../VCPDistributedServer/Plugin/ChartController/ChartControllerService');controller.initialize({chartService});
  transport=createNativeTransport({binding,chartService,controller,nativeRequest});
 }catch{unavailable('NATIVE_CONFIGURATION_UNAVAILABLE',true);return;}
 const readEpoch=binding.transport==='vcp-websocket'?nativeEpoch:()=>0;
 let connectionEpoch=readEpoch();
 const scopeKey=JSON.stringify([binding.transport,binding.clientInstanceId,binding.toolboxUrl,binding.toolName,binding.transportTokenEnv,binding.applicationAuthorizationEnv]);
 if(!invalidationScopes.has(scopeKey))invalidationScopes.set(scopeKey,{invalidations:new Map(),invalidationVersions:new Map(),synchronized:new Set()});
 const {invalidations,invalidationVersions,synchronized}=invalidationScopes.get(scopeKey);
 let disposed=false;
 const wc=mainWindow.webContents,pending=new Map(),plans=new Map(),proposalRequests=new Map();const owned=e=>!disposed&&e.sender===wc&&e.senderFrame===wc.mainFrame&&!mainWindow.isDestroyed();
 function refreshConnection(){
  if(connectionEpoch===readEpoch())return false;
  connectionEpoch=readEpoch();port.invalidate();pending.clear();plans.clear();proposalRequests.clear();synchronized.clear();
  // Retain failed invalidations, but prevent old replies from acknowledging new work.
  for(const [key,request] of invalidations)invalidations.set(key,{...request,inFlight:null});
  for(const key of invalidationVersions.keys())invalidationVersions.set(key,{});
  return true;
 }
 const connectionChanged=()=>({handled:true,ok:false,code:'NATIVE_CONNECTION_CHANGED',preserveInput:true,message:'连接已变化，旧方案已失效。请重新提出调整并确认新方案。'});
 // History can contain a host-side plan absent from this fresh process's plans map.
 // Keep the conversation closed until every requested invalidation is acknowledged.
 const blocked=conversationId=>[...invalidations.values()].some(p=>p.conversationId===conversationId);
 const invalidationRequired=()=>({handled:true,ok:false,code:'PRESENTATION_INVALIDATION_REQUIRED'});
 const retireRequests=p=>{for(const [key,request] of proposalRequests)if(request.conversationId===p.conversationId&&(!p.messageId||request.messageId===p.messageId))proposalRequests.delete(key);};
 const retirePlans=p=>{for(const [id,plan] of plans)if(plan.conversationId===p.conversationId&&(!p.messageId||plan.messageId===p.messageId))plans.delete(id);};
 async function sendInvalidation(key,request){
  if(request.inFlight)return request.inFlight;
  const epoch=readEpoch();
  const attempt=(async()=>{
   let result;try{result=await transport.request('invalidate',request.payload);}catch{return invalidationRequired();}
   // A late response may only acknowledge the exact generation that sent it.
   if(epoch===readEpoch()&&result?.ok===true&&invalidations.get(key)===request){invalidations.delete(key);if(request.coldStart)synchronized.add(request.conversationId);retirePlans(request.payload);return result;}
   return invalidationRequired();
  })();
  request.inFlight=attempt;
  try{return await attempt;}finally{if(request.inFlight===attempt)request.inFlight=null;}
 }
 function queueInvalidation(p,coldStart=false){
  const payload={conversationId:p.conversationId,...(p.messageId?{messageId:p.messageId}:{})};
  const key=JSON.stringify([payload.conversationId,payload.messageId||null]),request={conversationId:payload.conversationId,payload,inFlight:null,coldStart};
  invalidations.set(key,request);invalidationVersions.set(payload.conversationId,{});
  for(const [id,event] of pending)if(event.conversationId===payload.conversationId)pending.delete(id);
  retireRequests(payload);
  return sendInvalidation(key,request);
 }
 async function retryInvalidations(){
  for(const [key,request] of [...invalidations]){
   if(disposed)return;
   if(invalidations.get(key)===request)await sendInvalidation(key,request);
  }
 }
 // A fresh process has no tombstones. Reconcile the entire conversation before
 // creating a new proposal/source, even when the deleted proposal is absent from history.
 async function synchronizeConversation(conversationId){
  if(typeof conversationId!=='string'||!conversationId)return invalidationRequired();
  if(blocked(conversationId))return invalidationRequired();
  if(synchronized.has(conversationId))return {ok:true,version:invalidationVersions.get(conversationId)};
  const attempt=queueInvalidation({conversationId},true),version=invalidationVersions.get(conversationId);
  return {...await attempt,version};
 }
 const port=installNativeConversationPort({window:mainWindow,observedSequence:transport.sequence,isSessionCurrent:async()=>!mainWindow.isDestroyed()&&connectionEpoch===readEpoch(),snapshot:async(kind,input)=>wc.executeJavaScript(`(()=>{const input=document.getElementById('messageInput'),button=document.getElementById('sendMessageBtn'),c=window.__nativeConversationContext,hit=${kind==='mouse'?`document.elementFromPoint(${Number(input.x)||0},${Number(input.y)||0})`:'null'};return {text:input?.value??'',conversationId:c?.conversationId,eligible:!!c&&(${kind==='keyboard'?`!!button&&!button.disabled&&button.dataset.mode!=='interrupt'&&(document.activeElement===button||(${JSON.stringify(input.key)}==='Enter'&&document.activeElement===input))`:"!!button&&!button.disabled&&(hit===button||button.contains(hit))&&button.dataset.mode!=='interrupt'"})};})()`)});
 ipcMain.handle(channels[0],async(e,p={})=>{if(!owned(e))return {handled:true,ok:false,code:'TRUSTED_CLIENT_REQUIRED'};if(refreshConnection())return connectionChanged();const epoch=readEpoch();if(blocked(p.conversationId))return invalidationRequired();const arrivalVersion=invalidationVersions.get(p.conversationId);let context;try{context=await port.consume(p);}catch{
   // Denial-only recognition: never mint a trusted source from renderer/voice text.
   const text=typeof p.text==='string'?p.text.trim():'',hasPlan=[...plans.values()].some(plan=>plan.conversationId===p.conversationId);
   const nativeIntent=/^把.+(?:延后|推迟|提前)[1-9][0-9]{0,3}分钟[。！!]?$/u.test(text)||/^再(?:延后|推迟|提前)/u.test(text)||(hasPlan&&/^(可以|同意|执行吧|取消|不要|不用了|不同意|改成|改为)/u.test(text));
   return {handled:nativeIntent,ok:false,code:'NATIVE_SOURCE_REQUIRED',...(nativeIntent?{preserveInput:true,message:'此排期指令需要手动发送，请物理点击发送按钮或按 Enter。待发送文本已保留。'}:{})};
  }
  // Consume the short-lived physical event before any network await. The retained
  // trusted context is single-use, but cannot prepare until reconciliation succeeds.
  if(epoch!==readEpoch())return connectionChanged();
  if(!owned(e)||blocked(p.conversationId)||invalidationVersions.get(p.conversationId)!==arrivalVersion)return invalidationRequired();
  const sync=await synchronizeConversation(p.conversationId),version=sync.version;
  if(epoch!==readEpoch())return connectionChanged();
  if(!sync.ok||!owned(e)||blocked(p.conversationId)||invalidationVersions.get(p.conversationId)!==version)return invalidationRequired();
  // A removed/failed display cannot remain confirmable even if renderer cleanup lost its IPC.
  for(const [id,plan] of plans){
   const visible=await wc.executeJavaScript(`(()=>{const e=[...(document.getElementById('chatMessages')?.querySelectorAll('[data-native-plan-id]')||[])].find(e=>e.dataset.nativePlanId===${JSON.stringify(id)});return !!e?.isConnected&&e.textContent===${JSON.stringify(plan.presentation)}&&window.__nativeConversationContext?.conversationId===${JSON.stringify(plan.conversationId)};})()`);
   if(plans.get(id)!==plan)continue;
   if(!visible){const invalidated=await queueInvalidation({conversationId:plan.conversationId,messageId:plan.messageId});if(!invalidated?.ok)return invalidationRequired();}
  }
  const event=port.read(context),invalidated=()=>epoch!==readEpoch()||blocked(event.conversationId)||invalidationVersions.get(event.conversationId)!==version;if(invalidated())return invalidationRequired();let r;try{r=await transport.request('prepare',event);}catch{return {handled:true,ok:false,code:'NATIVE_TRANSPORT_UNAVAILABLE'};}if(invalidated())return invalidationRequired();if(r.sourceId)pending.set(r.sourceId,event);return r.ok===false&&!(r.code==='READ_ONLY_POLICY'&&r.handled===false)?{...r,handled:true}:r;});
 ipcMain.handle(channels[1],async(e,p={})=>{if(refreshConnection())return connectionChanged();const event=pending.get(p.sourceId);if(!owned(e)||!event)return {ok:false,code:'SOURCE_UNKNOWN'};pending.delete(p.sourceId);if(blocked(event.conversationId))return invalidationRequired();return transport.project(await transport.request('execute',{sourceId:p.sourceId,conversationId:event.conversationId}));});
 ipcMain.handle(channels[2],async(e,p={})=>{
  if(!owned(e)||p.tool!==binding.toolName)return {ok:false};
  refreshConnection();const epoch=readEpoch();
  const sync=await synchronizeConversation(p.conversationId);
  if(epoch!==readEpoch())return connectionChanged();
  if(!sync.ok||!owned(e)||blocked(p.conversationId)||invalidationVersions.get(p.conversationId)!==sync.version)return invalidationRequired();
  // Register before DOM or transport awaits: request order, never response order, owns this message.
  const key=JSON.stringify([p.conversationId,p.messageId]),request={conversationId:p.conversationId,messageId:p.messageId};proposalRequests.set(key,request);
  const current=()=>epoch===readEpoch()&&owned(e)&&proposalRequests.get(key)===request&&!blocked(p.conversationId);
  const c=await wc.executeJavaScript('window.__nativeConversationContext?.conversationId');if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};if(!c||c!==p.conversationId)return {ok:false};
  const mainMessage=await wc.executeJavaScript(`(()=>{const root=document.getElementById('chatMessages');return !!root&&[...root.querySelectorAll('.message-item')].some(e=>e.isConnected&&e.dataset.messageId===${JSON.stringify(p.messageId)});})()`);
  if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};if(mainMessage!==true)return {ok:false,code:'MAIN_CHAT_REQUIRED'};
  const r=await transport.request('propose',{...p.payload,messageId:p.messageId,conversationId:c});
  if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};
  if(r.plan){for(const [id,old] of plans)if(old.conversationId===r.plan.conversationId&&old.messageId===r.plan.messageId)plans.delete(id);plans.set(r.plan.id,r.plan);}return r;
 });
 ipcMain.handle(channels[3],async(e,p={})=>{if(refreshConnection())return connectionChanged();const epoch=readEpoch(),plan=plans.get(p.planId);if(!owned(e)||!plan)return {ok:false};if(blocked(plan.conversationId))return invalidationRequired();const snapshot=await wc.executeJavaScript(`(()=>{const e=[...(document.getElementById('chatMessages')?.querySelectorAll('[data-native-plan-id]')||[])].find(e=>e.dataset.nativePlanId===${JSON.stringify(p.planId)});return {text:e?.textContent,connected:!!e?.isConnected,conversationId:window.__nativeConversationContext?.conversationId};})()`);if(epoch!==readEpoch())return connectionChanged();if(blocked(plan.conversationId))return invalidationRequired();if(!snapshot.connected||snapshot.text!==plan.presentation||snapshot.conversationId!==plan.conversationId)return {ok:false,code:'PRESENTATION_MISMATCH'};return transport.request('presented',{planId:plan.id,text:snapshot.text,conversationId:plan.conversationId});});
 ipcMain.handle(channels[4],async(e,p={})=>{
  if(!owned(e)||typeof p.conversationId!=='string'||!p.conversationId||(p.messageId!=null&&typeof p.messageId!=='string'))return {ok:false};
  return queueInvalidation(p);
 });
 const timer=setInterval(async()=>{try{refreshConnection();await retryInvalidations();if(disposed)return;const r=await transport.request('recover');for(const result of r.results||[])await transport.project(result);}catch{}finally{if(!disposed)await transport.retryProjections();}},30000);timer.unref?.();
 initializedWindows.add(mainWindow);
 // Status only refreshes a monotonic sequence; it must not delay window loading.
 void transport.request('status').catch(()=>{});
 void retryInvalidations();
 wc.once('destroyed',()=>{disposed=true;initializedWindows.delete(mainWindow);clearInterval(timer);port.dispose();pending.clear();plans.clear();proposalRequests.clear();for(const c of channels)ipcMain.removeHandler(c);});
}
module.exports={initialize,bindingFromEnvironment};
