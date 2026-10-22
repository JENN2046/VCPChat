'use strict';
// Isolated R2 experiment server. Never reads application/provider configuration.
const fs = require('node:fs/promises');
const path = require('node:path');
const { startSyncService } = require('../modules/services/nativeSync/httpService');
const allowed = path.resolve(__dirname, '../../../artifacts/native-sync-r2');
const root = path.resolve(process.argv[2] || path.join(allowed, 'server'));
if (root !== allowed && !root.startsWith(allowed + path.sep)) throw new Error('POC database must stay inside artifacts/native-sync-r2');
fs.mkdir(root, { recursive: true }).then(() => startSyncService({ dbPath: path.join(root, 'central.sqlite'), token: 'isolated-poc-token' })).then(service => {
    console.log(JSON.stringify({ url: service.url, scope: 'isolated loopback POC' }));
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await service.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
