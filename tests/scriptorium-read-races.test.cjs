'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
function functions(file, names) {
    const source = fs.readFileSync(path.join(__dirname, '../ScriptoriumModules', file), 'utf8');
    const found = new Map();
    (function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration' && names.includes(node.id.name)) found.set(node.id.name, source.slice(node.start, node.end));
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
        }
    })(parse(source));
    assert.equal(found.size, names.length, `load actual ${file} functions`);
    return [...found.values()].join('\n');
}
const modes = {
    web: ['scriptorium-web-page.js', 'page', '.html'],
    board: ['scriptorium-board.js', 'file', '.excalidraw'],
    table: ['scriptorium-table-view.js', 'T', '.csv'],
    image: ['scriptorium-image-view.js', 'image', '.png'],
    pdf: ['scriptorium-pdf-view.js', 'S', '.pdf'],
};
function fixture(kind, { delayedFrames = false, delayedBuild = false } = {}) {
    const [module, key, ext] = modes[kind];
    const reads = [], toasts = [], preview = [], frames = deferred(), building = deferred();
    let navigation = 0, value = 'A', cleared = 0, metadataRevision = 0;
    const model = (name, text, mtime = 1) => ({ filePath: `/${name}${ext}`, name, mtime, size: 10, value: text,
        saved: text, savedMeta: 0, stateId: text, savedId: text, dirty: false, saving: false, revision: 0, history: [], future: [],
        objects: [], pages: [], sheets: [{ rows: [[text]], name: 'sheet' }], changes: new Map() });
    const initial = model('a', 'A');
    const cm = { getValue: () => value, setValue: text => { value = text; cleared++; }, changeGeneration: () => 0, isClean: () => true };
    const read = file => { const gate = deferred(); reads.push({ file, ...gate }); return gate.promise; };
    const response = (name, text, mtime = 30) => ({ success: true, ...model(name, text, mtime), text: kind === 'board' ? JSON.stringify({ value: text }) : text,
        url: `preview-${name}`, encoding: 'utf8', eol: 'lf', bom: false, siblings: [] });
    const c = { document: { activeElement: { blur() {} } }, finishEditing() {}, [key]: initial, scene: { value: 'A' }, editor: kind === 'table' ? { value: '', hidden: true } : cm,
        opening: 0, reloadSequence: 0, contentRevision: 0, loading: false, dirty: kind === 'board' ? false : () => false,
        UI: { sync() {}, toast: (...args) => toasts.push(args), navigationStamp: () => navigation },
        conflict: { hidden: true }, sheetIndex: 0, header: true, sort: {}, scroller: { scrollTop: 0 }, zoom: 1,
        read, readFile: read, info: read, api: () => ({ page: (_command, payload) => read(payload.file) }),
        setSource: text => { value = text; cleared++; }, darkPage: () => false,
        loadFrame: () => preview.push(c.page.url), show: result => { c[key] = model('current', result.value, result.mtime); c[key].filePath = result.filePath; value = result.value; cleared++; },
        lineage: { load() { metadataRevision = 0; }, revision: () => metadataRevision }, htmlLayer: { clear() {} },
        parse: JSON.parse, stamp: () => c.scene.value, remember: () => c.scene.value,
        settle: () => { c.dirty = c.scene.value !== c.file.saved; }, finishEdit() {},
        applyToScene: data => { c.scene.value = data.value; value = data.value; cleared++; return data.value; },
        nextFrames: () => delayedFrames ? frames.promise : Promise.resolve(),
        build: async result => delayedBuild ? building.promise : model('new', result.value, result.mtime),
        destroy() {}, enter() {}, passwordProblem: () => '',
    };
    vm.createContext(c); vm.runInContext(functions(module, ['reload']), c);
    const current = () => c[key];
    const text = () => kind === 'board' ? c.scene.value : kind === 'pdf' ? c.S.value : value;
    const edit = text => { value = text; c.contentRevision++; current().revision++; current().value = text; current().stateId = text; current().dirty = true; if (kind === 'board') { c.scene.value = text; c.dirty = true; } };
    const swap = () => { c[key] = model('b', 'B', 77); value = 'B'; if (kind === 'board') { c.scene = { value: 'B' }; c.dirty = false; } };
    return { c, key, initial, current, reads, response, frames, building, text, edit, swap, preview, toasts, clearCount: () => cleared, navigate: () => navigation++, editMetadata: () => { metadataRevision++; c.contentRevision++; } };
}
for (const kind of Object.keys(modes)) {
    test(`${kind}: a late reload cannot change another file's content or metadata`, async () => {
        const f = fixture(kind), pending = f.c.reload(), read = f.reads.shift(); f.swap(); const target = f.current();
        read.resolve(f.response('a', 'STALE-A')); await pending;
        assert.equal(f.current(), target); assert.equal(f.current().mtime, 77); assert.equal(f.text(), 'B');
    });
    test(`${kind}: navigation invalidates reads before the next file finishes opening`, async () => {
        const f = fixture(kind), pending = f.c.reload(), read = f.reads.shift(); f.navigate();
        read.resolve(f.response('a', 'OBSOLETE')); await pending; assert.equal(f.text(), 'A'); assert.equal(f.current().mtime, 1);
    });
    if (kind !== 'image') test(`${kind}: edits made during a reload survive with their dirty marker`, async () => {
        const f = fixture(kind), pending = f.c.reload(), read = f.reads.shift(); f.edit('LOCAL-EDIT'); const cleared = f.clearCount();
        read.resolve(f.response('a', 'OLD-DISK')); await pending;
        assert.equal(f.text(), 'LOCAL-EDIT'); assert.equal(f.current().mtime, 1); assert.equal(f.clearCount(), cleared);
        if (kind === 'board') assert.equal(f.c.dirty, true); else assert.notEqual(f.current().dirty, false);
    });
}
test('table: uncommitted cell input also invalidates a reload before model revision advances', async () => {
    const f = fixture('table'), pending = f.c.reload(), read = f.reads.shift();
    f.c.contentRevision++; f.c.editor.value = 'DRAFT'; f.c.editing = { row: 0, col: 0, value: 'A' };
    read.resolve(f.response('a', 'OLD-DISK')); await pending;
    assert.equal(f.c.editor.value, 'DRAFT'); assert.equal(f.current(), f.initial); assert.equal(f.clearCount(), 0);
});
test('board: edits made after scene application but before the render frames stay dirty', async () => {
    const f = fixture('board', { delayedFrames: true }), pending = f.c.reload(), read = f.reads.shift();
    read.resolve(f.response('a', 'DISK')); await turn(); assert.equal(f.text(), 'DISK');
    f.edit('AFTER-APPLY'); f.frames.resolve(); await pending;
    assert.equal(f.text(), 'AFTER-APPLY'); assert.equal(f.current().saved, 'DISK'); assert.equal(f.c.dirty, true);
});
test('board: lineage edits during a reload preserve the current scene and disk baseline', async () => {
    const f = fixture('board'), pending = f.c.reload(), read = f.reads.shift();
    f.editMetadata();
    read.resolve(f.response('a', 'OLD-DISK')); await pending;
    assert.equal(f.text(), 'A'); assert.equal(f.current().mtime, 1);
    assert.equal(f.c.lineage.revision(), 1);
});
test('board: lineage edits after scene application remain dirty relative to the loaded baseline', async () => {
    const f = fixture('board', { delayedFrames: true }), pending = f.c.reload(), read = f.reads.shift();
    read.resolve(f.response('a', 'DISK')); await turn();
    f.editMetadata(); f.frames.resolve(); await pending;
    assert.equal(f.current().savedMeta, 0); assert.equal(f.c.lineage.revision(), 1);
    assert.equal(f.c.dirty, true);
});

