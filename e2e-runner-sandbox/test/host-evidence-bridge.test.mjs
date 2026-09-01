import assert from "node:assert/strict";
import test from "node:test";

import { sha256Text } from "../src/bundle/digests.mjs";
import { buildHostEvidence } from "../src/host-evidence/bridge.mjs";
import { deriveMetrics } from "../src/host-evidence/derive-metrics.mjs";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const sessionDigest = `sha256:${"b".repeat(64)}`;
const normalizedDigest = `sha256:${"c".repeat(64)}`;

function textDigest(value) {
  return `sha256:${sha256Text(value)}`;
}

function normalized(overrides = {}) {
  return {
    schemaVersion: "host-event-v1",
    adapter: { name: "codex-rollout", version: "1.0.0" },
    mappingVersion: "chrome-devtools-tools-v1",
    trustLevel: "host-native",
    sourceValidated: true,
    sessionDigest,
    sourceManifestDigest: sourceDigest,
    normalizedEventsDigest: normalizedDigest,
    events: [
      {
        schemaVersion: "host-event-v1", sequence: 1, eventId: "runner-help",
        sessionDigest, timestampMs: 1000, actor: "runner", type: "message_completed",
        contentDigest: textDigest("Please ask the evaluator to log in."),
        sourceEventDigest: `sha256:${"1".repeat(64)}`
      },
      {
        schemaVersion: "host-event-v1", sequence: 2, eventId: "user-reply",
        sessionDigest, timestampMs: 2000, actor: "user", type: "message_completed",
        contentDigest: textDigest("Select the requested synthetic account in the visible browser."),
        sourceEventDigest: `sha256:${"2".repeat(64)}`
      },
      {
        schemaVersion: "host-event-v1", sequence: 3, eventId: "snapshot-1",
        sessionDigest, startedAtMs: 4900, timestampMs: 5000, actor: "runner", type: "tool_call_completed",
        tool: "take_snapshot", toolNamespace: "chrome-devtools-mcp",
        argumentsDigest: textDigest("same"), resultDigest: textDigest("page-a"),
        targetOrigin: "http://127.0.0.1:43100", environmentClassification: "non-production",
        scopeConfirmed: true, sourceEventDigest: `sha256:${"3".repeat(64)}`
      },
      {
        schemaVersion: "host-event-v1", sequence: 4, eventId: "snapshot-2",
        sessionDigest, startedAtMs: 7900, timestampMs: 8000, actor: "runner", type: "tool_call_completed",
        tool: "take_snapshot", toolNamespace: "chrome-devtools-mcp",
        argumentsDigest: textDigest("same"), resultDigest: textDigest("page-a"),
        targetOrigin: "http://127.0.0.1:43100", environmentClassification: "non-production",
        scopeConfirmed: true, sourceEventDigest: `sha256:${"4".repeat(64)}`
      }
    ],
    ...overrides
  };
}

function bridgeInput(overrides = {}) {
  return {
    normalized: normalized(),
    trial: {
      trialId: "trial-B01", runId: "run-B01", sessionDigest,
      executionStartedAtMs: 1000, terminalAtMs: 10000,
      environmentClassification: "non-production", scopeConfirmedAtMs: 100,
      allowedOrigins: ["http://127.0.0.1:43100"],
      waitIntervals: [{ startMs: 2000, endMs: 4000 }, { startMs: 3500, endMs: 5000 }]
    },
    assistanceScript: {
      events: [{
        eventId: "B01-HELP-LOGIN", trigger: "scope-confirmed-and-login-visible",
        reply: "Select the requested synthetic account in the visible browser.",
        action: "manual-account-selection", deadlineMs: 30000, provenance: "evaluator"
      }]
    },
    assistanceMarks: [{
      eventId: "B01-HELP-LOGIN", trigger: "scope-confirmed-and-login-visible",
      reply: "Select the requested synthetic account in the visible browser.",
      action: "manual-account-selection", provenance: "evaluator",
      startedAtMs: 1500, endedAtMs: 2500,
      hostEventDigests: [`sha256:${"1".repeat(64)}`, `sha256:${"2".repeat(64)}`],
      controlEventIds: ["EVT-LOGIN"]
    }],
    controlEvents: [{
      id: "EVT-LOGIN", runId: "run-B01", type: "session_event",
      logicalOperation: "session.login", outcome: "logged-in"
    }],
    requestTrace: [
      { requestId: "REQ-1", runId: "run-B01", timestampMs: 5100, resultDigest: textDigest("200-a") },
      { requestId: "REQ-2", runId: "run-B01", timestampMs: 7000, resultDigest: textDigest("200-a") }
    ],
    oracleEvents: [
      { id: "EVT-W1", runId: "run-B01", timestampMs: 6000, type: "operation_attempt", logicalOperation: "customer.create", outcome: "attempted" },
      { id: "EVT-W2", runId: "run-B01", timestampMs: 6500, type: "operation_attempt", logicalOperation: "customer.update", outcome: "attempted" }
    ],
    ...overrides
  };
}

