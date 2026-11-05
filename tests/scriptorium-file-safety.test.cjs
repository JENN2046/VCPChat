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

test('PDF recovery: Save As restores deleted or moved originals and includes unsaved edits', async t => {
    const dir = await temporary(t), library = path.join(dir, 'library'), output = path.join(dir, 'recovered');
    await fs.mkdir(library); await fs.mkdir(output);
    access.configure({ libraryRoots: () => [library], recentFiles: async () => [] });
    const pdf = require('../modules/scriptorium/pdfFiles');
    let destination, dialogCalls = 0;
    pdf.register({ removeHandler() {}, handle() {} }, { dataDir: () => path.join(dir, 'data'),
        dialog: { showSaveDialog: async () => { dialogCalls++; return { canceled: false, filePath: destination }; } } });
    const event = { sender: { id: 9004, once() {} } };
    for (const scenario of ['deleted', 'moved']) {
        const original = path.join(library, `${scenario}.pdf`), doc = await PDFDocument.create();
        doc.addPage().drawText(`OPENED-${scenario}`); await fs.writeFile(original, await doc.save());
        const opened = await pdf._act(event, { command: 'read', path: original });
        if (scenario === 'moved') await fs.rename(original, path.join(library, 'moved-elsewhere.pdf')); else await fs.unlink(original);
        const payload = { command: 'save', path: original, fingerprint: opened.fingerprint,
            plan: { objects: [{ page: 0, type: 'text', text: 'UNSAVED-EDIT', x: 10, y: 50 }] } };
        await assert.rejects(pdf._act(event, payload), /另存为/);
        await assert.rejects(pdf._act(event, { ...payload, force: true }), /另存为/);
        destination = path.join(output, `${scenario}.pdf`);
        const result = await pdf._act(event, { ...payload, saveAs: true }); assert.equal(result.success, true);
        const recovered = await PDFDocument.load(await fs.readFile(destination));
        for (const text of [`OPENED-${scenario}`, 'UNSAVED-EDIT']) assert.ok(recoveredText(recovered).includes(Buffer.from(text).toString('hex').toUpperCase()));
        assert.equal(await access.allowed(destination), true);
        assert.equal((await pdf._act(event, { command: 'read', path: destination })).success, true);
        await assert.rejects(fs.stat(original));
    }
    assert.equal(dialogCalls, 2);
});

test('PDF recovery: a missing or different-file cache fingerprint cannot be substituted', async t => {
    const dir = await temporary(t), library = path.join(dir, 'library'); await fs.mkdir(library);
    access.configure({ libraryRoots: () => [library], recentFiles: async () => [] });
    const pdf = require('../modules/scriptorium/pdfFiles'); let dialogCalls = 0;
    pdf.register({ removeHandler() {}, handle() {} }, { dataDir: () => path.join(dir, 'data'), dialog: { showSaveDialog: async () => { dialogCalls++; return { canceled: true }; } } });
    const event = { sender: { id: 9005, once() {} } };
    const original = path.join(library, 'original.pdf'), other = path.join(library, 'other.pdf');
    for (const [file, text] of [[original, 'ORIGINAL'], [other, 'OTHER']]) {
        const doc = await PDFDocument.create(); doc.addPage().drawText(text); await fs.writeFile(file, await doc.save());
    }
    await pdf._act(event, { command: 'read', path: original });
    const otherRead = await pdf._act(event, { command: 'read', path: other }); await fs.unlink(original);
    for (const fingerprint of [otherRead.fingerprint, '0'.repeat(64)]) await assert.rejects(pdf._act(event, { command: 'save', path: original, saveAs: true, fingerprint }));
    assert.equal(dialogCalls, 0);
});