function lineageFixture() {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<main></main>');
    dom.window.confirm = () => true;
    const entered = deferred(), release = deferred(), saves = [], errors = [];
    let scene = { value: 'A' };
    const c = { window: dom.window, document: dom.window.document,
        localStorage: { getItem: () => null, setItem() {} }, crypto: require('node:crypto').webcrypto };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-board-lineage.js'), 'utf8'), c);
    const lineage = dom.window.ScriptoriumBoardLineage.create({parent: dom.window.document.querySelector('main'),
        snapshot: () => ({ ...scene }), revision: () => scene.value, changed() {}, apply() {},
        restore: async data => { scene = { ...data }; entered.resolve(); await release.promise; },
        save: async () => { saves.push({ ...scene }); return true; }, error: error => errors.push(error.message)});
    return { dom, lineage, entered, release, saves, errors,
        setScene: value => { scene = { value }; }, scene: () => scene,
        clickRestore: () => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === '回溯').click() };
}

test('board: checkpoint restoration cannot append history or save a replacement board', async t => {
    const f = lineageFixture(); t.after(() => f.dom.window.close());
    f.lineage.load({records: [{id: 'a', name: 'A checkpoint', status: 'applied', snapshot: {value: 'A-saved'}}]});
    f.clickRestore(); await f.entered.promise;
    f.setScene('B-unsaved');
    f.lineage.load({records: [{id: 'b', name: 'B checkpoint', status: 'applied', snapshot: {value: 'B-saved'}}]});
    f.release.resolve(); await turn();
    assert.equal(f.scene().value, 'B-unsaved'); assert.equal(f.saves.length, 0);
    assert.deepEqual(Array.from(f.lineage.history().records, record => record.id), ['b']);
    assert.deepEqual(f.errors, []);
});

