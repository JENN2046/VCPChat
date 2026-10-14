const proposalMessages = new Map();
const owners = new WeakMap();
// Inspect only root Markdown tokens; code examples, blockquotes and lists are not proposals.
function topLevelProposalBlocks(content,parser){
 if(typeof parser?.lexer!=='function')return [];
 let tokens;try{tokens=parser.lexer(String(content));}catch{return [];}
 const candidates=tokens.filter(token=>token.type==='code'&&token.lang==='vcp-tool-proposal');
 if(candidates.length!==1)return [];
 const token=candidates[0],lines=token.raw.replace(/\n+$/u,'').split('\n');
 const opening=/^ {0,3}(`{3,}|~{3,})[ \t]*vcp-tool-proposal[ \t]*$/u.exec(lines[0]);
 if(!opening||lines.length<3)return [];
 const closing=/^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(lines.at(-1));
 if(!closing||closing[1][0]!==opening[1][0]||closing[1].length<opening[1].length)return [];
 return [[token.raw,token.text]];
}
// Retiring a DOM view never recreates authorization from its historical text.
export async function retireNativeProposal(element){
 const owner=owners.get(element);if(!owner)return;
 owners.delete(element);
 if(proposalMessages.get(owner.key)!==owner.generation)return;
 proposalMessages.delete(owner.key);
 await owner.api.invalidateNativeConversation({conversationId:owner.conversationId,messageId:owner.messageId}).catch(()=>{});
}
// Ordinary message text, with a host acknowledgement after exact display readback.
export async function presentNativeProposal({element,content,messageId,api,conversationId,historical=false}){
 if(!element?.isConnected||!api?.proposeNativeConversation||!conversationId)return;
 // Native operations are supported only in the primary chat surface.
 if(!element.ownerDocument?.getElementById('chatMessages')?.contains(element))return;
 const blocks=topLevelProposalBlocks(content,element.ownerDocument.defaultView?.marked||(typeof marked!=='undefined'?marked:null));
 const key=JSON.stringify([conversationId,messageId]);
 if(blocks.length!==1&&!proposalMessages.has(key))return;
 const generation={};proposalMessages.set(key,generation);
 owners.set(element,{key,generation,api,conversationId,messageId});
 const current=()=>proposalMessages.get(key)===generation&&element.isConnected;
 await api.invalidateNativeConversation({conversationId,messageId}).catch(()=>{});
 if(!current())return;
 if(blocks.length!==1){proposalMessages.delete(key);return;}
 const container=element.querySelector('.md-content')||element;
 const replace=()=>{for(const code of container.querySelectorAll('pre code'))if(code.textContent.trim()===blocks[0][1].trim())code.closest('pre')?.remove();container.querySelectorAll('[data-native-plan-id]').forEach(e=>e.remove());};
 if(historical){replace();const note=element.ownerDocument.createElement('pre');note.textContent='历史方案已失效。需要调整时，请重新提出要求。';container.append(note);return;}
 let input;try{input=JSON.parse(blocks[0][1]);}catch{return;}
 if(Object.keys(input).sort().join(',')!=='payload,tool')return;
 let text;
 try{const r=await api.proposeNativeConversation({...input,messageId,conversationId});if(!r.ok||!current())return;
 text=element.ownerDocument.createElement('pre');text.textContent=r.plan.presentation;text.dataset.nativePlanId=r.plan.id;
 replace();container.append(text);
 await new Promise(resolve=>element.ownerDocument.defaultView.requestAnimationFrame(resolve));
 if(!current()){text.remove();return;}
 const ack=await api.presentNativeConversation({planId:r.plan.id});
 if(!current()){text.remove();return;}
 if(!ack?.ok)throw Error('PRESENTATION_NOT_ACKNOWLEDGED');
 }catch{
  if(text){delete text.dataset.nativePlanId;if(current())text.textContent='方案展示未确认，当前不能执行。请重新提出要求以获取新方案。';else text.remove();}
  if(current())await api.invalidateNativeConversation({conversationId,messageId}).catch(()=>{});
 }
}
