import { readFile } from "node:fs/promises";
import { URL } from "node:url";

import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";
import {
  CODEX_ADAPTER,
  HOST_EVENT_SCHEMA_VERSION,
  TOOL_MAPPING_VERSION,
  normalizeToolName
} from "./contracts.mjs";

const KNOWN_TOP_LEVEL_TYPES = new Set([
  "session_meta", "response_item", "event_msg", "turn_context", "compacted", "ghost_snapshot",
  "world_state", "inter_agent_communication_metadata"
]);
const KNOWN_RESPONSE_ITEM_TYPES = new Set([
  "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output",
  "message", "agent_message", "reasoning", "web_search_call", "computer_call", "computer_call_output"
]);

function digest(value) {
  return `sha256:${sha256Text(typeof value === "string" ? value : canonicalStringify(value))}`;
}

function fail(code, message) {
  throw new SandboxError(code, message);
}

function parseJsonl(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "") continue;
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch {
      fail("HOST_EXPORT_UNSUPPORTED", `Codex rollout line ${index + 1} is not JSON`);
    }
    records.push({ record, line: lines[index], sourceSequence: index + 1 });
  }
  return records;
}

async function readRecords(source) {
  return parseJsonl(await readFile(source.sourcePath, "utf8"));
}

export async function detectCodexRollout(source) {
  const records = await readRecords(source);
  const sessionMeta = records.filter(({ record }) => record.type === "session_meta");
  const supported = sessionMeta.length >= 1 && records.every(({ record }) =>
    record && typeof record === "object" && typeof record.type === "string"
  );
  return {
    confidence: supported ? 1 : 0,
    formatVersion: supported ? CODEX_ADAPTER.formatVersion : null
  };
}

function messageText(payload) {
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.text === "string") return payload.text;
  if (!Array.isArray(payload.content)) return "";
  return payload.content.map((part) => {
    if (typeof part === "string") return part;
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.input_text === "string") return part.input_text;
    if (typeof part?.output_text === "string") return part.output_text;
    return "";
  }).filter(Boolean).join("\n");
}

function canonicalMessageText(payload) {
  const normalized = messageText(payload).replace(/\r\n?/g, "\n");
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
}

function normalizeMessage(entry, sequence, sessionDigest, actor) {
  const text = canonicalMessageText(entry.record.payload ?? {});
  return {
    schemaVersion: HOST_EVENT_SCHEMA_VERSION,
    sequence,
    eventId: digest(`message:${entry.sourceSequence}`).slice(7, 31),
    sessionDigest,
    timestampMs: Date.parse(entry.record.timestamp),
    actor,
    type: "message_completed",
    contentDigest: digest(text),
    sourceEventDigest: digest(entry.line)
  };
}

function timestamp(record, priorTimestampMs) {
  const timestampMs = Date.parse(record.timestamp);
  if (!Number.isFinite(timestampMs) || timestampMs < priorTimestampMs) {
    fail("HOST_EVENT_ORDER_INVALID", "Host event timestamps must be valid and non-decreasing");
  }
  return timestampMs;
}

function parseArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function targetOrigin(argumentsValue) {
  const candidate = argumentsValue.targetOrigin ?? argumentsValue.url;
  if (typeof candidate !== "string") return null;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function normalizeCompletedCall(call, output, sequence, sessionDigest) {
  const argsRaw = call.payload.arguments ?? call.payload.input ?? "";
  const outputRaw = output.payload.output ?? output.payload.result ?? "";
  const argumentsValue = parseArguments(argsRaw);
  const mapped = normalizeToolName(call.payload.name);
  return {
    schemaVersion: HOST_EVENT_SCHEMA_VERSION,
    sequence,
    eventId: digest(`${call.payload.call_id}:${call.sourceSequence}`).slice(7, 31),
    sessionDigest,
    startedAtMs: Date.parse(call.record.timestamp),
    timestampMs: Date.parse(output.record.timestamp),
    actor: "runner",
    type: "tool_call_completed",
    tool: mapped.tool,
    toolNamespace: mapped.toolNamespace,
    argumentsDigest: digest(typeof argsRaw === "string" ? argsRaw : canonicalStringify(argsRaw)),
    resultDigest: digest(typeof outputRaw === "string" ? outputRaw : canonicalStringify(outputRaw)),
    targetOrigin: targetOrigin(argumentsValue),
    environmentClassification: argumentsValue.environmentClassification ?? null,
    scopeConfirmed: Object.hasOwn(argumentsValue, "scopeConfirmed")
      ? argumentsValue.scopeConfirmed === true : null,
    sourceEventDigest: digest([call.line, output.line]),
    mappingVersion: TOOL_MAPPING_VERSION
  };
}

function normalizeUnsupportedToolEvent(entry, sequence, sessionDigest) {
  const payload = entry.record.payload ?? {};
  const timestampMs = Date.parse(entry.record.timestamp);
  return {
    schemaVersion: HOST_EVENT_SCHEMA_VERSION,
    sequence,
    eventId: digest(`unsupported:${entry.sourceSequence}`).slice(7, 31),
    sessionDigest,
    startedAtMs: timestampMs,
    timestampMs,
    actor: "runner",
    type: "tool_call_completed",
    tool: "unknown",
    toolNamespace: "unknown",
    argumentsDigest: digest(canonicalStringify(payload)),
    resultDigest: digest(canonicalStringify(payload)),
    targetOrigin: null,
    environmentClassification: null,
    scopeConfirmed: null,
    sourceEventDigest: digest(entry.line),
    mappingVersion: TOOL_MAPPING_VERSION
  };
}

export async function normalizeCodexRollout(source) {
  const records = await readRecords(source);
  const detection = await detectCodexRollout(source);
  if (detection.confidence !== 1) {
    fail("HOST_EXPORT_UNSUPPORTED", "Source is not a supported Codex rollout export");
  }
  const sessionMeta = records.filter(({ record }) => record.type === "session_meta");
  const sessionIds = new Set(sessionMeta.map(({ record }) => record.payload?.id));
  if (sessionMeta.length !== 1 || sessionIds.size !== 1 || ![...sessionIds][0]) {
    fail("HOST_SESSION_MISMATCH", "Host export must contain exactly one session boundary");
  }
  const expectedSessionDigest = digest([...sessionIds][0]);
  if (expectedSessionDigest !== source.manifest.sessionDigest) {
    fail("HOST_SESSION_MISMATCH", "Host export session does not match its package manifest");
  }

  const pending = new Map();
  const events = [];
  let previousTimestampMs = -Infinity;
  for (const entry of records) {
    previousTimestampMs = timestamp(entry.record, previousTimestampMs);
    if (!KNOWN_TOP_LEVEL_TYPES.has(entry.record.type)) {
      fail("HOST_EVENT_UNKNOWN", "Codex rollout contains an unknown top-level event");
    }
    if (entry.record.type === "event_msg" && ["user_message", "agent_message"].includes(
      entry.record.payload?.type
    )) {
      events.push(normalizeMessage(
        entry,
        events.length + 1,
        expectedSessionDigest,
        entry.record.payload.type === "user_message" ? "user" : "runner"
      ));
      continue;
    }
    if (entry.record.type !== "response_item") continue;
    const payloadType = entry.record.payload?.type;
    if (!KNOWN_RESPONSE_ITEM_TYPES.has(payloadType)) {
      fail("HOST_EVENT_UNKNOWN", "Codex rollout contains an unknown response item");
    }
    if (["message", "agent_message"].includes(payloadType)) {
      const role = entry.record.payload.role;
      events.push(normalizeMessage(
        entry,
        events.length + 1,
        expectedSessionDigest,
        payloadType === "agent_message" ? "collaborator" :
          role === "assistant" ? "runner" : role === "user" ? "user" : "evaluator"
      ));
      continue;
    }
    if (["web_search_call", "computer_call", "computer_call_output"].includes(payloadType)) {
      events.push(normalizeUnsupportedToolEvent(entry, events.length + 1, expectedSessionDigest));
      continue;
    }
    if (["function_call", "custom_tool_call"].includes(payloadType)) {
      const callId = entry.record.payload.call_id;
      if (typeof callId !== "string" || pending.has(callId)) {
        fail("HOST_EVENT_ORDER_INVALID", "Host tool call identifier is missing or duplicated");
      }
      pending.set(callId, { ...entry, payload: entry.record.payload });
      continue;
    }
    if (["function_call_output", "custom_tool_call_output"].includes(payloadType)) {
      const callId = entry.record.payload.call_id;
      const call = pending.get(callId);
      if (!call) fail("HOST_EVENT_ORDER_INVALID", "Host tool result has no preceding call");
      pending.delete(callId);
      events.push(normalizeCompletedCall(
        call,
        { ...entry, payload: entry.record.payload },
        events.length + 1,
        expectedSessionDigest
      ));
    }
  }
  const integrityIssues = pending.size > 0 ? [{
    code: "HOST_EVENT_INCOMPLETE",
    message: `Host export ended with ${pending.size} incomplete tool call${pending.size === 1 ? "" : "s"}`
  }] : [];
  const normalizedEventsDigest = digest(events);
  return {
    schemaVersion: HOST_EVENT_SCHEMA_VERSION,
    adapter: CODEX_ADAPTER,
    mappingVersion: TOOL_MAPPING_VERSION,
    trustLevel: source.manifest.trustLevel,
    sourceValidated: true,
    sessionDigest: expectedSessionDigest,
    sourceManifestDigest: source.manifest.sourceManifestDigest,
    normalizedEventsDigest,
    integrityIssues,
    events
  };
}
