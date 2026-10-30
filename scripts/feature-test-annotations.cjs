'use strict';

const path = require('node:path');
const root = path.resolve(__dirname, '..');
const escape = value => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

// Export fixed test metadata only. Never include stdout/stderr, errors, stacks,
// assertion values, environment fields or arbitrary diagnostic event payloads.
module.exports = async function* featureAnnotations(events) {
    for await (const event of events) {
        if (event.type !== 'test:fail') continue;
        const data = event.data || {};
        const relative = typeof data.file === 'string' ? path.relative(root, data.file).replaceAll('\\', '/') : '';
        const file = /^tests\/[A-Za-z0-9_./-]+\.(?:c?js|mjs)$/.test(relative) && !relative.split('/').includes('..')
            ? relative : 'unknown-test';
        const name = typeof data.name === 'string' && !data.name.includes(root) && !/^[A-Za-z]:[\\/]|^\//.test(data.name)
            ? data.name.slice(0, 240) : file;
        const line = Number.isSafeInteger(data.line) && data.line > 0 ? data.line : 1;
        yield `::error file=${file},line=${line}::Feature test failed: ${escape(name)}\n`;
    }
};
