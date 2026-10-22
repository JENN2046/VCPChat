'use strict';
// Test-process-only guard, loaded through NODE_OPTIONS before the real main.js.
// It does not replace application modules, IPC handlers, pages or persistence.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { fileURLToPath } = require('node:url');
const allowed = path.resolve(__dirname, process.env.VCPCHAT_R7_MOBILE_PWA === '1' && process.env.VCPCHAT_R4_REAL_HOST === 'wp08'
    ? '../../../artifacts/native-sync-r7' : process.env.VCPCHAT_R6_FULL_TOOLBOX === '1' && process.env.VCPCHAT_R4_REAL_HOST === 'wp08'
    ? '../../../artifacts/native-sync-r6' : process.env.VCPCHAT_R5_TOOLBOX === '1' && process.env.VCPCHAT_R4_REAL_HOST === 'wp08'
    ? '../../../artifacts/native-sync-r5' : process.env.VCPCHAT_R4_REAL_HOST === 'wp08'
        ? '../../../artifacts/native-sync-r4' : '../../../artifacts/native-sync-r3');
const runRoot = path.resolve(process.env.VCPCHAT_R3_RUN_ROOT || '');
if (runRoot !== allowed && !runRoot.startsWith(allowed + path.sep)) throw new Error('Explicit R3 test root required');
const originals = { mkdir: fs.mkdirSync, write: fs.writeFileSync, read: fs.readFileSync, asyncRead: fsp.readFile.bind(fsp), rename: fsp.rename.bind(fsp) };
const evidence = { pid: process.pid, processType: process.type || 'node', blockedNetwork: [], blockedWrites: [], blockedReads: 0, listeners: [], faultsInjected: 0, fatal: null };
function inside(value) {
    const name = path.resolve(value instanceof URL ? fileURLToPath(value) : String(value)).toLowerCase();
    const base = runRoot.toLowerCase();
    return name === base || name.startsWith(base + path.sep);
}
function writable(value) {
    if (typeof value === 'number') return;
    if (!inside(value)) {
        const absolute = path.resolve(String(value));
        const project = path.resolve(__dirname, '..');
        evidence.blockedWrites.push(absolute.startsWith(project + path.sep) ? path.relative(project, absolute) : 'outside-test-root');
        throw Object.assign(new Error('R3 isolated write boundary: ' + evidence.blockedWrites.at(-1)), { code: 'R3_WRITE_DENIED' });
    }
}
function readable(value) {
    if (typeof value === 'number' || inside(value)) return;
    const name = String(value).replaceAll('\\', '/');
    if (/(^|\/)(state-private|cookies|credentials|tokens)(\/|$)/i.test(name) || /(^|\/)(\.env(?:\..*)?|config\.env|id_rsa|id_ed25519|credentials\.json|token\.json)$/i.test(name)) {
        evidence.blockedReads++;
        throw Object.assign(new Error('R3 sensitive read denied'), { code: 'R3_READ_DENIED' });
    }
}
for (const [object, methods, check] of [
    [fs, ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync'], writable],
    [fsp, ['writeFile', 'appendFile', 'mkdir', 'unlink', 'rm', 'rmdir'], writable],
    [fs, ['readFile', 'readFileSync'], readable], [fsp, ['readFile'], readable],
]) for (const method of methods) {
    const original = object[method];
    object[method] = function (file, ...args) {
        // fs-extra may ensure an already-existing source directory. This is a
        // metadata-only no-op; no outside directory may actually be created.
        if (!(method.startsWith('mkdir') && fs.existsSync(file) && fs.statSync(file).isDirectory())) check(file);
        return original.call(this, file, ...args);
    };
}
for (const object of [fs, fsp]) {
    for (const method of object === fs ? ['open', 'openSync'] : ['open']) {
        const original = object[method];
        object[method] = function (file, flags, ...args) {
            const write = typeof flags === 'number' ? Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) : /[wa+]/.test(flags || 'r');
            if (write) writable(file); else readable(file);
            return original.call(this, file, flags, ...args);
        };
    }
    for (const method of object === fs ? ['rename', 'renameSync', 'copyFile', 'copyFileSync'] : ['rename', 'copyFile']) {
        const original = object[method];
        object[method] = function (from, to, ...args) {
            if (method.startsWith('rename')) writable(from); else readable(from);
            writable(to); return original.call(this, from, to, ...args);
        };
    }
}
if (process.env.VCPCHAT_R3_FAIL_SYNC_FINALIZE === '1') {
    fsp.rename = async function (from, to) {
        writable(from); writable(to);
        if (String(to).endsWith(path.join('.native-sync', 'state.json'))) {
            const state = JSON.parse(await originals.asyncRead(from, 'utf8'));
            if (state.cursor > 0 && !state.pending) {
                evidence.faultsInjected++;
                throw Object.assign(new Error('Synthetic R3 sync-finalize fault'), { code: 'R3_FINALIZE_FAULT' });
            }
        }
        return originals.rename(from, to);
    };
}
const loopback = host => !host || ['127.0.0.1', '::1', 'localhost', '[::1]'].includes(String(host));
function networkOptions(args) {
    const first = args[0];
    if (Array.isArray(first)) return first[0];
    if (first && typeof first === 'object') return first;
    if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first };
    return { port: first, host: typeof args[1] === 'string' ? args[1] : undefined };
}
for (const [object, method] of [[net.Socket.prototype, 'connect'], [tls, 'connect']]) {
    const original = object[method];
    object[method] = function (...args) {
        const options = networkOptions(args);
        if (!options.path && !loopback(options.host || options.hostname)) {
            evidence.blockedNetwork.push(String(options.host || options.hostname));
            throw Object.assign(new Error('R3 non-loopback network denied'), { code: 'R3_NETWORK_DENIED' });
        }
        return original.apply(this, args);
    };
}
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
    const options = networkOptions(args);
    if (!options.path && (!options.host || !loopback(options.host))) throw Object.assign(new Error('R3 public listener denied'), { code: 'R3_PUBLIC_LISTEN_DENIED' });
    evidence.listeners.push({ host: options.host || 'pipe', port: options.port || null });
    return listen.apply(this, args);
};
function attachElectron() {
    const { app, session } = require('electron');
    if (!app || process.type !== 'browser') return;
    app.setPath('userData', process.env.VCPCHAT_APP_DATA_DIR);
    const guarded = new WeakSet();
    function guardSession(value) {
        if (guarded.has(value)) return; guarded.add(value);
        value.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
            const host = new URL(details.url).hostname;
            if (!loopback(host)) evidence.blockedNetwork.push(host);
            callback({ cancel: !loopback(host) });
        });
    }
    app.on('web-contents-created', (_event, contents) => guardSession(contents.session));
    app.whenReady().then(() => guardSession(session.defaultSession));
}
if (process.versions.electron) {
    try { attachElectron(); } catch { process.once('loaded', attachElectron); }
}
function saveEvidence() {
    try {
        const folder = path.join(runRoot, 'guard');
        originals.mkdir(folder, { recursive: true });
        originals.write(path.join(folder, `${process.pid}.json`), JSON.stringify(evidence, null, 2));
    } catch {}
}
process.on('exit', saveEvidence);
function fatal(error) {
    evidence.fatal = { name: error?.name, code: error?.code || null, message: String(error?.message || error).split('\n')[0], requireStack: (error?.requireStack || []).map(file => path.relative(path.resolve(__dirname, '..'), file)).slice(0, 6), frames: String(error?.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 8) };
    saveEvidence();
    try { require('electron').app.exit(1); } catch { process.exit(1); }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