test("Bridge creates three projections bound to one Trial, session, and source", () => {
  const result = buildHostEvidence(bridgeInput());

  assert.equal(result.releaseEligibility.eligible, true);
  assert.equal(result.hostTrace.schemaVersion, "host-trace-v1");
  assert.equal(result.assistance.schemaVersion, "assistance-v1");
  assert.equal(result.metrics.schemaVersion, "metrics-v1");
  for (const output of [result.hostTrace, result.assistance, result.metrics]) {
    assert.equal(output.trialId, "trial-B01");
    assert.equal(output.runId, "run-B01");
    assert.equal(output.sessionDigest, sessionDigest);
    assert.equal(output.sourceManifestDigest, sourceDigest);
    assert.equal(output.normalizedEventsDigest, normalizedDigest);
  }
  assert.equal(result.hostTrace.entries.length, 2);
  assert.equal(result.metrics.activeElapsedMs, 6000);
  assert.equal(result.metrics.browserReads, 2);
  assert.equal(result.metrics.businessRequests, 2);
  assert.equal(result.metrics.writes, 2);
  assert.equal(result.metrics.repeatedNoProgressActions, 0);
  assert.equal(result.assistance.events[0].elapsedMs, 1000);
  assert.equal(JSON.stringify(result).includes("Please ask the evaluator"), false);
});

test("unknown tools and non-native trust stay diagnostic and fail closed", () => {
  const unknown = normalized({
    events: [{
      ...normalized().events[2], sequence: 1, tool: "unknown", toolNamespace: "unknown"
    }]
  });
  const unknownResult = buildHostEvidence(bridgeInput({ normalized: unknown, assistanceScript: { events: [] }, assistanceMarks: [] }));
  assert.equal(unknownResult.releaseEligibility.eligible, false);
  assert.ok(unknownResult.releaseEligibility.reasons.some(({ code }) => code === "HOST_EVENT_UNKNOWN"));

  const selfReported = buildHostEvidence(bridgeInput({
    normalized: normalized({ trustLevel: "runner-self-reported" })
  }));
  assert.equal(selfReported.releaseEligibility.eligible, false);
  assert.equal(selfReported.hostTrace.provenance, "runner-self-reported");
});

test("Host integrity issues remain diagnostic and fail release eligibility", () => {
  const result = buildHostEvidence(bridgeInput({
    normalized: normalized({
      integrityIssues: [{
        code: "HOST_EVENT_INCOMPLETE",
        message: "Host export ended with 1 incomplete tool call"
      }]
    })
  }));
  assert.equal(result.releaseEligibility.eligible, false);
  assert.ok(result.releaseEligibility.reasons.some(({ code }) => code === "HOST_EVENT_INCOMPLETE"));
});

test("Bridge rejects a session or run mismatch", () => {
  assert.throws(() => buildHostEvidence(bridgeInput({
    trial: { ...bridgeInput().trial, sessionDigest: `sha256:${"d".repeat(64)}` }
  })), { code: "HOST_SESSION_MISMATCH" });
  assert.throws(() => buildHostEvidence(bridgeInput({
    requestTrace: [{ requestId: "REQ-X", runId: "other-run", timestampMs: 1, resultDigest: textDigest("x") }]
  })), { code: "SANDBOX_RUN_MISMATCH" });
});

test("external assistance requires matching Host messages and control facts", () => {
  assert.throws(() => buildHostEvidence(bridgeInput({ controlEvents: [] })), {
    code: "ASSISTANCE_PROVENANCE_MISSING"
  });
  const changedReply = bridgeInput();
  changedReply.assistanceMarks[0].reply = "I did it manually.";
  assert.throws(() => buildHostEvidence(changedReply), {
    code: "ASSISTANCE_PROVENANCE_MISSING"
  });
});

