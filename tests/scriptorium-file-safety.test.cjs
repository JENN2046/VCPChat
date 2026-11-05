'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { PDFDocument, PDFName, PDFString, PDFRawStream, decodePDFRawStream } = require('../vendor/pdf-lib/pdf-lib.min.js');
const { apply } = require('../modules/scriptorium/pdfFiles/edit');
const sheets = require('../modules/scriptorium/sheetFiles');
const views = require('../modules/scriptorium/viewFiles');
const access = require('../modules/scriptorium/fileAccess');

async function temporary(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scriptorium-safety-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return dir;
}
function recoveredText(doc) {
    return doc.context.enumerateIndirectObjects().map(([, object]) => {
        if (object instanceof PDFRawStream) {
            try { return Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); }
            catch { return ''; }
        }
        return object.toString();
    }).join('\n');
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mpkAAAAASUVORK5CYII=';

test('redaction output has no original page streams, metadata, attachments or links back to removed pages', async () => {
    const source = await PDFDocument.create();
    const removed = source.addPage([200, 300]);
    removed.drawText('SECRET-REMOVED-123');
    const kept = source.addPage([300, 400]);
    kept.drawText('KEEP-VISIBLE');
    // A retained annotation can otherwise pull the removed page back into a fresh copy.
    const link = source.context.register(source.context.obj({ Type: 'Annot', Subtype: 'Link',
        Rect: [0, 0, 10, 10], Dest: [removed.ref, PDFName.of('Fit')], Contents: PDFString.of('SECRET-ANNOTATION') }));
    kept.node.set(PDFName.of('Annots'), source.context.obj([link]));
    source.setTitle('SECRET-METADATA');
    await source.attach(Buffer.from('SECRET-ATTACHMENT'), 'secret.txt');
    const form = source.getForm();
    const field = form.createTextField('visible-field');
    field.setText('VISIBLE-FIELD');
    field.addToPage(kept, { x: 10, y: 20, width: 100, height: 20 });
    const input = await source.save();
    const plan = { pages: [{ blank: { w: 200, h: 300 }, image: png }, { src: 'main', index: 1, rotate: 90 }],
        objects: [{ page: 0, type: 'text', text: 'ADDED-TEXT', x: 1, y: 10 }] };
    const result = await PDFDocument.load(await apply(input, plan));
    const recovered = recoveredText(result);
    for (const text of ['SECRET-REMOVED-123', 'SECRET-METADATA', 'SECRET-ATTACHMENT', 'SECRET-ANNOTATION']) {
        assert.ok(!recovered.includes(text), `${text} plaintext removed`);
        assert.ok(!recovered.includes(Buffer.from(text).toString('hex').toUpperCase()), `${text} encoded text removed`);
    }
    assert.equal(result.getPageCount(), 2);
    assert.deepEqual(result.getPage(0).getSize(), { width: 200, height: 300 });
    assert.equal(result.getPage(1).getRotation().angle, 90);
    assert.ok(recovered.includes(Buffer.from('KEEP-VISIBLE').toString('hex').toUpperCase()));
    assert.ok(recovered.includes(Buffer.from('VISIBLE-FIELD').toString('hex').toUpperCase()));
    assert.ok(recovered.includes(Buffer.from('ADDED-TEXT').toString('hex').toUpperCase()));
    assert.equal(result.getForm().getFields().length, 0, 'redaction output flattens interactive fields');
});

test('ordinary PDF edits retain form fields and document metadata', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    doc.setTitle('KEEP-TITLE');
    const field = doc.getForm().createTextField('editable');
    field.addToPage(page);
    const result = await PDFDocument.load(await apply(await doc.save(), { fields: [{ name: 'editable', value: 'VALUE' }] }));
    assert.equal(result.getTitle(), 'KEEP-TITLE');
    assert.equal(result.getForm().getTextField('editable').getText(), 'VALUE');
});

