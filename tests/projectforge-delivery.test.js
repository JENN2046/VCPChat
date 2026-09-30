'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { installProjectForgeCloseGuard } = require('../modules/ipc/projectForgeCloseGuard');
const { minimatch } = require('minimatch');
const build = require('../package.json').build;

test('ProjectForge package includes only required runtime source and verified sidecars', () => {
    const files = new Set(build.files);
    for (const pattern of [
        'VCPDistributedServer/Plugin/ProjectForge/*.js',
        'VCPDistributedServer/Plugin/ProjectForge/plugin-manifest.json',
        'VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe',
        'VCPDistributedServer/shared/fileKit/*.js',
        'ProjectForgemodules/**/*',
    ]) assert.ok(files.has(pattern), pattern);
    assert.ok(build.asarUnpack.includes('VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe'));
    assert.ok(!files.has('VCPDistributedServer/Plugin/ProjectForge/**/*'), 'do not package config.env');
    const packaged = relative => [...files].some(pattern => !pattern.startsWith('!') && minimatch(relative, pattern));
    for (const relative of [
        'VCPDistributedServer/Plugin/ProjectForge/ProjectForgeService.js',
        'VCPDistributedServer/shared/fileKit/paths.js',
        'VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe',
        'ProjectForgemodules/projectforge.html',
    ]) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', relative)), relative);
        assert.ok(packaged(relative), `not packaged: ${relative}`);
    }
    assert.equal(packaged('VCPDistributedServer/Plugin/ProjectForge/config.env'), false);
});

test('ProjectForge unload guard stays by default and allows explicit discard', () => {
    for (const choice of [0, 1, -1]) {
        const webContents = new EventEmitter();
        const win = { webContents };
        const dialog = { showMessageBoxSync: () => choice };
        let allowed = false;
        installProjectForgeCloseGuard(win, dialog);
        webContents.emit('will-prevent-unload', { preventDefault: () => { allowed = true; } });
        assert.equal(allowed, choice === 1);
    }
});

test('source editor registers a native beforeunload guard for dirty buffers', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'ProjectForgemodules/projectforge-source.js'), 'utf8');
    assert.match(source, /window\.addEventListener\('beforeunload', event => \{/);
    assert.match(source, /if \(!isDirty\(\)\) return;/);
});


test('workspace refresh preserves dirty buffers unless discard is confirmed', async () => {
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(__dirname, '..', 'ProjectForgemodules/projectforge-source.js'), 'utf8');
    const fn = source.slice(source.indexOf('    async function loadWorkspaces()'), source.indexOf('    async function loadFiles()'));
    for (const allow of [false, true]) for (const workspaces of [[], [{ id: 'new' }]]) {
        const src = { workspaceId: 'old', workspaces: [{ id: 'old' }], file: { content: 'unsaved' } };
        let confirmations = 0;
        const context = {
            src, WS_KEY: 'test', api: { gitListWorkspaces: async () => ({ workspaces }) },
            srcCall: value => value, setLoading() {}, isDirty: () => true,
            confirmDiscard: async () => { confirmations++; return allow; },
            localStorage: { getItem: () => null, setItem() {} }, loadExpanded: () => [],
            closeFile: () => { src.file = null; }, renderWorkspaceSelect() {}, loadFiles: async () => {},
            $: () => ({}), escapeHtml: value => value,
        };
        await vm.runInNewContext(`${fn}\nloadWorkspaces()`, context);
        assert.equal(confirmations, 1);
        assert.equal(src.workspaceId, allow ? (workspaces[0]?.id || null) : 'old');
        assert.equal(src.file?.content, allow ? undefined : 'unsaved');
        if (!allow) assert.deepEqual(src.workspaces, [{ id: 'old' }]);
    }
});

test('main voice configures every newly started process before creating a session', async () => {
    const vm = require('node:vm');
    const context = { module: { exports: {} }, require: name => {
        assert.equal(name, 'electron');
        return { ipcMain: {} };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'modules/ipc/mainChatVoiceCoordinator.js'), 'utf8'), context);
    const { MainChatVoiceCoordinator } = context.module.exports;
    let generation = 0;
    const configured = [];
    const stop = new Error('stop synthetic session after configuration');
    const engine = { start: async () => { generation++; }, configureHotkey: async value => configured.push({ generation, ...value }) };
    const coordinator = new MainChatVoiceCoordinator({
        getMainWindow: () => ({ isDestroyed: () => false, webContents: { isDestroyed: () => false } }),
        ensureVoiceCaptureWindowReady: async () => {}, getVoiceInputEngine: () => engine,
        getConfiguredShortcut: () => 'F7',
    });
    // Fail immediately after configuration: no real windows, timers or native process.
    const options = { get idleTimeoutMs() { throw stop; } };
    for (let i = 0; i < 2; i++) await assert.rejects(coordinator.startSession(options), error => error === stop);
    assert.deepEqual(configured.map(value => value.generation), [1, 2]);
    assert.ok(configured.every(value => value.shortcut === 'F7'));
});