test('board: checkpoint restoration on the same board still records and saves', async t => {
    const f = lineageFixture(); t.after(() => f.dom.window.close());
    f.lineage.load({records: [{id: 'a', name: 'A checkpoint', status: 'applied', snapshot: {value: 'A-saved'}}]});
    f.clickRestore(); await f.entered.promise; f.release.resolve(); await turn();
    assert.equal(f.scene().value, 'A-saved'); assert.equal(f.saves.length, 1);
    assert.equal(f.lineage.history().records.length, 3); assert.deepEqual(f.errors, []);
});
test('pdf: edits made while the replacement PDF is being built are not overwritten', async () => {
    const f = fixture('pdf', { delayedBuild: true }), pending = f.c.reload({ discard: true }), read = f.reads.shift();
    read.resolve(f.response('a', 'DISK')); await turn(); f.edit('EDIT-DURING-BUILD');
    f.building.resolve({ ...f.initial, value: 'DISK', stateId: 'DISK', savedId: 'DISK' }); await pending;
    assert.equal(f.current(), f.initial); assert.equal(f.text(), 'EDIT-DURING-BUILD');
});

function sessionFixture({ delayedUnpack = false, delayedFonts = false } = {}) {
    let generation = 1, revision = 0, document = { manifest: { id: 'original' }, source: 'ORIGINAL' }, navigation = 0;
    const reads = [], unpack = deferred(), fonts = deferred();
    const status = () => ({ ready: true, dirty: revision !== 0, documentId: document.manifest.id, generation, revision, saving: false });
    const documentPort = { status, captureContext: () => ({ generation, documentId: document.manifest.id, revision }),
        isContextCurrent: (context, checks = {}) => context.generation === generation && context.documentId === document.manifest.id && (!checks.revision || context.revision === revision),
        replaceDocument: next => { document = next; generation++; revision = 0; }, setActivity() {}, markDirty: () => revision++ };
    const context = { documentPort, persistencePort: { readPath: file => { const gate = deferred(); reads.push({ file, ...gate }); return gate.promise; } },
        containerModule: { unpack: async () => delayedUnpack ? unpack.promise : { document: { manifest: { id: 'disk' }, source: 'DISK' } } },
        core: { normalizeDocument: doc => doc, createDocument: options => ({ manifest: { id: 'new' }, source: options?.source || '' }), PROJECT_KINDS: { FLOW_DOCUMENT: 'flow', SLIDE_DECK: 'deck' } },
        historyPort: { reset() {}, capture() {}, finalize() {} }, renderPort: { invalidate() {}, renderEdit() {} },
        surfacePort: { switchMode: async () => true }, resolveAdapter: () => ({ replaceCurrentSource: text => { document.source = text; revision++; return true; }, replaceCurrentCss: () => { revision++; return true; } }), activateAdapter() {}, notificationPort: { show() {} },
        navigationStamp: () => navigation, invalidateNavigation: () => ++navigation };
    if (delayedFonts) context.networkFontPort = { cancel() {}, processDocument: async adapter => { await fonts.promise; adapter.replaceCurrentSource('LOCALIZED', { dirty: false }); return { changed: true }; } };
    const c = { document: { body: { classList: { remove() {} } } }, console };
    vm.createContext(c); vm.runInContext(functions('scriptorium-session.js', ['createSessionController']), c);
    const session = c.createSessionController(context);
    return { session, reads, unpack, fonts, current: () => document, edit: () => { document.source = 'LOCAL'; revision++; }, swap: () => { document = { manifest: { id: 'other' }, source: 'OTHER' }; generation++; }, navigate: () => navigation++, editMetadata: () => { metadataRevision++; c.contentRevision++; } };
}
test('Markdown/document session: a late file read cannot replace a new document or overlay intent', async () => {
    for (const action of ['swap', 'navigate']) {
        const f = sessionFixture(), pending = f.session.openPath('/a.md'); f[action]();
        f.reads.shift().resolve({ success: true, bytes: [] }); await pending;
        assert.equal(f.current().source, action === 'swap' ? 'OTHER' : 'ORIGINAL');
    }
});
test('Markdown/document session: unpacking cannot discard edits made after the read', async () => {
    const f = sessionFixture({ delayedUnpack: true }), pending = f.session.openResult({ success: true, bytes: [] });
    f.edit(); f.unpack.resolve({ document: { manifest: { id: 'disk' }, source: 'DISK' } }); await pending;
    assert.equal(f.current().source, 'LOCAL');
});


