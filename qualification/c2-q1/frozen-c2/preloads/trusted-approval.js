 'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('trustedApproval',Object.freeze({
    onPresentAuthority(handler){if(typeof handler!=='function')return()=>{};const listener=(_event,data)=>handler(data);ipcRenderer.on('trusted-approval:present',listener);return()=>ipcRenderer.removeListener('trusted-approval:present',listener);},
    submitDecision(input){if(!input||Object.keys(input).sort().join(',')!=='decision,viewGeneration'||typeof input.viewGeneration!=='string'||!['ALLOW','DENY'].includes(input.decision))return Promise.resolve({accepted:false});return ipcRenderer.invoke('trusted-approval:decision',{viewGeneration:input.viewGeneration,decision:input.decision});}
}));
