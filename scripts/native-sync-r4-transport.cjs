'use strict';
// Test transport/lifecycle only. Both HTTP endpoints stay on 127.0.0.1;
// OpenSSH uses the existing trusted wp08 alias without reading its credentials.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const sshArgs = [...(process.argv.includes('--p1-toolbox')?['-vv','-T','-o','StrictHostKeyChecking=yes','-o','SendEnv=-*']:[]),'-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2'];
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sourceFiles = ['scripts/native-sync-r4-host.cjs', 'modules/services/nativeSync/httpService.js', 'modules/services/nativeSync/centralStore.js', 'modules/services/nativeSync/protocol.js', 'VCPDistributedServer/Plugin/VCPMobileSync/sync/canonical.js', 'VCPDistributedServer/Plugin/VCPMobileSync/core/hash.js'];
function bootstrap(profile) { return `import sys,json,pathlib,base64,hashlib,os
os.umask(0o077)
data=json.load(sys.stdin)
base=pathlib.Path('/home/admin/VCPKF/vcp/artifacts/${profile.kind}')
root=pathlib.Path(data['root'])
assert root.parent==base and root.name.startswith('run-') and root.name[4:].isdigit()
base.mkdir(mode=0o700,exist_ok=True)
assert base.resolve()==base
root.mkdir(mode=0o700,exist_ok=False)
approved=set(${JSON.stringify(profile.files)})
assert set(f['name'] for f in data['files'])==approved
manifest={'sourceCommit':data['sourceCommit'],'files':[]}
for item in data['files']:
 target=root/'source'/item['name']
 assert target.resolve().is_relative_to(root/'source')
 raw=base64.b64decode(item['base64'])
 assert hashlib.sha256(raw).hexdigest()==item['sha256']
 target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 target.write_bytes(raw)
 manifest['files'].append({'name':item['name'],'sha256':item['sha256'],'bytes':len(raw)})
(root/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'root':str(root),'sourceCommit':data['sourceCommit'],'files':manifest['files'],'exclusiveDirectory':True}))
`; }
async function limited(command, args, input) {
    const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr = (stderr + value).slice(-2000); });
    child.stdin.end(input);
    const timeout = setTimeout(() => child.kill(), 30000);
    try { const [code] = await once(child, 'exit'); if (code !== 0) throw new Error(`R4 SSH bootstrap exit ${code}: ${stderr}`); return JSON.parse(stdout); }
    finally { clearTimeout(timeout); }
}
class RealHostTransport {
    static async prepare({ sourceRoot, localRoot, profile = { kind: 'native-sync-r4', files: sourceFiles, entry: 'scripts/native-sync-r4-host.cjs' } }) {
        assert.ok(['native-sync-r4', 'native-sync-r5'].includes(profile.kind));
        const remote = new RealHostTransport(localRoot, profile);
        const files = await Promise.all(profile.files.map(async name => { const bytes = await fs.readFile(path.join(sourceRoot, name)); return { name, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') }; }));
        const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8', windowsHide: true }).trim();
        remote.evidence.bootstrap = await limited('ssh', [...sshArgs, 'wp08', 'python3 -c ' + quote(bootstrap(profile))], JSON.stringify({ root: remote.remoteRoot, files, sourceCommit }));
        await fs.writeFile(path.join(localRoot, 'remote-source-manifest.json'), JSON.stringify(remote.evidence.bootstrap, null, 2));
        const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
        remote.localPort = listener.address().port; await new Promise(resolve => listener.close(resolve));
        remote.url = `http://127.0.0.1:${remote.localPort}`;
        return remote;
    }
    constructor(localRoot, profile = { kind: 'native-sync-r4', entry: 'scripts/native-sync-r4-host.cjs' }) {
        assert.match(path.basename(localRoot), /^run-\d+$/);
        this.profile = profile;
        this.remoteRoot = '/home/admin/VCPKF/vcp/artifacts/' + profile.kind + '/' + path.basename(localRoot);
        this.localRoot = localRoot; this.server = null; this.tunnel = null;
        this.evidence = { hostAlias: 'wp08', remoteRoot: this.remoteRoot, servers: [], tunnels: [], snapshots: [] };
    }
    async awaitCondition(fn, label, ms = 20000) {
        const end = Date.now() + ms;
        while (Date.now() < end) { const result = await fn(); if (result) return result; await pause(80); }
        throw new Error(`${label} timed out`);
    }
    async startServer() {
        const prefix = this.profile.kind === 'native-sync-r5' ? 'env -i PATH=/usr/bin:/bin HOME=' + quote(this.remoteRoot) + ' NODE_PATH=/home/admin/VCPKF/vcp/artifacts/native-sync-r5/deps/node_modules ' : '';
        const command = prefix + '/usr/bin/node --no-warnings ' + quote(this.remoteRoot + '/source/' + this.profile.entry) + ' ' + quote(this.remoteRoot);
        const child = spawn('ssh', [...sshArgs, 'wp08', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const record = { localSshPid: child.pid, command, exitCode: null, events: [] };
        this.evidence.servers.push(record); this.server = { child, record };
        let buffer = '';
        child.stdout.on('data', value => {
            buffer += value;
            while (buffer.includes('\n')) { const i = buffer.indexOf('\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 1); if (!line.trim()) continue; try { record.events.push(JSON.parse(line)); } catch { record.invalidOutput = true; } }
        });
        // No raw SSH/runtime logs are persisted. Only bounded exit status and
        // this test entry's explicit low-disclosure JSON receipts are consumed.
        child.stderr.resume(); child.on('error', error => { record.spawnError = error.code; });
        child.on('exit', code => { record.exitCode = code; });
        const ready = await this.awaitCondition(() => {
            const failure = record.events.find(event => event.event === 'failure');
            if (failure) throw new Error(`R4 remote: ${failure.code}: ${failure.message}`);
            if (child.exitCode !== null) throw new Error(`R4 remote startup exited ${child.exitCode}`);
            return record.events.find(event => event.event === 'ready');
        }, 'Ubuntu service startup');
        assert.equal(ready.platform, 'linux');
        assert.equal(ready.dbPath, this.remoteRoot + (this.profile.kind === 'native-sync-r5' ? '/data/native-sync/central.sqlite' : '/data/central.sqlite'));
        this.remotePort = Number(new URL(ready.url).port);
    }
    async connect() {
        const args = [...sshArgs, '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `127.0.0.1:${this.localPort}:127.0.0.1:${this.remotePort}`, 'wp08'];
        const child = spawn('ssh', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const record = { pid: child.pid, args, exitCode: null, intentionalDisconnect: false };
        this.tunnel = { child, record }; this.evidence.tunnels.push(record);
        child.stderr.resume(); child.on('exit', (code, signal) => { record.exitCode = code; record.signal = signal; record.exited = true; });
        await this.awaitCondition(async () => {
            if (child.exitCode !== null || child.signalCode !== null) throw new Error(`R4 SSH tunnel exited ${child.exitCode ?? child.signalCode}`);
            try { const response = await fetch(this.url + '/api/v1/sync/status', { headers: { Authorization: 'Bearer isolated-poc-token' }, signal: AbortSignal.timeout(500) }); return response.status === (this.healthStatus || 200); } catch { return false; }
        }, 'SSH loopback forward');
    }
    async start() { await this.startServer(); await this.connect(); return this; }
    async disconnect() {
        if (!this.tunnel) return;
        const { child, record } = this.tunnel; record.intentionalDisconnect = true;
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await this.awaitCondition(() => record.exited, 'SSH tunnel stop');
        this.tunnel = null;
    }
    async snapshot(label) {
        const requestId = `${Date.now()}-${this.evidence.snapshots.length}`;
        this.server.child.stdin.write(`snapshot:${requestId}\n`);
        const result = await this.awaitCondition(() => this.server.record.events.find(event => event.requestId === requestId), 'Ubuntu snapshot');
        this.evidence.snapshots.push({ label, ...result }); return result;
    }
    async stopServer() {
        if (!this.server) return;
        const { child, record } = this.server;
        if (child.exitCode === null) { child.stdin.write('stop\n'); await this.awaitCondition(() => child.exitCode !== null, 'Ubuntu service shutdown'); }
        assert.equal(record.exitCode, 0, 'Ubuntu service must exit cleanly');
        assert.ok(record.events.some(event => event.event === 'stopped'));
        this.server = null;
    }
    async restartServerAndReconnect() { await this.disconnect(); await this.stopServer(); await this.startServer(); await this.connect(); }
    async close() { try { await this.disconnect(); } finally { await this.stopServer(); } }
}
module.exports = { RealHostTransport };
