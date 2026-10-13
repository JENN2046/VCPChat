'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(a=>a.startsWith('--jso-owner-channel='))?.slice('--jso-owner-channel='.length);
contextBridge.exposeInMainWorld('jsoOwnerLogin',{context:()=>ipcRenderer.invoke(channel,{action:'context'}),login:credential=>ipcRenderer.invoke(channel,{action:'login',credential})});
