 'use strict';
const sensitive = require('./sensitiveAuthorityClassifier');
const MAX_FIELD_BYTES = 8192;
function exact(value) {
    if (typeof value !== 'string' || !value.isWellFormed()) throw Error('INVALID_TARGET');
    const bytes = Buffer.from(value, 'utf8');
    if (bytes.length > MAX_FIELD_BYTES) throw Error('TARGET_TOO_LARGE');
    return Object.freeze({ readable: value, ascii: [...bytes].map(b => b === 92 ? '\\\\' : b >= 0x21 && b <= 0x7e ? String.fromCharCode(b) : '\\x' + b.toString(16).toUpperCase().padStart(2, '0')).join(''),
        hex: [...bytes].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') });
}
function projection(record) {
    const fields = []; let valid = sensitive(record);
    const grant = record.args?.command === 'grant';
    const source = [['command', record.args?.command], ['operation', record.toolName + ':' + record.args?.command],
        ...(grant ? [['projectRoot', record.args?.projectRoot], ['purpose', record.args?.purpose]] : [['grantId', record.args?.grantId]])];
    for (const [label, value] of source) {
        try { fields.push(Object.freeze({ label, ...exact(value) })); if (!value.trim()) valid = false; }
        catch { fields.push(Object.freeze({ label, invalid: true })); valid = false; }
    }
    if (grant && record.args.purpose !== 'propose') valid = false;
    return Object.freeze({ operation: grant ? '授予一次性提案写入权限' : '撤销一次性提案写入权限', fields: Object.freeze(fields), allow: valid,
        explanation: grant ? '允许：冻结 CodexWorker 边界内的隔离提案。未授权：merge、commit、push、deploy、修改原始工作区。' : '撤销上方指定的一次性权限。',
        warning: valid ? '' : 'This request cannot be safely and completely displayed. It cannot be allowed. You may still reject it.' });
}
module.exports = { exact, projection, MAX_FIELD_BYTES };
