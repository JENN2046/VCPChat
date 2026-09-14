import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadCiSourceContext } from '../scripts/ci-source-context.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function fixture(t) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-source-context-test-'));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const root = path.join(parent, 'project');
    fs.mkdirSync(root);
    const gitDirectory = path.join(parent, 'synthetic-tree-reference');
    const gitEnv = { PATH: process.env.PATH, HOME: parent, XDG_CONFIG_HOME: parent,
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
    function git(args, input) {
        const result = spawnSync('git', ['-c', 'protocol.allow=never', ...args],
            { env: gitEnv, encoding: 'utf8', input });
        assert.equal(result.status, 0, 'isolated synthetic Git tree operation must succeed');
        return result.stdout.trim();
    }
    git(['init', '--quiet', '--template=', '--initial-branch=fixture', gitDirectory]);
    function referenceTree(entries) {
        git(['-C', gitDirectory, 'read-tree', '--empty']);
        git(['-C', gitDirectory, 'update-index', '-z', '--index-info'],
            entries.map(e => `${e.mode} ${e.sha}\t${e.path}\0`).join(''));
        return git(['-C', gitDirectory, 'write-tree', '--missing-ok']);
    }
    const bytes = Buffer.from('accepted\n');
    fs.writeFileSync(path.join(root, 'input.js'), bytes);
    const entry = { path: 'input.js', mode: '100644', type: 'blob', sha: blob(bytes), size: bytes.length };
    const data = {
        schema: 'vcpchat-ci-source-context/v1', repository: 'JENN2046/VCPChat',
        event: { commit: 'a'.repeat(40), entries: [entry] },
        source: { commit: 'c'.repeat(40), entries: [{ ...entry }] },
        upstream: { commit: 'e'.repeat(40), entries: [{ ...entry }] },
        projection: [{ path: entry.path, mode: entry.mode, blob: entry.sha, sha256: sha(bytes), size: bytes.length }],
    };
    const env = { GITHUB_SHA: data.event.commit, GITHUB_REPOSITORY: data.repository,
        VCPCHAT_CI_SOURCE_CONTEXT: path.join(parent, 'context.json') };
    function write() {
        const content = Buffer.from(JSON.stringify(data));
        fs.writeFileSync(env.VCPCHAT_CI_SOURCE_CONTEXT, content);
        env.VCPCHAT_CI_SOURCE_CONTEXT_SHA256 = sha(content);
    }
    function bindTrees(labels = ['event', 'source', 'upstream']) {
        for (const label of labels) data[label].tree = referenceTree(data[label].entries);
    }
    bindTrees();
    write();
    return { parent, root, bytes, entry, data, env, write, bindTrees, load: () => loadCiSourceContext(root, env) };
}

test('ordinary Git mode does not require a CI context', () => {
    assert.equal(loadCiSourceContext('/not-read', {}), null);
});

test('exact context reads event source and compares complete metadata', t => {
    const f = fixture(t);
    // An unmaterialized synthetic metadata path must remain in enumeration.
    f.data.event.entries.push({ path: 'withheld.env', mode: '100644', type: 'blob', sha: '1'.repeat(40), size: 2 });
    f.bindTrees(['event']);
    f.write();
    const c = f.load();
    assert.deepEqual(c.trackedFiles, ['input.js', 'withheld.env']);
    assert.equal(c.readCommitted('input.js'), 'accepted\n');
    assert.deepEqual(c.changedPaths('source'), ['withheld.env']);
    assert.equal(c.sameIdentity('upstream', 'input.js'), true);
    assert.equal(c.definitelyDifferentIgnoringEol('source', 'withheld.env'), true);
    assert.throws(() => c.readCommitted('withheld.env'), /not in the admitted projection/);
});

for (const [name, mutate, expression] of [
    ['wrong event', f => { f.env.GITHUB_SHA = '1'.repeat(40); }, /event or projection mismatch/],
    ['wrong repository', f => { f.env.GITHUB_REPOSITORY = 'Other/Repo'; }, /trusted event binding/],
    ['wrong context digest', f => { f.env.VCPCHAT_CI_SOURCE_CONTEXT_SHA256 = '1'.repeat(64); }, /context digest mismatch/],
    ['duplicate leaf', f => { f.data.event.entries.push({ ...f.entry }); f.write(); }, /duplicate leaf/],
    ['traversal path', f => { f.data.source.entries[0].path = '../escape'; f.write(); }, /invalid relative path/],
    ['wrong projection blob', f => { f.data.projection[0].blob = '1'.repeat(40); f.write(); }, /projected identity mismatch/],
    ['missing projected input', f => { fs.unlinkSync(path.join(f.root, 'input.js')); }, /ENOENT/],
    ['same-size input mutation', f => { fs.writeFileSync(path.join(f.root, 'input.js'), 'rejected\n'); }, /content drift/],
    ['input size mutation', f => { fs.writeFileSync(path.join(f.root, 'input.js'), 'short'); }, /size drift/],
]) {
    test(`rejects ${name}`, t => {
        const f = fixture(t); mutate(f); assert.throws(f.load, expression);
    });
}

