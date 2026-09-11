// src/entry.mjs
import { realpathSync } from "node:fs";
import path6 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// src/v5/runtime.mjs
import { createHash as createHash7 } from "node:crypto";
import { readFile as readFile3 } from "node:fs/promises";
import path5 from "node:path";

// src/v5/action-tokens.mjs
import { createHash as createHash3, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// src/canonical.mjs
import { createHash } from "node:crypto";
var NATIVE_ARRAY_SORT = Array.prototype.sort;
var NATIVE_ARRAY_FILTER = Array.prototype.filter;
var NATIVE_ARRAY_JOIN = Array.prototype.join;
var NATIVE_ARRAY_MAP = Array.prototype.map;
function sortArray(values, compare) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_SORT, values, [compare])
  );
}
function joinArray(values, separator) {
  return (
    /** @type {string} */
    Reflect.apply(NATIVE_ARRAY_JOIN, values, [separator])
  );
}
function mapArray(values, project) {
  return (
    /** @type {U[]} */
    Reflect.apply(NATIVE_ARRAY_MAP, values, [project])
  );
}
var ORDERED_ARRAY_PATHS = /* @__PURE__ */ new Set([
  "/steps",
  "/action_path",
  "/flow",
  "/flow_sequence",
  "/sequence",
  "/transition_order",
  "/cleanup/steps",
  "/cases/steps",
  "/grounded/steps",
  "/conditional/steps",
  "/cases/cleanup/steps",
  "/grounded/cleanup/steps",
  "/conditional/cleanup/steps",
  "/cases/execution_signature/action_path",
  "/grounded/execution_signature/action_path",
  "/conditional/execution_signature/action_path",
  "/execution_signature/action_path",
  "/views/elements/transition_order",
  "/elements/transition_order"
]);
var SET_ARRAY_PATHS = /* @__PURE__ */ new Set([
  "/primary_operation_refs",
  "/obligations/primary_operation_refs",
  "/source_assets",
  "/source_reviews",
  "/fact_ledger/required_view_kinds",
  "/execution_effects",
  "/cleanup/resolved_effects",
  "/preconditions/setup/mutation_effects",
  "/testability_profile/setup_resources",
  "/cases/execution_effects",
  "/cases/cleanup/resolved_effects",
  "/cases/preconditions/setup/mutation_effects",
  "/cases/testability_profile/setup_resources",
  "/grounded/execution_effects",
  "/grounded/cleanup/resolved_effects",
  "/grounded/preconditions/setup/mutation_effects",
  "/grounded/testability_profile/setup_resources",
  "/conditional/execution_effects",
  "/conditional/cleanup/resolved_effects",
  "/conditional/preconditions/setup/mutation_effects",
  "/conditional/testability_profile/setup_resources",
  "/source_ids",
  "/supersedes",
  "/source_locator_ids",
  "/source_claim_ids",
  "/parent_claim_ids",
  "/root_issue_ids",
  "/affected_obligation_ids",
  "/module_ids",
  "/view_element_refs",
  "/required_oracle_refs",
  "/required_capabilities",
  "/obligation_ids",
  "/case_ids",
  "/oracle_refs",
  "/oracle_evidence_refs",
  "/asked_root_issue_ids",
  "/sources",
  "/locators",
  "/source_policy/rules",
  "/source_policy/rules/source_ids",
  "/source_policy/rules/supersedes",
  "/decision_records/root_issue_ids",
  "/decision_records/affected_obligation_ids",
  "/clarification_events/root_issue_ids",
  "/claims",
  "/claims/source_locator_ids",
  "/claims/parent_claim_ids",
  "/claims/closed_world_input/enumerated_values",
  "/claims/formula_input/inputs",
  "/claims/rule_input/inputs",
  "/claims/rule_input/enumerated_values",
  "/fact_ledger",
  "/fact_ledger/source_claim_ids",
  "/views",
  "/views/elements",
  "/views/source_claim_ids",
  "/views/elements/source_claim_ids",
  "/views/elements/model_refs",
  "/views/elements/permissions",
  "/views/elements/conditions",
  "/views/elements/classes",
  "/views/elements/side_effects",
  "/elements/permissions",
  "/elements/conditions",
  "/elements/classes",
  "/elements/side_effects",
  "/views/relations",
  "/views/relations/source_claim_ids",
  "/views/relations/model_refs",
  "/interaction_matrix",
  "/interaction_matrix/module_ids",
  "/interaction_candidates",
  "/interaction_candidates/module_ids",
  "/interaction_candidates/source_claim_ids",
  "/obligation_inputs/combination_requests",
  "/obligation_inputs/combination_requests/owner/fact_ids",
  "/obligation_inputs/combination_requests/owner/view_element_refs",
  "/obligation_inputs/combination_requests/parameters",
  "/obligation_inputs/combination_requests/parameters/values",
  "/obligation_inputs/combination_requests/constraints",
  "/obligation_inputs/combination_requests/constraints/assignments",
  "/obligation_inputs/combination_requests/constraints/evidence_refs",
  "/obligation_inputs/combination_requests/interaction_risk/evidence_refs",
  "/obligation_inputs/combination_requests/vector_oracles",
  "/obligation_inputs/combination_requests/vector_oracles/assignments",
  "/obligation_inputs/combination_requests/vector_oracles/required_oracle_refs",
  "/obligations",
  "/obligations/source_claim_ids",
  "/obligations/view_element_refs",
  "/obligations/required_oracle_refs",
  "/obligations/required_capabilities",
  "/obligations/combination_vector/owner/fact_ids",
  "/obligations/combination_vector/owner/view_element_refs",
  "/obligations/combination_vector/assignments",
  "/obligations/combination_vector/forbid_evidence_refs",
  "/fact_routes",
  "/fact_routes/obligation_ids",
  "/interaction_routes",
  "/cases",
  "/cases/obligation_ids",
  "/cases/source_claim_ids",
  "/cases/fact_ids",
  "/cases/evidence_refs",
  "/cases/preconditions",
  "/cases/preconditions/source_claim_ids",
  "/cases/data",
  "/cases/steps/expectations",
  "/cases/steps/expectations/oracle_evidence_refs",
  "/cases/testability_profile/capabilities",
  "/cases/testability_profile/observers",
  "/cases/testability_profile/controls",
  "/cases/execution_signature/oracle_refs",
  "/fact_ids",
  "/evidence_refs",
  "/preconditions",
  "/preconditions/source_claim_ids",
  "/data",
  "/steps/expectations",
  "/steps/expectations/oracle_evidence_refs",
  "/testability_profile/capabilities",
  "/testability_profile/observers",
  "/testability_profile/controls",
  "/execution_signature/oracle_refs",
  "/obligation_dispositions",
  "/obligation_dispositions/case_ids",
  "/obligation_dispositions/evidence_refs",
  "/exploratory_candidates",
  "/exploratory_candidates/source_claim_ids",
  "/grounded",
  "/grounded/fact_ids",
  "/grounded/obligation_ids",
  "/grounded/source_claim_ids",
  "/grounded/evidence_refs",
  "/grounded/preconditions",
  "/grounded/preconditions/source_claim_ids",
  "/grounded/data",
  "/grounded/steps/expectations",
  "/grounded/steps/expectations/oracle_evidence_refs",
  "/grounded/testability_profile/capabilities",
  "/grounded/testability_profile/observers",
  "/grounded/testability_profile/controls",
  "/grounded/execution_signature/oracle_refs",
  "/conditional",
  "/conditional/fact_ids",
  "/conditional/obligation_ids",
  "/conditional/source_claim_ids",
  "/conditional/evidence_refs",
  "/conditional/preconditions",
  "/conditional/preconditions/source_claim_ids",
  "/conditional/data",
  "/conditional/steps/expectations",
  "/conditional/steps/expectations/oracle_evidence_refs",
  "/conditional/testability_profile/capabilities",
  "/conditional/testability_profile/observers",
  "/conditional/testability_profile/controls",
  "/conditional/execution_signature/oracle_refs",
  "/blocked",
  "/exploratory",
  "/coverage/requirements/entries",
  "/coverage/formal/entries",
  "/coverage/executable/entries",
  "/coverage/expert_recall/limits",
  "/coverage/not_applicable",
  "/quality/limits",
  "/requirements/entries",
  "/formal/entries",
  "/executable/entries",
  "/expert_recall/limits",
  "/not_applicable",
  "/root_issue_dispositions",
  "/blockers/affected_obligation_ids"
]);
var COLLECTION_ID_FIELDS = /* @__PURE__ */ new Map([
  ["/source_assets", "asset_id"],
  ["/source_reviews", "source_id"],
  ["/sources", "source_id"],
  ["/locators", "locator_id"],
  ["/source_policy/rules", "rule_id"],
  ["/decision_records", "decision_id"],
  ["/clarification_events", "event_id"],
  ["/claims", "claim_id"],
  ["/fact_ledger", "fact_id"],
  ["/views", "view_id"],
  ["/views/elements", "element_id"],
  ["/views/elements/classes", "class_id"],
  ["/elements", "element_id"],
  ["/elements/classes", "class_id"],
  ["/views/relations", "relation_id"],
  ["/interaction_candidates", "candidate_id"],
  ["/obligations", "obligation_id"],
  ["/fact_routes", "fact_id"],
  ["/interaction_routes", "candidate_id"],
  ["/cases", "case_id"],
  ["/cases/data", "name"],
  ["/cases/steps/expectations", "expectation_id"],
  ["/cases/testability_profile/capabilities", "capability"],
  ["/cases/testability_profile/observers", "observer"],
  ["/cases/testability_profile/controls", "control"],
  ["/data", "name"],
  ["/steps/expectations", "expectation_id"],
  ["/testability_profile/capabilities", "capability"],
  ["/testability_profile/observers", "observer"],
  ["/testability_profile/controls", "control"],
  ["/obligation_dispositions", "obligation_id"],
  ["/exploratory_candidates", "exploratory_id"],
  ["/grounded", "case_id"],
  ["/grounded/data", "name"],
  ["/grounded/steps/expectations", "expectation_id"],
  ["/grounded/testability_profile/capabilities", "capability"],
  ["/grounded/testability_profile/observers", "observer"],
  ["/grounded/testability_profile/controls", "control"],
  ["/conditional", "case_id"],
  ["/conditional/data", "name"],
  ["/conditional/steps/expectations", "expectation_id"],
  ["/conditional/testability_profile/capabilities", "capability"],
  ["/conditional/testability_profile/observers", "observer"],
  ["/conditional/testability_profile/controls", "control"],
  ["/coverage/requirements/entries", "fact_id"],
  ["/coverage/formal/entries", "obligation_id"],
  ["/coverage/executable/entries", "obligation_id"],
  ["/coverage/not_applicable", "obligation_id"],
  ["/requirements/entries", "fact_id"],
  ["/formal/entries", "obligation_id"],
  ["/executable/entries", "obligation_id"],
  ["/not_applicable", "obligation_id"],
  ["/blocked", "obligation_id"],
  ["/exploratory", "exploratory_id"],
  ["/root_issue_dispositions", "root_issue_id"]
]);
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function pathKey(path7) {
  return `/${joinArray(path7, "/")}`;
}
function stableSemanticKey(path7, value) {
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") return `number:${value}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (value === null) return "null";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object7 = (
      /** @type {Record<string, unknown>} */
      value
    );
    const collectionPath = pathKey(path7);
    const idField = COLLECTION_ID_FIELDS.get(collectionPath);
    if (idField && typeof object7[idField] === "string") return `id:${object7[idField]}:${JSON.stringify(object7)}`;
    if (collectionPath === "/interaction_matrix") return `interaction:${JSON.stringify({ dimension: object7.dimension, module_ids: object7.module_ids })}:${JSON.stringify(object7)}`;
  }
  return JSON.stringify(value);
}
function canonicalize(value, path7 = []) {
  if (Array.isArray(value)) {
    const values = mapArray(value, (item) => canonicalize(item, path7));
    const currentPath = pathKey(path7);
    if (ORDERED_ARRAY_PATHS.has(currentPath)) return values;
    if (SET_ARRAY_PATHS.has(currentPath)) return sortArray(
      [...values],
      (left, right) => compareCodePoints(stableSemanticKey(path7, left), stableSemanticKey(path7, right))
    );
    return values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(mapArray(
      sortArray(Object.entries(value), ([left], [right]) => compareCodePoints(left, right)),
      ([key, item]) => [key, canonicalize(item, [...path7, key])]
    ));
  }
  return value;
}
function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}
function digest(value) {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

// src/v5/errors.mjs
var V5ProtocolError = class extends Error {
  /** @param {string} code @param {string} message @param {string} [jsonPointer] */
  constructor(code, message, jsonPointer) {
    super(`${code}: ${message}`);
    this.name = "V5ProtocolError";
    this.code = code;
    if (jsonPointer !== void 0) this.json_pointer = jsonPointer;
  }
};

// src/v5/canonical-v5.mjs
var SET_FIELD_NAMES = /* @__PURE__ */ new Set([
  "basis",
  "required_observation_slot_digests",
  "candidate_ids",
  "mention_candidate_ids",
  "permission_scope_candidate_ids",
  "signaled_dimensions",
  "partition_ids",
  "role_domain",
  "trigger_basis",
  "affected_refs",
  "source_request_ids",
  "request_ids",
  "input_digests"
]);
var ORDERED_FIELD_NAMES = /* @__PURE__ */ new Set([
  "visible_question_part_ids",
  "coordinate_evidence_digests",
  "steps",
  "transition_history",
  "presentation_parts",
  "source_units"
]);
function codePointCompare(left, right) {
  const a = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const b = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}
function canonicalizeV5Value(value, fieldName = null) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Non-finite numbers are not canonical.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === void 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Undefined is not canonical.");
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalizeV5Value(item, null));
    if (!fieldName || ORDERED_FIELD_NAMES.has(fieldName) || !SET_FIELD_NAMES.has(fieldName)) return normalized;
    const keyed = normalized.map((item) => ({ item, key: canonicalStringify(item) }));
    if (new Set(keyed.map(({ key }) => key)).size !== keyed.length) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", `Duplicate member in set field ${fieldName}.`);
    keyed.sort((left, right) => codePointCompare(left.key, right.key));
    return keyed.map(({ item }) => item);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, canonicalizeV5Value(child, key)]));
  }
  return value;
}
function canonicalV5Stringify(value) {
  return canonicalStringify(canonicalizeV5Value(value));
}

// src/v5/storage-records.mjs
import { createHash as createHash2 } from "node:crypto";
function rawBytesDigest(value) {
  return `sha256:${createHash2("sha256").update(value).digest("hex")}`;
}
function canonicalObjectDigest(value) {
  return rawBytesDigest(canonicalV5Stringify(value));
}
function sealV5Record(payload, digestField) {
  if (Object.hasOwn(payload, digestField)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", `Caller must not submit compiler-owned ${digestField}.`);
  return { ...payload, [digestField]: canonicalObjectDigest(payload) };
}
function verifyV5Record(record, digestField) {
  const declared = record[digestField];
  if (typeof declared !== "string") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", `${digestField} is missing.`);
  const { [digestField]: ignored, ...payload } = record;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", `${digestField} does not match record bytes.`);
  return record;
}
function actionDigestV5(operation, payload) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/idempotency-action", format_version: 1, operation, payload });
}

// src/v5/action-tokens.mjs
function validateKey(keyRecord) {
  if (!keyRecord || !/^[A-Za-z0-9_-]{1,64}$/u.test(keyRecord.key_id) || !Buffer.isBuffer(keyRecord.key) || keyRecord.key.length < 32) throw new V5ProtocolError("ACTION_TOKEN_KEY_UNAVAILABLE", "Action-token key is unavailable.");
}
function selectorPreimage(checkpoint, capability) {
  return {
    namespace: "generate-test-cases/v5/action-selector",
    format_version: 1,
    run_id: checkpoint.run_id,
    run_lifecycle: checkpoint.run_lifecycle,
    stage: checkpoint.stage,
    obligation: checkpoint.obligation,
    fsm_cell_id: checkpoint.fsm_cell_id,
    current_revision: checkpoint.current_revision,
    checkpoint_digest: checkpoint.checkpoint_digest,
    semantic_root_digest: checkpoint.semantic_root_digest ?? null,
    presentation_digest: checkpoint.presentation_digest ?? null,
    preview_digest: checkpoint.preview_digest ?? null,
    capability
  };
}
function tokenFor(checkpoint, capability, keyRecord) {
  validateKey(keyRecord);
  const derived = Buffer.from(hkdfSync("sha256", keyRecord.key, Buffer.from(checkpoint.run_id), Buffer.from("generate-test-cases/v5/action-token/v1"), 32));
  const mac = createHmac("sha256", derived).update(canonicalV5Stringify(selectorPreimage(checkpoint, capability))).digest("base64url");
  derived.fill(0);
  return `v5a.${keyRecord.key_id}.${mac}`;
}
function issueSelectors(checkpoint, capabilities, keyring) {
  validateKey(keyring.current);
  const selectors = capabilities.map((capability) => ({ capability: structuredClone(capability), action_token: tokenFor(checkpoint, capability, keyring.current) }));
  const sidecarBase = {
    kind: "v5_selector_sidecar",
    schema_version: "5.0.0",
    run_id: checkpoint.run_id,
    checkpoint_digest: checkpoint.checkpoint_digest,
    selectors: selectors.map((selector) => ({ capability: selector.capability, key_id: keyring.current.key_id, token_digest: `sha256:${createHash3("sha256").update(selector.action_token).digest("hex")}` }))
  };
  return { selectors, sidecar: sealV5Record(sidecarBase, "selector_sidecar_digest") };
}
function verifySelector(checkpoint, capability, token, keyring) {
  if (typeof token !== "string") throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Action token is invalid.");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v5a") throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Action token is invalid.");
  const keys = [keyring.current, ...keyring.retained ?? []];
  const keyRecord = keys.find((entry) => entry.key_id === parts[1]);
  if (!keyRecord) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Action token key is not retained.");
  const expected = Buffer.from(tokenFor(checkpoint, capability, keyRecord));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Action token does not bind the current checkpoint and capability.");
  return true;
}

// src/v5/cancellation.mjs
var DIGEST = /^sha256:[0-9a-f]{64}$/u;
var EVENT_KEYS = ["kind", "schema_version", "run_id", "delivery_intent", "case_document_lineage_id", "prior_fsm_cell_id", "terminal_fsm_cell_id", "prior_checkpoint_digest", "previous_run_transaction_digest", "canonical_cancel_action_digest", "cancel_event_digest"];
function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function createV5CancelEvent(input) {
  const { identity, priorCheckpoint, previousTransactionDigest, canonicalCancelActionDigest, terminalFsmCellId } = input;
  if (identity.schema_version !== "5.0.0" || priorCheckpoint.run_id !== identity.run_id || priorCheckpoint.case_document_lineage_id !== identity.case_document_lineage_id || priorCheckpoint.delivery_intent !== identity.delivery_intent || priorCheckpoint.run_lifecycle !== "active" || !DIGEST.test(priorCheckpoint.checkpoint_digest) || !DIGEST.test(previousTransactionDigest) || !DIGEST.test(canonicalCancelActionDigest)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Cancel event predecessor binding is invalid.");
  const expectedTarget = identity.delivery_intent === "case_document" ? "cd.terminal.cancelled" : "ep.terminal.cancelled";
  if (terminalFsmCellId !== expectedTarget) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Cancel event terminal cell does not match delivery intent.");
  return sealV5Record({
    kind: "v5_run_cancelled",
    schema_version: "5.0.0",
    run_id: identity.run_id,
    delivery_intent: identity.delivery_intent,
    case_document_lineage_id: identity.case_document_lineage_id,
    prior_fsm_cell_id: priorCheckpoint.fsm_cell_id,
    terminal_fsm_cell_id: terminalFsmCellId,
    prior_checkpoint_digest: priorCheckpoint.checkpoint_digest,
    previous_run_transaction_digest: previousTransactionDigest,
    canonical_cancel_action_digest: canonicalCancelActionDigest
  }, "cancel_event_digest");
}
function verifyV5CancelEvent(event, input) {
  try {
    if (!event || !exactKeys(event, EVENT_KEYS)) throw new Error("shape");
    verifyV5Record(event, "cancel_event_digest");
    const expected = createV5CancelEvent(input);
    if (canonicalV5Stringify(event) !== canonicalV5Stringify(expected)) throw new Error("binding");
    return true;
  } catch {
    throw new V5ProtocolError("RESUME_PARENT_INVALID", "Cancel event does not bind the verified parent predecessor.");
  }
}
function cancelledCheckpointExtension(event) {
  return {
    cancellation: "cancelled",
    run_lifecycle: "cancelled",
    stage: "delivery",
    obligation: "complete",
    prior_fsm_cell_id: event.prior_fsm_cell_id,
    terminal_fsm_cell_id: event.terminal_fsm_cell_id,
    cancel_event_digest: event.cancel_event_digest
  };
}

// src/v5/constants.mjs
var V5_SCHEMA_VERSION = "5.0.0";
var V5_COMPILER_VERSION = "0.6.0";
var V5_REGISTRY_FORMAT_VERSION = 1;
var V5_CANONICAL_PROFILE = "v5.canonical-json.v1";
var V5_FSM_CELL_IDS = Object.freeze([
  "cd.active.source.provide",
  "cd.active.requirements.review",
  "cd.active.requirements.resolve",
  "cd.active.requirements.confirm",
  "cd.active.case.behavior",
  "cd.active.case.drafts",
  "cd.active.case.resolve",
  "cd.active.case.confirm",
  "cd.terminal.finished",
  "cd.terminal.cancelled",
  "cd.terminal.fatal",
  "ep.active.closure.resolve",
  "ep.active.final.confirm",
  "ep.terminal.finished",
  "ep.terminal.cancelled",
  "ep.terminal.fatal"
]);
var V5_ACTIVE_FSM_CELL_IDS = Object.freeze(V5_FSM_CELL_IDS.filter((cellId) => cellId.includes(".active.")));
var V5_RESUMABLE_FSM_CELL_IDS = Object.freeze(V5_ACTIVE_FSM_CELL_IDS.filter((cellId) => cellId !== "cd.active.requirements.confirm" && cellId !== "cd.active.case.confirm"));
var V5_ACTION_TEMPLATE_IDS = Object.freeze([
  "run.cancel",
  "source.submit_batch",
  "artifact.submit_evidence_claims",
  "clarification.preview",
  "clarification.commit",
  "artifact.submit_behavior_views",
  "artifact.submit_case_drafts",
  "execution.advance_closure",
  "execution.confirm_or_pause"
]);
var V5_STABLE_ID_ROWS = Object.freeze([
  ["source_request", "srq5_", "stable.source-request.v1"],
  ["outcome_candidate", "out5_", "stable.outcome-candidate.v1"],
  ["outcome_dedup_group", "odg5_", "stable.outcome-dedup-group.v1"],
  ["ambiguity_candidate", "amb5_", "stable.ambiguity-candidate.v1"],
  ["entity_mention_candidate", "emc5_", "stable.entity-mention-candidate.v1"],
  ["entity_conflict_group", "ecg5_", "stable.entity-conflict-group.v1"],
  ["entity", "ent5_", "stable.entity.v1"],
  ["permission_scope_candidate", "psc5_", "stable.permission-scope-candidate.v1"],
  ["permission_scope_group", "psg5_", "stable.permission-scope-group.v1"],
  ["question_part", "qpt5_", "stable.question-part.v1"],
  ["clarification_presentation", "qpr5_", "stable.clarification-presentation.v1"],
  ["clarification_decision", "dec5_", "stable.clarification-decision.v1"],
  ["behavior_semantic_gap", "bsg5_", "stable.behavior-semantic-gap.v1"],
  ["behavior_required_contract", "brq5_", "stable.behavior-required-contract.v1"],
  ["field_correspondence", "fcr5_", "stable.field-correspondence.v1"],
  ["predicate_contract", "pdc5_", "stable.predicate-contract.v1"],
  ["domain_contract", "dom5_", "stable.domain-contract.v1"],
  ["domain_partition", "dpt5_", "stable.domain-partition.v1"],
  ["behavior_equivalence_contract", "beq5_", "stable.behavior-equivalence-contract.v1"],
  ["population_contract", "pop5_", "stable.population-contract.v1"],
  ["population_proof", "ppf5_", "stable.population-proof.v1"],
  ["oracle_semantic_contract", "osc5_", "stable.oracle-semantic-contract.v1"],
  ["permission_auxiliary_contract", "pac5_", "stable.permission-auxiliary-contract.v1"],
  ["permission_matrix_seed", "pms5_", "stable.permission-matrix-seed.v1"],
  ["permission_required_cell", "prc5_", "stable.permission-required-cell.v1"],
  ["domain_selection", "dsl5_", "stable.domain-selection.v1"],
  ["risk_review", "rrv5_", "stable.risk-review.v1"],
  ["derived_risk_ledger_item", "rsk5_", "stable.derived-risk-ledger-item.v1"]
]);
var V5_STABLE_PROJECTION_FIELDS = Object.freeze({
  "stable.source-request.v1": ["source_role", "locator", "required"],
  "stable.outcome-candidate.v1": ["accepted_source_state_digest", "locator_id", "source_span", "atom_signature", "required_observation_slot_digests"],
  "stable.outcome-dedup-group.v1": ["accepted_source_state_digest", "atom_signature", "required_observation_slot_digests", "candidate_ids"],
  "stable.ambiguity-candidate.v1": ["accepted_source_state_digest", "locator_id", "source_span", "ambiguity_kind"],
  "stable.entity-mention-candidate.v1": ["accepted_source_state_digest", "locator_id", "source_span", "observed_name"],
  "stable.entity-conflict-group.v1": ["mention_candidate_ids"],
  "stable.entity.v1": ["accepted_source_state_digest", "canonical_name", "mention_candidate_ids", "basis"],
  "stable.permission-scope-candidate.v1": ["accepted_source_state_digest", "locator_id", "source_span", "coordinate_slots", "signaled_dimensions"],
  "stable.permission-scope-group.v1": ["permission_scope_candidate_ids"],
  "stable.question-part.v1": ["case_document_lineage_id", "gap_kind", "gap_id", "gap_payload_digest", "initial_semantic_root_digest", "answer_contract_digest"],
  "stable.clarification-presentation.v1": ["case_document_lineage_id", "input_semantic_root_digest", "question_part_state_set_digest", "visible_question_part_ids"],
  "stable.clarification-decision.v1": ["case_document_lineage_id", "input_semantic_root_digest", "gap_binding", "target", "answer_contract_digest", "answer_value_digest", "evidence_level"],
  "stable.behavior-semantic-gap.v1": ["input_semantic_root_digest", "target", "missing_semantics", "answer_contract_digest", "basis"],
  "stable.behavior-required-contract.v1": ["input_semantic_root_digest", "contract_kind", "subject_ref", "intent_ref", "basis", "kind_specific_requirement"],
  "stable.field-correspondence.v1": ["input_semantic_root_digest", "authority_side", "left", "right", "join", "transform", "comparison", "null_policy_ref", "freshness", "basis"],
  "stable.predicate-contract.v1": ["input_semantic_root_digest", "predicate_ref", "mutual_exclusion_group", "exhaustiveness", "basis"],
  "stable.domain-contract.v1": ["input_semantic_root_digest", "domain_anchor_digest", "partition_ids"],
  "stable.domain-partition.v1": ["input_semantic_root_digest", "domain_anchor_digest", "normalized_partition"],
  "stable.behavior-equivalence-contract.v1": ["input_semantic_root_digest", "domain_contract_id", "partition_id", "formal_test_point_id", "oracle_semantic_contract_id", "equivalence_scope", "basis"],
  "stable.population-contract.v1": ["input_semantic_root_digest", "scope"],
  "stable.population-proof.v1": ["input_semantic_root_digest", "population_contract_id", "payload", "basis"],
  "stable.oracle-semantic-contract.v1": ["input_semantic_root_digest", "formal_test_point_id", "observation_ref", "assertion", "evaluation_scope", "observation_window", "basis"],
  "stable.permission-auxiliary-contract.v1": ["input_semantic_root_digest", "contract_kind", "permission_target", "payload", "basis"],
  "stable.permission-matrix-seed.v1": ["input_semantic_root_digest", "permission_derivation_registry_digest", "scope_candidate_ids", "role_domain", "matrix_scope"],
  "stable.permission-required-cell.v1": ["matrix_id", "role_value", "resource_value", "action_value", "context_value", "permission_dimension_value", "coordinate_evidence_digests"],
  "stable.domain-selection.v1": ["input_semantic_root_digest", "case_anchor_digest", "formal_test_point_id", "oracle_semantic_contract_id", "domain_contract_id", "partition_id", "selection"],
  "stable.risk-review.v1": ["input_semantic_root_digest", "module_ref", "risk_kind"],
  "stable.derived-risk-ledger-item.v1": ["module_ref", "risk_kind", "trigger_basis", "affected_refs"]
});
var V5_INVARIANT_REFS = Object.freeze([
  ...Array.from({ length: 16 }, (_, index) => `SPEC.FR${String(index + 1).padStart(3, "0")}`),
  "SPEC.API.CREATE",
  "SPEC.API.ADVANCE",
  "SPEC.API.INSPECT",
  "SPEC.WORKFLOW.RESUME",
  "SPEC.ACTION.TOKEN",
  "SPEC.REPLY",
  "SPEC.OWNERSHIP",
  "SPEC.CANONICAL",
  "SPEC.SEMANTIC.REVIEW",
  "SPEC.CLARIFICATION",
  "SPEC.BEHAVIOR",
  "SPEC.PROVENANCE",
  "SPEC.FSM",
  "SPEC.POLICY",
  "SPEC.TRANSACTION",
  "SPEC.RENDER",
  "SPEC.FIXTURE",
  "SPEC.RELEASE"
]);
var V5_ERROR_PHASES = Object.freeze({
  scope_integrity: ["ACCEPTED_STATE_INTEGRITY_FAILURE", "RUN_ARGUMENT_INVALID", "UNSUPPORTED_SCHEMA_VERSION", "RESUME_PARENT_INVALID", "CASE_DOCUMENT_REFERENCE_INVALID"],
  idempotency: ["IDEMPOTENCY_CONFLICT"],
  capability_protocol: ["ACTION_NOT_ADVERTISED", "CLARIFICATION_PREVIEW_STALE"],
  specialized_shape: ["COMPILER_OWNED_FIELD_SUBMITTED", "QUESTION_PART_ACTION_CONFLICT", "TEMPORARY_BASIS_REQUIRED", "CLARIFICATION_CONFIRMATION_INVALID", "CONTROL_ORIGIN_REQUIRED", "ANSWER_NATURE_INVALID", "CLIENT_KEY_INVALID"],
  closed_schema_fallback: ["SCHEMA_VALIDATION_FAILED"],
  binding_fsm: ["QUESTION_PART_TRANSITION_INVALID", "ANSWER_BINDING_AMBIGUOUS", "ANSWER_BINDING_INVALID", "CLARIFICATION_CONFIRMATION_REQUIRED"],
  semantic_invariant: ["SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "SEMANTIC_REVIEW_CANDIDATE_MISSING", "ATOMIC_OUTCOME_NOT_SINGLE", "AMBIGUITY_UNRESOLVED", "ENTITY_RESOLUTION_UNRESOLVED", "CLARIFICATION_IMPACT_MISMATCH", "ORACLE_SEMANTICS_REQUIRED", "ORACLE_NOT_DECIDABLE", "FIELD_CORRESPONDENCE_REQUIRED", "VALUE_STATE_INVALID", "COMPLEMENT_COVERAGE_OVERCLAIMED", "DOMAIN_CONTRACT_REQUIRED", "POPULATION_CONTRACT_REQUIRED", "PERMISSION_MATRIX_INCOMPLETE", "PERMISSION_OUTCOME_UNRESOLVED", "RISK_LEDGER_INVALID", "PROVENANCE_EDGE_NOT_ALLOWED", "PROVENANCE_CYCLE", "DOWNSTREAM_ARTIFACT_AS_SOURCE"],
  render_integrity: ["CANONICAL_RENDER_MISMATCH"]
});
var V5_ERROR_CATALOG = Object.freeze({
  UNSUPPORTED_SCHEMA_VERSION: ["fatal", "no_semantic_commit", "create_v5_run"],
  RUN_ARGUMENT_INVALID: ["protocol_error", "no_semantic_commit", "correct_arguments"],
  RESUME_PARENT_INVALID: ["protocol_error", "no_semantic_commit", "select_verified_cancelled_v5_parent"],
  CASE_DOCUMENT_REFERENCE_INVALID: ["protocol_error", "no_semantic_commit", "select_verified_v5_case_document"],
  ACTION_NOT_ADVERTISED: ["protocol_error", "no_semantic_commit", "inspect_and_use_advertised_action"],
  IDEMPOTENCY_CONFLICT: ["protocol_error", "no_semantic_commit", "use_new_idempotency_key"],
  SCHEMA_VALIDATION_FAILED: ["need_revision", "no_semantic_commit", "revise_to_advertised_schema"],
  COMPILER_OWNED_FIELD_SUBMITTED: ["need_revision", "no_semantic_commit", "remove_compiler_owned_fields"],
  CLIENT_KEY_INVALID: ["need_revision", "no_semantic_commit", "revise_local_reference"],
  ACCEPTED_STATE_INTEGRITY_FAILURE: ["fatal", "no_semantic_commit", "inspect_read_only_and_recover_manually"],
  SEMANTIC_REVIEW_CANDIDATE_MISSING: ["need_revision", "no_semantic_commit", "complete_candidate_review"],
  SEMANTIC_REVIEW_CANDIDATE_UNKNOWN: ["need_revision", "no_semantic_commit", "remove_unknown_candidate_reference"],
  ATOMIC_OUTCOME_NOT_SINGLE: ["need_revision", "no_semantic_commit", "split_claim_or_test_point"],
  AMBIGUITY_UNRESOLVED: ["need_user_answers", "commit_artifact", "answer_defer_or_close_gap"],
  ENTITY_RESOLUTION_UNRESOLVED: ["need_user_answers", "commit_artifact", "answer_entity_resolution"],
  ANSWER_BINDING_AMBIGUOUS: ["need_user_answers", "no_semantic_commit", "resubmit_unambiguous_bindings"],
  ANSWER_BINDING_INVALID: ["need_user_answers", "no_semantic_commit", "revise_answer_units"],
  ANSWER_NATURE_INVALID: ["need_user_answers", "no_semantic_commit", "choose_final_or_temporary"],
  TEMPORARY_BASIS_REQUIRED: ["need_user_answers", "no_semantic_commit", "provide_temporary_basis_or_choose_final"],
  QUESTION_PART_ACTION_CONFLICT: ["need_user_answers", "no_semantic_commit", "remove_conflicting_action"],
  QUESTION_PART_TRANSITION_INVALID: ["protocol_error", "no_semantic_commit", "inspect_current_question_state"],
  CONTROL_ORIGIN_REQUIRED: ["need_user_answers", "no_semantic_commit", "provide_exact_control_statement"],
  CLARIFICATION_CONFIRMATION_REQUIRED: ["clarification_confirmation_required", "preview_only", "confirm_same_preview_digest"],
  CLARIFICATION_CONFIRMATION_INVALID: ["clarification_confirmation_required", "no_semantic_commit", "use_registered_confirmation_token"],
  CLARIFICATION_PREVIEW_STALE: ["clarification_confirmation_required", "no_semantic_commit", "preview_again"],
  CLARIFICATION_IMPACT_MISMATCH: ["fatal", "no_semantic_commit", "inspect_compiler_state_integrity"],
  ORACLE_NOT_DECIDABLE: ["need_revision", "no_semantic_commit", "revise_case_draft"],
  ORACLE_SEMANTICS_REQUIRED: ["need_revision", "no_semantic_commit", "provide_behavior_oracle_contract"],
  FIELD_CORRESPONDENCE_REQUIRED: ["need_user_answers", "commit_artifact", "clarify_field_correspondence"],
  VALUE_STATE_INVALID: ["need_revision", "no_semantic_commit", "revise_value_state_axes"],
  COMPLEMENT_COVERAGE_OVERCLAIMED: ["need_revision", "no_semantic_commit", "reduce_claim_or_add_proof"],
  DOMAIN_CONTRACT_REQUIRED: ["need_user_answers", "commit_artifact", "clarify_domain_contract"],
  POPULATION_CONTRACT_REQUIRED: ["need_user_answers", "commit_artifact", "clarify_population_contract"],
  PERMISSION_MATRIX_INCOMPLETE: ["need_revision", "no_semantic_commit", "complete_advertised_permission_cells"],
  PERMISSION_OUTCOME_UNRESOLVED: ["need_user_answers", "commit_artifact", "clarify_permission_outcome"],
  RISK_LEDGER_INVALID: ["need_revision", "no_semantic_commit", "revise_risk_review"],
  PROVENANCE_EDGE_NOT_ALLOWED: ["need_revision", "no_semantic_commit", "remove_disallowed_provenance_edge"],
  PROVENANCE_CYCLE: ["need_revision", "no_semantic_commit", "remove_provenance_cycle"],
  DOWNSTREAM_ARTIFACT_AS_SOURCE: ["need_artifact", "no_semantic_commit", "provide_authoritative_source"],
  CANONICAL_RENDER_MISMATCH: ["fatal", "no_semantic_commit", "repair_renderer_and_replay"]
});
var V5_CLARIFICATION_TOKENS = Object.freeze({
  confirmation_tokens: ["\u786E\u8BA4\u63D0\u4EA4", "\u786E\u8BA4\u4EE5\u4E0A\u53D8\u66F4"],
  temporary_marker_tokens: ["\u4E34\u65F6\u6309\u6B64\u53E3\u5F84", "\u6682\u6309\u6B64\u53E3\u5F84"],
  clone_marker_tokens: ["\u540C\u4E00\u56DE\u7B54\u9002\u7528\u4E8E", "\u4EE5\u4E0B\u56DE\u7B54\u540C\u65F6\u9002\u7528"],
  control_wrapper_punctuation: [":", "\uFF1A", ",", "\uFF0C", ";", "\uFF1B", ".", "\u3002", "!", "\uFF01", "?", "\uFF1F", "\u3001", "(", ")", "\uFF08", "\uFF09", "[", "]", "\u3010", "\u3011"],
  control_tokens: {
    defer: ["\u6682\u7F13\u56DE\u7B54", "\u7A0D\u540E\u56DE\u7B54"],
    unknown: ["\u76EE\u524D\u672A\u77E5", "\u6682\u4E0D\u6E05\u695A"],
    close_for_delivery: ["\u5173\u95ED\u8BE5\u95EE\u9898\u5E76\u7EE7\u7EED\u4EA4\u4ED8", "\u4FDD\u7559\u672A\u89E3\u51B3\u5E76\u7EE7\u7EED\u4EA4\u4ED8"]
  }
});

// src/v5/envelopes.mjs
import { createHash as createHash4 } from "node:crypto";
var AGENT_ARTIFACT_KINDS = /* @__PURE__ */ new Set(["source_pack", "evidence_claims", "behavior_views", "case_drafts"]);
function sha256(value) {
  return `sha256:${createHash4("sha256").update(canonicalV5Stringify(value)).digest("hex")}`;
}
function acceptArtifactEnvelope(input) {
  if (!AGENT_ARTIFACT_KINDS.has(input.artifactKind)) throw new V5ProtocolError("COMPILER_OWNED_FIELD_SUBMITTED", "Only the four Agent-owned artifact kinds may be accepted.");
  if (!input.runIdentity || typeof input.runIdentity.run_id !== "string" || typeof input.runIdentity.case_document_lineage_id !== "string" || !Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Accepted artifact envelope input is invalid.");
  }
  const payload = canonicalizeV5Value(structuredClone(input.payload));
  const inputDigests = [...new Set(input.inputDigests ?? [])].sort();
  const base = {
    kind: "accepted_artifact_envelope",
    artifact_kind: input.artifactKind,
    schema_version: V5_SCHEMA_VERSION,
    compiler_version: V5_COMPILER_VERSION,
    payload_producer: "agent",
    envelope_producer: "compiler",
    producer_stage: input.producerStage ?? "unknown",
    producer_run_id: input.runIdentity.run_id,
    case_document_lineage_id: input.runIdentity.case_document_lineage_id,
    accepted_revision: input.revision,
    input_digests: inputDigests,
    canonical_payload_digest: sha256(payload),
    payload
  };
  return { ...base, envelope_digest: sha256(base) };
}

// src/v5/fsm.mjs
var EXECUTION_CLOSURE_OPERATIONS = /* @__PURE__ */ new Set(["provide_capability_proof", "set_execution_disposition"]);
var EXECUTION_FINAL_OPERATIONS = /* @__PURE__ */ new Set(["pause_execution", "confirm_execution_plan"]);
function validateV5FsmRegistry(registry) {
  if (!registry || registry.schema_version !== "5.0.0" || registry.cells?.length !== 16 || registry.action_templates?.length !== 9 || registry.outcomes?.length !== 51 || registry.read_only_profiles?.length !== 4) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "The V5 FSM registry cardinality is invalid.");
  const cells = new Map(registry.cells.map((cell) => [cell.cell_id, cell]));
  const templates = new Map(registry.action_templates.map((template) => [template.template_id, template]));
  const triggers = /* @__PURE__ */ new Set();
  const ids = /* @__PURE__ */ new Set();
  for (const outcome of registry.outcomes) {
    const trigger = canonicalV5Stringify(outcome.trigger);
    if (ids.has(outcome.outcome_id) || triggers.has(trigger) || !cells.has(outcome.target_cell_id)) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "FSM outcomes must have unique IDs and triggers and known targets.");
    if (outcome.trigger.kind === "advance") {
      const from = cells.get(outcome.trigger.from_cell_id);
      if (!from || !templates.has(outcome.trigger.action_template_id) || !from.allowed_action_template_ids.includes(outcome.trigger.action_template_id) || !from.successor_cell_ids.includes(outcome.target_cell_id)) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "FSM advance outcome is not reachable from its declared cell.");
    }
    ids.add(outcome.outcome_id);
    triggers.add(trigger);
  }
  return true;
}
function selectV5Outcome(registry, trigger) {
  validateV5FsmRegistry(registry);
  const key = canonicalV5Stringify(trigger);
  const matches = registry.outcomes.filter((outcome) => canonicalV5Stringify(outcome.trigger) === key);
  if (matches.length !== 1) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `FSM trigger resolved to ${matches.length} outcomes.`);
  return structuredClone(matches[0]);
}
function actionTemplateForV5Action(registry, cellId, action) {
  validateV5FsmRegistry(registry);
  const cell = registry.cells.find((candidate) => candidate.cell_id === cellId);
  if (!cell || cell.lifecycle !== "active" || !action || typeof action.kind !== "string") throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "The action is not advertised by the current FSM cell.");
  const matches = registry.action_templates.filter((template) => {
    if (!cell.allowed_action_template_ids.includes(template.template_id) || template.action_kind !== action.kind) return false;
    if (template.action_kind === "submit_artifact") return template.artifact_kind === action.artifact_kind;
    if (template.template_id === "execution.advance_closure") return EXECUTION_CLOSURE_OPERATIONS.has(action.operation?.kind);
    if (template.template_id === "execution.confirm_or_pause") return EXECUTION_FINAL_OPERATIONS.has(action.operation?.kind);
    return true;
  });
  if (matches.length !== 1) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "The action does not match one advertised closed action template.");
  return structuredClone(matches[0]);
}

// src/contracts.mjs
var REPLY_STATUS = Object.freeze([
  "need_artifact",
  "need_user_answers",
  "need_revision",
  "finished",
  "fatal"
]);
var DIAGNOSTIC_CATEGORY = Object.freeze([
  "schema",
  "reference",
  "traceability",
  "coverage",
  "classification"
]);
var STABLE_ID_COLLECTIONS = Object.freeze([
  Object.freeze({ path: Object.freeze(["sources"]), id: "source_id" }),
  Object.freeze({ path: Object.freeze(["locators"]), id: "locator_id" }),
  Object.freeze({ path: Object.freeze(["source_policy", "rules"]), id: "rule_id" }),
  Object.freeze({ path: Object.freeze(["decision_records"]), id: "decision_id" }),
  Object.freeze({ path: Object.freeze(["clarification_events"]), id: "event_id" }),
  Object.freeze({ path: Object.freeze(["claims"]), id: "claim_id" }),
  Object.freeze({ path: Object.freeze(["fact_ledger"]), id: "fact_id" }),
  Object.freeze({ path: Object.freeze(["views"]), id: "view_id" }),
  Object.freeze({ path: Object.freeze(["views", "*", "elements"]), id: "element_id", namespace: "elements" }),
  Object.freeze({ path: Object.freeze(["views", "*", "relations"]), id: "relation_id" }),
  Object.freeze({ path: Object.freeze(["interaction_candidates"]), id: "candidate_id" }),
  Object.freeze({ path: Object.freeze(["obligations"]), id: "obligation_id" }),
  Object.freeze({ path: Object.freeze(["cases"]), id: "case_id", namespace: "cases" }),
  Object.freeze({ path: Object.freeze(["cases", "*", "steps"]), id: "step_id", namespace: "case_steps", scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(["cases", "*", "steps", "*", "expectations"]), id: "expectation_id", namespace: "case_expectations", scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(["exploratory_candidates"]), id: "exploratory_id" }),
  Object.freeze({ path: Object.freeze(["root_issue_dispositions"]), id: "root_issue_id" }),
  Object.freeze({ path: Object.freeze(["grounded"]), id: "case_id", namespace: "bundle_cases" }),
  Object.freeze({ path: Object.freeze(["conditional"]), id: "case_id", namespace: "bundle_cases" }),
  Object.freeze({ path: Object.freeze(["grounded", "*", "steps"]), id: "step_id", namespace: "case_steps", scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(["conditional", "*", "steps"]), id: "step_id", namespace: "case_steps", scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(["grounded", "*", "steps", "*", "expectations"]), id: "expectation_id", namespace: "case_expectations", scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(["conditional", "*", "steps", "*", "expectations"]), id: "expectation_id", namespace: "case_expectations", scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(["blockers"]), id: "root_issue_id", namespace: "reply_root_issues" }),
  Object.freeze({ path: Object.freeze(["blocked"]), id: "obligation_id" }),
  Object.freeze({ path: Object.freeze(["exploratory"]), id: "exploratory_id" })
]);

// src/schema-validator.mjs
var NATIVE_ARRAY_EVERY = Array.prototype.every;
var NATIVE_ARRAY_FILTER2 = Array.prototype.filter;
var NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
var NATIVE_ARRAY_FOR_EACH = Array.prototype.forEach;
var NATIVE_ARRAY_JOIN2 = Array.prototype.join;
var NATIVE_ARRAY_MAP2 = Array.prototype.map;
var NATIVE_ARRAY_SLICE = Array.prototype.slice;
var NATIVE_ARRAY_SOME = Array.prototype.some;
var NATIVE_HAS_OWN = Object.hasOwn;

// src/v5/registry-validation.mjs
function invariant(condition, message) {
  if (!condition) throw new Error(`POLICY_REGISTRY_INCONSISTENT: ${message}`);
}
function assertUnique(values, keyOf, name) {
  const keys = values.map(keyOf);
  invariant(new Set(keys).size === keys.length, `${name} contains duplicates`);
}
function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}
function declaredDigestEntry(record) {
  const selfDigestKeys = /* @__PURE__ */ new Set(["registry_digest", "policy_digest", "inventory_digest", "rules_bundle_digest", "manifest_digest"]);
  const keys = Object.keys(record).filter((key) => selfDigestKeys.has(key));
  invariant(keys.length === 1, "each registry must have exactly one top-level digest");
  return keys[0];
}
function assertRegistrySelfDigest(registry) {
  const key = declaredDigestEntry(registry);
  const { [key]: declared, ...payload } = registry;
  invariant(declared === `sha256:${digest(payload)}`, `${key} does not match canonical payload`);
}
function validateV5FsmRegistry2(fsm) {
  assertRegistrySelfDigest(fsm);
  invariant(fsm.schema_version === "5.0.0" && fsm.registry_format_version === 1, "FSM version mismatch");
  invariant(fsm.action_templates.length === 9, "FSM must contain 9 action templates");
  invariant(fsm.cells.length === 16, "FSM must contain 16 cells");
  invariant(fsm.outcomes.length === 51, "FSM must contain 51 outcomes");
  invariant(fsm.read_only_profiles.length === 4, "FSM must contain 4 read-only profiles");
  assertUnique(fsm.action_templates, (row) => row.template_id, "FSM action templates");
  assertUnique(fsm.cells, (row) => row.cell_id, "FSM cells");
  assertUnique(fsm.outcomes, (row) => row.outcome_id, "FSM outcomes");
  assertUnique(fsm.read_only_profiles, (row) => row.profile_id, "FSM read-only profiles");
  invariant(sameSet(fsm.action_templates.map((row) => row.template_id), [...V5_ACTION_TEMPLATE_IDS]), "FSM action template inventory mismatch");
  invariant(sameSet(fsm.cells.map((row) => row.cell_id), [...V5_FSM_CELL_IDS]), "FSM cell inventory mismatch");
  const cellIds = new Set(fsm.cells.map((row) => row.cell_id));
  const actionIds = new Set(fsm.action_templates.map((row) => row.template_id));
  for (const outcome of fsm.outcomes) {
    invariant(cellIds.has(outcome.target_cell_id), `unknown outcome target ${outcome.target_cell_id}`);
    if (outcome.trigger.kind === "advance") {
      invariant(cellIds.has(outcome.trigger.from_cell_id), `unknown outcome source ${outcome.trigger.from_cell_id}`);
      invariant(actionIds.has(outcome.trigger.action_template_id), `unknown outcome action ${outcome.trigger.action_template_id}`);
    }
  }
  for (const cell of fsm.cells) {
    for (const actionId of cell.allowed_action_template_ids) invariant(actionIds.has(actionId), `unknown cell action ${actionId}`);
    for (const targetId of cell.successor_cell_ids) invariant(cellIds.has(targetId), `unknown successor ${targetId}`);
    if (cell.lifecycle === "active") invariant(cellIds.has(cell.integrity_fatal_target_cell_id), `unknown integrity target for ${cell.cell_id}`);
    else invariant(cell.allowed_action_template_ids.length === 0 && cell.successor_cell_ids.length === 0, `terminal cell ${cell.cell_id} exposes mutation`);
  }
}
function validateV5PolicyRegistry(policy, fsm) {
  assertRegistrySelfDigest(policy);
  invariant(policy.schema_version === "5.0.0" && policy.registry_format_version === 1, "Policy version mismatch");
  invariant(policy.fsm_registry_digest === fsm.registry_digest, "Policy/FSM digest mismatch");
  assertUnique(policy.rules, (row) => row.rule_id, "Policy rules");
  const runtimeRules = policy.rules.filter((row) => row.kind === "runtime_error");
  const invariantRules = policy.rules.filter((row) => row.kind === "invariant");
  invariant(runtimeRules.length === 40, "Policy must contain 40 runtime errors");
  invariant(invariantRules.length === 34, "Policy must contain 34 invariant groups");
  invariant(sameSet(runtimeRules.map((row) => row.error_code), Object.keys(V5_ERROR_CATALOG)), "Runtime error inventory mismatch");
  invariant(sameSet(invariantRules.map((row) => row.assertion_ref), [...V5_INVARIANT_REFS]), "Invariant inventory mismatch");
  for (const [phase, codes] of Object.entries(V5_ERROR_PHASES)) {
    const rows = runtimeRules.filter((row) => row.validator_phase === phase).sort((left, right) => left.validator_priority - right.validator_priority);
    invariant(JSON.stringify(rows.map((row) => row.error_code)) === JSON.stringify(codes), `${phase} priority is not contiguous and exact`);
  }
  const runtimeCodes = new Set(runtimeRules.map((row) => row.error_code));
  for (const row of policy.accepted_closure_integrity_policy.target_rules) invariant(runtimeCodes.has(row.diagnostic_code), `unregistered closure diagnostic ${row.diagnostic_code}`);
  assertUnique(policy.provenance_policy.allowed_edges, (row) => row.edge_rule_id, "Provenance allowed edges");
}
function validateStableIdRegistry(registry) {
  assertRegistrySelfDigest(registry);
  invariant(registry.rows.length === 28, "Stable-ID registry must contain 28 rows");
  assertUnique(registry.rows, (row) => row.object_kind, "Stable-ID object kinds");
  assertUnique(registry.rows, (row) => row.prefix, "Stable-ID prefixes");
  assertUnique(registry.rows, (row) => row.projection_id, "Stable-ID projections");
  invariant(sameSet(registry.rows.map((row) => `${row.object_kind}:${row.prefix}:${row.projection_id}`), V5_STABLE_ID_ROWS.map((row) => row.join(":"))), "Stable-ID registry inventory mismatch");
}
function validateGeneratedV5Contracts(contracts2) {
  for (const contract of Object.values(contracts2)) assertRegistrySelfDigest(contract);
  validateV5FsmRegistry2(contracts2.fsmRegistry);
  validateV5PolicyRegistry(contracts2.policyRegistry, contracts2.fsmRegistry);
  validateStableIdRegistry(contracts2.stableIdPreimageRegistry);
  invariant(contracts2.sourceAcquisitionPolicy.max_requests_per_batch === 16, "source batch limit must be 16");
  invariant(contracts2.sourceAcquisitionPolicy.batch_order === "required_desc_then_request_id_asc", "source batch order mismatch");
  invariant(contracts2.permissionDerivationRegistry.rules.length === 1, "permission derivation must have one normative rule");
}

// src/v5/registry-generator.mjs
var V5_POLICY_FILE_MAP = Object.freeze({
  sourceAcquisitionPolicy: "v5-source-acquisition-policy",
  fsmRegistry: "v5-fsm-registry",
  policyRegistry: "v5-policy-registry",
  permissionDerivationRegistry: "v5-permission-derivation-registry",
  answerConstraintRegistry: "v5-answer-constraint-registry",
  clarificationControlRegistry: "v5-clarification-control-registry",
  stableIdPreimageRegistry: "v5-stable-id-preimage-registry",
  storageLayoutRegistry: "v5-storage-layout-registry",
  normativeRuleInventory: "v5-normative-rule-inventory",
  replyContracts: "v5-reply-contracts.generated",
  canonicalArrayManifest: "v5-canonical-array-manifest"
});
var V5_POLICY_DIGEST_KEYS = Object.freeze({
  sourceAcquisitionPolicy: "policy_digest",
  fsmRegistry: "registry_digest",
  policyRegistry: "registry_digest",
  permissionDerivationRegistry: "registry_digest",
  answerConstraintRegistry: "registry_digest",
  clarificationControlRegistry: "registry_digest",
  stableIdPreimageRegistry: "registry_digest",
  storageLayoutRegistry: "registry_digest",
  normativeRuleInventory: "inventory_digest",
  replyContracts: "rules_bundle_digest",
  canonicalArrayManifest: "manifest_digest"
});
function attachDigest(payload, key) {
  return { ...payload, [key]: `sha256:${digest(payload)}` };
}
function sorted(values) {
  return [...values].sort();
}
function createActionTemplates() {
  return [
    { template_id: "run.cancel", action_kind: "cancel_run" },
    { template_id: "source.submit_batch", action_kind: "submit_source_batch" },
    { template_id: "artifact.submit_evidence_claims", action_kind: "submit_artifact", artifact_kind: "evidence_claims" },
    { template_id: "clarification.preview", action_kind: "preview_clarification_response" },
    { template_id: "clarification.commit", action_kind: "commit_clarification_response" },
    { template_id: "artifact.submit_behavior_views", action_kind: "submit_artifact", artifact_kind: "behavior_views" },
    { template_id: "artifact.submit_case_drafts", action_kind: "submit_artifact", artifact_kind: "case_drafts" },
    { template_id: "execution.advance_closure", action_kind: "advance_execution_plan", operation_source: "phase0_closed_non_sibling_closure_operations" },
    { template_id: "execution.confirm_or_pause", action_kind: "advance_execution_plan", operation_source: "phase0_closed_confirm_or_pause_operations" }
  ].sort((left, right) => left.template_id.localeCompare(right.template_id));
}
function activeCell(row) {
  const value = (
    /** @type {any} */
    row
  );
  return {
    ...value,
    allowed_action_template_ids: sorted(value.allowed_action_template_ids),
    successor_cell_ids: sorted(value.successor_cell_ids),
    integrity_fatal_target_cell_id: value.delivery_intent === "case_document" ? "cd.terminal.fatal" : "ep.terminal.fatal",
    terminal_kind: null,
    inspect_projection_kind: "persisted_run_state"
  };
}
function terminalCell(cellId, deliveryIntent, lifecycle, terminalKind) {
  return {
    cell_id: cellId,
    delivery_intent: deliveryIntent,
    lifecycle,
    stage: "delivery",
    obligation: "complete",
    normal_reply_status: lifecycle,
    work_packet_kind: "terminal_work",
    allowed_action_template_ids: [],
    successor_cell_ids: [],
    integrity_fatal_target_cell_id: lifecycle === "fatal" ? null : deliveryIntent === "case_document" ? "cd.terminal.fatal" : "ep.terminal.fatal",
    terminal_kind: terminalKind,
    inspect_projection_kind: "persisted_run_state"
  };
}
function createFsmCells() {
  return [
    activeCell({ cell_id: "cd.active.source.provide", delivery_intent: "case_document", lifecycle: "active", stage: "source_acquisition", obligation: "provide_source_pack", normal_reply_status: "need_artifact", work_packet_kind: "source_work", allowed_action_template_ids: ["source.submit_batch", "run.cancel"], successor_cell_ids: ["cd.active.source.provide", "cd.active.requirements.review", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.requirements.review", delivery_intent: "case_document", lifecycle: "active", stage: "requirements_analysis", obligation: "review_semantic_seed", normal_reply_status: "need_revision", work_packet_kind: "semantic_review_work", allowed_action_template_ids: ["artifact.submit_evidence_claims", "run.cancel"], successor_cell_ids: ["cd.active.requirements.review", "cd.active.requirements.resolve", "cd.active.case.behavior", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.requirements.resolve", delivery_intent: "case_document", lifecycle: "active", stage: "requirements_analysis", obligation: "resolve_requirements_questions", normal_reply_status: "need_user_answers", work_packet_kind: "clarification_work", allowed_action_template_ids: ["clarification.preview", "run.cancel"], successor_cell_ids: ["cd.active.requirements.resolve", "cd.active.requirements.confirm", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.requirements.confirm", delivery_intent: "case_document", lifecycle: "active", stage: "requirements_analysis", obligation: "confirm_clarification", normal_reply_status: "clarification_confirmation_required", work_packet_kind: "clarification_confirmation_work", allowed_action_template_ids: ["clarification.commit", "clarification.preview", "run.cancel"], successor_cell_ids: ["cd.active.requirements.confirm", "cd.active.requirements.resolve", "cd.active.requirements.review", "cd.active.case.behavior", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.case.behavior", delivery_intent: "case_document", lifecycle: "active", stage: "case_design", obligation: "provide_behavior_views", normal_reply_status: "need_revision", work_packet_kind: "behavior_work", allowed_action_template_ids: ["artifact.submit_behavior_views", "run.cancel"], successor_cell_ids: ["cd.active.case.behavior", "cd.active.case.resolve", "cd.active.case.drafts", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.case.drafts", delivery_intent: "case_document", lifecycle: "active", stage: "case_design", obligation: "provide_case_drafts", normal_reply_status: "need_revision", work_packet_kind: "case_work", allowed_action_template_ids: ["artifact.submit_case_drafts", "run.cancel"], successor_cell_ids: ["cd.active.case.drafts", "cd.active.case.behavior", "cd.terminal.finished", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.case.resolve", delivery_intent: "case_document", lifecycle: "active", stage: "case_design", obligation: "resolve_case_questions", normal_reply_status: "need_user_answers", work_packet_kind: "clarification_work", allowed_action_template_ids: ["clarification.preview", "run.cancel"], successor_cell_ids: ["cd.active.case.resolve", "cd.active.case.confirm", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    activeCell({ cell_id: "cd.active.case.confirm", delivery_intent: "case_document", lifecycle: "active", stage: "case_design", obligation: "confirm_clarification", normal_reply_status: "clarification_confirmation_required", work_packet_kind: "clarification_confirmation_work", allowed_action_template_ids: ["clarification.commit", "clarification.preview", "run.cancel"], successor_cell_ids: ["cd.active.case.confirm", "cd.active.case.resolve", "cd.active.requirements.review", "cd.active.case.behavior", "cd.active.case.drafts", "cd.terminal.finished", "cd.terminal.cancelled", "cd.terminal.fatal"] }),
    terminalCell("cd.terminal.finished", "case_document", "finished", "case_document_finished"),
    terminalCell("cd.terminal.cancelled", "case_document", "cancelled", "case_document_cancelled"),
    terminalCell("cd.terminal.fatal", "case_document", "fatal", "case_document_fatal"),
    activeCell({ cell_id: "ep.active.closure.resolve", delivery_intent: "execution_plan", lifecycle: "active", stage: "execution_closure", obligation: "resolve_execution_closure", normal_reply_status: "need_revision", work_packet_kind: "execution_work", allowed_action_template_ids: ["execution.advance_closure", "run.cancel"], successor_cell_ids: ["ep.active.closure.resolve", "ep.active.final.confirm", "ep.terminal.cancelled", "ep.terminal.fatal"] }),
    activeCell({ cell_id: "ep.active.final.confirm", delivery_intent: "execution_plan", lifecycle: "active", stage: "final_confirmation", obligation: "confirm_execution_plan", normal_reply_status: "ready", work_packet_kind: "execution_work", allowed_action_template_ids: ["execution.confirm_or_pause", "run.cancel"], successor_cell_ids: ["ep.active.final.confirm", "ep.terminal.finished", "ep.terminal.cancelled", "ep.terminal.fatal"] }),
    terminalCell("ep.terminal.finished", "execution_plan", "finished", "execution_plan_finished"),
    terminalCell("ep.terminal.cancelled", "execution_plan", "cancelled", "execution_plan_cancelled"),
    terminalCell("ep.terminal.fatal", "execution_plan", "fatal", "execution_plan_fatal")
  ].sort((left, right) => left.cell_id.localeCompare(right.cell_id));
}
function artifactCommit(artifactKind) {
  return { kind: "artifact_commit", artifact_kind: artifactKind, semantic_revision_delta: 1 };
}
function operationalCommit(effect) {
  return { kind: "operational_commit", effect, semantic_revision_delta: 0 };
}
var clarificationCommit = Object.freeze({ kind: "clarification_commit", semantic_revision_delta: 1 });
function advanceOutcome(outcomeId, fromCellId, actionTemplateId, resultKey, targetCellId, commitProjection) {
  return { outcome_id: outcomeId, trigger: { kind: "advance", from_cell_id: fromCellId, action_template_id: actionTemplateId, result_key: resultKey }, target_cell_id: targetCellId, commit_projection: commitProjection };
}
function createFsmOutcomes() {
  const outcomes = [
    { outcome_id: "OUT5.create.case.initial", trigger: { kind: "create", create_variant: "case_document", result_key: "initial" }, target_cell_id: "cd.active.source.provide", commit_projection: operationalCommit("run_created") },
    { outcome_id: "OUT5.create.execution.initial", trigger: { kind: "create", create_variant: "execution_plan", result_key: "initial" }, target_cell_id: "ep.active.closure.resolve", commit_projection: operationalCommit("run_created") },
    ...V5_RESUMABLE_FSM_CELL_IDS.map((target) => ({ outcome_id: `OUT5.create.resume.${target}`, trigger: { kind: "create", create_variant: "resume_cancelled", result_key: `target:${target}` }, target_cell_id: target, commit_projection: operationalCommit("run_created") })),
    advanceOutcome("OUT5.cd.source.batch.payload.more", "cd.active.source.provide", "source.submit_batch", "payload:sources_remaining", "cd.active.source.provide", artifactCommit("source_pack")),
    advanceOutcome("OUT5.cd.source.batch.payload.complete", "cd.active.source.provide", "source.submit_batch", "payload:sources_complete", "cd.active.requirements.review", artifactCommit("source_pack")),
    advanceOutcome("OUT5.cd.source.batch.skip.more", "cd.active.source.provide", "source.submit_batch", "all_skipped_optional:sources_remaining", "cd.active.source.provide", operationalCommit("source_acquisition_advanced")),
    advanceOutcome("OUT5.cd.source.batch.skip.complete", "cd.active.source.provide", "source.submit_batch", "all_skipped_optional:sources_complete", "cd.active.requirements.review", operationalCommit("source_acquisition_advanced")),
    advanceOutcome("OUT5.cd.requirements.review.gaps", "cd.active.requirements.review", "artifact.submit_evidence_claims", "actionable_gaps", "cd.active.requirements.resolve", artifactCommit("evidence_claims")),
    advanceOutcome("OUT5.cd.requirements.review.ready", "cd.active.requirements.review", "artifact.submit_evidence_claims", "no_actionable_gap", "cd.active.case.behavior", artifactCommit("evidence_claims")),
    advanceOutcome("OUT5.cd.requirements.resolve.preview.changed", "cd.active.requirements.resolve", "clarification.preview", "semantic_change", "cd.active.requirements.confirm", operationalCommit("clarification_pending_created")),
    advanceOutcome("OUT5.cd.requirements.resolve.discard", "cd.active.requirements.resolve", "clarification.preview", "discard_pending", "cd.active.requirements.resolve", operationalCommit("idempotency_only")),
    advanceOutcome("OUT5.cd.requirements.confirm.repreview.changed", "cd.active.requirements.confirm", "clarification.preview", "semantic_change", "cd.active.requirements.confirm", operationalCommit("clarification_pending_replaced")),
    advanceOutcome("OUT5.cd.requirements.confirm.discard", "cd.active.requirements.confirm", "clarification.preview", "discard_pending", "cd.active.requirements.resolve", operationalCommit("pending_discarded")),
    advanceOutcome("OUT5.cd.requirements.confirm.commit.review", "cd.active.requirements.confirm", "clarification.commit", "requirements_review_invalidated", "cd.active.requirements.review", clarificationCommit),
    advanceOutcome("OUT5.cd.requirements.confirm.commit.resolve", "cd.active.requirements.confirm", "clarification.commit", "actionable_gaps", "cd.active.requirements.resolve", clarificationCommit),
    advanceOutcome("OUT5.cd.requirements.confirm.commit.behavior", "cd.active.requirements.confirm", "clarification.commit", "requirements_ready", "cd.active.case.behavior", clarificationCommit),
    advanceOutcome("OUT5.cd.case.behavior.gaps", "cd.active.case.behavior", "artifact.submit_behavior_views", "actionable_gaps", "cd.active.case.resolve", artifactCommit("behavior_views")),
    advanceOutcome("OUT5.cd.case.behavior.ready", "cd.active.case.behavior", "artifact.submit_behavior_views", "no_actionable_gap", "cd.active.case.drafts", artifactCommit("behavior_views")),
    advanceOutcome("OUT5.cd.case.drafts.finished", "cd.active.case.drafts", "artifact.submit_case_drafts", "all_gates_passed", "cd.terminal.finished", artifactCommit("case_drafts")),
    advanceOutcome("OUT5.cd.case.resolve.preview.changed", "cd.active.case.resolve", "clarification.preview", "semantic_change", "cd.active.case.confirm", operationalCommit("clarification_pending_created")),
    advanceOutcome("OUT5.cd.case.resolve.discard", "cd.active.case.resolve", "clarification.preview", "discard_pending", "cd.active.case.resolve", operationalCommit("idempotency_only")),
    advanceOutcome("OUT5.cd.case.confirm.repreview.changed", "cd.active.case.confirm", "clarification.preview", "semantic_change", "cd.active.case.confirm", operationalCommit("clarification_pending_replaced")),
    advanceOutcome("OUT5.cd.case.confirm.discard", "cd.active.case.confirm", "clarification.preview", "discard_pending", "cd.active.case.resolve", operationalCommit("pending_discarded")),
    advanceOutcome("OUT5.cd.case.confirm.commit.requirements", "cd.active.case.confirm", "clarification.commit", "requirements_invalidated", "cd.active.requirements.review", clarificationCommit),
    advanceOutcome("OUT5.cd.case.confirm.commit.resolve", "cd.active.case.confirm", "clarification.commit", "actionable_gaps", "cd.active.case.resolve", clarificationCommit),
    advanceOutcome("OUT5.cd.case.confirm.commit.behavior", "cd.active.case.confirm", "clarification.commit", "behavior_invalidated", "cd.active.case.behavior", clarificationCommit),
    advanceOutcome("OUT5.cd.case.confirm.commit.drafts", "cd.active.case.confirm", "clarification.commit", "case_drafts_required", "cd.active.case.drafts", clarificationCommit),
    advanceOutcome("OUT5.cd.case.confirm.commit.finished", "cd.active.case.confirm", "clarification.commit", "all_gates_passed", "cd.terminal.finished", clarificationCommit),
    advanceOutcome("OUT5.ep.closure.provide_capability_proof.stay", "ep.active.closure.resolve", "execution.advance_closure", "provide_capability_proof:closure_open", "ep.active.closure.resolve", operationalCommit("execution_plan_advanced")),
    advanceOutcome("OUT5.ep.closure.provide_capability_proof.ready", "ep.active.closure.resolve", "execution.advance_closure", "provide_capability_proof:closure_complete", "ep.active.final.confirm", operationalCommit("execution_plan_advanced")),
    advanceOutcome("OUT5.ep.closure.set_execution_disposition.stay", "ep.active.closure.resolve", "execution.advance_closure", "set_execution_disposition:closure_open", "ep.active.closure.resolve", operationalCommit("execution_plan_advanced")),
    advanceOutcome("OUT5.ep.closure.set_execution_disposition.ready", "ep.active.closure.resolve", "execution.advance_closure", "set_execution_disposition:closure_complete", "ep.active.final.confirm", operationalCommit("execution_plan_advanced")),
    advanceOutcome("OUT5.ep.final.pause", "ep.active.final.confirm", "execution.confirm_or_pause", "pause_execution", "ep.active.final.confirm", operationalCommit("execution_plan_paused")),
    advanceOutcome("OUT5.ep.final.confirm", "ep.active.final.confirm", "execution.confirm_or_pause", "confirm_execution_plan", "ep.terminal.finished", operationalCommit("execution_plan_confirmed")),
    ...V5_ACTIVE_FSM_CELL_IDS.map((fromCell) => advanceOutcome(`OUT5.cancel.${fromCell}`, fromCell, "run.cancel", "cancelled", fromCell.startsWith("cd.") ? "cd.terminal.cancelled" : "ep.terminal.cancelled", operationalCommit("run_cancelled")))
  ];
  return outcomes.sort((left, right) => left.outcome_id.localeCompare(right.outcome_id));
}
function createFsmRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: V5_REGISTRY_FORMAT_VERSION,
    action_templates: createActionTemplates(),
    cells: createFsmCells(),
    outcomes: createFsmOutcomes(),
    read_only_profiles: [
      { profile_id: "inspect.integrity_failure.with_verified_checkpoint", api: "inspectV5Run", projection_kind: "read_only_integrity_fatal", trigger_state_kind: "verified_fsm_cell", last_verified_state_kind: "checkpoint" },
      { profile_id: "inspect.integrity_failure.without_verified_checkpoint", api: "inspectV5Run", projection_kind: "read_only_integrity_fatal", trigger_state_kind: "no_verified_fsm_cell", last_verified_state_kind: "none" },
      { profile_id: "terminal.fatal.integrity_advance_rejection", api: "advanceV5Run", projection_kind: "read_only_integrity_fatal", trigger_lifecycle: "fatal", last_verified_state_kind: "checkpoint" },
      { profile_id: "terminal.advance_rejection", api: "advanceV5Run", projection_kind: "read_only_terminal_rejection" }
    ].sort((left, right) => left.profile_id.localeCompare(right.profile_id))
  }, "registry_digest");
}
function createSourceAcquisitionPolicy() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    policy_format_version: 1,
    max_requests_per_batch: 16,
    batch_order: "required_desc_then_request_id_asc",
    bootstrap_array_semantics: "set",
    disposition_array_semantics: "set"
  }, "policy_digest");
}
function createPermissionDerivationRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    rules: [{
      rule_id: "permission.atomic-candidate-to-cells.v1",
      required_coordinate_cardinality: { role: 1, resource: 1, action: 1, context: 1 },
      required_dimension: "decision",
      optional_signaled_dimensions: ["denial_behavior", "data_scope"],
      allowed_actions: ["discover", "enter", "view", "query", "mutate"],
      ambiguous_coordinate_result: "requirements_gap",
      emitted_cell_rule: "one_cell_per_signaled_dimension"
    }]
  }, "registry_digest");
}
var allowedControls = Object.freeze(["answer", "defer", "unknown", "close_for_delivery"]);
function answerRule(key, derivation) {
  return { ...key, derivation: { ...derivation, allowed_controls: [...allowedControls] } };
}
function createAnswerConstraintRegistry() {
  const requirementsPairs = [
    ["condition", "condition", { kind: "bounded_text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" }],
    ["expected_outcome", "expected_outcome", { kind: "bounded_text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" }],
    ["timing", "timing", { kind: "duration_ms", maximum: 31536e6 }],
    ["quantifier_scope", "quantifier_scope", { kind: "requirements_quantifier_from_target" }],
    ["comparison", "comparison", { kind: "enum_catalog", catalog_id: "comparison_mode", output_kind: "enum" }],
    ["authority_source", "authority_source", { kind: "requirements_refs_from_target", target_field: "allowed_authority_refs", min_items: 1 }],
    ["value_state", "value_state", { kind: "enum_catalog", catalog_id: "value_state", output_kind: "set", min_items: 1 }],
    ["complement", "complement", { kind: "set_from_target_domain", min_items: 1 }],
    ["role_domain", "role_domain", { kind: "requirements_set_from_target", min_items: 1 }],
    ["reference", "reference", { kind: "requirements_refs_from_target", target_field: "allowed_entity_refs", min_items: 1 }]
  ];
  const rules = requirementsPairs.map(([ambiguityKind, targetKind, derivation]) => answerRule({ source_kind: "requirements_gap", origin_kind: "ambiguity", ambiguity_kind: ambiguityKind, target_kind: targetKind }, derivation));
  rules.push(
    answerRule({ source_kind: "requirements_gap", origin_kind: "ambiguity", ambiguity_kind: "other", target_kind: "other", target_code: "ambiguity.other" }, { kind: "bounded_text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" }),
    answerRule({ source_kind: "requirements_gap", origin_kind: "outcome_decomposition", unresolved_aspect: "atomic_boundary", target_kind: "other", target_code: "outcome.atomic_boundary" }, { kind: "requirements_set_from_target", min_items: 1 }),
    answerRule({ source_kind: "requirements_gap", origin_kind: "outcome_decomposition", unresolved_aspect: "normative_status", target_kind: "other", target_code: "outcome.normative_status" }, { kind: "bounded_text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" }),
    answerRule({ source_kind: "requirements_gap", origin_kind: "entity_resolution", target_kind: "other", target_code: "entity.resolution" }, { kind: "entity_resolution_from_origin" }),
    answerRule({ source_kind: "requirements_gap", origin_kind: "permission_scope", target_kind: "permission_coordinates" }, { kind: "permission_coordinates_from_origin" })
  );
  const behaviorDerivations = {
    authority: { kind: "requirements_refs_from_target", target_field: "allowed_authority_refs", min_items: 1 },
    join: { kind: "mapping_from_target_fields", key_kind: "identifier", mapped_value_kind: "identifier" },
    transform: { kind: "requirements_refs_from_target", target_field: "allowed_entity_refs", min_items: 1 },
    null_policy: { kind: "enum_catalog", catalog_id: "null_policy", output_kind: "enum" },
    freshness: { kind: "duration_ms", maximum: 31536e6 },
    domain_boundary: { kind: "domain_boundary_from_target", open_domain_fallback: { kind: "text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" } },
    population_scope: { kind: "population_scope_from_target" },
    population_proof: { kind: "population_proof_from_target" },
    oracle_observation: { kind: "oracle_observation_from_target" },
    oracle_assertion: { kind: "oracle_assertion_from_target" },
    oracle_scope: { kind: "oracle_scope_from_target" },
    oracle_window: { kind: "oracle_window_from_target" },
    permission_outcome: { kind: "permission_outcome_from_target_action" },
    denial_behavior: { kind: "permission_auxiliary_from_target", expected_contract_kind: "denial_behavior" },
    data_scope: { kind: "permission_auxiliary_from_target", expected_contract_kind: "data_scope" },
    risk_rule: { kind: "bounded_text", min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: "answer.no-unresolved-vague-token.v1" }
  };
  for (const [missingSemantics, derivation] of Object.entries(behaviorDerivations)) {
    const targetKind = ["permission_outcome", "denial_behavior", "data_scope"].includes(missingSemantics) ? "permission_cell" : missingSemantics === "risk_rule" ? "risk" : "behavior_contract";
    rules.push(answerRule({ source_kind: "behavior_gap", target_kind: targetKind, missing_semantics: missingSemantics }, derivation));
  }
  return attachDigest({
    registry_version: 1,
    identifier_patterns: [
      { pattern_ref: "identifier.client-key.v1", engine: "RE2", expression: "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$" },
      { pattern_ref: "identifier.stable-ref.v1", engine: "RE2", expression: "^[a-z][a-z0-9]*_[0-9a-f]{64}$" }
    ],
    scope_ref_kinds: ["module", "entity", "field", "behavior_contract", "permission_cell", "population_contract"].map((refKind) => ({ ref_kind: refKind, target_object_kind: refKind })),
    enum_catalogs: [
      { catalog_id: "comparison_mode", members: ["strict_equal", "normalized_equal", "semantic_equivalent", "set_contains", "set_equals"] },
      { catalog_id: "value_state", members: ["missing", "null", "empty_string", "present_value", "not_rendered", "rendered_empty"] },
      { catalog_id: "null_policy", members: ["null_is_missing", "null_is_value", "null_is_invalid", "null_is_not_applicable"] }
    ],
    text_ambiguity_guards: [{ guard_ref: "answer.no-unresolved-vague-token.v1", match_mode: "unicode_scalar_substring", forbidden_tokens: ["\u6B63\u5E38", "\u6B63\u786E", "\u5BF9\u5E94", "\u539F\u503C", "\u6309\u539F\u503C", "\u6240\u6709", "\u5426\u5219", "\u5176\u4ED6", "\u53CA\u65F6", "\u5408\u7406", "\u9ED8\u8BA4"] }],
    contract_derivation_rules: rules
  }, "registry_digest");
}
function createClarificationControlRegistry() {
  return attachDigest({ registry_version: 1, ...V5_CLARIFICATION_TOKENS }, "registry_digest");
}
function createStableIdRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    canonical_profile: V5_CANONICAL_PROFILE,
    rows: V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => ({
      object_kind: objectKind,
      prefix,
      projection_id: projectionId,
      golden_test_id: "F-C15-protocol.positive.baseline"
    })).sort((left, right) => left.object_kind.localeCompare(right.object_kind))
  }, "registry_digest");
}
function createStorageLayoutRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    path_rules: { separator: "/", forbid_empty_segments: true, forbid_dot_segments: true, forbid_backslash: true, forbid_nul: true, symlink_policy: "deny" },
    catalog: {
      current_pointer: "catalog/current-transaction.json",
      transactions: "catalog/objects/transactions",
      receipts: "catalog/objects/receipts",
      idempotency_indexes: "catalog/objects/idempotency-indexes",
      replies: "catalog/objects/replies",
      run_genesis_records: "catalog/objects/run-genesis-records",
      runs: "runs"
    },
    run: {
      identity: "identity.json",
      current_pointer: "current-transaction.json",
      transactions: "objects/transactions",
      receipts: "objects/receipts",
      idempotency_indexes: "objects/idempotency-indexes",
      replies: "objects/replies",
      checkpoints: "objects/checkpoints",
      selector_sidecars: "objects/selector-sidecars",
      accepted_artifacts: "objects/accepted-artifacts",
      compiler_state: "objects/compiler-state",
      rendered_outputs: "objects/rendered-outputs",
      events: "objects/events",
      incidents: "objects/incidents",
      run_genesis_records: "objects/run-genesis-records",
      raw_source_bytes: "objects/raw-source-bytes",
      staging: ".staging",
      lock: ".v5-run.lock"
    },
    object_key_format: "sha256-lowercase-hex-json",
    publication_protocol: "write_temp_fsync_rename_directory_fsync_pointer_raw_bytes_cas"
  }, "registry_digest");
}
function createCanonicalArrayManifest() {
  const setEntries = [
    ["/source_bootstrap/source_request_seeds", "source_request_client_key"],
    ["/source_requests", "request_id"],
    ["/request_ids", "$canonical"],
    ["/request_dispositions", "request_id"],
    ["/ledger/dispositions", "request_id"],
    ["/ledger/next_batch_request_ids", "$canonical"],
    ["/source_payload/source_pack/sources", "source_client_key"],
    ["/accepted_source_payload_digests", "$canonical"],
    ["/source_packs", "artifact_digest"],
    ["/decomposition_reviews", "candidate_id"],
    ["/ambiguity_reviews", "candidate_id"],
    ["/entity_resolutions", "conflict_group_id"],
    ["/entity_conflict_groups", "conflict_group_id"],
    ["/entity_conflict_groups/mention_candidate_ids", "$canonical"],
    ["/permission_scope_groups", "scope_group_id"],
    ["/permission_scope_groups/permission_scope_candidate_ids", "$canonical"],
    ["/exact_mention_candidate_ids", "$canonical"],
    ["/clusters", "$canonical"],
    ["/clusters/mentions", "mention_candidate_id"],
    ["/question_part_state_set/parts", "question_part_id"],
    ["/clarification_preview/bindings", "unit_client_key"],
    ["/pending/canonical_units", "unit_client_key"],
    ["/pending/decision_proposals", "question_part_id"],
    ["/applied_clarification_impact/decision_ids", "$canonical"],
    ["/idempotency_index/entries", "idempotency_key"],
    ["/stable_id_preimage_registry/rows", "object_kind"],
    ["/fsm/action_templates", "template_id"],
    ["/fsm/cells", "cell_id"],
    ["/fsm/outcomes", "outcome_id"],
    ["/fsm/read_only_profiles", "profile_id"],
    ["/fsm/cells/successor_cell_ids", "$canonical"],
    ["/permission/unresolved_coordinates", "$permission-coordinate-order"],
    ["/permission/coordinate_resolutions", "coordinate"],
    ["/risk_reviews", "$module-risk"],
    ["/basis", "$canonical"],
    ["/affected_refs", "$canonical"],
    ["/selectors", "$canonical"],
    ["/client_key_bindings", "client_key"]
  ];
  const sequenceEntries = [
    ["/source_pack/sources/units", "$position"],
    ["/cases/steps", "$position"],
    ["/clarification_presentation/parts", "$position"],
    ["/question_part_state/transition_history", "transition_sequence"]
  ];
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    manifest_format_version: 1,
    entries: [
      ...setEntries.map(([jsonPointer, uniqueKey]) => ({ json_pointer: jsonPointer, semantics: "set", unique_key: uniqueKey, sort_key: uniqueKey })),
      ...sequenceEntries.map(([jsonPointer, positionKey]) => ({ json_pointer: jsonPointer, semantics: "sequence", position_key: positionKey }))
    ].sort((left, right) => left.json_pointer.localeCompare(right.json_pointer))
  }, "manifest_digest");
}
function createProvenancePolicy() {
  const edge = (id, from, to, semantics, conditions) => ({ edge_rule_id: id, from_kind: from, to_kind: to, semantics, conditions, test_ids: ["F-C16-provenance.positive.baseline"] });
  const sameSemantic = [{ kind: "same_lineage" }, { kind: "current_semantic_root" }, { kind: "accepted_ancestor" }];
  return {
    unlisted_edge_policy: "deny",
    cycle_policy: "reject",
    same_run_downstream_source_reentry: "deny",
    external_artifact_default_evidence_level: "E0",
    allowed_edges: [
      edge("edge.source-unit.claim", "source_unit", "claim", "evidence", [{ kind: "same_run" }, ...sameSemantic]),
      edge("edge.decision.claim", "decision", "claim", "evidence", [{ kind: "same_lineage" }, { kind: "current_semantic_root" }, { kind: "accepted_ancestor" }, { kind: "evidence_level_in", levels: ["E1", "E3"] }]),
      edge("edge.claim.claim", "claim", "claim", "derivation", [{ kind: "same_run" }, ...sameSemantic, { kind: "evidence_level_in", levels: ["E2"] }]),
      edge("edge.claim.fact", "claim", "fact", "derivation", [{ kind: "same_run" }, ...sameSemantic]),
      edge("edge.claim.behavior-contract", "claim", "behavior_contract", "evidence", [...sameSemantic]),
      edge("edge.decision.behavior-contract", "decision", "behavior_contract", "evidence", [...sameSemantic, { kind: "evidence_level_in", levels: ["E1", "E3"] }]),
      edge("edge.fact.behavior-contract", "fact", "behavior_contract", "derivation", [...sameSemantic]),
      edge("edge.fact.atomic-outcome", "fact", "atomic_outcome", "derivation", [...sameSemantic]),
      edge("edge.behavior-contract.atomic-outcome", "behavior_contract", "atomic_outcome", "derivation", [...sameSemantic]),
      edge("edge.atomic-outcome.formal-test-point", "atomic_outcome", "formal_test_point", "derivation", [...sameSemantic]),
      edge("edge.formal-test-point.case", "formal_test_point", "case", "derivation", [...sameSemantic]),
      edge("edge.behavior-contract.case", "behavior_contract", "case", "derivation", [...sameSemantic]),
      edge("edge.case.case-oracle", "case", "case_oracle", "ownership", [{ kind: "same_run" }, { kind: "same_lineage" }, { kind: "current_semantic_root" }]),
      edge("edge.claim.case-oracle", "claim", "case_oracle", "evidence", [{ kind: "same_lineage" }, { kind: "current_semantic_root" }, { kind: "accepted_ancestor" }, { kind: "evidence_level_in", levels: ["E1", "E2", "E3"] }]),
      edge("edge.case.case-document", "case", "case_document", "ownership", [{ kind: "same_run" }, { kind: "same_lineage" }, { kind: "current_semantic_root" }]),
      edge("edge.case-document.execution-plan", "case_document", "execution_plan", "execution_derivation", [{ kind: "same_lineage" }, { kind: "immutable_digest_ref" }]),
      edge("edge.case-document.execution-result", "case_document", "execution_result", "execution_derivation", [{ kind: "same_lineage" }, { kind: "immutable_digest_ref" }, { kind: "external_downstream_only" }]),
      edge("edge.execution-plan.execution-result", "execution_plan", "execution_result", "execution_derivation", [{ kind: "same_lineage" }, { kind: "immutable_digest_ref" }, { kind: "external_downstream_only" }]),
      edge("edge.case-document.rendered-output", "case_document", "rendered_output", "render_derivation", [{ kind: "same_run" }, { kind: "same_lineage" }, { kind: "immutable_digest_ref" }])
    ].sort((left, right) => left.edge_rule_id.localeCompare(right.edge_rule_id))
  };
}
function verifiedState(cellId) {
  return { kind: "verified_fsm_cell", fsm_cell_id: cellId };
}
function persistedProfile(cellId, replyCellId = cellId) {
  return { state_profile_id: `state.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "persisted_fsm_cell", reply_fsm_cell_id: replyCellId } };
}
function createRuntimeResponses(errorCode, catalogRow) {
  const [replyStatus, semanticCommitPolicy, recoveryInstructionKey] = catalogRow;
  const preRunCodes = /* @__PURE__ */ new Set(["UNSUPPORTED_SCHEMA_VERSION", "RUN_ARGUMENT_INVALID", "RESUME_PARENT_INVALID", "CASE_DOCUMENT_REFERENCE_INVALID"]);
  if (preRunCodes.has(errorCode)) return [{ response_variant_id: "pre_run", context: "pre_run", response_channel: "pre_run_error", reply_status: replyStatus, semantic_commit_policy: semanticCommitPolicy, failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey }];
  if (errorCode === "ACCEPTED_STATE_INTEGRITY_FAILURE") {
    const inspectProfiles = V5_ACTIVE_FSM_CELL_IDS.concat(["cd.terminal.finished", "cd.terminal.cancelled", "cd.terminal.fatal", "ep.terminal.finished", "ep.terminal.cancelled", "ep.terminal.fatal"]).map((cellId) => ({ state_profile_id: `inspect.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "checkpoint" } }));
    inspectProfiles.push(
      { state_profile_id: "inspect.none.case", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "case_document" }, reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "none" } },
      { state_profile_id: "inspect.none.execution", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "execution_plan" }, reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "none" } }
    );
    return [
      { response_variant_id: "pre_run_identity", context: "pre_run", response_channel: "pre_run_error", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: "inspect_verified", context: "run_inspect", state_profiles: inspectProfiles, response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: "mutation_terminalize", context: "run_mutation", state_profiles: V5_ACTIVE_FSM_CELL_IDS.concat(["cd.terminal.finished", "cd.terminal.cancelled", "ep.terminal.finished", "ep.terminal.cancelled"]).map((cellId) => persistedProfile(cellId, cellId.startsWith("cd.") ? "cd.terminal.fatal" : "ep.terminal.fatal")), response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "record_terminal_fatal", exact_commit: operationalCommit("fatal_incident_recorded"), next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: "mutation_already_fatal", context: "run_mutation", state_profiles: ["cd.terminal.fatal", "ep.terminal.fatal"].map((cellId) => ({ state_profile_id: `fatal.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "checkpoint" } })), response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey }
    ];
  }
  const responses = [];
  if (errorCode === "IDEMPOTENCY_CONFLICT") responses.push({ response_variant_id: "pre_run_create", context: "pre_run", response_channel: "pre_run_error", reply_status: "protocol_error", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
  let profiles = V5_ACTIVE_FSM_CELL_IDS.map((cellId) => persistedProfile(cellId));
  let exactCommit = { kind: "none" };
  let failureRecordPolicy = "none";
  if (replyStatus === "fatal") {
    profiles = V5_ACTIVE_FSM_CELL_IDS.map((cellId) => persistedProfile(cellId, cellId.startsWith("cd.") ? "cd.terminal.fatal" : "ep.terminal.fatal"));
    exactCommit = operationalCommit("fatal_incident_recorded");
    failureRecordPolicy = "record_terminal_fatal";
  } else if (errorCode === "ORACLE_SEMANTICS_REQUIRED") {
    profiles = [persistedProfile("cd.active.case.drafts", "cd.active.case.behavior")];
    exactCommit = operationalCommit("oracle_work_rerouted");
  } else if (semanticCommitPolicy === "commit_artifact") {
    const requirementsError = ["AMBIGUITY_UNRESOLVED", "ENTITY_RESOLUTION_UNRESOLVED"].includes(errorCode);
    profiles = [persistedProfile(requirementsError ? "cd.active.requirements.review" : "cd.active.case.behavior", requirementsError ? "cd.active.requirements.resolve" : "cd.active.case.resolve")];
    exactCommit = artifactCommit(requirementsError ? "evidence_claims" : "behavior_views");
  } else if (semanticCommitPolicy === "preview_only") {
    profiles = [persistedProfile("cd.active.requirements.resolve", "cd.active.requirements.confirm")];
    exactCommit = operationalCommit("clarification_pending_created");
  }
  if (errorCode === "ACTION_NOT_ADVERTISED" || errorCode === "IDEMPOTENCY_CONFLICT") profiles = profiles.concat(["cd.terminal.finished", "cd.terminal.cancelled", "cd.terminal.fatal", "ep.terminal.finished", "ep.terminal.cancelled", "ep.terminal.fatal"].map((cellId) => ({ state_profile_id: `terminal.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "read_only_terminal_rejection", terminal_fsm_cell_id: cellId } })));
  responses.push({ response_variant_id: "run_mutation", context: "run_mutation", state_profiles: profiles, response_channel: "run_reply", reply_status: replyStatus, semantic_commit_policy: semanticCommitPolicy, failure_record_policy: failureRecordPolicy, exact_commit: exactCommit, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
  return responses;
}
function createPolicyRegistry(fsm) {
  const phaseLookup = /* @__PURE__ */ new Map();
  for (const [phase, errorCodes] of Object.entries(V5_ERROR_PHASES)) errorCodes.forEach((errorCode, index) => phaseLookup.set(errorCode, { phase, priority: index + 1 }));
  const errorRequirement = (errorCode) => {
    if (errorCode.includes("ATOMIC_OUTCOME") || errorCode.includes("SEMANTIC_REVIEW_CANDIDATE")) return "C01-atomicity";
    if (errorCode.includes("AMBIGUITY")) return "C02-ambiguity";
    if (errorCode.includes("ENTITY_RESOLUTION")) return "C03-entity";
    if (errorCode.includes("ANSWER_BINDING") || errorCode.includes("CONTROL_ORIGIN") || errorCode.includes("CLIENT_KEY")) return "C04-binding";
    if (errorCode.includes("ANSWER_NATURE") || errorCode.includes("TEMPORARY_BASIS")) return "C05-nature";
    if (errorCode.includes("QUESTION_PART")) return "C06-question-fsm";
    if (errorCode.includes("CLARIFICATION")) return "C07-impact";
    if (errorCode.includes("ORACLE")) return "C08-oracle";
    if (errorCode.includes("FIELD_CORRESPONDENCE")) return "C09-correspondence";
    if (errorCode.includes("VALUE_STATE")) return "C10-value-state";
    if (errorCode.includes("DOMAIN") || errorCode.includes("COMPLEMENT")) return "C11-complement";
    if (errorCode.includes("POPULATION")) return "C12-population";
    if (errorCode.includes("PERMISSION")) return "C13-permission";
    if (errorCode.includes("RISK_LEDGER")) return "C14-risk";
    if (errorCode.includes("PROVENANCE") || errorCode.includes("DOWNSTREAM")) return "C16-provenance";
    return "C15-protocol";
  };
  const runtimeRules = Object.entries(V5_ERROR_CATALOG).map(([errorCode, catalogRow]) => {
    const phase = phaseLookup.get(errorCode);
    const responses = createRuntimeResponses(errorCode, catalogRow);
    return {
      rule_id: `ERROR.${errorCode}`,
      owner: "compiler",
      enforcement: ["schema", "invariant", "fsm", "transaction"],
      applicability: [...new Set(responses.map((response) => response.context))].map((context) => context === "pre_run" ? { kind: "pre_run" } : { kind: context, stages: ["source_acquisition", "requirements_analysis", "case_design", "execution_closure", "final_confirmation", "delivery"] }),
      normative_refs: [`SPEC.ERROR.${errorCode}`],
      test_ids: [`F-${errorRequirement(errorCode)}.negative.rejection`],
      kind: "runtime_error",
      trigger_ref: `trigger.${errorCode.toLowerCase()}`,
      error_code: errorCode,
      validator_phase: phase.phase,
      validator_priority: phase.priority,
      schema_issue_matchers: phase.phase === "specialized_shape" ? [{ validation_surface: "advance_action", json_pointer_prefix: "/", keyword: "required" }] : [],
      responses
    };
  });
  const invariantFixture = (normativeRef) => {
    const match = /^SPEC\.FR(\d{3})$/u.exec(normativeRef);
    if (match) {
      const number = Number(match[1]);
      const slugs = ["atomicity", "ambiguity", "entity", "binding", "nature", "question-fsm", "impact", "oracle", "correspondence", "value-state", "complement", "population", "permission", "risk", "protocol", "provenance"];
      return `F-C${String(number).padStart(2, "0")}-${slugs[number - 1]}.positive.baseline`;
    }
    if (normativeRef === "SPEC.PROVENANCE" || normativeRef === "SPEC.OWNERSHIP") return "F-C16-provenance.positive.baseline";
    if (normativeRef === "SPEC.BEHAVIOR") return "F-C14-risk.positive.baseline";
    if (normativeRef === "SPEC.CLARIFICATION") return "F-C07-impact.positive.baseline";
    if (normativeRef === "SPEC.SEMANTIC.REVIEW") return "F-C01-atomicity.positive.baseline";
    if (normativeRef === "SPEC.RENDER") return "F-C08-oracle.positive.baseline";
    return "F-C15-protocol.positive.baseline";
  };
  const invariantRules = V5_INVARIANT_REFS.map((normativeRef) => ({
    rule_id: `INVARIANT.${normativeRef.slice(5)}`,
    owner: "compiler",
    enforcement: ["invariant", "ci"],
    applicability: [{ kind: "build" }, { kind: "ci" }, { kind: "release" }],
    normative_refs: [normativeRef],
    test_ids: [invariantFixture(normativeRef)],
    kind: "invariant",
    assertion_ref: normativeRef
  }));
  const acceptedClosureRules = [
    { target_kind: "accepted_artifact", target_selector: "all_except_applied_clarification_impact_and_rendered_output", diagnostic_code: "ACCEPTED_STATE_INTEGRITY_FAILURE" },
    { target_kind: "compiler_state", target_selector: "checkpoint_referenced_semantic_state_except_applied_clarification_impact", diagnostic_code: "ACCEPTED_STATE_INTEGRITY_FAILURE" },
    { target_kind: "compiler_projection", target_selector: "applied_clarification_impact", diagnostic_code: "CLARIFICATION_IMPACT_MISMATCH" },
    { target_kind: "renderer_output", target_selector: "json_or_markdown_or_csv", diagnostic_code: "CANONICAL_RENDER_MISMATCH" }
  ].sort((left, right) => left.target_kind.localeCompare(right.target_kind));
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    rules: [...invariantRules, ...runtimeRules].sort((left, right) => left.rule_id.localeCompare(right.rule_id)),
    accepted_closure_integrity_policy: {
      policy_version: 1,
      inspect_effect: "read_only_integrity_fatal",
      mutation_effect: "normal_fatal_reclassification",
      mutation_scope: "advance_new_idempotency_key_only",
      mutation_applicable_lifecycles: ["active", "finished", "cancelled"],
      already_fatal_effect: "read_only_integrity_fatal_no_commit",
      dispatch_position: "after_operational_chain_and_existing_key_resolution_before_terminal_guard",
      on_untrusted_operational_chain: "integrity_quarantine",
      target_rules: acceptedClosureRules
    },
    provenance_policy: createProvenancePolicy()
  }, "registry_digest");
}
function createNormativeRuleInventory(fsm, policy) {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    inventory_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    policy_registry_digest: policy.registry_digest,
    invariant_refs: [...V5_INVARIANT_REFS],
    runtime_error_refs: Object.keys(V5_ERROR_CATALOG).map((code) => `SPEC.ERROR.${code}`).sort()
  }, "inventory_digest");
}
function nextActionTemplates(fsm, cell) {
  const byId = new Map(fsm.action_templates.map((template) => [template.template_id, template]));
  return cell.allowed_action_template_ids.map((id) => {
    const template = byId.get(id);
    if (template.action_kind === "submit_artifact") return { kind: "submit_artifact", artifact_kind: template.artifact_kind };
    if (template.action_kind === "advance_execution_plan") return { kind: "advance_execution_plan", operation_kinds_source: "existing_closed_union" };
    return { kind: template.action_kind };
  }).sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
}
function replyContractId(value) {
  return `RPL.${value.toUpperCase().replaceAll(/[^A-Z0-9_.-]/gu, ".")}`;
}
function createFsmReplyRows(fsm) {
  const cells = new Map(fsm.cells.map((cell) => [cell.cell_id, cell]));
  return fsm.outcomes.map((outcome) => {
    const cell = cells.get(outcome.target_cell_id);
    return {
      reply_contract_id: replyContractId(`FSM.${outcome.outcome_id}`),
      source: { kind: "fsm_outcome", outcome_id: outcome.outcome_id },
      exact_projection_kind: "persisted_run_state",
      exact_lifecycle: cell.lifecycle,
      exact_stage: cell.stage,
      exact_obligation: cell.obligation,
      exact_last_verified_state: { kind: "absent" },
      exact_reply_status: cell.normal_reply_status,
      exact_work_packet: cell.lifecycle === "active" ? { kind: "nonterminal", packet_kind: cell.work_packet_kind } : { kind: "terminal", terminal_kind: cell.terminal_kind },
      exact_action_templates: nextActionTemplates(fsm, cell),
      exact_commit: outcome.commit_projection,
      exact_diagnostic: { kind: "none" }
    };
  });
}
function createErrorReplyRows(fsm, policy) {
  const cells = new Map(fsm.cells.map((cell) => [cell.cell_id, cell]));
  const rows = [];
  for (const rule of policy.rules.filter((candidate) => candidate.kind === "runtime_error")) {
    for (const response of rule.responses) {
      const profiles = response.state_profiles ?? [null];
      for (const profile of profiles) {
        const trigger = profile?.trigger_state;
        const projection = profile?.reply_projection;
        const projectedCellId = projection?.reply_fsm_cell_id ?? projection?.terminal_fsm_cell_id ?? trigger?.fsm_cell_id;
        const cell = projectedCellId ? cells.get(projectedCellId) : null;
        const projectionKind = response.context === "pre_run" ? "pre_run_error" : projection?.kind === "read_only_integrity_fatal" ? "read_only_integrity_fatal" : projection?.kind === "read_only_terminal_rejection" ? "read_only_terminal_rejection" : "persisted_run_state";
        const stateSuffix = profile ? `.${profile.state_profile_id}` : "";
        const source = response.context === "pre_run" ? { kind: "runtime_error", error_code: rule.error_code, response_context: "pre_run", response_variant_id: response.response_variant_id } : { kind: "runtime_error", error_code: rule.error_code, response_context: response.context, response_variant_id: response.response_variant_id, state_profile_id: profile.state_profile_id, trigger_state: trigger };
        rows.push({
          reply_contract_id: replyContractId(`ERROR.${rule.error_code}.${response.context}.${response.response_variant_id}${stateSuffix}`),
          source,
          exact_projection_kind: projectionKind,
          exact_lifecycle: response.context === "pre_run" ? "absent" : projectionKind === "read_only_integrity_fatal" ? "fatal" : cell.lifecycle,
          exact_stage: response.context === "pre_run" || projectionKind === "read_only_integrity_fatal" ? "absent" : cell.stage,
          exact_obligation: response.context === "pre_run" || projectionKind === "read_only_integrity_fatal" ? "absent" : cell.obligation,
          exact_last_verified_state: response.context === "pre_run" || projectionKind === "persisted_run_state" || projectionKind === "read_only_terminal_rejection" ? { kind: "absent" } : projection.last_verified_state_kind === "none" ? { kind: "none" } : { kind: "checkpoint", fsm_cell_id: trigger.fsm_cell_id },
          exact_reply_status: response.reply_status,
          exact_work_packet: response.context === "pre_run" ? { kind: "absent" } : projectionKind === "read_only_integrity_fatal" ? { kind: "terminal", terminal_kind: trigger?.delivery_intent === "execution_plan" || trigger?.fsm_cell_id?.startsWith("ep.") ? "execution_plan_fatal" : "case_document_fatal" } : cell.lifecycle === "active" ? { kind: "nonterminal", packet_kind: cell.work_packet_kind } : { kind: "terminal", terminal_kind: cell.terminal_kind },
          exact_action_templates: response.context === "pre_run" || projectionKind.startsWith("read_only") ? [] : nextActionTemplates(fsm, cell),
          exact_commit: response.exact_commit,
          exact_diagnostic: { kind: "one", error_code: rule.error_code }
        });
      }
    }
  }
  return rows;
}
function createInspectReplyRows(fsm) {
  return fsm.cells.map((cell) => ({
    reply_contract_id: replyContractId(`INSPECT.${cell.cell_id}`),
    source: { kind: "inspect_success", fsm_cell_id: cell.cell_id },
    exact_projection_kind: "persisted_run_state",
    exact_lifecycle: cell.lifecycle,
    exact_stage: cell.stage,
    exact_obligation: cell.obligation,
    exact_last_verified_state: { kind: "absent" },
    exact_reply_status: cell.normal_reply_status,
    exact_work_packet: cell.lifecycle === "active" ? { kind: "nonterminal", packet_kind: cell.work_packet_kind } : { kind: "terminal", terminal_kind: cell.terminal_kind },
    exact_action_templates: nextActionTemplates(fsm, cell),
    exact_commit: { kind: "none" },
    exact_diagnostic: { kind: "none" }
  }));
}
function createReplyContracts(fsm, policy) {
  const payload = {
    schema_version: V5_SCHEMA_VERSION,
    contract_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    policy_registry_digest: policy.registry_digest,
    error_codes: Object.keys(V5_ERROR_CATALOG).sort(),
    reply_branches: ["pre_run_error", "persisted_run_state", "read_only_integrity_fatal", "read_only_terminal_rejection"],
    reply_statuses: ["need_artifact", "need_revision", "need_user_answers", "clarification_confirmation_required", "ready", "finished", "cancelled", "protocol_error", "fatal"],
    work_packet_by_cell: Object.fromEntries(fsm.cells.map((cell) => [cell.cell_id, cell.work_packet_kind])),
    rows: [...createFsmReplyRows(fsm), ...createErrorReplyRows(fsm, policy), ...createInspectReplyRows(fsm)].sort((left, right) => left.reply_contract_id.localeCompare(right.reply_contract_id))
  };
  return attachDigest(payload, "rules_bundle_digest");
}
function generateV5Contracts() {
  const sourceAcquisitionPolicy = createSourceAcquisitionPolicy();
  const fsmRegistry = createFsmRegistry();
  const policyRegistry = createPolicyRegistry(fsmRegistry);
  const permissionDerivationRegistry = createPermissionDerivationRegistry();
  const answerConstraintRegistry = createAnswerConstraintRegistry();
  const clarificationControlRegistry = createClarificationControlRegistry();
  const stableIdPreimageRegistry = createStableIdRegistry();
  const storageLayoutRegistry = createStorageLayoutRegistry();
  const normativeRuleInventory = createNormativeRuleInventory(fsmRegistry, policyRegistry);
  const replyContracts = createReplyContracts(fsmRegistry, policyRegistry);
  const canonicalArrayManifest = createCanonicalArrayManifest();
  const contracts2 = { sourceAcquisitionPolicy, fsmRegistry, policyRegistry, permissionDerivationRegistry, answerConstraintRegistry, clarificationControlRegistry, stableIdPreimageRegistry, storageLayoutRegistry, normativeRuleInventory, replyContracts, canonicalArrayManifest };
  validateGeneratedV5Contracts(contracts2);
  return contracts2;
}

// src/v5/run-store.mjs
import { constants as fsConstants } from "node:fs";
import { lstat as lstat2, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path2 from "node:path";
import { randomUUID } from "node:crypto";

// src/v5/storage-paths.mjs
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
var RUN_ID_PATTERN = /^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u;
async function verifiedDirectory(submittedPath, label) {
  if (typeof submittedPath !== "string" || !path.isAbsolute(submittedPath)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", `${label} must be absolute.`);
  let entry;
  try {
    entry = await lstat(submittedPath);
  } catch {
    throw new V5ProtocolError("RUN_ARGUMENT_INVALID", `${label} does not exist.`);
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", `${label} must be a real directory.`);
  const canonical = await realpath(submittedPath);
  return canonical;
}
async function resolveCatalogLayout(catalogRoot) {
  const root = await verifiedDirectory(catalogRoot, "catalogRoot");
  return {
    root,
    catalogDirectory: path.join(root, "catalog"),
    currentPointer: path.join(root, "catalog", "current-transaction.json"),
    catalogTransactions: path.join(root, "catalog", "objects", "transactions"),
    catalogRunGenesisRecords: path.join(root, "catalog", "objects", "run-genesis-records"),
    catalogReplies: path.join(root, "catalog", "objects", "replies"),
    runsDirectory: path.join(root, "runs")
  };
}
async function resolveRunLayout(runDirectory) {
  const root = await verifiedDirectory(runDirectory, "runDirectory");
  const runId = path.basename(root);
  if (!RUN_ID_PATTERN.test(runId) || path.basename(path.dirname(root)) !== "runs") throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "runDirectory is not a canonical V5 run path.");
  const objects = path.join(root, "objects");
  return {
    root,
    runId,
    identity: path.join(root, "identity.json"),
    currentPointer: path.join(root, "current-transaction.json"),
    lockDirectory: path.join(root, ".v5-run.lock"),
    transactions: path.join(objects, "transactions"),
    receipts: path.join(objects, "receipts"),
    idempotencyIndexes: path.join(objects, "idempotency-indexes"),
    replies: path.join(objects, "replies"),
    checkpoints: path.join(objects, "checkpoints"),
    selectorSidecars: path.join(objects, "selector-sidecars"),
    genesisRecords: path.join(objects, "run-genesis-records"),
    acceptedArtifacts: path.join(objects, "accepted-artifacts"),
    compilerState: path.join(objects, "compiler-state"),
    renderedOutputs: path.join(objects, "rendered-outputs"),
    events: path.join(objects, "events"),
    incidents: path.join(objects, "incidents"),
    rawSourceBytes: path.join(objects, "raw-source-bytes"),
    staging: path.join(root, ".staging")
  };
}
function digestFilename(digestValue, extension = ".json") {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digestValue)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Object digest is malformed.");
  return `${digestValue.slice(7)}${extension}`;
}

// src/v5/run-store.mjs
async function ensureV5Directory(directory) {
  const absolute = path2.resolve(directory);
  const root = path2.parse(absolute).root;
  const relative = path2.relative(root, absolute);
  let current = root;
  for (const segment of relative.split(path2.sep).filter(Boolean)) {
    current = path2.join(current, segment);
    try {
      const entry = await lstat2(current);
      const systemTemporaryAlias = current === "/var" || current === "/tmp";
      if (!systemTemporaryAlias && entry.isSymbolicLink() || !entry.isSymbolicLink() && !entry.isDirectory()) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", `Unsafe storage directory: ${current}`);
    } catch (error) {
      if (error instanceof V5ProtocolError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await mkdir(current);
      else throw error;
    }
  }
}
async function writeAtomicFile(filePath, bytes) {
  await ensureV5Directory(path2.dirname(filePath));
  const temporaryPath = path2.join(path2.dirname(filePath), `.${path2.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`);
  const handle = await open(temporaryPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 384);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
  const directoryHandle = await open(path2.dirname(filePath), fsConstants.O_RDONLY);
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}
async function writeCasJson(directory, value) {
  await ensureV5Directory(directory);
  const bytes = Buffer.from(canonicalV5Stringify(value));
  const digestValue = rawBytesDigest(bytes);
  const filePath = path2.join(directory, digestFilename(digestValue));
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "CAS key collision or corrupted immutable object.");
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath };
}
async function writeSealedV5Record(directory, record, digestField) {
  const sealed = Object.hasOwn(record, digestField) ? verifyV5Record(record, digestField) : sealV5Record(record, digestField);
  const digestValue = (
    /** @type {string} */
    sealed[digestField]
  );
  const filePath = path2.join(directory, digestFilename(digestValue));
  const bytes = Buffer.from(canonicalV5Stringify(sealed));
  await ensureV5Directory(directory);
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Sealed record storage collision.");
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath, record: sealed };
}
async function writeSemanticV5Record(directory, record, semanticDigest) {
  const filePath = path2.join(directory, digestFilename(semanticDigest));
  const bytes = Buffer.from(canonicalV5Stringify(record));
  await ensureV5Directory(directory);
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Semantic record storage collision.");
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: semanticDigest, path: filePath, record };
}
async function readSemanticV5Record(directory, semanticDigest) {
  const filePath = path2.join(directory, digestFilename(semanticDigest));
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", `Semantic record ${semanticDigest} is unavailable.`);
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Semantic record is not valid JSON.");
  }
  if (canonicalV5Stringify(record) !== text) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Semantic record is not canonical JSON.");
  return record;
}
async function readCasJson(filePath, expectedDigest) {
  const bytes = await readFile(filePath);
  if (rawBytesDigest(bytes) !== expectedDigest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "CAS object bytes do not match their digest.");
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "CAS object is not valid JSON.");
  }
  if (canonicalV5Stringify(parsed) !== bytes.toString("utf8")) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "CAS object is not canonical JSON.");
  return parsed;
}
async function readSealedV5Record(directory, expectedDigest, digestField) {
  const filePath = path2.join(directory, digestFilename(expectedDigest));
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", `Sealed record ${expectedDigest} is unavailable.`);
  }
  verifyV5Record(parsed, digestField);
  if (parsed[digestField] !== expectedDigest || canonicalV5Stringify(parsed) !== await readFile(filePath, "utf8")) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Sealed record binding is invalid.");
  return parsed;
}
async function writeRawSourceBytes(directory, bytes) {
  await ensureV5Directory(directory);
  const digestValue = rawBytesDigest(bytes);
  const filePath = path2.join(directory, digestFilename(digestValue, ".bin"));
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Raw source CAS collision.");
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath };
}
async function readFixedSealedRecord(fixedPath, digestField) {
  let text;
  try {
    text = await readFile(fixedPath, "utf8");
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", `Required record ${path2.basename(fixedPath)} is unavailable.`);
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Fixed record is invalid JSON.");
  }
  verifyV5Record(record, digestField);
  if (canonicalV5Stringify(record) !== text) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Fixed record is not canonical JSON.");
  return { record, bytes: Buffer.from(text) };
}
async function publishFixedRecord(fixedPath, record, digestField, expectedBytes) {
  const sealed = Object.hasOwn(record, digestField) ? verifyV5Record(record, digestField) : sealV5Record(record, digestField);
  let current = null;
  try {
    current = await readFile(fixedPath);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (expectedBytes === null && current !== null || expectedBytes !== null && (current === null || !current.equals(expectedBytes))) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Fixed-record compare-and-swap failed.");
  await writeAtomicFile(fixedPath, Buffer.from(canonicalV5Stringify(sealed)));
  return sealed;
}
async function readVerifiedRun(runDirectory) {
  const layout = await resolveRunLayout(runDirectory);
  const identityFixed = await readFixedSealedRecord(layout.identity, "identity_digest");
  const pointerFixed = await readFixedSealedRecord(layout.currentPointer, "pointer_digest");
  const pointer = pointerFixed.record;
  if (pointer.run_id !== identityFixed.record.run_id) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run pointer identity binding is invalid.");
  const genesis = await readSealedV5Record(layout.genesisRecords, pointer.run_genesis_record_digest, "run_genesis_record_digest");
  const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, "transaction_digest");
  let chainCursor = transaction;
  let expectedSequence = transaction.transaction_sequence;
  while (chainCursor.previous_run_transaction_digest !== null) {
    const predecessor = await readSealedV5Record(layout.transactions, chainCursor.previous_run_transaction_digest, "transaction_digest");
    if (predecessor.run_id !== identityFixed.record.run_id || predecessor.transaction_sequence !== expectedSequence - 1) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run transaction chain is not contiguous.");
    chainCursor = predecessor;
    expectedSequence -= 1;
  }
  if (expectedSequence !== 0 || chainCursor.transaction_kind !== "genesis" || chainCursor.transaction_digest !== genesis.initial_run_transaction_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run transaction genesis binding is invalid.");
  const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, "checkpoint_digest");
  const selectorSidecar = await readSealedV5Record(layout.selectorSidecars, transaction.selector_sidecar_digest, "selector_sidecar_digest");
  const index = await readSealedV5Record(layout.idempotencyIndexes, transaction.idempotency_index_digest, "index_digest");
  const replyPath = path2.join(layout.replies, digestFilename(transaction.reply_object_digest));
  const reply = await readCasJson(replyPath, transaction.reply_object_digest);
  const receipt = transaction.receipt_digest === null ? null : await readSealedV5Record(layout.receipts, transaction.receipt_digest, "receipt_digest");
  let operationalEvent = null;
  if (transaction.operational_event_ref?.kind !== "none") {
    if (transaction.operational_event_ref?.kind !== "cancel_event" || typeof transaction.operational_event_ref.event_digest !== "string") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Operational event reference is invalid.");
    operationalEvent = await readSealedV5Record(layout.events, transaction.operational_event_ref.event_digest, "cancel_event_digest");
  }
  if (genesis.run_id !== identityFixed.record.run_id || genesis.identity_digest !== identityFixed.record.identity_digest || transaction.run_id !== identityFixed.record.run_id || checkpoint.run_id !== identityFixed.record.run_id || index.run_id !== identityFixed.record.run_id) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run object cross-binding is invalid.");
  if (selectorSidecar.checkpoint_digest !== checkpoint.checkpoint_digest || index.index_sequence !== transaction.transaction_sequence || index.entries.length !== transaction.transaction_sequence) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Checkpoint/sidecar/index sequence binding is invalid.");
  if (receipt && (receipt.reply_object_ref.reply_digest !== transaction.reply_object_digest || !index.entries.some((entry) => entry.receipt_digest === receipt.receipt_digest && entry.reply_digest === transaction.reply_object_digest))) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Receipt/index/reply binding is invalid.");
  if (operationalEvent && (checkpoint.cancel_event_digest !== operationalEvent.cancel_event_digest || receipt?.canonical_action_digest !== operationalEvent.canonical_cancel_action_digest || transaction.previous_run_transaction_digest !== operationalEvent.previous_run_transaction_digest)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Cancel event transaction binding is invalid.");
  for (const entry of index.entries) {
    const indexedReceipt = await readSealedV5Record(layout.receipts, entry.receipt_digest, "receipt_digest");
    if (indexedReceipt.run_id !== identityFixed.record.run_id || indexedReceipt.idempotency_key !== entry.idempotency_key || indexedReceipt.canonical_action_digest !== entry.canonical_action_digest || indexedReceipt.reply_object_ref.reply_digest !== entry.reply_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Indexed receipt binding is invalid.");
    await readCasJson(path2.join(layout.replies, digestFilename(entry.reply_digest)), entry.reply_digest);
  }
  return { layout, identity: identityFixed.record, pointer, pointerBytes: pointerFixed.bytes, genesis, transaction, checkpoint, selectorSidecar, index, receipt, operationalEvent, reply };
}
async function withV5RunLock(runDirectory, operation) {
  const layout = await resolveRunLayout(runDirectory);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await mkdir(layout.lockDirectory);
      try {
        return await operation();
      } finally {
        await rm(layout.lockDirectory, { recursive: true, force: true });
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Timed out acquiring V5 run lock.");
}

// src/v5/source-acquisition.mjs
import path3 from "node:path";

// src/v5/identity.mjs
import { createHash as createHash5 } from "node:crypto";
var rowsByKind = new Map(V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => [objectKind, { objectKind, prefix, projectionId }]));
var rowsByPrefix = new Map(V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => [prefix, { objectKind, prefix, projectionId }]));
var projectionFields = (
  /** @type {Record<string, string[]>} */
  V5_STABLE_PROJECTION_FIELDS
);
function sha256Hex(value) {
  return createHash5("sha256").update(canonicalV5Stringify(value)).digest("hex");
}
function stableV5Id(kindOrPrefix, semanticPreimage) {
  const row = rowsByKind.get(kindOrPrefix) ?? rowsByPrefix.get(kindOrPrefix);
  if (!row) throw new V5ProtocolError("CLIENT_KEY_INVALID", `Unknown V5 stable-ID namespace: ${kindOrPrefix}`);
  const fields = projectionFields[row.projectionId];
  const missing = fields.filter((field) => !Object.hasOwn(semanticPreimage, field));
  if (missing.length > 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", `Stable-ID projection ${row.projectionId} is missing ${missing.join(", ")}.`);
  const projection = Object.fromEntries(fields.map((field) => [field, semanticPreimage[field]]));
  const preimage = { profile_version: 1, object_kind: row.objectKind, projection: canonicalizeV5Value(projection) };
  return `${row.prefix}${sha256Hex(preimage)}`;
}

// src/v5/source-acquisition.mjs
var SOURCE_ROLES = /* @__PURE__ */ new Set(["primary_prd", "supplemental_requirement", "technical_contract", "reference"]);
var SOURCE_MEDIA_TYPES = /* @__PURE__ */ new Set(["text/plain", "text/markdown"]);
function scalarLength(value) {
  return Array.from(value).length;
}
function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function canonicalHttpsUrl(value) {
  if (!nonblank(value)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "URL source locator must be nonblank.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "URL source locator must be absolute.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "URL source locator must use HTTPS without credentials.");
  const match = /^(https):\/\/([^/?#]+)([\s\S]*)$/iu.exec(value);
  if (!match) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "URL source locator must be absolute HTTPS.");
  const authority = match[2];
  const suffix = match[3];
  const canonicalAuthority = authority.toLowerCase().replace(/:443$/u, "");
  return `https://${canonicalAuthority}${suffix}`;
}
function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys2(value, keys, code) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new V5ProtocolError(code, "Object does not match its closed contract.");
}
function validateLocator(locator) {
  if (!plainObject(locator) || typeof locator.kind !== "string") throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Source locator is invalid.");
  if (locator.kind === "inline_text") {
    exactKeys2(locator, ["kind", "media_type", "content"], "RUN_ARGUMENT_INVALID");
    if (!SOURCE_MEDIA_TYPES.has(locator.media_type) || !nonblank(locator.content)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Inline source locator is invalid.");
  } else if (locator.kind === "local_file") {
    exactKeys2(locator, ["kind", "absolute_path"], "RUN_ARGUMENT_INVALID");
    if (!nonblank(locator.absolute_path) || !path3.isAbsolute(locator.absolute_path) || locator.absolute_path.includes("\0")) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Local source locator must be absolute.");
  } else if (locator.kind === "https_url") {
    exactKeys2(locator, ["kind", "url"], "RUN_ARGUMENT_INVALID");
    return { kind: "https_url", url: canonicalHttpsUrl(locator.url) };
  } else if (locator.kind === "attachment") {
    exactKeys2(locator, ["kind", "attachment_ref"], "RUN_ARGUMENT_INVALID");
    if (!nonblank(locator.attachment_ref)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Attachment source locator is invalid.");
  } else throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Source locator kind is unsupported.");
  return structuredClone(locator);
}
function validateSourceBootstrap(bootstrap) {
  if (!plainObject(bootstrap)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "source_bootstrap is required.");
  exactKeys2(bootstrap, ["source_request_seeds"], "RUN_ARGUMENT_INVALID");
  if (!Array.isArray(bootstrap.source_request_seeds) || bootstrap.source_request_seeds.length === 0) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "source_bootstrap must contain at least one seed.");
  const clientKeys = /* @__PURE__ */ new Set();
  const semanticKeys = /* @__PURE__ */ new Set();
  const seeds = bootstrap.source_request_seeds.map((seed) => {
    if (!plainObject(seed)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Source request seed is invalid.");
    exactKeys2(seed, ["source_request_client_key", "source_role", "locator", "required"], "RUN_ARGUMENT_INVALID");
    if (typeof seed.source_request_client_key !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(seed.source_request_client_key) || clientKeys.has(seed.source_request_client_key) || !SOURCE_ROLES.has(seed.source_role) || typeof seed.required !== "boolean") throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Source request seed fields are invalid.");
    clientKeys.add(seed.source_request_client_key);
    const normalized = { source_request_client_key: seed.source_request_client_key, source_role: seed.source_role, locator: validateLocator(seed.locator), required: seed.required };
    const semanticKey = canonicalV5Stringify({ source_role: normalized.source_role, locator: normalized.locator, required: normalized.required });
    if (semanticKeys.has(semanticKey)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Source bootstrap contains a semantic duplicate.");
    semanticKeys.add(semanticKey);
    return normalized;
  });
  if (!seeds.some((seed) => seed.required)) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "At least one source request must be required.");
  return { source_request_seeds: seeds.sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))) };
}
function deriveSourceRequests(bootstrap) {
  return bootstrap.source_request_seeds.map((seed) => ({
    request_id: stableV5Id("source_request", seed),
    source_request_client_key: seed.source_request_client_key,
    source_role: seed.source_role,
    locator: structuredClone(seed.locator),
    required: seed.required
  })).sort((left, right) => Number(right.required) - Number(left.required) || left.request_id.localeCompare(right.request_id));
}
function currentSourceBatch(outstandingRequests) {
  return outstandingRequests.slice(0, 16).map((request) => structuredClone(request));
}
function applySourceBatch(advertisedRequests, action) {
  if (!Array.isArray(action.request_ids) || !Array.isArray(action.request_dispositions) || !plainObject(action.source_payload)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source batch action is incomplete.");
  const expectedIds = advertisedRequests.map((request) => request.request_id).sort();
  const submittedIds = [...action.request_ids];
  if (new Set(submittedIds).size !== submittedIds.length || canonicalV5Stringify(submittedIds.sort()) !== canonicalV5Stringify(expectedIds)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source batch must bind the complete advertised request set.");
  if (action.request_dispositions.length !== expectedIds.length) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source dispositions must cover every advertised request exactly once.");
  const requestById = new Map(advertisedRequests.map((request) => [request.request_id, request]));
  const dispositionIds = /* @__PURE__ */ new Set();
  const sourceClientKeys = [];
  const dispositions = action.request_dispositions.map((disposition) => {
    if (!plainObject(disposition) || typeof disposition.request_id !== "string" || dispositionIds.has(disposition.request_id) || !requestById.has(disposition.request_id)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source disposition request binding is invalid.");
    dispositionIds.add(disposition.request_id);
    if (disposition.outcome === "fulfilled") {
      exactKeys2(disposition, ["request_id", "outcome", "source_client_keys"], "SCHEMA_VALIDATION_FAILED");
      if (!Array.isArray(disposition.source_client_keys) || disposition.source_client_keys.length === 0 || new Set(disposition.source_client_keys).size !== disposition.source_client_keys.length || disposition.source_client_keys.some((key) => typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(key))) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Fulfilled source disposition is invalid.");
      sourceClientKeys.push(...disposition.source_client_keys);
    } else if (disposition.outcome === "skipped_optional") {
      exactKeys2(disposition, ["request_id", "outcome", "skip_reason"], "SCHEMA_VALIDATION_FAILED");
      if (requestById.get(disposition.request_id)?.required || !nonblank(disposition.skip_reason) || scalarLength(disposition.skip_reason.trim()) > 256) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Required source requests cannot be skipped and reasons must be 1..256 scalars.");
    } else throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source disposition outcome is invalid.");
    return structuredClone(disposition);
  }).sort((left, right) => left.request_id.localeCompare(right.request_id));
  if (sourceClientKeys.length === 0) {
    exactKeys2(action.source_payload, ["kind"], "SCHEMA_VALIDATION_FAILED");
    if (action.source_payload.kind !== "all_skipped_optional") throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "An all-skipped batch cannot carry a Source Pack.");
    return { dispositions, sourcePack: null };
  }
  exactKeys2(action.source_payload, ["kind", "source_pack"], "SCHEMA_VALIDATION_FAILED");
  if (action.source_payload.kind !== "fulfilled_sources" || !plainObject(action.source_payload.source_pack)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Fulfilled requests require one Source Pack.");
  exactKeys2(action.source_payload.source_pack, ["sources"], "SCHEMA_VALIDATION_FAILED");
  if (!Array.isArray(action.source_payload.source_pack.sources) || action.source_payload.source_pack.sources.length === 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source Pack must contain sources.");
  const sources = action.source_payload.source_pack.sources.map((source) => {
    if (!plainObject(source)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source Pack source is invalid.");
    exactKeys2(source, ["source_client_key", "media_type", "content"], "SCHEMA_VALIDATION_FAILED");
    if (typeof source.source_client_key !== "string" || !SOURCE_MEDIA_TYPES.has(source.media_type) || typeof source.content !== "string" || source.content.length === 0 || Buffer.byteLength(source.content, "utf8") > 1048576) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source Pack source fields are invalid.");
    return structuredClone(source);
  }).sort((left, right) => left.source_client_key.localeCompare(right.source_client_key));
  const suppliedKeys = sources.map((source) => source.source_client_key);
  if (new Set(suppliedKeys).size !== suppliedKeys.length || canonicalV5Stringify(suppliedKeys) !== canonicalV5Stringify([...new Set(sourceClientKeys)].sort())) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source Pack keys must equal fulfilled disposition bindings and contain no orphan object.");
  return { dispositions, sourcePack: { sources } };
}

// src/v5/semantic-rules.mjs
var RULE_KINDS = /* @__PURE__ */ new Set(["locator", "key_normalization", "transform", "value_normalization", "null_policy", "semantic_equivalence"]);
function createSemanticRuleIndex(semanticRootDigest, input) {
  const registered = [...input.registered_rules].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  const accepted = [...input.accepted_rule_contract_refs].sort((left, right) => left.contract_id.localeCompare(right.contract_id));
  if (registered.some((row) => !RULE_KINDS.has(row.rule_kind)) || new Set(registered.map((row) => row.rule_id)).size !== registered.length || new Set(accepted.map((row) => row.contract_id)).size !== accepted.length) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Semantic rule index contains duplicates or unknown kinds.");
  return sealV5Record({ semantic_root_digest: semanticRootDigest, registry_digest: input.registry_digest, registered_rules: registered, accepted_rule_contract_refs: accepted }, "index_digest");
}
function resolveSemanticRuleRef(ref, expectedKind, index) {
  if (!ref || typeof ref !== "object" || !RULE_KINDS.has(expectedKind)) throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", "Semantic rule reference is not typed.");
  const value = (
    /** @type {Record<string,any>} */
    ref
  );
  if (value.source === "closed_registry") {
    const row = (
      /** @type {Array<Record<string, any>>} */
      index.registered_rules.find((item) => item.rule_id === value.rule_id)
    );
    if (!row || value.registry_digest !== index.registry_digest || value.rule_kind !== expectedKind || canonicalV5Stringify(row) !== canonicalV5Stringify({ rule_id: value.rule_id, rule_kind: value.rule_kind, implementation_digest: value.implementation_digest })) throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", "Closed Registry rule reference does not resolve exactly.");
    return structuredClone(value);
  }
  if (value.source === "accepted_contract") {
    const row = (
      /** @type {Array<Record<string, any>>} */
      index.accepted_rule_contract_refs.find((item) => item.contract_id === value.ref?.contract_id)
    );
    if (!row || value.ref.contract_kind !== expectedKind || value.ref.semantic_root_digest !== index.semantic_root_digest || canonicalV5Stringify(row) !== canonicalV5Stringify(value.ref)) throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", "Accepted semantic rule reference does not resolve in the current root.");
    return structuredClone(value);
  }
  throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", "Bare semantic rule IDs are forbidden.");
}

// src/v5/behavior-contracts.mjs
function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function nonempty(value) {
  return Array.isArray(value) && value.length > 0;
}
function validateTypedValue(value) {
  if (!object(value) || typeof value.kind !== "string") return false;
  if (value.kind === "null" || value.kind === "empty_string") return exact(value, ["kind"]);
  if (value.kind === "string") return exact(value, ["kind", "value"]) && nonblank2(value.value);
  if (value.kind === "number") return exact(value, ["kind", "value"]) && typeof value.value === "number" && Number.isFinite(value.value);
  if (value.kind === "boolean") return exact(value, ["kind", "value"]) && typeof value.value === "boolean";
  return false;
}
function validateValueState(value) {
  const invalid = () => {
    throw new V5ProtocolError("VALUE_STATE_INVALID", "ValueState must use one closed data/render branch.");
  };
  if (!object(value)) return invalid();
  const validateData = (data) => object(data) && (data.presence === "missing" && exact(data, ["presence"]) || data.presence === "present" && exact(data, ["presence", "value"]) && validateTypedValue(data.value));
  const validateRender = (render) => object(render) && (render.presence === "not_rendered" && exact(render, ["presence"]) || render.presence === "rendered" && exact(render, ["presence", "content"]) && object(render.content) && (render.content.kind === "empty" && exact(render.content, ["kind"]) || render.content.kind === "text" && exact(render.content, ["kind", "value"]) && nonblank2(render.content.value) || render.content.kind === "formatted_value" && exact(render.content, ["kind", "value", "format_ref"]) && nonblank2(render.content.value) && nonblank2(render.content.format_ref)));
  if (value.axes === "data_only" && exact(value, ["axes", "data_state"]) && validateData(value.data_state)) return structuredClone(value);
  if (value.axes === "render_only" && exact(value, ["axes", "render_state"]) && validateRender(value.render_state)) return structuredClone(value);
  if (value.axes === "data_and_render" && exact(value, ["axes", "data_state", "render_state"]) && validateData(value.data_state) && validateRender(value.render_state)) return structuredClone(value);
  return invalid();
}
var RISK_KINDS = Object.freeze([
  "null_or_missing",
  "unknown_enum",
  "api_failure",
  "loading_failure",
  "sync_delay",
  "long_content",
  "pagination",
  "refresh",
  "business_permission_boundary"
]);
function riskTier(item) {
  const primaryGap = item.risk_disposition === "semantic_gap" && ["medium", "high"].includes(item.likelihood);
  const primaryFormal = item.risk_disposition === "formal_requirement" && ["high", "critical"].includes(item.severity) && ["medium", "high"].includes(item.likelihood);
  if (primaryGap || primaryFormal) return "primary";
  const atLeastMedium = (value) => ["medium", "high"].includes(value);
  if (item.risk_disposition !== "not_applicable" && nonblank2(item.recommended_action) && atLeastMedium(item.likelihood) && atLeastMedium(item.evidence_confidence) && atLeastMedium(item.testability)) return "recommended";
  return "background";
}
function validateRiskReviews(semanticRootDigest, moduleIds, reviews) {
  const expected = moduleIds.flatMap((moduleRef) => RISK_KINDS.map((riskKind) => `${moduleRef}\0${riskKind}`)).sort();
  const actual = reviews.map((review) => `${review.module_ref}\0${review.risk_kind}`).sort();
  if (new Set(actual).size !== actual.length || canonicalV5Stringify(actual) !== canonicalV5Stringify(expected)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk reviews must exactly cover module \xD7 nine-risk denominator.");
  const items = [];
  for (const review of reviews) {
    if (!nonblank2(review.review_client_key) || !nonempty(review.review_basis) || !RISK_KINDS.includes(review.risk_kind)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk review identity or basis is missing.");
    if (review.risk_signal_status === "no_signal") {
      if (Object.hasOwn(review, "risk_item")) throw new V5ProtocolError("RISK_LEDGER_INVALID", "no_signal review cannot carry a risk item.");
      continue;
    }
    const item = review.risk_item;
    if (review.risk_signal_status !== "signal_found" || !object(item) || !nonblank2(item.candidate_client_key) || !nonempty(item.trigger_basis) || !nonempty(item.affected_refs) || !nonblank2(item.why_material) || !nonblank2(item.recommended_action) || !["low", "medium", "high", "critical"].includes(item.severity) || !["low", "medium", "high"].includes(item.likelihood) || !["low", "medium", "high"].includes(item.evidence_confidence) || !["low", "medium", "high"].includes(item.testability)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Signal-found risk item is incomplete.");
    if (item.risk_disposition === "formal_requirement" && !nonblank2(item.formal_claim_id)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Formal risk needs a Claim.");
    if (item.risk_disposition === "semantic_gap" && !object(item.gap_ref)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk gap reference is missing.");
    if (item.risk_disposition === "exploratory" && !nonblank2(item.observation_intent)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Exploratory risk needs a nonblank observation intent.");
    if (item.risk_disposition === "not_applicable" && !nonempty(item.exclusion_basis)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "N/A risk needs E2/E3 exclusion basis.");
    if (!["formal_requirement", "semantic_gap", "exploratory", "not_applicable"].includes(item.risk_disposition)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk disposition is unknown.");
    const sourceReviewId = stableV5Id("risk_review", { input_semantic_root_digest: semanticRootDigest, module_ref: review.module_ref, risk_kind: review.risk_kind });
    items.push({
      risk_key: stableV5Id("derived_risk_ledger_item", { module_ref: review.module_ref, risk_kind: review.risk_kind, trigger_basis: item.trigger_basis, affected_refs: item.affected_refs }),
      module_ref: review.module_ref,
      risk_kind: review.risk_kind,
      display_tier: riskTier(item),
      source_review_ids: [sourceReviewId],
      affected_refs: [...new Set(item.affected_refs)].sort()
    });
  }
  return { semantic_root_digest: semanticRootDigest, reviewed_cell_count: expected.length, items: items.sort((left, right) => left.risk_key.localeCompare(right.risk_key)) };
}
function deriveBehaviorContractSeed(semanticRootDigest, input) {
  const requiredContracts = input.requirements.map((requirement) => {
    if (!["field_correspondence", "domain", "population", "oracle_semantics", "permission_auxiliary"].includes(requirement.contract_kind) || !nonblank2(requirement.subject_ref) || !nonblank2(requirement.intent_ref) || !nonempty(requirement.basis)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Behavior requirement needs a closed kind, subject, intent, and basis.");
    if (requirement.contract_kind === "population" && (!object(requirement.population_gap_catalog) || !Array.isArray(requirement.population_gap_catalog.scope_candidates) || !Array.isArray(requirement.population_gap_catalog.proof_candidates))) throw new V5ProtocolError("POPULATION_CONTRACT_REQUIRED", "Population candidate catalogs must exist even when empty.");
    const kindSpecificRequirement = Object.fromEntries(Object.entries(requirement).filter(([key]) => !["required_contract_key", "contract_kind", "subject_ref", "intent_ref", "basis"].includes(key)));
    return {
      ...structuredClone(requirement),
      required_contract_key: stableV5Id("behavior_required_contract", {
        input_semantic_root_digest: semanticRootDigest,
        contract_kind: requirement.contract_kind,
        subject_ref: requirement.subject_ref,
        intent_ref: requirement.intent_ref,
        basis: requirement.basis,
        kind_specific_requirement: kindSpecificRequirement
      })
    };
  }).sort((left, right) => left.required_contract_key.localeCompare(right.required_contract_key));
  if (new Set(requiredContracts.map((item) => item.required_contract_key)).size !== requiredContracts.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior requirement identities collide.");
  return sealV5Record({ semantic_root_digest: semanticRootDigest, semantic_rule_index: input.semanticRuleIndex, risk_review_module_ids: [...new Set(input.riskModuleIds)].sort(), required_contracts: requiredContracts }, "seed_digest");
}
function validateBehaviorContractReviews(seed, reviews, artifact) {
  const required = (
    /** @type {Array<Record<string,any>>} */
    seed.required_contracts
  );
  if (reviews.length !== required.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every behavior contract requirement must have exactly one disposition.");
  const requiredByKey = new Map(required.map((item) => [item.required_contract_key, item]));
  const seen = /* @__PURE__ */ new Set();
  const collectionByKind = (
    /** @type {Record<string, [string, string]>} */
    {
      field_correspondence: ["field_correspondences", "mapping_client_key"],
      domain: ["domain_contracts", "domain_client_key"],
      population: ["population_contracts", "population_contract_client_key"],
      oracle_semantics: ["oracle_semantic_contracts", "oracle_contract_client_key"],
      permission_auxiliary: ["permission_auxiliary_contracts", "contract_client_key"]
    }
  );
  for (const review of reviews) {
    const requirement = requiredByKey.get(review.required_contract_key);
    if (!requirement || review.seed_digest !== seed.seed_digest || seen.has(review.required_contract_key)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior review binds an unknown, duplicate, or stale requirement.");
    seen.add(review.required_contract_key);
    const disposition = review.disposition;
    if (disposition.kind === "formal") {
      if (!Array.isArray(disposition.contract_client_keys) || disposition.contract_client_keys.length === 0 || new Set(disposition.contract_client_keys).size !== disposition.contract_client_keys.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Formal behavior disposition must cite contracts.");
      const [collectionKey, clientKey] = collectionByKind[requirement.contract_kind];
      const available = new Set(
        /** @type {Array<Record<string,any>>} */
        (artifact[collectionKey] ?? []).map((item) => item[clientKey])
      );
      if (disposition.contract_client_keys.some((key) => !available.has(key))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Formal behavior disposition cites a missing or wrong-kind contract.");
      if (requirement.contract_kind === "permission_auxiliary" && disposition.contract_client_keys.length !== 1) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Permission auxiliary requirement resolves to exactly one contract.");
    } else if (disposition.kind === "semantic_gap") {
      if (!object(disposition.gap_ref)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Behavior gap disposition needs an exact gap reference.");
    } else if (disposition.kind === "not_applicable") {
      if (!nonempty(disposition.basis)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "N/A behavior disposition needs E2/E3 basis.");
    } else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior disposition kind is unknown.");
  }
  return structuredClone(reviews);
}

// src/v5/semantic-seed.mjs
var AMBIGUITY_TOKENS = Object.freeze([
  ["\u6B63\u5E38", "expected_outcome"],
  ["\u6B63\u786E", "expected_outcome"],
  ["\u5BF9\u5E94", "reference"],
  ["\u539F\u503C", "comparison"],
  ["\u6309\u539F\u503C", "comparison"],
  ["\u6240\u6709", "quantifier_scope"],
  ["\u5426\u5219", "condition"],
  ["\u5176\u4ED6", "complement"],
  ["\u53CA\u65F6", "timing"],
  ["\u5408\u7406", "other"],
  ["\u9ED8\u8BA4", "authority_source"]
]);
function digest2(value) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/semantic-slot", format_version: 1, value });
}
function span(text, start, end) {
  const excerpt = Array.from(text).slice(start, end).join("");
  return { start_scalar: start, end_scalar: end, excerpt, excerpt_digest: canonicalObjectDigest(excerpt) };
}
function nonblankLines(content) {
  const scalars = Array.from(content);
  const lines = [];
  let start = 0;
  for (let index = 0; index <= scalars.length; index += 1) {
    if (index !== scalars.length && scalars[index] !== "\n") continue;
    const raw = scalars.slice(start, index).join("");
    const leading = Array.from(raw).findIndex((character) => !/\s/u.test(character));
    if (leading >= 0) {
      const reversed = [...Array.from(raw)].reverse();
      const trailing = reversed.findIndex((character) => !/\s/u.test(character));
      lines.push({ text: Array.from(raw).slice(leading, Array.from(raw).length - trailing).join(""), start: start + leading, end: index - trailing });
    }
    start = index + 1;
  }
  return lines;
}
function observationPhrases(text) {
  const phrases = text.split(/[，,]\s*(?:并且|并|且|同时|以及)/u).map((value) => value.trim()).filter(Boolean);
  return phrases.length === 0 ? [text] : phrases;
}
function deriveSemanticReviewSeed(input) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.acceptedSourceStateDigest) || !Array.isArray(input.sourcePacks) || input.sourcePacks.length === 0) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Semantic seed requires a verified cumulative source context.");
  const normativeUnits = [];
  const ambiguityCandidates = [];
  const mentionCandidates = [];
  for (const pack of [...input.sourcePacks].sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest))) {
    for (const source of [...pack.payload.sources].sort((left, right) => left.source_object_digest.localeCompare(right.source_object_digest))) {
      const locatorId = `loc5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest }).slice(7)}`;
      for (const line of nonblankLines(source.content)) {
        const unitSpan = span(source.content, line.start, line.end);
        const unitId = `sunit5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest, source_span: unitSpan }).slice(7)}`;
        const observations = observationPhrases(line.text).map((phrase) => digest2(`observation:${phrase}`));
        const atomSignature = {
          subject_slot_digest: digest2(`subject:${line.text}`),
          condition_slot_digest: digest2(`condition:${line.text}`),
          action_slot_digest: digest2(`action:${line.text}`),
          primary_observation_slot_digest: observations[0],
          branch_slot_digest: digest2(`branch:${line.text}`)
        };
        const candidatePreimage = {
          accepted_source_state_digest: input.acceptedSourceStateDigest,
          locator_id: locatorId,
          source_span: unitSpan,
          atom_signature: atomSignature,
          required_observation_slot_digests: observations
        };
        const outcomeCandidate = {
          candidate_id: stableV5Id("outcome_candidate", candidatePreimage),
          locator_id: locatorId,
          source_span: unitSpan,
          compound_signal_codes: observations.length > 1 ? ["coordinated_observations"] : [],
          atom_signature: atomSignature,
          required_observation_slot_digests: observations
        };
        normativeUnits.push({ unit_id: unitId, locator_id: locatorId, unit_digest: canonicalObjectDigest({ locator_id: locatorId, source_span: unitSpan }), outcome_candidates: [outcomeCandidate] });
        for (const [token, ambiguityKind] of AMBIGUITY_TOKENS) {
          let offset = 0;
          while (true) {
            const relative = Array.from(line.text).slice(offset).join("").indexOf(token);
            if (relative < 0) break;
            const before = Array.from(Array.from(line.text).slice(offset).join("").slice(0, relative)).length;
            const tokenStart = line.start + offset + before;
            const tokenSpan = span(source.content, tokenStart, tokenStart + Array.from(token).length);
            const preimage = { accepted_source_state_digest: input.acceptedSourceStateDigest, locator_id: locatorId, source_span: tokenSpan, ambiguity_kind: ambiguityKind };
            ambiguityCandidates.push({ candidate_id: stableV5Id("ambiguity_candidate", preimage), locator_id: locatorId, source_span: tokenSpan, ambiguity_kind: ambiguityKind, detector_codes: [`bounded_vague_token:${token}`] });
            offset = tokenStart - line.start + Array.from(token).length;
          }
        }
        const quoted = /[“"`]([^”"`]+)[”"`]/gu;
        for (const match of line.text.matchAll(quoted)) {
          const observedName = match[1];
          const relativeStart = Array.from(line.text.slice(0, match.index)).length + 1;
          const mentionSpan = span(source.content, line.start + relativeStart, line.start + relativeStart + Array.from(observedName).length);
          const preimage = { accepted_source_state_digest: input.acceptedSourceStateDigest, locator_id: locatorId, source_span: mentionSpan, observed_name: observedName };
          mentionCandidates.push({ candidate_id: stableV5Id("entity_mention_candidate", preimage), conflict_group_id: "", locator_id: locatorId, source_span: mentionSpan, observed_name: observedName });
        }
      }
    }
  }
  if (normativeUnits.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every accepted normative source must expose a review unit.");
  const entityConflictGroups = [];
  if (mentionCandidates.length >= 2) {
    const mentionIds = mentionCandidates.map((candidate) => candidate.candidate_id).sort();
    const conflictGroupId = stableV5Id("entity_conflict_group", { mention_candidate_ids: mentionIds });
    for (const candidate of mentionCandidates) candidate.conflict_group_id = conflictGroupId;
    entityConflictGroups.push({ conflict_group_id: conflictGroupId, mention_candidate_ids: mentionIds });
  } else mentionCandidates.length = 0;
  const base = {
    accepted_source_state_digest: input.acceptedSourceStateDigest,
    normative_units: normativeUnits.sort((left, right) => left.unit_id.localeCompare(right.unit_id)),
    ambiguity_candidates: ambiguityCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    outcome_dedup_groups: [],
    entity_mention_candidates: mentionCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    entity_conflict_groups: entityConflictGroups,
    permission_scope_candidates: [],
    permission_scope_groups: [],
    permission_derivation_registry_digest: input.permissionDerivationRegistryDigest ?? `sha256:${"0".repeat(64)}`
  };
  return sealV5Record(base, "seed_digest");
}

// src/v5/semantic-reviews.mjs
function sameSet2(left, right) {
  return canonicalV5Stringify([...left].sort()) === canonicalV5Stringify([...right].sort());
}
function sharedSignatureMatches(claim, candidate) {
  for (const key of ["subject_slot_digest", "condition_slot_digest", "action_slot_digest", "branch_slot_digest"]) {
    if (claim.primary_outcome_signature?.[key] !== candidate.atom_signature[key]) return false;
  }
  return true;
}
function validateSemanticReviews(seed, artifact, context) {
  if (artifact.semantic_review_seed_digest !== seed.seed_digest) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Semantic review seed digest is stale.");
  const candidates = (
    /** @type {Array<Record<string, any>>} */
    seed.normative_units.flatMap((unit) => unit.outcome_candidates)
  );
  const decomposition = (
    /** @type {Array<Record<string, any>>} */
    artifact.decomposition_reviews ?? []
  );
  if (decomposition.length !== candidates.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every outcome candidate must be reviewed exactly once.");
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const claimByKey = new Map(
    /** @type {Array<Record<string, any>>} */
    (artifact.claims ?? []).map((claim) => [claim.claim_client_key, claim])
  );
  const seenCandidates = /* @__PURE__ */ new Set();
  for (const review of decomposition) {
    const candidate = candidateById.get(review.candidate_id);
    if (!candidate || review.seed_digest !== seed.seed_digest || seenCandidates.has(review.candidate_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Outcome review candidate binding is invalid.");
    seenCandidates.add(review.candidate_id);
    const disposition = review.disposition;
    if (disposition.kind === "single_claim") {
      const claim = claimByKey.get(disposition.claim_client_key);
      if (!claim || candidate.required_observation_slot_digests.length !== 1 || !sharedSignatureMatches(claim, candidate) || claim.primary_outcome_signature.primary_observation_slot_digest !== candidate.required_observation_slot_digests[0] || !sameSet2(claim.observation_slot_digests, candidate.required_observation_slot_digests)) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Single Claim does not close exactly one advertised observation slot.");
    } else if (disposition.kind === "split_claims") {
      if (!Array.isArray(disposition.claim_client_keys) || disposition.claim_client_keys.length < 2 || new Set(disposition.claim_client_keys).size !== disposition.claim_client_keys.length) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Composite outcome must split into unique Claims.");
      const primary = [];
      for (const key of disposition.claim_client_keys) {
        const claim = claimByKey.get(key);
        const primaryDigest = claim?.primary_outcome_signature?.primary_observation_slot_digest;
        if (!claim || !sharedSignatureMatches(claim, candidate) || !candidate.required_observation_slot_digests.includes(primaryDigest) || !sameSet2(claim.observation_slot_digests, [primaryDigest])) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Split Claim does not isolate one advertised observation slot.");
        primary.push(primaryDigest);
      }
      if (!sameSet2(primary, candidate.required_observation_slot_digests)) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Split Claims do not exactly cover the composite outcome.");
    } else if (disposition.kind === "semantic_gap") {
      if (!/** @type {Array<Record<string, any>>} */
      (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === disposition.semantic_gap_client_key && gap.target?.origin?.kind === "outcome_decomposition" && gap.target.origin.outcome_candidate_id === candidate.candidate_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Outcome semantic gap is not exact.");
    } else if (disposition.kind === "non_normative") {
      if (typeof disposition.reason !== "string" || disposition.reason.trim().length === 0 || typeof disposition.source_review_id !== "string" || disposition.source_review_id.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Non-normative disposition needs direct review basis.");
    } else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Outcome disposition kind is unknown.");
  }
  const ambiguities = (
    /** @type {Array<Record<string, any>>} */
    artifact.ambiguity_reviews ?? []
  );
  if (ambiguities.length !== seed.ambiguity_candidates.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every ambiguity candidate must be reviewed exactly once.");
  const ambiguityById = new Map(
    /** @type {Array<Record<string, any>>} */
    seed.ambiguity_candidates.map((candidate) => [candidate.candidate_id, candidate])
  );
  const ambiguitySeen = /* @__PURE__ */ new Set();
  for (const review of ambiguities) {
    const candidate = ambiguityById.get(review.candidate_id);
    if (!candidate || review.seed_digest !== seed.seed_digest || ambiguitySeen.has(review.candidate_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Ambiguity review binding is invalid.");
    ambiguitySeen.add(review.candidate_id);
    const disposition = review.disposition;
    if (disposition.kind === "resolved_by_claims" || disposition.kind === "not_ambiguous") {
      if (!Array.isArray(disposition.claim_client_keys) || disposition.claim_client_keys.length === 0 || /** @type {string[]} */
      disposition.claim_client_keys.some((key) => !claimByKey.has(key)) || disposition.kind === "not_ambiguous" && (typeof disposition.reason !== "string" || disposition.reason.trim().length === 0)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Ambiguity resolution Claim basis is missing.");
    } else if (disposition.kind === "resolved_by_decision") {
      if (!Array.isArray(disposition.decision_ids) || disposition.decision_ids.length === 0 || /** @type {string[]} */
      disposition.decision_ids.some((id) => !context.acceptedDecisionIds.includes(id))) throw new V5ProtocolError("AMBIGUITY_UNRESOLVED", "Ambiguity Decision basis is not accepted in the current lineage.");
    } else if (disposition.kind === "semantic_gap") {
      if (!/** @type {Array<Record<string, any>>} */
      (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === disposition.semantic_gap_client_key && gap.target?.origin?.kind === "ambiguity" && gap.target.origin.ambiguity_candidate_id === candidate.candidate_id && gap.target.origin.ambiguity_kind === candidate.ambiguity_kind)) throw new V5ProtocolError("AMBIGUITY_UNRESOLVED", "Ambiguity gap target is not exact.");
    } else throw new V5ProtocolError("AMBIGUITY_UNRESOLVED", "Ambiguity disposition kind is unknown.");
  }
  const groups = (
    /** @type {Array<Record<string, any>>} */
    seed.entity_conflict_groups ?? []
  );
  const entityReviews = (
    /** @type {Array<Record<string, any>>} */
    artifact.entity_resolutions ?? []
  );
  if (entityReviews.length !== groups.length) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Every entity conflict group must be reviewed.");
  const mentionsById = new Map(
    /** @type {Array<Record<string, any>>} */
    seed.entity_mention_candidates.map((mention) => [mention.candidate_id, mention])
  );
  const entityAggregates = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const review = entityReviews.find((item) => item.conflict_group_id === group.conflict_group_id);
    if (!review || review.seed_digest !== seed.seed_digest || !sameSet2(review.mention_candidate_ids, group.mention_candidate_ids)) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity group review set is incomplete.");
    if (review.resolution.kind === "unresolved") {
      if (!/** @type {Array<Record<string, any>>} */
      (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === review.resolution.semantic_gap_client_key && gap.target?.origin?.kind === "entity_resolution" && gap.target.origin.conflict_group_id === group.conflict_group_id && sameSet2(gap.target.origin.mention_candidate_ids, group.mention_candidate_ids))) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Unresolved entity group needs one exact gap.");
      continue;
    }
    if (review.resolution.kind !== "resolved_clusters" || !Array.isArray(review.resolution.clusters) || review.resolution.clusters.length === 0) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity resolution must be a nonempty cluster partition.");
    const covered = [];
    for (const cluster of review.resolution.clusters) {
      const basis = [.../** @type {string[]} */
      (cluster.basis_claim_client_keys ?? []).map((claimKey) => ({ kind: "claim", claim_id: claimKey })), .../** @type {string[]} */
      (cluster.basis_decision_ids ?? []).map((decisionId) => ({ kind: "decision", decision_id: decisionId }))];
      if (!cluster.entity_client_key || !cluster.canonical_name?.trim() || !Array.isArray(cluster.mentions) || cluster.mentions.length === 0 || basis.length === 0 || /** @type {string[]} */
      cluster.basis_claim_client_keys.some((key) => !claimByKey.has(key)) || /** @type {string[]} */
      cluster.basis_decision_ids.some((id) => !context.acceptedDecisionIds.includes(id))) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity cluster needs canonical identity and current evidence.");
      const canonicalMentions = (
        /** @type {Array<Record<string, any>>} */
        cluster.mentions.filter((entry) => ["canonical_business_name", "canonical_business_name_and_exact_ui_label"].includes(entry.name_role))
      );
      if (canonicalMentions.length !== 1 || mentionsById.get(canonicalMentions[0].mention_candidate_id)?.observed_name !== cluster.canonical_name) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity cluster must designate one exact canonical-name mention.");
      for (const entry of cluster.mentions) {
        if (!mentionsById.has(entry.mention_candidate_id) || !group.mention_candidate_ids.includes(entry.mention_candidate_id)) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity cluster contains an unknown mention.");
        covered.push(entry.mention_candidate_id);
      }
      const aggregate = entityAggregates.get(cluster.entity_client_key) ?? { canonical_name: cluster.canonical_name, mentions: [], basis: [] };
      if (aggregate.canonical_name !== cluster.canonical_name) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Reused entity client keys must preserve the canonical name.");
      aggregate.mentions.push(...cluster.mentions);
      aggregate.basis.push(...basis);
      entityAggregates.set(cluster.entity_client_key, aggregate);
    }
    if (!sameSet2(covered, group.mention_candidate_ids)) throw new V5ProtocolError("ENTITY_RESOLUTION_UNRESOLVED", "Entity clusters must exactly partition the conflict group.");
  }
  const termEntries = [...entityAggregates.values()].map((aggregate) => {
    const mentionIds = [...new Set(
      /** @type {Array<Record<string, any>>} */
      aggregate.mentions.map((entry) => entry.mention_candidate_id)
    )].sort();
    const basis = [...new Map(
      /** @type {Array<Record<string, any>>} */
      aggregate.basis.map((item) => [canonicalV5Stringify(item), item])
    ).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
    return {
      entity_id: stableV5Id("entity", { accepted_source_state_digest: seed.accepted_source_state_digest, canonical_name: aggregate.canonical_name, mention_candidate_ids: mentionIds, basis }),
      canonical_name: aggregate.canonical_name,
      alias_names: [...new Set(
        /** @type {Array<Record<string, any>>} */
        aggregate.mentions.filter((entry) => ["business_alias", "business_alias_and_exact_ui_label"].includes(entry.name_role)).map((entry) => mentionsById.get(entry.mention_candidate_id)?.observed_name).filter(Boolean)
      )].sort(),
      exact_ui_labels: [...new Set(
        /** @type {Array<Record<string, any>>} */
        aggregate.mentions.filter((entry) => entry.name_role.includes("exact_ui_label")).map((entry) => mentionsById.get(entry.mention_candidate_id)?.observed_name).filter(Boolean)
      )].sort(),
      mention_candidate_ids: mentionIds,
      basis
    };
  }).sort((left, right) => left.entity_id.localeCompare(right.entity_id));
  return { ...structuredClone(artifact), term_registry: sealV5Record({ semantic_root_digest: seed.seed_digest, entries: termEntries }, "registry_digest") };
}

// src/v5/transactions.mjs
import { lstat as lstat3, mkdir as mkdir2, readFile as readFile2 } from "node:fs/promises";
import path4 from "node:path";

// src/v5/runtime-services.mjs
import { createHash as createHash6, randomUUID as randomUUID2 } from "node:crypto";
var testProfile = null;
function runtimeV5Uuid() {
  if (!testProfile) return randomUUID2();
  const hex = createHash6("sha256").update(`${testProfile.seed}\0${testProfile.sequence += 1}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
function runtimeV5ActionKeyring() {
  if (testProfile) return { current: { key_id: "fixture-v1", key: createHash6("sha256").update(`generate-test-cases/v5/fixture-key\0${testProfile.seed}`).digest() }, retained: [] };
  const encoded = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY;
  const keyId = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID ?? "default";
  const key = typeof encoded === "string" ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
  return { current: { key_id: keyId, key }, retained: [] };
}
function currentV5TransactionServices() {
  return testProfile?.crashPoint ? { failAt: testProfile.crashPoint } : {};
}

// src/v5/transactions.mjs
function withoutDigest(value, digestField) {
  const { [digestField]: ignored, ...payload } = value;
  return payload;
}
function validateCheckpointIdentity(checkpoint, identity) {
  if (checkpoint.run_id !== identity.run_id || checkpoint.case_document_lineage_id !== identity.case_document_lineage_id || checkpoint.delivery_intent !== identity.delivery_intent || checkpoint.schema_version !== V5_SCHEMA_VERSION || checkpoint.compiler_version !== V5_COMPILER_VERSION) {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Checkpoint identity binding is invalid.");
  }
}
async function resolveCatalogIdempotency(catalogRoot, idempotencyKey, canonicalActionDigest) {
  const layout = await resolveCatalogLayout(catalogRoot);
  let pointer;
  try {
    pointer = await readFixedSealedRecord(layout.currentPointer, "pointer_digest");
  } catch (error) {
    if (error instanceof V5ProtocolError && error.message.includes("unavailable")) return null;
    throw error;
  }
  const transaction = await readSealedV5Record(layout.catalogTransactions, pointer.record.head_transaction_digest, "transaction_digest");
  const entry = transaction.entries.find((row) => row.idempotency_key === idempotencyKey);
  if (!entry) return { layout, pointer, transaction };
  if (entry.canonical_action_digest !== canonicalActionDigest) throw new V5ProtocolError("IDEMPOTENCY_CONFLICT", "Catalog idempotency key was used with a different create request.");
  const reply = await readCasJson(path4.join(layout.catalogReplies, digestFilename(entry.reply_digest)), entry.reply_digest);
  return { replay: true, runDirectory: path4.join(layout.runsDirectory, entry.run_id), reply };
}
async function commitCatalogGenesis(catalogRoot, input, services = currentV5TransactionServices()) {
  const existing = await resolveCatalogIdempotency(catalogRoot, input.idempotencyKey, input.canonicalActionDigest);
  if (existing?.replay) return { runDirectory: existing.runDirectory, reply: existing.reply, replayed: true };
  const catalog = await resolveCatalogLayout(catalogRoot);
  if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(input.identity.run_id) || input.identity.schema_version !== V5_SCHEMA_VERSION || input.identity.compiler_version !== V5_COMPILER_VERSION) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Run identity is invalid.");
  const runDirectory = path4.join(catalog.runsDirectory, input.identity.run_id);
  try {
    await lstat3(runDirectory);
    throw new V5ProtocolError("IDEMPOTENCY_CONFLICT", "Run directory already exists.");
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  await ensureV5Directory(catalog.catalogTransactions);
  await ensureV5Directory(catalog.catalogRunGenesisRecords);
  await ensureV5Directory(catalog.catalogReplies);
  await ensureV5Directory(catalog.runsDirectory);
  await mkdir2(runDirectory);
  const run = await resolveRunLayout(runDirectory);
  for (const directory of [run.transactions, run.receipts, run.idempotencyIndexes, run.replies, run.checkpoints, run.selectorSidecars, run.genesisRecords, run.acceptedArtifacts, run.compilerState, run.renderedOutputs, run.events, run.incidents, run.rawSourceBytes, run.staging]) await ensureV5Directory(directory);
  for (const item of input.compilerStateRecords ?? []) {
    if (item.semanticDigest) await writeSemanticV5Record(run.compilerState, item.record, item.semanticDigest);
    else if (item.digestField) await writeSealedV5Record(run.compilerState, item.record, item.digestField);
    else throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Compiler state record storage contract is missing.");
  }
  for (const item of input.acceptedArtifacts ?? []) await writeSealedV5Record(run.acceptedArtifacts, item.record, item.digestField);
  validateCheckpointIdentity(input.checkpoint, input.identity);
  const identity = sealV5Record(input.identity, "identity_digest");
  const checkpoint = await writeSealedV5Record(run.checkpoints, input.checkpoint, "checkpoint_digest");
  const sidecarPayload = Object.hasOwn(input.selectorSidecar, "selector_sidecar_digest") ? withoutDigest(input.selectorSidecar, "selector_sidecar_digest") : input.selectorSidecar;
  const sidecar = await writeSealedV5Record(run.selectorSidecars, { ...sidecarPayload, schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, checkpoint_digest: checkpoint.digest }, "selector_sidecar_digest");
  const reply = await writeCasJson(run.replies, input.reply);
  const index = await writeSealedV5Record(run.idempotencyIndexes, { kind: "operational_idempotency_index", schema_version: V5_SCHEMA_VERSION, scope: "run_normal", run_id: input.identity.run_id, index_sequence: 0, entries: [] }, "index_digest");
  const transaction = await writeSealedV5Record(run.transactions, {
    scope: { kind: "run", run_id: input.identity.run_id },
    run_id: input.identity.run_id,
    transaction_kind: "genesis",
    transaction_sequence: 0,
    previous_run_transaction_digest: null,
    operational_event_ref: { kind: "none" },
    checkpoint_digest: checkpoint.digest,
    selector_sidecar_digest: sidecar.digest,
    reply_object_digest: reply.digest,
    receipt_digest: null,
    idempotency_index_digest: index.digest
  }, "transaction_digest");
  const genesis = await writeSealedV5Record(run.genesisRecords, {
    kind: "catalog_run_genesis_record",
    schema_version: V5_SCHEMA_VERSION,
    run_id: input.identity.run_id,
    identity_digest: identity.identity_digest,
    initial_run_transaction_digest: transaction.digest
  }, "run_genesis_record_digest");
  await writeSealedV5Record(catalog.catalogRunGenesisRecords, genesis.record, "run_genesis_record_digest");
  await writeAtomicFile(run.identity, Buffer.from(canonicalV5Stringify(identity)));
  if (services.failAt === "after_run_transaction") throw new Error("INJECTED_CRASH: after_run_transaction");
  const pointer = await publishFixedRecord(run.currentPointer, { kind: "run_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, head_transaction_digest: transaction.digest }, "pointer_digest", null);
  if (services.failAt === "after_run_pointer") throw new Error("INJECTED_CRASH: after_run_pointer");
  const catalogReply = await writeCasJson(catalog.catalogReplies, input.reply);
  const priorEntries = existing?.transaction?.entries ?? [];
  const catalogTransaction = await writeSealedV5Record(catalog.catalogTransactions, {
    scope: { kind: "catalog" },
    transaction_kind: "catalog_create",
    transaction_sequence: (existing?.transaction?.transaction_sequence ?? -1) + 1,
    previous_catalog_transaction_digest: existing?.transaction?.transaction_digest ?? null,
    entries: [...priorEntries, { idempotency_key: input.idempotencyKey, canonical_action_digest: input.canonicalActionDigest, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, reply_digest: catalogReply.digest }].sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key))
  }, "transaction_digest");
  await publishFixedRecord(catalog.currentPointer, { kind: "catalog_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, scope: { kind: "catalog" }, head_transaction_digest: catalogTransaction.digest }, "pointer_digest", existing?.pointer?.bytes ?? null);
  return {
    runDirectory,
    reply: await readCasJson(path4.join(run.replies, digestFilename(reply.digest)), reply.digest),
    pointer,
    head: transaction.record,
    replayed: false
  };
}
async function commitNormalRunTransaction(runDirectory, request, nextState, services = currentV5TransactionServices()) {
  return withV5RunLock(runDirectory, async () => {
    const current = await readVerifiedRun(runDirectory);
    const canonicalActionDigest = actionDigestV5("advance", request.action);
    const existing = current.index.entries.find((entry) => entry.idempotency_key === request.idempotency_key);
    if (existing) {
      if (existing.canonical_action_digest !== canonicalActionDigest) throw new V5ProtocolError("IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different action.");
      return readCasJson(path4.join(current.layout.replies, digestFilename(existing.reply_digest)), existing.reply_digest);
    }
    validateCheckpointIdentity(nextState.checkpoint, current.identity);
    const semanticDelta = nextState.commitReceipt.semantic_revision_delta;
    if (![0, 1].includes(semanticDelta) || nextState.checkpoint.current_revision !== current.checkpoint.current_revision + semanticDelta) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Semantic revision delta does not match the committed checkpoint.");
    for (const item of nextState.acceptedArtifacts ?? []) await writeSealedV5Record(current.layout.acceptedArtifacts, item.record, item.digestField);
    for (const item of nextState.compilerStateRecords ?? []) {
      if (item.semanticDigest) await writeSemanticV5Record(current.layout.compilerState, item.record, item.semanticDigest);
      else if (item.digestField) await writeSealedV5Record(current.layout.compilerState, item.record, item.digestField);
      else throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Compiler state record storage contract is missing.");
    }
    for (const item of nextState.renderedOutputs ?? []) await writeSealedV5Record(current.layout.renderedOutputs, item.record, item.digestField);
    let operationalEventRef = { kind: "none" };
    if (nextState.operationalEvent) {
      const event = await writeSealedV5Record(current.layout.events, nextState.operationalEvent.record, nextState.operationalEvent.digestField);
      operationalEventRef = { kind: nextState.operationalEvent.refKind, event_digest: event.digest };
    }
    const checkpointPayload = Object.hasOwn(nextState.checkpoint, "checkpoint_digest") ? withoutDigest(nextState.checkpoint, "checkpoint_digest") : nextState.checkpoint;
    const checkpoint = await writeSealedV5Record(current.layout.checkpoints, checkpointPayload, "checkpoint_digest");
    const sidecarPayload = Object.hasOwn(nextState.selectorSidecar, "selector_sidecar_digest") ? withoutDigest(nextState.selectorSidecar, "selector_sidecar_digest") : nextState.selectorSidecar;
    const sidecar = await writeSealedV5Record(current.layout.selectorSidecars, { ...sidecarPayload, schema_version: V5_SCHEMA_VERSION, run_id: current.identity.run_id, checkpoint_digest: checkpoint.digest }, "selector_sidecar_digest");
    const reply = await writeCasJson(current.layout.replies, nextState.reply);
    const sequence = current.transaction.transaction_sequence + 1;
    const receipt = await writeSealedV5Record(current.layout.receipts, {
      kind: "v5_action_receipt",
      schema_version: V5_SCHEMA_VERSION,
      scope: "run_normal",
      run_id: current.identity.run_id,
      receipt_sequence: sequence,
      idempotency_key: request.idempotency_key,
      canonical_action_digest: canonicalActionDigest,
      reply_object_ref: { reply_digest: reply.digest },
      commit_receipt: { ...nextState.commitReceipt, committed_action_digest: canonicalActionDigest }
    }, "receipt_digest");
    const index = await writeSealedV5Record(current.layout.idempotencyIndexes, {
      kind: "operational_idempotency_index",
      schema_version: V5_SCHEMA_VERSION,
      scope: "run_normal",
      run_id: current.identity.run_id,
      index_sequence: sequence,
      entries: [...current.index.entries, { idempotency_key: request.idempotency_key, canonical_action_digest: canonicalActionDigest, receipt_digest: receipt.digest, reply_digest: reply.digest }].sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key))
    }, "index_digest");
    const transactionKind = (nextState.reply.reply_status ?? nextState.reply.status) === "fatal" ? "normal_fatal" : "normal";
    const transaction = await writeSealedV5Record(current.layout.transactions, {
      scope: { kind: "run", run_id: current.identity.run_id },
      run_id: current.identity.run_id,
      transaction_kind: transactionKind,
      transaction_sequence: sequence,
      previous_run_transaction_digest: current.transaction.transaction_digest,
      operational_event_ref: operationalEventRef,
      run_genesis_record_digest: current.genesis.run_genesis_record_digest,
      checkpoint_digest: checkpoint.digest,
      selector_sidecar_digest: sidecar.digest,
      reply_object_digest: reply.digest,
      receipt_digest: receipt.digest,
      idempotency_index_digest: index.digest
    }, "transaction_digest");
    if (services.failAt === "before_pointer_publish") throw new Error("INJECTED_CRASH: before_pointer_publish");
    await publishFixedRecord(current.layout.currentPointer, { kind: "run_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, run_id: current.identity.run_id, run_genesis_record_digest: current.genesis.run_genesis_record_digest, head_transaction_digest: transaction.digest }, "pointer_digest", current.pointerBytes);
    return readCasJson(path4.join(current.layout.replies, digestFilename(reply.digest)), reply.digest);
  });
}

// src/v5/resume.mjs
var CONFIRM_REWIND = Object.freeze({
  "cd.active.requirements.confirm": "cd.active.requirements.resolve",
  "cd.active.case.confirm": "cd.active.case.resolve"
});
function resumeTargetCell(priorCellId) {
  const target = (
    /** @type {Record<string,string>} */
    CONFIRM_REWIND[priorCellId] ?? priorCellId
  );
  const allowed = /* @__PURE__ */ new Set(["cd.active.source.provide", "cd.active.requirements.review", "cd.active.requirements.resolve", "cd.active.case.behavior", "cd.active.case.drafts", "cd.active.case.resolve", "ep.active.closure.resolve", "ep.active.final.confirm"]);
  if (!allowed.has(target)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Cancelled parent cell is not resumable.");
  return target;
}
function deriveResumeBase(priorCheckpoint) {
  if (!priorCheckpoint || typeof priorCheckpoint.checkpoint_digest !== "string") throw new V5ProtocolError("RESUME_PARENT_INVALID", "Parent checkpoint is unavailable.");
  if (priorCheckpoint.delivery_intent === "execution_plan") {
    if (!priorCheckpoint.case_document_ref || typeof priorCheckpoint.execution_snapshot_digest !== "string" || !Array.isArray(priorCheckpoint.accepted_execution_receipt_digests)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Execution resume closure is incomplete.");
    return { kind: "execution_checkpoint", parent_checkpoint_digest: priorCheckpoint.checkpoint_digest, case_document_ref: structuredClone(priorCheckpoint.case_document_ref), execution_snapshot_digest: priorCheckpoint.execution_snapshot_digest, accepted_execution_receipt_digests: [...priorCheckpoint.accepted_execution_receipt_digests].sort() };
  }
  if (typeof priorCheckpoint.semantic_root_digest === "string") return { kind: "case_semantic_checkpoint", parent_checkpoint_digest: priorCheckpoint.checkpoint_digest, semantic_root_digest: priorCheckpoint.semantic_root_digest, accepted_artifact_digests: [...priorCheckpoint.accepted_artifact_digests ?? []].sort() };
  if (typeof priorCheckpoint.source_acquisition_state_digest !== "string") throw new V5ProtocolError("RESUME_PARENT_INVALID", "Source resume closure is incomplete.");
  return {
    kind: "source_checkpoint",
    parent_checkpoint_digest: priorCheckpoint.checkpoint_digest,
    source_acquisition_state_digest: priorCheckpoint.source_acquisition_state_digest,
    accepted_source_state: priorCheckpoint.accepted_source_state_digest == null ? { kind: "none" } : { kind: "accepted", accepted_source_state_digest: priorCheckpoint.accepted_source_state_digest }
  };
}
function validateResumeParent(input) {
  if (input.identity?.schema_version !== "5.0.0") throw new V5ProtocolError("UNSUPPORTED_SCHEMA_VERSION", "Only V5 parents may be resumed.");
  const terminal = input.terminalCheckpoint;
  if (!terminal || terminal.run_lifecycle !== "cancelled" || terminal.cancel_event_digest !== input.cancelEvent?.cancel_event_digest || terminal.prior_fsm_cell_id !== input.priorCheckpoint?.fsm_cell_id || terminal.terminal_fsm_cell_id !== terminal.fsm_cell_id) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Parent is not a verified cancelled run.");
  verifyV5CancelEvent(input.cancelEvent, { identity: input.identity, priorCheckpoint: input.priorCheckpoint, previousTransactionDigest: input.previousTransactionDigest, canonicalCancelActionDigest: input.canonicalCancelActionDigest, terminalFsmCellId: terminal.fsm_cell_id });
  resumeTargetCell(input.priorCheckpoint.fsm_cell_id);
  deriveResumeBase(input.priorCheckpoint);
  return true;
}
function createResumeInheritanceProjection(input) {
  if (!["artifact", "existing_execution_receipt"].includes(input.inheritedObject?.kind)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Inherited object kind is invalid.");
  return sealV5Record({
    kind: "resume_inheritance",
    parent_run_id: input.parentRunId,
    child_run_id: input.childRunId,
    parent_checkpoint_digest: input.parentCheckpointDigest,
    parent_cancel_event_digest: input.parentCancelEventDigest,
    case_document_lineage_id: input.caseDocumentLineageId,
    inherited_object: structuredClone(input.inheritedObject)
  }, "projection_record_digest");
}
function projectInheritedArtifact(parentEnvelope, projection, childIdentity, digestReplacements = /* @__PURE__ */ new Map()) {
  if (projection.inherited_object?.kind !== "artifact" || projection.parent_run_id !== parentEnvelope.producer_run_id || projection.child_run_id !== childIdentity.run_id || projection.case_document_lineage_id !== childIdentity.case_document_lineage_id || projection.inherited_object.parent_artifact_digest !== parentEnvelope.envelope_digest || projection.inherited_object.artifact_kind !== parentEnvelope.artifact_kind || projection.inherited_object.canonical_payload_digest !== parentEnvelope.canonical_payload_digest) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Artifact inheritance projection is not cross-bound.");
  const base = {
    kind: "accepted_artifact_envelope",
    artifact_kind: parentEnvelope.artifact_kind,
    schema_version: "5.0.0",
    compiler_version: "0.6.0",
    payload_producer: "agent",
    envelope_producer: "compiler",
    producer_stage: parentEnvelope.producer_stage ?? "source_acquisition",
    producer_run_id: childIdentity.run_id,
    case_document_lineage_id: childIdentity.case_document_lineage_id,
    accepted_revision: 0,
    input_digests: [...new Set((parentEnvelope.input_digests ?? []).map((digest4) => digestReplacements.get(digest4) ?? digest4))].sort(),
    canonical_payload_digest: parentEnvelope.canonical_payload_digest,
    payload: structuredClone(parentEnvelope.payload),
    resume_inheritance: { kind: "resume_inheritance", projection_record_digest: projection.projection_record_digest }
  };
  return { ...base, envelope_digest: canonicalObjectDigest(base) };
}

// src/v5/execution-wrapper.mjs
var V5_EXECUTION_OPERATION_KINDS = Object.freeze(["confirm_execution_plan", "pause_execution", "provide_capability_proof", "set_execution_disposition"]);
var DIGEST2 = /^sha256:[0-9a-f]{64}$/u;
function object2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact2(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank3(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateImmutableV5CaseDocumentRef(value) {
  if (!object2(value) || !exact2(value, ["run_id", "revision", "manifest_digest", "bundle_digest", "case_document_lineage_id", "schema_version"]) || value.schema_version !== "5.0.0" || !nonblank3(value.run_id) || !nonblank3(value.case_document_lineage_id) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !DIGEST2.test(value.manifest_digest) || !DIGEST2.test(value.bundle_digest)) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Immutable V5 Case Document reference is invalid.");
  return structuredClone(value);
}
function createV5ExecutionProjection(plan) {
  validateImmutableV5CaseDocumentRef(plan?.case_document_ref);
  if (!object2(plan) || !exact2(plan, ["schema_version", "compiler_version", "delivery_intent", "case_document_ref", "operation_kinds", "items", "plan_digest"]) || plan.schema_version !== "5.0.0" || plan.compiler_version !== "0.6.0" || plan.delivery_intent !== "execution_plan" || !Array.isArray(plan.operation_kinds) || JSON.stringify([...plan.operation_kinds].sort()) !== JSON.stringify(V5_EXECUTION_OPERATION_KINDS) || !Array.isArray(plan.items)) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Compatibility Execution Plan is invalid.");
  const { plan_digest: declaredPlanDigest, ...planPayload } = plan;
  if (!DIGEST2.test(declaredPlanDigest) || canonicalObjectDigest(planPayload) !== declaredPlanDigest) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Compatibility Execution Plan digest is invalid.");
  const payload = {
    kind: "v5_execution_projection",
    schema_version: "5.0.0",
    compiler_version: "0.6.0",
    case_document_ref: structuredClone(plan.case_document_ref),
    plan_digest: plan.plan_digest,
    operation_kinds: [...V5_EXECUTION_OPERATION_KINDS],
    items: structuredClone(plan.items),
    capability_receipts: [],
    paused: false,
    confirmed: false
  };
  return { ...payload, execution_snapshot_digest: canonicalObjectDigest(payload) };
}
function canonicalExistingExecutionReceiptPayloadDigest(receipt) {
  if (!object2(receipt) || !nonblank3(receipt.kind) || !DIGEST2.test(receipt.receipt_digest)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Existing execution receipt is not in the closed receipt union.");
  const { receipt_digest: declared, ...payload } = receipt;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Existing execution receipt digest is invalid.");
  return declared;
}
function projectInheritedExecutionReceipt(receipt, inheritance, childIdentity) {
  const canonicalReceiptPayloadDigest = canonicalExistingExecutionReceiptPayloadDigest(receipt);
  if (inheritance?.inherited_object?.kind !== "existing_execution_receipt" || inheritance.inherited_object.parent_receipt_digest !== receipt.receipt_digest || inheritance.inherited_object.receipt_kind !== receipt.kind || inheritance.inherited_object.canonical_receipt_payload_digest !== canonicalReceiptPayloadDigest || inheritance.child_run_id !== childIdentity.run_id || inheritance.case_document_lineage_id !== childIdentity.case_document_lineage_id) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Execution receipt inheritance projection is not cross-bound.");
  return {
    receipt: structuredClone(receipt),
    producer_run_id: childIdentity.run_id,
    revision: 0,
    case_document_lineage_id: childIdentity.case_document_lineage_id,
    canonical_receipt_payload_digest: canonicalReceiptPayloadDigest,
    resume_inheritance: { kind: "resume_inheritance", projection_record_digest: inheritance.projection_record_digest }
  };
}
function reseal(projection) {
  const { execution_snapshot_digest: ignored, ...payload } = projection;
  return { ...payload, execution_snapshot_digest: canonicalObjectDigest(payload) };
}
async function advanceV5ExecutionProjection(projection, operation, services = {}) {
  if (!object2(operation) || !V5_EXECUTION_OPERATION_KINDS.includes(operation.kind) || projection?.kind !== "v5_execution_projection" || projection.confirmed === true) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution operation is not advertised.");
  const next = structuredClone(projection);
  let receipt = null;
  if (operation.kind === "set_execution_disposition") {
    if (!exact2(operation, ["kind", "case_id", "disposition"]) || !["execute", "do_not_execute"].includes(operation.disposition)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Execution disposition operation is invalid.");
    const item = next.items.find((candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution disposition target is not advertised.");
    item.execution_disposition = operation.disposition;
    next.paused = false;
  } else if (operation.kind === "provide_capability_proof") {
    if (!exact2(operation, ["kind", "case_id", "proof"]) || typeof services.verifyCapabilityProof !== "function") throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof requires the registered external verifier.");
    const item = next.items.find((candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof target is not advertised.");
    const verified = await services.verifyCapabilityProof({ case_document_ref: structuredClone(next.case_document_ref), case_id: operation.case_id, proof: structuredClone(operation.proof) });
    if (verified?.verified !== true || typeof verified.ready !== "boolean" || !object2(verified.receipt)) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof was not independently verified.");
    receipt = structuredClone(verified.receipt);
    next.capability_receipts.push(receipt);
    item.capability_ready = verified.ready;
    next.paused = false;
  } else if (operation.kind === "pause_execution") {
    if (!exact2(operation, ["kind"])) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Pause operation is invalid.");
    next.paused = true;
  } else {
    if (!exact2(operation, ["kind"])) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Confirmation operation is invalid.");
    if (!next.items.every((item) => item.execution_disposition !== "pending")) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution Plan cannot be confirmed while dispositions are pending.");
    next.confirmed = true;
    next.paused = false;
  }
  const sealed = reseal(next);
  const closureComplete = sealed.items.every((item) => item.execution_disposition !== "pending");
  const resultKey = operation.kind === "provide_capability_proof" || operation.kind === "set_execution_disposition" ? `${operation.kind}:${closureComplete ? "closure_complete" : "closure_open"}` : operation.kind;
  return { projection: sealed, result_key: resultKey, ...receipt ? { receipt } : {} };
}

// src/v5/question-parts.mjs
var ACTIONABLE_STATES = /* @__PURE__ */ new Set(["presented", "deferred_by_user", "unknown_by_user"]);
var ALL_STATES = /* @__PURE__ */ new Set([...ACTIONABLE_STATES, "resolved_final", "resolved_temporary", "closed_for_delivery", "obsolete"]);
var EDGES = (
  /** @type {Readonly<Record<string,ReadonlySet<string>>>} */
  Object.freeze({
    presented: /* @__PURE__ */ new Set(["resolved_final", "resolved_temporary", "deferred_by_user", "unknown_by_user", "closed_for_delivery", "obsolete"]),
    deferred_by_user: /* @__PURE__ */ new Set(["resolved_final", "resolved_temporary", "closed_for_delivery", "obsolete"]),
    unknown_by_user: /* @__PURE__ */ new Set(["resolved_final", "resolved_temporary", "closed_for_delivery", "obsolete"]),
    resolved_final: /* @__PURE__ */ new Set(["obsolete"]),
    resolved_temporary: /* @__PURE__ */ new Set(["obsolete"]),
    closed_for_delivery: /* @__PURE__ */ new Set(["obsolete"]),
    obsolete: /* @__PURE__ */ new Set()
  })
);
function object3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact3(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank4(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function digest3(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function questionAnswerContractDigest(contract) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/question-answer-contract", format_version: 1, contract });
}
function clarificationPresentationDigest(presentationWithoutDigest) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/clarification-presentation", format_version: 1, presentation: presentationWithoutDigest });
}
function sealStateRecord(record) {
  return { ...record, state_record_digest: canonicalObjectDigest(record) };
}
function createQuestionPartStateSet(caseDocumentLineageId, semanticRootDigest, gaps) {
  if (!nonblank4(caseDocumentLineageId) || !digest3(semanticRootDigest) || !Array.isArray(gaps)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part inventory identity is invalid.");
  const parts = (
    /** @type {Array<Record<string,any>>} */
    gaps.map((gap) => {
      const binding = gap.gap_binding;
      if (!object3(binding) || !["requirements_gap", "behavior_gap"].includes(binding.kind) || !nonblank4(binding.gap_id) || !digest3(binding.gap_payload_digest) || !object3(gap.answer_contract)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part gap or answer contract is invalid.");
      const answerContractDigest = questionAnswerContractDigest(gap.answer_contract);
      return sealStateRecord({
        kind: "question_part_state",
        question_part_id: stableV5Id("question_part", {
          case_document_lineage_id: caseDocumentLineageId,
          gap_kind: binding.kind,
          gap_id: binding.gap_id,
          gap_payload_digest: binding.gap_payload_digest,
          initial_semantic_root_digest: semanticRootDigest,
          answer_contract_digest: answerContractDigest
        }),
        case_document_lineage_id: caseDocumentLineageId,
        gap_binding: structuredClone(binding),
        initial_semantic_root_digest: semanticRootDigest,
        answer_contract_digest: answerContractDigest,
        current_state: "presented",
        transition_history: []
      });
    }).sort((left, right) => left.question_part_id.localeCompare(right.question_part_id))
  );
  if (new Set(parts.map((part) => part.question_part_id)).size !== parts.length) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part gaps must be unique.");
  const payload = { kind: "question_part_state_set", case_document_lineage_id: caseDocumentLineageId, current_semantic_root_digest: semanticRootDigest, parts };
  return { ...payload, state_set_digest: canonicalObjectDigest(payload) };
}
function validateQuestionPartStateSet(stateSet) {
  const fail = (message) => {
    throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", message);
  };
  if (!object3(stateSet) || !exact3(stateSet, ["kind", "case_document_lineage_id", "current_semantic_root_digest", "parts", "state_set_digest"]) || stateSet.kind !== "question_part_state_set" || !nonblank4(stateSet.case_document_lineage_id) || !digest3(stateSet.current_semantic_root_digest) || !Array.isArray(stateSet.parts)) return fail("Question Part state set shape is invalid.");
  const { state_set_digest: ignored, ...statePayload } = stateSet;
  if (canonicalObjectDigest(statePayload) !== stateSet.state_set_digest) return fail("Question Part state-set digest is invalid.");
  const sorted2 = [...stateSet.parts].sort((left, right) => left.question_part_id.localeCompare(right.question_part_id));
  if (canonicalV5Stringify(sorted2.map((part) => part.question_part_id)) !== canonicalV5Stringify(stateSet.parts.map((part) => part.question_part_id)) || new Set(sorted2.map((part) => part.question_part_id)).size !== sorted2.length) return fail("Question Parts must be a sorted unique set.");
  for (const part of sorted2) {
    if (!exact3(part, ["kind", "question_part_id", "case_document_lineage_id", "gap_binding", "initial_semantic_root_digest", "answer_contract_digest", "current_state", "transition_history", "state_record_digest"]) || part.kind !== "question_part_state" || part.case_document_lineage_id !== stateSet.case_document_lineage_id || !/^qpt5_[0-9a-f]{64}$/u.test(part.question_part_id) || !digest3(part.answer_contract_digest) || !ALL_STATES.has(part.current_state) || !Array.isArray(part.transition_history)) return fail("Question Part state-record shape is invalid.");
    const { state_record_digest: ignoredRecord, ...recordPayload } = part;
    if (canonicalObjectDigest(recordPayload) !== part.state_record_digest) return fail("Question Part state-record digest is invalid.");
    let previous = "presented";
    for (let index = 0; index < part.transition_history.length; index += 1) {
      const transition = part.transition_history[index];
      if (!object3(transition) || transition.transition_sequence !== index + 1 || transition.from_state !== previous || !EDGES[previous]?.has(transition.to_state)) return fail("Question Part transition history is discontinuous or illegal.");
      const { transition_digest: ignoredTransition, ...transitionPayload } = transition;
      if (canonicalObjectDigest(transitionPayload) !== transition.transition_digest) return fail("Question Part transition digest is invalid.");
      if (transition.cause?.kind === "answer" && !["E3", "E1"].includes(transition.cause.evidence_level)) return fail("Answer transition evidence level is invalid.");
      if (transition.cause?.kind === "control" && !["defer", "unknown", "close_for_delivery"].includes(transition.cause.action)) return fail("Control transition action is invalid.");
      if (transition.cause?.kind === "compiler_obsolescence" && transition.to_state !== "obsolete") return fail("Compiler obsolescence must transition to obsolete.");
      if (!["answer", "control", "compiler_obsolescence"].includes(transition.cause?.kind)) return fail("Question Part transition cause is invalid.");
      previous = transition.to_state;
    }
    if (part.current_state !== previous) return fail("Question Part current state does not match transition history.");
  }
  return structuredClone(stateSet);
}
function createClarificationPresentation(stateSet, sourceRevision, gaps) {
  validateQuestionPartStateSet(stateSet);
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Presentation source revision is invalid.");
  const gapByBinding = new Map(gaps.map((gap) => [`${gap.gap_binding.kind}\0${gap.gap_binding.gap_id}`, gap]));
  const active = (
    /** @type {Array<Record<string,any>>} */
    stateSet.parts.filter((part) => ACTIONABLE_STATES.has(part.current_state))
  );
  if (active.length > 999999) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Presentation exceeds the Q token namespace.");
  const parts = active.map((part, index) => {
    const gap = gapByBinding.get(`${part.gap_binding.kind}\0${part.gap_binding.gap_id}`);
    if (!gap || questionAnswerContractDigest(gap.answer_contract) !== part.answer_contract_digest) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Presentation gap inventory is stale or incomplete.");
    const controls = part.current_state === "presented" ? gap.answer_contract.allowed_controls : gap.answer_contract.allowed_controls.filter((control) => control === "answer" || control === "close_for_delivery");
    if (!Array.isArray(controls) || controls.length === 0) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part has no currently allowed control.");
    return {
      question_part_id: part.question_part_id,
      display_token: `Q${String(index + 1).padStart(3, "0")}`,
      question_state: part.current_state,
      current_allowed_controls: [...controls],
      question: gap.question,
      why_needed: gap.why_needed,
      answer_contract: structuredClone(gap.answer_contract),
      question_impact_summary: { question_part_id: part.question_part_id, ...structuredClone(gap.question_impact_summary) }
    };
  });
  const presentationId = stableV5Id("clarification_presentation", {
    case_document_lineage_id: stateSet.case_document_lineage_id,
    input_semantic_root_digest: stateSet.current_semantic_root_digest,
    question_part_state_set_digest: stateSet.state_set_digest,
    visible_question_part_ids: parts.map((part) => part.question_part_id)
  });
  const payload = { presentation_id: presentationId, semantic_root_digest: stateSet.current_semantic_root_digest, question_part_state_set_digest: stateSet.state_set_digest, source_revision: sourceRevision, parts };
  return { ...payload, presentation_digest: clarificationPresentationDigest(payload) };
}
function applyQuestionPartTransitions(stateSet, changes, nextSemanticRootDigest = stateSet.current_semantic_root_digest) {
  validateQuestionPartStateSet(stateSet);
  if (!digest3(nextSemanticRootDigest)) throw new V5ProtocolError("QUESTION_PART_TRANSITION_INVALID", "Next semantic root digest is invalid.");
  const byId = new Map(changes.map((change) => [change.question_part_id, change]));
  if (byId.size !== changes.length) throw new V5ProtocolError("QUESTION_PART_ACTION_CONFLICT", "A Question Part may transition at most once per commit.");
  const parts = stateSet.parts.map((part) => {
    const change = byId.get(part.question_part_id);
    if (!change) return structuredClone(part);
    if (!EDGES[part.current_state]?.has(change.to_state)) throw new V5ProtocolError("QUESTION_PART_TRANSITION_INVALID", "Question Part transition is not allowed from the current state.");
    const transitionPayload = { transition_sequence: part.transition_history.length + 1, from_state: part.current_state, to_state: change.to_state, cause: structuredClone(change.cause) };
    const transition = { ...transitionPayload, transition_digest: canonicalObjectDigest(transitionPayload) };
    const { state_record_digest: ignored, ...payload2 } = part;
    return sealStateRecord({ ...payload2, current_state: change.to_state, transition_history: [...part.transition_history, transition] });
  });
  for (const change of changes) if (!stateSet.parts.some((part) => part.question_part_id === change.question_part_id)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part transition targets an unknown part.");
  const payload = { kind: "question_part_state_set", case_document_lineage_id: stateSet.case_document_lineage_id, current_semantic_root_digest: nextSemanticRootDigest, parts };
  const next = { ...payload, state_set_digest: canonicalObjectDigest(payload) };
  validateQuestionPartStateSet(next);
  return next;
}

// src/v5/clarification-parser.mjs
var UNIT_ACTIONS = /* @__PURE__ */ new Set(["answer", "defer", "unknown", "close_for_delivery"]);
var PROPER_TOKEN = /^Q[0-9]{3,6}$/u;
var TOKENISH = /Q[0-9]+/gu;
function object4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact4(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank5(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function scalarLength2(value) {
  return typeof value === "string" ? [...value].length : -1;
}
function clarificationMessageDigest(raw) {
  if (typeof raw !== "string") throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Raw clarification message must be a string.");
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/clarification-message", format_version: 1, message: raw });
}
function minimalOriginFromRaw(raw, range) {
  if (typeof raw !== "string" || !object4(range) || !exact4(range, ["start_scalar", "end_scalar"]) || !Number.isSafeInteger(range.start_scalar) || !Number.isSafeInteger(range.end_scalar)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin range must use safe Unicode scalar offsets.");
  const scalars = [...raw];
  if (range.start_scalar < 0 || range.end_scalar <= range.start_scalar || range.end_scalar > scalars.length) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin range is out of bounds or empty.");
  const excerpt = scalars.slice(range.start_scalar, range.end_scalar).join("");
  if (scalars.length > 65536 || scalarLength2(excerpt) > 256) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Clarification message or origin excerpt is too long.");
  return { message_digest: clarificationMessageDigest(raw), range: { ...range }, excerpt, excerpt_digest: rawBytesDigest(excerpt) };
}
function verifyOrigin(supplied, raw) {
  const expected = minimalOriginFromRaw(raw, supplied?.range);
  if (!object4(supplied) || !exact4(supplied, ["message_digest", "range", "excerpt", "excerpt_digest"]) || canonicalV5Stringify(supplied) !== canonicalV5Stringify(expected)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin must be derived exactly from the current raw message.");
  return expected;
}
function stripWrappers(text, punctuation) {
  const wrappers = new Set(punctuation);
  const scalars = [...text];
  while (scalars.length > 0 && (new RegExp("\\p{White_Space}", "u").test(scalars[0]) || wrappers.has(scalars[0]))) scalars.shift();
  while (scalars.length > 0 && (new RegExp("\\p{White_Space}", "u").test(scalars[scalars.length - 1]) || wrappers.has(scalars[scalars.length - 1]))) scalars.pop();
  return scalars.join("");
}
function validateAnswerValue(value, schema, registry) {
  const fail = () => {
    throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Answer value does not satisfy the frozen closed contract.");
  };
  if (!object4(value) || value.kind !== schema.kind) return fail();
  if (value.kind === "text") {
    if (!exact4(value, ["kind", "value"]) || !nonblank5(value.value)) return fail();
    const text = value.value.trim();
    const length = scalarLength2(text);
    if (length < schema.min_scalars || length > schema.max_scalars || length > 1024 || schema.ambiguity_guard_ref !== "answer.no-unresolved-vague-token.v1") return fail();
    const guard = registry.text_ambiguity_guards.find((item) => item.guard_ref === schema.ambiguity_guard_ref);
    if (!guard || guard.match_mode !== "unicode_scalar_substring" || guard.forbidden_tokens.some((token) => text.includes(token))) return fail();
  } else if (value.kind === "boolean") {
    if (!exact4(value, ["kind", "value"]) || typeof value.value !== "boolean") return fail();
  } else if (value.kind === "integer" || value.kind === "number") {
    if (!exact4(value, ["kind", "value"]) || typeof value.value !== "number" || !Number.isFinite(value.value) || value.kind === "integer" && !Number.isSafeInteger(value.value) || schema.minimum !== void 0 && value.value < schema.minimum || schema.maximum !== void 0 && value.value > schema.maximum) return fail();
  } else if (value.kind === "duration_ms") {
    if (!exact4(value, ["kind", "value"]) || !Number.isSafeInteger(value.value) || value.value <= 0 || schema.maximum !== void 0 && value.value > schema.maximum) return fail();
  } else if (value.kind === "identifier") {
    const pattern = registry.identifier_patterns.find((item) => item.pattern_ref === schema.pattern_ref);
    if (!exact4(value, ["kind", "value"]) || !pattern || !new RegExp(pattern.expression, "u").test(value.value)) return fail();
  } else if (value.kind === "enum") {
    if (!exact4(value, ["kind", "value"]) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === "set") {
    if (!exact4(value, ["kind", "members"]) || !Array.isArray(value.members) || value.members.length < schema.min_items || schema.max_items !== void 0 && value.members.length > schema.max_items) return fail();
    for (const member of value.members) if (!object4(member) || member.kind !== schema.member_kind || !validateScalar(member)) return fail();
    if (new Set(value.members.map((member) => canonicalV5Stringify(member))).size !== value.members.length) return fail();
    if (schema.allowed_members && value.members.some((member) => !schema.allowed_members.some((allowed) => canonicalV5Stringify(allowed) === canonicalV5Stringify(member)))) return fail();
  } else if (value.kind === "mapping") {
    if (!exact4(value, ["kind", "entries"]) || !Array.isArray(value.entries)) return fail();
    for (const entry of value.entries) if (!object4(entry) || !exact4(entry, ["from", "to"]) || entry.from?.kind !== schema.key_kind || entry.to?.kind !== schema.mapped_value_kind || !validateScalar(entry.from) || !validateScalar(entry.to)) return fail();
    if (new Set(value.entries.map((entry) => canonicalV5Stringify(entry.from))).size !== value.entries.length) return fail();
    if (schema.required_keys && !sameCanonicalSet(value.entries.map((entry) => entry.from), schema.required_keys)) return fail();
  } else if (value.kind === "scope") {
    if (!exact4(value, ["kind", "included_refs", "excluded_refs"]) || !uniqueNonblankStrings(value.included_refs) || !uniqueNonblankStrings(value.excluded_refs) || value.included_refs.some((ref) => value.excluded_refs.includes(ref))) return fail();
    const allowed = schema.allowed_refs;
    if (allowed && [...value.included_refs, ...value.excluded_refs].some((ref) => !allowed.includes(ref))) return fail();
  } else if (value.kind === "requirements_quantifier") {
    if (!exact4(value, ["kind", "value"]) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === "requirements_refs") {
    if (!exact4(value, ["kind", "refs"]) || !Array.isArray(value.refs) || value.refs.length < schema.min_items || schema.max_items !== void 0 && value.refs.length > schema.max_items || !value.refs.every(object4)) return fail();
    if (!sameCanonicalSubset(value.refs, schema.allowed_refs)) return fail();
  } else if (value.kind === "entity_resolution") {
    if (!validateEntityResolution(value.value, schema)) return fail();
  } else if (value.kind === "permission_coordinates") {
    if (!validatePermissionCoordinates(value.value, schema)) return fail();
  } else if (["oracle_observation", "oracle_assertion", "oracle_scope", "oracle_window", "population_scope", "population_proof"].includes(value.kind)) {
    if (!exact4(value, ["kind", "resolution"]) || !object4(value.resolution)) return fail();
    if (value.resolution.resolution_kind === "select_candidate") {
      if (!exact4(value.resolution, ["resolution_kind", "candidate"]) || !schema.existing_candidates?.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value.resolution.candidate))) return fail();
    } else if (value.resolution.resolution_kind === "create_typed") {
      if (!exact4(value.resolution, ["resolution_kind", "payload"]) || schema.allow_typed_creation !== true || !object4(value.resolution.payload)) return fail();
    } else return fail();
  } else if (value.kind === "permission_auxiliary_contract") {
    if (!exact4(value, ["kind", "resolution"]) || !object4(value.resolution)) return fail();
    if (value.resolution.resolution_kind === "select_candidate") {
      if (!exact4(value.resolution, ["resolution_kind", "contract_ref"]) || !schema.existing_contract_refs?.some((ref) => canonicalV5Stringify(ref) === canonicalV5Stringify(value.resolution.contract_ref))) return fail();
    } else if (!(value.resolution.resolution_kind === "create_typed" && exact4(value.resolution, ["resolution_kind", "payload"]) && object4(value.resolution.payload) && schema.allow_typed_creation === true)) return fail();
  } else return fail();
  return structuredClone(value);
}
function validateScalar(value) {
  if (!object4(value)) return false;
  if (value.kind === "text" || value.kind === "identifier" || value.kind === "enum") return exact4(value, ["kind", "value"]) && nonblank5(value.value);
  if (value.kind === "boolean") return exact4(value, ["kind", "value"]) && typeof value.value === "boolean";
  if (value.kind === "integer" || value.kind === "duration_ms") return exact4(value, ["kind", "value"]) && Number.isSafeInteger(value.value);
  return value.kind === "number" && exact4(value, ["kind", "value"]) && typeof value.value === "number" && Number.isFinite(value.value);
}
function uniqueNonblankStrings(values) {
  return Array.isArray(values) && values.every(nonblank5) && new Set(values).size === values.length;
}
function sameCanonicalSet(left, right) {
  return left.length === right.length && new Set(left.map(canonicalV5Stringify)).size === left.length && left.every((value) => right.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value)));
}
function sameCanonicalSubset(values, allowed) {
  return new Set(values.map(canonicalV5Stringify)).size === values.length && values.every((value) => allowed.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value)));
}
function validateEntityResolution(answer, schema) {
  if (!object4(answer) || !exact4(answer, ["conflict_group_id", "exact_mention_candidate_ids", "clusters"]) || answer.conflict_group_id !== schema.exact_conflict_group_id || !sameCanonicalSet(answer.exact_mention_candidate_ids, schema.exact_mention_candidate_ids) || !Array.isArray(answer.clusters) || answer.clusters.length === 0) return false;
  const mentions = [];
  for (const cluster of answer.clusters) {
    if (!object4(cluster) || !exact4(cluster, ["canonical_name", "mentions"]) || !nonblank5(cluster.canonical_name) || !Array.isArray(cluster.mentions) || cluster.mentions.length === 0) return false;
    for (const mention of cluster.mentions) {
      if (!object4(mention) || !exact4(mention, ["mention_candidate_id", "name_role"]) || !schema.allowed_name_roles.includes(mention.name_role)) return false;
      mentions.push(mention.mention_candidate_id);
    }
  }
  return sameCanonicalSet(mentions, schema.exact_mention_candidate_ids);
}
function validatePermissionCoordinates(answer, schema) {
  if (!object4(answer) || !exact4(answer, ["scope_group_id", "permission_scope_candidate_ids", "unresolved_coordinates", "coordinate_resolutions"]) || answer.scope_group_id !== schema.exact_scope_group_id || !sameCanonicalSet(answer.permission_scope_candidate_ids, schema.exact_permission_scope_candidate_ids) || !sameCanonicalSet(answer.unresolved_coordinates, schema.exact_unresolved_coordinates) || !Array.isArray(answer.coordinate_resolutions) || answer.coordinate_resolutions.length !== answer.unresolved_coordinates.length) return false;
  const byCoordinate = new Map(schema.coordinate_contracts.map((contract) => [contract.coordinate, contract]));
  if (new Set(answer.coordinate_resolutions.map((row) => row.coordinate)).size !== answer.coordinate_resolutions.length) return false;
  for (const row of answer.coordinate_resolutions) {
    const contract = byCoordinate.get(row.coordinate);
    if (!contract || !object4(row.resolution)) return false;
    if (row.resolution.resolution_kind === "select_candidate") {
      if (row.coordinate === "permission_dimension") {
        if (!exact4(row.resolution, ["resolution_kind", "coordinate_evidence_digests"]) || !sameCanonicalSubset(row.resolution.coordinate_evidence_digests, contract.existing_candidate_evidence_digests)) return false;
      } else if (!exact4(row.resolution, ["resolution_kind", "coordinate_evidence_digest"]) || !contract.existing_candidate_evidence_digests.includes(row.resolution.coordinate_evidence_digest)) return false;
    } else if (row.resolution.resolution_kind === "create_typed") {
      const payload = row.resolution.payload;
      if (!exact4(row.resolution, ["resolution_kind", "payload"]) || !object4(payload)) return false;
      if (row.coordinate === "role" || row.coordinate === "resource") {
        const n = scalarLength2(payload.canonical_name);
        if (!exact4(payload, ["canonical_name"]) || n < 1 || n > 128) return false;
      } else if (row.coordinate === "action") {
        if (!exact4(payload, ["action"]) || !contract.creation_constraints.allowed_actions.includes(payload.action)) return false;
      } else if (row.coordinate === "context") {
        const n = scalarLength2(payload.context_key);
        if (!exact4(payload, ["context_key"]) || n < 1 || n > 256) return false;
      } else if (!exact4(payload, ["dimensions"]) || !sameCanonicalSubset(payload.dimensions, contract.creation_constraints.allowed_dimensions) || new Set(payload.dimensions).size !== payload.dimensions.length || !payload.dimensions.includes("decision")) return false;
    } else return false;
  }
  return true;
}
function verifyUnitTokenBinding(excerpt, expectedToken, allPresentationTokens) {
  const tokenish = [...excerpt.matchAll(TOKENISH)].map((match) => match[0]);
  if (allPresentationTokens.length === 1 && tokenish.length === 0) return;
  if (tokenish.length !== 1 || tokenish[0] !== expectedToken || !PROPER_TOKEN.test(expectedToken) || !allPresentationTokens.includes(expectedToken)) throw new V5ProtocolError("ANSWER_BINDING_AMBIGUOUS", "Response unit must contain exactly its current full display token.");
}
function verifyControlOrigin(excerpt, token, action, registry, allowTokenless) {
  const first = excerpt.indexOf(token);
  if (first < 0 && !allowTokenless) throw new V5ProtocolError("CONTROL_ORIGIN_REQUIRED", "Control origin does not contain its target token.");
  if (first >= 0 && excerpt.indexOf(token, first + token.length) >= 0) throw new V5ProtocolError("CONTROL_ORIGIN_REQUIRED", "Control origin contains a duplicate target token.");
  const remainder = first < 0 ? excerpt : `${excerpt.slice(0, first)}${excerpt.slice(first + token.length)}`;
  const candidate = stripWrappers(remainder, registry.control_wrapper_punctuation);
  if (!registry.control_tokens[action]?.includes(candidate)) throw new V5ProtocolError("CONTROL_ORIGIN_REQUIRED", "Control origin must reduce to one exact registered token.");
}
function validateAndBindResponseUnits(input) {
  const { raw_response: raw, presentation, control_registry: controls, answer_registry: registry } = input;
  if (typeof raw !== "string" || !object4(presentation) || !Array.isArray(presentation.parts) || !Array.isArray(input.units) || input.units.length === 0) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Clarification preview needs a nonempty unit set and current presentation.");
  const partById = new Map(presentation.parts.map((part) => [part.question_part_id, part]));
  const tokens = presentation.parts.map((part) => part.display_token);
  const seenPart = /* @__PURE__ */ new Set();
  const seenKey = /* @__PURE__ */ new Set();
  const bound = (
    /** @type {Array<Record<string,any>>} */
    input.units.map((unit) => {
      if (!object4(unit) || !nonblank5(unit.unit_client_key) || seenKey.has(unit.unit_client_key) || !UNIT_ACTIONS.has(unit.action) || !object4(unit.target)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit shape, action, or client key is invalid.");
      seenKey.add(unit.unit_client_key);
      const part = partById.get(unit.target.question_part_id);
      if (!part || unit.target.display_token !== part.display_token || unit.target.root_version_digest !== presentation.semantic_root_digest || !part.current_allowed_controls.includes(unit.action)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit target is stale, unknown, or not advertised.");
      if (seenPart.has(part.question_part_id)) throw new V5ProtocolError("QUESTION_PART_ACTION_CONFLICT", "A Question Part has conflicting response units.");
      seenPart.add(part.question_part_id);
      const origin = verifyOrigin(unit.origin, raw);
      const optionalShared = Object.hasOwn(unit, "shared_origin_group_id");
      if (!optionalShared) verifyUnitTokenBinding(origin.excerpt, part.display_token, tokens);
      const expectedKeys = ["unit_client_key", ...optionalShared ? ["shared_origin_group_id"] : [], "origin", "target", "action", ...unit.action === "answer" ? ["answer"] : []];
      if (!exact4(unit, expectedKeys)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit contains fields outside its closed branch.");
      let evidenceLevel = null;
      if (unit.action === "answer") {
        if (part.answer_contract.answer_mode !== "typed_answer" || !object4(unit.answer) || !exact4(unit.answer, ["value", "source_text", "nature", ...Object.hasOwn(unit.answer, "temporary_basis") ? ["temporary_basis"] : []]) || !nonblank5(unit.answer.source_text) || scalarLength2(unit.answer.source_text) > 256 || !origin.excerpt.includes(unit.answer.source_text)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Answer is missing or does not bind its exact source text.");
        validateAnswerValue(unit.answer.value, part.answer_contract.value_schema, registry);
        if (unit.answer.nature === "final") {
          if (Object.hasOwn(unit.answer, "temporary_basis")) throw new V5ProtocolError("ANSWER_NATURE_INVALID", "Final answer cannot carry a temporary basis.");
          evidenceLevel = "E3";
        } else if (unit.answer.nature === "temporary") {
          if (!object4(unit.answer.temporary_basis)) throw new V5ProtocolError("TEMPORARY_BASIS_REQUIRED", "Temporary answer requires an exact registered marker origin.");
          const basis = verifyOrigin(unit.answer.temporary_basis, raw);
          if (!controls.temporary_marker_tokens.includes(stripWrappers(basis.excerpt, controls.control_wrapper_punctuation))) throw new V5ProtocolError("TEMPORARY_BASIS_REQUIRED", "Temporary basis must be one registered marker token.");
          evidenceLevel = "E1";
        } else throw new V5ProtocolError("ANSWER_NATURE_INVALID", "Answer nature must be final or temporary.");
      } else {
        if (optionalShared) throw new V5ProtocolError("QUESTION_PART_ACTION_CONFLICT", "Control actions cannot use clone groups.");
        verifyControlOrigin(origin.excerpt, part.display_token, unit.action, controls, tokens.length === 1);
      }
      return { ...structuredClone(unit), evidence_level: evidenceLevel };
    })
  );
  const groups = /* @__PURE__ */ new Map();
  for (const unit of bound.filter((item) => item.shared_origin_group_id)) {
    const rows = groups.get(unit.shared_origin_group_id) ?? [];
    rows.push(unit);
    groups.set(unit.shared_origin_group_id, rows);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2 || rows.some((row) => row.action !== "answer")) throw new V5ProtocolError("ANSWER_BINDING_AMBIGUOUS", "Clone groups need at least two answer targets.");
    const first = rows[0];
    const sameOriginAndAnswer = rows.every((row) => canonicalV5Stringify(row.origin) === canonicalV5Stringify(first.origin) && canonicalV5Stringify(row.answer) === canonicalV5Stringify(first.answer));
    const originTokens = [...first.origin.excerpt.matchAll(TOKENISH)].map((match) => match[0]).sort();
    const targetTokens = rows.map((row) => row.target.display_token).sort();
    const markerPresent = controls.clone_marker_tokens.some((marker) => first.origin.excerpt.includes(marker));
    if (!sameOriginAndAnswer || !markerPresent || canonicalV5Stringify(originTokens) !== canonicalV5Stringify(targetTokens)) throw new V5ProtocolError("ANSWER_BINDING_AMBIGUOUS", "Clone origin, target set, marker, action, and answer must be exact.");
  }
  return bound.sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key));
}
function answerValueDigest(value) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/answer-value", format_version: 1, value });
}

// src/v5/clarification-preview.mjs
function previewDigest(previewWithoutDigest) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/clarification-preview", format_version: 1, preview: previewWithoutDigest });
}
function proposedUnit(unit) {
  const { evidence_level: ignored, ...payload } = unit;
  return structuredClone(payload);
}
function previewBinding(unit) {
  return {
    unit_client_key: unit.unit_client_key,
    ...unit.shared_origin_group_id ? { shared_origin_group_id: unit.shared_origin_group_id } : {},
    question_part_id: unit.target.question_part_id,
    display_token: unit.target.display_token,
    action: unit.action,
    origin: structuredClone(unit.origin),
    ...unit.answer ? { answer: structuredClone(unit.answer) } : {}
  };
}
function defaultProjection(bound, stateSet, gapByPart) {
  const stateById = new Map(stateSet.parts.map((part) => [part.question_part_id, part.current_state]));
  const targetState = (unit) => unit.action === "answer" ? unit.answer.nature === "final" ? "resolved_final" : "resolved_temporary" : unit.action === "defer" ? "deferred_by_user" : unit.action === "unknown" ? "unknown_by_user" : "closed_for_delivery";
  return {
    resolved_gap_ids: bound.filter((unit) => unit.action === "answer").map((unit) => {
      const gap = gapByPart.get(unit.target.question_part_id);
      if (!gap) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Projection references an unknown gap.");
      return gap.gap_binding.gap_id;
    }).sort(),
    invalidated_artifact_ids: [],
    semantic_changes: [],
    status_changes: bound.map((unit) => ({ ref: unit.target.question_part_id, from: stateById.get(unit.target.question_part_id), to: targetState(unit) })).sort((left, right) => left.ref.localeCompare(right.ref)),
    coverage_changes: [],
    no_semantic_change: false
  };
}
function createPendingClarificationCommit(input) {
  const { preview, canonical_units: units, decision_proposals: proposals } = input;
  const fail = () => {
    throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Pending clarification must be an exact replay of its preview and canonical units.");
  };
  if (!preview || typeof preview.preview_digest !== "string" || !Array.isArray(preview.bindings) || !Array.isArray(units) || !Array.isArray(proposals)) return fail();
  const unitKeys = units.map((unit) => unit.unit_client_key).sort();
  const bindingKeys = preview.bindings.map((binding) => binding.unit_client_key).sort();
  if (new Set(unitKeys).size !== unitKeys.length || canonicalV5Stringify(unitKeys) !== canonicalV5Stringify(bindingKeys)) return fail();
  for (const unit of units) {
    const binding = preview.bindings.find((item) => item.unit_client_key === unit.unit_client_key);
    if (!binding || canonicalV5Stringify(previewBinding(unit)) !== canonicalV5Stringify(binding)) return fail();
  }
  const answerPartIds = units.filter((unit) => unit.action === "answer").map((unit) => unit.target.question_part_id).sort();
  const proposalPartIds = proposals.map((proposal) => proposal.question_part_id).sort();
  if (canonicalV5Stringify(answerPartIds) !== canonicalV5Stringify(proposalPartIds)) return fail();
  return {
    status: "pending",
    preview_digest: preview.preview_digest,
    presentation_id: preview.presentation_id,
    presentation_digest: preview.presentation_digest,
    semantic_root_digest: preview.semantic_root_digest,
    base_question_part_state_set_digest: preview.question_part_state_set_digest,
    source_revision: preview.source_revision,
    base_checkpoint_digest: input.base_checkpoint_digest,
    canonical_units: units.map(proposedUnit).sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key)),
    decision_proposals: structuredClone(proposals).sort((left, right) => left.question_part_id.localeCompare(right.question_part_id)),
    deterministic_projection: structuredClone(preview.deterministic_projection),
    unknown_future_effects: structuredClone(preview.unknown_future_effects)
  };
}
function previewClarificationResponse(input) {
  validateQuestionPartStateSet(input.state_set);
  if (input.presentation.semantic_root_digest !== input.state_set.current_semantic_root_digest || input.presentation.question_part_state_set_digest !== input.state_set.state_set_digest) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Presentation does not bind the current semantic root and Question Part state set.");
  const bound = (
    /** @type {Array<Record<string,any>>} */
    validateAndBindResponseUnits(input)
  );
  const gapByBinding = new Map(input.gaps.map((gap) => [`${gap.gap_binding.kind}\0${gap.gap_binding.gap_id}`, gap]));
  const partById = new Map(input.state_set.parts.map((part) => [part.question_part_id, part]));
  const gapByPart = /* @__PURE__ */ new Map();
  for (const part of input.state_set.parts) {
    const gap = gapByBinding.get(`${part.gap_binding.kind}\0${part.gap_binding.gap_id}`);
    if (gap) gapByPart.set(part.question_part_id, gap);
  }
  for (const unit of bound) if (!gapByPart.has(unit.target.question_part_id)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit cannot resolve to an accepted gap.");
  const bindings = bound.map(previewBinding).sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key));
  const projection = input.projection ?? defaultProjection(bound, input.state_set, gapByPart);
  if (projection.no_semantic_change !== false) throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Applying clarification units must advertise a semantic or evidence-state change.");
  const unknownEffects = input.unknown_future_effects ?? (bound.some((unit) => unit.action === "answer") ? ["Downstream Agent artifacts may require recompilation from confirmed Decisions."] : []);
  const payload = {
    presentation_id: input.presentation.presentation_id,
    presentation_digest: input.presentation.presentation_digest,
    semantic_root_digest: input.presentation.semantic_root_digest,
    question_part_state_set_digest: input.presentation.question_part_state_set_digest,
    source_revision: input.presentation.source_revision,
    response_message_digest: bound[0].origin.message_digest,
    bindings,
    deterministic_projection: structuredClone(projection),
    unknown_future_effects: [...unknownEffects]
  };
  if (bound.some((unit) => unit.origin.message_digest !== payload.response_message_digest)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "All units must originate from the same current raw response.");
  const preview = { ...payload, preview_digest: previewDigest(payload) };
  const proposals = bound.filter((unit) => unit.action === "answer").map((unit) => {
    const part = partById.get(unit.target.question_part_id);
    const gap = gapByPart.get(unit.target.question_part_id);
    if (!part || !gap) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Decision proposal cannot resolve its exact part and gap.");
    return {
      question_part_id: part.question_part_id,
      gap_binding: structuredClone(part.gap_binding),
      target: structuredClone(gap.target),
      answer_contract_digest: part.answer_contract_digest,
      answer_value: structuredClone(unit.answer.value),
      answer_value_digest: answerValueDigest(unit.answer.value),
      source_text: unit.answer.source_text,
      evidence_level: unit.evidence_level,
      case_document_lineage_id: input.state_set.case_document_lineage_id,
      origin: structuredClone(unit.origin),
      ...unit.answer.nature === "temporary" ? { temporary_basis: structuredClone(unit.answer.temporary_basis) } : {}
    };
  });
  const pending = createPendingClarificationCommit({ preview, canonical_units: bound, decision_proposals: proposals, base_checkpoint_digest: input.base_checkpoint_digest });
  return { preview, pending };
}
function verifyClarificationPreviewDigest(preview) {
  const { preview_digest: declared, ...payload } = preview;
  if (previewDigest(payload) !== declared) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Clarification preview digest is invalid.");
  return structuredClone(preview);
}

// src/v5/clarification-reducer.mjs
function decisionDigest(decisionWithoutDigest) {
  return canonicalObjectDigest({ namespace: "generate-test-cases/v5/clarification-decision-record", format_version: 1, record: decisionWithoutDigest });
}
function verifyCurrent(pending, preview, current) {
  verifyClarificationPreviewDigest(preview);
  if (pending.status !== "pending" || pending.preview_digest !== preview.preview_digest || pending.presentation_id !== preview.presentation_id || pending.presentation_digest !== preview.presentation_digest || pending.semantic_root_digest !== preview.semantic_root_digest || pending.base_question_part_state_set_digest !== preview.question_part_state_set_digest || pending.source_revision !== preview.source_revision || pending.base_checkpoint_digest !== current.checkpoint_digest || pending.semantic_root_digest !== current.semantic_root_digest || pending.presentation_digest !== current.presentation_digest || pending.base_question_part_state_set_digest !== current.question_part_state_set_digest || pending.source_revision !== current.source_revision || canonicalV5Stringify(pending.deterministic_projection) !== canonicalV5Stringify(preview.deterministic_projection) || canonicalV5Stringify(pending.unknown_future_effects) !== canonicalV5Stringify(preview.unknown_future_effects)) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Pending clarification no longer binds the current preview, root, state set, source revision, and checkpoint.");
  const unitKeys = pending.canonical_units.map((unit) => unit.unit_client_key).sort();
  const bindingKeys = preview.bindings.map((binding) => binding.unit_client_key).sort();
  if (canonicalV5Stringify(unitKeys) !== canonicalV5Stringify(bindingKeys)) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Pending units do not match preview bindings.");
}
function confirmationOrigin(raw, range, registry) {
  let origin;
  try {
    origin = minimalOriginFromRaw(raw, range);
  } catch {
    throw new V5ProtocolError("CLARIFICATION_CONFIRMATION_INVALID", "Confirmation range is invalid.");
  }
  const scalars = [...raw];
  const outside = `${scalars.slice(0, range.start_scalar).join("")}${scalars.slice(range.end_scalar).join("")}`;
  const token = origin.excerpt.trim();
  if (outside.trim().length > 0 || !registry.confirmation_tokens.includes(token)) throw new V5ProtocolError("CLARIFICATION_CONFIRMATION_INVALID", "Confirmation must be exactly one registered token with whitespace only outside its range.");
  if (origin.excerpt !== token) throw new V5ProtocolError("CLARIFICATION_CONFIRMATION_INVALID", "Confirmation range must tightly select the registered token.");
  return origin;
}
function commitClarificationResponse(input) {
  validateQuestionPartStateSet(input.state_set);
  verifyCurrent(input.pending, input.preview, input.current);
  if (input.state_set.state_set_digest !== input.pending.base_question_part_state_set_digest) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Question Part state changed after preview.");
  const confirmOrigin = confirmationOrigin(input.raw_confirmation, input.confirmation_range, input.control_registry);
  const bindingByKey = new Map(input.preview.bindings.map((binding) => [binding.unit_client_key, binding]));
  for (const unit of input.pending.canonical_units) {
    const binding = bindingByKey.get(unit.unit_client_key);
    if (!binding || unit.target.question_part_id !== binding.question_part_id || unit.target.display_token !== binding.display_token || unit.action !== binding.action || canonicalV5Stringify(unit.origin) !== canonicalV5Stringify(binding.origin) || canonicalV5Stringify(unit.answer ?? null) !== canonicalV5Stringify(binding.answer ?? null)) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Pending unit was not the unit shown in preview.");
  }
  const decisions = (
    /** @type {Array<Record<string,any>>} */
    input.pending.decision_proposals.map((proposal) => {
      const decisionId = stableV5Id("clarification_decision", {
        case_document_lineage_id: proposal.case_document_lineage_id,
        input_semantic_root_digest: input.pending.semantic_root_digest,
        gap_binding: proposal.gap_binding,
        target: proposal.target,
        answer_contract_digest: proposal.answer_contract_digest,
        answer_value_digest: proposal.answer_value_digest,
        evidence_level: proposal.evidence_level
      });
      const payload = {
        kind: "clarification_decision",
        schema_version: "5.0.0",
        decision_id: decisionId,
        case_document_lineage_id: proposal.case_document_lineage_id,
        input_semantic_root_digest: input.pending.semantic_root_digest,
        question_part_id: proposal.question_part_id,
        gap_binding: structuredClone(proposal.gap_binding),
        target: structuredClone(proposal.target),
        answer_contract_digest: proposal.answer_contract_digest,
        answer_value: structuredClone(proposal.answer_value),
        answer_value_digest: proposal.answer_value_digest,
        evidence_level: proposal.evidence_level,
        answer_origin: structuredClone(proposal.origin),
        temporary_basis: proposal.evidence_level === "E1" ? structuredClone(proposal.temporary_basis) : null,
        presentation_digest: input.pending.presentation_digest,
        preview_digest: input.pending.preview_digest,
        confirmation_origin: structuredClone(confirmOrigin)
      };
      if (proposal.evidence_level === "E1" !== Boolean(proposal.temporary_basis)) throw new V5ProtocolError("TEMPORARY_BASIS_REQUIRED", "Decision evidence level and temporary basis are inconsistent.");
      return { ...payload, decision_digest: decisionDigest(payload) };
    }).sort((left, right) => left.decision_id.localeCompare(right.decision_id))
  );
  const decisionByPart = new Map(decisions.map((decision) => [decision.question_part_id, decision]));
  const beforeGraphDigest = canonicalObjectDigest({ semantic_root_digest: input.pending.semantic_root_digest, question_part_state_set_digest: input.state_set.state_set_digest });
  const afterGraphDigest = canonicalObjectDigest({ before_graph_digest: beforeGraphDigest, preview_digest: input.pending.preview_digest, decision_ids: decisions.map((decision) => decision.decision_id), deterministic_projection: input.pending.deterministic_projection });
  const impact = {
    preview_digest: input.pending.preview_digest,
    decision_ids: decisions.map((decision) => decision.decision_id),
    before_graph_digest: beforeGraphDigest,
    after_graph_digest: afterGraphDigest,
    actual_projection: structuredClone(input.pending.deterministic_projection)
  };
  if (canonicalV5Stringify(impact.actual_projection) !== canonicalV5Stringify(input.preview.deterministic_projection)) throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Committed impact differs from the confirmed preview.");
  const impactDigest = canonicalObjectDigest(impact);
  const changes = input.pending.canonical_units.map((unit) => {
    const decision = decisionByPart.get(unit.target.question_part_id);
    if (unit.action === "answer") {
      if (!decision) throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Answer unit has no exact Decision proposal.");
      return { question_part_id: unit.target.question_part_id, to_state: unit.answer.nature === "final" ? "resolved_final" : "resolved_temporary", cause: { kind: "answer", decision_id: decision.decision_id, evidence_level: decision.evidence_level, answer_value_digest: decision.answer_value_digest, applied_clarification_impact_digest: impactDigest } };
    }
    return { question_part_id: unit.target.question_part_id, to_state: unit.action === "defer" ? "deferred_by_user" : unit.action === "unknown" ? "unknown_by_user" : "closed_for_delivery", cause: { kind: "control", action: unit.action, control_origin: structuredClone(unit.origin), preview_digest: input.pending.preview_digest, applied_clarification_impact_digest: impactDigest } };
  });
  const nextStateSet = applyQuestionPartTransitions(input.state_set, changes, afterGraphDigest);
  return { decisions, impact, next_state_set: nextStateSet, semantic_revision_delta: 1, pending_status: "committed" };
}
function discardPendingClarification(pending) {
  if (pending.status === "superseded") return structuredClone(pending);
  if (pending.status !== "pending") throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Only the current pending preview can be discarded.");
  return { ...structuredClone(pending), status: "superseded" };
}

// src/v5/case-status.mjs
function deriveCaseStatus(input) {
  if (!Array.isArray(input.evidence_levels) || !Array.isArray(input.unresolved_gap_ids) || input.evidence_levels.some((level) => !["E1", "E2", "E3"].includes(level))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Case status requires only accepted E1/E2/E3 business evidence.");
  if (input.not_applicable_basis_levels !== void 0) {
    if (input.unresolved_gap_ids.length > 0 || input.not_applicable_basis_levels.length === 0 || input.not_applicable_basis_levels.some((level) => !["E2", "E3"].includes(level))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "NotApplicable requires independent E2/E3 exclusion basis and no unresolved gap.");
    return "NotApplicable";
  }
  if (input.exploratory_only === true) {
    if (input.unresolved_gap_ids.length > 0) return "Blocked";
    return "Exploratory";
  }
  if (input.unresolved_gap_ids.length > 0) return "Blocked";
  if (input.evidence_levels.length === 0 || input.evidence_levels.some((level) => !["E1", "E2", "E3"].includes(level))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Grounded or Conditional Case requires accepted business evidence.");
  return input.evidence_levels.includes("E1") ? "Conditional" : "Grounded";
}

// src/v5/oracles.mjs
function object5(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact5(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank6(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function uniqueTyped(values) {
  return new Set(values.map((value) => canonicalV5Stringify(value))).size === values.length && values.every(validateTypedValue);
}
function validateOracleAssertion(assertion, context) {
  const fail = (message = "Oracle assertion is not a closed decidable branch.") => {
    throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", message);
  };
  if (!object5(assertion) || typeof assertion.kind !== "string") return fail();
  if (assertion.kind === "exact_text") {
    if (!exact5(assertion, ["kind", "expected_text"]) || !nonblank6(assertion.expected_text)) return fail();
  } else if (assertion.kind === "semantic_text") {
    if (!exact5(assertion, ["kind", "expected_text", "equivalence_rule_ref"]) || !nonblank6(assertion.expected_text)) return fail();
    resolveSemanticRuleRef(assertion.equivalence_rule_ref, "semantic_equivalence", context.semanticRuleIndex);
  } else if (assertion.kind === "value_equals") {
    const keys = assertion.normalization_ref ? ["kind", "expected_value", "normalization_ref"] : ["kind", "expected_value"];
    if (!exact5(assertion, keys) || !validateTypedValue(assertion.expected_value)) return fail();
    if (assertion.normalization_ref) resolveSemanticRuleRef(assertion.normalization_ref, "value_normalization", context.semanticRuleIndex);
  } else if (assertion.kind === "value_state_equals") {
    if (!exact5(assertion, ["kind", "expected_value_state"])) return fail();
    try {
      validateValueState(assertion.expected_value_state);
    } catch {
      return fail();
    }
  } else if (assertion.kind === "exists" || assertion.kind === "absent") {
    if (!exact5(assertion, ["kind"])) return fail();
  } else if (assertion.kind === "set_contains" || assertion.kind === "set_equals") {
    const keys = assertion.kind === "set_contains" ? ["kind", "expected_members", "normalization_ref"] : ["kind", "expected_members", "order_sensitive", "normalization_ref"];
    if (!exact5(assertion, keys) || !Array.isArray(assertion.expected_members) || assertion.kind === "set_contains" && assertion.expected_members.length === 0 || !uniqueTyped(assertion.expected_members) || assertion.kind === "set_equals" && typeof assertion.order_sensitive !== "boolean") return fail();
    resolveSemanticRuleRef(assertion.normalization_ref, "value_normalization", context.semanticRuleIndex);
  } else if (assertion.kind === "count_equals" || assertion.kind === "count_at_least") {
    const field = assertion.kind === "count_equals" ? "expected_count" : "minimum_count";
    if (!exact5(assertion, ["kind", field]) || !Number.isSafeInteger(assertion[field]) || assertion[field] < 0) return fail();
  } else if (assertion.kind === "transition") {
    const keys = assertion.trigger_step_client_key ? ["kind", "from_state", "to_state", "trigger_action_ref", "trigger_step_client_key"] : ["kind", "from_state", "to_state", "trigger_action_ref"];
    if (!exact5(assertion, keys) || !validateTypedValue(assertion.from_state) || !validateTypedValue(assertion.to_state) || !nonblank6(assertion.trigger_action_ref?.action_id) || assertion.trigger_action_ref.semantic_root_digest !== context.semanticRootDigest || assertion.trigger_step_client_key !== void 0 && !nonblank6(assertion.trigger_step_client_key)) return fail();
  } else if (assertion.kind === "cross_surface_equals") {
    if (!exact5(assertion, ["kind", "field_correspondence_id"]) || !context.fieldCorrespondenceIds?.includes(assertion.field_correspondence_id)) return fail();
  } else if (assertion.kind === "permission") {
    if (!/** @type {Array<Record<string,any>>|undefined} */
    context.permissionDecisionCells?.some((cell) => canonicalV5Stringify(cell) === canonicalV5Stringify(assertion.decision_cell_ref))) return fail("Permission decision cell is not accepted.");
    if (assertion.expected === "allow") {
      if (!exact5(assertion, ["kind", "expected", "decision_cell_ref"])) return fail();
    } else if (assertion.expected === "deny") {
      if (!exact5(assertion, ["kind", "expected", "decision_cell_ref", "denial_behavior"]) || !object5(assertion.denial_behavior)) return fail();
      if (assertion.denial_behavior.kind === "not_required") {
        if (!exact5(assertion.denial_behavior, ["kind"])) return fail();
      } else if (assertion.denial_behavior.kind === "required") {
        if (!exact5(assertion.denial_behavior, ["kind", "denial_required_cell_key", "denial_contract_ref"]) || assertion.denial_behavior.denial_contract_ref?.ref?.contract_kind !== "denial_behavior" || assertion.denial_behavior.denial_contract_ref.ref.semantic_root_digest !== context.semanticRootDigest) return fail();
      } else return fail();
    } else return fail();
  } else return fail();
  return structuredClone(assertion);
}
function validateObservation(observation, context) {
  if (!object5(observation) || !["ui", "response", "storage", "event", "system_state"].includes(observation.kind) || !nonblank6(observation.logical_surface_ref) || !nonblank6(observation.subject_ref)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation reference is invalid.");
  const common = ["kind", "logical_surface_ref", "subject_ref", ...Object.hasOwn(observation, "field_path") ? ["field_path"] : []];
  if (Object.hasOwn(observation, "field_path") && !nonblank6(observation.field_path)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation field path must be nonblank when present.");
  if (observation.kind === "ui") {
    if (!exact5(observation, [...common, "locator_contract_ref"])) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "UI observation has non-contract fields.");
    resolveSemanticRuleRef(observation.locator_contract_ref, "locator", context.semanticRuleIndex);
  } else if (!exact5(observation, common)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation has non-contract fields.");
}
function validateTypedOracle(oracle, context) {
  const keys = ["oracle_client_key", "oracle_semantic_contract_id", "observe_after_step_client_key", "observation_ref", "assertion", "evaluation_scope", "observation_window", "claim_ids"];
  if (!object5(oracle) || !exact5(oracle, keys) || !nonblank6(oracle.oracle_client_key) || !context.oracleSemanticContractIds.includes(oracle.oracle_semantic_contract_id) || !context.stepClientKeys.includes(oracle.observe_after_step_client_key) || !Array.isArray(oracle.claim_ids) || oracle.claim_ids.length === 0 || oracle.claim_ids.some((id) => !context.acceptedClaimIds.includes(id)) || new Set(oracle.claim_ids).size !== oracle.claim_ids.length) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Typed Oracle ownership or evidence binding is invalid.");
  validateObservation(oracle.observation_ref, context);
  validateOracleAssertion(oracle.assertion, context);
  if (oracle.assertion.kind === "transition" && oracle.assertion.trigger_step_client_key !== oracle.observe_after_step_client_key) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Transition trigger and observation step must be explicitly bound.");
  const window = oracle.observation_window;
  if (!object5(window) || !(["after_step"].includes(window.kind) ? exact5(window, ["kind"]) : ["within", "stable_for"].includes(window.kind) ? exact5(window, ["kind", "duration_ms"]) && Number.isSafeInteger(window.duration_ms) && window.duration_ms > 0 : window.kind === "until_signal" ? exact5(window, ["kind", "signal_ref", "timeout_ms"]) && nonblank6(window.signal_ref) && Number.isSafeInteger(window.timeout_ms) && window.timeout_ms > 0 : false)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle observation window is invalid.");
  if (!(oracle.evaluation_scope?.kind === "single" && exact5(oracle.evaluation_scope, ["kind"])) && !(oracle.evaluation_scope?.kind === "forall" && exact5(oracle.evaluation_scope, ["kind", "population_contract_id", "population_proof_id"]) && nonblank6(oracle.evaluation_scope.population_contract_id) && nonblank6(oracle.evaluation_scope.population_proof_id))) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle evaluation scope is invalid.");
  return structuredClone(oracle);
}

// src/v5/case-compiler.mjs
function object6(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function nonblank7(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function unique(values, name) {
  if (new Set(values).size !== values.length || values.some((value) => !nonblank7(value))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", `${name} must be a unique nonblank set.`);
  return [...values].sort();
}
function records(value) {
  return Array.isArray(value) ? (
    /** @type {Array<Record<string,any>>} */
    value
  ) : [];
}
function legacyStableId(prefix, payload) {
  return `${prefix}-${canonicalObjectDigest(payload).slice(7)}`;
}
function deriveCoverage(input, cases) {
  const caseByPoint = new Map(cases.filter((current) => current.semantic_status !== "Exploratory").map((current) => [current.primary_test_point_id, current]));
  const formalIds = unique(input.formal_test_point_ids ?? [], "Formal Test Point IDs");
  const formal = { total: formalIds.length, covered: 0, blocked: 0, not_applicable: 0 };
  for (const id of formalIds) {
    const current = caseByPoint.get(id);
    if (!current) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every formal Test Point must have one Case or exclusion projection.");
    if (["Grounded", "Conditional"].includes(current.semantic_status)) formal.covered += 1;
    else if (current.semantic_status === "Blocked") formal.blocked += 1;
    else if (current.semantic_status === "NotApplicable") formal.not_applicable += 1;
  }
  const summarize = (rows) => ({
    total: rows.length,
    covered: rows.filter((row) => row.disposition === "covered").length,
    gap: rows.filter((row) => row.disposition === "gap").length,
    not_applicable: rows.filter((row) => row.disposition === "not_applicable").length
  });
  const permissionRows = records(input.permission_cells);
  const permission = {
    total: permissionRows.length,
    covered: permissionRows.filter((row) => row.disposition === "formal").length,
    gap: permissionRows.filter((row) => row.disposition === "semantic_gap").length,
    not_applicable: permissionRows.filter((row) => row.disposition === "not_applicable").length
  };
  return {
    formal_test_point: formal,
    semantic_partition: summarize(records(input.semantic_partitions)),
    value_instance: summarize(records(input.value_instances)),
    permission_cell: permission,
    risk_review: { reviewed: Number(input.risk_ledger?.reviewed_cell_count ?? 0), material_items: records(input.risk_ledger?.items).length }
  };
}
function derivePermissionCoverage(cells) {
  const dimensions = ["decision", "denial_behavior", "data_scope"];
  const result = {};
  for (const dimension of dimensions) {
    const rows = cells.filter((cell) => cell.permission_dimension === dimension);
    result[dimension] = {
      required: rows.length,
      formal: rows.filter((cell) => cell.disposition === "formal").length,
      semantic_gap: rows.filter((cell) => cell.disposition === "semantic_gap").length,
      not_applicable: rows.filter((cell) => cell.disposition === "not_applicable").length,
      ...dimension === "decision" ? { outcomes: Object.fromEntries(rows.filter((cell) => cell.disposition === "formal").map((cell) => [`${cell.action_ref}:${cell.expected}`, 1])) } : {}
    };
  }
  return result;
}
function compileV5CaseDocument(input) {
  if (!object6(input) || !nonblank7(input.case_document_lineage_id) || !/^sha256:[0-9a-f]{64}$/u.test(input.semantic_root_digest) || !Number.isSafeInteger(input.source_revision) || input.source_revision < 0 || !Array.isArray(input.case_drafts)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case compilation input is invalid.");
  const assessmentByClaim = /* @__PURE__ */ new Map();
  for (const assessment of records(input.claim_assessments)) {
    if (!nonblank7(assessment.claim_id) || assessmentByClaim.has(assessment.claim_id) || !["E1", "E2", "E3"].includes(assessment.level) || !["supported", "uncertain", "unsupported"].includes(assessment.support_review)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Claim assessment inventory is invalid or ambiguous.");
    assessmentByClaim.set(assessment.claim_id, assessment);
  }
  const acceptedGapIds = new Set(unique(input.accepted_gap_ids ?? [], "Accepted gap IDs"));
  const seenClientKeys = /* @__PURE__ */ new Set();
  const cases = input.case_drafts.map((draft) => {
    if (!nonblank7(draft.case_client_key) || seenClientKeys.has(draft.case_client_key) || !nonblank7(draft.title) || !nonblank7(draft.module_id) || !["P0", "P1", "P2", "P3"].includes(draft.priority) || !nonblank7(draft.primary_test_point_id) || !Array.isArray(draft.steps) || draft.steps.length === 0 || !Array.isArray(draft.oracles) || draft.oracles.length === 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case Draft is incomplete or duplicates a client key.");
    seenClientKeys.add(draft.case_client_key);
    const claimIds = unique(draft.claim_ids ?? [], "Case Claim IDs");
    const assessments = claimIds.map((claimId) => assessmentByClaim.get(claimId));
    if (assessments.some((assessment) => !assessment || assessment.support_review !== "supported")) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Case references unsupported or unknown business evidence.");
    const gapIds = unique(draft.semantic_gap_ids ?? [], "Case semantic gap IDs");
    if (gapIds.some((gapId) => !acceptedGapIds.has(gapId))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Case references an unaccepted semantic gap.");
    const notApplicableLevels = draft.not_applicable_basis === void 0 ? void 0 : records(draft.not_applicable_basis).map((basis) => {
      const assessment = assessmentByClaim.get(basis.claim_id);
      if (basis.kind !== "claim" || !assessment || assessment.support_review !== "supported") throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "NotApplicable basis is not accepted evidence.");
      return assessment.level;
    });
    const status = deriveCaseStatus({ evidence_levels: assessments.map((assessment) => assessment.level), unresolved_gap_ids: gapIds, not_applicable_basis_levels: notApplicableLevels, exploratory_only: draft.exploratory_only === true });
    const stepKeys = unique(draft.steps.map((step) => step.step_client_key), "Case step client keys");
    const oracleContext = { semanticRootDigest: input.semantic_root_digest, semanticRuleIndex: input.semantic_rule_index ?? { by_id: {} }, stepClientKeys: stepKeys, acceptedClaimIds: claimIds, oracleSemanticContractIds: draft.oracles.map((oracle) => oracle.oracle_semantic_contract_id), fieldCorrespondenceIds: records(input.semantic_audit?.field_correspondences).map((row) => row.mapping_id), permissionDecisionCells: records(input.permission_cells).filter((cell) => cell.permission_dimension === "decision").map((cell) => ({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key })) };
    const caseAnchorDigest = canonicalObjectDigest({
      module_id: draft.module_id,
      title: draft.title,
      primary_test_point_id: draft.primary_test_point_id,
      business_preconditions: draft.business_preconditions,
      data_conditions: draft.data_conditions,
      steps: draft.steps.map((step) => ({ action: step.action, semantic_action_ref: step.semantic_action_ref, claim_ids: [...step.claim_ids].sort() })),
      oracles: draft.oracles.map((oracle) => ({ oracle_semantic_contract_id: oracle.oracle_semantic_contract_id, observation_ref: oracle.observation_ref, assertion: oracle.assertion, evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window, claim_ids: [...oracle.claim_ids].sort() })),
      population_scope: draft.population_scope,
      canonical_names: [...draft.canonical_names].sort(),
      claim_ids: claimIds,
      semantic_gap_ids: gapIds,
      semantic_status: status
    });
    const steps = draft.steps.map((step, index) => {
      if (!nonblank7(step.action) || !Array.isArray(step.claim_ids) || step.claim_ids.some((claimId) => !claimIds.includes(claimId))) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case step action or Claim binding is invalid.");
      return { step_id: legacyStableId("STEP", { case_anchor_digest: caseAnchorDigest, sequence: index + 1, action: step.action, semantic_action_ref: step.semantic_action_ref }), step_client_key: step.step_client_key, sequence: index + 1, action: step.action, semantic_action_ref: structuredClone(step.semantic_action_ref), claim_ids: [...step.claim_ids].sort() };
    });
    const stepIdByKey = new Map(steps.map((step) => [step.step_client_key, step.step_id]));
    const oracles = draft.oracles.map((oracle) => {
      validateTypedOracle(oracle, oracleContext);
      return {
        oracle_id: legacyStableId("ORACLE", { case_anchor_digest: caseAnchorDigest, oracle_semantic_contract_id: oracle.oracle_semantic_contract_id, observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key), observation_ref: oracle.observation_ref, assertion: oracle.assertion, evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window, claim_ids: [...oracle.claim_ids].sort() }),
        oracle_semantic_contract_id: oracle.oracle_semantic_contract_id,
        observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key),
        observation_ref: structuredClone(oracle.observation_ref),
        assertion: structuredClone(oracle.assertion),
        evaluation_scope: structuredClone(oracle.evaluation_scope),
        observation_window: structuredClone(oracle.observation_window),
        claim_ids: [...oracle.claim_ids].sort()
      };
    }).sort((left, right) => left.oracle_id.localeCompare(right.oracle_id));
    const identity = {
      module_id: draft.module_id,
      primary_test_point_id: draft.primary_test_point_id,
      title: draft.title,
      business_preconditions: draft.business_preconditions,
      data_conditions: draft.data_conditions,
      steps: steps.map(({ step_client_key: ignored, ...step }) => step),
      oracles,
      population_scope: draft.population_scope,
      canonical_names: [...draft.canonical_names].sort(),
      claim_ids: claimIds,
      semantic_gap_ids: gapIds,
      semantic_status: status
    };
    return {
      case_id: legacyStableId("CASE", identity),
      title: draft.title,
      module_id: draft.module_id,
      priority: draft.priority,
      primary_test_point_id: draft.primary_test_point_id,
      semantic_status: status,
      business_preconditions: structuredClone(draft.business_preconditions),
      data_conditions: structuredClone(draft.data_conditions),
      steps,
      oracles,
      population_scope: structuredClone(draft.population_scope),
      canonical_names: unique(draft.canonical_names, "Canonical names"),
      claim_ids: claimIds,
      semantic_gap_ids: gapIds,
      ...status === "NotApplicable" ? { not_applicable_basis: structuredClone(draft.not_applicable_basis) } : {},
      ...status === "Exploratory" ? { observation_intent: draft.observation_intent } : {}
    };
  }).sort((left, right) => left.case_id.localeCompare(right.case_id));
  if (new Set(cases.map((current) => current.case_id)).size !== cases.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Derived Case identities collide.");
  const classificationCounts = { Blocked: 0, Conditional: 0, Exploratory: 0, Grounded: 0, NotApplicable: 0 };
  for (const current of cases) classificationCounts[current.semantic_status] += 1;
  const manifestDigest = canonicalObjectDigest({ schema_version: "5.0.0", case_document_lineage_id: input.case_document_lineage_id, semantic_root_digest: input.semantic_root_digest, case_ids: cases.map((current) => current.case_id), formal_test_point_ids: [...input.formal_test_point_ids ?? []].sort() });
  const payload = {
    schema_version: "5.0.0",
    compiler_version: "0.6.0",
    delivery_intent: "case_document",
    case_document_lineage_id: input.case_document_lineage_id,
    semantic_root_digest: input.semantic_root_digest,
    source_revision: input.source_revision,
    manifest_digest: manifestDigest,
    cases,
    classification_counts: classificationCounts,
    coverage: deriveCoverage(input, cases),
    permission_coverage: derivePermissionCoverage(records(input.permission_cells)),
    risk_ledger: structuredClone(input.risk_ledger ?? { reviewed_cell_count: 0, items: [] }),
    semantic_audit: structuredClone(input.semantic_audit ?? { value_states: [], field_correspondences: [], domains: [], populations: [] }),
    provenance: { output_role: "downstream_only", may_supply_upstream_evidence: false, semantic_root_digest: input.semantic_root_digest }
  };
  return { ...payload, bundle_digest: canonicalObjectDigest(payload) };
}
function validateV5CaseDocument(document) {
  if (!object6(document) || document.schema_version !== "5.0.0" || document.compiler_version !== "0.6.0" || document.delivery_intent !== "case_document" || !Array.isArray(document.cases) || document.provenance?.output_role !== "downstream_only") throw new V5ProtocolError("CANONICAL_RENDER_MISMATCH", "Canonical V5 Case Document shape is invalid.");
  const { bundle_digest: declared, ...payload } = document;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError("CANONICAL_RENDER_MISMATCH", "Canonical V5 Case Document digest is invalid.");
  return structuredClone(document);
}
function projectCompatibilityExecutionPlan(document, metadata) {
  validateV5CaseDocument(document);
  if (!nonblank7(metadata.run_id) || !Number.isSafeInteger(metadata.revision) || metadata.revision < 0) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Execution Plan requires an immutable Case Document revision.");
  const operationKinds = ["confirm_execution_plan", "pause_execution", "provide_capability_proof", "set_execution_disposition"];
  const items = document.cases.map((current) => ({ case_id: current.case_id, title: current.title, semantic_status: current.semantic_status, execution_disposition: "pending", available_actions: current.semantic_status === "Grounded" ? ["provide_capability_proof", "set_execution_disposition"] : current.semantic_status === "NotApplicable" ? [] : ["set_execution_disposition"] }));
  const payload = {
    schema_version: "5.0.0",
    compiler_version: "0.6.0",
    delivery_intent: "execution_plan",
    case_document_ref: { run_id: metadata.run_id, revision: metadata.revision, manifest_digest: document.manifest_digest, bundle_digest: document.bundle_digest, case_document_lineage_id: document.case_document_lineage_id, schema_version: "5.0.0" },
    operation_kinds: operationKinds,
    items
  };
  return { ...payload, plan_digest: canonicalObjectDigest(payload) };
}

// src/v5/render-json.mjs
function renderV5Json(document) {
  validateV5CaseDocument(document);
  return `${canonicalV5Stringify(document)}
`;
}

// src/v5/render-markdown.mjs
var SCOPE_LABELS = (
  /** @type {Readonly<Record<string,string>>} */
  Object.freeze({ single_item: "\u5355\u9879", visible_region: "\u53EF\u89C1\u533A", current_page: "\u5F53\u524D\u9875", current_response: "\u5F53\u524D\u54CD\u5E94", all_pages: "\u5168\u5206\u9875", full_dataset: "\u5B8C\u6574\u5FEB\u7167" })
);
function assertionText(assertion) {
  if (assertion.kind === "exact_text" || assertion.kind === "semantic_text") return `${assertion.kind}: ${assertion.expected_text}`;
  if (assertion.kind === "value_equals") return `value_equals: ${canonicalV5Stringify(assertion.expected_value)}`;
  if (assertion.kind === "value_state_equals") return `value_state_equals: ${canonicalV5Stringify(assertion.expected_value_state)}`;
  if (assertion.kind === "exists" || assertion.kind === "absent") return assertion.kind;
  if (assertion.kind === "count_equals") return `count_equals: ${assertion.expected_count}`;
  if (assertion.kind === "count_at_least") return `count_at_least: ${assertion.minimum_count}`;
  if (assertion.kind === "permission") return `permission: ${assertion.expected}`;
  return `${assertion.kind}: ${canonicalV5Stringify(assertion)}`;
}
function scopeText(scope) {
  return SCOPE_LABELS[scope?.kind] ?? scope?.kind ?? "\u672A\u58F0\u660E";
}
function renderV5Markdown(document) {
  validateV5CaseDocument(document);
  const lines = [
    "# V5 Case Document",
    "",
    `- Lineage: ${document.case_document_lineage_id}`,
    `- Semantic root: ${document.semantic_root_digest}`,
    `- Bundle digest: ${document.bundle_digest}`,
    "",
    "## Classification",
    "",
    "| Status | Count |",
    "|---|---:|",
    ...Object.entries(document.classification_counts).map(([status, count]) => `| ${status} | ${count} |`),
    "",
    "## Coverage",
    "",
    "| Metric | Total | Covered | Gap/Blocked | N/A |",
    "|---|---:|---:|---:|---:|",
    `| Formal Test Point | ${document.coverage.formal_test_point.total} | ${document.coverage.formal_test_point.covered} | ${document.coverage.formal_test_point.blocked} | ${document.coverage.formal_test_point.not_applicable} |`,
    `| Semantic partition | ${document.coverage.semantic_partition.total} | ${document.coverage.semantic_partition.covered} | ${document.coverage.semantic_partition.gap} | ${document.coverage.semantic_partition.not_applicable} |`,
    `| Value instance | ${document.coverage.value_instance.total} | ${document.coverage.value_instance.covered} | ${document.coverage.value_instance.gap} | ${document.coverage.value_instance.not_applicable} |`,
    `| Permission cell | ${document.coverage.permission_cell.total} | ${document.coverage.permission_cell.covered} | ${document.coverage.permission_cell.gap} | ${document.coverage.permission_cell.not_applicable} |`,
    "",
    "## Cases",
    ""
  ];
  for (const current of document.cases) {
    lines.push(`### ${current.case_id} \u2014 ${current.title} [${current.semantic_status}]`, "");
    lines.push(`- Module: ${current.module_id}`);
    lines.push(`- Primary Test Point: ${current.primary_test_point_id}`);
    lines.push(`- Canonical names: ${current.canonical_names.join("\u3001")}`);
    lines.push(`- Scope: ${scopeText(current.population_scope)}`);
    if (current.semantic_gap_ids.length > 0) lines.push(`- Blocking gaps: ${current.semantic_gap_ids.join("\u3001")}`);
    if (current.observation_intent) lines.push(`- Observation intent: ${current.observation_intent}`);
    lines.push("", "Steps:");
    for (const step of current.steps) {
      lines.push(`${step.sequence}. ${step.action}`);
      for (const oracle of current.oracles.filter((oracle2) => oracle2.observe_after_step_id === step.step_id)) {
        lines.push(`   - Oracle ${oracle.oracle_id}: ${assertionText(oracle.assertion)}; scope=${oracle.evaluation_scope.kind}; window=${oracle.observation_window.kind}`);
      }
    }
    lines.push("");
  }
  const visibleRisks = document.risk_ledger.items.filter((risk) => risk.display_tier !== "background");
  lines.push("## Material Risks", "");
  if (visibleRisks.length === 0) lines.push("- None");
  else for (const risk of visibleRisks) lines.push(`- ${risk.risk_key}: ${risk.risk_kind} (${risk.display_tier})`);
  lines.push("");
  return `${lines.join("\n")}
`;
}

// src/v5/render-csv.mjs
function csv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function renderV5Csv(document) {
  validateV5CaseDocument(document);
  const rows = [["case_id", "semantic_status", "title", "module_id", "primary_test_point_id", "scope_kind", "canonical_names", "step_sequence", "step_id", "action", "oracle_id", "oracle_kind", "oracle_assertion"]];
  for (const current of document.cases) {
    for (const step of current.steps) {
      const oracles = current.oracles.filter((oracle) => oracle.observe_after_step_id === step.step_id);
      if (oracles.length === 0) oracles.push({});
      for (const oracle of oracles) rows.push([
        current.case_id,
        current.semantic_status,
        current.title,
        current.module_id,
        current.primary_test_point_id,
        current.population_scope.kind,
        current.canonical_names.join("|"),
        step.sequence,
        step.step_id,
        step.action,
        oracle.oracle_id ?? "",
        oracle.assertion?.kind ?? "",
        oracle.assertion ? canonicalV5Stringify(oracle.assertion) : ""
      ]);
    }
  }
  return `${rows.map((row) => row.map(csv).join(",")).join("\n")}
`;
}

// src/v5/runtime.mjs
var contracts = generateV5Contracts();
var fsmByCell = new Map(contracts.fsmRegistry.cells.map((cell) => [cell.cell_id, cell]));
var replyRows = contracts.replyContracts.rows;
function plainObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
function preRunReply(code, message) {
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === code && candidate.source.response_context === "pre_run");
  if (!row) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Pre-run reply contract is missing for ${code}.`);
  return { kind: "pre_run_error", schema_version: V5_SCHEMA_VERSION, reply_contract_id: row.reply_contract_id, reply_status: row.exact_reply_status, diagnostics: [{ code, affected_refs: [], message }] };
}
function runRejection(current, code, message, projectionKind = "persisted_run_state") {
  const cellId = current.checkpoint.fsm_cell_id;
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === code && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === cellId && candidate.exact_projection_kind === projectionKind);
  if (!row) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Run reply contract is missing for ${code}/${cellId}/${projectionKind}.`);
  return { ...structuredClone(current.reply), projection_kind: projectionKind, reply_contract_id: row.reply_contract_id, reply_status: row.exact_reply_status, available_actions: projectionKind === "read_only_terminal_rejection" ? [] : structuredClone(current.reply.available_actions), diagnostics: [{ code, affected_refs: [], message }], commit_receipt: null };
}
async function persistRunRejection(current, request, code, message) {
  const reply = runRejection(current, code, message);
  const internalReceipt = { kind: "operational_commit", committed_action_digest: actionDigestV5("advance", request.action), semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "idempotency_only" };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: current.checkpoint, selectorSidecar: current.selectorSidecar, reply, commitReceipt: internalReceipt });
}
async function persistOracleReroute(current, request, message) {
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === "ORACLE_SEMANTICS_REQUIRED" && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id);
  if (!row || row.exact_commit.kind !== "operational_commit") throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Oracle reroute reply contract is unavailable.");
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, "seed_digest");
  const workPacket = { kind: "behavior_work", context: current.reply.work_packet.context, permission_matrix_worklists: [], behavior_contract_worklist: seed };
  const checkpointBase = { ...current.checkpoint, fsm_cell_id: "cd.active.case.behavior", stage: row.exact_stage, obligation: row.exact_obligation };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(checkpointBase.fsm_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", request.action);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: row.exact_commit.effect };
  const reply = {
    ...structuredClone(current.reply),
    projection_kind: row.exact_projection_kind,
    reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status,
    stage: row.exact_stage,
    obligation: row.exact_obligation,
    checkpoint_digest: selectorState.checkpoint.checkpoint_digest,
    selector_snapshot_digest: selectorState.sidecar.selector_sidecar_digest,
    available_actions: selectorState.selectors,
    work_packet: workPacket,
    commit_receipt: commitReceipt,
    diagnostics: [{ code: "ORACLE_SEMANTICS_REQUIRED", affected_refs: [], message }]
  };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt });
}
function loadActionKeyring() {
  const keyring = runtimeV5ActionKeyring();
  if (keyring.current.key.length < 32) throw new V5ProtocolError("ACTION_TOKEN_KEY_UNAVAILABLE", "Configure a persistent V5 action-token master key.");
  return keyring;
}
function validateCreateRequest(request) {
  if (!plainObject2(request) || typeof request.idempotency_key !== "string" || request.idempotency_key.length === 0) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Create request is invalid.");
  if (request.delivery_intent === "case_document") {
    if (!hasExactKeys(request, ["idempotency_key", "delivery_intent", "source_bootstrap"])) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Case create request has extra or missing fields.");
    return { kind: "case_document", sourceBootstrap: validateSourceBootstrap(request.source_bootstrap) };
  }
  if (request.delivery_intent === "execution_plan") {
    if (!hasExactKeys(request, ["idempotency_key", "delivery_intent", "case_document_ref"])) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Execution create request has extra or missing fields.");
    return { kind: "execution_plan", caseDocumentRef: validateImmutableV5CaseDocumentRef(request.case_document_ref) };
  }
  if (request.creation_reason === "resume_cancelled") {
    if (!hasExactKeys(request, ["idempotency_key", "creation_reason", "parent_run_id"])) throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Resume create request has extra or missing fields.");
    if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(request.parent_run_id)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Parent run ID is invalid.");
    return { kind: "resume_cancelled", parentRunId: request.parent_run_id };
  }
  throw new V5ProtocolError("RUN_ARGUMENT_INVALID", "Create request does not match a V5 branch.");
}
function capabilitiesForCell(cellId, workPacket) {
  const cell = fsmByCell.get(cellId);
  if (!cell || cell.lifecycle !== "active") return [];
  return cell.allowed_action_template_ids.map((templateId) => {
    if (templateId === "run.cancel") return { kind: "cancel_run" };
    if (templateId === "source.submit_batch") return { kind: "submit_source_batch", request_ids: workPacket.source_requests.map((request) => request.request_id) };
    if (templateId.startsWith("artifact.submit_")) return { kind: "submit_artifact", artifact_kind: templateId.slice("artifact.submit_".length) };
    if (templateId === "clarification.preview") return { kind: "preview_clarification_response", presentation_id: workPacket.presentation.presentation_id, semantic_root_digest: workPacket.presentation.semantic_root_digest };
    if (templateId === "clarification.commit") return { kind: "commit_clarification_response", presentation_id: workPacket.presentation.presentation_id, semantic_root_digest: workPacket.presentation.semantic_root_digest, preview_digest: workPacket.clarification_preview.preview_digest };
    if (templateId === "execution.advance_closure") return { kind: "advance_execution_plan", allowed_operation_kinds: ["provide_capability_proof", "set_execution_disposition"] };
    if (templateId === "execution.confirm_or_pause") return { kind: "advance_execution_plan", allowed_operation_kinds: ["pause_execution", "confirm_execution_plan"] };
    throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Unknown action template ${templateId}.`);
  }).sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
}
function rewriteDigestRefs(value, replacements) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteDigestRefs(item, replacements));
  if (plainObject2(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteDigestRefs(child, replacements)]));
  return value;
}
async function cloneCompilerStateRecords(compilerStateDirectory, roots) {
  const records2 = [];
  const pending = [...new Set(roots)].filter((value) => /^sha256:[0-9a-f]{64}$/u.test(value));
  const visited = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const semanticDigest = pending.shift();
    if (!semanticDigest) break;
    if (visited.has(semanticDigest)) continue;
    visited.add(semanticDigest);
    const file = path5.join(compilerStateDirectory, digestFilename(semanticDigest));
    let record;
    try {
      record = JSON.parse(await readFile3(file, "utf8"));
    } catch {
      continue;
    }
    if (["clarification_preview", "pending_clarification"].includes(record.kind) || record.status === "pending" || record.status === "superseded") continue;
    records2.push({ record, semanticDigest });
    collectDigestRefs(record, pending);
  }
  return records2;
}
function collectDigestRefs(value, output) {
  if (typeof value === "string") {
    if (/^sha256:[0-9a-f]{64}$/u.test(value)) output.push(value);
    return;
  }
  if (Array.isArray(value)) for (const child of value) collectDigestRefs(child, output);
  else if (plainObject2(value)) for (const child of Object.values(value)) collectDigestRefs(child, output);
}
function checkpointSelectors(checkpoint, capabilities) {
  const sealedCheckpoint = sealV5Record(checkpoint, "checkpoint_digest");
  const issued = issueSelectors(sealedCheckpoint, capabilities, loadActionKeyring());
  return { checkpoint: sealedCheckpoint, selectors: issued.selectors, sidecar: issued.sidecar };
}
function createSourceState(request, sourceRequests) {
  const ledger = sealV5Record({
    schema_version: V5_SCHEMA_VERSION,
    source_bootstrap_digest: `sha256:${createHash7("sha256").update(canonicalV5Stringify(request.source_bootstrap)).digest("hex")}`,
    source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest,
    dispositions: [],
    accepted_source_state_digest: null,
    next_batch_request_ids: currentSourceBatch(sourceRequests).map((sourceRequest) => sourceRequest.request_id)
  }, "ledger_digest");
  return sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap: request.source_bootstrap, source_requests: sourceRequests, source_acquisition_policy: contracts.sourceAcquisitionPolicy, ledger }, "state_digest");
}
function sourceWorkPacket(state) {
  const disposed = new Set(state.ledger.dispositions.map((disposition) => disposition.request_id));
  const batch = currentSourceBatch(state.source_requests.filter((request) => !disposed.has(request.request_id)));
  return {
    kind: "source_work",
    accepted_source_state: state.ledger.accepted_source_state_digest === null ? { kind: "none" } : { kind: "partial", accepted_source_state_digest: state.ledger.accepted_source_state_digest },
    source_requests: batch,
    source_acquisition_policy: contracts.sourceAcquisitionPolicy,
    source_acquisition_state_digest: state.state_digest
  };
}
function agentVisibleCompilerRules() {
  return {
    rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
    answer_constraint_registry: contracts.answerConstraintRegistry,
    clarification_control_registry: contracts.clarificationControlRegistry,
    source_acquisition_policy: contracts.sourceAcquisitionPolicy,
    permission_derivation_registry: contracts.permissionDerivationRegistry,
    semantic_rule_index_projection: { kind: "not_available_before_behavior" }
  };
}
function compilerClarificationGaps(semanticGaps, kind) {
  return semanticGaps.map((gap) => {
    if (!plainObject2(gap.answer_contract) || typeof gap.question !== "string" || gap.question.trim().length === 0 || typeof gap.why_needed !== "string" || gap.why_needed.trim().length === 0 || !plainObject2(gap.question_impact_summary) || !plainObject2(gap.target)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "A semantic gap must provide its typed answer contract and exact clarification projection.");
    const payload = { kind, target: gap.target, answer_contract: gap.answer_contract, question: gap.question, why_needed: gap.why_needed, question_impact_summary: gap.question_impact_summary };
    const gapPayloadDigest = canonicalObjectDigest(payload);
    return { gap_binding: { kind, gap_id: `GAP-${gapPayloadDigest.slice(7)}`, gap_payload_digest: gapPayloadDigest }, answer_contract: structuredClone(gap.answer_contract), target: structuredClone(gap.target), question: gap.question, why_needed: gap.why_needed, question_impact_summary: structuredClone(gap.question_impact_summary) };
  }).sort((left, right) => left.gap_binding.gap_id.localeCompare(right.gap_binding.gap_id));
}
function persistedReply(checkpoint, workPacket, selectors, receipt, runDirectory, outcomeId, selectorSnapshotDigest) {
  const cell = fsmByCell.get(checkpoint.fsm_cell_id);
  const row = replyRows.find((candidate) => candidate.source.kind === "fsm_outcome" && candidate.source.outcome_id === outcomeId);
  if (!cell || !row || row.exact_reply_status !== cell.normal_reply_status) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "FSM reply contract is unavailable or inconsistent.");
  return {
    kind: "run_reply",
    schema_version: V5_SCHEMA_VERSION,
    projection_kind: "persisted_run_state",
    reply_contract_id: row.reply_contract_id,
    reply_status: cell.normal_reply_status,
    run_id: checkpoint.run_id,
    run_directory: runDirectory,
    case_document_lineage_id: checkpoint.case_document_lineage_id,
    delivery_intent: checkpoint.delivery_intent,
    run_lifecycle: checkpoint.run_lifecycle,
    stage: checkpoint.stage,
    obligation: checkpoint.obligation,
    current_revision: checkpoint.current_revision,
    checkpoint_digest: checkpoint.checkpoint_digest,
    selector_snapshot_digest: selectorSnapshotDigest,
    diagnostics: [],
    available_actions: selectors,
    commit_receipt: receipt,
    work_packet: workPacket
  };
}
async function resolveRunReplay(current, request) {
  const entry = current.index.entries.find((row) => row.idempotency_key === request.idempotency_key);
  if (!entry) return null;
  const submittedDigest = actionDigestV5("advance", request.action);
  if (entry.canonical_action_digest !== submittedDigest) throw new V5ProtocolError("IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different action.");
  return readCasJson(path5.join(current.layout.replies, digestFilename(entry.reply_digest)), entry.reply_digest);
}
function validateAdvertisedAction(current, action, capability) {
  const sidecarEntry = current.selectorSidecar.selectors.find((selector) => canonicalV5Stringify(selector.capability) === canonicalV5Stringify(capability));
  if (!sidecarEntry || typeof action.action_token !== "string" || sidecarEntry.token_digest !== `sha256:${createHash7("sha256").update(action.action_token).digest("hex")}`) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Action is not advertised by the current checkpoint.");
  verifySelector(current.checkpoint, capability, action.action_token, loadActionKeyring());
}
async function createV5RunDirectory(catalogRoot, requestValue) {
  try {
    const branch = validateCreateRequest(
      /** @type {Record<string, any>} */
      requestValue
    );
    const catalog = await resolveCatalogLayout(catalogRoot);
    const request = (
      /** @type {Record<string, any>} */
      requestValue
    );
    if (branch.kind === "execution_plan") return await createExecutionRun(catalog, request, branch.caseDocumentRef);
    if (branch.kind === "resume_cancelled") return await createResumedRun(catalog, request, branch.parentRunId);
    const sourceRequests = deriveSourceRequests(branch.sourceBootstrap);
    const runId = `RUN-${runtimeV5Uuid()}`;
    const lineageId = `LINEAGE-${runtimeV5Uuid()}`;
    const runDirectory = path5.join(catalog.runsDirectory, runId);
    const createPayload = {
      delivery_intent: "case_document",
      source_bootstrap: branch.sourceBootstrap,
      source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest
    };
    const createActionDigest = actionDigestV5("create", createPayload);
    const sourceState = createSourceState({ source_bootstrap: branch.sourceBootstrap }, sourceRequests);
    const selectorState = checkpointSelectors({
      kind: "v5_run_checkpoint",
      schema_version: V5_SCHEMA_VERSION,
      compiler_version: V5_COMPILER_VERSION,
      run_id: runId,
      case_document_lineage_id: lineageId,
      delivery_intent: "case_document",
      run_lifecycle: "active",
      current_revision: 0,
      fsm_cell_id: "cd.active.source.provide",
      stage: "source_acquisition",
      obligation: "provide_source_pack",
      fsm_registry_digest: contracts.fsmRegistry.registry_digest,
      rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
      source_acquisition_state_digest: sourceState.state_digest,
      accepted_artifact_digests: [],
      semantic_root_digest: null
    }, [{ kind: "submit_source_batch", request_ids: sourceWorkPacket(sourceState).source_requests.map((item) => item.request_id) }, { kind: "cancel_run" }]);
    const receipt = { kind: "operational_commit", committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "run_created" };
    const createOutcome = selectV5Outcome(contracts.fsmRegistry, { kind: "create", create_variant: "case_document", result_key: "initial" });
    const reply = persistedReply(selectorState.checkpoint, sourceWorkPacket(sourceState), selectorState.selectors, receipt, runDirectory, createOutcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
    const identity = {
      kind: "v5_run_identity",
      schema_version: V5_SCHEMA_VERSION,
      compiler_version: V5_COMPILER_VERSION,
      run_id: runId,
      delivery_intent: "case_document",
      case_document_lineage_id: lineageId,
      source_bootstrap_digest: (
        /** @type {Record<string, any>} */
        sourceState.ledger.source_bootstrap_digest
      ),
      source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest,
      canonical_create_action_digest: createActionDigest
    };
    const committed = await commitCatalogGenesis(catalog.root, {
      identity,
      checkpoint: selectorState.checkpoint,
      selectorSidecar: selectorState.sidecar,
      reply,
      idempotencyKey: request.idempotency_key,
      canonicalActionDigest: createActionDigest,
      compilerStateRecords: [{ record: sourceState, digestField: "state_digest" }]
    });
    return committed.reply;
  } catch (error) {
    if (error instanceof V5ProtocolError) {
      if (error.code === "ACTION_TOKEN_KEY_UNAVAILABLE" || error.code === "POLICY_REGISTRY_INCONSISTENT") throw error;
      return preRunReply(error.code, error.message);
    }
    throw error;
  }
}
async function createExecutionRun(catalog, request, caseDocumentRef) {
  const sourceRun = await readVerifiedRun(path5.join(catalog.runsDirectory, caseDocumentRef.run_id));
  if (sourceRun.identity.schema_version !== V5_SCHEMA_VERSION || sourceRun.identity.delivery_intent !== "case_document" || sourceRun.checkpoint.run_lifecycle !== "finished" || canonicalV5Stringify(sourceRun.checkpoint.case_document_ref) !== canonicalV5Stringify(caseDocumentRef) || typeof sourceRun.checkpoint.execution_plan_digest !== "string") throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Case Document reference is not a verified immutable V5 delivery.");
  const plan = await readSemanticV5Record(sourceRun.layout.compilerState, sourceRun.checkpoint.execution_plan_digest);
  const projection = createV5ExecutionProjection(plan);
  const runId = `RUN-${runtimeV5Uuid()}`;
  const runDirectory = path5.join(catalog.runsDirectory, runId);
  const createActionDigest = actionDigestV5("create", request);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "create", create_variant: "execution_plan", result_key: "initial" });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    kind: "v5_run_checkpoint",
    schema_version: V5_SCHEMA_VERSION,
    compiler_version: V5_COMPILER_VERSION,
    run_id: runId,
    case_document_lineage_id: caseDocumentRef.case_document_lineage_id,
    delivery_intent: "execution_plan",
    run_lifecycle: "active",
    current_revision: 0,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    fsm_registry_digest: contracts.fsmRegistry.registry_digest,
    rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
    case_document_ref: caseDocumentRef,
    execution_snapshot_digest: projection.execution_snapshot_digest,
    accepted_execution_receipt_digests: []
  };
  const workPacket = { kind: "execution_work", case_document_ref: caseDocumentRef, execution_projection: projection };
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const receipt = { kind: "operational_commit", committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "run_created" };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, receipt, runDirectory, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const identity = {
    kind: "v5_run_identity",
    schema_version: V5_SCHEMA_VERSION,
    compiler_version: V5_COMPILER_VERSION,
    run_id: runId,
    delivery_intent: "execution_plan",
    case_document_lineage_id: caseDocumentRef.case_document_lineage_id,
    case_document_ref: caseDocumentRef,
    canonical_create_action_digest: createActionDigest
  };
  return (await commitCatalogGenesis(catalog.root, {
    identity,
    checkpoint: selectorState.checkpoint,
    selectorSidecar: selectorState.sidecar,
    reply,
    idempotencyKey: request.idempotency_key,
    canonicalActionDigest: createActionDigest,
    compilerStateRecords: [{ record: projection, semanticDigest: projection.execution_snapshot_digest }]
  })).reply;
}
async function createResumedRun(catalog, request, parentRunId) {
  const parent = await readVerifiedRun(path5.join(catalog.runsDirectory, parentRunId));
  if (parent.identity.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError("UNSUPPORTED_SCHEMA_VERSION", "Only V5 parents may be resumed.");
  if (parent.checkpoint.run_lifecycle !== "cancelled" || !parent.operationalEvent || !parent.transaction.previous_run_transaction_digest) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Parent does not have a verified cancellation event.");
  const priorTransaction = await readSealedV5Record(parent.layout.transactions, parent.transaction.previous_run_transaction_digest, "transaction_digest");
  const priorCheckpoint = await readSealedV5Record(parent.layout.checkpoints, priorTransaction.checkpoint_digest, "checkpoint_digest");
  validateResumeParent({ identity: parent.identity, terminalCheckpoint: parent.checkpoint, priorCheckpoint, cancelEvent: parent.operationalEvent, previousTransactionDigest: priorTransaction.transaction_digest, canonicalCancelActionDigest: parent.operationalEvent.canonical_cancel_action_digest });
  const resumeBase = deriveResumeBase(priorCheckpoint);
  const targetCellId = resumeTargetCell(priorCheckpoint.fsm_cell_id);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "create", create_variant: "resume_cancelled", result_key: `target:${targetCellId}` });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const runId = `RUN-${runtimeV5Uuid()}`;
  const runDirectory = path5.join(catalog.runsDirectory, runId);
  const childIdentityProjection = { run_id: runId, delivery_intent: parent.identity.delivery_intent, case_document_lineage_id: parent.identity.case_document_lineage_id };
  const digestReplacements = /* @__PURE__ */ new Map();
  const acceptedArtifacts = [];
  const priorReply = await readCasJson(path5.join(parent.layout.replies, digestFilename(priorTransaction.reply_object_digest)), priorTransaction.reply_object_digest);
  let workPacket = structuredClone(priorReply.work_packet);
  if (targetCellId.endsWith(".resolve") && workPacket.kind === "clarification_confirmation_work") {
    workPacket = { kind: "clarification_work", context: workPacket.context, presentation: workPacket.presentation };
  }
  const closureRootValues = [];
  const checkpointForClosure = structuredClone(priorCheckpoint);
  for (const key of ["checkpoint_digest", "cancellation", "cancel_event_digest", "prior_fsm_cell_id", "terminal_fsm_cell_id", "preview_digest", "pending_clarification_digest"]) delete checkpointForClosure[key];
  collectDigestRefs(checkpointForClosure, closureRootValues);
  collectDigestRefs(workPacket, closureRootValues);
  const compilerStateRecords = await cloneCompilerStateRecords(parent.layout.compilerState, closureRootValues);
  const parentEnvelopes = [];
  for (const parentArtifactDigest of priorCheckpoint.accepted_artifact_digests ?? []) parentEnvelopes.push(await readSealedV5Record(parent.layout.acceptedArtifacts, parentArtifactDigest, "envelope_digest"));
  parentEnvelopes.sort((left, right) => left.accepted_revision - right.accepted_revision || left.envelope_digest.localeCompare(right.envelope_digest));
  for (const parentEnvelope of parentEnvelopes) {
    const projection = createResumeInheritanceProjection({ parentRunId, childRunId: runId, parentCheckpointDigest: priorCheckpoint.checkpoint_digest, parentCancelEventDigest: parent.operationalEvent.cancel_event_digest, caseDocumentLineageId: parent.identity.case_document_lineage_id, inheritedObject: { kind: "artifact", parent_artifact_digest: parentEnvelope.envelope_digest, artifact_kind: parentEnvelope.artifact_kind, canonical_payload_digest: parentEnvelope.canonical_payload_digest } });
    const childEnvelope = projectInheritedArtifact(parentEnvelope, projection, childIdentityProjection, digestReplacements);
    digestReplacements.set(parentEnvelope.envelope_digest, childEnvelope.envelope_digest);
    acceptedArtifacts.push({ record: childEnvelope, digestField: "envelope_digest" });
    compilerStateRecords.push({ record: projection, digestField: "projection_record_digest" });
  }
  const projectedExecutionReceiptDigests = [];
  for (const parentReceiptDigest of priorCheckpoint.accepted_execution_receipt_digests ?? []) {
    const receipt2 = await readSemanticV5Record(parent.layout.compilerState, parentReceiptDigest);
    const canonicalReceiptPayloadDigest = canonicalExistingExecutionReceiptPayloadDigest(receipt2);
    const projection = createResumeInheritanceProjection({ parentRunId, childRunId: runId, parentCheckpointDigest: priorCheckpoint.checkpoint_digest, parentCancelEventDigest: parent.operationalEvent.cancel_event_digest, caseDocumentLineageId: parent.identity.case_document_lineage_id, inheritedObject: { kind: "existing_execution_receipt", parent_receipt_digest: parentReceiptDigest, receipt_kind: receipt2.kind, canonical_receipt_payload_digest: canonicalReceiptPayloadDigest } });
    const childReceipt = projectInheritedExecutionReceipt(receipt2, projection, childIdentityProjection);
    const childReceiptDigest = canonicalObjectDigest(childReceipt);
    digestReplacements.set(parentReceiptDigest, childReceiptDigest);
    projectedExecutionReceiptDigests.push(childReceiptDigest);
    compilerStateRecords.push({ record: projection, digestField: "projection_record_digest" }, { record: childReceipt, semanticDigest: childReceiptDigest });
  }
  workPacket = /** @type {Record<string,any>} */
  rewriteDigestRefs(workPacket, digestReplacements);
  const inherited = (
    /** @type {Record<string,any>} */
    rewriteDigestRefs(priorCheckpoint, digestReplacements)
  );
  const checkpointBase = {
    ...inherited,
    run_id: runId,
    run_lifecycle: "active",
    current_revision: 0,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    accepted_artifact_digests: acceptedArtifacts.map((item) => item.record.envelope_digest).sort(),
    ...priorCheckpoint.delivery_intent === "execution_plan" ? { accepted_execution_receipt_digests: projectedExecutionReceiptDigests.sort() } : {},
    resume_lineage: { creation_reason: "resume_cancelled", parent_run_id: parentRunId, parent_cancel_event_digest: parent.operationalEvent.cancel_event_digest, resume_base: resumeBase }
  };
  for (const key of ["checkpoint_digest", "cancellation", "cancel_event_digest", "prior_fsm_cell_id", "terminal_fsm_cell_id", "preview_digest", "pending_clarification_digest"]) delete checkpointBase[key];
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const createActionDigest = actionDigestV5("create", request);
  const receipt = { kind: "operational_commit", committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "run_created" };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, receipt, runDirectory, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const identity = {
    kind: "v5_run_identity",
    schema_version: V5_SCHEMA_VERSION,
    compiler_version: V5_COMPILER_VERSION,
    run_id: runId,
    delivery_intent: parent.identity.delivery_intent,
    case_document_lineage_id: parent.identity.case_document_lineage_id,
    resume_lineage: checkpointBase.resume_lineage,
    canonical_create_action_digest: createActionDigest
  };
  return (await commitCatalogGenesis(catalog.root, {
    identity,
    checkpoint: selectorState.checkpoint,
    selectorSidecar: selectorState.sidecar,
    reply,
    idempotencyKey: request.idempotency_key,
    canonicalActionDigest: createActionDigest,
    compilerStateRecords,
    acceptedArtifacts
  })).reply;
}
async function advanceV5Run(runDirectory, requestValue) {
  let current;
  try {
    current = await readVerifiedRun(runDirectory);
  } catch (error) {
    if (error instanceof V5ProtocolError) return preRunReply(error.code, error.message);
    throw error;
  }
  if (!plainObject2(requestValue) || !hasExactKeys(requestValue, ["idempotency_key", "action"]) || typeof requestValue.idempotency_key !== "string" || requestValue.idempotency_key.length === 0 || !plainObject2(requestValue.action)) return runRejection(current, "SCHEMA_VALIDATION_FAILED", "Advance request is invalid.");
  const request = (
    /** @type {Record<string, any>} */
    requestValue
  );
  try {
    const replay = await resolveRunReplay(current, request);
    if (replay) return replay;
    if (current.identity.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError("UNSUPPORTED_SCHEMA_VERSION", "Only V5 runs are operational.");
    if (current.checkpoint.run_lifecycle !== "active") return runRejection(current, "ACTION_NOT_ADVERTISED", "Terminal runs do not accept new actions.", "read_only_terminal_rejection");
    const action = request.action;
    const template = actionTemplateForV5Action(contracts.fsmRegistry, current.checkpoint.fsm_cell_id, action);
    if (template.template_id === "source.submit_batch") return await advanceSourceBatch(current, request);
    if (template.template_id === "artifact.submit_evidence_claims") return await advanceEvidenceClaims(current, request);
    if (template.template_id === "artifact.submit_behavior_views") return await advanceBehaviorViews(current, request);
    if (template.template_id === "artifact.submit_case_drafts") return await advanceCaseDrafts(current, request);
    if (template.template_id === "clarification.preview") return await advanceClarificationPreview(current, request);
    if (template.template_id === "clarification.commit") return await advanceClarificationCommit(current, request);
    if (template.template_id === "execution.advance_closure" || template.template_id === "execution.confirm_or_pause") return await advanceExecution(current, request, template.template_id);
    if (template.template_id === "run.cancel") return await advanceCancel(current, request);
    throw new V5ProtocolError("ACTION_NOT_ADVERTISED", `Action handler ${template.template_id} is not installed.`);
  } catch (error) {
    if (!(error instanceof V5ProtocolError)) throw error;
    if (error.code === "ACTION_TOKEN_KEY_UNAVAILABLE") throw error;
    if (error.code === "IDEMPOTENCY_CONFLICT") return runRejection(current, error.code, error.message);
    if (error.code === "ORACLE_SEMANTICS_REQUIRED" && current.checkpoint.fsm_cell_id === "cd.active.case.drafts") return persistOracleReroute(current, request, error.message);
    return persistRunRejection(current, request, error.code, error.message);
  }
}
async function advanceExecution(current, request, templateId) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "operation"]) || action.kind !== "advance_execution_plan" || !plainObject2(action.operation)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Execution action is not a closed operation wrapper.");
  const capability = { kind: "advance_execution_plan", allowed_operation_kinds: templateId === "execution.advance_closure" ? ["provide_capability_proof", "set_execution_disposition"] : ["pause_execution", "confirm_execution_plan"] };
  validateAdvertisedAction(current, action, capability);
  const advanced = await advanceV5ExecutionProjection(current.reply.work_packet.execution_projection, action.operation);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: templateId, result_key: advanced.result_key });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    execution_snapshot_digest: advanced.projection.execution_snapshot_digest,
    accepted_execution_receipt_digests: advanced.receipt ? [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_execution_receipt_digests ?? [], advanced.receipt.receipt_digest])].sort() : current.checkpoint.accepted_execution_receipt_digests
  };
  delete checkpointBase.checkpoint_digest;
  if (targetCell.lifecycle !== "active") checkpointBase.run_lifecycle = targetCell.lifecycle;
  const workPacket = targetCell.lifecycle === "finished" ? { kind: "terminal_work", terminal_kind: "execution_plan_finished", case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection } : { kind: "execution_work", case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection };
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const compilerStateRecords = [{ record: advanced.projection, semanticDigest: advanced.projection.execution_snapshot_digest }];
  if (advanced.receipt) compilerStateRecords.push({ record: advanced.receipt, semanticDigest: advanced.receipt.receipt_digest });
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}
async function clarificationState(current) {
  const stateSet = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.question_part_state_set_digest);
  const presentation = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.presentation_digest);
  const inventory = await readSealedV5Record(current.layout.compilerState, current.checkpoint.clarification_gaps_digest, "gaps_digest");
  return { stateSet, presentation, gaps: inventory.gaps };
}
async function advanceClarificationPreview(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "presentation_id", "semantic_root_digest", "preview_intent", "raw_response", "proposed_units"]) || !["apply_units", "discard_pending"].includes(action.preview_intent) || typeof action.raw_response !== "string" || !Array.isArray(action.proposed_units) || action.preview_intent === "discard_pending" && action.proposed_units.length !== 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Clarification preview action is invalid.");
  validateAdvertisedAction(current, action, { kind: "preview_clarification_response", presentation_id: current.reply.work_packet.presentation.presentation_id, semantic_root_digest: current.reply.work_packet.presentation.semantic_root_digest });
  const { stateSet, presentation, gaps } = await clarificationState(current);
  const fromConfirm = current.checkpoint.fsm_cell_id.endsWith(".confirm");
  let resultKey;
  let workPacket;
  let compilerStateRecords = [];
  const checkpointBase = { ...current.checkpoint };
  if (action.preview_intent === "discard_pending") {
    resultKey = "discard_pending";
    if (fromConfirm) {
      const pending = await readSealedV5Record(current.layout.compilerState, current.checkpoint.pending_clarification_digest, "pending_record_digest");
      const superseded = discardPendingClarification(pending);
      const { pending_record_digest: ignored, ...payload } = superseded;
      const sealed = sealV5Record(payload, "pending_record_digest");
      compilerStateRecords.push({ record: sealed, digestField: "pending_record_digest" });
    }
    workPacket = { kind: "clarification_work", context: current.reply.work_packet.context, presentation };
    delete checkpointBase.preview_digest;
    delete checkpointBase.pending_clarification_digest;
  } else {
    const result = previewClarificationResponse({ raw_response: action.raw_response, presentation, state_set: stateSet, gaps, units: action.proposed_units, control_registry: contracts.clarificationControlRegistry, answer_registry: contracts.answerConstraintRegistry, base_checkpoint_digest: current.checkpoint.checkpoint_digest });
    resultKey = "semantic_change";
    const pending = sealV5Record(result.pending, "pending_record_digest");
    checkpointBase.preview_digest = result.preview.preview_digest;
    checkpointBase.pending_clarification_digest = pending.pending_record_digest;
    compilerStateRecords = [{ record: result.preview, semanticDigest: result.preview.preview_digest }, { record: pending, digestField: "pending_record_digest" }];
    workPacket = { kind: "clarification_confirmation_work", context: current.reply.work_packet.context, presentation, clarification_preview: result.preview };
  }
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "clarification.preview", result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  delete checkpointBase.checkpoint_digest;
  checkpointBase.fsm_cell_id = outcome.target_cell_id;
  checkpointBase.stage = targetCell.stage;
  checkpointBase.obligation = targetCell.obligation;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}
async function advanceClarificationCommit(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "presentation_id", "semantic_root_digest", "preview_digest", "raw_confirmation", "confirmation_range"]) || typeof action.raw_confirmation !== "string" || !plainObject2(action.confirmation_range)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Clarification commit action is invalid.");
  validateAdvertisedAction(current, action, { kind: "commit_clarification_response", presentation_id: current.reply.work_packet.presentation.presentation_id, semantic_root_digest: current.reply.work_packet.presentation.semantic_root_digest, preview_digest: current.reply.work_packet.clarification_preview.preview_digest });
  const { stateSet, presentation, gaps } = await clarificationState(current);
  const preview = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.preview_digest);
  const pending = await readSealedV5Record(current.layout.compilerState, current.checkpoint.pending_clarification_digest, "pending_record_digest");
  const committed = commitClarificationResponse({ pending, preview, state_set: stateSet, raw_confirmation: action.raw_confirmation, confirmation_range: action.confirmation_range, control_registry: contracts.clarificationControlRegistry, current: { semantic_root_digest: current.checkpoint.semantic_root_digest, presentation_digest: current.checkpoint.presentation_digest, question_part_state_set_digest: current.checkpoint.question_part_state_set_digest, source_revision: current.checkpoint.current_revision, checkpoint_digest: pending.base_checkpoint_digest } });
  const unresolved = committed.next_state_set.parts.some((part) => ["presented", "deferred_by_user", "unknown_by_user"].includes(part.current_state));
  const invalidated = new Set(preview.deterministic_projection.invalidated_artifact_ids ?? []);
  const requirementsStage = current.checkpoint.stage === "requirements_analysis";
  let resultKey;
  if (unresolved) resultKey = "actionable_gaps";
  else if (requirementsStage) resultKey = invalidated.size > 0 ? "requirements_review_invalidated" : "requirements_ready";
  else if ([...invalidated].some((ref) => String(ref).includes("requirements"))) resultKey = "requirements_invalidated";
  else if ([...invalidated].some((ref) => String(ref).includes("behavior"))) resultKey = "behavior_invalidated";
  else resultKey = current.checkpoint.case_document_ref ? "all_gates_passed" : "case_drafts_required";
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "clarification.commit", result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  let nextPresentation = presentation;
  let workPacket;
  if (targetCell.work_packet_kind === "clarification_work") {
    nextPresentation = createClarificationPresentation(committed.next_state_set, current.checkpoint.current_revision + 1, gaps);
    workPacket = { kind: "clarification_work", context: current.reply.work_packet.context, presentation: nextPresentation };
  } else if (targetCell.work_packet_kind === "semantic_review_work") {
    const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, "seed_digest");
    workPacket = { kind: "semantic_review_work", context: current.reply.work_packet.context, semantic_review_seed: seed };
  } else if (targetCell.work_packet_kind === "behavior_work") {
    const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, "seed_digest");
    workPacket = { kind: "behavior_work", context: current.reply.work_packet.context, permission_matrix_worklists: [], behavior_contract_worklist: seed };
  } else if (targetCell.work_packet_kind === "case_work") workPacket = { kind: "case_work", context: current.reply.work_packet.context };
  else throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Clarification cannot terminalize without a compiled delivery.");
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision + 1,
    semantic_root_digest: committed.impact.after_graph_digest,
    question_part_state_set_digest: committed.next_state_set.state_set_digest,
    presentation_digest: nextPresentation.presentation_digest,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    accepted_decision_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_decision_digests ?? [], ...committed.decisions.map((decision) => decision.decision_digest)])].sort()
  };
  for (const key of ["checkpoint_digest", "preview_digest", "pending_clarification_digest"]) delete checkpointBase[key];
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "clarification_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const compilerStateRecords = [
    { record: committed.next_state_set, semanticDigest: committed.next_state_set.state_set_digest },
    { record: nextPresentation, semanticDigest: nextPresentation.presentation_digest },
    { record: { ...committed.impact, impact_digest: canonicalObjectDigest(committed.impact) }, semanticDigest: canonicalObjectDigest(committed.impact) },
    ...committed.decisions.map((decision) => ({ record: decision, semanticDigest: decision.decision_digest }))
  ];
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}
async function acceptedSourceContext(current) {
  const sourcePacks = [];
  for (const artifactDigest of current.checkpoint.accepted_artifact_digests) {
    const envelope = await readSealedV5Record(current.layout.acceptedArtifacts, artifactDigest, "envelope_digest");
    if (envelope.artifact_kind === "source_pack") sourcePacks.push({ artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload });
  }
  return { accepted_source_state_digest: current.checkpoint.accepted_source_state_digest, source_packs: sourcePacks.sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest)) };
}
async function advanceEvidenceClaims(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "artifact_kind", "artifact"]) || action.artifact_kind !== "evidence_claims" || !plainObject2(action.artifact)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Evidence Claims action is not a closed submit_artifact request.");
  validateAdvertisedAction(current, action, { kind: "submit_artifact", artifact_kind: "evidence_claims" });
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, "seed_digest");
  const validated = validateSemanticReviews(seed, action.artifact, { acceptedDecisionIds: [] });
  const { term_registry: provisionalTermRegistry, ...acceptedPayload } = (
    /** @type {Record<string,any>} */
    validated
  );
  const envelope = acceptArtifactEnvelope({ artifactKind: "evidence_claims", payload: acceptedPayload, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "requirements_analysis", inputDigests: [seed.seed_digest, current.checkpoint.accepted_source_state_digest] });
  const semanticRootDigest = canonicalObjectDigest({
    namespace: "generate-test-cases/v5/semantic-root",
    format_version: 1,
    accepted_source_state_digest: current.checkpoint.accepted_source_state_digest,
    evidence_claims_payload_digest: envelope.canonical_payload_digest,
    decision_ids: []
  });
  const termRegistry = sealV5Record({ semantic_root_digest: semanticRootDigest, entries: provisionalTermRegistry.entries }, "registry_digest");
  const ruleIndex = createSemanticRuleIndex(semanticRootDigest, { registry_digest: `sha256:${"0".repeat(64)}`, registered_rules: [], accepted_rule_contract_refs: [] });
  const requirements = (acceptedPayload.claims ?? []).map((claim) => ({
    contract_kind: "oracle_semantics",
    subject_ref: claim.subject_ref ?? claim.claim_client_key,
    intent_ref: claim.intent_ref ?? claim.claim_client_key,
    basis: claim.basis ?? [{ kind: "claim", claim_id: claim.claim_client_key }],
    oracle_gap_catalog: { observation_candidates: [], assertion_candidates: [], scope_candidates: [], window_candidates: [] }
  }));
  const behaviorSeed = deriveBehaviorContractSeed(semanticRootDigest, { semanticRuleIndex: ruleIndex, riskModuleIds: [...new Set(requirements.map((item) => item.subject_ref))], requirements });
  const hasGaps = Array.isArray(acceptedPayload.semantic_gaps) && acceptedPayload.semantic_gaps.length > 0;
  const clarificationGaps = hasGaps ? compilerClarificationGaps(acceptedPayload.semantic_gaps, "requirements_gap") : [];
  const gapInventory = hasGaps ? sealV5Record({ kind: "clarification_gap_inventory", schema_version: V5_SCHEMA_VERSION, semantic_root_digest: semanticRootDigest, gaps: clarificationGaps }, "gaps_digest") : null;
  const questionPartStateSet = hasGaps ? createQuestionPartStateSet(current.identity.case_document_lineage_id, semanticRootDigest, clarificationGaps) : null;
  const presentation = hasGaps && questionPartStateSet ? createClarificationPresentation(questionPartStateSet, current.checkpoint.current_revision + 1, clarificationGaps) : null;
  if (hasGaps && (!gapInventory || !questionPartStateSet || !presentation)) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Clarification projections are incomplete.");
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "artifact.submit_evidence_claims", result_key: hasGaps ? "actionable_gaps" : "no_actionable_gap" });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    semantic_root_digest: semanticRootDigest,
    accepted_artifact_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    evidence_claims_artifact_digest: envelope.envelope_digest,
    term_registry_digest: termRegistry.registry_digest,
    behavior_contract_seed_digest: behaviorSeed.seed_digest,
    ...hasGaps ? { clarification_gaps_digest: (
      /** @type {Record<string,any>} */
      gapInventory.gaps_digest
    ), question_part_state_set_digest: (
      /** @type {Record<string,any>} */
      questionPartStateSet.state_set_digest
    ), presentation_digest: (
      /** @type {Record<string,any>} */
      presentation.presentation_digest
    ) } : {}
  };
  delete checkpointBase.checkpoint_digest;
  const capabilities = hasGaps ? [{ kind: "preview_clarification_response", presentation_id: (
    /** @type {Record<string,any>} */
    presentation.presentation_id
  ), semantic_root_digest: semanticRootDigest }, { kind: "cancel_run" }] : [{ kind: "submit_artifact", artifact_kind: "behavior_views" }, { kind: "cancel_run" }];
  const selectorState = checkpointSelectors(checkpointBase, capabilities);
  const source = await acceptedSourceContext(current);
  const context = {
    source,
    semantics: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload },
    term_registry: { artifact_digest: termRegistry.registry_digest, accepted_revision: envelope.accepted_revision, payload: termRegistry },
    compiler_rules: { ...agentVisibleCompilerRules(), semantic_rule_index_projection: { kind: "available", index: ruleIndex } }
  };
  const workPacket = hasGaps ? { kind: "clarification_work", context, presentation } : { kind: "behavior_work", context, permission_matrix_worklists: [], behavior_contract_worklist: behaviorSeed };
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(
    current.layout.root,
    /** @type {{idempotency_key:string,action:Record<string,any>}} */
    request,
    {
      checkpoint: selectorState.checkpoint,
      selectorSidecar: selectorState.sidecar,
      reply,
      commitReceipt,
      acceptedArtifacts: [{ record: envelope, digestField: "envelope_digest" }],
      compilerStateRecords: [
        { record: termRegistry, digestField: "registry_digest" },
        { record: behaviorSeed, digestField: "seed_digest" },
        ...hasGaps ? [{ record: (
          /** @type {Record<string,any>} */
          gapInventory
        ), digestField: "gaps_digest" }, { record: (
          /** @type {Record<string,any>} */
          questionPartStateSet
        ), semanticDigest: (
          /** @type {Record<string,any>} */
          questionPartStateSet.state_set_digest
        ) }, { record: (
          /** @type {Record<string,any>} */
          presentation
        ), semanticDigest: (
          /** @type {Record<string,any>} */
          presentation.presentation_digest
        ) }] : []
      ]
    }
  );
}
async function advanceBehaviorViews(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "artifact_kind", "artifact"]) || action.artifact_kind !== "behavior_views" || !plainObject2(action.artifact)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Behavior Views action is not a closed submit_artifact request.");
  validateAdvertisedAction(current, action, { kind: "submit_artifact", artifact_kind: "behavior_views" });
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, "seed_digest");
  if (action.artifact.behavior_contract_seed_digest !== seed.seed_digest || !Array.isArray(action.artifact.contract_reviews) || !Array.isArray(action.artifact.risk_reviews)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Behavior Views must bind the advertised seed and complete review arrays.");
  validateBehaviorContractReviews(seed, action.artifact.contract_reviews, action.artifact);
  const riskLedger = validateRiskReviews(current.checkpoint.semantic_root_digest, seed.risk_review_module_ids, action.artifact.risk_reviews);
  const envelope = acceptArtifactEnvelope({ artifactKind: "behavior_views", payload: action.artifact, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "case_design", inputDigests: [seed.seed_digest, current.checkpoint.semantic_root_digest] });
  const semanticGaps = Array.isArray(action.artifact.semantic_gaps) ? action.artifact.semantic_gaps : [];
  const reviewHasGap = action.artifact.contract_reviews.some((review) => review.disposition?.kind === "semantic_gap");
  const hasGaps = reviewHasGap || semanticGaps.length > 0;
  if (reviewHasGap && semanticGaps.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Behavior semantic-gap reviews require exact gap payloads.");
  const resultKey = hasGaps ? "actionable_gaps" : "no_actionable_gap";
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "artifact.submit_behavior_views", result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const testObligations = sealV5Record({ kind: "test_obligations", schema_version: V5_SCHEMA_VERSION, semantic_root_digest: current.checkpoint.semantic_root_digest, formal_test_point_ids: [...new Set(action.artifact.formal_test_point_ids ?? [])].sort(), behavior_artifact_digest: envelope.envelope_digest }, "obligations_digest");
  const compilerStateRecords = [{ record: testObligations, digestField: "obligations_digest" }, { record: riskLedger, semanticDigest: canonicalObjectDigest(riskLedger) }];
  let workPacket;
  const context = {
    ...current.reply.work_packet.context,
    behavior: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload },
    test_obligations: { artifact_digest: testObligations.obligations_digest, accepted_revision: envelope.accepted_revision, payload: testObligations }
  };
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    accepted_artifact_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    behavior_views_artifact_digest: envelope.envelope_digest,
    test_obligations_digest: testObligations.obligations_digest,
    risk_ledger_digest: canonicalObjectDigest(riskLedger)
  };
  if (hasGaps) {
    const gaps = compilerClarificationGaps(semanticGaps, "behavior_gap");
    const inventory = sealV5Record({ kind: "clarification_gap_inventory", schema_version: V5_SCHEMA_VERSION, semantic_root_digest: current.checkpoint.semantic_root_digest, gaps }, "gaps_digest");
    const stateSet = createQuestionPartStateSet(current.identity.case_document_lineage_id, current.checkpoint.semantic_root_digest, gaps);
    const presentation = createClarificationPresentation(stateSet, checkpointBase.current_revision, gaps);
    Object.assign(checkpointBase, { clarification_gaps_digest: inventory.gaps_digest, question_part_state_set_digest: stateSet.state_set_digest, presentation_digest: presentation.presentation_digest });
    compilerStateRecords.push({ record: inventory, digestField: "gaps_digest" }, { record: stateSet, semanticDigest: stateSet.state_set_digest }, { record: presentation, semanticDigest: presentation.presentation_digest });
    workPacket = { kind: "clarification_work", context, presentation };
  } else workPacket = { kind: "case_work", context };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts: [{ record: envelope, digestField: "envelope_digest" }], compilerStateRecords });
}
function renderedOutputRecord(mediaType, content) {
  return sealV5Record({ kind: "rendered_output", schema_version: V5_SCHEMA_VERSION, media_type: mediaType, content, content_digest: `sha256:${createHash7("sha256").update(content).digest("hex")}` }, "rendered_output_digest");
}
async function advanceCaseDrafts(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "artifact_kind", "artifact"]) || action.artifact_kind !== "case_drafts" || !plainObject2(action.artifact) || !Array.isArray(action.artifact.case_drafts)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case Drafts action is not a closed submit_artifact request.");
  validateAdvertisedAction(current, action, { kind: "submit_artifact", artifact_kind: "case_drafts" });
  const envelope = acceptArtifactEnvelope({ artifactKind: "case_drafts", payload: action.artifact, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "case_design", inputDigests: [current.checkpoint.semantic_root_digest, current.checkpoint.test_obligations_digest] });
  const document = compileV5CaseDocument({
    ...action.artifact,
    case_document_lineage_id: current.identity.case_document_lineage_id,
    semantic_root_digest: current.checkpoint.semantic_root_digest,
    source_revision: current.checkpoint.current_revision + 1
  });
  const executionPlan = projectCompatibilityExecutionPlan(document, { run_id: current.identity.run_id, revision: current.checkpoint.current_revision + 1 });
  const caseDocumentRef = executionPlan.case_document_ref;
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "artifact.submit_case_drafts", result_key: "all_gates_passed" });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint,
    run_lifecycle: targetCell.lifecycle,
    current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    accepted_artifact_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    case_drafts_artifact_digest: envelope.envelope_digest,
    case_document_ref: caseDocumentRef,
    case_document_digest: document.bundle_digest,
    execution_plan_digest: executionPlan.plan_digest
  };
  delete checkpointBase.checkpoint_digest;
  const workPacket = { kind: "terminal_work", terminal_kind: "case_document_finished", case_document_ref: caseDocumentRef };
  const selectorState = checkpointSelectors(checkpointBase, []);
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, [], commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const renderedOutputs = [renderedOutputRecord("application/json", renderV5Json(document)), renderedOutputRecord("text/markdown", renderV5Markdown(document)), renderedOutputRecord("text/csv", renderV5Csv(document))].map((record) => ({ record, digestField: "rendered_output_digest" }));
  return commitNormalRunTransaction(current.layout.root, request, {
    checkpoint: selectorState.checkpoint,
    selectorSidecar: selectorState.sidecar,
    reply,
    commitReceipt,
    acceptedArtifacts: [{ record: envelope, digestField: "envelope_digest" }],
    compilerStateRecords: [{ record: document, semanticDigest: document.bundle_digest }, { record: executionPlan, semanticDigest: executionPlan.plan_digest }],
    renderedOutputs
  });
}
async function advanceSourceBatch(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "request_ids", "request_dispositions", "source_payload"])) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Source batch action has extra or missing fields.");
  const sourceState = (
    /** @type {Record<string, any>} */
    await readSealedV5Record(current.layout.compilerState, current.checkpoint.source_acquisition_state_digest, "state_digest")
  );
  const work = sourceWorkPacket(sourceState);
  const capability = { kind: "submit_source_batch", request_ids: work.source_requests.map((item) => item.request_id) };
  validateAdvertisedAction(current, action, capability);
  const applied = applySourceBatch(work.source_requests, action);
  const acceptedArtifacts = [];
  const compilerStateRecords = [];
  let acceptedSourceStateDigest = sourceState.ledger.accepted_source_state_digest;
  let acceptedEnvelope = null;
  const acceptedDigestByClientKey = /* @__PURE__ */ new Map();
  let acceptedSourcePayloadDigests = current.checkpoint.accepted_source_payload_digests ?? [];
  if (applied.sourcePack) {
    const acceptedSources = [];
    for (const source of applied.sourcePack.sources) {
      const sourcePayload = { media_type: source.media_type, content: source.content };
      const sourceObjectDigest = canonicalObjectDigest(sourcePayload);
      acceptedDigestByClientKey.set(source.source_client_key, sourceObjectDigest);
      acceptedSources.push({ ...sourcePayload, source_object_digest: sourceObjectDigest });
      await writeRawSourceBytes(current.layout.rawSourceBytes, Buffer.from(source.content, "utf8"));
    }
    acceptedEnvelope = acceptArtifactEnvelope({ artifactKind: "source_pack", payload: { sources: acceptedSources }, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "source_acquisition", inputDigests: [sourceState.state_digest] });
    acceptedArtifacts.push({ record: acceptedEnvelope, digestField: "envelope_digest" });
    acceptedSourcePayloadDigests = [.../* @__PURE__ */ new Set([...acceptedSourcePayloadDigests, ...acceptedDigestByClientKey.values()])].sort();
    const acceptedSourceStateBase = {
      kind: "accepted_source_state",
      schema_version: V5_SCHEMA_VERSION,
      accepted_source_payload_digests: acceptedSourcePayloadDigests
    };
    const acceptedSourceState = {
      ...acceptedSourceStateBase,
      state_digest: canonicalObjectDigest({
        namespace: "generate-test-cases/v5/accepted-source-state",
        format_version: 1,
        accepted_source_payload_digests: acceptedSourcePayloadDigests
      })
    };
    acceptedSourceStateDigest = acceptedSourceState.state_digest;
    compilerStateRecords.push({ record: acceptedSourceState, semanticDigest: acceptedSourceState.state_digest });
  }
  const newDispositions = applied.dispositions.map((disposition) => disposition.outcome === "fulfilled" ? {
    request_id: disposition.request_id,
    outcome: "fulfilled",
    accepted_source_object_digests: [...new Set(disposition.source_client_keys.map((key) => acceptedDigestByClientKey.get(key)))].sort()
  } : disposition);
  const dispositions = [...sourceState.ledger.dispositions, ...newDispositions].sort((left, right) => left.request_id.localeCompare(right.request_id));
  const disposed = new Set(dispositions.map((disposition) => disposition.request_id));
  const outstanding = sourceState.source_requests.filter((sourceRequest) => !disposed.has(sourceRequest.request_id));
  const nextBatch = currentSourceBatch(outstanding);
  const ledger = sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap_digest: sourceState.ledger.source_bootstrap_digest, source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest, dispositions, accepted_source_state_digest: acceptedSourceStateDigest, next_batch_request_ids: nextBatch.map((item) => item.request_id) }, "ledger_digest");
  const nextSourceState = sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap: sourceState.source_bootstrap, source_requests: sourceState.source_requests, source_acquisition_policy: contracts.sourceAcquisitionPolicy, ledger }, "state_digest");
  compilerStateRecords.push({ record: nextSourceState, digestField: "state_digest" });
  const complete = nextBatch.length === 0;
  const sourceResultKey = `${acceptedEnvelope ? "payload" : "all_skipped_optional"}:${complete ? "sources_complete" : "sources_remaining"}`;
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "source.submit_batch", result_key: sourceResultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const revisionDelta = acceptedEnvelope ? 1 : 0;
  const acceptedArtifactDigests = [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_artifact_digests, ...acceptedEnvelope ? [acceptedEnvelope.envelope_digest] : []])].sort();
  const sourceEnvelopes = [];
  for (const artifactDigest of current.checkpoint.accepted_artifact_digests) {
    const envelope = await readSealedV5Record(current.layout.acceptedArtifacts, artifactDigest, "envelope_digest");
    if (envelope.artifact_kind === "source_pack") sourceEnvelopes.push(envelope);
  }
  if (acceptedEnvelope) sourceEnvelopes.push(acceptedEnvelope);
  const sourceContext = {
    accepted_source_state_digest: acceptedSourceStateDigest,
    source_packs: sourceEnvelopes.map((envelope) => ({ artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload })).sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest))
  };
  const semanticSeed = complete ? deriveSemanticReviewSeed({
    acceptedSourceStateDigest,
    sourcePacks: sourceContext.source_packs,
    permissionDerivationRegistryDigest: contracts.permissionDerivationRegistry.registry_digest
  }) : null;
  if (semanticSeed) compilerStateRecords.push({ record: semanticSeed, digestField: "seed_digest" });
  const checkpointBase = {
    ...current.checkpoint,
    checkpoint_digest: void 0,
    current_revision: current.checkpoint.current_revision + revisionDelta,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    source_acquisition_state_digest: nextSourceState.state_digest,
    accepted_artifact_digests: acceptedArtifactDigests,
    accepted_source_payload_digests: acceptedSourcePayloadDigests,
    accepted_source_state_digest: acceptedSourceStateDigest,
    ...semanticSeed ? { semantic_review_seed_digest: semanticSeed.seed_digest } : {}
  };
  delete checkpointBase.checkpoint_digest;
  const capabilities = complete ? [{ kind: "submit_artifact", artifact_kind: "evidence_claims" }, { kind: "cancel_run" }] : [{ kind: "submit_source_batch", request_ids: nextBatch.map((item) => item.request_id) }, { kind: "cancel_run" }];
  const selectorState = checkpointSelectors(checkpointBase, capabilities);
  const workPacket = complete ? {
    kind: "semantic_review_work",
    context: { source: sourceContext, compiler_rules: agentVisibleCompilerRules() },
    semantic_review_seed: semanticSeed
  } : {
    ...sourceWorkPacket(nextSourceState),
    accepted_source_state: { kind: "partial", source: sourceContext }
  };
  const committedActionDigest = actionDigestV5("advance", action);
  const commitReceipt = acceptedEnvelope ? { kind: "artifact_commit", committed_action_digest: committedActionDigest, semantic_revision_delta: 1, client_key_bindings: [] } : { kind: "operational_commit", committed_action_digest: committedActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: complete ? "source_acquisition_advanced" : "source_acquisition_advanced" };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(
    current.layout.root,
    /** @type {{idempotency_key:string,action:Record<string,any>}} */
    request,
    { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts, compilerStateRecords }
  );
}
async function advanceCancel(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "reason"]) || typeof action.reason !== "string" || action.reason.trim().length === 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Cancel action is invalid.");
  validateAdvertisedAction(current, action, { kind: "cancel_run" });
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "run.cancel", result_key: "cancelled" });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const digestValue = actionDigestV5("advance", action);
  const cancelEvent = createV5CancelEvent({ identity: current.identity, priorCheckpoint: current.checkpoint, previousTransactionDigest: current.transaction.transaction_digest, canonicalCancelActionDigest: digestValue, terminalFsmCellId: outcome.target_cell_id });
  const checkpointBase = { ...current.checkpoint, checkpoint_digest: void 0, ...cancelledCheckpointExtension(cancelEvent), fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, []);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: digestValue, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "run_cancelled" };
  const terminalPacket = current.identity.delivery_intent === "case_document" ? { kind: "terminal_work", terminal_kind: "case_document_cancelled" } : { kind: "terminal_work", terminal_kind: "execution_plan_cancelled", case_document_ref: current.checkpoint.case_document_ref, last_execution_projection: current.reply.work_packet.execution_projection };
  const reply = persistedReply(selectorState.checkpoint, terminalPacket, [], commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(
    current.layout.root,
    /** @type {{idempotency_key:string,action:Record<string,any>}} */
    request,
    { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, operationalEvent: { record: cancelEvent, digestField: "cancel_event_digest", refKind: "cancel_event" } }
  );
}
async function inspectV5Run(runDirectory) {
  let layout;
  let identity;
  try {
    layout = await resolveRunLayout(runDirectory);
    identity = (await readFixedSealedRecord(layout.identity, "identity_digest")).record;
    const current = await readVerifiedRun(runDirectory);
    return structuredClone(current.reply);
  } catch (error) {
    if (error instanceof V5ProtocolError) {
      if (error.code === "RUN_ARGUMENT_INVALID") return preRunReply("RUN_ARGUMENT_INVALID", error.message);
      if (!layout || !identity) return preRunReply("ACCEPTED_STATE_INTEGRITY_FAILURE", error.message);
      let lastVerifiedState = { kind: "none" };
      try {
        const pointer = (await readFixedSealedRecord(layout.currentPointer, "pointer_digest")).record;
        const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, "transaction_digest");
        const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, "checkpoint_digest");
        if (pointer.run_id === identity.run_id && transaction.run_id === identity.run_id && checkpoint.run_id === identity.run_id) lastVerifiedState = { kind: "checkpoint", fsm_cell_id: checkpoint.fsm_cell_id, stage: checkpoint.stage, obligation: checkpoint.obligation, current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest };
      } catch {
      }
      const trigger = lastVerifiedState.kind === "checkpoint" ? { kind: "verified_fsm_cell", fsm_cell_id: lastVerifiedState.fsm_cell_id } : { kind: "no_verified_fsm_cell", delivery_intent: identity.delivery_intent };
      const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === "ACCEPTED_STATE_INTEGRITY_FAILURE" && candidate.source.response_context === "run_inspect" && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(trigger));
      if (!row) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Inspect integrity reply contract is unavailable.");
      return {
        kind: "run_reply",
        schema_version: V5_SCHEMA_VERSION,
        run_id: identity.run_id,
        run_directory: layout.root,
        case_document_lineage_id: identity.case_document_lineage_id,
        delivery_intent: identity.delivery_intent,
        projection_kind: "read_only_integrity_fatal",
        reply_contract_id: row.reply_contract_id,
        run_lifecycle: "fatal",
        reply_status: "fatal",
        last_verified_state: lastVerifiedState,
        selector_snapshot_digest: null,
        available_actions: [],
        work_packet: { kind: "terminal_work", terminal_kind: identity.delivery_intent === "case_document" ? "case_document_fatal" : "execution_plan_fatal" },
        commit_receipt: null,
        diagnostics: [{ code: "ACCEPTED_STATE_INTEGRITY_FAILURE", affected_refs: [], message: error.message }]
      };
    }
    throw error;
  }
}

// src/entry.mjs
function fatalReply(code, message) {
  return {
    reply_kind: "pre_run_error",
    schema_version: "5.0.0",
    compiler_version: "0.6.0",
    status: code === "RUN_ARGUMENT_INVALID" ? "protocol_error" : "fatal",
    diagnostics: [{ code, affected_refs: [], message }],
    available_actions: []
  };
}
async function main() {
  try {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
    const userArguments = process.argv.slice(2);
    const reply = userArguments.length !== 1 || !path6.isAbsolute(userArguments[0]) ? fatalReply(
      "RUN_ARGUMENT_INVALID",
      "The V5 runner accepts exactly one absolute run directory argument."
    ) : nodeMajor >= 20 ? await inspectV5Run(userArguments[0]) : fatalReply("RUN_ARGUMENT_INVALID", "Node.js 20 or newer is required.");
    process.stdout.write(`${JSON.stringify(reply)}
`);
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : "private runner failed to form a JSON reply";
    process.stderr.write(`generate-test-cases v5 process failure: ${message}
`);
  }
}
var directExecution = false;
try {
  directExecution = typeof process.argv[1] === "string" && pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
} catch {
  directExecution = false;
}
if (directExecution) await main();
export {
  advanceV5Run,
  createV5RunDirectory,
  inspectV5Run
};