test('CSV detection ignores quoted separators, escaped quotes and embedded newlines; save preserves cells', async t => {
    const dir = await temporary(t);
    access.configure({ libraryRoots: () => [dir] });
    const cases = [
        ['"Hello, world, how are you?";42\r\n', ';', [['Hello, world, how are you?', '42']]],
        ['"Hello,\r\nworld, ""yes, please""";42\r\n', ';', [['Hello,\r\nworld, "yes, please"', '42']]],
        ['"a;b;c",42\n', ',', [['a;b;c', '42']]],
        ['"a,b;c"\r\nname;value\r\nx;42\r\n', ';', [['a,b;c'], ['name', 'value'], ['x', '42']]],
        ['"a,b;c"\t42\n', '\t', [['a,b;c', '42']]],
        ['"a,b;c"\n', ',', [['a,b;c']]],
    ];
    for (const [index, [text, delimiter, rows]] of cases.entries()) {
        const file = path.join(dir, `${index}.csv`);
        await fs.writeFile(file, text);
        const opened = await sheets._act(null, { command: 'read', path: file });
        assert.equal(opened.format.delimiter, delimiter);
        assert.deepEqual(opened.sheets[0].rows, rows);
        await sheets._act(null, { command: 'save', path: file, rows, format: opened.format, mtime: opened.mtime });
        assert.deepEqual((await sheets._act(null, { command: 'read', path: file })).sheets[0].rows, rows);
    }
    const tsv = path.join(dir, 'explicit.tsv');
    await fs.writeFile(tsv, 'a;b;c\t42\n');
    assert.equal((await sheets._act(null, { command: 'read', path: tsv })).format.delimiter, '\t');
});

test('image navigation lists only authorized siblings and never grants the surrounding directory', async t => {
    const dir = await temporary(t);
    const files = ['1.png', '2.jpg', '3.png'];
    for (const file of files) await fs.writeFile(path.join(dir, file), 'synthetic image');
    access.configure({ libraryRoots: () => [], recentFiles: async () => [] });
    access.grant(path.join(dir, files[0]));
    access.grant(path.join(dir, files[2]));
    let handler;
    views.register({ removeHandler() {}, handle(_channel, value) { handler = value; } }, {});
    const event = { sender: { id: 9001 } };
    const result = await handler(event, { command: 'image', file: path.join(dir, files[0]) });
    assert.deepEqual(result.siblings, [files[0], files[2]].map(file => path.join(dir, file)));
    assert.equal(await access.allowed(path.join(dir, files[1])), false);
    assert.equal((await handler(event, { command: 'image', file: path.join(dir, files[1]) })).success, false);
    assert.equal((await handler(event, { command: 'image', file: result.siblings[1] })).success, true);
    access.configure({ libraryRoots: () => [dir] });
    assert.equal((await handler(event, { command: 'image', file: result.filePath })).siblings.length, 3);
});


test('PDF Save As authorizes only the successfully written dialog destination for reopening', async t => {
    const dir = await temporary(t);
    const library = path.join(dir, 'library');
    const outside = path.join(dir, 'outside');
    await fs.mkdir(library); await fs.mkdir(outside);
    const original = path.join(library, 'original.pdf');
    const doc = await PDFDocument.create(); doc.addPage();
    const bytes = Buffer.from(await doc.save()); await fs.writeFile(original, bytes);
    access.configure({ libraryRoots: () => [library], recentFiles: async () => [] });
    const pdf = require('../modules/scriptorium/pdfFiles');
    let selection = { canceled: true };
    const recent = [];
    pdf.register({ removeHandler() {}, handle() {} }, {
        dataDir: () => path.join(dir, 'data'),
        dialog: { showSaveDialog: async () => selection },
        rememberRecentFile: async file => recent.push(file),
    });
    const event = { sender: { id: 9002, once() {} } };
    const opened = await pdf._act(event, { command: 'read', path: original });
    const payload = { command: 'save', path: original, fingerprint: opened.fingerprint, saveAs: true };
    const canceled = path.join(outside, 'canceled.pdf');
    selection = { canceled: true, filePath: canceled };
    assert.equal((await pdf._act(event, payload)).canceled, true);
    assert.equal(await access.allowed(canceled), false);
    const failed = path.join(outside, 'missing', 'failed.pdf');
    selection = { canceled: false, filePath: failed };
    await assert.rejects(pdf._act(event, payload));
    assert.equal(await access.allowed(failed), false);
    selection = { canceled: false, filePath: path.join(outside, 'new') };
    const saved = await pdf._act(event, payload);
    assert.equal(saved.filePath, path.join(outside, 'new.pdf'));
    assert.equal(await access.allowed(saved.filePath), true);
    assert.equal(recent.includes(saved.filePath), true);
    assert.equal((await pdf._act(event, { command: 'read', path: saved.filePath })).success, true);
    assert.deepEqual(await fs.readFile(original), bytes);
    const neighbor = path.join(outside, 'neighbor.pdf'); await fs.writeFile(neighbor, bytes);
    assert.equal(await access.allowed(neighbor), false);
    await assert.rejects(pdf._act(event, { command: 'read', path: neighbor }), /不在文库/);
});

