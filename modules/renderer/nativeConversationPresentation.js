const proposalMessages = new Map();
// Ordinary message text, with a host acknowledgement after exact display readback.
export async function presentNativeProposal({element,content,messageId,api,conversationId}){
 if(!element?.isConnected||!api?.proposeNativeConversation||!conversationId)return;
 const blocks=[...String(content).matchAll(/```vcp-tool-proposal\s*([\s\S]*?)```/g)];
 const key=JSON.stringify([conversationId,messageId]);
 if(blocks.length!==1&&!proposalMessages.has(key))return;
 // Register before the first await, including edits that remove a pending proposal.
 const generation={};proposalMessages.set(key,generation);
 const current=()=>proposalMessages.get(key)===generation&&element.isConnected;
 await api.invalidateNativeConversation({conversationId,messageId}).catch(()=>{});
 if(!current())return;
 if(blocks.length!==1){proposalMessages.delete(key);return;}
 let input;try{input=JSON.parse(blocks[0][1]);}catch{return;}
 if(Object.keys(input).sort().join(',')!=='payload,tool')return;
 try{const r=await api.proposeNativeConversation({...input,messageId,conversationId});if(!r.ok||!current())return;
 const container=element.querySelector('.md-content')||element;const text=element.ownerDocument.createElement('pre');text.textContent=r.plan.presentation;text.dataset.nativePlanId=r.plan.id;
 for(const code of container.querySelectorAll('pre code'))if(code.textContent.trim()===blocks[0][1].trim())code.closest('pre')?.remove();container.querySelectorAll('[data-native-plan-id]').forEach(e=>e.remove());container.append(text);
 await new Promise(resolve=>element.ownerDocument.defaultView.requestAnimationFrame(resolve));
 if(!current()){text.remove();return;}
 await api.presentNativeConversation({planId:r.plan.id});
 }catch{}
}