test('CSV quoted-empty final records survive parsing and write/reparse without phantom rows', () => {
    const cases = [
        ['""', [['']]], ['header\n""', [['header'], ['']]], ['header\r\n""', [['header'], ['']]],
        ['header\n""\n', [['header'], ['']]], ['""\n""', [[''], ['']]],
        ['header\n\n', [['header'], ['']]], ['header\n', [['header']]], ['', []], ['\n', [['']]],
        ['header,other\nvalue,""', [['header', 'other'], ['value', '']]],
    ];
    for (const [text, expected] of cases) {
        const parsed = sheets.parseDelimited(text, ','); assert.deepEqual(parsed.rows, expected, JSON.stringify(text));
        const written = sheets.writeDelimited(expected, { delimiter: ',', eol: /\r\n/.test(text) ? '\r\n' : '\n',
            everyQuoted: parsed.everyQuoted, endsWithNewline: /[\r\n]$/.test(text) });
        assert.deepEqual(sheets.parseDelimited(written, ',').rows, expected, `round trip ${JSON.stringify(text)}`);
    }
    assert.equal(sheets.writeDelimited([['a', '', '']], { endsWithNewline: false }), 'a,,', 'ordinary sparse rows keep their existing representation');
});

test('CSV final empty record remains when another cell is edited and saved through the real sheet API', async t => {
    const dir = await temporary(t), file = path.join(dir, 'empty-tail.csv');
    access.configure({ libraryRoots: () => [dir], recentFiles: async () => [] });
    await fs.writeFile(file, 'header\n""');
    const opened = await sheets._act(null, { command: 'read', path: file });
    assert.deepEqual(opened.sheets[0].rows, [['header'], ['']]);
    opened.sheets[0].rows[0][0] = 'EDITED';
    await sheets._act(null, { command: 'save', path: file, rows: opened.sheets[0].rows, format: opened.format, mtime: opened.mtime });
    assert.deepEqual((await sheets._act(null, { command: 'read', path: file })).sheets[0].rows, [['EDITED'], ['']]);
    assert.ok((await fs.readFile(file, 'utf8')).endsWith('""'));
});

test('POSIX atomic view saves preserve executable and private modes through the registered handler', { skip: process.platform === 'win32' }, async t => {
    const dir = await temporary(t); access.configure({ libraryRoots: () => [dir], recentFiles: async () => [] });
    let handler;
    views.register({ removeHandler() {}, handle(_name, value) { handler = value; } }, {});
    const event = { sender: { id: 9006 } };
    for (const [name, mode] of [['run.sh', 0o700], ['tool.py', 0o750], ['private.txt', 0o600], ['group.txt', 0o640], ['private.excalidraw', 0o600]]) {
        const file = path.join(dir, name); await fs.writeFile(file, 'original\n'); await fs.chmod(file, mode);
        const opened = await handler(event, { command: 'read', file });
        const saved = await handler(event, { command: 'save', file, text: 'updated\n', mtime: opened.mtime, encoding: opened.encoding, bom: opened.bom, eol: opened.eol });
        assert.equal(saved.success, true); assert.equal((await fs.stat(file)).mode & 0o777, mode, name);
        assert.equal(await fs.readFile(file, 'utf8'), 'updated\n');
    }
});

