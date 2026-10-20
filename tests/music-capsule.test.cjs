const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('main.html', 'utf8');
const script = fs.readFileSync('modules/ui-system/music-capsule.js', 'utf8');

function eqFixture({ from = 'FIR', to = 'IIR', enabled = true } = {}) {
    const engine = { type: from, fir: from === 'FIR', iir: from === 'IIR' };
    const calls = [];
    const app = {
        eqBands: { 31: 0 }, eqSwitch: { checked: enabled },
        eqTypeSelect: { value: to }, firTapsSelect: { value: '1023' },
        _syncedEqType: from, _syncedFirTaps: 1023,
        api: {
            async setMusicEqType({ type }) {
                calls.push('type:' + type);
                engine.type = type;
                engine.fir = type === 'FIR';
                if (type === 'FIR') engine.iir = false;
            },
            async setMusicEq({ enabled }) {
                calls.push('enabled:' + enabled);
                if (engine.type === 'FIR') engine.fir = enabled;
                else engine.iir = enabled;
            },
        },
        saveSettings() { calls.push('save'); },
    };
    const slider = { value: '3' };
    const context = { app, document: { getElementById: () => slider } };
    vm.runInNewContext(fs.readFileSync('Musicmodules/music-effects.js', 'utf8') + '\nsetupEffects(app);', context);
    return { app, engine, calls, slider };
}

test('changing FIR to IIR reapplies the enabled state after selecting the engine type', async () => {
    const { app, engine, calls } = eqFixture();
    await app.sendEqSettings();
    assert.equal(engine.type, 'IIR');
    assert.equal(engine.iir, true);
    assert.equal(engine.fir, false);
    assert.deepEqual(calls, ['type:IIR', 'enabled:true', 'save']);
});

test('type changes keep disabled EQ off, and unchanged FIR sliders do not rebuild its filter', async () => {
    for (const from of ['IIR', 'FIR']) {
        const to = from === 'IIR' ? 'FIR' : 'IIR';
        const { app, engine } = eqFixture({ from, to, enabled: false });
        await app.sendEqSettings();
        assert.equal(engine.fir, false);
        assert.equal(engine.iir, false);
    }
    const { app, engine, calls } = eqFixture({ from: 'IIR', to: 'FIR' });
    await app.sendEqSettings();
    assert.equal(engine.fir, true);
    assert.equal(engine.iir, false);
    calls.length = 0;
    await app.sendEqSettings();
    assert.deepEqual(calls, ['enabled:true', 'save']);
});

test('overlapping sliders wait for one pending FIR type change and keep their snapshots', async () => {
    const { app, calls, slider } = eqFixture({ from: 'IIR', to: 'FIR' });
    const setType = app.api.setMusicEqType, setEq = app.api.setMusicEq;
    let release, attempts = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const bands = [];
    app.api.setMusicEqType = async payload => { attempts++; await gate; return setType(payload); };
    app.api.setMusicEq = async payload => { bands.push(payload.bands[31]); return setEq(payload); };
    const first = app.sendEqSettings();
    slider.value = '9'; app.eqSwitch.checked = false;
    const second = app.sendEqSettings();
    await new Promise(resolve => setImmediate(resolve));
    const inFlight = attempts;
    release(); await Promise.all([first, second]);
    assert.equal(inFlight, 1);
    assert.equal(attempts, 1, 'pending FIR synchronization is not duplicated');
    assert.deepEqual(bands, [3, 9]);
    assert.deepEqual(calls, ['type:FIR', 'enabled:true', 'save', 'enabled:false', 'save']);
});

