'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'ProjectForgemodules/projectforge.js'), 'utf8');
const node = acorn.parse(renderer, {ecmaVersion: 'latest'}).body.find(node =>
  node.type === 'FunctionDeclaration' && node.id.name === 'renderBlueprint');
assert.ok(node);
const selectNode = acorn.parse(renderer, {ecmaVersion: 'latest'}).body.find(node =>
  node.type === 'FunctionDeclaration' && node.id.name === 'selectProject');
const drawing = fs.readFileSync(path.join(root, 'ProjectForgemodules/projectforge-blueprint.js'), 'utf8');
function deferred() {
  let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};
}
function fixture(overrides = {}) {
  const dom = new JSDOM('<button class="tab active" data-tab="overview"></button><main id="pane-blueprint"></main><div id="history-results"></div>');
  const state = {currentId: 'project-a', detail: {project: {status: 'active', stats: {}},
    timeline: [{id: 1, reason: 'batch reason'}], todos: []}};
  const opened = [];
  const api = {projectForgeGetBlueprint: async () => ({exists: false}),
    projectForgeGetBatch: async () => ({nodes: [{id: 7, file_path: 'src/main.js', op: 'edit'}]}), ...overrides};
  const context = vm.createContext({document: dom.window.document, state, api,
    renderProjectList() {}, showProjectView() {}, renderHeader() {}, renderOverview() {},
    renderTimeline() {}, renderFiles() {}, renderReport() {}, switchTab() {}, toast() {},
    $: id => dom.window.document.getElementById(id),
    escapeHtml: value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])),
    call: async value => value, openNode: id => opened.push(id), STATUS_LABEL: {active: '进行中'}});
  vm.runInContext(drawing + '\nlet bpRenderSeq = 0, projectDetailSequence = 0;\n' + renderer.slice(node.start, node.end) +
    '\n' + renderer.slice(selectNode.start, selectNode.end) +
    '\nglobalThis.render = renderBlueprint;globalThis.select = selectProject;', context);
  return {dom, context, state, opened, pane: dom.window.document.querySelector('main')};
}

test('dynamic blueprint renders source nodes, batch reasons, readable TODOs and node actions', async t => {
  const f = fixture(); t.after(() => f.dom.window.close());
  f.state.detail.todos = [{id: 3, seq: 2, title: 'verify save'}];
  f.context.api.projectForgeGetBatch = async () => ({nodes: [
    {id: 7, todo_id: 3, file_path: 'src/main.js', op: 'edit', reason: null, added: 2} ]});
  await f.context.render();
  assert.match(f.pane.textContent, /batch reason/);
  assert.match(f.pane.textContent, /#2 verify save/);
  assert.equal(f.pane.querySelectorAll('.bp-lane').length, 1);
  f.pane.querySelector('[data-node="7"]').click();
  assert.deepEqual(f.opened, [7]);
});

test('blueprint fields remain text instead of executable markup', async t => {
  const f = fixture({projectForgeGetBatch: async () => ({nodes: [
    {id: 7, file_path: '<img src=x onerror=alert(1)>', op: 'edit', reason: '<script>bad()</script>'}]})});
  t.after(() => f.dom.window.close()); await f.context.render();
  assert.equal(f.pane.querySelector('img,script'), null);
  assert.match(f.pane.textContent, /<script>bad\(\)<\/script>/);
});

test('a late blueprint cannot replace a cleared project selection', async t => {
  const gate = deferred();
  const f = fixture({projectForgeGetBlueprint: () => gate.promise}); t.after(() => f.dom.window.close());
  const pending = f.context.render(); f.state.currentId = null;
  await f.context.render(); gate.resolve({exists: false}); await pending;
  assert.equal(f.pane.textContent, '未选择工程。');
  assert.equal(f.pane.querySelector('.bp-host'), null);
});

test('failed batch fetches can recover on the next forced refresh', async t => {
  let calls = 0;
  const f = fixture({projectForgeGetBatch: async () => {
    if (++calls === 1) throw new Error('synthetic transient failure');
    return {nodes: [{id: 7, file_path: 'recovered.js', op: 'edit'}]};
  }}); t.after(() => f.dom.window.close());
  await f.context.render(); assert.match(f.pane.textContent, /拉取失败/);
  await f.context.render({force: true});
  assert.equal(calls, 2); assert.match(f.pane.textContent, /recovered.js/);
});

test('manual blueprints render in an opaque script-enabled sandbox', async t => {
  const f = fixture({projectForgeGetBlueprint: async () => ({exists: true,
    relPath: 'VCPDistributedServer/Plugin/ProjectForge/blueprints/project-a.html'})});
  t.after(() => f.dom.window.close()); await f.context.render();
  f.pane.querySelector('[data-bp-mode="manual"]').click();
  await new Promise(resolve => setImmediate(resolve));
  const frame = f.pane.querySelector('iframe'); assert.ok(frame);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.match(frame.getAttribute('src'), /blueprints\/project-a\.html/);
});

test('off-tab detail changes invalidate the cached blueprint before returning', async t => {
  const f = fixture(); t.after(() => f.dom.window.close());
  await f.context.render(); assert.equal(f.pane.querySelectorAll('.bp-card').length, 1);
  f.context.api.projectForgeGetProject = async () => ({...f.state.detail,
    timeline: [{id: 1, reason: 'batch reason'}, {id: 2, reason: 'new change'}]});
  f.context.api.projectForgeGetBatch = async () => ({nodes: [{id: 8, file_path: 'later.js', op: 'edit'}]});
  await f.context.select('project-a', {keepTab: true});
  await f.context.render();
  assert.equal(f.pane.querySelectorAll('.bp-card').length, 2);
  assert.match(f.pane.textContent, /later.js/);
});

test('late same-project detail responses cannot replace a newer refresh', async t => {
  const f = fixture(), first = deferred(), second = deferred(); t.after(() => f.dom.window.close());
  let calls = 0;
  f.context.api.projectForgeGetProject = () => ++calls === 1 ? first.promise : second.promise;
  const old = f.context.select('project-a'), latest = f.context.select('project-a');
  const current = {...f.state.detail, revision: 'new'};
  second.resolve(current); await latest;
  first.resolve({...current, revision: 'old'}); await old;
  assert.equal(f.state.detail.revision, 'new');
});

test('a switched project rejects the previous detail response', async t => {
  const f = fixture(), gate = deferred(); t.after(() => f.dom.window.close());
  const initial = f.state.detail;
  f.context.api.projectForgeGetProject = () => gate.promise;
  const pending = f.context.select('project-a'); f.state.currentId = 'project-b';
  gate.resolve({...initial, revision: 'old-a'}); await pending;
  assert.equal(f.state.detail, initial);
});