test('POSIX modes survive HTML, sheet, PDF and Markdown atomic save paths', { skip: process.platform === 'win32' }, async t => {
    const dir = await temporary(t); access.configure({ libraryRoots: () => [dir], recentFiles: async () => [] });
    const html = path.join(dir, 'private.html'); await fs.writeFile(html, '<h1>original</h1>'); await fs.chmod(html, 0o640);
    const pages = require('../modules/scriptorium/webPages');
    const openedHtml = await pages.readPage(html); assert.equal((await pages.savePage({ ...openedHtml, file: html, text: '<h1>updated</h1>', senderId: 0 })).success, true);
    assert.equal((await fs.stat(html)).mode & 0o777, 0o640);
    const csv = path.join(dir, 'private.csv'); await fs.writeFile(csv, 'header\nvalue'); await fs.chmod(csv, 0o600);
    const openedCsv = await sheets._act(null, { command: 'read', path: csv });
    await sheets._act(null, { command: 'save', path: csv, rows: [['header'], ['updated']], format: openedCsv.format, mtime: openedCsv.mtime });
    assert.equal((await fs.stat(csv)).mode & 0o777, 0o600);
    const pdf = require('../modules/scriptorium/pdfFiles'), pdfPath = path.join(dir, 'p'.repeat(180) + '.pdf');
    const doc = await PDFDocument.create(); doc.addPage(); await fs.writeFile(pdfPath, await doc.save()); await fs.chmod(pdfPath, 0o600);
    pdf.register({ removeHandler() {}, handle() {} }, { dataDir: () => path.join(dir, 'data') });
    const event = { sender: { id: 9007, once() {} } }, openedPdf = await pdf._act(event, { command: 'read', path: pdfPath });
    await pdf._act(event, { command: 'save', path: pdfPath, fingerprint: openedPdf.fingerprint });
    assert.equal((await fs.stat(pdfPath)).mode & 0o777, 0o600);
    for (const name of await fs.readdir(path.join(dir, 'data', 'scriptorium-pdf-backup'))) assert.equal((await fs.stat(path.join(dir, 'data', 'scriptorium-pdf-backup', name))).mode & 0o777, 0o600);
    const md = path.join(dir, 'private.md'); await fs.writeFile(md, '# original\n'); await fs.chmod(md, 0o600);
    const markdown = require('../modules/scriptorium/markdownFiles'), deps = { dataDir: () => path.join(dir, 'AppData') };
    const openedMd = await markdown.read(md, deps); await markdown.save(null, { filePath: md, bytes: openedMd.bytes }, deps);
    assert.equal((await fs.stat(md)).mode & 0o777, 0o600);
});

test('atomic writer creates a private temporary before content and preserves target rwx before rename', { skip: process.platform === 'win32' }, async t => {
    const dir = await temporary(t), target = path.join(dir, 'private.sh'); await fs.writeFile(target, 'old'); await fs.chmod(target, 0o700);
    const native = require('node:fs').promises, originalOpen = native.open, originalRename = native.rename;
    let sawWrite = false, sawRename = false;
    native.open = async function(file, ...args) {
        const handle = await originalOpen.call(this, file, ...args);
        if (path.dirname(String(file)) === dir && String(file).includes('.scriptorium-writing-')) {
            assert.equal(args[0], 'wx'); assert.equal((await fs.stat(file)).mode & 0o077, 0, 'temporary never exposes contents to group/other');
            const write = handle.writeFile.bind(handle);
            handle.writeFile = async data => { assert.equal((await fs.stat(file)).mode & 0o077, 0); await write(data); assert.equal((await fs.stat(file)).mode & 0o077, 0); sawWrite = true; };
        }
        return handle;
    };
    native.rename = async function(from, to) {
        if (to === target) { assert.equal(await fs.readFile(target, 'utf8'), 'old'); assert.equal((await fs.stat(from)).mode & 0o777, 0o700); sawRename = true; }
        return originalRename.call(this, from, to);
    };
    try { await require('../modules/scriptorium/atomicReplace').writeAtomically(target, 'new'); }
    finally { native.open = originalOpen; native.rename = originalRename; }
    assert.equal(sawWrite && sawRename, true); assert.equal(await fs.readFile(target, 'utf8'), 'new');
    assert.deepEqual(await fs.readdir(dir), ['private.sh']);
});

