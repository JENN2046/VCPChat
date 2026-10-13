// Readonly assistant suggestion -> host-recomputed, fully displayed plan. Never an authorization.
export async function presentJsoProposal({element,content,messageId,api,conversationId}) {
 if(!element?.isConnected||!api?.proposeJsoConversation||!conversationId)return;
 const blocks=[...String(content).matchAll(/```jso-shift-proposal\s*([\s\S]*?)```/g)];
 element.querySelectorAll('[data-jso-plan-id]').forEach(e=>e.remove());
 if(blocks.length!==1){await api.proposeJsoConversation({conversationId,messageId,invalidate:true}).catch(()=>{});return;}
 let input;try{input=JSON.parse(blocks[0][1]);}catch{return;}
 if(Object.keys(input).sort().join(',')!=='minutes,scheduleItemId')return;
 try{
  await api.proposeJsoConversation({conversationId,messageId,invalidate:true});
  const result=await api.proposeJsoConversation({conversationId,messageId,...input});if(!result.ok||!element.isConnected)return;
  const box=element.ownerDocument.createElement('pre');box.dataset.jsoPlanId=result.plan.id;box.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7;max-width:100%;';box.textContent=result.plan.presentation;const container=element.querySelector('.md-content')||element;for(const code of container.querySelectorAll('pre code')){try{const value=JSON.parse(code.textContent);if(value.scheduleItemId===input.scheduleItemId&&value.minutes===input.minutes)code.closest('pre')?.remove();}catch{}}container.append(box);
  await new Promise(resolve=>element.ownerDocument.defaultView.requestAnimationFrame(resolve));
  await api.presentJsoConversation({planId:result.plan.id});
 }catch{/* Optional isolated integration not configured. */}
}
