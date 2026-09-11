 'use strict';
const sensitive = require('./sensitiveAuthorityClassifier');
class GenericApprovalGuard {
    #ordinary = new Set();
    observe(message) {
        if (message?.type !== 'tool_approval_request' || typeof message.data?.requestId !== 'string') return;
        const id = message.data.requestId;
        this.#ordinary.delete(id);
        if (!sensitive(message.data) && this.#ordinary.size < 512) this.#ordinary.add(id);
    }
    canSend(message) {
        if (message?.type !== 'tool_approval_response') return true;
        const id = message.data?.requestId;
        if (!this.#ordinary.has(id)) return false;
        this.#ordinary.delete(id); return true;
    }
    reset() { this.#ordinary.clear(); }
}
module.exports = { GenericApprovalGuard };
