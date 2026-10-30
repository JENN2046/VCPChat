import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { loadCiSourceContext } from '../scripts/ci-source-context.mjs';

const require = createRequire(import.meta.url);
const { createAppFeatures, readFeatureManifests } = require('../modules/appFeatures.js');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const quiet = { warn() {}, error() {}, log() {} };

test('feature annotations expose only bounded test metadata, never diagnostic payloads', async () => {
    const annotate = require('../scripts/feature-test-annotations.cjs');
    const secret = 'synthetic-sensitive-diagnostic';
    async function* events() {
        yield { type: 'test:stdout', data: { message: secret } };
        yield { type: 'test:stderr', data: { message: secret } };
        yield { type: 'test:diagnostic', data: { message: secret } };
        yield { type: 'test:fail', data: { name: 'safe failure\n::notice::literal',
            file: path.join(projectRoot, 'tests', 'fixture.test.cjs'), line: 7,
            details: { error: { message: secret, stack: secret, actual: secret, expected: secret } } } };
        yield { type: 'test:fail', data: { name: '/outside/private.test.cjs', file: '/outside/private.test.cjs', line: -1 } };
    }
    let output = '';
    for await (const chunk of annotate(events())) output += chunk;
    assert.match(output, /::error file=tests\/fixture\.test\.cjs,line=7::Feature test failed: safe failure%0A::notice::literal/);
    assert.match(output, /::error file=unknown-test,line=1::Feature test failed: unknown-test/);
    assert.equal(output.includes(secret), false);
    assert.equal(output.includes('/outside/'), false);
});

test('feature annotation reporter keeps the failing Node test exit status', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-annotation-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'failure.test.cjs');
    fs.writeFileSync(file, "require('node:test')('annotation fixture failure',()=>{throw Error('controlled fixture failure')});\n");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // The child is a standalone runner, not another test-file worker.
    let result;
    try {
        execFileSync(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
            '--test-reporter=./scripts/feature-test-annotations.cjs', '--test-reporter-destination=stdout', file],
            { cwd: projectRoot, encoding: 'utf8', windowsHide: true, env });
        assert.fail('a failing test must fail the process');
    } catch (error) { result = error; }
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error file=unknown-test,line=1::Feature test failed: annotation fixture failure/);
});

function fixture(t, features) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-features-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const modulesDir = path.join(root, 'modules');
    for (const [folder, manifest] of Object.entries(features)) {
        const dir = path.join(modulesDir, folder);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'feature.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
        fs.writeFileSync(path.join(dir, 'index.js'), '');
    }
    fs.mkdirSync(path.join(modulesDir, 'plain'), { recursive: true });
    return { root, modulesDir, appDataRoot: path.join(root, 'AppData') };
}

function loader(paths, extra = {}) {
    return createAppFeatures({ projectRoot: paths.root, appDataRoot: paths.appDataRoot, modulesDir: paths.modulesDir, logger: quiet, ...extra });
}

test('only folders with a valid feature.json are features, and invalid ones are listed but never loaded', (t) => {
    const paths = fixture(t, {
        good: { name: 'Good', main: 'index.js', renderer: 'ui/good.js' },
        escape: { name: 'Escape', main: '../../outside.js' },
        badRenderer: { name: 'BadRenderer', main: 'index.js', renderer: '../outside.js' },
        badScheme: { name: 'BadScheme', main: 'index.js', schemes: [{ scheme: 'Has Space' }] },
        badScript: { name: 'BadScript', main: 'index.js', scripts: { install: ['../outside.cjs'] } },
        badScriptType: { name: 'BadScriptType', main: 'index.js', scripts: { install: ['setup.sh'] } },
        badTests: { name: 'BadTests', main: 'index.js', tests: ['../outside.test.mjs'] },
        broken: '{ not json',
        dup: { name: 'Good', main: 'index.js' },
    });
    const features = loader(paths);
    const list = features.list();
    assert.deepEqual(list.map((f) => f.folder), ['badRenderer', 'badScheme', 'badScript', 'badScriptType', 'badTests', 'broken', 'dup', 'escape', 'good']);
    assert.deepEqual(list.filter((f) => !f.error).map((f) => f.name), ['Good']);
    assert.ok(list.filter((f) => f.error).every((f) => f.enabled === false));
    assert.equal(list.find((f) => f.folder === 'good').relativePath, 'modules/good');
});

test('build scripts and tests are normalized project paths and are read regardless of the enable state', (t) => {
    const paths = fixture(t, {
        a: { name: 'A', main: 'index.js', scripts: { install: ['./scripts/a/setup.cjs'], package: ['scripts/a/setup.cjs', '--strict'] }, tests: ['tests/../tests/a.test.mjs'], defaultEnabled: false },
        b: { name: 'B', main: 'index.js' },
    });
    const [a, b] = readFeatureManifests({ projectRoot: paths.root, modulesDir: paths.modulesDir });
    assert.equal(a.error, null);
    assert.deepEqual(a.scripts, { install: ['scripts/a/setup.cjs'], package: ['scripts/a/setup.cjs', '--strict'] });
    assert.deepEqual(a.tests, ['tests/a.test.mjs']);
    assert.equal('enabled' in a, false);
    assert.deepEqual([b.scripts, b.tests], [{}, []]);
});

