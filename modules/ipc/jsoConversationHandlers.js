'use strict';
const fs=require('node:fs');const path=require('node:path');const {ipcMain}=require('electron');
const {OwnerSession}=require('../services/jsoConversation/ownerSession');
const {openOwnerLogin}=require('../services/jsoConversation/ownerLogin');
const {ConversationService,parseShift}=require('../services/jsoConversation/service');
const {installNativeSource}=require('../services/jsoConversation/nativeSource');
const {createChartProjector}=require('../services/jsoConversation/chartProjector');
function loopback(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('JSO_LOCAL_ONLY');return u;}
async function initialize({mainWindow,chartService,appDataRoot,binding,controller,toolInvoker}){
 if(!binding){ // The optional renderer status control must not invoke a missing handler.
  const channels=['jso-owner:status','jso-owner:login','jso-owner:logout'];
  for(const channel of channels)ipcMain.handle(channel,()=>({configured:false,authenticated:false}));
  mainWindow.webContents.once('destroyed',()=>{for(const channel of channels)ipcMain.removeHandler(channel);});
  return null; // No credential discovery or endpoint calls.
 }
 const jso=loopback(binding.jsoUrl),toolbox=loopback(binding.toolboxUrl);
 if(!binding.ownerSubjectId||!binding.assistantSubjectId||!binding.resourceId)throw Error('JSO_BINDING_INVALID');
 const ownerSession=new OwnerSession({jsoUrl:jso.href,ownerSubjectId:binding.ownerSubjectId,resourceId:binding.resourceId,credential:binding.ownerToken});
 const ownerRequest=(_pathname,body)=>ownerSession.delegate(body);
 const verifyOwner=()=>ownerSession.verify();
 const tool=toolInvoker??(async args=>{if(!/^[a-z_]+$/.test(args.command)||typeof args.payload_json!=='string'||/「始」|「末」|<<<\[|\]>>>/.test(args.payload_json))throw Error('NATIVE_TOOL_ENVELOPE_INVALID');const text='<<<[TOOL_REQUEST]>>>\ntool_name:「始」JennShootingOperations「末」,\ncommand:「始」'+args.command+'「末」,\npayload_json:「始」'+args.payload_json+'「末」\n<<<[END_TOOL_REQUEST]>>>';const r=await fetch(new URL('/v1/human/tool',toolbox),{method:'POST',redirect:'error',signal:AbortSignal.timeout(22000),headers:{authorization:'Bearer '+binding.toolboxToken,'content-type':'text/plain'},body:text});return r.json();});
 const chartController=controller??require('../../VCPDistributedServer/Plugin/ChartController/ChartControllerService');chartController.initialize({chartService});
 const service=new ConversationService({journalPath:path.join(appDataRoot,'JSO','conversation-journal.json'),tool,verifyOwner,
  ownerAuthorize:r=>ownerRequest('/api/v2/agent/owner-delegation',{sourceRef:r.sourceId,assistantSubjectId:binding.assistantSubjectId,command:r.proposal.command}),
  ownerCancel:r=>ownerRequest('/api/v2/agent/owner-delegation',{sourceRef:r.sourceId,assistantSubjectId:binding.assistantSubjectId,command:r.proposal.command,cancel:true}),
  refreshChart:createChartProjector({controller:chartController,chartService})});
 const wc=mainWindow.webContents;
 const native=installNativeSource({window:mainWindow,service,verifyOwner,snapshot:async(kind,input)=>wc.executeJavaScript(`(()=>{const input=document.getElementById('messageInput'),button=document.getElementById('sendMessageBtn');const c=window.__jsoConversationContext;const hit=${kind==='mouse'?`document.elementFromPoint(${Number(input.x)||0},${Number(input.y)||0})`:"null"};return {text:input?.value??'',conversationId:c?.conversationId,eligible:!!c&&(${kind==='keyboard'?"document.activeElement===input&&button?.dataset.mode!=='interrupt'":"!!button&&(hit===button||button.contains(hit))&&button.dataset.mode!=='interrupt'"})};})()`) });
 const owned=event=>event.sender===wc&&event.senderFrame===wc.mainFrame&&!mainWindow.isDestroyed();
 let loginPending=null;
 ipcMain.handle('jso-owner:status',async event=>{if(!owned(event))return {configured:false,authenticated:false};await ownerSession.verify();return ownerSession.status();});
 ipcMain.handle('jso-owner:login',async event=>{if(!owned(event))return {configured:false,authenticated:false};if(!loginPending)loginPending=openOwnerLogin({parent:mainWindow,session:ownerSession}).finally(()=>loginPending=null);return loginPending;});
 ipcMain.handle('jso-owner:logout',async event=>{if(!owned(event))return {ok:false};ownerSession.logout();for(const p of Object.values(service.journal.data.plans))service.invalidateConversation(p.conversationId);return ownerSession.status();});
 ipcMain.handle('jso-conversation:submit',async(event,payload={})=>{
  if(!owned(event))return {handled:true,ok:false,code:'TRUSTED_CLIENT_REQUIRED'};
  const captured=await native.consume(payload);if(!captured.ok)return {handled:false,...captured};
  const hasJsoContext=service.conversationVersions.has(captured.source.conversationId)||Object.values(service.journal.data.sources).some(s=>s.conversationId===captured.source.conversationId&&parseShift(s.text))||Object.values(service.journal.data.plans).some(p=>p.conversationId===captured.source.conversationId&&!p.closed)||Object.values(service.journal.data.operations).some(o=>service.journal.data.sources[o.sourceId]?.conversationId===captured.source.conversationId);
  const recognizable=!!parseShift(payload.text)||(hasJsoContext&&/^(把|再延后|再推迟|再提前|可以|同意|执行吧|取消|不要|不用了|不同意|改成|改为)/u.test(payload.text.trim()));
  if(!recognizable)return {handled:false,ok:true};
  return {handled:true,sourceId:captured.source.id,ok:true};
 });
 ipcMain.handle('jso-conversation:execute',async(event,payload={})=>{
  if(!owned(event))return {handled:true,ok:false,code:'TRUSTED_CLIENT_REQUIRED'};
  const source=service.journal.data.sources[payload.sourceId];if(!source)return {handled:true,ok:false,code:'TRUSTED_SOURCE_REQUIRED'};
  if(!source.operationId&&/^(可以|同意|执行吧)[。！!]?$/u.test(source.text.trim())){
   const plans=Object.values(service.journal.data.plans).filter(p=>p.conversationId===source.conversationId&&!p.closed);
   for(const p of plans){const shown=await wc.executeJavaScript(`(()=>{const e=document.querySelector('[data-jso-plan-id="'+${JSON.stringify(p.id)}+'"]');return e?.isConnected?e.textContent:null;})()`);if(shown!==p.presentation){p.closed=true;service.journal.save();}}
  }
  try{return {handled:true,sourceId:source.id,...await service.submit(source.id,binding.resourceId)};}catch{return {handled:true,ok:false,code:'JSO_SERVICE_UNAVAILABLE'};}
 });
 ipcMain.handle('jso-conversation:invalidate',async(event,payload={})=>{if(!owned(event))return {ok:false};service.invalidateConversation(payload.conversationId);return {ok:true};});
 // Proposals are untrusted suggestions. Host recomputes a readonly JSO preview; this IPC cannot authorize a write.
 ipcMain.handle('jso-conversation:proposal',async(event,payload={})=>{
  if(!owned(event))return {ok:false,code:'TRUSTED_CLIENT_REQUIRED'};
  const context=await wc.executeJavaScript('window.__jsoConversationContext?.conversationId');
  if(!context||context!==payload.conversationId||typeof payload.messageId!=='string')return {ok:false,code:'CONVERSATION_MISMATCH'};
  if(payload.invalidate){service.invalidateMessage(context,payload.messageId);return {ok:true};}
  if(typeof payload.scheduleItemId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(payload.scheduleItemId)||!Number.isSafeInteger(payload.minutes))return {ok:false,code:'INVALID_PROPOSAL'};
  return service.propose({conversationId:context,messageId:payload.messageId,resourceId:binding.resourceId,scheduleItemId:payload.scheduleItemId,minutes:payload.minutes});
 });
 ipcMain.handle('jso-conversation:presented',async(event,payload={})=>{
  if(!owned(event))return {ok:false};const p=service.journal.data.plans[payload.planId];if(!p||p.closed)return {ok:false};
  const snapshot=await wc.executeJavaScript(`(()=>{const e=document.querySelector('[data-jso-plan-id="'+${JSON.stringify(p.id)}+'"]');return {text:e?.textContent,connected:!!e?.isConnected,conversationId:window.__jsoConversationContext?.conversationId};})()`);
  if(!snapshot.connected||snapshot.text!==p.presentation||snapshot.conversationId!==p.conversationId)return {ok:false,code:'PRESENTATION_MISMATCH'};
  service.markPresented(p.id,p.conversationId,p.proposal.commandDigest);return {ok:true};
 });
 let recovering=false;const recover=async()=>{if(recovering)return;recovering=true;try{await service.recover();const state=await service.read(binding.resourceId);if(state.ok)await service.refreshChart(state);}catch{}finally{recovering=false;}};
 const timer=setInterval(recover,30000);timer.unref?.();void recover();
 wc.once('destroyed',()=>{ownerSession.logout();for(const channel of ['jso-owner:status','jso-owner:login','jso-owner:logout'])ipcMain.removeHandler(channel);clearInterval(timer);native.dispose();ipcMain.removeHandler('jso-conversation:submit');ipcMain.removeHandler('jso-conversation:execute');ipcMain.removeHandler('jso-conversation:invalidate');ipcMain.removeHandler('jso-conversation:proposal');ipcMain.removeHandler('jso-conversation:presented');});
 return {service,native,dispose(){clearInterval(timer);native.dispose();}};
}
function bindingFromEnvironment(){const file=process.env.VCPCHAT_JSO_LOCAL_BINDING_FILE;if(!file)return null;if(process.env.VCPCHAT_JSO_LOCAL_CANDIDATE!=='1')throw Error('JSO_LOCAL_OPT_IN_REQUIRED');return JSON.parse(fs.readFileSync(file,'utf8'));}
module.exports={initialize,bindingFromEnvironment};
