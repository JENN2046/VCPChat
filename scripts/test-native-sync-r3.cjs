'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { startSyncService } = require('../modules/services/nativeSync/httpService');
const { canonicalMessage, messageHash, messageKey } = require('../modules/services/nativeSync/protocol');
const root = path.resolve(__dirname, '..');
const realHost = process.argv.includes('--real-host=wp08');
const toolboxService = process.argv.includes('--toolbox-service');
const fullToolbox = process.argv.includes('--full-toolbox');
const mobilePwa=process.argv.includes('--mobile-pwa');
if (fullToolbox && !toolboxService) throw new Error('Full Toolbox acceptance requires the plugin transport');
if (toolboxService && !realHost) throw new Error('Toolbox acceptance requires the authorized real-host transport');
if (process.argv.some(arg => arg.startsWith('--real-host=') && arg !== '--real-host=wp08')) throw new Error('Only the authorized wp08 test host is supported');
const artifacts = path.resolve(root, mobilePwa ? '../../artifacts/native-sync-r7' : fullToolbox ? '../../artifacts/native-sync-r6' : toolboxService ? '../../artifacts/native-sync-r5' : realHost ? '../../artifacts/native-sync-r4' : '../../artifacts/native-sync-r3');
const runRoot = path.join(artifacts, `run-${Date.now()}`);
const electron = require('electron');
const agent = 'R3Agent', topic = 'r3-topic', group = 'R3Group', groupTopic = 'r3-group-topic';
const topics = [{ itemId: agent, itemType: 'agent', topicId: topic }, { itemId: group, itemType: 'group', topicId: groupTopic }];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], launches = [], active = new Set();
let sync, model, modelPort, stage = 'setup';
let remoteTransport = null;
const transportChecks = [];
async function centerRequest(route, body) {
    const response = await fetch(sync.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer isolated-poc-token', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200); return response.json();
}
async function verifyPluginGate() {
    const before = await centerRequest('/api/plugins/NativeSync/sync/status');
    assert.deepEqual(before, await centerMetrics());
    for (const route of ['/api/v1/sync/pull', '/api/v1/sync/push', '/api/plugins/NativeSync/sync/status']) {
        for (const authorization of [null, 'Bearer synthetic-invalid']) {
            const response = await fetch(sync.url + route, { method: route.endsWith('/push') ? 'POST' : 'GET', headers: authorization ? { Authorization: authorization, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, body: route.endsWith('/push') ? '{}' : undefined });
            assert.equal(response.status, 401);
        }
    }
    assert.deepEqual(await centerMetrics(), before);
    const ready = await sync.snapshot('plugin-initialization-and-host-auth-gate');
    assert.equal(ready.ready, true);
    assert.equal(ready.lifecycle.initialized, 1);
    assert.equal(ready.lifecycle.namespacedRegistrations, 1);
    assert.equal(ready.lifecycle.compatibilityRegistrations, 1);
    transportChecks.push({ check: 'real PluginManager discovers and initializes service; namespaced and compatibility routes share host Bearer auth; unauthorized Push/Pull rejected', lifecycle: ready.lifecycle, metrics: before });
}
async function centerMetrics() { return centerRequest('/api/v1/sync/status'); }
async function finalPersistence() {
    const clients = [], canonical = {};
    for (const name of ['Windows-A', 'Windows-B', 'Sync-Off']) {
        const agentHistory = await history(name), groupHistory = await history(name, group, groupTopic);
        let s = null;
        try { s = await syncState(name); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const ids = [...agentHistory, ...groupHistory].map(m => m.id);
        assert.equal(new Set(ids).size, ids.length);
        canonical[name] = [agentHistory.map(m => canonicalMessage(m, topic)), groupHistory.map(m => canonicalMessage(m, groupTopic))];
        clients.push({ name, agentMessages: agentHistory.length, groupMessages: groupHistory.length, cursor: s?.cursor ?? null, outbox: s?.outbox.length ?? null, pending: s ? Boolean(s.pending) : null });
    }
    assert.deepEqual(canonical['Windows-A'], canonical['Windows-B']);
    const metrics = await centerMetrics();
    for (const c of clients.slice(0, 2)) { assert.equal(c.cursor, metrics.headSeq); assert.equal(c.outbox, 0); assert.equal(c.pending, false); }
    assert.equal(clients[2].cursor, null);
    if (realHost) {
        const remote = await sync.snapshot('final-remote-sqlite-consistency');
        assert.deepEqual(remote.metrics, metrics);
        const server = new Map(remote.entries.map(entry => [messageKey(entry), entry]));
        let count = 0;
        for (const [i, d] of topics.entries()) for (const m of canonical['Windows-A'][i]) {
            const entry = server.get(messageKey({ ownerType: d.itemType, ownerId: d.itemId, topicId: d.topicId, msgId: m.id }));
            assert.ok(entry); assert.equal(entry.hash, messageHash(m)); assert.equal(entry.deleted, 0); count++;
        }
        assert.equal(count, remote.entries.length);
    }
    return { clients, metrics, aAndBCanonicalHistoriesEqual: true, remoteSqliteHashIndexVerified: realHost };
}

async function json(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2)); }
async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function waitFor(fn, label, ms = 20000) {
    const deadline = Date.now() + ms; let last;
    while (Date.now() < deadline) {
        try { const value = await fn(); if (value) return value; } catch (error) { if (error.terminal) throw error; last = error; }
        await sleep(80);
    }
    throw new Error(`${label} timed out${last ? ': ' + last.message : ''}`);
}
class CDP {
    constructor(url) {
        this.socket = new WebSocket(url); this.pending = new Map(); this.serial = 0; this.exceptions = [];
        this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
        this.socket.addEventListener('message', ({ data }) => {
            const message = JSON.parse(data);
            if (message.id) { const callback = this.pending.get(message.id); if (!callback) return; this.pending.delete(message.id); clearTimeout(callback.timer); if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result); }
            if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
        });
        this.socket.addEventListener('close', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP connection closed')); } this.pending.clear(); });
    }
    async send(method, params = {}) {
        await this.ready; const id = ++this.serial;
        if (this.socket.readyState !== WebSocket.OPEN) throw Object.assign(new Error('CDP connection closed'), { terminal: true });
        return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timeout`)); }, 12000); this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); });
    }
    async evaluate(expression) {
        const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result?.value;
    }
    close() { this.socket.close(); }
}
async function startModel() {
    const server = http.createServer(async (request, response) => {
        if (request.url === '/v1/models') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'r3-synthetic', object: 'model' }] })); return; }
        if (request.url.includes('interrupt')) { response.end(JSON.stringify({ success: true })); return; }
        let bytes = ''; for await (const chunk of request) bytes += chunk;
        const body = JSON.parse(bytes || '{}');
        const userTexts = [...(body.messages || [])].reverse().filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join(' ') : m.content?.text || '');
        // Group requests append an invitation user prompt after the actual user
        // message. Echo the synthetic case marker, not that protocol prompt.
        const text = userTexts.find(value => /\bR3_[A-Z_]+\b/.test(value)) || userTexts[0] || '';
        const result = 'R3 synthetic response: ' + text.slice(0, 180);
        if (body.stream) {
            response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
            for (const content of [result.slice(0, 12), result.slice(12)]) { response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`); await sleep(120); }
            response.end('data: [DONE]\n\n');
        } else { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: result } }] })); }
    });
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve)); return server;
}
async function seed(name) {
    const appData = path.join(runRoot, name);
    await json(path.join(appData, 'settings.json'), { uiMode: 'next', userName: 'R3 Isolated User', enableDistributedServer: false, ChatDataServiceEnabled: false, assistantEnabled: false, assistantAgent: agent, vcpServerUrl: `http://127.0.0.1:${modelPort}/v1/chat/completions`, vcpApiKey: 'synthetic-r3-only', enableContextCompaction: false });
    await json(path.join(appData, 'rust-assistant-config.json'), { version: 2, useRustAssistant: false });
    await json(path.join(appData, 'Agents', agent, 'config.json'), { name: agent, model: 'r3-synthetic', streamOutput: true, promptMode: 'original', originalSystemPrompt: 'Synthetic R3 fixture', systemPrompt: 'Synthetic R3 fixture', stripRegexes: [], topics: [{ id: topic, name: 'R3 Sync Topic', createdAt: 100, locked: true }, { id: 'r3-other', name: 'R3 Other Topic', createdAt: 101, locked: true }] });
    await json(path.join(appData, 'AgentGroups', group, 'config.json'), { id: group, name: group, mode: 'sequential', members: [agent], topics: [{ id: groupTopic, name: 'R3 Group Topic', createdAt: 102, locked: true }] });
    for (const [owner, id] of [[agent, topic], [agent, 'r3-other'], [group, groupTopic]]) await json(path.join(appData, 'UserData', owner, 'topics', id, 'history.json'), []);
    return appData;
}
async function start(name, { enabled = true, fault = false } = {}) {
    stage = `launch-${name}`;
    const appData = path.join(runRoot, name), port = await freePort();
    const args = ['.', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
    if (enabled) args.push('--native-sync-poc', `--native-sync-url=${sync.url}`, `--native-sync-device=${name}`, `--native-sync-topics=${JSON.stringify(topics)}`);
    const env = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { VCPCHAT_APP_DATA_DIR: appData, VCPCHAT_E2E_TEST: '1', VCPCHAT_R7_MOBILE_PWA: mobilePwa?'1':'', VCPCHAT_R6_FULL_TOOLBOX: fullToolbox ? '1' : '', VCPCHAT_R5_TOOLBOX: toolboxService ? '1' : '', VCPCHAT_R4_REAL_HOST: realHost ? 'wp08' : '', VCPCHAT_R3_RUN_ROOT: runRoot, VCPCHAT_R3_FAIL_SYNC_FINALIZE: fault ? '1' : '0', NODE_OPTIONS: '--require=' + path.join(root, 'scripts/native-sync-r3-guard.cjs').replaceAll('\\', '/'), NODE_PATH: [path.resolve(artifacts, '../native-sync-r3/deps/node_modules'), path.resolve(artifacts, '../native-sync-r2/deps/node_modules')].join(path.delimiter), TEMP: path.join(runRoot, 'temp'), TMP: path.join(runRoot, 'temp'), HOME: path.join(appData, 'test-home'), USERPROFILE: path.join(appData, 'test-home'), APPDATA: path.join(appData, 'os-roaming'), LOCALAPPDATA: path.join(appData, 'os-local') });
    for (const folder of [env.TEMP, env.HOME, env.APPDATA, env.LOCALAPPDATA]) await fs.mkdir(folder, { recursive: true });
    const child = spawn(electron, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const record = { name, pid: child.pid, args, appData, enabled, injectedFinalizeFailure: fault, exitCode: null, signal: null, mainUrl: null, rendererReady: false };
    launches.push(record);
    const client = { child, record, page: null, browser: null, output: '' }; active.add(client);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { client.output = (client.output + data.toString()).slice(-14000); });
    child.on('exit', (code, signal) => { record.exitCode = code; record.signal = signal; });
    const version = await waitFor(async () => { if (child.exitCode !== null) throw Object.assign(new Error('application exited with code ' + child.exitCode), { terminal: true }); return fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()); }, 'Chrome inspector', 18000);
    client.browser = new CDP(version.webSocketDebuggerUrl);
    const target = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && /\/main\.html(?:\?|$)/.test(t.url)), 'full main.html', 22000);
    record.mainUrl = target.url;
    client.page = new CDP(target.webSocketDebuggerUrl); await client.page.send('Runtime.enable');
    await waitFor(() => client.page.evaluate("document.documentElement.dataset.vcpRendererReady === 'true'"), 'full renderer readiness', 25000);
    record.rendererReady = true;
    await waitFor(() => client.page.evaluate(`Boolean(document.querySelector('#agentList > [data-item-id="${agent}"][data-item-type="agent"]'))`), 'real Agent list');
    return client;
}
async function select(client, owner = agent, type = 'agent', id = topic) {
    stage = `navigate-${client.record.name}-${owner}-${id}`;
    const selected = await client.page.evaluate('window.VCPMainChatState?.snapshot?.().selectedItem');
    // Re-clicking the same Owner within 300 ms opens the real settings editor.
    // Preserve that product behavior; do not manufacture unintended double clicks.
    if (selected?.id !== owner || selected?.type !== type) await client.page.evaluate(`document.querySelector('#agentList > [data-item-id="${owner}"][data-item-type="${type}"]')?.click()`);
    await waitFor(() => client.page.evaluate(`window.VCPMainChatState?.snapshot?.().selectedItem?.id === ${JSON.stringify(owner)}`), 'selected Owner');
    await waitFor(() => client.page.evaluate(`Boolean(document.querySelector('[data-topic-id="${id}"][data-item-id="${owner}"]'))`), 'Topic list');
    if (await client.page.evaluate('window.VCPMainChatState?.snapshot?.().topicId') !== id) await client.page.evaluate(`document.querySelector('[data-topic-id="${id}"][data-item-id="${owner}"]')?.click()`);
    await waitFor(() => client.page.evaluate(`window.VCPMainChatState?.snapshot?.().topicId === ${JSON.stringify(id)}`), 'selected Topic');
}
async function history(name, owner = agent, id = topic) { return JSON.parse(await fs.readFile(path.join(runRoot, name, 'UserData', owner, 'topics', id, 'history.json'), 'utf8')); }
async function syncState(name) { return JSON.parse(await fs.readFile(path.join(runRoot, name, '.native-sync', 'state.json'), 'utf8')); }
async function send(client, text, owner = agent, id = topic) {
    stage = `send-${client.record.name}-${text}`;
    const beforeIds = new Set((await history(client.record.name, owner, id)).map(message => message.id));
    await waitFor(() => client.page.evaluate("!document.getElementById('messageInput')?.disabled && !document.getElementById('sendMessageBtn')?.disabled"), 'composer ready');
    await client.page.evaluate(`(()=>{const input=document.getElementById('messageInput');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('sendMessageBtn').click()})()`);
    await waitFor(async () => (await history(client.record.name, owner, id)).some(m => m.role === 'assistant' && !beforeIds.has(m.id)), 'native durable terminal', 18000);
    await waitFor(() => client.page.evaluate("document.getElementById('sendMessageBtn')?.dataset.mode !== 'interrupt'"), 'send button settled');
}
async function visible(client, text) { return waitFor(() => client.page.evaluate(`document.getElementById('chatMessages').innerText.includes(${JSON.stringify(text)})`), 'formal chat visible'); }
async function screenshot(client, name) { await sleep(200); const data = await client.page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(path.join(runRoot, name + '.png'), Buffer.from(data.data, 'base64')); }
async function stop(client) {
    if (client.child.exitCode === null) { try { await client.browser?.send('Browser.close'); } catch {} }
    await waitFor(() => client.child.exitCode !== null, 'graceful application exit', 15000);
    client.page?.close(); client.browser?.close(); active.delete(client);
    assert.equal(client.child.exitCode, 0, 'full app must exit cleanly');
}
async function main() {
    await fs.mkdir(runRoot, { recursive: true });
    model = await startModel(); modelPort = model.address().port;
    if (realHost) {
        remoteTransport = mobilePwa
            ? await require('./native-sync-r7-transport.cjs').prepare({localRoot:runRoot})
            : fullToolbox
            ? await require('./native-sync-r6-transport.cjs').prepare({ localRoot: runRoot })
            : toolboxService
            ? await require('./native-sync-r5-transport.cjs').prepare({ localRoot: runRoot })
            : await require('./native-sync-r4-transport.cjs').RealHostTransport.prepare({ sourceRoot: root, localRoot: runRoot });
        sync = await remoteTransport.start();
        if (toolboxService) await verifyPluginGate();
    } else sync = await startSyncService({ dbPath: path.join(runRoot, 'central.sqlite'), token: 'isolated-poc-token' });
    await seed('Windows-A'); await seed('Windows-B'); await seed('Sync-Off');
    if(mobilePwa)return require('./native-sync-r7-scenario.cjs').run({sync,runRoot,CDP,start,select,send,visible,screenshot,stop,history,syncState,checks});
    let a = await start('Windows-A');
    if (process.argv.includes('--probe')) { checks.push('full main.js / main.html cold-start ready'); await screenshot(a, 'probe-full-app'); await stop(a); return; }
    await select(a); await send(a, 'R3_A_STREAM'); await visible(a, 'R3 synthetic response: R3_A_STREAM');
    await waitFor(async () => { const s = await syncState('Windows-A'); return s.outbox.length === 0 && s.cursor >= 2 && !s.pending; }, 'A durable sync checkpoint');
    checks.push('A full-app cold start, Agent/Topic navigation, real main-chat send and stream terminal, Outbox push');
    await screenshot(a, 'A-stream-and-sync'); await stop(a);

    let b = await start('Windows-B', { fault: true });
    await waitFor(async () => Boolean((await syncState('Windows-B')).pending), 'durable remote pending application');
    assert.equal((await syncState('Windows-B')).cursor, 0);
    checks.push('B full app persists remote history with pending application while synthetic state-finalize fault prevents cursor acknowledgement');
    await stop(b);
    b = await start('Windows-B'); await select(b);
    await visible(b, 'R3_A_STREAM'); await visible(b, 'R3 synthetic response: R3_A_STREAM');
    await waitFor(async () => { const s = await syncState('Windows-B'); return !s.pending && s.cursor >= 2 && s.outbox.length === 0; }, 'B remote application restart recovery');
    checks.push('B cold restart recovers pending apply/cursor and shows A messages in complete official UI');
    await screenshot(b, 'B-resumed-A');
    if (realHost) await sync.disconnect();
    else { await sync.close(); sync = null; }
    await send(b, 'R3_B_OFFLINE');
    const offline = await syncState('Windows-B');
    assert.ok(offline.outbox.length >= 2);
    const replayOperation = offline.outbox[0];
    if (realHost) {
        const remote = await sync.snapshot('ssh-disconnected-remote-server-still-running');
        assert.equal(remote.metrics.journalRows, 2);
        transportChecks.push({ check: 'real SSH tunnel disconnect leaves Ubuntu running; native save durably queues Outbox', outbox: offline.outbox.length, cursor: offline.cursor, remoteMetrics: remote.metrics });
    }
    await stop(b);
    if (realHost) {
        await sync.restartServerAndReconnect();
        assert.equal((await centerMetrics()).journalRows, 2);
    } else sync = await startSyncService({ dbPath: path.join(runRoot, 'central.sqlite'), token: 'isolated-poc-token' });
    b = await start('Windows-B'); await select(b); await visible(b, 'R3_B_OFFLINE');
    await waitFor(async () => (await syncState('Windows-B')).outbox.length === 0, 'restarted persisted Outbox flush');
    checks.push('offline native save + process shutdown + SQLite server restart + persisted Outbox continuation');
    if (realHost) {
        const before = await centerMetrics();
        await sync.restartServerAndReconnect();
        assert.deepEqual(await centerMetrics(), before);
        const repeated = await centerRequest('/api/v1/sync/push', replayOperation);
        assert.equal(repeated.hash, messageHash(replayOperation.message));
        assert.deepEqual(await centerMetrics(), before);
        const delta = await centerRequest('/api/v1/sync/pull?after_seq=2&limit=1');
        assert.equal(delta.events.length, 1); assert.equal(delta.events[0].seq, 3); assert.equal(delta.nextSeq, 3); assert.equal(delta.hasMore, true);
        const next = await centerRequest('/api/v1/sync/pull?after_seq=3&limit=1');
        assert.equal(next.events.length, 1); assert.equal(next.events[0].seq, 4);
        assert.equal((await centerRequest('/api/v1/sync/pull?after_seq=4&limit=1')).events.length, 0);
        transportChecks.push({ check: 'Ubuntu process restart preserves applied operation IDs; same operation replay creates no duplicate journal; real incremental pull pages', metrics: before, replaySeq: repeated.seq, incrementalSeqs: [delta.events[0].seq, next.events[0].seq] });
    }
    await stop(b);

    a = await start('Windows-A'); await select(a); await visible(a, 'R3_B_OFFLINE');
    const ids = (await history('Windows-A')).map(m => m.id); assert.equal(new Set(ids).size, ids.length);
    await select(a, agent, 'agent', 'r3-other');
    assert.equal(await a.page.evaluate("document.getElementById('chatMessages').innerText.includes('R3_B_OFFLINE')"), false);
    await select(a); await visible(a, 'R3_B_OFFLINE');
    await select(a, group, 'group', groupTopic); await send(a, 'R3_GROUP', group, groupTopic);
    await waitFor(async () => (await syncState('Windows-A')).outbox.length === 0, 'group Outbox flush');
    checks.push('A restart resumes B, no duplicate IDs, real Topic switching and group save/automatic terminal');
    await screenshot(a, 'A-group'); await stop(a);
    b = await start('Windows-B'); await select(b, group, 'group', groupTopic); await visible(b, 'R3_GROUP');
    checks.push('B full app receives group history and displays official group chat after restart');
    await screenshot(b, 'B-group'); await stop(b);

    const before = (await centerMetrics()).journalRows;
    const c = await start('Sync-Off', { enabled: false }); await select(c); await send(c, 'R3_SINGLE_MACHINE'); await visible(c, 'R3_SINGLE_MACHINE');
    await screenshot(c, 'sync-off-single-machine'); await stop(c);
    assert.equal((await centerMetrics()).journalRows, before);
    await assert.rejects(fs.access(path.join(runRoot, 'Sync-Off', '.native-sync', 'state.json')));
    checks.push('sync disabled: complete app opens and saves stream terminal locally without creating sync state or changing server journal');
}
async function verifyPluginDisabled() {
    stage = 'complete-host-plugin-disabled';
    await sync.disablePluginAndRestart();
    for (const route of ['/api/v1/sync/push', '/api/v1/sync/pull', '/api/plugins/NativeSync/sync/push', '/api/plugins/NativeSync/sync/status']) {
        const response = await fetch(sync.url + route, { method: route.endsWith('/push') ? 'POST' : 'GET', headers: { Authorization: 'Bearer isolated-poc-token', 'Content-Type': 'application/json' }, body: route.endsWith('/push') ? '{}' : undefined });
        assert.equal(response.status, 503);
    }
    const before = await sync.snapshot('complete-server-plugin-disabled-no-data-or-writable-route');
    assert.equal(before.ready, false); assert.equal(before.syncDataCreated, false); assert.equal(before.lifecycle.initialized, 0);
    await seed('Plugin-Off'); const client = await start('Plugin-Off', { enabled: false });
    await select(client); await send(client, 'R3_PLUGIN_OFF'); await visible(client, 'R3 synthetic response: R3_PLUGIN_OFF');
    await screenshot(client, 'plugin-disabled-single-machine'); await stop(client);
    assert.equal((await history('Plugin-Off')).length, 2);
    await assert.rejects(fs.access(path.join(runRoot, 'Plugin-Off', '.native-sync', 'state.json')));
    const after = await sync.snapshot('complete-server-plugin-disabled-after-single-machine-save');
    assert.equal(after.syncDataCreated, false);
    transportChecks.push({ check: 'real full server.js boot with plugin disabled creates no sync data and rejects write routes; complete VCPChat single-machine send unchanged', lifecycle: after.lifecycle, syncDataCreated: false, localHistoryMessages: 2 });
}
main().then(async () => {
    const persistence = process.argv.includes('--probe') ? null : await finalPersistence();
    if (fullToolbox && !process.argv.includes('--probe')) await verifyPluginDisabled();
    const guardFiles = await fs.readdir(path.join(runRoot, 'guard'));
    const guards = await Promise.all(guardFiles.map(file => fs.readFile(path.join(runRoot, 'guard', file), 'utf8').then(JSON.parse)));
    assert.ok(guards.some(g => g.processType === 'browser'));
    assert.equal(guards.reduce((sum, g) => sum + g.blockedWrites.length + g.blockedReads, 0), 0, 'no runtime access outside isolation boundary');
    assert.equal(guards.filter(g => g.fatal).length, 0);
    if (realHost) { await remoteTransport.close(); sync = null; }
    const receipt = { result: process.argv.includes('--probe') ? 'PROBE_PASS' : mobilePwa ? 'R7_MOBILE_PWA_CORE_PASS' : fullToolbox ? 'R6_FULL_TOOLBOX_ISOLATED_BOOT_PASS' : toolboxService ? 'R5_TOOLBOX_SERVICE_INTEGRATION_PASS' : realHost ? 'R4_REAL_HOST_TRANSPORT_PASS' : 'FULL_APP_COLD_START_PASS', runRoot, checks, launches, persistence, transportChecks, remote: remoteTransport?.evidence ?? null, guardSummary: guards.map(g => ({ pid: g.pid, processType: g.processType, blockedNetwork: g.blockedNetwork.length, blockedWrites: g.blockedWrites.length, blockedReads: g.blockedReads, faultsInjected: g.faultsInjected })), model: 'synthetic loopback SSE only', fullEntry: 'electron . -> package.json main -> real main.js -> main.html -> renderer.js; no application modules replaced', singleInstance: 'unchanged; launches sequential; no allow-multiple-instances flag' };
    const prefix = mobilePwa ? 'R7' : fullToolbox ? 'R6' : toolboxService ? 'R5' : realHost ? 'R4' : 'R3';
    await json(path.join(runRoot, prefix + '_APP_RECEIPT.json'), receipt); await json(path.join(artifacts, `LATEST_${prefix}_RECEIPT.json`), receipt);
    console.log(JSON.stringify(receipt));
}).catch(async error => {
    const guards = await fs.readdir(path.join(runRoot, 'guard')).catch(() => []);
    const evidence = await Promise.all(guards.map(file => fs.readFile(path.join(runRoot, 'guard', file), 'utf8').then(JSON.parse)));
    const uiStates = [];
    for (const client of active) {
        try { uiStates.push({ name: client.record.name, state: await client.page?.evaluate("({selected:window.VCPMainChatState?.snapshot?.().selectedItem?.id, topic:window.VCPMainChatState?.snapshot?.().topicId, items:[...document.querySelectorAll('#agentList > [data-item-id]')].map(e=>({id:e.dataset.itemId,type:e.dataset.itemType})), activeModals:[...document.querySelectorAll('.modal.active')].map(e=>e.id), sendMode:document.getElementById('sendMessageBtn')?.dataset.mode})") }); await screenshot(client, 'failure-' + client.record.name); } catch {}
    }
    const receipt = { result: realHost ? 'BLOCKED' : checks.length ? 'FULL_APP_PARTIAL_PASS' : 'BLOCKED', stage, message: error.message, checks, launches, remote: remoteTransport?.evidence ?? null, guardEvidence: evidence, rendererErrors: [...active].flatMap(c => c.page?.exceptions || []), uiStates, runRoot };
    const prefix = mobilePwa ? 'R7' : fullToolbox ? 'R6' : toolboxService ? 'R5' : realHost ? 'R4' : 'R3';
    await json(path.join(runRoot, prefix + '_APP_RECEIPT.json'), receipt); await json(path.join(artifacts, `LATEST_${prefix}_RECEIPT.json`), receipt); console.error(JSON.stringify(receipt)); process.exitCode = 1;
}).finally(async () => {
    for (const client of active) { try { await client.browser?.send('Browser.close'); await waitFor(() => client.child.exitCode !== null, 'failure cleanup exit', 5000); } catch { client.child.kill(); } client.page?.close(); client.browser?.close(); }
    if (remoteTransport) await remoteTransport.close();
    else if (sync) await sync.close();
    if (model) await new Promise(resolve => model.close(resolve));
});
