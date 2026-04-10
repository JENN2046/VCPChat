const PATCH_FLAG = Symbol.for('vcp.patchConsoleForUnicodeSafeLogging.applied');

function formatAsciiSafeText(text) {
    if (typeof text !== 'string' || !/[^\x20-\x7E]/.test(text)) {
        return text;
    }

    const escaped = Array.from(text).map((char) => {
        const codePoint = char.codePointAt(0);
        if (codePoint >= 0x20 && codePoint <= 0x7E) {
            return char;
        }
        if (codePoint <= 0xFFFF) {
            return `\\u${codePoint.toString(16).padStart(4, '0')}`;
        }

        const adjusted = codePoint - 0x10000;
        const high = 0xD800 + (adjusted >> 10);
        const low = 0xDC00 + (adjusted & 0x3FF);
        return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
    }).join('');

    return `${text} [${escaped}]`;
}

function transformValue(value, seen = new WeakSet()) {
    if (typeof value === 'string') {
        return formatAsciiSafeText(value);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    if (value instanceof Error) {
        return formatAsciiSafeText(value.stack || value.message || String(value));
    }

    if (Array.isArray(value)) {
        if (seen.has(value)) {
            return value;
        }
        seen.add(value);
        return value.map((item) => transformValue(item, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return value;
    }

    if (seen.has(value)) {
        return value;
    }
    seen.add(value);

    const transformed = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        transformed[key] = transformValue(nestedValue, seen);
    }
    return transformed;
}

function patchConsoleForUnicodeSafeLogging() {
    if (process.platform !== 'win32') {
        return;
    }

    if (console[PATCH_FLAG]) {
        return;
    }

    const methods = ['log', 'info', 'warn', 'error', 'debug'];
    for (const method of methods) {
        const original = console[method];
        if (typeof original !== 'function') {
            continue;
        }

        console[method] = function patchedConsoleMethod(...args) {
            return original.apply(console, args.map((arg) => transformValue(arg)));
        };
    }

    console[PATCH_FLAG] = true;
}

module.exports = patchConsoleForUnicodeSafeLogging;