// Load the real renderer operation/mutation functions; defer each asynchronous
// boundary to reproduce the save/edit/reload race without replacing its logic.
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const renderer = require('node:fs').readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-pdf-view.js'), 'utf8');
const wanted = new Set(['amend', 'commit', 'undo', 'redo', 'save', 'reload']);
const functions = new Map();
function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && wanted.has(node.id.name)) functions.set(node.id.name, renderer.slice(node.start, node.end));
    for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(collect);
        else if (child && typeof child === 'object') collect(child);
    }
}
collect(parse(renderer));
assert.equal(functions.size, wanted.size);
function deferred() {
    let resolve; const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
function saveFixture() {
    const plan = deferred(), response = deferred(), read = deferred(), built = deferred(), opened = deferred();
    const model = () => ({ objects: ['submitted'], history: [{ snap: {}, id: 'earlier' }], future: [{ snap: {}, id: 'later' }],
        stateId: 'edited', savedId: 'original', filePath: '/synthetic/original.pdf', fingerprint: 'fingerprint', saving: false });
    let serial = 0, calls = 0;
    const original = model();
    const c = { S: original, opening: 0, reloadSequence: 0, contentRevision: 0, work: { inert: false }, document: { activeElement: { blur() {} } },
        UI: { sync() {}, toast() {} }, scroller: { scrollTop: 0 }, zoom: 1,
        api: () => ({ pdf: async () => { calls++; return response.promise; } }),
        session: () => ({ openPath: () => opened.promise }), planOf: () => plan.promise,
        read: () => read.promise, build: () => built.promise,
        finishEditing() {}, refresh() {}, select() {}, enter() {}, destroy() {}, showConflict() {},
        passwordProblem: () => '', same: (a,b) => a === b, uid: () => `revision-${++serial}`,
        snapshot: () => ({ objects: [...c.S.objects] }), restore: snap => { c.S.objects = [...(snap.objects || [])]; },
        dirty: () => c.S.stateId !== c.S.savedId };
    vm.createContext(c); vm.runInContext([...functions.values()].join('\n'), c);
    return { c, original, model, plan, response, read, built, opened, calls: () => calls };
}

test('PDF save serializes edits and duplicate saves through plan, write and reload completion', async () => {
    const f = saveFixture(), c = f.c;
    const saving = c.save();
    const blocked = () => {
        const id = c.S.stateId, history = c.S.history.length;
        c.commit(() => c.S.objects.push('late')); c.amend(() => c.S.objects.push('late'));
        c.undo(); c.redo();
        assert.equal(c.S.stateId, id); assert.equal(c.S.history.length, history);
        assert.deepEqual([...c.S.objects], ['submitted']);
        assert.equal(c.S.saving, true); assert.equal(c.work.inert, true);
    };
    blocked();
    assert.equal(await c.save(), false, 'a duplicate save must not start');
    f.plan.resolve({}); await turn(); blocked(); assert.equal(f.calls(), 1);
    f.response.resolve({ success: true, filePath: f.original.filePath }); await turn(); blocked();
    assert.equal(await c.reload({ discard: true }), false, 'manual reload must not overtake save');
    f.read.resolve({ success: true }); await turn(); blocked();
    const next = f.model(); next.objects = []; next.stateId = next.savedId = 'saved';
    f.built.resolve(next); assert.equal(await saving, true);
    assert.equal(f.original.saving, false); assert.equal(c.work.inert, false);
    c.commit(() => c.S.objects.push('after-save'));
    assert.deepEqual([...c.S.objects], ['after-save']); assert.equal(c.dirty(), true);
});

test('PDF failed, canceled and conflicting saves release the edit lock without clearing changes', async () => {
    for (const response of [{ success: false, error: 'synthetic failure' }, { canceled: true }, { conflict: true }]) {
        const f = saveFixture(), c = f.c; f.plan.resolve({}); f.response.resolve(response);
        assert.equal(await c.save(), false);
        assert.equal(c.S.saving, false); assert.equal(c.work.inert, false);
        assert.equal(c.S.savedId, 'original'); assert.equal(c.dirty(), true);
        c.commit(() => c.S.objects.push('retry-edit'));
        assert.deepEqual([...c.S.objects], ['submitted', 'retry-edit']);
    }
});

test('PDF Save As keeps the lock through reopening and retains dirty state when reopening fails', async () => {
    for (const success of [true, false]) {
        const f = saveFixture(), c = f.c; f.plan.resolve({});
        const saving = c.save({ saveAs: true });
        f.response.resolve({ success: true, filePath: '/synthetic/new.pdf' }); await turn();
        assert.equal(c.S.saving, true); assert.equal(c.work.inert, true);
        c.commit(() => c.S.objects.push('late'));
        assert.deepEqual([...c.S.objects], ['submitted']);
        f.opened.resolve(success); assert.equal(await saving, success);
        assert.equal(c.S.saving, false); assert.equal(c.work.inert, false);
        if (!success) assert.equal(c.dirty(), true);
    }
});


function assertAbsent(doc, text) {
    const recovered = recoveredText(doc);
    assert.ok(!recovered.includes(text), `${text} plaintext must not survive`);
    assert.ok(!recovered.includes(Buffer.from(text).toString('hex').toUpperCase()), `${text} encoded text must not survive`);
}
async function selectivePdf() {
    const doc = await PDFDocument.create();
    const first = doc.addPage([200, 300]); first.drawText('PAGE-ONE-ONLY');
    const second = doc.addPage([300, 400]); second.drawText('PAGE-TWO-SECRET');
    const link = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link',
        Rect: [0, 0, 10, 10], Dest: [second.ref, PDFName.of('Fit')], Contents: PDFString.of('OMITTED-LINK') }));
    first.node.set(PDFName.of('Annots'), doc.context.obj([link]));
    doc.setTitle('ORIGINAL-METADATA');
    await doc.attach(Buffer.from('ORIGINAL-ATTACHMENT'), 'original.txt');
    const field = doc.getForm().createTextField('visible'); field.setText('VISIBLE-FIELD');
    field.addToPage(first, { x: 5, y: 5, width: 100, height: 20 });
    return Buffer.from(await doc.save());
}

