'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { NativeSyncAdapter } = require('./adapter');
const { fail } = require('./protocol');

async function createNativeSyncRuntime({ queue, appDataRoot, args = [], isolated = false, notify, intervalMs = 250, readSettings, readAgentConfig, readGroupConfig, readTavernRules, thumbnail, request, requestBinary, storeAttachment }) {
    const poc = args.includes('--native-sync-poc');
    if (poc && !isolated) throw fail('ISOLATED_APP_DATA_REQUIRED');
    if (!poc && !appDataRoot) return null;
    const connection = poc ? null : await require('./connection').readConnection({ appDataRoot, readSettings });
    if (!poc && !connection) return null;
    const statePath = path.join(appDataRoot, '.native-sync', 'state.json');
    let existingState = false, prepared = !connection;
    if (connection) {
        try {
            const stat = await fs.lstat(statePath);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw fail('SYNC_STATE_ALIAS');
            existingState = true;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const send = request || (async (route, { body } = {}) => {
        let response;
        try {
            response = await fetch(connection.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json', 'X-NativeSync-Protocol':'2','X-NativeSync-Capabilities':'attachments-v1' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(8000) });
        } catch { throw fail('NETWORK_UNAVAILABLE'); }
        if (!response.ok) throw fail('SYNC_SERVER_UNAVAILABLE');
        return response.json();
    });
    const prepare = async () => {
        if (connection) {
            await require('./initialImport').initialImport({ queue, appDataRoot, connection, request: (route, body) => send(route, { body }) });
            if (connection.publishCatalog) {
                const metadata = await require('./catalog').catalog({ appDataRoot, topics: connection.topics, readAgentConfig, thumbnail });
                await send('/api/plugins/NativeSync/mobile/catalog', { body: metadata });
            }
        }
        if (connection?.publishExecutionConfigs) await require('./executionConfigs').publishExecutionConfigs({topics:connection.topics,readAgentConfig,readGroupConfig,readTavernRules,send});
        prepared = true;
    };
    // Existing shared histories attach Queue policy locally before network work.
    // First attachment still requires the approved online comparison.
    if (!existingState) await prepare();
    const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (poc) {
        let endpoint;
        try { endpoint = new URL(option('native-sync-url')); } catch { throw fail('ISOLATED_LOOPBACK_REQUIRED'); }
        if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') throw fail('ISOLATED_LOOPBACK_REQUIRED');
    }
    const adapter = await NativeSyncAdapter.open({ queue, statePath, ...(connection || { url: option('native-sync-url'), deviceId: option('native-sync-device'), topics: JSON.parse(option('native-sync-topics') || '[]'), token: 'isolated-poc-token' }), ...((connection || request) ? { request: send } : {}), notify });
    const download=requestBinary||(async route=>{
        let response;try{response=await fetch(connection.url+route,{headers:{Authorization:`Bearer ${connection.token}`,'X-NativeSync-Protocol':'2','X-NativeSync-Capabilities':'attachments-v1'},redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw fail('NETWORK_UNAVAILABLE');}
        if(!response.ok){let code;try{code=(await response.json()).error?.code;}catch{}throw fail(/^ATTACHMENT_[A-Z_]+$/.test(code||'')?code:'ATTACHMENT_DOWNLOAD_FAILED');}
        const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw fail('ATTACHMENT_FILE_TOO_LARGE');chunks.push(chunk);}return Buffer.concat(chunks);
    });
    const attachments=connection?.syncAttachments?new (require('./attachments').DesktopAttachments)({queue,appDataRoot,connection,send,download,storeAttachment}):null;
    let stopped = false, running = null, lastConfigCheck = Date.now(), lastAttachmentCheck = 0;
    const timer = setInterval(() => {
        if (stopped || running) return;
        running = (async () => { if (!prepared) await prepare(); if(connection?.publishExecutionConfigs && Date.now()-lastConfigCheck>=5000){await require('./executionConfigs').publishExecutionConfigs({topics:connection.topics,readAgentConfig,readGroupConfig,readTavernRules,send});lastConfigCheck=Date.now();} const checkAttachments=attachments&&Date.now()-lastAttachmentCheck>=5000; if(checkAttachments)try{await attachments.uploadLocal();adapter.attachmentError=null;}catch(e){adapter.attachmentError=e.code||'ATTACHMENT_SYNC_FAILED';} await adapter.synchronize(); if(checkAttachments){try{await attachments.restoreRemote();}catch(e){adapter.attachmentError=e.code||'ATTACHMENT_SYNC_FAILED';}lastAttachmentCheck=Date.now();adapter.attachmentSkipped=attachments.skipped;} })().catch(error => {
            adapter.degraded = error.code || 'SYNC_FAILED';
        }).finally(() => { running = null; });
    }, intervalMs);
    timer.unref?.();
    return { adapter, async close() { stopped = true; clearInterval(timer); await running; await adapter.close(); } };
}
module.exports = { createNativeSyncRuntime };