test('overlapping different type requests cannot complete with stale sync markers', async () => {
    const { app, engine } = eqFixture({ from: 'IIR', to: 'FIR' });
    const setType = app.api.setMusicEqType, pending = [];
    app.api.setMusicEqType = payload => new Promise(resolve => {
        pending.push(async () => { await setType(payload); resolve(); });
    });
    const first = app.sendEqSettings();
    await new Promise(resolve => setImmediate(resolve));
    app.eqTypeSelect.value = 'IIR'; app.firTapsSelect.value = '2047';
    const second = app.sendEqSettings();
    await new Promise(resolve => setImmediate(resolve));
    if (pending.length === 2) {
        await pending[1](); await second;
        await pending[0](); await first;
    } else {
        await pending[0](); await first;
        await new Promise(resolve => setImmediate(resolve));
        await pending[1](); await second;
    }
    assert.equal(engine.type, 'IIR');
    assert.equal(app._syncedEqType, 'IIR');
    assert.equal(app._syncedFirTaps, 2047);
});

test('failed EQ type synchronization stays retryable for thrown and status-error failures', async () => {
    for (const throws of [true, false]) {
        const { app, calls } = eqFixture({ from: 'IIR', to: 'FIR' });
        const setType = app.api.setMusicEqType;
        let attempts = 0;
        app.api.setMusicEqType = payload => {
            if (++attempts === 1) {
                if (throws) throw new Error('synthetic type failure');
                return { status: 'error' };
            }
            return setType(payload);
        };
        if (throws) await assert.rejects(app.sendEqSettings(), /synthetic type failure/);
        else assert.equal((await app.sendEqSettings()).status, 'error');
        assert.equal(app._syncedEqType, 'IIR');
        assert.deepEqual(calls, [], 'failed type change must not apply bands or persist success');
        await app.sendEqSettings();
        assert.equal(attempts, 2);
        assert.equal(app._syncedEqType, 'FIR');
    }
});