test('does not follow a projected input symlink', t => {
    const f = fixture(t);
    const target = path.join(f.parent, 'synthetic-target');
    fs.writeFileSync(target, f.bytes);
    fs.unlinkSync(path.join(f.root, 'input.js'));
    fs.symlinkSync(target, path.join(f.root, 'input.js'));
    assert.throws(f.load, /non-regular projected input/);
});

test('committed read detects mutation after the initial validation', t => {
    const f = fixture(t); const c = f.load();
    fs.writeFileSync(path.join(f.root, 'input.js'), 'rejected\n');
    assert.throws(() => c.readCommitted('input.js'), /content drift/);
});

test('different text OIDs are not mislabeled as normalized differences', t => {
    const f = fixture(t);
    f.data.source.entries[0].sha = blob(Buffer.from('accepted \r\n'));
    f.bindTrees(['source']);
    f.write(); const c = f.load();
    assert.deepEqual(c.changedPaths('source'), ['input.js']);
    assert.equal(c.sameIdentity('upstream', 'input.js'), true);
    assert.throws(() => c.definitelyDifferentIgnoringEol('source', 'input.js'), /requires admitted historical content/);
});

test('mode changes remain differences even when bytes match', t => {
    const f = fixture(t); f.data.source.entries[0].mode = '100755'; f.bindTrees(['source']); f.write();
    const c = f.load(); assert.deepEqual(c.changedPaths('source'), ['input.js']);
    assert.equal(c.definitelyDifferentIgnoringEol('source', 'input.js'), true);
});

test('invalid comparison labels cannot silently produce an empty diff', t => {
    const f = fixture(t); const c = f.load();
    assert.throws(() => c.changedPaths('other'), /unknown comparison/);
    assert.throws(() => c.sameIdentity('other', 'input.js'), /unknown comparison/);
});

for (const label of ['event', 'source', 'upstream']) {
    test(`rejects omitted unmaterialized leaf in ${label}, even with a new context digest`, t => {
        const f = fixture(t);
        f.data[label].entries.push({ path: 'metadata-only/item', mode: '100644', type: 'blob', sha: '1'.repeat(40), size: 2 });
        f.bindTrees([label]);
        f.data[label].entries.pop();
        f.write();
        assert.throws(f.load, /complete tree identity mismatch/);
    });
}

test('rejects wrong tree OID even when all supplied leaves are valid', t => {
    const f = fixture(t); f.data.event.tree = '1'.repeat(40); f.write();
    assert.throws(f.load, /complete tree identity mismatch/);
});

for (const childFirst of [false, true]) {
    test(`rejects file/directory prefix conflict, child first = ${childFirst}`, t => {
        const f = fixture(t);
        const leaf = { ...f.entry, path: 'collision' };
        const child = { ...f.entry, path: 'collision/child' };
        f.data.source.entries.push(...(childFirst ? [child, leaf] : [leaf, child])); f.write();
        assert.throws(f.load, /file\/directory prefix conflict/);
    });
}

test('matches real Git tree ordering with nested, non-ASCII and special-mode metadata', t => {
    const f = fixture(t);
    const names = ['a/item', 'a.c', 'a0', 'z/child/grandchild', 'é.js', '中.js'];
    f.data.event.entries.push(...names.map(name => ({ ...f.entry, path: name })));
    f.data.event.entries.push({ ...f.entry, path: 'symbolic', mode: '120000' },
        { path: 'submodule', mode: '160000', type: 'commit', sha: '2'.repeat(40) });
    f.data.event.entries.reverse(); f.bindTrees(['event']); f.write();
    assert.equal(f.load().trackedFiles.length, 9);
});

test('matches the real Git empty tree for an empty comparison frame', t => {
    const f = fixture(t); f.data.source.entries = []; f.bindTrees(['source']); f.write();
    assert.equal(f.data.source.tree, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    assert.deepEqual(f.load().changedPaths('source'), ['input.js']);
});
