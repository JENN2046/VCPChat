'use strict';
const test = require('node:test');

test('standalone world-book adapter uses the host facade without server-relative modules', async t => {
    const previous = globalThis.SillyTavern;
    t.after(() => {
        if (previous === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previous;
    });
    globalThis.SillyTavern = { getContext: () => ({ world_names: ['Beta', 'Alpha'] }) };
    const { listWorldBooks } = await import('../Gamemodules/srpg/src/st.js');
    assert.deepEqual(await listWorldBooks(), ['Alpha', 'Beta']);
});
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { SessionStore } = require('../Gamemodules/srpg/session-store.cjs');
const { formatResult } = require('../Gamemodules/srpg/tool-result.cjs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

async function serviceFixture(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vcp-srpg-ipc-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const page = path.join(directory, 'source with spaces', '战棋 # %', 'index.html');
    const handlers = new Map(), calls = [], broadcasts = [];
    let receive = () => {};
    class ObservedStore extends SessionStore {
        execute(...args) { calls.push('execute'); return super.execute(...args); }
        syncFromUi(...args) { calls.push('sync'); return super.syncFromUi(...args); }
    }
    class Window {
        constructor() {
            this.webContents = {
                send(channel, output) { broadcasts.push({ channel, output }); receive(output); },
                setWindowOpenHandler() {}, on() {},
            };
        }
        isDestroyed() { return false; }
        setMenu() {} on() {} show() {} focus() {}
        async loadFile(file) { assert.equal(file, page); }
    }
    const module = { exports: {} };
    vm.runInNewContext(await fs.readFile(path.join(__dirname, '../Gamemodules/srpg/service.cjs'), 'utf8'), {
        module, __dirname: path.dirname(page), URL, process: { platform: process.platform },
        require(name) {
            if (name === 'electron') return {
                app: { getPath: () => directory }, BrowserWindow: Window,
                ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
            };
            if (name === './session-store.cjs') return { SessionStore: ObservedStore };
            if (name === 'node:path' || name === 'node:url') return require(name);
            throw new Error('Unexpected fixture dependency: ' + name);
        },
    });
    module.exports.initialize();
    function event(url = pathToFileURL(page).href, { subframe = false, destroyed = false } = {}) {
        const mainFrame = { url };
        return { sender: { mainFrame, isDestroyed: () => destroyed },
            senderFrame: subframe ? { url } : mainFrame };
    }
    return { api: module.exports, handlers, calls, broadcasts, event, page, directory,
        onBroadcast(callback) { receive = callback; } };
}

async function rendererFixture(initial, sync) {
    const source = await fs.readFile(path.join(__dirname, '../Gamemodules/srpg/ui.js'), 'utf8');
    const start = source.indexOf('function scheduleSync() {');
    const end = source.indexOf("const stage =", start);
    const update = source.lastIndexOf('\nif (remote) {');
    assert.ok(start >= 0 && end > start && update > end);
    const timers = new Map(), syncs = [];
    let nextTimer = 0, receive;
    const context = {
        MODULE_NAME: 'srpg', META_KEY: 'battle', LOCAL_KEY: 'fixture',
        stContext: { extensionSettings: { srpg: initial.settings }, chatMetadata: { battle: initial.battle } },
        ensureBoundSettings: value => value,
        applyingRemote: false, syncTimer: null, lastReportText: '', statusBadge: { textContent: '' },
        localStorage: { setItem() {} },
        setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout(id) { timers.delete(id); },
        remote: {
            onUpdate(callback) { receive = callback; },
            async sync(payload) { syncs.push(payload); return sync(payload); },
        },
        showToast() {},
        app: { renders: 0, render() { this.renders++; context.scheduleSync(); } },
    };
    vm.runInNewContext(source.slice(start, end) + source.slice(update), context);
    return { context, timers, syncs, receive: output => receive(output),
        async flush() {
            const pending = [...timers.values()]; timers.clear();
            for (const callback of pending) await callback();
        } };
}

test('SRPG main-frame file requests load, mutate and persist a shared board', async t => {
    const f = await serviceFixture(t);
    const url = pathToFileURL(f.page);
    assert.equal(url.origin, 'null');
    const sender = f.event(url.href + '?version=1#board');
    const initial = await f.handlers.get('srpg:query')(sender);
    assert.equal(initial.ok, true);
    const changed = await f.handlers.get('srpg:command')(sender, {
        command: 'Manual', type: 'stat', unit: '以实玛利', key: 'hp', value: 25,
    });
    assert.equal(changed.ok, true);
    const battle = structuredClone(changed.state.battle);
    battle.units.find(unit => unit.name === '以实玛利').hp = 19;
    assert.equal((await f.handlers.get('srpg:sync')(sender, { battle })).ok, true);
    const persisted = await f.handlers.get('srpg:query')(f.event());
    assert.equal(persisted.state.battle.units.find(unit => unit.name === '以实玛利').hp, 19);
    assert.deepEqual(f.calls, ['execute', 'execute', 'sync', 'execute']);
});

test('SRPG rejects other files, remote URLs, subframes and destroyed senders before store access', async t => {
    const f = await serviceFixture(t);
    const invalid = [undefined, {}, f.event('https://example.test/index.html'),
        f.event(pathToFileURL(f.page + '.other').href),
        f.event(pathToFileURL(path.join(path.dirname(f.page), '..', 'index.html')).href),
        f.event('not a URL'), f.event(undefined, { subframe: true }), f.event(undefined, { destroyed: true })];
    for (const channel of ['srpg:query', 'srpg:command', 'srpg:sync']) {
        for (const event of invalid) assert.equal((await f.handlers.get(channel)(event, {})).ok, false, channel);
    }
    assert.equal(f.calls.length, 0);
    await assert.rejects(fs.stat(path.join(f.directory, 'TavernSRPG')), { code: 'ENOENT' });
});

test('partial agent batches update the open board and retire an older queued UI sync', async t => {
    const f = await serviceFixture(t);
    await f.api.openWindow();
    const initial = await f.api.executeTool({ command: 'GetState' });
    const renderer = await rendererFixture(initial.state, payload => f.handlers.get('srpg:sync')(f.event(), payload));
    f.onBroadcast(renderer.receive);
    renderer.context.scheduleSync();
    assert.equal(renderer.timers.size, 1);
    const partial = await f.api.executeTool({
        command1: 'Manual', type1: 'stat', unit1: '以实玛利', key1: 'hp', value1: 25,
        command2: 'InvalidFixtureCommand',
    });
    assert.equal(partial.ok, false);
    assert.equal(partial.partial, true);
    assert.equal(renderer.context.app.renders, 1);
    assert.equal(renderer.context.stContext.chatMetadata.battle.units.find(unit => unit.name === '以实玛利').hp, 25);
    assert.equal(renderer.timers.size, 0, 'the stale pre-update snapshot must not be sent');
    assert.equal(renderer.context.applyingRemote, false);
    await renderer.flush();
    assert.equal(renderer.syncs.length, 0);
    const persisted = await f.api.getStore().load('shared');
    assert.equal(persisted.battle.units.find(unit => unit.name === '以实玛利').hp, 25);
    // The next explicit UI edit starts from the received state, not the old board.
    renderer.context.stContext.chatMetadata.battle.units.find(unit => unit.name === '以实玛利').hp = 23;
    renderer.context.scheduleSync();
    await renderer.flush();
    assert.equal((await f.api.getStore().load('shared')).battle.units.find(unit => unit.name === '以实玛利').hp, 23);
    assert.equal(renderer.context.app.renders, 1, 'own UI broadcasts do not feed back into rendering');
});

test('failed saves broadcast only committed partial state', async t => {
    const store = await makeTempStore(t);
    await store.execute('shared', { command: 'GetState' });
    const save = store.save.bind(store); let writes = 0, broadcast;
    store.save = async (...args) => {
        if (++writes === 2) throw new Error('injected fixture write failure');
        return save(...args);
    };
    store.subscribe((_id, output) => { broadcast = output; });
    const output = await store.execute('shared', {
        command1: 'Manual', type1: 'stat', unit1: '以实玛利', key1: 'hp', value1: 25,
        command2: 'Manual', type2: 'stat', unit2: '以实玛利', key2: 'hp', value2: 1,
    });
    assert.equal(output.ok, false); assert.equal(output.partial, true);
    const persisted = await store.load('shared');
    assert.equal(persisted.battle.units.find(unit => unit.name === '以实玛利').hp, 25);
    assert.deepEqual(output.state, await store.buildSummary(persisted));
    assert.equal(broadcast, output);
});

test('non-authoritative errors and own UI updates preserve pending local edits', async () => {
    const renderer = await rendererFixture({ settings: {}, battle: { hp: 30 } }, async () => ({ ok: true }));
    renderer.context.scheduleSync();
    for (const output of [null, { ok: false, state: {} }, { ok: true }, { partial: true },
        { ok: 'true', state: {} }, { ok: true, source: 'ui', state: { battle: { hp: 1 } } }]) {
        renderer.receive(output);
    }
    assert.equal(renderer.context.app.renders, 0);
    assert.equal(renderer.context.stContext.chatMetadata.battle.hp, 30);
    assert.equal(renderer.timers.size, 1);
});

async function makeTempStore(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcp-srpg-test-'));
    t.after(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });
    return new SessionStore(dir);
}

test('默认初始化《万缕千丝：凯伊线战棋沙盘》并生成开战天刻存档点', async t => {
    const store = await makeTempStore(t);
    const out = await store.execute('shared', { command: 'GetState' });
    assert.equal(out.ok, true);
    assert.equal(out.state.activeProfile, 'profile_fe_kai');
    assert.match(out.state.profileName, /万缕千丝/);
    assert.equal(out.state.battle.mapName, '凯伊线首战 · 战术沙盘');
    assert.ok(out.state.battleText.includes('凯伊'));
    assert.ok(out.state.battleText.includes('以实玛利'));
    assert.equal(out.state.checkpoints.length, 1);
    assert.equal(out.state.checkpoints[0].id, 'cp1');
});

test('支持串行执行：移动+技能、NS2实机Manual改血瞬移与天刻之白沙Rewind回溯', async t => {
    const store = await makeTempStore(t);
    const updates = [];
    store.subscribe((_id, payload) => updates.push(payload));

    const turn1 = await store.execute('shared', {
        command1: 'Skill',
        unit1: '凯伊',
        x1: 5,
        y1: 3,
        skill1: '落星冥焰狱',
        tx1: 7,
        ty1: 3,
        command2: 'Manual',
        type2: 'stat',
        unit2: '以实玛利',
        key2: 'hp',
        value2: 25,
        note2: 'NS2实机受擦伤',
    });
    assert.equal(turn1.ok, true);
    assert.equal(turn1.results.length, 2);
    const ishmael = turn1.state.battle.units.find(u => u.name === '以实玛利');
    assert.equal(ishmael.hp, 25);
    const enemyA = turn1.state.battle.units.find(u => u.x === 6 && u.y === 2);
    assert.ok(enemyA.hp < enemyA.maxHp, '敌方前锋应受到伤害');

    const formatted = formatResult(turn1);
    const text = formatted.content[0].text;
    assert.match(text, /落星冥焰狱/);
    assert.match(text, /NS2实机受擦伤/);

    const rewound = await store.execute('shared', {
        command: 'Rewind',
        checkpointId: 'cp1',
    });
    assert.equal(rewound.ok, true);
    const ishmaelAfter = rewound.state.battle.units.find(u => u.name === '以实玛利');
    assert.equal(ishmaelAfter.hp, 30, '天刻回溯后以实玛利HP应恢复为开战满血30');
    assert.equal(rewound.state.checkpoints.length, 2, '回溯前的进度应自动保存为cp2快照');
    assert.ok(updates.length >= 2);
});

test('前端 UI syncFromUi 与后端 SessionStore 双向同源持久化', async t => {
    const store = await makeTempStore(t);
    const initial = await store.execute('shared', { command: 'GetState' });
    const modifiedBattle = structuredClone(initial.state.battle);
    modifiedBattle.units[0].hp = 19;
    const synced = await store.syncFromUi('shared', {
        settings: initial.state.settings,
        battle: modifiedBattle,
    });
    assert.equal(synced.ok, true);
    assert.equal(synced.source, 'ui');

    const reloaded = await store.execute('shared', { command: 'GetState' });
    assert.equal(reloaded.state.battle.units[0].hp, 19);
});