test('selected-page exports and deleted-page saves exclude omitted streams and cross-page references', async () => {
    const input = await selectivePdf();
    const result = await PDFDocument.load(await apply(input, { pages: [{ src: 'main', index: 0, rotate: 90 }],
        objects: [{ page: 0, type: 'text', text: 'SELECTED-NOTE', x: 10, y: 50 }] }));
    assert.equal(result.getPageCount(), 1); assert.equal(result.getPage(0).getRotation().angle, 90);
    assert.deepEqual(result.getPage(0).getSize(), { width: 200, height: 300 });
    for (const text of ['PAGE-TWO-SECRET', 'OMITTED-LINK', 'ORIGINAL-METADATA', 'ORIGINAL-ATTACHMENT']) assertAbsent(result, text);
    const streams = recoveredText(result);
    for (const text of ['PAGE-ONE-ONLY', 'VISIBLE-FIELD', 'SELECTED-NOTE']) assert.ok(streams.includes(Buffer.from(text).toString('hex').toUpperCase()));
    assert.equal(result.getForm().getFields().length, 0);
});

test('actual split API writes only the selected page content into each exported part', async t => {
    const dir = await temporary(t), library = path.join(dir, 'library'), output = path.join(dir, 'split');
    await fs.mkdir(library); await fs.mkdir(output);
    const original = path.join(library, 'source.pdf'), input = await selectivePdf(); await fs.writeFile(original, input);
    access.configure({ libraryRoots: () => [library], recentFiles: async () => [] });
    const pdf = require('../modules/scriptorium/pdfFiles');
    pdf.register({ removeHandler() {}, handle() {} }, { dataDir: () => path.join(dir, 'data'),
        dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [output] }) } });
    const event = { sender: { id: 9003, once() {} } };
    const opened = await pdf._act(event, { command: 'read', path: original });
    const split = await pdf._act(event, { command: 'split', path: original, fingerprint: opened.fingerprint,
        parts: [{ name: 'first', plan: { pages: [{ src: 'main', index: 0 }] } },
            { name: 'second', plan: { pages: [{ src: 'main', index: 1 }] } },
            { name: 'all', plan: { pages: [{ src: 'main', index: 0 }, { src: 'main', index: 1 }] } }] });
    assert.equal(split.success, true); assert.equal(split.files.length, 3);
    for (const [index, file] of split.files.entries()) {
        const part = await PDFDocument.load(await fs.readFile(file)); assert.equal(part.getPageCount(), index === 2 ? 2 : 1);
        if (index < 2) assertAbsent(part, index ? 'PAGE-ONE-ONLY' : 'PAGE-TWO-SECRET');
        if (index === 1) assertAbsent(part, 'VISIBLE-FIELD');
        assertAbsent(part, 'ORIGINAL-METADATA'); assertAbsent(part, 'ORIGINAL-ATTACHMENT');
    }
    assert.deepEqual(await fs.readFile(original), input);
});

