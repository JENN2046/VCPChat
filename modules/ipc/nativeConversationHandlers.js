'use strict';
const fs=require('node:fs'),{ipcMain}=require('electron');
const {installNativeConversationPort}=require('../services/trustedConversation/nativePort.cjs');
const {createNativeTransport}=require('../services/trustedConversation/transport.cjs');
function bindingFromEnvironment(){const file=process.env.VCPCHAT_NATIVE_TOOL_BINDING_FILE;if(!file)return null;const binding=JSON.parse(fs.readFileSync(file,'utf8'));if(!binding||typeof binding!=='object'||Array.isArray(binding))throw Error('NATIVE_CONFIGURATION_INVALID');return binding;}
const initializedWindows=new WeakSet();
async function initialize({mainWindow,chartService,binding}){
 if(initializedWindows.has(mainWindow)||mainWindow.isDestroyed?.())return;
 const channels=['native-conversation:prepare','native-conversation:execute','native-conversation:propose','native-conversation:presented','native-conversation:invalidate'];
 const unavailable=(code,handled)=>{for(const c of channels)ipcMain.handle(c,()=>({handled,ok:false,code,...(handled?{preserveInput:true,message:'原生排期配置不可用，请检查配置后重启。待发送文本已保留。'}:{})}));initializedWindows.add(mainWindow);mainWindow.webContents.once('destroyed',()=>{initializedWindows.delete(mainWindow);for(const c of channels)ipcMain.removeHandler(c);});};
 let transport;
 try{
  if(binding===undefined)binding=bindingFromEnvironment();
  if(!binding){unavailable('NOT_CONFIGURED',false);return;}
  const controller=require('../../VCPDistributedServer/Plugin/ChartController/ChartControllerService');controller.initialize({chartService});
  transport=createNativeTransport({binding,chartService,controller});
 }catch{unavailable('NATIVE_CONFIGURATION_UNAVAILABLE',true);return;}
 const wc=mainWindow.webContents,pending=new Map(),plans=new Map(),proposalRequests=new Map();const owned=e=>e.sender===wc&&e.senderFrame===wc.mainFrame&&!mainWindow.isDestroyed();
 const retireRequests=p=>{for(const [key,request] of proposalRequests)if(request.conversationId===p.conversationId&&(!p.messageId||request.messageId===p.messageId))proposalRequests.delete(key);};
 const port=installNativeConversationPort({window:mainWindow,observedSequence:transport.sequence,isSessionCurrent:async()=>!mainWindow.isDestroyed(),snapshot:async(kind,input)=>wc.executeJavaScript(`(()=>{const input=document.getElementById('messageInput'),button=document.getElementById('sendMessageBtn'),c=window.__nativeConversationContext,hit=${kind==='mouse'?`document.elementFromPoint(${Number(input.x)||0},${Number(input.y)||0})`:'null'};return {text:input?.value??'',conversationId:c?.conversationId,eligible:!!c&&(${kind==='keyboard'?`!!button&&!button.disabled&&button.dataset.mode!=='interrupt'&&(document.activeElement===button||(${JSON.stringify(input.key)}==='Enter'&&document.activeElement===input))`:"!!button&&!button.disabled&&(hit===button||button.contains(hit))&&button.dataset.mode!=='interrupt'"})};})()`)});
 ipcMain.handle(channels[0],async(e,p={})=>{if(!owned(e))return {handled:true,ok:false,code:'TRUSTED_CLIENT_REQUIRED'};let context;try{context=await port.consume(p);}catch{
   // Denial-only recognition: never mint a trusted source from renderer/voice text.
   const text=typeof p.text==='string'?p.text.trim():'',hasPlan=[...plans.values()].some(plan=>plan.conversationId===p.conversationId);
   const nativeIntent=/^把.+(?:延后|推迟|提前)[1-9][0-9]{0,3}分钟[。！!]?$/u.test(text)||/^再(?:延后|推迟|提前)/u.test(text)||(hasPlan&&/^(可以|同意|执行吧|取消|不要|不用了|不同意|改成|改为)/u.test(text));
   return {handled:nativeIntent,ok:false,code:'NATIVE_SOURCE_REQUIRED',...(nativeIntent?{preserveInput:true,message:'此排期指令需要手动发送，请物理点击发送按钮或按 Enter。待发送文本已保留。'}:{})};
  }
  // A removed/failed display cannot remain confirmable even if renderer cleanup lost its IPC.
  for(const [id,plan] of plans){
   const visible=await wc.executeJavaScript(`(()=>{const e=[...(document.getElementById('chatMessages')?.querySelectorAll('[data-native-plan-id]')||[])].find(e=>e.dataset.nativePlanId===${JSON.stringify(id)});return !!e?.isConnected&&e.textContent===${JSON.stringify(plan.presentation)}&&window.__nativeConversationContext?.conversationId===${JSON.stringify(plan.conversationId)};})()`);
   if(plans.get(id)!==plan)continue;
   if(!visible){try{const invalidated=await transport.request('invalidate',{conversationId:plan.conversationId,messageId:plan.messageId});if(!invalidated?.ok)return {handled:true,ok:false,code:'PRESENTATION_INVALIDATION_REQUIRED'};plans.delete(id);}catch{return {handled:true,ok:false,code:'PRESENTATION_INVALIDATION_REQUIRED'};}}
  }
  const event=port.read(context);let r;try{r=await transport.request('prepare',event);}catch{return {handled:true,ok:false,code:'NATIVE_TRANSPORT_UNAVAILABLE'};}if(r.sourceId)pending.set(r.sourceId,event);return r.ok===false&&!(r.code==='READ_ONLY_POLICY'&&r.handled===false)?{...r,handled:true}:r;});
 ipcMain.handle(channels[1],async(e,p={})=>{const event=pending.get(p.sourceId);if(!owned(e)||!event)return {ok:false,code:'SOURCE_UNKNOWN'};pending.delete(p.sourceId);return transport.project(await transport.request('execute',{sourceId:p.sourceId,conversationId:event.conversationId}));});
 ipcMain.handle(channels[2],async(e,p={})=>{
  if(!owned(e)||p.tool!==binding.toolName)return {ok:false};
  // Register before DOM or transport awaits: request order, never response order, owns this message.
  const key=JSON.stringify([p.conversationId,p.messageId]),request={conversationId:p.conversationId,messageId:p.messageId};proposalRequests.set(key,request);
  const current=()=>owned(e)&&proposalRequests.get(key)===request;
  const c=await wc.executeJavaScript('window.__nativeConversationContext?.conversationId');if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};if(!c||c!==p.conversationId)return {ok:false};
  const mainMessage=await wc.executeJavaScript(`(()=>{const root=document.getElementById('chatMessages');return !!root&&[...root.querySelectorAll('.message-item')].some(e=>e.isConnected&&e.dataset.messageId===${JSON.stringify(p.messageId)});})()`);
  if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};if(mainMessage!==true)return {ok:false,code:'MAIN_CHAT_REQUIRED'};
  const r=await transport.request('propose',{...p.payload,messageId:p.messageId,conversationId:c});
  if(!current())return {ok:false,code:'PROPOSAL_SUPERSEDED'};
  if(r.plan){for(const [id,old] of plans)if(old.conversationId===r.plan.conversationId&&old.messageId===r.plan.messageId)plans.delete(id);plans.set(r.plan.id,r.plan);}return r;
 });
 ipcMain.handle(channels[3],async(e,p={})=>{const plan=plans.get(p.planId);if(!owned(e)||!plan)return {ok:false};const snapshot=await wc.executeJavaScript(`(()=>{const e=[...(document.getElementById('chatMessages')?.querySelectorAll('[data-native-plan-id]')||[])].find(e=>e.dataset.nativePlanId===${JSON.stringify(p.planId)});return {text:e?.textContent,connected:!!e?.isConnected,conversationId:window.__nativeConversationContext?.conversationId};})()`);if(!snapshot.connected||snapshot.text!==plan.presentation||snapshot.conversationId!==plan.conversationId)return {ok:false,code:'PRESENTATION_MISMATCH'};return transport.request('presented',{planId:plan.id,text:snapshot.text,conversationId:plan.conversationId});});
 ipcMain.handle(channels[4],async(e,p={})=>{if(!owned(e))return {ok:false};retireRequests(p);const retiring=[...plans].filter(([,plan])=>plan.conversationId===p.conversationId&&(!p.messageId||plan.messageId===p.messageId)).map(([id])=>id);const result=await transport.request('invalidate',p);if(result?.ok)for(const id of retiring)plans.delete(id);return result;});
 const timer=setInterval(async()=>{try{const r=await transport.request('recover');for(const result of r.results||[])await transport.project(result);}catch{}finally{await transport.retryProjections();}},30000);timer.unref?.();
 initializedWindows.add(mainWindow);
 // Status only refreshes a monotonic sequence; it must not delay window loading.
 void transport.request('status').catch(()=>{});
 wc.once('destroyed',()=>{initializedWindows.delete(mainWindow);clearInterval(timer);port.dispose();pending.clear();plans.clear();proposalRequests.clear();for(const c of channels)ipcMain.removeHandler(c);});
}
module.exports={initialize,bindingFromEnvironment};
