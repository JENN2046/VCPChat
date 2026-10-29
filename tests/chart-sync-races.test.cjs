'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { ChartService } = require('../modules/services/chartService');
const { ShootingPlannerSyncService } = require('../modules/services/shootingPlannerSyncService');

const ipc = new Map();
const windows = [];
class FakeWindow extends EventEmitter {
    constructor() {
        super();
        this.webContents = Object.assign(new EventEmitter(), {
            id: windows.length + 1, isDestroyed: () => this.dead === true, send() {},
        });
        windows.push(this);
    }
    isDestroyed() { return this.dead === true; }
    setMenu() {}
    async loadFile() {}
    destroy() { this.dead = true; this.webContents.emit('destroyed'); this.emit('closed'); }
}
const originalLoad = Module._load;
let chartHandlers;
try {
    Module._load = function(request, parent, isMain) {
        if (request === 'electron') return {
            BrowserWindow: FakeWindow,
            screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }) },
            ipcMain: { handle: (name, handler) => ipc.set(name, handler), removeHandler: name => ipc.delete(name), on() {}, removeAllListeners() {} },
        };
        if (request === '../services/windowService' && parent.filename.endsWith('chartHandlers.js')) {
            return { register() {}, attachWindow() {} };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    chartHandlers = require('../modules/ipc/chartHandlers');
} finally { Module._load = originalLoad; }

const id = 'jenn-shooting-planner';
const initial = () => ({ products: [{ id: 'before' }], tasks: [], sessions: [], cloudRevision: 3, cloudUpdatedAt: 'initial', note: 'before' });
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
async function fixture(t, cloud) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chart-sync-race-'));
    const service = new ChartService({ appDataRoot: root, logger: { warn() {} } });
    t.after(async () => { await chartHandlers.shutdown(); await fs.rm(root, { recursive: true, force: true }); });
    await chartHandlers.initialize({
        projectRoot: path.resolve(__dirname, '..'), chartService: service,
        chartDataSourceService: { read: async () => { throw new Error('unexpected data-source execution'); } },
        shootingPlannerSyncService: { status: () => ({ enabled: true }), ...cloud },
    });
    await service.createChart({ manifest: { id, name: 'Synthetic planner' }, initialData: initial() });
    const win = await chartHandlers.openWorkbench(id);
    let sequence = 0;
    return {
        service,
        call: action => ipc.get('chart:shooting-planner-sync')({ sender: win.webContents }, { chartId: id, action, operationId: `synthetic-operation-${action}-${++sequence}` }),
    };
}

test('a local edit between synchronization reads cannot be overwritten by a pull', async t => {
    let pendingEdit;
    const { service, call } = await fixture(t, {
        pull: async () => {
            await pendingEdit;
            return { revision: 4, updatedAt: 'cloud', products: [{ id: 'cloud' }], tasks: [], sessions: [] };
        },
    });
    const read = service.readData.bind(service);
    let injected = false;
    service.readData = async chartId => {
        const data = await read(chartId);
        if (!injected) {
            injected = true;
            // Let an unprotected read's competing writer finish. A queued
            // snapshot instead lets that writer run after the read releases.
            const queuedRead = service.queues.has(chartId);
            pendingEdit = service.replaceData(chartId, { ...data, products: [{ id: 'local-edit' }], note: 'edited' }, { expectedDataRevision: 1 });
            if (!queuedRead) await pendingEdit;
        }
        return data;
    };
    await assert.rejects(call('pull'), { code: 'CHART_REVISION_CONFLICT' });
    assert.equal(injected, true);
    const data = await read(id);
    assert.deepEqual(data.products, [{ id: 'local-edit' }]);
    assert.equal(data.note, 'edited');
    assert.equal(data.cloudRevision, 3);
});

test('a successful push acknowledges its revision while preserving an in-flight local edit', async t => {
    const started = deferred(), acknowledge = deferred();
    const sent = [];
    const { service, call } = await fixture(t, {
        push: async (snapshot, options) => {
            sent.push({ snapshot, options }); started.resolve();
            await acknowledge.promise;
            return { revision: sent.length + 3, updatedAt: 'cloud-' + sent.length };
        },
    });
    const pending = call('push').then(value => ({ value }), error => ({ error }));
    await started.promise;
    await service.replaceData(id, { ...initial(), products: [{ id: 'local-edit' }], note: 'edited' }, { expectedDataRevision: 1 });
    acknowledge.resolve();
    const result = await pending;
    assert.equal(result.error, undefined, 'cloud acknowledgement must not depend on the pre-request data revision');
    let data = await service.readData(id);
    assert.deepEqual(data.products, [{ id: 'local-edit' }]);
    assert.equal(data.note, 'edited');
    assert.equal(data.cloudRevision, 4);
    assert.equal(data.cloudUpdatedAt, 'cloud-1');
    await call('push');
    assert.deepEqual(sent[1].snapshot.products, [{ id: 'local-edit' }]);
    assert.equal(sent[1].options.expectedRevision, 4);
    data = await service.readData(id);
    assert.equal(data.cloudRevision, 5);
});

