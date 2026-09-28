'use strict';

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DEFAULT_TIMEOUT_MS = 10_000;

class ShootingPlannerSyncError extends Error {
  constructor(message, { code = 'VCP_SYNC_ERROR', status = null, revision = null } = {}) {
    super(message);
    this.name = 'ShootingPlannerSyncError';
    this.code = code;
    this.status = status;
    this.revision = revision;
  }
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('baseUrl is required');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('baseUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('baseUrl must use http or https');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('baseUrl must not contain credentials, query, or fragment');
  }
  return parsed.toString().replace(/\/$/u, '');
}

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function publicFailure(payload, status) {
  const code = typeof payload?.code === 'string' && payload.code
    ? payload.code
    : `HTTP_${status}`;
  const revision = Number.isInteger(payload?.revision) ? payload.revision : null;
  return new ShootingPlannerSyncError(`Jenn Shooting Operations request failed: ${code}`, {
    code,
    status,
    revision,
  });
}

class ShootingPlannerSyncService {
  constructor({
    baseUrl,
    schedulerToken,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    if (typeof schedulerToken !== 'string' || schedulerToken.length < 16) {
      throw new TypeError('schedulerToken must be a configured scheduler credential');
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('fetch implementation is required');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new TypeError('timeoutMs must be an integer between 1 and 60000');
    }
    this.schedulerToken = schedulerToken;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, { headers = {}, body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(path, `${this.baseUrl}/`), {
        method,
        headers: {
          Accept: 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new ShootingPlannerSyncError('Jenn Shooting Operations returned invalid JSON', {
            code: 'VCP_SYNC_INVALID_RESPONSE',
            status: response.status,
          });
        }
      }
      if (payload !== null && (typeof payload !== 'object' || Array.isArray(payload))) {
        throw new ShootingPlannerSyncError('Jenn Shooting Operations returned an invalid response shape', {
          code: 'VCP_SYNC_INVALID_RESPONSE',
          status: response.status,
        });
      }
      if (!response.ok) {
        throw publicFailure(payload, response.status);
      }
      return payload;
    } catch (error) {
      if (error instanceof ShootingPlannerSyncError) throw error;
      const code = error?.name === 'AbortError' ? 'VCP_SYNC_TIMEOUT' : 'VCP_SYNC_NETWORK_ERROR';
      throw new ShootingPlannerSyncError(
        code === 'VCP_SYNC_TIMEOUT'
          ? 'Jenn Shooting Operations request timed out'
          : 'Jenn Shooting Operations request failed before a valid response',
        { code },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async pull() {
    const payload = await this.request('GET', '/api/v1/snapshot');
    if (payload?.ok !== true || payload.snapshot === null
        || typeof payload.snapshot !== 'object' || Array.isArray(payload.snapshot)
        || !Number.isInteger(payload.snapshot.revision)) {
      throw new ShootingPlannerSyncError('Jenn Shooting Operations returned an invalid snapshot response', {
        code: 'VCP_SYNC_INVALID_RESPONSE',
        status: 200,
      });
    }
    return payload.snapshot;
  }

  async push(snapshot, { expectedRevision, operationId } = {}) {
    requireRecord(snapshot, 'snapshot');
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new TypeError('expectedRevision must be a non-negative integer');
    }
    if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId)) {
      throw new TypeError('operationId does not satisfy the Jenn Shooting Operations idempotency-key contract');
    }

    const payload = await this.request('PUT', '/api/v1/snapshot', {
      headers: {
        Authorization: `Bearer ${this.schedulerToken}`,
        'Content-Type': 'application/json',
        'If-Match': String(expectedRevision),
        'Idempotency-Key': operationId,
      },
      body: JSON.stringify(snapshot),
    });

    if (payload?.ok !== true
        || !Number.isInteger(payload.revision)
        || payload.revision !== expectedRevision + 1
        || typeof payload.updatedAt !== 'string') {
      throw new ShootingPlannerSyncError('Jenn Shooting Operations returned an invalid push response', {
        code: 'VCP_SYNC_INVALID_RESPONSE',
        status: 200,
      });
    }
    return payload;
  }
}

module.exports = {
  ShootingPlannerSyncError,
  ShootingPlannerSyncService,
};
