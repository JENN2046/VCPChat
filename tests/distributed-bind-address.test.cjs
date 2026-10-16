'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const vm = require('node:vm'), http = require('node:http');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../VCPDistributedServer/VCPDistributedServer.js');
const realRequire = createRequire(filename);
function fixture(t, config, options = {}, manager = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'distributed-bind-'));
    if (config !== null) fs.writeFileSync(path.join(dir, 'config.env'), config);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, __dirname: dir, console, process,
        setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
        require: Object.assign(id => id === './Plugin.js' ? manager : realRequire(id), {resolve:realRequire.resolve})
    }, { filename });
    const server = new module.exports(options);
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
for (const value of ['', 'localhost', '127.0.0.999', '0.0.0.0:5974', 'fe80::1%eth0', 'SECRET_INVALID']) {
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


function callbackManager() {
    const file = path.resolve(__dirname, '../VCPDistributedServer/Plugin.js');
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        module, exports: module.exports, __dirname: path.dirname(file), console, process,
        setTimeout, clearTimeout, setImmediate, Buffer, require: createRequire(file)
    }, { filename: file });
    const manager = module.exports;
    // Only discovery/service setup is a fixture; executePlugin spawns the real child.
    manager.loadPlugins = async () => {};
    manager.initializeServices = async () => {};
    return manager;
}
const lanAddress = Object.values(os.networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal)?.address;
const callbackCases = [['0.0.0.0', false], ['127.0.0.2', false], ['127.0.0.2', true], ['::1', false], ['::', false]];
if (lanAddress) callbackCases.push([lanAddress, false]);
for (const [host, fallback] of callbackCases) {
    test(`actual async callback reaches bound host ${host}, fallback=${fallback}`, async t => {
        const manager = callbackManager();
        const server = fixture(t, `DIST_SERVER_BIND_ADDRESS=${host}\n`, {}, manager);
        let port = 0;
        if (fallback) {
            const occupied = http.createServer();
            await new Promise((resolve, reject) => occupied.once('error', reject).listen(0, host, resolve));
            port = occupied.address().port;
            t.after(() => new Promise(r => occupied.close(r)));
        }
        server.port = port;
        server.registerDiagnosticRoutes = () => {};
        server.setupMusicPlaylistWatcher = () => {};
        server.connect = () => {};
        const received = [];
        server.sendMessage = payload => received.push(payload);
        await server.initializeInBackground();
        if (fallback) assert.notEqual(server.port, port);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callback-child-'));
        t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(dir, 'callback.cjs'), `
            const http = require('node:http');
            const url = process.env.CALLBACK_BASE_URL;
            const req = http.request(url, {method:'POST', headers:{'content-type':'application/json'}}, res => {
                res.resume(); res.on('end', () => console.log(JSON.stringify({status:'success',code:res.statusCode,url})));
            });
            req.on('error', () => process.exit(2));
            req.setTimeout(3000, () => { req.destroy(); process.exit(3); });
            req.end(JSON.stringify({synthetic:'callback-delivery'}));
        `);
        manager.plugins.set('SyntheticCallback', {name:'SyntheticCallback',pluginType:'asynchronous',basePath:dir,entryPoint:{command:`${process.execPath} callback.cjs`,timeout:5000}});
        const result = JSON.parse(await manager.executePlugin('SyntheticCallback', null));
        assert.equal(result.code, 200);
        const expectedHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host.includes(':') ? `[${host}]` : host;
        assert.equal(result.url, `http://${expectedHost}:${server.port}/plugin/callback`);
        assert.equal(received.length, 1);
        assert.equal(received[0].type, 'plugin_callback_forward');
        assert.equal(received[0].data.callbackData.synthetic, 'callback-delivery');
    });
}

for (const packaged of [true, false]) for (const present of [true, false]) {
    test(`actual main startup selects writable installed config: packaged=${packaged}, file=${present}`, async t => {
        const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-user-data-'));
        t.after(() => fs.rmSync(userData, {recursive:true,force:true}));
        const configPath = path.join(userData, 'VCPDistributedServer', 'config.env');
        if (present) { fs.mkdirSync(path.dirname(configPath)); fs.writeFileSync(configPath, 'DIST_SERVER_BIND_ADDRESS=127.0.0.2\nDIST_SERVER_PORT=0\n'); }
        const main = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
        const start = main.indexOf('function startDistributedServerAfterRenderer()');
        const chunk = main.slice(start, main.indexOf('function toggleDevToolsForWindow', start));
        let selected, loaded;
        const noop = {};
        const ctx = { path, console, app:{isPackaged:packaged,isQuitting:false,getPath(name){assert.equal(name,'userData');return userData;}},
            distributedServerStartPromise:null,distributedServer:null,isFinalizingQuit:false,
            mainWindow:{isDestroyed:()=>false,webContents:{}},appSettingsManager:{readSettings:async()=>({enableDistributedServer:true})},
            musicHandlers:noop,diceHandlers:noop,desktopRemoteHandlers:noop,chatDataService:noop,loomManager:noop,scriptoriumAgentControl:noop,pluginAgentOperationService:noop,chartService:noop,gameService:noop,workspaceHandlers:noop,
            require(id) {
                if (id.endsWith('nativeConversationHandlers')) return {bindingFromEnvironment:()=>null};
                if (id.endsWith('VCPDistributedServer.js')) return class {
                    constructor(options) { selected=options.configPath; loaded=fixture(t, null, options); }
                    async initialize() { loaded.loadServerConfig(); }
                };
                throw Error('Unexpected dependency '+id);
            }
        };
        vm.createContext(ctx);vm.runInContext(chunk,ctx);
        await ctx.startDistributedServerAfterRenderer();
        assert.equal(selected, packaged ? configPath : undefined);
        assert.equal(loaded.bindAddress, packaged && present ? '127.0.0.2' : '0.0.0.0');
    });
}
