'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { installProjectForgeCloseGuard } = require('../modules/ipc/projectForgeCloseGuard');
const { minimatch } = require('minimatch');
const build = require('../package.json').build;

test('ProjectForge package includes only required runtime source and verified sidecars', () => {
    const files = new Set(build.files);
    for (const pattern of [
        'VCPDistributedServer/Plugin/ProjectForge/*.js',
        'VCPDistributedServer/Plugin/ProjectForge/plugin-manifest.json',
        'VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe',
        'VCPDistributedServer/shared/fileKit/*.js',
        'ProjectForgemodules/**/*',
    ]) assert.ok(files.has(pattern), pattern);
    assert.ok(build.asarUnpack.includes('VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe'));
    assert.ok(!files.has('VCPDistributedServer/Plugin/ProjectForge/**/*'), 'do not package config.env');
    const packaged = relative => [...files].some(pattern => !pattern.startsWith('!') && minimatch(relative, pattern));
    for (const relative of [
        'VCPDistributedServer/Plugin/ProjectForge/ProjectForgeService.js',
        'VCPDistributedServer/shared/fileKit/paths.js',
        'VCPDistributedServer/Plugin/ProjectForge/bin/win32-x64/projectforge_indexer.exe',
        'ProjectForgemodules/projectforge.html',
    ]) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', relative)), relative);
        assert.ok(packaged(relative), `not packaged: ${relative}`);
    }
    assert.equal(packaged('VCPDistributedServer/Plugin/ProjectForge/config.env'), false);
});

test('ProjectForge unload guard stays by default and allows explicit discard', () => {
    for (const choice of [0, 1, -1]) {
        const webContents = new EventEmitter();
        const win = { webContents };
        const dialog = { showMessageBoxSync: () => choice };
        let allowed = false;
        installProjectForgeCloseGuard(win, dialog);
        webContents.emit('will-prevent-unload', { preventDefault: () => { allowed = true; } });
        assert.equal(allowed, choice === 1);
    }
});

test('source editor registers a native beforeunload guard for dirty buffers', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'ProjectForgemodules/projectforge-source.js'), 'utf8');
    assert.match(source, /window\.addEventListener\('beforeunload', event => \{/);
    assert.match(source, /if \(!isDirty\(\)\) return;/);
});
