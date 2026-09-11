 'use strict';
(() => {
    const api=window.trustedApproval,allow=document.getElementById('allow'),deny=document.getElementById('deny');let current=null;
    const disable=()=>{allow.disabled=true;deny.disabled=true;};
    api.onPresentAuthority(data=>{
        disable();if(data.invalid){current=null;document.getElementById('status').textContent=data.message;return;}
        if(data.statusOnly){document.getElementById('status').textContent=data.message;return;}
        current=data;document.getElementById('status').textContent=data.message;
        document.getElementById('operation').textContent=data.operation;document.getElementById('effect').textContent=data.explanation;document.getElementById('warning').textContent=data.warning;
        const root=document.getElementById('fields');root.replaceChildren();
        for(const field of data.fields||[]) {
            const section=document.createElement('section'),title=document.createElement('h3');title.textContent=field.label;section.append(title);
            if(field.invalid){const p=document.createElement('p');p.textContent='无法完整展示；仅可拒绝。';section.append(p);}
            else for(const [key,label] of [['readable','Readable Representation'],['ascii','Exact ASCII Representation'],['hex','Exact Byte View']]) {
                const h=document.createElement('h4'),pre=document.createElement('pre');h.textContent=label;pre.textContent=field[key];pre.dir='ltr';section.append(h,pre);
            }
            root.append(section);
        }
        allow.disabled=!data.allow;deny.disabled=false;
    });
    async function submit(decision){if(!current)return;const viewGeneration=current.viewGeneration;disable();current=null;document.getElementById('status').textContent='正在提交审批…';try{await api.submitDecision({viewGeneration,decision});}catch{document.getElementById('status').textContent='提交状态未知，请重新建立可信连接并同步。';}}
    allow.addEventListener('click',()=>submit('ALLOW'));deny.addEventListener('click',()=>submit('DENY'));
})();