test('merging one imported PDF page excludes unselected imported page content', async () => {
    const base = await PDFDocument.create(); base.addPage().drawText('BASE-PAGE');
    const imported = await selectivePdf();
    const result = await PDFDocument.load(await apply(await base.save(), { sources: { extra: '/synthetic/imported.pdf' },
        pages: [{ src: 'main', index: 0 }, { src: 'extra', index: 0 }] }, { readSource: async () => imported }));
    assert.equal(result.getPageCount(), 2); assertAbsent(result, 'PAGE-TWO-SECRET'); assertAbsent(result, 'OMITTED-LINK');
});

const textSource = require('node:fs').readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-text-view.js'), 'utf8');
const textWanted = new Set(['open', 'leave', 'save', 'reload', 'setSource']);
const textFunctions = new Map();
(function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && textWanted.has(node.id.name)) textFunctions.set(node.id.name, textSource.slice(node.start, node.end));
    for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
    }
})(parse(textSource));
assert.equal(textFunctions.size, textWanted.size);
function textFixture() {
    let value = 'A-TEXT', revision = 1;
    const reads = [], writes = [], toasts = [];
    const counters = { cleared: 0 };
    const cm = { getValue: () => value, setValue: text => { value = text; revision++; c.contentRevision++; }, clearHistory: () => { counters.cleared++; },
        changeGeneration: () => revision, isClean: token => token === revision, getCursor: () => ({}), getScrollInfo: () => ({}), setCursor() {}, scrollTo() {} };
    const c = { file: { filePath: '/a.txt', name: 'a.txt', mtime: 1, encoding: 'utf8', generation: 1, saving: false },
        editor: cm, clean: 1, generation: 1, opening: 0, reloadSequence: 0, contentRevision: 0, loading: false,
        work: { hidden: false }, conflict: { hidden: true }, document: { body: { classList: { remove() {} } } },
        UI: { sync() {}, toast: (...args) => toasts.push(args) }, hasLongLine: () => false, isText: file => file.endsWith('.txt'), same: (a,b) => a === b,
        ensureEditor: () => cm, enter() {}, applyLanguage: async () => {}, refresh() {},
        showFile: result => { c.file.readOnly = false; c.setSource(result.text); },
        dirty: () => !cm.isClean(c.clean),
        read: file => { const gate = deferred(); reads.push({ file, ...gate }); return gate.promise; },
        api: () => ({ view: async (command, payload) => { if (command === 'save') { writes.push(payload); return { success: true, mtime: c.file.mtime }; } return {}; } }) };
    vm.createContext(c); vm.runInContext([...textFunctions.values()].join('\n'), c);
    const response = (file, text, mtime = 2) => ({ success: true, filePath: file, name: file.split('/').pop(), text, mtime, eol: 'lf', encoding: 'utf8', bom: false });
    return { c, cm, reads, writes, toasts, counters, response, edit: text => { value = text; revision++; c.contentRevision++; }, undoToOriginal: () => { value = 'A-TEXT'; revision = 1; c.contentRevision++; } };
}

