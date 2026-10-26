import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { transformChartReferences, parseChartReference } from '../modules/chat/chartEmbedTransform.js';
import { createChartEmbedHost } from '../modules/renderer/chartEmbedHost.js';
import { createContentPipeline } from '../modules/renderer/contentPipeline.js';

const require = createRequire(import.meta.url);
const { resolveChartEmbedResource } = require('../modules/services/chartEmbedProtocol.js');
const reference = '```vcp-chart\nid: sales-trend\nheight: 360\n```';
const wait = () => new Promise(resolve => setTimeout(resolve, 30));

test('chart reference parses complete fences, preserves literals and rejects invalid values', () => {
    assert.match(transformChartReferences(reference), /data-chart-id="sales-trend"/);
    assert.deepEqual(parseChartReference('id: abc'), { id: 'abc', height: 360, title: 'abc' });
    for (const body of ['id: ../secret', 'id: abc\nheight: Infinity', 'id: abc\nheight: 1',
        'id: abc\nid: def', 'id: abc\nunknown: true']) {
        assert.equal(parseChartReference(body), null);
    }
    for (const literal of ['````text\n' + reference + '\n````', '`vcp-chart id: sales-trend`',
        '```vcp-chart\nid: sales-trend', '```js\n' + reference + '\n```']) {
        assert.equal(transformChartReferences(literal), literal);
    }
    assert.match(transformChartReferences('~~~vcp-chart\nid: abc\n~~~'), /data-chart-id="abc"/);
    const dom = new JSDOM(transformChartReferences('```vcp-chart\nid: abc\ntitle: "<img src=x>"\n```'));
    assert.equal(dom.window.document.querySelector('img'), null);
    assert.equal(dom.window.document.querySelector('[data-chart-title]').dataset.chartTitle, '"<img src=x>"');
    dom.window.close();
});

test('outer pipeline protects tool and thought domains before transforming chart references', () => {
    const pipeline = createContentPipeline({
        transformMermaidPlaceholders: transformChartReferences,
        getToolResultRegex: () => /unused/g,
        getToolRequestRegex: () => /<<<\[TOOL_REQUEST\]>>>[\s\S]*?<<<\[END_TOOL_REQUEST\]>>>/g,
    });
    const result = pipeline.process('<think>\n' + reference + '\n</think>\n'
        + '<<<[TOOL_REQUEST]>>>' + reference + '<<<[END_TOOL_REQUEST]>>>\n' + reference);
    assert.equal((result.text.match(/data-chart-id=/g) || []).length, 1);
});

test('chart resource protocol serves exact allowlist only', () => {
    assert.ok(resolveChartEmbedResource('vcp-chart://app/Chartmodules/chart-sandbox.js', process.cwd()));
    for (const url of ['file:///main.js', 'vcp-chart://evil/Chartmodules/chart-sandbox.js',
        'vcp-chart://app/main.js', 'vcp-chart://app/vendor/../main.js',
        'vcp-chart://app/Chartmodules/chart-sandbox.js?path=main.js']) {
        assert.equal(resolveChartEmbedResource(url, process.cwd()), null);
    }
});

test('host maintains one instance, transfers ownership, parks before replacement and releases', async () => {
    const dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://example.test/' });
    const win = dom.window;
    win.Element.prototype.moveBefore = function(node, before) { this.insertBefore(node, before); };
    const root = win.document.getElementById('root');
    let acquisitions = 0;
    let releases = 0;
    let onChange;
    const api = {
        chartEmbedAcquire: async id => {
            acquisitions++;
            return { token: 'test-token', snapshot: {
                manifest: { id, codeRevision: 1, dataRevision: 1 },
                template: '', style: '', runtime: '', data: {},
            } };
        },
        chartEmbedRelease: async () => { releases++; },
        onChartEmbedChanged: callback => { onChange = callback; return () => { onChange = null; }; },
    };
    const host = createChartEmbedHost({ root, api });
    root.innerHTML = transformChartReferences(reference) + transformChartReferences(reference);
    host.scan(root);
    await wait();
    const [first, second] = root.querySelectorAll('.vcp-chart-embed');
    const frame = root.querySelector('iframe');
    assert.equal(acquisitions, 1);
    assert.equal(second.querySelector('iframe'), frame);
    first.querySelector('button').click();
    await wait();
    assert.equal(first.querySelector('iframe'), frame);
    assert.equal(root.querySelectorAll('iframe').length, 1);
    host.beforeReplace(root);
    assert.equal(win.document.querySelector('[data-chart-embed-parking] iframe'), frame);
    root.innerHTML = transformChartReferences(reference);
    host.scan(root);
    await wait();
    assert.equal(root.querySelector('iframe'), frame);
    assert.equal(acquisitions, 1);
    host.clear();
    await wait();
    assert.equal(releases, 1);
    assert.equal(win.document.querySelector('iframe'), null);
    host.dispose();
    assert.equal(onChange, null);
    dom.window.close();
});

test('streaming placeholders do not auto-acquire instances', async () => {
    const dom = new JSDOM('<body><div id="root"></div></body>');
    dom.window.Element.prototype.moveBefore = function(node, before) { this.insertBefore(node, before); };
    let acquisitions = 0;
    const root = dom.window.document.getElementById('root');
    const host = createChartEmbedHost({ root, api: {
        chartEmbedAcquire: async () => { acquisitions++; throw new Error('unexpected'); },
    } });
    root.innerHTML = transformChartReferences(reference);
    host.scan(root, { auto: false });
    await wait();
    assert.equal(acquisitions, 0);
    host.dispose();
    dom.window.close();
});