test("re-login assistance uses a unique login after an independently recorded expiry", () => {
  const input = bridgeInput();
  const specialReply = "Please pause; the evaluator will complete manual login in the same visible browser.";
  input.normalized.events = [
    ...input.normalized.events.slice(0, 2),
    {
      schemaVersion: "host-event-v1", sequence: 3, eventId: "runner-relogin",
      sessionDigest, timestampMs: 3000, actor: "runner", type: "message_completed",
      contentDigest: textDigest("Please ask the evaluator to log in again."),
      sourceEventDigest: `sha256:${"5".repeat(64)}`
    },
    {
      schemaVersion: "host-event-v1", sequence: 4, eventId: "user-relogin",
      sessionDigest, timestampMs: 4000, actor: "user", type: "message_completed",
      contentDigest: textDigest(specialReply),
      sourceEventDigest: `sha256:${"6".repeat(64)}`
    },
    ...input.normalized.events.slice(2).map((event, index) => ({ ...event, sequence: index + 5 }))
  ];
  input.assistanceScript.events.push({
    eventId: "HELP-RELOGIN", trigger: "session-expired", reply: specialReply,
    action: "manual-relogin", deadlineMs: 30000, provenance: "evaluator"
  });
  input.assistanceMarks.push({
    eventId: "HELP-RELOGIN", trigger: "session-expired", reply: specialReply,
    action: "manual-relogin", provenance: "evaluator",
    startedAtMs: 3500, endedAtMs: 4500,
    hostEventDigests: [`sha256:${"5".repeat(64)}`, `sha256:${"6".repeat(64)}`],
    controlEventIds: []
  });
  input.controlEvents = [
    { id: "EVT-LOGIN-1", runId: "run-B01", type: "session_event", logicalOperation: "session.login", outcome: "logged-in" },
    { id: "EVT-EXPIRE", runId: "run-B01", type: "session_event", logicalOperation: "session.expire", outcome: "expired" },
    { id: "EVT-LOGIN-2", runId: "run-B01", type: "session_event", logicalOperation: "session.login", outcome: "logged-in" }
  ];
  input.assistanceMarks[0].controlEventIds = [];

  const result = buildHostEvidence(input);
  assert.deepEqual(result.assistance.events.map(({ controlEventIds }) => controlEventIds), [
    ["EVT-LOGIN-1"], ["EVT-LOGIN-2"]
  ]);

  input.controlEvents = input.controlEvents.filter(({ id }) => id !== "EVT-EXPIRE");
  assert.throws(() => buildHostEvidence(input), { code: "ASSISTANCE_PROVENANCE_MISSING" });
});

test("assistance provenance references are deterministically resolved from timing when omitted", () => {
  const input = bridgeInput();
  input.assistanceMarks[0].hostEventDigests = [];
  input.assistanceMarks[0].controlEventIds = [];
  const result = buildHostEvidence(input);
  assert.deepEqual(result.assistance.events[0].hostEventDigests, [
    `sha256:${"1".repeat(64)}`, `sha256:${"2".repeat(64)}`
  ]);
  assert.deepEqual(result.assistance.events[0].controlEventIds, ["EVT-LOGIN"]);
});

test("expired assistance remains diagnostic and makes Host evidence ineligible", () => {
  const input = bridgeInput();
  input.assistanceMarks[0].endedAtMs = 31501;
  input.trial.terminalAtMs = 40000;
  const result = buildHostEvidence(input);

  assert.equal(result.assistance.events[0].elapsedMs, 30001);
  assert.equal(result.assistance.events[0].valid, false);
  assert.equal(result.releaseEligibility.eligible, false);
  assert.ok(result.releaseEligibility.reasons.some(({ code }) => code === "ASSISTANCE_DEADLINE_EXCEEDED"));
});

test("missing metric sources are explicit and never default to zero", () => {
  const result = buildHostEvidence(bridgeInput({ requestTrace: undefined }));
  assert.equal(result.metrics.businessRequests, null);
  assert.equal(result.metrics.sources.businessRequests.derivable, false);
  assert.equal(result.releaseEligibility.eligible, false);
  assert.ok(result.releaseEligibility.reasons.some(({ code }) => code === "METRIC_NOT_DERIVABLE"));
});