test('Flowlock ignores payload marker literals but honors real nesting', () => {
    const vm = require('node:vm');
    const context = { window: {}, console: { log() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Flowlockmodules/flowlock-protocol.js'), 'utf8'), context);
    const scan = context.window.flowlockProtocol.createSafeScanText;
    const start = '[[VCP调用结果信息汇总:', end = 'VCP调用结果结束]]';
    for (const newline of ['\n', '\r\n']) {
        const body = `${start}\nconst start = '${start}';\n[[Flowlock::Stop]]\n${end}\n[[Flowlock::Complete]]`.replaceAll('\n', newline);
        const masked = scan(body);
        assert.ok(!masked.includes('[[Flowlock::Stop]]'));
        assert.ok(masked.includes('[[Flowlock::Complete]]'));
    }
    assert.ok(!scan(`${start}\n${start}\n${end}\n[[Flowlock::Complete]]`).includes('[[Flowlock::Complete]]'));
});

test('desktop tracker resumes after payload-only markers across every split', async () => {
    const { createDesktopPushConsumer } = await import('../modules/renderer/desktopPushConsumer.js');
    const start = '[[VCP调用结果信息汇总:', end = 'VCP调用结果结束]]';
    for (const newline of ['\n', '\r\n']) {
        const data = `${start}\nconst start = '${start}';\n<<<[DESKTOP_PUSH]>>><div>untrusted</div><<<[DESKTOP_PUSH_END]>>>\n${end}\n`.replaceAll('\n', newline);
        const text = data + '<<<[DESKTOP_PUSH]>>><div>trusted</div><<<[DESKTOP_PUSH_END]>>>';
        for (let split = 0; split <= text.length; split++) {
            const pushed = [];
            const consumer = createDesktopPushConsumer({ electronAPI: { desktopPush: value => pushed.push(value) }, logger: {} });
            try {
                const output = consumer.processToken('m', text.slice(0, split)) + consumer.processToken('m', text.slice(split));
                assert.equal(output, data, `split ${split}`);
                assert.ok(pushed.some(value => value.content === '<div>trusted</div>'));
                assert.ok(!pushed.some(value => value.content?.includes('untrusted')));
            } finally { consumer.dispose(); }
        }
    }
});

test('all supported ProjectForge runtime targets are packaged and unpacked', () => {
    const { resolveRuntimeTarget, SUPPORTED_PLATFORMS, SUPPORTED_ARCHITECTURES } = require('../rust_projectforge_indexer/build-runtime.js');
    let count = 0;
    for (const platform of SUPPORTED_PLATFORMS) for (const arch of SUPPORTED_ARCHITECTURES) {
        const target = resolveRuntimeTarget(platform, arch);
        const relative = `VCPDistributedServer/Plugin/ProjectForge/bin/${target.runtimeDirectoryName}/${target.executableName}`;
        assert.ok(build.files.includes(relative), relative);
        assert.ok(build.asarUnpack.includes(relative), relative);
        count++;
    }
    assert.equal(count, 6);
    const packaged = relative => build.files.some(pattern => !pattern.startsWith('!') && minimatch(relative, pattern));
    for (const relative of ['config.env', 'bin/linux-x64/scratch', 'bin/linux-ia32/projectforge_indexer', 'bin/linux-x64/projectforge_indexer.tmp']) {
        assert.equal(packaged(`VCPDistributedServer/Plugin/ProjectForge/${relative}`), false, relative);
    }
});

test('delete-project rejects unrelated windows and frames before runtime/config access', async () => {
    const vm = require('node:vm');
    const { pathToFileURL } = require('node:url');
    const handlers = new Map();
    const counts = { config: 0, runtime: 0, deleted: 0 };
    const service = { events: new EventEmitter(), ensureRuntime() { counts.runtime++; }, gui: {
        deleteProject(id, signature) { counts.deleted++; return { id, signature }; },
    } };
    const handlerDirectory = path.resolve(__dirname, '../modules/ipc');
    const context = { module: { exports: {} }, __dirname: handlerDirectory, URL, process: { platform: process.platform }, console,
        require(name) {
            if (name === 'electron') return { ipcMain: { handle: (key, fn) => handlers.set(key, fn), removeHandler: key => handlers.delete(key) }, webContents: {} };
            if (name === 'path') return path;
            if (name === 'url') return require('node:url');
            if (name === 'fs') return { existsSync() { counts.config++; return false; }, readFileSync() { throw new Error('real config reads forbidden'); } };
            if (name === path.resolve(handlerDirectory, '../../VCPDistributedServer/Plugin/ProjectForge/ProjectForgeService.js')) return service;
            throw new Error(`unexpected require: ${name}`);
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(handlerDirectory, 'projectForgeHandlers.js'), 'utf8'), context);
    context.module.exports.initialize();
    const remove = handlers.get('project-forge:delete-project');
    const trusted = pathToFileURL(path.resolve(__dirname, '../ProjectForgemodules/projectforge.html')).href;
    const other = pathToFileURL(path.resolve(__dirname, '../Notepadmodules/notepad.html')).href;
    const event = (windowUrl, frameUrl) => ({ sender: { getURL: () => windowUrl }, senderFrame: { url: frameUrl } });
    for (const value of [undefined, {}, event(other, other), event(trusted, other), event(other, trusted),
        event('https://example.test/projectforge.html', trusted), event(`${trusted}.evil`, trusted),
        event('file:///other-app/ProjectForgemodules/projectforge.html', trusted), event('not a URL', trusted),
        event(trusted, ''), { sender: { getURL() { throw new Error('destroyed'); } } }]) {
        assert.equal((await remove(value, 'synthetic-project', 'test')).success, false);
        assert.deepEqual(counts, { config: 0, runtime: 0, deleted: 0 });
    }
    for (const value of [event(trusted, trusted), { sender: { getURL: () => trusted } }]) {
        const result = await remove(value, 'synthetic-project', 'test');
        assert.equal(result.success, true);
        assert.equal(result.data.id, 'synthetic-project');
        assert.equal(result.data.signature, 'test');
    }
    assert.deepEqual(counts, { config: 2, runtime: 2, deleted: 2 });
});