test('a late text reload cannot replace a newly opened file or its metadata, including the same path reopened', async () => {
    for (const target of ['/b.txt', '/a.txt']) {
        const f = textFixture(), c = f.c, pending = c.reload(), stale = f.reads.shift();
        if (target === '/a.txt') c.leave();
        const opening = c.open(target); f.reads.shift().resolve(f.response(target, 'CURRENT-TEXT', 77)); await opening;
        const current = c.file, clean = c.clean, cleared = f.counters.cleared;
        stale.resolve(f.response('/a.txt', 'STALE-TEXT', 33)); await pending;
        assert.equal(c.file, current); assert.equal(c.file.filePath, target); assert.equal(c.file.mtime, 77);
        assert.equal(f.cm.getValue(), 'CURRENT-TEXT'); assert.equal(c.clean, clean); assert.equal(f.counters.cleared, cleared);
        f.edit('CURRENT-TEXT-EDIT'); await c.save(); assert.equal(f.writes.at(-1).text, 'CURRENT-TEXT-EDIT');
    }
});

test('text typed after a reload starts remains dirty with its undo history and metadata intact', async () => {
    for (const discard of [false, true]) {
        const f = textFixture(), c = f.c;
        if (discard) f.edit('EARLIER-EDIT');
        const pending = c.reload({ discard }), request = f.reads.shift(), cleared = f.counters.cleared;
        f.edit('NEW-EDIT'); request.resolve(f.response('/a.txt', 'OLD-DISK-TEXT', 88)); await pending;
        assert.equal(f.cm.getValue(), 'NEW-EDIT'); assert.equal(c.file.mtime, 1); assert.equal(c.dirty(), true);
        assert.equal(f.counters.cleared, cleared);
    }
});

test('only the newest unchanged text reload is applied and stale read failures are silent', async () => {
    const f = textFixture(), c = f.c;
    const first = c.reload(), older = f.reads.shift(), second = c.reload(), newer = f.reads.shift();
    older.resolve(f.response('/a.txt', 'OLDER', 20)); await first; assert.equal(f.cm.getValue(), 'A-TEXT');
    newer.resolve(f.response('/a.txt', 'NEWER', 30)); await second;
    assert.equal(f.cm.getValue(), 'NEWER'); assert.equal(c.file.mtime, 30); assert.equal(c.dirty(), false);
    const late = c.reload(), failed = f.reads.shift(); c.leave();
    failed.resolve({ success: false, error: 'obsolete failure' }); await late; assert.equal(f.toasts.length, 0);
});

test('a completed save invalidates a pending text reload even when the file mtime is unchanged', async () => {
    const f = textFixture(), pending = f.c.reload(), request = f.reads.shift();
    await f.c.save({ force: true }); request.resolve(f.response('/a.txt', 'OLDER-DISK-TEXT')); await pending;
    assert.equal(f.cm.getValue(), 'A-TEXT'); assert.equal(f.c.file.mtime, 1); assert.equal(f.c.dirty(), false);
});

test('late text opens cannot override the newest open, a close, or new local edits', async () => {
    for (const scenario of ['newest-open', 'close', 'local-edit']) {
        const f = textFixture(), old = f.c.open('/old.txt'), request = f.reads.shift();
        if (scenario === 'newest-open') {
            const next = f.c.open('/new.txt'); f.reads.shift().resolve(f.response('/new.txt', 'LATEST')); await next;
        } else if (scenario === 'close') f.c.leave(); else f.edit('LOCAL-EDIT');
        request.resolve(f.response('/old.txt', 'OBSOLETE')); await old;
        if (scenario === 'close') assert.equal(f.c.file, null);
        else assert.equal(f.cm.getValue(), scenario === 'local-edit' ? 'LOCAL-EDIT' : 'LATEST');
    }
});


test('editing then undoing during text reload still invalidates the read and preserves redo history', async () => {
    const f = textFixture(), pending = f.c.reload(), request = f.reads.shift(), cleared = f.counters.cleared;
    f.edit('TEMPORARY-EDIT'); f.undoToOriginal(); assert.equal(f.c.dirty(), false);
    request.resolve(f.response('/a.txt', 'REMOTE-TEXT', 90)); await pending;
    assert.equal(f.cm.getValue(), 'A-TEXT'); assert.equal(f.counters.cleared, cleared); assert.equal(f.c.file.mtime, 1);
});