test('schemes of enabled features are registered in one call, and disabled features register nothing', (t) => {
    const paths = fixture(t, {
        a: { name: 'A', main: 'index.js', schemes: [{ scheme: 'vcp-a', privileges: { standard: true } }] },
        b: { name: 'B', main: 'index.js', schemes: [{ scheme: 'vcp-a' }, { scheme: 'vcp-b' }] },
        c: { name: 'C', main: 'index.js', schemes: [{ scheme: 'vcp-c' }], defaultEnabled: false },
    });
    const calls = [];
    const protocol = { registerSchemesAsPrivileged: (schemes) => calls.push(schemes) };
    assert.deepEqual(loader(paths).registerSchemes(protocol), ['vcp-a', 'vcp-b']);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [{ scheme: 'vcp-a', privileges: { standard: true } }, { scheme: 'vcp-b', privileges: {} }]);

    fs.mkdirSync(paths.appDataRoot, { recursive: true });
    fs.writeFileSync(path.join(paths.appDataRoot, 'features.json'), JSON.stringify({ disabled: ['A', 'B'] }));
    const none = [];
    loader(paths).registerSchemes({ registerSchemesAsPrivileged: (schemes) => none.push(schemes) });
    assert.deepEqual(none, []);
});

test('registerAll hands every feature the host, isolates failures, and disposes in reverse order', async (t) => {
    const paths = fixture(t, {
        a: { name: 'A', main: 'index.js', renderer: 'ui/a.js' },
        b: { name: 'B', main: 'index.js', renderer: 'ui/b.js' },
        c: { name: 'C', main: 'index.js' },
        off: { name: 'Off', main: 'index.js', renderer: 'ui/off.js', defaultEnabled: false },
    });
    const required = [];
    const disposed = [];
    const requireModule = (file) => {
        const name = path.basename(path.dirname(file));
        required.push(name);
        if (name === 'b') throw new Error('boom');
        return { register: (host) => ({ host, dispose: () => disposed.push(host.feature.name) }) };
    };
    const features = loader(paths, { requireModule });
    assert.deepEqual(features.rendererEntries(), [], 'nothing is loaded before registerAll');
    assert.deepEqual(features.registerAll({ hooks: 'hooks' }), ['A', 'C']);
    assert.deepEqual(required, ['a', 'b', 'c'], 'a disabled feature is never required');
    assert.deepEqual(features.rendererEntries(), [{ name: 'A', renderer: 'ui/a.js' }], 'only features that loaded get a renderer entry');
    assert.deepEqual(features.list().map((f) => [f.name, f.active]), [['A', true], ['B', false], ['C', true], ['Off', false]]);
    await features.disposeAll();
    assert.deepEqual(disposed, ['C', 'A']);

    const handlers = new Map();
    const listeners = new Map();
    features.installIpc({ handle: (channel, fn) => handlers.set(channel, fn), on: (channel, fn) => listeners.set(channel, fn) });
    assert.deepEqual([...handlers.keys()], ['app-features:renderer-entries']);
    const event = {};
    listeners.get('app-features:inactive-folders')(event);
    assert.deepEqual(event.returnValue, ['off'], 'the preload learns which feature folders to leave out');
});

test('setEnabled writes the state file and reports when a restart is needed', (t) => {
    const paths = fixture(t, { a: { name: 'A', main: 'index.js' } });
    const features = loader(paths, { requireModule: () => ({ register: () => ({}) }) });
    features.registerAll({});
    assert.deepEqual(features.setEnabled('A', false), { name: 'A', enabled: false, restartRequired: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(paths.appDataRoot, 'features.json'), 'utf8')), { disabled: ['A'] });
    assert.equal(features.list()[0].enabled, false);
    assert.equal(features.list()[0].active, true, 'the running copy stays loaded until restart');
    assert.deepEqual(features.setEnabled('A', true), { name: 'A', enabled: true, restartRequired: false });
    assert.throws(() => features.setEnabled('Missing', true), /Missing/);
});

test('the desk pet is a feature whose manifest matches its own scheme and entry points', () => {
    const features = createAppFeatures({ projectRoot, appDataRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'app-features-real-')), logger: quiet });
    const pet = features.list().find((f) => f.name === 'DeskPet');
    assert.ok(pet, 'modules/deskpet/feature.json is discovered');
    assert.equal(pet.error, null);
    assert.equal(pet.enabled, true);
    const { SCHEME } = require('../modules/deskpet/petAssets.js');
    assert.deepEqual(pet.manifest.schemes.map((s) => s.scheme), [SCHEME]);
    assert.ok(fs.existsSync(path.join(projectRoot, pet.manifest.renderer)));
    assert.deepEqual(Object.keys(require('../modules/deskpet/index.js')), ['register']);
    const renderer = fs.readFileSync(path.join(projectRoot, pet.manifest.renderer), 'utf8');
    assert.match(renderer, /export function install\(/);
});

