"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
    SuveiHumanAuthorizationService,
    authorizationTermsDigest,
} = require("../modules/services/suveiHumanAuthorizationService");

const TOKEN = `suvei_local_v1_${"A".repeat(43)}`;
const OWNER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const INTENT = "44444444-4444-5444-8444-444444444444";
const DELEGATE = "55555555-5555-4555-8555-555555555555";
const RECIPE = "66666666-6666-4666-8666-666666666666";
const SPEC = "77777777-7777-4777-8777-777777777777";
const SPEC_VERSION = "88888888-8888-4888-8888-888888888888";
const UNIT = "99999999-9999-4999-8999-999999999999";
const SCRATCHPAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GRANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_CANDIDATE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOURCE_CRITIC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MASK_MEDIA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SHA = "a".repeat(64);

function json(data, status = 200) {
    return new Response(JSON.stringify({ data }), {
        status,
        headers: { "content-type": "application/json" }
    });
}

function settings() {
    return {
        suveiHumanAuthorizationBaseUrl: "https://suvei.example.invalid",
        suveiHumanAuthorizationOwnerEmail: "owner@example.invalid",
        suveiHumanAuthorizationExpectedOwnerUserId: OWNER,
        suveiHumanAuthorizationExpectedOrganizationId: ORG,
    };
}

function intent(overrides = {}) {
    return {
        schemaVersion: "agent_execution_intent.v1",
        id: INTENT,
        organizationId: ORG,
        projectId: PROJECT,
        productionUnitId: UNIT,
        delegateUserId: DELEGATE,
        action: "generate_candidate",
        recipeId: RECIPE,
        recipeDigest: SHA,
        creativeSpecId: SPEC,
        creativeSpecVersionId: SPEC_VERSION,
        referenceManifestDigest: "b".repeat(64),
        targetScratchpadId: SCRATCHPAD,
        capabilityId: "newapi.gpt-image-2.5-flare.v1",
        capabilityVersion: "1",
        capabilityDigest: "c".repeat(64),
        aspectRatio: "1:1",
        resolution: "1024x1024",
        requestedOutputCount: 2,
        normalizedReason: "Generate two exact candidates",
        contextDigest: "d".repeat(64),
        requestFingerprint: "e".repeat(64),
        intentCommandId: INTENT,
        proposalState: "PENDING",
        revision: 0,
        authorizedBy: null,
        authorizedAt: null,
        authorizationExpiresAt: null,
        authorizationTermsDigest: null,
        executionGrantId: null,
        executionOperationId: null,
        executionCommandId: null,
        sourceCandidateId: null,
        sourceCandidateRevision: null,
        sourceCandidateSha256: null,
        sourceCriticResultId: null,
        maskMediaObjectId: null,
        maskContentSha256: null,
        editInstruction: null,
        ...overrides,
    };
}

