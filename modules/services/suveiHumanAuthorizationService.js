"use strict";

const crypto = require("node:crypto");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^suvei_local_v1_[A-Za-z0-9_-]{43}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9:_-]{1,160}$/;
const SUPPORTED_COMMANDS = Object.freeze({
    ExecuteAuthorizedGeneration: "generate_candidate",
    ExecuteAuthorizedCorrection: "inpaint_candidate",
});
const RESPONSE_MAX_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10000;
const AUTHORIZATION_VALIDITY_MS = 30 * 60 * 1000;
const MIN_TOOL_REMAINING_MS = 5000;
const MAX_TOOL_APPROVAL_TTL_MS = 30 * 60 * 1000;
const DEFAULT_TOOL_APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_WALL_CLOCK_MS = 300000;

class SuveiHumanAuthorizationError extends Error {
    constructor(code, message = code, status = null) {
        super(message);
        this.name = "SuveiHumanAuthorizationError";
        this.code = code;
        this.status = status;
    }
}

function fail(code, message, status = null) {
    throw new SuveiHumanAuthorizationError(code, message, status);
}

function exactString(value, code) {
    if (typeof value !== "string" || !value.trim()) fail(code);
    return value.trim();
}

function exactUuid(value, code) {
    const normalized = exactString(value, code).toLowerCase();
    if (!UUID_RE.test(normalized)) fail(code);
    return normalized;
}

function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(exactString(value, "SUVEI_OWNER_BASE_URL_REQUIRED"));
    } catch {
        fail("SUVEI_OWNER_BASE_URL_INVALID");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || (url.pathname && url.pathname !== "/")) {
        fail("SUVEI_OWNER_BASE_URL_INVALID");
    }
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (url.protocol === "http:" && !loopbackHosts.has(url.hostname.toLowerCase())) {
        fail("SUVEI_OWNER_TLS_REQUIRED");
    }
    return url.origin;
}

function unwrap(payload) {
    return payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")
        ? payload.data
        : payload;
}