test('the preload registry leaves out the APIs of inactive feature folders', () => {
    const { loadRegistry } = require('../preloads/core/registry.js');
    const all = [...loadRegistry().values()];
    assert.ok(all.some((item) => item.domain === 'deskpet'), 'every feature API loads by default');
    const without = [...loadRegistry({ skipFeatures: ['deskpet'] }).values()];
    assert.equal(without.some((item) => item.domain === 'deskpet'), false);
    assert.equal(without.length, all.filter((item) => item.domain !== 'deskpet').length);
    assert.equal(loadRegistry(), loadRegistry(), 'each variant is cached');
});

test('every declared build script and test of the bundled features exists', () => {
    for (const feature of readFeatureManifests({ projectRoot })) {
        assert.equal(feature.error, null, feature.folder);
        for (const file of [...Object.values(feature.scripts).map((args) => args[0]), ...feature.tests]) {
            assert.ok(fs.existsSync(path.join(projectRoot, file)), `${feature.name}: ${file}`);
        }
    }
});

// Shared voice IPC names and comments may describe a peer without importing its
// optional feature. Keep the actual module/path dependency boundary enforced.
function featurePathReferences(source, file) {
    const pathReference = /(?:^|[./\\])(?:deskpet|DeskPetmodules)(?:[./\\]|$)/i;
    if (!/\.(?:js|mjs|cjs)$/.test(file)) {
        return /["'][^"'\n]*(?:modules\/deskpet\/|DeskPetmodules\/|assets\/deskpet\/)/i.test(source) ? ['static feature path'] : [];
    }
    const ast = parse(source, { sourceType: 'unambiguous', allowReturnOutsideFunction: true, plugins: ['jsx'] });
    const references = [];
    const auditInventories = new Set();
    const visit = (node, parent = null) => {
        if (!node || typeof node !== 'object') return;
        if (file === 'scripts/check-design-system-boundary.mjs' && node.type === 'VariableDeclarator'
            && node.id.name === 'allowedSourceDifferences' && node.init?.type === 'NewExpression'
            && node.init.callee.name === 'Set' && node.init.arguments[0]?.type === 'ArrayExpression') auditInventories.add(node.init.arguments[0]);
        if (node.type === 'StringLiteral' && pathReference.test(node.value) && !auditInventories.has(parent)) references.push(node.value);
        if (node.type === 'TemplateElement' && pathReference.test(node.value.raw)) references.push(node.value.raw);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child => visit(child, node));
            else if (value && typeof value === 'object') visit(value, node);
        }
    };
    visit(ast);
    return references;
}

test('feature dependency boundary rejects imports and paths but permits shared peer protocol names', () => {
    assert.deepEqual(featurePathReferences("const x = require('./deskpet/petHandlers');", 'core.js'), ['./deskpet/petHandlers']);
    assert.deepEqual(featurePathReferences("import x from './DeskPetmodules/index.js';", 'core.mjs'), ['./DeskPetmodules/index.js']);
    assert.deepEqual(featurePathReferences("const channel = 'voice-chat:deskpet-send'; // 桌宠 peer", 'core.js'), []);
    assert.deepEqual(featurePathReferences("const allowedSourceDifferences = new Set(['DeskPetmodules/index.js']);", 'scripts/check-design-system-boundary.mjs'), []);
    assert.deepEqual(featurePathReferences("const allowedSourceDifferences = new Set([require('./DeskPetmodules/index.js')]);", 'scripts/check-design-system-boundary.mjs'), ['./DeskPetmodules/index.js']);
});

test('core code does not import the desk pet or bind feature paths outside its loader', () => {
    const owned = ['modules/deskpet/', 'DeskPetmodules/', 'assets/deskpet/', 'scripts/deskpet/', 'tests/', 'docs/', 'vendor/', 'VCPDistributedServer/Plugin/',
        'AppData/', 'UserData/', 'state-private/', 'artifacts/', 'node_modules/'];
    const context = loadCiSourceContext(projectRoot);
    const files = context?.trackedFiles || execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        { cwd: projectRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
    const offenders = files.filter(file => /\.(?:js|mjs|cjs|html|css)$/.test(file))
        .filter(file => !owned.some(prefix => file.startsWith(prefix)))
        .filter(file => !file.split('/').some(part => ['appdata', 'userdata', 'state-private', 'node_modules', 'logs', 'secrets', 'tokens', 'cookies'].includes(part.toLowerCase())))
        .filter(file => {
            // CI must supply every inspected core body through its hash-bound
            // projection. Never replace full Git metadata with a partial walk.
            const source = context ? context.readCommitted(file) : fs.readFileSync(path.join(projectRoot, file), 'utf8');
            return /deskpet|桌宠/i.test(source) && featurePathReferences(source, file).length;
        });
    assert.deepEqual(offenders, []);

    // npm scripts 只经 scripts/app-features.cjs 走功能清单
    const { scripts } = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    assert.deepEqual(Object.entries(scripts).filter(([name, command]) => /deskpet|桌宠/i.test(name + command)), []);
});
