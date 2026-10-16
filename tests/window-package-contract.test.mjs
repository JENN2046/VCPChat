import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { contract, verifyWindowPackage, localDependencies } = require('../scripts/lib/window-package-contract.cjs');
const root = path.resolve(import.meta.dirname, '..');
const files = new Map([
    ['Fixture/window.html', Buffer.from('<link href="window.css" rel="stylesheet"><script src="window.js"></script>')],
    ['Fixture/window.css', Buffer.from('body{color:red}')],
    ['Fixture/window.js', Buffer.from('import "./dependency.js";')],
    ['Fixture/dependency.js', Buffer.from('export const ready = true;')],
    ['preload.js', Buffer.from('void 0;')],
]);
const resources = [{ path: 'Fixture/window.html', size: files.get('Fixture/window.html').length,
    sha256: crypto.createHash('sha256').update(files.get('Fixture/window.html')).digest('hex') }];
const windows = [{page:'Fixture/window.html',preload:'preload.js'}];
const readSource = p => files.get(p) || null;
const check = readPackaged => verifyWindowPackage({readSource,readPackaged,resources,windows});
test('window package recursively checks actual shipped page, style, script and import bytes', () => {
    assert.equal(check(readSource).checked.length, 5);
});
for (const missing of ['Fixture/window.html','Fixture/window.css','Fixture/window.js','Fixture/dependency.js','preload.js']) {
    test(`reject missing packaged resource ${missing}`, () => {
        assert.throws(() => check(p => p === missing ? null : readSource(p)), /Packaged window resource is missing/);
    });
}
test('reject corrupt packaged dependency', () => {
    assert.throws(() => check(p => p === 'Fixture/dependency.js' ? Buffer.from('changed') : readSource(p)), /differs/);
});
test('reject stale source identity and undeclared window', () => {
    assert.throws(() => verifyWindowPackage({readSource,readPackaged:readSource,resources:[{...resources[0],sha256:'0'.repeat(64)}],windows}), /identity mismatch/);
    assert.throws(() => verifyWindowPackage({readSource,readPackaged:readSource,resources,windows:[{page:'other.html'}]}), /not declared/);
});
test('dependencies respect containment and ignore external URLs', () => {
    assert.deepEqual(localDependencies('Fixture/window.html',Buffer.from('<script src="https://example.invalid/x.js"></script>')), []);
    assert.throws(() => localDependencies('window.html',Buffer.from('<script src="../../secret.js"></script>')), /Unsafe/);
});
test('WOFF2 is required while legacy font src alternatives are not separate dependencies', () => {
    assert.deepEqual(localDependencies('theme.css',Buffer.from('@font-face{src:url(a.woff2) format("woff2"),url(a.woff) format("woff")}')), ['a.woff2']);
    assert.deepEqual(localDependencies('theme.css',Buffer.from('body{background:url("data:image/svg+xml,<svg fill=\'url(%23n)\'></svg>")}')), []);
});
test('all documented window resources have exact build entries and current identities', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json')));
    for (const entry of contract.resources) {
        assert.ok(pkg.build.files.includes(entry.path), `Missing exact build.files entry: ${entry.path}`);
    }
    const read = relative => { const target=path.join(root,relative); return fs.existsSync(target)?fs.readFileSync(target):null; };
    const result=verifyWindowPackage({readSource:read,readPackaged:read});
    assert.equal(result.windows,11);
    // ProjectForge consumes the canvas vendor dependency even when canvas is not opened.
    assert.ok(contract.resources.some(entry=>entry.path==='Canvasmodules/vendor/diff_match_patch.js'));
});

test('game tools are exact package inputs with checked manifest and service bytes', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    const paths = [
        'VCPDistributedServer/Plugin/GameController/plugin-manifest.json',
        'VCPDistributedServer/Plugin/GameController/GameControllerService.js',
        'VCPDistributedServer/Plugin/ForgeTax/plugin-manifest.json',
        'VCPDistributedServer/Plugin/ForgeTax/forge-tax-service.js',
    ];
    const read = relative => { const target = path.join(root, relative); return fs.existsSync(target) ? fs.readFileSync(target) : null; };
    for (const file of paths) {
        assert.ok(pkg.build.files.includes(file), `Missing exact game plugin input: ${file}`);
        assert.ok(contract.resources.some(entry => entry.path === file), `Missing game plugin identity: ${file}`);
        assert.throws(() => verifyWindowPackage({ readSource: read,
            readPackaged: relative => relative === file ? null : read(relative) }), /Packaged window resource is missing/);
    }
});
