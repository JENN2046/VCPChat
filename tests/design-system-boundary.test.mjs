import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('integrated boundary allows product work and rejects retained runtime, asset and CSS violations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-boundary-'));
    const contextFile = root + '.context.json';
    const guard = fileURLToPath(new URL('../scripts/check-design-system-boundary.mjs', import.meta.url));
    const write = (file, source = '') => {
        const target = path.resolve(root, file);
        assert.ok(target.startsWith(root + path.sep));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, source);
    };
    // This synthetic Git fixture has its own tree. The outer CI projection
    // describes the real checkout and must not be applied to the fixture.
    // Keep the real guard unchanged and remove only its two context bindings
    // from child processes (never from the parent CI environment).
    const fixtureEnv = { ...process.env };
    delete fixtureEnv.VCPCHAT_CI_SOURCE_CONTEXT;
    delete fixtureEnv.VCPCHAT_CI_SOURCE_CONTEXT_SHA256;
    const run = () => spawnSync(process.execPath, [guard], { cwd: root, env: fixtureEnv, encoding: 'utf8', windowsHide: true });
    const reject = (file, source, expected) => {
        const existed = fs.existsSync(path.join(root, file));
        const previous = existed ? fs.readFileSync(path.join(root, file)) : null;
        write(file, source);
        const result = run();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, expected);
        if (existed) fs.writeFileSync(path.join(root, file), previous);
        else fs.unlinkSync(path.join(root, file));
    };
    try {
        for (const file of ['assets/font/Orbitron.ttf', 'assets/nova_button.png', 'assets/nova_button_light.png',
            'modules/topTabManager.js', 'modules/ui-system/lifecycle-scope.js', 'modules/services/deepWikiService.js',
            'modules/services/embeddedAppSessionManager.js', 'modules/ui-system/ask-nova-modal.js',
            'styles/ui-system/ask-nova.css', 'Notemodules/notes.html', 'Translatormodules/translator.html',
            'modules/event-listeners.js', 'modules/ui-system/appearance-studio.js']) write(file);
        write('styles/ui-next.css', '.shell { display: flex; }');
        write('Notemodules/notes.js', fs.readFileSync(new URL('../Notemodules/notes.js', import.meta.url), 'utf8'));
        write('styles/themes.css', ':focus-visible:not(#messageInput):not(.chat-message-input) { outline: 1px solid; }');
        write('modules/shared/embeddedAppAllowlist.js', ['open-notes-window', 'open-note-mini-window', 'open-translator-window',
            'open-memo-window', 'open-forum-window', 'open-log-window', 'open-themes-window', 'open-task-window',
            'open-plugin-manager-window'].map(action => `({ action: '${action}' });`).join('\n'));
        write('package.json', JSON.stringify({ scripts: {} }));
        write('modules/projectForgeBusiness.js', 'export const productFeature = true;');
        assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, windowsHide: true }).status, 0);
        assert.equal(spawnSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root, windowsHide: true }).status, 0);
        assert.equal(spawnSync('git', ['add', '.'], { cwd: root, windowsHide: true }).status, 0);
        const valid = run();
        assert.equal(valid.status, 0, valid.stderr);
        // Pin a synthetic ancestry frame, then exercise the actual guard on
        // the two already-merged JSO declarations, not a broad path exemption.
        const git = args => {
            const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
            assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
        };
        git(['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic ancestry']);
        fixtureEnv.VCP_DESIGN_SOURCE_REF = 'HEAD'; fixtureEnv.VCP_UPSTREAM_REF = 'HEAD';
        const reviewed = new Map([
            ['.github/workflows/jso-agent-paired-candidate.yml', '38940cb06947455cc2a5f41b53a4cc314ae9c92c'],
            ['docs/TRUSTED_ACTION_V1_CONSUMER.md', '75b306b4e4bc4715d0c20d2ece3c3f4693e370a6'],
        ]);
        git(['config', 'core.autocrlf', 'false']);
        const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/reviewed-jso-consumer-sources.json', import.meta.url), 'utf8'));
        assert.equal(frozen.schema, 'reviewed-jso-consumer-test-data/v1');
        assert.deepEqual(Object.keys(frozen.sources).sort(), [...reviewed.keys()].sort());
        const originals = new Map();
        for (const file of reviewed.keys()) {
            assert.equal(frozen.sources[file].gitBlob, reviewed.get(file));
            const bytes = frozen.sources[file].text;
            originals.set(file, bytes); write(file, bytes); git(['add', '--', file]);
        }
        assert.equal(run().status, 0, 'only the reviewed declaration identities are admitted');
        for (const [file, bytes] of originals) reject(file, bytes + '\n# unreviewed mutation\n', /outside the subtraction allowlist/);
        git(['update-index', '--cacheinfo', '100755,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        assert.match(run().stderr, /outside the subtraction allowlist/);
        git(['update-index', '--cacheinfo', '100644,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        write('docs/TRUSTED_ACTION_V1_OTHER.md', 'unreviewed sibling');
        git(['add', '--', 'docs/TRUSTED_ACTION_V1_OTHER.md']);
        assert.match(run().stderr, /outside the subtraction allowlist/);
        git(['rm', '--cached', '--', 'docs/TRUSTED_ACTION_V1_OTHER.md']);
        fs.unlinkSync(path.join(root, 'docs/TRUSTED_ACTION_V1_OTHER.md'));

        // A reviewed working file must not hide a different staged blob.
        const stagedMutation = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, encoding: 'utf8', input: 'unreviewed staged content' });
        assert.equal(stagedMutation.status, 0, stagedMutation.stderr);
        git(['update-index', '--cacheinfo', '100644,' + stagedMutation.stdout.trim() + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        assert.match(run().stderr, /outside the subtraction allowlist/);
        git(['update-index', '--cacheinfo', '100644,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);

        // CI does not hydrate workflow/doc bodies. Exercise the real complete-
        // tree loader and guard with those two files absent from the projection.
        const entries = ref => git(['ls-tree', '-rz', '-l', ref]).split('\0').filter(Boolean).map(row => {
            const [metadata, file] = row.split('\t'), [mode, type, sha, size] = metadata.trim().split(/\s+/);
            return { path: file, mode, type, sha, size: Number(size) };
        });
        const baseline = { commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), entries: entries('HEAD') };
        const projection = entries(git(['write-tree'])).filter(row => !reviewed.has(row.path)).map(row => ({
            path: row.path, mode: row.mode, blob: row.sha, size: row.size,
            sha256: createHash('sha256').update(fs.readFileSync(path.join(root, row.path))).digest('hex'),
        }));
        const runContext = () => {
            const tree = git(['write-tree']);
            const bytes = Buffer.from(JSON.stringify({ schema: 'vcpchat-ci-source-context/v1', repository: 'JENN2046/VCPChat',
                event: { commit: 'a'.repeat(40), tree, entries: entries(tree) }, source: baseline, upstream: baseline, projection }));
            fs.writeFileSync(contextFile, bytes);
            const env = { ...fixtureEnv, VCP_DESIGN_SOURCE_REF: baseline.commit,
                GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'JENN2046/VCPChat',
                VCPCHAT_CI_SOURCE_CONTEXT: contextFile, VCPCHAT_CI_SOURCE_CONTEXT_SHA256: createHash('sha256').update(bytes).digest('hex') };
            return spawnSync(process.execPath, [guard], { cwd: root, env, encoding: 'utf8', windowsHide: true });
        };
        for (const file of reviewed.keys()) fs.unlinkSync(path.join(root, file));
        const admitted = runContext(); assert.equal(admitted.status, 0, admitted.stderr);
        git(['update-index', '--cacheinfo', '100755,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        assert.match(runContext().stderr, /outside the subtraction allowlist/);
        git(['update-index', '--cacheinfo', '100644,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        const changed = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, encoding: 'utf8', input: 'unreviewed bytes' });
        assert.equal(changed.status, 0, changed.stderr);
        git(['update-index', '--cacheinfo', '100644,' + changed.stdout.trim() + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        assert.match(runContext().stderr, /outside the subtraction allowlist/);
        git(['update-index', '--cacheinfo', '100644,' + reviewed.get('docs/TRUSTED_ACTION_V1_CONSUMER.md') + ',docs/TRUSTED_ACTION_V1_CONSUMER.md']);
        for (const [file, bytes] of originals) write(file, bytes);

        reject('agent-runtime/new.js', '', /forbidden Build\/Codex path/);
        reject('Notemodules/notes.js', fs.readFileSync(new URL('../Notemodules/notes.js', import.meta.url), 'utf8') + '\n// unreviewed fixture mutation\n', /unreviewed Notes compatibility change/);
        reject('modules/projectForgeBusiness.js', "const channel = 'agent-runtime:spawn';", /forbidden Build\/Codex runtime/);
        reject('modules/services/embeddedAppSessionManager.js', 'const vcpApiKey = "secret";', /credentials/);
        reject('modules/services/embeddedAppSessionManager.js', 'webContents.executeJavaScript(code);', /post-load injection/);
        reject('styles/ui-system/new-component.css', '.component { background: url(./missing.png); }', /missing local CSS asset/);
        reject('styles/ui-system/new-component.css', '.shell { display: block; }', /duplicates.*shell authority/);
        reject('styles/themes.css', ':focus-visible { outline: 0; }', /composer focus contract|unscoped focus/);
        reject('package.json', JSON.stringify({ scripts: { test: 'node scripts/missing.mjs' } }), /references missing/);
        fs.unlinkSync(path.join(root, 'assets/nova_button.png'));
        const missing = run();
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /required development-tree design asset is missing/);
    } finally {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('vcp-boundary-'));
        fs.rmSync(root, { recursive: true, force: true });
        if (fs.existsSync(contextFile)) fs.unlinkSync(contextFile);
    }
});
