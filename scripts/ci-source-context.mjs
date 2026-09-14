import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const repository = 'JENN2046/VCPChat';
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const blobId = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fail = reason => { throw new Error(`CI source context: ${reason}`); };

function relativePath(value) {
    if (typeof value !== 'string' || !value || /[\\\x00-\x1f\x7f]/.test(value)
        || Buffer.from(value, 'utf8').toString('utf8') !== value
        || value.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
        fail('invalid relative path');
    }
    return value;
}

function treeId(entries) {
    const root = new Map();
    for (const [name, leaf] of entries) {
        const parts = name.split('/');
        let directory = root;
        for (const part of parts.slice(0, -1)) {
            if (!directory.has(part)) directory.set(part, new Map());
            directory = directory.get(part);
            if (!(directory instanceof Map)) fail('file/directory prefix conflict');
        }
        const basename = parts.at(-1);
        if (directory.has(basename)) fail('file/directory prefix conflict');
        directory.set(basename, leaf);
    }
    function hashDirectory(directory) {
        // Git compares raw UTF-8 names, treating a directory as name + '/'.
        const children = [...directory].map(([name, node]) => ({
            name, node, order: Buffer.from(name + (node instanceof Map ? '/' : '')),
        })).sort((a, b) => Buffer.compare(a.order, b.order));
        const bytes = Buffer.concat(children.map(({ name, node }) => {
            const mode = node instanceof Map ? '40000' : node.mode;
            const oid = node instanceof Map ? hashDirectory(node) : node.sha;
            return Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')]);
        }));
        return createHash('sha1').update(`tree ${bytes.length}\0`).update(bytes).digest('hex');
    }
    return hashDirectory(root);
}

function frame(value) {
    if (!value || !hex(value.commit, 40) || !hex(value.tree, 40) || !Array.isArray(value.entries)) fail('invalid tree frame');
    const entries = new Map();
    for (const item of value.entries) {
        const name = relativePath(item?.path);
        if (entries.has(name) || !hex(item.sha, 40)
            || !['100644', '100755', '120000', '160000'].includes(item.mode)
            || item.type !== (item.mode === '160000' ? 'commit' : 'blob')) fail('invalid or duplicate leaf');
        entries.set(name, Object.freeze({ ...item }));
    }
    if (treeId(entries) !== value.tree) fail('complete tree identity mismatch');
    return { commit: value.commit, tree: value.tree, entries };
}

function regularFile(root, name) {
    const parts = relativePath(name).split('/');
    let current = root;
    for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        const info = fs.lstatSync(current);
        if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) fail('non-regular projected input');
    }
    return current;
}

const identical = (left, right) => left === undefined && right === undefined
    || left !== undefined && right !== undefined
    && ['mode', 'type', 'sha'].every(key => left[key] === right[key]);

// This context is produced outside the projected worktree by the pinned CI
// reader. Its complete tree metadata is not a synthetic Git checkout/history.
export function loadCiSourceContext(root, env = process.env) {
    const location = env.VCPCHAT_CI_SOURCE_CONTEXT;
    if (!location) return null;
    if (!hex(env.VCPCHAT_CI_SOURCE_CONTEXT_SHA256, 64) || !hex(env.GITHUB_SHA, 40)
        || env.GITHUB_REPOSITORY !== repository) fail('missing trusted event binding');
    const info = fs.lstatSync(location);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024) fail('invalid context file');
    const bytes = fs.readFileSync(location);
    if (digest(bytes) !== env.VCPCHAT_CI_SOURCE_CONTEXT_SHA256) fail('context digest mismatch');
    const data = JSON.parse(bytes.toString('utf8'));
    if (data.schema !== 'vcpchat-ci-source-context/v1' || data.repository !== repository) fail('unexpected context schema or repository');
    const frames = { event: frame(data.event), source: frame(data.source), upstream: frame(data.upstream) };
    if (frames.event.commit !== env.GITHUB_SHA || !Array.isArray(data.projection) || !data.projection.length) fail('event or projection mismatch');
    const inputs = new Map();
    for (const item of data.projection) {
        const name = relativePath(item?.path);
        const event = frames.event.entries.get(name);
        if (inputs.has(name) || !event || !['100644', '100755'].includes(item.mode)
            || item.mode !== event.mode || item.blob !== event.sha || !hex(item.sha256, 64)
            || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 64 * 1024 * 1024
            || item.size !== event.size) fail('projected identity mismatch');
        inputs.set(name, { ...item });
    }
    function readCommitted(name) {
        const item = inputs.get(relativePath(name));
        if (!item) fail('required input is not in the admitted projection');
        const file = regularFile(root, name);
        if (fs.statSync(file).size !== item.size) fail('projected input size drift');
        const content = fs.readFileSync(file);
        if (digest(content) !== item.sha256 || blobId(content) !== item.blob) fail('projected input content drift');
        return content.toString('utf8');
    }
    // Earlier test steps may have written files. Verify the claimed event
    // inputs again rather than silently auditing a modified working copy.
    for (const name of inputs.keys()) readCommitted(name);
    function comparison(label, name) {
        if (!['source', 'upstream'].includes(label)) fail('unknown comparison');
        return [frames.event.entries.get(relativePath(name)), frames[label].entries.get(name)];
    }
    return Object.freeze({
        trackedFiles: Object.freeze([...frames.event.entries.keys()].sort()),
        sourceCommit: frames.source.commit,
        upstreamCommit: frames.upstream.commit,
        readCommitted,
        changedPaths(label) {
            if (!['source', 'upstream'].includes(label)) fail('unknown comparison');
            return [...new Set([...frames.event.entries.keys(), ...frames[label].entries.keys()])]
                .filter(name => !identical(...comparison(label, name))).sort();
        },
        sameIdentity(label, name) { return identical(...comparison(label, name)); },
        // Blob inequality alone does not prove a difference after Git's
        // --ignore-space-at-eol. Absence and mode/type changes do; ambiguous
        // text comparisons require separately admitted history evidence.
        definitelyDifferentIgnoringEol(label, name) {
            const [current, baseline] = comparison(label, name);
            if (identical(current, baseline)) return false;
            if (!current || !baseline || current.mode !== baseline.mode || current.type !== baseline.type) return true;
            fail('line-ending parity requires admitted historical content');
        },
    });
}
