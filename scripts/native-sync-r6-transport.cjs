'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { RealHostTransport } = require('./native-sync-r4-transport.cjs');
const sourceRoot = path.resolve(__dirname, process.argv.includes('--regress-current-toolbox') ? '../../vcptoolbox-mobile-pwa-r7' : '../../vcptoolbox-native-sync-r6');
const base = '/home/admin/VCPKF/vcp/artifacts/native-sync-r6';
const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2'];
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const extract = `from pathlib import Path
import json,sys,base64,hashlib,os,shutil
os.umask(0o077)
data=json.load(sys.stdin)
kind=data.get('kind','native-sync-r6')
assert kind in ['native-sync-r6','native-sync-r7']
base=Path('/home/admin/VCPKF/vcp/artifacts')/kind
root=Path(data['root'])
assert root.parent==base and (root.name=='build-source' or root.name.startswith('run-') and root.name[4:].isdigit())
base.mkdir(mode=0o700,exist_ok=True)
assert base.resolve()==base
root.mkdir(mode=0o700,exist_ok=False)
source=root/'source';source.mkdir(mode=0o700)
manifest={'sourceCommit':data['sourceCommit'],'files':[],'disabledPluginManifests':[]}
for item in data['files']:
 name=item['name'];p=Path(name)
 assert not p.is_absolute() and '..' not in p.parts and not any(x in p.parts for x in ['node_modules','.git','state-private','config.env','.env','credentials','tokens','cookies'])
 assert p.suffix in ['.js','.cjs','.mjs','.ts','.tsx','.vue','.html','.css','.rs','.toml','.lock','.sql','.h','.c','.cpp','.md','.json','.block','.example','.template','.py','.sh','.bat','.ps1','.svg','.webmanifest','.png'] or p.name in ['LICENSE','Dockerfile','.gitignore']
 raw=base64.b64decode(item['base64'])
 assert hashlib.sha256(raw).hexdigest()==item['sha256']
 if len(p.parts)>2 and p.parts[0]=='Plugin' and p.parts[1]!='NativeSync' and p.name=='plugin-manifest.json':
  name=name+'.block';manifest['disabledPluginManifests'].append(item['name'])
 target=source/name
 assert target.resolve().is_relative_to(source)
 target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if target.exists():
  assert target.read_bytes()==raw
 else:target.write_bytes(raw)
 manifest['files'].append({'name':name,'sha256':item['sha256'],'bytes':len(raw)})
binary=Path('/home/admin/VCPKF/vcp/artifacts/native-sync-r6/build-source/source/rust-vexus-lite/vexus-lite.linux-x64-gnu.node')
if root.name!='build-source' and binary.exists():
 target=source/'rust-vexus-lite/vexus-lite.linux-x64-gnu.node';shutil.copyfile(binary,target)
 manifest['nativeBinary']={'name':'rust-vexus-lite/vexus-lite.linux-x64-gnu.node','sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(root/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if root.name!='build-source':
 settings={'PORT':'0','SERVER_BIND_HOST':'127.0.0.1','Key':'isolated-poc-token','API_URL':'http://127.0.0.1:9','API_Key':'r6-synthetic-provider-unused','DebugMode':'false','CHAT_LOG_ENABLED':'false','TDB_KNOWLEDGE_ENABLED':'false','NativeSyncEnabled':'true','NativeSyncDataDir':str(root/'data/native-sync'),'KNOWLEDGEBASE_ROOT_PATH':str(root/'data/kb-empty'),'KNOWLEDGEBASE_STORE_PATH':str(root/'data/kb-store'),'KNOWLEDGEBASE_FULL_SCAN_ON_STARTUP':'false','VECTORDB_DIMENSION':'32','AGENT_DIR_PATH':str(root/'data/agents-empty'),'TVSTXT_DIR_PATH':str(root/'data/tvs-empty'),'DISTRIBUTED_MUSIC_PLAYLIST_SYNC_ENABLED':'false','WEBSOCKET_HEARTBEAT_ENABLED':'false'}
 for folder in ['kb-empty','agents-empty','tvs-empty']: (root/'data'/folder).mkdir(parents=True,exist_ok=True,mode=0o700)
 if kind=='native-sync-r7':
  settings.update({'NativeMobileEnabled':'true','NativeMobileOrigin':data['mobileOrigin'],'NativeMobileTopics':json.dumps([{'key':'test-topic','ownerType':'agent','ownerId':'R3Agent','topicId':'r3-topic','agentAlias':'R3Agent','agentName':'R3Agent','topicName':'NativeSync test','model':'r7-synthetic'}]),'NativeMobilePwaDir':str(source/'Plugin/NativeSync/mobile-dist'),'NativeMobileStartDelayMs':'3000'})
  (source/'agent_map.json').write_text(json.dumps({'R3Agent':'r7-synthetic-agent.txt'}),encoding='utf-8')
  (root/'data/agents-empty/r7-synthetic-agent.txt').write_text('SYNTHETIC_R7_AGENT: respond as the configured synthetic Agent.',encoding='utf-8')
  import socket
  sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
  (root/'r7-fixture-config.json').write_text(json.dumps({'port':port}))
 (source/'config.env').write_text('\\n'.join(k+'='+v for k,v in settings.items())+'\\n',encoding='utf-8')
 (source/'.env').write_text('# R6 synthetic empty sentinel; never search ancestor configuration.\\n',encoding='utf-8')
 (source/'ToolConfigs').mkdir(exist_ok=True)
 (source/'ToolConfigs/jev_tool_call_exp.json').write_text(json.dumps({'schemaVersion':1,'virtualToolName':'JEV','maxExpandedCalls':1,'categories':{}}),encoding='utf-8')
 (source/'ToolConfigs/jev_third_party_catalog.json').write_text(json.dumps({'schemaVersion':1,'limits':{},'categories':{}}),encoding='utf-8')
 (source/'TVStxt').mkdir(exist_ok=True)
 (source/'TVStxt/JevToolCallDecision.txt').write_text('## THIRD_PARTY_PROTOCOL\\nR6 synthetic empty decision fixture; no tools/providers enabled.\\n',encoding='utf-8')
 (source/'node_modules').symlink_to(Path('/home/admin/VCPKF/vcp/artifacts/native-sync-r6/deps/node_modules'),target_is_directory=True)
print(json.dumps({'root':str(root),'sourceCommit':data['sourceCommit'],'sourceFileCount':len(manifest['files']),'disabledPluginManifests':len(manifest['disabledPluginManifests']),'nativeBinary':manifest.get('nativeBinary'),'manifestSha256':hashlib.sha256((root/'source-manifest.json').read_bytes()).hexdigest()}))
`;
async function exportSource(remoteRoot, profile = {}) {
    const selectedRoot=profile.sourceRoot||sourceRoot;
    const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: selectedRoot, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
    const files = [];
    for (const name of names) {
        assert.ok(!name.split('/').some(part => ['node_modules', '.git', 'config.env', '.env', 'state-private'].includes(part)));
        const bytes = await fs.readFile(path.join(selectedRoot, name));
        files.push({ name, sha256: hash(bytes), base64: bytes.toString('base64') });
    }
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: selectedRoot, encoding: 'utf8', windowsHide: true }).trim();
    const child = spawn('ssh', [...sshArgs, 'wp08', 'python3 -c ' + quote(extract)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr = (stderr + b).slice(-2000); });
    for(const file of profile.extraFiles||[])files.push(file);
    child.stdin.end(JSON.stringify({ root: remoteRoot, sourceCommit, files,kind:profile.kind||'native-sync-r6',mobileOrigin:profile.mobileOrigin }));
    const [code] = await once(child, 'close');
    if (code !== 0) throw new Error(`R6 source export failed ${code}: ${stderr}`);
    return JSON.parse(stdout);
}
class FullToolboxTransport extends RealHostTransport {
    static async prepare({ localRoot }) {
        const remote = new FullToolboxTransport(localRoot, { kind: 'native-sync-r6', entry: 'server.js' });
        remote.enabled = true;
        remote.evidence.bootstrap = await exportSource(remote.remoteRoot);
        const net = require('node:net'), listener = net.createServer();
        await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); remote.localPort = listener.address().port;
        await new Promise(resolve => listener.close(resolve)); remote.url = `http://127.0.0.1:${remote.localPort}`;
        return remote;
    }
    async startServer() {
        const dataDir = this.remoteRoot + (this.enabled ? '/data/native-sync' : '/data/native-sync-disabled');
        const isR7=this.profile.kind==='native-sync-r7';
        const preload=isR7?'native-sync-r7-preload.cjs':'native-sync-r6-preload.cjs';
        const runVariable=isR7?'VCP_R7_RUN_ROOT':'VCP_R6_RUN_ROOT';
        const command = 'cd ' + quote(this.remoteRoot + '/source') + ' && env -i PATH=/usr/bin:/bin HOME=' + quote(this.remoteRoot) + ' NODE_PATH=' + base + '/deps/node_modules '+runVariable+'=' + quote(this.remoteRoot) + ' NativeSyncEnabled=' + (this.enabled ? 'true' : 'false') + ' NativeSyncDataDir=' + quote(dataDir) + ' /usr/bin/node --no-warnings --require ./scripts/'+preload+' server.js';
        const child = spawn('ssh', [...sshArgs, 'wp08', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const record = { localSshPid: child.pid, command, exitCode: null, events: [], enabled: this.enabled, logFile: path.join(this.localRoot, `full-toolbox-${child.pid}.log`) };
        this.evidence.servers.push(record); this.server = { child, record };
        let buffer = '', logs = '';
        const sanitize = text => text.replaceAll('isolated-poc-token', '[SYNTHETIC_KEY]').replaceAll('r6-synthetic-provider-unused', '[SYNTHETIC_PROVIDER_VALUE]');
        child.stdout.on('data', value => {
            buffer += value;
            while (buffer.includes('\n')) {
                const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
                if (line.startsWith('@@R6_RECEIPT@@')) record.events.push(JSON.parse(line.slice(14)));
                else logs += sanitize(line) + '\n';
            }
        });
        child.stderr.on('data', value => { logs += sanitize(value.toString()); });
        child.on('error', error => { record.spawnError = error.code; });
        child.on('exit', code => { record.exitCode = code; });
        child.on('close', async () => { await fs.writeFile(record.logFile, logs + sanitize(buffer)); record.closed = true; });
        const ready = await this.awaitCondition(async () => {
            if (child.exitCode !== null) {
                await fs.writeFile(record.logFile, logs + sanitize(buffer));
                throw new Error(`R6 full server.js boot exit ${child.exitCode}; complete isolated log: ${record.logFile}`);
            }
            return record.events.find(event => event.event === 'ready');
        }, 'complete Toolbox server.js boot', 90000);
        assert.equal(ready.nativeKnowledgeInitialized, true); assert.ok(ready.fullEntry.endsWith('/server.js'));
        assert.deepEqual(ready.discoveredPlugins, ['NativeSync']); assert.equal(ready.enabled, this.enabled);
        this.healthStatus = this.enabled ? 200 : 503;
        this.remotePort = Number(new URL(ready.url).port);
    }
    async stopServer() {
        if (!this.server) return;
        const { child, record } = this.server;
        if (child.exitCode === null) { child.stdin.write('stop\n'); await this.awaitCondition(() => child.exitCode !== null, 'real full-host graceful exit', 90000); }
        await this.awaitCondition(() => record.closed, 'full host log stream close');
        const stopped = record.events.find(event => event.event === 'stopped');
        assert.equal(record.exitCode, 0); assert.ok(stopped, 'real full server.js shutdown receipt required');
        assert.equal(stopped.pluginReadyAfterShutdown, false); assert.equal(stopped.isolation.violations.length, 0);
        assert.equal(stopped.lifecycle.shutdowns, record.enabled ? 1 : 0);
        this.server = null;
    }
    async disablePluginAndRestart() { this.enabled = false; await this.restartServerAndReconnect(); }
    async close() {
        try { await this.disconnect(); }
        finally {
            if (this.server && this.server.child.exitCode !== null && this.server.record.exitCode !== 0) {
                await this.awaitCondition(() => this.server.record.closed, 'failed boot log persisted'); this.server = null;
            } else await this.stopServer();
        }
    }
}
module.exports = { FullToolboxTransport, prepare: options => FullToolboxTransport.prepare(options), exportSource };
if (require.main === module && process.argv.includes('--prepare-build')) exportSource(base + '/build-source').then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