function stableDigest(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalJson(value) {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) fail("SUVEI_AUTHORIZATION_TERMS_INVALID");
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (!value || typeof value !== "object"
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        fail("SUVEI_AUTHORIZATION_TERMS_INVALID");
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function canonicalDigest(value) {
    return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function authorizationTerms(intent, ownerUserId, authorization) {
    return {
        schemaVersion: "agent_generation_authorization.v1",
        intentId: intent.id,
        requestFingerprint: intent.requestFingerprint,
        delegateUserId: intent.delegateUserId,
        authorizedBy: ownerUserId,
        expiresAt: authorization.expiresAt,
        maxAttempts: authorization.maxAttempts,
        maxOutputCount: authorization.maxOutputCount,
        maxTotalCredits: authorization.maxTotalCredits,
        maxConcurrentAttempts: authorization.maxConcurrentAttempts,
        maxWallClockMs: authorization.maxWallClockMs,
        maxAdapterCallsPerAttempt: authorization.maxAdapterCallsPerAttempt,
        ...(intent.action === "inpaint_candidate" ? {
            action: intent.action,
            sourceCandidateId: intent.sourceCandidateId,
            sourceCandidateSha256: intent.sourceCandidateSha256,
            sourceCriticResultId: intent.sourceCriticResultId,
            maskContentSha256: intent.maskContentSha256,
        } : {}),
    };
}

function authorizationTermsDigest(intent, ownerUserId, authorization) {
    return canonicalDigest(authorizationTerms(intent, ownerUserId, authorization));
}

function normalizedTtl(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TOOL_APPROVAL_TTL_MS;
    return Math.max(MIN_TOOL_REMAINING_MS, Math.min(Math.trunc(parsed), MAX_TOOL_APPROVAL_TTL_MS));
}

function canonicalIntentSnapshot(intent) {
    return {
        schemaVersion: intent.schemaVersion,
        id: intent.id,
        organizationId: intent.organizationId,
        projectId: intent.projectId,
        productionUnitId: intent.productionUnitId,
        delegateUserId: intent.delegateUserId,
        action: intent.action,
        recipeId: intent.recipeId,
        recipeDigest: intent.recipeDigest,
        creativeSpecId: intent.creativeSpecId,
        creativeSpecVersionId: intent.creativeSpecVersionId,
        referenceManifestDigest: intent.referenceManifestDigest,
        targetScratchpadId: intent.targetScratchpadId,
        capabilityId: intent.capabilityId,
        capabilityVersion: intent.capabilityVersion,
        capabilityDigest: intent.capabilityDigest,
        aspectRatio: intent.aspectRatio,
        resolution: intent.resolution,
        requestedOutputCount: intent.requestedOutputCount,
        normalizedReason: intent.normalizedReason,
        contextDigest: intent.contextDigest,
        requestFingerprint: intent.requestFingerprint,
        intentCommandId: intent.intentCommandId,
        proposalState: intent.proposalState,
        revision: intent.revision,
        authorizedBy: intent.authorizedBy ?? null,
        authorizedAt: intent.authorizedAt ?? null,
        authorizationExpiresAt: intent.authorizationExpiresAt ?? null,
        authorizationTermsDigest: intent.authorizationTermsDigest ?? null,
        executionGrantId: intent.executionGrantId ?? null,
        executionOperationId: intent.executionOperationId ?? null,
        executionCommandId: intent.executionCommandId ?? null,
        sourceCandidateId: intent.sourceCandidateId ?? null,
        sourceCandidateRevision: intent.sourceCandidateRevision ?? null,
        sourceCandidateSha256: intent.sourceCandidateSha256 ?? null,
        sourceCriticResultId: intent.sourceCriticResultId ?? null,
        maskMediaObjectId: intent.maskMediaObjectId ?? null,
        maskContentSha256: intent.maskContentSha256 ?? null,
        editInstruction: intent.editInstruction ?? null,
    };
}

function assertIntentShape(intent, binding, projectId, intentId, expectedAction, allowedStates = ["PENDING"]) {
    if (!intent || typeof intent !== "object" || Array.isArray(intent)
        || intent.schemaVersion !== "agent_execution_intent.v1"
        || exactUuid(intent.id, "SUVEI_INTENT_IDENTITY_INVALID") !== intentId
        || exactUuid(intent.projectId, "SUVEI_INTENT_PROJECT_INVALID") !== projectId
        || exactUuid(intent.organizationId, "SUVEI_INTENT_ORGANIZATION_INVALID") !== binding.expectedOrganizationId
        || !UUID_RE.test(String(intent.delegateUserId || ""))
        || intent.action !== expectedAction
        || !allowedStates.includes(intent.proposalState)
        || !Number.isInteger(intent.revision) || intent.revision < 0
        || typeof intent.requestFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(intent.requestFingerprint)
        || !Number.isInteger(intent.requestedOutputCount)
        || intent.requestedOutputCount < 1 || intent.requestedOutputCount > 4) {
        fail("SUVEI_AUTHORITY_TARGET_INVALID");
    }
    if (expectedAction === "inpaint_candidate" && (intent.requestedOutputCount !== 1
        || !UUID_RE.test(String(intent.sourceCandidateId || ""))
        || !Number.isInteger(intent.sourceCandidateRevision) || intent.sourceCandidateRevision < 1
        || !/^[0-9a-f]{64}$/.test(String(intent.sourceCandidateSha256 || ""))
        || !UUID_RE.test(String(intent.sourceCriticResultId || ""))
        || !UUID_RE.test(String(intent.maskMediaObjectId || ""))
        || !/^[0-9a-f]{64}$/.test(String(intent.maskContentSha256 || ""))
        || typeof intent.editInstruction !== "string" || !intent.editInstruction.trim())) {
        fail("SUVEI_CORRECTION_TARGET_INVALID");
    }
}

class SuveiHumanAuthorizationService {
    constructor({ settingsManager, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
        if (!settingsManager || typeof settingsManager.readSettings !== "function") {
            throw new TypeError("SuveiHumanAuthorizationService requires settingsManager");
        }
        if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
        this.settingsManager = settingsManager;
        this.fetchImpl = fetchImpl;
        this.now = now;
        this.token = null;
        this.identity = null;
        this.binding = null;
        this.loginPromise = null;
        this.pending = new Map();
    }

    async readBinding() {
        const settings = await this.settingsManager.readSettings();
        const binding = {
            baseUrl: normalizeBaseUrl(settings?.suveiHumanAuthorizationBaseUrl),
            ownerEmail: exactString(settings?.suveiHumanAuthorizationOwnerEmail, "SUVEI_OWNER_EMAIL_REQUIRED").toLowerCase(),
            expectedOwnerUserId: exactUuid(settings?.suveiHumanAuthorizationExpectedOwnerUserId, "SUVEI_OWNER_USER_ID_REQUIRED"),
            expectedOrganizationId: exactUuid(settings?.suveiHumanAuthorizationExpectedOrganizationId, "SUVEI_OWNER_ORGANIZATION_ID_REQUIRED"),
        };
        if (!binding.ownerEmail.includes("@") || binding.ownerEmail.length > 320) fail("SUVEI_OWNER_EMAIL_INVALID");
        return binding;
    }

    clearSession() {
        this.token = null;
        this.identity = null;
        this.binding = null;
        this.pending.clear();
    }

    status() {
        return {
            authenticated: Boolean(this.token && this.identity && this.binding),
            identity: this.identity ? { ...this.identity } : null,
            binding: this.binding ? {
                baseUrl: this.binding.baseUrl,
                ownerEmail: this.binding.ownerEmail,
                expectedOwnerUserId: this.binding.expectedOwnerUserId,
                expectedOrganizationId: this.binding.expectedOrganizationId,
            } : null,
            pendingCount: this.pending.size,
        };
    }

    async request(pathname, { method = "GET", token = this.token, body, baseUrl = this.binding?.baseUrl } = {}) {
        if (!baseUrl) fail("SUVEI_OWNER_BASE_URL_REQUIRED");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        timer.unref?.();
        try {
            let response;
            try {
                response = await this.fetchImpl(new URL(pathname, baseUrl), {
                    method,
                    redirect: "error",
                    signal: controller.signal,
                    headers: {
                        accept: "application/json",
                        ...(body !== undefined ? { "content-type": "application/json" } : {}),
                        ...(token ? { authorization: `Bearer ${token}` } : {}),
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                });
            } catch (error) {
                if (error?.name === "AbortError" || controller.signal.aborted) {
                    fail("SUVEI_OWNER_CORE_TIMEOUT");
                }
                fail("SUVEI_OWNER_CORE_UNAVAILABLE");
            }

            if (response.status === 401 && token && token === this.token) this.clearSession();
            if (!response.ok) {
                try { await response.body?.cancel?.(); } catch {}
                fail(`CORE_HTTP_${response.status}`, "SUVEI Core request failed", response.status);
            }

            const contentLengthHeader = response.headers?.get?.("content-length");
            if (contentLengthHeader !== null && contentLengthHeader !== undefined && contentLengthHeader !== "") {
                if (!/^[0-9]+$/.test(contentLengthHeader)
                    || Number(contentLengthHeader) > RESPONSE_MAX_BYTES) {
                    try { await response.body?.cancel?.(); } catch {}
                    fail("SUVEI_OWNER_RESPONSE_TOO_LARGE");
                }
            }

            const reader = response.body?.getReader?.();
            if (!reader) fail("SUVEI_OWNER_RESPONSE_INVALID");
            const chunks = [];
            let total = 0;
            try {
                while (true) {
                    const next = await reader.read();
                    if (next.done) break;
                    const chunk = Buffer.from(next.value);
                    total += chunk.length;
                    if (total > RESPONSE_MAX_BYTES) {
                        try { await reader.cancel(); } catch {}
                        fail("SUVEI_OWNER_RESPONSE_TOO_LARGE");
                    }
                    chunks.push(chunk);
                }
            } catch (error) {
                if (error instanceof SuveiHumanAuthorizationError) throw error;
                if (error?.name === "AbortError" || controller.signal.aborted) {
                    fail("SUVEI_OWNER_CORE_TIMEOUT");
                }
                fail("SUVEI_OWNER_CORE_UNAVAILABLE");
            }

            const text = Buffer.concat(chunks, total).toString("utf8");
            let parsed;
            try { parsed = JSON.parse(text); } catch { fail("SUVEI_OWNER_RESPONSE_INVALID"); }
            return unwrap(parsed);
        } finally {
            clearTimeout(timer);
        }
    }

    async login(password) {
        if (typeof password !== "string" || password.length < 12 || password.length > 128) {
            fail("SUVEI_OWNER_PASSWORD_INVALID");
        }
        if (this.loginPromise) return this.loginPromise;
        this.loginPromise = (async () => {
            const binding = await this.readBinding();
            const login = await this.request("/api/v1/auth/local/login", {
                method: "POST",
                token: null,
                baseUrl: binding.baseUrl,
                body: { email: binding.ownerEmail, password },
            });
            if (!login || !TOKEN_RE.test(String(login.accessToken || ""))) fail("SUVEI_OWNER_LOGIN_TOKEN_INVALID");
            const session = await this.request("/api/v1/auth/session", {
                token: login.accessToken,
                baseUrl: binding.baseUrl,
            });
            if (!session || session.authenticated !== true || session.role !== "owner" || session.authSource !== "local"
                || exactUuid(session.userId, "SUVEI_OWNER_SESSION_INVALID") !== binding.expectedOwnerUserId
                || exactUuid(session.organizationId, "SUVEI_OWNER_SESSION_INVALID") !== binding.expectedOrganizationId) {
                fail("SUVEI_OWNER_SESSION_IDENTITY_MISMATCH");
            }
            this.token = login.accessToken;
            this.identity = {
                userId: binding.expectedOwnerUserId,
                organizationId: binding.expectedOrganizationId,
                role: "owner",
                authSource: "local",
                userName: typeof session.userName === "string" ? session.userName : null,
            };
            this.binding = binding;
            return this.status();
        })().finally(() => {
            this.loginPromise = null;
        });
        return this.loginPromise;
    }

    async logout() {
        const token = this.token;
        const baseUrl = this.binding?.baseUrl;
        this.clearSession();
        if (token && baseUrl) {
            try {
                await this.request("/api/v1/auth/logout", { method: "POST", token, baseUrl, body: {} });
            } catch {
                // Local memory is already cleared. Remote expiry remains bounded by Core.
            }
        }
        return this.status();
    }

    async verifyOwnerSession() {
        if (!this.token || !this.identity || !this.binding) fail("SUVEI_OWNER_SESSION_REQUIRED");
        const session = await this.request("/api/v1/auth/session");
        if (!session || session.authenticated !== true || session.role !== "owner" || session.authSource !== "local"
            || String(session.userId).toLowerCase() !== this.binding.expectedOwnerUserId
            || String(session.organizationId).toLowerCase() !== this.binding.expectedOrganizationId) {
            this.clearSession();
            fail("SUVEI_OWNER_SESSION_IDENTITY_MISMATCH");
        }
        return this.identity;
    }

    async getIntent(projectId, intentId) {
        return this.request(`/api/v1/projects/${projectId}/agent-execution-intents/${intentId}`);
    }

    async prepare(approvalData = {}) {
        await this.verifyOwnerSession();
        const requestId = exactString(approvalData.requestId, "SUVEI_APPROVAL_REQUEST_ID_REQUIRED");
        if (!REQUEST_ID_RE.test(requestId)) fail("SUVEI_APPROVAL_REQUEST_ID_INVALID");
        if (approvalData.toolName !== "SUVEIStudio") fail("SUVEI_APPROVAL_TOOL_INVALID");
        const args = approvalData.args;
        if (!args || typeof args !== "object" || Array.isArray(args)) fail("SUVEI_APPROVAL_ARGS_INVALID");
        const command = exactString(args.command, "SUVEI_APPROVAL_COMMAND_REQUIRED");
        const expectedAction = SUPPORTED_COMMANDS[command];
        if (!expectedAction) fail("SUVEI_APPROVAL_COMMAND_NOT_SUPPORTED");
        const projectId = exactUuid(args.projectId, "SUVEI_APPROVAL_PROJECT_ID_INVALID");
        const intentId = exactUuid(args.intentId, "SUVEI_APPROVAL_INTENT_ID_INVALID");
        const intent = await this.getIntent(projectId, intentId);
        assertIntentShape(intent, this.binding, projectId, intentId, expectedAction, ["PENDING", "AUTHORIZED"]);

        const requested = intent.requestedOutputCount;
        const reconciliation = intent.proposalState === "AUTHORIZED";
        const committedExpiry = reconciliation ? Date.parse(String(intent.authorizationExpiresAt || "")) : NaN;
        if (reconciliation && (!Number.isFinite(committedExpiry)
            || this.now() + MIN_TOOL_REMAINING_MS > committedExpiry
            || intent.revision < 1)) {
            fail("SUVEI_COMMITTED_AUTHORIZATION_EXPIRED");
        }
        const authorization = {
            expectedRevision: reconciliation ? intent.revision - 1 : intent.revision,
            requestFingerprint: intent.requestFingerprint,
            expiresAt: reconciliation
                ? new Date(committedExpiry).toISOString()
                : new Date(this.now() + AUTHORIZATION_VALIDITY_MS).toISOString(),
            maxAttempts: requested,
            maxOutputCount: requested,
            maxTotalCredits: requested,
            maxConcurrentAttempts: requested,
            maxWallClockMs: MAX_WALL_CLOCK_MS,
            maxAdapterCallsPerAttempt: 1,
        };
        const expectedAuthorizationTermsDigest = authorizationTermsDigest(
            intent,
            this.identity.userId,
            authorization,
        );

        if (reconciliation) {
            if (String(intent.authorizedBy || "").toLowerCase() !== this.identity.userId
                || String(intent.authorizationTermsDigest || "").toLowerCase() !== expectedAuthorizationTermsDigest
                || !UUID_RE.test(String(intent.executionGrantId || ""))
                || intent.executionOperationId !== null
                || intent.executionCommandId !== null) {
                fail("SUVEI_COMMITTED_AUTHORIZATION_MISMATCH");
            }
        }

        const intentSnapshot = canonicalIntentSnapshot(intent);
        const canonicalIntentDigest = canonicalDigest(intentSnapshot);
        const decisionMode = reconciliation ? "reconcile_authorized" : "authorize";
        const authorityTargetDigest = canonicalDigest({
            schemaVersion: "suvei_human_authorization_target.v1",
            requestId,
            command,
            projectId,
            intentId,
            decisionMode,
            canonicalIntentDigest,
            expectedAuthorizationTermsDigest,
            authorization,
        });
        const ttlMs = normalizedTtl(approvalData.approvalTtlMs);
        const receivedAt = this.now();
        const requestStartedAt = Date.parse(String(approvalData.timestamp || ""));
        const localDeadline = receivedAt + ttlMs;
        const callerDeadline = Number.isFinite(requestStartedAt)
            ? requestStartedAt + ttlMs
            : localDeadline;
        const boundedToolDeadline = Math.min(localDeadline, callerDeadline);
        const toolApprovalDeadline = reconciliation
            ? Math.min(boundedToolDeadline, committedExpiry)
            : boundedToolDeadline;
        if (this.now() + MIN_TOOL_REMAINING_MS > toolApprovalDeadline) fail("SUVEI_APPROVAL_PACKET_EXPIRED");
        const toolApprovalExpiresAt = new Date(toolApprovalDeadline).toISOString();
        const packet = {
            schemaVersion: "suvei_human_authorization_preview.v1",
            requestId,
            command,
            projectId,
            intentId,
            decisionMode,
            authorizationCommitted: reconciliation,
            authorityTargetDigest,
            expectedAuthorizationTermsDigest,
            toolApprovalExpiresAt,
            owner: { ...this.identity },
            intent: intentSnapshot,
            authorization,
        };
        this.pending.set(requestId, {
            requestId,
            command,
            projectId,
            intentId,
            expectedAction,
            decisionMode,
            canonicalIntentDigest,
            authorityTargetDigest,
            expectedAuthorizationTermsDigest,
            authorization,
            toolApprovalDeadline,
        });
        return packet;
    }

    assertCommittedAuthorization(intent, pending) {
        assertIntentShape(
            intent,
            this.binding,
            pending.projectId,
            pending.intentId,
            pending.expectedAction,
            ["AUTHORIZED"],
        );
        const committedExpiry = Date.parse(String(intent.authorizationExpiresAt || ""));
        if (!Number.isFinite(committedExpiry)
            || this.now() + MIN_TOOL_REMAINING_MS > committedExpiry) {
            fail("SUVEI_COMMITTED_AUTHORIZATION_EXPIRED");
        }
        if (intent.revision !== pending.authorization.expectedRevision + 1
            || intent.requestFingerprint !== pending.authorization.requestFingerprint
            || String(intent.authorizedBy || "").toLowerCase() !== this.identity.userId
            || String(intent.authorizationTermsDigest || "").toLowerCase() !== pending.expectedAuthorizationTermsDigest
            || new Date(intent.authorizationExpiresAt).toISOString() !== pending.authorization.expiresAt
            || !UUID_RE.test(String(intent.executionGrantId || ""))
            || intent.executionOperationId !== null
            || intent.executionCommandId !== null) {
            fail("SUVEI_AUTHORIZATION_RECEIPT_INVALID");
        }
        return intent;
    }

    async reconcileAuthorization(pending, originalError) {
        try {
            const current = await this.getIntent(pending.projectId, pending.intentId);
            if (current?.proposalState === "AUTHORIZED") {
                return this.assertCommittedAuthorization(current, pending);
            }
            if (current?.proposalState === "PENDING") throw originalError;
            fail("SUVEI_AUTHORIZATION_OUTCOME_CONFLICT");
        } catch (reconcileError) {
            if (reconcileError === originalError) throw originalError;
            if (reconcileError?.code === "SUVEI_AUTHORIZATION_RECEIPT_INVALID"
                || reconcileError?.code === "SUVEI_AUTHORIZATION_OUTCOME_CONFLICT") {
                throw reconcileError;
            }
            throw originalError;
        }
    }

    assertRevokedAuthorization(intent, pending, authorizedIntent) {
        assertIntentShape(
            intent,
            this.binding,
            pending.projectId,
            pending.intentId,
            pending.expectedAction,
            ["REVOKED"],
        );
        if (intent.revision !== authorizedIntent.revision + 1
            || intent.requestFingerprint !== pending.authorization.requestFingerprint
            || String(intent.authorizedBy || "").toLowerCase() !== this.identity.userId
            || String(intent.authorizationTermsDigest || "").toLowerCase() !== pending.expectedAuthorizationTermsDigest
            || String(intent.executionGrantId || "").toLowerCase() !== String(authorizedIntent.executionGrantId || "").toLowerCase()
            || intent.executionOperationId !== null
            || intent.executionCommandId !== null) {
            fail("SUVEI_REVOCATION_RECEIPT_INVALID");
        }
        return intent;
    }

    async reconcileRevocation(pending, authorizedIntent, originalError) {
        try {
            const current = await this.getIntent(pending.projectId, pending.intentId);
            if (current?.proposalState === "REVOKED") {
                return this.assertRevokedAuthorization(current, pending, authorizedIntent);
            }
            if (current?.proposalState === "AUTHORIZED") throw originalError;
            fail("SUVEI_REVOCATION_OUTCOME_CONFLICT");
        } catch (reconcileError) {
            if (reconcileError === originalError) throw originalError;
            if (reconcileError?.code === "SUVEI_REVOCATION_RECEIPT_INVALID"
                || reconcileError?.code === "SUVEI_REVOCATION_OUTCOME_CONFLICT") {
                throw reconcileError;
            }
            throw originalError;
        }
    }

    async decide({ requestId: requestIdValue, approved, reason = "" } = {}) {
        await this.verifyOwnerSession();
        const requestId = exactString(requestIdValue, "SUVEI_APPROVAL_REQUEST_ID_REQUIRED");
        const pending = this.pending.get(requestId);
        if (!pending) fail("SUVEI_APPROVAL_PACKET_NOT_PREPARED");
        if (this.now() + MIN_TOOL_REMAINING_MS > pending.toolApprovalDeadline) {
            this.pending.delete(requestId);
            fail("SUVEI_APPROVAL_PACKET_EXPIRED");
        }

        const normalizedReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
        let current = await this.getIntent(pending.projectId, pending.intentId);
        let updated;

        if (approved === true) {
            if (current.proposalState === "AUTHORIZED") {
                updated = this.assertCommittedAuthorization(current, pending);
            } else {
                assertIntentShape(
                    current,
                    this.binding,
                    pending.projectId,
                    pending.intentId,
                    pending.expectedAction,
                    ["PENDING"],
                );
                const currentDigest = canonicalDigest(canonicalIntentSnapshot(current));
                if (currentDigest !== pending.canonicalIntentDigest) {
                    this.pending.delete(requestId);
                    fail("SUVEI_AUTHORITY_TARGET_DRIFTED");
                }
                try {
                    updated = await this.request(
                        `/api/v1/projects/${pending.projectId}/agent-execution-intents/${pending.intentId}/authorize`,
                        { method: "POST", body: pending.authorization },
                    );
                    updated = this.assertCommittedAuthorization(updated, pending);
                } catch (error) {
                    updated = await this.reconcileAuthorization(pending, error);
                }
            }
        } else if (current.proposalState === "AUTHORIZED") {
            current = this.assertCommittedAuthorization(current, pending);
            try {
                updated = await this.request(
                    `/api/v1/projects/${pending.projectId}/agent-execution-intents/${pending.intentId}/revoke`,
                    {
                        method: "POST",
                        body: {
                            expectedRevision: current.revision,
                            reason: normalizedReason || "Revoked from VCPChat human authorization recovery surface.",
                        },
                    },
                );
                updated = this.assertRevokedAuthorization(updated, pending, current);
            } catch (error) {
                updated = await this.reconcileRevocation(pending, current, error);
            }
        } else if (current.proposalState === "REVOKED" && approved !== true) {
            const authorizedRevision = pending.authorization.expectedRevision + 1;
            const authorizedIntent = {
                ...current,
                proposalState: "AUTHORIZED",
                revision: authorizedRevision,
            };
            updated = this.assertRevokedAuthorization(current, pending, authorizedIntent);
        } else {
            assertIntentShape(
                current,
                this.binding,
                pending.projectId,
                pending.intentId,
                pending.expectedAction,
                ["PENDING"],
            );
            const currentDigest = canonicalDigest(canonicalIntentSnapshot(current));
            if (currentDigest !== pending.canonicalIntentDigest) {
                this.pending.delete(requestId);
                fail("SUVEI_AUTHORITY_TARGET_DRIFTED");
            }
            updated = await this.request(
                `/api/v1/projects/${pending.projectId}/agent-execution-intents/${pending.intentId}/reject`,
                {
                    method: "POST",
                    body: {
                        expectedRevision: pending.authorization.expectedRevision,
                        reason: normalizedReason || "Rejected from VCPChat human authorization surface.",
                    },
                },
            );
            if (!updated || updated.proposalState !== "REJECTED"
                || String(updated.id).toLowerCase() !== pending.intentId) {
                fail("SUVEI_REJECTION_RECEIPT_INVALID");
            }
        }

        this.pending.delete(requestId);
        return {
            schemaVersion: "suvei_human_authorization_decision.v1",
            requestId,
            approved: approved === true,
            reconciled: pending.decisionMode === "reconcile_authorized" || (approved === true && current.proposalState === "AUTHORIZED"),
            authorityTargetDigest: pending.authorityTargetDigest,
            intentId: pending.intentId,
            projectId: pending.projectId,
            proposalState: updated.proposalState,
            revision: updated.revision,
            authorizationTermsDigest: updated.authorizationTermsDigest ?? null,
            executionGrantId: updated.executionGrantId ?? null,
        };
    }

}

module.exports = {
    AUTHORIZATION_VALIDITY_MS,
    MAX_WALL_CLOCK_MS,
    SUPPORTED_COMMANDS,
    SuveiHumanAuthorizationError,
    SuveiHumanAuthorizationService,
    authorizationTermsDigest,
    canonicalIntentSnapshot,
    stableDigest,
};