for (const visibility of ['offscreen', 'hidden']) test(`replacement chart replays ${visibility} pause after mounting`, async () => {
    const dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://example.test/', pretendToBeVisual: true });
    const win = dom.window, root = win.document.getElementById('root');
    win.Element.prototype.moveBefore = function(node, before) { this.insertBefore(node, before); };
    if (visibility === 'hidden') Object.defineProperty(win.document, 'hidden', { configurable: true, get: () => true });
    let onChange;
    const snapshot = revision => ({ manifest: { id: 'sales-trend', codeRevision: revision, dataRevision: 1 }, template: '', style: '', runtime: '', data: {} });
    const host = createChartEmbedHost({ root, api: {
        chartEmbedAcquire: async () => ({ token: 'synthetic-lease', snapshot: snapshot(1) }),
        chartEmbedSnapshot: async () => snapshot(2), chartEmbedRelease: async () => {},
        onChartEmbedChanged: callback => { onChange = callback; return () => {}; },
    } });
    try {
        root.innerHTML = transformChartReferences(reference);
        const slot = root.querySelector('.vcp-chart-embed');
        if (visibility === 'offscreen') slot.getBoundingClientRect = () => ({ top: 20000, bottom: 20360, width: 300, height: 360 });
        host.scan(root);
        await wait();
        const frame = root.querySelector('iframe'), sent = [];
        frame.contentWindow.postMessage = message => sent.push(message);
        const message = data => win.dispatchEvent(new win.MessageEvent('message', { source: frame.contentWindow, data: { source: 'vcp-chart-sandbox', ...data } }));
        message({ type: 'sandbox-ready' });
        const first = sent.find(value => value.type === 'initialize');
        message({ type: 'ready', chartId: first.chartId, generation: first.generation });
        sent.length = 0;
        onChange({ chartId: first.chartId, type: 'code-replaced' });
        await wait();
        const replacement = sent.find(value => value.type === 'initialize');
        assert.ok(replacement);
        sent.length = 0;
        message({ type: 'ready', chartId: replacement.chartId, generation: replacement.generation });
        assert.ok(sent.some(value => value.type === 'pause'), 'new sandbox runtime must receive pause even when cached visibility is unchanged');
    } finally { host.dispose(); dom.window.close(); }
});

for (const outcome of ['result', 'error']) test(`a replacement settles an already-authorized old-generation read: ${outcome}`, async () => {
    const dom = new JSDOM('<body><div id="root"></div></body>', { url: 'https://example.test/', pretendToBeVisual: true });
    const win = dom.window, root = win.document.getElementById('root');
    win.Element.prototype.moveBefore = function(node, before) { this.insertBefore(node, before); };
    let onChange, resolveRead, rejectRead, reads = 0;
    const read = new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
    const snapshot = revision => ({ manifest: { id: 'sales-trend', codeRevision: revision, dataRevision: 1 }, template: '', style: '', runtime: '', data: {} });
    const host = createChartEmbedHost({ root, api: {
        chartEmbedAcquire: async () => ({ token: 'synthetic-lease', snapshot: snapshot(1) }),
        chartEmbedSnapshot: async () => snapshot(2), chartEmbedRelease: async () => {},
        chartEmbedReadDataSource: async () => { reads++; return read; },
        onChartEmbedChanged: callback => { onChange = callback; return () => {}; },
    } });
    try {
        root.innerHTML = transformChartReferences(reference);
        host.scan(root); await wait();
        const frame = root.querySelector('iframe'), sent = [];
        frame.contentWindow.postMessage = value => sent.push(value);
        const message = data => win.dispatchEvent(new win.MessageEvent('message', { source: frame.contentWindow, data: { source: 'vcp-chart-sandbox', ...data } }));
        message({ type: 'sandbox-ready' });
        const initial = sent.find(value => value.type === 'initialize');
        message({ type: 'data-source-request', chartId: initial.chartId, generation: initial.generation, requestId: 'original', request: { type: 'json', source: 'synthetic.json' } });
        assert.equal(reads, 1);
        onChange({ chartId: initial.chartId, type: 'code-replaced' }); await wait();
        const latest = sent.filter(value => value.type === 'initialize').at(-1);
        assert.notEqual(latest.generation, initial.generation);
        message({ type: 'data-source-request', chartId: initial.chartId, generation: initial.generation, requestId: 'stale-new-request', request: { type: 'json', source: 'other.json' } });
        assert.equal(reads, 1, 'generation change still rejects new requests from the old runtime');
        if (outcome === 'result') resolveRead({ data: 42 }); else rejectRead(new Error('synthetic read failure'));
        await wait();
        const response = sent.find(value => value.type === 'data-source-response' && value.requestId === 'original');
        assert.ok(response, 'the authorized read must settle so the old mount can leave the initialization queue');
        assert.equal(response.generation, initial.generation);
        if (outcome === 'result') assert.deepEqual(response.result, { data: 42 }); else assert.equal(response.error, 'synthetic read failure');
    } finally { host.dispose(); dom.window.close(); }
});
