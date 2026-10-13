// Status and explicit login/logout only. This is never a per-operation approval prompt.
export function initializeJsoOwnerControls(api){
 if(!api?.getJsoOwnerStatus)return;
 if(document.getElementById('jso-owner-controls'))return;
 const root=document.createElement('aside');root.id='jso-owner-controls';root.style.cssText='padding:8px;background:#26313a;color:white;position:fixed;top:38px;right:20px;z-index:9000;font:13px system-ui';
 const text=document.createElement('span'),login=document.createElement('button'),logout=document.createElement('button');login.textContent='JSO 登录';logout.textContent='退出 JSO';root.append(text,login,logout);document.body.append(root);
 async function refresh(){try{const s=await api.getJsoOwnerStatus();text.textContent=s.authenticated?`JSO 已连接：${s.subjectId} · ${s.resourceId} `:'JSO 未接通：请先登录 ';login.disabled=!s.configured||s.authenticated;logout.disabled=!s.authenticated;}catch{text.textContent='JSO 未接通（未配置隔离端点） ';login.disabled=true;logout.disabled=true;}}
 login.onclick=async()=>{login.disabled=true;try{await api.loginJsoOwner();}finally{await refresh();}};logout.onclick=async()=>{await api.logoutJsoOwner();await refresh();};void refresh();const timer=setInterval(refresh,10000);window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
}
