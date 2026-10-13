'use strict';
const {randomUUID}=require('node:crypto');
// Trusted-terminal/application boundary, not a defense against a compromised host.
// Native OS input, focused main composer snapshot, bound Owner and one-shot host state
// are all required. Renderer role/source flags and programmatic send calls mint nothing.
function installNativeSource({window,service,verifyOwner,snapshot,clock=()=>Date.now()}){
 const wc=window.webContents;let generation=0;let pending=Promise.resolve(null);let source=null;
 const arm=(kind,input)=>{
  const n=++generation;const at=clock();const observedSequence=service.journal?.data.sequence||0;
  pending=(async()=>{
   if(window.isDestroyed()||!window.isFocused())return null;
   const s=await snapshot(kind,input);
   if(!await verifyOwner())return null;
   if(n!==generation||!s?.eligible||typeof s.text!=='string'||!s.text.trim()||!s.conversationId)return null;
   return {text:s.text,conversationId:s.conversationId,messageId:'human-'+randomUUID(),at,observedSequence};
  })().then(s=>{if(n===generation)source=s;return s;}).catch(()=>null);
 };
 const key=(_event,input)=>{if(input.type==='keyDown'&&input.key==='Enter'&&!input.shift&&!input.control&&!input.alt&&!input.meta&&!input.isAutoRepeat)arm('keyboard',input);};
 const mouse=(_event,input)=>{if(input.type==='mouseDown'&&input.button==='left')arm('mouse',input);};
 wc.on('before-input-event',key);wc.on('before-mouse-event',mouse);
 const clear=()=>{generation++;source=null;};wc.on('blur',clear);wc.on('did-start-navigation',clear);wc.once('destroyed',clear);
 return {async consume({text,conversationId}){await pending;const s=source;source=null;
  if(!s||clock()-s.at>3000||s.text!==text||s.conversationId!==conversationId||!window.isFocused()||!await verifyOwner())return {ok:false,code:'TRUSTED_NATIVE_SOURCE_REQUIRED'};
  return {ok:true,source:service.captureNative(s)};
 },dispose(){clear();wc.removeListener('before-input-event',key);wc.removeListener('before-mouse-event',mouse);wc.removeListener('blur',clear);wc.removeListener('did-start-navigation',clear);}};
}
module.exports={installNativeSource};
