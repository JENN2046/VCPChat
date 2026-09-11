 'use strict';
const path=require('node:path');const {pathToFileURL}=require('node:url');
const {PRELOAD_ROLES,resolveProjectPreload}=require('../services/preloadPaths');
class TrustedDecisionBoundary {
    #window;#generation=0;#url;#BrowserWindow;#root;#invalidate;
    constructor({BrowserWindow,projectRoot,invalidate}){this.#BrowserWindow=BrowserWindow;this.#root=projectRoot;this.#invalidate=invalidate;this.#url=pathToFileURL(path.join(projectRoot,'modules/trusted-client/ui/approval.html')).href;}
    get generation(){return this.#generation;}
    get window(){return this.#window;}
    async open(){
        if(this.#window&&!this.#window.isDestroyed())return;
        const generation=++this.#generation;
        const w=new this.#BrowserWindow({width:850,height:760,show:false,title:'Trusted Human Approval',webPreferences:{preload:resolveProjectPreload(this.#root,PRELOAD_ROLES.TRUSTED_APPROVAL),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false,webviewTag:false,partition:'trusted-approval-'+generation}});this.#window=w;
        const active=()=>this.#window===w&&generation===this.#generation;
        const invalidate=()=>{if(active())this.#invalidate();};
        w.on('hide',invalidate);w.on('blur',invalidate);w.on('closed',()=>{if(active()){this.#window=null;this.#generation++;this.#invalidate();}});
        const wc=w.webContents;
        for(const event of ['will-navigate','will-redirect','will-attach-webview','will-frame-navigate'])wc.on(event,e=>{e.preventDefault();invalidate();});
        wc.setWindowOpenHandler(()=>{invalidate();return {action:'deny'};});
        wc.on('render-process-gone',invalidate);wc.on('destroyed',invalidate);
        wc.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false);
        const allow=new Set([this.#url,new URL('approval.js',this.#url).href,new URL('approval.css',this.#url).href]);
        wc.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allow.has(details.url)}));
        await w.loadURL(this.#url);if(!active())return;w.show();
    }
    valid(event,generation){
        const w=this.#window;if(!w||w.isDestroyed()||!w.isVisible()||!w.isFocused()||generation!==this.#generation)return false;
        const wc=w.webContents,frame=event?.senderFrame;
        return event?.sender===wc && frame===wc.mainFrame && frame?.parent===null && frame.url===this.#url && wc.getURL()===this.#url;
    }
    present(data){if(this.#window&&!this.#window.isDestroyed())this.#window.webContents.send('trusted-approval:present',data);}
    invalidate(){this.present({invalid:true,message:'当前展示已失效。请重新同步并等待新的人工操作。'});}
    destroy(){const w=this.#window;this.#window=null;this.#generation++;w?.destroy();}
}
module.exports={TrustedDecisionBoundary};
