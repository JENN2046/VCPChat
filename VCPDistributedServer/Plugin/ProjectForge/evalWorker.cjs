'use strict';
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const { createHash, randomUUID } = require('node:crypto');
const { types } = require('node:util');
const write = fs.writeSync.bind(fs);
let stage = 'input';

function encode(value, seen = new Set(), depth = 0) {
    if (depth > 40) throw new Error('Result nesting exceeds 40 levels');
    if (value === undefined) return { $type: 'undefined' };
    if (typeof value === 'bigint') return { $type: 'bigint', value: String(value) };
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return { $type: 'number', value: String(value) };
    }
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
    if (typeof value !== 'object') throw new Error(`Unsupported return type: ${typeof value}`);
    if (seen.has(value)) throw new Error('Cyclic result; return an explicit JSON projection');
    if (types.isProxy(value)) throw new Error('Proxy result requires an explicit JSON projection');
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const entries = [];
            for (let i = 0; i < value.length; i++) {
                const d = Object.getOwnPropertyDescriptor(value, String(i));
                if (d && !Object.hasOwn(d, 'value')) throw new Error('Accessor result requires an explicit JSON projection');
                entries.push(d ? encode(d.value, seen, depth + 1) : { $type: 'hole' });
            }
            return entries;
        }
        if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
            throw new Error('Non-plain object result; return an explicit JSON projection');
        }
        if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol keys cannot be encoded losslessly');
        const entries = [];
        for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (!d.enumerable) continue;
            if (!Object.hasOwn(d, 'value')) throw new Error('Accessor result requires an explicit JSON projection');
            entries.push([key, encode(d.value, seen, depth + 1)]);
        }
        // Envelopes avoid collisions between user objects and special-value tags.
        return { $type: 'object', entries };
    } finally { seen.delete(value); }
}

function locate(root, parts) {
    let owner = null;
    let value = root;
    for (const part of parts) {
        if (value == null || !Object.hasOwn(Object(value), part)) return null;
        const d = Object.getOwnPropertyDescriptor(Object(value), part);
        if (!d || !Object.hasOwn(d, 'value')) throw new Error('Accessor exports are not invoked automatically');
        owner = value;
        value = d.value;
    }
    return typeof value === 'function' ? { owner, fn: value } : null;
}

