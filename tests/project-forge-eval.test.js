'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ES = require('../VCPDistributedServer/Plugin/ProjectForge/evalSymbol');
const { runProcess } = require('../VCPDistributedServer/Plugin/ProjectForge/evalProcess');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-eval-test-'));
test.after(async () => { await ES.cleanup(); fs.rmSync(tmp, { recursive: true, force: true }); });
function fixture(name, text) {
    const file = path.join(tmp, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
}
async function evaluate(file, symbol, args = {}) {
    return ES.evaluate({
        root: tmp, file, symbol, args,
        sourceHash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    });
}

for (const language of ['javascript', 'python']) test(`packaged ${language} evaluation uses its unpacked worker`, async t => {
    if (language === 'python') {
        const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
        if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    }
    const layout = path.join(tmp, `packaged-${language}`);
    const relative = 'VCPDistributedServer/Plugin/ProjectForge';
    const archived = path.join(layout, 'resources', 'app.asar', relative);
    const unpacked = path.join(layout, 'resources', 'app.asar.unpacked', relative);
    const project = path.join(layout, 'project');
    for (const dir of [archived, unpacked, project]) fs.mkdirSync(dir, { recursive: true });
    const source = path.resolve(__dirname, '../VCPDistributedServer/Plugin/ProjectForge');
    for (const name of ['evalSymbol.js', 'evalProcess.js', 'args.js']) fs.copyFileSync(path.join(source, name), path.join(archived, name));
    const worker = language === 'javascript' ? 'evalWorker.cjs' : 'evalWorker.py';
    fs.copyFileSync(path.join(source, worker), path.join(unpacked, worker));
    assert.equal(fs.existsSync(path.join(archived, worker)), false);
    const file = path.join(project, language === 'javascript' ? 'fixture.cjs' : 'packaged_eval_fixture.py');
    fs.writeFileSync(file, language === 'javascript'
        ? 'module.exports = { plus: (a,b) => a+b };\n'
        : 'def plus(a,b):\n    return a+b\n');
    const packaged = require(path.join(archived, 'evalSymbol.js'));
    try {
        const result = await packaged.evaluate({ root: project, file, symbol: 'plus', args: { args: [2, 5] },
            sourceHash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
        assert.equal(result.status, 'returned', JSON.stringify(result));
        assert.equal(result.value, 7);
    } finally { await packaged.cleanup(); }
});

test('JS: real CJS exports, this, async, setup, tagged values, fresh process', async () => {
    const file = fixture('math.cjs', `
let calls = 0;
exports.add = (a,b) => a+b;
exports.obj = { n: 7, run(x) { return this.n+x; } };
exports.asyncValue = async () => 12;
exports.big = () => 123n;
exports.missing = () => undefined;
exports.count = () => ++calls;
exports.loop = () => { while(true) {} };
exports.cycle = () => { const x={}; x.x=x; return x; };
exports.fail = () => { throw new Error('expected failure'); };
console.log('module startup');
`);
    assert.equal((await evaluate(file, 'add', { args: '[2,3]' })).value, 5);
    assert.equal((await evaluate(file, 'obj.run', { args: [2] })).value, 9);
    assert.equal((await evaluate(file, 'asyncValue')).value, 12);
    assert.equal((await evaluate(file, 'add', { setup: 'return [6, 7];' })).value, 13);
    assert.deepEqual((await evaluate(file, 'big')).value, { $type: 'bigint', value: '123' });
    assert.deepEqual((await evaluate(file, 'missing')).value, { $type: 'undefined' });
    assert.equal((await evaluate(file, 'count')).value, 1);
    assert.equal((await evaluate(file, 'count')).value, 1);
    assert.equal((await evaluate(file, 'cycle')).status, 'encoding_error');
    assert.equal((await evaluate(file, 'fail')).status, 'execution_error');
    assert.equal((await evaluate(file, 'noExport')).status, 'not_callable');
    assert.equal((await evaluate(file, 'loop', { timeoutms: 300 })).status, 'timeout');
    assert.equal((await evaluate(file, 'add', { args: [], setup: 'return [];' })).status, 'invalid_arguments');
});

test('JS: ESM module and bounded logs', async () => {
    const file = fixture('esm.mjs', 'export function run(){ console.log("x".repeat(100000)); return {ok:true}; }');
    const result = await evaluate(file, 'run');
    assert.equal(result.status, 'returned');
    assert.deepEqual(result.value, { $type: 'object', entries: [['ok', true]] });
    assert.equal(result.logs.stdout.truncated, true);
    assert.ok(result.logs.stdout.text.length <= 65536);
});

test('JS: synthetic named CommonJS exports retain the real export object receiver', async () => {
    fixture('review-commonjs/package.json', '{"type":"commonjs"}');
    for (const ext of ['cjs', 'js']) {
        const file = fixture(`review-commonjs/receiver.${ext}`, "'use strict'; exports.n = 0; exports.run = function () { return ++this.n; };\n");
        for (const symbol of ['run', 'exports.run', 'module.exports.run']) {
            const result = await evaluate(file, symbol);
            assert.equal(result.status, 'returned', JSON.stringify(result));
            assert.equal(result.value, 1);
        }
    }
});

test('JS: a directly exported default callable resolves by its selected source name', async () => {
    for (const [name, source] of [
        ['review-default.mjs', 'export default function add(a,b) { return a+b; }'],
        ['review-default.cjs', 'function add(a,b) { return a+b; } module.exports = add;'],
        ['review-default-arrow.mjs', 'const add = (a,b) => a+b; export default add;'],
    ]) {
        const file = fixture(name, source);
        for (const args of [{ args: [2, 5] }, { setup: 'return [3, 4];' }]) {
            const result = await evaluate(file, 'add', args);
            assert.equal(result.status, 'returned', JSON.stringify(result));
            assert.equal(result.value, 7);
        }
    }
});

test('JS: default-callable fallback cannot substitute a different or ambiguous source symbol', async () => {
    const file = fixture('review-default-other.mjs', 'function hidden(){ return 1; } export default function actual(){ return 2; }');
    const rejected = await evaluate(file, 'hidden', { setup: 'throw new Error("setup must not run");' });
    assert.equal(rejected.status, 'not_callable');
    const ambiguous = fixture('review-default-ambiguous.mjs', 'export const run = () => 1; export default { run: () => 2 };');
    assert.equal((await evaluate(ambiguous, 'run')).status, 'not_callable');
    const qualified = fixture('review-esm-exports.mjs', 'export const exports={n:3,run(){return this.n;}}; export default {run(){return 99;}};');
    assert.equal((await evaluate(qualified, 'exports.run')).value, 3);
    const direct = fixture('review-cjs-default-member.cjs', 'function add(){return 99;} module.exports=add;');
    assert.equal((await evaluate(direct, 'exports.add')).status, 'not_callable');
});

test('Python: certify source bytes instead of a matching timestamp bytecode cache', async t => {
    const python = process.platform === 'win32' ? 'python.exe' : 'python3';
    const probe = await runProcess(python, ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    for (const mode of ['TIMESTAMP', 'UNCHECKED_HASH']) for (const kind of ['module', 'package', 'filename', 'collision']) {
        const packaged = kind === 'package', prefix = `review_cached_${mode.toLowerCase()}`;
        const name = packaged ? `${prefix}_package/entry.py` : kind === 'filename' ? `${prefix}-source.py`
            : kind === 'collision' ? `${prefix}/math.py` : `${prefix}_source.py`;
        if (packaged) fixture(`${prefix}_package/__init__.py`, 'from .entry import value\nobserved = value()\n');
        const oldSource = 'def value():\n    return 1\n' + (packaged
            ? 'def observed_at_import():\n    from . import observed\n    return observed\n' : '');
        const file = fixture(name, oldSource);
        const timestamp = new Date('2024-01-01T00:00:00Z');
        fs.utimesSync(file, timestamp, timestamp);
        const compile = await runProcess(python, ['-c', 'import py_compile,sys; print(py_compile.compile(sys.argv[1], doraise=True, invalidation_mode=getattr(py_compile.PycInvalidationMode,sys.argv[2])))', file, mode], { timeoutMs: 3000 });
        assert.equal(compile.exitCode, 0, JSON.stringify(compile));
        const cache = compile.stdout.text.trim(), bytecode = fs.readFileSync(cache);
        const newSource = oldSource.replace('return 1', 'return 2');
        assert.equal(Buffer.byteLength(oldSource), Buffer.byteLength(newSource));
        fs.writeFileSync(file, newSource);fs.utimesSync(file, timestamp, timestamp);
        const result = await evaluate(file, 'value');
        assert.equal(result.status, 'returned', JSON.stringify(result));
        assert.equal(result.value, 2);
        if (kind === 'module') {
            const hook = path.dirname(fixture(`preload-${mode}/sitecustomize.py`, `import ${prefix}_source\n`));
            const inherited = process.env.PYTHONPATH;
            try {
                process.env.PYTHONPATH = [hook, tmp, inherited].filter(Boolean).join(path.delimiter);
                const preloaded = await evaluate(file, 'value');
                assert.equal(preloaded.status, 'returned', JSON.stringify(preloaded));
                assert.equal(preloaded.value, 2);
            } finally {
                if (inherited === undefined) delete process.env.PYTHONPATH;
                else process.env.PYTHONPATH = inherited;
            }
        }
        if (packaged) assert.equal((await evaluate(file, 'observed_at_import')).value, 2);
        assert.deepEqual(fs.readFileSync(cache), bytecode, 'an existing cache is neither trusted nor rewritten/deleted');
    }
    const changed = fixture('review_source_mutation.py', 'from pathlib import Path\ndef run():\n    Path(__file__).write_text("# changed\\n")\n    return 1\n');
    assert.equal((await evaluate(changed, 'run')).status, 'source_changed');
});

test('Python: standalone names do not replace modules already used by the worker', async t => {
    const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    for (const name of ['math', 'json', 'asyncio', 'inspect', 'sys']) {
        const file = fixture(`standalone/${name}.py`, `import ${name} as original\nimport sys\ndef add(a,b):\n    assert original is not sys.modules[__name__]\n    return a+b\n`);
        const result = await evaluate(file, 'add', { args: [2, 5] });
        assert.equal(result.status, 'returned', JSON.stringify(result));
        assert.equal(result.value, 7);
    }
    // A conflicting real package cannot safely be renamed: its relative
    // imports need the package identity, unlike a standalone source file.
    const conflict = fixture('json/__init__.py', 'def run():\n    return 1\n');
    assert.equal((await evaluate(conflict, 'run')).status, 'load_error');
});

test('Python: module loading and synchronous calls own their asyncio lifecycle', async t => {
    const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    const common = 'import asyncio\nasync def inner():\n    await asyncio.sleep(0)\n    return 7\n';
    for (const [name, body] of [
        ['sync_lifecycle', 'def run():\n    return asyncio.run(inner())\n'],
        ['import_lifecycle', 'initial = asyncio.run(inner())\ndef run():\n    return initial\n'],
        ['returned_coroutine', 'def run():\n    return inner()\n'],
        ['returned_awaitable', 'class Value:\n    def __await__(self):\n        return inner().__await__()\ndef run():\n    return Value()\n'],
        ['async_target', 'async def run():\n    return await inner()\n'],
    ]) {
        await t.test(name, async () => {
            const file = fixture(`${name}.py`, common + body);
            const result = await evaluate(file, 'run');
            assert.equal(result.status, 'returned', JSON.stringify(result));
            assert.equal(result.value, 7);
        });
    }
    fixture('lifecycle_pkg/__init__.py', common + 'initial = asyncio.run(inner())\n');
    const packaged = fixture('lifecycle_pkg/entry.py', 'from . import initial\ndef run():\n    return initial\n');
    assert.equal((await evaluate(packaged, 'run')).value, 7);
    const setup = fixture('async_setup.py', common + 'def add(a):\n    return a + asyncio.run(inner())\n');
    const configured = await evaluate(setup, 'add', { setup: 'import asyncio\nawait asyncio.sleep(0)\nreturn [4]' });
    assert.equal(configured.status, 'returned', JSON.stringify(configured));
    assert.equal(configured.value, 11);
    const failure = fixture('async_failure.py', 'async def run():\n    raise ValueError("expected async failure")\n');
    assert.equal((await evaluate(failure, 'run')).status, 'execution_error');
});

test('worker spawn failure is explicit', async () => {
    const result = await runProcess(path.join(tmp, 'no-such-runtime'), [], { timeoutMs: 1000 });
    assert.equal(result.status, 'environment_error');
});

test('Python: package relative import, kwargs, async, setup, errors', async t => {
    const probe = await runProcess(process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Python unavailable');
    fixture('pkg/__init__.py', '');
    fixture('pkg/helper.py', 'BASE = 8\n');
    const file = fixture('pkg/math.py', `
from .helper import BASE
def add(a, *, b=0):
    return a+b+BASE
async def async_value():
    return 9
def big():
    return 10**30
def cycle():
    x=[]
    x.append(x)
    return x
def loop():
    while True:
        pass
`);
    assert.equal((await evaluate(file, 'add', { args: [2], kwargs: { b: 3 } })).value, 13);
    assert.equal((await evaluate(file, 'async_value')).value, 9);
    assert.equal((await evaluate(file, 'add', { setup: 'return [4]' })).value, 12);
    assert.equal((await evaluate(file, 'big')).value.$type, 'bigint');
    assert.equal((await evaluate(file, 'cycle')).status, 'encoding_error');
    assert.equal((await evaluate(file, 'loop', { timeoutms: 300 })).status, 'timeout');
    assert.equal(fs.existsSync(path.join(tmp, 'pkg', '__pycache__')), false);
});

test('Rust: compile, list, exact test, fail, ignored and zero match', async t => {
    const probe = await runProcess('cargo', ['--version'], { timeoutMs: 3000 });
    if (probe.status !== 'exited' || probe.exitCode !== 0) return t.skip('Cargo unavailable');
    fixture('Cargo.toml', '[package]\nname="pf_eval_fixture"\nversion="0.1.0"\nedition="2021"\n');
    const file = fixture('src/lib.rs', `
mod child;
#[cfg(test)]
mod tests {
    #[test]
    fn success() { assert_eq!(2+2,4); }
    #[test]
    fn failure() { assert_eq!(1,2); }
    #[test]
    #[ignore]
    fn ignored() {}
}
`);
    const child = fixture('src/child.rs', '#[test]\nfn success() { assert!(true); }\nfn absent() {}\n');
    assert.equal((await evaluate(child, 'success', { timeoutms: 30000 })).status, 'passed');
    assert.equal((await evaluate(child, 'tests.success', { timeoutms: 30000 })).status, 'not_found');
    assert.equal((await evaluate(child, 'absent', { timeoutms: 30000 })).status, 'not_found');
    assert.equal((await evaluate(file, 'tests.success', { timeoutms: 30000 })).status, 'passed');
    assert.equal((await evaluate(file, 'tests.failure', { timeoutms: 30000 })).status, 'test_failed');
    assert.equal((await evaluate(file, 'tests.ignored', { timeoutms: 30000 })).status, 'not_executed');
    assert.equal((await evaluate(file, 'tests.absent', { timeoutms: 30000 })).status, 'not_found');
});
