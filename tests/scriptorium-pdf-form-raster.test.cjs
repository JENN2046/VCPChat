'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname, '../ScriptoriumModules/scriptorium-pdf-view.js'), 'utf8');
const functions = new Map();
(function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && ['rasterize', 'queueRaster'].includes(node.id.name)) functions.set(node.id.name, source.slice(node.start, node.end));
    for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); }
})(parse(source));
assert.ok(functions.has('rasterize'));
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture({ deferredRender = false } = {}) {
    const entries = new Map([['text-id', { value: 'ORIGINAL', formattedValue: 'OLD-FORMATTED', readOnly: false }], ['untouched', { value: 'KEEP' }]]);
    const original = new Map(entries), renders = [], stages = [], gates = [];
    const storage = { getRawValue: id => entries.get(id), setValue: (id, value) => { entries.set(id, { ...entries.get(id), ...value }); }, remove: id => entries.delete(id) };
    const doc = { annotationStorage: storage };
    const annotations = [
        { id: 'text-id', fieldName: 'text', fieldType: 'Tx' },
        { id: 'check-id', fieldName: 'check', fieldType: 'Btn', checkBox: true },
        { id: 'radio-a', fieldName: 'radio', fieldType: 'Btn', radioButton: true, buttonValue: '0' },
        { id: 'radio-b', fieldName: 'radio', fieldType: 'Btn', radioButton: true, buttonValue: '1' },
        { id: 'choice-id', fieldName: 'choice', fieldType: 'Ch' },
        { id: 'outside', fieldName: 'not-in-state', fieldType: 'Tx' },
    ];
    const proxy = { getAnnotations: async () => annotations, getViewport: () => ({}), render: options => {
        renders.push({ options, values: new Map([...entries].map(([id,value]) => [id, { ...value }])) }); stages.push('render');
        if (!deferredRender) return { promise: Promise.resolve() };
        const gate = deferred(); gates.push(gate); return { promise: gate.promise };
    } };
    const state = { docs: { main: doc }, fields: [{ name: 'radio', type: 'radio', options: ['A', 'B'], widgets: [{ page: 0, id: 'radio-a' }, { page: 0, id: 'radio-b' }] }], values: { text: 'NEW', check: true, radio: 'B', choice: 'two' } };
    const c = { rasterJobs: new WeakMap(), baseSize: () => ({ w: 100, h: 200 }), proxyOf: () => proxy,
        pdfjs: async () => ({ AnnotationMode: { ENABLE_STORAGE: 3 } }),
        document: { createElement: () => ({ getContext: () => ({ fillStyle: '', fillRect() { stages.push('mask-or-background'); } }), toDataURL: () => 'data:image/jpeg;base64,SYNTHETIC' }) } };
    vm.createContext(c); vm.runInContext([...functions.values()].join('\n'), c);
    return { c, state, doc, storage, entries, original, renders, stages, gates, entry: { src: 'main', index: 0, rot: 0 } };
}
test('redaction raster uses current text/check/radio/choice values then restores native annotation storage', async () => {
    const f = fixture(); await f.c.rasterize(f.state, f.entry, [{ x: 1, y: 2, w: 3, h: 4 }]);
    const render = f.renders[0]; assert.equal(render.options.annotationMode, 3);
    assert.equal(render.values.get('text-id').value, 'NEW'); assert.equal(render.values.get('text-id').formattedValue, undefined);
    assert.equal(render.values.get('check-id').value, true);
    assert.equal(render.values.get('radio-a').value, false); assert.equal(render.values.get('radio-b').value, true);
    assert.equal(render.values.get('choice-id').value, 'two'); assert.equal(render.values.has('outside'), false);
    assert.deepEqual(f.entries, f.original); assert.equal(f.stages.at(-1), 'mask-or-background', 'redaction paints after form rendering');
    f.state.docs.imported = f.doc;
    await f.c.rasterize(f.state, { ...f.entry, src: 'imported' }, []);
    assert.equal(f.renders[1].values.get('text-id').value, 'ORIGINAL', 'main form values never replace an imported field with the same name');
    assert.deepEqual(f.entries, f.original);
});
test('concurrent redaction renders isolate their form snapshots and restore after failure', async () => {
    const f = fixture({ deferredRender: true });
    const first = f.c.rasterize(f.state, f.entry, [], { ...f.state.values, text: 'FIRST' }); await turn();
    const second = f.c.rasterize(f.state, f.entry, [], { ...f.state.values, text: 'SECOND' }); await turn();
    assert.equal(f.renders.length, 1); assert.equal(f.entries.get('text-id').value, 'FIRST');
    f.gates[0].resolve(); await first; await turn();
    assert.equal(f.renders[1].values.get('text-id').value, 'SECOND');
    f.gates[1].reject(new Error('controlled native render failure')); await assert.rejects(second, /controlled/);
    assert.deepEqual(f.entries, f.original);
    const third = f.c.rasterize(f.state, f.entry, [], { ...f.state.values, text: 'THIRD' }); await turn();
    assert.equal(f.renders[2].values.get('text-id').value, 'THIRD'); f.gates[2].resolve(); await third;
    assert.deepEqual(f.entries, f.original);
});
