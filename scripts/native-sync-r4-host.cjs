'use strict';
// Test-only Ubuntu entry. Reuses the unmodified HTTP/SQLite service, never the
// VCPToolBox runtime. Only this fresh R4 run's source and synthetic DB are read.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { startSyncService } = require('../modules/services/nativeSync/httpService');
const root = path.resolve(process.argv[2] || '');
const allowed = '/home/admin/VCPKF/vcp/artifacts/native-sync-r4';
if (process.platform !== 'linux' || !/^run-\d+$/.test(path.basename(root)) || path.dirname(root) !== allowed || root !== path.resolve(__dirname, '../..')) throw new Error('EXPLICIT_R4_LINUX_ROOT_REQUIRED');
process.umask(0o077);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const emit = value => console.log(JSON.stringify(value));
async function main() {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json'), 'utf8'));
    for (const file of manifest.files) {
        const target = path.resolve(root, 'source', file.name);
        if (!target.startsWith(path.join(root, 'source') + path.sep) || sha(fs.readFileSync(target)) !== file.sha256) throw new Error('SOURCE_INTEGRITY_FAILED');
    }
    const dbPath = path.join(root, 'data/central.sqlite');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    const service = await startSyncService({ dbPath, token: 'isolated-poc-token' });
    const snapshot = () => ({ metrics: service.store.metrics(), entries: service.store.db.prepare('SELECT owner_type AS ownerType, owner_id AS ownerId, topic_id AS topicId, msg_id AS msgId, hash, deleted, last_seq AS seq FROM messages ORDER BY owner_type, owner_id, topic_id, msg_id').all() });
    const started = { event: 'ready', pid: process.pid, hostname: os.hostname(), platform: process.platform, arch: os.arch(), node: process.versions.node, url: service.url, dbPath, sourceCommit: manifest.sourceCommit, sourceHashesVerified: manifest.files.length, startedAt: new Date().toISOString(), ...snapshot() };
    fs.writeFileSync(path.join(root, `host-start-${process.pid}.json`), JSON.stringify(started, null, 2)); emit(started);
    let stopping = false;
    async function stop() {
        if (stopping) return; stopping = true;
        const data = snapshot();
        await service.close();
        const receipt = { event: 'stopped', pid: process.pid, ...data, sqliteSha256AfterClose: sha(fs.readFileSync(dbPath)), stoppedAt: new Date().toISOString() };
        fs.writeFileSync(path.join(root, `host-stop-${process.pid}.json`), JSON.stringify(receipt, null, 2)); emit(receipt);
        process.exit(0);
    }
    const input = readline.createInterface({ input: process.stdin });
    input.on('line', line => {
        if (line === 'stop') void stop().catch(fail);
        else if (line.startsWith('snapshot:')) emit({ event: 'snapshot', requestId: line.slice(9), pid: process.pid, ...snapshot() });
    });
    input.on('close', () => void stop().catch(fail));
    process.on('SIGTERM', () => void stop().catch(fail)); process.on('SIGINT', () => void stop().catch(fail));
}
function fail(error) { emit({ event: 'failure', code: error.code || 'R4_HOST_FAILED', message: String(error.message).split('\n')[0] }); process.exit(1); }
main().catch(fail);