test('atomic writer failures leave the old file and mode intact and remove only owned temporaries', async t => {
    const dir = await temporary(t), target = path.join(dir, 'original.txt'); await fs.writeFile(target, 'original');
    if (process.platform !== 'win32') await fs.chmod(target, 0o600);
    const native = require('node:fs').promises, originalOpen = native.open, originalRename = native.rename;
    const scenarios = process.platform === 'win32' ? ['rename-EIO', 'rename-EPERM'] : ['rename-EIO', 'rename-EPERM', 'chmod'];
    for (const scenario of scenarios) {
        let renames = 0;
        native.open = async function(file, ...args) {
            const handle = await originalOpen.call(this, file, ...args);
            if (scenario === 'chmod' && path.dirname(String(file)) === dir) handle.chmod = async () => { throw Object.assign(new Error('controlled chmod failure'), { code: 'EPERM' }); };
            return handle;
        };
        native.rename = async function(from, to) {
            if (to !== target) return originalRename.call(this, from, to);
            renames++; throw Object.assign(new Error('controlled rename failure'), { code: scenario === 'rename-EPERM' ? 'EPERM' : 'EIO' });
        };
        try { await assert.rejects(require('../modules/scriptorium/atomicReplace').writeAtomically(target, 'replacement')); }
        finally { native.open = originalOpen; native.rename = originalRename; }
        assert.equal(await fs.readFile(target, 'utf8'), 'original');
        if (process.platform !== 'win32') assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
        assert.equal(renames, scenario === 'rename-EPERM' ? 3 : scenario === 'chmod' ? 0 : 1);
        assert.deepEqual(await fs.readdir(dir), ['original.txt']);
    }
});

test('atomic writer never cleans a temporary that it failed to create exclusively', async t => {
    const dir = await temporary(t), target = path.join(dir, 'original.txt'); await fs.writeFile(target, 'original');
    const native = require('node:fs').promises, originalOpen = native.open; let foreign;
    native.open = async function(file, ...args) {
        if (path.dirname(String(file)) !== dir) return originalOpen.call(this, file, ...args);
        foreign = String(file); await fs.writeFile(foreign, 'foreign'); throw Object.assign(new Error('controlled collision'), { code: 'EEXIST' });
    };
    try { await assert.rejects(require('../modules/scriptorium/atomicReplace').writeAtomically(target, 'replacement')); }
    finally { native.open = originalOpen; }
    assert.equal(await fs.readFile(foreign, 'utf8'), 'foreign'); assert.equal(await fs.readFile(target, 'utf8'), 'original');
});

test('new atomic destinations keep the caller umask policy', { skip: process.platform === 'win32' }, async t => {
    const dir = await temporary(t), target = path.join(dir, 'new.txt'), mask = process.umask();
    await require('../modules/scriptorium/atomicReplace').writeAtomically(target, 'new');
    assert.equal((await fs.stat(target)).mode & 0o777, 0o666 & ~mask); assert.equal(process.umask(), mask);
});


test('atomic temporary names do not depend on a long valid destination basename', { skip: process.platform === 'win32' }, async t => {
    const dir = await temporary(t), target = path.join(dir, 'x'.repeat(220) + '.txt');
    await fs.writeFile(target, 'old'); await fs.chmod(target, 0o600);
    await require('../modules/scriptorium/atomicReplace').writeAtomically(target, 'new');
    assert.equal(await fs.readFile(target, 'utf8'), 'new'); assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
    assert.deepEqual(await fs.readdir(dir), [path.basename(target)]);
});

test('XLSX sparse coordinates retain distant values, formulas and formula-only final rows', async t => {
    const dir = await temporary(t), file = path.join(dir, 'sparse.xlsx');
    access.configure({ libraryRoots: () => [dir], recentFiles: async () => [] });
    const ExcelJS = require('exceljs'), book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Sparse');
    sheet.getCell('A1').value = 'LEFT'; sheet.getCell('D1').value = 'RIGHT';
    sheet.getCell('A2').value = 1; sheet.getCell('D2').value = { formula: 'A2+41', result: 42 };
    sheet.getCell('D3').value = { formula: 'A2+2' };
    await fs.writeFile(file, Buffer.from(await book.xlsx.writeBuffer()));
    const opened = await sheets._act(null, { command: 'read', path: file }), data = opened.sheets[0];
    assert.deepEqual(data.rows[0], ['LEFT', '', '', 'RIGHT']);
    assert.equal(data.rows[1][3], '42'); assert.equal(data.formulas['1:3'], '=A2+41');
    assert.equal(data.rows.length, 3); assert.equal(data.formulas['2:3'], '=A2+2'); assert.equal(data.truncated, false);
    await sheets._act(null, { command: 'save', path: file, mtime: opened.mtime, changes: [{ sheet: 'Sparse', row: 1, col: 0, text: '2' }] });
    const saved = (await sheets._act(null, { command: 'read', path: file })).sheets[0];
    assert.equal(saved.rows[0][3], 'RIGHT'); assert.equal(saved.formulas['1:3'], '=A2+41'); assert.equal(saved.formulas['2:3'], '=A2+2');
});

