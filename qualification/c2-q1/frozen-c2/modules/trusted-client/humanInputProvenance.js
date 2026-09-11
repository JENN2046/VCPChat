 'use strict';
// No renderer token is proof. Evidence handles are minted by the admitted native attestor
// for an exact context and retained only in this process. Production attestor is unavailable
// until independent platform admission; tests inject a simulated native attestor explicitly.
const fields = ['requestId', 'decision', 'viewGeneration', 'requestGeneration', 'socketGeneration', 'eligibilityEpoch'];
function identity(c) { return JSON.stringify(fields.map(k => c[k])); }
class HumanInputProvenance {
    #attestor; #now; #evidence = new WeakMap();
    constructor(attestor, now = Date.now) { this.#attestor = attestor; this.#now = now; }
    async capture(context) {
        if (!['ALLOW', 'DENY'].includes(context.decision) || !this.#attestor) return null;
        const expected = identity(context);
        const result = await this.#attestor.verify(Object.freeze({ ...context }));
        if (!result || !['OS_ISOLATED', 'USER_PRESENCE_VERIFIED'].includes(result.kind) || result.context !== expected ||
            !Number.isFinite(result.expiresAt) || result.expiresAt <= this.#now() || result.expiresAt > this.#now() + 10000) return null;
        const handle = Object.freeze({}); this.#evidence.set(handle, { expected, expiresAt: result.expiresAt, used: false, kind: result.kind }); return handle;
    }
    valid(handle, context) { const e = handle && this.#evidence.get(handle); return !!e && !e.used && e.expiresAt > this.#now() && e.expected === identity(context); }
    consume(handle, context) { if (!this.valid(handle, context)) return false; this.#evidence.get(handle).used = true; return true; }
}
module.exports = { HumanInputProvenance, identity };
