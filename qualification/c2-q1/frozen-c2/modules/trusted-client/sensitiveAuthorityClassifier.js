(function(root) {
    'use strict';
    const classify = Object.freeze(function isHumanAuthoritySensitiveRequest(data) {
        return !!data && (data.toolName === 'CodexWorker' || data.tool_name === 'CodexWorker') &&
            ['grant', 'revoke'].includes(data.args?.command ?? data.command);
    });
    if (typeof module === 'object' && module.exports) module.exports = classify;
    else Object.defineProperty(root, 'vcpSensitiveAuthorityClassifier', { value: classify, writable: false, configurable: false });
})(typeof globalThis === 'object' ? globalThis : this);
