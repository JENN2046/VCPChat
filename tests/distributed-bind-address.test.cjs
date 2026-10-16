'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const vm = require('node:vm'), http = require('node:http');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../VCPDistributedServer/VCPDistributedServer.js');
const realRequire = createRequire(filename);
function fixture(t, config) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'distributed-bind-'));
    if (config !== null) fs.writeFileSync(path.join(dir, 'config.env'), config);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, __dirname: dir, console, process,
        setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
        require: id => id === './Plugin.js' ? {} : realRequire(id)
    }, { filename });
    const server = new module.exports();
    t.after(async () => {
        if (server.server.listening) await new Promise(r => server.server.close(r));
        fs.rmSync(dir, { recursive: true, force: true });
    });
    return server;
}
test('omitted bind address preserves actual IPv4 wildcard listener', async t => {
    const server = fixture(t, null); server.loadServerConfig();
    const address = await server.bindHttpServer(0);
    assert.equal(address.address, '0.0.0.0');
});
test('explicit loopback binds initial listener and occupied-port fallback to loopback', async t => {
    const server = fixture(t, 'DIST_SERVER_PORT=0\nDIST_SERVER_BIND_ADDRESS=127.0.0.1\n');
    server.loadServerConfig();
    const occupied = http.createServer();
    await new Promise(r => occupied.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => occupied.close(r)));
    const address = await server.bindHttpServer(occupied.address().port);
    assert.equal(address.address, '127.0.0.1');
    assert.notEqual(address.port, occupied.address().port);
    const second = fixture(t, 'DIST_SERVER_BIND_ADDRESS=127.0.0.1\n');
    second.loadServerConfig();
    assert.equal((await second.bindHttpServer(0)).address, '127.0.0.1');
});
for (const value of ['', 'localhost', '127.0.0.999', '0.0.0.0:5974', 'SECRET_INVALID']) {
    test('invalid explicit address fails before listening: '+JSON.stringify(value), t => {
        const server = fixture(t, 'DIST_SERVER_BIND_ADDRESS='+value+'\n');
        assert.throws(() => server.loadServerConfig(), /DIST_SERVER_BIND_ADDRESS must be an IPv4 or IPv6 literal/);
        assert.equal(server.server.listening, false);
    });
}
test('valid but unavailable address fails instead of widening to wildcard', async t => {
    const server = fixture(t, 'DIST_SERVER_BIND_ADDRESS=192.0.2.123\n'); server.loadServerConfig();
    await assert.rejects(server.bindHttpServer(0), { code: 'EADDRNOTAVAIL' });
    assert.equal(server.server.listening, false);
});

test('existing unreadable config fails startup rather than defaulting to all interfaces', t => {
    const server = fixture(t, null);
    // Inject a filesystem permission failure; no listener may be attempted.
    const original = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
        if (String(file).endsWith('/config.env')) {
            const error = new Error('SYNTHETIC_PRIVATE_READ_FAILURE'); error.code = 'EACCES'; throw error;
        }
        return original.call(this, file, ...args);
    };
    try { assert.throws(() => server.loadServerConfig(), /DIST_SERVER_CONFIG_READ_FAILED/); }
    finally { fs.readFileSync = original; }
    assert.equal(server.server.listening, false);
});