for (const kind of Object.keys(modes)) test(`${kind}: an unchanged current reload still applies normally`, async () => {
    const f = fixture(kind), pending = f.c.reload(); f.reads.shift().resolve(f.response('a', 'CURRENT-DISK', 90));
    assert.equal(await pending, true); assert.equal(f.text(), 'CURRENT-DISK'); assert.equal(f.current().mtime, 90);
    if (kind === 'board') { assert.equal(f.current().saved, 'CURRENT-DISK'); assert.equal(f.c.dirty, false); }
});
test('Markdown/document session: a current unchanged open still activates the document', async () => {
    const f = sessionFixture(), pending = f.session.openPath('/current.md'); f.reads.shift().resolve({ success: true, bytes: [] });
    assert.equal(await pending, true); assert.equal(f.current().source, 'DISK');
});
test('board: canceled mount callbacks cannot replace a newer canvas or leave its promise pending', async () => {
    let active = 1; const options = []; let disposed = 0;
    const c = { scene: null, unmount: null, cancelMount: null, htmlLayer: { clear() {} }, host: {},
        X: { restore: value => value, mount: (_host, value) => { options.push(value); return () => { disposed++; }; } },
        loadLibrary: async () => [], themeOf: () => 'light', changed() {}, libraryChanged() {}, openLink() {}, setTimeout };
    vm.createContext(c); vm.runInContext(functions('scriptorium-board.js', ['mount', 'unmountCanvas']), c);
    const data = { elements: [], appState: {}, files: {} };
    const old = c.mount(data, () => active === 1); await turn(); active = 2; c.unmountCanvas();
    assert.equal(await old, false); assert.equal(disposed, 1);
    const next = c.mount(data, () => active === 2); await turn();
    const current = { getAppState: () => ({ isLoading: false }) }; options[1].excalidrawAPI(current); assert.equal(await next, true);
    options[0].excalidrawAPI({ getAppState: () => ({ isLoading: false }) }); assert.equal(c.scene, current);
    c.unmountCanvas(); assert.equal(disposed, 2);
});


for (const action of ['current', 'edit', 'swap']) test(`import activation: delayed font application respects ${action} ownership`, async () => {
    const f = sessionFixture({ delayedFonts: true });
    const pending = f.session.openResult({ success: true, kind: 'imported', name: 'source.html', source: 'IMPORT' });
    await turn(); assert.equal(f.current().source, 'IMPORT');
    if (action !== 'current') f[action]();
    f.fonts.resolve(); const opened = await pending;
    assert.equal(opened, action === 'current');
    assert.equal(f.current().source, { current: 'LOCALIZED', edit: 'LOCAL', swap: 'OTHER' }[action]);
});
test('leaving a file view after saving refuses to discard edits made while that save was pending', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-file-views.js'), 'utf8');
    let expression;
    (function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === 'UI' && node.left.property.name === 'settle') expression = source.slice(node.right.start, node.right.end);
        for (const child of Object.values(node)) { if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child); }
    })(parse(source));
    assert.ok(expression);
    const gate = deferred(); let revision = 0, dirty = true;
    const top = { flush() {}, doc: () => ({ filePath: '/a', name: 'a', generation: 1, revision, dirty }), save: () => gate.promise };
    const c = { UI: { overlay: () => top }, pathKey: path => path, askUnsaved: async () => 'save' };
    vm.createContext(c); vm.runInContext('settle = '+expression, c);
    const pending = c.settle('/b'); await turn(); revision++; dirty = true; gate.resolve(true);
    assert.equal(await pending, false);
});


test('board: a late render-frame completion cannot change a replacement board baseline', async () => {
    const f = fixture('board', { delayedFrames: true }), pending = f.c.reload(), read = f.reads.shift();
    read.resolve(f.response('a', 'DISK')); await turn(); f.swap(); const target = f.current();
    f.frames.resolve(); await pending;
    assert.equal(f.current(), target); assert.equal(f.text(), 'B'); assert.equal(target.saved, 'B'); assert.equal(f.c.dirty, false);
});

