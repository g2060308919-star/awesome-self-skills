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

function traceEntry(event) {
  return {
    sequence: event.sequence,
    timestampMs: event.timestampMs,
    actor: event.actor,
    provenance: ["user", "evaluator"].includes(event.actor) ? "manual-evaluator" : "host-native",
    tool: event.tool,
    toolNamespace: event.toolNamespace,
    targetOrigin: event.targetOrigin,
    environmentClassification: event.environmentClassification,
    scopeConfirmed: event.scopeConfirmed,
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
    ...shared,
    entries: input.normalized.events.filter(({ type }) => type === "tool_call_completed").map(traceEntry)
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
  if (input.normalized.trustLevel !== "host-native") {
    reasons.push({ code: "HOST_EXPORT_UNAUTHORIZED", message: "Host evidence trust level is diagnostic only" });
  }
  if (hostTrace.entries.some(({ tool }) => tool === "unknown")) {
    reasons.push({ code: "HOST_EVENT_UNKNOWN", message: "Host evidence contains an unknown tool" });
  }
  const firstRunnerBrowser = hostTrace.entries.find(({ actor }) => actor === "runner");
  if (firstRunnerBrowser && (firstRunnerBrowser.environmentClassification !== "non-production" ||
    firstRunnerBrowser.scopeConfirmed !== true)) {
    reasons.push({ code: "HOST_EVENT_ORDER_INVALID", message: "Runner browser activity preceded safe scope confirmation" });
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
