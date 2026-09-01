import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { deriveAssistance, ASSISTANCE_DERIVER_VERSION } from "./derive-assistance.mjs";
import { deriveMetrics, METRIC_DERIVER_VERSION } from "./derive-metrics.mjs";

function digest(value) {
  return `sha256:${sha256Text(canonicalStringify(value))}`;
}

function binding(input) {
  return {
    trialId: input.trial.trialId,
    runId: input.trial.runId,
    sessionDigest: input.normalized.sessionDigest,
    sourceManifestDigest: input.normalized.sourceManifestDigest,
    normalizedEventsDigest: input.normalized.normalizedEventsDigest
  };
}

function traceEntry(event, trial, trustLevel) {
  const startedAtMs = Number(event.startedAtMs ?? event.timestampMs);
  const confirmedByTrial = Number.isFinite(trial.scopeConfirmedAtMs) &&
    startedAtMs >= trial.scopeConfirmedAtMs;
  return {
    sequence: event.sequence,
    startedAtMs,
    timestampMs: event.timestampMs,
    actor: event.actor,
    provenance: ["user", "evaluator"].includes(event.actor) ? "manual-evaluator" : trustLevel,
    tool: event.tool,
    toolNamespace: event.toolNamespace,
    targetOrigin: event.targetOrigin,
    environmentClassification: trial.environmentClassification ?? null,
    scopeConfirmed: confirmedByTrial,
    sourceEventDigest: event.sourceEventDigest,
    ...(event.semanticAction ? { semanticAction: event.semanticAction } : {})
  };
}

export function buildHostEvidence(input) {
  if (input.trial.sessionDigest !== input.normalized.sessionDigest) {
    throw new SandboxError("HOST_SESSION_MISMATCH", "Host session does not match the Trial binding");
  }
  const shared = binding(input);
  const assistanceEvents = deriveAssistance({
    normalized: input.normalized,
    assistanceScript: input.assistanceScript,
    assistanceMarks: input.assistanceMarks,
    controlEvents: input.controlEvents,
    runId: input.trial.runId
  });
  const derived = deriveMetrics({
    normalized: input.normalized,
    trial: input.trial,
    requestTrace: input.requestTrace,
    oracleEvents: input.oracleEvents
  });
  const hostTrace = {
    schemaVersion: "host-trace-v1",
    provenance: input.normalized.trustLevel,
    adapter: input.normalized.adapter,
    mappingVersion: input.normalized.mappingVersion,
    integrityIssues: structuredClone(input.normalized.integrityIssues ?? []),
    ...shared,
    entries: input.normalized.events.filter(({ type }) => type === "tool_call_completed")
      .map((event) => traceEntry(event, input.trial, input.normalized.trustLevel))
  };
  hostTrace.outputDigest = digest(hostTrace);
  const assistance = {
    schemaVersion: "assistance-v1",
    provenance: input.normalized.trustLevel,
    deriverVersion: ASSISTANCE_DERIVER_VERSION,
    ...shared,
    events: assistanceEvents
  };
  assistance.outputDigest = digest(assistance);
  const metrics = {
    schemaVersion: "metrics-v1",
    provenance: input.normalized.trustLevel,
    deriverVersion: METRIC_DERIVER_VERSION,
    ...shared,
    ...derived
  };
  metrics.outputDigest = digest(metrics);

  const reasons = [];
  reasons.push(...(input.normalized.integrityIssues ?? []).map((issue) => ({
    code: issue.code,
    message: issue.message
  })));
  if (input.normalized.trustLevel !== "host-native") {
    reasons.push({ code: "HOST_EXPORT_UNAUTHORIZED", message: "Host evidence trust level is diagnostic only" });
  }
  if (input.normalized.sourceValidated !== true) {
    reasons.push({ code: "HOST_EXPORT_INTEGRITY_FAILED", message: "Host source package was not validated by its Adapter" });
  }
  if (hostTrace.entries.some(({ tool }) => tool === "unknown")) {
    reasons.push({ code: "HOST_EVENT_UNKNOWN", message: "Host evidence contains an unknown tool" });
  }
  if (assistanceEvents.some(({ valid }) => valid === false)) {
    reasons.push({
      code: "ASSISTANCE_DEADLINE_EXCEEDED",
      message: "One or more assistance events exceeded the immutable script deadline"
    });
  }
  const unsafeRunnerBrowser = hostTrace.entries.find(({ actor, environmentClassification, scopeConfirmed }) =>
    actor === "runner" && (environmentClassification !== "non-production" || scopeConfirmed !== true)
  );
  if (unsafeRunnerBrowser) {
    reasons.push({ code: "HOST_EVENT_ORDER_INVALID", message: "Runner browser activity preceded safe scope confirmation" });
  }
  const allowedOrigins = new Set(input.trial.allowedOrigins ?? []);
  const outOfScopeTarget = hostTrace.entries.find(({ actor, targetOrigin, tool }) => actor === "runner" && (
    (targetOrigin !== null && !allowedOrigins.has(targetOrigin)) ||
    (["navigate_page", "new_page"].includes(tool) && targetOrigin === null)
  ));
  if (outOfScopeTarget) {
    reasons.push({ code: "HOST_TARGET_OUT_OF_SCOPE", message: "Runner browser activity targeted an origin outside the evaluator-locked scope" });
  }
  const missingMetrics = Object.entries(metrics.sources).filter(([, sourceValue]) => !sourceValue.derivable)
    .map(([metric]) => metric);
  if (missingMetrics.length > 0) {
    reasons.push({ code: "METRIC_NOT_DERIVABLE", message: "Required metrics lack independent sources", metrics: missingMetrics });
  }
  return {
    hostTrace,
    assistance,
    metrics,
    releaseEligibility: { eligible: reasons.length === 0, reasons }
  };
}