function markdownSaveFixture() {
    const response = deferred(), changes = [], render = [], activities = [];
    const c = { console, Map, Object, Date, Set };
    c.window = c; vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-document-store.js'), 'utf8'), c);
    const store = c.ScriptoriumDocumentStore.createDocumentStore({ core: { normalizeDocument: model => model, extensionForKind: () => '.vdocx', PROJECT_KINDS: {} } });
    store.replaceDocument({ manifest: { id: 'note', title: 'note', scene: { kind: 'flow' }, markdownFile: { dir: '/a', root: '/a', diskFingerprint: '1'.repeat(64), encoding: 'utf-8' } }, source: 'INITIAL' }, { filePath: '/a/note.md', name: 'note.md' });
    store.mutate(model => { model.source = 'SUBMITTED'; });
    Object.assign(c, { documentPort: store, context: { historyPort: { finalize() {} }, renderPort: { invalidate: reason => render.push(reason) }, surfacePort: { mode: () => 'read', switchMode: async (...args) => activities.push(args) } },
        containerModule: { pack: async () => [] }, persistencePort: { save: async payload => { changes.push(payload); return response.promise; } }, notificationPort: { show() {} }, adapter: () => ({}), renderRecent() {} });
    vm.runInContext(functions('scriptorium-session.js', ['save']), c);
    return { c, store, response, changes, render, activities };
}
test('Markdown Save As installs destination metadata without losing edits made while saving', async () => {
    const f = markdownSaveFixture(), operation = f.c.save(true); await turn();
    f.store.mutate(model => { model.source = 'LATER-EDIT'; });
    f.response.resolve({ success: true, filePath: '/b/note.md', name: 'note.md', markdownFile: { dir: '/b', root: '/b', diskFingerprint: '2'.repeat(64) } });
    assert.equal(await operation, true); assert.equal(f.store.document().source, 'LATER-EDIT'); assert.equal(f.store.status().dirty, true);
    assert.equal(f.store.status().currentPath, '/b/note.md'); assert.equal(f.store.document().manifest.markdownFile.dir, '/b');
    assert.equal(f.store.document().manifest.markdownFile.encoding, 'utf-8'); assert.equal(f.store.document().manifest.markdownFile.diskFingerprint, '2'.repeat(64));
    assert.ok(f.render.includes('markdown-save-location')); assert.equal(f.activities[0][0], 'read', 'resource rerender retains the current view mode');
    for (const outcome of [{ success: false, canceled: true }, { success: false, error: 'write failed' }]) {
        const g = markdownSaveFixture(), pending = g.c.save(true); await turn(); g.response.resolve(outcome);
        assert.equal(await pending, false); assert.equal(g.store.status().currentPath, '/a/note.md');
        assert.equal(g.store.document().manifest.markdownFile.dir, '/a'); assert.equal(g.store.status().dirty, true); assert.equal(g.render.length, 0);
    }
});

test('Markdown keep-mine acknowledgement is tied to its current file, generation and edit revision', () => {
    const f = markdownSaveFixture(), source = fs.readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium.js'), 'utf8');
    let operation;
    (function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'ObjectMethod' && node.key.name === 'acceptDiskVersion') operation = source.slice(node.start, node.end);
        for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); }
    })(parse(source));
    assert.ok(operation); const controller = vm.runInContext(`({ ${operation} })`, f.c);
    const owner = { ...f.store.status(), filePath: f.store.status().currentPath }, fingerprint = '3'.repeat(64);
    for (const stale of [{ ...owner, filePath: '/other.md' }, { ...owner, generation: owner.generation - 1 }, { ...owner, revision: owner.revision - 1 }]) assert.equal(controller.acceptDiskVersion(fingerprint, stale), false);
    assert.equal(controller.acceptDiskVersion('invalid', owner), false);
    assert.equal(controller.acceptDiskVersion(fingerprint, owner), true); assert.equal(f.store.document().manifest.markdownFile.diskFingerprint, fingerprint);
    assert.equal(f.store.status().revision, owner.revision); assert.equal(f.store.status().dirty, true);
});


test('Markdown history restoration keeps the current file version and rebased resource directory', () => {
    const f = markdownSaveFixture();
    f.store.markSaved({ filePath: '/b/note.md', markdownFile: { dir: '/b', root: '/b', diskFingerprint: '2'.repeat(64) } });
    for (const reason of ['history-undo', 'history-redo', 'lineage-restore']) {
        f.store.replaceDocument({ manifest: { id: 'note', title: 'note', scene: { kind: 'flow' }, markdownFile: { dir: '/a', root: '/a', diskFingerprint: '1'.repeat(64) } }, source: reason }, { filePath: '/b/note.md', name: 'note.md', dirty: true, reason });
        assert.equal(f.store.document().source, reason); assert.equal(f.store.document().manifest.markdownFile.dir, '/b');
        assert.equal(f.store.document().manifest.markdownFile.diskFingerprint, '2'.repeat(64)); assert.equal(f.store.status().dirty, true);
    }
});