test('a late push acknowledgement cannot regress newer reconciled cloud metadata', async t => {
    const started = deferred(), acknowledge = deferred();
    const { service, call } = await fixture(t, {
        push: async () => { started.resolve(); await acknowledge.promise; return { revision: 4, updatedAt: 'older' }; },
    });
    const pending = call('push').then(value => ({ value }), error => ({ error }));
    await started.promise;
    await service.replaceData(id, { ...initial(), products: [{ id: 'newer' }], cloudRevision: 5, cloudUpdatedAt: 'newer' }, { expectedDataRevision: 1 });
    acknowledge.resolve();
    const result = await pending;
    assert.equal(result.error, undefined);
    const data = await service.readData(id);
    assert.equal(data.cloudRevision, 5);
    assert.equal(data.cloudUpdatedAt, 'newer');
    assert.deepEqual(data.products, [{ id: 'newer' }]);
});

const validRemote = () => ({ schemaVersion: 1, revision: 4, updatedAt: '2026-10-28T00:00:00.000Z', products: [], tasks: [], sessions: [] });
function remoteClient(snapshot) {
    return new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test', schedulerToken: 'synthetic-only-token-1234',
        fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null },
            arrayBuffer: async () => Buffer.from(JSON.stringify({ ok: true, snapshot })) }) });
}
for (const [name, snapshot] of [
    ['empty object', {}], ['array', []], ['unsupported schema', { ...validRemote(), schemaVersion: 2 }],
    ['unsafe revision', { ...validRemote(), revision: Number.MAX_SAFE_INTEGER + 1 }],
    ['missing timestamp', { ...validRemote(), updatedAt: undefined }],
    ['products object', { ...validRemote(), products: {} }], ['tasks null', { ...validRemote(), tasks: null }],
    ['missing sessions', { ...validRemote(), sessions: undefined }],
]) test('malformed remote ' + name + ' cannot write or erase local planner data', async t => {
    const remote = remoteClient(snapshot);
    const { service, call } = await fixture(t, { pull: () => remote.pull() });
    const before = await service.readDataSnapshot(id);
    let writes = 0;
    const replace = service.replaceData.bind(service);
    service.replaceData = (...args) => { writes++; return replace(...args); };
    await assert.rejects(call('pull'), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });
    assert.equal(writes, 0, 'reject the response before any local replacement');
    assert.deepEqual(await service.readData(id), before.data);
    assert.deepEqual(await service.readManifest(id), before.manifest);
});
test('a valid empty remote snapshot is applied while local-only fields remain intact', async t => {
    const remote = remoteClient(validRemote());
    const { service, call } = await fixture(t, { pull: () => remote.pull() });
    const result = await call('pull');
    assert.equal(result.revision, 4);
    const data = await service.readData(id);
    assert.deepEqual(data.products, []); assert.deepEqual(data.tasks, []); assert.deepEqual(data.sessions, []);
    assert.equal(data.cloudRevision, 4); assert.equal(data.note, 'before');
});

for (const [name, acknowledgement] of [
    ['empty object', {}], ['null', null], ['failure envelope', { ok: false, revision: 4, updatedAt: '2026-10-28T00:00:00.000Z' }],
    ['missing revision', { ok: true, updatedAt: '2026-10-28T00:00:00.000Z' }],
    ['unsafe revision', { ok: true, revision: Number.MAX_SAFE_INTEGER + 1, updatedAt: '2026-10-28T00:00:00.000Z' }],
    ['non-advancing revision', { ok: true, revision: 3, updatedAt: '2026-10-28T00:00:00.000Z' }],
    ['missing timestamp', { ok: true, revision: 4 }], ['bad timestamp', { ok: true, revision: 4, updatedAt: 'invalid' }],
]) test('malformed push acknowledgement ' + name + ' leaves local cloud metadata unchanged without retry', async t => {
    let dispatches = 0;
    const remote = new ShootingPlannerSyncService({ baseUrl: 'https://synthetic.example.test', schedulerToken: 'synthetic-only-token-1234',
        fetchImpl: async (_url, options) => { dispatches++; assert.equal(options.headers['Idempotency-Key'], 'synthetic-operation-push-1');
            return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Buffer.from(JSON.stringify(acknowledgement)) }; } });
    const { service, call } = await fixture(t, { push: (data, options) => remote.push(data, options) });
    const before = await service.readDataSnapshot(id);
    let patches = 0; const apply = service.applyDataOperations.bind(service);
    service.applyDataOperations = (...args) => { patches++; return apply(...args); };
    await assert.rejects(call('push'), { code: 'SHOOTING_SYNC_INVALID_RESPONSE' });
    assert.equal(dispatches, 1, 'an invalid reply must not dispatch again or invent an operation id');
    assert.equal(patches, 0); assert.deepEqual(await service.readData(id), before.data);
    assert.deepEqual(await service.readManifest(id), before.manifest);
});
