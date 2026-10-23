'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { NativeSyncAdapter } = require('./adapter');
const { fail } = require('./protocol');
async function createNativeSyncRuntime({ queue, appDataRoot, args = [], isolated = false, notify, intervalMs = 250, readSettings, readAgentConfig, thumbnail, readSyncCredential }) {
    const poc=args.includes('--native-sync-poc');
    if (poc && !isolated) throw fail('ISOLATED_APP_DATA_REQUIRED');
    if (!poc && !appDataRoot) return null;
    const daily=poc?null:await require('./dailyConnection').dailyConnection({appDataRoot,readSettings,readSyncCredential:readSyncCredential||((options)=>require('./desktopCredential').desktopCredential({...options,safeStorage:require('electron').safeStorage}))});
    if(!poc&&!daily)return null;
    let transport;
    try{
    let existingState=false,prepared=!daily;
    if(daily){
        try{const stat=await fs.lstat(path.join(appDataRoot,'.native-sync','state.json'));if(stat.isSymbolicLink()||stat.nlink>1)throw fail('SYNC_STATE_ALIAS');existingState=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    if(daily?.ssh)transport=await require('./sshTransport').openSshTransport({...daily,background:existingState});
    const prepare=async()=>{if(daily){
        await daily.registerCredential?.();
        const request=async(route,body)=>{
            if(transport)return transport.request(route,{body});
            let response;try{response=await fetch(daily.url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${daily.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw fail('INITIAL_IMPORT_NETWORK_UNAVAILABLE');}
            if(!response.ok)throw fail('INITIAL_IMPORT_SERVER_UNAVAILABLE');return response.json();
        };
        await require('./initialImport').initialImport({queue,appDataRoot,connection:daily,request});
        const metadata=await require('./catalog').catalog({appDataRoot,topics:daily.topics,readAgentConfig,thumbnail});
        await request('/api/plugins/NativeSync/mobile/catalog',metadata);
    }prepared=true;};
    // A first import still requires its original online comparison. An already
    // attached client loads Queue policy/Outbox locally; network preparation is
    // retried outside startup and never turns shared topics into unowned writers.
    if(!existingState)await prepare();
    const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const adapter = await NativeSyncAdapter.open({ queue, statePath: path.join(appDataRoot, '.native-sync', 'state.json'), ...(daily||{url: option('native-sync-url'), deviceId: option('native-sync-device'), topics: JSON.parse(option('native-sync-topics') || '[]'), token: 'isolated-poc-token'}), ...(transport?{request:transport.request}:{}), notify });
    let stopped = false, running = null;
    const timer = setInterval(() => {
        if (stopped || running) return;
        running = (async()=>{if(!prepared)await prepare();await adapter.synchronize();})().catch(error => {
            adapter.degraded = error.code || 'SYNC_FAILED';
            if(error.code==='DESKTOP_SESSION_REQUIRED')prepared=false;
        }).finally(() => { running = null; });
    }, intervalMs);
    timer.unref?.();
    return { adapter, async close() { stopped = true; clearInterval(timer); await running; await adapter.close(); await transport?.close(); } };
    }catch(e){await transport?.close();throw e;}
}
module.exports = { createNativeSyncRuntime };
