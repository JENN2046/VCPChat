'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');
const handlers = new Map();
const windows = [];
test('runtime configuration registers every game IPC once without launching games', async () => {
    const vm = require('node:vm');
    const registered = new Map();
    let constructions = 0;
    const exported = { exports: {} };
    const fakeService = { listRecords: async () => ({ records: ['synthetic'] }) };
    const source = fs.readFileSync(path.join(__dirname, '../modules/ipc/gameHandlers.js'), 'utf8');
    vm.runInNewContext(source, {
        module: exported, URL, __dirname: path.join(__dirname, '../modules/ipc'),
        setTimeout() { throw new Error('startup must not schedule provider-backed games'); },
        require(name) {
            if (name === 'electron') return {
                BrowserWindow: class { constructor() { throw new Error('must not open a window'); } },
                ipcMain: { handle(channel, fn) {
                    assert.equal(registered.has(channel), false, 'duplicate handler');
                    registered.set(channel, fn);
                } },
            };
            if (name === '../game/gameRuntime') return { GameRuntime: class {
                constructor(options) { constructions++; this.gameService = options.gameService; }
            } };
            if (name === '../game/vtrade/client') return { VTradeClient: class {
                duel() { throw new Error('startup must not read credentials or contact VTrade'); }
            } };
            if (name === '../game/vtrade/window') return {};
            if (name === '../game/vtrade/orchestrator') return { VTradeOrchestrator: class {
                start() { throw new Error('startup must not start VTrade'); }
                resumeIfWaiting() { throw new Error('startup must not resume VTrade'); }
            } };
            if (name === 'path' || name === 'url') return require(name);
            throw new Error(`Unexpected runtime load: ${name}`);
        },
    });
    const runtimeApi = exported.exports;
    const options = { gameService: fakeService, groupChat: {}, loadAgent() {}, listAgents: async () => [] };
    const first = runtimeApi.configureRuntime(options);
    assert.equal(runtimeApi.configureRuntime(options), first);
    assert.equal(constructions, 1);
    const channels = ['launch', 'resources', 'remove-resources', 'records', 'record',
        'agents', 'create', 'next', 'observe', 'submit', 'continue', 'stop'];
    assert.deepEqual([...registered.keys()].sort(), channels.map(name => `vcp-game:${name}`).sort());
    const records = registered.get('vcp-game:records');
    assert.deepEqual((await records(sender())).records, ['synthetic']);
    for (const channel of channels) {
        assert.equal((await registered.get(`vcp-game:${channel}`)(sender('main.html'), {})).success, false);
    }
});
let bladeOpened = 0;
class Window extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.webContents = new EventEmitter();
        this.webContents.setWindowOpenHandler = () => {};
        windows.push(this);
    }
    isDestroyed() { return Boolean(this.destroyed); }
    isMinimized() { return false; }
    setMenu() {}
    show() {}
    focus() {}
    async loadFile(file) { this.file = file; }
    destroy() { this.destroyed = true; this.emit('closed'); }
}
const original = Module._load;
let api;
try {
    Module._load = function(request, parent, isMain) {
        if (request === 'electron') return {
            BrowserWindow: Window,
            ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
        };
        if (request.endsWith('/BladeGame/blade-service')) return {
            initialize() {},
            createOrFocusWindow() {
                bladeOpened++;
                return { webContents: { isLoading: () => false } };
            },
            processToolCall() { throw new Error('启动器不得调用开局工具'); },
        };
        return original.call(this, request, parent, isMain);
    };
    api = require('../modules/ipc/gameHandlers');
} finally { Module._load = original; }
const root = path.resolve(__dirname, '..');
function sender(file = 'Gamemodules/game.html') {
    const mainFrame = { url: pathToFileURL(path.join(root, file)).href + '?vcpEmbedded=1' };
    return { sender: { mainFrame, isDestroyed: () => false }, senderFrame: mainFrame };
}
api.initialize();
const launch = handlers.get('vcp-game:launch');
test('只有本地大厅主框架可以启动游戏', async () => {
    assert.equal(api.isHallSender(sender()), true);
    assert.equal(api.isHallSender(sender('main.html')), false);
    const child = sender();
    child.senderFrame = { ...child.senderFrame };
    assert.equal(api.isHallSender(child), false);
    assert.equal((await launch(sender('main.html'), 'neon')).success, false);
    assert.equal((await launch(sender(), '../../main')).success, false);
});
test('霓虹窗口复用、关闭后重建，且不暴露preload与Node', async () => {
    assert.equal((await launch(sender(), 'neon')).success, true);
    assert.equal((await launch(sender(), 'neon')).success, true);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
    assert.equal(windows[0].options.webPreferences.sandbox, true);
    assert.equal(windows[0].options.webPreferences.preload, undefined);
    assert.equal(windows[0].file, path.join(root, 'Gamemodules/vcp-neon-game/index.html'));
    windows[0].destroy();
    await launch(sender(), 'neon');
    assert.equal(windows.length, 2);
});
test('华山论剑只打开窗口，不调用StartGame或写存档', async () => {
    Module._load = function(request, parent, isMain) {
        if (request.endsWith('/BladeGame/blade-service')) return {
            initialize() {},
            createOrFocusWindow() { bladeOpened++; return { webContents: { isLoading: () => false } }; },
            processToolCall() { throw new Error('不应调用工具'); },
        };
        return original.call(this, request, parent, isMain);
    };
    try {
        assert.equal((await launch(sender(), 'blade')).success, true);
        assert.equal(bladeOpened, 1);
    } finally { Module._load = original; }
});
test('大厅注册完整且霓虹模块资源真实存在', () => {
    const allowlist = require('../modules/shared/embeddedAppAllowlist');
    assert.equal(allowlist.get('open-game-window').page, 'Gamemodules/game.html');
    const registry = require('../preloads/core/registry').describeApis();
    assert.deepEqual(registry.find(item => item.name === 'launchGame').roles, ['utility']);
    const html = fs.readFileSync(path.join(root, 'Gamemodules/vcp-neon-game/index.html'), 'utf8');
    assert.ok(html.includes('src="./js/main.js"'));
    for (const file of ['audio', 'config', 'entities', 'game', 'main', 'utils', 'weapons']) {
        assert.ok(fs.existsSync(path.join(root, `Gamemodules/vcp-neon-game/js/${file}.js`)));
    }
});
test('ForgeTax大厅委托专用服务，资源与桥接文件齐全', async () => {
    let opened = 0;
    const before = windows.length;
    Module._load = function(request, parent, isMain) {
        if (request.endsWith('/forge-tax/service.cjs')) {
            return { async openWindow() { opened++; } };
        }
        return original.call(this, request, parent, isMain);
    };
    try {
        assert.equal((await launch(sender(), 'forgeTax')).success, true);
        assert.equal((await launch(sender(), 'forgeTax')).success, true);
        assert.equal(opened, 2);
        assert.equal(windows.length, before);
    } finally { Module._load = original; }
    for (const name of ['index.html', 'engine.js', 'ui.js', 'style.css', 'audio.js', 'service.cjs', 'preload.cjs']) {
        assert.ok(fs.existsSync(path.join(root, 'Gamemodules/forge-tax', name)));
    }
});
test('斗地主窗口复用且资源完整，牌桌IPC拒绝大厅与其他窗口', async () => {
    const before = windows.length;
    assert.equal((await launch(sender(), 'doudizhu')).success, true);
    assert.equal((await launch(sender(), 'doudizhu')).success, true);
    assert.equal(windows.length, before + 1);
    const win = windows.at(-1);
    assert.equal(win.options.webPreferences.nodeIntegration, false);
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.preload, path.join(root, 'preloads/utility.js'));
    assert.equal(win.file, path.join(root, 'Gamemodules/doudizhu/index.html'));
    for (const file of ['index.html', 'style.css', 'ui.js']) {
        assert.ok(fs.existsSync(path.join(root, 'Gamemodules/doudizhu', file)));
    }
    for (const channel of ['agents', 'create', 'observe', 'submit', 'continue', 'stop']) {
        const handler = handlers.get(`vcp-game:${channel}`);
        assert.equal(typeof handler, 'function');
        assert.equal((await handler(sender(), {})).success, false);
        assert.equal((await handler(sender('Gamemodules/doudizhu/index.html'), {})).success, false);
    }
});
test('历史IPC仅接受大厅主框架，不接受主聊天、牌桌或子框架', async () => {
    for (const channel of ['vcp-game:records', 'vcp-game:record']) {
        const handler = handlers.get(channel);
        assert.equal(typeof handler, 'function');
        for (const file of ['main.html', 'Gamemodules/doudizhu/index.html']) {
            assert.equal((await handler(sender(file), {})).success, false);
        }
        const child = sender();
        child.senderFrame = { ...child.senderFrame };
        assert.equal((await handler(child, {})).success, false);
        assert.match((await handler(sender(), {})).error, /尚未就绪/);
    }
});
