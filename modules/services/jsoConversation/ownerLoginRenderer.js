'use strict';
const input=document.getElementById('credential'),button=document.getElementById('submit'),status=document.getElementById('status');
window.jsoOwnerLogin.context().then(s=>{document.getElementById('binding').textContent=`预期身份：${s.expectedSubjectId}；资源：${s.resourceId}`;});
document.getElementById('close').onclick=()=>window.close();
document.querySelector('form').onsubmit=async event=>{event.preventDefault();let credential=input.value;input.value='';button.disabled=true;try{const pending=window.jsoOwnerLogin.login(credential);credential='';const result=await pending;if(result.ok)window.close();else status.textContent='登录未通过：请核对已有 JSO 身份和资源范围。';}catch{status.textContent='登录服务暂不可用。';}finally{button.disabled=false;credential='';}};
window.addEventListener('beforeunload',()=>{input.value='';});
