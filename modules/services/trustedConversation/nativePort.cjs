'use strict';
const {randomUUID}=require('node:crypto');
// Opt-in composition primitive only. No login/UI/model interception is installed.
// A real host transport must bind these opaque events to its authenticated session.
function installNativeConversationPort({window,snapshot,isSessionCurrent,observedSequence=()=>0,clock=Date.now}){
 const wc=window.webContents,events=new WeakMap();let generation=0,pending=Promise.resolve(null),captured=null;
 const clear=()=>{generation++;captured=null;};
 function arm(kind,input){const n=++generation,at=clock(),sequence=observedSequence();
  pending=(async()=>{if(window.isDestroyed()||!window.isFocused()||!await isSessionCurrent())return null;
   const value=await snapshot(kind,input);if(n!==generation||!value?.eligible||typeof value.text!=='string'||!value.text.trim()||!value.conversationId)return null;
   return Object.freeze({text:value.text,conversationId:value.conversationId,messageId:'native-'+randomUUID(),observedSequence:sequence,at});
  })().then(value=>{if(n===generation)captured=value;}).catch(clear);
 }
 const key=(_e,i)=>{if(i.type==='keyDown'&&['Enter',' ','Space'].includes(i.key)&&!i.shift&&!i.isComposing&&!i.isAutoRepeat)arm('keyboard',i);};
 const mouse=(_e,i)=>{if(i.type==='mouseDown'&&i.button==='left')arm('mouse',i);};
 wc.on('before-input-event',key);wc.on('before-mouse-event',mouse);wc.on('blur',clear);wc.on('did-start-navigation',clear);wc.once('destroyed',clear);
 return {
  async consume({text,conversationId}){await pending;const value=captured;captured=null;
   if(!value||clock()-value.at>3000||value.text!==text||value.conversationId!==conversationId||!window.isFocused()||!await isSessionCurrent())throw Error('NATIVE_CONVERSATION_EVENT_REQUIRED');
   const context=Object.freeze({});events.set(context,value);return context;
  },
  read:context=>events.get(context)||null,
  dispose(){clear();wc.removeListener('before-input-event',key);wc.removeListener('before-mouse-event',mouse);wc.removeListener('blur',clear);wc.removeListener('did-start-navigation',clear);}
 };
}
module.exports={installNativeConversationPort};
