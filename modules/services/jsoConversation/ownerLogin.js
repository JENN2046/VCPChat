'use strict';
const {BrowserWindow,ipcMain}=require('electron');const {randomUUID}=require('node:crypto');const path=require('node:path');
function openOwnerLogin({parent,session}){
 const channel='jso-owner-login-'+randomUUID();
 const window=new BrowserWindow({parent,modal:true,width:540,height:360,title:'JSO 管理员登录',resizable:false,webPreferences:{preload:path.join(__dirname,'ownerLoginPreload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,additionalArguments:['--jso-owner-channel='+channel]}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 ipcMain.handle(channel,async(event,payload)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return {ok:false,code:'TRUSTED_LOGIN_WINDOW_REQUIRED'};
  if(payload?.action==='context')return session.status();
  if(payload?.action!=='login')return {ok:false,code:'INVALID_LOGIN_REQUEST'};
  return session.login(payload.credential);
 });
 return new Promise(resolve=>{
  window.once('closed',()=>{if(!session.status().authenticated)session.logout();ipcMain.removeHandler(channel);resolve(session.status());});
  window.loadFile(path.join(__dirname,'ownerLogin.html')).catch(()=>window.destroy());
 });
}
module.exports={openOwnerLogin};
