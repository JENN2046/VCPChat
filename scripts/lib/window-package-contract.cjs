'use strict';

// Build-time only: inspect shipped bytes, never launch services or load user state.
const path = require('node:path');
const crypto = require('node:crypto');
const contract = require('../fixtures/window-package-resources.json');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function safePath(value) {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') ||
        value.split('/').some(part => !part || part === '..' || part === '.') ||
        /[:*?\0]/.test(value)) throw new Error(`Unsafe window resource path: ${value}`);
    return value;
}

function localDependencies(relative, bytes) {
    let text = bytes.toString('utf8');
    const refs = [];
    if (relative.endsWith('.html')) {
        // Only resource tags, not links/buttons that intentionally navigate elsewhere.
        for (const tag of text.matchAll(/<(?:script|link|img|source)\b[^>]*>/gi)) {
            for (const match of tag[0].matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1]);
        }
    } else if (relative.endsWith('.css')) {
        // Electron supports WOFF2. Older-font fallbacks in a src list are alternatives,
        // not additional mandatory files; still require and verify the first WOFF2.
        text = text.replace(/(@font-face\s*\{[^}]*?\bsrc\s*:\s*)(url\([^)]*\.woff2[^)]*\)\s*format\(["']woff2["']\))[^;}]*([;}])/gi, '$1$2$3');
        for (const match of text.matchAll(/@import\s+["']([^"']+)["']|url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) refs.push(match[1] || match[2] || match[3] || match[4]);
    } else if (/\.(?:m?js)$/.test(relative)) {
        for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["'](\.[^"']+)["']|\bimport\(\s*["'](\.[^"']+)["']\s*\)/g)) refs.push(match[1] || match[2]);
    }
    return [...new Set(refs.filter(ref => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref))
        .map(ref => safePath(path.posix.normalize(path.posix.join(path.posix.dirname(relative), decodeURIComponent(ref.split(/[?#]/)[0]))))))];
}

function verifyWindowPackage({ readSource, readPackaged, resources = contract.resources, windows = contract.windows }) {
    const required = new Set();
    for (const entry of resources) {
        safePath(entry.path);
        if (required.has(entry.path)) throw new Error(`Duplicate window resource: ${entry.path}`);
        if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
            throw new Error(`Invalid window resource identity: ${entry.path}`);
        }
        required.add(entry.path);
    }
    for (const window of windows) {
        if (!required.has(safePath(window.page))) throw new Error(`Window page not declared: ${window.page}`);
    }
    const queue = [...required, ...windows.map(window => safePath(window.preload))];
    const checked = new Set();
    const identityByPath = new Map(resources.map(entry => [entry.path, entry]));
    while (queue.length) {
        const relative = queue.shift();
        if (checked.has(relative)) continue;
        checked.add(relative);
        const source = readSource(relative);
        if (!Buffer.isBuffer(source)) throw new Error(`Window source is missing: ${relative}`);
        const identity = identityByPath.get(relative);
        if (identity && (source.length !== identity.size || digest(source) !== identity.sha256)) {
            throw new Error(`Window source identity mismatch: ${relative}`);
        }
        const packed = readPackaged(relative);
        if (!Buffer.isBuffer(packed)) throw new Error(`Packaged window resource is missing: ${relative}`);
        if (!source.equals(packed)) throw new Error(`Packaged window resource differs: ${relative}`);
        if (/\.(?:html|css|m?js)$/.test(relative)) queue.push(...localDependencies(relative, source));
    }
    return { windows: windows.length, resources: resources.length, checked: [...checked].sort() };
}

module.exports = { contract, localDependencies, verifyWindowPackage };
