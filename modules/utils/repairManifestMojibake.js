const iconv = require('iconv-lite');

function decodeGbkBytesAsUtf8(text) {
    return iconv.decode(iconv.encode(text, 'gbk'), 'utf8');
}

function decodeUtf8BytesAsGbk(text) {
    return iconv.decode(Buffer.from(text, 'utf8'), 'gbk');
}

function containsCjk(text) {
    return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
}

function maybeRepairString(text) {
    if (typeof text !== 'string' || !text) {
        return text;
    }

    let repaired;
    try {
        repaired = decodeGbkBytesAsUtf8(text);
    } catch (error) {
        return text;
    }

    if (!repaired || repaired === text) {
        return text;
    }

    // Only accept the repair when it is a stable inverse of the common
    // "UTF-8 bytes decoded as GBK/ANSI" mojibake pattern.
    if (decodeUtf8BytesAsGbk(repaired) !== text) {
        return text;
    }

    if (!containsCjk(repaired)) {
        return text;
    }

    // Mojibake usually inflates the string length; avoid rewriting when it doesn't.
    if (repaired.length > text.length) {
        return text;
    }

    return repaired;
}

function repairManifestMojibake(value) {
    if (Array.isArray(value)) {
        return value.map(repairManifestMojibake);
    }

    if (value && typeof value === 'object') {
        const repaired = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            repaired[key] = repairManifestMojibake(nestedValue);
        }
        return repaired;
    }

    return maybeRepairString(value);
}

module.exports = repairManifestMojibake;
