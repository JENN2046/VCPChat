 'use strict';
const {loadProvider}=require('./trustedClientKeyProvider');
const {TrustedClientSession}=require('./trustedClientSession');
const {TrustedDecisionBoundary}=require('./trustedDecisionBoundary');
const {TrustedClientNativeService}=require('./trustedClientNativeService');
// Source candidate is deliberately not a platform admission adapter. No environment,
// renderer property, app version or cached settings may upgrade this result.
function platformEvidence(){return Object.freeze({productionEligible:false,HumanInputProvenance:'UNPROVEN',profile:'PRODUCTION_DISABLED'});}
function install({app,BrowserWindow,ipcMain,powerMonitor,dialog,shell,projectRoot,readSettings}) {
    let service=null,session=null,boundary=null,enrollment=null;
    async function obtain(){
        if(!platformEvidence().productionEligible)throw Error('PRODUCTION_DISABLED');
        if(service)return service;
        const settings=await readSettings();
        // Only non-secret configured origins are reused; no Admin password or VCP_Key.
        const hostOrigin=new URL(settings.vcpServerUrl).origin,adminOrigin=new URL(settings.trustedClientAdminOrigin).origin;
        const provider=loadProvider();if(provider.getSecurityProperties().productionEligible!==true)throw Error('PROVIDER_UNPROVEN');
        session=new TrustedClientSession({provider,hostOrigin,adminOrigin,WebSocketImpl:require('ws')});
        boundary=new TrustedDecisionBoundary({BrowserWindow,projectRoot,invalidate:()=>service?.invalidate()});
        service=new TrustedClientNativeService({session,boundary,powerMonitor}); // No attestor means fail closed.
        return service;
    }
    const run=fn=>async()=>{try{await fn();}catch(e){await dialog.showMessageBox({type:'info',title:'Trusted Human Approval',message:'Trusted Client 尚未获准参与生产审批。',detail:e.message==='PRODUCTION_DISABLED'?'PRODUCTION_DISABLED；需独立平台证据与 Host admission。':'可信客户端操作未完成；不自动重试。'});}};
    ipcMain.handle('trusted-approval:decision',(event,data)=>service?service.submit(event,data):{accepted:false});
    const menu={label:'Trusted Approval',submenu:[
        {label:'显示可信审批',click:run(async()=>{await obtain();await service.presentNext();})},
        {label:'重新连接并同步',click:run(async()=>{await obtain();await session.reconnect();})},
        {label:'首次注册可信客户端',click:run(async()=>{await obtain();enrollment=await session.beginEnrollment();await shell.openExternal(enrollment.browserEnrollmentUrl);})},
        {label:'完成浏览器注册后的密钥证明',click:run(async()=>{await obtain();if(!enrollment)throw Error('ENROLLMENT_UNKNOWN');await enrollment.complete();enrollment=null;})}
    ]};
    app.once('will-quit',()=>{service?.dispose();ipcMain.removeHandler('trusted-approval:decision');});
    return Object.freeze({menu});
}
module.exports={install,platformEvidence};
