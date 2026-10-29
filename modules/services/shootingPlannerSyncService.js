'use strict';

const ownedErrors = new WeakSet();
// Public V1 outcomes only. Unknown values must not become loggable error data.
const PUBLIC_FAILURE_STATUS = new Map([
    ['REVISION_CONFLICT', 409], ['IDEMPOTENCY_KEY_REUSE', 409],
    ['INVALID_SNAPSHOT', 422], ['MISSING_CONCURRENCY_HEADERS', 400],
    ['UNAUTHORIZED', 401], ['AUTH_NOT_CONFIGURED', 401], ['FORBIDDEN', 403],
    ['WRITE_ADMISSION_DISABLED', 503], ['INVALID_JSON', 400],
    ['REQUEST_TOO_LARGE', 413], ['NOT_FOUND', 404], ['INTERNAL_ERROR', 500],
]);

function createError(message, code, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    ownedErrors.add(error);
    return error;
}

function publicFailure(payload, responseStatus) {
    const status = Number.isInteger(responseStatus) && responseStatus >= 300 && responseStatus <= 599 ? responseStatus : 502;
    const claimed = typeof payload?.code === 'string' ? payload.code : null;
    const code = PUBLIC_FAILURE_STATUS.get(claimed) === status ? claimed : `HTTP_${status}`;
    const details = { status };
    if (code === 'REVISION_CONFLICT' && Number.isSafeInteger(payload?.revision) && payload.revision >= 0) {
        details.revision = payload.revision;
    }
    return createError('拍摄排班云同步请求失败。', code, details);
}

function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(String(value || '').trim());
    } catch {
        throw createError('拍摄排班服务地址无效。', 'SHOOTING_SYNC_INVALID_URL');
    }
    if (url.username || url.password) {
        throw createError('拍摄排班服务地址不得包含凭据。', 'SHOOTING_SYNC_URL_CREDENTIALS_DENIED');
    }
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
        throw createError('远程拍摄排班服务必须使用 HTTPS。', 'SHOOTING_SYNC_HTTPS_REQUIRED');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url;
}

// Validate the response envelope before it can replace the local collections.
// Business-item semantics remain owned by the scheduling service.
function hasValidRevisionMetadata(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Number.isSafeInteger(value.revision) && value.revision >= 0
        && typeof value.updatedAt === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value.updatedAt)
        && Number.isFinite(Date.parse(value.updatedAt));
}

function isCompatibleSnapshot(value) {
    return hasValidRevisionMetadata(value) && value.schemaVersion === 1
        && ['products', 'tasks', 'sessions'].every(key => Array.isArray(value[key]));
}

class ShootingPlannerSyncService {
    constructor(options = {}) {
        this.fetch = options.fetchImpl || globalThis.fetch;
        this.timeoutMs = Math.min(30000, Math.max(500, Number(options.timeoutMs) || 10000));
        this.maxBytes = Math.min(20 * 1024 * 1024, Math.max(1024, Number(options.maxBytes) || 2 * 1024 * 1024));
        this.baseUrl = options.baseUrl ? normalizeBaseUrl(options.baseUrl) : null;
        this.schedulerToken = typeof options.schedulerToken === 'string' ? options.schedulerToken : '';
    }

    status() {
        const enabled = Boolean(this.baseUrl && this.schedulerToken.length >= 16 && this.fetch);
        return { enabled, reason: enabled ? null : 'NOT_CONFIGURED' };
    }

    async pull() {
        const response = await this.request('/api/v1/snapshot', { method: 'GET' });
        if (response?.ok !== true || !isCompatibleSnapshot(response.snapshot)) {
            throw createError('云端排班快照格式无效。', 'SHOOTING_SYNC_INVALID_RESPONSE');
        }
        return response.snapshot;
    }

    async push(snapshot, { expectedRevision, operationId }) {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
            throw createError('云端版本号缺失。', 'SHOOTING_SYNC_REVISION_REQUIRED');
        }
        if (typeof operationId !== 'string' || operationId.length < 8) {
            throw createError('同步操作号缺失。', 'SHOOTING_SYNC_OPERATION_ID_REQUIRED');
        }
        const acknowledgement = await this.request('/api/v1/snapshot', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'If-Match': String(expectedRevision),
                'Idempotency-Key': operationId,
            },
            body: JSON.stringify(snapshot),
        });
        // The server may have committed even when its reply is malformed. Keep
        // local metadata and the caller's operation id intact; never retry here.
        if (acknowledgement?.ok !== true || !hasValidRevisionMetadata(acknowledgement)
            || acknowledgement.revision <= expectedRevision) {
            throw createError('云端排班推送回执格式无效。', 'SHOOTING_SYNC_INVALID_RESPONSE');
        }
        return acknowledgement;
    }

    async request(pathname, options) {
        if (!this.status().enabled) {
            throw createError('拍摄排班云同步尚未配置。', 'SHOOTING_SYNC_NOT_CONFIGURED');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const endpoint = new URL(this.baseUrl.href);
            endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
            const response = await this.fetch(endpoint, {
                ...options,
                headers: {
                    Authorization: `Bearer ${this.schedulerToken}`,
                    ...(options.headers || {}),
                },
                redirect: 'error',
                signal: controller.signal,
            });
            const declared = Number(response.headers?.get?.('content-length') || 0);
            if (declared > this.maxBytes) {
                throw createError('云端响应超过大小限制。', 'SHOOTING_SYNC_RESPONSE_TOO_LARGE');
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length > this.maxBytes) {
                throw createError('云端响应超过大小限制。', 'SHOOTING_SYNC_RESPONSE_TOO_LARGE');
            }
            let payload;
            try {
                payload = JSON.parse(buffer.toString('utf8'));
            } catch {
                throw createError('云端响应不是有效 JSON。', 'SHOOTING_SYNC_INVALID_RESPONSE');
            }
            if (!response.ok) {
                throw publicFailure(payload, response.status);
            }
            return payload;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw createError('拍摄排班云同步超时。', 'SHOOTING_SYNC_TIMEOUT');
            }
            if (ownedErrors.has(error)) throw error;
            throw createError('拍摄排班云同步网络请求失败。', 'SHOOTING_SYNC_NETWORK_ERROR');
        } finally {
            clearTimeout(timeout);
        }
    }
}

module.exports = { ShootingPlannerSyncService, _test: { normalizeBaseUrl } };
