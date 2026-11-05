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