test('a band failure is retryable without rebuilding a successfully synchronized type', async () => {
    const { app, calls } = eqFixture({ from: 'IIR', to: 'FIR' });
    const setEq = app.api.setMusicEq;
    let attempts = 0;
    app.api.setMusicEq = payload => ++attempts === 1 ? { status: 'error' } : setEq(payload);
    assert.equal((await app.sendEqSettings()).status, 'error');
    assert.deepEqual(calls, ['type:FIR']);
    await app.sendEqSettings();
    assert.deepEqual(calls, ['type:FIR', 'enabled:true', 'save']);
});
test('capsule stays scoped and uses tokens with only its measured width write', () => {
    const dom = new JSDOM(html);
    assert.ok(dom.window.document.querySelector('.music-capsule').closest('.vcp-ui-scope'));
    dom.window.close();
    const css = fs.readFileSync('styles/ui-system/music-capsule.css', 'utf8');
    assert.doesNotMatch(css, /(?:rgba?\(|font-size:\s*\d)/);
    assert.match(css, /font-size:\s*var\(--vcp-ui-text-sm\)/);
    for (const selector of css.matchAll(/html\s+([^{}]+)\{/g)) assert.ok(selector[1].includes('.vcp-ui-scope'));
    const allowed = "root.style.setProperty('--music-capsule-expanded-width', `${width}px`);";
    assert.ok(script.includes(allowed));
    assert.doesNotMatch(script.replace(allowed, ''), /\bstyle\s*=|\.style\./);
    // A second or unrelated mutation must not fit the single exact exemption.
    assert.match((script + '\nroot.style.color = "red";').replace(allowed, ''), /\bstyle\s*=|\.style\./);
});
function fixture() {
    const source = new JSDOM(html);
    const markup = source.window.document.querySelector('.music-capsule').outerHTML;
    source.window.close();
    const dom = new JSDOM(markup, { runScripts: 'outside-only' });
    let listener, resolve;
    const commands = [], timers = new Map();
    let id = 0, unsubscribed = false;
    dom.window.setTimeout = callback => { timers.set(++id, callback); return id; };
    dom.window.clearTimeout = key => timers.delete(key);
    dom.window.electronAPI = {
        onMusicCapsuleState(callback) { listener = callback; return () => { unsubscribed = true; }; },
        getMusicCapsuleState() { return new Promise(r => { resolve = r; }); },
        sendMusicCapsuleCommand(command) { commands.push(command); }
    };
    dom.window.eval(script);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return {
        dom, root: dom.window.document.querySelector('.music-capsule'), commands, timers,
        push: state => listener(state), resolve: state => resolve(state),
        get unsubscribed() { return unsubscribed; }
    };
}
test('window lifecycle, safe title, hover, controls and cleanup', async () => {
    const f = fixture();
    f.resolve({ open: false });
    await Promise.resolve();
    assert.equal(f.root.hidden, true);
    f.push({ open: true, title: '<img src=x>', trackKey: 'a', playing: true });
    assert.equal(f.root.hidden, false);
    assert.equal(f.root.querySelector('.music-capsule-title').textContent, '<img src=x>');
    assert.equal(f.root.querySelector('img'), null);
    assert.equal(f.root.classList.contains('is-expanded'), true);
    f.root.querySelector('[data-music-command="toggle"]').click();
    f.root.querySelector('[data-music-command="previous"]').click();
    f.root.querySelector('[data-music-command="next"]').click();
    assert.deepEqual(f.commands, ['pause', 'previous', 'next']);
    f.root.querySelector('.music-capsule-surface').dispatchEvent(new f.dom.window.Event('mouseenter'));
    [...f.timers.values()].forEach(fn => fn());
    assert.equal(f.root.classList.contains('is-expanded'), true);
    f.root.querySelector('.music-capsule-surface').dispatchEvent(new f.dom.window.Event('mouseleave'));
    assert.equal(f.root.classList.contains('is-expanded'), false);
    f.push({ open: true, title: 'b', trackKey: 'b', playing: false });
    assert.equal(f.root.classList.contains('is-expanded'), true);
    f.push({ open: false });
    assert.equal(f.root.hidden, true);
    assert.equal(f.timers.size, 0);
    f.dom.window.dispatchEvent(new f.dom.window.Event('beforeunload'));
    assert.equal(f.unsubscribed, true);
    f.dom.window.close();
});
test('late initial snapshot cannot overwrite live push', async () => {
    const f = fixture();
    f.push({ open: true, title: 'fresh', trackKey: 'fresh', playing: true });
    f.resolve({ open: false });
    await Promise.resolve();
    assert.equal(f.root.hidden, false);
    assert.equal(f.root.querySelector('.music-capsule-title').textContent, 'fresh');
    f.dom.window.close();
});
test('player snapshot deduplicates state and gapless path publishes', () => {
    const context = { console, setInterval, clearInterval };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('Musicmodules/music-player.js', 'utf8'), context);
    const sent = [];
    const app = {
        playlist: [{ path: 'a', title: 'A' }], currentTrackIndex: 0, isPlaying: true,
        stripAudioExtension: s => s, normalizePathForCompare: s => s,
        api: { publishMusicCapsuleState: state => sent.push(state) }
    };
    context.setupPlayer(app);
    app.publishCapsuleState();
    app.publishCapsuleState();
    assert.equal(sent.length, 1);
    app.isPlaying = false;
    app.publishCapsuleState();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].playing, false);
    app.syncTrackIndexByPath('missing');
    assert.equal(sent.length, 2);
});
test('sidebar mode toast removed and capsule IPC validates publishers and commands', () => {
    assert.doesNotMatch(fs.readFileSync('modules/event-listeners.js', 'utf8'), /侧栏已切换|侧栏已恢复/);
    const handlers = fs.readFileSync('modules/ipc/musicHandlers.js', 'utf8');
    assert.match(handlers, /event.sender !== musicWindow.webContents/);
    assert.match(handlers, /event.sender !== mainWindow.webContents/);
    assert.match(handlers, /\['previous', 'next', 'play', 'pause'\]\.includes\(command\)/);
});
