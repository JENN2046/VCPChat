'use strict';
const path = require('node:path');
const { NativeSyncAdapter } = require('./adapter');
const { fail } = require('./protocol');
async function createNativeSyncRuntime({ queue, appDataRoot, args = [], isolated = false, notify, intervalMs = 250 }) {
    if (!args.includes('--native-sync-poc')) return null;
    if (!isolated) throw fail('ISOLATED_APP_DATA_REQUIRED');
    const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const adapter = await NativeSyncAdapter.open({ queue, statePath: path.join(appDataRoot, '.native-sync', 'state.json'), url: option('native-sync-url'), deviceId: option('native-sync-device'), topics: JSON.parse(option('native-sync-topics') || '[]'), token: 'isolated-poc-token', notify });
    let stopped = false, running = null;
    const timer = setInterval(() => {
        if (stopped || running) return;
        running = adapter.synchronize().catch(error => { adapter.degraded = error.code || 'SYNC_FAILED'; }).finally(() => { running = null; });
    }, intervalMs);
    timer.unref?.();
    return { adapter, async close() { stopped = true; clearInterval(timer); await running; await adapter.close(); } };
}
module.exports = { createNativeSyncRuntime };