function harness({
    now = Date.parse("2026-10-01T14:00:00.000Z"),
    authorizeMode = "success",
    rejectMode = "success",
    revokeMode = "success",
    advanceOnIntentGetMs = 0,
} = {}) {
    let clock = now;
    let currentIntent = intent();
    const calls = [];
    const settingsManager = { readSettings: async () => settings() };
    const fetchImpl = async (url, options = {}) => {
        const pathname = url.pathname;
        const method = options.method || "GET";
        let body = null;
        if (options.body) body = JSON.parse(options.body);
        calls.push({ pathname, method, body, authorization: options.headers?.authorization || null });

        if (pathname === "/api/v1/auth/local/login" && method === "POST") {
            assert.equal(body.email, "owner@example.invalid");
            assert.equal(body.password, "exact owner password");
            return json({ accessToken: TOKEN });
        }
        if (pathname === "/api/v1/auth/session" && method === "GET") {
            return json({
                authenticated: true,
                userId: OWNER,
                organizationId: ORG,
                role: "owner",
                authSource: "local",
                userName: "Owner",
            });
        }
        if (pathname === `/api/v1/projects/${PROJECT}/agent-execution-intents/${INTENT}` && method === "GET") {
            if (advanceOnIntentGetMs > 0) clock += advanceOnIntentGetMs;
            return json(currentIntent);
        }
        if (pathname.endsWith("/authorize") && method === "POST") {
            currentIntent = {
                ...currentIntent,
                proposalState: "AUTHORIZED",
                revision: currentIntent.revision + 1,
                authorizedBy: OWNER,
                authorizedAt: new Date(clock).toISOString(),
                authorizationExpiresAt: body.expiresAt,
                executionGrantId: GRANT,
                authorizationTermsDigest: authorizeMode === "bad_digest"
                    ? "0".repeat(64)
                    : authorizationTermsDigest(currentIntent, OWNER, body),
            };
            if (authorizeMode === "throw_after_commit") throw new Error("transport lost after commit");
            return json(currentIntent);
        }
        if (pathname.endsWith("/reject") && method === "POST") {
            currentIntent = { ...currentIntent, proposalState: "REJECTED", revision: currentIntent.revision + 1 };
            if (rejectMode === "throw_after_commit") throw new Error("reject response lost after commit");
            return json(currentIntent);
        }
        if (pathname.endsWith("/revoke") && method === "POST") {
            currentIntent = {
                ...currentIntent,
                proposalState: "REVOKED",
                revision: currentIntent.revision + 1,
            };
            if (revokeMode === "throw_after_commit") throw new Error("revoke response lost after commit");
            return json(currentIntent);
        }
        throw new Error(`unexpected request ${method} ${pathname}`);
    };
    const service = new SuveiHumanAuthorizationService({
        settingsManager,
        fetchImpl,
        now: () => clock,
    });
    return {
        service,
        calls,
        getIntent: () => currentIntent,
        setIntent: value => { currentIntent = value; },
        setNow: value => { clock = value; },
    };
}

test("owner login verifies exact local Owner identity and never exposes the bearer token", async () => {
    const { service } = harness();
    const status = await service.login("exact owner password");
    assert.equal(status.authenticated, true);
    assert.deepEqual(status.identity, {
        userId: OWNER,
        organizationId: ORG,
        role: "owner",
        authSource: "local",
        userName: "Owner",
    });
    assert.doesNotMatch(JSON.stringify(status), /suvei_local_v1_/);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "token"), false);
});