test('XLSX sparse extent respects the 500-column boundary and marks overflow partial', async t => {
    const dir = await temporary(t); access.configure({ libraryRoots: () => [dir], recentFiles: async () => [] });
    const ExcelJS = require('exceljs');
    for (const column of [500, 501]) {
        const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Sparse');
        sheet.getCell(1, 1).value = 'LEFT'; sheet.getCell(1, column).value = 'FAR';
        const file = path.join(dir, `${column}.xlsx`); await fs.writeFile(file, Buffer.from(await book.xlsx.writeBuffer()));
        const opened = await sheets._act(null, { command: 'read', path: file });
        assert.equal(opened.sheets[0].rows[0].length, 500);
        assert.equal(opened.sheets[0].truncated, column > 500); assert.equal(Boolean(opened.lockReason), column > 500);
        if (column === 500) assert.equal(opened.sheets[0].rows[0][499], 'FAR');
    }
});

test('webpage grants keep distinct canonical roots that differ only by case', async t => {
    const dir = await temporary(t), lower = path.join(dir, 'site'), upper = path.join(dir, 'SITE');
    await fs.mkdir(lower); await fs.mkdir(upper, { recursive: true });
    if (await fs.realpath(lower) === await fs.realpath(upper)) { t.skip('filesystem has no distinct case-only directory names'); return; }
    const pages = require('../modules/scriptorium/webPages');
    await fs.writeFile(path.join(lower, 'index.html'), 'LOWER'); await fs.writeFile(path.join(upper, 'index.html'), 'UPPER');
    const a = await pages.grant(path.join(lower, 'index.html')), b = await pages.grant(path.join(upper, 'index.html'));
    assert.notEqual(new URL(a.url).host, new URL(b.url).host);
    assert.equal(await fs.readFile((await pages.resolveRequest(a.url)).file, 'utf8'), 'LOWER');
    assert.equal(await fs.readFile((await pages.resolveRequest(b.url)).file, 'utf8'), 'UPPER');
    assert.equal((await pages.grant(path.join(lower, '.', 'index.html'))).url, a.url, 'same canonical root reuses its token');
});

test('webpage protocol refuses symlink escape to a case-only sibling but accepts in-root assets', async t => {
    const dir = await temporary(t), lower = path.join(dir, 'site'), upper = path.join(dir, 'SITE');
    await fs.mkdir(lower); await fs.mkdir(upper, { recursive: true });
    if (await fs.realpath(lower) === await fs.realpath(upper)) { t.skip('filesystem has no distinct case-only directory names'); return; }
    const pages = require('../modules/scriptorium/webPages');
    await fs.writeFile(path.join(lower, 'index.html'), 'LOWER'); await fs.writeFile(path.join(lower, 'asset.js'), 'IN-ROOT');
    await fs.writeFile(path.join(upper, 'private.js'), 'OUTSIDE');
    await fs.symlink(path.join(upper, 'private.js'), path.join(lower, 'linked.js'));
    await fs.symlink(path.join(lower, 'asset.js'), path.join(lower, 'alias.js'));
    await fs.symlink(path.join(upper, 'private.js'), path.join(lower, 'escape.html'));
    const granted = await pages.grant(path.join(lower, 'index.html'));
    assert.equal(await pages.resolveRequest(new URL('linked.js', granted.url).href), null);
    assert.equal(await fs.readFile((await pages.resolveRequest(new URL('alias.js', granted.url).href)).file, 'utf8'), 'IN-ROOT');
    await assert.rejects(pages.grant(path.join(lower, 'escape.html')), /范围/);
});
