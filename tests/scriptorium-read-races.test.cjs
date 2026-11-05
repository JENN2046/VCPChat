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
    let navigation = 0, value = 'A', cleared = 0;
    const model = (name, text, mtime = 1) => ({ filePath: `/${name}${ext}`, name, mtime, size: 10, value: text,
        saved: text, stateId: text, savedId: text, dirty: false, saving: false, revision: 0, history: [], future: [],
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
    return { c, key, initial, current, reads, response, frames, building, text, edit, swap, preview, toasts, clearCount: () => cleared, navigate: () => navigation++ };
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
    return { session, reads, unpack, fonts, current: () => document, edit: () => { document.source = 'LOCAL'; revision++; }, swap: () => { document = { manifest: { id: 'other' }, source: 'OTHER' }; generation++; }, navigate: () => navigation++ };
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
    const c = { scene: null, unmount: null, cancelMount: null, host: {},
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