test("prepare binds exact pending Intent plus a bounded authorization envelope", async () => {
    const now = Date.parse("2026-10-01T14:00:00.000Z");
    const { service } = harness({ now });
    await service.login("exact owner password");
    const packet = await service.prepare({
        requestId: "approval-1",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(packet.intent.id, INTENT);
    assert.equal(packet.intent.proposalState, "PENDING");
    assert.equal(packet.authorization.expectedRevision, 0);
    assert.equal(packet.authorization.requestFingerprint, "e".repeat(64));
    assert.deepEqual({
        maxAttempts: packet.authorization.maxAttempts,
        maxOutputCount: packet.authorization.maxOutputCount,
        maxTotalCredits: packet.authorization.maxTotalCredits,
        maxConcurrentAttempts: packet.authorization.maxConcurrentAttempts,
        maxAdapterCallsPerAttempt: packet.authorization.maxAdapterCallsPerAttempt,
    }, {
        maxAttempts: 2,
        maxOutputCount: 2,
        maxTotalCredits: 2,
        maxConcurrentAttempts: 2,
        maxAdapterCallsPerAttempt: 1,
    });
    assert.match(packet.authorityTargetDigest, /^[0-9a-f]{64}$/);
    assert.equal(packet.toolApprovalExpiresAt, "2026-10-01T14:01:00.000Z");
});

test("approve re-reads canonical Intent and refuses any authority-bearing drift", async () => {
    const { service, calls, getIntent, setIntent } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-drift",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    setIntent({ ...getIntent(), requestedOutputCount: 3 });
    await assert.rejects(
        service.decide({ requestId: "approval-drift", approved: true }),
        error => error?.code === "SUVEI_AUTHORITY_TARGET_DRIFTED"
    );
    assert.equal(calls.some(call => call.pathname.endsWith("/authorize")), false);
});

test("approve mutates Core only with the displayed envelope and validates the authorization receipt", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    const packet = await service.prepare({
        requestId: "approval-success",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({ requestId: "approval-success", approved: true, reason: "Reviewed" });
    const authorize = calls.find(call => call.pathname.endsWith("/authorize"));
    assert.ok(authorize);
    assert.deepEqual(authorize.body, packet.authorization);
    assert.equal(decision.approved, true);
    assert.equal(decision.proposalState, "AUTHORIZED");
    assert.equal(decision.executionGrantId, GRANT);
    assert.equal(decision.authorityTargetDigest, packet.authorityTargetDigest);
    assert.equal(service.status().pendingCount, 0);
});

test("reject is a Core Owner decision and uses exact expected revision", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-reject",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({ requestId: "approval-reject", approved: false, reason: "Change output count." });
    const reject = calls.find(call => call.pathname.endsWith("/reject"));
    assert.deepEqual(reject.body, { expectedRevision: 0, reason: "Change output count." });
    assert.equal(decision.proposalState, "REJECTED");
});

test("expired ToolBox approval cannot create a fresh Core authority window", async () => {
    const { service } = harness({ now: Date.parse("2026-10-01T14:02:00.000Z") });
    await service.login("exact owner password");
    await assert.rejects(
        service.prepare({
            requestId: "approval-expired",
            toolName: "SUVEIStudio",
            args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
            timestamp: "2026-10-01T14:00:00.000Z",
            approvalTtlMs: 60000,
        }),
        error => error?.code === "SUVEI_APPROVAL_PACKET_EXPIRED"
    );
});

test("ambiguous authorize POST reconciles exact committed Core authority without resubmission", async () => {
    const { service, calls } = harness({ authorizeMode: "throw_after_commit" });
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-ambiguous",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({ requestId: "approval-ambiguous", approved: true });
    assert.equal(decision.proposalState, "AUTHORIZED");
    assert.equal(calls.filter(call => call.pathname.endsWith("/authorize")).length, 1);
    assert.ok(calls.filter(call => call.pathname === `/api/v1/projects/${PROJECT}/agent-execution-intents/${INTENT}`).length >= 2);
});

test("new ToolBox request can reconcile an already committed exact authorization without another authorize POST", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-first",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({ requestId: "approval-first", approved: true });

    const second = await service.prepare({
        requestId: "approval-transport-recovery",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(second.decisionMode, "reconcile_authorized");
    assert.equal(second.authorizationCommitted, true);
    const decision = await service.decide({ requestId: "approval-transport-recovery", approved: true });
    assert.equal(decision.reconciled, true);
    assert.equal(decision.proposalState, "AUTHORIZED");
    assert.equal(calls.filter(call => call.pathname.endsWith("/authorize")).length, 1);
});

test("recovery rejection revokes the already committed Core authorization", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-before-revoke",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({ requestId: "approval-before-revoke", approved: true });
    await service.prepare({
        requestId: "approval-revoke-recovery",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({
        requestId: "approval-revoke-recovery",
        approved: false,
        reason: "Do not continue.",
    });
    assert.equal(decision.proposalState, "REVOKED");
    const revoke = calls.find(call => call.pathname.endsWith("/revoke"));
    assert.ok(revoke);
    assert.equal(revoke.body.reason, "Do not continue.");
});

test("mismatched Core authorization terms digest fails closed", async () => {
    const { service } = harness({ authorizeMode: "bad_digest" });
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-bad-digest",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await assert.rejects(
        service.decide({ requestId: "approval-bad-digest", approved: true }),
        error => error?.code === "SUVEI_AUTHORIZATION_RECEIPT_INVALID"
    );
});

test("correction authorization binds exact Candidate, Critic, mask and one-step limits", async () => {
    const { service, calls, setIntent } = harness();
    const correction = intent({
        action: "inpaint_candidate",
        requestedOutputCount: 1,
        normalizedReason: "Repair only the bounded local defect",
        sourceCandidateId: SOURCE_CANDIDATE,
        sourceCandidateRevision: 2,
        sourceCandidateSha256: "1".repeat(64),
        sourceCriticResultId: SOURCE_CRITIC,
        maskMediaObjectId: MASK_MEDIA,
        maskContentSha256: "2".repeat(64),
        editInstruction: "Repair only the bounded local defect",
    });
    setIntent(correction);
    await service.login("exact owner password");
    const packet = await service.prepare({
        requestId: "approval-correction",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedCorrection", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });

    assert.equal(packet.intent.action, "inpaint_candidate");
    assert.equal(packet.intent.sourceCandidateId, SOURCE_CANDIDATE);
    assert.equal(packet.intent.sourceCandidateRevision, 2);
    assert.equal(packet.intent.sourceCriticResultId, SOURCE_CRITIC);
    assert.equal(packet.intent.maskMediaObjectId, MASK_MEDIA);
    assert.equal(packet.intent.maskContentSha256, "2".repeat(64));
    assert.equal(packet.intent.editInstruction, "Repair only the bounded local defect");
    assert.deepEqual({
        maxAttempts: packet.authorization.maxAttempts,
        maxOutputCount: packet.authorization.maxOutputCount,
        maxTotalCredits: packet.authorization.maxTotalCredits,
        maxConcurrentAttempts: packet.authorization.maxConcurrentAttempts,
        maxAdapterCallsPerAttempt: packet.authorization.maxAdapterCallsPerAttempt,
    }, {
        maxAttempts: 1,
        maxOutputCount: 1,
        maxTotalCredits: 1,
        maxConcurrentAttempts: 1,
        maxAdapterCallsPerAttempt: 1,
    });
    assert.equal(
        packet.expectedAuthorizationTermsDigest,
        authorizationTermsDigest(correction, OWNER, packet.authorization)
    );

    const decision = await service.decide({
        requestId: "approval-correction",
        approved: true,
        reason: "Exact mask and single-step correction reviewed.",
    });
    assert.equal(decision.proposalState, "AUTHORIZED");
    const authorize = calls.find(call => call.pathname.endsWith("/authorize"));
    assert.ok(authorize);
    assert.deepEqual(authorize.body, packet.authorization);
});

test("non-loopback HTTP Core endpoint is rejected before Owner credentials are sent", async () => {
    let fetchCalled = false;
    const service = new SuveiHumanAuthorizationService({
        settingsManager: {
            readSettings: async () => ({
                ...settings(),
                suveiHumanAuthorizationBaseUrl: "http://10.0.0.5:33103",
            }),
        },
        fetchImpl: async () => {
            fetchCalled = true;
            throw new Error("must not fetch");
        },
    });
    await assert.rejects(
        service.login("exact owner password"),
        error => error?.code === "SUVEI_OWNER_TLS_REQUIRED"
    );
    assert.equal(fetchCalled, false);
});

test("future ToolBox timestamp cannot extend approval beyond local receipt TTL", async () => {
    const now = Date.parse("2026-10-01T14:00:00.000Z");
    const { service } = harness({ now });
    await service.login("exact owner password");
    const packet = await service.prepare({
        requestId: "approval-future-clock",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T18:00:00.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(packet.toolApprovalExpiresAt, "2026-10-01T14:01:00.000Z");
});

test("committed authorization cannot resume after the Core grant expiry", async () => {
    const start = Date.parse("2026-10-01T14:00:00.000Z");
    const { service, setNow } = harness({ now: start });
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-expiry-source",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({ requestId: "approval-expiry-source", approved: true });
    setNow(Date.parse("2026-10-01T14:29:50.000Z"));
    await service.prepare({
        requestId: "approval-expiry-recovery",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:29:50.000Z",
        approvalTtlMs: 60000,
    });
    setNow(Date.parse("2026-10-01T14:30:01.000Z"));
    await assert.rejects(
        service.decide({ requestId: "approval-expiry-recovery", approved: true }),
        error => error?.code === "SUVEI_APPROVAL_PACKET_EXPIRED"
            || error?.code === "SUVEI_COMMITTED_AUTHORIZATION_EXPIRED"
    );
});

test("ambiguous revoke POST reconciles the exact committed REVOKED state", async () => {
    const { service, calls } = harness({ revokeMode: "throw_after_commit" });
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-revoke-source-ambiguous",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({ requestId: "approval-revoke-source-ambiguous", approved: true });
    await service.prepare({
        requestId: "approval-revoke-ambiguous",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({
        requestId: "approval-revoke-ambiguous",
        approved: false,
        reason: "Stop exact authorized work.",
    });
    assert.equal(decision.approved, false);
    assert.equal(decision.proposalState, "REVOKED");
    assert.equal(calls.filter(call => call.pathname.endsWith("/revoke")).length, 1);
    assert.ok(calls.filter(call =>
        call.pathname === `/api/v1/projects/${PROJECT}/agent-execution-intents/${INTENT}`
    ).length >= 4);
});

test("trusted Human authorization IPC follows the current main window and confirmed VCPLog send is chat-only", () => {
    const main = fs.readFileSync("main.js", "utf8");
    const handlers = fs.readFileSync("modules/ipc/suveiHumanAuthorizationHandlers.js", "utf8");
    const vcpLogPreload = fs.readFileSync("preloads/api/vcpLog.js", "utf8");

    const createIndex = main.indexOf("createWindow({ deferLoad: true })");
    const initIndex = main.indexOf("suveiHumanAuthorizationHandlers.initialize({");
    assert.ok(createIndex >= 0 && initIndex > createIndex);
    assert.match(main, /getMainWindow:\s*\(\) => mainWindow/);
    assert.match(handlers, /typeof getMainWindow === "function" \? getMainWindow\(\) : mainWindow/);

    assert.match(main, /ipcMain\.handle\('send-vcplog-message-confirmed'/);
    assert.match(main, /event\?\.sender !== mainWindow\.webContents/);
    assert.match(vcpLogPreload, /sendVCPLogMessageConfirmed:\s*invoke\('send-vcplog-message-confirmed'/);
    assert.match(vcpLogPreload, /\.roles\('chat'\)/);
});

test("ambiguous reject POST reconciles exact committed REJECTED state without replay", async () => {
    const { service, calls } = harness({ rejectMode: "throw_after_commit" });
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-reject-ambiguous",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    const decision = await service.decide({
        requestId: "approval-reject-ambiguous",
        approved: false,
        reason: "Reject exact pending intent.",
    });
    assert.equal(decision.proposalState, "REJECTED");
    assert.equal(decision.approved, false);
    assert.equal(calls.filter(call => call.pathname.endsWith("/reject")).length, 1);
    assert.ok(calls.filter(call =>
        call.pathname === `/api/v1/projects/${PROJECT}/agent-execution-intents/${INTENT}`
    ).length >= 2);
});

test("new ToolBox request can recover an already committed rejection but cannot reverse it", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-reject-first",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({
        requestId: "approval-reject-first",
        approved: false,
        reason: "Reject once.",
    });

    const packet = await service.prepare({
        requestId: "approval-reject-recovery",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(packet.decisionMode, "reconcile_rejected");
    assert.equal(packet.intent.proposalState, "REJECTED");
    assert.equal(packet.authorization, null);

    await assert.rejects(
        service.decide({ requestId: "approval-reject-recovery", approved: true }),
        error => error?.code === "SUVEI_REJECTED_INTENT_CANNOT_APPROVE"
    );

    const secondPacket = await service.prepare({
        requestId: "approval-reject-recovery-2",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(secondPacket.decisionMode, "reconcile_rejected");
    const decision = await service.decide({
        requestId: "approval-reject-recovery-2",
        approved: false,
    });
    assert.equal(decision.reconciled, true);
    assert.equal(decision.proposalState, "REJECTED");
    assert.equal(calls.filter(call => call.pathname.endsWith("/reject")).length, 1);
});

test("Core response streaming is bounded even without Content-Length", async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream({
        pull(controller) {
            pulls += 1;
            controller.enqueue(new Uint8Array(600_000));
        },
        cancel() {
            cancelled = true;
        },
    });
    const service = new SuveiHumanAuthorizationService({
        settingsManager: { readSettings: async () => settings() },
        fetchImpl: async () => new Response(stream, {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    });
    await assert.rejects(
        service.request("/bounded-stream", {
            token: null,
            baseUrl: "https://suvei.example.invalid",
        }),
        error => error?.code === "SUVEI_OWNER_RESPONSE_TOO_LARGE"
    );
    assert.ok(pulls >= 2);
    assert.equal(cancelled, true);
});

test("explicit nonpositive or malformed ToolBox TTL fails closed instead of refreshing to the default", async () => {
    for (const approvalTtlMs of [0, -1, "not-a-number"]) {
        const { service } = harness();
        await service.login("exact owner password");
        await assert.rejects(
            service.prepare({
                requestId: `approval-invalid-ttl-${String(approvalTtlMs).replace(/[^a-z0-9]/gi, "_")}`,
                toolName: "SUVEIStudio",
                args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
                timestamp: "2026-10-01T14:00:00.000Z",
                approvalTtlMs,
            }),
            error => error?.code === "SUVEI_APPROVAL_TTL_INVALID"
        );
    }
});

test("decision rechecks ToolBox deadline after canonical Intent read and never mutates Core after expiry", async () => {
    const { service, calls } = harness({ advanceOnIntentGetMs: 59000 });
    await service.login("exact owner password");
    // prepare GET advances the clock, so use a long enough request for prepare itself.
    const packet = await service.prepare({
        requestId: "approval-deadline-recheck",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 120000,
    });
    assert.ok(packet.toolApprovalExpiresAt);
    await assert.rejects(
        service.decide({ requestId: "approval-deadline-recheck", approved: true }),
        error => error?.code === "SUVEI_APPROVAL_PACKET_EXPIRED"
    );
    assert.equal(calls.some(call => call.pathname.endsWith("/authorize")), false);
});

test("new ToolBox request resumes an exact committed REVOKED decision without replaying revoke", async () => {
    const { service, calls } = harness();
    await service.login("exact owner password");
    await service.prepare({
        requestId: "approval-revoked-source",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:00.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({ requestId: "approval-revoked-source", approved: true });
    await service.prepare({
        requestId: "approval-revoked-first",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:10.000Z",
        approvalTtlMs: 60000,
    });
    await service.decide({
        requestId: "approval-revoked-first",
        approved: false,
        reason: "Revoke exact authority.",
    });

    const packet = await service.prepare({
        requestId: "approval-revoked-recovery",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:20.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(packet.decisionMode, "reconcile_revoked");
    assert.equal(packet.revocationCommitted, true);
    assert.equal(packet.intent.proposalState, "REVOKED");

    await assert.rejects(
        service.decide({ requestId: "approval-revoked-recovery", approved: true }),
        error => error?.code === "SUVEI_REVOKED_INTENT_CANNOT_APPROVE"
    );

    const packet2 = await service.prepare({
        requestId: "approval-revoked-recovery-2",
        toolName: "SUVEIStudio",
        args: { command: "ExecuteAuthorizedGeneration", projectId: PROJECT, intentId: INTENT },
        timestamp: "2026-10-01T14:00:20.000Z",
        approvalTtlMs: 60000,
    });
    assert.equal(packet2.decisionMode, "reconcile_revoked");
    const decision = await service.decide({
        requestId: "approval-revoked-recovery-2",
        approved: false,
    });
    assert.equal(decision.reconciled, true);
    assert.equal(decision.proposalState, "REVOKED");
    assert.equal(calls.filter(call => call.pathname.endsWith("/revoke")).length, 1);
});

test("trusted IPC binds cleanup to each recreated main window", () => {
    const handlers = fs.readFileSync("modules/ipc/suveiHumanAuthorizationHandlers.js", "utf8");
    assert.match(handlers, /let cleanupWindow = null/);
    assert.match(handlers, /current\.webContents\?\.once\?\.\("destroyed"/);
    assert.match(handlers, /if \(cleanupWindow !== current\) return/);
    assert.match(handlers, /void resolvedService\.logout\(\)/);
    assert.match(handlers, /return current && !current\.isDestroyed\(\) \? bindWindowCleanup\(current\) : null/);
});

