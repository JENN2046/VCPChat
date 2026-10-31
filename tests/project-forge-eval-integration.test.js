'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const forge = require('../VCPDistributedServer/Plugin/ProjectForge/ProjectForgeService');
const { resolveDefaultBinaryPath } = require('../VCPDistributedServer/Plugin/ProjectForge/indexerClient');
const { runProcess } = require('../VCPDistributedServer/Plugin/ProjectForge/evalProcess');
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

test('EvalSymbol full entry: Python standalone names and synchronous asyncio lifecycles', {
    skip: !fs.existsSync(resolveDefaultBinaryPath()) && 'AST binary unavailable',
}, async t => {
    const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    const common = 'import asyncio\nasync def inner():\n    await asyncio.sleep(0)\n    return 7\n';
    for (const [name, source, symbol, args] of [
        ['math.py', 'def add(a,b):\n    return a+b\n', 'add', [2, 5]],
        ['sync_lifecycle.py', common + 'def run():\n    return asyncio.run(inner())\n', 'run', []],
        ['import_lifecycle.py', common + 'initial=asyncio.run(inner())\ndef run():\n    return initial\n', 'run', []],
        ['returned_coroutine.py', common + 'def run():\n    return inner()\n', 'run', []],
    ]) {
        fs.writeFileSync(path.join(tmp, 'project', name), source);
        const result = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#${symbol}`, args });
        assert.equal(result.details.status, 'returned', JSON.stringify(result));
        assert.equal(result.details.value, 7);
    }
    const name = 'async_fixture.py';
    fs.writeFileSync(path.join(tmp, 'project', name), 'import asyncio\nasync def run(future,task):\n    asyncio.get_running_loop().call_soon(future.set_result, 3)\n    return await future + await task\n');
    const result = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#run`,
        setup: 'import asyncio\nasync def produce():\n    await asyncio.sleep(0)\n    return 4\nreturn [asyncio.get_running_loop().create_future(), asyncio.create_task(produce())]' });
    assert.equal(result.details.status, 'returned', JSON.stringify(result));
    assert.equal(result.details.value, 7);
});
test('EvalSymbol full entry: pick and line cannot certify a shadowed definition', {
    skip: !fs.existsSync(resolveDefaultBinaryPath()) && 'AST binary unavailable',
}, async t => {
    for (const [name, source] of [
        ['duplicate.py', 'def run():\n    return 1\ndef run():\n    return 2\n'],
        ['duplicate.cjs', 'function run(){return 1;}\nfunction run(){return 2;}\nmodule.exports={run};\n'],
        ['identical.cjs', 'function run(){return 2;}\nfunction run(){return 2;}\nmodule.exports={run};\n'],
    ]) {
        if (name.endsWith('.py')) {
            const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
            if (probe.status !== 'exited' || probe.exitCode !== 0) { t.diagnostic('Python unavailable'); continue; }
        }
        fs.writeFileSync(path.join(tmp, 'project', name), source);
        for (const choice of [{ pick: 1 }, { line: 1 }]) {
            const rejected = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#run`, ...choice });
            assert.equal(rejected.details.status, 'definition_mismatch', JSON.stringify(rejected));
            assert.equal(rejected.details.definition.start, 1);
        }
        const actual = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#run`, pick: 2 });
        assert.equal(actual.details.status, 'returned', JSON.stringify(actual));
        assert.equal(actual.details.value, 2);
        assert.equal(actual.details.runtimeDefinition.line, name.endsWith('.py') ? 3 : 2);
    }
    fs.writeFileSync(path.join(tmp, 'project', 'same-line.cjs'), 'function run(){return 1;} function run(){return 2;} module.exports={run};');
    const ambiguous = await call({ command: 'EvalSymbol', projectId: pid, path: 'same-line.cjs#run', pick: 2 });
    assert.equal(ambiguous.details.status, 'definition_mismatch', JSON.stringify(ambiguous));
    fs.writeFileSync(path.join(tmp, 'project', 'duplicate.rs'), '#[cfg(any())]\nfn run() {}\n#[cfg(not(any()))]\nfn run() {}\n');
    for (const pick of [1, 2]) {
        const rust = await call({ command: 'EvalSymbol', projectId: pid, path: 'duplicate.rs#run', pick });
        assert.equal(rust.details.status, 'definition_mismatch', JSON.stringify(rust));
    }
});

test('EvalSymbol full entry: valid async functions and decorated method identities remain callable', {
    skip: !fs.existsSync(resolveDefaultBinaryPath()) && 'AST binary unavailable',
}, async t => {
    for (const [name, source, symbol] of [
        ['identity-async.mjs', 'export async function run(){return 7;}\n', 'run'],
        ['identity_decorator.py', 'def keep(fn):\n    return fn\n@keep\ndef run():\n    return 7\n', 'run'],
        ['identity_static.py', 'class Box:\n    @staticmethod\n    def run():\n        return 7\n', 'Box.run'],
        ['identity_class.py', 'class Box:\n    @classmethod\n    def run(cls):\n        return 7\n', 'Box.run'],
    ]) {
        if (name.endsWith('.py')) {
            const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
            if (probe.status !== 'exited' || probe.exitCode !== 0) { t.diagnostic('Python unavailable'); continue; }
        }
        fs.writeFileSync(path.join(tmp, 'project', name), source);
        const result = await call({ command: 'EvalSymbol', projectId: pid, path: `${name}#${symbol}` });
        assert.equal(result.details.status, 'returned', JSON.stringify(result));
        assert.equal(result.details.value, 7);
        assert.ok(result.details.runtimeDefinition.line);
    }
});

test('EvalSymbol full entry: Rust dynamic linking uses Cargo for both list and execution', {
    skip: process.platform !== 'linux' || !fs.existsSync(resolveDefaultBinaryPath()),
}, async t => {
    const probe = await runProcess('cargo', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Cargo unavailable');
    const dir = path.join(tmp, 'project', 'dynamic');
    fs.mkdirSync(path.join(dir, '.cargo'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname="pf_entry_dynamic"\nversion="0.1.0"\nedition="2021"\n');
    fs.writeFileSync(path.join(dir, '.cargo/config.toml'), '[build]\nrustflags=["-C", "prefer-dynamic"]\n');
    fs.writeFileSync(path.join(dir, 'src/lib.rs'), '#[test]\nfn success() { assert_eq!(2+2,4); }\n');
    const result = await call({ command: 'EvalSymbol', projectId: pid, path: 'dynamic/src/lib.rs#success', timeoutMs: 30000 });
    assert.equal(result.details.status, 'passed', JSON.stringify(result));
    assert.deepEqual(result.details.checks, { passed: 1, failed: 0 });
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
