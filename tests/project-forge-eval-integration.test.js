'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const forge = require('../VCPDistributedServer/Plugin/ProjectForge/ProjectForgeService');
const { resolveDefaultBinaryPath } = require('../VCPDistributedServer/Plugin/ProjectForge/indexerClient');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-eval-int-'));
let enabled = true;
let pid;
const call = args => forge.processToolCall(args);
test.before(async () => {
    forge.initialize({
        dbPath: path.join(tmp, 'db.sqlite'),
        services: { workspaceService: {
            list: () => [{ id: 'eval', alias: 'eval', path: tmp, enabled }],
            getActiveWorkspaceId: () => 'eval',
        } },
        logger: { log() {}, warn() {}, error() {} },
    });
    pid = (await call({ command: 'CreateProject', name: 'eval', dir: 'project' })).details.project.id;
});
test.after(async () => { await forge.cleanup(); fs.rmSync(tmp, { force: true, recursive: true }); });
test('EvalSymbol full entry: JS/MJS/CJS and stopped workspace', {
    skip: !fs.existsSync(resolveDefaultBinaryPath()) && 'AST binary unavailable',
}, async () => {
    for (const ext of ['js', 'mjs', 'cjs']) {
        const text = ext === 'mjs'
            ? 'export function plus(a,b) { return a+b; }\n'
            : 'function plus(a,b) { return a+b; }\nmodule.exports = { plus };\n';
        fs.writeFileSync(path.join(tmp, 'project', `math.${ext}`), text);
        const result = await call({ command: 'EvalSymbol', projectId: pid, path: `math.${ext}#plus`, args: '[2,5]' });
        assert.equal(result.details.status, 'returned', JSON.stringify(result));
        assert.equal(result.details.value, 7);
        assert.equal(result.details.checks.passed, 0);
        assert.match(result.details.sourceHash, /^[a-f0-9]{64}$/);
    }
    for (const [name, text, symbol, args, value] of [
        ['receiver.cjs', "'use strict'; exports.n=0; exports.run=function(){return ++this.n;};", 'run', [], 1],
        ['module-receiver.cjs', "'use strict'; module.exports.n=0; module.exports.run=function(){return ++this.n;};", 'run', [], 1],
        ['direct.cjs', 'function add(a,b){return a+b;} module.exports=add;', 'add', [2, 5], 7],
        ['direct.mjs', 'export default function add(a,b){return a+b;}', 'add', [2, 5], 7],
    ]) {
        fs.writeFileSync(path.join(tmp, 'project', name), text);
        const result = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#${symbol}`, args });
        assert.equal(result.details.status, 'returned', JSON.stringify(result));
        assert.equal(result.details.value, value);
    }
    enabled = false;
    try {
        await assert.rejects(call({ command: 'EvalSymbol', projectId: pid, path: 'math.js#plus' }), /只读|停用/);
    } finally { enabled = true; }
});