async function verifyDefinition(fn, request) {
    // An in-process inspector session reads V8's actual function location;
    // it does not open a debugging port or execute the target function.
    const session = new (require('node:inspector').Session)();
    session.connect();
    const key = `__projectforge_eval_${randomUUID()}`;
    const scripts = new Map();
    const url = pathToFileURL(request.file).href;
    const post = (method, params = {}) => new Promise((resolve, reject) =>
        session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
    session.on('Debugger.scriptParsed', ({ params }) => {
        if (params.url === url) scripts.set(params.scriptId, params.url);
    });
    try {
        await post('Debugger.enable');
        Object.defineProperty(globalThis, key, { value: fn, configurable: true });
        const { result } = await post('Runtime.evaluate', {
            expression: `globalThis[${JSON.stringify(key)}]`, objectGroup: key,
        });
        const properties = await post('Runtime.getProperties', { objectId: result.objectId });
        const location = properties.internalProperties?.find(p => p.name === '[[FunctionLocation]]')?.value?.value;
        if (!location || !scripts.has(location.scriptId)) {
            throw new Error('Runtime callable does not belong to the selected source definition');
        }
        const { scriptSource } = await post('Debugger.getScriptSource', { scriptId: location.scriptId });
        const normalize = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        if (normalize(scriptSource) !== normalize(fs.readFileSync(request.file, 'utf8'))) {
            throw new Error('Runtime script does not match the selected source bytes');
        }
        const line = location.lineNumber + 1;
        const containing = request.definition.callables.filter(row => row.start <= line && line <= row.end);
        const width = Math.min(...containing.map(row => row.end - row.start));
        const matches = containing.filter(row => row.end - row.start === width);
        if (matches.length !== 1 || matches[0].index !== request.definition.index) {
            throw new Error('Runtime callable does not match the selected definition; no setup or call executed');
        }
        return { file: request.file, line, column: location.columnNumber + 1 };
    } finally {
        delete globalThis[key];
        session.disconnect();
    }
}

function send(payload) {
    const wire = JSON.stringify(payload);
    if (Buffer.byteLength(wire) > 1024 * 1024) throw new Error('Encoded result exceeds 1 MiB');
    const buffer = Buffer.from(wire);
    let offset = 0;
    while (offset < buffer.length) offset += write(3, buffer, offset, buffer.length - offset);
}

(async () => {
    try {
        const request = JSON.parse(fs.readFileSync(0, 'utf8'));
        stage = 'source';
        const hash = () => createHash('sha256').update(fs.readFileSync(request.file)).digest('hex');
        if (hash() !== request.sourceHash) throw new Error('Target source changed before module load; retry');
        stage = 'load';
        const namespace = await import(pathToFileURL(request.file).href);
        stage = 'resolve';
        let parts = request.symbol.split('.');
        if (Object.hasOwn(namespace, 'default')) {
            const cached = createRequire(request.file).cache[fs.realpathSync(request.file)];
            const commonjs = request.file.endsWith('.cjs')
                || cached && Object.getOwnPropertyDescriptor(cached, 'exports')?.value === namespace.default;
            // The AST retains CommonJS wrapper names; the runtime namespace
            // exposes their members directly. Do not strip real ESM objects.
            if (commonjs && parts.length > 2 && parts[0] === 'module' && parts[1] === 'exports') parts = parts.slice(2);
            else if (commonjs && parts.length > 1 && parts[0] === 'exports') parts = parts.slice(1);
        }
        const candidates = [];
        const direct = locate(namespace, parts);
        if (direct) candidates.push(direct);
        // CJS namespace may expose the same callable as both named and default exports.
        if (Object.hasOwn(namespace, 'default')) {
            const fallback = locate(namespace.default, parts);
            if (fallback && !candidates.some(c => c.fn === fallback.fn && c.owner === fallback.owner)) {
                if (direct?.fn === fallback.fn) {
                    // The same callable's export object owns the method, not
                    // its immutable namespace wrapper (notably synthetic CJS).
                    candidates[candidates.indexOf(direct)] = fallback;
                } else candidates.push(fallback);
            }
            const value = namespace.default;
            // A direct default value has no property named after its source
            // declaration. Admit only a matching, unqualified function name;
            // never substitute an arbitrary default for another source symbol.
            if (typeof value === 'function' && parts.length === 1 && request.symbol === parts[0]
                && Object.getOwnPropertyDescriptor(value, 'name')?.value === parts[0]
                && !candidates.some(c => c.fn === value)) {
                candidates.push({ owner: undefined, fn: value });
            }
        }
        if (candidates.length !== 1) {
            stage = 'resolve';
            throw new Error(candidates.length
                ? 'Ambiguous runtime export; use its explicit export path'
                : 'Symbol is not a callable export; local closures and instance methods require a real runtime fixture');
        }
        let runtimeDefinition;
        if (request.definition) {
            stage = 'definition';
            runtimeDefinition = await verifyDefinition(candidates[0].fn, request);
        }
        let args = request.args;
        if (request.setup !== undefined) {
            stage = 'setup';
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            args = await new AsyncFunction('module', 'require', request.setup)(
                namespace, createRequire(request.file),
            );
            if (!Array.isArray(args)) throw new Error('setup must return an argument array');
        }
        stage = 'call';
        const value = await Reflect.apply(candidates[0].fn, candidates[0].owner, args);
        stage = 'encode';
        const encoded = encode(value);
        stage = 'source';
        if (hash() !== request.sourceHash) throw new Error('Target source changed during execution; result not certified');
        stage = 'encode';
        send({
            status: 'returned', value: encoded,
            ...(runtimeDefinition ? { runtimeDefinition } : {}),
            checks: { passed: 0, failed: 0 },
            runtime: { executable: process.execPath, version: process.version },
        });
        process.exit(0);
    } catch (error) {
        const status = ({
            input: 'invalid_arguments', source: 'source_changed', load: 'load_error',
            definition: 'definition_mismatch',
            resolve: 'not_callable', setup: 'setup_error', call: 'execution_error', encode: 'encoding_error',
        })[stage] || 'execution_error';
        try {
            send({ status, stage, error: {
                name: String(error?.name || 'Error'),
                message: String(error?.message || error).slice(0, 4000),
                stack: String(error?.stack || '').slice(0, 12000),
            } });
        } catch (_) { /* Parent reports a missing protocol result. */ }
        process.exit(1);
    }
})();