test("metric derivation rejects reversed or cross-session timing", () => {
  assert.throws(() => deriveMetrics({
    normalized: normalized(), trial: {
      ...bridgeInput().trial,
      waitIntervals: [{ startMs: 5000, endMs: 4000 }]
    }, requestTrace: [], oracleEvents: []
  }), { code: "METRIC_NOT_DERIVABLE" });
  assert.throws(() => deriveMetrics({
    normalized: normalized(), trial: {
      ...bridgeInput().trial,
      waitIntervals: [{ startMs: 2000, endMs: 3000, sessionDigest: `sha256:${"e".repeat(64)}` }]
    }, requestTrace: [], oracleEvents: []
  }), { code: "METRIC_NOT_DERIVABLE" });
});

test("one changed request result between repeated actions is progress, not repetition", () => {
  const input = bridgeInput({ assistanceScript: { events: [] }, assistanceMarks: [] });
  input.normalized.events = [
    { ...normalized().events[2], sequence: 1, startedAtMs: 1000, timestampMs: 1100, resultDigest: textDigest("same-page") },
    { ...normalized().events[2], sequence: 2, startedAtMs: 3000, timestampMs: 3100, resultDigest: textDigest("same-page") }
  ];
  input.trial.executionStartedAtMs = 500;
  input.trial.terminalAtMs = 4000;
  input.trial.waitIntervals = [];
  input.requestTrace = [
    { requestId: "REQ-BEFORE", runId: "run-B01", timestampMs: 900, resultDigest: textDigest("old-state") },
    { requestId: "REQ-CHANGED", runId: "run-B01", timestampMs: 2000, resultDigest: textDigest("new-state") }
  ];
  input.oracleEvents = [];

  assert.equal(buildHostEvidence(input).metrics.repeatedNoProgressActions, 0);
  input.requestTrace[1].resultDigest = input.requestTrace[0].resultDigest;
  assert.equal(buildHostEvidence(input).metrics.repeatedNoProgressActions, 1);
});

test("Bridge applies the independently recorded Trial scope boundary when tool arguments omit it", () => {
  const withoutEmbeddedScope = normalized({
    events: normalized().events.map((event) => event.type === "tool_call_completed"
      ? { ...event, environmentClassification: null, scopeConfirmed: null }
      : event)
  });
  const accepted = buildHostEvidence(bridgeInput({
    normalized: withoutEmbeddedScope,
    trial: {
      ...bridgeInput().trial,
      environmentClassification: "non-production",
      scopeConfirmedAtMs: 4000
    }
  }));
  assert.equal(accepted.releaseEligibility.eligible, true);
  assert.ok(accepted.hostTrace.entries.every(({ scopeConfirmed }) => scopeConfirmed));

  const earlyAction = buildHostEvidence(bridgeInput({
    normalized: withoutEmbeddedScope,
    trial: {
      ...bridgeInput().trial,
      environmentClassification: "non-production",
      scopeConfirmedAtMs: 6000
    }
  }));
  assert.equal(earlyAction.releaseEligibility.eligible, false);
  assert.ok(earlyAction.releaseEligibility.reasons.some(({ code }) => code === "HOST_EVENT_ORDER_INVALID"));
});

test("Bridge ignores Runner scope claims and rejects calls started before confirmation", () => {
  const input = bridgeInput();
  input.trial.scopeConfirmedAtMs = 4950;
  input.normalized.events[2].scopeConfirmed = true;
  input.normalized.events[2].environmentClassification = "non-production";
  const result = buildHostEvidence(input);

  assert.equal(result.hostTrace.entries[0].scopeConfirmed, false);
  assert.equal(result.releaseEligibility.eligible, false);
  assert.ok(result.releaseEligibility.reasons.some(({ code }) => code === "HOST_EVENT_ORDER_INVALID"));
});

test("Bridge rejects every browser target outside the evaluator-locked origin", () => {
  const input = bridgeInput();
  input.normalized.events[3].targetOrigin = "https://production.example";
  const result = buildHostEvidence(input);

  assert.equal(result.releaseEligibility.eligible, false);
  assert.ok(result.releaseEligibility.reasons.some(({ code }) => code === "HOST_TARGET_OUT_OF_SCOPE"));
});
