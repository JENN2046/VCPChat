'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(root, '../../artifacts/native-sync-r2');
const temp = path.join(artifacts, 'temp');
fs.mkdirSync(temp, { recursive: true });
const environment = { ...process.env, TEMP: temp, TMP: temp, NODE_PATH: [path.join(artifacts, 'deps/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) };
delete environment.ELECTRON_RUN_AS_NODE;
const groups = [];
function run(name, executable, args, timeout = 60000) {
    const started = Date.now();
    const result = spawnSync(executable, args, { cwd: root, env: environment, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    const output = (result.stdout || '') + (result.stderr || '');
    const count = field => Number(output.match(new RegExp(`(?:^|\\n)(?:# |ℹ )${field} (\\d+)`))?.[1] || 0);
    const group = { name, executable, args, exitCode: result.status, durationMs: Date.now() - started, tests: count('tests'), passed: count('pass'), failed: count('fail'), errorCode: result.error?.code || null };
    groups.push(group);
    console.log(JSON.stringify(group));
    if (result.status !== 0) {
        console.error(output.split(/\r?\n/).slice(-55).join('\n'));
        throw new Error(`${name} failed`);
    }
}
let result = 'BLOCKED', error = null, uiReceipt = null;
try {
    run('native-core-and-refresh', process.execPath, ['--test', '--test-reporter=tap', 'tests/native-sync-ipc.test.cjs', 'tests/native-sync-refresh.test.mjs']);
    run('native-regressions', process.execPath, ['--test', '--test-reporter=tap', 'tests/history-mutation-queue.test.cjs', 'tests/state-subscriptions.test.js', 'tests/preload-registry.test.js', 'tests/group-chat-queue-interrupt.test.js', 'tests/mobile-sync-canonical.test.js']);
    const command = require('../package.json').scripts['test:chat-kernel'];
    if (!command.startsWith('node --test ')) throw new Error('Review the changed Chat Kernel script before running');
    run('chat-kernel', process.execPath, command.split(/\s+/).slice(1), 60000);
    run('original-proof-13', process.execPath, ['--test', '--test-reporter=tap', path.resolve(root, '../sync-proof-r1/test/end-to-end.test.cjs')]);
    const electron = require('electron');
    const uiRoot = path.join(artifacts, `electron-final-${Date.now()}`);
    run('real-electron-ui', electron, ['tests/electron/native-sync-main.cjs', uiRoot], 60000);
    uiReceipt = path.join(uiRoot, 'electron-result.json');
    const ui = JSON.parse(fs.readFileSync(uiReceipt, 'utf8'));
    if (ui.result !== 'NATIVE_SYNC_WIRING_POC_PASS' || ui.checks.length < 7) throw new Error('Electron receipt incomplete');
    result = 'NATIVE_SYNC_WIRING_POC_PASS';
} catch (failure) { error = failure.message; process.exitCode = 1; }
const receipt = { result, baseline: 'e8c038398fde3723d656326af20903b83b226134', node: process.versions.node, platform: process.platform, date: new Date().toISOString(), groups, uiReceipt, error, scope: 'synthetic isolated data; loopback HTTP/SQLite; real Electron/preload/IPC/production message renderer; full application startup and real providers not run' };
fs.writeFileSync(path.join(artifacts, 'R2_TEST_RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(result);
