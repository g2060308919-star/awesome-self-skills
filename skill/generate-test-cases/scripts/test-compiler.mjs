// src/advance-strict.mjs
import path3 from "node:path";
import { fileURLToPath } from "node:url";

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
function filterArray(values, predicate) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_FILTER, values, [predicate])
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
var VOLATILE_FIELDS = /* @__PURE__ */ new Set(["source_revision", "created_at", "updated_at", "confirmed_at", "event_at", "timestamp", "position", "index", "array_index"]);
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
  "/test_point_ids",
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
  "/obligations",
  "/obligations/source_claim_ids",
  "/obligations/view_element_refs",
  "/obligations/required_oracle_refs",
  "/obligations/required_capabilities",
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
  "/cases/testability_profile/capabilities",
  "/cases/testability_profile/observers",
  "/cases/testability_profile/controls",
  "/cases/execution_signature/oracle_refs",
  "/cases/execution_signature/test_point_ids",
  "/fact_ids",
  "/evidence_refs",
  "/preconditions",
  "/preconditions/source_claim_ids",
  "/data",
  "/steps/expectations",
  "/testability_profile/capabilities",
  "/testability_profile/observers",
  "/testability_profile/controls",
  "/execution_signature/oracle_refs",
  "/execution_signature/test_point_ids",
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
  "/grounded/testability_profile/capabilities",
  "/grounded/testability_profile/observers",
  "/grounded/testability_profile/controls",
  "/grounded/execution_signature/oracle_refs",
  "/grounded/execution_signature/test_point_ids",
  "/conditional",
  "/conditional/fact_ids",
  "/conditional/obligation_ids",
  "/conditional/source_claim_ids",
  "/conditional/evidence_refs",
  "/conditional/preconditions",
  "/conditional/preconditions/source_claim_ids",
  "/conditional/data",
  "/conditional/steps/expectations",
  "/conditional/testability_profile/capabilities",
  "/conditional/testability_profile/observers",
  "/conditional/testability_profile/controls",
  "/conditional/execution_signature/oracle_refs",
  "/conditional/execution_signature/test_point_ids",
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
var ROOT_ISSUE_ASSOCIATIONS = /* @__PURE__ */ new Set(["case_ids", "case_id", "test_point_ids", "test_point_id", "obligation_ids", "obligation_id"]);
var EXECUTION_SIGNATURE_ASSOCIATIONS = /* @__PURE__ */ new Set(["test_point_ids", "test_point_id", "obligation_ids", "obligation_id"]);
var COLLECTION_ID_FIELDS = /* @__PURE__ */ new Map([
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
function pathKey(path4) {
  return `/${joinArray(path4, "/")}`;
}
function stableSemanticKey(path4, value) {
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") return `number:${value}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (value === null) return "null";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = (
      /** @type {Record<string, unknown>} */
      value
    );
    const collectionPath = pathKey(path4);
    const idField = COLLECTION_ID_FIELDS.get(collectionPath);
    if (idField && typeof object[idField] === "string") return `id:${object[idField]}:${JSON.stringify(object)}`;
    if (collectionPath === "/interaction_matrix") return `interaction:${JSON.stringify({ dimension: object.dimension, module_ids: object.module_ids })}:${JSON.stringify(object)}`;
  }
  return JSON.stringify(value);
}
function canonicalize(value, path4 = []) {
  if (Array.isArray(value)) {
    const values = mapArray(value, (item) => canonicalize(item, path4));
    const currentPath = pathKey(path4);
    if (ORDERED_ARRAY_PATHS.has(currentPath)) return values;
    if (SET_ARRAY_PATHS.has(currentPath)) return sortArray(
      [...values],
      (left, right) => compareCodePoints(stableSemanticKey(path4, left), stableSemanticKey(path4, right))
    );
    return values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(mapArray(
      sortArray(Object.entries(value), ([left], [right]) => compareCodePoints(left, right)),
      ([key, item]) => [key, canonicalize(item, [...path4, key])]
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
function stripForEntity(value, entity, path4 = []) {
  if (Array.isArray(value)) return mapArray(value, (item) => stripForEntity(item, entity, path4));
  if (!value || typeof value !== "object") return value;
  const rootAssociations = entity === "root" && path4.length === 0;
  const directExecutionAssociations = entity === "execution" && path4.length === 0;
  const caseExecutionAssociations = entity === "case" && path4.length === 1 && path4[0] === "execution_signature";
  const stableEntries = filterArray(Object.entries(value), ([key]) => !VOLATILE_FIELDS.has(key));
  const rootEntries = filterArray(stableEntries, ([key]) => !(rootAssociations && ROOT_ISSUE_ASSOCIATIONS.has(key)));
  const executionEntries = filterArray(rootEntries, ([key]) => !((directExecutionAssociations || caseExecutionAssociations) && EXECUTION_SIGNATURE_ASSOCIATIONS.has(key)));
  return Object.fromEntries(mapArray(
    executionEntries,
    ([key, item]) => [key, stripForEntity(item, entity, [...path4, key])]
  ));
}
function stripVolatileFields(value, entity = "other") {
  return stripForEntity(value, entity === "root" ? "root" : entity === "case" ? "case" : entity === "execution" ? "execution" : "other");
}
function stableId(prefix, semanticSignature) {
  const isCaseObject = Boolean(semanticSignature && typeof semanticSignature === "object" && !Array.isArray(semanticSignature) && Object.hasOwn(semanticSignature, "execution_signature"));
  const entity = prefix === "root" || prefix === "root_issue" ? "root" : prefix === "case" ? isCaseObject ? "case" : "execution" : "other";
  return `${prefix}_${digest(stripVolatileFields(semanticSignature, entity)).slice(0, 16)}`;
}

// skill/generate-test-cases/scripts/schemas/behavior-views.schema.json
var behavior_views_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "behavior-views.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "views", "interaction_matrix", "interaction_candidates"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    views: { type: "array", items: { type: "object", required: ["view_id", "type", "scope", "source_claim_ids", "elements", "relations"], properties: {
      view_id: { type: "string", minLength: 1 },
      type: { enum: ["flow", "decision", "state", "input-domain", "role", "timing", "integration"] },
      scope: { type: "string", minLength: 1 },
      source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true },
      elements: { type: "array", items: { oneOf: [
        { type: "object", required: ["element_id", "kind", "node_type", "label", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "flow-node" }, node_type: { enum: ["start", "action", "decision", "end", "exception"] }, label: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "from_element_id", "to_element_id", "condition", "result", "sequence", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "flow-edge" }, from_element_id: { type: "string", minLength: 1 }, to_element_id: { type: "string", minLength: 1 }, condition: { type: "string", minLength: 1 }, result: { type: "string", minLength: 1 }, sequence: { type: "integer", minimum: 0 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "conditions", "result", "priority", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "decision-rule" }, conditions: { type: "array", items: { type: "string" }, minItems: 1 }, result: { type: "string", minLength: 1 }, priority: { type: "integer", minimum: 0 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "state", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "state" }, state: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "from_state", "event", "to_state", "condition", "transition_order", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "transition" }, from_state: { type: "string", minLength: 1 }, event: { type: "string", minLength: 1 }, to_state: { type: "string", minLength: 1 }, condition: { type: "string", minLength: 1 }, transition_order: { type: "array", items: { type: "string" }, minItems: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "domain", "classes", "bounds", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "input-domain" }, domain: { type: "string", minLength: 1 }, classes: { type: "array", items: { type: "object", required: ["class_id", "label"], properties: { class_id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } }, additionalProperties: false }, minItems: 1 }, bounds: { type: "object", required: ["lower", "upper", "inclusive"], properties: { lower: { type: "number" }, upper: { type: "number" }, inclusive: { type: "boolean" } }, additionalProperties: false }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "role", "permissions", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "role-permission" }, role: { type: "string", minLength: 1 }, permissions: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "timing_event", "threshold", "order", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "timing-rule" }, timing_event: { type: "string", minLength: 1 }, threshold: { type: "number" }, order: { type: "integer", minimum: 0 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false },
        { type: "object", required: ["element_id", "kind", "request", "response", "persistence", "event", "callback", "compensation", "side_effects", "source_claim_ids", "model_refs"], properties: { element_id: { type: "string", minLength: 1 }, kind: { const: "integration-contract" }, request: { type: "object", required: ["target", "payload"], properties: { target: { type: "string", minLength: 1 }, payload: { type: "string", minLength: 1 } }, additionalProperties: false }, response: { type: "object", required: ["status", "body"], properties: { status: { type: "string", minLength: 1 }, body: { type: "string", minLength: 1 } }, additionalProperties: false }, persistence: { type: "object", required: ["operation", "target"], properties: { operation: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 } }, additionalProperties: false }, event: { type: "object", required: ["name", "direction"], properties: { name: { type: "string", minLength: 1 }, direction: { enum: ["publish", "consume"] } }, additionalProperties: false }, callback: { type: "object", required: ["target", "event"], properties: { target: { type: "string", minLength: 1 }, event: { type: "string", minLength: 1 } }, additionalProperties: false }, compensation: { type: "object", required: ["action", "trigger"], properties: { action: { type: "string", minLength: 1 }, trigger: { type: "string", minLength: 1 } }, additionalProperties: false }, side_effects: { type: "array", items: { type: "object", required: ["kind", "target"], properties: { kind: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 } }, additionalProperties: false }, minItems: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false }
      ] } },
      relations: { type: "array", items: { type: "object", required: ["relation_id", "kind", "from_element_id", "to_element_id", "sequence", "source_claim_ids", "model_refs"], properties: { relation_id: { type: "string", minLength: 1 }, kind: { enum: ["sequence", "dependency", "transition", "contains"] }, from_element_id: { type: "string", minLength: 1 }, to_element_id: { type: "string", minLength: 1 }, sequence: { type: "integer", minimum: 0 }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, model_refs: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false } }
    }, additionalProperties: false } },
    interaction_matrix: { type: "array", items: { type: "object", required: ["module_ids", "dimension", "status"], properties: { module_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, dimension: { enum: ["shared-entity", "role", "client", "interface-event", "time", "concurrency", "side-effect"] }, status: { enum: ["checked-no-signal", "candidate"] } }, additionalProperties: false } },
    interaction_candidates: { type: "array", items: { oneOf: [
      { type: "object", required: ["candidate_id", "module_ids", "dimension", "disposition", "source_claim_ids", "formal_view_id"], properties: { candidate_id: { type: "string", minLength: 1 }, module_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, dimension: { enum: ["shared-entity", "role", "client", "interface-event", "time", "concurrency", "side-effect"] }, disposition: { const: "formal-view" }, source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, formal_view_id: { type: "string", minLength: 1 } }, additionalProperties: false },
      { type: "object", required: ["candidate_id", "module_ids", "dimension", "disposition", "blocker_root_issue_id"], properties: { candidate_id: { type: "string", minLength: 1 }, module_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, dimension: { enum: ["shared-entity", "role", "client", "interface-event", "time", "concurrency", "side-effect"] }, disposition: { const: "blocker" }, blocker_root_issue_id: { type: "string", minLength: 1 } }, additionalProperties: false },
      { type: "object", required: ["candidate_id", "module_ids", "dimension", "disposition", "exploratory_id"], properties: { candidate_id: { type: "string", minLength: 1 }, module_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, dimension: { enum: ["shared-entity", "role", "client", "interface-event", "time", "concurrency", "side-effect"] }, disposition: { const: "exploratory" }, exploratory_id: { type: "string", minLength: 1 } }, additionalProperties: false }
    ] } }
  },
  additionalProperties: false
};

// skill/generate-test-cases/scripts/schemas/case-drafts.schema.json
var case_drafts_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "case-drafts.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "cases", "obligation_dispositions", "exploratory_candidates"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    cases: {
      type: "array",
      items: {
        type: "object",
        required: ["case_id", "title", "scope", "risk", "role", "fact_ids", "obligation_ids", "preconditions", "data", "steps", "testability_profile", "post_state", "cleanup", "evidence_refs", "execution_signature"],
        properties: {
          case_id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          scope: { type: "string", minLength: 1 },
          risk: { enum: ["critical", "high", "medium", "low"] },
          role: { type: "object", required: ["value", "evidence_ref", "support_review"], properties: { value: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
          fact_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          obligation_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true },
          preconditions: { type: "array", minItems: 1, items: { type: "object", required: ["condition", "reachable_from", "source_claim_ids", "evidence_ref", "support_review"], properties: { condition: { type: "string", minLength: 1 }, reachable_from: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false } },
          data: { type: "array", minItems: 1, items: { type: "object", required: ["name", "value", "provenance", "support_review"], properties: { name: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 }, provenance: { oneOf: [
            { type: "object", required: ["type", "ref"], properties: { type: { const: "evidence" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false },
            { type: "object", required: ["type", "ref"], properties: { type: { const: "derivation" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false }
          ] }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false } },
          steps: { type: "array", minItems: 1, items: { type: "object", required: ["step_id", "action", "action_evidence_ref", "support_review", "expectations"], properties: {
            step_id: { type: "string", minLength: 1 },
            action: { type: "string", minLength: 1 },
            action_evidence_ref: { type: "string", minLength: 1 },
            support_review: { enum: ["supported", "contradicted", "uncertain"] },
            expectations: { type: "array", minItems: 1, items: { type: "object", required: ["expectation_id", "business_assertion", "preceding_action_id", "observer", "observation_surface", "observation_target", "oracle", "evidence_ref", "support_review"], properties: {
              expectation_id: { type: "string", minLength: 1 },
              business_assertion: { type: "string", minLength: 1 },
              preceding_action_id: { type: "string", minLength: 1 },
              observer: { type: "string", minLength: 1 },
              observation_surface: { type: "string", minLength: 1 },
              observation_target: { type: "string", minLength: 1 },
              oracle: { oneOf: [
                { type: "object", required: ["type", "expected_value", "comparison"], properties: { type: { const: "value" }, expected_value: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
                { type: "object", required: ["type", "expected_state", "comparison"], properties: { type: { const: "state" }, expected_state: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
                { type: "object", required: ["type", "expected_event", "comparison"], properties: { type: { const: "event" }, expected_event: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
                { type: "object", required: ["type", "expected_side_effect", "comparison"], properties: { type: { const: "side-effect" }, expected_side_effect: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false }
              ] },
              evidence_ref: { type: "string", minLength: 1 },
              support_review: { enum: ["supported", "contradicted", "uncertain"] }
            }, additionalProperties: false } }
          }, additionalProperties: false } },
          testability_profile: { type: "object", required: ["capabilities", "observers", "controls"], properties: {
            capabilities: { type: "array", minItems: 1, items: { type: "object", required: ["capability", "status"], properties: { capability: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            observers: { type: "array", minItems: 1, items: { type: "object", required: ["observer", "observation_target", "status"], properties: { observer: { type: "string", minLength: 1 }, observation_target: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            controls: { type: "array", minItems: 1, items: { type: "object", required: ["control", "status"], properties: { control: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } }
          }, additionalProperties: false },
          post_state: { type: "object", required: ["state", "evidence_ref", "support_review"], properties: { state: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
          cleanup: { oneOf: [
            { type: "object", required: ["required", "steps", "evidence_ref", "support_review"], properties: { required: { const: true }, steps: { type: "array", items: { type: "string" }, minItems: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
            { type: "object", required: ["required", "no_cleanup_reason", "no_cleanup_evidence_ref", "support_review"], properties: { required: { const: false }, no_cleanup_reason: { type: "string", minLength: 1 }, no_cleanup_evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false }
          ] },
          evidence_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          temporary_assumption: { type: "object", required: ["claim_id", "invalidation_condition"], properties: { claim_id: { type: "string", minLength: 1 }, invalidation_condition: { type: "string", minLength: 1 } }, additionalProperties: false },
          execution_signature: { type: "object", required: ["role", "precondition_state", "data_partition", "action_path", "oracle_refs"], properties: { role: { type: "string", minLength: 1 }, precondition_state: { type: "string", minLength: 1 }, data_partition: { type: "string", minLength: 1 }, action_path: { type: "array", items: { type: "string" }, minItems: 1 }, oracle_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, test_point_ids: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false }
        },
        additionalProperties: false
      }
    },
    obligation_dispositions: { type: "array", items: { oneOf: [
      { type: "object", required: ["obligation_id", "status", "case_ids"], properties: { obligation_id: { type: "string", minLength: 1 }, status: { const: "case_candidate" }, case_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } }, additionalProperties: false },
      { type: "object", required: ["obligation_id", "status", "blocker_root_issue_id", "evidence_refs"], properties: { obligation_id: { type: "string", minLength: 1 }, status: { const: "blocker" }, blocker_root_issue_id: { type: "string", minLength: 1 }, evidence_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } }, additionalProperties: false },
      { type: "object", required: ["obligation_id", "status", "exclusion_claim_id", "scope", "support_review"], properties: { obligation_id: { type: "string", minLength: 1 }, status: { const: "not_applicable" }, exclusion_claim_id: { type: "string", minLength: 1 }, scope: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false }
    ] } },
    exploratory_candidates: { type: "array", items: { type: "object", required: ["exploratory_id", "title", "scope", "risk", "source_claim_ids"], properties: { exploratory_id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, scope: { type: "string", minLength: 1 }, risk: { enum: ["critical", "high", "medium", "low"] }, source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } }, additionalProperties: false } }
  },
  additionalProperties: false
};

// skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json
var evidence_claims_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "evidence-claims.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "claims", "fact_ledger"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    claims: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            required: ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "source_id"],
            properties: {
              claim_id: { type: "string", minLength: 1 },
              claim_form: { const: "direct" },
              level: { const: "E3" },
              kind: { enum: ["requirement", "description", "example", "diagnostic"] },
              scope: { type: "string", minLength: 1 },
              value: { type: "string", minLength: 1 },
              source_locator_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
              source_id: { type: "string", minLength: 1 }
            },
            additionalProperties: false
          },
          {
            type: "object",
            required: ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "decision_id", "authority"],
            properties: {
              claim_id: { type: "string", minLength: 1 },
              claim_form: { const: "decision-record" },
              level: { enum: ["E1", "E3"] },
              kind: { enum: ["requirement", "assumption"] },
              scope: { type: "string", minLength: 1 },
              value: { type: "string", minLength: 1 },
              source_locator_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
              decision_id: { type: "string", minLength: 1 },
              authority: { type: "string", minLength: 1 }
            },
            additionalProperties: false
          },
          {
            type: "object",
            required: ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "derivation_kind", "derivation_target", "parent_claim_ids", "parameters", "rule_input"],
            properties: {
              claim_id: { type: "string", minLength: 1 },
              claim_form: { const: "derived" },
              level: { const: "E2" },
              kind: { enum: ["test-data", "expected-value", "model-element"] },
              scope: { type: "string", minLength: 1 },
              value: { type: "string", minLength: 1 },
              source_locator_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
              derivation_kind: { enum: ["formula", "decision-table-instance", "boundary-representative", "enumeration-complement", "graph-reachability"] },
              derivation_target: { enum: ["test-data", "expected-value", "model-element"] },
              parent_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
              parameters: {
                type: "object",
                properties: {
                  formula_id: { type: "string", minLength: 1 },
                  table_id: { type: "string", minLength: 1 },
                  domain_id: { type: "string", minLength: 1 },
                  enumeration_id: { type: "string", minLength: 1 },
                  graph_id: { type: "string", minLength: 1 },
                  unit: { type: "string", minLength: 1 },
                  precision: { type: "integer", minimum: 0 },
                  rounding: { type: "string", minLength: 1 }
                },
                additionalProperties: false
              },
              rule_input: {
                type: "object",
                properties: {
                  formula: { type: "string", minLength: 1 },
                  inputs: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "value"],
                      properties: {
                        name: { type: "string", minLength: 1 },
                        value: { type: ["number", "string"] },
                        unit: { type: "string", minLength: 1 }
                      },
                      additionalProperties: false
                    },
                    uniqueItems: true
                  },
                  unit: { type: "string", minLength: 1 },
                  precision: { type: "integer", minimum: 0 },
                  rounding: { type: "string", minLength: 1 },
                  conditions: { type: "array", items: { type: "string" }, uniqueItems: true },
                  outcome: { type: "string", minLength: 1 },
                  lower: { type: "number" },
                  upper: { type: "number" },
                  inclusive: { type: "boolean" },
                  enumerated_values: { type: "array", items: { type: "string" }, uniqueItems: true },
                  closed_world: { type: "boolean" },
                  from: { type: "string", minLength: 1 },
                  to: { type: "string", minLength: 1 }
                },
                additionalProperties: false
              }
            },
            additionalProperties: false
          }
        ]
      }
    },
    fact_ledger: {
      type: "array",
      items: {
        type: "object",
        required: ["fact_id", "claim_id", "status", "source_claim_ids"],
        properties: {
          fact_id: { type: "string", minLength: 1 },
          claim_id: { type: "string", minLength: 1 },
          status: { enum: ["active", "conflicted", "ambiguous", "diagnostic"] },
          source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// skill/generate-test-cases/scripts/schemas/source-pack.schema.json
var source_pack_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "source-pack.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "run_scope", "sources", "locators", "source_policy", "decision_records", "clarification_events"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    run_scope: { type: "string", minLength: 1 },
    sources: { type: "array", items: { type: "object", required: ["source_id", "kind", "version", "status", "authority", "content", "content_digest"], properties: { source_id: { type: "string", minLength: 1 }, kind: { enum: ["prd", "acceptance-criteria", "interaction-spec", "interface-contract", "formal-rule", "review-record", "historical-defect", "production-behavior", "decision-record"] }, version: { type: "string", minLength: 1 }, status: { enum: ["draft", "approved", "effective", "superseded", "reference"] }, authority: { type: "string", minLength: 1 }, title: { type: "string" }, content: { type: "string" }, content_digest: { type: "string", pattern: "^[a-f0-9]{64}$" }, scope: { type: "string" } }, additionalProperties: false } },
    locators: { type: "array", items: { oneOf: [
      { type: "object", required: ["locator_id", "source_id", "type", "text_range", "content_digest", "extraction_integrity"], properties: { locator_id: { type: "string", minLength: 1 }, source_id: { type: "string", minLength: 1 }, type: { const: "text-range" }, text_range: { type: "object", required: ["start", "end"], properties: { start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 0 } }, additionalProperties: false }, content_digest: { type: "string", pattern: "^[a-f0-9]{64}$" }, extraction_integrity: { enum: ["verified", "machine-extracted", "uncertain"] } }, additionalProperties: false },
      { type: "object", required: ["locator_id", "source_id", "type", "table_cell", "content_digest", "extraction_integrity"], properties: { locator_id: { type: "string", minLength: 1 }, source_id: { type: "string", minLength: 1 }, type: { const: "table-cell" }, table_cell: { type: "object", required: ["sheet", "cell"], properties: { sheet: { type: "string", minLength: 1 }, cell: { type: "string", minLength: 1 } }, additionalProperties: false }, content_digest: { type: "string", pattern: "^[a-f0-9]{64}$" }, extraction_integrity: { enum: ["verified", "machine-extracted", "uncertain"] } }, additionalProperties: false },
      { type: "object", required: ["locator_id", "source_id", "type", "page_region", "content_digest", "extraction_integrity"], properties: { locator_id: { type: "string", minLength: 1 }, source_id: { type: "string", minLength: 1 }, type: { const: "page-region" }, page_region: { type: "object", required: ["page", "region"], properties: { page: { type: "integer", minimum: 1 }, region: { type: "string", minLength: 1 } }, additionalProperties: false }, content_digest: { type: "string", pattern: "^[a-f0-9]{64}$" }, extraction_integrity: { enum: ["verified", "machine-extracted", "uncertain"] } }, additionalProperties: false }
    ] } },
    source_policy: { type: "object", required: ["rules"], properties: { rules: { type: "array", items: { type: "object", required: ["rule_id", "source_ids", "scope", "authority", "status"], properties: { rule_id: { type: "string", minLength: 1 }, source_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, supersedes: { type: "array", items: { type: "string" }, uniqueItems: true }, scope: { type: "string", minLength: 1 }, authority: { type: "string", minLength: 1 }, status: { enum: ["effective", "superseded", "reference"] } }, additionalProperties: false } } }, additionalProperties: false },
    decision_records: { type: "array", items: { type: "object", required: ["decision_id", "question_id", "root_issue_ids", "affected_obligation_ids", "clarification_event_seq", "confirmer", "confirmed_at", "question", "answer", "disposition", "authority_scope", "effective_scope", "evidence_ref", "evidence_level"], properties: { decision_id: { type: "string", minLength: 1 }, question_id: { type: "string", minLength: 1 }, root_issue_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, affected_obligation_ids: { type: "array", items: { type: "string" }, uniqueItems: true }, clarification_event_seq: { type: "integer", minimum: 1 }, confirmer: { type: "string", minLength: 1 }, confirmed_at: { type: "string", minLength: 1 }, question: { type: "string", minLength: 1 }, answer: { type: "string" }, disposition: { enum: ["final", "temporary", "unknown", "deferred"] }, authority_scope: { type: "string", minLength: 1 }, effective_scope: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, evidence_level: { enum: ["E1", "E3"] } }, additionalProperties: false } },
    clarification_events: { type: "array", items: { type: "object", required: ["event_id", "clarification_event_seq", "type", "actor", "event_at", "root_issue_ids"], properties: { event_id: { type: "string", minLength: 1 }, clarification_event_seq: { type: "integer", minimum: 1 }, type: { enum: ["request_delivery", "reopen_root_issues"] }, actor: { type: "string", minLength: 1 }, event_at: { type: "string", minLength: 1 }, root_issue_ids: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false } }
  },
  additionalProperties: false
};

// src/decision-record.mjs
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}
function diagnostic(code2, path4, message) {
  return { category: "reference", code: code2, path: path4, message };
}
function normalizeScope(scope) {
  const normalized = scope.trim();
  return normalized === "all" || normalized === "*" ? "*" : normalized;
}
function scopeContains(container, candidate) {
  const left = normalizeScope(container);
  const right = normalizeScope(candidate);
  if (left.length === 0 || right.length === 0) return false;
  return left === "*" || left === right || right.startsWith(`${left}.`) || right.startsWith(`${left}/`);
}
function validateDecisionRecords(sourcePack) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const sources = objectArray(pack.sources);
  const locators = objectArray(pack.locators);
  const decisions = objectArray(pack.decision_records);
  const sourceIds = new Set(sources.flatMap((source) => typeof source.source_id === "string" ? [source.source_id] : []));
  const locatorById = new Map(locators.flatMap((locator) => typeof locator.locator_id === "string" ? [[locator.locator_id, locator]] : []));
  const diagnostics = [];
  const invalidLocatorIds = /* @__PURE__ */ new Set();
  locators.forEach((locator, index) => {
    if (typeof locator.locator_id !== "string") return;
    if (typeof locator.source_id !== "string" || !sourceIds.has(locator.source_id)) {
      invalidLocatorIds.add(locator.locator_id);
      diagnostics.push(diagnostic(
        "LOCATOR_SOURCE_DANGLING",
        `/locators/${index}/source_id`,
        `locator references unknown source "${typeof locator.source_id === "string" ? locator.source_id : ""}"`
      ));
    }
  });
  const decisionsById = /* @__PURE__ */ new Map();
  const validFinalDecisionIds = /* @__PURE__ */ new Set();
  const validTemporaryDecisionIds = /* @__PURE__ */ new Set();
  decisions.forEach((decision, index) => {
    if (typeof decision.decision_id !== "string") return;
    decisionsById.set(decision.decision_id, decision);
    if (decision.disposition !== "final" && decision.disposition !== "temporary") return;
    let valid = true;
    const expectedLevel = decision.disposition === "final" ? "E3" : "E1";
    if (decision.evidence_level !== expectedLevel) {
      diagnostics.push(diagnostic(
        "DECISION_EVIDENCE_LEVEL_INVALID",
        `/decision_records/${index}/evidence_level`,
        `${decision.disposition} Decision Record must use ${expectedLevel}`
      ));
      valid = false;
    }
    if (typeof decision.answer !== "string" || decision.answer.trim().length === 0) {
      diagnostics.push(diagnostic(
        "DECISION_ANSWER_EMPTY",
        `/decision_records/${index}/answer`,
        "Decision Record answer must be nonempty"
      ));
      valid = false;
    }
    const authorityScope = typeof decision.authority_scope === "string" ? decision.authority_scope : "";
    const effectiveScope = typeof decision.effective_scope === "string" ? decision.effective_scope : "";
    if (!scopeContains(authorityScope, effectiveScope)) {
      diagnostics.push(diagnostic(
        "DECISION_AUTHORITY_SCOPE_MISMATCH",
        `/decision_records/${index}/effective_scope`,
        "Decision Record authority scope must contain its effective scope"
      ));
      valid = false;
    }
    const evidenceRef = typeof decision.evidence_ref === "string" ? decision.evidence_ref : "";
    const locator = locatorById.get(evidenceRef);
    if (!locator) {
      diagnostics.push(diagnostic(
        "DECISION_EVIDENCE_DANGLING",
        `/decision_records/${index}/evidence_ref`,
        "Decision Record must reference an existing evidence locator"
      ));
      valid = false;
    } else {
      if (invalidLocatorIds.has(evidenceRef)) valid = false;
      if (locator.extraction_integrity === "uncertain") {
        diagnostics.push(diagnostic(
          "DECISION_EVIDENCE_UNCERTAIN",
          `/decision_records/${index}/evidence_ref`,
          "uncertain extraction cannot authorize a Decision Record"
        ));
        valid = false;
      }
    }
    if (valid && decision.disposition === "final") validFinalDecisionIds.add(decision.decision_id);
    if (valid && decision.disposition === "temporary") validTemporaryDecisionIds.add(decision.decision_id);
  });
  return { decisionsById, validFinalDecisionIds, validTemporaryDecisionIds, diagnostics };
}

// src/clarification.mjs
var POLICIES = /* @__PURE__ */ new Set(["pause_for_clarification", "record_only"]);
var RISKS = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
var EVIDENCE_LEVELS = /* @__PURE__ */ new Set(["E0", "E1", "E2", "E3"]);
var CLASSIFICATIONS = /* @__PURE__ */ new Set(["grounded", "conditional", "blocked", "not_applicable"]);
var ROOT_STATUSES = /* @__PURE__ */ new Set([
  "open",
  "asked",
  "resolved_final",
  "resolved_temporary",
  "suppressed_unknown",
  "suppressed_deferred"
]);
var STOP_REASONS = /* @__PURE__ */ new Set(["converged", "user_requested_delivery", "no_information_gain"]);
var DECISION_DISPOSITIONS = /* @__PURE__ */ new Set(["final", "temporary", "unknown", "deferred"]);
var CONTROL_TYPES = /* @__PURE__ */ new Set(["request_delivery", "reopen_root_issues"]);
var DELIVERY_STATUSES = /* @__PURE__ */ new Set([
  "no_applicable_formal_test_points",
  "no_deterministic_cases",
  "critical_gaps",
  "executable_subset_ready"
]);
var DIAGNOSTIC_LIMIT = 256;
var NATIVE_ARRAY_IS_ARRAY = Array.isArray;
var NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
var NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
var NATIVE_REFLECT_APPLY = Reflect.apply;
var NATIVE_DEFINE_PROPERTY = Object.defineProperty;
var NATIVE_ARRAY_ENTRIES = Array.prototype.entries;
var NATIVE_ARRAY_MAP2 = Array.prototype.map;
var NATIVE_ARRAY_FILTER2 = Array.prototype.filter;
var NATIVE_ARRAY_SORT2 = Array.prototype.sort;
var NATIVE_ARRAY_SOME = Array.prototype.some;
var NATIVE_ARRAY_PUSH = Array.prototype.push;
var NATIVE_ARRAY_POP = Array.prototype.pop;
var NATIVE_ARRAY_SLICE = Array.prototype.slice;
function arrayMap(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_MAP2, value, [callback]);
}
function arrayFilter(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_FILTER2, value, [callback]);
}
function arraySome(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SOME, value, [callback]);
}
function arraySort(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT2, value, [callback]);
}
function arrayPush(value, ...items) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_PUSH, value, items);
}
function arrayEntries(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_ENTRIES, value, []);
}
function arrayPop(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_POP, value, []);
}
function arraySlice(value, start, end) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SLICE, value, end === void 0 ? [start] : [start, end]);
}
function compareCodePoints2(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function pointerPart(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
function diagnostic2(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function diagnosticKey(item) {
  return `${item.category}\0${item.code}\0${item.path}\0${item.message}`;
}
function compareDiagnostics(left, right) {
  return compareCodePoints2(diagnosticKey(left), diagnosticKey(right));
}
function finalizeDiagnostics(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  let overflow = false;
  for (const item of diagnostics) {
    if (item.code === "DIAGNOSTICS_TRUNCATED") overflow = true;
    else unique.set(diagnosticKey(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const sorted = arraySort([...unique.values()], compareDiagnostics);
  if (!overflow) return sorted;
  const retained = arraySlice(sorted, 0, DIAGNOSTIC_LIMIT - 1);
  arrayPush(retained, diagnostic2(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return arraySort(retained, compareDiagnostics);
}
function snapshotControlled(root) {
  const diagnostics = [];
  let diagnosticsTruncated = false;
  const addDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT) arrayPush(diagnostics, item);
    else diagnosticsTruncated = true;
  };
  let snapshot;
  const pending = [{ source: root, path: "", assign(value) {
    snapshot = value;
  } }];
  const seen = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const { source, path: path4, assign } = (
      /** @type {{source:unknown,path:string,assign:(value:unknown)=>void}} */
      arrayPop(pending)
    );
    if (!source || typeof source !== "object") {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      addDiagnostic(diagnostic2("schema", "CYCLIC_INPUT_INVALID", path4 || "/", "clarification context must be acyclic"));
      assign(null);
      continue;
    }
    seen.add(source);
    let prototype;
    let descriptors;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
    } catch {
      addDiagnostic(diagnostic2("schema", "INPUT_DESCRIPTOR_UNREADABLE", path4 || "/", "clarification input descriptors could not be captured"));
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (prototype !== Array.prototype) {
        addDiagnostic(diagnostic2("schema", "ARRAY_PROTOTYPE_INVALID", path4 || "/", "controlled arrays must use Array.prototype"));
        assign(null);
        continue;
      }
      const keys2 = NATIVE_REFLECT_OWN_KEYS(descriptors);
      let invalidOwnKeys = false;
      if (arraySome(keys2, (key) => typeof key === "symbol")) {
        invalidOwnKeys = true;
        addDiagnostic(diagnostic2(
          "schema",
          "ARRAY_SYMBOL_PROPERTY_INVALID",
          path4 || "/",
          "controlled arrays cannot contain symbol properties"
        ));
      }
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, "value") && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      const numeric = [];
      for (const key of arraySort(arrayFilter(keys2, (item) => typeof item === "string"), compareCodePoints2)) {
        if (key === "length") continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic2(
            "schema",
            "ARRAY_NAMED_PROPERTY_INVALID",
            `${path4}/${pointerPart(key)}`,
            "controlled arrays cannot contain named properties"
          ));
        } else arrayPush(numeric, index);
      }
      if (invalidOwnKeys) {
        assign(null);
        continue;
      }
      arraySort(numeric, (left, right) => left - right);
      const target2 = new Array(length);
      assign(target2);
      let nextExpectedIndex = 0;
      let holesTruncated = false;
      const emitHoleGap = (start, end) => {
        if (holesTruncated || start >= end) return;
        const available = Math.max(0, DIAGNOSTIC_LIMIT - diagnostics.length);
        const emitCount = Math.min(end - start, available);
        for (let offset = 0; offset < emitCount; offset += 1) addDiagnostic(diagnostic2(
          "schema",
          "ARRAY_HOLE",
          `${path4}/${start + offset}`,
          "controlled arrays must be dense"
        ));
        if (emitCount < end - start) {
          diagnosticsTruncated = true;
          holesTruncated = true;
        }
      };
      for (const index of numeric) {
        emitHoleGap(nextExpectedIndex, index);
        nextExpectedIndex = index + 1;
      }
      emitHoleGap(nextExpectedIndex, length);
      const children2 = [];
      for (const index of numeric) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value")) addDiagnostic(diagnostic2(
          "schema",
          "ACCESSOR_NOT_ALLOWED",
          `${path4}/${index}`,
          "controlled input must use own data properties"
        ));
        else arrayPush(children2, {
          source: descriptor.value,
          path: `${path4}/${index}`,
          /** @param {unknown} value */
          assign(value) {
            target2[index] = value;
          }
        });
      }
      for (let index = children2.length - 1; index >= 0; index -= 1) arrayPush(pending, children2[index]);
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      addDiagnostic(diagnostic2("schema", "RECORD_PROTOTYPE_INVALID", path4 || "/", "controlled records must use a plain or null prototype"));
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
    if (arraySome(keys, (key) => typeof key === "symbol")) addDiagnostic(diagnostic2(
      "schema",
      "RECORD_SYMBOL_PROPERTY_INVALID",
      path4 || "/",
      "controlled records cannot contain symbol properties"
    ));
    const target = /* @__PURE__ */ Object.create(null);
    assign(target);
    const children = [];
    for (const key of arraySort(arrayFilter(keys, (item) => typeof item === "string"), compareCodePoints2)) {
      const descriptor = descriptors[key];
      const childPath = `${path4}/${pointerPart(key)}`;
      if (!descriptor || !Object.hasOwn(descriptor, "value")) addDiagnostic(diagnostic2(
        "schema",
        "ACCESSOR_NOT_ALLOWED",
        childPath,
        "controlled input must use own data properties"
      ));
      else arrayPush(children, {
        source: descriptor.value,
        path: childPath,
        /** @param {unknown} value */
        assign(value) {
          NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true });
        }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) arrayPush(pending, children[index]);
  }
  if (diagnosticsTruncated) arrayPush(diagnostics, diagnostic2(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return { snapshot, diagnostics };
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeText(value) {
  return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/gu, " ") : "";
}
function checkKeys(value, allowed, path4, diagnostics) {
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) if (!permitted.has(key)) arrayPush(diagnostics, diagnostic2(
    "schema",
    "UNKNOWN_KEY",
    `${path4}/${pointerPart(key)}`,
    "unknown controlled clarification field is not allowed"
  ));
}
function record(value, path4, diagnostics) {
  if (isRecord(value)) return value;
  arrayPush(diagnostics, diagnostic2("schema", "RECORD_REQUIRED", path4, "controlled clarification value must be a record"));
  return {};
}
function array(value, path4, diagnostics) {
  if (Array.isArray(value)) return value;
  arrayPush(diagnostics, diagnostic2("schema", "ARRAY_REQUIRED", path4, "controlled clarification value must be an array"));
  return [];
}
function canonicalString(value, path4, diagnostics, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && normalizeText(value).length === 0 || value !== value.normalize("NFC") || value !== value.trim()) {
    arrayPush(diagnostics, diagnostic2("schema", "CANONICAL_STRING_INVALID", path4, "value must be a canonical nonpadded string"));
    return "";
  }
  return value;
}
function stringSet(value, path4, diagnostics, nonempty = false) {
  const input = array(value, path4, diagnostics);
  const output = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < input.length; index += 1) {
    const item = canonicalString(input[index], `${path4}/${index}`, diagnostics);
    if (!item) continue;
    if (seen.has(item)) arrayPush(diagnostics, diagnostic2("schema", "SET_VALUE_DUPLICATE", `${path4}/${index}`, "set-like values must be unique"));
    else {
      seen.add(item);
      arrayPush(output, item);
    }
  }
  if (nonempty && output.length === 0) arrayPush(diagnostics, diagnostic2("schema", "NONEMPTY_ARRAY_REQUIRED", path4, "set-like array must not be empty"));
  return arraySort(output, compareCodePoints2);
}
function integer(value, path4, diagnostics, minimum) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    arrayPush(diagnostics, diagnostic2("schema", "INTEGER_INVALID", path4, `value must be an integer at least ${minimum}`));
    return minimum;
  }
  return Number(value);
}
function enumeration(value, allowed, path4, diagnostics) {
  if (typeof value !== "string" || !allowed.has(value)) {
    arrayPush(diagnostics, diagnostic2("schema", "ENUM_INVALID", path4, "value is outside the closed clarification enumeration"));
    return "";
  }
  return value;
}
function normalizeSemanticSnapshot(value, path4, diagnostics) {
  const snapshot = record(value, path4, diagnostics);
  checkKeys(snapshot, ["formal_test_points", "coverage_denominator", "delivery_sections"], path4, diagnostics);
  const points = [];
  const pointIds = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(snapshot.formal_test_points, `${path4}/formal_test_points`, diagnostics))) {
    const point = record(raw, `${path4}/formal_test_points/${index}`, diagnostics);
    checkKeys(point, ["obligation_id", "evidence_level", "classification", "blocked_reason"], `${path4}/formal_test_points/${index}`, diagnostics);
    const obligationId = canonicalString(point.obligation_id, `${path4}/formal_test_points/${index}/obligation_id`, diagnostics);
    const evidenceLevel2 = enumeration(point.evidence_level, EVIDENCE_LEVELS, `${path4}/formal_test_points/${index}/evidence_level`, diagnostics);
    const classification = enumeration(point.classification, CLASSIFICATIONS, `${path4}/formal_test_points/${index}/classification`, diagnostics);
    let blockedReason = null;
    if (point.blocked_reason !== null) blockedReason = canonicalString(point.blocked_reason, `${path4}/formal_test_points/${index}/blocked_reason`, diagnostics);
    if (classification === "blocked" && !blockedReason) arrayPush(diagnostics, diagnostic2(
      "classification",
      "BLOCKED_REASON_REQUIRED",
      `${path4}/formal_test_points/${index}/blocked_reason`,
      "Blocked formal Test Point requires a reason"
    ));
    if (classification !== "blocked" && point.blocked_reason !== null) arrayPush(diagnostics, diagnostic2(
      "classification",
      "BLOCKED_REASON_UNEXPECTED",
      `${path4}/formal_test_points/${index}/blocked_reason`,
      "non-Blocked formal Test Point cannot carry a blocked reason"
    ));
    if (pointIds.has(obligationId)) arrayPush(diagnostics, diagnostic2(
      "reference",
      "FORMAL_TEST_POINT_DUPLICATE",
      `${path4}/formal_test_points/${index}/obligation_id`,
      "formal Test Point IDs must be unique"
    ));
    pointIds.add(obligationId);
    arrayPush(points, { obligation_id: obligationId, evidence_level: evidenceLevel2, classification, blocked_reason: blockedReason });
  }
  arraySort(points, (left, right) => compareCodePoints2(left.obligation_id, right.obligation_id));
  const denominator = integer(snapshot.coverage_denominator, `${path4}/coverage_denominator`, diagnostics, 0);
  if (denominator !== points.length) arrayPush(diagnostics, diagnostic2(
    "coverage",
    "FORMAL_DENOMINATOR_MISMATCH",
    `${path4}/coverage_denominator`,
    "formal coverage denominator must equal the formal Test Point count"
  ));
  const delivery = record(snapshot.delivery_sections, `${path4}/delivery_sections`, diagnostics);
  checkKeys(delivery, ["grounded", "conditional", "blocked", "exploratory", "coverage", "quality"], `${path4}/delivery_sections`, diagnostics);
  const grounded = stringSet(delivery.grounded, `${path4}/delivery_sections/grounded`, diagnostics);
  const conditional = stringSet(delivery.conditional, `${path4}/delivery_sections/conditional`, diagnostics);
  const blocked = stringSet(delivery.blocked, `${path4}/delivery_sections/blocked`, diagnostics);
  const exploratory = stringSet(delivery.exploratory, `${path4}/delivery_sections/exploratory`, diagnostics);
  const coverage = record(delivery.coverage, `${path4}/delivery_sections/coverage`, diagnostics);
  checkKeys(coverage, ["formal_denominator"], `${path4}/delivery_sections/coverage`, diagnostics);
  const deliveryDenominator = integer(coverage.formal_denominator, `${path4}/delivery_sections/coverage/formal_denominator`, diagnostics, 0);
  if (deliveryDenominator !== denominator) arrayPush(diagnostics, diagnostic2(
    "coverage",
    "DELIVERY_DENOMINATOR_MISMATCH",
    `${path4}/delivery_sections/coverage/formal_denominator`,
    "delivery coverage denominator must match the semantic snapshot"
  ));
  const quality = record(delivery.quality, `${path4}/delivery_sections/quality`, diagnostics);
  checkKeys(quality, ["delivery_status"], `${path4}/delivery_sections/quality`, diagnostics);
  const deliveryStatus = enumeration(quality.delivery_status, DELIVERY_STATUSES, `${path4}/delivery_sections/quality/delivery_status`, diagnostics);
  for (const [lane, submitted] of [["grounded", grounded], ["conditional", conditional], ["blocked", blocked]]) {
    const expected = arrayMap(arrayFilter(points, (point) => point.classification === lane), (point) => point.obligation_id);
    if (canonicalStringify(submitted) !== canonicalStringify(expected)) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "DELIVERY_LANE_MISMATCH",
      `${path4}/delivery_sections/${lane}`,
      "delivery lane IDs must exactly project formal Test Point classifications"
    ));
  }
  return {
    formal_test_points: points,
    coverage_denominator: denominator,
    delivery_sections: {
      grounded,
      conditional,
      blocked,
      exploratory,
      coverage: { formal_denominator: deliveryDenominator },
      quality: { delivery_status: deliveryStatus }
    }
  };
}
function normalizeBlocked(value, path4, diagnostics) {
  const output = [];
  const obligationIds = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(value, path4, diagnostics))) {
    const currentPath = `${path4}/${index}`;
    const item = record(raw, currentPath, diagnostics);
    checkKeys(item, [
      "obligation_id",
      "missing_type",
      "semantic_refs",
      "scope",
      "risk",
      "reason",
      "evidence_refs",
      "answerable",
      "question"
    ], currentPath, diagnostics);
    const obligationId = canonicalString(item.obligation_id, `${currentPath}/obligation_id`, diagnostics);
    const missingType2 = canonicalString(item.missing_type, `${currentPath}/missing_type`, diagnostics);
    if (missingType2 && !/^[a-z][a-z0-9-]*$/u.test(missingType2)) arrayPush(diagnostics, diagnostic2(
      "schema",
      "MISSING_TYPE_INVALID",
      `${currentPath}/missing_type`,
      "missing_type must use canonical lowercase kebab form"
    ));
    const semanticRefs2 = stringSet(item.semantic_refs, `${currentPath}/semantic_refs`, diagnostics, true);
    const rawScope = canonicalString(item.scope, `${currentPath}/scope`, diagnostics);
    const scope = rawScope ? normalizeScope(rawScope) : "";
    if (rawScope && rawScope !== scope) arrayPush(diagnostics, diagnostic2(
      "schema",
      "SCOPE_CANONICAL_INVALID",
      `${currentPath}/scope`,
      "scope must already be normalized"
    ));
    const risk = enumeration(item.risk, RISKS, `${currentPath}/risk`, diagnostics);
    const reason = canonicalString(item.reason, `${currentPath}/reason`, diagnostics);
    const evidenceRefs = stringSet(item.evidence_refs, `${currentPath}/evidence_refs`, diagnostics);
    if (typeof item.answerable !== "boolean") arrayPush(diagnostics, diagnostic2(
      "schema",
      "BOOLEAN_INVALID",
      `${currentPath}/answerable`,
      "answerable must be boolean"
    ));
    const question = canonicalString(item.question, `${currentPath}/question`, diagnostics);
    if (obligationIds.has(obligationId)) arrayPush(diagnostics, diagnostic2(
      "reference",
      "BLOCKED_OBLIGATION_DUPLICATE",
      `${currentPath}/obligation_id`,
      "Blocked formal obligation IDs must be unique"
    ));
    obligationIds.add(obligationId);
    arrayPush(output, {
      obligation_id: obligationId,
      missing_type: missingType2,
      semantic_refs: semanticRefs2,
      scope,
      risk,
      reason,
      evidence_refs: evidenceRefs,
      answerable: item.answerable === true,
      question
    });
  }
  arraySort(output, (left, right) => compareCodePoints2(left.obligation_id, right.obligation_id));
  return output;
}
function normalizeRootLedger(value, path4, diagnostics) {
  const output = [];
  const ids = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(value, path4, diagnostics))) {
    const itemPath = `${path4}/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, [
      "root_issue_id",
      "root_issue_key",
      "missing_type",
      "semantic_refs",
      "scope",
      "affected_obligation_ids",
      "risk_counts",
      "question",
      "answerable",
      "reasons",
      "evidence_refs",
      "current"
    ], itemPath, diagnostics);
    const missingType2 = canonicalString(item.missing_type, `${itemPath}/missing_type`, diagnostics);
    const semanticRefs2 = stringSet(item.semantic_refs, `${itemPath}/semantic_refs`, diagnostics, true);
    const scope = canonicalString(item.scope, `${itemPath}/scope`, diagnostics);
    const signature = { missing_type: missingType2, semantic_refs: semanticRefs2, scope };
    const expectedKey = canonicalStringify(signature);
    const rootIssueId = canonicalString(item.root_issue_id, `${itemPath}/root_issue_id`, diagnostics);
    const rootIssueKey = canonicalString(item.root_issue_key, `${itemPath}/root_issue_key`, diagnostics);
    if (rootIssueKey !== expectedKey) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "ROOT_ISSUE_KEY_MISMATCH",
      `${itemPath}/root_issue_key`,
      "root snapshot key must exactly encode its normalized semantic root fields"
    ));
    if (rootIssueId !== stableId("root", signature)) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "ROOT_ISSUE_ID_MISMATCH",
      `${itemPath}/root_issue_id`,
      "root snapshot identity must derive from its canonical semantic key"
    ));
    const riskRecord = record(item.risk_counts, `${itemPath}/risk_counts`, diagnostics);
    checkKeys(riskRecord, ["critical", "high", "medium", "low"], `${itemPath}/risk_counts`, diagnostics);
    const riskCounts = {
      critical: integer(riskRecord.critical, `${itemPath}/risk_counts/critical`, diagnostics, 0),
      high: integer(riskRecord.high, `${itemPath}/risk_counts/high`, diagnostics, 0),
      medium: integer(riskRecord.medium, `${itemPath}/risk_counts/medium`, diagnostics, 0),
      low: integer(riskRecord.low, `${itemPath}/risk_counts/low`, diagnostics, 0)
    };
    if (typeof item.answerable !== "boolean") arrayPush(diagnostics, diagnostic2(
      "schema",
      "BOOLEAN_INVALID",
      `${itemPath}/answerable`,
      "answerable must be boolean"
    ));
    if (typeof item.current !== "boolean") arrayPush(diagnostics, diagnostic2(
      "schema",
      "BOOLEAN_INVALID",
      `${itemPath}/current`,
      "current must be boolean"
    ));
    if (ids.has(rootIssueId)) arrayPush(diagnostics, diagnostic2(
      "reference",
      "ROOT_SNAPSHOT_DUPLICATE",
      `${itemPath}/root_issue_id`,
      "root snapshot ledger IDs must be unique"
    ));
    ids.add(rootIssueId);
    arrayPush(output, {
      root_issue_id: rootIssueId,
      root_issue_key: rootIssueKey,
      missing_type: missingType2,
      semantic_refs: semanticRefs2,
      scope,
      affected_obligation_ids: stringSet(item.affected_obligation_ids, `${itemPath}/affected_obligation_ids`, diagnostics, true),
      risk_counts: riskCounts,
      question: canonicalString(item.question, `${itemPath}/question`, diagnostics),
      answerable: item.answerable === true,
      reasons: stringSet(item.reasons, `${itemPath}/reasons`, diagnostics, true),
      evidence_refs: stringSet(item.evidence_refs, `${itemPath}/evidence_refs`, diagnostics),
      current: item.current === true
    });
  }
  return arraySort(output, (left, right) => compareCodePoints2(left.root_issue_id, right.root_issue_id));
}
function normalizePriorState(value, path4, diagnostics) {
  const prior = record(value, path4, diagnostics);
  checkKeys(prior, [
    "source_revision",
    "clarification_event_seq",
    "asked_root_issue_ids",
    "root_issue_dispositions",
    "last_pending_root_issue_ids",
    "last_question_set_digest",
    "clarification_stop",
    "semantic_snapshot",
    "root_snapshot_ledger"
  ], path4, diagnostics);
  const sourceRevision = integer(prior.source_revision, `${path4}/source_revision`, diagnostics, 0);
  const eventSeq = integer(prior.clarification_event_seq, `${path4}/clarification_event_seq`, diagnostics, 0);
  const asked = stringSet(prior.asked_root_issue_ids, `${path4}/asked_root_issue_ids`, diagnostics);
  const pending = stringSet(prior.last_pending_root_issue_ids, `${path4}/last_pending_root_issue_ids`, diagnostics);
  const dispositions = [];
  const dispositionIds = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(prior.root_issue_dispositions, `${path4}/root_issue_dispositions`, diagnostics))) {
    const itemPath = `${path4}/root_issue_dispositions/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ["root_issue_id", "status"], itemPath, diagnostics);
    const rootIssueId = canonicalString(item.root_issue_id, `${itemPath}/root_issue_id`, diagnostics);
    const status = enumeration(item.status, ROOT_STATUSES, `${itemPath}/status`, diagnostics);
    if (dispositionIds.has(rootIssueId)) arrayPush(diagnostics, diagnostic2(
      "reference",
      "ROOT_DISPOSITION_DUPLICATE",
      `${itemPath}/root_issue_id`,
      "root issue disposition IDs must be unique"
    ));
    dispositionIds.add(rootIssueId);
    arrayPush(dispositions, { root_issue_id: rootIssueId, status });
  }
  arraySort(dispositions, (left, right) => compareCodePoints2(left.root_issue_id, right.root_issue_id));
  const lastDigest = canonicalString(prior.last_question_set_digest, `${path4}/last_question_set_digest`, diagnostics, true);
  let stop = null;
  if (prior.clarification_stop !== null) {
    const rawStop = record(prior.clarification_stop, `${path4}/clarification_stop`, diagnostics);
    checkKeys(rawStop, ["reason", "source_revision"], `${path4}/clarification_stop`, diagnostics);
    stop = {
      reason: enumeration(rawStop.reason, STOP_REASONS, `${path4}/clarification_stop/reason`, diagnostics),
      source_revision: integer(rawStop.source_revision, `${path4}/clarification_stop/source_revision`, diagnostics, 0)
    };
  }
  const semantic = prior.semantic_snapshot === null ? null : normalizeSemanticSnapshot(prior.semantic_snapshot, `${path4}/semantic_snapshot`, diagnostics);
  const ledger = normalizeRootLedger(prior.root_snapshot_ledger, `${path4}/root_snapshot_ledger`, diagnostics);
  return {
    source_revision: sourceRevision,
    clarification_event_seq: eventSeq,
    asked_root_issue_ids: asked,
    root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: pending,
    last_question_set_digest: lastDigest,
    clarification_stop: stop,
    semantic_snapshot: semantic,
    root_snapshot_ledger: ledger
  };
}
function validatePriorState(prior, diagnostics) {
  const dispositionById = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
  const ledgerById = new Map(arrayMap(prior.root_snapshot_ledger, (item) => [item.root_issue_id, item]));
  const askedHistory = new Set(prior.asked_root_issue_ids);
  const askedDispositions = arrayMap(
    arrayFilter(prior.root_issue_dispositions, (item) => item.status === "asked"),
    (item) => item.root_issue_id
  );
  if (!sameSet(prior.last_pending_root_issue_ids, askedDispositions)) arrayPush(diagnostics, diagnostic2(
    "classification",
    "PRIOR_PENDING_DISPOSITION_MISMATCH",
    "/prior_state/last_pending_root_issue_ids",
    "prior pending roots must exactly equal dispositions whose status is asked"
  ));
  for (const rootId of prior.last_pending_root_issue_ids) if (!askedHistory.has(rootId)) arrayPush(diagnostics, diagnostic2(
    "classification",
    "PRIOR_PENDING_NOT_ASKED",
    `/prior_state/last_pending_root_issue_ids/${pointerPart(rootId)}`,
    "every prior pending root must appear in the cumulative asked history"
  ));
  for (const { root_issue_id: rootId, status } of prior.root_issue_dispositions) {
    if (status === "open" && askedHistory.has(rootId) && ledgerById.get(rootId)?.current !== false) arrayPush(diagnostics, diagnostic2(
      "classification",
      "PRIOR_LIFECYCLE_STATE_INVALID",
      `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      "an open prior root can appear in asked history only as an explicitly reopened historical root"
    ));
    if (status !== "open" && status !== "suppressed_deferred" && !askedHistory.has(rootId)) arrayPush(diagnostics, diagnostic2(
      "classification",
      "PRIOR_DISPOSITION_HISTORY_MISMATCH",
      `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      "asked, resolved, and unknown-suppressed dispositions must appear in cumulative asked history"
    ));
    if (!ledgerById.has(rootId)) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "PRIOR_ROOT_SNAPSHOT_MISSING",
      `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      "every lifecycle disposition must retain its canonical root snapshot"
    ));
  }
  for (const rootId of prior.asked_root_issue_ids) if (!dispositionById.has(rootId)) arrayPush(diagnostics, diagnostic2(
    "classification",
    "PRIOR_DISPOSITION_HISTORY_MISMATCH",
    `/prior_state/asked_root_issue_ids/${pointerPart(rootId)}`,
    "every cumulative asked root must retain one lifecycle disposition"
  ));
  const priorPointById = new Map(arrayMap(
    prior.semantic_snapshot?.formal_test_points ?? [],
    (point) => [point.obligation_id, point]
  ));
  for (const root of prior.root_snapshot_ledger) {
    const status = dispositionById.get(root.root_issue_id);
    const requiresBlockedTuple = root.current || isRetainedGateStatus(status);
    const expectedReasons = /* @__PURE__ */ new Set();
    const reasons = new Set(root.reasons);
    if (!dispositionById.has(root.root_issue_id)) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "PRIOR_ROOT_DISPOSITION_MISSING",
      `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}`,
      "every retained root snapshot must retain one lifecycle disposition"
    ));
    for (const obligationId of root.affected_obligation_ids) {
      const point = priorPointById.get(obligationId);
      if (point?.classification === "blocked" && point.blocked_reason) expectedReasons.add(point.blocked_reason);
      if (!point || requiresBlockedTuple && (point.classification !== "blocked" || !reasons.has(point.blocked_reason))) arrayPush(diagnostics, diagnostic2(
        "traceability",
        "PRIOR_ROOT_ASSOCIATION_INVALID",
        `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}/affected_obligation_ids/${pointerPart(obligationId)}`,
        "a current prior root must retain its own Blocked formal obligation and reason association"
      ));
    }
    if (requiresBlockedTuple && !sameSet(root.reasons, [...expectedReasons])) arrayPush(
      diagnostics,
      diagnostic2(
        "traceability",
        "PRIOR_ROOT_ASSOCIATION_INVALID",
        `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}/reasons`,
        "an active or retained gated root must exactly summarize its associated Blocked reasons"
      )
    );
  }
  validateRootPartition(
    prior.root_snapshot_ledger,
    dispositionById,
    prior.semantic_snapshot,
    diagnostics,
    "/prior_state"
  );
  for (const rootId of prior.last_pending_root_issue_ids) if (!ledgerById.get(rootId)?.current) arrayPush(
    diagnostics,
    diagnostic2(
      "traceability",
      "PRIOR_PENDING_ROOT_SNAPSHOT_INVALID",
      `/prior_state/last_pending_root_issue_ids/${pointerPart(rootId)}`,
      "every pending root must identify a current canonical prior root snapshot"
    )
  );
  const expectedDigest = prior.last_pending_root_issue_ids.length === 0 ? "" : digest(arraySort([...prior.last_pending_root_issue_ids], compareCodePoints2));
  if (prior.last_question_set_digest !== expectedDigest) arrayPush(diagnostics, diagnostic2(
    "traceability",
    "PRIOR_PENDING_DIGEST_MISMATCH",
    "/prior_state/last_question_set_digest",
    "prior question-set digest must be derived from the exact sorted pending root set"
  ));
  if (prior.clarification_stop && (prior.last_pending_root_issue_ids.length > 0 || prior.clarification_stop.source_revision !== prior.source_revision)) arrayPush(diagnostics, diagnostic2(
    "classification",
    "PRIOR_STOP_STATE_INVALID",
    "/prior_state/clarification_stop",
    "prior clarification stop must belong to its exact revision and have no pending roots"
  ));
}
function isRetainedGateStatus(status) {
  return status === "suppressed_deferred" || status === "suppressed_unknown";
}
function validateRootPartition(ledger, dispositionById, semantics, diagnostics, path4) {
  if (!semantics) return;
  const currentOwners = /* @__PURE__ */ new Map();
  const retainedOwners = /* @__PURE__ */ new Map();
  for (const root of ledger) {
    const status = dispositionById.get(root.root_issue_id);
    const retained = !root.current && (isRetainedGateStatus(status) || status === "open");
    if (!root.current && !retained) continue;
    const index = root.current ? currentOwners : retainedOwners;
    for (const obligationId of root.affected_obligation_ids) {
      const bucket = index.get(obligationId) ?? [];
      arrayPush(bucket, root);
      index.set(obligationId, bucket);
    }
  }
  for (const point of semantics.formal_test_points) {
    if (point.classification !== "blocked") continue;
    const active = currentOwners.get(point.obligation_id) ?? [];
    const retained = retainedOwners.get(point.obligation_id) ?? [];
    if (active.length !== 1 && (active.length !== 0 || retained.length !== 1)) arrayPush(
      diagnostics,
      diagnostic2(
        "traceability",
        "PRIOR_ROOT_PARTITION_INVALID",
        `${path4}/root_snapshot_ledger`,
        "Blocked formal Test Points must form a complete nonoverlapping partition across active or retained gated roots"
      )
    );
  }
}
function normalizeAppendBatch(value, path4, diagnostics) {
  const batch = record(value, path4, diagnostics);
  checkKeys(batch, ["decision_records", "clarification_events"], path4, diagnostics);
  const decisions = [];
  const decisionIds = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(batch.decision_records, `${path4}/decision_records`, diagnostics))) {
    const itemPath = `${path4}/decision_records/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, [
      "decision_id",
      "question_id",
      "root_issue_ids",
      "affected_obligation_ids",
      "clarification_event_seq",
      "confirmer",
      "confirmed_at",
      "question",
      "answer",
      "disposition",
      "authority_scope",
      "effective_scope",
      "evidence_ref",
      "evidence_level"
    ], itemPath, diagnostics);
    const decisionId = canonicalString(item.decision_id, `${itemPath}/decision_id`, diagnostics);
    if (decisionIds.has(decisionId)) arrayPush(diagnostics, diagnostic2("reference", "DECISION_ID_DUPLICATE", `${itemPath}/decision_id`, "append Decision Record IDs must be unique"));
    decisionIds.add(decisionId);
    const disposition = enumeration(item.disposition, DECISION_DISPOSITIONS, `${itemPath}/disposition`, diagnostics);
    const answer = canonicalString(item.answer, `${itemPath}/answer`, diagnostics, disposition === "unknown" || disposition === "deferred");
    const evidenceLevel2 = enumeration(item.evidence_level, /* @__PURE__ */ new Set(["E1", "E3"]), `${itemPath}/evidence_level`, diagnostics);
    if (disposition === "final" && evidenceLevel2 !== "E3") arrayPush(diagnostics, diagnostic2("classification", "DECISION_EVIDENCE_LEVEL_INVALID", `${itemPath}/evidence_level`, "final Decision Record must be E3"));
    if (disposition === "temporary" && evidenceLevel2 !== "E1") arrayPush(diagnostics, diagnostic2("classification", "DECISION_EVIDENCE_LEVEL_INVALID", `${itemPath}/evidence_level`, "temporary Decision Record must be E1"));
    arrayPush(decisions, {
      decision_id: decisionId,
      question_id: canonicalString(item.question_id, `${itemPath}/question_id`, diagnostics),
      root_issue_ids: stringSet(item.root_issue_ids, `${itemPath}/root_issue_ids`, diagnostics, true),
      affected_obligation_ids: stringSet(item.affected_obligation_ids, `${itemPath}/affected_obligation_ids`, diagnostics),
      clarification_event_seq: integer(item.clarification_event_seq, `${itemPath}/clarification_event_seq`, diagnostics, 1),
      confirmer: canonicalString(item.confirmer, `${itemPath}/confirmer`, diagnostics),
      confirmed_at: canonicalString(item.confirmed_at, `${itemPath}/confirmed_at`, diagnostics),
      question: canonicalString(item.question, `${itemPath}/question`, diagnostics),
      answer,
      disposition,
      authority_scope: canonicalString(item.authority_scope, `${itemPath}/authority_scope`, diagnostics),
      effective_scope: canonicalString(item.effective_scope, `${itemPath}/effective_scope`, diagnostics),
      evidence_ref: canonicalString(item.evidence_ref, `${itemPath}/evidence_ref`, diagnostics),
      evidence_level: evidenceLevel2
    });
  }
  const events = [];
  const eventIds = /* @__PURE__ */ new Set();
  for (const [index, raw] of arrayEntries(array(batch.clarification_events, `${path4}/clarification_events`, diagnostics))) {
    const itemPath = `${path4}/clarification_events/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ["event_id", "clarification_event_seq", "type", "actor", "event_at", "root_issue_ids"], itemPath, diagnostics);
    const eventId = canonicalString(item.event_id, `${itemPath}/event_id`, diagnostics);
    if (eventIds.has(eventId)) arrayPush(diagnostics, diagnostic2("reference", "CONTROL_EVENT_ID_DUPLICATE", `${itemPath}/event_id`, "append control event IDs must be unique"));
    eventIds.add(eventId);
    arrayPush(events, {
      event_id: eventId,
      clarification_event_seq: integer(item.clarification_event_seq, `${itemPath}/clarification_event_seq`, diagnostics, 1),
      type: enumeration(item.type, CONTROL_TYPES, `${itemPath}/type`, diagnostics),
      actor: canonicalString(item.actor, `${itemPath}/actor`, diagnostics),
      event_at: canonicalString(item.event_at, `${itemPath}/event_at`, diagnostics),
      root_issue_ids: stringSet(item.root_issue_ids, `${itemPath}/root_issue_ids`, diagnostics, true)
    });
  }
  return { decision_records: decisions, clarification_events: events };
}
function sameSet(left, right) {
  return canonicalStringify(arraySort([...left], compareCodePoints2)) === canonicalStringify(arraySort([...right], compareCodePoints2));
}
function strictlyIncreasing(entries, key) {
  for (let index = 1; index < entries.length; index += 1) {
    if (Number(entries[index][key]) <= Number(entries[index - 1][key])) return false;
  }
  return true;
}
function validateHistory(prior, batch, sourceRevision, semantics, diagnostics) {
  if (!strictlyIncreasing(batch.decision_records, "clarification_event_seq")) arrayPush(diagnostics, diagnostic2(
    "classification",
    "CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE",
    "/append_batch/decision_records",
    "Decision Record append order must be strictly monotonic"
  ));
  if (!strictlyIncreasing(batch.clarification_events, "clarification_event_seq")) arrayPush(diagnostics, diagnostic2(
    "classification",
    "CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE",
    "/append_batch/clarification_events",
    "control event append order must be strictly monotonic"
  ));
  const combined = [
    ...arrayMap(batch.decision_records, (item) => ({ kind: "decision", seq: item.clarification_event_seq, item })),
    ...arrayMap(batch.clarification_events, (item) => ({ kind: "control", seq: item.clarification_event_seq, item }))
  ];
  arraySort(combined, (left, right) => left.seq - right.seq || compareCodePoints2(left.kind, right.kind));
  const seenSeq = /* @__PURE__ */ new Set();
  for (const entry of combined) {
    if (seenSeq.has(entry.seq)) arrayPush(diagnostics, diagnostic2(
      "classification",
      "CLARIFICATION_EVENT_SEQUENCE_DUPLICATE",
      "/append_batch",
      "Decision Records and control events share one unique sequence"
    ));
    seenSeq.add(entry.seq);
  }
  for (let index = 0; index < combined.length; index += 1) {
    if (combined[index].seq !== prior.clarification_event_seq + index + 1) arrayPush(diagnostics, diagnostic2(
      "classification",
      "CLARIFICATION_EVENT_SEQUENCE_GAP",
      "/append_batch",
      "append sequence must continue the prior sequence without gaps"
    ));
  }
  if (combined.length === 0) {
    if (sourceRevision !== prior.source_revision) arrayPush(diagnostics, diagnostic2(
      "classification",
      "APPEND_REVISION_INVALID",
      "/source_revision",
      "an empty append batch must replay the exact prior immutable source revision"
    ));
  } else if (sourceRevision !== prior.source_revision + 1) arrayPush(diagnostics, diagnostic2(
    "classification",
    "APPEND_REVISION_INVALID",
    "/source_revision",
    "one append batch must create exactly the next immutable source revision"
  ));
  const formalIds = new Set(arrayMap(semantics.formal_test_points, (point) => point.obligation_id));
  const pending = new Set(prior.last_pending_root_issue_ids);
  const decidedRoots = /* @__PURE__ */ new Set();
  for (const [index, item] of arrayEntries(batch.decision_records)) {
    const expectedQuestionId = stableId("question", { root_issue_ids: arraySort([...item.root_issue_ids], compareCodePoints2) });
    if (item.question_id !== expectedQuestionId) arrayPush(diagnostics, diagnostic2(
      "traceability",
      "DECISION_QUESTION_ID_MISMATCH",
      `/append_batch/decision_records/${index}/question_id`,
      "Decision question identity must be derived only from its sorted root issue set"
    ));
    for (const rootId of item.root_issue_ids) {
      if (!pending.has(rootId)) arrayPush(diagnostics, diagnostic2(
        "reference",
        "DECISION_ROOT_UNKNOWN",
        `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        "Decision Record must resolve a root from the prior complete pending set"
      ));
      if (decidedRoots.has(rootId)) arrayPush(diagnostics, diagnostic2(
        "classification",
        "DECISION_ROOT_DUPLICATE",
        `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        "one append batch cannot decide the same root more than once"
      ));
      decidedRoots.add(rootId);
    }
    for (const obligationId of item.affected_obligation_ids) if (!formalIds.has(obligationId)) arrayPush(diagnostics, diagnostic2(
      "reference",
      "DECISION_OBLIGATION_UNKNOWN",
      `/append_batch/decision_records/${index}/affected_obligation_ids/${pointerPart(obligationId)}`,
      "Decision Record affected Test Point must exist in the current formal snapshot"
    ));
  }
  const priorDisposition = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
  const reopened = /* @__PURE__ */ new Set();
  let requestDeliveryCount = 0;
  for (const [index, event] of arrayEntries(batch.clarification_events)) {
    if (event.type === "request_delivery") {
      requestDeliveryCount += 1;
      if (!sameSet(event.root_issue_ids, prior.last_pending_root_issue_ids)) arrayPush(diagnostics, diagnostic2(
        "classification",
        "REQUEST_DELIVERY_PENDING_SET_MISMATCH",
        `/append_batch/clarification_events/${index}/root_issue_ids`,
        "request_delivery must exactly equal the prior complete pending root set"
      ));
      if (combined[combined.length - 1]?.seq !== event.clarification_event_seq) arrayPush(diagnostics, diagnostic2(
        "classification",
        "REQUEST_DELIVERY_ORDER_INVALID",
        `/append_batch/clarification_events/${index}`,
        "request_delivery must be the final item in its append batch"
      ));
    } else if (event.type === "reopen_root_issues") {
      for (const rootId of event.root_issue_ids) {
        const status = priorDisposition.get(rootId);
        if (!status) arrayPush(diagnostics, diagnostic2(
          "reference",
          "REOPEN_ROOT_UNKNOWN",
          `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          "reopen event references an unknown prior root issue"
        ));
        else if (status !== "suppressed_unknown" && status !== "suppressed_deferred") arrayPush(diagnostics, diagnostic2(
          "classification",
          "REOPEN_STATUS_INVALID",
          `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          "only suppressed unknown or deferred roots may be reopened"
        ));
        if (reopened.has(rootId)) arrayPush(diagnostics, diagnostic2(
          "classification",
          "REOPEN_ROOT_DUPLICATE",
          `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          "one append batch cannot reopen the same root twice"
        ));
        reopened.add(rootId);
      }
    }
  }
  if (requestDeliveryCount > 1) arrayPush(diagnostics, diagnostic2(
    "classification",
    "REQUEST_DELIVERY_DUPLICATE",
    "/append_batch/clarification_events",
    "one append batch may contain at most one delivery request"
  ));
  if (requestDeliveryCount > 0 && reopened.size > 0) arrayPush(diagnostics, diagnostic2(
    "classification",
    "CONTROL_EVENT_CONFLICT",
    "/append_batch/clarification_events",
    "delivery and reopen controls cannot share one append batch"
  ));
  return combined;
}
function buildRootIssues(blocked, sourceRevision, diagnostics) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of blocked) {
    const signature = { missing_type: item.missing_type, semantic_refs: item.semantic_refs, scope: item.scope };
    const rootIssueId = stableId("root", signature);
    const rootIssueKey = canonicalStringify(signature);
    const existing = groups.get(rootIssueId);
    if (!existing) groups.set(rootIssueId, {
      root_issue_id: rootIssueId,
      root_issue_key: rootIssueKey,
      missing_type: item.missing_type,
      semantic_refs: [...item.semantic_refs],
      scope: item.scope,
      affected_obligation_ids: [item.obligation_id],
      risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
      source_revision: sourceRevision,
      question: item.question,
      answerable: item.answerable,
      reasons: [item.reason],
      evidence_refs: [...item.evidence_refs],
      batch_id: null
    });
    else if (existing.root_issue_key !== rootIssueKey) {
      arrayPush(diagnostics, diagnostic2(
        "traceability",
        "ROOT_ISSUE_ID_COLLISION",
        `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        "distinct semantic root keys cannot share one stable root issue ID"
      ));
      continue;
    } else {
      if (existing.question !== item.question || existing.answerable !== item.answerable) arrayPush(diagnostics, diagnostic2(
        "classification",
        "ROOT_DESCRIPTOR_CONFLICT",
        `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        "one semantic root must have one answerability and question contract"
      ));
      arrayPush(existing.affected_obligation_ids, item.obligation_id);
      arrayPush(existing.reasons, item.reason);
      arrayPush(existing.evidence_refs, ...item.evidence_refs);
    }
    groups.get(rootIssueId).risk_counts[item.risk] += 1;
  }
  const output = [...groups.values()];
  for (const root of output) {
    root.affected_obligation_ids = arraySort([...new Set(root.affected_obligation_ids)], compareCodePoints2);
    root.reasons = arraySort([...new Set(root.reasons)], compareCodePoints2);
    root.evidence_refs = arraySort([...new Set(root.evidence_refs)], compareCodePoints2);
  }
  return arraySort(output, (left, right) => compareCodePoints2(left.root_issue_id, right.root_issue_id));
}
function riskOrder(left, right) {
  for (const risk of ["critical", "high", "medium", "low"]) {
    const difference = Number(right.risk_counts[risk]) - Number(left.risk_counts[risk]);
    if (difference !== 0) return difference;
  }
  const affected = right.affected_obligation_ids.length - left.affected_obligation_ids.length;
  return affected || compareCodePoints2(left.root_issue_id, right.root_issue_id);
}
function pendingWithBatch(roots) {
  const sortedIds = arraySort(arrayMap(roots, (root) => root.root_issue_id), compareCodePoints2);
  const batchId = stableId("batch", { root_issue_ids: sortedIds });
  return arrayMap(roots, (root) => ({ ...structuredClone(root), batch_id: batchId }));
}
function rootSnapshot(root, current) {
  return {
    root_issue_id: root.root_issue_id,
    root_issue_key: root.root_issue_key,
    missing_type: root.missing_type,
    semantic_refs: [...root.semantic_refs],
    scope: root.scope,
    affected_obligation_ids: [...root.affected_obligation_ids],
    risk_counts: { ...root.risk_counts },
    question: root.question,
    answerable: root.answerable,
    reasons: [...root.reasons],
    evidence_refs: [...root.evidence_refs],
    current
  };
}
function nextRootLedger(priorLedger, roots, diagnostics) {
  const byId = /* @__PURE__ */ new Map();
  for (const prior of priorLedger) byId.set(prior.root_issue_id, { ...structuredClone(prior), current: false });
  for (const root of roots) {
    const prior = byId.get(root.root_issue_id);
    if (prior && prior.root_issue_key !== root.root_issue_key) {
      arrayPush(diagnostics, diagnostic2(
        "traceability",
        "ROOT_ISSUE_ID_COLLISION",
        `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}`,
        "a current root cannot reuse a historical ID for a different canonical semantic key"
      ));
      continue;
    }
    byId.set(root.root_issue_id, rootSnapshot(root, true));
  }
  return arraySort([...byId.values()], (left, right) => compareCodePoints2(left.root_issue_id, right.root_issue_id));
}
function projectDeliveryLanes(semantics) {
  const lane = (classification) => arrayMap(
    arrayFilter(semantics.formal_test_points, (point) => point.classification === classification),
    (point) => point.obligation_id
  );
  semantics.delivery_sections.grounded = lane("grounded");
  semantics.delivery_sections.conditional = lane("conditional");
  semantics.delivery_sections.blocked = lane("blocked");
  const executable = semantics.delivery_sections.grounded.length + semantics.delivery_sections.conditional.length;
  semantics.delivery_sections.quality.delivery_status = semantics.formal_test_points.length === 0 ? "no_applicable_formal_test_points" : executable === 0 && semantics.delivery_sections.blocked.length > 0 ? "no_deterministic_cases" : "executable_subset_ready";
  return semantics;
}
function projectBlockedSemantics(semantics, priorSemantics, obligationIds, diagnostics) {
  const output = structuredClone(semantics);
  const priorPoints = new Map(arrayMap(priorSemantics?.formal_test_points ?? [], (point) => [point.obligation_id, point]));
  for (const point of output.formal_test_points) {
    if (!obligationIds.has(point.obligation_id) || point.classification === "blocked") continue;
    const priorPoint = priorPoints.get(point.obligation_id);
    if (priorPoint?.classification !== "blocked") {
      arrayPush(diagnostics, diagnostic2(
        "classification",
        "BLOCKED_PROJECTION_UNAVAILABLE",
        `/semantic_snapshot/formal_test_points/${pointerPart(point.obligation_id)}`,
        "delivery suppression requires a retained prior Blocked formal tuple"
      ));
      continue;
    }
    point.classification = "blocked";
    point.evidence_level = priorPoint.evidence_level;
    point.blocked_reason = priorPoint.blocked_reason;
  }
  return projectDeliveryLanes(output);
}
function invalidDecision(policy, diagnostics, sourceRevision = 0) {
  return {
    action: "need_revision",
    source_revision: sourceRevision,
    root_issues: [],
    pending_root_issues: [],
    state: null,
    semantic_snapshot: null,
    interaction: { policy: POLICIES.has(policy) ? policy : null, paused: false },
    diagnostics: finalizeDiagnostics(diagnostics)
  };
}
function evaluateClarification(submittedContext, interactionPolicy) {
  const diagnostics = [];
  if (!POLICIES.has(interactionPolicy)) arrayPush(diagnostics, diagnostic2(
    "classification",
    "INTERACTION_POLICY_INVALID",
    "/interaction_policy",
    "internal interaction policy is outside the closed two-value contract"
  ));
  const captured = snapshotControlled(submittedContext);
  arrayPush(diagnostics, ...captured.diagnostics);
  if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics);
  try {
    const context = record(captured.snapshot, "/", diagnostics);
    checkKeys(context, ["source_revision", "blocked_obligations", "prior_state", "append_batch", "semantic_snapshot"], "", diagnostics);
    const sourceRevision = integer(context.source_revision, "/source_revision", diagnostics, 0);
    const blocked = normalizeBlocked(context.blocked_obligations, "/blocked_obligations", diagnostics);
    const prior = normalizePriorState(context.prior_state, "/prior_state", diagnostics);
    const batch = normalizeAppendBatch(context.append_batch, "/append_batch", diagnostics);
    const semantics = normalizeSemanticSnapshot(context.semantic_snapshot, "/semantic_snapshot", diagnostics);
    validatePriorState(prior, diagnostics);
    const combined = validateHistory(prior, batch, sourceRevision, semantics, diagnostics);
    const roots = buildRootIssues(blocked, sourceRevision, diagnostics);
    const pointById = new Map(arrayMap(semantics.formal_test_points, (point) => [point.obligation_id, point]));
    const descriptorIds = new Set(arrayMap(blocked, (item) => item.obligation_id));
    const priorDispositionById = new Map(arrayMap(
      prior.root_issue_dispositions,
      (item) => [item.root_issue_id, item.status]
    ));
    const replayGateRootIds = new Set(arrayMap(
      arrayFilter(prior.root_issue_dispositions, (item) => isRetainedGateStatus(item.status)),
      (item) => item.root_issue_id
    ));
    const replayLedger = nextRootLedger(prior.root_snapshot_ledger, roots, diagnostics);
    const retainedRootsByObligation = /* @__PURE__ */ new Map();
    for (const root of prior.root_snapshot_ledger) {
      const status = priorDispositionById.get(root.root_issue_id);
      const retained = isRetainedGateStatus(status) || !root.current && status === "open" || combined.length > 0 && status === "asked";
      if (!retained) continue;
      for (const obligationId of root.affected_obligation_ids) {
        const bucket = retainedRootsByObligation.get(obligationId) ?? [];
        arrayPush(bucket, root);
        retainedRootsByObligation.set(obligationId, bucket);
      }
    }
    for (const item of blocked) {
      const point = pointById.get(item.obligation_id);
      if (point?.classification !== "blocked") arrayPush(
        diagnostics,
        diagnostic2(
          "traceability",
          "BLOCKED_DESCRIPTOR_SET_MISMATCH",
          "/blocked_obligations",
          "every current root descriptor must identify a Blocked formal Test Point"
        )
      );
      else if (point.blocked_reason !== item.reason) arrayPush(
        diagnostics,
        diagnostic2(
          "traceability",
          "BLOCKED_REASON_DESCRIPTOR_MISMATCH",
          `/blocked_obligations/${pointerPart(item.obligation_id)}/reason`,
          "each current blocker descriptor reason must exactly equal its formal Test Point blocked reason"
        )
      );
    }
    for (const point of semantics.formal_test_points) if (point.classification === "blocked" && !descriptorIds.has(point.obligation_id)) {
      const retainedSuppression = (retainedRootsByObligation.get(point.obligation_id)?.length ?? 0) > 0;
      if (!retainedSuppression) arrayPush(diagnostics, diagnostic2(
        "traceability",
        "BLOCKED_DESCRIPTOR_SET_MISMATCH",
        "/blocked_obligations",
        "every current Blocked formal Test Point must have a current or retained suppressed root descriptor"
      ));
    }
    if (combined.length === 0 && sourceRevision === prior.source_revision && prior.semantic_snapshot !== null) {
      const currentSnapshots = arrayFilter(replayLedger, (root) => root.current);
      const priorCurrentSnapshots = arrayFilter(prior.root_snapshot_ledger, (root) => root.current);
      if (canonicalStringify(currentSnapshots) !== canonicalStringify(priorCurrentSnapshots)) arrayPush(
        diagnostics,
        diagnostic2(
          "traceability",
          "IMMUTABLE_ROOT_SNAPSHOT_MISMATCH",
          "/blocked_obligations",
          "one immutable revision must replay the exact same canonical root snapshot"
        )
      );
      const replayBlockedObligationIds = /* @__PURE__ */ new Set();
      for (const root of prior.root_snapshot_ledger) if (replayGateRootIds.has(root.root_issue_id)) {
        for (const obligationId of root.affected_obligation_ids) replayBlockedObligationIds.add(obligationId);
      }
      for (const obligationId of replayBlockedObligationIds) if (!pointById.has(obligationId)) arrayPush(
        diagnostics,
        diagnostic2(
          "traceability",
          "GATED_FORMAL_TEST_POINT_MISSING",
          `/semantic_snapshot/formal_test_points/${pointerPart(obligationId)}`,
          "every gated root must retain each affected formal Test Point in the current ledger"
        )
      );
      const replaySemantics = replayBlockedObligationIds.size > 0 ? projectBlockedSemantics(semantics, prior.semantic_snapshot, replayBlockedObligationIds, diagnostics) : semantics;
      if (canonicalStringify(replaySemantics) !== canonicalStringify(prior.semantic_snapshot)) arrayPush(
        diagnostics,
        diagnostic2(
          "traceability",
          "IMMUTABLE_SEMANTIC_SNAPSHOT_MISMATCH",
          "/semantic_snapshot",
          "one immutable revision must replay the exact same six-section semantic snapshot"
        )
      );
    }
    if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics, sourceRevision);
    const dispositions = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
    for (const root of roots) if (!dispositions.has(root.root_issue_id)) dispositions.set(root.root_issue_id, "open");
    const currentRootIds = new Set(arrayMap(roots, (root) => root.root_issue_id));
    const currentRootById = new Map(arrayMap(roots, (root) => [root.root_issue_id, root]));
    const priorRootById = new Map(arrayMap(prior.root_snapshot_ledger, (root) => [root.root_issue_id, root]));
    const priorAffectedByRootId = new Map(arrayMap(
      prior.root_snapshot_ledger,
      (root) => [root.root_issue_id, new Set(root.affected_obligation_ids)]
    ));
    const currentRootsByObligation = /* @__PURE__ */ new Map();
    for (const root of roots) for (const obligationId of root.affected_obligation_ids) {
      const bucket = currentRootsByObligation.get(obligationId) ?? [];
      arrayPush(bucket, root);
      currentRootsByObligation.set(obligationId, bucket);
    }
    const priorPoints = new Map(arrayMap(
      prior.semantic_snapshot?.formal_test_points ?? [],
      (point) => [point.obligation_id, point]
    ));
    const formalTuple = (point) => canonicalStringify({
      classification: point.classification,
      evidence_level: point.evidence_level,
      blocked_reason: point.blocked_reason
    });
    const decidedKinds = /* @__PURE__ */ new Map();
    let hasEffectiveDecision = false;
    let hasReopen = false;
    let requestDelivery = false;
    for (const entry of combined) {
      if (entry.kind === "decision") {
        const decisionRecord = (
          /** @type {any} */
          entry.item
        );
        const canProvideEvidence = decisionRecord.disposition === "final" || decisionRecord.disposition === "temporary";
        const decisionAffected = new Set(decisionRecord.affected_obligation_ids);
        for (const rootId of decisionRecord.root_issue_ids) {
          const priorRoot = priorRootById.get(rootId);
          const priorAffected = priorAffectedByRootId.get(rootId);
          let ownGain = false;
          if (canProvideEvidence && priorRoot && priorAffected && !currentRootIds.has(rootId)) {
            for (const obligationId of priorAffected) {
              if (!decisionAffected.has(obligationId)) continue;
              const priorPoint = priorPoints.get(obligationId);
              const currentPoint = pointById.get(obligationId);
              const tupleChanged = priorPoint?.classification === "blocked" && currentPoint && formalTuple(priorPoint) !== formalTuple(currentPoint);
              const replacement = priorPoint?.classification === "blocked" && arraySome(currentRootsByObligation.get(obligationId) ?? [], (currentRoot) => currentRoot.root_issue_id !== rootId && currentRoot.root_issue_key !== priorRoot.root_issue_key);
              if (tupleChanged || replacement) ownGain = true;
            }
          }
          const effective = canProvideEvidence && ownGain;
          const status = effective ? decisionRecord.disposition === "final" ? "resolved_final" : "resolved_temporary" : decisionRecord.disposition === "unknown" ? "suppressed_unknown" : "suppressed_deferred";
          if (effective) hasEffectiveDecision = true;
          dispositions.set(rootId, status);
          decidedKinds.set(rootId, decisionRecord.disposition);
        }
      } else {
        const event = (
          /** @type {any} */
          entry.item
        );
        if (event.type === "reopen_root_issues") {
          hasReopen = true;
          for (const rootId of event.root_issue_ids) dispositions.set(rootId, "open");
        } else requestDelivery = true;
      }
    }
    if (combined.length > 0) {
      for (const rootId of prior.last_pending_root_issue_ids) if (!decidedKinds.has(rootId)) dispositions.set(rootId, "suppressed_deferred");
    }
    let stop = null;
    let action = "deliver";
    let pendingRoots = [];
    const gateRootIds = /* @__PURE__ */ new Set();
    for (const [rootId, status] of dispositions) if (isRetainedGateStatus(status)) gateRootIds.add(rootId);
    if (requestDelivery) {
      for (const rootId of prior.last_pending_root_issue_ids) {
        dispositions.set(rootId, "suppressed_deferred");
        gateRootIds.add(rootId);
      }
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === "open" || status === "asked" || decidedKinds.has(root.root_issue_id))) {
          dispositions.set(root.root_issue_id, "suppressed_deferred");
          gateRootIds.add(root.root_issue_id);
        }
      }
      stop = { reason: "user_requested_delivery", source_revision: sourceRevision };
    } else if (batch.decision_records.length > 0 && !hasReopen && !hasEffectiveDecision) {
      for (const rootId of prior.last_pending_root_issue_ids) gateRootIds.add(rootId);
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === "open" || status === "asked")) {
          dispositions.set(root.root_issue_id, "suppressed_deferred");
          gateRootIds.add(root.root_issue_id);
        }
      }
      stop = { reason: "no_information_gain", source_revision: sourceRevision };
    } else if (interactionPolicy === "record_only") {
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (status === "open" || status === "asked") {
          dispositions.set(root.root_issue_id, "suppressed_deferred");
          gateRootIds.add(root.root_issue_id);
        }
      }
    } else if (interactionPolicy === "pause_for_clarification") {
      const idempotentPending = combined.length === 0 && sourceRevision === prior.source_revision ? new Set(prior.last_pending_root_issue_ids) : null;
      pendingRoots = arrayFilter(roots, (root) => root.answerable && (dispositions.get(root.root_issue_id) === "open" || idempotentPending?.has(root.root_issue_id) && dispositions.get(root.root_issue_id) === "asked"));
      arraySort(pendingRoots, riskOrder);
      if (pendingRoots.length > 0) {
        action = "need_user_answers";
        for (const root of pendingRoots) dispositions.set(root.root_issue_id, "asked");
      } else {
        const activePriorStop = prior.clarification_stop?.source_revision === sourceRevision ? prior.clarification_stop : null;
        stop = activePriorStop ? structuredClone(activePriorStop) : { reason: "converged", source_revision: sourceRevision };
      }
    }
    const pendingOutput = action === "need_user_answers" ? pendingWithBatch(pendingRoots) : [];
    const pendingIds = arraySort(arrayMap(pendingOutput, (root) => root.root_issue_id), compareCodePoints2);
    const askedIds = new Set(prior.asked_root_issue_ids);
    for (const rootId of pendingIds) askedIds.add(rootId);
    const blockedObligationIds = /* @__PURE__ */ new Set();
    for (const rootId of gateRootIds) {
      const priorRoot = priorRootById.get(rootId);
      const currentRoot = currentRootById.get(rootId);
      for (const obligationId of priorRoot?.affected_obligation_ids ?? []) blockedObligationIds.add(obligationId);
      for (const obligationId of currentRoot?.affected_obligation_ids ?? []) blockedObligationIds.add(obligationId);
    }
    for (const obligationId of blockedObligationIds) if (!pointById.has(obligationId)) arrayPush(
      diagnostics,
      diagnostic2(
        "traceability",
        "GATED_FORMAL_TEST_POINT_MISSING",
        `/semantic_snapshot/formal_test_points/${pointerPart(obligationId)}`,
        "every gated root must retain each affected formal Test Point in the current ledger"
      )
    );
    const deliveredSemantics = blockedObligationIds.size > 0 ? projectBlockedSemantics(semantics, prior.semantic_snapshot, blockedObligationIds, diagnostics) : structuredClone(semantics);
    const nextEventSeq = combined.length > 0 ? combined[combined.length - 1].seq : prior.clarification_event_seq;
    const dispositionOutput = arrayMap([...dispositions], ([root_issue_id, status]) => ({ root_issue_id, status }));
    arraySort(dispositionOutput, (left, right) => compareCodePoints2(left.root_issue_id, right.root_issue_id));
    const nextLedger = nextRootLedger(prior.root_snapshot_ledger, roots, diagnostics);
    validateRootPartition(nextLedger, dispositions, deliveredSemantics, diagnostics, "/state");
    if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics, sourceRevision);
    const state = {
      source_revision: sourceRevision,
      clarification_event_seq: nextEventSeq,
      asked_root_issue_ids: arraySort([...askedIds], compareCodePoints2),
      root_issue_dispositions: dispositionOutput,
      last_pending_root_issue_ids: pendingIds,
      last_question_set_digest: pendingIds.length > 0 ? digest(pendingIds) : "",
      clarification_stop: interactionPolicy === "record_only" ? null : stop,
      semantic_snapshot: structuredClone(deliveredSemantics),
      root_snapshot_ledger: structuredClone(nextLedger)
    };
    return {
      action,
      source_revision: sourceRevision,
      root_issues: structuredClone(roots),
      pending_root_issues: pendingOutput,
      state,
      semantic_snapshot: structuredClone(deliveredSemantics),
      interaction: { policy: interactionPolicy, paused: action === "need_user_answers" },
      diagnostics: []
    };
  } catch {
    return invalidDecision(interactionPolicy, [diagnostic2(
      "classification",
      "CLARIFICATION_INPUT_UNREADABLE",
      "/",
      "clarification input could not be evaluated from its trusted snapshot"
    )]);
  }
}

// src/source-policy.mjs
function isObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray2(value) {
  return Array.isArray(value) ? value.filter(isObject2) : [];
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function diagnostic3(code2, path4, message) {
  return { category: "reference", code: code2, path: path4, message };
}
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function intersectScopes(left, right) {
  const normalizedLeft = normalizeScope(left);
  const normalizedRight = normalizeScope(right);
  if (scopeContains(normalizedLeft, normalizedRight)) return normalizedRight;
  if (scopeContains(normalizedRight, normalizedLeft)) return normalizedLeft;
  return null;
}
function findCyclicRuleIds(graph) {
  const state = /* @__PURE__ */ new Map();
  const cyclic = /* @__PURE__ */ new Set();
  for (const start of graph.keys()) {
    if ((state.get(start) ?? 0) !== 0) continue;
    const stack = [{ id: start, next: 0 }];
    const pathPosition = /* @__PURE__ */ new Map([[start, 0]]);
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = (
        /** @type {{id: string, next: number}} */
        stack.at(-1)
      );
      const neighbors = graph.get(frame.id) ?? [];
      if (frame.next >= neighbors.length) {
        state.set(frame.id, 2);
        pathPosition.delete(frame.id);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.next];
      frame.next += 1;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        state.set(next, 1);
        pathPosition.set(next, stack.length);
        stack.push({ id: next, next: 0 });
      } else if (nextState === 1) {
        const cycleStart = pathPosition.get(next);
        if (cycleStart !== void 0) {
          for (let index = cycleStart; index < stack.length; index += 1) cyclic.add(stack[index].id);
        }
      }
    }
  }
  return cyclic;
}
var REACHABILITY_BITSET_BUDGET_BYTES = 8 * 1024 * 1024;
var REACHABILITY_SCOPE_CACHE_LIMIT = 16;
var SPARSE_SCOPE_CACHE_LIMIT = 64;
var SPARSE_REACHABILITY_CACHE_LIMIT = 2048;
function buildScopedReachability(graph, scopesById) {
  const ids = [...graph.keys()].sort();
  const globalIndegree = new Uint32Array(ids.length);
  const globalIndexById = new Map(ids.map((id, index) => [id, index]));
  for (const neighbors of graph.values()) {
    for (const neighbor of neighbors) {
      const index = globalIndexById.get(neighbor);
      if (index !== void 0) globalIndegree[index] += 1;
    }
  }
  const globalReady = [];
  for (let index = 0; index < ids.length; index += 1) if (globalIndegree[index] === 0) globalReady.push(ids[index]);
  const rankById = /* @__PURE__ */ new Map();
  for (let offset = 0; offset < globalReady.length; offset += 1) {
    const id = globalReady[offset];
    rankById.set(id, offset);
    for (const neighbor of graph.get(id) ?? []) {
      const index = (
        /** @type {number} */
        globalIndexById.get(neighbor)
      );
      globalIndegree[index] -= 1;
      if (globalIndegree[index] === 0) globalReady.push(neighbor);
    }
  }
  const denseByScope = /* @__PURE__ */ new Map();
  const sparseResults = /* @__PURE__ */ new Map();
  const sparseScopes = /* @__PURE__ */ new Set();
  let allocatedBitsetBytes = 0;
  function markSparseScope(scope) {
    sparseScopes.add(scope);
    if (sparseScopes.size > SPARSE_SCOPE_CACHE_LIMIT) {
      const oldestScope = sparseScopes.values().next().value;
      if (typeof oldestScope === "string") sparseScopes.delete(oldestScope);
    }
  }
  function maybeBuildDense(scope) {
    if (denseByScope.has(scope)) return denseByScope.get(scope);
    if (sparseScopes.has(scope)) return null;
    if (denseByScope.size >= REACHABILITY_SCOPE_CACHE_LIMIT) {
      markSparseScope(scope);
      return null;
    }
    const eligibleIds = ids.filter((id) => scopeContains(scopesById.get(id) ?? "", scope));
    const words = Math.ceil(eligibleIds.length / 32);
    const estimatedBytes = eligibleIds.length * words * Uint32Array.BYTES_PER_ELEMENT;
    if (allocatedBitsetBytes + estimatedBytes > REACHABILITY_BITSET_BUDGET_BYTES) {
      markSparseScope(scope);
      return null;
    }
    const indexById = new Map(eligibleIds.map((id, index) => [id, index]));
    const indegree = new Uint32Array(eligibleIds.length);
    for (const id of eligibleIds) {
      for (const neighbor of graph.get(id) ?? []) {
        const index = indexById.get(neighbor);
        if (index !== void 0) indegree[index] += 1;
      }
    }
    const ready = [];
    for (let index = 0; index < eligibleIds.length; index += 1) if (indegree[index] === 0) ready.push(eligibleIds[index]);
    const topological = [];
    for (let offset = 0; offset < ready.length; offset += 1) {
      const id = ready[offset];
      topological.push(id);
      for (const neighbor of graph.get(id) ?? []) {
        const index = indexById.get(neighbor);
        if (index === void 0) continue;
        indegree[index] -= 1;
        if (indegree[index] === 0) ready.push(neighbor);
      }
    }
    const descendants = new Map(eligibleIds.map((id) => [id, new Uint32Array(words)]));
    for (let order = topological.length - 1; order >= 0; order -= 1) {
      const id = topological[order];
      const bits = (
        /** @type {Uint32Array} */
        descendants.get(id)
      );
      for (const neighbor of graph.get(id) ?? []) {
        const neighborIndex = indexById.get(neighbor);
        if (neighborIndex === void 0) continue;
        bits[neighborIndex >>> 5] |= 1 << (neighborIndex & 31);
        const neighborBits = (
          /** @type {Uint32Array} */
          descendants.get(neighbor)
        );
        for (let word = 0; word < words; word += 1) bits[word] |= neighborBits[word];
      }
    }
    const closure = { indexById, descendants };
    denseByScope.set(scope, closure);
    allocatedBitsetBytes += estimatedBytes;
    return closure;
  }
  function cacheSparseResult(cacheKey, result) {
    sparseResults.set(cacheKey, result);
    if (sparseResults.size > SPARSE_REACHABILITY_CACHE_LIMIT) {
      const oldestKey = sparseResults.keys().next().value;
      if (typeof oldestKey === "string") sparseResults.delete(oldestKey);
    }
    return result;
  }
  return {
    /** @param {string} ruleId */
    rank(ruleId) {
      return rankById.get(ruleId) ?? Number.MAX_SAFE_INTEGER;
    },
    /** @param {string} start @param {string} target @param {string} scope */
    reaches(start, target, scope) {
      const normalizedScope = normalizeScope(scope);
      if (!graph.has(start) || !graph.has(target) || !scopeContains(scopesById.get(start) ?? "", normalizedScope) || !scopeContains(scopesById.get(target) ?? "", normalizedScope)) return false;
      const dense = maybeBuildDense(normalizedScope);
      if (dense) {
        const targetIndex = dense.indexById.get(target);
        const bits = dense.descendants.get(start);
        return targetIndex !== void 0 && bits !== void 0 && (bits[targetIndex >>> 5] & 1 << (targetIndex & 31)) !== 0;
      }
      const cacheKey = `${normalizedScope}\0${start}\0${target}`;
      const cached = sparseResults.get(cacheKey);
      if (cached !== void 0) return cached;
      const pending = [start];
      const visited = /* @__PURE__ */ new Set();
      while (pending.length > 0) {
        const current = pending.pop();
        if (current === target) return cacheSparseResult(cacheKey, true);
        if (current === void 0 || visited.has(current)) continue;
        visited.add(current);
        for (const neighbor of graph.get(current) ?? []) {
          if (scopeContains(scopesById.get(neighbor) ?? "", normalizedScope) && !visited.has(neighbor)) pending.push(neighbor);
        }
      }
      return cacheSparseResult(cacheKey, false);
    }
  };
}
function resolveSourcePolicy(sourcePack) {
  const pack = isObject2(sourcePack) ? sourcePack : {};
  const sources = objectArray2(pack.sources);
  const sourceIds = new Set(sources.flatMap((source) => typeof source.source_id === "string" ? [source.source_id] : []));
  const policy = isObject2(pack.source_policy) ? pack.source_policy : {};
  const rules = objectArray2(policy.rules);
  const ruleById = new Map(rules.flatMap((rule) => typeof rule.rule_id === "string" ? [[rule.rule_id, rule]] : []));
  const invalidRuleIds = /* @__PURE__ */ new Set();
  const danglingEdgeRuleIds = /* @__PURE__ */ new Set();
  const declaredGraph = /* @__PURE__ */ new Map();
  const diagnostics = [];
  rules.forEach((rule, ruleIndex) => {
    if (typeof rule.rule_id !== "string") return;
    const supersedes = stringArray(rule.supersedes);
    declaredGraph.set(rule.rule_id, supersedes.filter((id) => ruleById.has(id)));
    stringArray(rule.source_ids).forEach((sourceId, sourceIndex) => {
      if (!sourceIds.has(sourceId)) {
        invalidRuleIds.add(
          /** @type {string} */
          rule.rule_id
        );
        diagnostics.push(diagnostic3(
          "SOURCE_POLICY_SOURCE_DANGLING",
          `/source_policy/rules/${ruleIndex}/source_ids/${sourceIndex}`,
          `source policy references unknown source "${sourceId}"`
        ));
      }
    });
    supersedes.forEach((supersededId, edgeIndex) => {
      if (!ruleById.has(supersededId)) {
        danglingEdgeRuleIds.add(
          /** @type {string} */
          rule.rule_id
        );
        diagnostics.push(diagnostic3(
          "SOURCE_POLICY_SUPERSEDES_DANGLING",
          `/source_policy/rules/${ruleIndex}/supersedes/${edgeIndex}`,
          `source policy references unknown superseded rule "${supersededId}"`
        ));
      }
    });
  });
  const cyclicIds = findCyclicRuleIds(declaredGraph);
  if (cyclicIds.size > 0) diagnostics.push(diagnostic3(
    "SOURCE_POLICY_CYCLE",
    "/source_policy/rules",
    `source policy supersedes graph contains a cycle: ${[...cyclicIds].sort().join(", ")}`
  ));
  for (const ruleId of cyclicIds) invalidRuleIds.add(ruleId);
  const eligibleRules = rules.filter((rule) => typeof rule.rule_id === "string" && typeof rule.scope === "string" && rule.scope.trim().length > 0 && !invalidRuleIds.has(rule.rule_id));
  const transitRules = eligibleRules.filter((rule) => !danglingEdgeRuleIds.has(
    /** @type {string} */
    rule.rule_id
  ));
  const transitIds = new Set(transitRules.map((rule) => (
    /** @type {string} */
    rule.rule_id
  )));
  const graph = new Map(transitRules.map((rule) => {
    const id = (
      /** @type {string} */
      rule.rule_id
    );
    return [id, (declaredGraph.get(id) ?? []).filter((target) => transitIds.has(target))];
  }));
  const scopesById = new Map(transitRules.map((rule) => [
    /** @type {string} */
    rule.rule_id,
    normalizeScope(
      /** @type {string} */
      rule.scope
    )
  ]));
  const reachability = buildScopedReachability(graph, scopesById);
  const activeRules = eligibleRules.filter((rule) => rule.status === "effective");
  const decisionValidation = validateDecisionRecords(pack);
  diagnostics.push(...decisionValidation.diagnostics);
  const precedenceExclusions = /* @__PURE__ */ new Map();
  const fullySuperseded = /* @__PURE__ */ new Set();
  const precedenceCandidates = [...activeRules].sort((left, right) => reachability.rank(
    /** @type {string} */
    left.rule_id
  ) - reachability.rank(
    /** @type {string} */
    right.rule_id
  ));
  for (const loser of activeRules) {
    const loserId = (
      /** @type {string} */
      loser.rule_id
    );
    for (const winner of precedenceCandidates) {
      const winnerId = (
        /** @type {string} */
        winner.rule_id
      );
      const scope = intersectScopes(
        /** @type {string} */
        winner.scope,
        /** @type {string} */
        loser.scope
      );
      if (winnerId !== loserId && scope !== null && reachability.reaches(winnerId, loserId, scope)) {
        const exclusions = precedenceExclusions.get(loserId) ?? /* @__PURE__ */ new Set();
        exclusions.add(scope);
        precedenceExclusions.set(loserId, exclusions);
        if (scopeContains(
          scope,
          /** @type {string} */
          loser.scope
        )) {
          fullySuperseded.add(loserId);
          break;
        }
      }
    }
  }
  const conflicts = [];
  const conflictExclusions = /* @__PURE__ */ new Map();
  const conflictCandidates = activeRules.filter((rule) => !fullySuperseded.has(
    /** @type {string} */
    rule.rule_id
  ));
  for (let leftIndex = 0; leftIndex < conflictCandidates.length; leftIndex += 1) {
    const left = conflictCandidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < conflictCandidates.length; rightIndex += 1) {
      const right = conflictCandidates[rightIndex];
      const leftId = (
        /** @type {string} */
        left.rule_id
      );
      const rightId = (
        /** @type {string} */
        right.rule_id
      );
      const scope = intersectScopes(
        /** @type {string} */
        left.scope,
        /** @type {string} */
        right.scope
      );
      if (scope === null || reachability.reaches(leftId, rightId, scope) || reachability.reaches(rightId, leftId, scope)) continue;
      if ([...precedenceExclusions.get(leftId) ?? []].some((excluded) => scopeContains(excluded, scope)) || [...precedenceExclusions.get(rightId) ?? []].some((excluded) => scopeContains(excluded, scope))) continue;
      const leftSources = stringArray(left.source_ids).sort();
      const rightSources = stringArray(right.source_ids).sort();
      if (JSON.stringify(leftSources) === JSON.stringify(rightSources)) continue;
      const ruleIds = [leftId, rightId].sort();
      const conflictingSourceIds = [.../* @__PURE__ */ new Set([...leftSources, ...rightSources])].sort();
      const signature = { rule_ids: ruleIds, scope, source_ids: conflictingSourceIds };
      const rootIssueId = stableId("root", { missing_type: "source-conflict", ...signature });
      const resolved = [...decisionValidation.validFinalDecisionIds].some((decisionId) => {
        const decision = decisionValidation.decisionsById.get(decisionId);
        return decision !== void 0 && typeof decision.authority_scope === "string" && scopeContains(decision.authority_scope, scope) && typeof decision.effective_scope === "string" && scopeContains(decision.effective_scope, scope) && stringArray(decision.root_issue_ids).includes(rootIssueId);
      });
      if (resolved) {
        conflictExclusions.set(leftId, [...conflictExclusions.get(leftId) ?? [], scope]);
        conflictExclusions.set(rightId, [...conflictExclusions.get(rightId) ?? [], scope]);
      } else {
        conflicts.push({
          conflict_id: stableId("source_conflict", signature),
          root_issue_id: rootIssueId,
          scope,
          rule_ids: ruleIds,
          source_ids: conflictingSourceIds
        });
      }
    }
  }
  for (const conflict of conflicts) {
    for (const ruleId of conflict.rule_ids) {
      conflictExclusions.set(ruleId, [...conflictExclusions.get(ruleId) ?? [], conflict.scope]);
    }
  }
  const effectiveRules = activeRules.flatMap((rule) => {
    const ruleId = (
      /** @type {string} */
      rule.rule_id
    );
    const excludedScopes = [...new Set([
      ...precedenceExclusions.get(ruleId) ?? [],
      ...conflictExclusions.get(ruleId) ?? []
    ].map(normalizeScope))].sort();
    if (excludedScopes.some((scope) => scopeContains(
      scope,
      /** @type {string} */
      rule.scope
    ))) return [];
    return [{
      claim_id: ruleId,
      claim_form: "source-policy",
      source_ids: stringArray(rule.source_ids).sort(),
      scope: normalizeScope(
        /** @type {string} */
        rule.scope
      ),
      authority: typeof rule.authority === "string" ? rule.authority : "",
      excluded_scopes: excludedScopes
    }];
  });
  const effectiveDecisions = [...decisionValidation.validFinalDecisionIds].flatMap((decisionId) => {
    const decision = decisionValidation.decisionsById.get(decisionId);
    if (!decision || typeof decision.effective_scope !== "string" || typeof decision.authority_scope !== "string") return [];
    return [{
      claim_id: decisionId,
      claim_form: "decision-record",
      source_ids: [],
      scope: normalizeScope(decision.effective_scope),
      authority: normalizeScope(decision.authority_scope)
    }];
  });
  const effectiveClaims = [...effectiveRules, ...effectiveDecisions].sort((left, right) => compareStrings(left.claim_id, right.claim_id));
  diagnostics.sort((left, right) => compareStrings(`${left.code}\0${left.path}`, `${right.code}\0${right.path}`));
  conflicts.sort((left, right) => compareStrings(left.conflict_id, right.conflict_id));
  return { effectiveClaims, conflicts, diagnostics };
}

// src/evidence.mjs
var E2_TARGETS = Object.freeze({
  formula: Object.freeze(["test-data", "expected-value"]),
  "decision-table-instance": Object.freeze(["expected-value", "model-element"]),
  "boundary-representative": Object.freeze(["test-data"]),
  "enumeration-complement": Object.freeze(["test-data", "model-element"]),
  "graph-reachability": Object.freeze(["model-element"])
});
var NORMATIVE_SOURCE_KINDS = /* @__PURE__ */ new Set([
  "prd",
  "acceptance-criteria",
  "interaction-spec",
  "interface-contract",
  "formal-rule",
  "review-record",
  "decision-record"
]);
var EFFECTIVE_SOURCE_STATUSES = /* @__PURE__ */ new Set(["approved", "effective"]);
var ROUNDING_RULES = /* @__PURE__ */ new Set(["half-up", "half-even", "floor", "ceiling", "truncate"]);
function isObject3(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray3(value) {
  return Array.isArray(value) ? value.filter(isObject3) : [];
}
function stringArray2(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function diagnostic4(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function compareStrings2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}
function absoluteBigInt(value) {
  return value < 0n ? -value : value;
}
function greatestCommonDivisor(left, right) {
  let a = absoluteBigInt(left);
  let b = absoluteBigInt(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error("formula divides by zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: sign * denominator / divisor };
}
function parseDecimal(value) {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`formula value "${value}" is not an exact decimal`);
  const fraction = match[3] ?? match[4] ?? "";
  const integer2 = match[2] ?? "0";
  const digits = `${integer2}${fraction}`.replace(/^0+(?=\d)/, "");
  const exponent = Number(match[5] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1e4) throw new Error("formula exponent is out of range");
  const scale = fraction.length - exponent;
  let numerator = BigInt(digits);
  let denominator = 1n;
  if (scale >= 0) denominator = 10n ** BigInt(scale);
  else numerator *= 10n ** BigInt(-scale);
  if (match[1] === "-") numerator = -numerator;
  return rational(numerator, denominator);
}
function applyBinary(left, right, operator) {
  if (operator === "+") return rational(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
  if (operator === "-") return rational(left.numerator * right.denominator - right.numerator * left.denominator, left.denominator * right.denominator);
  if (operator === "*") return rational(left.numerator * right.numerator, left.denominator * right.denominator);
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}
function evaluateFormula(expression, variables) {
  const trimmed = expression.trim();
  if (trimmed.length === 0) throw new Error("formula is empty");
  const tokens = [];
  let offset = 0;
  const tokenPattern = /(?:[A-Za-z_][A-Za-z0-9_]*|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|[()+\-*/])/y;
  while (offset < trimmed.length) {
    while (/\s/.test(trimmed[offset] ?? "")) offset += 1;
    if (offset >= trimmed.length) break;
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(trimmed);
    if (!match) throw new Error("formula contains an unsupported token");
    tokens.push(match[0]);
    offset = tokenPattern.lastIndex;
  }
  const output = [];
  const operators = [];
  const precedence = /* @__PURE__ */ new Map([["+", 1], ["-", 1], ["*", 2], ["/", 2], ["u+", 3], ["u-", 3]]);
  const rightAssociative = /* @__PURE__ */ new Set(["u+", "u-"]);
  let expectsOperand = true;
  for (const rawToken of tokens) {
    if (/^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(rawToken) || /^[A-Za-z_]/.test(rawToken)) {
      if (!expectsOperand) throw new Error("formula is missing an operator");
      output.push(rawToken);
      expectsOperand = false;
    } else if (rawToken === "(") {
      if (!expectsOperand) throw new Error("formula is missing an operator before parenthesis");
      operators.push(rawToken);
    } else if (rawToken === ")") {
      if (expectsOperand) throw new Error("formula has an empty or incomplete parenthesis");
      while (operators.length > 0 && operators.at(-1) !== "(") output.push(
        /** @type {string} */
        operators.pop()
      );
      if (operators.pop() !== "(") throw new Error("formula has unmatched parenthesis");
      expectsOperand = false;
    } else {
      const token = expectsOperand && (rawToken === "+" || rawToken === "-") ? `u${rawToken}` : rawToken;
      if (expectsOperand && token !== "u+" && token !== "u-") throw new Error("formula has an operator without a left operand");
      const tokenPrecedence = (
        /** @type {number} */
        precedence.get(token)
      );
      while (operators.length > 0 && operators.at(-1) !== "(") {
        const top = (
          /** @type {string} */
          operators.at(-1)
        );
        const topPrecedence = (
          /** @type {number} */
          precedence.get(top)
        );
        if (topPrecedence < tokenPrecedence || topPrecedence === tokenPrecedence && rightAssociative.has(token)) break;
        output.push(
          /** @type {string} */
          operators.pop()
        );
      }
      operators.push(token);
      expectsOperand = true;
    }
  }
  if (expectsOperand) throw new Error("formula ends with an operator");
  while (operators.length > 0) {
    const operator = (
      /** @type {string} */
      operators.pop()
    );
    if (operator === "(") throw new Error("formula has unmatched parenthesis");
    output.push(operator);
  }
  const values = [];
  for (const token of output) {
    if (token === "u+" || token === "u-") {
      const value = values.pop();
      if (!value) throw new Error("formula is incomplete");
      values.push(token === "u-" ? { numerator: -value.numerator, denominator: value.denominator } : value);
    } else if (precedence.has(token)) {
      const right = values.pop();
      const left = values.pop();
      if (!left || !right) throw new Error("formula is incomplete");
      values.push(applyBinary(left, right, token));
    } else if (/^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(token)) {
      values.push(parseDecimal(token));
    } else {
      const value = variables.get(token);
      if (!value) throw new Error(`formula input "${token}" is missing`);
      values.push(value);
    }
  }
  if (values.length !== 1) throw new Error("formula did not produce one number");
  return values[0];
}
function roundValue(value, precision, rule) {
  const scale = 10n ** BigInt(precision);
  const negative = value.numerator < 0n;
  const scaledNumerator = absoluteBigInt(value.numerator) * scale;
  let magnitude = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder !== 0n) {
    if (rule === "floor" && negative) magnitude += 1n;
    else if (rule === "ceiling" && !negative) magnitude += 1n;
    else if (rule === "half-up" && remainder * 2n >= value.denominator) magnitude += 1n;
    else if (rule === "half-even") {
      const doubled = remainder * 2n;
      if (doubled > value.denominator || doubled === value.denominator && magnitude % 2n !== 0n) magnitude += 1n;
    }
  }
  const signed = negative && magnitude !== 0n ? -magnitude : magnitude;
  const absolute = absoluteBigInt(signed).toString().padStart(precision + 1, "0");
  if (precision === 0) return `${signed < 0n ? "-" : ""}${absolute}`;
  return `${signed < 0n ? "-" : ""}${absolute.slice(0, -precision)}.${absolute.slice(-precision)}`;
}
function recomputeDerivedValue(claim, acceptedClaims2) {
  const parameters = isObject3(claim.parameters) ? claim.parameters : {};
  const ruleInput = isObject3(claim.rule_input) ? claim.rule_input : {};
  if (claim.derivation_kind === "formula") {
    for (const field of ["unit", "precision", "rounding"]) {
      if (field in parameters && field in ruleInput && parameters[field] !== ruleInput[field]) {
        return { code: "E2_FORMULA_METADATA_MISMATCH", message: `formula ${field} disagrees between parameters and rule input` };
      }
    }
    const formula = typeof ruleInput.formula === "string" ? ruleInput.formula : null;
    const inputs = objectArray3(ruleInput.inputs);
    const unit = typeof ruleInput.unit === "string" ? ruleInput.unit : typeof parameters.unit === "string" ? parameters.unit : null;
    const precision = typeof ruleInput.precision === "number" ? ruleInput.precision : parameters.precision;
    const rounding = typeof ruleInput.rounding === "string" ? ruleInput.rounding : parameters.rounding;
    if (formula === null || inputs.length === 0 || unit === null || unit.trim().length === 0 || !Number.isInteger(precision) || /** @type {number} */
    precision < 0 || /** @type {number} */
    precision > 1e3 || typeof rounding !== "string" || !ROUNDING_RULES.has(rounding)) {
      return { code: "E2_FORMULA_INPUT_INCOMPLETE", message: "formula derivation requires formula, inputs, unit, precision, and a supported rounding rule" };
    }
    const variables = /* @__PURE__ */ new Map();
    for (const input of inputs) {
      if (typeof input.name !== "string" || input.name.length === 0 || typeof input.value !== "number" && typeof input.value !== "string") {
        return { code: "E2_FORMULA_INPUT_INCOMPLETE", message: "every formula input requires a name and numeric value" };
      }
      if ("unit" in input && (typeof input.unit !== "string" || input.unit.trim().length === 0)) {
        return { code: "E2_FORMULA_INPUT_INCOMPLETE", message: "an optional formula input unit must be nonblank when present" };
      }
      if (variables.has(input.name)) return { code: "E2_FORMULA_VARIABLE_DUPLICATE", message: `formula input "${input.name}" is duplicated` };
      try {
        const serialized = typeof input.value === "number" ? String(input.value) : input.value;
        variables.set(input.name, parseDecimal(serialized));
      } catch (error) {
        return { code: "E2_FORMULA_INPUT_INVALID", message: error instanceof Error ? error.message : `formula input "${input.name}" is invalid` };
      }
    }
    try {
      return { value: roundValue(
        evaluateFormula(formula, variables),
        /** @type {number} */
        precision,
        rounding
      ) };
    } catch (error) {
      return { code: "E2_FORMULA_INVALID", message: error instanceof Error ? error.message : "formula cannot be evaluated" };
    }
  }
  if (claim.derivation_kind === "decision-table-instance") {
    if (typeof ruleInput.outcome !== "string" || ruleInput.outcome.length === 0) {
      return { code: "E2_OUTCOME_REQUIRED", message: "decision-table derivation requires an explicit outcome" };
    }
    const sourceBacked = stringArray2(claim.parent_claim_ids).some((parentId) => acceptedClaims2.get(parentId)?.value === ruleInput.outcome);
    if (!sourceBacked) return { code: "E2_OUTCOME_NOT_SOURCE_BACKED", message: "decision-table outcome must equal an explicit parent claim value" };
    return { value: ruleInput.outcome };
  }
  if (claim.derivation_kind === "boundary-representative") {
    const lower = ruleInput.lower;
    const upper = ruleInput.upper;
    if (typeof lower !== "number" || !Number.isFinite(lower) || typeof upper !== "number" || !Number.isFinite(upper) || lower > upper) {
      return { code: "E2_BOUNDARY_INPUT_INVALID", message: "boundary derivation requires finite ordered lower and upper bounds" };
    }
    const submitted = typeof claim.value === "string" ? Number(claim.value) : Number.NaN;
    if (!Number.isFinite(submitted) || submitted !== lower && submitted !== upper) {
      return { code: "E2_VALUE_MISMATCH", message: "submitted boundary value is not one of the declared bounds" };
    }
    return { value: String(submitted) };
  }
  if (claim.derivation_kind === "enumeration-complement") {
    if (ruleInput.closed_world !== true) return { code: "E2_CLOSED_WORLD_REQUIRED", message: "enumeration complement requires closed_world=true" };
    const enumerated = stringArray2(ruleInput.enumerated_values);
    if (enumerated.length === 0) return { code: "E2_ENUMERATION_INPUT_INVALID", message: "enumeration complement requires declared values" };
    if (typeof claim.value !== "string" || enumerated.includes(claim.value)) {
      return { code: "E2_VALUE_MISMATCH", message: "submitted complement value must be outside the closed enumeration" };
    }
    return { value: claim.value };
  }
  if (claim.derivation_kind === "graph-reachability") {
    if (typeof ruleInput.from !== "string" || typeof ruleInput.to !== "string") {
      return { code: "E2_GRAPH_INPUT_INVALID", message: "graph reachability requires from and to nodes" };
    }
    const edges = stringArray2(claim.parent_claim_ids).flatMap((parentId) => {
      const value = acceptedClaims2.get(parentId)?.value;
      if (typeof value !== "string") return [];
      const match = /^\s*(.+?)\s*->\s*(.+?)\s*$/.exec(value);
      return match ? [[match[1], match[2]]] : [];
    });
    const graph = /* @__PURE__ */ new Map();
    const nodes = /* @__PURE__ */ new Set();
    for (const [from, to] of edges) {
      nodes.add(from);
      nodes.add(to);
      const neighbors = graph.get(from);
      if (neighbors) neighbors.push(to);
      else graph.set(from, [to]);
    }
    if (!nodes.has(ruleInput.from) || !nodes.has(ruleInput.to)) {
      return { code: "E2_GRAPH_NODE_UNKNOWN", message: "graph reachability endpoints must exist in the parent edge graph" };
    }
    const pending = [ruleInput.from];
    const visited = /* @__PURE__ */ new Set();
    let reachable = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === ruleInput.to) {
        reachable = true;
        break;
      }
      if (current === void 0 || visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of graph.get(current) ?? []) pending.push(neighbor);
    }
    if (!reachable) return { code: "E2_GRAPH_NOT_REACHABLE", message: "parent claims do not establish graph reachability" };
    return { value: `${ruleInput.from}->${ruleInput.to}` };
  }
  return { code: "E2_DERIVATION_KIND_INVALID", message: "derivation kind is not allowed" };
}
function findE2Cycles(claims) {
  const state = /* @__PURE__ */ new Map();
  const cyclic = /* @__PURE__ */ new Set();
  const parentsById = new Map([...claims].flatMap(([claimId, claim]) => claim.level === "E2" ? [[claimId, stringArray2(claim.parent_claim_ids).filter((id) => claims.get(id)?.level === "E2")]] : []));
  for (const [start, startClaim] of claims) {
    if (startClaim.level !== "E2" || (state.get(start) ?? 0) !== 0) continue;
    const stack = [{ id: start, next: 0 }];
    const pathPosition = /* @__PURE__ */ new Map([[start, 0]]);
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = (
        /** @type {{id: string, next: number}} */
        stack.at(-1)
      );
      const parents = parentsById.get(frame.id) ?? [];
      if (frame.next >= parents.length) {
        state.set(frame.id, 2);
        pathPosition.delete(frame.id);
        stack.pop();
        continue;
      }
      const next = parents[frame.next];
      frame.next += 1;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        state.set(next, 1);
        pathPosition.set(next, stack.length);
        stack.push({ id: next, next: 0 });
      } else if (nextState === 1) {
        const cycleStart = pathPosition.get(next);
        if (cycleStart !== void 0) {
          for (let index = cycleStart; index < stack.length; index += 1) cyclic.add(stack[index].id);
        }
      }
    }
  }
  return cyclic;
}
function validateEvidenceGraph(sourcePack, evidenceClaims) {
  const pack = isObject3(sourcePack) ? sourcePack : {};
  const artifact = isObject3(evidenceClaims) ? evidenceClaims : {};
  const claims = objectArray3(artifact.claims);
  const rawClaims = /* @__PURE__ */ new Map();
  const claimIndexById = /* @__PURE__ */ new Map();
  claims.forEach((claim, index) => {
    if (typeof claim.claim_id === "string") {
      rawClaims.set(claim.claim_id, claim);
      claimIndexById.set(claim.claim_id, index);
    }
  });
  const sources = new Map(objectArray3(pack.sources).flatMap((source) => typeof source.source_id === "string" ? [[source.source_id, source]] : []));
  const locators = new Map(objectArray3(pack.locators).flatMap((locator) => typeof locator.locator_id === "string" ? [[locator.locator_id, locator]] : []));
  const decisionValidation = validateDecisionRecords(pack);
  const factLedger2 = objectArray3(artifact.fact_ledger);
  let factConflicts = [];
  const policy = resolveSourcePolicy(pack);
  const cyclicClaims = findE2Cycles(rawClaims);
  const acceptedClaims2 = /* @__PURE__ */ new Map();
  const diagnostics = [...policy.diagnostics];
  const validated = /* @__PURE__ */ new Set();
  function validateLocatorReferences(claim, index) {
    let valid = true;
    for (const [locatorIndex, locatorId] of stringArray2(claim.source_locator_ids).entries()) {
      const locator = locators.get(locatorId);
      if (!locator) {
        diagnostics.push(diagnostic4("reference", "SOURCE_LOCATOR_DANGLING", `/claims/${index}/source_locator_ids/${locatorIndex}`, `claim references unknown locator "${locatorId}"`));
        valid = false;
      } else if (typeof locator.source_id !== "string" || !sources.has(locator.source_id)) {
        valid = false;
      }
    }
    return valid;
  }
  function evaluateClaim(claimId) {
    const claim = rawClaims.get(claimId);
    if (!claim || validated.has(claimId)) return;
    const index = claimIndexById.get(claimId) ?? 0;
    let valid = validateLocatorReferences(claim, index);
    if (claim.level === "E0") {
      diagnostics.push(diagnostic4("classification", "E0_NOT_EVIDENCE", `/claims/${index}/level`, "E0 is a risk hypothesis and cannot enter the evidence graph"));
      valid = false;
    } else if (claim.claim_form === "direct") {
      const sourceId = typeof claim.source_id === "string" ? claim.source_id : "";
      const source = sources.get(sourceId);
      if (!source) {
        diagnostics.push(diagnostic4("reference", "SOURCE_DANGLING", `/claims/${index}/source_id`, `claim references unknown source "${sourceId}"`));
        valid = false;
      } else {
        if (claim.level !== "E3") {
          diagnostics.push(diagnostic4("classification", "DIRECT_CLAIM_LEVEL_INVALID", `/claims/${index}/level`, "a direct authoritative claim must be E3"));
          valid = false;
        }
        if (!NORMATIVE_SOURCE_KINDS.has(
          /** @type {string} */
          source.kind
        )) {
          diagnostics.push(diagnostic4("classification", "SOURCE_KIND_NOT_NORMATIVE", `/claims/${index}/source_id`, "current behavior and historical defects cannot supply normative E3 evidence"));
          valid = false;
        }
        if (!EFFECTIVE_SOURCE_STATUSES.has(
          /** @type {string} */
          source.status
        )) {
          diagnostics.push(diagnostic4("classification", "SOURCE_NOT_EFFECTIVE", `/claims/${index}/source_id`, "only approved or effective sources can supply E3 evidence"));
          valid = false;
        }
        const sourceLocators = stringArray2(claim.source_locator_ids).map((locatorId) => locators.get(locatorId)).filter(Boolean);
        if (sourceLocators.some((locator) => locator?.source_id !== sourceId)) {
          diagnostics.push(diagnostic4("reference", "LOCATOR_SOURCE_MISMATCH", `/claims/${index}/source_locator_ids`, "every direct-claim locator must belong to its source"));
          valid = false;
        }
        if (sourceLocators.some((locator) => locator?.extraction_integrity === "uncertain")) {
          diagnostics.push(diagnostic4("classification", "E3_EXTRACTION_UNCERTAIN", `/claims/${index}/source_locator_ids`, "uncertain extraction cannot become E3"));
          valid = false;
        }
        const scope = typeof claim.scope === "string" ? claim.scope : "";
        const sourceEffective = policy.effectiveClaims.some((effective) => {
          if (effective.claim_form !== "source-policy" || !stringArray2(effective.source_ids).includes(sourceId) || !scopeContains(effective.scope, scope)) return false;
          const excludedScopes = "excluded_scopes" in effective ? stringArray2(effective.excluded_scopes) : [];
          return !excludedScopes.some((excluded) => scopesIntersect(excluded, scope));
        });
        if (!sourceEffective) {
          diagnostics.push(diagnostic4("classification", "SOURCE_POLICY_NOT_EFFECTIVE", `/claims/${index}/source_id`, "source is not effective for the claim scope"));
          valid = false;
        }
      }
    } else if (claim.claim_form === "decision-record") {
      const decisionId = typeof claim.decision_id === "string" ? claim.decision_id : "";
      const decision = decisionValidation.decisionsById.get(decisionId);
      if (!decision) {
        diagnostics.push(diagnostic4("reference", "DECISION_RECORD_DANGLING", `/claims/${index}/decision_id`, `claim references unknown Decision Record "${decisionId}"`));
        valid = false;
      } else {
        const evidenceDisposition = decision.disposition === "final" || decision.disposition === "temporary";
        const expectedClaimLevel = decision.disposition === "final" ? "E3" : decision.disposition === "temporary" ? "E1" : null;
        if (!evidenceDisposition) {
          diagnostics.push(diagnostic4(
            "classification",
            "DECISION_DISPOSITION_NOT_EVIDENCE",
            `/claims/${index}/decision_id`,
            "unknown and deferred Decision Records cannot supply evidence"
          ));
          valid = false;
        } else if (claim.level !== expectedClaimLevel) {
          diagnostics.push(diagnostic4(
            "classification",
            "DECISION_CLAIM_LEVEL_MISMATCH",
            `/claims/${index}/level`,
            `${decision.disposition} Decision Record requires a ${expectedClaimLevel} claim`
          ));
          valid = false;
        }
        const sharedValid = decision.disposition === "final" ? decisionValidation.validFinalDecisionIds.has(decisionId) : decision.disposition === "temporary" ? decisionValidation.validTemporaryDecisionIds.has(decisionId) : false;
        if (!sharedValid) valid = false;
        if (typeof decision.evidence_ref === "string" && locators.has(decision.evidence_ref) && !stringArray2(claim.source_locator_ids).includes(decision.evidence_ref)) {
          diagnostics.push(diagnostic4("reference", "DECISION_EVIDENCE_MISMATCH", `/claims/${index}/source_locator_ids`, "Decision Record evidence must be included in the claim locator references"));
          valid = false;
        }
        if (typeof claim.authority !== "string" || typeof decision.authority_scope !== "string" || normalizeScope(claim.authority) !== normalizeScope(decision.authority_scope)) {
          diagnostics.push(diagnostic4("classification", "DECISION_AUTHORITY_MISMATCH", `/claims/${index}/authority`, "claim authority must match the Decision Record authority scope"));
          valid = false;
        }
        if (typeof claim.scope !== "string" || typeof decision.authority_scope !== "string" || !scopeContains(decision.authority_scope, claim.scope)) {
          diagnostics.push(diagnostic4("classification", "DECISION_AUTHORITY_SCOPE_MISMATCH", `/claims/${index}/scope`, "Decision Record authority does not cover the claim scope"));
          valid = false;
        }
        if (typeof claim.scope !== "string" || typeof decision.effective_scope !== "string" || !scopeContains(decision.effective_scope, claim.scope)) {
          diagnostics.push(diagnostic4("classification", "DECISION_SCOPE_MISMATCH", `/claims/${index}/scope`, "Decision Record does not cover the claim scope"));
          valid = false;
        }
        if (claim.value !== decision.answer) {
          diagnostics.push(diagnostic4("classification", "DECISION_VALUE_MISMATCH", `/claims/${index}/value`, "claim value must equal the recorded answer"));
          valid = false;
        }
        const claimScope = typeof claim.scope === "string" ? claim.scope : null;
        const decisionRootIds = new Set(stringArray2(decision.root_issue_ids));
        const namesOverlappingConflict = claimScope !== null && (policy.conflicts.some((conflict) => scopesIntersect(conflict.scope, claimScope) && decisionRootIds.has(conflict.root_issue_id)) || factConflicts.some((conflict) => scopesIntersect(conflict.scope, claimScope) && decisionRootIds.has(conflict.root_issue_id)));
        if (decision.disposition === "temporary" && sharedValid && claim.level === "E1" && namesOverlappingConflict) {
          diagnostics.push(diagnostic4("classification", "E1_CANNOT_OVERRIDE_CONFLICT", `/claims/${index}`, "temporary evidence cannot override an unresolved E3/E2 source conflict"));
          valid = false;
        }
      }
    } else if (claim.claim_form === "derived" && claim.level === "E2") {
      if (cyclicClaims.has(claimId)) {
        diagnostics.push(diagnostic4("classification", "E2_CYCLE", `/claims/${index}/parent_claim_ids`, "E2 derivation graph must be acyclic"));
        valid = false;
      }
      const derivationKind = typeof claim.derivation_kind === "string" ? claim.derivation_kind : "";
      const target = typeof claim.derivation_target === "string" ? claim.derivation_target : "";
      const allowedTargets = E2_TARGETS[
        /** @type {keyof typeof E2_TARGETS} */
        derivationKind
      ];
      if (!allowedTargets || !allowedTargets.includes(target)) {
        diagnostics.push(diagnostic4("classification", "E2_TARGET_NOT_ALLOWED", `/claims/${index}/derivation_target`, "derivation kind cannot produce the requested target"));
        valid = false;
      }
      if (claim.kind !== claim.derivation_target) {
        diagnostics.push(diagnostic4("classification", "E2_KIND_TARGET_MISMATCH", `/claims/${index}/kind`, "derived claim kind must equal its derivation target"));
        valid = false;
      }
      const parentLocatorIds = /* @__PURE__ */ new Set();
      for (const [parentIndex, parentId] of stringArray2(claim.parent_claim_ids).entries()) {
        const parent = rawClaims.get(parentId);
        if (!parent) {
          diagnostics.push(diagnostic4("reference", "E2_PARENT_DANGLING", `/claims/${index}/parent_claim_ids/${parentIndex}`, `E2 references unknown parent "${parentId}"`));
          valid = false;
        } else if (parent.level !== "E3" && parent.level !== "E2") {
          diagnostics.push(diagnostic4("classification", "E2_PARENT_LEVEL_INVALID", `/claims/${index}/parent_claim_ids/${parentIndex}`, "E2 parents must be E3 or E2"));
          valid = false;
        } else if (!acceptedClaims2.has(parentId)) {
          diagnostics.push(diagnostic4("classification", "E2_CHAIN_NOT_GROUNDED", `/claims/${index}/parent_claim_ids/${parentIndex}`, "every E2 chain must end at accepted E3 evidence"));
          valid = false;
        } else {
          const acceptedParent = (
            /** @type {Record<string, unknown>} */
            acceptedClaims2.get(parentId)
          );
          if (typeof acceptedParent.scope !== "string" || typeof claim.scope !== "string" || !scopeContains(acceptedParent.scope, claim.scope)) {
            diagnostics.push(diagnostic4("classification", "E2_PARENT_SCOPE_MISMATCH", `/claims/${index}/parent_claim_ids/${parentIndex}`, "every accepted parent scope must contain the derived claim scope"));
            valid = false;
          }
          for (const locatorId of stringArray2(acceptedParent.source_locator_ids)) parentLocatorIds.add(locatorId);
        }
      }
      for (const locatorId of stringArray2(claim.source_locator_ids)) {
        if (!parentLocatorIds.has(locatorId)) {
          diagnostics.push(diagnostic4("classification", "E2_PROVENANCE_ANCHOR_NOT_IN_PARENTS", `/claims/${index}/source_locator_ids`, "derived provenance anchors must be inherited from accepted parents"));
          valid = false;
          break;
        }
      }
      if (valid) {
        const recomputed = recomputeDerivedValue(claim, acceptedClaims2);
        if ("code" in recomputed) {
          diagnostics.push(diagnostic4("classification", recomputed.code, `/claims/${index}/rule_input`, recomputed.message));
          valid = false;
        } else if (claim.value !== recomputed.value) {
          diagnostics.push(diagnostic4("classification", "E2_VALUE_MISMATCH", `/claims/${index}/value`, "submitted E2 value does not equal the recomputed value"));
          valid = false;
        }
      }
    } else {
      diagnostics.push(diagnostic4("classification", "EVIDENCE_FORM_INVALID", `/claims/${index}`, "claim form and evidence level are not permitted"));
      valid = false;
    }
    validated.add(claimId);
    if (valid) acceptedClaims2.set(claimId, claim);
  }
  function validateIteratively(rootId) {
    const stack = [{ id: rootId, expanded: false }];
    while (stack.length > 0) {
      const frame = (
        /** @type {{id: string, expanded: boolean}} */
        stack.pop()
      );
      if (validated.has(frame.id) || !rawClaims.has(frame.id)) continue;
      const claim = (
        /** @type {Record<string, unknown>} */
        rawClaims.get(frame.id)
      );
      if (!frame.expanded && claim.claim_form === "derived" && claim.level === "E2" && !cyclicClaims.has(frame.id)) {
        stack.push({ id: frame.id, expanded: true });
        const parents = stringArray2(claim.parent_claim_ids);
        for (let index = parents.length - 1; index >= 0; index -= 1) {
          const parentId = parents[index];
          const parent = rawClaims.get(parentId);
          if (parent && (parent.level === "E3" || parent.level === "E2") && !validated.has(parentId)) {
            stack.push({ id: parentId, expanded: false });
          }
        }
      } else {
        evaluateClaim(frame.id);
      }
    }
  }
  for (const [claimId, claim] of rawClaims) {
    if (claim.level === "E3" || claim.level === "E2") validateIteratively(claimId);
  }
  factConflicts = factLedger2.filter((entry) => entry.status === "conflicted").flatMap((entry) => {
    const primaryId = typeof entry.claim_id === "string" ? entry.claim_id : "";
    const primary = acceptedClaims2.get(primaryId);
    const sourceClaimIds = [...new Set(stringArray2(entry.source_claim_ids))].sort();
    const acceptedSources = sourceClaimIds.map((claimId) => acceptedClaims2.get(claimId));
    const isHigher = (claim) => claim?.level === "E3" || claim?.level === "E2";
    if (!isHigher(primary) || sourceClaimIds.length < 2 || acceptedSources.some((claim) => !isHigher(claim))) return [];
    const scope = typeof primary?.scope === "string" ? normalizeScope(primary.scope) : "";
    if (scope.length === 0) return [];
    return [{
      root_issue_id: stableId("root", {
        missing_type: "fact-conflict",
        fact_id: typeof entry.fact_id === "string" ? entry.fact_id : "",
        source_claim_ids: sourceClaimIds,
        scope
      }),
      scope
    }];
  });
  for (const claimId of rawClaims.keys()) validateIteratively(claimId);
  factLedger2.forEach((entry, entryIndex) => {
    if (typeof entry.claim_id === "string") {
      if (!rawClaims.has(entry.claim_id)) diagnostics.push(diagnostic4(
        "reference",
        "FACT_CLAIM_DANGLING",
        `/fact_ledger/${entryIndex}/claim_id`,
        `fact references unknown claim "${entry.claim_id}"`
      ));
      else if (!acceptedClaims2.has(entry.claim_id)) diagnostics.push(diagnostic4(
        "classification",
        "FACT_CLAIM_NOT_ACCEPTED",
        `/fact_ledger/${entryIndex}/claim_id`,
        `fact references rejected claim "${entry.claim_id}"`
      ));
    }
    stringArray2(entry.source_claim_ids).forEach((claimId, sourceIndex) => {
      if (!rawClaims.has(claimId)) diagnostics.push(diagnostic4(
        "reference",
        "FACT_SOURCE_CLAIM_DANGLING",
        `/fact_ledger/${entryIndex}/source_claim_ids/${sourceIndex}`,
        `fact references unknown source claim "${claimId}"`
      ));
      else if (!acceptedClaims2.has(claimId)) diagnostics.push(diagnostic4(
        "classification",
        "FACT_SOURCE_CLAIM_NOT_ACCEPTED",
        `/fact_ledger/${entryIndex}/source_claim_ids/${sourceIndex}`,
        `fact references rejected source claim "${claimId}"`
      ));
    });
  });
  const uniqueDiagnostics = /* @__PURE__ */ new Map();
  for (const item of diagnostics) uniqueDiagnostics.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  const sortedDiagnostics = [...uniqueDiagnostics.values()].sort((left, right) => compareStrings2(`${left.category}\0${left.code}\0${left.path}`, `${right.category}\0${right.code}\0${right.path}`));
  const claimsById = new Map([...acceptedClaims2].sort(([left], [right]) => compareStrings2(left, right)));
  return { claimsById, diagnostics: sortedDiagnostics };
}

// src/classify.mjs
var DIAGNOSTIC_LIMIT2 = 256;
var RISKS2 = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
var CAPABILITY_STATUSES = /* @__PURE__ */ new Set(["provided", "verified", "approved-assumption", "unavailable", "unknown"]);
var GROUNDED_CAPABILITIES = /* @__PURE__ */ new Set(["provided", "verified"]);
var COMPARISONS = /* @__PURE__ */ new Set(["equals", "contains", "matches", "within"]);
var ORACLE_FIELDS = Object.freeze({
  value: "expected_value",
  state: "expected_state",
  event: "expected_event",
  "side-effect": "expected_side_effect"
});
var NATIVE_MAP_ENTRIES = Map.prototype.entries;
var NATIVE_MAP_SET = Map.prototype.set;
var NATIVE_MAP_ITERATOR_NEXT = Object.getPrototypeOf(NATIVE_MAP_ENTRIES.call(/* @__PURE__ */ new Map())).next;
var NATIVE_ARRAY_IS_ARRAY2 = Array.isArray;
var NATIVE_GET_PROTOTYPE_OF2 = Object.getPrototypeOf;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTORS2 = Object.getOwnPropertyDescriptors;
var NATIVE_DEFINE_PROPERTY2 = Object.defineProperty;
var NATIVE_REFLECT_OWN_KEYS2 = Reflect.ownKeys;
var KEYS = Object.freeze({
  context: ["sourceRevision", "evidence", "obligations", "caseDrafts"],
  evidence: ["claimsById", "factLedger", "conflicts"],
  obligationsArtifact: ["schema_version", "source_revision", "obligations", "fact_routes", "interaction_routes"],
  caseDraftsArtifact: ["schema_version", "source_revision", "cases", "obligation_dispositions", "exploratory_candidates"],
  obligation: ["obligation_id", "kind", "risk", "scope", "source_claim_ids", "view_element_refs", "required_oracle_refs", "required_capabilities"],
  fact: ["fact_id", "claim_id", "status", "source_claim_ids"],
  conflict: ["conflict_id", "root_issue_id", "scope", "rule_ids", "source_ids"],
  caseDraft: ["case_id", "title", "scope", "risk", "role", "fact_ids", "obligation_ids", "source_claim_ids", "preconditions", "data", "steps", "testability_profile", "post_state", "cleanup", "evidence_refs", "temporary_assumption", "execution_signature"],
  role: ["value", "evidence_ref", "support_review"],
  precondition: ["condition", "reachable_from", "source_claim_ids", "evidence_ref", "support_review"],
  data: ["name", "value", "provenance", "support_review"],
  provenance: ["type", "ref"],
  step: ["step_id", "action", "action_evidence_ref", "support_review", "expectations"],
  expectation: ["expectation_id", "business_assertion", "preceding_action_id", "observer", "observation_surface", "observation_target", "oracle", "evidence_ref", "support_review"],
  oracle: ["type", "expected_value", "expected_state", "expected_event", "expected_side_effect", "comparison", "tolerance", "window"],
  profile: ["capabilities", "observers", "controls"],
  capability: ["capability", "status", "provenance_ref"],
  observer: ["observer", "observation_target", "status", "provenance_ref"],
  control: ["control", "status", "provenance_ref"],
  postState: ["state", "evidence_ref", "support_review"],
  cleanup: ["required", "steps", "evidence_ref", "no_cleanup_reason", "no_cleanup_evidence_ref", "support_review"],
  temporaryAssumption: ["claim_id", "invalidation_condition"],
  execution: ["role", "precondition_state", "data_partition", "action_path", "oracle_refs", "test_point_ids"],
  exploratory: ["exploratory_id", "title", "scope", "risk", "source_claim_ids"]
});
function compareCodePoints3(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !NATIVE_ARRAY_IS_ARRAY2(value) && !(value instanceof Map);
}
function isNonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isCanonicalString(value) {
  return isNonblank(value) && value === value.trim();
}
function pointerPart2(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
function diagnostic5(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function finalizeDiagnostics2(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of diagnostics) {
    unique.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT2) {
    const truncated = diagnostic5(
      "classification",
      "DIAGNOSTICS_TRUNCATED",
      "/",
      `diagnostics are bounded at ${DIAGNOSTIC_LIMIT2} entries`
    );
    unique.set(`${truncated.category}\0${truncated.code}\0${truncated.path}\0${truncated.message}`, truncated);
  }
  return [...unique.values()].sort((left, right) => compareCodePoints3(
    `${left.category}\0${left.code}\0${left.path}\0${left.message}`,
    `${right.category}\0${right.code}\0${right.path}\0${right.message}`
  )).slice(0, DIAGNOSTIC_LIMIT2);
}
function resultWithDiagnostics(diagnostics) {
  return {
    grounded: [],
    conditional: [],
    blocked: [],
    not_applicable: [],
    exploratory: [],
    diagnostics: finalizeDiagnostics2(diagnostics)
  };
}
function snapshotControlled2(root) {
  const diagnostics = [];
  let diagnosticsTruncated = false;
  const addSnapshotDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT2 - 1) diagnostics.push(item);
    else diagnosticsTruncated = true;
  };
  let snapshot;
  const pending = [{ source: root, path: "", assign(value) {
    snapshot = value;
  } }];
  const seen = /* @__PURE__ */ new Map();
  while (pending.length > 0) {
    const { source, path: path4, assign } = (
      /** @type {{source: unknown, path: string, assign: (value: unknown) => void}} */
      pending.pop()
    );
    if (!source || typeof source !== "object") {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      assign(seen.get(source));
      continue;
    }
    if (source instanceof Map) {
      if (NATIVE_GET_PROTOTYPE_OF2(source) !== Map.prototype) {
        addSnapshotDiagnostic(diagnostic5(
          "schema",
          "RECORD_PROTOTYPE_INVALID",
          path4 || "/",
          "accepted evidence Map must use the built-in Map prototype"
        ));
        assign(null);
        continue;
      }
      if (NATIVE_REFLECT_OWN_KEYS2(source).length > 0) {
        addSnapshotDiagnostic(diagnostic5(
          "schema",
          "MAP_OWN_PROPERTY_INVALID",
          path4 || "/",
          "accepted evidence Map cannot have own string or symbol properties"
        ));
        assign(null);
        continue;
      }
      let entries;
      try {
        entries = NATIVE_MAP_ENTRIES.call(source);
      } catch {
        addSnapshotDiagnostic(diagnostic5(
          "schema",
          "MAP_BRAND_INVALID",
          path4 || "/",
          "accepted evidence Map must have genuine native Map internal slots"
        ));
        assign(null);
        continue;
      }
      const capturedEntries = [];
      while (true) {
        const next = NATIVE_MAP_ITERATOR_NEXT.call(entries);
        if (next.done) break;
        capturedEntries.push(next.value);
      }
      const target2 = /* @__PURE__ */ new Map();
      seen.set(source, target2);
      assign(target2);
      const validEntries = capturedEntries.filter(([key]) => typeof key === "string").sort(([left], [right]) => compareCodePoints3(String(left), String(right)));
      if (validEntries.length !== capturedEntries.length) addSnapshotDiagnostic(diagnostic5(
        "schema",
        "CANONICAL_STRING_INVALID",
        `${path4}/invalid-map-key`,
        "accepted evidence Map keys must be strings"
      ));
      for (let index = validEntries.length - 1; index >= 0; index -= 1) {
        const [key, child] = validEntries[index];
        pending.push({
          source: child,
          path: `${path4}/${pointerPart2(String(key))}`,
          assign(value) {
            NATIVE_MAP_SET.call(target2, String(key), value);
          }
        });
      }
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY2(source)) {
      if (NATIVE_GET_PROTOTYPE_OF2(source) !== Array.prototype) {
        addSnapshotDiagnostic(diagnostic5(
          "schema",
          "RECORD_PROTOTYPE_INVALID",
          path4 || "/",
          "controlled arrays must use the built-in Array prototype"
        ));
        assign(null);
        continue;
      }
      const descriptors2 = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS2(source);
      const lengthDescriptor = (
        /** @type {PropertyDescriptor | undefined} */
        descriptors2["length"]
      );
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, "value") && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      let validOwnKeys = true;
      const ownKeys2 = NATIVE_REFLECT_OWN_KEYS2(descriptors2);
      let hasSymbol2 = false;
      for (const key of ownKeys2) if (typeof key === "symbol") hasSymbol2 = true;
      if (hasSymbol2) {
        validOwnKeys = false;
        addSnapshotDiagnostic(diagnostic5(
          "schema",
          "ARRAY_SYMBOL_PROPERTY_INVALID",
          path4 || "/",
          "controlled arrays cannot contain own symbol properties"
        ));
      }
      const stringKeys2 = ownKeys2.filter((key) => typeof key === "string").sort(compareCodePoints3);
      const numericKeys = [];
      for (const key of stringKeys2) {
        if (key === "length") continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          validOwnKeys = false;
          addSnapshotDiagnostic(diagnostic5("schema", "UNKNOWN_KEY", `${path4}/${pointerPart2(key)}`, "controlled arrays cannot contain named properties"));
        } else numericKeys.push(index);
      }
      if (!validOwnKeys) {
        assign(null);
        continue;
      }
      numericKeys.sort((left, right) => left - right);
      const target2 = new Array(length);
      seen.set(source, target2);
      assign(target2);
      let nextExpectedIndex = 0;
      let holesTruncated = false;
      const emitHoleGap = (start, end) => {
        if (holesTruncated || start >= end) return;
        const available = Math.max(0, DIAGNOSTIC_LIMIT2 - 1 - diagnostics.length);
        const emitCount = Math.min(end - start, available);
        for (let offset = 0; offset < emitCount; offset += 1) addSnapshotDiagnostic(diagnostic5(
          "schema",
          "ARRAY_HOLE",
          `${path4}/${start + offset}`,
          "controlled arrays must be dense"
        ));
        if (emitCount < end - start) {
          diagnosticsTruncated = true;
          holesTruncated = true;
        }
      };
      for (const index of numericKeys) {
        emitHoleGap(nextExpectedIndex, index);
        nextExpectedIndex = index + 1;
      }
      emitHoleGap(nextExpectedIndex, length);
      const children2 = [];
      for (const index of numericKeys) {
        const descriptor = descriptors2[String(index)];
        if (!Object.hasOwn(descriptor, "value")) {
          addSnapshotDiagnostic(diagnostic5("schema", "ACCESSOR_NOT_ALLOWED", `${path4}/${index}`, "controlled values must be own data properties"));
        } else {
          children2.push({
            source: descriptor.value,
            path: `${path4}/${index}`,
            assign(value) {
              target2[index] = value;
            }
          });
        }
      }
      for (let index = children2.length - 1; index >= 0; index -= 1) pending.push(children2[index]);
      continue;
    }
    const prototype = NATIVE_GET_PROTOTYPE_OF2(source);
    if (prototype !== Object.prototype && prototype !== null) {
      addSnapshotDiagnostic(diagnostic5(
        "schema",
        "RECORD_PROTOTYPE_INVALID",
        path4 || "/",
        "controlled records must use a plain or null prototype"
      ));
      assign(null);
      continue;
    }
    const descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS2(source);
    const target = prototype === null ? /* @__PURE__ */ Object.create(null) : {};
    seen.set(source, target);
    assign(target);
    const ownKeys = NATIVE_REFLECT_OWN_KEYS2(descriptors);
    let hasSymbol = false;
    for (const key of ownKeys) if (typeof key === "symbol") hasSymbol = true;
    if (hasSymbol) addSnapshotDiagnostic(diagnostic5(
      "schema",
      "RECORD_SYMBOL_PROPERTY_INVALID",
      path4 || "/",
      "controlled records cannot contain own symbol properties"
    ));
    const stringKeys = ownKeys.filter((key) => typeof key === "string").sort(compareCodePoints3);
    const children = [];
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      const childPath = `${path4}/${pointerPart2(key)}`;
      if (!Object.hasOwn(descriptor, "value")) addSnapshotDiagnostic(diagnostic5(
        "schema",
        "ACCESSOR_NOT_ALLOWED",
        childPath,
        "controlled values must be own data properties"
      ));
      else children.push({
        source: descriptor.value,
        path: childPath,
        assign(value) {
          NATIVE_DEFINE_PROPERTY2(target, key, { value, enumerable: true, writable: true, configurable: true });
        }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  if (diagnosticsTruncated) diagnostics.push(diagnostic5(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT2} entries`
  ));
  return { snapshot, diagnostics };
}
function checkKeys2(value, allowed, path4, diagnostics) {
  if (!isRecord2(value)) return;
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) diagnostics.push(diagnostic5(
      "schema",
      "UNKNOWN_KEY",
      `${path4}/${pointerPart2(key)}`,
      "unknown controlled field is not allowed"
    ));
  }
}
function stringArray3(value, nonempty = false) {
  if (!Array.isArray(value) || nonempty && value.length === 0) return null;
  const output = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isCanonicalString(item) || seen.has(item)) return null;
    seen.add(item);
    output.push(item);
  }
  return output;
}
function objectArray4(value) {
  return Array.isArray(value) && value.every(isRecord2) ? (
    /** @type {Record<string, unknown>[]} */
    value
  ) : null;
}
function normalizeSemanticString(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
function canonicalSetProjection(entries) {
  const byCanonicalValue = /* @__PURE__ */ new Map();
  for (const entry of entries) byCanonicalValue.set(canonicalStringify(entry), entry);
  return canonicalStringify([...byCanonicalValue].sort(([left], [right]) => compareCodePoints3(left, right)).map(([, entry]) => entry));
}
function derivePreconditionState(draft) {
  return canonicalSetProjection((objectArray4(draft.preconditions) ?? []).map((item) => ({
    condition: normalizeSemanticString(item.condition),
    reachable_from: normalizeSemanticString(item.reachable_from)
  })));
}
function deriveDataPartition(draft) {
  return canonicalSetProjection((objectArray4(draft.data) ?? []).map((item) => ({
    name: normalizeSemanticString(item.name),
    value: normalizeSemanticString(item.value)
  })));
}
function executionSignature(caseDraft) {
  try {
    const trusted = snapshotControlled2(caseDraft);
    const draft = trusted.diagnostics.length === 0 && isRecord2(trusted.snapshot) ? trusted.snapshot : {};
    const role = isRecord2(draft.role) ? normalizeSemanticString(draft.role.value) : "";
    const steps = objectArray4(draft.steps) ?? [];
    const actionPath = steps.map((step) => normalizeSemanticString(step.action));
    const oracleRefs = [...new Set(steps.flatMap(
      (step) => (objectArray4(step.expectations) ?? []).map((expectation) => normalizeSemanticString(expectation.expectation_id))
    ))].sort(compareCodePoints3);
    return canonicalStringify({
      role,
      precondition_state: derivePreconditionState(draft),
      data_partition: deriveDataPartition(draft),
      action_path: actionPath,
      oracle_refs: oracleRefs
    });
  } catch {
    return canonicalStringify({ role: "", precondition_state: "", data_partition: "", action_path: [], oracle_refs: [] });
  }
}
function scopesIntersect2(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}
function checkCanonical(value, path4, diagnostics) {
  if (!isCanonicalString(value)) diagnostics.push(diagnostic5(
    "schema",
    "CANONICAL_STRING_INVALID",
    path4,
    "identifier, reference, scope, or capability must be nonblank and unpadded"
  ));
}
function validateClosedShape(context, diagnostics) {
  checkKeys2(context, KEYS.context, "", diagnostics);
  const evidence = isRecord2(context.evidence) ? context.evidence : null;
  const obligations = isRecord2(context.obligations) ? context.obligations : null;
  const drafts = isRecord2(context.caseDrafts) ? context.caseDrafts : null;
  if (!Number.isInteger(context.sourceRevision) || !evidence || !obligations || !drafts) {
    diagnostics.push(diagnostic5("classification", "CONTEXT_INVALID", "/", "classification context requires sourceRevision, evidence, obligations, and caseDrafts"));
    return;
  }
  checkKeys2(evidence, KEYS.evidence, "/evidence", diagnostics);
  checkKeys2(obligations, KEYS.obligationsArtifact, "/obligations", diagnostics);
  checkKeys2(drafts, KEYS.caseDraftsArtifact, "/caseDrafts", diagnostics);
  if (!(evidence.claimsById instanceof Map) || !Array.isArray(evidence.factLedger) || !Array.isArray(evidence.conflicts) || !Array.isArray(obligations.obligations) || !Array.isArray(obligations.fact_routes) || !Array.isArray(obligations.interaction_routes) || !Array.isArray(drafts.cases) || !Array.isArray(drafts.obligation_dispositions) || !Array.isArray(drafts.exploratory_candidates)) {
    diagnostics.push(diagnostic5("classification", "CONTEXT_INVALID", "/", "classification context collections have invalid types"));
    return;
  }
  if (obligations.schema_version !== "1.0.0" || drafts.schema_version !== "1.0.0" || obligations.source_revision !== context.sourceRevision || drafts.source_revision !== context.sourceRevision) {
    diagnostics.push(diagnostic5("classification", "SOURCE_REVISION_MISMATCH", "/", "all classification inputs must share source_revision"));
  }
  for (const [claimId, claim] of NATIVE_MAP_ENTRIES.call(evidence.claimsById)) {
    checkCanonical(claimId, `/evidence/claimsById/${pointerPart2(String(claimId))}`, diagnostics);
    if (!isRecord2(claim)) continue;
    const form = claim.claim_form;
    const allowed = form === "derived" ? ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "derivation_kind", "derivation_target", "parent_claim_ids", "parameters", "rule_input"] : form === "decision-record" ? ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "decision_id", "authority"] : ["claim_id", "claim_form", "level", "kind", "scope", "value", "source_locator_ids", "source_id"];
    checkKeys2(claim, allowed, `/evidence/claimsById/${pointerPart2(String(claimId))}`, diagnostics);
    checkCanonical(claim.claim_id, `/evidence/claimsById/${pointerPart2(String(claimId))}/claim_id`, diagnostics);
    checkCanonical(claim.scope, `/evidence/claimsById/${pointerPart2(String(claimId))}/scope`, diagnostics);
  }
  evidence.factLedger.forEach((fact, index) => {
    checkKeys2(fact, KEYS.fact, `/evidence/factLedger/${index}`, diagnostics);
    if (isRecord2(fact)) {
      checkCanonical(fact.fact_id, `/evidence/factLedger/${index}/fact_id`, diagnostics);
      checkCanonical(fact.claim_id, `/evidence/factLedger/${index}/claim_id`, diagnostics);
    }
  });
  evidence.conflicts.forEach((conflict, index) => {
    checkKeys2(conflict, KEYS.conflict, `/evidence/conflicts/${index}`, diagnostics);
    if (isRecord2(conflict)) checkCanonical(conflict.scope, `/evidence/conflicts/${index}/scope`, diagnostics);
  });
  obligations.obligations.forEach((obligation, index) => {
    checkKeys2(obligation, KEYS.obligation, `/obligations/obligations/${index}`, diagnostics);
    if (!isRecord2(obligation)) return;
    for (const [field, value] of [["obligation_id", obligation.obligation_id], ["scope", obligation.scope]]) {
      checkCanonical(value, `/obligations/obligations/${index}/${field}`, diagnostics);
    }
    const capabilities = Array.isArray(obligation.required_capabilities) ? obligation.required_capabilities : [];
    capabilities.forEach((item, itemIndex) => checkCanonical(item, `/obligations/obligations/${index}/required_capabilities/${itemIndex}`, diagnostics));
  });
  obligations.fact_routes.forEach((route, index) => {
    if (!isRecord2(route)) return;
    const allowed = route.route_type === "obligations" ? ["fact_id", "route_type", "obligation_ids"] : route.route_type === "blocked" ? ["fact_id", "route_type", "blocker_root_issue_id"] : ["fact_id", "route_type", "not_applicable_claim_id"];
    checkKeys2(route, allowed, `/obligations/fact_routes/${index}`, diagnostics);
  });
  obligations.interaction_routes.forEach((route, index) => {
    if (!isRecord2(route)) return;
    const allowed = route.route_type === "formal-view" ? ["candidate_id", "route_type", "formal_view_id"] : route.route_type === "blocked" ? ["candidate_id", "route_type", "blocker_root_issue_id"] : ["candidate_id", "route_type", "exploratory_id"];
    checkKeys2(route, allowed, `/obligations/interaction_routes/${index}`, diagnostics);
  });
  drafts.cases.forEach((draft, caseIndex) => {
    const base = `/caseDrafts/cases/${caseIndex}`;
    checkKeys2(draft, KEYS.caseDraft, base, diagnostics);
    if (!isRecord2(draft)) return;
    for (const [field, value] of [["case_id", draft.case_id], ["scope", draft.scope]]) checkCanonical(value, `${base}/${field}`, diagnostics);
    if (isRecord2(draft.role)) checkKeys2(draft.role, KEYS.role, `${base}/role`, diagnostics);
    objectArray4(draft.preconditions)?.forEach((item, index) => checkKeys2(item, KEYS.precondition, `${base}/preconditions/${index}`, diagnostics));
    objectArray4(draft.data)?.forEach((item, index) => {
      checkKeys2(item, KEYS.data, `${base}/data/${index}`, diagnostics);
      if (isRecord2(item.provenance)) checkKeys2(item.provenance, KEYS.provenance, `${base}/data/${index}/provenance`, diagnostics);
    });
    objectArray4(draft.steps)?.forEach((step, stepIndex) => {
      checkKeys2(step, KEYS.step, `${base}/steps/${stepIndex}`, diagnostics);
      objectArray4(step.expectations)?.forEach((expectation, expectationIndex) => {
        checkKeys2(expectation, KEYS.expectation, `${base}/steps/${stepIndex}/expectations/${expectationIndex}`, diagnostics);
        if (isRecord2(expectation.oracle)) checkKeys2(expectation.oracle, KEYS.oracle, `${base}/steps/${stepIndex}/expectations/${expectationIndex}/oracle`, diagnostics);
      });
    });
    if (isRecord2(draft.testability_profile)) {
      checkKeys2(draft.testability_profile, KEYS.profile, `${base}/testability_profile`, diagnostics);
      objectArray4(draft.testability_profile.capabilities)?.forEach((item, index) => {
        checkKeys2(item, KEYS.capability, `${base}/testability_profile/capabilities/${index}`, diagnostics);
        checkCanonical(item.capability, `${base}/testability_profile/capabilities/${index}/capability`, diagnostics);
      });
      objectArray4(draft.testability_profile.observers)?.forEach((item, index) => checkKeys2(item, KEYS.observer, `${base}/testability_profile/observers/${index}`, diagnostics));
      objectArray4(draft.testability_profile.controls)?.forEach((item, index) => checkKeys2(item, KEYS.control, `${base}/testability_profile/controls/${index}`, diagnostics));
    }
    if (isRecord2(draft.post_state)) checkKeys2(draft.post_state, KEYS.postState, `${base}/post_state`, diagnostics);
    if (isRecord2(draft.cleanup)) checkKeys2(draft.cleanup, KEYS.cleanup, `${base}/cleanup`, diagnostics);
    if (isRecord2(draft.temporary_assumption)) checkKeys2(draft.temporary_assumption, KEYS.temporaryAssumption, `${base}/temporary_assumption`, diagnostics);
    if (isRecord2(draft.execution_signature)) checkKeys2(draft.execution_signature, KEYS.execution, `${base}/execution_signature`, diagnostics);
  });
  drafts.obligation_dispositions.forEach((disposition, index) => {
    if (!isRecord2(disposition)) return;
    const allowed = disposition.status === "case_candidate" ? ["obligation_id", "status", "case_ids"] : disposition.status === "blocker" ? ["obligation_id", "status", "blocker_root_issue_id", "evidence_refs"] : disposition.status === "not_applicable" ? ["obligation_id", "status", "exclusion_claim_id", "scope", "support_review"] : ["obligation_id", "status", "case_ids", "blocker_root_issue_id", "evidence_refs", "exclusion_claim_id", "scope", "support_review"];
    checkKeys2(disposition, allowed, `/caseDrafts/obligation_dispositions/${index}`, diagnostics);
  });
  drafts.exploratory_candidates.forEach((candidate, index) => checkKeys2(candidate, KEYS.exploratory, `/caseDrafts/exploratory_candidates/${index}`, diagnostics));
}
function buildEvidenceIndex(submitted, diagnostics) {
  const assessments = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  const indegree = /* @__PURE__ */ new Map();
  for (const [mapKey, value] of NATIVE_MAP_ENTRIES.call(submitted)) {
    if (typeof mapKey !== "string" || !isRecord2(value) || value.claim_id !== mapKey) {
      diagnostics.push(diagnostic5("reference", "EVIDENCE_MAP_IDENTITY_INVALID", `/evidence/claimsById/${pointerPart2(String(mapKey))}`, "accepted evidence Map key must equal an own claim_id"));
      continue;
    }
    const parents = value.level === "E2" ? stringArray3(value.parent_claim_ids, true) ?? [] : [];
    const reasons = [];
    let rank = value.level === "E1" ? 1 : value.level === "E2" || value.level === "E3" ? 2 : 0;
    if (rank === 0) reasons.push("EVIDENCE_LEVEL_INVALID");
    if (value.level === "E2") {
      const kind = typeof value.derivation_kind === "string" ? value.derivation_kind : "";
      const target = typeof value.derivation_target === "string" ? value.derivation_target : "";
      const allowed = E2_TARGETS[
        /** @type {keyof typeof E2_TARGETS} */
        kind
      ];
      if (!allowed || !allowed.includes(target) || value.kind !== target || parents.length === 0) {
        reasons.push("E2_KIND_TARGET_INVALID");
        rank = 0;
      }
    }
    assessments.set(mapKey, { claim: structuredClone(value), rank, reasons, parents, children: [] });
    indegree.set(mapKey, parents.length);
    for (const parent of parents) {
      const bucket = children.get(parent);
      if (bucket) bucket.push(mapKey);
      else children.set(parent, [mapKey]);
    }
  }
  for (const [parentId, childIds] of children) {
    const assessment = assessments.get(parentId);
    if (assessment) assessment.children = [...childIds].sort(compareCodePoints3);
  }
  for (const [claimId, assessment] of assessments) {
    if (assessment.claim.level !== "E2") continue;
    for (const parentId of assessment.parents) {
      const parent = assessments.get(parentId);
      if (!parent) {
        assessment.reasons.push("E2_PARENT_UNKNOWN");
        assessment.rank = 0;
      } else if (parent.claim.level !== "E3" && parent.claim.level !== "E2") {
        assessment.reasons.push("E2_PARENT_LEVEL_INVALID");
        assessment.rank = 0;
      }
    }
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort(compareCodePoints3);
  let cursor = 0;
  while (cursor < queue.length) {
    const parentId = queue[cursor++];
    for (const childId of children.get(parentId) ?? []) {
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }
  for (const [claimId, remaining] of indegree) {
    if (remaining > 0) {
      const assessment = assessments.get(claimId);
      if (assessment) {
        assessment.rank = 0;
        assessment.reasons.push("E2_CYCLE_OR_UNGROUNDED_CHAIN");
      }
    }
  }
  return assessments;
}
function assessEvidenceRoots(roots, evidence, cache) {
  const cacheKey = canonicalStringify([...new Set(roots)].sort(compareCodePoints3));
  const cached = cache?.get(cacheKey);
  if (cached) return cached;
  let rank = 2;
  const reasons = /* @__PURE__ */ new Set();
  const refs = /* @__PURE__ */ new Set();
  const sourceIds = /* @__PURE__ */ new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const claimId = (
      /** @type {string} */
      pending.pop()
    );
    if (refs.has(claimId)) continue;
    refs.add(claimId);
    const assessment = evidence.get(claimId);
    if (!assessment) {
      rank = 0;
      reasons.add("EVIDENCE_REFERENCE_UNKNOWN");
      continue;
    }
    rank = Math.min(rank, assessment.rank);
    for (const reason of assessment.reasons) reasons.add(reason);
    if (typeof assessment.claim.source_id === "string") sourceIds.add(assessment.claim.source_id);
    for (const parentId of assessment.parents) pending.push(parentId);
  }
  const result = { rank, reasons, refs, sourceIds };
  cache?.set(cacheKey, result);
  return result;
}
function buildOracleReachability(evidence, obligations) {
  const oracleRefs = [...new Set(obligations.flatMap((obligation) => stringArray3(obligation.required_oracle_refs) ?? []))].sort(compareCodePoints3);
  const oracleRefsByClaim = /* @__PURE__ */ new Map();
  for (const oracleRef of oracleRefs) {
    const assessment = evidence.get(oracleRef);
    if (assessment && assessment.rank > 0 && assessment.reasons.length === 0) {
      oracleRefsByClaim.set(oracleRef, /* @__PURE__ */ new Set([oracleRef]));
    }
  }
  const indegree = /* @__PURE__ */ new Map();
  for (const [claimId, assessment] of evidence) {
    indegree.set(claimId, assessment.parents.reduce((count, parentId) => count + (evidence.has(parentId) ? 1 : 0), 0));
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([claimId]) => claimId).sort(compareCodePoints3);
  let cursor = 0;
  while (cursor < queue.length) {
    const claimId = queue[cursor++];
    const reachableOracles = oracleRefsByClaim.get(claimId);
    for (const childId of evidence.get(claimId)?.children ?? []) {
      const child = evidence.get(childId);
      if (reachableOracles && child && child.rank > 0 && child.reasons.length === 0) {
        let childOracles = oracleRefsByClaim.get(childId);
        if (!childOracles) {
          childOracles = /* @__PURE__ */ new Set();
          oracleRefsByClaim.set(childId, childOracles);
        }
        for (const oracleRef of reachableOracles) childOracles.add(oracleRef);
      }
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }
  const oracleRefsByObligation = /* @__PURE__ */ new Map();
  for (const obligation of obligations) {
    if (isCanonicalString(obligation.obligation_id)) oracleRefsByObligation.set(
      String(obligation.obligation_id),
      new Set(stringArray3(obligation.required_oracle_refs) ?? [])
    );
  }
  return { oracleRefsByClaim, oracleRefsByObligation };
}
function requireOracleOwnership(draft, obligations, expectations, reachability, reasons, diagnostics) {
  if (expectations.length === 0) return;
  const orderedExpectations = [...expectations].sort((left, right) => compareCodePoints3(left.expectationId, right.expectationId));
  const orderedObligations = obligations.filter((obligation) => (stringArray3(obligation.required_oracle_refs) ?? []).length > 0).sort((left, right) => compareCodePoints3(String(left.obligation_id), String(right.obligation_id)));
  const edges = [];
  let missingEdge = false;
  for (const obligation of orderedObligations) {
    const obligationId = String(obligation.obligation_id);
    const requiredOracles = reachability.oracleRefsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
    const candidates = [];
    for (const [expectationIndex, expectation] of orderedExpectations.entries()) {
      const expectationOracles = reachability.oracleRefsByClaim.get(expectation.evidenceRef);
      let coversAll = requiredOracles.size > 0 && Boolean(expectationOracles);
      if (expectationOracles) {
        for (const oracleRef of requiredOracles) {
          if (!expectationOracles.has(oracleRef)) coversAll = false;
        }
      }
      if (coversAll) candidates.push(expectationIndex);
    }
    edges.push(candidates);
    if (candidates.length === 0) {
      missingEdge = true;
      diagnostics.push(diagnostic5(
        "traceability",
        "OBLIGATION_ORACLE_EXPECTATION_UNMAPPED",
        `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/obligations/${pointerPart2(obligationId)}/required_oracle_refs`,
        "one concrete expectation must cover every required Oracle for the formal obligation"
      ));
    }
  }
  if (missingEdge) {
    reasons.add("OBLIGATION_ORACLE_EXPECTATION_UNMAPPED");
    return;
  }
  const ownerByExpectation = new Array(orderedExpectations.length).fill(-1);
  const expectationByObligation = new Array(orderedObligations.length).fill(-1);
  for (let start = 0; start < orderedObligations.length; start += 1) {
    const obligationQueue = [start];
    const seenObligations = /* @__PURE__ */ new Set([start]);
    const seenExpectations = /* @__PURE__ */ new Set();
    const parentObligationByExpectation = /* @__PURE__ */ new Map();
    let cursor = 0;
    let freeExpectation = -1;
    while (cursor < obligationQueue.length && freeExpectation < 0) {
      const obligationIndex = obligationQueue[cursor++];
      for (const expectationIndex2 of edges[obligationIndex]) {
        if (seenExpectations.has(expectationIndex2)) continue;
        seenExpectations.add(expectationIndex2);
        parentObligationByExpectation.set(expectationIndex2, obligationIndex);
        const owner = ownerByExpectation[expectationIndex2];
        if (owner < 0) {
          freeExpectation = expectationIndex2;
          break;
        }
        if (!seenObligations.has(owner)) {
          seenObligations.add(owner);
          obligationQueue.push(owner);
        }
      }
    }
    if (freeExpectation < 0) {
      diagnostics.push(diagnostic5(
        "traceability",
        "OBLIGATION_ORACLE_EXPECTATION_OWNERSHIP_CONFLICT",
        `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/obligation_ids`,
        "linked formal obligations require distinct concrete expectations with complete Oracle coverage"
      ));
      reasons.add("OBLIGATION_ORACLE_EXPECTATION_OWNERSHIP_CONFLICT");
      return;
    }
    let expectationIndex = freeExpectation;
    while (expectationIndex >= 0) {
      const obligationIndex = (
        /** @type {number} */
        parentObligationByExpectation.get(expectationIndex)
      );
      const previousExpectation = expectationByObligation[obligationIndex];
      expectationByObligation[obligationIndex] = expectationIndex;
      ownerByExpectation[expectationIndex] = obligationIndex;
      expectationIndex = previousExpectation;
    }
  }
}
function applyReview(review, reasons) {
  if (review === "contradicted") reasons.add("SUPPORT_REVIEW_CONTRADICTED");
  else if (review === "uncertain") reasons.add("SUPPORT_REVIEW_UNCERTAIN");
  else if (review !== "supported") reasons.add("SUPPORT_REVIEW_MISSING");
}
function applyCapabilityStatus(status, gate, reasons) {
  if (status === "approved-assumption") gate.rank = Math.min(gate.rank, 1);
  else if (status === "unknown") {
    gate.rank = 0;
    reasons.add("CAPABILITY_UNKNOWN");
  } else if (status === "unavailable") {
    gate.rank = 0;
    reasons.add("CAPABILITY_UNAVAILABLE");
  } else if (!GROUNDED_CAPABILITIES.has(
    /** @type {string} */
    status
  )) {
    gate.rank = 0;
    reasons.add("CAPABILITY_STATUS_INVALID");
  }
}
function evaluateCase(draft, obligations, routedFactIds, routesByFact, factsById, evidence, evidenceCache, oracleReachability, conflicts, diagnostics) {
  const reasons = /* @__PURE__ */ new Set();
  const submittedEvidenceRefs = stringArray3(draft.evidence_refs, true);
  const evidenceRoots = /* @__PURE__ */ new Set();
  const formalEvidenceRoots = /* @__PURE__ */ new Set();
  const downgradeRoots = /* @__PURE__ */ new Set();
  const gate = { rank: 2 };
  const requiredFieldsValid = isCanonicalString(draft.case_id) && isNonblank(draft.title) && isCanonicalString(draft.scope) && RISKS2.has(
    /** @type {string} */
    draft.risk
  ) && isRecord2(draft.role) && stringArray3(draft.fact_ids, true) !== null && stringArray3(draft.obligation_ids, true) !== null && (objectArray4(draft.preconditions)?.length ?? 0) > 0 && (objectArray4(draft.data)?.length ?? 0) > 0 && (objectArray4(draft.steps)?.length ?? 0) > 0 && isRecord2(draft.testability_profile) && isRecord2(draft.post_state) && isRecord2(draft.cleanup) && submittedEvidenceRefs !== null && isRecord2(draft.execution_signature);
  if (!requiredFieldsValid) reasons.add("CASE_GATE_INVALID");
  if (isRecord2(draft.role)) {
    if (!isNonblank(draft.role.value) || !isCanonicalString(draft.role.evidence_ref)) reasons.add("CASE_GATE_INVALID");
    if (isCanonicalString(draft.role.evidence_ref)) evidenceRoots.add(draft.role.evidence_ref);
    applyReview(draft.role.support_review, reasons);
  }
  const sourceClaimIds = draft.source_claim_ids === void 0 ? [] : stringArray3(draft.source_claim_ids);
  if (!sourceClaimIds) reasons.add("CASE_GATE_INVALID");
  for (const ref of sourceClaimIds ?? []) evidenceRoots.add(ref);
  const factIds = stringArray3(draft.fact_ids, true) ?? [];
  const obligationIds = new Set(stringArray3(draft.obligation_ids, true) ?? []);
  for (const factId of factIds) {
    const routes = routesByFact.get(factId) ?? [];
    const validRoute = routes.length === 1 && routes[0].route_type === "obligations" && (stringArray3(routes[0].obligation_ids, true) ?? []).some((id) => obligationIds.has(id));
    if (!validRoute) reasons.add("CASE_FACT_ROUTE_INVALID");
  }
  for (const routedFactId of routedFactIds) if (!factIds.includes(routedFactId)) reasons.add("FACT_ROUTE_LINK_MISSING");
  for (const factId of /* @__PURE__ */ new Set([...factIds, ...routedFactIds])) {
    const fact = factsById.get(factId);
    if (!fact) {
      reasons.add("FACT_REFERENCE_UNKNOWN");
      continue;
    }
    if (fact.status === "conflicted" || fact.status === "ambiguous") reasons.add("FACT_UNRESOLVED");
    if (isCanonicalString(fact.claim_id)) {
      evidenceRoots.add(fact.claim_id);
      formalEvidenceRoots.add(fact.claim_id);
    }
    for (const ref of stringArray3(fact.source_claim_ids) ?? []) {
      evidenceRoots.add(ref);
      formalEvidenceRoots.add(ref);
    }
  }
  const requiredCapabilities = /* @__PURE__ */ new Set();
  for (const obligation of obligations) {
    const sources = stringArray3(obligation.source_claim_ids, true) ?? [];
    const oracles = stringArray3(obligation.required_oracle_refs) ?? [];
    if (oracles.length === 0) reasons.add("FORMAL_ORACLE_MISSING");
    for (const ref of [...sources, ...oracles]) {
      evidenceRoots.add(ref);
      formalEvidenceRoots.add(ref);
    }
    for (const capability of stringArray3(obligation.required_capabilities) ?? []) requiredCapabilities.add(capability);
  }
  const preconditions = objectArray4(draft.preconditions) ?? [];
  for (const precondition of preconditions) {
    if (!isNonblank(precondition.condition) || !isNonblank(precondition.reachable_from) || stringArray3(precondition.source_claim_ids, true) === null || !isCanonicalString(precondition.evidence_ref)) reasons.add("CASE_GATE_INVALID");
    for (const ref of stringArray3(precondition.source_claim_ids) ?? []) evidenceRoots.add(ref);
    if (isCanonicalString(precondition.evidence_ref)) evidenceRoots.add(precondition.evidence_ref);
    applyReview(precondition.support_review, reasons);
  }
  const data = objectArray4(draft.data) ?? [];
  for (const datum of data) {
    if (!isNonblank(datum.name) || !isNonblank(datum.value) || !isRecord2(datum.provenance) || !isCanonicalString(isRecord2(datum.provenance) ? datum.provenance.ref : null) || !["evidence", "derivation"].includes(String(isRecord2(datum.provenance) ? datum.provenance.type : ""))) reasons.add("CASE_GATE_INVALID");
    if (isRecord2(datum.provenance) && isCanonicalString(datum.provenance.ref)) evidenceRoots.add(datum.provenance.ref);
    applyReview(datum.support_review, reasons);
  }
  const steps = objectArray4(draft.steps) ?? [];
  const stepIds = /* @__PURE__ */ new Set();
  const expectationIds = /* @__PURE__ */ new Set();
  const expectationsForOwnership = [];
  const requiredObservers = [];
  for (const [stepIndex, step] of steps.entries()) {
    if (!isCanonicalString(step.step_id) || stepIds.has(step.step_id)) {
      if (stepIds.has(
        /** @type {string} */
        step.step_id
      )) diagnostics.push(diagnostic5(
        "traceability",
        "STEP_ID_DUPLICATE",
        `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/steps/${stepIndex}/step_id`,
        "step IDs must be unique inside a Case"
      ));
      reasons.add("CASE_GATE_INVALID");
    } else stepIds.add(step.step_id);
    if (!isNonblank(step.action) || !isCanonicalString(step.action_evidence_ref)) reasons.add("CASE_GATE_INVALID");
    if (isCanonicalString(step.action_evidence_ref)) evidenceRoots.add(step.action_evidence_ref);
    applyReview(step.support_review, reasons);
    const expectations = objectArray4(step.expectations) ?? [];
    if (expectations.length === 0) reasons.add("FORMAL_ORACLE_MISSING");
    for (const [expectationIndex, expectation] of expectations.entries()) {
      const expectationLocatable = isCanonicalString(expectation.expectation_id) && !expectationIds.has(expectation.expectation_id);
      if (!expectationLocatable) {
        if (expectationIds.has(
          /** @type {string} */
          expectation.expectation_id
        )) diagnostics.push(diagnostic5(
          "traceability",
          "EXPECTATION_ID_DUPLICATE",
          `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/steps/${stepIndex}/expectations/${expectationIndex}/expectation_id`,
          "expectation IDs must be independently locatable"
        ));
        reasons.add("EXPECTATION_GATE_INVALID");
      } else expectationIds.add(
        /** @type {string} */
        expectation.expectation_id
      );
      if (expectation.preceding_action_id !== step.step_id) reasons.add("PRECEDING_ACTION_NOT_CONTAINING");
      const expectationFieldsValid = isNonblank(expectation.business_assertion) && isCanonicalString(expectation.preceding_action_id) && isNonblank(expectation.observer) && isNonblank(expectation.observation_surface) && isNonblank(expectation.observation_target) && isCanonicalString(expectation.evidence_ref);
      if (!expectationFieldsValid) reasons.add("EXPECTATION_GATE_INVALID");
      if (isCanonicalString(expectation.evidence_ref)) evidenceRoots.add(expectation.evidence_ref);
      if (expectationFieldsValid && expectationLocatable) {
        expectationsForOwnership.push({
          expectationId: (
            /** @type {string} */
            expectation.expectation_id
          ),
          evidenceRef: (
            /** @type {string} */
            expectation.evidence_ref
          )
        });
        requiredObservers.push({ observer: String(expectation.observer), target: String(expectation.observation_target) });
      }
      const oracle = isRecord2(expectation.oracle) ? expectation.oracle : null;
      const expectedField = oracle ? ORACLE_FIELDS[
        /** @type {keyof typeof ORACLE_FIELDS} */
        oracle.type
      ] : null;
      const comparisonValid = oracle && COMPARISONS.has(
        /** @type {string} */
        oracle.comparison
      );
      const toleranceValid = !oracle || oracle.tolerance === void 0 || typeof oracle.tolerance === "number" && Number.isFinite(oracle.tolerance) && oracle.tolerance >= 0;
      const windowValid = !oracle || oracle.window === void 0 || isNonblank(oracle.window);
      const withinBounded = !oracle || oracle.comparison !== "within" || oracle.tolerance !== void 0 && toleranceValid || oracle.window !== void 0 && windowValid;
      if (!oracle || !expectedField || !isNonblank(oracle[expectedField]) || !comparisonValid || !toleranceValid || !windowValid || !withinBounded) reasons.add("ORACLE_INVALID");
      applyReview(expectation.support_review, reasons);
    }
  }
  for (const step of steps) {
    for (const expectation of objectArray4(step.expectations) ?? []) {
      if (!stepIds.has(
        /** @type {string} */
        expectation.preceding_action_id
      )) reasons.add("PRECEDING_ACTION_UNKNOWN");
    }
  }
  requireOracleOwnership(draft, obligations, expectationsForOwnership, oracleReachability, reasons, diagnostics);
  const profile = isRecord2(draft.testability_profile) ? draft.testability_profile : {};
  const capabilities = objectArray4(profile.capabilities) ?? [];
  const observers = objectArray4(profile.observers) ?? [];
  const controls = objectArray4(profile.controls) ?? [];
  if (capabilities.length === 0) reasons.add("CAPABILITY_MISSING");
  if (observers.length === 0) reasons.add("OBSERVER_MISSING");
  if (controls.length === 0) reasons.add("CONTROL_MISSING");
  const providedCapabilities = /* @__PURE__ */ new Set();
  for (const capability of capabilities) {
    if (!isCanonicalString(capability.capability) || !CAPABILITY_STATUSES.has(
      /** @type {string} */
      capability.status
    )) reasons.add("CAPABILITY_MISSING");
    else providedCapabilities.add(capability.capability);
    applyCapabilityStatus(capability.status, gate, reasons);
    if (isCanonicalString(capability.provenance_ref)) {
      evidenceRoots.add(capability.provenance_ref);
      if (capability.status === "approved-assumption") downgradeRoots.add(capability.provenance_ref);
    } else reasons.add("CAPABILITY_PROVENANCE_MISSING");
  }
  for (const observer of observers) {
    if (!isNonblank(observer.observer) || !isNonblank(observer.observation_target)) reasons.add("OBSERVER_MISSING");
    applyCapabilityStatus(observer.status, gate, reasons);
    if (isCanonicalString(observer.provenance_ref)) {
      evidenceRoots.add(observer.provenance_ref);
      if (observer.status === "approved-assumption") downgradeRoots.add(observer.provenance_ref);
    } else reasons.add("CAPABILITY_PROVENANCE_MISSING");
  }
  for (const control of controls) {
    if (!isNonblank(control.control)) reasons.add("CONTROL_MISSING");
    applyCapabilityStatus(control.status, gate, reasons);
    if (isCanonicalString(control.provenance_ref)) {
      evidenceRoots.add(control.provenance_ref);
      if (control.status === "approved-assumption") downgradeRoots.add(control.provenance_ref);
    } else reasons.add("CAPABILITY_PROVENANCE_MISSING");
  }
  for (const required of requiredCapabilities) if (!providedCapabilities.has(required)) reasons.add("REQUIRED_CAPABILITY_MISSING");
  for (const required of requiredObservers) {
    if (!observers.some((observer) => observer.observer === required.observer && observer.observation_target === required.target)) reasons.add("OBSERVER_MISSING");
  }
  if (isRecord2(draft.post_state)) {
    if (!isNonblank(draft.post_state.state) || !isCanonicalString(draft.post_state.evidence_ref)) reasons.add("CASE_GATE_INVALID");
    if (isCanonicalString(draft.post_state.evidence_ref)) evidenceRoots.add(draft.post_state.evidence_ref);
    applyReview(draft.post_state.support_review, reasons);
  }
  if (isRecord2(draft.cleanup)) {
    if (draft.cleanup.required === true) {
      if (stringArray3(draft.cleanup.steps, true) === null || !isCanonicalString(draft.cleanup.evidence_ref)) reasons.add("CASE_GATE_INVALID");
      if (isCanonicalString(draft.cleanup.evidence_ref)) evidenceRoots.add(draft.cleanup.evidence_ref);
    } else if (draft.cleanup.required === false) {
      if (!isNonblank(draft.cleanup.no_cleanup_reason) || !isCanonicalString(draft.cleanup.no_cleanup_evidence_ref)) reasons.add("CASE_GATE_INVALID");
      if (isCanonicalString(draft.cleanup.no_cleanup_evidence_ref)) evidenceRoots.add(draft.cleanup.no_cleanup_evidence_ref);
    } else reasons.add("CASE_GATE_INVALID");
    applyReview(draft.cleanup.support_review, reasons);
  }
  const evidenceSummaryPath = `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/evidence_refs`;
  if (!submittedEvidenceRefs) {
    diagnostics.push(diagnostic5(
      "classification",
      "CASE_EVIDENCE_SUMMARY_INVALID",
      evidenceSummaryPath,
      "Case evidence_refs must be a dense, unique array of canonical direct evidence roots"
    ));
    reasons.add("CASE_EVIDENCE_SUMMARY_INVALID");
  } else {
    const actualDirectRefs = [...evidenceRoots].sort(compareCodePoints3);
    const submittedDirectRefs = [...submittedEvidenceRefs].sort(compareCodePoints3);
    if (canonicalStringify(actualDirectRefs) !== canonicalStringify(submittedDirectRefs)) {
      const actualSet = new Set(actualDirectRefs);
      const submittedSet = new Set(submittedDirectRefs);
      const missing = actualDirectRefs.filter((ref) => !submittedSet.has(ref));
      const extra = submittedDirectRefs.filter((ref) => !actualSet.has(ref));
      diagnostics.push(diagnostic5(
        "traceability",
        "CASE_EVIDENCE_SUMMARY_MISMATCH",
        evidenceSummaryPath,
        `Case evidence_refs direct-root summary differs; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`
      ));
      reasons.add("CASE_EVIDENCE_SUMMARY_MISMATCH");
    }
  }
  const signature = isRecord2(draft.execution_signature) ? draft.execution_signature : {};
  const submittedRole = normalizeSemanticString(signature.role);
  const submittedActions = Array.isArray(signature.action_path) ? signature.action_path.map(normalizeSemanticString) : [];
  const submittedOracles = Array.isArray(signature.oracle_refs) ? [...new Set(signature.oracle_refs.map(normalizeSemanticString))].sort(compareCodePoints3) : [];
  const submittedTestPoints = stringArray3(signature.test_point_ids, true);
  const actualTestPoints = [...stringArray3(draft.obligation_ids, true) ?? []].sort(compareCodePoints3);
  const actualSignature = JSON.parse(executionSignature(draft));
  if (signature.precondition_state !== actualSignature.precondition_state || signature.data_partition !== actualSignature.data_partition) {
    reasons.add("EXECUTION_SIGNATURE_MISMATCH");
  }
  if (submittedRole !== actualSignature.role || canonicalStringify(submittedActions) !== canonicalStringify(actualSignature.action_path) || canonicalStringify(submittedOracles) !== canonicalStringify(actualSignature.oracle_refs) || signature.test_point_ids !== void 0 && (!submittedTestPoints || canonicalStringify([...submittedTestPoints].sort(compareCodePoints3)) !== canonicalStringify(actualTestPoints))) {
    reasons.add("EXECUTION_SIGNATURE_MISMATCH");
  }
  const evidenceResult = assessEvidenceRoots([...evidenceRoots], evidence, evidenceCache);
  const formalEvidenceResult = assessEvidenceRoots([...formalEvidenceRoots], evidence, evidenceCache);
  for (const ref of sourceClaimIds ?? []) {
    if (!formalEvidenceResult.refs.has(ref)) reasons.add("CASE_SOURCE_CLAIM_OUTSIDE_CLOSURE");
  }
  gate.rank = Math.min(gate.rank, evidenceResult.rank);
  for (const reason of evidenceResult.reasons) reasons.add(reason);
  for (const ref of evidenceResult.refs) if (evidence.get(ref)?.claim.level === "E1") downgradeRoots.add(ref);
  for (const conflict of conflicts) {
    const scope = typeof conflict.scope === "string" ? conflict.scope : "";
    const sourceIds = new Set(stringArray3(conflict.source_ids) ?? []);
    if (isCanonicalString(draft.scope) && isCanonicalString(scope) && scopesIntersect2(draft.scope, scope) && [...evidenceResult.sourceIds].some((sourceId) => sourceIds.has(sourceId))) reasons.add("UNRESOLVED_CONFLICT");
  }
  if (reasons.size === 0 && gate.rank === 1) {
    const orderedDowngradeRoots = [...downgradeRoots].sort(compareCodePoints3);
    if (orderedDowngradeRoots.length > 1) {
      diagnostics.push(diagnostic5(
        "classification",
        "CONDITIONAL_ASSUMPTIONS_AMBIGUOUS",
        `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/temporary_assumption`,
        `singleton temporary_assumption cannot represent downgrade roots ${orderedDowngradeRoots.join(", ")}`
      ));
      reasons.add("CONDITIONAL_ASSUMPTIONS_AMBIGUOUS");
    }
    const assumption = isRecord2(draft.temporary_assumption) ? draft.temporary_assumption : null;
    if (!assumption) reasons.add("TEMPORARY_ASSUMPTION_MISSING");
    else {
      if (!isCanonicalString(assumption.claim_id) || !isNonblank(assumption.invalidation_condition) || orderedDowngradeRoots.length !== 1 || assumption.claim_id !== orderedDowngradeRoots[0]) {
        reasons.add("TEMPORARY_ASSUMPTION_INVALID");
      }
    }
  }
  if (reasons.size === 0 && gate.rank === 2 && Object.hasOwn(draft, "temporary_assumption")) {
    diagnostics.push(diagnostic5(
      "classification",
      "TEMPORARY_ASSUMPTION_UNEXPECTED",
      `/caseDrafts/cases/${pointerPart2(String(draft.case_id))}/temporary_assumption`,
      "Grounded Case cannot retain a temporary assumption without a consumed downgrade root"
    ));
    reasons.add("TEMPORARY_ASSUMPTION_UNEXPECTED");
  }
  if (reasons.size > 0) gate.rank = 0;
  return {
    rank: gate.rank,
    reasons: [...reasons].sort(compareCodePoints3),
    evidenceRefs: [...evidenceResult.refs].sort(compareCodePoints3)
  };
}
function addBlocked(blocked, obligation, reasonCodes, evidenceRefs, rootIssueId) {
  const obligationId = String(obligation.obligation_id);
  const existing = blocked.get(obligationId);
  const reasons = /* @__PURE__ */ new Set([...existing?.reason.split(",") ?? [], ...reasonCodes]);
  reasons.delete("");
  const refs = /* @__PURE__ */ new Set([...existing?.evidence_refs ?? [], ...evidenceRefs]);
  const reason = [...reasons].sort(compareCodePoints3).join(",");
  blocked.set(obligationId, {
    obligation_id: obligationId,
    root_issue_id: rootIssueId ?? stableId("root", {
      missing_type: "case-classification",
      obligation_id: obligationId,
      reason_codes: [...reasons].sort(compareCodePoints3),
      scope: obligation.scope
    }),
    reason,
    risk: String(obligation.risk),
    evidence_refs: [...refs].sort(compareCodePoints3)
  });
}
function reachesEvidence(root, target, evidence) {
  const pending = [root];
  const seen = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const current = (
      /** @type {string} */
      pending.pop()
    );
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const parent of evidence.get(current)?.parents ?? []) pending.push(parent);
  }
  return false;
}
function relatedEvidenceClosure(roots, evidence, ancestryCache, relationCache) {
  const cacheKey = canonicalStringify([...new Set(roots)].sort(compareCodePoints3));
  const cached = relationCache.get(cacheKey);
  if (cached) return cached;
  const related = new Set(assessEvidenceRoots(roots, evidence, ancestryCache).refs);
  const pending = [...new Set(roots)].sort(compareCodePoints3);
  const seenDescendants = /* @__PURE__ */ new Set();
  let cursor = 0;
  while (cursor < pending.length) {
    const claimId = pending[cursor++];
    if (seenDescendants.has(claimId)) continue;
    seenDescendants.add(claimId);
    related.add(claimId);
    for (const childId of evidence.get(claimId)?.children ?? []) pending.push(childId);
  }
  relationCache.set(cacheKey, related);
  return related;
}
function comparableCase(draft) {
  const copy = structuredClone(draft);
  delete copy.case_id;
  delete copy.fact_ids;
  delete copy.obligation_ids;
  delete copy.source_claim_ids;
  delete copy.evidence_refs;
  if (isRecord2(copy.execution_signature)) delete copy.execution_signature.test_point_ids;
  return canonicalStringify(copy);
}
function mergeExactCases(drafts) {
  const sorted = [...drafts].sort((left, right) => compareCodePoints3(String(left.case_id), String(right.case_id)));
  const merged = structuredClone(sorted[0]);
  for (const field of ["fact_ids", "obligation_ids", "source_claim_ids", "evidence_refs"]) {
    const values = new Set(sorted.flatMap((draft) => stringArray3(draft[field]) ?? []));
    merged[field] = [...values].sort(compareCodePoints3);
  }
  const signature = JSON.parse(executionSignature(merged));
  merged.case_id = stableId("case", signature);
  if (isRecord2(merged.execution_signature)) {
    merged.execution_signature.test_point_ids = [...stringArray3(merged.obligation_ids, true) ?? []].sort(compareCodePoints3);
  }
  return merged;
}
function ownershipExpectations(draft) {
  const expectations = [];
  for (const step of objectArray4(draft.steps) ?? []) {
    for (const expectation of objectArray4(step.expectations) ?? []) {
      if (isCanonicalString(expectation.expectation_id) && isCanonicalString(expectation.evidence_ref)) {
        expectations.push({
          expectationId: String(expectation.expectation_id),
          evidenceRef: String(expectation.evidence_ref)
        });
      }
    }
  }
  return expectations;
}
function deduplicateCases(executable, obligationsById, oracleReachability, diagnostics) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of executable) {
    const signature = executionSignature(item.draft);
    const bucket = groups.get(signature);
    if (bucket) bucket.push(item);
    else groups.set(signature, [item]);
  }
  const grounded = [];
  const conditional = [];
  for (const [signature, items] of [...groups].sort(([left], [right]) => compareCodePoints3(left, right))) {
    const semanticKeys = new Set(items.map((item) => `${item.rank}\0${comparableCase(item.draft)}`));
    if (semanticKeys.size > 1) {
      const caseIds = items.map((item) => String(item.draft.case_id)).sort(compareCodePoints3);
      diagnostics.push(diagnostic5(
        "classification",
        "DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT",
        `/execution_signatures/${pointerPart2(stableId("execution", JSON.parse(signature)))}`,
        `same execution signature has conflicting non-signature semantics in Cases ${caseIds.join(", ")}`
      ));
      for (const item of items.sort((left, right) => compareCodePoints3(String(left.draft.case_id), String(right.draft.case_id)))) {
        (item.rank === 2 ? grounded : conditional).push(structuredClone(item.draft));
      }
      continue;
    }
    const merged = mergeExactCases(items.map((item) => item.draft));
    const mergedObligations = (stringArray3(merged.obligation_ids, true) ?? []).flatMap((obligationId) => {
      const obligation = obligationsById.get(obligationId);
      return obligation ? [obligation] : [];
    });
    const ownershipReasons = /* @__PURE__ */ new Set();
    requireOracleOwnership(
      merged,
      mergedObligations,
      ownershipExpectations(merged),
      oracleReachability,
      ownershipReasons,
      diagnostics
    );
    if (ownershipReasons.size > 0) continue;
    (items[0].rank === 2 ? grounded : conditional).push(merged);
  }
  grounded.sort((left, right) => compareCodePoints3(String(left.case_id), String(right.case_id)));
  conditional.sort((left, right) => compareCodePoints3(String(left.case_id), String(right.case_id)));
  return { grounded, conditional };
}
function classifyCaseDrafts(submittedContext) {
  try {
    const trusted = snapshotControlled2(submittedContext);
    if (trusted.diagnostics.length > 0) return resultWithDiagnostics(trusted.diagnostics);
    if (!isRecord2(trusted.snapshot)) return resultWithDiagnostics([
      diagnostic5("classification", "CONTEXT_INVALID", "/", "classification context must be a closed own-data record")
    ]);
    const diagnostics = [];
    validateClosedShape(trusted.snapshot, diagnostics);
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);
    const context = trusted.snapshot;
    const evidenceContext2 = (
      /** @type {Record<string, unknown>} */
      context.evidence
    );
    const obligationArtifact = (
      /** @type {Record<string, unknown>} */
      context.obligations
    );
    const draftArtifact = (
      /** @type {Record<string, unknown>} */
      context.caseDrafts
    );
    const evidence = buildEvidenceIndex(
      /** @type {Map<unknown, unknown>} */
      evidenceContext2.claimsById,
      diagnostics
    );
    const evidenceCache = /* @__PURE__ */ new Map();
    const relatedEvidenceCache = /* @__PURE__ */ new Map();
    const facts = (
      /** @type {Record<string, unknown>[]} */
      evidenceContext2.factLedger
    );
    const conflicts = (
      /** @type {Record<string, unknown>[]} */
      evidenceContext2.conflicts
    );
    const obligations = (
      /** @type {Record<string, unknown>[]} */
      obligationArtifact.obligations
    );
    const drafts = (
      /** @type {Record<string, unknown>[]} */
      draftArtifact.cases
    );
    const dispositions = (
      /** @type {Record<string, unknown>[]} */
      draftArtifact.obligation_dispositions
    );
    const exploratory = (
      /** @type {Record<string, unknown>[]} */
      draftArtifact.exploratory_candidates
    );
    const factRoutes = (
      /** @type {Record<string, unknown>[]} */
      obligationArtifact.fact_routes
    );
    const interactionRoutes = (
      /** @type {Record<string, unknown>[]} */
      obligationArtifact.interaction_routes
    );
    const oracleReachability = buildOracleReachability(evidence, obligations);
    const factsById = /* @__PURE__ */ new Map();
    for (const fact of facts) {
      const factId = typeof fact.fact_id === "string" ? fact.fact_id : "";
      if (factsById.has(factId)) diagnostics.push(diagnostic5("traceability", "FACT_ID_DUPLICATE", `/facts/${pointerPart2(factId)}`, "fact IDs must be unique"));
      else factsById.set(factId, fact);
    }
    const obligationsById = /* @__PURE__ */ new Map();
    for (const obligation of obligations) {
      const id = typeof obligation.obligation_id === "string" ? obligation.obligation_id : "";
      if (obligationsById.has(id)) diagnostics.push(diagnostic5("traceability", "OBLIGATION_ID_DUPLICATE", `/obligations/${pointerPart2(id)}`, "formal obligation IDs must be unique"));
      else obligationsById.set(id, obligation);
    }
    const routedFactsByObligation = /* @__PURE__ */ new Map();
    const routesByFact = /* @__PURE__ */ new Map();
    for (const [routeIndex, route] of factRoutes.entries()) {
      const factId = typeof route.fact_id === "string" ? route.fact_id : "";
      const routeBucket = routesByFact.get(factId);
      if (routeBucket) routeBucket.push(route);
      else routesByFact.set(factId, [route]);
      if (!factsById.has(factId)) diagnostics.push(diagnostic5(
        "reference",
        "FACT_ROUTE_FACT_UNKNOWN",
        `/obligations/fact_routes/${routeIndex}/fact_id`,
        "fact route references an unknown fact"
      ));
      if (route.route_type !== "obligations") continue;
      const routedObligations = stringArray3(route.obligation_ids, true);
      if (!routedObligations) diagnostics.push(diagnostic5(
        "traceability",
        "FACT_ROUTE_OBLIGATIONS_INVALID",
        `/obligations/fact_routes/${routeIndex}/obligation_ids`,
        "formal fact route requires a nonempty dense obligation list"
      ));
      for (const obligationId of routedObligations ?? []) {
        if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic5(
          "reference",
          "FACT_ROUTE_OBLIGATION_UNKNOWN",
          `/obligations/fact_routes/${routeIndex}/obligation_ids/${pointerPart2(obligationId)}`,
          "fact route references an unknown formal obligation"
        ));
        const routed = routedFactsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
        routed.add(factId);
        routedFactsByObligation.set(obligationId, routed);
      }
    }
    const casesById = /* @__PURE__ */ new Map();
    for (const draft of drafts) {
      const id = typeof draft.case_id === "string" ? draft.case_id : "";
      if (casesById.has(id)) diagnostics.push(diagnostic5("traceability", "CASE_ID_DUPLICATE", `/cases/${pointerPart2(id)}`, "Case IDs must be unique before exact-signature deduplication"));
      else casesById.set(id, draft);
    }
    const dispositionByObligation = /* @__PURE__ */ new Map();
    for (const disposition of dispositions) {
      const obligationId = typeof disposition.obligation_id === "string" ? disposition.obligation_id : "";
      if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic5(
        "reference",
        "OBLIGATION_DISPOSITION_UNKNOWN",
        `/obligation_dispositions/${pointerPart2(obligationId)}`,
        "disposition references an unknown formal obligation"
      ));
      if (dispositionByObligation.has(obligationId)) diagnostics.push(diagnostic5(
        "traceability",
        "OBLIGATION_DISPOSITION_DUPLICATE",
        `/obligation_dispositions/${pointerPart2(obligationId)}`,
        "every formal obligation must have exactly one disposition"
      ));
      else dispositionByObligation.set(obligationId, disposition);
      if (!["case_candidate", "blocker", "not_applicable"].includes(String(disposition.status))) diagnostics.push(diagnostic5(
        "classification",
        "OBLIGATION_DISPOSITION_STATUS_INVALID",
        `/obligation_dispositions/${pointerPart2(obligationId)}/status`,
        "formal obligation disposition status is outside the frozen lanes"
      ));
      if (disposition.status === "case_candidate") {
        const caseIds = stringArray3(disposition.case_ids) ?? [];
        if (caseIds.length === 0) {
          const obligation = obligationsById.get(obligationId);
          const routedRoots = [...routedFactsByObligation.get(obligationId) ?? []].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...stringArray3(fact.source_claim_ids) ?? []] : [];
          });
          const evidenceResult = obligation ? assessEvidenceRoots([
            ...stringArray3(obligation.source_claim_ids) ?? [],
            ...stringArray3(obligation.required_oracle_refs) ?? [],
            ...routedRoots
          ], evidence, evidenceCache) : null;
          const fullyGroundable = obligation && (stringArray3(obligation.required_oracle_refs) ?? []).length > 0 && (stringArray3(obligation.required_capabilities) ?? []).length === 0 && evidenceResult?.rank === 2 && evidenceResult.reasons.size === 0;
          diagnostics.push(diagnostic5(
            "classification",
            fullyGroundable ? "GROUNDABLE_OBLIGATION_CASE_MISSING" : "DISPOSITION_CASES_MISSING",
            `/obligation_dispositions/${pointerPart2(obligationId)}/case_ids`,
            fullyGroundable ? "fully groundable formal obligation requires at least one candidate Case" : "case_candidate disposition requires at least one Case"
          ));
        }
        for (const caseId of caseIds) {
          const candidate = casesById.get(caseId);
          if (!candidate) diagnostics.push(diagnostic5(
            "reference",
            "DISPOSITION_CASE_UNKNOWN",
            `/obligation_dispositions/${pointerPart2(obligationId)}/case_ids/${pointerPart2(caseId)}`,
            "candidate disposition references an unknown Case"
          ));
          else if (!(stringArray3(candidate.obligation_ids) ?? []).includes(obligationId)) diagnostics.push(diagnostic5(
            "traceability",
            "CASE_LANE_DISPOSITION_MISMATCH",
            `/obligation_dispositions/${pointerPart2(obligationId)}/case_ids/${pointerPart2(caseId)}`,
            "case_candidate disposition and Case must reference each other"
          ));
        }
      }
    }
    for (const obligationId of obligationsById.keys()) {
      if (!dispositionByObligation.has(obligationId)) diagnostics.push(diagnostic5(
        "traceability",
        "OBLIGATION_DISPOSITION_MISSING",
        `/obligation_dispositions/${pointerPart2(obligationId)}`,
        "every formal obligation must have exactly one disposition"
      ));
    }
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);
    const blocked = /* @__PURE__ */ new Map();
    const notApplicable = [];
    const executable = [];
    for (const disposition of dispositions) {
      const obligation = (
        /** @type {Record<string, unknown>} */
        obligationsById.get(
          /** @type {string} */
          disposition.obligation_id
        )
      );
      const obligationId = (
        /** @type {string} */
        obligation.obligation_id
      );
      if (disposition.status === "blocker") {
        const roots = [
          ...stringArray3(obligation.source_claim_ids) ?? [],
          ...stringArray3(obligation.required_oracle_refs) ?? [],
          ...[...routedFactsByObligation.get(obligationId) ?? []].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...stringArray3(fact.source_claim_ids) ?? []] : [];
          })
        ];
        const evidenceResult = assessEvidenceRoots(roots, evidence, evidenceCache);
        const relatedEvidence = relatedEvidenceClosure(roots, evidence, evidenceCache, relatedEvidenceCache);
        const blockerEvidenceRefs = stringArray3(disposition.evidence_refs, true);
        if (!blockerEvidenceRefs) {
          diagnostics.push(diagnostic5(
            "classification",
            "BLOCKER_EVIDENCE_REFS_INVALID",
            `/obligation_dispositions/${pointerPart2(obligationId)}/evidence_refs`,
            "explicit blocker evidence_refs must be a dense, unique array of canonical nonblank references"
          ));
          continue;
        }
        let blockerRefsValid = true;
        for (const ref of blockerEvidenceRefs) {
          const blockerAssessment = evidence.get(ref);
          if (!blockerAssessment) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic5(
              "reference",
              "BLOCKER_EVIDENCE_UNKNOWN",
              `/obligation_dispositions/${pointerPart2(obligationId)}/evidence_refs/${pointerPart2(ref)}`,
              "explicit blocker references unknown accepted evidence"
            ));
          } else if (blockerAssessment.rank === 0 || blockerAssessment.reasons.length > 0) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic5(
              "classification",
              "BLOCKER_EVIDENCE_INVALID",
              `/obligation_dispositions/${pointerPart2(obligationId)}/evidence_refs/${pointerPart2(ref)}`,
              "explicit blocker evidence must be accepted before it can justify a blocker"
            ));
          } else if (!relatedEvidence.has(ref)) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic5(
              "traceability",
              "BLOCKER_EVIDENCE_UNRELATED",
              `/obligation_dispositions/${pointerPart2(obligationId)}/evidence_refs/${pointerPart2(ref)}`,
              "explicit blocker evidence must be related to the formal obligation evidence closure"
            ));
          }
        }
        if (!blockerRefsValid) continue;
        const oracles = stringArray3(obligation.required_oracle_refs) ?? [];
        const capabilities = stringArray3(obligation.required_capabilities) ?? [];
        if (oracles.length > 0 && capabilities.length === 0 && evidenceResult.rank === 2 && evidenceResult.reasons.size === 0) {
          diagnostics.push(diagnostic5(
            "classification",
            "GROUNDABLE_OBLIGATION_CASE_MISSING",
            `/obligation_dispositions/${pointerPart2(obligationId)}`,
            "fully groundable formal obligation requires a candidate Case instead of an unjustified blocker"
          ));
          continue;
        }
        const reasons = oracles.length === 0 ? ["FORMAL_ORACLE_MISSING"] : evidenceResult.reasons.size > 0 ? [...evidenceResult.reasons].sort(compareCodePoints3) : ["EXPLICIT_BLOCKER"];
        addBlocked(
          blocked,
          obligation,
          reasons,
          blockerEvidenceRefs,
          isCanonicalString(disposition.blocker_root_issue_id) ? String(disposition.blocker_root_issue_id) : null
        );
      } else if (disposition.status === "not_applicable") {
        const exclusionId = typeof disposition.exclusion_claim_id === "string" ? disposition.exclusion_claim_id : "";
        const exclusion = evidence.get(exclusionId);
        const obligationRoots = [
          ...stringArray3(obligation.source_claim_ids) ?? [],
          ...stringArray3(obligation.required_oracle_refs) ?? [],
          ...[...routedFactsByObligation.get(obligationId) ?? []].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...stringArray3(fact.source_claim_ids) ?? []] : [];
          })
        ];
        const levelValid = exclusion?.rank === 2 && (exclusion.claim.level === "E3" || exclusion.claim.level === "E2");
        const scopeValid = exclusion && typeof exclusion.claim.scope === "string" && typeof disposition.scope === "string" && scopeContains(exclusion.claim.scope, disposition.scope) && scopeContains(
          disposition.scope,
          /** @type {string} */
          obligation.scope
        );
        const independent = exclusion && obligationRoots.every((root) => !reachesEvidence(exclusionId, root, evidence) && !reachesEvidence(root, exclusionId, evidence));
        const reviewValid = disposition.support_review === "supported";
        if (levelValid && scopeValid && independent && reviewValid) notApplicable.push(structuredClone(disposition));
        else {
          const reason = !levelValid ? "EXCLUSION_EVIDENCE_INVALID" : !scopeValid ? "EXCLUSION_SCOPE_INVALID" : !reviewValid ? "EXCLUSION_REVIEW_INVALID" : "EXCLUSION_NOT_INDEPENDENT";
          addBlocked(blocked, obligation, [reason], exclusionId ? [exclusionId] : [], stableId("root", {
            missing_type: "invalid-exclusion",
            obligation_id: obligationId,
            exclusion_claim_id: exclusionId,
            scope: disposition.scope
          }));
        }
      }
    }
    for (const draft of drafts) {
      const obligationIds = stringArray3(draft.obligation_ids, true) ?? [];
      const linked = obligationIds.flatMap((id) => obligationsById.has(id) ? [
        /** @type {Record<string, unknown>} */
        obligationsById.get(id)
      ] : []);
      for (const obligationId of obligationIds) {
        if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic5(
          "reference",
          "CASE_OBLIGATION_UNKNOWN",
          `/cases/${pointerPart2(String(draft.case_id))}/obligation_ids/${pointerPart2(obligationId)}`,
          "Case references an unknown formal obligation"
        ));
        const disposition = dispositionByObligation.get(obligationId);
        if (disposition?.status !== "case_candidate" || !(stringArray3(disposition.case_ids) ?? []).includes(
          /** @type {string} */
          draft.case_id
        )) {
          diagnostics.push(diagnostic5(
            "traceability",
            "CASE_LANE_DISPOSITION_MISMATCH",
            `/cases/${pointerPart2(String(draft.case_id))}/obligation_ids/${pointerPart2(obligationId)}`,
            "Case and formal disposition must reference each other in the case_candidate lane"
          ));
        }
      }
      const routedFactIds = [...new Set(linked.flatMap(
        (obligation) => [...routedFactsByObligation.get(String(obligation.obligation_id)) ?? []]
      ))].sort(compareCodePoints3);
      const evaluation = evaluateCase(
        draft,
        linked,
        routedFactIds,
        routesByFact,
        factsById,
        evidence,
        evidenceCache,
        oracleReachability,
        conflicts,
        diagnostics
      );
      if (evaluation.rank === 0) {
        for (const obligation of linked) addBlocked(blocked, obligation, evaluation.reasons, evaluation.evidenceRefs, null);
      } else executable.push({ draft: structuredClone(draft), rank: evaluation.rank });
    }
    const executableObligationIds = executable.map((item) => stringArray3(item.draft.obligation_ids, true) ?? []);
    const executableCasesByObligation = /* @__PURE__ */ new Map();
    for (const [caseIndex, obligationIds] of executableObligationIds.entries()) {
      for (const obligationId of obligationIds) {
        const bucket = executableCasesByObligation.get(obligationId);
        if (bucket) bucket.push(caseIndex);
        else executableCasesByObligation.set(obligationId, [caseIndex]);
      }
    }
    const blockedQueue = [...blocked.keys()].sort(compareCodePoints3);
    const invalidExecutableCases = /* @__PURE__ */ new Set();
    let blockedCursor = 0;
    while (blockedCursor < blockedQueue.length) {
      const blockedObligationId = blockedQueue[blockedCursor++];
      for (const caseIndex of executableCasesByObligation.get(blockedObligationId) ?? []) {
        if (invalidExecutableCases.has(caseIndex)) continue;
        invalidExecutableCases.add(caseIndex);
        for (const obligationId of executableObligationIds[caseIndex]) {
          const obligation = obligationsById.get(obligationId);
          if (!obligation) continue;
          const alreadyBlocked = blocked.has(obligationId);
          addBlocked(blocked, obligation, ["CASE_SHARES_BLOCKED_OBLIGATION"], [], null);
          if (!alreadyBlocked) blockedQueue.push(obligationId);
        }
      }
    }
    const uniquelyExecutable = executable.filter((_, index) => !invalidExecutableCases.has(index));
    const executableRanksByObligation = /* @__PURE__ */ new Map();
    for (const item of uniquelyExecutable) {
      for (const obligationId of stringArray3(item.draft.obligation_ids, true) ?? []) {
        const ranks = executableRanksByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
        ranks.add(item.rank);
        executableRanksByObligation.set(obligationId, ranks);
      }
    }
    for (const [obligationId, ranks] of executableRanksByObligation) {
      if (ranks.size > 1) diagnostics.push(diagnostic5(
        "classification",
        "OBLIGATION_EXECUTABLE_LANE_CONFLICT",
        `/obligations/${pointerPart2(obligationId)}`,
        "formal obligation has candidates in both Grounded and Conditional lanes"
      ));
    }
    const exploratoryRouteIds = new Set(interactionRoutes.flatMap((route) => route.route_type === "exploratory" && isCanonicalString(route.exploratory_id) ? [String(route.exploratory_id)] : []));
    const formalRoots = /* @__PURE__ */ new Set();
    for (const obligation of obligations) {
      for (const ref of [...stringArray3(obligation.source_claim_ids) ?? [], ...stringArray3(obligation.required_oracle_refs) ?? []]) formalRoots.add(ref);
      for (const factId of routedFactsByObligation.get(String(obligation.obligation_id)) ?? []) {
        const fact = factsById.get(factId);
        if (fact && isCanonicalString(fact.claim_id)) formalRoots.add(String(fact.claim_id));
        for (const ref of fact ? stringArray3(fact.source_claim_ids) ?? [] : []) formalRoots.add(ref);
      }
    }
    const formalEvidence = assessEvidenceRoots([...formalRoots], evidence, evidenceCache).refs;
    const formalDependence = new Set(formalEvidence);
    const dependenceQueue = [...formalEvidence].sort(compareCodePoints3);
    let dependenceCursor = 0;
    while (dependenceCursor < dependenceQueue.length) {
      const claimId = dependenceQueue[dependenceCursor++];
      for (const childId of evidence.get(claimId)?.children ?? []) {
        if (formalDependence.has(childId)) continue;
        formalDependence.add(childId);
        dependenceQueue.push(childId);
      }
    }
    const exploratoryOutput = [];
    for (const candidate of [...exploratory].sort((left, right) => compareCodePoints3(String(left.exploratory_id), String(right.exploratory_id)))) {
      const candidateId = String(candidate.exploratory_id);
      let valid = true;
      if (!exploratoryRouteIds.has(candidateId)) {
        valid = false;
        diagnostics.push(diagnostic5(
          "traceability",
          "EXPLORATORY_ROUTE_MISSING",
          `/exploratory/${pointerPart2(candidateId)}`,
          "Exploratory candidate requires a Task 7 exploratory interaction route"
        ));
      }
      for (const ref of stringArray3(candidate.source_claim_ids, true) ?? []) {
        const claim = evidence.get(ref);
        if (!claim) {
          valid = false;
          diagnostics.push(diagnostic5(
            "reference",
            "EXPLORATORY_EVIDENCE_UNKNOWN",
            `/exploratory/${pointerPart2(String(candidate.exploratory_id))}/source_claim_ids/${pointerPart2(ref)}`,
            "Exploratory candidate references unknown risk evidence"
          ));
        } else if (formalDependence.has(ref)) {
          valid = false;
          diagnostics.push(diagnostic5(
            "classification",
            "EXPLORATORY_FORMAL_EVIDENCE_OVERLAP",
            `/exploratory/${pointerPart2(candidateId)}/source_claim_ids/${pointerPart2(ref)}`,
            "formal Test Point evidence cannot be reclassified as an independent risk hypothesis"
          ));
        }
      }
      if (valid) exploratoryOutput.push(structuredClone(candidate));
    }
    const deduplicated = deduplicateCases(
      uniquelyExecutable,
      obligationsById,
      oracleReachability,
      diagnostics
    );
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);
    return {
      grounded: deduplicated.grounded,
      conditional: deduplicated.conditional,
      blocked: [...blocked.values()].sort((left, right) => compareCodePoints3(left.obligation_id, right.obligation_id)),
      not_applicable: notApplicable.sort((left, right) => compareCodePoints3(String(left.obligation_id), String(right.obligation_id))),
      exploratory: exploratoryOutput,
      diagnostics: finalizeDiagnostics2(diagnostics)
    };
  } catch (error) {
    return resultWithDiagnostics([diagnostic5(
      "classification",
      "CLASSIFICATION_INPUT_UNREADABLE",
      "/",
      "classification input could not be read from trusted own data"
    )]);
  }
}

// skill/generate-test-cases/scripts/schemas/test-bundle.schema.json
var test_bundle_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "test-bundle.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "grounded", "conditional", "blocked", "exploratory", "coverage", "quality"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    grounded: {
      type: "array",
      items: {
        type: "object",
        required: ["case_id", "title", "scope", "risk", "role", "fact_ids", "obligation_ids", "preconditions", "data", "steps", "testability_profile", "post_state", "cleanup", "evidence_refs", "execution_signature"],
        properties: {
          case_id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          scope: { type: "string", minLength: 1 },
          risk: { enum: ["critical", "high", "medium", "low"] },
          role: { type: "object", required: ["value", "evidence_ref", "support_review"], properties: { value: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false },
          fact_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          obligation_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true },
          preconditions: { type: "array", minItems: 1, items: { type: "object", required: ["condition", "reachable_from", "source_claim_ids", "evidence_ref", "support_review"], properties: { condition: { type: "string", minLength: 1 }, reachable_from: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false } },
          data: { type: "array", minItems: 1, items: { type: "object", required: ["name", "value", "provenance", "support_review"], properties: { name: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 }, provenance: { oneOf: [
            { type: "object", required: ["type", "ref"], properties: { type: { const: "evidence" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false },
            { type: "object", required: ["type", "ref"], properties: { type: { const: "derivation" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false }
          ] }, support_review: { const: "supported" } }, additionalProperties: false } },
          steps: { type: "array", minItems: 1, items: { type: "object", required: ["step_id", "action", "action_evidence_ref", "support_review", "expectations"], properties: { step_id: { type: "string", minLength: 1 }, action: { type: "string", minLength: 1 }, action_evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" }, expectations: { type: "array", minItems: 1, items: { type: "object", required: ["expectation_id", "business_assertion", "preceding_action_id", "observer", "observation_surface", "observation_target", "oracle", "evidence_ref", "support_review"], properties: {
            expectation_id: { type: "string", minLength: 1 },
            business_assertion: { type: "string", minLength: 1 },
            preceding_action_id: { type: "string", minLength: 1 },
            observer: { type: "string", minLength: 1 },
            observation_surface: { type: "string", minLength: 1 },
            observation_target: { type: "string", minLength: 1 },
            oracle: { oneOf: [
              { type: "object", required: ["type", "expected_value", "comparison"], properties: { type: { const: "value" }, expected_value: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_state", "comparison"], properties: { type: { const: "state" }, expected_state: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_event", "comparison"], properties: { type: { const: "event" }, expected_event: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_side_effect", "comparison"], properties: { type: { const: "side-effect" }, expected_side_effect: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false }
            ] },
            evidence_ref: { type: "string", minLength: 1 },
            support_review: { const: "supported" }
          }, additionalProperties: false } } }, additionalProperties: false } },
          testability_profile: { type: "object", required: ["capabilities", "observers", "controls"], properties: {
            capabilities: { type: "array", minItems: 1, items: { type: "object", required: ["capability", "status"], properties: { capability: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            observers: { type: "array", minItems: 1, items: { type: "object", required: ["observer", "observation_target", "status"], properties: { observer: { type: "string", minLength: 1 }, observation_target: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            controls: { type: "array", minItems: 1, items: { type: "object", required: ["control", "status"], properties: { control: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } }
          }, additionalProperties: false },
          post_state: { type: "object", required: ["state", "evidence_ref", "support_review"], properties: { state: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false },
          cleanup: { oneOf: [
            { type: "object", required: ["required", "steps", "evidence_ref", "support_review"], properties: { required: { const: true }, steps: { type: "array", items: { type: "string" }, minItems: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false },
            { type: "object", required: ["required", "no_cleanup_reason", "no_cleanup_evidence_ref", "support_review"], properties: { required: { const: false }, no_cleanup_reason: { type: "string", minLength: 1 }, no_cleanup_evidence_ref: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false }
          ] },
          evidence_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          execution_signature: { type: "object", required: ["role", "precondition_state", "data_partition", "action_path", "oracle_refs"], properties: { role: { type: "string", minLength: 1 }, precondition_state: { type: "string", minLength: 1 }, data_partition: { type: "string", minLength: 1 }, action_path: { type: "array", items: { type: "string" }, minItems: 1 }, oracle_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, test_point_ids: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false }
        },
        additionalProperties: false
      }
    },
    conditional: {
      type: "array",
      items: {
        type: "object",
        required: ["case_id", "title", "scope", "risk", "role", "fact_ids", "obligation_ids", "preconditions", "data", "steps", "testability_profile", "post_state", "cleanup", "evidence_refs", "temporary_assumption", "execution_signature"],
        properties: {
          case_id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          scope: { type: "string", minLength: 1 },
          risk: { enum: ["critical", "high", "medium", "low"] },
          role: { type: "object", required: ["value", "evidence_ref", "support_review"], properties: { value: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
          fact_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          obligation_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          source_claim_ids: { type: "array", items: { type: "string" }, uniqueItems: true },
          preconditions: { type: "array", minItems: 1, items: { type: "object", required: ["condition", "reachable_from", "source_claim_ids", "evidence_ref", "support_review"], properties: { condition: { type: "string", minLength: 1 }, reachable_from: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false } },
          data: { type: "array", minItems: 1, items: { type: "object", required: ["name", "value", "provenance", "support_review"], properties: { name: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 }, provenance: { oneOf: [
            { type: "object", required: ["type", "ref"], properties: { type: { const: "evidence" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false },
            { type: "object", required: ["type", "ref"], properties: { type: { const: "derivation" }, ref: { type: "string", minLength: 1 } }, additionalProperties: false }
          ] }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false } },
          steps: { type: "array", minItems: 1, items: { type: "object", required: ["step_id", "action", "action_evidence_ref", "support_review", "expectations"], properties: { step_id: { type: "string", minLength: 1 }, action: { type: "string", minLength: 1 }, action_evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] }, expectations: { type: "array", minItems: 1, items: { type: "object", required: ["expectation_id", "business_assertion", "preceding_action_id", "observer", "observation_surface", "observation_target", "oracle", "evidence_ref", "support_review"], properties: {
            expectation_id: { type: "string", minLength: 1 },
            business_assertion: { type: "string", minLength: 1 },
            preceding_action_id: { type: "string", minLength: 1 },
            observer: { type: "string", minLength: 1 },
            observation_surface: { type: "string", minLength: 1 },
            observation_target: { type: "string", minLength: 1 },
            oracle: { oneOf: [
              { type: "object", required: ["type", "expected_value", "comparison"], properties: { type: { const: "value" }, expected_value: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_state", "comparison"], properties: { type: { const: "state" }, expected_state: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_event", "comparison"], properties: { type: { const: "event" }, expected_event: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "expected_side_effect", "comparison"], properties: { type: { const: "side-effect" }, expected_side_effect: { type: "string", minLength: 1 }, comparison: { enum: ["equals", "contains", "matches", "within"] }, tolerance: { type: "number" }, window: { type: "string" } }, additionalProperties: false }
            ] },
            evidence_ref: { type: "string", minLength: 1 },
            support_review: { enum: ["supported", "contradicted", "uncertain"] }
          }, additionalProperties: false } } }, additionalProperties: false } },
          testability_profile: { type: "object", required: ["capabilities", "observers", "controls"], properties: {
            capabilities: { type: "array", minItems: 1, items: { type: "object", required: ["capability", "status"], properties: { capability: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            observers: { type: "array", minItems: 1, items: { type: "object", required: ["observer", "observation_target", "status"], properties: { observer: { type: "string", minLength: 1 }, observation_target: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } },
            controls: { type: "array", minItems: 1, items: { type: "object", required: ["control", "status"], properties: { control: { type: "string", minLength: 1 }, status: { enum: ["provided", "verified", "approved-assumption", "unavailable", "unknown"] }, provenance_ref: { type: "string", minLength: 1 } }, additionalProperties: false } }
          }, additionalProperties: false },
          post_state: { type: "object", required: ["state", "evidence_ref", "support_review"], properties: { state: { type: "string", minLength: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
          cleanup: { oneOf: [
            { type: "object", required: ["required", "steps", "evidence_ref", "support_review"], properties: { required: { const: true }, steps: { type: "array", items: { type: "string" }, minItems: 1 }, evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false },
            { type: "object", required: ["required", "no_cleanup_reason", "no_cleanup_evidence_ref", "support_review"], properties: { required: { const: false }, no_cleanup_reason: { type: "string", minLength: 1 }, no_cleanup_evidence_ref: { type: "string", minLength: 1 }, support_review: { enum: ["supported", "contradicted", "uncertain"] } }, additionalProperties: false }
          ] },
          evidence_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          temporary_assumption: { type: "object", required: ["claim_id", "invalidation_condition"], properties: { claim_id: { type: "string", minLength: 1 }, invalidation_condition: { type: "string", minLength: 1 } }, additionalProperties: false },
          execution_signature: { type: "object", required: ["role", "precondition_state", "data_partition", "action_path", "oracle_refs"], properties: { role: { type: "string", minLength: 1 }, precondition_state: { type: "string", minLength: 1 }, data_partition: { type: "string", minLength: 1 }, action_path: { type: "array", items: { type: "string" }, minItems: 1 }, oracle_refs: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, test_point_ids: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false }
        },
        additionalProperties: false
      }
    },
    blocked: { type: "array", items: { type: "object", required: ["obligation_id", "root_issue_id", "reason", "recovery", "risk"], properties: { obligation_id: { type: "string", minLength: 1 }, root_issue_id: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 }, risk: { enum: ["critical", "high", "medium", "low"] }, recovery: { type: "object", required: ["missing_type", "required_material", "question"], properties: { missing_type: { type: "string", minLength: 1 }, required_material: { type: "string", minLength: 1 }, question: { type: "string", minLength: 1 } }, additionalProperties: false } }, additionalProperties: false } },
    exploratory: { type: "array", items: { type: "object", required: ["exploratory_id", "title", "scope", "risk", "reason"], properties: { exploratory_id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, scope: { type: "string", minLength: 1 }, risk: { enum: ["critical", "high", "medium", "low"] }, reason: { type: "string", minLength: 1 } }, additionalProperties: false } },
    coverage: { type: "object", required: ["requirements", "formal", "executable", "expert_recall", "not_applicable"], properties: {
      requirements: { type: "object", required: ["total", "accounted", "entries"], properties: { total: { type: "integer", minimum: 0 }, accounted: { type: "integer", minimum: 0 }, entries: { type: "array", items: { type: "object", required: ["fact_id", "status"], properties: { fact_id: { type: "string", minLength: 1 }, status: { enum: ["covered", "blocked", "not_applicable"] } }, additionalProperties: false } } }, additionalProperties: false },
      formal: { type: "object", required: ["total", "covered", "entries"], properties: { total: { type: "integer", minimum: 0 }, covered: { type: "integer", minimum: 0 }, entries: { type: "array", items: { type: "object", required: ["obligation_id", "status"], properties: { obligation_id: { type: "string", minLength: 1 }, status: { enum: ["grounded", "conditional", "blocked", "not_applicable"] } }, additionalProperties: false } } }, additionalProperties: false },
      executable: { type: "object", required: ["total", "grounded", "entries"], properties: { total: { type: "integer", minimum: 0 }, grounded: { type: "integer", minimum: 0 }, entries: { type: "array", items: { type: "object", required: ["obligation_id", "case_id"], properties: { obligation_id: { type: "string", minLength: 1 }, case_id: { type: "string", minLength: 1 } }, additionalProperties: false } } }, additionalProperties: false },
      expert_recall: { type: "object", required: ["status", "limits"], properties: { status: { const: "benchmark_only" }, limits: { type: "array", items: { type: "string" }, minItems: 1 } }, additionalProperties: false },
      not_applicable: { type: "array", items: { type: "object", required: ["obligation_id", "exclusion_claim_id", "scope", "support_review"], properties: { obligation_id: { type: "string", minLength: 1 }, exclusion_claim_id: { type: "string", minLength: 1 }, scope: { type: "string", minLength: 1 }, support_review: { const: "supported" } }, additionalProperties: false } }
    }, additionalProperties: false },
    quality: { type: "object", required: ["delivery_status", "compiler_version", "schema_version", "lineage", "limits"], properties: { delivery_status: { enum: ["no_applicable_formal_test_points", "no_deterministic_cases", "critical_gaps", "executable_subset_ready"] }, compiler_version: { type: "string", minLength: 1 }, schema_version: { const: "1.0.0" }, lineage: { type: "object", required: ["source_digest", "case_draft_digest"], properties: { source_digest: { type: "string", pattern: "^[a-f0-9]{64}$" }, case_draft_digest: { type: "string", pattern: "^[a-f0-9]{64}$" } }, additionalProperties: false }, limits: { type: "array", items: { type: "string" }, minItems: 1 } }, additionalProperties: false }
  },
  additionalProperties: false
};

// skill/generate-test-cases/scripts/schemas/test-obligations.schema.json
var test_obligations_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "test-obligations.schema.json",
  type: "object",
  required: ["schema_version", "source_revision", "obligations", "fact_routes", "interaction_routes"],
  properties: {
    schema_version: { const: "1.0.0" },
    source_revision: { type: "integer", minimum: 0 },
    obligations: { type: "array", items: { type: "object", required: ["obligation_id", "kind", "risk", "scope", "source_claim_ids", "view_element_refs", "required_oracle_refs", "required_capabilities"], properties: { obligation_id: { type: "string", minLength: 1 }, kind: { enum: ["flow", "decision", "state", "input-domain", "role", "timing", "integration", "interaction"] }, risk: { enum: ["critical", "high", "medium", "low"] }, scope: { type: "string", minLength: 1 }, source_claim_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true }, view_element_refs: { type: "array", items: { type: "string" }, uniqueItems: true }, required_oracle_refs: { type: "array", items: { type: "string" }, uniqueItems: true }, required_capabilities: { type: "array", items: { type: "string" }, uniqueItems: true } }, additionalProperties: false } },
    fact_routes: { type: "array", items: { oneOf: [{ type: "object", required: ["fact_id", "route_type", "obligation_ids"], properties: { fact_id: { type: "string", minLength: 1 }, route_type: { const: "obligations" }, obligation_ids: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } }, additionalProperties: false }, { type: "object", required: ["fact_id", "route_type", "blocker_root_issue_id"], properties: { fact_id: { type: "string", minLength: 1 }, route_type: { const: "blocked" }, blocker_root_issue_id: { type: "string", minLength: 1 } }, additionalProperties: false }, { type: "object", required: ["fact_id", "route_type", "not_applicable_claim_id"], properties: { fact_id: { type: "string", minLength: 1 }, route_type: { const: "not_applicable" }, not_applicable_claim_id: { type: "string", minLength: 1 } }, additionalProperties: false }] } },
    interaction_routes: { type: "array", items: { oneOf: [{ type: "object", required: ["candidate_id", "route_type", "formal_view_id"], properties: { candidate_id: { type: "string", minLength: 1 }, route_type: { const: "formal-view" }, formal_view_id: { type: "string", minLength: 1 } }, additionalProperties: false }, { type: "object", required: ["candidate_id", "route_type", "blocker_root_issue_id"], properties: { candidate_id: { type: "string", minLength: 1 }, route_type: { const: "blocked" }, blocker_root_issue_id: { type: "string", minLength: 1 } }, additionalProperties: false }, { type: "object", required: ["candidate_id", "route_type", "exploratory_id"], properties: { candidate_id: { type: "string", minLength: 1 }, route_type: { const: "exploratory" }, exploratory_id: { type: "string", minLength: 1 } }, additionalProperties: false }] } }
  },
  additionalProperties: false
};

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
var supportedKeywords = /* @__PURE__ */ new Set([
  "$schema",
  "$id",
  "type",
  "required",
  "properties",
  "items",
  "enum",
  "const",
  "oneOf",
  "allOf",
  "minItems",
  "minLength",
  "pattern",
  "minimum",
  "maximum",
  "uniqueItems",
  "additionalProperties"
]);
var supportedTypes = /* @__PURE__ */ new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);
var NATIVE_ARRAY_EVERY = Array.prototype.every;
var NATIVE_ARRAY_FILTER3 = Array.prototype.filter;
var NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
var NATIVE_ARRAY_FOR_EACH = Array.prototype.forEach;
var NATIVE_ARRAY_JOIN2 = Array.prototype.join;
var NATIVE_ARRAY_MAP3 = Array.prototype.map;
var NATIVE_ARRAY_SLICE2 = Array.prototype.slice;
var NATIVE_ARRAY_SOME2 = Array.prototype.some;
var NATIVE_DEFINE_PROPERTY3 = Object.defineProperty;
function everyArray(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_EVERY, values, [predicate])
  );
}
function filterArray2(values, predicate) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_FILTER3, values, [predicate])
  );
}
function flatMapArray(values, project) {
  return (
    /** @type {U[]} */
    Reflect.apply(NATIVE_ARRAY_FLAT_MAP, values, [project])
  );
}
function forEachArray(values, visit) {
  Reflect.apply(NATIVE_ARRAY_FOR_EACH, values, [visit]);
}
function joinArray2(values, separator) {
  return (
    /** @type {string} */
    Reflect.apply(NATIVE_ARRAY_JOIN2, values, [separator])
  );
}
function mapArray2(values, project) {
  return (
    /** @type {U[]} */
    Reflect.apply(NATIVE_ARRAY_MAP3, values, [project])
  );
}
function pushArray(values, ...items) {
  for (let index = 0; index < items.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY3, Object, [
    values,
    String(values.length),
    { value: items[index], writable: true, enumerable: true, configurable: true }
  ]);
  return values.length;
}
function sliceArray(values, start, end) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_SLICE2, values, end === void 0 ? [start] : [start, end])
  );
}
function someArray(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_SOME2, values, [predicate])
  );
}
function isSchemaObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function assertStringArray(value, keyword) {
  if (!Array.isArray(value) || someArray(value, (item) => typeof item !== "string") || new Set(value).size !== value.length) {
    throw new Error(`Schema ${keyword} must be an array of unique strings.`);
  }
}
function diagnostic6(code2, path4, message) {
  return { category: "schema", code: code2, path: path4, message };
}
function escapePointerSegment(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
function childPointer(path4, segment) {
  return `${path4}/${escapePointerSegment(segment)}`;
}
function assertSupportedSchema(schema) {
  if (!isSchemaObject(schema)) {
    throw new Error("Schema must be an object.");
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!supportedKeywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (key === "$schema" || key === "$id" || key === "pattern") {
      if (typeof value !== "string") throw new Error(`Schema ${key} must be a string.`);
      if (key === "pattern") {
        try {
          new RegExp(value);
        } catch {
          throw new Error("Schema pattern must be a valid regular expression.");
        }
      }
    } else if (key === "type") {
      const types = Array.isArray(value) ? value : [value];
      if (!types.length || someArray(types, (item) => typeof item !== "string" || !supportedTypes.has(item)) || new Set(types).size !== types.length) throw new Error("Schema type must name supported unique types.");
    } else if (key === "required") {
      assertStringArray(value, "required");
    } else if (key === "properties") {
      if (!isSchemaObject(value)) throw new Error("Schema properties must be an object.");
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === "items") {
      assertSupportedSchema(value);
    } else if (key === "oneOf" || key === "allOf") {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`Schema ${key} must be a non-empty array of schema objects.`);
      for (const child of value) assertSupportedSchema(child);
    } else if (key === "enum") {
      if (!Array.isArray(value) || value.length === 0 || new Set(mapArray2(value, (item) => canonicalStringify(item))).size !== value.length) throw new Error("Schema enum must be a non-empty array of unique values.");
    } else if (key === "minItems" || key === "minLength") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Schema ${key} must be a non-negative integer.`);
    } else if (key === "minimum" || key === "maximum") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Schema ${key} must be a finite number.`);
    } else if (key === "uniqueItems") {
      if (typeof value !== "boolean") throw new Error("Schema uniqueItems must be boolean.");
    } else if (key === "additionalProperties") {
      if (typeof value !== "boolean" && !isSchemaObject(value)) throw new Error("Schema additionalProperties must be boolean or a schema object.");
      if (isSchemaObject(value)) assertSupportedSchema(value);
    }
  }
  if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) throw new Error("Schema minimum must not exceed maximum.");
}
function validateAgainstSchema(value, schema) {
  assertSupportedSchema(schema);
  return validate(
    value,
    /** @type {Record<string, unknown>} */
    schema,
    ""
  );
}
function validate(value, schema, path4) {
  const diagnostics = [];
  const pointer = path4 || "/";
  if (schema.type && !matchesType(value, schema.type)) {
    return [diagnostic6("TYPE_MISMATCH", pointer, `must be ${Array.isArray(schema.type) ? joinArray2(schema.type, " or ") : schema.type}`)];
  }
  if (Object.hasOwn(schema, "const") && canonicalStringify(value) !== canonicalStringify(schema.const)) {
    pushArray(diagnostics, diagnostic6("CONST_MISMATCH", pointer, "must equal the schema constant"));
  }
  if (Array.isArray(schema.enum) && !someArray(schema.enum, (item) => canonicalStringify(item) === canonicalStringify(value))) {
    pushArray(diagnostics, diagnostic6("ENUM_MISMATCH", pointer, "must be one of the allowed values"));
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) pushArray(diagnostics, diagnostic6("MIN_LENGTH", pointer, "is shorter than the minimum length"));
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) pushArray(diagnostics, diagnostic6("PATTERN_MISMATCH", pointer, "does not match the required pattern"));
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) pushArray(diagnostics, diagnostic6("MINIMUM", pointer, "is below the minimum"));
    if (typeof schema.maximum === "number" && value > schema.maximum) pushArray(diagnostics, diagnostic6("MAXIMUM", pointer, "is above the maximum"));
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) pushArray(diagnostics, diagnostic6("MIN_ITEMS", pointer, "has too few items"));
    if (schema.uniqueItems === true) {
      const seen = /* @__PURE__ */ new Set();
      forEachArray(value, (item, index) => {
        const key = canonicalStringify(item);
        if (seen.has(key)) pushArray(diagnostics, diagnostic6("UNIQUE_ITEMS", `${path4}/${index}`, "must not contain duplicate items"));
        seen.add(key);
      });
    }
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      forEachArray(value, (item, index) => pushArray(diagnostics, ...validate(
        item,
        /** @type {Record<string, unknown>} */
        schema.items,
        `${path4}/${index}`
      )));
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = (
      /** @type {Record<string, unknown>} */
      value
    );
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? (
      /** @type {Record<string, Record<string, unknown>>} */
      schema.properties
    ) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !Object.hasOwn(object, key)) pushArray(diagnostics, diagnostic6("REQUIRED_FIELD_MISSING", childPointer(path4, key), "required field is missing"));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) pushArray(diagnostics, diagnostic6("ADDITIONAL_PROPERTY", childPointer(path4, key), "additional properties are not allowed"));
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object" && !Array.isArray(schema.additionalProperties)) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) pushArray(diagnostics, ...validate(
          object[key],
          /** @type {Record<string, unknown>} */
          schema.additionalProperties,
          childPointer(path4, key)
        ));
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) pushArray(diagnostics, ...validate(object[key], childSchema, childPointer(path4, key)));
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) pushArray(diagnostics, ...validate(
    value,
    /** @type {Record<string, unknown>} */
    child,
    path4
  ));
  if (Array.isArray(schema.oneOf)) {
    const variants = mapArray2(schema.oneOf, (child) => (
      /** @type {Record<string, unknown>} */
      child
    ));
    const matching = filterArray2(variants, (child) => validate(value, child, path4).length === 0);
    if (matching.length !== 1) {
      const discriminated = filterArray2(variants, (child) => matchesDiscriminator(value, child));
      if (matching.length === 0 && discriminated.length === 1) pushArray(diagnostics, ...validate(value, discriminated[0], path4));
      else pushArray(diagnostics, diagnostic6("ONE_OF_MISMATCH", pointer, "must match exactly one schema variant"));
    }
  }
  return diagnostics;
}
function matchesDiscriminator(value, schema) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const properties = schema.properties;
  if (!isSchemaObject(properties)) return false;
  const constants = flatMapArray(Object.entries(properties), ([key, candidate]) => isSchemaObject(candidate) && Object.hasOwn(candidate, "const") ? [[key, candidate]] : []);
  return constants.length > 0 && everyArray(constants, ([key, candidate]) => canonicalStringify(
    /** @type {Record<string, unknown>} */
    value[key]
  ) === canonicalStringify(candidate.const));
}
function matchesType(value, type) {
  if (Array.isArray(type)) return someArray(type, (candidate) => matchesType(value, candidate));
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "null") return value === null;
  return typeof value === type;
}
function validateUniqueStableIds(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return [];
  const object = (
    /** @type {Record<string, unknown>} */
    artifact
  );
  const diagnostics = [];
  const seenByNamespace = /* @__PURE__ */ new Map();
  for (
    const { path: path4, id, namespace, scopeSegments } of
    /** @type {any[]} */
    STABLE_ID_COLLECTIONS
  ) {
    for (const { items, pointer } of findCollections(object, path4)) {
      const pointerSegments = filterArray2(pointer.split("/"), Boolean);
      const scopedPointer = typeof scopeSegments === "number" ? `/${joinArray2(sliceArray(pointerSegments, 0, -scopeSegments), "/")}` : "";
      const namespaceKey = `${namespace ?? joinArray2(path4, "/")}${scopedPointer}`;
      const seen = seenByNamespace.get(namespaceKey) ?? /* @__PURE__ */ new Set();
      seenByNamespace.set(namespaceKey, seen);
      forEachArray(items, (item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return;
        const value = (
          /** @type {Record<string, unknown>} */
          item[id]
        );
        if (typeof value !== "string") return;
        if (seen.has(value)) pushArray(diagnostics, diagnostic6("DUPLICATE_STABLE_ID", `${pointer}/${index}/${id}`, `duplicate stable ID "${value}"`));
        seen.add(value);
      });
    }
  }
  return diagnostics;
}
function findCollections(value, segments, pointer = "") {
  if (segments.length === 0) return Array.isArray(value) ? [{ items: value, pointer }] : [];
  const [segment, ...rest] = segments;
  if (segment === "*") {
    if (!Array.isArray(value)) return [];
    return flatMapArray(value, (item, index) => item && typeof item === "object" && !Array.isArray(item) ? findCollections(
      /** @type {Record<string, unknown>} */
      item,
      rest,
      `${pointer}/${index}`
    ) : []);
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, segment)) return [];
  return findCollections(
    /** @type {Record<string, unknown>} */
    value[segment],
    rest,
    `${pointer}/${segment}`
  );
}

// src/coverage.mjs
var CONTEXT_KEYS = [
  "schema_version",
  "source_revision",
  "compiler_version",
  "lineage",
  "evidence_claims",
  "obligations_artifact",
  "classification",
  "clarification",
  "limits",
  "expert_recall_limits"
];
var CLASSIFICATION_KEYS = [
  "grounded",
  "conditional",
  "blocked",
  "not_applicable",
  "exploratory",
  "diagnostics"
];
var CLARIFICATION_KEYS = [
  "action",
  "source_revision",
  "root_issues",
  "pending_root_issues",
  "state",
  "semantic_snapshot",
  "interaction",
  "diagnostics"
];
var CLARIFICATION_STATE_KEYS = [
  "source_revision",
  "clarification_event_seq",
  "asked_root_issue_ids",
  "root_issue_dispositions",
  "last_pending_root_issue_ids",
  "last_question_set_digest",
  "clarification_stop",
  "semantic_snapshot",
  "root_snapshot_ledger"
];
var CURRENT_ROOT_KEYS = [
  "root_issue_id",
  "root_issue_key",
  "missing_type",
  "semantic_refs",
  "scope",
  "affected_obligation_ids",
  "risk_counts",
  "source_revision",
  "question",
  "answerable",
  "reasons",
  "evidence_refs",
  "batch_id"
];
var LEDGER_ROOT_KEYS = [
  "root_issue_id",
  "root_issue_key",
  "missing_type",
  "semantic_refs",
  "scope",
  "affected_obligation_ids",
  "risk_counts",
  "question",
  "answerable",
  "reasons",
  "evidence_refs",
  "current"
];
var DISPOSITIONS = /* @__PURE__ */ new Set(["grounded", "conditional", "blocked", "not_applicable"]);
var RISKS3 = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
var COMPARISONS2 = /* @__PURE__ */ new Set(["equals", "contains", "matches", "within"]);
var ORACLE_FIELDS2 = Object.freeze({
  value: "expected_value",
  state: "expected_state",
  event: "expected_event",
  "side-effect": "expected_side_effect"
});
var ROOT_DISPOSITIONS = /* @__PURE__ */ new Set([
  "open",
  "asked",
  "resolved_final",
  "resolved_temporary",
  "suppressed_unknown",
  "suppressed_deferred"
]);
var DIAGNOSTIC_LIMIT3 = 256;
var NATIVE_ARRAY_IS_ARRAY3 = Array.isArray;
var NATIVE_GET_PROTOTYPE_OF3 = Object.getPrototypeOf;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTORS3 = Object.getOwnPropertyDescriptors;
var NATIVE_REFLECT_OWN_KEYS3 = Reflect.ownKeys;
var NATIVE_DEFINE_PROPERTY4 = Object.defineProperty;
var NATIVE_HAS_OWN = Object.hasOwn;
var NATIVE_ARRAY_POP2 = Array.prototype.pop;
var NATIVE_ARRAY_SORT3 = Array.prototype.sort;
var NATIVE_ARRAY_EVERY2 = Array.prototype.every;
var NATIVE_ARRAY_FILTER4 = Array.prototype.filter;
var NATIVE_ARRAY_JOIN3 = Array.prototype.join;
var NATIVE_ARRAY_MAP4 = Array.prototype.map;
var NATIVE_ARRAY_SLICE3 = Array.prototype.slice;
var NATIVE_ARRAY_SOME3 = Array.prototype.some;
function sortArray2(values, compare) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_SORT3, values, [compare])
  );
}
function everyArray2(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_EVERY2, values, [predicate])
  );
}
function fillArray(values, value) {
  for (let index = 0; index < values.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY4, Object, [
    values,
    String(index),
    { value, writable: true, enumerable: true, configurable: true }
  ]);
  return values;
}
function filterArray3(values, predicate) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_FILTER4, values, [predicate])
  );
}
function joinArray3(values, separator) {
  return (
    /** @type {string} */
    Reflect.apply(NATIVE_ARRAY_JOIN3, values, [separator])
  );
}
function mapArray3(values, project) {
  return (
    /** @type {U[]} */
    Reflect.apply(NATIVE_ARRAY_MAP4, values, [project])
  );
}
function pushArray2(values, ...items) {
  for (let index = 0; index < items.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY4, Object, [
    values,
    String(values.length),
    { value: items[index], writable: true, enumerable: true, configurable: true }
  ]);
  return values.length;
}
function sliceArray2(values, start, end) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_SLICE3, values, end === void 0 ? [start] : [start, end])
  );
}
function someArray2(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_SOME3, values, [predicate])
  );
}
var BundleReconciliationError = class extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super("test-bundle reconciliation requires revision");
    this.name = "BundleReconciliationError";
    this.status = "need_revision";
    this.stage = "coverage";
    this.diagnostics = finalizeDiagnostics3(diagnostics);
  }
};
function diagnostic7(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function pointerPart3(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function compareCodePoints4(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function finalizeDiagnostics3(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  let overflow = false;
  for (const item of diagnostics) {
    if (item.code === "DIAGNOSTICS_TRUNCATED") overflow = true;
    else unique.set(canonicalStringify(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT3) overflow = true;
  const sorted = sortArray2([...unique.values()], (left, right) => compareCodePoints4(left.category, right.category) || compareCodePoints4(left.code, right.code) || compareCodePoints4(left.path, right.path) || compareCodePoints4(left.message, right.message));
  if (!overflow) return sorted;
  const retained = sliceArray2(sorted, 0, DIAGNOSTIC_LIMIT3 - 1);
  pushArray2(retained, diagnostic7(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT3} entries`
  ));
  return sortArray2(retained, (left, right) => compareCodePoints4(left.category, right.category) || compareCodePoints4(left.code, right.code) || compareCodePoints4(left.path, right.path) || compareCodePoints4(left.message, right.message));
}
function snapshotControlled3(root) {
  const diagnostics = [];
  let overflow = false;
  const addDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT3) pushArray2(diagnostics, item);
    else overflow = true;
  };
  let snapshot;
  const pending = [{ source: root, path: "", assign(value) {
    snapshot = value;
  } }];
  const seen = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const item = (
      /** @type {{source:unknown,path:string,assign:(value:unknown)=>void}} */
      Reflect.apply(NATIVE_ARRAY_POP2, pending, [])
    );
    const { source, path: path4, assign } = item;
    if (!source || typeof source !== "object") {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      addDiagnostic(diagnostic7("schema", "CYCLIC_INPUT_INVALID", path4 || "/", "Task 10 context must be acyclic"));
      assign(null);
      continue;
    }
    seen.add(source);
    let prototype;
    let descriptors;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF3(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS3(source);
    } catch {
      addDiagnostic(diagnostic7("schema", "INPUT_DESCRIPTOR_UNREADABLE", path4 || "/", "Task 10 input descriptors could not be captured"));
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY3(source)) {
      if (prototype !== Array.prototype) {
        addDiagnostic(diagnostic7("schema", "ARRAY_PROTOTYPE_INVALID", path4 || "/", "controlled arrays must use Array.prototype"));
        assign(null);
        continue;
      }
      const keys2 = sortArray2(NATIVE_REFLECT_OWN_KEYS3(descriptors), (left, right) => compareCodePoints4(
        typeof left === "symbol" ? String(left.description ?? "") : left,
        typeof right === "symbol" ? String(right.description ?? "") : right
      ));
      let invalidOwnKeys = false;
      const numeric = [];
      for (let index = 0; index < keys2.length; index += 1) {
        const key = keys2[index];
        if (typeof key === "symbol") {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic7("schema", "ARRAY_SYMBOL_PROPERTY_INVALID", path4 || "/", "controlled arrays cannot contain symbol properties"));
          continue;
        }
        if (key === "length") continue;
        const numericKey = Number(key);
        const lengthDescriptor2 = descriptors.length;
        const length2 = lengthDescriptor2 && NATIVE_HAS_OWN(lengthDescriptor2, "value") && Number.isSafeInteger(lengthDescriptor2.value) ? Number(lengthDescriptor2.value) : 0;
        if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= length2 || String(numericKey) !== key) {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic7("schema", "ARRAY_NAMED_PROPERTY_INVALID", `${path4}/${pointerPart3(key)}`, "controlled arrays cannot contain named properties"));
        } else pushArray2(numeric, numericKey);
      }
      if (invalidOwnKeys) {
        assign(null);
        continue;
      }
      sortArray2(numeric, (left, right) => left - right);
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && NATIVE_HAS_OWN(lengthDescriptor, "value") && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      let structurallyInvalid = numeric.length !== length;
      let expected = 0;
      for (let position = 0; position < numeric.length; position += 1) {
        const numericKey = numeric[position];
        while (expected < numericKey && diagnostics.length < DIAGNOSTIC_LIMIT3) {
          addDiagnostic(diagnostic7("schema", "ARRAY_HOLE", `${path4}/${expected}`, "controlled arrays must be dense"));
          expected += 1;
        }
        if (expected < numericKey) overflow = true;
        expected = numericKey + 1;
      }
      while (expected < length && diagnostics.length < DIAGNOSTIC_LIMIT3) {
        addDiagnostic(diagnostic7("schema", "ARRAY_HOLE", `${path4}/${expected}`, "controlled arrays must be dense"));
        expected += 1;
      }
      if (expected < length) overflow = true;
      for (let position = 0; position < numeric.length; position += 1) {
        const numericKey = numeric[position];
        const descriptor = descriptors[String(numericKey)];
        if (!descriptor || !NATIVE_HAS_OWN(descriptor, "value")) {
          structurallyInvalid = true;
          addDiagnostic(diagnostic7(
            "schema",
            "ACCESSOR_NOT_ALLOWED",
            `${path4}/${numericKey}`,
            "controlled input must use own data properties"
          ));
        }
      }
      if (structurallyInvalid) {
        assign(null);
        continue;
      }
      const target2 = new Array(length);
      assign(target2);
      const children2 = [];
      for (let position = 0; position < numeric.length; position += 1) {
        const numericKey = numeric[position];
        const descriptor = descriptors[String(numericKey)];
        if (descriptor && NATIVE_HAS_OWN(descriptor, "value")) pushArray2(children2, {
          source: descriptor.value,
          path: `${path4}/${numericKey}`,
          assign(value) {
            NATIVE_DEFINE_PROPERTY4(target2, numericKey, {
              value,
              enumerable: true,
              writable: true,
              configurable: true
            });
          }
        });
      }
      for (let position = children2.length - 1; position >= 0; position -= 1) pushArray2(pending, children2[position]);
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      addDiagnostic(diagnostic7("schema", "RECORD_PROTOTYPE_INVALID", path4 || "/", "controlled records must use a plain or null prototype"));
      assign(null);
      continue;
    }
    const keys = sortArray2(NATIVE_REFLECT_OWN_KEYS3(descriptors), (left, right) => compareCodePoints4(
      typeof left === "symbol" ? String(left.description ?? "") : left,
      typeof right === "symbol" ? String(right.description ?? "") : right
    ));
    const target = /* @__PURE__ */ Object.create(null);
    assign(target);
    const children = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key === "symbol") {
        addDiagnostic(diagnostic7("schema", "RECORD_SYMBOL_PROPERTY_INVALID", path4 || "/", "controlled records cannot contain symbol properties"));
        continue;
      }
      const descriptor = descriptors[key];
      const childPath = `${path4}/${pointerPart3(key)}`;
      if (!descriptor || !NATIVE_HAS_OWN(descriptor, "value")) addDiagnostic(diagnostic7(
        "schema",
        "ACCESSOR_NOT_ALLOWED",
        childPath,
        "controlled input must use own data properties"
      ));
      else pushArray2(children, {
        source: descriptor.value,
        path: childPath,
        assign(value) {
          NATIVE_DEFINE_PROPERTY4(target, key, { value, enumerable: true, writable: true, configurable: true });
        }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) pushArray2(pending, children[index]);
  }
  if (overflow) pushArray2(diagnostics, diagnostic7(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT3} entries`
  ));
  return { snapshot, diagnostics: finalizeDiagnostics3(diagnostics) };
}
function isRecord3(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function records(value) {
  return Array.isArray(value) ? (
    /** @type {Record<string, unknown>[]} */
    filterArray3(value, isRecord3)
  ) : [];
}
function strings(value) {
  return Array.isArray(value) ? (
    /** @type {string[]} */
    filterArray3(value, (item) => typeof item === "string")
  ) : [];
}
function requireClosed(value, allowed, path4, diagnostics, code2) {
  const allowedKeys = new Set(allowed);
  for (const key of sortArray2(Object.keys(value), compareCodePoints4)) if (!allowedKeys.has(key)) pushArray2(diagnostics, diagnostic7(
    "schema",
    code2,
    `${path4}/${pointerPart3(key)}`,
    "property is outside the closed Task 10 contract"
  ));
  for (const key of allowed) if (!Object.hasOwn(value, key)) pushArray2(diagnostics, diagnostic7(
    "schema",
    "CONTEXT_PROPERTY_MISSING",
    `${path4}/${pointerPart3(key)}`,
    "required Task 10 context property is missing"
  ));
}
function canonicalStrings(value, path4, diagnostics, nonempty = false) {
  if (!Array.isArray(value) || nonempty && value.length === 0) {
    pushArray2(diagnostics, diagnostic7("schema", "STRING_ARRAY_INVALID", path4, "value must be a dense canonical string array"));
    return [];
  }
  const output = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || typeof value[index] !== "string" || value[index].length === 0 || value[index] !== value[index].trim() || seen.has(value[index])) {
      pushArray2(diagnostics, diagnostic7("schema", "STRING_ARRAY_INVALID", `${path4}/${index}`, "value must be a dense unique nonpadded string array"));
      continue;
    }
    seen.add(value[index]);
    pushArray2(output, value[index]);
  }
  return sortArray2(output, compareCodePoints4);
}
function normalizeContext(submittedContext) {
  const captured = snapshotControlled3(submittedContext);
  const diagnostics = [...captured.diagnostics];
  submittedContext = captured.snapshot;
  if (!isRecord3(submittedContext)) throw new BundleReconciliationError([
    ...diagnostics,
    diagnostic7("schema", "CONTEXT_INVALID", "/", "Task 10 context must be a closed own-data record")
  ]);
  requireClosed(submittedContext, CONTEXT_KEYS, "", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  if (submittedContext.schema_version !== "1.0.0") pushArray2(diagnostics, diagnostic7(
    "schema",
    "SCHEMA_VERSION_INVALID",
    "/schema_version",
    "Task 10 requires schema version 1.0.0"
  ));
  if (!Number.isSafeInteger(submittedContext.source_revision) || Number(submittedContext.source_revision) < 0) pushArray2(diagnostics, diagnostic7(
    "schema",
    "SOURCE_REVISION_INVALID",
    "/source_revision",
    "source revision must be a nonnegative safe integer"
  ));
  if (typeof submittedContext.compiler_version !== "string" || submittedContext.compiler_version.trim().length === 0 || submittedContext.compiler_version !== submittedContext.compiler_version.trim()) pushArray2(diagnostics, diagnostic7(
    "schema",
    "COMPILER_VERSION_INVALID",
    "/compiler_version",
    "compiler version must be nonblank and nonpadded"
  ));
  const lineage = isRecord3(submittedContext.lineage) ? submittedContext.lineage : {};
  requireClosed(lineage, ["source_digest", "case_draft_digest"], "/lineage", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  for (const key of ["source_digest", "case_draft_digest"]) if (typeof lineage[key] !== "string" || !/^[a-f0-9]{64}$/u.test(lineage[key])) pushArray2(diagnostics, diagnostic7("schema", "LINEAGE_DIGEST_INVALID", `/lineage/${key}`, "lineage digest must be lowercase SHA-256 hexadecimal"));
  const obligations = isRecord3(submittedContext.obligations_artifact) ? submittedContext.obligations_artifact : {};
  pushArray2(diagnostics, .../** @type {Diagnostic[]} */
  validateAgainstSchema(obligations, test_obligations_schema_default));
  const evidenceClaims = isRecord3(submittedContext.evidence_claims) ? submittedContext.evidence_claims : {};
  pushArray2(diagnostics, .../** @type {Diagnostic[]} */
  validateAgainstSchema(evidenceClaims, evidence_claims_schema_default));
  const classification = isRecord3(submittedContext.classification) ? submittedContext.classification : {};
  requireClosed(classification, CLASSIFICATION_KEYS, "/classification", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  const clarification = isRecord3(submittedContext.clarification) ? submittedContext.clarification : {};
  requireClosed(clarification, CLARIFICATION_KEYS, "/clarification", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  const revision = Number(submittedContext.source_revision);
  if (evidenceClaims.source_revision !== revision || obligations.source_revision !== revision || clarification.source_revision !== revision) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "SOURCE_REVISION_MISMATCH",
    "/source_revision",
    "Task 7, Task 9, and Task 10 must identify one source revision"
  ));
  if (clarification.action !== "deliver") pushArray2(diagnostics, diagnostic7(
    "classification",
    "CLARIFICATION_NOT_DELIVERABLE",
    "/clarification/action",
    "coverage may run only after clarification chooses delivery"
  ));
  if (!Array.isArray(classification.diagnostics) || classification.diagnostics.length > 0 || !Array.isArray(clarification.diagnostics) || clarification.diagnostics.length > 0) pushArray2(diagnostics, diagnostic7(
    "classification",
    "UPSTREAM_DIAGNOSTICS_UNRESOLVED",
    "/",
    "coverage cannot reconcile an upstream result with diagnostics"
  ));
  const limits = canonicalStrings(submittedContext.limits, "/limits", diagnostics, true);
  const expertLimits = canonicalStrings(submittedContext.expert_recall_limits, "/expert_recall_limits", diagnostics, true);
  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  return {
    sourceRevision: revision,
    compilerVersion: String(submittedContext.compiler_version),
    lineage: { source_digest: String(lineage.source_digest), case_draft_digest: String(lineage.case_draft_digest) },
    evidenceClaims,
    obligations,
    classification,
    clarification,
    limits,
    expertLimits
  };
}
function caseExpectations(caseDraft) {
  const expectations = [];
  for (const step of records(caseDraft.steps)) for (const expectation of records(step.expectations)) pushArray2(expectations, expectation);
  return expectations;
}
function sameStrings(left, right) {
  return canonicalStringify(sortArray2([...left], compareCodePoints4)) === canonicalStringify(sortArray2([...right], compareCodePoints4));
}
function normalizeSemanticString2(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
function canonicalSetProjection2(entries) {
  const byCanonicalValue = /* @__PURE__ */ new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    byCanonicalValue.set(canonicalStringify(entry), entry);
  }
  const ordered = sortArray2([...byCanonicalValue], ([left], [right]) => compareCodePoints4(left, right));
  const projected = [];
  for (let index = 0; index < ordered.length; index += 1) pushArray2(projected, ordered[index][1]);
  return canonicalStringify(projected);
}
function derivedExecutionSignature(caseDraft) {
  const preconditions = records(caseDraft.preconditions);
  const preconditionProjection = [];
  for (let index = 0; index < preconditions.length; index += 1) pushArray2(preconditionProjection, {
    condition: normalizeSemanticString2(preconditions[index].condition),
    reachable_from: normalizeSemanticString2(preconditions[index].reachable_from)
  });
  const data = records(caseDraft.data);
  const dataProjection = [];
  for (let index = 0; index < data.length; index += 1) pushArray2(dataProjection, {
    name: normalizeSemanticString2(data[index].name),
    value: normalizeSemanticString2(data[index].value)
  });
  const actionPath = [];
  const oracleRefs = /* @__PURE__ */ new Set();
  const steps = records(caseDraft.steps);
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    pushArray2(actionPath, normalizeSemanticString2(steps[stepIndex].action));
    const expectations = records(steps[stepIndex].expectations);
    for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
      oracleRefs.add(normalizeSemanticString2(expectations[expectationIndex].expectation_id));
    }
  }
  return {
    role: isRecord3(caseDraft.role) ? normalizeSemanticString2(caseDraft.role.value) : "",
    precondition_state: canonicalSetProjection2(preconditionProjection),
    data_partition: canonicalSetProjection2(dataProjection),
    action_path: actionPath,
    oracle_refs: sortArray2([...oracleRefs], compareCodePoints4)
  };
}
function buildEvidenceGraph(claimsById, diagnostics) {
  const parentsByClaim = /* @__PURE__ */ new Map();
  const childrenByClaim = /* @__PURE__ */ new Map();
  const indegree = /* @__PURE__ */ new Map();
  let forest = true;
  for (const claimId of claimsById.keys()) {
    parentsByClaim.set(claimId, []);
    childrenByClaim.set(claimId, []);
    indegree.set(claimId, 0);
  }
  for (const [claimId, claim] of claimsById) for (const parentId of strings(claim.parent_claim_ids)) {
    if (!claimsById.has(parentId)) {
      pushArray2(diagnostics, diagnostic7(
        "reference",
        "EVIDENCE_PARENT_UNKNOWN",
        `/evidence_claims/claims/${pointerPart3(claimId)}/parent_claim_ids/${pointerPart3(parentId)}`,
        "accepted evidence ancestry references an unknown parent"
      ));
      continue;
    }
    const parents = parentsByClaim.get(claimId);
    const children = childrenByClaim.get(parentId);
    if (parents) pushArray2(parents, parentId);
    if (children) pushArray2(children, claimId);
    indegree.set(claimId, (indegree.get(claimId) ?? 0) + 1);
    if ((indegree.get(claimId) ?? 0) > 1) forest = false;
  }
  const queue = [];
  for (const [claimId, degree] of indegree) if (degree === 0) pushArray2(queue, claimId);
  sortArray2(queue, compareCodePoints4);
  let cursor = 0;
  while (cursor < queue.length) {
    const claimId = (
      /** @type {string} */
      queue[cursor]
    );
    cursor += 1;
    const children = (
      /** @type {string[]} */
      childrenByClaim.get(claimId) ?? []
    );
    sortArray2(children, compareCodePoints4);
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const childId = (
        /** @type {string} */
        children[childIndex]
      );
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) pushArray2(queue, childId);
    }
  }
  if (cursor !== claimsById.size) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "EVIDENCE_ANCESTRY_INVALID",
    "/evidence_claims/claims",
    "accepted evidence ancestry must be an acyclic closed graph"
  ));
  if (cursor !== claimsById.size) forest = false;
  const componentByClaim = /* @__PURE__ */ new Map();
  let component = 0;
  for (const claimId of sortArray2([...claimsById.keys()], compareCodePoints4)) {
    if (componentByClaim.has(claimId)) continue;
    const pending = [claimId];
    componentByClaim.set(claimId, component);
    let position = 0;
    while (position < pending.length) {
      const current = pending[position];
      position += 1;
      const neighbors = sortArray2(
        [...parentsByClaim.get(current) ?? [], ...childrenByClaim.get(current) ?? []],
        compareCodePoints4
      );
      for (const neighbor of neighbors) if (!componentByClaim.has(neighbor)) {
        componentByClaim.set(neighbor, component);
        pushArray2(pending, neighbor);
      }
    }
    component += 1;
  }
  const entryByClaim = /* @__PURE__ */ new Map();
  const exitByClaim = /* @__PURE__ */ new Map();
  const topologicalIndexByClaim = /* @__PURE__ */ new Map();
  for (let index = 0; index < cursor; index += 1) topologicalIndexByClaim.set(queue[index], index);
  const componentForestById = /* @__PURE__ */ new Map();
  for (const componentId of componentByClaim.values()) componentForestById.set(componentId, true);
  for (const claimId of claimsById.keys()) {
    const componentId = componentByClaim.get(claimId);
    if ((parentsByClaim.get(claimId)?.length ?? 0) > 1 || !topologicalIndexByClaim.has(claimId)) {
      componentForestById.set(componentId, false);
    }
  }
  const MULTIPLE_DOWNGRADE_ROOTS = /* @__PURE__ */ Symbol("multiple-downgrade-roots");
  const downgradeSummaryByClaim = /* @__PURE__ */ new Map();
  for (let index = 0; index < cursor; index += 1) {
    const claimId = queue[index];
    let summary = claimsById.get(claimId)?.level === "E1" ? claimId : null;
    const parents = parentsByClaim.get(claimId) ?? [];
    for (let parentIndex = 0; parentIndex < parents.length; parentIndex += 1) {
      const parentSummary = downgradeSummaryByClaim.get(parents[parentIndex]) ?? null;
      if (summary === MULTIPLE_DOWNGRADE_ROOTS || parentSummary === MULTIPLE_DOWNGRADE_ROOTS) {
        summary = MULTIPLE_DOWNGRADE_ROOTS;
      } else if (typeof parentSummary === "string") {
        if (typeof summary === "string" && summary !== parentSummary) summary = MULTIPLE_DOWNGRADE_ROOTS;
        else summary = parentSummary;
      }
    }
    downgradeSummaryByClaim.set(claimId, summary);
  }
  let time = 0;
  const roots = sortArray2(filterArray3(
    [...claimsById.keys()],
    (claimId) => (parentsByClaim.get(claimId)?.length ?? 0) === 0 && componentForestById.get(componentByClaim.get(claimId)) === true
  ), compareCodePoints4);
  for (const root of roots) {
    const pending = [{ claimId: root, exit: false }];
    while (pending.length > 0) {
      const item = (
        /** @type {{claimId:string,exit:boolean}} */
        Reflect.apply(NATIVE_ARRAY_POP2, pending, [])
      );
      if (item.exit) {
        exitByClaim.set(item.claimId, time - 1);
        continue;
      }
      entryByClaim.set(item.claimId, time);
      time += 1;
      pushArray2(pending, { claimId: item.claimId, exit: true });
      const children = childrenByClaim.get(item.claimId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) pushArray2(pending, { claimId: children[index], exit: false });
    }
  }
  return {
    claimsById,
    parentsByClaim,
    childrenByClaim,
    componentByClaim,
    componentForestById,
    entryByClaim,
    exitByClaim,
    topologicalIndexByClaim,
    downgradeSummaryByClaim,
    multipleDowngradeRoots: MULTIPLE_DOWNGRADE_ROOTS,
    forest
  };
}
function isEvidenceAncestor(ancestor, descendant, graph) {
  if (ancestor === descendant) return graph.claimsById.has(ancestor);
  if (!graph.claimsById.has(ancestor) || !graph.claimsById.has(descendant) || graph.componentByClaim.get(ancestor) !== graph.componentByClaim.get(descendant)) return false;
  const componentId = graph.componentByClaim.get(ancestor);
  if (graph.componentForestById.get(componentId) === true) {
    const ancestorEntry = graph.entryByClaim.get(ancestor);
    const descendantEntry = graph.entryByClaim.get(descendant);
    return ancestorEntry !== void 0 && descendantEntry !== void 0 && ancestorEntry <= descendantEntry && descendantEntry <= (graph.exitByClaim.get(ancestor) ?? -1);
  }
  if ((graph.topologicalIndexByClaim.get(ancestor) ?? Number.MAX_SAFE_INTEGER) >= (graph.topologicalIndexByClaim.get(descendant) ?? -1)) return false;
  const pending = [descendant];
  const visited = /* @__PURE__ */ new Set();
  let found = false;
  while (pending.length > 0 && !found) {
    const claimId = (
      /** @type {string} */
      Reflect.apply(NATIVE_ARRAY_POP2, pending, [])
    );
    if (claimId === ancestor) {
      found = true;
      break;
    }
    if (visited.has(claimId)) continue;
    visited.add(claimId);
    const parents = graph.parentsByClaim.get(claimId) ?? [];
    for (let index = parents.length - 1; index >= 0; index -= 1) pushArray2(pending, parents[index]);
  }
  return found;
}
function isEvidenceRelated(left, right, graph) {
  return isEvidenceAncestor(left, right, graph) || isEvidenceAncestor(right, left, graph);
}
function lowerBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
function evidenceRelationIndex(roots, graph) {
  const forestByComponent = /* @__PURE__ */ new Map();
  const generalRootsByComponent = /* @__PURE__ */ new Map();
  for (const root of roots) {
    const componentId = graph.componentByClaim.get(root);
    if (componentId === void 0) continue;
    if (graph.componentForestById.get(componentId) === true) {
      const start = graph.entryByClaim.get(root);
      const end = graph.exitByClaim.get(root);
      if (start === void 0 || end === void 0) continue;
      const component = forestByComponent.get(componentId) ?? { positions: [], intervals: [] };
      pushArray2(component.positions, start);
      pushArray2(component.intervals, { start, end });
      forestByComponent.set(componentId, component);
    } else {
      const component = generalRootsByComponent.get(componentId) ?? /* @__PURE__ */ new Set();
      component.add(root);
      generalRootsByComponent.set(componentId, component);
    }
  }
  for (const component of forestByComponent.values()) {
    sortArray2(component.positions, (left, right) => left - right);
    sortArray2(component.intervals, (left, right) => left.start - right.start || right.end - left.end);
    const merged = [];
    for (let index = 0; index < component.intervals.length; index += 1) {
      const interval = component.intervals[index];
      const previous = merged[merged.length - 1];
      if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else pushArray2(merged, { ...interval });
    }
    component.intervals = merged;
  }
  return {
    /** @param {string} claimId */
    has(claimId) {
      const componentId = graph.componentByClaim.get(claimId);
      if (componentId === void 0) return false;
      const generalRoots = generalRootsByComponent.get(componentId);
      if (generalRoots) {
        if (generalRoots.has(claimId)) return true;
        for (const root of generalRoots) if (isEvidenceRelated(root, claimId, graph)) return true;
        return false;
      }
      const forest = forestByComponent.get(componentId);
      const start = graph.entryByClaim.get(claimId);
      const end = graph.exitByClaim.get(claimId);
      if (!forest || start === void 0 || end === void 0) return false;
      const rootAtOrAfter = lowerBound(forest.positions, start);
      if (rootAtOrAfter < forest.positions.length && forest.positions[rootAtOrAfter] <= end) return true;
      let low = 0;
      let high = forest.intervals.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (forest.intervals[middle].start <= start) low = middle + 1;
        else high = middle;
      }
      return low > 0 && forest.intervals[low - 1].end >= start;
    }
  };
}
function fenwick(size) {
  const tree = fillArray(new Array(size + 1), 0);
  return {
    /** @param {number} index @param {number} delta */
    add(index, delta) {
      for (let cursor = index + 1; cursor < tree.length; cursor += cursor & -cursor) tree[cursor] += delta;
    },
    /** @param {number} end */
    sum(end) {
      let total = 0;
      for (let cursor = end; cursor > 0; cursor -= cursor & -cursor) total += tree[cursor];
      return total;
    },
    /** @param {number} target */
    lowerBound(target) {
      let index = 0;
      let step = 1;
      while (step * 2 < tree.length) step *= 2;
      for (; step > 0; step = Math.floor(step / 2)) {
        const next = index + step;
        if (next < tree.length && tree[next] < target) {
          index = next;
          target -= tree[next];
        }
      }
      return index;
    }
  };
}
function matchForestOracleOwnership(requirements, expectations, graph) {
  const anchors = [];
  for (const requirement of requirements) {
    if (requirement.required.length === 0) return false;
    let anchor = requirement.required[0];
    for (let index = 1; index < requirement.required.length; index += 1) {
      const candidate = requirement.required[index];
      if (isEvidenceAncestor(anchor, candidate, graph)) anchor = candidate;
      else if (!isEvidenceAncestor(candidate, anchor, graph)) return null;
    }
    const start = graph.entryByClaim.get(anchor);
    const end = graph.exitByClaim.get(anchor);
    if (start === void 0 || end === void 0) return false;
    pushArray2(anchors, { start, end });
  }
  sortArray2(anchors, (left, right) => right.start - left.start || left.end - right.end);
  const positions = [];
  for (const expectation of expectations) {
    const position = graph.entryByClaim.get(expectation.evidenceRef);
    if (position !== void 0) pushArray2(positions, position);
  }
  sortArray2(positions, (left, right) => left - right);
  const capacity = fenwick(positions.length);
  for (let index = 0; index < positions.length; index += 1) capacity.add(index, 1);
  const localBoundary = (target, after) => {
    let low = 0;
    let high = positions.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (positions[middle] < target || after && positions[middle] === target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (const anchor of anchors) {
    const start = localBoundary(anchor.start, false);
    const end = localBoundary(anchor.end, true);
    const before = capacity.sum(start);
    if (capacity.sum(end) === before) return false;
    const position = capacity.lowerBound(before + 1);
    capacity.add(position, -1);
  }
  return true;
}
function matchGeneralOracleOwnership(requirements, expectations, graph) {
  const matchedRequirementByExpectation = fillArray(new Array(expectations.length), -1);
  const matchedExpectationByRequirement = fillArray(new Array(requirements.length), -1);
  const expectationsByClaim = /* @__PURE__ */ new Map();
  for (let index = 0; index < expectations.length; index += 1) {
    const claimId = expectations[index].evidenceRef;
    const atClaim = expectationsByClaim.get(claimId) ?? [];
    pushArray2(atClaim, index);
    expectationsByClaim.set(claimId, atClaim);
  }
  const anchorByRequirement = [];
  const requiredRootsByRequirement = [];
  const requiredSignatureByRequirement = [];
  for (const requirement of requirements) {
    if (requirement.required.length === 0 || someArray2(requirement.required, (root) => !graph.claimsById.has(root))) return false;
    let anchor = requirement.required[0];
    for (let index = 1; index < requirement.required.length; index += 1) {
      const candidate = requirement.required[index];
      if ((graph.topologicalIndexByClaim.get(candidate) ?? -1) > (graph.topologicalIndexByClaim.get(anchor) ?? -1)) anchor = candidate;
    }
    pushArray2(anchorByRequirement, anchor);
    const roots = new Set(requirement.required);
    pushArray2(requiredRootsByRequirement, roots);
    pushArray2(requiredSignatureByRequirement, canonicalStringify(sortArray2([...roots], compareCodePoints4)));
  }
  const requirementOrder = sortArray2(mapArray3(requirements, (_, index) => index), (left, right) => (graph.topologicalIndexByClaim.get(anchorByRequirement[right]) ?? -1) - (graph.topologicalIndexByClaim.get(anchorByRequirement[left]) ?? -1) || left - right);
  let lastCompatibilitySignature = "";
  let lastCompatibilityRepresentative = "";
  let lastCompatibilityResult = false;
  const compatible = (requirementIndex, claimId) => {
    const requiredRoots = requiredRootsByRequirement[requirementIndex];
    if (requiredRoots.size === 1) return true;
    let representative = claimId;
    let climbBudget = graph.claimsById.size;
    while (!requiredRoots.has(representative) && climbBudget > 0) {
      climbBudget -= 1;
      const parents = graph.parentsByClaim.get(representative) ?? [];
      if (parents.length !== 1) break;
      representative = parents[0];
    }
    const signature = requiredSignatureByRequirement[requirementIndex];
    if (signature === lastCompatibilitySignature && representative === lastCompatibilityRepresentative) {
      return lastCompatibilityResult;
    }
    const pending = [representative];
    const visited = /* @__PURE__ */ new Set();
    let found = 0;
    while (pending.length > 0 && found < requiredRoots.size) {
      const current = (
        /** @type {string} */
        Reflect.apply(NATIVE_ARRAY_POP2, pending, [])
      );
      if (visited.has(current)) continue;
      visited.add(current);
      if (requiredRoots.has(current)) found += 1;
      const parents = graph.parentsByClaim.get(current) ?? [];
      for (let index = parents.length - 1; index >= 0; index -= 1) pushArray2(pending, parents[index]);
    }
    lastCompatibilitySignature = signature;
    lastCompatibilityRepresentative = representative;
    lastCompatibilityResult = found === requiredRoots.size;
    return lastCompatibilityResult;
  };
  for (const start of requirementOrder) {
    const seenRequirements = /* @__PURE__ */ new Set([start]);
    const seenExpectations = /* @__PURE__ */ new Set();
    const parentRequirementByExpectation = fillArray(new Array(expectations.length), -1);
    const queue = [start];
    let cursor = 0;
    let freeExpectation = -1;
    while (cursor < queue.length && freeExpectation < 0) {
      const requirementIndex = queue[cursor];
      cursor += 1;
      const pendingClaims = [anchorByRequirement[requirementIndex]];
      const seenClaims = /* @__PURE__ */ new Set();
      let claimCursor = 0;
      while (claimCursor < pendingClaims.length && freeExpectation < 0) {
        const claimId = pendingClaims[claimCursor];
        claimCursor += 1;
        if (seenClaims.has(claimId)) continue;
        seenClaims.add(claimId);
        const atClaim = expectationsByClaim.get(claimId) ?? [];
        if (atClaim.length > 0 && compatible(requirementIndex, claimId)) {
          for (let offset = 0; offset < atClaim.length; offset += 1) {
            const expectationIndex2 = atClaim[offset];
            if (seenExpectations.has(expectationIndex2)) continue;
            seenExpectations.add(expectationIndex2);
            parentRequirementByExpectation[expectationIndex2] = requirementIndex;
            const matched = matchedRequirementByExpectation[expectationIndex2];
            if (matched < 0) {
              freeExpectation = expectationIndex2;
              break;
            }
            if (!seenRequirements.has(matched)) {
              seenRequirements.add(matched);
              pushArray2(queue, matched);
            }
          }
        }
        const children = graph.childrenByClaim.get(claimId) ?? [];
        for (let childIndex = 0; childIndex < children.length; childIndex += 1) pushArray2(pendingClaims, children[childIndex]);
      }
    }
    if (freeExpectation < 0) return false;
    let expectationIndex = freeExpectation;
    while (expectationIndex >= 0) {
      const requirementIndex = parentRequirementByExpectation[expectationIndex];
      const previousExpectation = matchedExpectationByRequirement[requirementIndex];
      matchedExpectationByRequirement[requirementIndex] = expectationIndex;
      matchedRequirementByExpectation[expectationIndex] = requirementIndex;
      expectationIndex = previousExpectation;
    }
  }
  return true;
}
function hasCompleteOracleOwnership(requirements, expectations, graph) {
  if (requirements.length > expectations.length) return false;
  const byComponent = /* @__PURE__ */ new Map();
  for (let requirementIndex = 0; requirementIndex < requirements.length; requirementIndex += 1) {
    const roots = requirements[requirementIndex].required;
    if (roots.length === 0) return false;
    let requiredComponent;
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      const componentId = graph.componentByClaim.get(roots[rootIndex]);
      if (componentId === void 0) return false;
      if (requiredComponent === void 0) requiredComponent = componentId;
      else if (requiredComponent !== componentId) return false;
    }
    const component = byComponent.get(
      /** @type {number} */
      requiredComponent
    ) ?? { requirements: [], expectations: [] };
    pushArray2(component.requirements, requirements[requirementIndex]);
    byComponent.set(
      /** @type {number} */
      requiredComponent,
      component
    );
  }
  for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
    const componentId = graph.componentByClaim.get(expectations[expectationIndex].evidenceRef);
    if (componentId === void 0) continue;
    const component = byComponent.get(componentId);
    if (component) pushArray2(component.expectations, expectations[expectationIndex]);
  }
  for (const [componentId, component] of byComponent) {
    if (component.requirements.length > component.expectations.length) return false;
    if (graph.componentForestById.get(componentId) === true) {
      const forestResult = matchForestOracleOwnership(component.requirements, component.expectations, graph);
      if (forestResult === false) return false;
      if (forestResult === null && !matchGeneralOracleOwnership(component.requirements, component.expectations, graph)) return false;
    } else if (!matchGeneralOracleOwnership(component.requirements, component.expectations, graph)) return false;
  }
  return true;
}
function caseDirectEvidence(caseDraft, obligations, factsById, includeAssumption = true) {
  const direct = /* @__PURE__ */ new Set();
  const add = (value) => {
    if (typeof value === "string" && value.length > 0) direct.add(value);
  };
  if (isRecord3(caseDraft.role)) add(caseDraft.role.evidence_ref);
  for (const ref of strings(caseDraft.source_claim_ids)) add(ref);
  for (const factId of strings(caseDraft.fact_ids)) {
    const fact = factsById.get(factId);
    if (!fact) continue;
    add(fact.claim_id);
    for (const ref of strings(fact.source_claim_ids)) add(ref);
  }
  for (const obligation of obligations) {
    for (const ref of strings(obligation.source_claim_ids)) add(ref);
    for (const ref of strings(obligation.required_oracle_refs)) add(ref);
  }
  for (const precondition of records(caseDraft.preconditions)) {
    add(precondition.evidence_ref);
    for (const ref of strings(precondition.source_claim_ids)) add(ref);
  }
  for (const datum of records(caseDraft.data)) if (isRecord3(datum.provenance)) add(datum.provenance.ref);
  for (const step of records(caseDraft.steps)) {
    add(step.action_evidence_ref);
    for (const expectation of records(step.expectations)) add(expectation.evidence_ref);
  }
  if (isRecord3(caseDraft.testability_profile)) {
    for (const capability of records(caseDraft.testability_profile.capabilities)) add(capability.provenance_ref);
    for (const observer of records(caseDraft.testability_profile.observers)) add(observer.provenance_ref);
    for (const control of records(caseDraft.testability_profile.controls)) add(control.provenance_ref);
  }
  if (isRecord3(caseDraft.post_state)) add(caseDraft.post_state.evidence_ref);
  if (isRecord3(caseDraft.cleanup)) {
    if (caseDraft.cleanup.required === true) add(caseDraft.cleanup.evidence_ref);
    else if (caseDraft.cleanup.required === false) add(caseDraft.cleanup.no_cleanup_evidence_ref);
  }
  if (includeAssumption && isRecord3(caseDraft.temporary_assumption)) add(caseDraft.temporary_assumption.claim_id);
  return sortArray2([...direct], compareCodePoints4);
}
function validateCaseAssumption(caseDraft, lane, obligations, factsById, graph, path4, diagnostics) {
  const assumption = isRecord3(caseDraft.temporary_assumption) ? caseDraft.temporary_assumption : null;
  if (lane === "grounded" && assumption) pushArray2(diagnostics, diagnostic7(
    "classification",
    "CASE_TEMPORARY_ASSUMPTION_UNEXPECTED",
    `${path4}/temporary_assumption`,
    "Grounded Cases cannot carry a temporary assumption"
  ));
  const structuredRoots = /* @__PURE__ */ new Set();
  if (isRecord3(caseDraft.testability_profile)) {
    for (const field of ["capabilities", "observers", "controls"]) {
      for (const item of records(caseDraft.testability_profile[field])) {
        if (item.status === "approved-assumption" && typeof item.provenance_ref === "string") {
          structuredRoots.add(item.provenance_ref);
        }
      }
    }
  }
  const supportingRoots = caseDirectEvidence(caseDraft, obligations, factsById, false);
  const downgradeRoots = new Set(structuredRoots);
  let downgradeAmbiguous = false;
  for (let index = 0; index < supportingRoots.length; index += 1) {
    const summary = graph.downgradeSummaryByClaim.get(supportingRoots[index]);
    if (summary === graph.multipleDowngradeRoots) downgradeAmbiguous = true;
    else if (typeof summary === "string") downgradeRoots.add(summary);
  }
  const supportRecords = [];
  if (isRecord3(caseDraft.role)) pushArray2(supportRecords, caseDraft.role);
  pushArray2(supportRecords, ...records(caseDraft.preconditions), ...records(caseDraft.data));
  for (const step of records(caseDraft.steps)) {
    pushArray2(supportRecords, step, ...records(step.expectations));
  }
  if (isRecord3(caseDraft.post_state)) pushArray2(supportRecords, caseDraft.post_state);
  if (isRecord3(caseDraft.cleanup)) pushArray2(supportRecords, caseDraft.cleanup);
  for (const item of supportRecords) if (item.support_review !== "supported") pushArray2(diagnostics, diagnostic7(
    "classification",
    "CASE_SUPPORT_REVIEW_INVALID",
    path4,
    "executable Case evidence must have supported support reviews"
  ));
  if (lane === "grounded") {
    if (downgradeAmbiguous || downgradeRoots.size > 0) pushArray2(diagnostics, diagnostic7(
      "classification",
      "CASE_GROUNDED_DOWNGRADE_ROOT_INVALID",
      path4,
      "Grounded Cases cannot depend on E1 or approved-assumption evidence"
    ));
    return;
  }
  if (lane !== "conditional") return;
  const assumptionId = assumption && typeof assumption.claim_id === "string" ? assumption.claim_id : "";
  const assumptionClaim = graph.claimsById.get(assumptionId);
  const invalidationCondition = assumption && typeof assumption.invalidation_condition === "string" ? assumption.invalidation_condition : "";
  if (!assumption || assumptionId.length === 0 || !assumptionClaim || assumptionClaim.level !== "E1" && !structuredRoots.has(assumptionId) || typeof assumptionClaim.scope !== "string" || typeof caseDraft.scope !== "string" || !scopeContains(assumptionClaim.scope, caseDraft.scope) || invalidationCondition.trim().length === 0) pushArray2(diagnostics, diagnostic7(
    "classification",
    "CASE_TEMPORARY_ASSUMPTION_INVALID",
    `${path4}/temporary_assumption`,
    "Conditional temporary assumption must be accepted E1 or approved-assumption evidence covering the Case scope with a nonblank invalidation condition"
  ));
  if (downgradeAmbiguous || downgradeRoots.size > 1) pushArray2(diagnostics, diagnostic7(
    "classification",
    "CASE_DOWNGRADE_ROOTS_AMBIGUOUS",
    path4,
    "frozen Conditional Case schema cannot represent more than one downgrade root"
  ));
  else if (downgradeRoots.size === 0) pushArray2(diagnostics, diagnostic7(
    "classification",
    "CASE_DOWNGRADE_ROOT_MISSING",
    path4,
    "Conditional Case requires exactly one independently derived downgrade root"
  ));
  else if (!downgradeRoots.has(assumptionId)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_TEMPORARY_ASSUMPTION_MISMATCH",
    `${path4}/temporary_assumption/claim_id`,
    "temporary assumption must identify the sole downgrade root derived from actual Case support"
  ));
}
function validateCaseExecutionGates(caseDraft, lane, obligations, graph, path4, diagnostics) {
  const allowedStatuses = lane === "grounded" ? /* @__PURE__ */ new Set(["provided", "verified"]) : /* @__PURE__ */ new Set(["provided", "verified", "approved-assumption"]);
  const steps = records(caseDraft.steps);
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const stepId = typeof step.step_id === "string" ? step.step_id : "";
    const expectations = records(step.expectations);
    for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
      const expectation = expectations[expectationIndex];
      if (expectation.preceding_action_id !== stepId) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "CASE_EXPECTATION_ACTION_MISMATCH",
        `${path4}/steps/${stepIndex}/expectations/${expectationIndex}/preceding_action_id`,
        "expectation preceding_action_id must equal the containing step_id"
      ));
      const oracle = isRecord3(expectation.oracle) ? expectation.oracle : null;
      const expectedField = oracle ? ORACLE_FIELDS2[
        /** @type {keyof typeof ORACLE_FIELDS} */
        oracle.type
      ] : null;
      const comparisonValid = Boolean(oracle) && COMPARISONS2.has(String(oracle?.comparison ?? ""));
      const toleranceValid = !oracle || oracle.tolerance === void 0 || typeof oracle.tolerance === "number" && Number.isFinite(oracle.tolerance) && oracle.tolerance >= 0;
      const windowValid = !oracle || oracle.window === void 0 || typeof oracle.window === "string" && oracle.window.trim().length > 0;
      const expectedValid = Boolean(oracle && expectedField && typeof oracle[expectedField] === "string" && String(oracle[expectedField]).trim().length > 0);
      const withinBounded = !oracle || oracle.comparison !== "within" || oracle.tolerance !== void 0 && toleranceValid || oracle.window !== void 0 && windowValid;
      if (!oracle || !expectedValid || !comparisonValid || !toleranceValid || !windowValid || !withinBounded) {
        pushArray2(diagnostics, diagnostic7(
          "classification",
          "CASE_ORACLE_INVALID",
          `${path4}/steps/${stepIndex}/expectations/${expectationIndex}/oracle`,
          "executable Case Oracle must have one typed expected result, a valid comparison, and bounded within tolerance or window"
        ));
      }
    }
  }
  const profile = isRecord3(caseDraft.testability_profile) ? caseDraft.testability_profile : {};
  const definitions = [
    { field: "capabilities", name: "capability" },
    { field: "observers", name: "observer" },
    { field: "controls", name: "control" }
  ];
  for (let definitionIndex = 0; definitionIndex < definitions.length; definitionIndex += 1) {
    const { field, name } = definitions[definitionIndex];
    const items = records(profile[field]);
    if (items.length === 0) pushArray2(diagnostics, diagnostic7(
      "classification",
      "CASE_TESTABILITY_PROFILE_INCOMPLETE",
      `${path4}/testability_profile/${field}`,
      "every executable Case requires at least one capability, observer, and control"
    ));
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      const itemPath = `${path4}/testability_profile/${field}/${itemIndex}`;
      const value = item[name];
      if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim() || field === "observers" && (typeof item.observation_target !== "string" || item.observation_target.trim().length === 0 || item.observation_target !== item.observation_target.trim())) {
        pushArray2(diagnostics, diagnostic7(
          "classification",
          "CASE_TESTABILITY_FIELD_INVALID",
          itemPath,
          "Testability capability, observer, target, and control names must be nonblank and nonpadded"
        ));
      }
      if (!allowedStatuses.has(String(item.status ?? ""))) pushArray2(diagnostics, diagnostic7(
        "classification",
        "CASE_TESTABILITY_STATUS_INVALID",
        `${itemPath}/status`,
        `${lane} Testability status is outside the executable lane gate`
      ));
      const provenanceRef = item.provenance_ref;
      if (typeof provenanceRef !== "string" || provenanceRef.trim().length === 0 || provenanceRef !== provenanceRef.trim() || !graph.claimsById.has(provenanceRef)) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "CASE_TESTABILITY_PROVENANCE_INVALID",
        `${itemPath}/provenance_ref`,
        "Testability provenance must be a nonblank accepted evidence reference"
      ));
    }
  }
  const capabilities = records(profile.capabilities);
  const providedCapabilities = /* @__PURE__ */ new Set();
  for (let capabilityIndex = 0; capabilityIndex < capabilities.length; capabilityIndex += 1) {
    const capability = capabilities[capabilityIndex];
    if (typeof capability.capability === "string" && allowedStatuses.has(String(capability.status ?? ""))) {
      providedCapabilities.add(capability.capability);
    }
  }
  for (let obligationIndex = 0; obligationIndex < obligations.length; obligationIndex += 1) {
    const obligation = obligations[obligationIndex];
    for (const required of strings(obligation.required_capabilities)) {
      if (!providedCapabilities.has(required)) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "CASE_REQUIRED_CAPABILITY_MISSING",
        `${path4}/obligation_ids/${pointerPart3(String(obligation.obligation_id ?? ""))}`,
        `Case Testability profile must cover required capability ${required}`
      ));
    }
  }
  const observers = records(profile.observers);
  const observationTargetsByObserver = /* @__PURE__ */ new Map();
  for (let observerIndex = 0; observerIndex < observers.length; observerIndex += 1) {
    const observer = observers[observerIndex];
    if (typeof observer.observer !== "string" || typeof observer.observation_target !== "string" || !allowedStatuses.has(String(observer.status ?? ""))) continue;
    const targets = observationTargetsByObserver.get(observer.observer) ?? /* @__PURE__ */ new Set();
    targets.add(observer.observation_target);
    observationTargetsByObserver.set(observer.observer, targets);
  }
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const expectations = records(steps[stepIndex].expectations);
    for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
      const expectation = expectations[expectationIndex];
      if (!observationTargetsByObserver.get(String(expectation.observer ?? ""))?.has(String(expectation.observation_target ?? ""))) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "CASE_EXPECTATION_OBSERVER_MISSING",
        `${path4}/steps/${stepIndex}/expectations/${expectationIndex}`,
        "each expectation requires an executable observer with the same observer and observation_target"
      ));
    }
  }
}
function validateCaseTraceability(caseDraft, lane, obligationsById, routesByFact, factsById, factIdsByObligation, pointsById, evidenceGraph, diagnostics) {
  const caseId = typeof caseDraft.case_id === "string" ? caseDraft.case_id : "invalid";
  const path4 = `/${lane}/${pointerPart3(caseId)}`;
  const factIds = strings(caseDraft.fact_ids);
  const obligationIds = strings(caseDraft.obligation_ids);
  const obligationIdSet = new Set(obligationIds);
  const linkedObligations = [];
  for (const obligationId of obligationIds) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) pushArray2(diagnostics, diagnostic7(
      "reference",
      "CASE_OBLIGATION_UNKNOWN",
      `${path4}/obligation_ids/${pointerPart3(obligationId)}`,
      "Case references an unknown formal Test Point"
    ));
    else {
      pushArray2(linkedObligations, obligation);
      const point = pointsById.get(obligationId);
      if (point?.classification !== lane) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "CASE_DISPOSITION_MISMATCH",
        `${path4}/obligation_ids/${pointerPart3(obligationId)}`,
        "Case lane and final formal disposition must match"
      ));
    }
  }
  for (const factId of factIds) {
    const route = routesByFact.get(factId);
    const fact = factsById.get(factId);
    let routesToCaseObligation = false;
    const routeObligationIds = route?.route_type === "obligations" ? strings(route.obligation_ids) : [];
    for (let routeIndex = 0; routeIndex < routeObligationIds.length; routeIndex += 1) {
      if (obligationIdSet.has(routeObligationIds[routeIndex])) {
        routesToCaseObligation = true;
        break;
      }
    }
    if (!fact) pushArray2(diagnostics, diagnostic7(
      "reference",
      "CASE_FACT_UNKNOWN",
      `${path4}/fact_ids/${pointerPart3(factId)}`,
      "Case references an unknown requirement fact"
    ));
    else if (fact.status !== "active") pushArray2(diagnostics, diagnostic7(
      "classification",
      "CASE_FACT_UNRESOLVED",
      `${path4}/fact_ids/${pointerPart3(factId)}`,
      "executable Cases cannot depend on conflicted or ambiguous normative facts"
    ));
    else if (!route || route.route_type !== "obligations" || !routesToCaseObligation) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "CASE_FACT_TRACE_MISSING",
      `${path4}/fact_ids/${pointerPart3(factId)}`,
      "Case fact must route to one of the Case formal Test Points"
    ));
  }
  const requiredFactIds = /* @__PURE__ */ new Set();
  for (const obligationId of obligationIds) {
    for (const factId of factIdsByObligation.get(obligationId) ?? []) requiredFactIds.add(factId);
  }
  const submittedFactIds = new Set(factIds);
  for (const factId of requiredFactIds) if (!submittedFactIds.has(factId)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_FACT_ROUTE_LINK_MISSING",
    `${path4}/fact_ids/${pointerPart3(factId)}`,
    "every Case must include every normative fact routed to one of its linked formal Test Points"
  ));
  validateCaseExecutionGates(caseDraft, lane, linkedObligations, evidenceGraph, path4, diagnostics);
  validateCaseAssumption(caseDraft, lane, linkedObligations, factsById, evidenceGraph, path4, diagnostics);
  const actualEvidence = caseDirectEvidence(caseDraft, linkedObligations, factsById);
  const submittedEvidence = sortArray2(strings(caseDraft.evidence_refs), compareCodePoints4);
  for (const ref of actualEvidence) {
    const claim = evidenceGraph.claimsById.get(ref);
    if (!claim) pushArray2(diagnostics, diagnostic7(
      "reference",
      "CASE_EVIDENCE_REFERENCE_UNKNOWN",
      `${path4}/evidence_refs/${pointerPart3(ref)}`,
      "every direct Case evidence reference must exist in accepted evidence"
    ));
  }
  if (canonicalStringify(actualEvidence) !== canonicalStringify(submittedEvidence)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_EVIDENCE_SUMMARY_MISMATCH",
    `${path4}/evidence_refs`,
    "Case evidence_refs must exactly summarize all direct evidence roots used by frozen Case fields"
  ));
  const formalRoots = /* @__PURE__ */ new Set();
  for (const obligation of linkedObligations) {
    for (const ref of strings(obligation.source_claim_ids)) formalRoots.add(ref);
    for (const ref of strings(obligation.required_oracle_refs)) formalRoots.add(ref);
  }
  for (const factId of factIds) {
    const fact = factsById.get(factId);
    if (!fact) continue;
    formalRoots.add(String(fact.claim_id ?? ""));
    for (const ref of strings(fact.source_claim_ids)) formalRoots.add(ref);
  }
  for (const ref of strings(caseDraft.source_claim_ids)) if (!someArray2(
    [...formalRoots],
    (root) => isEvidenceAncestor(ref, root, evidenceGraph)
  )) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_SOURCE_CLAIM_OUTSIDE_CLOSURE",
    `${path4}/source_claim_ids/${pointerPart3(ref)}`,
    "Case source_claim_ids must stay inside the linked formal evidence ancestry"
  ));
  const expectations = caseExpectations(caseDraft);
  const expectationIds = strings(mapArray3(expectations, (item) => item.expectation_id));
  const signature = isRecord3(caseDraft.execution_signature) ? caseDraft.execution_signature : {};
  const derivedSignature = derivedExecutionSignature(caseDraft);
  const submittedActions = [];
  const actionPath = strings(signature.action_path);
  for (let index = 0; index < actionPath.length; index += 1) {
    pushArray2(submittedActions, normalizeSemanticString2(actionPath[index]));
  }
  const submittedOracleSet = /* @__PURE__ */ new Set();
  const signatureOracleRefs = strings(signature.oracle_refs);
  for (let index = 0; index < signatureOracleRefs.length; index += 1) {
    submittedOracleSet.add(normalizeSemanticString2(signatureOracleRefs[index]));
  }
  const submittedSignature = {
    role: normalizeSemanticString2(signature.role),
    precondition_state: signature.precondition_state,
    data_partition: signature.data_partition,
    action_path: submittedActions,
    oracle_refs: sortArray2([...submittedOracleSet], compareCodePoints4)
  };
  if (canonicalStringify(submittedSignature) !== canonicalStringify(derivedSignature)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_EXECUTION_SIGNATURE_MISMATCH",
    `${path4}/execution_signature`,
    "execution signature must be derived exactly from role, preconditions, data, ordered actions, and expectation identities"
  ));
  const submittedOracleIds = strings(signature.oracle_refs);
  if (expectations.length < obligationIds.length || expectationIds.length !== expectations.length || new Set(expectationIds).size !== expectationIds.length || !sameStrings(expectationIds, submittedOracleIds)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_ORACLE_TRACE_MISSING",
    `${path4}/execution_signature/oracle_refs`,
    "every covered Test Point requires a distinct independently locatable expectation Oracle"
  ));
  const requirementList = [];
  for (const obligationId of obligationIds) {
    const oracleRoots = sortArray2(strings(obligationsById.get(obligationId)?.required_oracle_refs), compareCodePoints4);
    pushArray2(requirementList, { required: oracleRoots });
  }
  const expectationList = [];
  for (const expectation of expectations) {
    const evidenceRef = String(expectation.evidence_ref ?? "");
    pushArray2(expectationList, { evidenceRef });
  }
  if (!hasCompleteOracleOwnership(requirementList, expectationList, evidenceGraph)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_ORACLE_OWNERSHIP_INCOMPLETE",
    `${path4}/steps`,
    "every linked Test Point must own one distinct concrete expectation covering all required Oracles through accepted ancestry"
  ));
  if (Object.hasOwn(signature, "test_point_ids") && !sameStrings(strings(signature.test_point_ids), obligationIds)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "CASE_TEST_POINT_TRACE_MISMATCH",
    `${path4}/execution_signature/test_point_ids`,
    "Case signature Test Point associations must be exact"
  ));
}
function canonicalRootProjection(root) {
  const riskCounts = isRecord3(root.risk_counts) ? root.risk_counts : {};
  return {
    root_issue_id: String(root.root_issue_id ?? ""),
    root_issue_key: String(root.root_issue_key ?? ""),
    missing_type: String(root.missing_type ?? ""),
    semantic_refs: sortArray2(strings(root.semantic_refs), compareCodePoints4),
    scope: String(root.scope ?? ""),
    affected_obligation_ids: sortArray2(strings(root.affected_obligation_ids), compareCodePoints4),
    risk_counts: {
      critical: Number(riskCounts.critical),
      high: Number(riskCounts.high),
      medium: Number(riskCounts.medium),
      low: Number(riskCounts.low)
    },
    question: String(root.question ?? ""),
    answerable: root.answerable,
    reasons: sortArray2(strings(root.reasons), compareCodePoints4),
    evidence_refs: sortArray2(strings(root.evidence_refs), compareCodePoints4)
  };
}
function validateRootShape(root, path4, current, diagnostics) {
  requireClosed(root, current ? CURRENT_ROOT_KEYS : LEDGER_ROOT_KEYS, path4, diagnostics, "ROOT_LEDGER_PROPERTY_UNKNOWN");
  for (const key of ["root_issue_id", "root_issue_key", "missing_type", "scope", "question"]) {
    if (typeof root[key] !== "string" || root[key].trim().length === 0 || root[key] !== root[key].trim()) pushArray2(diagnostics, diagnostic7(
      "schema",
      "ROOT_LEDGER_FIELD_INVALID",
      `${path4}/${key}`,
      "root ledger identity and recovery text must be nonblank and nonpadded"
    ));
  }
  canonicalStrings(root.semantic_refs, `${path4}/semantic_refs`, diagnostics, true);
  canonicalStrings(root.affected_obligation_ids, `${path4}/affected_obligation_ids`, diagnostics, true);
  canonicalStrings(root.reasons, `${path4}/reasons`, diagnostics, true);
  canonicalStrings(root.evidence_refs, `${path4}/evidence_refs`, diagnostics);
  if (typeof root.answerable !== "boolean" || !current && typeof root.current !== "boolean") pushArray2(diagnostics, diagnostic7(
    "schema",
    "ROOT_LEDGER_FIELD_INVALID",
    path4,
    "root answerability and ledger currency must be booleans"
  ));
  const riskCounts = isRecord3(root.risk_counts) ? root.risk_counts : {};
  requireClosed(riskCounts, ["critical", "high", "medium", "low"], `${path4}/risk_counts`, diagnostics, "ROOT_LEDGER_PROPERTY_UNKNOWN");
  for (const risk of RISKS3) if (!Number.isSafeInteger(riskCounts[risk]) || Number(riskCounts[risk]) < 0) pushArray2(diagnostics, diagnostic7(
    "schema",
    "ROOT_LEDGER_RISK_COUNTS_INVALID",
    `${path4}/risk_counts/${risk}`,
    "root risk counts must be nonnegative safe integers"
  ));
}
function validateRootLedger(roots, ledger, dispositions, sourceRevision, diagnostics) {
  const duplicateLedgerIds = /* @__PURE__ */ new Set();
  const duplicateCurrentIds = /* @__PURE__ */ new Set();
  const duplicateDispositionIds = /* @__PURE__ */ new Set();
  const seenLedgerIds = /* @__PURE__ */ new Set();
  const seenCurrentIds = /* @__PURE__ */ new Set();
  const seenDispositionIds = /* @__PURE__ */ new Set();
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? "");
    if (seenLedgerIds.has(rootId)) duplicateLedgerIds.add(rootId);
    else seenLedgerIds.add(rootId);
  }
  for (const root of roots) {
    const rootId = String(root.root_issue_id ?? "");
    if (seenCurrentIds.has(rootId)) duplicateCurrentIds.add(rootId);
    else seenCurrentIds.add(rootId);
  }
  for (const disposition of dispositions) {
    const rootId = String(disposition.root_issue_id ?? "");
    if (seenDispositionIds.has(rootId)) duplicateDispositionIds.add(rootId);
    else seenDispositionIds.add(rootId);
  }
  for (const rootId of sortArray2([...duplicateLedgerIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "ROOT_LEDGER_ID_DUPLICATE",
    `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}`,
    "root ledger identities must be unique"
  ));
  for (const rootId of sortArray2([...duplicateCurrentIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "ROOT_LEDGER_CURRENT_DUPLICATE",
    `/clarification/root_issues/${pointerPart3(rootId)}`,
    "current root identities must be unique"
  ));
  for (const rootId of sortArray2([...duplicateDispositionIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "ROOT_LEDGER_DISPOSITION_DUPLICATE",
    `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}`,
    "each ledger root requires exactly one lifecycle disposition"
  ));
  if (duplicateLedgerIds.size > 0 || duplicateCurrentIds.size > 0 || duplicateDispositionIds.size > 0) {
    throw new BundleReconciliationError(diagnostics);
  }
  const ledgerById = /* @__PURE__ */ new Map();
  const currentLedgerIds = /* @__PURE__ */ new Set();
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? "");
    validateRootShape(entry, `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}`, false, diagnostics);
    ledgerById.set(rootId, entry);
    if (entry.current === true) currentLedgerIds.add(rootId);
    const semanticRefs2 = sortArray2(strings(entry.semantic_refs), compareCodePoints4);
    const expectedKey = canonicalStringify({
      missing_type: String(entry.missing_type ?? ""),
      scope: String(entry.scope ?? ""),
      semantic_refs: semanticRefs2
    });
    if (entry.root_issue_key !== expectedKey) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "ROOT_LEDGER_KEY_MISMATCH",
      `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}/root_issue_key`,
      "root ledger key must be the canonical semantic identity projection"
    ));
    const expectedId = stableId("root", {
      missing_type: String(entry.missing_type ?? ""),
      semantic_refs: semanticRefs2,
      scope: String(entry.scope ?? "")
    });
    if (rootId !== expectedId) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "ROOT_LEDGER_ID_MISMATCH",
      `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}/root_issue_id`,
      "root ledger identity must derive from its canonical semantic key"
    ));
  }
  const rootsById = /* @__PURE__ */ new Map();
  for (const root of roots) {
    const rootId = String(root.root_issue_id ?? "");
    validateRootShape(root, `/clarification/root_issues/${pointerPart3(rootId)}`, true, diagnostics);
    rootsById.set(rootId, root);
    if (root.source_revision !== sourceRevision) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "ROOT_LEDGER_CURRENT_REVISION_MISMATCH",
      `/clarification/root_issues/${pointerPart3(rootId)}/source_revision`,
      "current root revision must match the immutable Task 10 source revision"
    ));
    const authoritative = ledgerById.get(rootId);
    if (!authoritative || authoritative.current !== true || canonicalStringify(canonicalRootProjection(root)) !== canonicalStringify(canonicalRootProjection(authoritative))) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "ROOT_LEDGER_CURRENT_MISMATCH",
      `/clarification/root_issues/${pointerPart3(rootId)}`,
      "current root must exactly match its authoritative current ledger entry"
    ));
  }
  const rootIds = new Set(rootsById.keys());
  if (currentLedgerIds.size !== rootIds.size || someArray2([...currentLedgerIds], (rootId) => !rootIds.has(rootId))) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "ROOT_LEDGER_CURRENT_SET_MISMATCH",
    "/clarification/state/root_snapshot_ledger",
    "current root issues must exactly equal ledger entries marked current"
  ));
  const dispositionIds = /* @__PURE__ */ new Set();
  const dispositionById = /* @__PURE__ */ new Map();
  for (const disposition of dispositions) {
    const rootId = String(disposition.root_issue_id ?? "");
    requireClosed(disposition, ["root_issue_id", "status"], `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}`, diagnostics, "ROOT_LEDGER_PROPERTY_UNKNOWN");
    dispositionIds.add(rootId);
    dispositionById.set(rootId, String(disposition.status ?? ""));
    if (!ROOT_DISPOSITIONS.has(String(disposition.status ?? ""))) pushArray2(diagnostics, diagnostic7(
      "classification",
      "ROOT_LEDGER_DISPOSITION_INVALID",
      `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}/status`,
      "root lifecycle disposition is outside the frozen Task 9 enumeration"
    ));
    if (!ledgerById.has(rootId)) pushArray2(diagnostics, diagnostic7(
      "reference",
      "ROOT_LEDGER_DISPOSITION_UNKNOWN",
      `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}`,
      "root lifecycle disposition references an unknown ledger identity"
    ));
  }
  for (const rootId of ledgerById.keys()) if (!dispositionIds.has(rootId)) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "ROOT_LEDGER_DISPOSITION_MISSING",
    `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}`,
    "every authoritative root ledger entry requires one lifecycle disposition"
  ));
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? "");
    const status = dispositionById.get(rootId);
    if (entry.current === true && (status === "resolved_final" || status === "resolved_temporary")) pushArray2(diagnostics, diagnostic7(
      "classification",
      "ROOT_LEDGER_DISPOSITION_CURRENT_INVALID",
      `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}`,
      "a current Blocked root cannot simultaneously be resolved"
    ));
    if (entry.current !== true && status === "asked") pushArray2(diagnostics, diagnostic7(
      "classification",
      "ROOT_LEDGER_DISPOSITION_CURRENT_INVALID",
      `/clarification/state/root_issue_dispositions/${pointerPart3(rootId)}`,
      "an asked Blocked root must remain current"
    ));
  }
  const currentByObligationReason = /* @__PURE__ */ new Map();
  const retainedByObligationReason = /* @__PURE__ */ new Map();
  for (const entry of ledger) {
    const status = dispositionById.get(String(entry.root_issue_id ?? ""));
    const target = entry.current === true ? currentByObligationReason : status === "suppressed_unknown" || status === "suppressed_deferred" || status === "open" ? retainedByObligationReason : null;
    if (!target) continue;
    const reasons = strings(entry.reasons);
    const obligationIds = strings(entry.affected_obligation_ids);
    for (let obligationIndex = 0; obligationIndex < obligationIds.length; obligationIndex += 1) {
      for (let reasonIndex = 0; reasonIndex < reasons.length; reasonIndex += 1) {
        const obligationId = obligationIds[obligationIndex];
        const reason = reasons[reasonIndex];
        const byReason = target.get(obligationId) ?? /* @__PURE__ */ new Map();
        const matches = byReason.get(reason) ?? [];
        pushArray2(matches, entry);
        byReason.set(reason, matches);
        target.set(obligationId, byReason);
      }
    }
  }
  return { ledgerById, dispositionById, currentByObligationReason, retainedByObligationReason };
}
function buildBundleTrusted(context) {
  const normalized = normalizeContext(context);
  const diagnostics = [];
  const obligations = records(normalized.obligations.obligations);
  const factRoutes = records(normalized.obligations.fact_routes);
  const allFacts = records(normalized.evidenceClaims.fact_ledger);
  const obligationsById = /* @__PURE__ */ new Map();
  const claimsById = /* @__PURE__ */ new Map();
  const duplicateClaimIds = /* @__PURE__ */ new Set();
  for (const claim of records(normalized.evidenceClaims.claims)) {
    const claimId = String(claim.claim_id ?? "");
    if (claimsById.has(claimId)) duplicateClaimIds.add(claimId);
    else claimsById.set(claimId, claim);
  }
  if (duplicateClaimIds.size > 0) {
    for (const claimId of sortArray2([...duplicateClaimIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "reference",
      "EVIDENCE_CLAIM_DUPLICATE",
      `/evidence_claims/claims/${pointerPart3(claimId)}`,
      "accepted claim IDs must be unique"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  const duplicateFactIds = /* @__PURE__ */ new Set();
  const seenFactIds = /* @__PURE__ */ new Set();
  for (const fact of allFacts) {
    const factId = String(fact.fact_id ?? "");
    if (seenFactIds.has(factId)) duplicateFactIds.add(factId);
    else seenFactIds.add(factId);
  }
  const duplicateObligationIds = /* @__PURE__ */ new Set();
  const seenObligationIds = /* @__PURE__ */ new Set();
  for (const obligation of obligations) {
    const obligationId = String(obligation.obligation_id ?? "");
    if (seenObligationIds.has(obligationId)) duplicateObligationIds.add(obligationId);
    else seenObligationIds.add(obligationId);
  }
  const duplicateRouteFactIds = /* @__PURE__ */ new Set();
  const seenRouteFactIds = /* @__PURE__ */ new Set();
  for (const route of factRoutes) {
    const factId = String(route.fact_id ?? "");
    if (seenRouteFactIds.has(factId)) duplicateRouteFactIds.add(factId);
    else seenRouteFactIds.add(factId);
  }
  if (duplicateFactIds.size > 0 || duplicateObligationIds.size > 0 || duplicateRouteFactIds.size > 0) {
    for (const factId of sortArray2([...duplicateFactIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "REQUIREMENT_FACT_DUPLICATE",
      `/evidence_claims/fact_ledger/${pointerPart3(factId)}`,
      "accepted requirement fact IDs must be unique"
    ));
    for (const obligationId of sortArray2([...duplicateObligationIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_TEST_POINT_DUPLICATE",
      `/obligations/${pointerPart3(obligationId)}`,
      "formal Test Point IDs must be unique"
    ));
    for (const factId of sortArray2([...duplicateRouteFactIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "REQUIREMENT_FACT_ROUTE_DUPLICATE",
      `/fact_routes/${pointerPart3(factId)}`,
      "requirement facts must have exactly one canonical route"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  const allFactsById = /* @__PURE__ */ new Map();
  const factsById = /* @__PURE__ */ new Map();
  const facts = [];
  for (const fact of allFacts) {
    const factId = String(fact.fact_id ?? "");
    if (allFactsById.has(factId)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "REQUIREMENT_FACT_DUPLICATE",
      `/evidence_claims/fact_ledger/${pointerPart3(factId)}`,
      "accepted requirement fact IDs must be unique"
    ));
    else allFactsById.set(factId, fact);
    const claimRefs = [String(fact.claim_id ?? ""), ...strings(fact.source_claim_ids)];
    for (let index = 0; index < claimRefs.length; index += 1) if (!claimsById.has(claimRefs[index])) pushArray2(diagnostics, diagnostic7(
      "reference",
      "REQUIREMENT_FACT_CLAIM_UNKNOWN",
      `/evidence_claims/fact_ledger/${pointerPart3(factId)}`,
      "fact ledger references must exist in accepted evidence"
    ));
    const owningClaim = claimsById.get(String(fact.claim_id ?? ""));
    if (fact.status !== "diagnostic" && (owningClaim?.kind === "requirement" || owningClaim?.kind === "assumption")) {
      pushArray2(facts, fact);
      factsById.set(factId, fact);
    }
  }
  for (const obligation of obligations) {
    const id = String(obligation.obligation_id ?? "");
    if (obligationsById.has(id)) pushArray2(diagnostics, diagnostic7("coverage", "FORMAL_TEST_POINT_DUPLICATE", `/obligations/${pointerPart3(id)}`, "formal Test Point IDs must be unique"));
    else obligationsById.set(id, obligation);
  }
  const routesByFact = /* @__PURE__ */ new Map();
  for (const route of factRoutes) {
    const factId = String(route.fact_id ?? "");
    routesByFact.set(factId, route);
    if (!allFactsById.has(factId)) pushArray2(diagnostics, diagnostic7(
      "reference",
      "FACT_ROUTE_FACT_UNKNOWN",
      `/fact_routes/${pointerPart3(factId)}`,
      "fact route references an unknown accepted requirement fact"
    ));
    else if (!factsById.has(factId)) pushArray2(diagnostics, diagnostic7(
      "classification",
      "FACT_ROUTE_NON_NORMATIVE",
      `/fact_routes/${pointerPart3(factId)}`,
      "Task 7 formal routes may contain only normative requirement or assumption facts"
    ));
    if (route.route_type === "obligations") for (const obligationId of strings(route.obligation_ids)) {
      if (!obligationsById.has(obligationId)) pushArray2(diagnostics, diagnostic7(
        "reference",
        "FACT_ROUTE_OBLIGATION_UNKNOWN",
        `/fact_routes/${pointerPart3(factId)}/obligation_ids/${pointerPart3(obligationId)}`,
        "requirement fact route references an unknown formal Test Point"
      ));
    }
  }
  for (const factId of factsById.keys()) if (!routesByFact.has(factId)) pushArray2(diagnostics, diagnostic7(
    "coverage",
    "REQUIREMENT_FACT_ROUTE_MISSING",
    `/evidence_claims/fact_ledger/${pointerPart3(factId)}`,
    "every accepted requirement fact requires exactly one canonical route"
  ));
  const evidenceGraph = buildEvidenceGraph(claimsById, diagnostics);
  const factRootsByObligation = /* @__PURE__ */ new Map();
  const factIdsByObligation = /* @__PURE__ */ new Map();
  for (const route of factRoutes) if (route.route_type === "obligations") {
    const fact = factsById.get(String(route.fact_id ?? ""));
    if (!fact) continue;
    const roots2 = [String(fact.claim_id ?? ""), ...strings(fact.source_claim_ids)];
    for (const obligationId of strings(route.obligation_ids)) {
      const target = factRootsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      for (const ref of roots2) target.add(ref);
      factRootsByObligation.set(obligationId, target);
      const factIds = factIdsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      factIds.add(String(route.fact_id ?? ""));
      factIdsByObligation.set(obligationId, factIds);
    }
  }
  const formalRootsByObligation = /* @__PURE__ */ new Map();
  for (const obligation of obligations) {
    const obligationId = String(obligation.obligation_id ?? "");
    for (const field of ["source_claim_ids", "required_oracle_refs"]) {
      for (const ref of strings(obligation[field])) if (!claimsById.has(ref)) pushArray2(diagnostics, diagnostic7(
        "reference",
        "FORMAL_EVIDENCE_REFERENCE_UNKNOWN",
        `/obligations/${pointerPart3(obligationId)}/${field}/${pointerPart3(ref)}`,
        "formal Test Point evidence roots must exist in accepted evidence before reconciliation"
      ));
    }
    const roots2 = /* @__PURE__ */ new Set([
      ...strings(obligation.source_claim_ids),
      ...strings(obligation.required_oracle_refs),
      ...factRootsByObligation.get(obligationId) ?? []
    ]);
    formalRootsByObligation.set(obligationId, roots2);
  }
  const semantics = isRecord3(normalized.clarification.semantic_snapshot) ? normalized.clarification.semantic_snapshot : {};
  requireClosed(semantics, ["formal_test_points", "coverage_denominator", "delivery_sections"], "/clarification/semantic_snapshot", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  const points = records(semantics.formal_test_points);
  const duplicatePointIds = /* @__PURE__ */ new Set();
  const seenPointIds = /* @__PURE__ */ new Set();
  for (const point of points) {
    const obligationId = String(point.obligation_id ?? "");
    if (seenPointIds.has(obligationId)) duplicatePointIds.add(obligationId);
    else seenPointIds.add(obligationId);
  }
  if (duplicatePointIds.size > 0) {
    for (const obligationId of sortArray2([...duplicatePointIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_TEST_POINT_DUPLICATE",
      `/clarification/semantic_snapshot/formal_test_points/${pointerPart3(obligationId)}`,
      "formal Test Point must have exactly one disposition"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  const pointsById = /* @__PURE__ */ new Map();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    requireClosed(point, ["obligation_id", "evidence_level", "classification", "blocked_reason"], `/clarification/semantic_snapshot/formal_test_points/${index}`, diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
    const obligationId = typeof point.obligation_id === "string" ? point.obligation_id : "";
    const classification = typeof point.classification === "string" ? point.classification : "";
    pointsById.set(obligationId, point);
    if (!DISPOSITIONS.has(classification)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_DISPOSITION_INVALID",
      `/clarification/semantic_snapshot/formal_test_points/${index}/classification`,
      "formal Test Point disposition is outside the frozen four lanes"
    ));
    const reason = point.blocked_reason;
    if (classification === "blocked" && (typeof reason !== "string" || reason.trim().length === 0 || reason === "uncovered" || reason === "not-evaluated")) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "BLOCKED_REASON_INVALID",
      `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`,
      "Blocked formal Test Point requires a concrete root reason"
    ));
    if (classification !== "blocked" && reason !== null) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "BLOCKED_REASON_UNEXPECTED",
      `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`,
      "only Blocked formal Test Points may carry a reason"
    ));
  }
  for (const obligationId of obligationsById.keys()) if (!pointsById.has(obligationId)) pushArray2(diagnostics, diagnostic7(
    "coverage",
    "FORMAL_TEST_POINT_DISPOSITION_MISSING",
    `/formal/${pointerPart3(obligationId)}`,
    "every formal Test Point requires exactly one final disposition"
  ));
  for (const obligationId of pointsById.keys()) if (!obligationsById.has(obligationId)) pushArray2(diagnostics, diagnostic7(
    "reference",
    "FORMAL_TEST_POINT_UNKNOWN",
    `/formal/${pointerPart3(obligationId)}`,
    "final disposition references an unknown formal Test Point"
  ));
  const delivery = isRecord3(semantics.delivery_sections) ? semantics.delivery_sections : {};
  requireClosed(delivery, ["grounded", "conditional", "blocked", "exploratory", "coverage", "quality"], "/clarification/semantic_snapshot/delivery_sections", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  for (const lane of ["grounded", "conditional", "blocked"]) {
    const expected = mapArray3(
      filterArray3(points, (point) => point.classification === lane),
      (point) => String(point.obligation_id)
    );
    if (!sameStrings(strings(delivery[lane]), expected)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "CLARIFICATION_LANE_MISMATCH",
      `/clarification/semantic_snapshot/delivery_sections/${lane}`,
      "Task 9 delivery lane must exactly project its formal Test Point dispositions"
    ));
  }
  const deliveryCoverage = isRecord3(delivery.coverage) ? delivery.coverage : {};
  requireClosed(deliveryCoverage, ["formal_denominator"], "/clarification/semantic_snapshot/delivery_sections/coverage", diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
  if (semantics.coverage_denominator !== points.length || deliveryCoverage.formal_denominator !== points.length) pushArray2(diagnostics, diagnostic7(
    "coverage",
    "CLARIFICATION_DENOMINATOR_MISMATCH",
    "/clarification/semantic_snapshot/coverage_denominator",
    "Task 9 semantic denominator must exactly account for its formal Test Point snapshot"
  ));
  const baseLanesByObligation = /* @__PURE__ */ new Map();
  const casesById = /* @__PURE__ */ new Map();
  const grounded = [];
  const conditional = [];
  const executableCaseInput = [
    ...records(normalized.classification.grounded),
    ...records(normalized.classification.conditional)
  ];
  const duplicateCaseIds = /* @__PURE__ */ new Set();
  const seenCaseIds = /* @__PURE__ */ new Set();
  for (const caseDraft of executableCaseInput) {
    const caseId = String(caseDraft.case_id ?? "");
    if (seenCaseIds.has(caseId)) duplicateCaseIds.add(caseId);
    else seenCaseIds.add(caseId);
  }
  if (duplicateCaseIds.size > 0) {
    for (const caseId of sortArray2([...duplicateCaseIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "CASE_ID_DUPLICATE",
      `/classification/cases/${pointerPart3(caseId)}`,
      "executable Case IDs must be unique across lanes"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  pushArray2(diagnostics, .../** @type {Diagnostic[]} */
  validateAgainstSchema({
    schema_version: "1.0.0",
    source_revision: normalized.sourceRevision,
    cases: executableCaseInput,
    obligation_dispositions: [],
    exploratory_candidates: []
  }, case_drafts_schema_default));
  for (const lane of ["grounded", "conditional"]) for (const caseDraft of records(normalized.classification[lane])) {
    const caseId = String(caseDraft.case_id ?? "");
    casesById.set(caseId, caseDraft);
    const obligationIds = strings(caseDraft.obligation_ids);
    for (const obligationId of obligationIds) {
      const lanes = baseLanesByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      lanes.add(lane);
      baseLanesByObligation.set(obligationId, lanes);
    }
    const finalLanes = new Set(mapArray3(obligationIds, (id) => String(pointsById.get(id)?.classification ?? "unknown")));
    if (finalLanes.size === 1 && finalLanes.has(lane)) {
      validateCaseTraceability(
        caseDraft,
        lane,
        obligationsById,
        routesByFact,
        factsById,
        factIdsByObligation,
        pointsById,
        evidenceGraph,
        diagnostics
      );
      pushArray2(lane === "grounded" ? grounded : conditional, structuredClone(caseDraft));
    } else if (!(finalLanes.size === 1 && finalLanes.has("blocked"))) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "CASE_DISPOSITION_MISMATCH",
      `/classification/${lane}/${pointerPart3(caseId)}`,
      "one Case cannot cross final executable and blocked dispositions"
    ));
  }
  for (const [obligationId, lanes] of baseLanesByObligation) if (lanes.size > 1) pushArray2(diagnostics, diagnostic7(
    "coverage",
    "FORMAL_DISPOSITION_DUPLICATE",
    `/formal/${pointerPart3(obligationId)}`,
    "one formal Test Point cannot enter multiple executable lanes"
  ));
  const blockedInput = records(normalized.classification.blocked);
  const duplicateBlockedIds = /* @__PURE__ */ new Set();
  const seenBlockedIds = /* @__PURE__ */ new Set();
  for (const item of blockedInput) {
    const id = String(item.obligation_id ?? "");
    if (seenBlockedIds.has(id)) duplicateBlockedIds.add(id);
    else seenBlockedIds.add(id);
  }
  if (duplicateBlockedIds.size > 0) {
    for (const id of sortArray2([...duplicateBlockedIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_DISPOSITION_DUPLICATE",
      `/classification/blocked/${pointerPart3(id)}`,
      "Blocked disposition must be unique"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  const blockedInputById = /* @__PURE__ */ new Map();
  for (const item of blockedInput) {
    const id = String(item.obligation_id ?? "");
    requireClosed(item, ["obligation_id", "root_issue_id", "reason", "risk", "evidence_refs"], `/classification/blocked/${pointerPart3(id)}`, diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
    canonicalStrings(item.evidence_refs, `/classification/blocked/${pointerPart3(id)}/evidence_refs`, diagnostics);
    blockedInputById.set(id, item);
    if (pointsById.get(id)?.classification !== "blocked") pushArray2(diagnostics, diagnostic7(
      "traceability",
      "BLOCKED_DISPOSITION_MISMATCH",
      `/classification/blocked/${pointerPart3(id)}`,
      "upstream Blocked disposition must remain Blocked"
    ));
  }
  const roots = records(normalized.clarification.root_issues);
  const state = isRecord3(normalized.clarification.state) ? normalized.clarification.state : {};
  requireClosed(state, CLARIFICATION_STATE_KEYS, "/clarification/state", diagnostics, "ROOT_LEDGER_PROPERTY_UNKNOWN");
  const ledger = records(state.root_snapshot_ledger);
  const rootLedger = validateRootLedger(
    roots,
    ledger,
    records(state.root_issue_dispositions),
    normalized.sourceRevision,
    diagnostics
  );
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? "");
    const status = rootLedger.dispositionById.get(rootId);
    if (entry.current !== true && status !== "suppressed_unknown" && status !== "suppressed_deferred" && status !== "open") continue;
    const evidenceRefs = strings(entry.evidence_refs);
    const semanticClaimRefs = filterArray3(strings(entry.semantic_refs), (ref) => claimsById.has(ref));
    const claimRefs = [...evidenceRefs, ...semanticClaimRefs];
    const affectedRoots = /* @__PURE__ */ new Set();
    for (const obligationId of strings(entry.affected_obligation_ids)) {
      const formalRoots = formalRootsByObligation.get(obligationId);
      if (!formalRoots) {
        pushArray2(diagnostics, diagnostic7(
          "reference",
          "BLOCKED_ROOT_OBLIGATION_UNKNOWN",
          `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}/affected_obligation_ids/${pointerPart3(obligationId)}`,
          "root ledger associations must reference a formal Test Point"
        ));
        continue;
      }
      for (const formalRef of formalRoots) affectedRoots.add(formalRef);
    }
    const relatedClaims = evidenceRelationIndex(affectedRoots, evidenceGraph);
    for (const ref of claimRefs) if (!claimsById.has(ref) || !relatedClaims.has(ref)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "BLOCKED_ROOT_EVIDENCE_INVALID",
      `/clarification/state/root_snapshot_ledger/${pointerPart3(rootId)}/evidence_refs/${pointerPart3(ref)}`,
      "Blocked root claim evidence must be accepted and related to one affected formal Test Point closure"
    ));
  }
  const blocked = [];
  for (const point of filterArray3(points, (item) => item.classification === "blocked")) {
    const obligationId = String(point.obligation_id);
    const reason = String(point.blocked_reason);
    const obligation = obligationsById.get(obligationId);
    const projectedFromCase = baseLanesByObligation.has(obligationId);
    const task8Blocker = blockedInputById.get(obligationId);
    if (!projectedFromCase && !task8Blocker) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "BLOCKED_DISPOSITION_MISSING",
      `/classification/blocked/${pointerPart3(obligationId)}`,
      "final Blocked Test Point must trace to a Task 8 blocker or an executable Case gated by Task 9"
    ));
    if (projectedFromCase && task8Blocker) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_DISPOSITION_DUPLICATE",
      `/formal/${pointerPart3(obligationId)}`,
      "final Blocked Test Point cannot retain both a Task 8 blocker and an executable Case projection"
    ));
    if (task8Blocker && (task8Blocker.reason !== reason || task8Blocker.risk !== obligation?.risk)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "BLOCKED_DISPOSITION_MISMATCH",
      `/classification/blocked/${pointerPart3(obligationId)}`,
      "Task 8 and final Blocked reason and risk must agree"
    ));
    if (task8Blocker) for (const ref of strings(task8Blocker.evidence_refs)) {
      const formalRoots = formalRootsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      if (!claimsById.has(ref) || !someArray2([...formalRoots], (formalRef) => isEvidenceRelated(ref, formalRef, evidenceGraph))) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "BLOCKED_ROOT_EVIDENCE_INVALID",
        `/classification/blocked/${pointerPart3(obligationId)}/evidence_refs/${pointerPart3(ref)}`,
        "Task 8 Blocked evidence must be accepted and related to the formal Test Point closure"
      ));
    }
    const currentCandidates = rootLedger.currentByObligationReason.get(obligationId)?.get(reason) ?? [];
    const retainedCandidates = rootLedger.retainedByObligationReason.get(obligationId)?.get(reason) ?? [];
    const candidates = currentCandidates.length > 0 ? currentCandidates : retainedCandidates;
    if (candidates.length !== 1) {
      pushArray2(diagnostics, diagnostic7(
        "traceability",
        "BLOCKED_ROOT_TRACE_INVALID",
        `/blocked/${pointerPart3(obligationId)}`,
        `Blocked formal Test Point requires exactly one root issue; found ${candidates.length}`
      ));
      continue;
    }
    const root = candidates[0];
    if (task8Blocker && task8Blocker.root_issue_id !== root.root_issue_id) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "BLOCKED_ROOT_ID_MISMATCH",
      `/classification/blocked/${pointerPart3(obligationId)}/root_issue_id`,
      "Task 8 Blocked root identity must equal the selected authoritative Task 9 owner"
    ));
    const semanticRefs2 = strings(root.semantic_refs);
    const missingType2 = typeof root.missing_type === "string" ? root.missing_type : "";
    const question = typeof root.question === "string" ? root.question : "";
    const risk = typeof obligation?.risk === "string" ? obligation.risk : "";
    if (semanticRefs2.length === 0 || missingType2.trim().length === 0 || question.trim().length === 0 || !RISKS3.has(risk)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "BLOCKED_RECOVERY_INCOMPLETE",
      `/blocked/${pointerPart3(obligationId)}/recovery`,
      "Blocked root must provide missing type, material references, question, and formal risk"
    ));
    pushArray2(blocked, {
      obligation_id: obligationId,
      root_issue_id: String(root.root_issue_id ?? ""),
      reason,
      recovery: {
        missing_type: missingType2,
        required_material: joinArray3(sortArray2([...semanticRefs2], compareCodePoints4), ", "),
        question
      },
      risk
    });
  }
  const naInput = records(normalized.classification.not_applicable);
  const duplicateNotApplicableIds = /* @__PURE__ */ new Set();
  const seenNotApplicableIds = /* @__PURE__ */ new Set();
  for (const item of naInput) {
    const obligationId = String(item.obligation_id ?? "");
    if (seenNotApplicableIds.has(obligationId)) duplicateNotApplicableIds.add(obligationId);
    else seenNotApplicableIds.add(obligationId);
  }
  if (duplicateNotApplicableIds.size > 0) {
    for (const obligationId of sortArray2([...duplicateNotApplicableIds], compareCodePoints4)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "FORMAL_DISPOSITION_DUPLICATE",
      `/classification/not_applicable/${pointerPart3(obligationId)}`,
      "NotApplicable disposition must be unique"
    ));
    throw new BundleReconciliationError(diagnostics);
  }
  const naById = /* @__PURE__ */ new Map();
  for (const item of naInput) {
    const obligationId = String(item.obligation_id ?? "");
    requireClosed(item, ["obligation_id", "status", "exclusion_claim_id", "scope", "support_review"], `/classification/not_applicable/${pointerPart3(obligationId)}`, diagnostics, "CONTEXT_PROPERTY_UNKNOWN");
    const obligation = obligationsById.get(obligationId);
    const exclusionId = String(item.exclusion_claim_id ?? "");
    const exclusion = claimsById.get(exclusionId);
    naById.set(obligationId, item);
    if (item.status !== "not_applicable") pushArray2(diagnostics, diagnostic7(
      "classification",
      "NOT_APPLICABLE_STATUS_INVALID",
      `/classification/not_applicable/${pointerPart3(obligationId)}/status`,
      "NotApplicable disposition status must be not_applicable"
    ));
    if (pointsById.get(obligationId)?.classification !== "not_applicable") pushArray2(diagnostics, diagnostic7(
      "traceability",
      "NOT_APPLICABLE_DISPOSITION_MISMATCH",
      `/classification/not_applicable/${pointerPart3(obligationId)}`,
      "NotApplicable disposition must match final formal semantics"
    ));
    if (!exclusion) pushArray2(diagnostics, diagnostic7(
      "reference",
      "NOT_APPLICABLE_EXCLUSION_UNKNOWN",
      `/classification/not_applicable/${pointerPart3(obligationId)}/exclusion_claim_id`,
      "NotApplicable exclusion must exist in accepted Task 3 evidence"
    ));
    else {
      if (exclusion.level !== "E3" && exclusion.level !== "E2") pushArray2(diagnostics, diagnostic7(
        "classification",
        "NOT_APPLICABLE_EXCLUSION_LEVEL_INVALID",
        `/classification/not_applicable/${pointerPart3(obligationId)}/exclusion_claim_id`,
        "NotApplicable exclusion requires accepted E3 or E2 evidence"
      ));
      if (item.support_review !== "supported") pushArray2(diagnostics, diagnostic7(
        "classification",
        "NOT_APPLICABLE_EXCLUSION_REVIEW_INVALID",
        `/classification/not_applicable/${pointerPart3(obligationId)}/support_review`,
        "NotApplicable exclusion support review must be supported"
      ));
      if (!obligation || typeof exclusion.scope !== "string" || typeof item.scope !== "string" || !scopeContains(exclusion.scope, item.scope) || !scopeContains(item.scope, String(obligation.scope ?? ""))) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "NOT_APPLICABLE_EXCLUSION_SCOPE_INVALID",
        `/classification/not_applicable/${pointerPart3(obligationId)}/scope`,
        "NotApplicable exclusion and submitted scope must cover the formal Test Point scope"
      ));
      const obligationRoots = formalRootsByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      if (someArray2([...obligationRoots], (root) => isEvidenceRelated(exclusionId, root, evidenceGraph))) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "NOT_APPLICABLE_EXCLUSION_RELATED",
        `/classification/not_applicable/${pointerPart3(obligationId)}/exclusion_claim_id`,
        "NotApplicable exclusion must be independent of the formal Test Point evidence closure"
      ));
    }
  }
  for (const route of factRoutes) if (route.route_type === "not_applicable") {
    const factId = String(route.fact_id ?? "");
    const targetId = String(route.not_applicable_claim_id ?? "");
    const target = claimsById.get(targetId);
    if (!target || target.level !== "E3" && target.level !== "E2") pushArray2(diagnostics, diagnostic7(
      "reference",
      "NOT_APPLICABLE_ROUTE_TARGET_INVALID",
      `/fact_routes/${pointerPart3(factId)}/not_applicable_claim_id`,
      "terminal NotApplicable route target must be accepted E3 or E2 exclusion evidence"
    ));
    const fact = factsById.get(factId);
    const factRoots = fact ? [String(fact.claim_id ?? ""), ...strings(fact.source_claim_ids)] : [];
    const primaryFactClaim = fact ? claimsById.get(String(fact.claim_id ?? "")) : void 0;
    if (target && (!primaryFactClaim || typeof target.scope !== "string" || typeof primaryFactClaim.scope !== "string" || !scopeContains(target.scope, primaryFactClaim.scope))) {
      pushArray2(diagnostics, diagnostic7(
        "traceability",
        "NOT_APPLICABLE_ROUTE_SCOPE_INVALID",
        `/fact_routes/${pointerPart3(factId)}/not_applicable_claim_id`,
        "terminal NotApplicable exclusion scope must cover the routed normative fact scope"
      ));
    }
    if (target && someArray2(factRoots, (ref) => isEvidenceRelated(targetId, ref, evidenceGraph))) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "NOT_APPLICABLE_ROUTE_TARGET_RELATED",
      `/fact_routes/${pointerPart3(factId)}/not_applicable_claim_id`,
      "terminal NotApplicable exclusion must be independent of every routed fact evidence root"
    ));
  }
  for (const point of points) {
    const id = String(point.obligation_id);
    if ((point.classification === "grounded" || point.classification === "conditional") && !baseLanesByObligation.get(id)?.has(point.classification)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "FORMAL_CASE_TRACE_MISSING",
      `/formal/${pointerPart3(id)}`,
      "every executable formal Test Point must reference a Case in its final lane"
    ));
    if (point.classification === "not_applicable" && !naById.has(id)) pushArray2(diagnostics, diagnostic7(
      "coverage",
      "NOT_APPLICABLE_DISPOSITION_MISSING",
      `/formal/${pointerPart3(id)}`,
      "NotApplicable formal Test Point requires its verified exclusion record"
    ));
  }
  const notApplicable = sortArray2(mapArray3([...naById.values()], (item) => ({
    obligation_id: String(item.obligation_id),
    exclusion_claim_id: String(item.exclusion_claim_id),
    scope: String(item.scope),
    support_review: String(item.support_review)
  })), (left, right) => compareCodePoints4(left.obligation_id, right.obligation_id));
  const exploratoryIds = strings(delivery.exploratory);
  const exploratoryInput = records(normalized.classification.exploratory);
  const allFormalRoots = /* @__PURE__ */ new Set();
  for (const roots2 of formalRootsByObligation.values()) for (const ref of roots2) allFormalRoots.add(ref);
  const formalEvidence = /* @__PURE__ */ new Set();
  const upward = sortArray2([...allFormalRoots], compareCodePoints4);
  let evidenceCursor = 0;
  while (evidenceCursor < upward.length) {
    const claimId = upward[evidenceCursor];
    evidenceCursor += 1;
    if (!claimsById.has(claimId) || formalEvidence.has(claimId)) continue;
    formalEvidence.add(claimId);
    for (const parentId of evidenceGraph.parentsByClaim.get(claimId) ?? []) pushArray2(upward, parentId);
  }
  const formalDependence = new Set(formalEvidence);
  const downward = sortArray2([...formalEvidence], compareCodePoints4);
  evidenceCursor = 0;
  while (evidenceCursor < downward.length) {
    const claimId = downward[evidenceCursor];
    evidenceCursor += 1;
    for (const childId of evidenceGraph.childrenByClaim.get(claimId) ?? []) {
      if (formalDependence.has(childId)) continue;
      formalDependence.add(childId);
      pushArray2(downward, childId);
    }
  }
  for (const item of exploratoryInput) {
    const exploratoryId = String(item.exploratory_id ?? "");
    requireClosed(
      item,
      ["exploratory_id", "title", "scope", "risk", "source_claim_ids"],
      `/classification/exploratory/${pointerPart3(exploratoryId)}`,
      diagnostics,
      "CONTEXT_PROPERTY_UNKNOWN"
    );
    canonicalStrings(
      item.source_claim_ids,
      `/classification/exploratory/${pointerPart3(exploratoryId)}/source_claim_ids`,
      diagnostics,
      true
    );
    for (const ref of strings(item.source_claim_ids)) if (!claimsById.has(ref) || formalDependence.has(ref)) pushArray2(diagnostics, diagnostic7(
      "traceability",
      "EXPLORATORY_EVIDENCE_INVALID",
      `/classification/exploratory/${pointerPart3(exploratoryId)}/source_claim_ids/${pointerPart3(ref)}`,
      "Exploratory source evidence must be accepted and independent of every formal Test Point closure"
    ));
  }
  const exploratory = sortArray2(mapArray3(exploratoryInput, (item) => ({
    exploratory_id: String(item.exploratory_id ?? ""),
    title: String(item.title ?? ""),
    scope: String(item.scope ?? ""),
    risk: String(item.risk ?? ""),
    reason: `Risk hypothesis outside formal Test Point coverage; evidence: ${joinArray3(sortArray2(strings(item.source_claim_ids), compareCodePoints4), ", ")}`
  })), (left, right) => compareCodePoints4(left.exploratory_id, right.exploratory_id));
  if (!sameStrings(exploratoryIds, mapArray3(exploratory, (item) => item.exploratory_id))) pushArray2(diagnostics, diagnostic7(
    "traceability",
    "EXPLORATORY_LANE_MISMATCH",
    "/exploratory",
    "Task 8 and Task 9 Exploratory identities must match exactly"
  ));
  const executableCases = [...grounded, ...conditional];
  const caseIndexesByFact = /* @__PURE__ */ new Map();
  const caseIndexesByObligation = /* @__PURE__ */ new Map();
  for (let caseIndex = 0; caseIndex < executableCases.length; caseIndex += 1) {
    const caseDraft = executableCases[caseIndex];
    for (const factId of strings(caseDraft.fact_ids)) {
      const indexes = caseIndexesByFact.get(factId) ?? /* @__PURE__ */ new Set();
      indexes.add(caseIndex);
      caseIndexesByFact.set(factId, indexes);
    }
    for (const obligationId of strings(caseDraft.obligation_ids)) {
      const indexes = caseIndexesByObligation.get(obligationId) ?? /* @__PURE__ */ new Set();
      indexes.add(caseIndex);
      caseIndexesByObligation.set(obligationId, indexes);
    }
  }
  const sharesCase = (factId, obligationId) => {
    const factCases = caseIndexesByFact.get(factId);
    const obligationCases = caseIndexesByObligation.get(obligationId);
    if (!factCases || !obligationCases) return false;
    const smaller = factCases.size <= obligationCases.size ? factCases : obligationCases;
    const larger = smaller === factCases ? obligationCases : factCases;
    for (const caseIndex of smaller) if (larger.has(caseIndex)) return true;
    return false;
  };
  const requirementEntries = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const route = routesByFact.get(factId);
    let status = "blocked";
    if (route?.route_type === "not_applicable") status = "not_applicable";
    else if (route?.route_type === "obligations") {
      const obligationIds = strings(route.obligation_ids);
      const dispositions = mapArray3(obligationIds, (id) => String(pointsById.get(id)?.classification ?? "unknown"));
      const executableRouteIds = filterArray3(
        obligationIds,
        (_id, index) => dispositions[index] === "grounded" || dispositions[index] === "conditional"
      );
      if (executableRouteIds.length > 0 && everyArray2(executableRouteIds, (id) => sharesCase(factId, id))) status = "covered";
      else if (everyArray2(dispositions, (item) => item === "not_applicable")) status = "not_applicable";
      else if (executableRouteIds.length > 0) pushArray2(diagnostics, diagnostic7(
        "traceability",
        "REQUIREMENT_CASE_TRACE_MISSING",
        `/coverage/requirements/${pointerPart3(factId)}`,
        "an executable fact route requires a reverse Case association"
      ));
    }
    pushArray2(requirementEntries, { fact_id: factId, status });
  }
  sortArray2(requirementEntries, (left, right) => compareCodePoints4(left.fact_id, right.fact_id));
  const formalEntries = sortArray2(mapArray3(points, (point) => ({
    obligation_id: String(point.obligation_id),
    status: String(point.classification)
  })), (left, right) => compareCodePoints4(left.obligation_id, right.obligation_id));
  const executableEntries = [];
  for (const caseDraft of grounded) for (const obligationId of strings(caseDraft.obligation_ids)) pushArray2(executableEntries, {
    obligation_id: obligationId,
    case_id: String(caseDraft.case_id)
  });
  sortArray2(executableEntries, (left, right) => compareCodePoints4(left.obligation_id, right.obligation_id) || compareCodePoints4(left.case_id, right.case_id));
  const applicable = filterArray3(formalEntries, (item) => item.status !== "not_applicable");
  const covered = filterArray3(applicable, (item) => item.status === "grounded" || item.status === "conditional");
  const groundedIds = new Set(mapArray3(
    filterArray3(formalEntries, (item) => item.status === "grounded"),
    (item) => item.obligation_id
  ));
  const highBlocked = someArray2(blocked, (item) => item.risk === "critical" || item.risk === "high");
  const deliveryStatus = applicable.length === 0 ? "no_applicable_formal_test_points" : executableCases.length === 0 && blocked.length > 0 ? "no_deterministic_cases" : executableCases.length > 0 && highBlocked ? "critical_gaps" : executableCases.length > 0 ? "executable_subset_ready" : "";
  if (!deliveryStatus) pushArray2(diagnostics, diagnostic7(
    "coverage",
    "FINAL_STATUS_UNRESOLVED",
    "/quality/delivery_status",
    "formal dispositions do not resolve to one frozen delivery status"
  ));
  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  const bundle = {
    schema_version: "1.0.0",
    source_revision: normalized.sourceRevision,
    grounded: sortArray2(grounded, (left, right) => compareCodePoints4(String(left.case_id), String(right.case_id))),
    conditional: sortArray2(conditional, (left, right) => compareCodePoints4(String(left.case_id), String(right.case_id))),
    blocked: sortArray2(blocked, (left, right) => compareCodePoints4(String(left.obligation_id), String(right.obligation_id))),
    exploratory,
    coverage: {
      requirements: { total: requirementEntries.length, accounted: requirementEntries.length, entries: requirementEntries },
      formal: { total: formalEntries.length, covered: covered.length, entries: formalEntries },
      executable: { total: groundedIds.size, grounded: groundedIds.size, entries: executableEntries },
      expert_recall: { status: "benchmark_only", limits: normalized.expertLimits },
      not_applicable: notApplicable
    },
    quality: {
      delivery_status: deliveryStatus,
      compiler_version: normalized.compilerVersion,
      schema_version: "1.0.0",
      lineage: normalized.lineage,
      limits: normalized.limits
    }
  };
  const canonicalBundle = JSON.parse(canonicalStringify(bundle));
  const outputDiagnostics = [
    .../** @type {Diagnostic[]} */
    validateAgainstSchema(canonicalBundle, test_bundle_schema_default),
    .../** @type {Diagnostic[]} */
    validateUniqueStableIds(canonicalBundle)
  ];
  if (outputDiagnostics.length > 0) throw new BundleReconciliationError(outputDiagnostics);
  return canonicalBundle;
}
function buildBundle(context) {
  try {
    return buildBundleTrusted(context);
  } catch (error) {
    if (error instanceof BundleReconciliationError) throw error;
    throw new BundleReconciliationError([
      diagnostic7("schema", "INPUT_NORMALIZATION_FAILED", "/", "Task 10 input could not be safely normalized")
    ]);
  }
}

// src/views/interaction-matrix.mjs
var INTERACTION_DIMENSIONS = Object.freeze([
  "shared-entity",
  "role",
  "client",
  "interface-event",
  "time",
  "concurrency",
  "side-effect"
]);
var DIMENSION_SET = new Set(INTERACTION_DIMENSIONS);
var CELL_STATUSES = /* @__PURE__ */ new Set(["checked-no-signal", "candidate"]);
var FORMAL_VIEW_TYPES = /* @__PURE__ */ new Set(["flow", "decision", "state", "input-domain", "role", "timing", "integration"]);
var VIEW_ELEMENT_KINDS = Object.freeze({
  flow: Object.freeze(["flow-node", "flow-edge"]),
  decision: Object.freeze(["decision-rule"]),
  state: Object.freeze(["state", "transition"]),
  "input-domain": Object.freeze(["input-domain"]),
  role: Object.freeze(["role-permission"]),
  timing: Object.freeze(["timing-rule"]),
  integration: Object.freeze(["integration-contract"])
});
var DISPOSITION_FIELDS = Object.freeze([
  "formal_view_id",
  "blocker_root_issue_id",
  "exploratory_id"
]);
function isObject4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray5(value) {
  return Array.isArray(value) ? value.filter(isObject4) : [];
}
function compareCodePoints5(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function normalizedStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim().length > 0))].sort(compareCodePoints5);
}
function diagnostic8(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function sortDiagnostics(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()].sort(([left], [right]) => compareCodePoints5(left, right)).map(([, item]) => item);
}
function cellKey(moduleIds, dimension) {
  return JSON.stringify([moduleIds, dimension]);
}
function moduleLabel(moduleIds) {
  return JSON.stringify(moduleIds);
}
function escapePointerSegment2(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function duplicateStrings(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort(compareCodePoints5);
}
function cellPath(moduleIds, dimension) {
  return `/interaction_matrix/${escapePointerSegment2(cellKey(moduleIds, dimension))}`;
}
function candidateSemanticKey(candidate) {
  return JSON.stringify([
    typeof candidate.candidate_id === "string" ? candidate.candidate_id : "",
    normalizedStrings(candidate.module_ids),
    typeof candidate.dimension === "string" ? candidate.dimension : "",
    typeof candidate.disposition === "string" ? candidate.disposition : "",
    DISPOSITION_FIELDS.map((field) => typeof candidate[field] === "string" ? candidate[field] : ""),
    normalizedStrings(candidate.source_claim_ids)
  ]);
}
function candidatePath(candidate) {
  const candidateId = typeof candidate.candidate_id === "string" && candidate.candidate_id.length > 0 ? candidate.candidate_id : candidateSemanticKey(candidate);
  return `/interaction_candidates/${escapePointerSegment2(candidateId)}`;
}
function modeledSupport(view) {
  const claimIds = /* @__PURE__ */ new Set();
  let hasModelRefs = false;
  for (const item of [...objectArray5(view.elements), ...objectArray5(view.relations)]) {
    const modelRefs = normalizedStrings(item.model_refs);
    if (modelRefs.length > 0) hasModelRefs = true;
    for (const claimId of [...normalizedStrings(item.source_claim_ids), ...modelRefs]) claimIds.add(claimId);
  }
  return { claimIds, hasModelRefs };
}
function relationEndpointKind(viewType) {
  if (viewType === "flow") return "flow-node";
  if (viewType === "state") return "state";
  const kinds = VIEW_ELEMENT_KINDS[
    /** @type {keyof typeof VIEW_ELEMENT_KINDS} */
    viewType
  ];
  return kinds?.length === 1 ? kinds[0] : null;
}
function formalViewIdentityDiagnostics(view) {
  const viewId = typeof view.view_id === "string" ? view.view_id : "";
  const viewPath = `/views/${escapePointerSegment2(viewId)}`;
  const elements = objectArray5(view.elements);
  const diagnostics = [];
  if (view.type === "state") {
    const stateNames = elements.flatMap((element) => element.kind === "state" && typeof element.state === "string" ? [element.state] : []);
    for (const stateName of duplicateStrings(stateNames)) diagnostics.push(diagnostic8(
      "schema",
      "STATE_NAME_DUPLICATE",
      `${viewPath}/state_names/${escapePointerSegment2(stateName)}`,
      `state name "${stateName}" must be unique within its state view`
    ));
  }
  for (const element of elements) {
    if (element.kind !== "input-domain") continue;
    const elementId = typeof element.element_id === "string" ? element.element_id : "";
    const classIds = objectArray5(element.classes).flatMap((item) => typeof item.class_id === "string" ? [item.class_id] : []);
    for (const classId of duplicateStrings(classIds)) diagnostics.push(diagnostic8(
      "schema",
      "INPUT_CLASS_ID_DUPLICATE",
      `${viewPath}/elements/${escapePointerSegment2(elementId)}/classes/${escapePointerSegment2(classId)}`,
      `input-domain class_id "${classId}" must be unique within element "${elementId}"`
    ));
  }
  return diagnostics;
}
function formalViewStructureValid(view) {
  if (formalViewIdentityDiagnostics(view).length > 0) return false;
  const type = typeof view.type === "string" ? view.type : "";
  const legalKinds = VIEW_ELEMENT_KINDS[
    /** @type {keyof typeof VIEW_ELEMENT_KINDS} */
    type
  ];
  if (!legalKinds || typeof view.scope !== "string" || view.scope.length === 0) return false;
  const elements = objectArray5(view.elements);
  const relations = objectArray5(view.relations);
  const kindsById = /* @__PURE__ */ new Map();
  for (const element of elements) {
    const elementId = typeof element.element_id === "string" ? element.element_id : "";
    const kind = typeof element.kind === "string" ? element.kind : "";
    if (elementId.length === 0 || kindsById.has(elementId) || !legalKinds.includes(kind)) return false;
    if (normalizedStrings(element.source_claim_ids).length + normalizedStrings(element.model_refs).length === 0) return false;
    kindsById.set(elementId, kind);
  }
  for (const element of elements) {
    if (element.kind !== "flow-edge") continue;
    if (typeof element.from_element_id !== "string" || kindsById.get(element.from_element_id) !== "flow-node") return false;
    if (typeof element.to_element_id !== "string" || kindsById.get(element.to_element_id) !== "flow-node") return false;
  }
  if (type === "state") {
    const states = new Set(elements.flatMap((element) => element.kind === "state" && typeof element.state === "string" ? [element.state] : []));
    for (const element of elements) {
      if (element.kind !== "transition") continue;
      if (typeof element.from_state !== "string" || !states.has(element.from_state)) return false;
      if (typeof element.to_state !== "string" || !states.has(element.to_state)) return false;
    }
  }
  const expectedRelationKind = relationEndpointKind(type);
  for (const relation of relations) {
    if (normalizedStrings(relation.source_claim_ids).length + normalizedStrings(relation.model_refs).length === 0) return false;
    if (typeof relation.from_element_id !== "string" || !kindsById.has(relation.from_element_id)) return false;
    if (typeof relation.to_element_id !== "string" || !kindsById.has(relation.to_element_id)) return false;
    if (expectedRelationKind !== null && (kindsById.get(relation.from_element_id) !== expectedRelationKind || kindsById.get(relation.to_element_id) !== expectedRelationKind)) return false;
  }
  return true;
}
function auditInteractionMatrix(artifact) {
  const input = isObject4(artifact) ? artifact : {};
  const matrix = objectArray5(input.interaction_matrix);
  const submittedCandidates = objectArray5(input.interaction_candidates);
  const views = objectArray5(input.views);
  const viewsById = /* @__PURE__ */ new Map();
  for (const view of views) {
    if (typeof view.view_id !== "string") continue;
    const matches = viewsById.get(view.view_id) ?? [];
    matches.push(view);
    viewsById.set(view.view_id, matches);
  }
  const diagnostics = [];
  if (matrix.length === 0) diagnostics.push(diagnostic8(
    "coverage",
    "INTERACTION_AUDIT_EMPTY",
    "/interaction_matrix",
    "an empty interaction matrix cannot represent a completed audit"
  ));
  const moduleIds = /* @__PURE__ */ new Set();
  for (const record2 of [...matrix, ...submittedCandidates]) {
    for (const moduleId of normalizedStrings(record2.module_ids)) moduleIds.add(moduleId);
  }
  const modules = [...moduleIds].sort(compareCodePoints5);
  const cells = [];
  for (const record2 of matrix) {
    const modulesForCell = normalizedStrings(record2.module_ids);
    const rawModuleCount = Array.isArray(record2.module_ids) ? record2.module_ids.length : 0;
    const dimension = typeof record2.dimension === "string" ? record2.dimension : "";
    const status = typeof record2.status === "string" ? record2.status : "";
    const path4 = cellPath(modulesForCell, dimension);
    let valid = true;
    if (modulesForCell.length !== rawModuleCount || modulesForCell.length === 0) {
      diagnostics.push(diagnostic8("schema", "INTERACTION_MODULE_SET_INVALID", `${path4}/module_ids`, "module_ids must contain unique nonblank module IDs"));
      valid = false;
    }
    if (!DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic8("schema", "INTERACTION_DIMENSION_INVALID", `${path4}/dimension`, "dimension is not in the fixed interaction matrix"));
      valid = false;
    }
    if (!CELL_STATUSES.has(status)) {
      diagnostics.push(diagnostic8("schema", "INTERACTION_STATUS_INVALID", `${path4}/status`, "status must be checked-no-signal or candidate"));
      valid = false;
    }
    if (valid) cells.push({ record: record2, modules: modulesForCell, dimension, status, key: cellKey(modulesForCell, dimension) });
  }
  const expectedCells = /* @__PURE__ */ new Map();
  if (modules.length === 1) {
    for (const dimension of INTERACTION_DIMENSIONS) expectedCells.set(cellKey(modules, dimension), { modules, dimension });
  } else if (modules.length >= 2) {
    for (let left = 0; left < modules.length; left += 1) {
      for (let right = left + 1; right < modules.length; right += 1) {
        const pair = [modules[left], modules[right]];
        for (const dimension of INTERACTION_DIMENSIONS) expectedCells.set(cellKey(pair, dimension), { modules: pair, dimension });
      }
    }
  }
  const cellsByKey = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    const expectedModuleCount = modules.length === 1 ? 1 : 2;
    const path4 = cellPath(cell.modules, cell.dimension);
    if (cell.modules.length !== expectedModuleCount || !expectedCells.has(cell.key)) {
      diagnostics.push(diagnostic8(
        "coverage",
        "INTERACTION_CELL_EXTRA",
        path4,
        `cell ${moduleLabel(cell.modules)} / ${cell.dimension} is outside the required audit grid`
      ));
      continue;
    }
    const matches = cellsByKey.get(cell.key) ?? [];
    matches.push(cell);
    cellsByKey.set(cell.key, matches);
    if (matches.length > 1) diagnostics.push(diagnostic8(
      "coverage",
      "INTERACTION_CELL_DUPLICATE",
      path4,
      `cell ${moduleLabel(cell.modules)} / ${cell.dimension} appears more than once`
    ));
  }
  for (const [key, expected] of [...expectedCells.entries()].sort(([left], [right]) => compareCodePoints5(left, right))) {
    if (cellsByKey.has(key)) continue;
    diagnostics.push(diagnostic8(
      "coverage",
      "INTERACTION_CELL_MISSING",
      cellPath(expected.modules, expected.dimension),
      `missing interaction cell for ${moduleLabel(expected.modules)} / ${expected.dimension}`
    ));
  }
  const candidateIdCounts = /* @__PURE__ */ new Map();
  for (const candidate of submittedCandidates) {
    const candidateId = typeof candidate.candidate_id === "string" ? candidate.candidate_id : "";
    candidateIdCounts.set(candidateId, (candidateIdCounts.get(candidateId) ?? 0) + 1);
  }
  for (const [candidateId, count] of [...candidateIdCounts.entries()].sort(([left], [right]) => compareCodePoints5(left, right))) {
    if (candidateId.length === 0 || count < 2) continue;
    diagnostics.push(diagnostic8(
      "schema",
      "INTERACTION_CANDIDATE_ID_INVALID",
      `/interaction_candidates/${escapePointerSegment2(candidateId)}/candidate_id`,
      "candidate_id must be nonblank and unique"
    ));
  }
  const candidatesByCell = /* @__PURE__ */ new Map();
  const candidates = [];
  const orderedCandidates = [...submittedCandidates].sort((left, right) => compareCodePoints5(candidateSemanticKey(left), candidateSemanticKey(right)));
  for (const candidate of orderedCandidates) {
    const path4 = candidatePath(candidate);
    const candidateId = typeof candidate.candidate_id === "string" ? candidate.candidate_id : "";
    const modulesForCandidate = normalizedStrings(candidate.module_ids);
    const rawModuleCount = Array.isArray(candidate.module_ids) ? candidate.module_ids.length : 0;
    const dimension = typeof candidate.dimension === "string" ? candidate.dimension : "";
    const disposition = typeof candidate.disposition === "string" ? candidate.disposition : "";
    let valid = true;
    if (candidateId.length === 0) {
      diagnostics.push(diagnostic8("schema", "INTERACTION_CANDIDATE_ID_INVALID", `${path4}/candidate_id`, "candidate_id must be nonblank and unique"));
      valid = false;
    } else if ((candidateIdCounts.get(candidateId) ?? 0) > 1) valid = false;
    if (modulesForCandidate.length !== rawModuleCount || modulesForCandidate.length === 0 || !DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic8("reference", "INTERACTION_CANDIDATE_CELL_INVALID", path4, "candidate must name one valid audit cell"));
      valid = false;
    }
    const destinationFields = DISPOSITION_FIELDS.filter((field) => typeof candidate[field] === "string" && /** @type {string} */
    candidate[field].trim().length > 0);
    const expectedField = disposition === "formal-view" ? "formal_view_id" : disposition === "blocker" ? "blocker_root_issue_id" : disposition === "exploratory" ? "exploratory_id" : null;
    if (destinationFields.length !== 1 || expectedField === null || destinationFields[0] !== expectedField) {
      diagnostics.push(diagnostic8("classification", "CANDIDATE_DISPOSITION_NOT_EXACT", path4, "candidate must have exactly one destination matching its disposition"));
      valid = false;
    }
    if (disposition === "formal-view") {
      const sourceClaimIds = normalizedStrings(candidate.source_claim_ids);
      if (sourceClaimIds.length === 0) {
        diagnostics.push(diagnostic8("classification", "FORMAL_CANDIDATE_EVIDENCE_REQUIRED", `${path4}/source_claim_ids`, "a formal interaction candidate requires source evidence"));
        valid = false;
      }
      const viewId = typeof candidate.formal_view_id === "string" ? candidate.formal_view_id : "";
      const matchingViews = viewsById.get(viewId) ?? [];
      if (matchingViews.length === 0) {
        diagnostics.push(diagnostic8("reference", "FORMAL_INTERACTION_VIEW_DANGLING", `${path4}/formal_view_id`, `formal interaction view "${viewId}" does not exist`));
        valid = false;
      } else if (matchingViews.length !== 1) {
        diagnostics.push(diagnostic8("reference", "FORMAL_INTERACTION_VIEW_AMBIGUOUS", `${path4}/formal_view_id`, `formal interaction view "${viewId}" is not uniquely defined`));
        valid = false;
      } else {
        const view = matchingViews[0];
        const identityDiagnostics = formalViewIdentityDiagnostics(view);
        if (typeof view.type !== "string" || !FORMAL_VIEW_TYPES.has(view.type)) {
          diagnostics.push(diagnostic8("classification", "FORMAL_INTERACTION_VIEW_TYPE_INVALID", `${path4}/formal_view_id`, "a formal interaction candidate must route to one of the seven formal behavior views"));
          valid = false;
        } else if (objectArray5(view.elements).length + objectArray5(view.relations).length === 0) {
          diagnostics.push(diagnostic8("traceability", "FORMAL_INTERACTION_VIEW_EMPTY", `${path4}/formal_view_id`, "a formal interaction candidate must route to a nonempty behavior view"));
          valid = false;
        } else if (identityDiagnostics.length > 0) {
          diagnostics.push(...identityDiagnostics);
          valid = false;
        } else if (!formalViewStructureValid(view)) {
          diagnostics.push(diagnostic8("traceability", "FORMAL_INTERACTION_VIEW_INVALID", `${path4}/formal_view_id`, "the formal interaction target is not a valid behavior-view graph"));
          valid = false;
        } else {
          const support = modeledSupport(view);
          if (!support.hasModelRefs && sourceClaimIds.some((claimId) => !support.claimIds.has(claimId))) {
            diagnostics.push(diagnostic8("traceability", "FORMAL_INTERACTION_VIEW_SUPPORT_MISMATCH", `${path4}/formal_view_id`, "the formal interaction view does not model every candidate source claim"));
            valid = false;
          }
        }
      }
    }
    const key = cellKey(modulesForCandidate, dimension);
    const matchingCells = cellsByKey.get(key) ?? [];
    if (matchingCells.length === 0) {
      diagnostics.push(diagnostic8("traceability", "INTERACTION_CANDIDATE_WITHOUT_CELL", path4, `candidate ${candidateId} does not match an audited cell`));
      valid = false;
    } else {
      if (matchingCells.every((cell) => cell.status === "checked-no-signal")) {
        diagnostics.push(diagnostic8(
          "classification",
          "INTERACTION_CANDIDATE_ON_NO_SIGNAL",
          path4,
          `candidate ${candidateId} is attached to a checked-no-signal cell`
        ));
        valid = false;
      }
      if (matchingCells.length !== 1) {
        diagnostics.push(diagnostic8("traceability", "INTERACTION_CANDIDATE_CELL_AMBIGUOUS", path4, `candidate ${candidateId} does not match exactly one audited cell`));
        valid = false;
      }
    }
    if (valid) {
      const normalized = { ...candidate, module_ids: modulesForCandidate };
      if (Array.isArray(candidate.source_claim_ids)) normalized.source_claim_ids = normalizedStrings(candidate.source_claim_ids);
      candidates.push(normalized);
      const matches = candidatesByCell.get(key) ?? [];
      matches.push(normalized);
      candidatesByCell.set(key, matches);
    }
  }
  for (const [key, matchingCells] of cellsByKey) {
    const candidateCells = matchingCells.filter((cell) => cell.status === "candidate");
    if (candidateCells.length === 0) continue;
    const dispositions = candidatesByCell.get(key) ?? [];
    const sample = candidateCells[0];
    const path4 = cellPath(sample.modules, sample.dimension);
    if (dispositions.length === 0) diagnostics.push(diagnostic8(
      "traceability",
      "INTERACTION_CANDIDATE_MISSING",
      path4,
      `candidate cell ${moduleLabel(sample.modules)} / ${sample.dimension} has no valid disposition`
    ));
    else if (dispositions.length > 1) diagnostics.push(diagnostic8(
      "traceability",
      "INTERACTION_CANDIDATE_MULTIPLE",
      path4,
      `candidate cell ${moduleLabel(sample.modules)} / ${sample.dimension} has more than one valid disposition`
    ));
  }
  candidates.sort((left, right) => compareCodePoints5(
    /** @type {string} */
    left.candidate_id,
    /** @type {string} */
    right.candidate_id
  ));
  return { candidates, diagnostics: sortDiagnostics(diagnostics) };
}

// src/views/validate-views.mjs
var VIEW_ELEMENT_KINDS2 = Object.freeze({
  flow: Object.freeze(["flow-node", "flow-edge"]),
  decision: Object.freeze(["decision-rule"]),
  state: Object.freeze(["state", "transition"]),
  "input-domain": Object.freeze(["input-domain"]),
  role: Object.freeze(["role-permission"]),
  timing: Object.freeze(["timing-rule"]),
  integration: Object.freeze(["integration-contract"])
});
var VIEW_TYPES = new Set(Object.keys(VIEW_ELEMENT_KINDS2));
function isObject5(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray6(value) {
  return Array.isArray(value) ? value.filter(isObject5) : [];
}
function stringArray4(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function compareCodePoints6(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function diagnostic9(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function sortDiagnostics2(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()].sort(([left], [right]) => compareCodePoints6(left, right)).map(([, item]) => item);
}
function acceptedClaims(evidenceGraph) {
  if (!isObject5(evidenceGraph) || !(evidenceGraph.claimsById instanceof Map)) return /* @__PURE__ */ new Map();
  return (
    /** @type {Map<string, Record<string, unknown>>} */
    evidenceGraph.claimsById
  );
}
function factLedger(evidenceGraph) {
  if (!isObject5(evidenceGraph)) return [];
  if (evidenceGraph.factsById instanceof Map) return [...evidenceGraph.factsById.values()].filter(isObject5);
  return objectArray6(evidenceGraph.factLedger ?? evidenceGraph.fact_ledger);
}
function claimClosure(claimsById, seeds) {
  const closure = /* @__PURE__ */ new Set();
  const pending = [...seeds];
  while (pending.length > 0) {
    const claimId = pending.pop();
    if (claimId === void 0 || closure.has(claimId)) continue;
    closure.add(claimId);
    const claim = claimsById.get(claimId);
    if (!claim) continue;
    for (const parentId of stringArray4(claim.parent_claim_ids)) pending.push(parentId);
  }
  return closure;
}
function isBehaviorSourceClaim(claim) {
  return claim.level === "E3" && claim.kind === "requirement" || claim.level === "E1" && claim.kind === "assumption";
}
function isE2ModelElement(claim) {
  return claim.level === "E2" && claim.kind === "model-element" && claim.derivation_target === "model-element";
}
function canonicalView(view) {
  const canonical = (
    /** @type {{views: Record<string, unknown>[]}} */
    JSON.parse(canonicalStringify({ views: [view] }))
  );
  return canonical.views[0];
}
function relationEndpointKind2(viewType) {
  if (viewType === "flow") return "flow-node";
  if (viewType === "state") return "state";
  const kinds = VIEW_ELEMENT_KINDS2[
    /** @type {keyof typeof VIEW_ELEMENT_KINDS} */
    viewType
  ];
  return kinds?.length === 1 ? kinds[0] : null;
}
function escapePointerSegment3(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function duplicateStrings2(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort(compareCodePoints6);
}
function scopesOverlap(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}
function validateBehaviorViews(evidenceGraph, artifact) {
  const graph = isObject5(evidenceGraph) ? evidenceGraph : {};
  const input = isObject5(artifact) ? artifact : {};
  const claimsById = acceptedClaims(graph);
  const views = objectArray6(input.views);
  const facts = factLedger(graph);
  const runScope = typeof graph.runScope === "string" ? graph.runScope : typeof graph.run_scope === "string" ? graph.run_scope : null;
  const diagnostics = [];
  const validViews = /* @__PURE__ */ new Map();
  const viewModeledClaims = /* @__PURE__ */ new Map();
  const claimViews = /* @__PURE__ */ new Map();
  function validateSupport(owner, path4, viewScope, supportCode) {
    const sourceIds = stringArray4(owner.source_claim_ids);
    const modelIds = stringArray4(owner.model_refs);
    const acceptedIds = [];
    let valid = true;
    sourceIds.forEach((claimId, index) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${path4}/source_claim_ids/${escapePointerSegment3(claimId || String(index))}`;
      if (!claim) {
        diagnostics.push(diagnostic9("reference", "SOURCE_CLAIM_DANGLING", claimPath, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim)) {
        diagnostics.push(diagnostic9("classification", "SOURCE_CLAIM_NOT_BEHAVIOR_EVIDENCE", claimPath, `source claim "${claimId}" cannot support a formal behavior element`));
        valid = false;
      } else if (typeof claim.scope === "string" && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic9("classification", "SOURCE_CLAIM_SCOPE_MISMATCH", claimPath, `source claim "${claimId}" does not cover view scope "${viewScope}"`));
        valid = false;
      } else acceptedIds.push(claimId);
    });
    modelIds.forEach((claimId, index) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${path4}/model_refs/${escapePointerSegment3(claimId || String(index))}`;
      if (!claim) {
        diagnostics.push(diagnostic9("reference", "MODEL_REF_DANGLING", claimPath, `model ref "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isE2ModelElement(claim)) {
        diagnostics.push(diagnostic9("classification", "MODEL_REF_NOT_E2_MODEL_ELEMENT", claimPath, `model ref "${claimId}" is not an accepted E2 model element`));
        valid = false;
      } else if (typeof claim.scope === "string" && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic9("classification", "MODEL_REF_SCOPE_MISMATCH", claimPath, `model ref "${claimId}" does not cover view scope "${viewScope}"`));
        valid = false;
      } else acceptedIds.push(claimId);
    });
    if (acceptedIds.length === 0) {
      diagnostics.push(diagnostic9("traceability", supportCode, path4, "every modeled item requires an accepted Source Claim or E2 model element"));
      valid = false;
    }
    return { valid, claimIds: claimClosure(claimsById, acceptedIds) };
  }
  views.forEach((view, viewIndex) => {
    const viewId = typeof view.view_id === "string" ? view.view_id : "";
    const path4 = `/views/${escapePointerSegment3(viewId || String(viewIndex))}`;
    const type = typeof view.type === "string" ? view.type : "";
    const scope = typeof view.scope === "string" ? view.scope : "";
    let valid = viewId.length > 0 && scope.length > 0;
    if (!VIEW_TYPES.has(type)) {
      diagnostics.push(diagnostic9("classification", "VIEW_TYPE_UNSUPPORTED", `${path4}/type`, `view type "${type}" is outside the closed behavior-view set`));
      valid = false;
    }
    if (runScope !== null && scope.length > 0 && !scopesOverlap(runScope, scope)) {
      diagnostics.push(diagnostic9(
        "classification",
        "VIEW_SCOPE_DISJOINT",
        `${path4}/scope`,
        `view scope "${scope}" does not overlap run scope "${runScope}"`
      ));
      valid = false;
    }
    for (const [claimIndex, claimId] of stringArray4(view.source_claim_ids).entries()) {
      const claim = claimsById.get(claimId);
      const claimPath = `${path4}/source_claim_ids/${escapePointerSegment3(claimId || String(claimIndex))}`;
      if (!claim) {
        diagnostics.push(diagnostic9("reference", "SOURCE_CLAIM_DANGLING", claimPath, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) {
        diagnostics.push(diagnostic9("classification", "VIEW_SOURCE_CLAIM_INVALID", claimPath, `source claim "${claimId}" cannot support a formal behavior view`));
        valid = false;
      } else if (typeof claim.scope === "string" && !scopeContains(claim.scope, scope)) {
        diagnostics.push(diagnostic9("classification", "SOURCE_CLAIM_SCOPE_MISMATCH", claimPath, `source claim "${claimId}" does not cover view scope "${scope}"`));
        valid = false;
      }
    }
    const elements = objectArray6(view.elements);
    const elementIds = /* @__PURE__ */ new Set();
    const elementKinds = /* @__PURE__ */ new Map();
    const modeledItems = [];
    elements.forEach((element, elementIndex) => {
      const elementId = typeof element.element_id === "string" ? element.element_id : "";
      const elementPath = `${path4}/elements/${escapePointerSegment3(elementId || String(elementIndex))}`;
      if (elementId.length === 0 || elementIds.has(elementId)) {
        diagnostics.push(diagnostic9("schema", "VIEW_ELEMENT_ID_INVALID", `${elementPath}/element_id`, "element_id must be nonblank and unique inside its view"));
        valid = false;
      }
      elementIds.add(elementId);
      const kind = typeof element.kind === "string" ? element.kind : "";
      elementKinds.set(elementId, kind);
      if (!VIEW_TYPES.has(type) || !VIEW_ELEMENT_KINDS2[
        /** @type {keyof typeof VIEW_ELEMENT_KINDS} */
        type
      ].includes(kind)) {
        diagnostics.push(diagnostic9("classification", "VIEW_ELEMENT_KIND_MISMATCH", `${elementPath}/kind`, `element kind "${kind}" is not legal in a ${type} view`));
        valid = false;
      }
      const support = validateSupport(element, elementPath, scope, "VIEW_ELEMENT_SUPPORT_REQUIRED");
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
      if (kind === "input-domain") {
        const classIds = objectArray6(element.classes).flatMap((item) => typeof item.class_id === "string" ? [item.class_id] : []);
        for (const classId of duplicateStrings2(classIds)) {
          diagnostics.push(diagnostic9(
            "schema",
            "INPUT_CLASS_ID_DUPLICATE",
            `${elementPath}/classes/${escapePointerSegment3(classId)}`,
            `input-domain class_id "${classId}" must be unique within element "${elementId}"`
          ));
          valid = false;
        }
      }
    });
    elements.forEach((element, elementIndex) => {
      const elementId = typeof element.element_id === "string" ? element.element_id : "";
      const elementPath = `${path4}/elements/${escapePointerSegment3(elementId || String(elementIndex))}`;
      if (element.kind === "flow-edge") {
        for (const field of ["from_element_id", "to_element_id"]) {
          const endpoint = element[field];
          if (typeof endpoint !== "string" || !elementIds.has(endpoint)) {
            diagnostics.push(diagnostic9("reference", "FLOW_EDGE_ENDPOINT_DANGLING", `${elementPath}/${field}`, `flow edge endpoint "${String(endpoint)}" is not in its view`));
            valid = false;
          } else if (elementKinds.get(endpoint) !== "flow-node") {
            diagnostics.push(diagnostic9("reference", "FLOW_EDGE_ENDPOINT_TYPE_INVALID", `${elementPath}/${field}`, `flow edge endpoint "${endpoint}" must reference a flow-node`));
            valid = false;
          }
        }
      }
    });
    if (type === "state") {
      const stateNames = elements.flatMap((element) => element.kind === "state" && typeof element.state === "string" ? [element.state] : []);
      const declaredStates = new Set(stateNames);
      for (const stateName of duplicateStrings2(stateNames)) {
        diagnostics.push(diagnostic9(
          "schema",
          "STATE_NAME_DUPLICATE",
          `${path4}/state_names/${escapePointerSegment3(stateName)}`,
          `state name "${stateName}" must be unique within its state view`
        ));
        valid = false;
      }
      elements.forEach((element, elementIndex) => {
        if (element.kind !== "transition") return;
        const elementId = typeof element.element_id === "string" ? element.element_id : "";
        const elementPath = `${path4}/elements/${escapePointerSegment3(elementId || String(elementIndex))}`;
        for (const field of ["from_state", "to_state"]) {
          const state = element[field];
          if (typeof state !== "string" || !declaredStates.has(state)) {
            diagnostics.push(diagnostic9("reference", "STATE_TRANSITION_STATE_DANGLING", `${elementPath}/${field}`, `transition state "${String(state)}" is not declared by this view`));
            valid = false;
          }
        }
      });
    }
    objectArray6(view.relations).forEach((relation, relationIndex) => {
      const relationId = typeof relation.relation_id === "string" ? relation.relation_id : "";
      const relationPath = `${path4}/relations/${escapePointerSegment3(relationId || String(relationIndex))}`;
      const support = validateSupport(relation, relationPath, scope, "VIEW_RELATION_SUPPORT_REQUIRED");
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
      for (const field of ["from_element_id", "to_element_id"]) {
        const endpoint = relation[field];
        if (typeof endpoint !== "string" || !elementIds.has(endpoint)) {
          diagnostics.push(diagnostic9("reference", "VIEW_RELATION_ENDPOINT_DANGLING", `${relationPath}/${field}`, `relation endpoint "${String(endpoint)}" is not in its view`));
          valid = false;
        } else {
          const expectedKind = relationEndpointKind2(type);
          if (expectedKind !== null && elementKinds.get(endpoint) !== expectedKind) {
            diagnostics.push(diagnostic9("reference", "VIEW_RELATION_ENDPOINT_TYPE_INVALID", `${relationPath}/${field}`, `relation endpoint "${endpoint}" must reference a ${expectedKind}`));
            valid = false;
          }
        }
      }
    });
    if (valid && !validViews.has(viewId)) {
      validViews.set(viewId, canonicalView(view));
      const modeledClaims = /* @__PURE__ */ new Set();
      for (const item of modeledItems) {
        for (const claimId of item.claims) {
          modeledClaims.add(claimId);
          const route = claimViews.get(claimId) ?? /* @__PURE__ */ new Set();
          route.add(viewId);
          claimViews.set(claimId, route);
        }
      }
      viewModeledClaims.set(viewId, modeledClaims);
    }
  });
  objectArray6(input.interaction_candidates).forEach((candidate, candidateIndex) => {
    if (candidate.disposition !== "formal-view") return;
    const candidateId = typeof candidate.candidate_id === "string" && candidate.candidate_id.length > 0 ? escapePointerSegment3(candidate.candidate_id) : String(candidateIndex);
    const candidatePath2 = `/interaction_candidates/${candidateId}`;
    const sourceIds = stringArray4(candidate.source_claim_ids);
    if (sourceIds.length === 0) diagnostics.push(diagnostic9(
      "classification",
      "FORMAL_CANDIDATE_EVIDENCE_REQUIRED",
      `${candidatePath2}/source_claim_ids`,
      "a formal interaction candidate requires accepted source evidence"
    ));
    const formalViewId = typeof candidate.formal_view_id === "string" ? candidate.formal_view_id : "";
    const submittedView = views.find((view) => view.view_id === formalViewId);
    const formalView = validViews.get(formalViewId);
    if (!submittedView) diagnostics.push(diagnostic9(
      "reference",
      "FORMAL_INTERACTION_VIEW_DANGLING",
      `${candidatePath2}/formal_view_id`,
      `formal interaction view "${formalViewId}" does not exist`
    ));
    else if (!formalView) diagnostics.push(diagnostic9(
      "traceability",
      "FORMAL_INTERACTION_VIEW_INVALID",
      `${candidatePath2}/formal_view_id`,
      `formal interaction view "${formalViewId}" did not pass behavior-view validation`
    ));
    else if (objectArray6(formalView.elements).length + objectArray6(formalView.relations).length === 0) diagnostics.push(diagnostic9(
      "traceability",
      "FORMAL_INTERACTION_VIEW_EMPTY",
      `${candidatePath2}/formal_view_id`,
      "a formal interaction candidate must route to a nonempty behavior view"
    ));
    const modeledClaims = viewModeledClaims.get(formalViewId) ?? /* @__PURE__ */ new Set();
    const targetScope = formalView && typeof formalView.scope === "string" ? formalView.scope : "";
    sourceIds.forEach((claimId, claimIndex) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${candidatePath2}/source_claim_ids/${escapePointerSegment3(claimId || String(claimIndex))}`;
      if (!claim) diagnostics.push(diagnostic9(
        "reference",
        "SOURCE_CLAIM_DANGLING",
        claimPath,
        `source claim "${claimId}" is not in the accepted evidence graph`
      ));
      else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) diagnostics.push(diagnostic9(
        "classification",
        "FORMAL_CANDIDATE_EVIDENCE_INVALID",
        claimPath,
        `source claim "${claimId}" cannot support a formal interaction`
      ));
      else {
        if (targetScope.length > 0 && (typeof claim.scope !== "string" || !scopeContains(claim.scope, targetScope))) diagnostics.push(diagnostic9(
          "classification",
          "FORMAL_CANDIDATE_SCOPE_MISMATCH",
          claimPath,
          `source claim "${claimId}" does not cover formal view scope "${targetScope}"`
        ));
        if (formalView && !modeledClaims.has(claimId)) diagnostics.push(diagnostic9(
          "traceability",
          "FORMAL_CANDIDATE_CLAIM_UNMODELED",
          claimPath,
          `formal view "${formalViewId}" does not model source claim "${claimId}"`
        ));
      }
    });
  });
  const factRoutes = [];
  for (const fact of facts) {
    const factId = typeof fact.fact_id === "string" ? fact.fact_id : "";
    const primaryClaim = typeof fact.claim_id === "string" ? claimsById.get(fact.claim_id) : void 0;
    if (!primaryClaim || primaryClaim.kind !== "requirement" && primaryClaim.kind !== "assumption" || fact.status === "diagnostic") continue;
    const factClaimIds = [.../* @__PURE__ */ new Set([...typeof fact.claim_id === "string" ? [fact.claim_id] : [], ...stringArray4(fact.source_claim_ids)])];
    const viewIds = [...new Set(factClaimIds.flatMap((claimId) => [...claimViews.get(claimId) ?? []]))].sort(compareCodePoints6);
    if (viewIds.length === 0) {
      const claimScope = typeof primaryClaim.scope === "string" ? primaryClaim.scope : "";
      const overlapsRun = runScope === null || claimScope.length === 0 || scopesOverlap(runScope, claimScope);
      diagnostics.push(diagnostic9(
        "traceability",
        overlapsRun ? "NORMATIVE_FACT_UNMODELED" : "OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED",
        `/facts/${factId}`,
        overlapsRun ? `in-scope normative fact "${factId}" is not modeled by a valid behavior view` : `out-of-scope normative fact "${factId}" is not modeled; Blocked/NotApplicable routing is owned by the Test Obligations stage`
      ));
      continue;
    }
    factRoutes.push({ fact_id: factId, route_type: "views", view_ids: viewIds });
  }
  const sortedViews = new Map([...validViews].sort(([left], [right]) => compareCodePoints6(left, right)));
  factRoutes.sort((left, right) => compareCodePoints6(
    /** @type {string} */
    left.fact_id,
    /** @type {string} */
    right.fact_id
  ));
  return { viewsById: sortedViews, factRoutes, diagnostics: sortDiagnostics2(diagnostics) };
}

// src/obligations/registry.mjs
var RISK_LEVELS = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
var OBLIGATION_VIEW_TYPES = Object.freeze([
  "flow",
  "decision",
  "state",
  "input-domain",
  "role",
  "timing",
  "integration"
]);
var OBLIGATION_VIEW_TYPE_SET = new Set(OBLIGATION_VIEW_TYPES);
function isObject6(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray7(value) {
  return Array.isArray(value) ? value.filter(isObject6) : [];
}
function compareCodePoints7(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function sortedStrings(value, unique = false) {
  const strings3 = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  return (unique ? [...new Set(strings3)] : [...strings3]).sort(compareCodePoints7);
}
function claimsByIdFrom(context) {
  if (!isObject6(context)) return /* @__PURE__ */ new Map();
  const direct = context.claimsById;
  if (direct instanceof Map) return (
    /** @type {Map<string, Record<string, unknown>>} */
    direct
  );
  const graph = isObject6(context.evidenceGraph) ? context.evidenceGraph : {};
  return graph.claimsById instanceof Map ? (
    /** @type {Map<string, Record<string, unknown>>} */
    graph.claimsById
  ) : /* @__PURE__ */ new Map();
}
function keyedValue(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject6(container) && Object.hasOwn(container, key) ? container[key] : void 0;
}
function elementEvidenceRefs(element) {
  return sortedStrings([
    ...sortedStrings(element.source_claim_ids),
    ...sortedStrings(element.model_refs)
  ], true);
}
function isOracleEvidence(claim) {
  if (claim.level === "E3" && claim.kind === "requirement") return true;
  if (claim.level === "E1" && claim.kind === "assumption") return true;
  return claim.level === "E2" && claim.kind === "expected-value" && claim.derivation_target === "expected-value" && (claim.derivation_kind === "formula" || claim.derivation_kind === "decision-table-instance");
}
function acceptedClaimClosure(claimsById, roots) {
  const closure = /* @__PURE__ */ new Set();
  const state = /* @__PURE__ */ new Map();
  for (const root of roots) {
    if (state.get(root) === 2) continue;
    if (!claimsById.has(root)) return null;
    const stack = [{
      claimId: root,
      parents: sortedStrings(claimsById.get(root)?.parent_claim_ids, true),
      next: 0
    }];
    state.set(root, 1);
    closure.add(root);
    while (stack.length > 0) {
      const frame = (
        /** @type {{claimId: string, parents: string[], next: number}} */
        stack.at(-1)
      );
      if (frame.next >= frame.parents.length) {
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      if (!claimsById.has(parentId)) return null;
      closure.add(parentId);
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return null;
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: sortedStrings(claimsById.get(parentId)?.parent_claim_ids, true),
        next: 0
      });
    }
  }
  return closure;
}
function acceptedOracleRelevance(claimsById, roots, targetIds) {
  const state = /* @__PURE__ */ new Map();
  const reachesTarget = /* @__PURE__ */ new Map();
  for (const root of roots) {
    if (state.get(root) === 2) continue;
    if (!claimsById.has(root)) return null;
    const stack = [{
      claimId: root,
      parents: sortedStrings(claimsById.get(root)?.parent_claim_ids, true),
      next: 0
    }];
    state.set(root, 1);
    while (stack.length > 0) {
      const frame = (
        /** @type {{claimId: string, parents: string[], next: number}} */
        stack.at(-1)
      );
      if (frame.next >= frame.parents.length) {
        reachesTarget.set(frame.claimId, targetIds.has(frame.claimId) || frame.parents.some(
          (parentId2) => reachesTarget.get(parentId2) === true
        ));
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      if (!claimsById.has(parentId)) return null;
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return null;
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: sortedStrings(claimsById.get(parentId)?.parent_claim_ids, true),
        next: 0
      });
    }
  }
  return new Map(roots.map((root) => [root, reachesTarget.get(root) === true]));
}
function qualifyViewElementRef(viewId, elementId) {
  return `${encodeURIComponent(viewId)}#${encodeURIComponent(elementId)}`;
}
function parseQualifiedViewElementRef(ref) {
  if (typeof ref !== "string") return null;
  const separator = ref.indexOf("#");
  if (separator <= 0 || separator !== ref.lastIndexOf("#") || separator === ref.length - 1) return null;
  try {
    const viewId = decodeURIComponent(ref.slice(0, separator));
    const elementId = decodeURIComponent(ref.slice(separator + 1));
    if (viewId.length === 0 || elementId.length === 0 || qualifyViewElementRef(viewId, elementId) !== ref) return null;
    return { viewId, elementId };
  } catch {
    return null;
  }
}
function qualifiedElementRef(view, element) {
  return qualifyViewElementRef(String(view.view_id), String(element.element_id));
}
function buildObligationSeed(input) {
  const { view, primaryElement, context, identity } = input;
  if (!isObject6(context)) throw new TypeError("obligation compilation context must be an object");
  const primaryId = typeof primaryElement.element_id === "string" ? primaryElement.element_id : "";
  const risk = keyedValue(context.riskByElementId, primaryId);
  if (typeof risk !== "string" || !RISK_LEVELS.has(risk)) {
    throw new TypeError(`compilation context has no valid risk for element "${primaryId}"`);
  }
  const oracleRefs = sortedStrings(keyedValue(context.requiredOracleRefsByElementId, primaryId), true);
  const capabilities = sortedStrings(keyedValue(context.requiredCapabilitiesByElementId, primaryId), true);
  const claimsById = claimsByIdFrom(context);
  const primaryEvidenceRefs = elementEvidenceRefs(primaryElement);
  const primaryEvidenceSet = new Set(primaryEvidenceRefs);
  const primaryEvidenceClosure = acceptedClaimClosure(claimsById, primaryEvidenceRefs);
  const indirectOracleRefs = [];
  for (const claimId of oracleRefs) {
    const claim = claimsById.get(claimId);
    if (!claim || !isOracleEvidence(claim)) {
      throw new TypeError(`Oracle claim "${claimId}" is not accepted Oracle evidence for element "${primaryId}"`);
    }
    if (typeof claim.scope !== "string" || !scopeContains(claim.scope, String(view.scope))) {
      throw new TypeError(`Oracle claim "${claimId}" does not cover obligation scope "${String(view.scope)}"`);
    }
    if (primaryEvidenceClosure === null) {
      throw new TypeError(`Oracle claim "${claimId}" cannot use malformed evidence ancestry for element "${primaryId}"`);
    }
    if (!primaryEvidenceSet.has(claimId)) indirectOracleRefs.push(claimId);
  }
  const oracleRelevance = primaryEvidenceClosure === null ? null : acceptedOracleRelevance(claimsById, indirectOracleRefs, primaryEvidenceClosure);
  for (const claimId of indirectOracleRefs) {
    if (oracleRelevance === null || oracleRelevance.get(claimId) !== true) {
      throw new TypeError(`Oracle claim "${claimId}" is not validated evidence for element "${primaryId}"`);
    }
  }
  const elements = [...new Map(input.supportingElements.map((element) => [element.element_id, element])).values()];
  const sourceClaimIds = sortedStrings([
    ...elements.flatMap(elementEvidenceRefs),
    ...oracleRefs,
    ...input.extraSourceClaimIds ?? []
  ], true);
  for (const claimId of [...sourceClaimIds, ...oracleRefs]) {
    if (!claimsById.has(claimId)) throw new TypeError(`compilation evidence context does not contain claim "${claimId}"`);
  }
  if (sourceClaimIds.length === 0) throw new TypeError(`obligation element "${primaryId}" has no accepted evidence`);
  const viewElementRefs = sortedStrings(elements.map((element) => qualifiedElementRef(view, element)), true);
  return {
    obligation_id: stableId("obligation", identity),
    kind: String(view.type),
    risk,
    scope: String(view.scope),
    source_claim_ids: sourceClaimIds,
    view_element_refs: viewElementRefs,
    required_oracle_refs: oracleRefs,
    required_capabilities: capabilities
  };
}
function finishObligationSeeds(seeds, label) {
  const seen = /* @__PURE__ */ new Set();
  for (const seed of seeds) {
    if (seen.has(seed.obligation_id)) throw new TypeError(`duplicate ${label} obligation semantic signature`);
    seen.add(seed.obligation_id);
  }
  return [...seeds].sort((left, right) => compareCodePoints7(left.obligation_id, right.obligation_id)).map((seed) => ({
    ...seed,
    source_claim_ids: [...seed.source_claim_ids],
    view_element_refs: [...seed.view_element_refs],
    required_oracle_refs: [...seed.required_oracle_refs],
    required_capabilities: [...seed.required_capabilities]
  }));
}
function assertViewType(view, expectedType) {
  if (!isObject6(view) || view.type !== expectedType || typeof view.view_id !== "string" || typeof view.scope !== "string" || !Array.isArray(view.elements)) {
    throw new TypeError(`expected a validated ${expectedType} behavior view`);
  }
}
function createObligationRegistry() {
  const strategies = /* @__PURE__ */ new Map();
  const registry = {
    /** @param {string} viewType @param {ObligationCompiler} compile */
    registerObligationStrategy(viewType, compile8) {
      if (typeof viewType !== "string" || viewType.length === 0) throw new TypeError("obligation strategy view type must be nonblank");
      if (!OBLIGATION_VIEW_TYPE_SET.has(viewType)) throw new TypeError(`unsupported obligation strategy view type "${viewType}"`);
      if (typeof compile8 !== "function") throw new TypeError(`obligation strategy for view type "${viewType}" must be a function`);
      if (strategies.has(viewType)) throw new TypeError(`duplicate obligation strategy for view type "${viewType}"`);
      strategies.set(viewType, compile8);
      return registry;
    },
    /** @param {Record<string, unknown>} view @param {unknown} context */
    compile(view, context) {
      const viewType = typeof view?.type === "string" ? view.type : "";
      const compile8 = strategies.get(viewType);
      if (!compile8) throw new TypeError(`no obligation strategy registered for view type "${viewType}"`);
      return compile8(view, context);
    },
    registeredViewTypes() {
      return [...strategies.keys()].sort(compareCodePoints7);
    }
  };
  return Object.freeze(registry);
}

// src/obligations/decision.mjs
function compile(view, context) {
  assertViewType(view, "decision");
  const rules = objectArray7(view.elements).filter((element) => element.kind === "decision-rule");
  const seeds = rules.map((rule) => buildObligationSeed({
    view,
    primaryElement: rule,
    supportingElements: [rule],
    context,
    identity: {
      kind: "decision",
      responsibility: "rule",
      scope: view.scope,
      rule: {
        conditions: sortedStrings(rule.conditions),
        result: rule.result,
        priority: rule.priority
      }
    }
  }));
  return finishObligationSeeds(seeds, "decision");
}

// src/obligations/flow.mjs
function nodeIdentity(node) {
  return {
    kind: "flow-node",
    element_id: node.element_id,
    node_type: node.node_type,
    label: node.label
  };
}
function edgeIdentity(edge, from, to) {
  return {
    kind: "flow-edge",
    from: nodeIdentity(from),
    to: nodeIdentity(to),
    condition: edge.condition,
    result: edge.result
  };
}
function finishOrder(graph, nodes) {
  const visited = /* @__PURE__ */ new Set();
  const finished = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack = [{ node: start, next: 0, neighbors: graph.get(start) ?? [] }];
    while (stack.length > 0) {
      const frame = (
        /** @type {{node: string, next: number, neighbors: string[]}} */
        stack.at(-1)
      );
      if (frame.next >= frame.neighbors.length) {
        finished.push(frame.node);
        stack.pop();
        continue;
      }
      const neighbor = frame.neighbors[frame.next];
      frame.next += 1;
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      stack.push({ node: neighbor, next: 0, neighbors: graph.get(neighbor) ?? [] });
    }
  }
  return finished;
}
function loopEdgeIds(nodes, edges) {
  const nodeIds = nodes.flatMap((node) => typeof node.element_id === "string" ? [node.element_id] : []).sort(compareCodePoints7);
  const graph = new Map(nodeIds.map((nodeId) => [
    nodeId,
    /** @type {string[]} */
    []
  ]));
  const reverse = new Map(nodeIds.map((nodeId) => [
    nodeId,
    /** @type {string[]} */
    []
  ]));
  for (const edge of edges) {
    const from = String(edge.from_element_id);
    const to = String(edge.to_element_id);
    graph.get(from)?.push(to);
    reverse.get(to)?.push(from);
  }
  for (const neighbors of [...graph.values(), ...reverse.values()]) neighbors.sort(compareCodePoints7);
  const order = finishOrder(graph, nodeIds);
  const componentByNode = /* @__PURE__ */ new Map();
  const componentSizes = /* @__PURE__ */ new Map();
  let component = 0;
  for (const start of order.reverse()) {
    if (componentByNode.has(start)) continue;
    let size = 0;
    const pending = [start];
    componentByNode.set(start, component);
    while (pending.length > 0) {
      const current = (
        /** @type {string} */
        pending.pop()
      );
      size += 1;
      for (const neighbor of reverse.get(current) ?? []) {
        if (componentByNode.has(neighbor)) continue;
        componentByNode.set(neighbor, component);
        pending.push(neighbor);
      }
    }
    componentSizes.set(component, size);
    component += 1;
  }
  return new Set(edges.flatMap((edge) => {
    const from = String(edge.from_element_id);
    const to = String(edge.to_element_id);
    const sourceComponent = componentByNode.get(from);
    const inCycle = sourceComponent !== void 0 && sourceComponent === componentByNode.get(to) && (from === to || (componentSizes.get(sourceComponent) ?? 0) > 1);
    return inCycle && typeof edge.element_id === "string" ? [edge.element_id] : [];
  }));
}
function declaredMaximum(context, elementId) {
  if (!isObject6(context)) return null;
  const definitions = context.loopMaximumsByElementId;
  const definition = definitions instanceof Map ? definitions.get(elementId) : isObject6(definitions) ? definitions[elementId] : void 0;
  if (!isObject6(definition) || !Number.isInteger(definition.maximum) || Number(definition.maximum) <= 1) return null;
  const sourceClaimIds = sortedStrings(definition.source_claim_ids, true);
  const claimsById = claimsByIdFrom(context);
  if (sourceClaimIds.length === 0 || sourceClaimIds.some((claimId) => !claimsById.has(claimId))) return null;
  return { maximum: Number(definition.maximum), sourceClaimIds };
}
function compile2(view, context) {
  assertViewType(view, "flow");
  const elements = objectArray7(view.elements);
  const nodes = elements.filter((element) => element.kind === "flow-node");
  const edges = elements.filter((element) => element.kind === "flow-edge");
  const nodesById = new Map(nodes.map((node) => [node.element_id, node]));
  const loopIds = loopEdgeIds(nodes, edges);
  const seeds = [];
  for (const edge of edges) {
    const edgeId = String(edge.element_id);
    const from = nodesById.get(edge.from_element_id);
    const to = nodesById.get(edge.to_element_id);
    if (!from || !to) throw new TypeError(`flow edge "${edgeId}" is not from a validated view`);
    const semanticEdge = edgeIdentity(edge, from, to);
    if (!loopIds.has(edgeId)) {
      seeds.push(buildObligationSeed({
        view,
        primaryElement: edge,
        supportingElements: [edge, from, to],
        context,
        identity: { kind: "flow", responsibility: "edge", scope: view.scope, edge: semanticEdge }
      }));
      continue;
    }
    const maximum = declaredMaximum(context, edgeId);
    const iterations = [
      { value: 0, maximumClaimIds: (
        /** @type {string[]} */
        []
      ) },
      { value: 1, maximumClaimIds: (
        /** @type {string[]} */
        []
      ) },
      ...maximum ? [{ value: maximum.maximum, maximumClaimIds: maximum.sourceClaimIds }] : []
    ];
    for (const iteration of iterations) seeds.push(buildObligationSeed({
      view,
      primaryElement: edge,
      supportingElements: [edge, from, to],
      context,
      extraSourceClaimIds: iteration.maximumClaimIds,
      identity: {
        kind: "flow",
        responsibility: "loop-iterations",
        scope: view.scope,
        iterations: iteration.value,
        edge: semanticEdge
      }
    }));
  }
  for (const node of nodes) {
    if (node.node_type !== "end" && node.node_type !== "exception") continue;
    seeds.push(buildObligationSeed({
      view,
      primaryElement: node,
      supportingElements: [node],
      context,
      identity: {
        kind: "flow",
        responsibility: node.node_type === "end" ? "terminal" : "exception",
        scope: view.scope,
        node: nodeIdentity(node)
      }
    }));
  }
  return finishObligationSeeds(seeds, "flow");
}

// src/obligations/responsibility.mjs
var BINDING_KEYS = [
  "required_capabilities",
  "required_oracle_refs",
  "responsibility_key",
  "risk",
  "source_claim_ids"
];
var RISK_LEVELS2 = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
function responsibilityKey(strategy, elementId, semanticSubresponsibility) {
  if (typeof strategy !== "string" || strategy.trim().length === 0 || typeof elementId !== "string" || elementId.trim().length === 0 || strategy.trim() !== strategy || elementId.trim() !== elementId || !isObject6(semanticSubresponsibility)) {
    throw new TypeError("responsibility key requires strategy, owning element ID, and semantic responsibility");
  }
  return stableId("responsibility", {
    strategy,
    element_id: elementId,
    semantic_subresponsibility: semanticSubresponsibility
  });
}
function denseUniqueStrings(value, label, nonempty = false) {
  if (!Array.isArray(value) || nonempty && value.length === 0) {
    throw new TypeError(`${label} must be ${nonempty ? "a nonempty" : "an"} array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must be a dense array`);
    if (typeof value[index] !== "string" || value[index].trim().length === 0) {
      throw new TypeError(`${label} must contain nonblank strings`);
    }
    if (value[index].trim() !== value[index]) {
      throw new TypeError(`${label} must contain unpadded strings`);
    }
  }
  const strings3 = (
    /** @type {string[]} */
    value
  );
  if (new Set(strings3).size !== strings3.length) throw new TypeError(`${label} must not contain duplicates`);
  return sortedStrings(strings3);
}
function assertExactKeys(object, keys, label) {
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}
function isResponsibilityEvidence(claim) {
  return claim.level === "E3" && claim.kind === "requirement" || claim.level === "E1" && claim.kind === "assumption" || claim.level === "E2" && claim.kind === "model-element" && claim.derivation_target === "model-element";
}
function owningEvidenceClosure(claimsById, element) {
  const closure = /* @__PURE__ */ new Set();
  const state = /* @__PURE__ */ new Map();
  for (const root of elementEvidenceRefs(element)) {
    if (!claimsById.has(root)) return null;
    if (state.get(root) === 2) continue;
    const stack = [{
      claimId: root,
      parents: sortedStrings(claimsById.get(root)?.parent_claim_ids, true),
      next: 0
    }];
    state.set(root, 1);
    closure.add(root);
    while (stack.length > 0) {
      const frame = (
        /** @type {{claimId: string, parents: string[], next: number}} */
        stack.at(-1)
      );
      if (frame.next >= frame.parents.length) {
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      if (!claimsById.has(parentId)) return null;
      closure.add(parentId);
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return null;
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: sortedStrings(claimsById.get(parentId)?.parent_claim_ids, true),
        next: 0
      });
    }
  }
  return closure;
}
function bindingIndex(context) {
  if (!isObject6(context) || !Array.isArray(context.responsibilityBindings)) {
    throw new TypeError("compilation context must contain a dense responsibilityBindings array");
  }
  const rawBindings = context.responsibilityBindings;
  const bindings = /* @__PURE__ */ new Map();
  for (let index = 0; index < rawBindings.length; index += 1) {
    if (!Object.hasOwn(rawBindings, index)) {
      throw new TypeError("responsibilityBindings must be a dense array");
    }
    const raw = rawBindings[index];
    if (!isObject6(raw)) throw new TypeError(`responsibility binding ${index} must be an object`);
    assertExactKeys(raw, BINDING_KEYS, `responsibility binding ${index}`);
    if (typeof raw.responsibility_key !== "string" || raw.responsibility_key.trim().length === 0) {
      throw new TypeError(`responsibility binding ${index} must have a nonblank key`);
    }
    if (raw.responsibility_key.trim() !== raw.responsibility_key) {
      throw new TypeError(`responsibility binding ${index} must have an unpadded key`);
    }
    if (bindings.has(raw.responsibility_key)) {
      throw new TypeError(`duplicate responsibility binding "${raw.responsibility_key}"`);
    }
    if (typeof raw.risk !== "string" || !RISK_LEVELS2.has(raw.risk)) {
      throw new TypeError(`responsibility binding "${raw.responsibility_key}" has invalid risk`);
    }
    bindings.set(raw.responsibility_key, {
      responsibility_key: raw.responsibility_key,
      risk: raw.risk,
      source_claim_ids: denseUniqueStrings(
        raw.source_claim_ids,
        `responsibility binding "${raw.responsibility_key}" source_claim_ids`,
        true
      ),
      required_oracle_refs: denseUniqueStrings(
        raw.required_oracle_refs,
        `responsibility binding "${raw.responsibility_key}" required_oracle_refs`
      ),
      required_capabilities: denseUniqueStrings(
        raw.required_capabilities,
        `responsibility binding "${raw.responsibility_key}" required_capabilities`
      )
    });
  }
  return bindings;
}
function compileResponsibilitySeeds(view, context, descriptors, label) {
  const bindings = bindingIndex(context);
  const descriptorKeys = /* @__PURE__ */ new Set();
  for (const descriptor of descriptors) {
    if (descriptorKeys.has(descriptor.key)) {
      throw new TypeError(`duplicate ${label} responsibility key "${descriptor.key}"`);
    }
    descriptorKeys.add(descriptor.key);
  }
  for (const key of bindings.keys()) {
    if (!descriptorKeys.has(key)) throw new TypeError(`unknown responsibility binding "${key}"`);
  }
  const claimsById = claimsByIdFrom(context);
  const owningClosureByElementId = /* @__PURE__ */ new Map();
  const seeds = [];
  for (const descriptor of descriptors) {
    const binding = bindings.get(descriptor.key);
    if (!binding) {
      if (descriptor.required) throw new TypeError(`missing responsibility binding "${descriptor.key}"`);
      continue;
    }
    const elementId = String(descriptor.element.element_id);
    let closureEntry = owningClosureByElementId.get(elementId);
    if (!closureEntry) {
      closureEntry = { closure: owningEvidenceClosure(claimsById, descriptor.element) };
      owningClosureByElementId.set(elementId, closureEntry);
    }
    const { closure } = closureEntry;
    if (closure === null) {
      throw new TypeError(`owning element evidence is malformed for responsibility "${descriptor.key}"`);
    }
    for (const claimId of binding.source_claim_ids) {
      const claim = claimsById.get(claimId);
      if (!claim || !closure.has(claimId)) {
        throw new TypeError(`claim "${claimId}" is not validated support of owning element`);
      }
      if (!isResponsibilityEvidence(claim)) {
        throw new TypeError(`claim "${claimId}" is not accepted responsibility evidence`);
      }
      if (typeof claim.scope !== "string" || !scopeContains(claim.scope, String(view.scope))) {
        throw new TypeError(`claim "${claimId}" does not cover responsibility scope`);
      }
    }
    const responsibilityElement = {
      ...descriptor.element,
      source_claim_ids: [...binding.source_claim_ids],
      model_refs: []
    };
    const responsibilityContext = {
      .../** @type {Record<string, unknown>} */
      context,
      riskByElementId: /* @__PURE__ */ new Map([[elementId, binding.risk]]),
      requiredOracleRefsByElementId: /* @__PURE__ */ new Map([[elementId, binding.required_oracle_refs]]),
      requiredCapabilitiesByElementId: /* @__PURE__ */ new Map([[elementId, binding.required_capabilities]])
    };
    seeds.push(buildObligationSeed({
      view,
      primaryElement: responsibilityElement,
      supportingElements: [responsibilityElement],
      context: responsibilityContext,
      identity: descriptor.identity
    }));
  }
  return finishObligationSeeds(seeds, label);
}

// src/obligations/input-domain.mjs
function compile3(view, context) {
  assertViewType(view, "input-domain");
  const elements = objectArray7(view.elements).filter((element) => element.kind === "input-domain");
  const descriptors = [];
  for (const element of elements) {
    for (const equivalenceClass of objectArray7(element.classes)) {
      descriptors.push({
        key: responsibilityKey("input-domain", String(element.element_id), {
          responsibility: "equivalence-class",
          class_id: equivalenceClass.class_id
        }),
        element,
        required: true,
        identity: {
          kind: "input-domain",
          responsibility: "equivalence-class",
          scope: view.scope,
          domain: element.domain,
          class: { class_id: equivalenceClass.class_id, label: equivalenceClass.label }
        }
      });
    }
    if (!isObject6(element.bounds)) continue;
    for (const boundary of ["lower", "upper"]) {
      descriptors.push({
        key: responsibilityKey("input-domain", String(element.element_id), {
          responsibility: "boundary",
          boundary
        }),
        element,
        required: true,
        identity: {
          kind: "input-domain",
          responsibility: "boundary",
          scope: view.scope,
          domain: element.domain,
          boundary,
          value: element.bounds[boundary],
          inclusive: element.bounds.inclusive
        }
      });
    }
  }
  return compileResponsibilitySeeds(view, context, descriptors, "input-domain");
}

// src/obligations/integration.mjs
var CORE_RESPONSIBILITIES = [
  "request",
  "response",
  "persistence",
  "event",
  "callback",
  "compensation"
];
var SPECIAL_TYPES = /* @__PURE__ */ new Set([
  "contract-compatibility",
  "concurrency",
  "idempotency",
  "security-abuse"
]);
function keyedValue2(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject6(container) ? container[key] : void 0;
}
function declarations(context, property, elementId) {
  if (!isObject6(context)) return [];
  return objectArray7(keyedValue2(context[property], elementId));
}
function compile4(view, context) {
  assertViewType(view, "integration");
  const elements = objectArray7(view.elements).filter((element) => element.kind === "integration-contract");
  const descriptors = [];
  for (const element of elements) {
    const elementId = String(element.element_id);
    for (const responsibility of CORE_RESPONSIBILITIES) {
      descriptors.push({
        key: responsibilityKey("integration", elementId, {
          responsibility: "surface",
          surface: responsibility
        }),
        element,
        required: true,
        identity: {
          kind: "integration",
          responsibility,
          scope: view.scope,
          contract_element_id: elementId,
          [responsibility]: element[responsibility]
        }
      });
    }
    for (const sideEffect of objectArray7(element.side_effects)) {
      descriptors.push({
        key: responsibilityKey("integration", elementId, {
          responsibility: "side-effect",
          side_effect: sideEffect
        }),
        element,
        required: true,
        identity: {
          kind: "integration",
          responsibility: "side-effect",
          scope: view.scope,
          contract_element_id: elementId,
          side_effect: sideEffect
        }
      });
    }
    for (const invariant of declarations(context, "integrationInvariantsByElementId", elementId)) {
      if (typeof invariant.invariant !== "string" || invariant.invariant.length === 0) continue;
      descriptors.push({
        key: responsibilityKey("integration", elementId, {
          responsibility: "invariant",
          invariant: invariant.invariant
        }),
        element,
        required: false,
        identity: {
          kind: "integration",
          responsibility: "invariant",
          scope: view.scope,
          contract_element_id: elementId,
          invariant: invariant.invariant
        }
      });
    }
    for (const special of declarations(context, "integrationSpecialResponsibilitiesByElementId", elementId)) {
      if (typeof special.type !== "string" || !SPECIAL_TYPES.has(special.type) || typeof special.signal !== "string" || special.signal.length === 0) continue;
      descriptors.push({
        key: responsibilityKey("integration", elementId, {
          responsibility: special.type,
          signal: special.signal
        }),
        element,
        required: false,
        identity: {
          kind: "integration",
          responsibility: special.type,
          scope: view.scope,
          contract_element_id: elementId,
          signal: special.signal
        }
      });
    }
  }
  return compileResponsibilitySeeds(view, context, descriptors, "integration");
}

// src/obligations/role.mjs
function compile5(view, context) {
  assertViewType(view, "role");
  const roles = objectArray7(view.elements).filter((element) => element.kind === "role-permission");
  const descriptors = roles.flatMap((role) => sortedStrings(role.permissions).map((permission) => ({
    key: responsibilityKey("role", String(role.element_id), {
      responsibility: "permission",
      permission
    }),
    element: role,
    required: true,
    identity: {
      kind: "role",
      responsibility: "permission",
      scope: view.scope,
      role: role.role,
      permission
    }
  })));
  return compileResponsibilitySeeds(view, context, descriptors, "role");
}

// src/obligations/state.mjs
function stateIdentity(state) {
  return { kind: "state", state: state.state };
}
function compile6(view, context) {
  assertViewType(view, "state");
  const elements = objectArray7(view.elements);
  const states = elements.filter((element) => element.kind === "state");
  const statesByName = new Map(states.map((state) => [state.state, state]));
  const transitions = elements.filter((element) => element.kind === "transition");
  const seeds = transitions.map((transition) => {
    const from = statesByName.get(transition.from_state);
    const to = statesByName.get(transition.to_state);
    if (!from || !to) throw new TypeError(`state transition "${String(transition.element_id)}" is not from a validated view`);
    return buildObligationSeed({
      view,
      primaryElement: transition,
      supportingElements: [transition, from, to],
      context,
      identity: {
        kind: "state",
        responsibility: "transition",
        scope: view.scope,
        transition: {
          kind: "transition",
          from: stateIdentity(from),
          to: stateIdentity(to),
          event: transition.event,
          condition: transition.condition,
          transition_order: Array.isArray(transition.transition_order) ? [...transition.transition_order] : []
        }
      }
    });
  });
  return finishObligationSeeds(seeds, "state");
}

// src/obligations/timing.mjs
var SPECIAL_TYPES2 = /* @__PURE__ */ new Set(["timeout", "retry"]);
function keyedValue3(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject6(container) ? container[key] : void 0;
}
function specialResponsibilities(context, elementId) {
  if (!isObject6(context)) return [];
  return objectArray7(keyedValue3(context.timingSpecialResponsibilitiesByElementId, elementId));
}
function compile7(view, context) {
  assertViewType(view, "timing");
  const elements = objectArray7(view.elements).filter((element) => element.kind === "timing-rule");
  const descriptors = [];
  for (const element of elements) {
    const elementId = String(element.element_id);
    for (const relation of ["before", "equal", "after"]) {
      descriptors.push({
        key: responsibilityKey("timing", elementId, {
          responsibility: "threshold",
          threshold_relation: relation
        }),
        element,
        required: true,
        identity: {
          kind: "timing",
          responsibility: "threshold",
          scope: view.scope,
          timing_element_id: elementId,
          order: element.order,
          timing_event: element.timing_event,
          threshold: element.threshold,
          threshold_relation: relation
        }
      });
    }
    for (const special of specialResponsibilities(context, elementId)) {
      if (typeof special.type !== "string" || !SPECIAL_TYPES2.has(special.type) || typeof special.signal !== "string" || special.signal.length === 0) continue;
      descriptors.push({
        key: responsibilityKey("timing", elementId, {
          responsibility: special.type,
          signal: special.signal
        }),
        element,
        required: false,
        identity: {
          kind: "timing",
          responsibility: special.type,
          scope: view.scope,
          timing_element_id: elementId,
          order: element.order,
          timing_event: element.timing_event,
          threshold: element.threshold,
          signal: special.signal
        }
      });
    }
  }
  return compileResponsibilitySeeds(view, context, descriptors, "timing");
}

// src/obligations/compile-obligations.mjs
var ObligationCompilationError = class extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super("test-obligation compilation requires revision");
    this.name = "ObligationCompilationError";
    this.status = "need_revision";
    this.stage = "test_obligations";
    this.diagnostics = diagnostics.map((item) => ({ ...item }));
  }
};
function isObject7(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function objectArray8(value) {
  return Array.isArray(value) ? value.filter(isObject7) : [];
}
function isDenseObjectArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isObject7(value[index])) return false;
  }
  return true;
}
function stringArray5(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function isNonblankUnpadded(value) {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0 && value === value.trim();
}
function isDenseUniqueStringArray(value, nonempty = false) {
  if (!Array.isArray(value) || nonempty && value.length === 0) return false;
  const strings3 = /* @__PURE__ */ new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isNonblankUnpadded(value[index]) || strings3.has(value[index])) return false;
    strings3.add(value[index]);
  }
  return true;
}
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort(compareCodePoints7);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function diagnostic10(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function pointerPart4(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function sparseBehaviorDiagnostics(artifact) {
  const diagnostics = [];
  const pending = [{ value: artifact, path: "" }];
  const visited = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const current = (
      /** @type {{value: unknown, path: string}} */
      pending.pop()
    );
    const { value, path: path4 } = current;
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      const presentIndexes = Object.keys(value).filter((key) => {
        const index = Number(key);
        return Number.isSafeInteger(index) && index >= 0 && index < value.length && String(index) === key;
      }).map(Number);
      if (presentIndexes.length !== value.length) {
        let firstMissing = 0;
        for (const index of presentIndexes) {
          if (index !== firstMissing) break;
          firstMissing += 1;
        }
        diagnostics.push(diagnostic10(
          "schema",
          "BEHAVIOR_ARRAY_SPARSE",
          `${path4}/${firstMissing}`,
          `behavior artifact array has a missing entry at index ${firstMissing}`
        ));
      }
      for (const index of presentIndexes) {
        pending.push({ value: value[index], path: `${path4}/${index}` });
      }
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      pending.push({ value: child, path: `${path4}/${pointerPart4(key)}` });
    }
  }
  return diagnostics;
}
var CANONICAL_BEHAVIOR_FIELDS = /* @__PURE__ */ new Set([
  "scope",
  "state",
  "from_state",
  "to_state",
  "timing_event",
  "permissions",
  "transition_order"
]);
function isCanonicalBehaviorField(field) {
  return CANONICAL_BEHAVIOR_FIELDS.has(field) || field.endsWith("_id") || field.endsWith("_ids") || field.endsWith("_refs");
}
function behaviorStringDiagnostics(artifact) {
  const diagnostics = [];
  const pending = [{ value: artifact, path: "", canonical: false }];
  const visited = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const { value, path: path4, canonical } = (
      /** @type {{value: unknown, path: string, canonical: boolean}} */
      pending.pop()
    );
    if (typeof value === "string") {
      if (canonical && !isNonblankUnpadded(value)) diagnostics.push(diagnostic10(
        "schema",
        "BEHAVIOR_STRING_INVALID",
        path4,
        "persisted behavior identifiers, references, scopes, and capabilities must be nonblank and unpadded"
      ));
      continue;
    }
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      pending.push({
        value: child,
        path: `${path4}/${pointerPart4(key)}`,
        canonical: Array.isArray(value) ? canonical : isCanonicalBehaviorField(key)
      });
    }
  }
  return diagnostics;
}
function interactionStringDiagnostics(artifact) {
  const diagnostics = [];
  for (const [index, candidate] of objectArray8(artifact.interaction_candidates).entries()) {
    const candidateId = typeof candidate.candidate_id === "string" ? candidate.candidate_id : String(index);
    const path4 = `/interaction_candidates/${pointerPart4(candidateId)}`;
    let valid = isNonblankUnpadded(candidate.candidate_id) && isDenseUniqueStringArray(candidate.module_ids, true);
    if (candidate.disposition === "formal-view") {
      valid = valid && isNonblankUnpadded(candidate.formal_view_id) && isDenseUniqueStringArray(candidate.source_claim_ids, true);
    } else if (candidate.disposition === "blocker") {
      valid = valid && isNonblankUnpadded(candidate.blocker_root_issue_id);
    } else if (candidate.disposition === "exploratory") {
      valid = valid && isNonblankUnpadded(candidate.exploratory_id);
    }
    if (!valid) diagnostics.push(diagnostic10(
      "schema",
      "INTERACTION_ROUTE_STRING_INVALID",
      path4,
      "interaction route IDs and references must be dense, nonblank, and unpadded"
    ));
  }
  return diagnostics;
}
function sortDiagnostics3(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()].sort(([left], [right]) => compareCodePoints7(left, right)).map(([, item]) => item);
}
function defaultRegistry() {
  return createObligationRegistry().registerObligationStrategy("flow", compile2).registerObligationStrategy("decision", compile).registerObligationStrategy("state", compile6).registerObligationStrategy("input-domain", compile3).registerObligationStrategy("role", compile5).registerObligationStrategy("timing", compile7).registerObligationStrategy("integration", compile4);
}
function assertNoDiagnostics(diagnostics) {
  if (diagnostics.length > 0) throw new ObligationCompilationError(sortDiagnostics3(diagnostics));
}
function compilationInputs(graph) {
  const input = isObject7(graph.obligationCompilation) ? graph.obligationCompilation : null;
  if (!input) throw new ObligationCompilationError([
    diagnostic10("schema", "OBLIGATION_COMPILATION_INPUT_REQUIRED", "/obligationCompilation", "explicit obligation compilation input is required")
  ]);
  const expected = [
    "contextsByViewId",
    "customObligations",
    "factRoutes",
    "notApplicableReviews",
    "sourceRevision"
  ];
  const actual = Object.keys(input).sort(compareCodePoints7);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ObligationCompilationError([
      diagnostic10("schema", "OBLIGATION_COMPILATION_INPUT_NOT_CLOSED", "/obligationCompilation", "obligation compilation input has unknown or missing fields")
    ]);
  }
  if (!(input.contextsByViewId instanceof Map) || !isDenseObjectArray(input.customObligations) || !isDenseObjectArray(input.factRoutes) || !isDenseObjectArray(input.notApplicableReviews) || !Number.isInteger(input.sourceRevision) || /** @type {number} */
  input.sourceRevision < 0) {
    throw new ObligationCompilationError([
      diagnostic10("schema", "OBLIGATION_COMPILATION_INPUT_TYPE_INVALID", "/obligationCompilation", "contextsByViewId must be a Map and route/obligation inputs must be arrays")
    ]);
  }
  return {
    contextsByViewId: (
      /** @type {Map<unknown, unknown>} */
      input.contextsByViewId
    ),
    customObligations: input.customObligations,
    factRoutes: input.factRoutes,
    notApplicableReviews: input.notApplicableReviews,
    sourceRevision: (
      /** @type {number} */
      input.sourceRevision
    )
  };
}
var FACT_FIELDS = ["claim_id", "fact_id", "source_claim_ids", "status"];
var FACT_STATUSES = /* @__PURE__ */ new Set(["active", "conflicted", "ambiguous", "diagnostic"]);
var CLAIM_KINDS_BY_LEVEL = /* @__PURE__ */ new Map([
  ["E1", /* @__PURE__ */ new Set(["assumption"])],
  ["E2", /* @__PURE__ */ new Set(["test-data", "expected-value", "model-element"])],
  ["E3", /* @__PURE__ */ new Set(["requirement", "description", "example", "diagnostic"])]
]);
function validateEvidenceInputs(graph, inputs, artifact, diagnostics) {
  if (!Object.hasOwn(graph, "runScope") || !isNonblankUnpadded(graph.runScope)) diagnostics.push(diagnostic10(
    "schema",
    "EVIDENCE_RUN_SCOPE_INVALID",
    "/runScope",
    "accepted evidence graph requires an own nonblank unpadded runScope"
  ));
  const claimsById = /* @__PURE__ */ new Map();
  if (!(graph.claimsById instanceof Map)) {
    diagnostics.push(diagnostic10(
      "schema",
      "EVIDENCE_CLAIMS_MAP_REQUIRED",
      "/claimsById",
      "accepted evidence claimsById must be a Map"
    ));
  } else {
    for (const [key, claim] of graph.claimsById) {
      const path4 = `/claimsById/${String(key)}`;
      if (!isNonblankUnpadded(key) || !isObject7(claim)) {
        diagnostics.push(diagnostic10("schema", "EVIDENCE_CLAIM_ENTRY_INVALID", path4, "accepted claim entries require a nonblank unpadded Map key and object value"));
        continue;
      }
      if (!isPlainRecord(claim)) {
        diagnostics.push(diagnostic10(
          "schema",
          "EVIDENCE_CLAIM_PROTOTYPE_INVALID",
          path4,
          "accepted claim values must be own-property plain or null-prototype records"
        ));
        continue;
      }
      let descriptors;
      try {
        descriptors = Object.getOwnPropertyDescriptors(claim);
      } catch {
        diagnostics.push(diagnostic10(
          "schema",
          "EVIDENCE_CLAIM_DESCRIPTOR_INVALID",
          path4,
          "accepted claim fields must be readable own data properties"
        ));
        continue;
      }
      const requiredDataFields = ["claim_id", "level", "kind", "scope"];
      if (requiredDataFields.some((field) => !descriptors[field] || !Object.hasOwn(descriptors[field], "value"))) {
        diagnostics.push(diagnostic10(
          "schema",
          "EVIDENCE_CLAIM_DESCRIPTOR_INVALID",
          path4,
          "accepted claim fields must be readable own data properties"
        ));
        continue;
      }
      const claimId = descriptors.claim_id.value;
      const level = descriptors.level.value;
      const kind = descriptors.kind.value;
      const scope = descriptors.scope.value;
      if (claimId !== key || !isNonblankUnpadded(claimId)) {
        diagnostics.push(diagnostic10("reference", "EVIDENCE_CLAIM_KEY_MISMATCH", `${path4}/claim_id`, "claim Map key must exactly match its own claim_id"));
        continue;
      }
      if (!isNonblankUnpadded(level) || !isNonblankUnpadded(kind) || !isNonblankUnpadded(scope) || !CLAIM_KINDS_BY_LEVEL.get(level)?.has(kind)) {
        diagnostics.push(diagnostic10(
          "schema",
          "EVIDENCE_CLAIM_FIELDS_INVALID",
          path4,
          "accepted claim level, kind, and scope must be own, unpadded, and use the frozen accepted enums"
        ));
        continue;
      }
      let parentClaimIds = [];
      let derivationKind;
      let derivationTarget;
      if (level === "E2") {
        const e2Fields = ["derivation_kind", "derivation_target"];
        if (e2Fields.some((field) => !descriptors[field] || !Object.hasOwn(descriptors[field], "value"))) {
          diagnostics.push(diagnostic10(
            "schema",
            "EVIDENCE_CLAIM_DESCRIPTOR_INVALID",
            path4,
            "accepted E2 derivation fields must be own data properties"
          ));
          continue;
        }
        if (!descriptors.parent_claim_ids) {
          diagnostics.push(diagnostic10(
            "schema",
            "EVIDENCE_CLAIM_PARENTS_INVALID",
            `${path4}/parent_claim_ids`,
            "accepted E2 parent IDs must be an own nonempty dense unique array"
          ));
          continue;
        }
        if (!Object.hasOwn(descriptors.parent_claim_ids, "value")) {
          diagnostics.push(diagnostic10(
            "schema",
            "EVIDENCE_CLAIM_DESCRIPTOR_INVALID",
            path4,
            "accepted E2 derivation fields must be own data properties"
          ));
          continue;
        }
        derivationKind = descriptors.derivation_kind.value;
        derivationTarget = descriptors.derivation_target.value;
        const submittedParentClaimIds = descriptors.parent_claim_ids.value;
        if (!isDenseUniqueStringArray(submittedParentClaimIds, true)) {
          diagnostics.push(diagnostic10(
            "schema",
            "EVIDENCE_CLAIM_PARENTS_INVALID",
            `${path4}/parent_claim_ids`,
            "accepted E2 parent IDs must be a nonempty dense unique array of nonblank unpadded IDs"
          ));
          continue;
        }
        parentClaimIds = [...submittedParentClaimIds];
        const allowedTargets = typeof derivationKind === "string" ? E2_TARGETS[
          /** @type {keyof typeof E2_TARGETS} */
          derivationKind
        ] : void 0;
        if (typeof derivationTarget !== "string" || !allowedTargets?.includes(derivationTarget) || kind !== derivationTarget) {
          diagnostics.push(diagnostic10(
            "schema",
            "EVIDENCE_CLAIM_DERIVATION_INVALID",
            path4,
            "accepted E2 claims must match the frozen derivation kind/target matrix and claim kind"
          ));
          continue;
        }
      }
      claimsById.set(key, {
        claim_id: claimId,
        level,
        kind,
        scope,
        parent_claim_ids: [...parentClaimIds],
        ...level === "E2" ? {
          derivation_kind: derivationKind,
          derivation_target: derivationTarget
        } : {}
      });
    }
  }
  for (const [claimId, claim] of claimsById) {
    for (const parentId of stringArray5(claim.parent_claim_ids)) {
      if (!claimsById.has(parentId)) diagnostics.push(diagnostic10(
        "reference",
        "EVIDENCE_CLAIM_PARENT_DANGLING",
        `/claimsById/${claimId}/parent_claim_ids/${parentId}`,
        `accepted claim references missing parent "${parentId}"`
      ));
    }
  }
  const cycle = firstClaimCycle(claimsById);
  if (cycle) diagnostics.push(diagnostic10(
    "reference",
    "EVIDENCE_CLAIM_CYCLE",
    `/claimsById/${pointerPart4(cycle.claimId)}/parent_claim_ids/${pointerPart4(cycle.parentId)}`,
    `accepted claim ancestry contains a cycle through "${cycle.claimId}" and "${cycle.parentId}"`
  ));
  const facts = [];
  if (!isDenseObjectArray(graph.factLedger)) {
    diagnostics.push(diagnostic10("schema", "EVIDENCE_FACT_LEDGER_INVALID", "/factLedger", "factLedger must be a dense object array"));
  } else {
    const factIds = /* @__PURE__ */ new Set();
    for (const fact of graph.factLedger) {
      const factId = typeof fact.fact_id === "string" ? fact.fact_id : "";
      const path4 = `/factLedger/${factId || facts.length}`;
      let valid = true;
      if (!hasExactKeys(fact, FACT_FIELDS)) {
        diagnostics.push(diagnostic10("schema", "EVIDENCE_FACT_NOT_CLOSED", path4, "fact entries must contain exactly fact_id, claim_id, status, and source_claim_ids"));
        valid = false;
      }
      if (!isNonblankUnpadded(factId) || !isNonblankUnpadded(fact.claim_id) || !FACT_STATUSES.has(String(fact.status)) || !isDenseUniqueStringArray(fact.source_claim_ids, true)) {
        diagnostics.push(diagnostic10("schema", "EVIDENCE_FACT_FIELDS_INVALID", path4, "fact IDs, status, and source refs must satisfy the closed fact contract"));
        valid = false;
      }
      if (factIds.has(factId)) {
        diagnostics.push(diagnostic10("schema", "EVIDENCE_FACT_ID_DUPLICATE", `/factLedger/${factId}/fact_id`, `fact_id "${factId}" must be unique`));
        valid = false;
      }
      factIds.add(factId);
      if (isNonblankUnpadded(fact.claim_id) && !claimsById.has(fact.claim_id)) {
        diagnostics.push(diagnostic10("reference", "EVIDENCE_FACT_CLAIM_DANGLING", `${path4}/claim_id`, `fact references missing accepted claim "${fact.claim_id}"`));
        valid = false;
      }
      for (const claimId of stringArray5(fact.source_claim_ids)) {
        if (!claimsById.has(claimId)) {
          diagnostics.push(diagnostic10("reference", "EVIDENCE_FACT_SOURCE_DANGLING", `${path4}/source_claim_ids/${claimId}`, `fact references missing accepted source claim "${claimId}"`));
          valid = false;
        }
      }
      if (valid) facts.push(fact);
    }
  }
  if (inputs.sourceRevision !== artifact.source_revision) diagnostics.push(diagnostic10(
    "reference",
    "OBLIGATION_SOURCE_REVISION_MISMATCH",
    "/obligationCompilation/sourceRevision",
    `compilation source revision ${inputs.sourceRevision} does not match behavior revision ${String(artifact.source_revision)}`
  ));
  const relations = claimRelations(claimsById);
  return { claimsById, facts, relations };
}
function firstClaimCycle(claimsById) {
  const state = /* @__PURE__ */ new Map();
  for (const start of [...claimsById.keys()].sort(compareCodePoints7)) {
    if ((state.get(start) ?? 0) !== 0) continue;
    const stack = [{
      claimId: start,
      parents: [...stringArray5(claimsById.get(start)?.parent_claim_ids)].sort(compareCodePoints7),
      next: 0
    }];
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = (
        /** @type {{claimId: string, parents: string[], next: number}} */
        stack.at(-1)
      );
      if (frame.next >= frame.parents.length) {
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return { claimId: frame.claimId, parentId };
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: [...stringArray5(claimsById.get(parentId)?.parent_claim_ids)].sort(compareCodePoints7),
        next: 0
      });
    }
  }
  return null;
}
function claimRelations(claimsById) {
  const parentsById = new Map([...claimsById.keys()].map((claimId) => [claimId, /* @__PURE__ */ new Set()]));
  const childrenById = new Map([...claimsById.keys()].map((claimId) => [claimId, /* @__PURE__ */ new Set()]));
  for (const [claimId, claim] of claimsById) {
    for (const parentId of stringArray5(claim.parent_claim_ids)) {
      parentsById.get(claimId)?.add(parentId);
      childrenById.get(parentId)?.add(claimId);
    }
  }
  const componentById = /* @__PURE__ */ new Map();
  let componentId = 0;
  for (const rootId of [...claimsById.keys()].sort(compareCodePoints7)) {
    if (componentById.has(rootId)) continue;
    const pending = [rootId];
    componentById.set(rootId, componentId);
    while (pending.length > 0) {
      const claimId = (
        /** @type {string} */
        pending.pop()
      );
      const neighbors = /* @__PURE__ */ new Set([
        ...parentsById.get(claimId) ?? [],
        ...childrenById.get(claimId) ?? []
      ]);
      for (const neighborId of neighbors) {
        if (componentById.has(neighborId)) continue;
        componentById.set(neighborId, componentId);
        pending.push(neighborId);
      }
    }
    componentId += 1;
  }
  const forestIntervalsById = /* @__PURE__ */ new Map();
  const isSingleParentForest = [...parentsById.values()].every((parents) => parents.size <= 1);
  if (isSingleParentForest) {
    let sequence = 0;
    const roots = [...claimsById.keys()].filter((claimId) => parentsById.get(claimId)?.size === 0).sort(compareCodePoints7);
    for (const rootId of roots) {
      const pending = [{ claimId: rootId, exiting: false }];
      while (pending.length > 0) {
        const item = (
          /** @type {{claimId: string, exiting: boolean}} */
          pending.pop()
        );
        if (item.exiting) {
          const interval = forestIntervalsById.get(item.claimId);
          if (interval) interval.exit = sequence++;
          continue;
        }
        forestIntervalsById.set(item.claimId, { entry: sequence++, exit: -1 });
        pending.push({ claimId: item.claimId, exiting: true });
        const children = [...childrenById.get(item.claimId) ?? []].sort(compareCodePoints7).reverse();
        for (const childId of children) pending.push({ claimId: childId, exiting: false });
      }
    }
  }
  return {
    parentsById,
    childrenById,
    componentById,
    forestIntervalsById,
    pairRelationCache: /* @__PURE__ */ new Map(),
    directionalByRootSet: /* @__PURE__ */ new Map(),
    descendantsByRootSet: /* @__PURE__ */ new Map()
  };
}
function reachableClaims(adjacency, roots) {
  const reached = new Set(roots);
  const pending = [...reached];
  while (pending.length > 0) {
    const claimId = (
      /** @type {string} */
      pending.pop()
    );
    for (const relatedId of adjacency.get(claimId) ?? []) {
      if (reached.has(relatedId)) continue;
      reached.add(relatedId);
      pending.push(relatedId);
    }
  }
  return reached;
}
function canonicalRootSet(roots) {
  return [...new Set(roots)].sort(compareCodePoints7);
}
function cachedReachableClaims(adjacency, roots, cache) {
  const rootIds = canonicalRootSet(roots);
  const cacheKey = canonicalStringify(rootIds);
  let reached = cache.get(cacheKey);
  if (!reached) {
    reached = reachableClaims(adjacency, rootIds);
    cache.set(cacheKey, reached);
  }
  return reached;
}
function directionallyRelatedClaims(relations, roots) {
  const rootIds = canonicalRootSet(roots);
  const cacheKey = canonicalStringify(rootIds);
  let related = relations.directionalByRootSet.get(cacheKey);
  if (!related) {
    related = /* @__PURE__ */ new Set([
      ...reachableClaims(relations.parentsById, rootIds),
      ...reachableClaims(relations.childrenById, rootIds)
    ]);
    relations.directionalByRootSet.set(cacheKey, related);
  }
  return related;
}
function reachesClaim(adjacency, startId, targetId) {
  const visited = /* @__PURE__ */ new Set([startId]);
  const pending = [startId];
  while (pending.length > 0) {
    const claimId = (
      /** @type {string} */
      pending.pop()
    );
    for (const relatedId of adjacency.get(claimId) ?? []) {
      if (relatedId === targetId) return true;
      if (visited.has(relatedId)) continue;
      visited.add(relatedId);
      pending.push(relatedId);
    }
  }
  return false;
}
function claimsDirectionallyRelated(relations, leftId, rightId) {
  if (leftId === rightId) return true;
  const pairKey = canonicalStringify([leftId, rightId].sort(compareCodePoints7));
  const cached = relations.pairRelationCache.get(pairKey);
  if (cached !== void 0) return cached;
  let related = relations.componentById.get(leftId) === relations.componentById.get(rightId);
  if (related) {
    const left = relations.forestIntervalsById.get(leftId);
    const right = relations.forestIntervalsById.get(rightId);
    if (left && right) {
      const leftContainsRight = left.entry <= right.entry && right.exit <= left.exit;
      const rightContainsLeft = right.entry <= left.entry && left.exit <= right.exit;
      related = leftContainsRight || rightContainsLeft;
    } else {
      related = reachesClaim(relations.parentsById, leftId, rightId) || reachesClaim(relations.parentsById, rightId, leftId);
    }
  }
  relations.pairRelationCache.set(pairKey, related);
  return related;
}
var OBLIGATION_SET_FIELDS = [
  "source_claim_ids",
  "view_element_refs",
  "required_oracle_refs",
  "required_capabilities"
];
var OBLIGATION_FIELDS = [
  "kind",
  "obligation_id",
  "required_capabilities",
  "required_oracle_refs",
  "risk",
  "scope",
  "source_claim_ids",
  "view_element_refs"
];
var CONTEXT_FIELDS_BY_VIEW_TYPE = Object.freeze({
  flow: ["loopMaximumsByElementId", "requiredCapabilitiesByElementId", "requiredOracleRefsByElementId", "riskByElementId"],
  decision: ["requiredCapabilitiesByElementId", "requiredOracleRefsByElementId", "riskByElementId"],
  state: ["requiredCapabilitiesByElementId", "requiredOracleRefsByElementId", "riskByElementId"],
  "input-domain": ["responsibilityBindings"],
  role: ["responsibilityBindings"],
  timing: ["responsibilityBindings", "timingSpecialResponsibilitiesByElementId"],
  integration: ["integrationInvariantsByElementId", "integrationSpecialResponsibilitiesByElementId", "responsibilityBindings"]
});
var ELEMENT_CONTEXT_FIELDS = /* @__PURE__ */ new Set([
  "riskByElementId",
  "requiredOracleRefsByElementId",
  "requiredCapabilitiesByElementId",
  "loopMaximumsByElementId",
  "timingSpecialResponsibilitiesByElementId",
  "integrationInvariantsByElementId",
  "integrationSpecialResponsibilitiesByElementId"
]);
function isPlainRecord(value) {
  if (!isObject7(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function ownEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (!isPlainRecord(value)) return null;
  return Object.entries(value);
}
function validateViewContext(viewId, view, context, diagnostics) {
  const path4 = `/obligationCompilation/contextsByViewId/${pointerPart4(viewId)}`;
  let valid = true;
  if (!isPlainRecord(context)) {
    diagnostics.push(diagnostic10(
      "schema",
      "OBLIGATION_CONTEXT_PROTOTYPE_FORBIDDEN",
      path4,
      "per-view compilation context must be an own-property plain object"
    ));
    valid = false;
  }
  const elementIds = new Set(objectArray8(view.elements).flatMap((element) => isNonblankUnpadded(element.element_id) ? [String(element.element_id)] : []));
  for (const field of ELEMENT_CONTEXT_FIELDS) {
    if (!Object.hasOwn(context, field)) continue;
    const entries = ownEntries(context[field]);
    const fieldPath = `${path4}/${field}`;
    if (entries === null) {
      diagnostics.push(diagnostic10(
        "schema",
        "OBLIGATION_CONTEXT_MAP_PROTOTYPE_FORBIDDEN",
        fieldPath,
        `${field} must be a Map or an own-property plain object`
      ));
      valid = false;
      continue;
    }
    for (const [rawKey, entry] of entries) {
      if (!isNonblankUnpadded(rawKey) || !elementIds.has(String(rawKey))) {
        diagnostics.push(diagnostic10(
          "reference",
          "OBLIGATION_CONTEXT_ELEMENT_UNKNOWN",
          `${fieldPath}/${pointerPart4(String(rawKey))}`,
          `${field} references an invalid or unknown element "${String(rawKey)}"`
        ));
        valid = false;
        continue;
      }
      if (field === "riskByElementId" && !isNonblankUnpadded(entry)) {
        diagnostics.push(diagnostic10("schema", "OBLIGATION_CONTEXT_STRINGS_INVALID", fieldPath, "context risk values must be nonblank and unpadded"));
        valid = false;
      }
      if ((field === "requiredOracleRefsByElementId" || field === "requiredCapabilitiesByElementId") && !isDenseUniqueStringArray(entry)) {
        diagnostics.push(diagnostic10(
          "schema",
          "OBLIGATION_CONTEXT_STRINGS_INVALID",
          fieldPath,
          `${field} values must be dense unique arrays of nonblank unpadded strings`
        ));
        valid = false;
      }
      if (field === "loopMaximumsByElementId") {
        const definition = isPlainRecord(entry) ? entry : null;
        if (!definition || !hasExactKeys(definition, ["maximum", "source_claim_ids"]) || !Number.isInteger(definition.maximum) || Number(definition.maximum) <= 1 || !isDenseUniqueStringArray(definition.source_claim_ids, true)) {
          diagnostics.push(diagnostic10(
            "schema",
            "OBLIGATION_CONTEXT_LOOP_INVALID",
            fieldPath,
            "loop maximums require exact maximum and dense nonblank source_claim_ids fields"
          ));
          valid = false;
        }
      }
      if (field === "timingSpecialResponsibilitiesByElementId" || field === "integrationSpecialResponsibilitiesByElementId") {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ["signal", "type"]) || !isNonblankUnpadded(item.signal) || !isNonblankUnpadded(item.type))) {
          diagnostics.push(diagnostic10(
            "schema",
            "OBLIGATION_CONTEXT_SPECIAL_INVALID",
            fieldPath,
            `${field} values must be dense closed signal/type objects with unpadded strings`
          ));
          valid = false;
        }
      }
      if (field === "integrationInvariantsByElementId") {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ["invariant"]) || !isNonblankUnpadded(item.invariant))) {
          diagnostics.push(diagnostic10(
            "schema",
            "OBLIGATION_CONTEXT_INVARIANT_INVALID",
            fieldPath,
            "integration invariant values must be dense closed objects with one unpadded invariant"
          ));
          valid = false;
        }
      }
    }
  }
  if (Object.hasOwn(context, "responsibilityBindings") && !isDenseObjectArray(context.responsibilityBindings)) {
    diagnostics.push(diagnostic10(
      "schema",
      "OBLIGATION_CONTEXT_BINDINGS_INVALID",
      `${path4}/responsibilityBindings`,
      "responsibilityBindings must be a dense object array"
    ));
    valid = false;
  }
  return valid;
}
function validateCustomObligations(inputs, viewsById, claimsById, relations, diagnostics) {
  const submittedObligations = inputs.customObligations.flatMap((entry) => isObject7(entry.obligation) ? [entry.obligation] : []);
  diagnostics.push(.../** @type {Diagnostic[]} */
  validateAgainstSchema({
    schema_version: "1.0.0",
    source_revision: 0,
    obligations: submittedObligations,
    fact_routes: [],
    interaction_routes: []
  }, test_obligations_schema_default));
  const ownerBySeed = /* @__PURE__ */ new Map();
  const ownerElementsByRef = /* @__PURE__ */ new Map();
  for (const [viewId, view] of viewsById) {
    for (const element of objectArray8(view.elements)) {
      const elementId = typeof element.element_id === "string" ? element.element_id : "";
      const ref = qualifyViewElementRef(viewId, elementId);
      if (ownerElementsByRef.has(ref)) {
        diagnostics.push(diagnostic10(
          "reference",
          "CUSTOM_OBLIGATION_VIEW_ELEMENT_COLLISION",
          `/views/${pointerPart4(viewId)}/elements/${pointerPart4(elementId)}`,
          `qualified view element reference "${ref}" is not unique`
        ));
        continue;
      }
      ownerElementsByRef.set(ref, { view, element, roots: elementEvidenceRefs(element) });
    }
  }
  const seeds = [];
  inputs.customObligations.forEach((entry, index) => {
    const wrapperPath = `/obligationCompilation/customObligations/${index}`;
    if (!hasExactKeys(entry, ["obligation", "semantic_key"]) || !isNonblankUnpadded(entry.semantic_key) || !isObject7(entry.obligation)) {
      diagnostics.push(diagnostic10(
        "schema",
        "CUSTOM_OBLIGATION_WRAPPER_INVALID",
        wrapperPath,
        "custom obligation input must be a closed semantic_key/obligation wrapper"
      ));
      return;
    }
    const seed = entry.obligation;
    seeds.push(seed);
    const obligationId = typeof seed.obligation_id === "string" ? seed.obligation_id : String(index);
    const path4 = `/obligationCompilation/customObligations/${obligationId}`;
    const keys = Object.keys(seed).sort(compareCodePoints7);
    if (keys.length !== OBLIGATION_FIELDS.length || keys.some((key, keyIndex) => key !== OBLIGATION_FIELDS[keyIndex])) {
      diagnostics.push(diagnostic10(
        "schema",
        "CUSTOM_OBLIGATION_INPUT_NOT_CLOSED",
        path4,
        "custom obligation must contain exactly the frozen eight obligation fields"
      ));
    }
    if (!/^obligation_[0-9a-f]{16}$/.test(obligationId)) diagnostics.push(diagnostic10(
      "schema",
      "CUSTOM_OBLIGATION_ID_INVALID",
      `${path4}/obligation_id`,
      "custom obligation_id must use stable obligation_<16 lowercase hex> form"
    ));
    const identity = {
      kind: seed.kind,
      scope: seed.scope,
      view_element_refs: [...stringArray5(seed.view_element_refs)].sort(compareCodePoints7),
      ...stringArray5(seed.view_element_refs).length === 0 ? {
        source_claim_ids: [...stringArray5(seed.source_claim_ids)].sort(compareCodePoints7)
      } : {},
      semantic_key: entry.semantic_key
    };
    const expectedId = stableId("obligation", identity);
    if (obligationId !== expectedId) diagnostics.push(diagnostic10(
      "classification",
      "CUSTOM_OBLIGATION_ID_MISMATCH",
      `${path4}/obligation_id`,
      `custom obligation_id must equal the stable ID of its semantic key and owner; expected "${expectedId}"`
    ));
    if (!isNonblankUnpadded(seed.scope) || !isDenseUniqueStringArray(seed.source_claim_ids, true) || !isDenseUniqueStringArray(seed.view_element_refs) || !isDenseUniqueStringArray(seed.required_oracle_refs) || !isDenseUniqueStringArray(seed.required_capabilities)) {
      diagnostics.push(diagnostic10(
        "schema",
        "CUSTOM_OBLIGATION_STRINGS_INVALID",
        path4,
        "custom scope, refs, and capabilities must be dense, unique, nonblank, and unpadded"
      ));
    }
    const sourceIds = stringArray5(seed.source_claim_ids);
    const oracleIds = stringArray5(seed.required_oracle_refs);
    const sourceSet = new Set(sourceIds);
    for (const [field, claimId] of [
      ...sourceIds.map((id) => ["source_claim_ids", id]),
      ...oracleIds.map((id) => ["required_oracle_refs", id])
    ]) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        diagnostics.push(diagnostic10(
          "reference",
          "CUSTOM_OBLIGATION_CLAIM_DANGLING",
          `${path4}/${field}`,
          `custom obligation references unknown accepted claim "${claimId}"`
        ));
        continue;
      }
      if (!isNonblankUnpadded(claim.scope) || !isNonblankUnpadded(seed.scope) || !scopeContains(String(claim.scope), String(seed.scope))) diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_CLAIM_SCOPE_MISMATCH",
        `${path4}/${field}`,
        `claim "${claimId}" does not cover custom obligation scope "${String(seed.scope)}"`
      ));
      if (field === "source_claim_ids") {
        const acceptedSource = isOracleEvidence(claim) || claim.level === "E2" && claim.kind === "model-element" && claim.derivation_target === "model-element";
        if (!acceptedSource) diagnostics.push(diagnostic10(
          "classification",
          "CUSTOM_OBLIGATION_SOURCE_INVALID",
          `${path4}/source_claim_ids`,
          `claim "${claimId}" is not accepted formal obligation evidence`
        ));
      } else if (!isOracleEvidence(claim)) diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_ORACLE_INVALID",
        `${path4}/required_oracle_refs`,
        `claim "${claimId}" is not eligible Oracle evidence`
      ));
    }
    for (const oracleId of oracleIds) {
      if (!sourceSet.has(oracleId)) diagnostics.push(diagnostic10(
        "traceability",
        "CUSTOM_OBLIGATION_ORACLE_NOT_SOURCED",
        `${path4}/required_oracle_refs`,
        `Oracle claim "${oracleId}" must also appear in source_claim_ids`
      ));
    }
    const owners = [];
    for (const viewElementRef of stringArray5(seed.view_element_refs)) {
      const parsedRef = parseQualifiedViewElementRef(viewElementRef);
      const viewId = parsedRef?.viewId ?? "";
      const elementId = parsedRef?.elementId ?? "";
      const ownerElement = ownerElementsByRef.get(viewElementRef);
      if (!isNonblankUnpadded(viewId) || !isNonblankUnpadded(elementId) || !ownerElement) {
        diagnostics.push(diagnostic10(
          "reference",
          "CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING",
          `${path4}/view_element_refs`,
          `custom obligation references unknown view element "${viewElementRef}"`
        ));
        continue;
      }
      const { view, roots } = ownerElement;
      if (!isNonblankUnpadded(view.scope) || !isNonblankUnpadded(seed.scope) || !scopeContains(String(view.scope), String(seed.scope))) diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_OWNER_SCOPE_MISMATCH",
        `${path4}/scope`,
        `view element owner "${viewElementRef}" does not contain custom obligation scope "${String(seed.scope)}"`
      ));
      if (roots.length === 0 || roots.some((claimId) => !claimsById.has(claimId))) {
        diagnostics.push(diagnostic10(
          "traceability",
          "CUSTOM_OBLIGATION_OWNER_EVIDENCE_INVALID",
          `${path4}/view_element_refs`,
          `view element "${viewElementRef}" has no valid accepted evidence closure`
        ));
        continue;
      }
      owners.push({ ref: viewElementRef, roots });
    }
    if (stringArray5(seed.view_element_refs).length === 0 && sourceIds.length > 0 && sourceIds.every((claimId) => claimsById.has(claimId))) {
      owners.push({ ref: "", roots: sourceIds });
    }
    const relatedToAnyOwner = directionallyRelatedClaims(
      relations,
      owners.flatMap((owner) => owner.roots)
    );
    const relatedToAnySource = directionallyRelatedClaims(relations, sourceIds);
    for (const claimId of sourceIds) {
      if (claimsById.has(claimId) && !relatedToAnyOwner.has(claimId)) diagnostics.push(diagnostic10(
        "traceability",
        "CUSTOM_OBLIGATION_SOURCE_UNRELATED",
        `${path4}/source_claim_ids`,
        `source claim "${claimId}" is not an ancestor or descendant of any custom obligation owner`
      ));
    }
    for (const claimId of oracleIds) {
      if (claimsById.has(claimId) && !relatedToAnyOwner.has(claimId)) diagnostics.push(diagnostic10(
        "traceability",
        "CUSTOM_OBLIGATION_ORACLE_UNRELATED",
        `${path4}/required_oracle_refs`,
        `Oracle claim "${claimId}" is not an ancestor or descendant of any custom obligation owner`
      ));
    }
    for (const owner of owners) {
      if (!owner.roots.some((claimId) => relatedToAnySource.has(claimId))) diagnostics.push(diagnostic10(
        "traceability",
        "CUSTOM_OBLIGATION_OWNER_UNSUPPORTED",
        `${path4}/view_element_refs`,
        `custom obligation owner "${owner.ref}" has no directionally related source evidence`
      ));
    }
    const viewElementRefs = [...stringArray5(seed.view_element_refs)].sort(compareCodePoints7);
    ownerBySeed.set(seed, canonicalStringify({
      kind: seed.kind,
      risk: seed.risk,
      scope: seed.scope,
      semantic_key: entry.semantic_key,
      view_element_refs: viewElementRefs,
      ...viewElementRefs.length === 0 ? { source_claim_ids: [...sourceIds].sort(compareCodePoints7) } : {}
    }));
  });
  return { ownerBySeed, seeds };
}
function addObligationSets(accumulator, seed) {
  for (const field of OBLIGATION_SET_FIELDS) {
    const values = (
      /** @type {Set<string>} */
      accumulator[field]
    );
    for (const value of stringArray5(seed[field])) values.add(value);
  }
}
function finishObligationMerge(byId) {
  return [...byId.values()].map((entry) => ({
    obligation_id: entry.obligation_id,
    kind: entry.kind,
    risk: entry.risk,
    scope: entry.scope,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [
      field,
      [.../** @type {Set<string>} */
      entry[field]].sort(compareCodePoints7)
    ]))
  })).sort((left, right) => compareCodePoints7(String(left.obligation_id), String(right.obligation_id)));
}
function obligationAccumulator(seed, owner = "") {
  return {
    obligation_id: seed.obligation_id,
    kind: seed.kind,
    risk: seed.risk,
    scope: seed.scope,
    owner,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [field, new Set(stringArray5(seed[field]))]))
  };
}
function obligationContentSignature(obligation) {
  return canonicalStringify({
    kind: obligation.kind,
    risk: obligation.risk,
    scope: obligation.scope,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [
      field,
      [...stringArray5(obligation[field])].sort(compareCodePoints7)
    ]))
  });
}
function mergeSystemObligations(seeds, diagnostics) {
  const byId = /* @__PURE__ */ new Map();
  [...seeds].sort((left, right) => compareCodePoints7(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === "string" ? seed.obligation_id : "";
    const path4 = `/obligations/${obligationId || index}`;
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed));
      return;
    }
    if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) {
      diagnostics.push(diagnostic10(
        "classification",
        "OBLIGATION_SIGNATURE_CONFLICT",
        path4,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}
function mergeCustomObligations(seeds, ownerBySeed, systemObligations, diagnostics) {
  const byId = /* @__PURE__ */ new Map();
  const systemIds = new Set(systemObligations.map((obligation) => String(obligation.obligation_id)));
  const systemSignatures = new Set(systemObligations.map(obligationContentSignature));
  const collisionIds = /* @__PURE__ */ new Set();
  [...seeds].sort((left, right) => compareCodePoints7(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === "string" ? seed.obligation_id : "";
    const path4 = `/obligationCompilation/customObligations/${obligationId || index}`;
    if (systemIds.has(obligationId)) {
      if (!collisionIds.has(obligationId)) diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_SYSTEM_ID_COLLISION",
        `${path4}/obligation_id`,
        `custom obligation ID "${obligationId}" collides with a system strategy obligation`
      ));
      collisionIds.add(obligationId);
      return;
    }
    if (systemSignatures.has(obligationContentSignature(seed))) {
      diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_SYSTEM_SEMANTIC_COLLISION",
        path4,
        `custom obligation "${obligationId}" duplicates a system strategy obligation`
      ));
      return;
    }
    const owner = ownerBySeed.get(seed) ?? "";
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed, owner));
      return;
    }
    if (existing.owner !== owner) {
      diagnostics.push(diagnostic10(
        "classification",
        "CUSTOM_OBLIGATION_OWNER_CONFLICT",
        path4,
        `duplicate custom obligation ID "${obligationId}" has conflicting semantic owners`
      ));
      if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) diagnostics.push(diagnostic10(
        "classification",
        "OBLIGATION_SIGNATURE_CONFLICT",
        path4,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}
function compileViewObligations(claimsById, viewsById, inputs, diagnostics) {
  const registry = defaultRegistry();
  const seeds = [];
  for (const [viewId, view] of viewsById) {
    const submittedContext = inputs.contextsByViewId.get(viewId);
    if (!isObject7(submittedContext)) {
      diagnostics.push(diagnostic10("classification", "OBLIGATION_CONTEXT_MISSING", `/obligationCompilation/contextsByViewId/${viewId}`, `view "${viewId}" has no isolated compilation context`));
      continue;
    }
    if (Object.hasOwn(submittedContext, "claimsById") || Object.hasOwn(submittedContext, "evidenceGraph")) {
      diagnostics.push(diagnostic10("classification", "OBLIGATION_CONTEXT_EVIDENCE_OVERRIDE", `/obligationCompilation/contextsByViewId/${viewId}`, "view context cannot replace the accepted evidence graph"));
      continue;
    }
    const allowedFields = CONTEXT_FIELDS_BY_VIEW_TYPE[
      /** @type {keyof typeof CONTEXT_FIELDS_BY_VIEW_TYPE} */
      view.type
    ];
    const submittedFields = Object.keys(submittedContext).sort(compareCodePoints7);
    if (!allowedFields || submittedFields.some((field) => !allowedFields.includes(field))) {
      diagnostics.push(diagnostic10(
        "schema",
        "OBLIGATION_CONTEXT_NOT_CLOSED",
        `/obligationCompilation/contextsByViewId/${viewId}`,
        `view "${viewId}" compilation context contains a field outside its ${String(view.type)} strategy contract`
      ));
      continue;
    }
    if (!validateViewContext(viewId, view, submittedContext, diagnostics)) continue;
    try {
      seeds.push(...registry.compile(view, { ...submittedContext, claimsById }));
    } catch (error) {
      diagnostics.push(diagnostic10(
        "classification",
        "OBLIGATION_STRATEGY_REJECTED",
        `/views/${viewId}`,
        error instanceof Error ? error.message : "obligation strategy rejected its input"
      ));
    }
  }
  for (const key of inputs.contextsByViewId.keys()) {
    if (!isNonblankUnpadded(key)) diagnostics.push(diagnostic10(
      "schema",
      "OBLIGATION_CONTEXT_VIEW_KEY_INVALID",
      `/obligationCompilation/contextsByViewId/${pointerPart4(String(key))}`,
      "compilation context view keys must be nonblank and unpadded"
    ));
    else if (!viewsById.has(key)) diagnostics.push(diagnostic10(
      "reference",
      "OBLIGATION_CONTEXT_VIEW_UNKNOWN",
      `/obligationCompilation/contextsByViewId/${pointerPart4(key)}`,
      `compilation context references unknown view "${key}"`
    ));
  }
  return seeds;
}
function formalFacts(facts, claimsById) {
  return facts.filter((fact) => {
    const claim = typeof fact.claim_id === "string" ? claimsById.get(fact.claim_id) : void 0;
    return fact.status !== "diagnostic" && (claim?.kind === "requirement" || claim?.kind === "assumption");
  });
}
function terminalFactRoutes(inputs, factsById, claimsById, relations, diagnostics) {
  const reviewsByFactId = /* @__PURE__ */ new Map();
  const validReviews = /* @__PURE__ */ new Set();
  for (const review of [...inputs.notApplicableReviews].sort((left, right) => compareCodePoints7(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof review.fact_id === "string" ? review.fact_id : "";
    const path4 = `/obligationCompilation/notApplicableReviews/${factId || "invalid"}`;
    const group = reviewsByFactId.get(factId) ?? [];
    group.push(review);
    reviewsByFactId.set(factId, group);
    let valid = true;
    if (!hasExactKeys(review, ["claim_id", "fact_id", "support_review"]) || !isNonblankUnpadded(factId) || !isNonblankUnpadded(review.claim_id) || review.support_review !== "supported") {
      diagnostics.push(diagnostic10(
        "classification",
        "NOT_APPLICABLE_REVIEW_INVALID",
        path4,
        'NotApplicable review must contain exact nonblank fact/claim IDs and support_review "supported"'
      ));
      valid = false;
    }
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic10("reference", "NOT_APPLICABLE_REVIEW_UNKNOWN", `${path4}/fact_id`, `NotApplicable review references unknown formal fact "${factId}"`));
      valid = false;
    }
    if (valid) validReviews.add(review);
  }
  for (const [factId, reviews] of reviewsByFactId) {
    if (reviews.length > 1) diagnostics.push(diagnostic10(
      "traceability",
      "NOT_APPLICABLE_REVIEW_MULTIPLE",
      `/obligationCompilation/notApplicableReviews/${factId}`,
      `formal fact "${factId}" has more than one NotApplicable review`
    ));
  }
  const routesByFactId = /* @__PURE__ */ new Map();
  for (const route of [...inputs.factRoutes].sort((left, right) => compareCodePoints7(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof route.fact_id === "string" ? route.fact_id : "";
    const group = routesByFactId.get(factId) ?? [];
    group.push(route);
    routesByFactId.set(factId, group);
  }
  const routes = /* @__PURE__ */ new Map();
  const notApplicableFactIds = /* @__PURE__ */ new Set();
  for (const [factId, submittedRoutes] of [...routesByFactId].sort(([left], [right]) => compareCodePoints7(left, right))) {
    const path4 = `/obligationCompilation/factRoutes/${factId || "invalid"}`;
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic10("reference", "FACT_ROUTE_UNKNOWN", `${path4}/fact_id`, `route references unknown formal fact "${factId}"`));
    }
    if (submittedRoutes.length > 1) {
      diagnostics.push(diagnostic10("traceability", "FACT_ROUTE_MULTIPLE", path4, `formal fact "${factId}" has more than one explicit route`));
    }
    const normalizedByRoute = /* @__PURE__ */ new Map();
    for (const route2 of submittedRoutes) {
      const routeType = route2.route_type;
      if (routeType === "exploratory") {
        diagnostics.push(diagnostic10("classification", "FORMAL_FACT_EXPLORATORY_FORBIDDEN", path4, "a formal fact cannot route directly to Exploratory"));
        continue;
      }
      if (routeType === "blocked") {
        if (!hasExactKeys(route2, ["blocker_root_issue_id", "fact_id", "route_type"]) || !isNonblankUnpadded(route2.blocker_root_issue_id)) {
          diagnostics.push(diagnostic10("classification", "FACT_BLOCKED_ROUTE_INVALID", path4, "Blocked route must contain one nonblank unpadded blocker_root_issue_id"));
          continue;
        }
        normalizedByRoute.set(route2, { fact_id: factId, route_type: "blocked", blocker_root_issue_id: route2.blocker_root_issue_id });
        continue;
      }
      if (routeType === "not_applicable") {
        notApplicableFactIds.add(factId);
        const claimId = typeof route2.not_applicable_claim_id === "string" ? route2.not_applicable_claim_id : "";
        if (!hasExactKeys(route2, ["fact_id", "not_applicable_claim_id", "route_type"]) || !isNonblankUnpadded(claimId)) {
          diagnostics.push(diagnostic10("classification", "FACT_NOT_APPLICABLE_ROUTE_INVALID", path4, "NotApplicable route must contain one nonblank unpadded exclusion claim ID"));
          continue;
        }
        normalizedByRoute.set(route2, { fact_id: factId, route_type: "not_applicable", not_applicable_claim_id: claimId });
        continue;
      }
      diagnostics.push(diagnostic10("classification", "FACT_ROUTE_TYPE_INVALID", `${path4}/route_type`, "explicit fact route must be Blocked or NotApplicable"));
    }
    if (submittedRoutes.length !== 1 || !factsById.has(factId)) continue;
    const route = submittedRoutes[0];
    const normalized = normalizedByRoute.get(route);
    if (!normalized) continue;
    if (normalized.route_type === "blocked") {
      routes.set(factId, normalized);
      continue;
    }
    const reviews = reviewsByFactId.get(factId) ?? [];
    if (reviews.length === 0) {
      diagnostics.push(diagnostic10("traceability", "NOT_APPLICABLE_REVIEW_MISSING", `/obligationCompilation/notApplicableReviews/${factId}`, `formal fact "${factId}" has no supported NotApplicable review`));
      continue;
    }
    if (reviews.length !== 1 || !validReviews.has(reviews[0])) continue;
    const review = reviews[0];
    const exclusionId = String(normalized.not_applicable_claim_id);
    const exclusion = claimsById.get(exclusionId);
    if (!exclusion) {
      diagnostics.push(diagnostic10("reference", "NOT_APPLICABLE_CLAIM_DANGLING", `${path4}/not_applicable_claim_id`, `NotApplicable route references unknown claim "${exclusionId}"`));
      continue;
    }
    if (review.claim_id !== exclusionId) {
      diagnostics.push(diagnostic10("traceability", "NOT_APPLICABLE_REVIEW_MISMATCH", `/obligationCompilation/notApplicableReviews/${factId}/claim_id`, "NotApplicable review must name the route exclusion claim"));
      continue;
    }
    if (exclusion.level !== "E3" && exclusion.level !== "E2") {
      diagnostics.push(diagnostic10("classification", "NOT_APPLICABLE_CLAIM_LEVEL_INVALID", `${path4}/not_applicable_claim_id`, "NotApplicable exclusion requires accepted E3 or E2 evidence"));
      continue;
    }
    const fact = (
      /** @type {Record<string, unknown>} */
      factsById.get(factId)
    );
    const factClaimIds = /* @__PURE__ */ new Set([String(fact.claim_id), ...stringArray5(fact.source_claim_ids)]);
    if ([...factClaimIds].some((claimId) => claimsDirectionallyRelated(
      relations,
      exclusionId,
      claimId
    ))) {
      diagnostics.push(diagnostic10("classification", "NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT", `${path4}/not_applicable_claim_id`, "NotApplicable exclusion must be independent from the fact claim and its sources"));
      continue;
    }
    const primaryClaim = claimsById.get(String(fact.claim_id));
    if (!primaryClaim || !isNonblankUnpadded(exclusion.scope) || !isNonblankUnpadded(primaryClaim.scope) || !scopeContains(String(exclusion.scope), String(primaryClaim.scope))) {
      diagnostics.push(diagnostic10("classification", "NOT_APPLICABLE_SCOPE_MISMATCH", `${path4}/not_applicable_claim_id`, "NotApplicable exclusion scope must cover the primary fact scope"));
      continue;
    }
    routes.set(factId, normalized);
  }
  for (const factId of [...reviewsByFactId.keys()].sort(compareCodePoints7)) {
    if (factsById.has(factId) && !notApplicableFactIds.has(factId)) diagnostics.push(diagnostic10(
      "traceability",
      "NOT_APPLICABLE_REVIEW_ORPHAN",
      `/obligationCompilation/notApplicableReviews/${factId}`,
      `NotApplicable review for fact "${factId}" has no NotApplicable route`
    ));
  }
  return routes;
}
function isResolvedTask4FactDiagnostic(item, terminalFactIds) {
  if (item.code !== "NORMATIVE_FACT_UNMODELED" && item.code !== "OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED") return false;
  const prefix = "/facts/";
  return item.path.startsWith(prefix) && terminalFactIds.has(item.path.slice(prefix.length));
}
function indexObligationsByViewAndDirectClaim(obligations) {
  const index = /* @__PURE__ */ new Map();
  for (const obligation of obligations) {
    if (!isNonblankUnpadded(obligation.obligation_id)) continue;
    const viewIds = new Set(stringArray5(obligation.view_element_refs).flatMap((ref) => {
      const parsed = parseQualifiedViewElementRef(ref);
      return parsed ? [parsed.viewId] : [];
    }));
    for (const viewId of viewIds) {
      let claims = index.get(viewId);
      if (!claims) {
        claims = /* @__PURE__ */ new Map();
        index.set(viewId, claims);
      }
      for (const claimId of stringArray5(obligation.source_claim_ids)) {
        let obligationIds = claims.get(claimId);
        if (!obligationIds) {
          obligationIds = /* @__PURE__ */ new Set();
          claims.set(claimId, obligationIds);
        }
        obligationIds.add(String(obligation.obligation_id));
      }
    }
  }
  return index;
}
function reconcileFactRoutes(facts, obligations, viewRoutes, terminalRoutes, relations, diagnostics) {
  const viewsByFact = new Map(viewRoutes.flatMap((route) => typeof route.fact_id === "string" ? [[route.fact_id, new Set(stringArray5(route.view_ids))]] : []));
  const obligationIndex = indexObligationsByViewAndDirectClaim(obligations);
  const routes = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const terminal = terminalRoutes.get(factId);
    const viewIds = viewsByFact.get(factId);
    if (terminal && viewIds) {
      diagnostics.push(diagnostic10("traceability", "FACT_ROUTE_MULTIPLE", `/fact_routes/${factId}`, `formal fact "${factId}" is both modeled and terminally routed`));
      continue;
    }
    if (terminal) {
      routes.push({ ...terminal });
      continue;
    }
    if (!viewIds) {
      diagnostics.push(diagnostic10("traceability", "FACT_ROUTE_MISSING", `/fact_routes/${factId}`, `formal fact "${factId}" has no explicit route`));
      continue;
    }
    const claimIds = [String(fact.claim_id), ...stringArray5(fact.source_claim_ids)];
    const descendantClaimIds = cachedReachableClaims(
      relations.childrenById,
      claimIds,
      relations.descendantsByRootSet
    );
    const obligationIds = /* @__PURE__ */ new Set();
    for (const viewId of viewIds) {
      const claims = obligationIndex.get(viewId);
      if (!claims) continue;
      for (const claimId of descendantClaimIds) {
        for (const obligationId of claims.get(claimId) ?? []) obligationIds.add(obligationId);
      }
    }
    if (obligationIds.size === 0) {
      diagnostics.push(diagnostic10("traceability", "FACT_ROUTE_OBLIGATION_MISSING", `/fact_routes/${factId}`, `modeled fact "${factId}" produced no formal obligation`));
      continue;
    }
    routes.push({ fact_id: factId, route_type: "obligations", obligation_ids: [...obligationIds].sort(compareCodePoints7) });
  }
  return routes.sort((left, right) => compareCodePoints7(String(left.fact_id), String(right.fact_id)));
}
function reconcileInteractionRoutes(candidates) {
  return candidates.map((candidate) => candidate.disposition === "formal-view" ? { candidate_id: candidate.candidate_id, route_type: "formal-view", formal_view_id: candidate.formal_view_id } : candidate.disposition === "blocker" ? { candidate_id: candidate.candidate_id, route_type: "blocked", blocker_root_issue_id: candidate.blocker_root_issue_id } : { candidate_id: candidate.candidate_id, route_type: "exploratory", exploratory_id: candidate.exploratory_id }).sort((left, right) => compareCodePoints7(String(left.candidate_id), String(right.candidate_id)));
}
function validateRouteIdentity(expected, routes, expectedField, routeField, label, diagnostics) {
  const expectedIds = new Set(expected.flatMap((item) => isNonblankUnpadded(item[expectedField]) ? [String(item[expectedField])] : []));
  const counts = /* @__PURE__ */ new Map();
  for (const route of routes) {
    const routeId = isNonblankUnpadded(route[routeField]) ? String(route[routeField]) : "";
    if (!expectedIds.has(routeId)) diagnostics.push(diagnostic10(
      "reference",
      `${label}_ROUTE_IDENTITY_UNKNOWN`,
      `/${routeField}/${pointerPart4(routeId || "invalid")}`,
      `${label} route references an identity outside the formal denominator`
    ));
    counts.set(routeId, (counts.get(routeId) ?? 0) + 1);
  }
  for (const expectedId of [...expectedIds].sort(compareCodePoints7)) {
    const count = counts.get(expectedId) ?? 0;
    if (count !== 1) diagnostics.push(diagnostic10(
      "traceability",
      `${label}_ROUTE_IDENTITY_NOT_EXACT`,
      `/${routeField}/${pointerPart4(expectedId)}`,
      `${label} identity "${expectedId}" must have exactly one explicit route; found ${count}`
    ));
  }
}
function compileObligations(evidenceGraph, behaviorViews) {
  const graph = isObject7(evidenceGraph) ? evidenceGraph : {};
  const artifact = isObject7(behaviorViews) ? behaviorViews : {};
  const structuralDiagnostics = [
    ...sparseBehaviorDiagnostics(artifact),
    ...behaviorStringDiagnostics(artifact),
    ...interactionStringDiagnostics(artifact),
    .../** @type {Diagnostic[]} */
    validateAgainstSchema(artifact, behavior_views_schema_default),
    .../** @type {Diagnostic[]} */
    validateUniqueStableIds(artifact)
  ];
  const inputs = compilationInputs(graph);
  const diagnostics = [...structuralDiagnostics];
  const evidence = validateEvidenceInputs(graph, inputs, artifact, diagnostics);
  const task4Evidence = {
    claimsById: evidence.claimsById,
    factLedger: evidence.facts,
    runScope: Object.hasOwn(graph, "runScope") && isNonblankUnpadded(graph.runScope) ? graph.runScope : ""
  };
  const viewValidation = validateBehaviorViews(task4Evidence, artifact);
  const interactionAudit = auditInteractionMatrix(artifact);
  const facts = formalFacts(evidence.facts, evidence.claimsById);
  const factsById = new Map(facts.flatMap((fact) => typeof fact.fact_id === "string" ? [[fact.fact_id, fact]] : []));
  const claimsById = evidence.claimsById;
  const terminalRoutes = terminalFactRoutes(inputs, factsById, claimsById, evidence.relations, diagnostics);
  diagnostics.push(
    .../** @type {Diagnostic[]} */
    viewValidation.diagnostics.filter((item) => !isResolvedTask4FactDiagnostic(item, new Set(terminalRoutes.keys()))),
    .../** @type {Diagnostic[]} */
    interactionAudit.diagnostics
  );
  const customValidation = validateCustomObligations(
    inputs,
    viewValidation.viewsById,
    claimsById,
    evidence.relations,
    diagnostics
  );
  assertNoDiagnostics(diagnostics);
  const strategySeeds = compileViewObligations(claimsById, viewValidation.viewsById, inputs, diagnostics);
  const systemObligations = mergeSystemObligations(strategySeeds, diagnostics);
  const customObligations = mergeCustomObligations(
    customValidation.seeds,
    customValidation.ownerBySeed,
    systemObligations,
    diagnostics
  );
  const obligations = [...systemObligations, ...customObligations].sort((left, right) => compareCodePoints7(String(left.obligation_id), String(right.obligation_id)));
  const factRoutes = reconcileFactRoutes(
    facts,
    obligations,
    /** @type {Record<string, unknown>[]} */
    viewValidation.factRoutes,
    terminalRoutes,
    evidence.relations,
    diagnostics
  );
  const interactionRoutes = reconcileInteractionRoutes(
    /** @type {Record<string, unknown>[]} */
    interactionAudit.candidates
  );
  validateRouteIdentity(facts, factRoutes, "fact_id", "fact_id", "FACT", diagnostics);
  validateRouteIdentity(
    /** @type {Record<string, unknown>[]} */
    interactionAudit.candidates,
    interactionRoutes,
    "candidate_id",
    "candidate_id",
    "INTERACTION",
    diagnostics
  );
  const compiled = {
    schema_version: "1.0.0",
    source_revision: typeof artifact.source_revision === "number" ? artifact.source_revision : -1,
    obligations,
    fact_routes: factRoutes,
    interaction_routes: interactionRoutes
  };
  diagnostics.push(
    .../** @type {Diagnostic[]} */
    validateAgainstSchema(compiled, test_obligations_schema_default),
    .../** @type {Diagnostic[]} */
    validateUniqueStableIds(compiled)
  );
  assertNoDiagnostics(diagnostics);
  return compiled;
}

// src/render-markdown.mjs
var RENDER_DIAGNOSTIC_LIMIT = 256;
var NATIVE_ARRAY_IS_ARRAY4 = Array.isArray;
var NATIVE_ARRAY_POP3 = Array.prototype.pop;
var NATIVE_ARRAY_SORT4 = Array.prototype.sort;
var NATIVE_ARRAY_JOIN4 = Array.prototype.join;
var NATIVE_GET_PROTOTYPE_OF4 = Object.getPrototypeOf;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTORS4 = Object.getOwnPropertyDescriptors;
var NATIVE_REFLECT_OWN_KEYS4 = Reflect.ownKeys;
var NATIVE_DEFINE_PROPERTY5 = Object.defineProperty;
var NATIVE_HAS_OWN2 = Object.hasOwn;
var BundleRenderError = class extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super("Markdown rendering requires a valid canonical test bundle");
    this.name = "BundleRenderError";
    this.status = "need_revision";
    this.stage = "render_markdown";
    const canonical = canonicalRenderDiagnostics(diagnostics);
    this.diagnostics = [];
    for (let index = 0; index < canonical.length; index += 1) {
      append(this.diagnostics, { ...canonical[index] });
    }
  }
};
function append(target, ...values) {
  for (let index = 0; index < values.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY5, Object, [
    target,
    String(target.length),
    { value: values[index], writable: true, enumerable: true, configurable: true }
  ]);
}
function appendArray(target, source) {
  for (let index = 0; index < source.length; index += 1) append(target, source[index]);
}
function joinArray4(values, separator) {
  return Reflect.apply(NATIVE_ARRAY_JOIN4, values, [separator]);
}
function pointerPart5(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function compareCodePoints8(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function canonicalRenderDiagnostics(diagnostics) {
  const unique = /* @__PURE__ */ new Map();
  let overflow = false;
  for (let index = 0; index < diagnostics.length; index += 1) {
    if (diagnostics[index].code === "DIAGNOSTICS_TRUNCATED") overflow = true;
    else unique.set(canonicalStringify(diagnostics[index]), diagnostics[index]);
  }
  if (unique.size > RENDER_DIAGNOSTIC_LIMIT) overflow = true;
  const sorted = [...unique.values()];
  Reflect.apply(NATIVE_ARRAY_SORT4, sorted, [(left, right) => compareCodePoints8(left.category, right.category) || compareCodePoints8(left.code, right.code) || compareCodePoints8(left.path, right.path) || compareCodePoints8(left.message, right.message)]);
  if (!overflow) return sorted;
  const retained = [];
  for (let index = 0; index < Math.min(sorted.length, RENDER_DIAGNOSTIC_LIMIT - 1); index += 1) {
    append(retained, sorted[index]);
  }
  append(retained, {
    category: "classification",
    code: "DIAGNOSTICS_TRUNCATED",
    path: "/",
    message: `render diagnostics are bounded at ${RENDER_DIAGNOSTIC_LIMIT} entries`
  });
  Reflect.apply(NATIVE_ARRAY_SORT4, retained, [(left, right) => compareCodePoints8(left.category, right.category) || compareCodePoints8(left.code, right.code) || compareCodePoints8(left.path, right.path) || compareCodePoints8(left.message, right.message)]);
  return retained;
}
function snapshotBundle(root) {
  const diagnostics = [];
  let snapshot;
  const pending = [{ source: root, path: "", assign(value) {
    snapshot = value;
  } }];
  const seen = /* @__PURE__ */ new Set();
  while (pending.length > 0) {
    const item = Reflect.apply(NATIVE_ARRAY_POP3, pending, []);
    if (!item) break;
    const { source, path: path4, assign } = item;
    if (!source || typeof source !== "object") {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      append(diagnostics, {
        category: "schema",
        code: "CYCLIC_BUNDLE_INVALID",
        path: path4 || "/",
        message: "render input must be an acyclic own-data bundle"
      });
      assign(null);
      continue;
    }
    seen.add(source);
    let prototype;
    let descriptors;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF4(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS4(source);
    } catch {
      append(diagnostics, {
        category: "schema",
        code: "BUNDLE_DESCRIPTOR_UNREADABLE",
        path: path4 || "/",
        message: "render input descriptors could not be captured"
      });
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY4(source)) {
      if (prototype !== Array.prototype) {
        append(diagnostics, {
          category: "schema",
          code: "ARRAY_PROTOTYPE_INVALID",
          path: path4 || "/",
          message: "render input arrays must use Array.prototype"
        });
        assign(null);
        continue;
      }
      const keys2 = NATIVE_REFLECT_OWN_KEYS4(descriptors);
      Reflect.apply(NATIVE_ARRAY_SORT4, keys2, [(left, right) => compareCodePoints8(
        typeof left === "symbol" ? String(left.description ?? "") : left,
        typeof right === "symbol" ? String(right.description ?? "") : right
      )]);
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && NATIVE_HAS_OWN2(lengthDescriptor, "value") && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      const numeric = [];
      let invalid = false;
      for (let index = 0; index < keys2.length; index += 1) {
        const key = keys2[index];
        if (typeof key === "symbol") {
          invalid = true;
          append(diagnostics, {
            category: "schema",
            code: "ARRAY_SYMBOL_PROPERTY_INVALID",
            path: path4 || "/",
            message: "render input arrays cannot contain symbol properties"
          });
          continue;
        }
        if (key === "length") continue;
        const numericKey = Number(key);
        if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= length || String(numericKey) !== key) {
          invalid = true;
          append(diagnostics, {
            category: "schema",
            code: "ARRAY_NAMED_PROPERTY_INVALID",
            path: `${path4}/${pointerPart5(key)}`,
            message: "render input arrays cannot contain named properties"
          });
        } else append(numeric, numericKey);
      }
      Reflect.apply(NATIVE_ARRAY_SORT4, numeric, [(left, right) => left - right]);
      if (numeric.length !== length) {
        invalid = true;
        let expected = 0;
        for (let index = 0; index < numeric.length; index += 1) {
          if (numeric[index] !== expected) break;
          expected += 1;
        }
        append(diagnostics, {
          category: "schema",
          code: "ARRAY_HOLE",
          path: `${path4}/${expected}`,
          message: "render input arrays must be dense"
        });
      }
      for (let index = 0; index < numeric.length; index += 1) {
        const descriptor = descriptors[String(numeric[index])];
        if (!descriptor || !NATIVE_HAS_OWN2(descriptor, "value")) {
          invalid = true;
          append(diagnostics, {
            category: "schema",
            code: "ACCESSOR_NOT_ALLOWED",
            path: `${path4}/${numeric[index]}`,
            message: "render input must use own data properties"
          });
        }
      }
      if (invalid) {
        assign(null);
        continue;
      }
      const target2 = new Array(length);
      assign(target2);
      for (let index = numeric.length - 1; index >= 0; index -= 1) {
        const numericKey = numeric[index];
        const descriptor = descriptors[String(numericKey)];
        append(pending, {
          source: descriptor.value,
          path: `${path4}/${numericKey}`,
          assign(value) {
            NATIVE_DEFINE_PROPERTY5(target2, numericKey, { value, enumerable: true, writable: true, configurable: true });
          }
        });
      }
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      append(diagnostics, {
        category: "schema",
        code: "RECORD_PROTOTYPE_INVALID",
        path: path4 || "/",
        message: "render input records must use a plain or null prototype"
      });
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS4(descriptors);
    Reflect.apply(NATIVE_ARRAY_SORT4, keys, [(left, right) => compareCodePoints8(
      typeof left === "symbol" ? String(left.description ?? "") : left,
      typeof right === "symbol" ? String(right.description ?? "") : right
    )]);
    const target = /* @__PURE__ */ Object.create(null);
    assign(target);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (typeof key === "symbol") {
        append(diagnostics, {
          category: "schema",
          code: "RECORD_SYMBOL_PROPERTY_INVALID",
          path: path4 || "/",
          message: "render input records cannot contain symbol properties"
        });
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor || !NATIVE_HAS_OWN2(descriptor, "value")) {
        append(diagnostics, {
          category: "schema",
          code: "ACCESSOR_NOT_ALLOWED",
          path: `${path4}/${pointerPart5(key)}`,
          message: "render input must use own data properties"
        });
      } else append(pending, {
        source: descriptor.value,
        path: `${path4}/${pointerPart5(key)}`,
        assign(value) {
          NATIVE_DEFINE_PROPERTY5(target, key, { value, enumerable: true, writable: true, configurable: true });
        }
      });
    }
  }
  return { snapshot, diagnostics: canonicalRenderDiagnostics(diagnostics) };
}
function inline(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "\\|").replaceAll("\r\n", "<br>").replaceAll("\n", "<br>").replaceAll("\r", "<br>");
}
function code(value) {
  return `<code>${inline(value)}</code>`;
}
function codeList(values) {
  if (values.length === 0) return "_None._";
  const encoded = [];
  for (let index = 0; index < values.length; index += 1) append(encoded, code(values[index]));
  return joinArray4(encoded, ", ");
}
function oracleText(oracle) {
  const expectedField = {
    value: "expected_value",
    state: "expected_state",
    event: "expected_event",
    "side-effect": "expected_side_effect"
  }[String(oracle.type)] ?? "";
  const parts = [inline(oracle.type), inline(oracle.comparison), code(oracle[expectedField])];
  if (Object.hasOwn(oracle, "tolerance")) append(parts, `tolerance ${code(oracle.tolerance)}`);
  if (Object.hasOwn(oracle, "window")) append(parts, `window ${code(oracle.window)}`);
  return joinArray4(parts, " ");
}
function renderCase(caseEntry, conditional) {
  const lines = [
    `### ${code(caseEntry.case_id)} \u2014 ${inline(caseEntry.title)}`,
    "",
    `- Scope: ${code(caseEntry.scope)}`,
    `- Risk: ${code(caseEntry.risk)}`,
    `- Role: ${inline(caseEntry.role.value)} (evidence: ${code(caseEntry.role.evidence_ref)})`,
    `- Requirement facts: ${codeList(caseEntry.fact_ids)}`,
    `- Formal Test Points: ${codeList(caseEntry.obligation_ids)}`,
    `- Evidence references: ${codeList(caseEntry.evidence_refs)}`
  ];
  if (conditional) append(
    lines,
    `- Temporary assumption: ${code(caseEntry.temporary_assumption.claim_id)}; invalid when ${inline(caseEntry.temporary_assumption.invalidation_condition)}`
  );
  append(lines, "", "#### Preconditions", "");
  for (let index = 0; index < caseEntry.preconditions.length; index += 1) {
    const item = caseEntry.preconditions[index];
    append(lines, `${index + 1}. ${inline(item.condition)} (reachable from: ${inline(item.reachable_from)}; evidence: ${code(item.evidence_ref)})`);
  }
  append(lines, "", "#### Test Data", "");
  for (let dataIndex = 0; dataIndex < caseEntry.data.length; dataIndex += 1) {
    const item = caseEntry.data[dataIndex];
    append(lines, `- ${inline(item.name)} = ${code(item.value)} (${inline(item.provenance.type)}: ${code(item.provenance.ref)})`);
  }
  append(lines, "", "#### Steps and Oracles", "");
  for (let index = 0; index < caseEntry.steps.length; index += 1) {
    const step = caseEntry.steps[index];
    append(lines, `${index + 1}. ${code(step.step_id)} \u2014 ${inline(step.action)} (evidence: ${code(step.action_evidence_ref)})`);
    for (let expectationIndex = 0; expectationIndex < step.expectations.length; expectationIndex += 1) {
      const expectation = step.expectations[expectationIndex];
      append(
        lines,
        `   - ${code(expectation.expectation_id)}: ${inline(expectation.business_assertion)}`,
        `     - Observe: ${inline(expectation.observer)} via ${inline(expectation.observation_surface)} \u2192 ${inline(expectation.observation_target)}`,
        `     - Oracle: ${oracleText(expectation.oracle)}`,
        `     - Evidence: ${code(expectation.evidence_ref)}`
      );
    }
  }
  append(lines, "", "#### Post-state and Cleanup", "");
  append(lines, `- Post-state: ${inline(caseEntry.post_state.state)} (evidence: ${code(caseEntry.post_state.evidence_ref)})`);
  if (caseEntry.cleanup.required) {
    const cleanupSteps = [];
    for (let index = 0; index < caseEntry.cleanup.steps.length; index += 1) {
      append(cleanupSteps, inline(caseEntry.cleanup.steps[index]));
    }
    append(lines, `- Cleanup: ${joinArray4(cleanupSteps, "; ")} (evidence: ${code(caseEntry.cleanup.evidence_ref)})`);
  } else append(
    lines,
    `- Cleanup: none \u2014 ${inline(caseEntry.cleanup.no_cleanup_reason)} (evidence: ${code(caseEntry.cleanup.no_cleanup_evidence_ref)})`
  );
  return lines;
}
function renderCaseLane(title, cases, conditional) {
  const lines = [`## ${title}`, ""];
  if (cases.length === 0) {
    append(lines, "_None._");
    return lines;
  }
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    if (index > 0) append(lines, "");
    appendArray(lines, renderCase(item, conditional));
  }
  return lines;
}
function table(headers, rows) {
  const separators = [];
  for (let index = 0; index < headers.length; index += 1) append(separators, "---");
  const output = [
    `| ${joinArray4(headers, " | ")} |`,
    `| ${joinArray4(separators, " | ")} |`
  ];
  for (let index = 0; index < rows.length; index += 1) {
    append(output, `| ${joinArray4(rows[index], " | ")} |`);
  }
  return output;
}
function renderMarkdownTrusted(bundle) {
  const captured = snapshotBundle(bundle);
  if (captured.diagnostics.length > 0) throw new BundleRenderError(captured.diagnostics);
  const snapshot = (
    /** @type {any} */
    captured.snapshot
  );
  const diagnostics = [];
  appendArray(
    diagnostics,
    /** @type {Diagnostic[]} */
    validateAgainstSchema(snapshot, test_bundle_schema_default)
  );
  appendArray(
    diagnostics,
    /** @type {Diagnostic[]} */
    validateUniqueStableIds(snapshot)
  );
  if (diagnostics.length > 0) throw new BundleRenderError(diagnostics);
  const lines = [
    "# Test Case Bundle",
    "",
    `- Schema version: ${code(snapshot.schema_version)}`,
    `- Source revision: ${code(snapshot.source_revision)}`,
    ""
  ];
  appendArray(lines, renderCaseLane("Grounded Cases", snapshot.grounded, false));
  append(lines, "");
  appendArray(lines, renderCaseLane("Conditional Cases", snapshot.conditional, true));
  append(lines, "", "## Blocked Formal Test Points", "");
  if (snapshot.blocked.length === 0) append(lines, "_None._");
  for (let index = 0; index < snapshot.blocked.length; index += 1) {
    const item = snapshot.blocked[index];
    append(
      lines,
      `### ${code(item.obligation_id)}`,
      "",
      `- Root issue: ${code(item.root_issue_id)}`,
      `- Risk: ${code(item.risk)}`,
      `- Reason: ${code(item.reason)}`,
      `- Missing type: ${code(item.recovery.missing_type)}`,
      `- Required material: ${inline(item.recovery.required_material)}`,
      `- Recovery question: ${inline(item.recovery.question)}`,
      ""
    );
  }
  if (lines[lines.length - 1] === "") Reflect.apply(NATIVE_ARRAY_POP3, lines, []);
  append(lines, "", "## Exploratory Cases", "");
  if (snapshot.exploratory.length === 0) append(lines, "_None._");
  for (let index = 0; index < snapshot.exploratory.length; index += 1) {
    const item = snapshot.exploratory[index];
    append(
      lines,
      `### ${code(item.exploratory_id)} \u2014 ${inline(item.title)}`,
      "",
      `- Scope: ${code(item.scope)}`,
      `- Risk: ${code(item.risk)}`,
      `- Reason: ${inline(item.reason)}`,
      ""
    );
  }
  if (lines[lines.length - 1] === "") Reflect.apply(NATIVE_ARRAY_POP3, lines, []);
  const coverage = snapshot.coverage;
  const requirementRows = [];
  for (let index = 0; index < coverage.requirements.entries.length; index += 1) {
    const item = coverage.requirements.entries[index];
    append(requirementRows, [code(item.fact_id), code(item.status)]);
  }
  const formalRows = [];
  for (let index = 0; index < coverage.formal.entries.length; index += 1) {
    const item = coverage.formal.entries[index];
    append(formalRows, [code(item.obligation_id), code(item.status)]);
  }
  const executableRows = [];
  for (let index = 0; index < coverage.executable.entries.length; index += 1) {
    const item = coverage.executable.entries[index];
    append(executableRows, [code(item.obligation_id), code(item.case_id)]);
  }
  append(
    lines,
    "",
    "## Coverage",
    "",
    "### Requirement Fact Ledger",
    "",
    `Accounted: ${coverage.requirements.accounted}/${coverage.requirements.total}`,
    ""
  );
  appendArray(lines, table(["Fact", "Status"], requirementRows));
  append(lines, "", "### Formal Test Point Ledger", "", `Covered: ${coverage.formal.covered}/${coverage.formal.total} declared`, "");
  appendArray(lines, table(["Test Point", "Disposition"], formalRows));
  append(lines, "", "### Grounded Executable Ledger", "", `Grounded: ${coverage.executable.grounded}/${coverage.executable.total}`, "");
  appendArray(lines, table(["Test Point", "Case"], executableRows));
  append(lines, "", "### Expert Recall Ledger", "", `Status: ${code(coverage.expert_recall.status)}`);
  for (let index = 0; index < coverage.expert_recall.limits.length; index += 1) {
    append(lines, `- ${inline(coverage.expert_recall.limits[index])}`);
  }
  append(lines, "", "### NotApplicable (excluded from the coverage numerator)", "");
  if (coverage.not_applicable.length === 0) append(lines, "_None._");
  else {
    const notApplicableRows = [];
    for (let index = 0; index < coverage.not_applicable.length; index += 1) {
      const item = coverage.not_applicable[index];
      append(notApplicableRows, [
        code(item.obligation_id),
        code(item.exclusion_claim_id),
        code(item.scope),
        code(item.support_review)
      ]);
    }
    appendArray(lines, table(["Test Point", "Exclusion evidence", "Scope", "Review"], notApplicableRows));
  }
  append(
    lines,
    "",
    "## Quality",
    "",
    `- Delivery status: ${code(snapshot.quality.delivery_status)}`,
    `- Compiler version: ${code(snapshot.quality.compiler_version)}`,
    `- Schema version: ${code(snapshot.quality.schema_version)}`,
    `- Source lineage digest: ${code(snapshot.quality.lineage.source_digest)}`,
    `- Case-draft lineage digest: ${code(snapshot.quality.lineage.case_draft_digest)}`,
    "- Limits:"
  );
  for (let index = 0; index < snapshot.quality.limits.length; index += 1) {
    append(lines, `  - ${inline(snapshot.quality.limits[index])}`);
  }
  return `${joinArray4(lines, "\n")}
`;
}
function renderMarkdown(bundle) {
  try {
    return renderMarkdownTrusted(bundle);
  } catch (error) {
    if (error instanceof BundleRenderError) throw error;
    throw new BundleRenderError([{
      category: "schema",
      code: "BUNDLE_NORMALIZATION_FAILED",
      path: "/",
      message: "render input could not be safely normalized"
    }]);
  }
}

// src/core.mjs
var INPUT_KEYS = Object.freeze([
  "schema_version",
  "source_revision",
  "compiler_version",
  "lineage",
  "source_pack",
  "evidence_claims",
  "behavior_views",
  "obligation_compilation",
  "case_drafts",
  "clarification",
  "limits",
  "expert_recall_limits"
]);
var COMPILATION_KEYS = Object.freeze([
  "contexts_by_view_id",
  "custom_obligations",
  "fact_routes",
  "not_applicable_reviews"
]);
var CLARIFICATION_KEYS2 = Object.freeze(["append_batch", "prior_state"]);
var DIAGNOSTIC_LIMIT4 = 256;
var NATIVE_ARRAY = Array;
var NATIVE_NUMBER = Number;
var NATIVE_NUMBER_IS_FINITE = Number.isFinite;
var NATIVE_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
var NATIVE_OBJECT = Object;
var NATIVE_OBJECT_PROTOTYPE = Object.prototype;
var NATIVE_SYMBOL = Symbol;
var NATIVE_SYMBOL_ITERATOR = Symbol.iterator;
var NATIVE_ARRAY_PROTOTYPE = Array.prototype;
var NATIVE_ARRAY_IS_ARRAY5 = Array.isArray;
var NATIVE_ARRAY_SPECIES_GET = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;
var NATIVE_ARRAY_ITERATOR = (
  /** @type {any} */
  Array.prototype[NATIVE_SYMBOL_ITERATOR]
);
var NATIVE_ARRAY_JOIN5 = Array.prototype.join;
var NATIVE_ARRAY_SORT5 = Array.prototype.sort;
var NATIVE_DEFINE_PROPERTY6 = Object.defineProperty;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTORS5 = Object.getOwnPropertyDescriptors;
var NATIVE_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
var NATIVE_GET_PROTOTYPE_OF5 = Object.getPrototypeOf;
var NATIVE_HAS_OWN3 = Object.hasOwn;
var NATIVE_MAP = Map;
var NATIVE_MAP_GET = Map.prototype.get;
var NATIVE_MAP_SET2 = Map.prototype.set;
var NATIVE_MAP_HAS = Map.prototype.has;
var NATIVE_MAP_DELETE = Map.prototype.delete;
var NATIVE_MAP_FOR_EACH = Map.prototype.forEach;
var NATIVE_MAP_ITERATOR = (
  /** @type {any} */
  Map.prototype[NATIVE_SYMBOL_ITERATOR]
);
var NATIVE_MAP_PROTOTYPE = Map.prototype;
var NATIVE_MAP_SIZE_GET = (
  /** @type {Function} */
  NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "size")?.get
);
var NATIVE_REGEXP_PROTOTYPE = RegExp.prototype;
var NATIVE_REGEXP_TEST = RegExp.prototype.test;
var NATIVE_REGEXP_EXEC = RegExp.prototype.exec;
var NATIVE_ARRAY_INDEX_PATTERN = /^(0|[1-9][0-9]*)$/u;
var NATIVE_SET = Set;
var NATIVE_SET_ADD = Set.prototype.add;
var NATIVE_SET_HAS = Set.prototype.has;
var NATIVE_SET_DELETE = Set.prototype.delete;
var NATIVE_SET_ITERATOR = (
  /** @type {any} */
  Set.prototype[NATIVE_SYMBOL_ITERATOR]
);
var NATIVE_SET_FOR_EACH = Set.prototype.forEach;
var NATIVE_SET_PROTOTYPE = Set.prototype;
var NATIVE_STRING = String;
var NATIVE_STRING_CODE_POINT_AT = String.prototype.codePointAt;
var NATIVE_STRING_TRIM = String.prototype.trim;
var NATIVE_STRING_INCLUDES = String.prototype.includes;
var NATIVE_STRING_SPLIT = String.prototype.split;
var NATIVE_STRING_ITERATOR = (
  /** @type {any} */
  String.prototype[NATIVE_SYMBOL_ITERATOR]
);
var NATIVE_STRING_PROTOTYPE = String.prototype;
var NATIVE_GLOBAL_THIS = globalThis;
var NATIVE_WEAK_MAP = WeakMap;
var NATIVE_WEAK_MAP_GET = WeakMap.prototype.get;
var NATIVE_WEAK_MAP_SET = WeakMap.prototype.set;
var NATIVE_OBJECT_CREATE = Object.create;
var NATIVE_OBJECT_ENTRIES = Object.entries;
var NATIVE_OBJECT_KEYS = Object.keys;
var NATIVE_REFLECT_APPLY2 = Reflect.apply;
var NATIVE_REFLECT_OWN_KEYS5 = Reflect.ownKeys;
var NATIVE_STRUCTURED_CLONE = structuredClone;
function filterArray4(values, predicate) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!NATIVE_HAS_OWN3(values, String(index))) continue;
    const value = values[index];
    if (predicate(value, index, values)) pushArray3(output, value);
  }
  return output;
}
function flatMapArray2(values, project) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!NATIVE_HAS_OWN3(values, String(index))) continue;
    appendArray2(output, project(values[index], index, values));
  }
  return output;
}
function mapArray4(values, project) {
  const output = [];
  NATIVE_DEFINE_PROPERTY6(output, "length", { value: values.length });
  for (let index = 0; index < values.length; index += 1) {
    if (!NATIVE_HAS_OWN3(values, String(index))) continue;
    NATIVE_DEFINE_PROPERTY6(output, String(index), {
      value: project(values[index], index, values),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return output;
}
function pushArray3(values, ...items) {
  for (let index = 0; index < items.length; index += 1) NATIVE_DEFINE_PROPERTY6(
    values,
    String(values.length),
    {
      value: items[index],
      enumerable: true,
      writable: true,
      configurable: true
    }
  );
  return values.length;
}
function appendArray2(target, source) {
  for (let index = 0; index < source.length; index += 1) pushArray3(target, source[index]);
}
function sliceArray3(values, start, end) {
  const length = values.length;
  const from = start < 0 ? length + start < 0 ? 0 : length + start : start > length ? length : start;
  const requestedEnd = end === void 0 ? length : end;
  const to = requestedEnd < 0 ? length + requestedEnd < 0 ? 0 : length + requestedEnd : requestedEnd > length ? length : requestedEnd;
  const outputLength = to > from ? to - from : 0;
  const output = [];
  NATIVE_DEFINE_PROPERTY6(output, "length", { value: outputLength });
  for (let index = from; index < to; index += 1) {
    if (!NATIVE_HAS_OWN3(values, String(index))) continue;
    NATIVE_DEFINE_PROPERTY6(output, String(index - from), {
      value: values[index],
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return output;
}
function someArray3(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (NATIVE_HAS_OWN3(values, String(index)) && predicate(values[index], index, values)) return true;
  }
  return false;
}
function joinArray5(values, separator) {
  return (
    /** @type {string} */
    NATIVE_REFLECT_APPLY2(NATIVE_ARRAY_JOIN5, values, [separator])
  );
}
function sortArray3(values, comparator) {
  return (
    /** @type {T[]} */
    NATIVE_REFLECT_APPLY2(NATIVE_ARRAY_SORT5, values, [comparator])
  );
}
function toNumber(value) {
  return (
    /** @type {number} */
    NATIVE_REFLECT_APPLY2(NATIVE_NUMBER, void 0, [value])
  );
}
function numberIsFinite(value) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(
      NATIVE_NUMBER_IS_FINITE,
      NATIVE_NUMBER,
      [value]
    )
  );
}
function numberIsSafeInteger(value) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(
      NATIVE_NUMBER_IS_SAFE_INTEGER,
      NATIVE_NUMBER,
      [value]
    )
  );
}
function mapSize(value) {
  return toNumber(NATIVE_REFLECT_APPLY2(NATIVE_MAP_SIZE_GET, value, []));
}
function regexpTest(expression, value) {
  return NATIVE_REFLECT_APPLY2(NATIVE_REGEXP_EXEC, expression, [value]) !== null;
}
function splitCommas(value) {
  const output = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === ",") {
      pushArray3(output, current);
      current = "";
    } else current += value[index];
  }
  pushArray3(output, current);
  return output;
}
function forEachMap(values, visit) {
  NATIVE_REFLECT_APPLY2(NATIVE_MAP_FOR_EACH, values, [visit]);
}
function forEachSet(values, visit) {
  NATIVE_REFLECT_APPLY2(NATIVE_SET_FOR_EACH, values, [visit]);
}
function mapGet(values, key) {
  return (
    /** @type {V|undefined} */
    NATIVE_REFLECT_APPLY2(NATIVE_MAP_GET, values, [key])
  );
}
function mapSet(values, key, value) {
  NATIVE_REFLECT_APPLY2(NATIVE_MAP_SET2, values, [key, value]);
}
function mapHas(values, key) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(NATIVE_MAP_HAS, values, [key])
  );
}
function mapDelete(values, key) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(NATIVE_MAP_DELETE, values, [key])
  );
}
function setAdd(values, value) {
  NATIVE_REFLECT_APPLY2(NATIVE_SET_ADD, values, [value]);
}
function setHas(values, value) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(NATIVE_SET_HAS, values, [value])
  );
}
function setDelete(values, value) {
  return (
    /** @type {boolean} */
    NATIVE_REFLECT_APPLY2(NATIVE_SET_DELETE, values, [value])
  );
}
function weakMapGet(values, key) {
  return (
    /** @type {V|undefined} */
    NATIVE_REFLECT_APPLY2(NATIVE_WEAK_MAP_GET, values, [key])
  );
}
function weakMapSet(values, key, value) {
  NATIVE_REFLECT_APPLY2(NATIVE_WEAK_MAP_SET, values, [key, value]);
}
function makeMap(entries = []) {
  const output = new NATIVE_MAP();
  for (let index = 0; index < entries.length; index += 1) {
    mapSet(output, entries[index][0], entries[index][1]);
  }
  return output;
}
function makeSet(items = []) {
  const output = new NATIVE_SET();
  for (let index = 0; index < items.length; index += 1) setAdd(output, items[index]);
  return output;
}
var POLICIES2 = makeSet(["pause_for_clarification", "record_only"]);
function mapValuesArray(values) {
  const output = [];
  forEachMap(values, (value) => pushArray3(output, value));
  return output;
}
function mapKeysArray(values) {
  const output = [];
  forEachMap(values, (_value, key) => pushArray3(output, key));
  return output;
}
function setValuesArray(values) {
  const output = [];
  forEachSet(values, (value) => pushArray3(output, value));
  return output;
}
function unionSortedStrings(left, right) {
  const unique = makeSet();
  for (let index = 0; index < left.length; index += 1) setAdd(unique, left[index]);
  for (let index = 0; index < right.length; index += 1) setAdd(unique, right[index]);
  return sortArray3(setValuesArray(unique), compareCodePoints9);
}
function intrinsicIntegrityDiagnostic() {
  try {
    const globalArrayDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Array");
    const globalSetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Set");
    const globalMapDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Map");
    const globalStringDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "String");
    const globalNumberDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Number");
    const globalObjectDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Object");
    const globalSymbolDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, "Symbol");
    const iteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_ARRAY_PROTOTYPE,
      NATIVE_SYMBOL_ITERATOR
    );
    const sortDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, "sort");
    const joinDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, "join");
    const zeroDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, "0");
    const arrayConstructorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_ARRAY_PROTOTYPE,
      "constructor"
    );
    const arraySpeciesDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_ARRAY,
      NATIVE_SYMBOL.species
    );
    const setIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_SET_PROTOTYPE,
      NATIVE_SYMBOL_ITERATOR
    );
    const setAddDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, "add");
    const setHasDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, "has");
    const setDeleteDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, "delete");
    const setForEachDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, "forEach");
    const mapIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_MAP_PROTOTYPE,
      NATIVE_SYMBOL_ITERATOR
    );
    const mapGetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "get");
    const mapSetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "set");
    const mapHasDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "has");
    const mapDeleteDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "delete");
    const mapForEachDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "forEach");
    const mapSizeDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, "size");
    const regexpTestDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_REGEXP_PROTOTYPE,
      "test"
    );
    const regexpExecDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_REGEXP_PROTOTYPE,
      "exec"
    );
    const stringIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE,
      NATIVE_SYMBOL_ITERATOR
    );
    const stringTrimDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE,
      "trim"
    );
    const stringIncludesDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE,
      "includes"
    );
    const stringSplitDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE,
      "split"
    );
    const stringSymbolSplitDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE,
      NATIVE_SYMBOL.split
    );
    if (globalArrayDescriptor && NATIVE_HAS_OWN3(globalArrayDescriptor, "value") && globalArrayDescriptor.value === NATIVE_ARRAY && globalSetDescriptor && NATIVE_HAS_OWN3(globalSetDescriptor, "value") && globalSetDescriptor.value === NATIVE_SET && globalMapDescriptor && NATIVE_HAS_OWN3(globalMapDescriptor, "value") && globalMapDescriptor.value === NATIVE_MAP && globalStringDescriptor && NATIVE_HAS_OWN3(globalStringDescriptor, "value") && globalStringDescriptor.value === NATIVE_STRING && globalNumberDescriptor && NATIVE_HAS_OWN3(globalNumberDescriptor, "value") && globalNumberDescriptor.value === NATIVE_NUMBER && globalObjectDescriptor && NATIVE_HAS_OWN3(globalObjectDescriptor, "value") && globalObjectDescriptor.value === NATIVE_OBJECT && globalSymbolDescriptor && NATIVE_HAS_OWN3(globalSymbolDescriptor, "value") && globalSymbolDescriptor.value === NATIVE_SYMBOL && iteratorDescriptor && NATIVE_HAS_OWN3(iteratorDescriptor, "value") && iteratorDescriptor.value === NATIVE_ARRAY_ITERATOR && sortDescriptor && NATIVE_HAS_OWN3(sortDescriptor, "value") && sortDescriptor.value === NATIVE_ARRAY_SORT5 && joinDescriptor && NATIVE_HAS_OWN3(joinDescriptor, "value") && joinDescriptor.value === NATIVE_ARRAY_JOIN5 && zeroDescriptor === void 0 && arrayConstructorDescriptor && NATIVE_HAS_OWN3(arrayConstructorDescriptor, "value") && arrayConstructorDescriptor.value === NATIVE_ARRAY && arraySpeciesDescriptor && NATIVE_HAS_OWN3(arraySpeciesDescriptor, "get") && arraySpeciesDescriptor.get === NATIVE_ARRAY_SPECIES_GET && setIteratorDescriptor && NATIVE_HAS_OWN3(setIteratorDescriptor, "value") && setIteratorDescriptor.value === NATIVE_SET_ITERATOR && setAddDescriptor && NATIVE_HAS_OWN3(setAddDescriptor, "value") && setAddDescriptor.value === NATIVE_SET_ADD && setHasDescriptor && NATIVE_HAS_OWN3(setHasDescriptor, "value") && setHasDescriptor.value === NATIVE_SET_HAS && setDeleteDescriptor && NATIVE_HAS_OWN3(setDeleteDescriptor, "value") && setDeleteDescriptor.value === NATIVE_SET_DELETE && setForEachDescriptor && NATIVE_HAS_OWN3(setForEachDescriptor, "value") && setForEachDescriptor.value === NATIVE_SET_FOR_EACH && mapIteratorDescriptor && NATIVE_HAS_OWN3(mapIteratorDescriptor, "value") && mapIteratorDescriptor.value === NATIVE_MAP_ITERATOR && mapGetDescriptor && NATIVE_HAS_OWN3(mapGetDescriptor, "value") && mapGetDescriptor.value === NATIVE_MAP_GET && mapSetDescriptor && NATIVE_HAS_OWN3(mapSetDescriptor, "value") && mapSetDescriptor.value === NATIVE_MAP_SET2 && mapHasDescriptor && NATIVE_HAS_OWN3(mapHasDescriptor, "value") && mapHasDescriptor.value === NATIVE_MAP_HAS && mapDeleteDescriptor && NATIVE_HAS_OWN3(mapDeleteDescriptor, "value") && mapDeleteDescriptor.value === NATIVE_MAP_DELETE && mapForEachDescriptor && NATIVE_HAS_OWN3(mapForEachDescriptor, "value") && mapForEachDescriptor.value === NATIVE_MAP_FOR_EACH && mapSizeDescriptor && NATIVE_HAS_OWN3(mapSizeDescriptor, "get") && mapSizeDescriptor.get === NATIVE_MAP_SIZE_GET && regexpTestDescriptor && NATIVE_HAS_OWN3(regexpTestDescriptor, "value") && regexpTestDescriptor.value === NATIVE_REGEXP_TEST && regexpExecDescriptor && NATIVE_HAS_OWN3(regexpExecDescriptor, "value") && regexpExecDescriptor.value === NATIVE_REGEXP_EXEC && stringIteratorDescriptor && NATIVE_HAS_OWN3(stringIteratorDescriptor, "value") && stringIteratorDescriptor.value === NATIVE_STRING_ITERATOR && stringTrimDescriptor && NATIVE_HAS_OWN3(stringTrimDescriptor, "value") && stringTrimDescriptor.value === NATIVE_STRING_TRIM && stringIncludesDescriptor && NATIVE_HAS_OWN3(stringIncludesDescriptor, "value") && stringIncludesDescriptor.value === NATIVE_STRING_INCLUDES && stringSplitDescriptor && NATIVE_HAS_OWN3(stringSplitDescriptor, "value") && stringSplitDescriptor.value === NATIVE_STRING_SPLIT && stringSymbolSplitDescriptor === void 0) return null;
  } catch {
  }
  return diagnostic11(
    "schema",
    "CORE_INTRINSIC_INVALID",
    "/intrinsics",
    "pure-core evaluation requires captured native collection and string traversal intrinsics"
  );
}
function isRecord4(value) {
  if (!value || typeof value !== "object" || NATIVE_ARRAY_IS_ARRAY5(value)) return false;
  const prototype = NATIVE_GET_PROTOTYPE_OF5(value);
  return prototype === NATIVE_OBJECT_PROTOTYPE || prototype === null;
}
function compareCodePoints9(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = toNumber(NATIVE_REFLECT_APPLY2(
      NATIVE_STRING_CODE_POINT_AT,
      left,
      [leftIndex]
    ));
    const rightPoint = toNumber(NATIVE_REFLECT_APPLY2(
      NATIVE_STRING_CODE_POINT_AT,
      right,
      [rightIndex]
    ));
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
    leftIndex += leftPoint > 65535 ? 2 : 1;
    rightIndex += rightPoint > 65535 ? 2 : 1;
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
}
function diagnostic11(category, code2, path4, message) {
  return { category, code: code2, path: path4, message };
}
function diagnosticArray(value) {
  if (!NATIVE_ARRAY_IS_ARRAY5(value)) return [];
  return flatMapArray2(value, (item) => isRecord4(item) && typeof item.category === "string" && typeof item.code === "string" && typeof item.path === "string" && typeof item.message === "string" ? [{
    category: item.category,
    code: item.code,
    path: item.path,
    message: item.message,
    ...typeof item.related_id === "string" ? { related_id: item.related_id } : {}
  }] : []);
}
function finalizeDiagnostics4(diagnostics) {
  const unique = makeMap();
  let overflow = false;
  for (let index = 0; index < diagnostics.length; index += 1) {
    const item = diagnostics[index];
    if (item.code === "DIAGNOSTICS_TRUNCATED") overflow = true;
    else mapSet(unique, canonicalStringify(item), item);
  }
  if (mapSize(unique) > DIAGNOSTIC_LIMIT4) overflow = true;
  const ordered = sortArray3(mapValuesArray(unique), (left, right) => compareCodePoints9(left.category, right.category) || compareCodePoints9(left.code, right.code) || compareCodePoints9(left.path, right.path) || compareCodePoints9(left.related_id ?? "", right.related_id ?? "") || compareCodePoints9(left.message, right.message));
  if (!overflow) return ordered;
  const retained = sliceArray3(ordered, 0, DIAGNOSTIC_LIMIT4 - 1);
  pushArray3(retained, diagnostic11(
    "classification",
    "DIAGNOSTICS_TRUNCATED",
    "/",
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT4} entries`
  ));
  return sortArray3(retained, (left, right) => compareCodePoints9(left.category, right.category) || compareCodePoints9(left.code, right.code) || compareCodePoints9(left.path, right.path) || compareCodePoints9(left.related_id ?? "", right.related_id ?? "") || compareCodePoints9(left.message, right.message));
}
function revisionRequired(stage, sourceRevision, diagnostics) {
  return {
    status: "need_revision",
    stage,
    source_revision: sourceRevision,
    diagnostics: finalizeDiagnostics4(diagnostics)
  };
}
function requireClosed2(value, expected, path4, diagnostics) {
  const allowed = makeSet();
  for (let index = 0; index < expected.length; index += 1) setAdd(allowed, expected[index]);
  const actualKeys = NATIVE_OBJECT_KEYS(value);
  for (let index = 0; index < actualKeys.length; index += 1) {
    const key = actualKeys[index];
    if (!setHas(allowed, key)) pushArray3(diagnostics, diagnostic11(
      "schema",
      "CORE_PROPERTY_UNKNOWN",
      `${path4}/${key}`,
      "pure-core input contains a property outside its closed revision contract"
    ));
  }
  for (let index = 0; index < expected.length; index += 1) {
    const key = expected[index];
    if (!NATIVE_HAS_OWN3(value, key)) pushArray3(diagnostics, diagnostic11(
      "schema",
      "CORE_PROPERTY_MISSING",
      `${path4}/${key}`,
      "pure-core input is missing a required revision property"
    ));
  }
}
function strings2(value) {
  return NATIVE_ARRAY_IS_ARRAY5(value) ? (
    /** @type {string[]} */
    filterArray4(value, (item) => typeof item === "string")
  ) : [];
}
function records2(value) {
  return NATIVE_ARRAY_IS_ARRAY5(value) ? (
    /** @type {Record<string, unknown>[]} */
    filterArray4(value, isRecord4)
  ) : [];
}
function pointerPart6(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    output += character === "~" ? "~0" : character === "/" ? "~1" : character;
  }
  return output;
}
function snapshotOwnData(submitted, rootPath) {
  const diagnostics = [];
  const root = NATIVE_OBJECT_CREATE(null);
  const pending = [{
    source: submitted,
    path: rootPath,
    assign(value) {
      NATIVE_DEFINE_PROPERTY6(root, "value", { value, enumerable: true });
    }
  }];
  const seen = new NATIVE_WEAK_MAP();
  let cursor = 0;
  while (cursor < pending.length) {
    const frame = pending[cursor++];
    const source = frame.source;
    if (source === null || typeof source === "string" || typeof source === "boolean" || typeof source === "number" && numberIsFinite(source)) {
      frame.assign(source);
      continue;
    }
    if (!source || typeof source !== "object") {
      pushArray3(diagnostics, diagnostic11(
        "schema",
        "CORE_VALUE_INVALID",
        frame.path || "/",
        "pure-core input values must be finite JSON own-data values"
      ));
      frame.assign(null);
      continue;
    }
    const cached = weakMapGet(seen, source);
    if (cached !== void 0) {
      frame.assign(cached);
      continue;
    }
    let prototype;
    let descriptors;
    let keys;
    let array2;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF5(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS5(source);
      keys = NATIVE_REFLECT_OWN_KEYS5(descriptors);
      array2 = NATIVE_ARRAY_IS_ARRAY5(source);
    } catch {
      pushArray3(diagnostics, diagnostic11(
        "schema",
        "CORE_INPUT_UNREADABLE",
        frame.path || "/",
        "pure-core input must expose a stable own-data descriptor snapshot"
      ));
      frame.assign(null);
      continue;
    }
    if (array2 ? prototype !== NATIVE_ARRAY_PROTOTYPE : prototype !== NATIVE_OBJECT_PROTOTYPE && prototype !== null) {
      pushArray3(diagnostics, diagnostic11(
        "schema",
        "CORE_PROTOTYPE_INVALID",
        frame.path || "/",
        "pure-core input containers must use native JSON prototypes"
      ));
      frame.assign(null);
      continue;
    }
    const stringKeys = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key === "symbol") pushArray3(diagnostics, diagnostic11(
        "schema",
        "CORE_SYMBOL_PROPERTY_INVALID",
        frame.path || "/",
        "pure-core input containers cannot define symbol properties"
      ));
      else pushArray3(stringKeys, key);
    }
    sortArray3(stringKeys, compareCodePoints9);
    if (array2) {
      const lengthDescriptor = descriptors.length;
      const declaredLength = toNumber(lengthDescriptor?.value);
      const numericKeys = [];
      let malformed = !numberIsSafeInteger(declaredLength) || declaredLength < 0;
      for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
        const key = stringKeys[keyIndex];
        if (key === "length") continue;
        if (regexpTest(NATIVE_ARRAY_INDEX_PATTERN, key) && toNumber(key) < 4294967295) {
          pushArray3(numericKeys, key);
        } else {
          malformed = true;
          pushArray3(diagnostics, diagnostic11(
            "schema",
            "CORE_ARRAY_PROPERTY_INVALID",
            `${frame.path}/${pointerPart6(key)}`,
            "controlled arrays cannot define named properties"
          ));
        }
      }
      sortArray3(numericKeys, (left, right) => toNumber(left) - toNumber(right));
      let firstHole = -1;
      if (!malformed && numericKeys.length !== declaredLength) {
        let expected = 0;
        for (let index = 0; index < numericKeys.length; index += 1) {
          const actual = toNumber(numericKeys[index]);
          if (actual !== expected) {
            firstHole = expected;
            break;
          }
          expected += 1;
        }
        if (firstHole < 0) firstHole = numericKeys.length;
      }
      if (firstHole >= 0) {
        malformed = true;
        pushArray3(diagnostics, diagnostic11(
          "schema",
          "CORE_ARRAY_HOLE",
          `${frame.path}/${firstHole}`,
          "controlled arrays must be dense"
        ));
      }
      if (malformed) {
        frame.assign(new NATIVE_ARRAY());
        continue;
      }
      const target2 = new NATIVE_ARRAY(declaredLength);
      weakMapSet(seen, source, target2);
      frame.assign(target2);
      for (let index = 0; index < numericKeys.length; index += 1) {
        const key = numericKeys[index];
        const descriptor = descriptors[key];
        if (!descriptor || !NATIVE_HAS_OWN3(descriptor, "value") || descriptor.enumerable !== true) {
          pushArray3(diagnostics, diagnostic11(
            "schema",
            "CORE_DATA_PROPERTY_INVALID",
            `${frame.path}/${key}`,
            "pure-core input containers require enumerable own data properties"
          ));
          continue;
        }
        pushArray3(pending, {
          source: descriptor.value,
          path: `${frame.path}/${key}`,
          assign(value) {
            NATIVE_DEFINE_PROPERTY6(target2, key, {
              value,
              enumerable: true,
              writable: true,
              configurable: true
            });
          }
        });
      }
      continue;
    }
    const target = NATIVE_OBJECT_CREATE(null);
    weakMapSet(seen, source, target);
    frame.assign(target);
    for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
      const key = stringKeys[keyIndex];
      const descriptor = descriptors[key];
      if (!descriptor || !NATIVE_HAS_OWN3(descriptor, "value") || descriptor.enumerable !== true) {
        pushArray3(diagnostics, diagnostic11(
          "schema",
          "CORE_DATA_PROPERTY_INVALID",
          `${frame.path}/${pointerPart6(key)}`,
          "pure-core input containers require enumerable own data properties"
        ));
        continue;
      }
      pushArray3(pending, {
        source: descriptor.value,
        path: `${frame.path}/${pointerPart6(key)}`,
        assign(value) {
          NATIVE_DEFINE_PROPERTY6(target, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true
          });
        }
      });
    }
  }
  return { snapshot: root.value, diagnostics };
}
function normalizeInput(submitted) {
  const diagnostics = [];
  const captured = snapshotOwnData(submitted, "");
  appendArray2(diagnostics, captured.diagnostics);
  const input = captured.snapshot;
  if (!isRecord4(input)) return { input: null, diagnostics: [diagnostic11(
    "schema",
    "CORE_INPUT_INVALID",
    "/",
    "pure-core input must be a closed plain record"
  )] };
  requireClosed2(input, INPUT_KEYS, "", diagnostics);
  const sourceRevision = typeof input.source_revision === "number" ? input.source_revision : 0 / 0;
  if (input.schema_version !== "1.0.0") pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_SCHEMA_VERSION_INVALID",
    "/schema_version",
    "pure core requires schema version 1.0.0"
  ));
  if (!numberIsSafeInteger(sourceRevision) || sourceRevision < 0) pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_SOURCE_REVISION_INVALID",
    "/source_revision",
    "source revision must be a nonnegative safe integer"
  ));
  if (typeof input.compiler_version !== "string" || input.compiler_version.trim().length === 0 || input.compiler_version !== input.compiler_version.trim()) pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_COMPILER_VERSION_INVALID",
    "/compiler_version",
    "compiler version must be nonblank and unpadded"
  ));
  if (!isRecord4(input.lineage)) pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_LINEAGE_INVALID",
    "/lineage",
    "lineage must be an own-data record"
  ));
  const compilation = isRecord4(input.obligation_compilation) ? input.obligation_compilation : null;
  if (!compilation) pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_OBLIGATION_COMPILATION_INVALID",
    "/obligation_compilation",
    "obligation compilation input must be a closed record"
  ));
  else {
    requireClosed2(compilation, COMPILATION_KEYS, "/obligation_compilation", diagnostics);
    if (!isRecord4(compilation.contexts_by_view_id) || !NATIVE_ARRAY_IS_ARRAY5(compilation.custom_obligations) || !NATIVE_ARRAY_IS_ARRAY5(compilation.fact_routes) || !NATIVE_ARRAY_IS_ARRAY5(compilation.not_applicable_reviews)) pushArray3(diagnostics, diagnostic11(
      "schema",
      "CORE_OBLIGATION_COMPILATION_INVALID",
      "/obligation_compilation",
      "obligation compilation contexts must be a record and remaining fields arrays"
    ));
  }
  const clarification = isRecord4(input.clarification) ? input.clarification : null;
  if (!clarification) pushArray3(diagnostics, diagnostic11(
    "schema",
    "CORE_CLARIFICATION_INVALID",
    "/clarification",
    "clarification input must be a closed record"
  ));
  else requireClosed2(clarification, CLARIFICATION_KEYS2, "/clarification", diagnostics);
  return { input, diagnostics };
}
function validateArtifactSchemas(input) {
  const diagnostics = [];
  const artifactsAndSchemas = [
    [input.source_pack, source_pack_schema_default],
    [input.evidence_claims, evidence_claims_schema_default],
    [input.behavior_views, behavior_views_schema_default],
    [input.case_drafts, case_drafts_schema_default]
  ];
  for (let index = 0; index < artifactsAndSchemas.length; index += 1) {
    const artifact = artifactsAndSchemas[index][0];
    const schema = artifactsAndSchemas[index][1];
    appendArray2(
      diagnostics,
      /** @type {Diagnostic[]} */
      validateAgainstSchema(artifact, schema)
    );
    appendArray2(
      diagnostics,
      /** @type {Diagnostic[]} */
      validateUniqueStableIds(artifact)
    );
  }
  const revision = toNumber(input.source_revision);
  const namedArtifacts = [
    ["source_pack", input.source_pack],
    ["evidence_claims", input.evidence_claims],
    ["behavior_views", input.behavior_views],
    ["case_drafts", input.case_drafts]
  ];
  for (let index = 0; index < namedArtifacts.length; index += 1) {
    const name = namedArtifacts[index][0];
    const artifact = namedArtifacts[index][1];
    if (!isRecord4(artifact) || artifact.source_revision !== revision) pushArray3(diagnostics, diagnostic11(
      "traceability",
      "CORE_SOURCE_REVISION_MISMATCH",
      `/${name}/source_revision`,
      "every submitted artifact must identify the complete revision being evaluated"
    ));
  }
  return finalizeDiagnostics4(diagnostics);
}
function evidenceContext(input, claimsById, conflicts) {
  const sourcePack = (
    /** @type {Record<string, unknown>} */
    input.source_pack
  );
  const evidenceClaims = (
    /** @type {Record<string, unknown>} */
    input.evidence_claims
  );
  const compilation = (
    /** @type {Record<string, unknown>} */
    input.obligation_compilation
  );
  const contexts = (
    /** @type {Record<string, unknown>} */
    compilation.contexts_by_view_id
  );
  return {
    claimsById,
    factLedger: NATIVE_STRUCTURED_CLONE(records2(evidenceClaims.fact_ledger)),
    conflicts: NATIVE_STRUCTURED_CLONE(conflicts),
    runScope: String(sourcePack.run_scope),
    obligationCompilation: {
      sourceRevision: toNumber(input.source_revision),
      contextsByViewId: makeMap(NATIVE_OBJECT_ENTRIES(NATIVE_STRUCTURED_CLONE(contexts))),
      factRoutes: NATIVE_STRUCTURED_CLONE(records2(compilation.fact_routes)),
      notApplicableReviews: NATIVE_STRUCTURED_CLONE(records2(compilation.not_applicable_reviews)),
      customObligations: NATIVE_STRUCTURED_CLONE(records2(compilation.custom_obligations))
    }
  };
}
function scopesIntersect3(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}
function conflictIdentity(conflict) {
  return typeof conflict.conflict_id === "string" ? conflict.conflict_id : typeof conflict.root_issue_id === "string" ? conflict.root_issue_id : canonicalStringify(conflict);
}
function prepareConflictRelations(claimsById, sourcePack, conflicts) {
  const locatorSourceById = makeMap(mapArray4(records2(sourcePack.locators), (item) => [
    String(item.locator_id),
    String(item.source_id)
  ]));
  const conflictByIdentity = makeMap();
  const conflictIdsBySource = makeMap();
  for (let index = 0; index < conflicts.length; index += 1) {
    const conflict = conflicts[index];
    const identity = conflictIdentity(conflict);
    mapSet(conflictByIdentity, identity, conflict);
    const sourceIds = makeSet(strings2(conflict.source_ids));
    forEachSet(sourceIds, (sourceId) => {
      const bucket = mapGet(conflictIdsBySource, sourceId);
      if (bucket) pushArray3(bucket, identity);
      else mapSet(conflictIdsBySource, sourceId, [identity]);
    });
  }
  const directCandidateIdsByClaim = makeMap();
  const candidateIdsByClaim = makeMap();
  const childrenByClaim = makeMap();
  const parentsByClaim = makeMap();
  const indegreeByClaim = makeMap();
  const claimIds = sortArray3(mapKeysArray(claimsById), compareCodePoints9);
  for (let index = 0; index < claimIds.length; index += 1) {
    const claimId = claimIds[index];
    const claim = mapGet(claimsById, claimId) ?? {};
    const candidates = makeSet();
    const directSourceIds = makeSet();
    if (typeof claim.source_id === "string") setAdd(directSourceIds, claim.source_id);
    const locatorIds = strings2(claim.source_locator_ids);
    for (let locatorIndex = 0; locatorIndex < locatorIds.length; locatorIndex += 1) {
      const sourceId = mapGet(locatorSourceById, locatorIds[locatorIndex]);
      if (sourceId !== void 0) setAdd(directSourceIds, sourceId);
    }
    forEachSet(directSourceIds, (sourceId) => {
      const identities = mapGet(conflictIdsBySource, sourceId) ?? [];
      for (let identityIndex = 0; identityIndex < identities.length; identityIndex += 1) {
        setAdd(candidates, identities[identityIndex]);
      }
    });
    mapSet(directCandidateIdsByClaim, claimId, candidates);
    const parents = makeSet(strings2(claim.parent_claim_ids));
    const parentIds = sortArray3(setValuesArray(parents), compareCodePoints9);
    mapSet(parentsByClaim, claimId, parentIds);
    let indegree = 0;
    for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
      const parentId = parentIds[parentIndex];
      if (!mapHas(claimsById, parentId)) continue;
      indegree += 1;
      const children = mapGet(childrenByClaim, parentId);
      if (children) pushArray3(children, claimId);
      else mapSet(childrenByClaim, parentId, [claimId]);
    }
    mapSet(indegreeByClaim, claimId, indegree);
  }
  const ready = [];
  for (let index = 0; index < claimIds.length; index += 1) {
    if (mapGet(indegreeByClaim, claimIds[index]) === 0) pushArray3(ready, claimIds[index]);
  }
  const internedCandidates = makeMap();
  const candidateSetIdentity = new NATIVE_WEAK_MAP();
  const unionBySignature = makeMap();
  const candidateCountByClaim = makeMap();
  let nextCandidateSetIdentity = 0;
  let cursor = 0;
  while (cursor < ready.length) {
    const claimId = ready[cursor++];
    const directCandidates = mapGet(directCandidateIdsByClaim, claimId) ?? makeSet();
    const directItems = setValuesArray(directCandidates);
    const parentIds = mapGet(parentsByClaim, claimId) ?? [];
    const uniqueParentCandidates = makeSet();
    for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
      const parentCandidates = mapGet(candidateIdsByClaim, parentIds[parentIndex]);
      if (parentCandidates) setAdd(uniqueParentCandidates, parentCandidates);
    }
    const uniqueParents = setValuesArray(uniqueParentCandidates);
    let resolvedCandidates;
    let resolvedCount;
    if (directItems.length === 0 && uniqueParents.length === 1) {
      resolvedCandidates = uniqueParents[0];
      const firstParentId = parentIds[0];
      resolvedCount = toNumber(mapGet(candidateCountByClaim, firstParentId) ?? 0);
    } else {
      const directSignature = sortArray3(sliceArray3(directItems, 0), compareCodePoints9);
      const parentSetIdentities = [];
      for (let parentIndex = 0; parentIndex < uniqueParents.length; parentIndex += 1) {
        const parentCandidates = uniqueParents[parentIndex];
        let identity = weakMapGet(candidateSetIdentity, parentCandidates);
        if (identity === void 0) {
          identity = nextCandidateSetIdentity;
          nextCandidateSetIdentity += 1;
          weakMapSet(candidateSetIdentity, parentCandidates, identity);
        }
        pushArray3(parentSetIdentities, identity);
      }
      sortArray3(parentSetIdentities, (left, right) => left - right);
      const unionSignature = canonicalStringify([directSignature, parentSetIdentities]);
      const cachedUnion = mapGet(unionBySignature, unionSignature);
      if (cachedUnion) {
        resolvedCandidates = cachedUnion.candidates;
        resolvedCount = cachedUnion.count;
      } else {
        const merged = makeSet(directItems);
        let baseParentId = null;
        let baseCount = -1;
        for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
          const parentId = parentIds[parentIndex];
          const count = toNumber(mapGet(candidateCountByClaim, parentId) ?? 0);
          if (count > baseCount || count === baseCount && baseParentId !== null && compareCodePoints9(parentId, baseParentId) < 0) {
            baseParentId = parentId;
            baseCount = count;
          }
        }
        const baseCandidates = baseParentId === null ? null : mapGet(candidateIdsByClaim, baseParentId) ?? null;
        if (baseCandidates) forEachSet(baseCandidates, (identity) => setAdd(merged, identity));
        const coveredByBase = makeSet(
          baseParentId === null ? [] : mapGet(parentsByClaim, baseParentId) ?? []
        );
        const mergedParentSets = makeSet();
        if (baseCandidates) setAdd(mergedParentSets, baseCandidates);
        for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
          const parentId = parentIds[parentIndex];
          if (parentId === baseParentId || setHas(coveredByBase, parentId)) continue;
          const parentCandidates = mapGet(candidateIdsByClaim, parentId);
          if (!parentCandidates || setHas(mergedParentSets, parentCandidates)) continue;
          setAdd(mergedParentSets, parentCandidates);
          forEachSet(parentCandidates, (identity) => setAdd(merged, identity));
        }
        const ordered = sortArray3(setValuesArray(merged), compareCodePoints9);
        resolvedCount = ordered.length;
        const key = canonicalStringify(ordered);
        const interned = mapGet(internedCandidates, key);
        if (interned) resolvedCandidates = interned;
        else {
          resolvedCandidates = merged;
          mapSet(internedCandidates, key, merged);
        }
        mapSet(unionBySignature, unionSignature, {
          candidates: resolvedCandidates,
          count: resolvedCount
        });
      }
    }
    mapSet(candidateIdsByClaim, claimId, resolvedCandidates);
    mapSet(candidateCountByClaim, claimId, resolvedCount);
    const children = mapGet(childrenByClaim, claimId) ?? [];
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const childId = children[childIndex];
      const nextIndegree = toNumber(mapGet(indegreeByClaim, childId)) - 1;
      mapSet(indegreeByClaim, childId, nextIndegree);
      if (nextIndegree === 0) pushArray3(ready, childId);
    }
  }
  return { candidateIdsByClaim, conflictByIdentity };
}
function makeConflictSelectionCache() {
  return {
    /** @type {WeakMap<object,number>} */
    relationIdentityBySet: new NATIVE_WEAK_MAP(),
    nextRelationIdentity: 0,
    /** @type {Map<string,Set<string>>} */
    unionBySignature: makeMap(),
    /** @type {Map<string,Set<string>>} */
    internedUnions: makeMap(),
    /** @type {WeakMap<object,string[]>} */
    orderedIdsByUnion: new NATIVE_WEAK_MAP(),
    /** @type {WeakMap<object,Map<string,any>>} */
    selectionsByUnion: new NATIVE_WEAK_MAP()
  };
}
function conflictSelectionForCase(caseDraft, relations, allowedConflictIds, cache) {
  const relatedSets = makeSet();
  const refs = strings2(caseDraft.evidence_refs);
  for (let index = 0; index < refs.length; index += 1) {
    const related = mapGet(relations.candidateIdsByClaim, refs[index]);
    if (related) setAdd(relatedSets, related);
  }
  const uniqueRelatedSets = setValuesArray(relatedSets);
  const relationIdentities = [];
  for (let index = 0; index < uniqueRelatedSets.length; index += 1) {
    const related = uniqueRelatedSets[index];
    let identity = weakMapGet(cache.relationIdentityBySet, related);
    if (identity === void 0) {
      identity = cache.nextRelationIdentity;
      cache.nextRelationIdentity += 1;
      weakMapSet(cache.relationIdentityBySet, related, identity);
    }
    pushArray3(relationIdentities, identity);
  }
  sortArray3(relationIdentities, (left, right) => left - right);
  const unionSignature = canonicalStringify(relationIdentities);
  let candidateIds = mapGet(cache.unionBySignature, unionSignature);
  if (!candidateIds) {
    const merged = makeSet();
    for (let index = 0; index < uniqueRelatedSets.length; index += 1) {
      forEachSet(uniqueRelatedSets[index], (identity) => {
        if (setHas(allowedConflictIds, identity)) setAdd(merged, identity);
      });
    }
    const orderedIds2 = sortArray3(setValuesArray(merged), compareCodePoints9);
    const candidateKey = canonicalStringify(orderedIds2);
    candidateIds = mapGet(cache.internedUnions, candidateKey);
    if (!candidateIds) {
      candidateIds = merged;
      mapSet(cache.internedUnions, candidateKey, candidateIds);
      weakMapSet(cache.orderedIdsByUnion, candidateIds, orderedIds2);
    }
    mapSet(cache.unionBySignature, unionSignature, candidateIds);
  }
  let selectionsByScope = weakMapGet(cache.selectionsByUnion, candidateIds);
  if (!selectionsByScope) {
    selectionsByScope = makeMap();
    weakMapSet(cache.selectionsByUnion, candidateIds, selectionsByScope);
  }
  const caseScope = typeof caseDraft.scope === "string" ? caseDraft.scope : "";
  const cachedSelection = mapGet(selectionsByScope, caseScope);
  if (cachedSelection) return cachedSelection;
  let selectedIdentity = null;
  let count = 0;
  const orderedIds = weakMapGet(cache.orderedIdsByUnion, candidateIds) ?? sortArray3(setValuesArray(candidateIds), compareCodePoints9);
  for (let index = 0; index < orderedIds.length; index += 1) {
    const identity = orderedIds[index];
    const conflict = mapGet(relations.conflictByIdentity, identity);
    if (!conflict) continue;
    const conflictScope = conflict.scope;
    if (typeof conflictScope === "string" && scopesIntersect3(caseScope, conflictScope)) {
      count += 1;
      if (selectedIdentity === null) selectedIdentity = identity;
      if (count === 2) break;
    }
  }
  const selection = {
    conflict: selectedIdentity === null ? null : mapGet(relations.conflictByIdentity, selectedIdentity) ?? null,
    identity: selectedIdentity,
    count
  };
  mapSet(selectionsByScope, caseScope, selection);
  return selection;
}
function applyLocalConflictBlocks(classification, obligations, claimsById, sourcePack, conflicts, preparedRelations) {
  if (conflicts.length === 0) return classification;
  const relations = preparedRelations ?? prepareConflictRelations(claimsById, sourcePack, conflicts);
  const allowedConflictIds = makeSet();
  for (let index = 0; index < conflicts.length; index += 1) {
    setAdd(allowedConflictIds, conflictIdentity(conflicts[index]));
  }
  const executable = mapArray4(
    records2(classification.grounded),
    (item) => ({ lane: "grounded", item })
  );
  appendArray2(executable, mapArray4(
    records2(classification.conditional),
    (item) => ({ lane: "conditional", item })
  ));
  const casesByObligation = makeMap();
  for (let index = 0; index < executable.length; index += 1) {
    const linkedIds = strings2(executable[index].item.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const bucket = mapGet(casesByObligation, obligationId);
      if (bucket) pushArray3(bucket, index);
      else mapSet(casesByObligation, obligationId, [index]);
    }
  }
  const obligationsById = makeMap(mapArray4(obligations, (item) => [String(item.obligation_id), item]));
  const blockedByObligation = makeMap(mapArray4(records2(classification.blocked), (item) => [
    String(item.obligation_id),
    NATIVE_STRUCTURED_CLONE(item)
  ]));
  const blockedQueue = sortArray3(mapKeysArray(blockedByObligation), compareCodePoints9);
  const invalidCases = makeSet();
  const selections = [];
  const conflictIdsByObligation = makeMap();
  const ambiguityDiagnostics = [];
  const selectionCache = makeConflictSelectionCache();
  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const selection = conflictSelectionForCase(
      caseDraft,
      relations,
      allowedConflictIds,
      selectionCache
    );
    pushArray3(selections, selection);
    if (selection.count > 1) pushArray3(ambiguityDiagnostics, diagnostic11(
      "classification",
      "CORE_SOURCE_CONFLICT_AMBIGUOUS",
      `/cases/${pointerPart6(String(caseDraft.case_id ?? "unknown"))}/evidence_refs`,
      "one executable Case cannot select more than one canonical source conflict"
    ));
    if (selection.identity === null) continue;
    const linkedIds = strings2(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const identities = mapGet(conflictIdsByObligation, obligationId) ?? makeSet();
      setAdd(identities, selection.identity);
      mapSet(conflictIdsByObligation, obligationId, identities);
    }
  }
  forEachMap(conflictIdsByObligation, (identities, obligationId) => {
    if (setValuesArray(identities).length <= 1) return;
    pushArray3(ambiguityDiagnostics, diagnostic11(
      "classification",
      "CORE_SOURCE_CONFLICT_AMBIGUOUS",
      `/obligations/${pointerPart6(obligationId)}`,
      "one formal obligation cannot select different canonical source conflicts"
    ));
  });
  if (ambiguityDiagnostics.length > 0) {
    const combinedDiagnostics = diagnosticArray(classification.diagnostics);
    appendArray2(combinedDiagnostics, ambiguityDiagnostics);
    return { ...classification, diagnostics: finalizeDiagnostics4(combinedDiagnostics) };
  }
  function block(obligationId, reason, evidenceRefs, rootIssueId) {
    const obligation = mapGet(obligationsById, obligationId);
    if (!obligation) return;
    const existing = mapGet(blockedByObligation, obligationId);
    const reasons = makeSet(existing ? splitCommas(String(existing.reason)) : []);
    setAdd(reasons, reason);
    setDelete(reasons, "");
    const refs = makeSet(existing ? strings2(existing.evidence_refs) : []);
    for (let index = 0; index < evidenceRefs.length; index += 1) setAdd(refs, evidenceRefs[index]);
    const orderedReasons = sortArray3(setValuesArray(reasons), compareCodePoints9);
    mapSet(blockedByObligation, obligationId, {
      obligation_id: obligationId,
      root_issue_id: rootIssueId ?? String(existing?.root_issue_id ?? stableId("root", {
        missing_type: "case-classification",
        obligation_id: obligationId,
        reason_codes: orderedReasons,
        scope: obligation.scope
      })),
      reason: joinArray5(orderedReasons, ","),
      risk: String(obligation.risk),
      evidence_refs: sortArray3(setValuesArray(refs), compareCodePoints9)
    });
    if (!existing) pushArray3(blockedQueue, obligationId);
  }
  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const conflict = selections[index].conflict;
    if (!conflict) continue;
    setAdd(invalidCases, index);
    const linkedIds = strings2(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) block(
      linkedIds[obligationIndex],
      "UNRESOLVED_CONFLICT",
      strings2(caseDraft.evidence_refs),
      typeof conflict.root_issue_id === "string" ? conflict.root_issue_id : null
    );
  }
  let cursor = 0;
  while (cursor < blockedQueue.length) {
    const blockedId = blockedQueue[cursor++];
    const linkedCaseIndexes = mapGet(casesByObligation, blockedId) ?? [];
    for (let linkedIndex = 0; linkedIndex < linkedCaseIndexes.length; linkedIndex += 1) {
      const caseIndex = linkedCaseIndexes[linkedIndex];
      if (setHas(invalidCases, caseIndex)) continue;
      setAdd(invalidCases, caseIndex);
      const caseDraft = executable[caseIndex].item;
      const linkedIds = strings2(caseDraft.obligation_ids);
      for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) block(
        linkedIds[obligationIndex],
        "CASE_SHARES_BLOCKED_OBLIGATION",
        strings2(caseDraft.evidence_refs),
        null
      );
    }
  }
  return {
    ...classification,
    grounded: mapArray4(filterArray4(executable, (item, index) => item.lane === "grounded" && !setHas(invalidCases, index)), (item) => item.item),
    conditional: mapArray4(filterArray4(executable, (item, index) => item.lane === "conditional" && !setHas(invalidCases, index)), (item) => item.item),
    blocked: sortArray3(mapValuesArray(blockedByObligation), (left, right) => compareCodePoints9(String(left.obligation_id), String(right.obligation_id)))
  };
}
function missingType(reason) {
  if (reason.includes("ORACLE")) return "oracle";
  if (reason.includes("CONFLICT")) return "source-conflict";
  if (reason.includes("CAPABILITY") || reason.includes("OBSERVER") || reason.includes("CONTROL")) return "testability";
  if (reason.includes("EXCLUSION")) return "exclusion";
  return "formal-test-point";
}
function semanticRefs(obligation, reason) {
  const refs = makeSet();
  const groups = [
    strings2(obligation.source_claim_ids),
    strings2(obligation.required_oracle_refs),
    strings2(obligation.view_element_refs)
  ];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const values = groups[groupIndex];
    for (let index = 0; index < values.length; index += 1) setAdd(refs, values[index]);
  }
  if (setValuesArray(refs).length === 0) setAdd(refs, String(obligation.obligation_id));
  if (reason.includes("CONFLICT")) setAdd(refs, "unresolved-source-policy");
  return sortArray3(setValuesArray(refs), compareCodePoints9);
}
function bindBlockedRootIdentity(classification, obligations) {
  const obligationById = makeMap(mapArray4(obligations, (item) => [String(item.obligation_id), item]));
  const blocked = mapArray4(records2(classification.blocked), (item) => {
    const obligation = mapGet(obligationById, String(item.obligation_id)) ?? {};
    const signature = {
      missing_type: missingType(String(item.reason)),
      semantic_refs: semanticRefs(obligation, String(item.reason)),
      scope: String(obligation.scope ?? "")
    };
    return { ...item, root_issue_id: stableId("root", signature) };
  });
  return { ...classification, blocked };
}
function blockedDescriptors(classification, obligations) {
  const obligationById = makeMap(mapArray4(obligations, (item) => [String(item.obligation_id), item]));
  return sortArray3(mapArray4(records2(classification.blocked), (item) => {
    const obligation = mapGet(obligationById, String(item.obligation_id)) ?? {};
    const reason = String(item.reason);
    const type = missingType(reason);
    const scope = String(obligation.scope ?? "unknown");
    const technical = reason.includes("UNAVAILABLE") || reason.includes("UNKNOWN") || reason.includes("MISSING_CAPABILITY") || reason.includes("MISSING_OBSERVER") || reason.includes("MISSING_CONTROL");
    return {
      obligation_id: String(item.obligation_id),
      missing_type: type,
      semantic_refs: semanticRefs(obligation, reason),
      scope,
      risk: String(item.risk),
      reason,
      evidence_refs: sortArray3(strings2(item.evidence_refs), compareCodePoints9),
      answerable: !technical,
      question: `Clarification required for ${type} in ${scope}.`
    };
  }), (left, right) => compareCodePoints9(left.obligation_id, right.obligation_id));
}
function buildSourceConflictBridge(classification, obligations, relations, conflicts) {
  const obligationById = makeMap(mapArray4(obligations, (item) => [String(item.obligation_id), item]));
  const allowedConflictIds = makeSet();
  for (let index = 0; index < conflicts.length; index += 1) {
    setAdd(allowedConflictIds, conflictIdentity(conflicts[index]));
  }
  const executable = sliceArray3(records2(classification.grounded), 0);
  appendArray2(executable, records2(classification.conditional));
  const bridge = makeMap();
  const ambiguous = makeSet();
  const selectionCache = makeConflictSelectionCache();
  for (let caseIndex = 0; caseIndex < executable.length; caseIndex += 1) {
    const caseDraft = executable[caseIndex];
    const selection = conflictSelectionForCase(
      caseDraft,
      relations,
      allowedConflictIds,
      selectionCache
    );
    if (selection.count !== 1 || !selection.conflict) continue;
    const conflict = selection.conflict;
    const linkedIds = strings2(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const obligation = mapGet(obligationById, obligationId);
      if (!obligation) continue;
      const signature = {
        missing_type: "source-conflict",
        semantic_refs: semanticRefs(obligation, "UNRESOLVED_CONFLICT"),
        scope: String(obligation.scope ?? "")
      };
      const internalId = stableId("root", signature);
      const existing = mapGet(bridge, internalId);
      if (existing && conflictIdentity(existing.conflict) !== conflictIdentity(conflict)) {
        setAdd(ambiguous, internalId);
        continue;
      }
      if (existing) setAdd(existing.affectedObligationIds, obligationId);
      else mapSet(bridge, internalId, {
        internal_root_issue_id: internalId,
        internal_scope: signature.scope,
        semantic_refs: signature.semantic_refs,
        affectedObligationIds: makeSet([obligationId]),
        conflict: NATIVE_STRUCTURED_CLONE(conflict)
      });
    }
  }
  forEachSet(ambiguous, (internalId) => mapDelete(bridge, internalId));
  forEachMap(bridge, (entry) => {
    entry.affected_obligation_ids = sortArray3(
      setValuesArray(entry.affectedObligationIds),
      compareCodePoints9
    );
    delete entry.affectedObligationIds;
  });
  return bridge;
}
function bridgeMatchesRoot(root, bridgeEntry) {
  if (String(root.root_issue_id) !== bridgeEntry.internal_root_issue_id || root.missing_type !== "source-conflict" || root.scope !== bridgeEntry.internal_scope) return false;
  const signature = {
    missing_type: "source-conflict",
    semantic_refs: bridgeEntry.semantic_refs,
    scope: bridgeEntry.internal_scope
  };
  if (root.root_issue_key !== canonicalStringify(signature) || canonicalStringify(strings2(root.semantic_refs)) !== canonicalStringify(bridgeEntry.semantic_refs) || canonicalStringify(sortArray3(strings2(root.affected_obligation_ids), compareCodePoints9)) !== canonicalStringify(bridgeEntry.affected_obligation_ids)) return false;
  const reasons = makeSet(strings2(root.reasons));
  return setHas(reasons, "UNRESOLVED_CONFLICT");
}
function translateClarificationAppend(clarificationInput2, sourceConflictBridge) {
  const output = NATIVE_STRUCTURED_CLONE(clarificationInput2);
  if (!isRecord4(output.prior_state) || !isRecord4(output.append_batch)) return output;
  const priorById = makeMap(mapArray4(records2(output.prior_state.root_snapshot_ledger), (item) => [
    String(item.root_issue_id),
    item
  ]));
  const internalBySourceRoot = makeMap();
  forEachMap(sourceConflictBridge, (entry, internalId) => {
    const priorRoot = mapGet(priorById, internalId);
    if (!priorRoot || !bridgeMatchesRoot(priorRoot, entry)) return;
    const sourceRootId = String(entry.conflict.root_issue_id ?? "");
    if (sourceRootId.length === 0) return;
    const ids = mapGet(internalBySourceRoot, sourceRootId) ?? makeSet();
    setAdd(ids, internalId);
    mapSet(internalBySourceRoot, sourceRootId, ids);
  });
  function translateRootIds(rootIds) {
    const translated = makeSet();
    let changed = false;
    const submittedRootIds = strings2(rootIds);
    for (let index = 0; index < submittedRootIds.length; index += 1) {
      const rootId = submittedRootIds[index];
      const internal = mapGet(internalBySourceRoot, rootId);
      if (internal) {
        forEachSet(internal, (internalId) => {
          setAdd(translated, internalId);
          if (internalId !== rootId) changed = true;
        });
      } else setAdd(translated, rootId);
    }
    return { ids: sortArray3(setValuesArray(translated), compareCodePoints9), changed };
  }
  const decisions = records2(output.append_batch.decision_records);
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index];
    const externalRootIds = sortArray3(strings2(decision.root_issue_ids), compareCodePoints9);
    const expectedExternalQuestionId = stableId("question", { root_issue_ids: externalRootIds });
    const submittedQuestionId = decision.question_id;
    const translated = translateRootIds(decision.root_issue_ids);
    decision.root_issue_ids = translated.ids;
    if (translated.changed) decision.question_id = submittedQuestionId === expectedExternalQuestionId ? stableId("question", { root_issue_ids: decision.root_issue_ids }) : "";
  }
  const events = records2(output.append_batch.clarification_events);
  for (let index = 0; index < events.length; index += 1) {
    events[index].root_issue_ids = translateRootIds(events[index].root_issue_ids).ids;
  }
  return output;
}
function externalizePendingRoots(pending, conflicts, sourceConflictBridge) {
  void conflicts;
  const grouped = makeMap();
  const pendingRoots = records2(pending);
  for (let pendingIndex = 0; pendingIndex < pendingRoots.length; pendingIndex += 1) {
    const submitted = pendingRoots[pendingIndex];
    const item = NATIVE_STRUCTURED_CLONE(submitted);
    const bridgeEntry = mapGet(sourceConflictBridge, String(item.root_issue_id));
    const conflict = bridgeEntry && bridgeMatchesRoot(item, bridgeEntry) ? bridgeEntry.conflict : null;
    const sourceRootId = conflict && typeof conflict.root_issue_id === "string" ? conflict.root_issue_id : null;
    const externalId = sourceRootId ?? String(item.root_issue_id);
    if (conflict) {
      item.root_issue_id = externalId;
      item.root_issue_key = canonicalStringify({
        missing_type: "source-conflict",
        rule_ids: sortArray3(strings2(conflict.rule_ids), compareCodePoints9),
        scope: String(conflict.scope),
        source_ids: sortArray3(strings2(conflict.source_ids), compareCodePoints9)
      });
      item.scope = String(conflict.scope);
      item.question = `Clarification required for source-conflict in ${item.scope}.`;
    }
    const existing = mapGet(grouped, externalId);
    if (!existing) mapSet(grouped, externalId, item);
    else {
      existing.affected_obligation_ids = unionSortedStrings(
        strings2(existing.affected_obligation_ids),
        strings2(item.affected_obligation_ids)
      );
      existing.reasons = unionSortedStrings(strings2(existing.reasons), strings2(item.reasons));
      existing.evidence_refs = unionSortedStrings(
        strings2(existing.evidence_refs),
        strings2(item.evidence_refs)
      );
      const itemRiskCounts = isRecord4(item.risk_counts) ? item.risk_counts : {};
      const risks = ["critical", "high", "medium", "low"];
      for (let riskIndex = 0; riskIndex < risks.length; riskIndex += 1) {
        const risk = risks[riskIndex];
        existing.risk_counts[risk] = toNumber(existing.risk_counts[risk]) + toNumber(itemRiskCounts[risk]);
      }
    }
  }
  const riskOrder2 = ["critical", "high", "medium", "low"];
  const output = sortArray3(mapValuesArray(grouped), (left, right) => {
    const leftRisk = isRecord4(left.risk_counts) ? left.risk_counts : {};
    const rightRisk = isRecord4(right.risk_counts) ? right.risk_counts : {};
    for (let index = 0; index < riskOrder2.length; index += 1) {
      const risk = riskOrder2[index];
      const difference = toNumber(rightRisk[risk] ?? 0) - toNumber(leftRisk[risk] ?? 0);
      if (difference !== 0) return difference;
    }
    const countDifference = strings2(right.affected_obligation_ids).length - strings2(left.affected_obligation_ids).length;
    return countDifference || compareCodePoints9(String(left.root_issue_id), String(right.root_issue_id));
  });
  const rootIssueIds = sortArray3(
    mapArray4(output, (item) => String(item.root_issue_id)),
    compareCodePoints9
  );
  const batchId = stableId("batch", { root_issue_ids: rootIssueIds });
  for (let index = 0; index < output.length; index += 1) output[index].batch_id = batchId;
  return output;
}
function evidenceLevel(obligation, cases, claimsById, lane, notApplicable) {
  if (lane === "blocked") return "E0";
  if (lane === "conditional") return "E1";
  if (lane === "not_applicable") {
    const claim = mapGet(claimsById, String(notApplicable?.exclusion_claim_id));
    return claim?.level === "E2" ? "E2" : "E3";
  }
  const refs = makeSet();
  const initialRefs = [strings2(obligation.source_claim_ids), strings2(obligation.required_oracle_refs)];
  for (let groupIndex = 0; groupIndex < initialRefs.length; groupIndex += 1) {
    for (let index = 0; index < initialRefs[groupIndex].length; index += 1) {
      setAdd(refs, initialRefs[groupIndex][index]);
    }
  }
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const evidenceRefs = strings2(cases[caseIndex].evidence_refs);
    for (let refIndex = 0; refIndex < evidenceRefs.length; refIndex += 1) {
      setAdd(refs, evidenceRefs[refIndex]);
    }
  }
  const orderedRefs = setValuesArray(refs);
  for (let index = 0; index < orderedRefs.length; index += 1) {
    if (mapGet(claimsById, orderedRefs[index])?.level === "E2") return "E2";
  }
  return "E3";
}
function semanticSnapshot(classification, obligations, claimsById) {
  const disposition = makeMap();
  const groundedCases = records2(classification.grounded);
  for (let caseIndex = 0; caseIndex < groundedCases.length; caseIndex += 1) {
    const item = groundedCases[caseIndex];
    const ids2 = strings2(item.obligation_ids);
    for (let idIndex = 0; idIndex < ids2.length; idIndex += 1) {
      const id = ids2[idIndex];
      const existing = mapGet(disposition, id) ?? { lane: "grounded", reason: null, cases: [] };
      pushArray3(existing.cases, item);
      mapSet(disposition, id, existing);
    }
  }
  const conditionalCases = records2(classification.conditional);
  for (let caseIndex = 0; caseIndex < conditionalCases.length; caseIndex += 1) {
    const item = conditionalCases[caseIndex];
    const ids2 = strings2(item.obligation_ids);
    for (let idIndex = 0; idIndex < ids2.length; idIndex += 1) {
      const id = ids2[idIndex];
      const existing = mapGet(disposition, id) ?? { lane: "conditional", reason: null, cases: [] };
      pushArray3(existing.cases, item);
      mapSet(disposition, id, existing);
    }
  }
  const blockedItems = records2(classification.blocked);
  for (let index = 0; index < blockedItems.length; index += 1) mapSet(
    disposition,
    String(blockedItems[index].obligation_id),
    {
      lane: "blocked",
      reason: String(blockedItems[index].reason),
      cases: []
    }
  );
  const notApplicableItems = records2(classification.not_applicable);
  for (let index = 0; index < notApplicableItems.length; index += 1) mapSet(
    disposition,
    String(notApplicableItems[index].obligation_id),
    {
      lane: "not_applicable",
      reason: null,
      cases: [],
      notApplicable: notApplicableItems[index]
    }
  );
  const points = sortArray3(mapArray4(obligations, (obligation) => {
    const state = mapGet(disposition, String(obligation.obligation_id));
    const lane = state?.lane ?? "blocked";
    return {
      obligation_id: String(obligation.obligation_id),
      evidence_level: evidenceLevel(obligation, state?.cases ?? [], claimsById, lane, state?.notApplicable),
      classification: lane,
      blocked_reason: lane === "blocked" ? state?.reason ?? "FORMAL_DISPOSITION_MISSING" : null
    };
  }), (left, right) => compareCodePoints9(left.obligation_id, right.obligation_id));
  const ids = (lane) => sortArray3(mapArray4(
    filterArray4(points, (item) => item.classification === lane),
    (item) => item.obligation_id
  ), compareCodePoints9);
  const grounded = ids("grounded");
  const conditional = ids("conditional");
  const blocked = ids("blocked");
  const notApplicable = ids("not_applicable");
  const executableCount = grounded.length + conditional.length;
  const riskById = makeMap(mapArray4(obligations, (item) => [String(item.obligation_id), String(item.risk)]));
  const hasHighBlocked = someArray3(blocked, (id) => mapGet(riskById, id) === "critical" || mapGet(riskById, id) === "high");
  const applicableCount = points.length - notApplicable.length;
  const deliveryStatus = applicableCount === 0 ? "no_applicable_formal_test_points" : executableCount === 0 && blocked.length > 0 ? "no_deterministic_cases" : executableCount > 0 && hasHighBlocked ? "critical_gaps" : "executable_subset_ready";
  return {
    formal_test_points: points,
    coverage_denominator: points.length,
    delivery_sections: {
      grounded,
      conditional,
      blocked,
      exploratory: sortArray3(mapArray4(
        records2(classification.exploratory),
        (item) => String(item.exploratory_id)
      ), compareCodePoints9),
      coverage: { formal_denominator: points.length },
      quality: { delivery_status: deliveryStatus }
    }
  };
}
function evaluateRevisionCaptured(submittedInput, options) {
  const intrinsicDiagnostic = intrinsicIntegrityDiagnostic();
  if (intrinsicDiagnostic) return {
    status: "need_revision",
    stage: "schema",
    source_revision: 0,
    diagnostics: [intrinsicDiagnostic]
  };
  const normalized = normalizeInput(submittedInput);
  const capturedOptions = snapshotOwnData(options, "/options");
  appendArray2(normalized.diagnostics, capturedOptions.diagnostics);
  const postSnapshotIntrinsicDiagnostic = intrinsicIntegrityDiagnostic();
  if (postSnapshotIntrinsicDiagnostic) return {
    status: "need_revision",
    stage: "schema",
    source_revision: 0,
    diagnostics: [postSnapshotIntrinsicDiagnostic]
  };
  const trustedOptions = capturedOptions.snapshot;
  const initialRevision = isRecord4(normalized.input) && numberIsSafeInteger(normalized.input.source_revision) ? toNumber(normalized.input.source_revision) : 0;
  let interactionPolicy = "";
  if (!isRecord4(trustedOptions)) pushArray3(normalized.diagnostics, diagnostic11(
    "classification",
    "INTERACTION_POLICY_INVALID",
    "/interaction_policy",
    "pure core options must be a closed own-data record"
  ));
  else {
    requireClosed2(trustedOptions, ["interactionPolicy"], "/options", normalized.diagnostics);
    const submittedPolicy = trustedOptions.interactionPolicy;
    interactionPolicy = typeof submittedPolicy === "string" ? submittedPolicy : "";
    if (!setHas(POLICIES2, interactionPolicy)) pushArray3(normalized.diagnostics, diagnostic11(
      "classification",
      "INTERACTION_POLICY_INVALID",
      "/interaction_policy",
      "pure core accepts only the two frozen internal interaction policies"
    ));
  }
  if (normalized.diagnostics.length > 0 || !normalized.input) return revisionRequired(
    "schema",
    initialRevision,
    normalized.diagnostics
  );
  const input = normalized.input;
  const sourceRevision = (
    /** @type {number} */
    input.source_revision
  );
  try {
    const schemaDiagnostics = validateArtifactSchemas(input);
    if (schemaDiagnostics.length > 0) return revisionRequired("schema", sourceRevision, schemaDiagnostics);
    const sourcePolicy = resolveSourcePolicy(input.source_pack);
    const policyDiagnostics = diagnosticArray(sourcePolicy.diagnostics);
    if (policyDiagnostics.length > 0) return revisionRequired("source_policy", sourceRevision, policyDiagnostics);
    const evidence = validateEvidenceGraph(input.source_pack, input.evidence_claims);
    const evidenceDiagnostics = diagnosticArray(evidence.diagnostics);
    if (evidenceDiagnostics.length > 0) return revisionRequired("evidence_claims", sourceRevision, evidenceDiagnostics);
    const graph = evidenceContext(input, evidence.claimsById, records2(sourcePolicy.conflicts));
    const viewValidation = validateBehaviorViews(graph, input.behavior_views);
    const interactionAudit = auditInteractionMatrix(input.behavior_views);
    const viewDiagnostics = diagnosticArray(viewValidation.diagnostics);
    appendArray2(viewDiagnostics, diagnosticArray(interactionAudit.diagnostics));
    if (viewDiagnostics.length > 0) return revisionRequired("behavior_views", sourceRevision, viewDiagnostics);
    let obligations;
    try {
      obligations = compileObligations(graph, input.behavior_views);
    } catch (error) {
      if (error instanceof ObligationCompilationError) return revisionRequired(
        error.stage,
        sourceRevision,
        diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    let classification = classifyCaseDrafts({
      sourceRevision,
      evidence: {
        claimsById: graph.claimsById,
        factLedger: graph.factLedger,
        conflicts: graph.conflicts
      },
      obligations,
      caseDrafts: input.case_drafts
    });
    if (classification.diagnostics.length > 0) return revisionRequired(
      "classification",
      sourceRevision,
      diagnosticArray(classification.diagnostics)
    );
    const unresolvedSourcePack = (
      /** @type {Record<string, unknown>} */
      NATIVE_STRUCTURED_CLONE(input.source_pack)
    );
    unresolvedSourcePack.decision_records = [];
    const unresolvedPolicy = resolveSourcePolicy(unresolvedSourcePack);
    const potentialConflicts = records2(unresolvedPolicy.conflicts);
    const conflictRelations = prepareConflictRelations(
      graph.claimsById,
      /** @type {Record<string, unknown>} */
      input.source_pack,
      potentialConflicts
    );
    const sourceConflictBridge = buildSourceConflictBridge(
      classification,
      records2(obligations.obligations),
      conflictRelations,
      potentialConflicts
    );
    classification = applyLocalConflictBlocks(
      classification,
      records2(obligations.obligations),
      graph.claimsById,
      /** @type {Record<string, unknown>} */
      input.source_pack,
      graph.conflicts,
      conflictRelations
    );
    if (classification.diagnostics.length > 0) return revisionRequired(
      "classification",
      sourceRevision,
      diagnosticArray(classification.diagnostics)
    );
    const semantics = semanticSnapshot(
      classification,
      records2(obligations.obligations),
      graph.claimsById
    );
    const clarificationInput2 = (
      /** @type {Record<string, unknown>} */
      input.clarification
    );
    const translatedClarification = translateClarificationAppend(
      clarificationInput2,
      sourceConflictBridge
    );
    const clarification = evaluateClarification(
      {
        source_revision: sourceRevision,
        blocked_obligations: blockedDescriptors(classification, records2(obligations.obligations)),
        prior_state: translatedClarification.prior_state,
        append_batch: translatedClarification.append_batch,
        semantic_snapshot: semantics
      },
      /** @type {'pause_for_clarification'|'record_only'} */
      interactionPolicy
    );
    if (clarification.diagnostics.length > 0) return revisionRequired(
      "clarification",
      sourceRevision,
      diagnosticArray(clarification.diagnostics)
    );
    if (clarification.action === "need_user_answers") return {
      status: "need_user_answers",
      source_revision: sourceRevision,
      pending_root_issues: externalizePendingRoots(
        clarification.pending_root_issues,
        graph.conflicts,
        sourceConflictBridge
      ),
      clarification_state: NATIVE_STRUCTURED_CLONE(clarification.state),
      semantic_snapshot: NATIVE_STRUCTURED_CLONE(clarification.semantic_snapshot),
      diagnostics: []
    };
    let bundle;
    try {
      const bundleClassification = bindBlockedRootIdentity(
        classification,
        records2(obligations.obligations)
      );
      bundle = buildBundle({
        schema_version: "1.0.0",
        source_revision: sourceRevision,
        compiler_version: input.compiler_version,
        lineage: input.lineage,
        evidence_claims: input.evidence_claims,
        obligations_artifact: obligations,
        classification: bundleClassification,
        clarification,
        limits: input.limits,
        expert_recall_limits: input.expert_recall_limits
      });
    } catch (error) {
      if (error instanceof BundleReconciliationError) return revisionRequired(
        error.stage,
        sourceRevision,
        diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    let markdown;
    try {
      markdown = renderMarkdown(bundle);
    } catch (error) {
      if (error instanceof BundleRenderError) return revisionRequired(
        error.stage,
        sourceRevision,
        diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    return {
      status: "finished",
      source_revision: sourceRevision,
      bundle,
      bundle_digest: digest(bundle),
      markdown,
      markdown_digest: digest(markdown),
      clarification_state: NATIVE_STRUCTURED_CLONE(clarification.state),
      diagnostics: []
    };
  } catch {
    return revisionRequired("core", sourceRevision, [diagnostic11(
      "classification",
      "CORE_EVALUATION_FAILED",
      "/",
      "complete revision evaluation failed without exposing an internal exception"
    )]);
  }
}
function evaluateRevision(submittedInput, options) {
  try {
    return evaluateRevisionCaptured(submittedInput, options);
  } catch {
    return {
      status: "need_revision",
      stage: "core",
      source_revision: 0,
      diagnostics: [{
        category: "classification",
        code: "CORE_EVALUATION_FAILED",
        path: "/",
        message: "complete revision evaluation failed without exposing an internal exception"
      }]
    };
  }
}

// src/run-store.mjs
import { mkdir, readdir, rm } from "node:fs/promises";
import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Worker } from "node:worker_threads";
var STAGE_FILES = Object.freeze({
  source_pack: "source-pack.json",
  evidence_claims: "evidence-claims.json",
  behavior_views: "behavior-views.json",
  case_drafts: "case-drafts.json"
});
var CONTROLLED_DIRECTORIES = Object.freeze(["accepted", "staging", "derived", "output"]);
var CONTROLLED_FILES = Object.freeze(["checkpoint.json"]);
var REVISION_DIRECTORY = /^r([0-9]+)$/u;
var TEMPORARY_FILE = /^\..+\.tmp-([0-9]+)-[0-9]+$/u;
var RUN_LOCK_RESIDUE_DIRECTORY = /^\.compiler-advance\.lock\.(?:release|stale)-[0-9]+-[0-9]+(?:\.cleanup-[0-9]+-[0-9]+)*$/u;
var RUN_LOCK_HEARTBEAT_MARKER = /^\.heartbeat-(?:worker-1|worker-2|guardian)$/u;
var temporarySequence = 0;
var lockSequence = 0;
var RUN_LOCK_DIRECTORY = ".compiler-advance.lock";
var RUN_LOCK_OWNER_FILE = "owner.json";
var RUN_LOCK_TRANSACTION_DIRECTORY = ".compiler-advance.transaction";
var RUN_LOCK_LEASE_MS = 2e3;
var RUN_LOCK_HEARTBEAT_MS = 250;
var RUN_LOCK_HEARTBEAT_PROOF_MS = RUN_LOCK_HEARTBEAT_MS * 2;
var RUN_LOCK_INCOMPLETE_GRACE_MS = 2e3;
var RUN_LOCK_POLL_MS = 25;
var RUN_LOCK_WAIT_MS = 3e4;
var NATIVE_ARRAY2 = Array;
var NATIVE_ARRAY_PROTOTYPE2 = Array.prototype;
var NATIVE_ARRAY_SORT6 = Array.prototype.sort;
var NATIVE_ARRAY_STATIC_INTRINSICS = Object.freeze([
  ["isArray", Array.isArray],
  ["from", Array.from]
]);
var NATIVE_MAP2 = Map;
var NATIVE_MAP_PROTOTYPE2 = Map.prototype;
var NATIVE_SET2 = Set;
var NATIVE_SET_PROTOTYPE2 = Set.prototype;
var NATIVE_OBJECT2 = Object;
var NATIVE_DEFINE_PROPERTY7 = Object.defineProperty;
var NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
var NATIVE_OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
var NATIVE_OBJECT_INTRINSICS = Object.freeze([
  ["defineProperty", Object.defineProperty],
  ["fromEntries", Object.fromEntries],
  ["getOwnPropertyDescriptor", Object.getOwnPropertyDescriptor],
  ["getOwnPropertyDescriptors", Object.getOwnPropertyDescriptors],
  ["getPrototypeOf", Object.getPrototypeOf],
  ["hasOwn", Object.hasOwn],
  ["keys", Object.keys],
  ["entries", Object.entries]
]);
var NATIVE_SYMBOL2 = Symbol;
var NATIVE_SYMBOL_ITERATOR2 = Symbol.iterator;
var NATIVE_GLOBAL_THIS2 = globalThis;
var NATIVE_REGEXP_EXEC2 = RegExp.prototype.exec;
var NATIVE_REFLECT_APPLY3 = Reflect.apply;
var NATIVE_REFLECT = Reflect;
var NATIVE_NUMBER2 = Number;
var NATIVE_NUMBER_INTRINSICS = Object.freeze([
  ["isFinite", Number.isFinite],
  ["isSafeInteger", Number.isSafeInteger]
]);
var NATIVE_STRING2 = String;
var NATIVE_STRING_PROTOTYPE2 = String.prototype;
var NATIVE_STRING_PAD_START = String.prototype.padStart;
var NATIVE_STRING_SPLIT2 = String.prototype.split;
var NATIVE_STRING_STARTS_WITH = String.prototype.startsWith;
var NATIVE_STRING_INTRINSICS = Object.freeze([
  ["codePointAt", String.prototype.codePointAt],
  ["split", String.prototype.split],
  ["includes", String.prototype.includes],
  ["startsWith", String.prototype.startsWith],
  ["padStart", String.prototype.padStart],
  ["trim", String.prototype.trim],
  [
    NATIVE_SYMBOL_ITERATOR2,
    /** @type {any} */
    String.prototype[NATIVE_SYMBOL_ITERATOR2]
  ]
]);
var NATIVE_REGEXP = RegExp;
var NATIVE_REGEXP_PROTOTYPE2 = RegExp.prototype;
var NATIVE_REGEXP_INTRINSICS = Object.freeze([
  ["exec", RegExp.prototype.exec],
  ["test", RegExp.prototype.test]
]);
var NATIVE_JSON = JSON;
var NATIVE_JSON_PARSE = JSON.parse;
var NATIVE_JSON_STRINGIFY = JSON.stringify;
var NATIVE_JSON_INTRINSICS = Object.freeze([
  ["parse", JSON.parse],
  ["stringify", JSON.stringify]
]);
var NATIVE_STRUCTURED_CLONE2 = structuredClone;
var NATIVE_PROMISE = Promise;
var NATIVE_SET_TIMEOUT = setTimeout;
var NATIVE_CLEAR_TIMEOUT = clearTimeout;
var NATIVE_DATE = Date;
var NATIVE_DATE_NOW = Date.now;
var NATIVE_MATH = Math;
var NATIVE_PROCESS = process;
var NATIVE_PROCESS_KILL = process.kill;
var NATIVE_PROCESS_PID = process.pid;
var NATIVE_PROCESS_EXEC_PATH = process.execPath;
var NATIVE_PROCESS_START_IDENTITY = `${process.pid}:${Date.now() - process.uptime() * 1e3}`;
var NATIVE_CHILD_PROCESS_PROTOTYPE = ChildProcess.prototype;
var NATIVE_CHILD_PROCESS_KILL = ChildProcess.prototype.kill;
var NATIVE_SPAWN = spawn;
var NATIVE_CHILD_PROCESS_INTRINSICS = Object.freeze([
  ["kill", NATIVE_CHILD_PROCESS_KILL]
]);
var NATIVE_WORKER = Worker;
var NATIVE_WORKER_PROTOTYPE = Worker.prototype;
var NATIVE_WORKER_ON = EventEmitter.prototype.on;
var NATIVE_WORKER_POST_MESSAGE = Worker.prototype.postMessage;
var NATIVE_WORKER_TERMINATE = Worker.prototype.terminate;
var NATIVE_WORKER_INTRINSICS = Object.freeze([
  ["on", NATIVE_WORKER_ON],
  ["postMessage", NATIVE_WORKER_POST_MESSAGE],
  ["terminate", NATIVE_WORKER_TERMINATE]
]);
var NATIVE_PATH = path;
var NATIVE_PATH_BASENAME = path.basename;
var NATIVE_PATH_DIRNAME = path.dirname;
var NATIVE_PATH_IS_ABSOLUTE = path.isAbsolute;
var NATIVE_PATH_JOIN = path.join;
var NATIVE_PATH_RELATIVE = path.relative;
var NATIVE_PATH_RESOLVE = path.resolve;
var NATIVE_PATH_SEPARATOR = path.sep;
var NATIVE_PATH_INTRINSICS = Object.freeze([
  ["basename", path.basename],
  ["dirname", path.dirname],
  ["isAbsolute", path.isAbsolute],
  ["join", path.join],
  ["relative", path.relative],
  ["resolve", path.resolve],
  ["sep", path.sep]
]);
var NATIVE_REFLECT_INTRINSICS = Object.freeze([["apply", Reflect.apply]]);
var NATIVE_DATE_INTRINSICS = Object.freeze([["now", Date.now]]);
var NATIVE_MATH_INTRINSICS = Object.freeze([["min", Math.min]]);
var NATIVE_PROCESS_INTRINSICS = Object.freeze([
  ["execPath", process.execPath],
  ["kill", process.kill],
  ["pid", process.pid]
]);
var fsPromises = (
  /** @type {any} */
  await import("node:fs/promises")
);
var fsConstants = fsPromises.constants;
var lstat = fsPromises.lstat;
var open = fsPromises.open;
var realpath = fsPromises.realpath;
var rename = fsPromises.rename;
var statsProbe = await lstat(new URL(import.meta.url));
var NATIVE_STATS_PROTOTYPE = NATIVE_REFLECT_APPLY3(
  NATIVE_OBJECT_GET_PROTOTYPE_OF,
  NATIVE_OBJECT2,
  [statsProbe]
);
var NATIVE_STATS_IS_DIRECTORY = NATIVE_STATS_PROTOTYPE.isDirectory;
var NATIVE_STATS_IS_FILE = NATIVE_STATS_PROTOTYPE.isFile;
var NATIVE_STATS_IS_SYMBOLIC_LINK = NATIVE_STATS_PROTOTYPE.isSymbolicLink;
var direntProbe = (await readdir(new URL(".", import.meta.url), { withFileTypes: true }))[0];
var NATIVE_DIRENT_PROTOTYPE = NATIVE_REFLECT_APPLY3(
  NATIVE_OBJECT_GET_PROTOTYPE_OF,
  NATIVE_OBJECT2,
  [direntProbe]
);
var NATIVE_DIRENT_IS_DIRECTORY = NATIVE_DIRENT_PROTOTYPE.isDirectory;
var NATIVE_DIRENT_IS_FILE = NATIVE_DIRENT_PROTOTYPE.isFile;
var NATIVE_DIRENT_IS_SYMBOLIC_LINK = NATIVE_DIRENT_PROTOTYPE.isSymbolicLink;
var fileHandleProbe = await open(new URL(import.meta.url));
var NATIVE_FILE_HANDLE_PROTOTYPE = NATIVE_REFLECT_APPLY3(
  NATIVE_OBJECT_GET_PROTOTYPE_OF,
  NATIVE_OBJECT2,
  [fileHandleProbe]
);
var NATIVE_FILE_HANDLE_READ_FILE = NATIVE_FILE_HANDLE_PROTOTYPE.readFile;
var NATIVE_FILE_HANDLE_STAT = NATIVE_FILE_HANDLE_PROTOTYPE.stat;
var NATIVE_FILE_HANDLE_SYNC = NATIVE_FILE_HANDLE_PROTOTYPE.sync;
var NATIVE_FILE_HANDLE_UTIMES = NATIVE_FILE_HANDLE_PROTOTYPE.utimes;
var NATIVE_FILE_HANDLE_WRITE_FILE = NATIVE_FILE_HANDLE_PROTOTYPE.writeFile;
var fileHandleProbeClose = NATIVE_REFLECT_APPLY3(
  NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
  NATIVE_OBJECT2,
  [fileHandleProbe, "close"]
)?.value;
await NATIVE_REFLECT_APPLY3(fileHandleProbeClose, fileHandleProbe, []);
var NATIVE_STATS_INTRINSICS = Object.freeze([
  ["isDirectory", NATIVE_STATS_IS_DIRECTORY],
  ["isFile", NATIVE_STATS_IS_FILE],
  ["isSymbolicLink", NATIVE_STATS_IS_SYMBOLIC_LINK]
]);
var NATIVE_DIRENT_INTRINSICS = Object.freeze([
  ["isDirectory", NATIVE_DIRENT_IS_DIRECTORY],
  ["isFile", NATIVE_DIRENT_IS_FILE],
  ["isSymbolicLink", NATIVE_DIRENT_IS_SYMBOLIC_LINK]
]);
var NATIVE_FILE_HANDLE_INTRINSICS = Object.freeze([
  ["readFile", NATIVE_FILE_HANDLE_READ_FILE],
  ["stat", NATIVE_FILE_HANDLE_STAT],
  ["sync", NATIVE_FILE_HANDLE_SYNC],
  ["utimes", NATIVE_FILE_HANDLE_UTIMES],
  ["writeFile", NATIVE_FILE_HANDLE_WRITE_FILE]
]);
var NATIVE_ARRAY_INTRINSICS = Object.freeze([
  ["sort", Array.prototype.sort],
  ["map", Array.prototype.map],
  ["some", Array.prototype.some],
  ["filter", Array.prototype.filter],
  ["slice", Array.prototype.slice],
  ["includes", Array.prototype.includes],
  ["reverse", Array.prototype.reverse],
  ["push", Array.prototype.push],
  ["entries", Array.prototype.entries],
  [
    NATIVE_SYMBOL_ITERATOR2,
    /** @type {any} */
    Array.prototype[NATIVE_SYMBOL_ITERATOR2]
  ]
]);
var NATIVE_MAP_INTRINSICS = Object.freeze([
  ["get", Map.prototype.get],
  ["set", Map.prototype.set],
  ["has", Map.prototype.has],
  ["forEach", Map.prototype.forEach],
  [
    NATIVE_SYMBOL_ITERATOR2,
    /** @type {any} */
    Map.prototype[NATIVE_SYMBOL_ITERATOR2]
  ]
]);
var NATIVE_SET_INTRINSICS = Object.freeze([
  ["add", Set.prototype.add],
  ["has", Set.prototype.has],
  ["forEach", Set.prototype.forEach],
  [
    NATIVE_SYMBOL_ITERATOR2,
    /** @type {any} */
    Set.prototype[NATIVE_SYMBOL_ITERATOR2]
  ]
]);
var NATIVE_MAP_SIZE_GET2 = NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  NATIVE_MAP_PROTOTYPE2,
  "size"
)?.get;
var NATIVE_SET_SIZE_GET = NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  NATIVE_SET_PROTOTYPE2,
  "size"
)?.get;
var NATIVE_NUMBER_IS_SAFE_INTEGER2 = Number.isSafeInteger;
var NATIVE_NUMBER_IS_FINITE2 = Number.isFinite;
var RunStoreIntegrityError = class extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "RunStoreIntegrityError";
  }
};
function regexpTest2(expression, value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_REGEXP_EXEC2, expression, [value]) !== null;
}
function pathBasename(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_BASENAME, NATIVE_PATH, [value]);
}
function pathDirname(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_DIRNAME, NATIVE_PATH, [value]);
}
function pathIsAbsolute(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_IS_ABSOLUTE, NATIVE_PATH, [value]);
}
function pathJoin(...parts) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_JOIN, NATIVE_PATH, parts);
}
function pathRelative(from, to) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_RELATIVE, NATIVE_PATH, [from, to]);
}
function pathResolve(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_PATH_RESOLVE, NATIVE_PATH, [value]);
}
function currentTimeMilliseconds() {
  return NATIVE_REFLECT_APPLY3(NATIVE_DATE_NOW, NATIVE_DATE, []);
}
function nativeString(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STRING2, void 0, [value]);
}
function nativeJsonStringify(value) {
  return NATIVE_REFLECT_APPLY3(NATIVE_JSON_STRINGIFY, NATIVE_JSON, [value]);
}
function stringPadStart(value, length, fill) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STRING_PAD_START, value, [length, fill]);
}
function stringSplit(value, separator) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STRING_SPLIT2, value, [separator]);
}
function stringStartsWith(value, prefix) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STRING_STARTS_WITH, value, [prefix]);
}
function statsIsDirectory(status) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STATS_IS_DIRECTORY, status, []);
}
function statsIsFile(status) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STATS_IS_FILE, status, []);
}
function statsIsSymbolicLink(status) {
  return NATIVE_REFLECT_APPLY3(NATIVE_STATS_IS_SYMBOLIC_LINK, status, []);
}
function direntIsDirectory(entry) {
  return NATIVE_REFLECT_APPLY3(NATIVE_DIRENT_IS_DIRECTORY, entry, []);
}
function direntIsFile(entry) {
  return NATIVE_REFLECT_APPLY3(NATIVE_DIRENT_IS_FILE, entry, []);
}
function direntIsSymbolicLink(entry) {
  return NATIVE_REFLECT_APPLY3(NATIVE_DIRENT_IS_SYMBOLIC_LINK, entry, []);
}
async function closeFileHandle(handle) {
  const closeMethod = NATIVE_REFLECT_APPLY3(
    NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
    NATIVE_OBJECT2,
    [handle, "close"]
  )?.value;
  if (typeof closeMethod !== "function") throw new RunStoreIntegrityError(
    "Filesystem handle does not expose a trusted own close operation."
  );
  await NATIVE_REFLECT_APPLY3(closeMethod, handle, []);
}
function temporaryOwnerIsAlive(fileName) {
  const match = NATIVE_REFLECT_APPLY3(NATIVE_REGEXP_EXEC2, TEMPORARY_FILE, [fileName]);
  if (!match) return false;
  const ownerPid = NATIVE_REFLECT_APPLY3(NATIVE_NUMBER2, void 0, [match[1]]);
  if (ownerPid === NATIVE_PROCESS_PID) return true;
  try {
    NATIVE_REFLECT_APPLY3(NATIVE_PROCESS_KILL, NATIVE_PROCESS, [ownerPid, 0]);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}
function processOwnerIsAlive(ownerPid) {
  if (typeof ownerPid !== "number" || !NATIVE_REFLECT_APPLY3(NATIVE_NUMBER_IS_SAFE_INTEGER2, NATIVE_NUMBER2, [ownerPid]) || ownerPid <= 0) return false;
  if (ownerPid === NATIVE_PROCESS_PID) return true;
  try {
    NATIVE_REFLECT_APPLY3(NATIVE_PROCESS_KILL, NATIVE_PROCESS, [ownerPid, 0]);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}
function compilerProcessIdentityHasCanonicalShape(ownerPid, identity) {
  if (typeof ownerPid !== "number" || typeof identity !== "string") return false;
  const parts = stringSplit(identity, ":");
  if (parts.length !== 2 || parts[0] !== nativeString(ownerPid) || parts[1].length === 0) {
    return false;
  }
  const startedAt = NATIVE_REFLECT_APPLY3(NATIVE_NUMBER2, void 0, [parts[1]]);
  return NATIVE_REFLECT_APPLY3(NATIVE_NUMBER_IS_FINITE2, NATIVE_NUMBER2, [startedAt]) && startedAt > 0;
}
function append2(values, value) {
  NATIVE_REFLECT_APPLY3(NATIVE_DEFINE_PROPERTY7, NATIVE_OBJECT2, [values, nativeString(values.length), {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  }]);
}
function descriptorsMatch(owner, expected) {
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = NATIVE_REFLECT_APPLY3(
      NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_OBJECT2,
      [owner, expected[index][0]]
    );
    if (!descriptor || descriptor.get || descriptor.set || descriptor.value !== expected[index][1]) {
      return false;
    }
  }
  return true;
}
function resolvedDataMethodsMatch(owner, expected) {
  for (let index = 0; index < expected.length; index += 1) {
    let current = owner;
    let matched = false;
    while (current) {
      const descriptor = NATIVE_REFLECT_APPLY3(
        NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
        NATIVE_OBJECT2,
        [current, expected[index][0]]
      );
      if (descriptor) {
        matched = !descriptor.get && !descriptor.set && descriptor.value === expected[index][1];
        break;
      }
      current = NATIVE_REFLECT_APPLY3(
        NATIVE_OBJECT_GET_PROTOTYPE_OF,
        NATIVE_OBJECT2,
        [current]
      );
    }
    if (!matched) return false;
  }
  return true;
}
function getterMatches(owner, key, getter) {
  const descriptor = NATIVE_REFLECT_APPLY3(
    NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
    NATIVE_OBJECT2,
    [owner, key]
  );
  return Boolean(descriptor && descriptor.get === getter && !descriptor.set);
}
function runStoreIntrinsicsIntact() {
  const globals = [
    ["Array", NATIVE_ARRAY2],
    ["Map", NATIVE_MAP2],
    ["Set", NATIVE_SET2],
    ["Object", NATIVE_OBJECT2],
    ["Symbol", NATIVE_SYMBOL2],
    ["Number", NATIVE_NUMBER2],
    ["String", NATIVE_STRING2],
    ["RegExp", NATIVE_REGEXP],
    ["Reflect", NATIVE_REFLECT],
    ["Date", NATIVE_DATE],
    ["Math", NATIVE_MATH],
    ["JSON", NATIVE_JSON],
    ["structuredClone", NATIVE_STRUCTURED_CLONE2]
  ];
  for (let index = 0; index < globals.length; index += 1) {
    const descriptor = NATIVE_REFLECT_APPLY3(
      NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
      NATIVE_OBJECT2,
      [NATIVE_GLOBAL_THIS2, globals[index][0]]
    );
    if (!descriptor || descriptor.get || descriptor.set || descriptor.value !== globals[index][1]) {
      return false;
    }
  }
  return descriptorsMatch(NATIVE_ARRAY_PROTOTYPE2, NATIVE_ARRAY_INTRINSICS) && descriptorsMatch(NATIVE_ARRAY2, NATIVE_ARRAY_STATIC_INTRINSICS) && descriptorsMatch(NATIVE_MAP_PROTOTYPE2, NATIVE_MAP_INTRINSICS) && descriptorsMatch(NATIVE_SET_PROTOTYPE2, NATIVE_SET_INTRINSICS) && descriptorsMatch(NATIVE_STRING_PROTOTYPE2, NATIVE_STRING_INTRINSICS) && descriptorsMatch(NATIVE_REGEXP_PROTOTYPE2, NATIVE_REGEXP_INTRINSICS) && descriptorsMatch(NATIVE_OBJECT2, NATIVE_OBJECT_INTRINSICS) && descriptorsMatch(NATIVE_NUMBER2, NATIVE_NUMBER_INTRINSICS) && descriptorsMatch(NATIVE_JSON, NATIVE_JSON_INTRINSICS) && descriptorsMatch(NATIVE_PATH, NATIVE_PATH_INTRINSICS) && descriptorsMatch(NATIVE_REFLECT, NATIVE_REFLECT_INTRINSICS) && descriptorsMatch(NATIVE_DATE, NATIVE_DATE_INTRINSICS) && descriptorsMatch(NATIVE_MATH, NATIVE_MATH_INTRINSICS) && descriptorsMatch(NATIVE_PROCESS, NATIVE_PROCESS_INTRINSICS) && resolvedDataMethodsMatch(
    NATIVE_CHILD_PROCESS_PROTOTYPE,
    NATIVE_CHILD_PROCESS_INTRINSICS
  ) && resolvedDataMethodsMatch(NATIVE_WORKER_PROTOTYPE, NATIVE_WORKER_INTRINSICS) && resolvedDataMethodsMatch(NATIVE_STATS_PROTOTYPE, NATIVE_STATS_INTRINSICS) && descriptorsMatch(NATIVE_DIRENT_PROTOTYPE, NATIVE_DIRENT_INTRINSICS) && descriptorsMatch(NATIVE_FILE_HANDLE_PROTOTYPE, NATIVE_FILE_HANDLE_INTRINSICS) && getterMatches(NATIVE_MAP_PROTOTYPE2, "size", NATIVE_MAP_SIZE_GET2) && getterMatches(NATIVE_SET_PROTOTYPE2, "size", NATIVE_SET_SIZE_GET);
}
function requireRunStoreIntrinsics() {
  if (!runStoreIntrinsicsIntact()) throw new RunStoreIntegrityError(
    "Run-store traversal intrinsics changed during an atomic operation."
  );
}
function revisionName(sourceRevision) {
  return `r${stringPadStart(nativeString(sourceRevision), 3, "0")}`;
}
function isMissing(error) {
  return Boolean(error && typeof error === "object" && "code" in error && /** @type {{code?:unknown}} */
  error.code === "ENOENT");
}
function relativeControlledPath(runDirectory, targetPath) {
  const relative = pathRelative(runDirectory, targetPath);
  if (relative === "" || relative === ".." || stringStartsWith(relative, `..${NATIVE_PATH_SEPARATOR}`) || pathIsAbsolute(relative)) {
    throw new RunStoreIntegrityError("Controlled run path escaped the canonical run root.");
  }
  return relative;
}
async function assertNoSymlinkPath(runDirectory, targetPath) {
  const relative = relativeControlledPath(runDirectory, targetPath);
  const parts = stringSplit(relative, NATIVE_PATH_SEPARATOR);
  let current = runDirectory;
  let lastExisting = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = pathJoin(current, parts[index]);
    let status;
    try {
      status = await lstat(current);
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
    if (statsIsSymbolicLink(status)) throw new RunStoreIntegrityError(
      `Controlled run path contains a symbolic link: ${relative}`
    );
    if (index < parts.length - 1 && !statsIsDirectory(status)) throw new RunStoreIntegrityError(
      `Controlled run path contains a non-directory ancestor: ${relative}`
    );
    lastExisting = current;
  }
  const realRoot = await realpath(runDirectory);
  const realExisting = await realpath(lastExisting);
  const realRelative = pathRelative(realRoot, realExisting);
  if (realRelative === ".." || stringStartsWith(realRelative, `..${NATIVE_PATH_SEPARATOR}`) || pathIsAbsolute(realRelative)) {
    throw new RunStoreIntegrityError("Controlled run path resolved outside the real run root.");
  }
}
async function ensureDirectory(runDirectory, directory) {
  if (pathResolve(directory) === pathResolve(runDirectory)) {
    const status = await lstat(runDirectory);
    if (statsIsSymbolicLink(status) || !statsIsDirectory(status)) throw new RunStoreIntegrityError(
      "Run root is not a real directory."
    );
    return;
  }
  const relative = relativeControlledPath(runDirectory, directory);
  const parts = stringSplit(relative, NATIVE_PATH_SEPARATOR);
  let current = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = pathJoin(current, parts[index]);
    try {
      await mkdir(current);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
    const status = await lstat(current);
    if (statsIsSymbolicLink(status) || !statsIsDirectory(status)) throw new RunStoreIntegrityError(
      `Controlled directory is not a real directory: ${relative}`
    );
  }
}
async function syncDirectory(directory) {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_SYNC, handle, []);
  } finally {
    await closeFileHandle(handle);
  }
}
function hasErrorCode(error, code2) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code2);
}
function delay(milliseconds) {
  return new NATIVE_PROMISE((resolve) => {
    NATIVE_SET_TIMEOUT(resolve, milliseconds);
  });
}
async function readRunLockOwner(runDirectory, ownerPath) {
  const text = await readTextIfPresent(runDirectory, ownerPath);
  if (text === null) return null;
  try {
    const value = NATIVE_REFLECT_APPLY3(NATIVE_JSON_PARSE, NATIVE_JSON, [text]);
    return value && typeof value === "object" ? (
      /** @type {Record<string,unknown>} */
      value
    ) : null;
  } catch {
    throw new RunStoreIntegrityError("Run coordination owner metadata is not valid JSON.");
  }
}
async function writeRunLockOwner(runDirectory, ownerPath, owner) {
  await atomicWriteText(runDirectory, ownerPath, `${nativeJsonStringify(owner)}
`);
}
function sameFileGeneration(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}
async function readRunLockHeartbeatProof(runDirectory, directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return "";
    throw error;
  }
  const proof = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!regexpTest2(RUN_LOCK_HEARTBEAT_MARKER, entry.name)) continue;
    if (direntIsSymbolicLink(entry) || !direntIsFile(entry)) throw new RunStoreIntegrityError(
      "Run coordination heartbeat proof is not a real file."
    );
    const text = await readTextIfPresent(runDirectory, pathJoin(directory, entry.name));
    if (text !== null) append2(proof, `${entry.name}:${text}`);
  }
  NATIVE_REFLECT_APPLY3(NATIVE_ARRAY_SORT6, proof, []);
  return nativeJsonStringify(proof);
}
async function observeRunLock(runDirectory, directory, ownerPath) {
  const status = await lstat(directory);
  if (statsIsSymbolicLink(status) || !statsIsDirectory(status)) throw new RunStoreIntegrityError(
    "Run coordination claim is not a real directory."
  );
  return {
    status,
    record: await readRunLockOwner(runDirectory, ownerPath),
    heartbeatProof: await readRunLockHeartbeatProof(runDirectory, directory)
  };
}
async function removeOwnedLockGeneration(runDirectory, lockDirectory, expectedStatus, label) {
  let current;
  try {
    current = await lstat(lockDirectory);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (!sameFileGeneration(expectedStatus, current)) return;
  const residue = `${lockDirectory}.${label}-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
  try {
    await rename(lockDirectory, residue);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  await syncDirectory(runDirectory);
  const moved = await lstat(residue);
  if (!sameFileGeneration(expectedStatus, moved)) {
    try {
      await lstat(lockDirectory);
    } catch (error) {
      if (isMissing(error)) {
        await rename(residue, lockDirectory);
        await syncDirectory(runDirectory);
        return;
      }
      throw error;
    }
    return;
  }
  await rm(residue, { recursive: true, force: true });
  await syncDirectory(runDirectory);
}
async function waitForReleaseTransaction(runDirectory) {
  const transactionDirectory = pathJoin(runDirectory, RUN_LOCK_TRANSACTION_DIRECTORY);
  const ownerPath = pathJoin(transactionDirectory, RUN_LOCK_OWNER_FILE);
  let observedToken = "";
  let observedPid = -1;
  let observedIdentity = "";
  let observedStatus = null;
  let observedMtime = -1;
  let observedProof = "";
  let firstObservedAt = 0;
  let heartbeatObservedAt = 0;
  let heartbeatAuthenticated = false;
  while (true) {
    let observed;
    try {
      observed = await observeRunLock(runDirectory, transactionDirectory, ownerPath);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    const now = currentTimeMilliseconds();
    const ownerPid = observed.record?.pid;
    const ownerToken = observed.record?.token;
    const ownerIdentity = observed.record?.process_start_identity;
    const ownerValid = typeof observed.record?.token === "string" && observed.record.token.length > 0 && typeof observed.record?.heartbeat_seq === "number" && NATIVE_REFLECT_APPLY3(
      NATIVE_NUMBER_IS_SAFE_INTEGER2,
      NATIVE_NUMBER2,
      [observed.record.heartbeat_seq]
    ) && compilerProcessIdentityHasCanonicalShape(
      ownerPid,
      ownerIdentity
    );
    const incompleteIsYoung = observed.record === null && now - observed.status.mtimeMs < RUN_LOCK_INCOMPLETE_GRACE_MS;
    if (ownerValid) {
      const sameOwner = ownerToken === observedToken && ownerPid === observedPid && ownerIdentity === observedIdentity && sameFileGeneration(observed.status, observedStatus);
      if (!sameOwner) {
        observedToken = /** @type {string} */
        ownerToken;
        observedPid = /** @type {number} */
        ownerPid;
        observedIdentity = /** @type {string} */
        ownerIdentity;
        observedStatus = observed.status;
        observedMtime = observed.status.mtimeMs;
        observedProof = observed.heartbeatProof;
        firstObservedAt = now;
        heartbeatObservedAt = 0;
        heartbeatAuthenticated = false;
      } else if (observed.status.mtimeMs > observedMtime || observed.heartbeatProof !== observedProof && observed.heartbeatProof.length > 0) {
        observedMtime = observed.status.mtimeMs;
        observedProof = observed.heartbeatProof;
        heartbeatObservedAt = now;
        heartbeatAuthenticated = true;
      } else if (observed.status.mtimeMs < observedMtime) {
        observedMtime = observed.status.mtimeMs;
        observedProof = observed.heartbeatProof;
        firstObservedAt = now;
        heartbeatObservedAt = 0;
        heartbeatAuthenticated = false;
      }
    } else {
      observedToken = "";
      observedPid = -1;
      observedIdentity = "";
      observedStatus = null;
      observedMtime = -1;
      observedProof = "";
      firstObservedAt = 0;
      heartbeatObservedAt = 0;
      heartbeatAuthenticated = false;
    }
    const heartbeatProofPending = ownerValid && !heartbeatAuthenticated && now - firstObservedAt < RUN_LOCK_HEARTBEAT_PROOF_MS;
    const movingOwnerIsFresh = ownerValid && heartbeatAuthenticated && heartbeatObservedAt + RUN_LOCK_LEASE_MS > now && processOwnerIsAlive(ownerPid);
    if (incompleteIsYoung || heartbeatProofPending || movingOwnerIsFresh) {
      await delay(RUN_LOCK_POLL_MS);
      continue;
    }
    await removeOwnedLockGeneration(
      runDirectory,
      transactionDirectory,
      observed.status,
      "stale"
    );
  }
}
async function releaseTransactionExists(runDirectory) {
  try {
    const status = await lstat(pathJoin(runDirectory, RUN_LOCK_TRANSACTION_DIRECTORY));
    if (statsIsSymbolicLink(status) || !statsIsDirectory(status)) throw new RunStoreIntegrityError(
      "Run coordination transaction is not a real directory."
    );
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}
async function acquireReleaseTransaction(runDirectory, token) {
  const transactionDirectory = pathJoin(runDirectory, RUN_LOCK_TRANSACTION_DIRECTORY);
  const ownerPath = pathJoin(transactionDirectory, RUN_LOCK_OWNER_FILE);
  while (true) {
    await waitForReleaseTransaction(runDirectory);
    try {
      await mkdir(transactionDirectory);
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) continue;
      throw error;
    }
    const acquiredStatus = await lstat(transactionDirectory);
    let heartbeatWorkers = null;
    try {
      await syncDirectory(runDirectory);
      const owner = {
        pid: NATIVE_PROCESS_PID,
        token,
        lease_expires_at_ms: currentTimeMilliseconds() + RUN_LOCK_LEASE_MS,
        process_start_identity: NATIVE_PROCESS_START_IDENTITY,
        heartbeat_seq: 0,
        heartbeat_ready: false
      };
      await writeRunLockOwner(runDirectory, ownerPath, owner);
      await syncDirectory(runDirectory);
      heartbeatWorkers = await startRunLockHeartbeat(transactionDirectory, acquiredStatus);
      owner.heartbeat_ready = true;
      await writeRunLockOwner(runDirectory, ownerPath, owner);
      await syncDirectory(runDirectory);
      const observed = await observeRunLock(runDirectory, transactionDirectory, ownerPath);
      if (!sameFileGeneration(acquiredStatus, observed.status) || observed.record?.token !== token || observed.record?.heartbeat_ready !== true) {
        throw new RunStoreIntegrityError(
          "Run coordination transaction changed during acquisition."
        );
      }
    } catch (error) {
      if (heartbeatWorkers) await heartbeatWorkers.stopAll().catch(() => {
      });
      await removeOwnedLockGeneration(
        runDirectory,
        transactionDirectory,
        acquiredStatus,
        "stale"
      ).catch(() => {
      });
      throw error;
    }
    return async () => {
      if (heartbeatWorkers) await heartbeatWorkers.stopAll();
      const observed = await observeRunLock(runDirectory, transactionDirectory, ownerPath);
      if (!sameFileGeneration(acquiredStatus, observed.status) || observed.record?.token !== token) throw new RunStoreIntegrityError(
        "Run coordination transaction changed before release."
      );
      await removeOwnedLockGeneration(
        runDirectory,
        transactionDirectory,
        acquiredStatus,
        "release"
      );
    };
  }
}
async function restoreForeignLockGeneration(runDirectory, lockDirectory, movedDirectory, movedStatus) {
  const deadline = currentTimeMilliseconds() + RUN_LOCK_HEARTBEAT_PROOF_MS;
  while (true) {
    try {
      await lstat(lockDirectory);
      if (currentTimeMilliseconds() >= deadline) throw new RunStoreIntegrityError(
        "Run coordination foreign generation restoration is blocked by another claim."
      );
      await delay(RUN_LOCK_POLL_MS);
      continue;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(movedDirectory, lockDirectory);
    await syncDirectory(runDirectory);
    const restoredStatus = await lstat(lockDirectory);
    if (!sameFileGeneration(movedStatus, restoredStatus)) throw new RunStoreIntegrityError(
      "Run coordination foreign generation could not be restored safely."
    );
    return;
  }
}
async function startSingleRunLockHeartbeat(lockDirectory, expectedStatus, markerPath, expectedMarkerStatus, onFailure) {
  const workerSource = `
    (async () => {
      const { parentPort, workerData } = await import('node:worker_threads');
      const fs = await import('node:fs/promises');
      const { constants } = await import('node:fs');
      let handle;
      let markerHandle;
      let stopped = false;
      let failureSent = false;
      let timer;
      let pulse = Promise.resolve();
      let sequence = 0;
      async function renew() {
        const seconds = Date.now() / 1000;
        await handle.utimes(seconds, seconds);
        sequence += 1;
        const proof = String(sequence);
        await markerHandle.write(proof, 0, 'utf8');
        await markerHandle.truncate(proof.length);
        await markerHandle.sync();
        await handle.sync();
      }
      function schedule() {
        if (stopped) return;
        timer = setTimeout(() => {
          pulse = pulse.then(renew);
          pulse.then(schedule, fail);
        }, workerData.interval);
      }
      async function fail(error) {
        if (failureSent) return;
        failureSent = true;
        stopped = true;
        clearTimeout(timer);
        try { if (markerHandle) await markerHandle.close(); } catch {}
        try { if (handle) await handle.close(); } catch {}
        parentPort.postMessage({ type: 'error', message: String(error) });
        parentPort.close();
      }
      parentPort.on('message', async (message) => {
        if (!message || message.type !== 'stop' || stopped) return;
        stopped = true;
        clearTimeout(timer);
        try {
          await pulse;
          await markerHandle.close();
          await handle.close();
          parentPort.postMessage({ type: 'stopped' });
          parentPort.close();
        } catch (error) { await fail(error); }
      });
      try {
        handle = await fs.open(workerData.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const status = await handle.stat();
        if (status.dev !== workerData.dev || status.ino !== workerData.ino) {
          throw new Error('run lock generation changed before heartbeat start');
        }
        markerHandle = await fs.open(
          workerData.markerPath, constants.O_RDWR | constants.O_NOFOLLOW
        );
        const markerStatus = await markerHandle.stat();
        if (markerStatus.dev !== workerData.markerDev
          || markerStatus.ino !== workerData.markerIno) {
          throw new Error('run lock heartbeat marker changed before heartbeat start');
        }
        await renew();
        parentPort.postMessage({ type: 'ready' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (stopped) return;
        await renew();
        parentPort.postMessage({ type: 'healthy' });
        schedule();
      } catch (error) { await fail(error); }
    })();
  `;
  const worker = new NATIVE_WORKER(workerSource, {
    eval: true,
    workerData: {
      path: lockDirectory,
      dev: expectedStatus.dev,
      ino: expectedStatus.ino,
      interval: RUN_LOCK_HEARTBEAT_MS,
      markerPath,
      markerDev: expectedMarkerStatus.dev,
      markerIno: expectedMarkerStatus.ino
    }
  });
  let failure = null;
  const reportFailure = (error) => {
    if (failure) return;
    failure = error;
    if (onFailure) onFailure(error);
  };
  let stoppedAcknowledged = false;
  let resolveStop = null;
  let rejectStop = null;
  let resolveReady = () => {
  };
  let rejectReady = () => {
  };
  const ready = new NATIVE_PROMISE((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, worker, ["message", (message) => {
    if (message?.type === "healthy") resolveReady(void 0);
    else if (message?.type === "stopped") {
      stoppedAcknowledged = true;
      if (resolveStop) resolveStop(void 0);
    } else if (message?.type === "error") {
      reportFailure(new RunStoreIntegrityError(message.message));
      rejectReady(failure);
      if (rejectStop) rejectStop(failure);
    }
  }]);
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, worker, ["error", (error) => {
    reportFailure(error);
    rejectReady(error);
    if (rejectStop) rejectStop(error);
  }]);
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, worker, ["exit", (code2) => {
    if (stoppedAcknowledged) return;
    reportFailure(new RunStoreIntegrityError(
      `Run heartbeat worker exited unexpectedly with code ${nativeString(code2)}.`
    ));
    rejectReady(failure);
    if (rejectStop) rejectStop(failure);
  }]);
  try {
    await ready;
  } catch (error) {
    await NATIVE_REFLECT_APPLY3(NATIVE_WORKER_TERMINATE, worker, []).catch(() => {
    });
    throw error;
  }
  let stopOperation = null;
  return () => {
    if (stopOperation) return stopOperation;
    stopOperation = (async () => {
      try {
        if (failure) throw failure;
        await new NATIVE_PROMISE((resolve, reject) => {
          resolveStop = resolve;
          rejectStop = reject;
          NATIVE_REFLECT_APPLY3(NATIVE_WORKER_POST_MESSAGE, worker, [{ type: "stop" }]);
        });
      } finally {
        await NATIVE_REFLECT_APPLY3(NATIVE_WORKER_TERMINATE, worker, []);
      }
    })();
    return stopOperation;
  };
}
async function startRunLockHeartbeatGuardian(lockDirectory, expectedStatus, markerPath, expectedMarkerStatus, onFailure) {
  const guardianSource = `
    (async () => {
      const fs = await import('node:fs/promises');
      const { constants } = await import('node:fs');
      const lockPath = process.argv[1];
      const expectedDev = Number(process.argv[2]);
      const expectedIno = Number(process.argv[3]);
      const interval = Number(process.argv[4]);
      const markerPath = process.argv[5];
      const expectedMarkerDev = Number(process.argv[6]);
      const expectedMarkerIno = Number(process.argv[7]);
      let handle;
      let markerHandle;
      let stopped = false;
      let failureSent = false;
      let timer;
      let pulse = Promise.resolve();
      let sequence = 0;
      async function renew() {
        const seconds = Date.now() / 1000;
        await handle.utimes(seconds, seconds);
        sequence += 1;
        const proof = String(sequence);
        await markerHandle.write(proof, 0, 'utf8');
        await markerHandle.truncate(proof.length);
        await markerHandle.sync();
        await handle.sync();
      }
      function schedule() {
        if (stopped) return;
        timer = setTimeout(() => {
          pulse = pulse.then(renew);
          pulse.then(schedule, fail);
        }, interval);
      }
      async function finish() {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        await pulse;
        if (markerHandle) await markerHandle.close();
        if (handle) await handle.close();
        if (process.connected) process.send({ type: 'stopped' });
        if (process.connected) process.disconnect();
      }
      async function fail(error) {
        if (failureSent) return;
        failureSent = true;
        stopped = true;
        clearTimeout(timer);
        try { if (markerHandle) await markerHandle.close(); } catch {}
        try { if (handle) await handle.close(); } catch {}
        if (process.connected) process.send({ type: 'error', message: String(error) });
        if (process.connected) process.disconnect();
      }
      process.on('message', (message) => {
        if (message && message.type === 'stop') finish().catch(fail);
      });
      process.on('disconnect', () => { finish().catch(() => {}); });
      try {
        handle = await fs.open(lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        const status = await handle.stat();
        if (status.dev !== expectedDev || status.ino !== expectedIno) {
          throw new Error('run lock generation changed before guardian start');
        }
        markerHandle = await fs.open(markerPath, constants.O_RDWR | constants.O_NOFOLLOW);
        const markerStatus = await markerHandle.stat();
        if (markerStatus.dev !== expectedMarkerDev || markerStatus.ino !== expectedMarkerIno) {
          throw new Error('run lock heartbeat marker changed before guardian start');
        }
        await renew();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await renew();
        if (process.connected) process.send({ type: 'healthy' });
        schedule();
      } catch (error) { await fail(error); }
    })();
  `;
  const child = NATIVE_REFLECT_APPLY3(NATIVE_SPAWN, void 0, [
    NATIVE_PROCESS_EXEC_PATH,
    [
      "-e",
      guardianSource,
      lockDirectory,
      nativeString(expectedStatus.dev),
      nativeString(expectedStatus.ino),
      nativeString(RUN_LOCK_HEARTBEAT_MS),
      markerPath,
      nativeString(expectedMarkerStatus.dev),
      nativeString(expectedMarkerStatus.ino)
    ],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] }
  ]);
  const childSend = NATIVE_REFLECT_APPLY3(
    NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR,
    NATIVE_OBJECT2,
    [child, "send"]
  )?.value;
  if (typeof childSend !== "function") {
    NATIVE_REFLECT_APPLY3(NATIVE_CHILD_PROCESS_KILL, child, []);
    throw new RunStoreIntegrityError("Run heartbeat guardian has no trusted IPC send operation.");
  }
  let failure = null;
  const reportFailure = (error) => {
    if (failure) return;
    failure = error;
    if (onFailure) onFailure(error);
  };
  let stoppedAcknowledged = false;
  let resolveStop = null;
  let rejectStop = null;
  let resolveReady = () => {
  };
  let rejectReady = () => {
  };
  const ready = new NATIVE_PROMISE((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, child, ["message", (message) => {
    if (message?.type === "healthy") resolveReady(void 0);
    else if (message?.type === "stopped") {
      stoppedAcknowledged = true;
      if (resolveStop) resolveStop(void 0);
    } else if (message?.type === "error") {
      reportFailure(new RunStoreIntegrityError(message.message));
      rejectReady(failure);
      if (rejectStop) rejectStop(failure);
    }
  }]);
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, child, ["error", (error) => {
    reportFailure(error);
    rejectReady(error);
    if (rejectStop) rejectStop(error);
  }]);
  NATIVE_REFLECT_APPLY3(NATIVE_WORKER_ON, child, ["exit", (code2) => {
    if (stoppedAcknowledged) return;
    reportFailure(new RunStoreIntegrityError(
      `Run heartbeat guardian exited unexpectedly with code ${nativeString(code2)}.`
    ));
    rejectReady(failure);
    if (rejectStop) rejectStop(failure);
  }]);
  try {
    await ready;
  } catch (error) {
    NATIVE_REFLECT_APPLY3(NATIVE_CHILD_PROCESS_KILL, child, []);
    throw error;
  }
  let stopOperation = null;
  return () => {
    if (stopOperation) return stopOperation;
    stopOperation = (async () => {
      try {
        if (failure) throw failure;
        await new NATIVE_PROMISE((resolve, reject) => {
          resolveStop = resolve;
          rejectStop = reject;
          NATIVE_REFLECT_APPLY3(childSend, child, [{ type: "stop" }]);
        });
      } finally {
        NATIVE_REFLECT_APPLY3(NATIVE_CHILD_PROCESS_KILL, child, []);
      }
    })();
    return stopOperation;
  };
}
async function createRunLockHeartbeatMarker(lockDirectory, expectedStatus, name) {
  const markerPath = pathJoin(lockDirectory, name);
  const markerHandle = await open(
    markerPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR | fsConstants.O_NOFOLLOW,
    384
  );
  try {
    await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_WRITE_FILE, markerHandle, ["0"]);
    await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_SYNC, markerHandle, []);
    const markerStatus = await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_STAT, markerHandle, []);
    const currentDirectory = await lstat(lockDirectory);
    if (!sameFileGeneration(expectedStatus, currentDirectory)) throw new RunStoreIntegrityError(
      "Run coordination generation changed while heartbeat proof was initialized."
    );
    return { markerPath, markerStatus };
  } finally {
    await closeFileHandle(markerHandle);
  }
}
async function startRunLockHeartbeat(lockDirectory, expectedStatus, onFailure) {
  const firstMarker = await createRunLockHeartbeatMarker(
    lockDirectory,
    expectedStatus,
    ".heartbeat-worker-1"
  );
  const secondMarker = await createRunLockHeartbeatMarker(
    lockDirectory,
    expectedStatus,
    ".heartbeat-worker-2"
  );
  const guardianMarker = await createRunLockHeartbeatMarker(
    lockDirectory,
    expectedStatus,
    ".heartbeat-guardian"
  );
  const stopFirst = await startSingleRunLockHeartbeat(
    lockDirectory,
    expectedStatus,
    firstMarker.markerPath,
    firstMarker.markerStatus,
    onFailure
  );
  let stopSecond;
  try {
    stopSecond = await startSingleRunLockHeartbeat(
      lockDirectory,
      expectedStatus,
      secondMarker.markerPath,
      secondMarker.markerStatus,
      onFailure
    );
  } catch (error) {
    await stopFirst().catch(() => {
    });
    throw error;
  }
  let stopGuardian;
  try {
    stopGuardian = await startRunLockHeartbeatGuardian(
      lockDirectory,
      expectedStatus,
      guardianMarker.markerPath,
      guardianMarker.markerStatus,
      onFailure
    );
  } catch (error) {
    await stopFirst().catch(() => {
    });
    await stopSecond().catch(() => {
    });
    throw error;
  }
  let firstStopped = false;
  const stopOne = async () => {
    if (firstStopped) return;
    firstStopped = true;
    await stopFirst();
  };
  const stopWorkers = async () => {
    let firstError = null;
    try {
      await stopOne();
    } catch (error) {
      firstError = error;
    }
    try {
      await stopSecond();
    } catch (error) {
      if (!firstError) firstError = error;
    }
    if (firstError) throw firstError;
  };
  const stopAll = async () => {
    let firstError = null;
    let successfulStops = 0;
    try {
      await stopOne();
      successfulStops += 1;
    } catch (error) {
      firstError = error;
    }
    try {
      await stopSecond();
      successfulStops += 1;
    } catch (error) {
      if (!firstError) firstError = error;
    }
    try {
      await stopGuardian();
      successfulStops += 1;
    } catch (error) {
      if (!firstError) firstError = error;
    }
    if (successfulStops === 0 && firstError) throw firstError;
  };
  const failAll = async () => {
    await stopAll();
    if (onFailure) onFailure(new RunStoreIntegrityError(
      "Run coordination heartbeat failed because every helper stopped."
    ));
  };
  return { failAll, stopAll, stopOne, stopWorkers };
}
async function assertExactRunLockOwnership(runDirectory, expectedStatus, token) {
  const lockDirectory = pathJoin(runDirectory, RUN_LOCK_DIRECTORY);
  const ownerPath = pathJoin(lockDirectory, RUN_LOCK_OWNER_FILE);
  let observed;
  try {
    observed = await observeRunLock(runDirectory, lockDirectory, ownerPath);
  } catch (error) {
    if (isMissing(error)) throw new RunStoreIntegrityError(
      "Run coordination residue cleanup requires active ownership."
    );
    throw error;
  }
  if (!sameFileGeneration(expectedStatus, observed.status) || observed.record?.token !== token || observed.record?.pid !== NATIVE_PROCESS_PID || observed.record?.process_start_identity !== NATIVE_PROCESS_START_IDENTITY) {
    throw new RunStoreIntegrityError(
      "Run coordination residue cleanup requires exact acquired ownership."
    );
  }
}
async function restoreResidueClaim(runDirectory, claimed, target) {
  try {
    await lstat(claimed);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  try {
    await lstat(target);
    throw new RunStoreIntegrityError(
      "Run coordination residue claim could not be restored without replacement."
    );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  await rename(claimed, target);
  await syncDirectory(runDirectory);
}
async function cleanupRunLockResidues(runDirectory, expectedStatus, token, afterClaim) {
  await assertExactRunLockOwnership(runDirectory, expectedStatus, token);
  const entries = await readdir(runDirectory, { withFileTypes: true });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!regexpTest2(RUN_LOCK_RESIDUE_DIRECTORY, entry.name)) continue;
    if (direntIsSymbolicLink(entry) || !direntIsDirectory(entry)) throw new RunStoreIntegrityError(
      "Run coordination crash residue is not a real directory."
    );
    const target = pathJoin(runDirectory, entry.name);
    const targetStatus = await lstat(target);
    if (statsIsSymbolicLink(targetStatus) || !statsIsDirectory(targetStatus)) {
      throw new RunStoreIntegrityError("Run coordination crash residue changed before cleanup.");
    }
    await inspectTree(runDirectory, target);
    await assertExactRunLockOwnership(runDirectory, expectedStatus, token);
    const claimed = `${target}.cleanup-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
    await rename(target, claimed);
    await syncDirectory(runDirectory);
    try {
      const claimedStatus = await lstat(claimed);
      if (!sameFileGeneration(targetStatus, claimedStatus)) throw new RunStoreIntegrityError(
        "Run coordination residue generation changed while it was claimed."
      );
      if (afterClaim) await afterClaim();
      await assertExactRunLockOwnership(runDirectory, expectedStatus, token);
      await inspectTree(runDirectory, claimed);
      await assertExactRunLockOwnership(runDirectory, expectedStatus, token);
      await rm(claimed, { recursive: true, force: true });
      await syncDirectory(runDirectory);
      await assertExactRunLockOwnership(runDirectory, expectedStatus, token);
    } catch (error) {
      await restoreResidueClaim(runDirectory, claimed, target);
      throw error;
    }
  }
}
async function acquireRunLock(runDirectory, coordinationHooks = {}) {
  requireRunStoreIntrinsics();
  const lockDirectory = pathJoin(runDirectory, RUN_LOCK_DIRECTORY);
  const ownerPath = pathJoin(lockDirectory, RUN_LOCK_OWNER_FILE);
  const startedAt = currentTimeMilliseconds();
  const token = `${nativeString(NATIVE_PROCESS_PID)}-${nativeString(startedAt)}-${nativeString(++lockSequence)}`;
  let foreignPid = -1;
  let foreignToken = "";
  let foreignProcessStart = "";
  let foreignStatus = null;
  let foreignHeartbeatMtime = -1;
  let foreignHeartbeatProof = "";
  let foreignFirstObservedAt = 0;
  let foreignHeartbeatObservedAt = 0;
  let foreignHeartbeatAuthenticated = false;
  while (true) {
    await waitForReleaseTransaction(runDirectory);
    try {
      await mkdir(lockDirectory);
      const acquiredStatus = await lstat(lockDirectory);
      if (await releaseTransactionExists(runDirectory)) {
        await removeOwnedLockGeneration(
          runDirectory,
          lockDirectory,
          acquiredStatus,
          "stale"
        );
        continue;
      }
      let claimHandle;
      const owner = {
        pid: NATIVE_PROCESS_PID,
        token,
        lease_expires_at_ms: currentTimeMilliseconds() + RUN_LOCK_LEASE_MS,
        process_start_identity: NATIVE_PROCESS_START_IDENTITY,
        heartbeat_seq: 0,
        heartbeat_ready: false
      };
      try {
        claimHandle = await open(
          lockDirectory,
          fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
        );
        await syncDirectory(runDirectory);
        await writeRunLockOwner(runDirectory, ownerPath, owner);
        await syncDirectory(runDirectory);
      } catch (error) {
        if (claimHandle) await closeFileHandle(claimHandle).catch(() => {
        });
        await removeOwnedLockGeneration(
          runDirectory,
          lockDirectory,
          acquiredStatus,
          "stale"
        ).catch(() => {
        });
        throw error;
      }
      let claimed;
      try {
        claimed = await observeRunLock(runDirectory, lockDirectory, ownerPath);
      } catch (error) {
        await closeFileHandle(claimHandle).catch(() => {
        });
        await removeOwnedLockGeneration(
          runDirectory,
          lockDirectory,
          acquiredStatus,
          "stale"
        ).catch(() => {
        });
        throw error;
      }
      if (!sameFileGeneration(acquiredStatus, claimed.status) || claimed.record?.token !== token) {
        await closeFileHandle(claimHandle).catch(() => {
        });
        await removeOwnedLockGeneration(
          runDirectory,
          lockDirectory,
          acquiredStatus,
          "stale"
        ).catch(() => {
        });
        throw new RunStoreIntegrityError("Run coordination generation changed during acquisition.");
      }
      let released = false;
      let claimHandleClosed = false;
      const closeClaimHandle = async () => {
        if (claimHandleClosed) return;
        claimHandleClosed = true;
        await closeFileHandle(claimHandle);
      };
      let heartbeatStopped = false;
      let heartbeatTimer;
      let heartbeatPromise = null;
      let heartbeatError = null;
      let heartbeatWorkers = null;
      const scheduleHeartbeat = () => {
        if (heartbeatStopped) return;
        heartbeatTimer = NATIVE_SET_TIMEOUT(() => {
          heartbeatPromise = (async () => {
            try {
              const observed2 = await observeRunLock(runDirectory, lockDirectory, ownerPath);
              if (!sameFileGeneration(acquiredStatus, observed2.status) || observed2.record?.token !== token) throw new RunStoreIntegrityError(
                "Run coordination fencing changed before heartbeat renewal."
              );
              if (coordinationHooks.afterHeartbeatObservation) {
                await coordinationHooks.afterHeartbeatObservation();
              }
              const heartbeatSeconds = currentTimeMilliseconds() / 1e3;
              await NATIVE_REFLECT_APPLY3(
                NATIVE_FILE_HANDLE_UTIMES,
                claimHandle,
                [heartbeatSeconds, heartbeatSeconds]
              );
              await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_SYNC, claimHandle, []);
              const renewed = await observeRunLock(runDirectory, lockDirectory, ownerPath);
              if (!sameFileGeneration(acquiredStatus, renewed.status) || renewed.record?.token !== token) throw new RunStoreIntegrityError(
                "Run coordination fencing changed during heartbeat renewal."
              );
            } catch (error) {
              heartbeatError = error;
              heartbeatStopped = true;
            }
            if (!heartbeatStopped) scheduleHeartbeat();
          })();
        }, RUN_LOCK_HEARTBEAT_MS);
      };
      try {
        if (coordinationHooks.afterHeartbeatObservation) scheduleHeartbeat();
        else {
          heartbeatWorkers = await startRunLockHeartbeat(
            lockDirectory,
            acquiredStatus,
            (error) => {
              heartbeatError = error;
            }
          );
          if (coordinationHooks.afterHeartbeatWorkerReady) {
            await coordinationHooks.afterHeartbeatWorkerReady(
              heartbeatWorkers.stopOne,
              heartbeatWorkers.stopWorkers,
              heartbeatWorkers.failAll
            );
          }
        }
        owner.heartbeat_ready = true;
        await writeRunLockOwner(runDirectory, ownerPath, owner);
        await syncDirectory(runDirectory);
        const ready = await observeRunLock(runDirectory, lockDirectory, ownerPath);
        if (!sameFileGeneration(acquiredStatus, ready.status) || ready.record?.token !== token || ready.record?.heartbeat_ready !== true) {
          throw new RunStoreIntegrityError(
            "Run coordination generation changed during heartbeat readiness."
          );
        }
        if (coordinationHooks.beforeResidueCleanup) {
          await coordinationHooks.beforeResidueCleanup();
        }
        await cleanupRunLockResidues(
          runDirectory,
          acquiredStatus,
          token,
          coordinationHooks.afterResidueClaim
        );
      } catch (error) {
        heartbeatStopped = true;
        if (heartbeatWorkers) await heartbeatWorkers.stopAll().catch(() => {
        });
        await closeClaimHandle().catch(() => {
        });
        await removeOwnedLockGeneration(
          runDirectory,
          lockDirectory,
          acquiredStatus,
          "stale"
        ).catch(() => {
        });
        throw error;
      }
      const releaseOwnership = async () => {
        if (released) return;
        heartbeatStopped = true;
        if (heartbeatTimer !== void 0) NATIVE_CLEAR_TIMEOUT(heartbeatTimer);
        try {
          const releaseTransaction = await acquireReleaseTransaction(runDirectory, token);
          try {
            if (heartbeatPromise) await heartbeatPromise;
            if (heartbeatWorkers) await heartbeatWorkers.stopAll();
            const observed2 = await observeRunLock(runDirectory, lockDirectory, ownerPath);
            if (heartbeatError) throw heartbeatError;
            if (!sameFileGeneration(acquiredStatus, observed2.status) || observed2.record?.token !== token || observed2.record.pid !== NATIVE_PROCESS_PID || observed2.record.process_start_identity !== NATIVE_PROCESS_START_IDENTITY) {
              throw new RunStoreIntegrityError("Run coordination ownership changed before release.");
            }
            if (coordinationHooks.afterReleaseObservation) {
              await coordinationHooks.afterReleaseObservation();
            }
            const releasedDirectory = `${lockDirectory}.release-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
            await rename(lockDirectory, releasedDirectory);
            await syncDirectory(runDirectory);
            const movedStatus = await lstat(releasedDirectory);
            if (!sameFileGeneration(acquiredStatus, movedStatus)) {
              await restoreForeignLockGeneration(
                runDirectory,
                lockDirectory,
                releasedDirectory,
                movedStatus
              );
              throw new RunStoreIntegrityError(
                "Run coordination release moved a different generation."
              );
            }
            const moved = await observeRunLock(
              runDirectory,
              releasedDirectory,
              pathJoin(releasedDirectory, RUN_LOCK_OWNER_FILE)
            );
            if (!sameFileGeneration(acquiredStatus, moved.status) || moved.record?.token !== token) throw new RunStoreIntegrityError(
              "Run coordination release moved a different generation."
            );
            await closeClaimHandle();
            await rm(releasedDirectory, { recursive: true, force: true });
            await syncDirectory(runDirectory);
            released = true;
          } finally {
            await releaseTransaction();
          }
        } catch (error) {
          let heartbeatCleanupError = null;
          try {
            if (heartbeatPromise) await heartbeatPromise;
            if (heartbeatWorkers) await heartbeatWorkers.stopAll();
          } catch (cleanupError) {
            heartbeatCleanupError = cleanupError;
          }
          try {
            await closeClaimHandle();
            await removeOwnedLockGeneration(
              runDirectory,
              lockDirectory,
              acquiredStatus,
              "stale"
            );
          } catch (cleanupError) {
            throw new RunStoreIntegrityError(
              `Run coordination release failed (${nativeString(error)}) and cleanup failed (${nativeString(cleanupError)}).`
            );
          }
          if (heartbeatCleanupError) throw new RunStoreIntegrityError(
            `Run coordination release failed (${nativeString(error)}) and heartbeat cleanup failed (${nativeString(heartbeatCleanupError)}).`
          );
          throw error;
        }
      };
      const assertHealthy = () => {
        if (heartbeatError) throw new RunStoreIntegrityError(
          `Run coordination heartbeat failed: ${nativeString(heartbeatError)}`
        );
      };
      NATIVE_REFLECT_APPLY3(NATIVE_DEFINE_PROPERTY7, NATIVE_OBJECT2, [releaseOwnership, "assertHealthy", {
        value: assertHealthy,
        enumerable: false,
        writable: false,
        configurable: false
      }]);
      NATIVE_REFLECT_APPLY3(NATIVE_DEFINE_PROPERTY7, NATIVE_OBJECT2, [releaseOwnership, "guardedAwait", {
        value: async (operation) => {
          assertHealthy();
          const value = await operation();
          assertHealthy();
          return value;
        },
        enumerable: false,
        writable: false,
        configurable: false
      }]);
      return (
        /** @type {(()=>Promise<void>) & {assertHealthy:()=>void,guardedAwait:<T>(operation:()=>Promise<T>)=>Promise<T>}} */
        releaseOwnership
      );
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }
    let observed;
    try {
      observed = await observeRunLock(runDirectory, lockDirectory, ownerPath);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    const status = observed.status;
    const record2 = observed.record;
    const ownerPid = record2?.pid;
    const ownerToken = record2?.token;
    const ownerLease = record2?.lease_expires_at_ms;
    const ownerProcessStart = record2?.process_start_identity;
    const ownerShapeValid = typeof ownerToken === "string" && ownerToken.length > 0 && typeof ownerPid === "number" && typeof ownerLease === "number" && NATIVE_REFLECT_APPLY3(NATIVE_NUMBER_IS_SAFE_INTEGER2, NATIVE_NUMBER2, [ownerPid]) && NATIVE_REFLECT_APPLY3(NATIVE_NUMBER_IS_SAFE_INTEGER2, NATIVE_NUMBER2, [ownerLease]);
    const now = currentTimeMilliseconds();
    const currentPidIdentityMatches = ownerPid !== NATIVE_PROCESS_PID || ownerProcessStart === void 0 || ownerProcessStart === NATIVE_PROCESS_START_IDENTITY;
    const hasCompilerHeartbeat = typeof record2?.heartbeat_seq === "number" && NATIVE_REFLECT_APPLY3(
      NATIVE_NUMBER_IS_SAFE_INTEGER2,
      NATIVE_NUMBER2,
      [record2.heartbeat_seq]
    );
    const compilerIdentityValid = hasCompilerHeartbeat && compilerProcessIdentityHasCanonicalShape(ownerPid, ownerProcessStart);
    const heartbeatLease = compilerIdentityValid ? status.mtimeMs + RUN_LOCK_LEASE_MS : ownerLease;
    let foreignHeartbeatPending = false;
    if (ownerPid !== NATIVE_PROCESS_PID && ownerShapeValid && compilerIdentityValid) {
      const sameForeignTuple = ownerPid === foreignPid && ownerToken === foreignToken && ownerProcessStart === foreignProcessStart && sameFileGeneration(status, foreignStatus);
      if (!sameForeignTuple) {
        foreignPid = ownerPid;
        foreignToken = ownerToken;
        foreignProcessStart = /** @type {string} */
        ownerProcessStart;
        foreignStatus = status;
        foreignHeartbeatMtime = status.mtimeMs;
        foreignHeartbeatProof = observed.heartbeatProof;
        foreignFirstObservedAt = now;
        foreignHeartbeatObservedAt = 0;
        foreignHeartbeatAuthenticated = false;
      } else if (status.mtimeMs > foreignHeartbeatMtime || observed.heartbeatProof !== foreignHeartbeatProof && observed.heartbeatProof.length > 0) {
        foreignHeartbeatMtime = status.mtimeMs;
        foreignHeartbeatProof = observed.heartbeatProof;
        foreignHeartbeatObservedAt = now;
        foreignHeartbeatAuthenticated = true;
      } else if (status.mtimeMs < foreignHeartbeatMtime) {
        foreignHeartbeatMtime = status.mtimeMs;
        foreignHeartbeatProof = observed.heartbeatProof;
        foreignFirstObservedAt = now;
        foreignHeartbeatObservedAt = 0;
        foreignHeartbeatAuthenticated = false;
      }
      foreignHeartbeatPending = !foreignHeartbeatAuthenticated && now - foreignFirstObservedAt < RUN_LOCK_HEARTBEAT_PROOF_MS;
    } else {
      foreignPid = -1;
      foreignToken = "";
      foreignProcessStart = "";
      foreignStatus = null;
      foreignHeartbeatMtime = -1;
      foreignHeartbeatProof = "";
      foreignFirstObservedAt = 0;
      foreignHeartbeatObservedAt = 0;
      foreignHeartbeatAuthenticated = false;
    }
    const arbitraryPidIsAuthenticated = ownerPid === NATIVE_PROCESS_PID || foreignHeartbeatAuthenticated;
    const authenticatedLease = foreignHeartbeatAuthenticated ? foreignHeartbeatObservedAt + RUN_LOCK_LEASE_MS : heartbeatLease;
    const ownerAlive = ownerShapeValid && typeof authenticatedLease === "number" && authenticatedLease > now && currentPidIdentityMatches && arbitraryPidIsAuthenticated && processOwnerIsAlive(ownerPid);
    const incompleteIsYoung = !ownerShapeValid && now - status.mtimeMs < RUN_LOCK_INCOMPLETE_GRACE_MS;
    const waitForForeignHeartbeatProof = foreignHeartbeatPending && typeof heartbeatLease === "number" && heartbeatLease > now && processOwnerIsAlive(ownerPid);
    if (!ownerAlive && !incompleteIsYoung && !waitForForeignHeartbeatProof) {
      const staleDirectory = `${lockDirectory}.stale-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
      try {
        const confirmed = await observeRunLock(runDirectory, lockDirectory, ownerPath);
        if (!sameFileGeneration(status, confirmed.status) || confirmed.record?.token !== ownerToken) continue;
        if (coordinationHooks.afterStaleObservation) {
          await coordinationHooks.afterStaleObservation();
        }
        await rename(lockDirectory, staleDirectory);
        await syncDirectory(runDirectory);
        const moved = await observeRunLock(
          runDirectory,
          staleDirectory,
          pathJoin(staleDirectory, RUN_LOCK_OWNER_FILE)
        );
        if (!sameFileGeneration(status, moved.status) || moved.record?.token !== ownerToken) {
          try {
            await rename(staleDirectory, lockDirectory);
            await syncDirectory(runDirectory);
          } catch (restoreError) {
            throw new RunStoreIntegrityError(
              `Run coordination ABA generation could not be restored: ${nativeString(restoreError)}`
            );
          }
          continue;
        }
        await rm(staleDirectory, { recursive: true, force: true });
        await syncDirectory(runDirectory);
        continue;
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
    }
    if (!ownerAlive && !waitForForeignHeartbeatProof && currentTimeMilliseconds() - startedAt >= RUN_LOCK_WAIT_MS) throw new RunStoreIntegrityError(
      "Timed out waiting for the active run coordination owner."
    );
    await delay(RUN_LOCK_POLL_MS);
  }
}
async function removeFileDurably(runDirectory, targetPath) {
  await assertNoSymlinkPath(runDirectory, targetPath);
  try {
    await rm(targetPath);
    await syncDirectory(pathDirname(targetPath));
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}
async function inspectTree(runDirectory, directory) {
  const pending = [directory];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    await assertNoSymlinkPath(runDirectory, current);
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const target = pathJoin(current, entry.name);
      if (direntIsSymbolicLink(entry)) throw new RunStoreIntegrityError(
        `Controlled run tree contains a symbolic link: ${pathRelative(runDirectory, target)}`
      );
      if (direntIsDirectory(entry)) append2(pending, target);
    }
  }
}
async function prepareRunStore(runDirectory) {
  const rootStatus = await lstat(runDirectory);
  if (statsIsSymbolicLink(rootStatus) || !statsIsDirectory(rootStatus)) throw new RunStoreIntegrityError(
    "Run directory must be a real directory rather than a symbolic link."
  );
  await realpath(runDirectory);
  const canonicalRoot = pathResolve(runDirectory);
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    await inspectTree(canonicalRoot, pathJoin(canonicalRoot, CONTROLLED_DIRECTORIES[index]));
  }
  for (let index = 0; index < CONTROLLED_FILES.length; index += 1) {
    await assertNoSymlinkPath(canonicalRoot, pathJoin(canonicalRoot, CONTROLLED_FILES[index]));
  }
  return canonicalRoot;
}
async function recoverStagingClaims(runDirectory) {
  const directory = pathJoin(runDirectory, "staging");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const stage of ["source_pack", "evidence_claims", "behavior_views", "case_drafts"]) {
    const typedStage = (
      /** @type {keyof typeof STAGE_FILES} */
      stage
    );
    const fileName = STAGE_FILES[typedStage];
    const prefix = `.${fileName}.claim-`;
    const claims = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (direntIsFile(entry) && stringStartsWith(entry.name, prefix)) append2(claims, entry.name);
    }
    NATIVE_REFLECT_APPLY3(NATIVE_ARRAY_SORT6, claims, []);
    const unresolvedClaims = [];
    for (let index = 0; index < claims.length; index += 1) {
      const claimName = claims[index];
      const claimPath = pathJoin(directory, claimName);
      const claimText = await readText(runDirectory, claimPath);
      let claimValue;
      try {
        claimValue = NATIVE_REFLECT_APPLY3(NATIVE_JSON_PARSE, NATIVE_JSON, [claimText]);
      } catch {
        append2(unresolvedClaims, claimName);
        continue;
      }
      const claimRevision = claimValue && typeof claimValue === "object" ? claimValue.source_revision : void 0;
      const accepted = NATIVE_REFLECT_APPLY3(
        NATIVE_NUMBER_IS_SAFE_INTEGER2,
        NATIVE_NUMBER2,
        [claimRevision]
      ) ? await readJsonIfPresent(
        runDirectory,
        acceptedPath(runDirectory, claimRevision, typedStage)
      ) : null;
      if (accepted && accepted.digest === digest(claimValue)) {
        await removeFileDurably(runDirectory, claimPath);
      } else append2(unresolvedClaims, claimName);
    }
    if (unresolvedClaims.length === 0) continue;
    const canonical = stagingPath(runDirectory, typedStage);
    const firstClaim = pathJoin(directory, unresolvedClaims[0]);
    const firstText = await readText(runDirectory, firstClaim);
    for (let index = 1; index < unresolvedClaims.length; index += 1) {
      if (await readText(runDirectory, pathJoin(directory, unresolvedClaims[index])) !== firstText) {
        throw new RunStoreIntegrityError("Conflicting staging promotion claims require manual revision.");
      }
    }
    const canonicalText = await readTextIfPresent(runDirectory, canonical);
    if (canonicalText !== null && canonicalText !== firstText) throw new RunStoreIntegrityError(
      "Recovered staging claim conflicts with the current staging artifact."
    );
    if (canonicalText === null) {
      await rename(firstClaim, canonical);
      await syncDirectory(directory);
    } else await removeFileDurably(runDirectory, firstClaim);
    for (let index = 1; index < unresolvedClaims.length; index += 1) {
      await removeFileDurably(runDirectory, pathJoin(directory, unresolvedClaims[index]));
    }
  }
}
async function cleanupTemporaryFiles(runDirectory) {
  const roots = [runDirectory];
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    append2(roots, pathJoin(runDirectory, CONTROLLED_DIRECTORIES[index]));
  }
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const pending = [roots[rootIndex]];
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const directory = pending[cursor];
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const target = pathJoin(directory, entry.name);
        if (direntIsSymbolicLink(entry)) throw new RunStoreIntegrityError(
          `Controlled run tree contains a symbolic link: ${pathRelative(runDirectory, target)}`
        );
        if (direntIsDirectory(entry)) append2(pending, target);
        else if (direntIsFile(entry) && regexpTest2(TEMPORARY_FILE, entry.name) && !temporaryOwnerIsAlive(entry.name)) {
          await removeFileDurably(runDirectory, target);
        }
      }
    }
  }
}
async function atomicWriteText(runDirectory, targetPath, content) {
  const directory = pathDirname(targetPath);
  await ensureDirectory(runDirectory, directory);
  await assertNoSymlinkPath(runDirectory, targetPath);
  temporarySequence += 1;
  const temporaryPath = pathJoin(
    directory,
    `.${pathBasename(targetPath)}.tmp-${NATIVE_PROCESS_PID}-${temporarySequence}`
  );
  let handle;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      384
    );
    await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_WRITE_FILE, handle, [content, "utf8"]);
    await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_SYNC, handle, []);
    await closeFileHandle(handle);
    handle = void 0;
    await assertNoSymlinkPath(runDirectory, targetPath);
    await rename(temporaryPath, targetPath);
    await syncDirectory(directory);
  } catch (error) {
    if (handle) await closeFileHandle(handle).catch(() => {
    });
    await rm(temporaryPath, { force: true }).catch(() => {
    });
    throw error;
  }
}
async function atomicWriteJson(runDirectory, targetPath, value) {
  requireRunStoreIntrinsics();
  await atomicWriteText(runDirectory, targetPath, `${canonicalStringify(value)}
`);
}
async function readText(runDirectory, filePath) {
  await assertNoSymlinkPath(runDirectory, filePath);
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const status = await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_STAT, handle, []);
    if (!statsIsFile(status)) throw new RunStoreIntegrityError(
      `Controlled artifact is not a regular file: ${pathRelative(runDirectory, filePath)}`
    );
    return await NATIVE_REFLECT_APPLY3(NATIVE_FILE_HANDLE_READ_FILE, handle, ["utf8"]);
  } finally {
    await closeFileHandle(handle);
  }
}
async function readTextIfPresent(runDirectory, filePath) {
  try {
    return await readText(runDirectory, filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
async function readJson(runDirectory, filePath) {
  const text = await readText(runDirectory, filePath);
  requireRunStoreIntrinsics();
  const value = NATIVE_REFLECT_APPLY3(NATIVE_JSON_PARSE, NATIVE_JSON, [text]);
  return { text, value, digest: digest(value) };
}
async function readJsonIfPresent(runDirectory, filePath) {
  try {
    return await readJson(runDirectory, filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
function stagingPath(runDirectory, stage) {
  return pathJoin(runDirectory, "staging", STAGE_FILES[stage]);
}
function acceptedPath(runDirectory, sourceRevision, stage) {
  return pathJoin(runDirectory, "accepted", revisionName(sourceRevision), STAGE_FILES[stage]);
}
function obligationsPath(runDirectory, sourceRevision) {
  return pathJoin(runDirectory, "derived", revisionName(sourceRevision), "test-obligations.json");
}
function clarificationStatePath(runDirectory, sourceRevision) {
  return pathJoin(runDirectory, "derived", revisionName(sourceRevision), "clarification-state.json");
}
function outputPaths(runDirectory, sourceRevision) {
  const directory = pathJoin(runDirectory, "output", revisionName(sourceRevision));
  return {
    directory,
    bundle: pathJoin(directory, "test-bundle.json"),
    markdown: pathJoin(directory, "test-cases.md"),
    current: pathJoin(runDirectory, "output", "current.json")
  };
}
async function acceptedSourceRevisions(runDirectory) {
  let entries;
  const acceptedDirectory = pathJoin(runDirectory, "accepted");
  try {
    entries = await readdir(acceptedDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const revisions = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (direntIsSymbolicLink(entry)) throw new RunStoreIntegrityError("Accepted revision cannot be a symbolic link.");
    if (!direntIsDirectory(entry)) continue;
    const match = NATIVE_REFLECT_APPLY3(NATIVE_REGEXP_EXEC2, REVISION_DIRECTORY, [entry.name]);
    if (!match) continue;
    const sourceRevision = NATIVE_REFLECT_APPLY3(NATIVE_NUMBER2, void 0, [match[1]]);
    if (!NATIVE_REFLECT_APPLY3(NATIVE_NUMBER_IS_SAFE_INTEGER2, NATIVE_NUMBER2, [sourceRevision]) || entry.name !== revisionName(sourceRevision)) {
      throw new RunStoreIntegrityError(`Accepted revision directory is not canonical: ${entry.name}`);
    }
    const source = await readJsonIfPresent(
      runDirectory,
      acceptedPath(runDirectory, sourceRevision, "source_pack")
    );
    if (source) append2(revisions, sourceRevision);
    else {
      for (const stage of ["evidence_claims", "behavior_views", "case_drafts"]) {
        if (await readTextIfPresent(
          runDirectory,
          acceptedPath(
            runDirectory,
            sourceRevision,
            /** @type {keyof typeof STAGE_FILES} */
            stage
          )
        ) !== null) throw new RunStoreIntegrityError(
          `Accepted revision ${entry.name} has downstream artifacts without a Source Pack.`
        );
      }
    }
  }
  NATIVE_REFLECT_APPLY3(NATIVE_ARRAY_SORT6, revisions, [
    (left, right) => left - right
  ]);
  return revisions;
}
async function discardStagingSnapshot(runDirectory, stage, snapshot) {
  const source = stagingPath(runDirectory, stage);
  const directory = pathDirname(source);
  const claim = pathJoin(directory, `.${pathBasename(source)}.claim-${NATIVE_PROCESS_PID}-${++temporarySequence}`);
  await rename(source, claim);
  await syncDirectory(directory);
  const claimedText = await readText(runDirectory, claim);
  if (claimedText !== snapshot.text) {
    if (await readTextIfPresent(runDirectory, source) === null) await rename(claim, source);
    throw new RunStoreIntegrityError("Staging artifact changed after validation.");
  }
  await removeFileDurably(runDirectory, claim);
}
async function promoteArtifact(runDirectory, sourceRevision, stage, value, snapshot) {
  const target = acceptedPath(runDirectory, sourceRevision, stage);
  const existing = await readJsonIfPresent(runDirectory, target);
  if (existing) {
    if (existing.digest !== digest(value)) throw new RunStoreIntegrityError(
      "Accepted artifact conflicts with the validated staging snapshot."
    );
    await discardStagingSnapshot(runDirectory, stage, snapshot);
    return;
  }
  const source = stagingPath(runDirectory, stage);
  const directory = pathDirname(source);
  const claim = pathJoin(directory, `.${pathBasename(source)}.claim-${NATIVE_PROCESS_PID}-${++temporarySequence}`);
  await ensureDirectory(runDirectory, directory);
  await assertNoSymlinkPath(runDirectory, source);
  await rename(source, claim);
  await syncDirectory(directory);
  const claimedText = await readText(runDirectory, claim);
  if (claimedText !== snapshot.text) {
    if (await readTextIfPresent(runDirectory, source) === null) {
      await rename(claim, source);
      await syncDirectory(directory);
    }
    throw new RunStoreIntegrityError("Staging artifact changed after validation.");
  }
  await atomicWriteJson(runDirectory, target, value);
  await removeFileDurably(runDirectory, claim);
}
async function writeCheckpoint(runDirectory, checkpoint2) {
  await atomicWriteJson(runDirectory, pathJoin(runDirectory, "checkpoint.json"), checkpoint2);
}
async function writeFinalOutput(runDirectory, sourceRevision, bundle, markdown) {
  const paths = outputPaths(runDirectory, sourceRevision);
  await atomicWriteJson(runDirectory, paths.bundle, bundle);
  await atomicWriteText(runDirectory, paths.markdown, markdown);
  return paths;
}

// src/schema-registry.mjs
import { readFile } from "node:fs/promises";
import path2 from "node:path";
async function loadSchemaRegistry(schemaDirectory2, embeddedManifestDigest2, embeddedCompilerVersion2) {
  const manifestPath = path2.join(schemaDirectory2, "..", "schema-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expectedManifestDigest = embeddedManifestDigest2 ?? manifest.digest;
  if (digest({ compiler_version: manifest.compiler_version, schema_version: manifest.schema_version, schemas: manifest.schemas }) !== expectedManifestDigest || manifest.digest !== expectedManifestDigest) {
    throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  }
  if (!Array.isArray(manifest.schemas) || typeof manifest.schema_version !== "string" || typeof manifest.compiler_version !== "string" || embeddedCompilerVersion2 && manifest.compiler_version !== embeddedCompilerVersion2) throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  const schemas = /* @__PURE__ */ new Map();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== "object" || typeof entry.file !== "string" || typeof entry.digest !== "string") throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    const schema = JSON.parse(await readFile(path2.join(schemaDirectory2, entry.file), "utf8"));
    if (digest(schema) !== entry.digest) throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    assertSupportedSchema(schema);
    schemas.set(entry.file, schema);
  }
  return { compilerVersion: manifest.compiler_version, schemaVersion: manifest.schema_version, schemas };
}

// src/advance-strict.mjs
var moduleDirectory = path3.dirname(fileURLToPath(import.meta.url));
var schemaDirectory = path3.resolve(
  moduleDirectory,
  true ? "schemas" : "../skill/generate-test-cases/scripts/schemas"
);
var embeddedManifestDigest = true ? "75c7363283064eb598d474e7329d4da01dcb5b7d429cdea44ec4b6d9b2190891" : void 0;
var embeddedSchemaVersion = true ? "1.0.0" : void 0;
var embeddedCompilerVersion = true ? "0.1.0" : void 0;
var STAGE_SCHEMA = Object.freeze({
  source_pack: "source-pack.schema.json",
  evidence_claims: "evidence-claims.schema.json",
  behavior_views: "behavior-views.schema.json",
  case_drafts: "case-drafts.schema.json"
});
var NATIVE_ARRAY3 = Array;
var NATIVE_MAP3 = Map;
var NATIVE_MAP_GET2 = Map.prototype.get;
var NATIVE_MAP_SET3 = Map.prototype.set;
var NATIVE_MAP_DELETE2 = Map.prototype.delete;
var NATIVE_PROMISE2 = Promise;
var NATIVE_REFLECT_APPLY4 = Reflect.apply;
var NATIVE_ARRAY_IS_ARRAY6 = Array.isArray;
var NATIVE_PATH_IS_ABSOLUTE2 = path3.isAbsolute;
var NATIVE_PATH_RESOLVE2 = path3.resolve;
var ACTIVE_RUNS = new NATIVE_MAP3();
var CoreIntrinsicMutationError = class extends Error {
};
async function guardedAwait(promise) {
  try {
    return await promise;
  } finally {
    if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
  }
}
var loadedRegistry = await (async () => {
  try {
    const registry = await loadSchemaRegistry(
      schemaDirectory,
      embeddedManifestDigest,
      embeddedCompilerVersion
    );
    return embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion ? null : registry;
  } catch {
    return null;
  }
})();
function mapGet2(map, key) {
  return NATIVE_REFLECT_APPLY4(NATIVE_MAP_GET2, map, [key]);
}
function mapSet2(map, key, value) {
  NATIVE_REFLECT_APPLY4(NATIVE_MAP_SET3, map, [key, value]);
}
function mapDelete2(map, key) {
  NATIVE_REFLECT_APPLY4(NATIVE_MAP_DELETE2, map, [key]);
}
function arrayIsArray(value) {
  return NATIVE_REFLECT_APPLY4(NATIVE_ARRAY_IS_ARRAY6, NATIVE_ARRAY3, [value]);
}
function pathIsAbsolute2(value) {
  return NATIVE_REFLECT_APPLY4(NATIVE_PATH_IS_ABSOLUTE2, path3, [value]);
}
function pathResolve2(value) {
  return NATIVE_REFLECT_APPLY4(NATIVE_PATH_RESOLVE2, path3, [value]);
}
function artifactRequest(sourceRevision, stage) {
  return {
    status: "need_artifact",
    stage,
    schema_ref: STAGE_SCHEMA[stage],
    scope: { source_revision: sourceRevision },
    diagnostics: []
  };
}
function fatalReply(code2, message) {
  return {
    status: "fatal",
    diagnostics: [{ category: "reference", code: code2, message }]
  };
}
function newRunRequired(message) {
  return {
    status: "fatal",
    diagnostics: [
      { category: "reference", code: "RUN_INTEGRITY_ERROR", message },
      {
        category: "traceability",
        code: "NEW_RUN_REQUIRED",
        message: "Original sources or task scope changed; create a new run."
      }
    ]
  };
}
function errorMessage(error) {
  return error instanceof Error ? error.message : "Run directory is unavailable.";
}
function stableDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  const output = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const item = diagnostics[index];
    const normalized = {
      category: String(item.category ?? "schema"),
      code: String(item.code ?? "ARTIFACT_INVALID"),
      ...typeof item.path === "string" ? { path: item.path } : {},
      message: String(item.message ?? "artifact failed deterministic validation")
    };
    const key = canonicalStringify(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
  }
  output.sort((left, right) => canonicalStringify(left) < canonicalStringify(right) ? -1 : canonicalStringify(left) > canonicalStringify(right) ? 1 : 0);
  return output;
}
function revisionReply(runDirectory, stage, sourceRevision, artifact, diagnostics) {
  return {
    status: "need_revision",
    stage,
    schema_ref: STAGE_SCHEMA[stage],
    source_revision: sourceRevision,
    artifact_path: stagingPath(runDirectory, stage),
    artifact_digest: digest(artifact),
    diagnostics: stableDiagnostics(diagnostics)
  };
}
function artifactDiagnostics(artifact, schema) {
  return stableDiagnostics([
    ...validateAgainstSchema(artifact, schema),
    ...validateUniqueStableIds(artifact)
  ]);
}
async function stagedArtifact(runDirectory, stage, sourceRevision) {
  const candidatePath2 = stagingPath(runDirectory, stage);
  const text = await guardedAwait(readTextIfPresent(runDirectory, candidatePath2));
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return { text, value, digest: digest(value), parseDiagnostics: [] };
  } catch {
    return {
      text,
      value: text,
      digest: digest(text),
      parseDiagnostics: [{
        category: "schema",
        code: "ARTIFACT_JSON_INVALID",
        path: "/",
        message: `${stage} staging artifact is not valid JSON for source revision ${sourceRevision}`
      }]
    };
  }
}
function maximumEventSequence(sourcePack) {
  let maximum = 0;
  for (const field of ["decision_records", "clarification_events"]) {
    const values = arrayIsArray(sourcePack[field]) ? sourcePack[field] : [];
    for (let index = 0; index < values.length; index += 1) {
      const sequence = values[index]?.clarification_event_seq;
      if (Number.isSafeInteger(sequence) && sequence > maximum) maximum = sequence;
    }
  }
  return maximum;
}
function isExactPrefix(prior, next) {
  if (next.length < prior.length) return false;
  for (let index = 0; index < prior.length; index += 1) {
    if (canonicalStringify(prior[index]) !== canonicalStringify(next[index])) return false;
  }
  return true;
}
function historySequenceIntegrity(sourcePack) {
  const sequences = [];
  for (const [field, identityField] of [
    ["decision_records", "decision_id"],
    ["clarification_events", "event_id"]
  ]) {
    const values = arrayIsArray(sourcePack[field]) ? sourcePack[field] : [];
    const identities = /* @__PURE__ */ new Set();
    let previous = 0;
    for (let index = 0; index < values.length; index += 1) {
      const sequence = values[index]?.clarification_event_seq;
      if (!Number.isSafeInteger(sequence) || sequence <= previous) return fatalReply(
        "RUN_INTEGRITY_ERROR",
        "Decision and control histories must preserve increasing event order."
      );
      previous = sequence;
      sequences.push(sequence);
      const identity = values[index]?.[identityField];
      if (typeof identity === "string" && identities.has(identity)) return fatalReply(
        "RUN_INTEGRITY_ERROR",
        "Decision and control histories cannot reuse event identities."
      );
      if (typeof identity === "string") identities.add(identity);
    }
  }
  sequences.sort((left, right) => left - right);
  for (let index = 0; index < sequences.length; index += 1) {
    if (sequences[index] !== index + 1) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Combined Decision and control history must start at one without gaps or reused sequences."
    );
  }
  return null;
}
function initialClarificationHistoryDiagnostics(sourcePack) {
  const diagnostics = [];
  const events = arrayIsArray(sourcePack.clarification_events) ? sourcePack.clarification_events : [];
  if (events.length > 0) diagnostics.push({
    category: "classification",
    code: "INITIAL_CLARIFICATION_HISTORY_UNSUPPORTED",
    path: "/clarification_events",
    message: "An initial run has no prior clarification lifecycle on which to apply control events."
  });
  const decisions = arrayIsArray(sourcePack.decision_records) ? sourcePack.decision_records : [];
  for (let index = 0; index < decisions.length; index += 1) {
    if (decisions[index]?.disposition === "unknown" || decisions[index]?.disposition === "deferred") diagnostics.push({
      category: "classification",
      code: "INITIAL_DECISION_DISPOSITION_UNSUPPORTED",
      path: `/decision_records/${index}/disposition`,
      message: "Initial unknown or deferred Decisions require a prior clarification lifecycle."
    });
  }
  return diagnostics;
}
function sourceRevisionIntegrity(prior, next) {
  const immutablePrior = {
    run_scope: prior.run_scope,
    sources: prior.sources,
    locators: prior.locators,
    source_policy: prior.source_policy
  };
  const immutableNext = {
    run_scope: next.run_scope,
    sources: next.sources,
    locators: next.locators,
    source_policy: next.source_policy
  };
  if (canonicalStringify(immutablePrior) !== canonicalStringify(immutableNext)) {
    return newRunRequired("RUN_INTEGRITY_ERROR: immutable original source set or run scope changed.");
  }
  const priorDecisions = arrayIsArray(prior.decision_records) ? prior.decision_records : [];
  const nextDecisions = arrayIsArray(next.decision_records) ? next.decision_records : [];
  const priorEvents = arrayIsArray(prior.clarification_events) ? prior.clarification_events : [];
  const nextEvents = arrayIsArray(next.clarification_events) ? next.clarification_events : [];
  if (!isExactPrefix(priorDecisions, nextDecisions) || !isExactPrefix(priorEvents, nextEvents)) {
    return fatalReply("RUN_INTEGRITY_ERROR", "Decision and clarification histories are append-only and order-preserving.");
  }
  const historyIntegrity = historySequenceIntegrity(next);
  if (historyIntegrity) return historyIntegrity;
  const added = [
    ...nextDecisions.slice(priorDecisions.length),
    ...nextEvents.slice(priorEvents.length)
  ];
  if (added.length === 0) return fatalReply(
    "RUN_INTEGRITY_ERROR",
    "A higher source revision must contain one nonempty append batch."
  );
  const priorMaximum = maximumEventSequence(prior);
  const sequences = added.map((item) => item?.clarification_event_seq);
  const unique = new Set(sequences);
  if (unique.size !== sequences.length || sequences.some((item) => !Number.isSafeInteger(item) || item <= priorMaximum)) return fatalReply(
    "RUN_INTEGRITY_ERROR",
    "Appended clarification_event_seq values must be unique and greater than prior history."
  );
  const ordered = [...sequences].sort((left, right) => left - right);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Appended clarification_event_seq values must form one monotonic batch."
    );
  }
  return null;
}
function inferredCompilation(behaviorViews) {
  const contexts = {};
  const views = arrayIsArray(behaviorViews.views) ? behaviorViews.views : [];
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const view = views[viewIndex];
    if (!view || typeof view !== "object" || typeof view.view_id !== "string") continue;
    if (["input-domain", "role", "timing", "integration"].includes(String(view.type))) {
      contexts[view.view_id] = { responsibilityBindings: [] };
      continue;
    }
    const riskByElementId = {};
    const requiredOracleRefsByElementId = {};
    const requiredCapabilitiesByElementId = {};
    const elements = arrayIsArray(view.elements) ? view.elements : [];
    for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
      const element = elements[elementIndex];
      if (!element || typeof element !== "object" || typeof element.element_id !== "string") continue;
      riskByElementId[element.element_id] = "medium";
      requiredOracleRefsByElementId[element.element_id] = arrayIsArray(element.source_claim_ids) ? [...element.source_claim_ids] : [];
      requiredCapabilitiesByElementId[element.element_id] = [];
    }
    contexts[view.view_id] = {
      riskByElementId,
      requiredOracleRefsByElementId,
      requiredCapabilitiesByElementId
    };
  }
  return {
    contexts_by_view_id: contexts,
    custom_obligations: [],
    fact_routes: [],
    not_applicable_reviews: []
  };
}
function adapterEvidenceDiagnostics(evidenceClaims, claimsById) {
  const ledgerEntries = [];
  for (const value of arrayIsArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []) {
    if (!value || typeof value !== "object") continue;
    const entry = (
      /** @type {Record<string,unknown>} */
      value
    );
    ledgerEntries.push(entry);
  }
  return [...claimsById.entries()].filter(([, claim]) => claim.kind === "requirement" || claim.kind === "assumption").sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).flatMap(([claimId]) => {
    const owners = [];
    let diagnosticOwner = false;
    let primaryOwnsClaim = false;
    for (const entry of ledgerEntries) {
      const sourceClaimIds = arrayIsArray(entry.source_claim_ids) ? entry.source_claim_ids : [];
      let sourceOwnsClaim = false;
      for (let index = 0; index < sourceClaimIds.length; index += 1) {
        if (sourceClaimIds[index] === claimId) sourceOwnsClaim = true;
      }
      const primary = entry.claim_id === claimId;
      const groupedAlternative = sourceOwnsClaim && (entry.status === "conflicted" || entry.status === "ambiguous");
      if (!primary && !groupedAlternative) continue;
      if (entry.status === "diagnostic") diagnosticOwner = true;
      else {
        owners.push(entry);
        if (primary && sourceOwnsClaim) primaryOwnsClaim = true;
      }
    }
    if (owners.length === 0 && !diagnosticOwner) return [{
      category: "traceability",
      code: "NORMATIVE_CLAIM_UNLEDGERED",
      path: `/claims/${encodeURIComponent(claimId)}`,
      message: `accepted normative claim "${claimId}" requires its own Fact Ledger entry`
    }];
    const groupedOnly = owners.length === 1 && owners[0].claim_id !== claimId;
    if (owners.length !== 1 || diagnosticOwner || !primaryOwnsClaim && !groupedOnly) return [{
      category: "traceability",
      code: "NORMATIVE_CLAIM_LEDGER_INVALID",
      path: `/claims/${encodeURIComponent(claimId)}`,
      message: `accepted normative claim "${claimId}" requires exactly one non-diagnostic Fact Ledger owner, either primary or a conflicted/ambiguous alternative`
    }];
    return [];
  });
}
function publicResponsibilityContextDiagnostics(behaviorViews) {
  const responsibilityTypes = /* @__PURE__ */ new Set(["input-domain", "role", "timing", "integration"]);
  return (arrayIsArray(behaviorViews.views) ? behaviorViews.views : []).filter((view) => view && typeof view === "object" && typeof view.view_id === "string" && responsibilityTypes.has(String(view.type))).sort((left, right) => String(left.view_id) < String(right.view_id) ? -1 : String(left.view_id) > String(right.view_id) ? 1 : 0).map((view) => ({
    category: "classification",
    code: "OBLIGATION_CONTEXT_NOT_CLOSED",
    path: `/views/${encodeURIComponent(String(view.view_id))}`,
    message: `view "${String(view.view_id)}" requires responsibility-specific evidence, Oracle, risk, and capability bindings that the frozen public artifact does not provide`
  }));
}
function deriveObligations(sourcePack, evidenceClaims, behaviorViews, sourceRevision) {
  const policy = resolveSourcePolicy(sourcePack);
  if (policy.diagnostics.length > 0) return { diagnostics: policy.diagnostics, artifact: null };
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  if (evidence.diagnostics.length > 0) return { diagnostics: evidence.diagnostics, artifact: null };
  const evidenceDiagnostics = adapterEvidenceDiagnostics(evidenceClaims, evidence.claimsById);
  if (evidenceDiagnostics.length > 0) return { diagnostics: evidenceDiagnostics, artifact: null };
  const responsibilityDiagnostics = publicResponsibilityContextDiagnostics(behaviorViews);
  if (responsibilityDiagnostics.length > 0) return {
    diagnostics: responsibilityDiagnostics,
    artifact: null
  };
  const compilation = inferredCompilation(behaviorViews);
  const graph = {
    claimsById: evidence.claimsById,
    factLedger: structuredClone(arrayIsArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []),
    conflicts: structuredClone(arrayIsArray(policy.conflicts) ? policy.conflicts : []),
    runScope: String(sourcePack.run_scope),
    obligationCompilation: {
      sourceRevision,
      contextsByViewId: new Map(Object.entries(compilation.contexts_by_view_id)),
      factRoutes: [],
      notApplicableReviews: [],
      customObligations: []
    }
  };
  try {
    return { diagnostics: [], artifact: compileObligations(graph, behaviorViews), compilation };
  } catch (error) {
    if (error instanceof ObligationCompilationError) return {
      diagnostics: error.diagnostics,
      artifact: null,
      compilation
    };
    throw error;
  }
}
function initialClarificationState(sourceRevision, eventSequence) {
  return {
    source_revision: sourceRevision,
    clarification_event_seq: eventSequence,
    asked_root_issue_ids: [],
    root_issue_dispositions: [],
    last_pending_root_issue_ids: [],
    last_question_set_digest: "",
    clarification_stop: null,
    semantic_snapshot: null,
    root_snapshot_ledger: []
  };
}
function appendBatch(previous, current) {
  const previousDecisions = arrayIsArray(previous.decision_records) ? previous.decision_records : [];
  const previousEvents = arrayIsArray(previous.clarification_events) ? previous.clarification_events : [];
  const decisions = arrayIsArray(current.decision_records) ? current.decision_records : [];
  const events = arrayIsArray(current.clarification_events) ? current.clarification_events : [];
  return {
    decision_records: structuredClone(decisions.slice(previousDecisions.length)),
    clarification_events: structuredClone(events.slice(previousEvents.length))
  };
}
async function clarificationInput(runDirectory, sourceRevision, sourcePack) {
  const sameRevision = await guardedAwait(readJsonIfPresent(
    runDirectory,
    clarificationStatePath(runDirectory, sourceRevision)
  ));
  if (sameRevision) return {
    prior_state: sameRevision.value,
    append_batch: { decision_records: [], clarification_events: [] }
  };
  if (sourceRevision === 0) return {
    prior_state: initialClarificationState(0, maximumEventSequence(sourcePack)),
    append_batch: { decision_records: [], clarification_events: [] }
  };
  const previousSource = await guardedAwait(readJsonIfPresent(runDirectory, acceptedPath(
    runDirectory,
    sourceRevision - 1,
    "source_pack"
  )));
  const previousState = await guardedAwait(readJsonIfPresent(runDirectory, clarificationStatePath(
    runDirectory,
    sourceRevision - 1
  )));
  return {
    prior_state: previousState?.value ?? initialClarificationState(sourceRevision - 1, previousSource ? maximumEventSequence(
      /** @type {Record<string, unknown>} */
      previousSource.value
    ) : 0),
    append_batch: previousSource ? appendBatch(
      /** @type {Record<string, unknown>} */
      previousSource.value,
      sourcePack
    ) : { decision_records: [], clarification_events: [] }
  };
}
function checkpoint(sourceRevision, stage, sourcePack, state, acceptedDigests2) {
  return {
    input_digest: digest({ source_revision: sourceRevision, accepted_artifact_digests: acceptedDigests2 }),
    source_revision: sourceRevision,
    stage,
    compiler_version: embeddedCompilerVersion ?? "0.1.0",
    schema_version: embeddedSchemaVersion ?? "1.0.0",
    accepted_artifact_digests: acceptedDigests2,
    clarification_event_seq: state && Number.isSafeInteger(state.clarification_event_seq) ? state.clarification_event_seq : maximumEventSequence(sourcePack),
    asked_root_issue_ids: state && arrayIsArray(state.asked_root_issue_ids) ? state.asked_root_issue_ids : [],
    root_issue_dispositions: state && arrayIsArray(state.root_issue_dispositions) ? state.root_issue_dispositions.map((item) => ({
      root_issue_id: item.root_issue_id,
      status: item.status
    })) : [],
    last_question_set_digest: state && typeof state.last_question_set_digest === "string" ? state.last_question_set_digest : "",
    clarification_stop: state?.clarification_stop ?? null
  };
}
async function acceptedDigests(runDirectory, sourceRevision) {
  const values = {};
  for (const stage of Object.keys(STAGE_FILES)) {
    const accepted = await guardedAwait(readJsonIfPresent(runDirectory, acceptedPath(
      runDirectory,
      sourceRevision,
      /** @type {keyof typeof STAGE_FILES} */
      stage
    )));
    if (accepted) values[stage] = accepted.digest;
  }
  const obligations = await guardedAwait(readJsonIfPresent(
    runDirectory,
    obligationsPath(runDirectory, sourceRevision)
  ));
  if (obligations) values.test_obligations = obligations.digest;
  return values;
}
function externalStage(stage) {
  if (stage === "source_policy") return "source_pack";
  if (stage === "evidence_claims") return "evidence_claims";
  if (stage === "behavior_views" || stage === "test_obligations") return "behavior_views";
  return "case_drafts";
}
async function acceptedRunIntegrity(runDirectory, revisions, registry) {
  if (revisions.length === 0) return null;
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index] !== index) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Accepted source revisions must start at r000 and remain consecutive."
    );
  }
  let previousSource = null;
  for (let revisionIndex = 0; revisionIndex < revisions.length; revisionIndex += 1) {
    const sourceRevision = revisions[revisionIndex];
    const sourceArtifact = await guardedAwait(readJson(
      runDirectory,
      acceptedPath(runDirectory, sourceRevision, "source_pack")
    ));
    const sourcePack = (
      /** @type {Record<string, unknown>} */
      sourceArtifact.value
    );
    if (sourcePack.source_revision !== sourceRevision) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Accepted Source Pack revision does not match its revision directory."
    );
    const transition = previousSource ? sourceRevisionIntegrity(previousSource, sourcePack) : historySequenceIntegrity(sourcePack);
    if (transition) return transition;
    const sourceDiagnostics = artifactDiagnostics(
      sourcePack,
      registry.schemas.get(STAGE_SCHEMA.source_pack)
    );
    if (sourceDiagnostics.length > 0) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Accepted Source Pack failed deterministic schema validation."
    );
    if (sourceRevision === 0 && initialClarificationHistoryDiagnostics(sourcePack).length > 0) {
      return fatalReply(
        "RUN_INTEGRITY_ERROR",
        "Accepted initial clarification controls have no prior lifecycle and cannot be replayed."
      );
    }
    if (resolveSourcePolicy(sourcePack).diagnostics.length > 0) return fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Accepted Source Pack failed deterministic policy validation."
    );
    let evidenceClaims = null;
    let behaviorViews = null;
    let caseDrafts = null;
    let compilation = null;
    let missingEarlierStage = false;
    for (const stage of ["evidence_claims", "behavior_views", "case_drafts"]) {
      const typedStage = (
        /** @type {'evidence_claims'|'behavior_views'|'case_drafts'} */
        stage
      );
      const artifact = await guardedAwait(readJsonIfPresent(
        runDirectory,
        acceptedPath(runDirectory, sourceRevision, typedStage)
      ));
      if (!artifact) {
        missingEarlierStage = true;
        continue;
      }
      if (missingEarlierStage) return fatalReply(
        "RUN_INTEGRITY_ERROR",
        "Accepted artifacts must preserve the fixed stage prefix."
      );
      const record2 = (
        /** @type {Record<string, unknown>} */
        artifact.value
      );
      if (record2.source_revision !== sourceRevision) return fatalReply(
        "RUN_INTEGRITY_ERROR",
        `Accepted ${typedStage} revision does not match its directory.`
      );
      if (artifactDiagnostics(record2, registry.schemas.get(STAGE_SCHEMA[typedStage])).length > 0) {
        return fatalReply(
          "RUN_INTEGRITY_ERROR",
          `Accepted ${typedStage} failed deterministic schema validation.`
        );
      }
      if (typedStage === "evidence_claims") {
        evidenceClaims = record2;
        const acceptedEvidence = validateEvidenceGraph(sourcePack, evidenceClaims);
        if (acceptedEvidence.diagnostics.length > 0 || adapterEvidenceDiagnostics(evidenceClaims, acceptedEvidence.claimsById).length > 0) return fatalReply(
          "RUN_INTEGRITY_ERROR",
          "Accepted evidence_claims failed deterministic semantic validation."
        );
      } else if (typedStage === "behavior_views") {
        behaviorViews = record2;
        const derived = deriveObligations(
          sourcePack,
          /** @type {Record<string, unknown>} */
          evidenceClaims,
          behaviorViews,
          sourceRevision
        );
        if (derived.diagnostics.length > 0 || !derived.artifact) return fatalReply(
          "RUN_INTEGRITY_ERROR",
          "Accepted behavior_views failed deterministic semantic validation."
        );
        compilation = /** @type {Record<string, unknown>} */
        derived.compilation;
      } else caseDrafts = record2;
    }
    if (caseDrafts) {
      const clarification = await guardedAwait(
        clarificationInput(runDirectory, sourceRevision, sourcePack)
      );
      const replay = (
        /** @type {any} */
        evaluateRevision({
          schema_version: "1.0.0",
          source_revision: sourceRevision,
          compiler_version: registry.compilerVersion,
          lineage: {
            source_digest: digest(sourcePack),
            case_draft_digest: digest(caseDrafts)
          },
          source_pack: sourcePack,
          evidence_claims: evidenceClaims,
          behavior_views: behaviorViews,
          obligation_compilation: compilation,
          case_drafts: caseDrafts,
          clarification,
          limits: ["Compilation is limited to the accepted immutable revision."],
          expert_recall_limits: ["Expert recall is benchmark-only."]
        }, { interactionPolicy: "pause_for_clarification" })
      );
      if (replay.status === "need_revision") return fatalReply(
        "RUN_INTEGRITY_ERROR",
        "Accepted complete revision failed deterministic semantic replay."
      );
    }
    previousSource = sourcePack;
  }
  return null;
}
async function advanceStrictExclusive(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return fatalReply(
    "CORE_INTRINSIC_INVALID",
    "Run-store evaluation requires captured native collection traversal intrinsics."
  );
  const registry = loadedRegistry;
  if (!registry) {
    return fatalReply(
      "SCHEMA_INTEGRITY_MISMATCH",
      "Bundled schemas or schema manifest failed integrity verification."
    );
  }
  try {
    if (typeof runDirectory !== "string" || !pathIsAbsolute2(runDirectory)) return fatalReply(
      "run_directory_absolute",
      "Run directory must be an absolute path."
    );
    runDirectory = await guardedAwait(prepareRunStore(runDirectory));
    const releaseRunLock = await acquireRunLock(runDirectory);
    const baseGuardedAwait = guardedAwait;
    {
      const guardedAwait2 = async (operation) => {
        return releaseRunLock.guardedAwait(() => baseGuardedAwait(operation()));
      };
      try {
        if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
        runDirectory = await guardedAwait2(() => prepareRunStore(runDirectory));
        await guardedAwait2(() => recoverStagingClaims(runDirectory));
        await guardedAwait2(() => cleanupTemporaryFiles(runDirectory));
        let revisions = await guardedAwait2(() => acceptedSourceRevisions(runDirectory));
        const acceptedIntegrity = await guardedAwait2(
          () => acceptedRunIntegrity(runDirectory, revisions, registry)
        );
        if (acceptedIntegrity) return acceptedIntegrity;
        let sourceCandidate = await guardedAwait2(() => stagedArtifact(
          runDirectory,
          "source_pack",
          revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1
        ));
        if (sourceCandidate) {
          const candidateRecord = sourceCandidate.value && typeof sourceCandidate.value === "object" ? (
            /** @type {Record<string, unknown>} */
            sourceCandidate.value
          ) : null;
          const candidateRevision = candidateRecord && Number.isSafeInteger(candidateRecord.source_revision) ? (
            /** @type {number} */
            candidateRecord.source_revision
          ) : revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
          if (candidateRecord && revisions.length > 0 && candidateRevision === revisions[revisions.length - 1]) {
            const acceptedSource = await guardedAwait2(() => readJson(
              runDirectory,
              acceptedPath(runDirectory, candidateRevision, "source_pack")
            ));
            if (acceptedSource.digest !== sourceCandidate.digest) return fatalReply(
              "RUN_INTEGRITY_ERROR",
              "Staging Source Pack conflicts with the immutable accepted revision."
            );
            await guardedAwait2(() => discardStagingSnapshot(
              runDirectory,
              "source_pack",
              /** @type {{text:string}} */
              sourceCandidate
            ));
            sourceCandidate = null;
          }
        }
        if (sourceCandidate) {
          const candidateRecord = sourceCandidate.value && typeof sourceCandidate.value === "object" ? (
            /** @type {Record<string, unknown>} */
            sourceCandidate.value
          ) : null;
          const candidateRevision = candidateRecord && Number.isSafeInteger(candidateRecord.source_revision) ? (
            /** @type {number} */
            candidateRecord.source_revision
          ) : revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
          const expectedRevision = revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
          if (candidateRevision !== expectedRevision) return fatalReply(
            "RUN_INTEGRITY_ERROR",
            "Source revisions must begin at r000 and advance by exactly one."
          );
          const diagnostics = sourceCandidate.parseDiagnostics.length > 0 ? sourceCandidate.parseDiagnostics : stableDiagnostics(validateAgainstSchema(
            sourceCandidate.value,
            registry.schemas.get(STAGE_SCHEMA.source_pack)
          ));
          if (diagnostics.length > 0) return revisionReply(
            runDirectory,
            "source_pack",
            candidateRevision,
            sourceCandidate.value,
            diagnostics
          );
          if (candidateRecord) {
            const transition = revisions.length === 0 ? historySequenceIntegrity(candidateRecord) : sourceRevisionIntegrity(
              /** @type {Record<string, unknown>} */
              (await guardedAwait2(() => readJson(
                runDirectory,
                acceptedPath(
                  runDirectory,
                  revisions[revisions.length - 1],
                  "source_pack"
                )
              ))).value,
              candidateRecord
            );
            if (transition) return transition;
          }
          const identityDiagnostics = stableDiagnostics(
            validateUniqueStableIds(sourceCandidate.value)
          );
          if (identityDiagnostics.length > 0) return revisionReply(
            runDirectory,
            "source_pack",
            candidateRevision,
            sourceCandidate.value,
            identityDiagnostics
          );
          const initialControlDiagnostics = candidateRevision === 0 && candidateRecord ? initialClarificationHistoryDiagnostics(candidateRecord) : [];
          if (initialControlDiagnostics.length > 0) return revisionReply(
            runDirectory,
            "source_pack",
            candidateRevision,
            sourceCandidate.value,
            initialControlDiagnostics
          );
          const sourcePolicy = resolveSourcePolicy(
            /** @type {Record<string, unknown>} */
            sourceCandidate.value
          );
          if (sourcePolicy.diagnostics.length > 0) return revisionReply(
            runDirectory,
            "source_pack",
            candidateRevision,
            sourceCandidate.value,
            sourcePolicy.diagnostics
          );
          await guardedAwait2(() => promoteArtifact(
            runDirectory,
            candidateRevision,
            "source_pack",
            sourceCandidate.value,
            sourceCandidate
          ));
          const sourceDigests = await guardedAwait2(() => acceptedDigests(runDirectory, candidateRevision));
          await guardedAwait2(() => writeCheckpoint(runDirectory, checkpoint(
            candidateRevision,
            "source_pack",
            /** @type {Record<string, unknown>} */
            sourceCandidate.value,
            null,
            sourceDigests
          )));
          revisions = await guardedAwait2(() => acceptedSourceRevisions(runDirectory));
        }
        if (revisions.length === 0) return artifactRequest(0, "source_pack");
        const sourceRevision = revisions[revisions.length - 1];
        const sourceAccepted = await guardedAwait2(() => readJson(
          runDirectory,
          acceptedPath(runDirectory, sourceRevision, "source_pack")
        ));
        const sourcePack = (
          /** @type {Record<string, unknown>} */
          sourceAccepted.value
        );
        const acceptedSourceDiagnostics = artifactDiagnostics(
          sourcePack,
          registry.schemas.get(STAGE_SCHEMA.source_pack)
        );
        const acceptedSourcePolicy = resolveSourcePolicy(sourcePack);
        if (acceptedSourceDiagnostics.length > 0 || acceptedSourcePolicy.diagnostics.length > 0) return fatalReply(
          "RUN_INTEGRITY_ERROR",
          "Accepted Source Pack failed deterministic integrity validation."
        );
        const accepted = { source_pack: sourcePack };
        for (const stage of ["evidence_claims", "behavior_views"]) {
          const typedStage = (
            /** @type {'evidence_claims'|'behavior_views'} */
            stage
          );
          let artifact = await guardedAwait2(() => readJsonIfPresent(
            runDirectory,
            acceptedPath(runDirectory, sourceRevision, typedStage)
          ));
          let candidate = await guardedAwait2(() => stagedArtifact(
            runDirectory,
            typedStage,
            sourceRevision
          ));
          if (artifact && candidate) {
            if (candidate.parseDiagnostics.length > 0 || artifact.digest !== candidate.digest) {
              return fatalReply(
                "RUN_INTEGRITY_ERROR",
                `Staging ${typedStage} conflicts with the immutable accepted artifact.`
              );
            }
            await guardedAwait2(() => discardStagingSnapshot(
              runDirectory,
              typedStage,
              /** @type {{text:string}} */
              candidate
            ));
            candidate = null;
          }
          if (!artifact) {
            if (!candidate) return artifactRequest(sourceRevision, typedStage);
            const diagnostics2 = candidate.parseDiagnostics.length > 0 ? candidate.parseDiagnostics : artifactDiagnostics(candidate.value, registry.schemas.get(STAGE_SCHEMA[typedStage]));
            if (diagnostics2.length > 0) return revisionReply(
              runDirectory,
              typedStage,
              sourceRevision,
              candidate.value,
              diagnostics2
            );
            const candidateRecord = (
              /** @type {Record<string, unknown>} */
              candidate.value
            );
            if (candidateRecord.source_revision !== sourceRevision) return revisionReply(
              runDirectory,
              typedStage,
              sourceRevision,
              candidate.value,
              [{
                category: "traceability",
                code: "SOURCE_REVISION_MISMATCH",
                path: "/source_revision",
                message: "The staged artifact must match the active accepted source revision."
              }]
            );
            if (typedStage === "evidence_claims") {
              const evidence = validateEvidenceGraph(sourcePack, candidateRecord);
              if (evidence.diagnostics.length > 0) return revisionReply(
                runDirectory,
                typedStage,
                sourceRevision,
                candidate.value,
                evidence.diagnostics
              );
              const adapterDiagnostics = adapterEvidenceDiagnostics(candidateRecord, evidence.claimsById);
              if (adapterDiagnostics.length > 0) return revisionReply(
                runDirectory,
                typedStage,
                sourceRevision,
                candidate.value,
                adapterDiagnostics
              );
            }
            let candidateObligations = null;
            if (typedStage === "behavior_views") {
              const derivedCandidate = deriveObligations(
                sourcePack,
                /** @type {Record<string, unknown>} */
                accepted.evidence_claims,
                candidateRecord,
                sourceRevision
              );
              if (derivedCandidate.diagnostics.length > 0 || !derivedCandidate.artifact) return revisionReply(
                runDirectory,
                typedStage,
                sourceRevision,
                candidate.value,
                derivedCandidate.diagnostics
              );
              candidateObligations = derivedCandidate.artifact;
            }
            await guardedAwait2(() => promoteArtifact(
              runDirectory,
              sourceRevision,
              typedStage,
              candidate.value,
              candidate
            ));
            if (candidateObligations) await guardedAwait2(() => atomicWriteJson(
              runDirectory,
              obligationsPath(runDirectory, sourceRevision),
              candidateObligations
            ));
            artifact = await guardedAwait2(() => readJson(
              runDirectory,
              acceptedPath(runDirectory, sourceRevision, typedStage)
            ));
            const digests2 = await guardedAwait2(() => acceptedDigests(runDirectory, sourceRevision));
            await guardedAwait2(() => writeCheckpoint(runDirectory, checkpoint(
              sourceRevision,
              typedStage,
              sourcePack,
              null,
              digests2
            )));
          }
          const diagnostics = artifactDiagnostics(
            artifact.value,
            registry.schemas.get(STAGE_SCHEMA[typedStage])
          );
          if (diagnostics.length > 0) return fatalReply(
            "RUN_INTEGRITY_ERROR",
            `Accepted ${typedStage} failed deterministic integrity validation.`
          );
          accepted[typedStage] = artifact.value;
        }
        const derived = deriveObligations(
          sourcePack,
          /** @type {Record<string, unknown>} */
          accepted.evidence_claims,
          /** @type {Record<string, unknown>} */
          accepted.behavior_views,
          sourceRevision
        );
        if (derived.diagnostics.length > 0 || !derived.artifact) return fatalReply(
          "RUN_INTEGRITY_ERROR",
          "Accepted evidence or behavior artifacts failed deterministic obligation derivation."
        );
        await guardedAwait2(() => atomicWriteJson(
          runDirectory,
          obligationsPath(runDirectory, sourceRevision),
          derived.artifact
        ));
        let caseArtifact = await guardedAwait2(() => readJsonIfPresent(
          runDirectory,
          acceptedPath(runDirectory, sourceRevision, "case_drafts")
        ));
        let caseCandidate = await guardedAwait2(() => stagedArtifact(
          runDirectory,
          "case_drafts",
          sourceRevision
        ));
        if (caseArtifact && caseCandidate) {
          if (caseCandidate.parseDiagnostics.length > 0 || caseArtifact.digest !== caseCandidate.digest) return fatalReply(
            "RUN_INTEGRITY_ERROR",
            "Staging case_drafts conflicts with the immutable accepted artifact."
          );
          await guardedAwait2(() => discardStagingSnapshot(
            runDirectory,
            "case_drafts",
            /** @type {{text:string}} */
            caseCandidate
          ));
          caseCandidate = null;
        }
        let caseFromStaging = false;
        if (!caseArtifact) {
          const candidate = caseCandidate;
          if (!candidate) return artifactRequest(sourceRevision, "case_drafts");
          const diagnostics = candidate.parseDiagnostics.length > 0 ? candidate.parseDiagnostics : artifactDiagnostics(candidate.value, registry.schemas.get(STAGE_SCHEMA.case_drafts));
          if (diagnostics.length > 0) return revisionReply(
            runDirectory,
            "case_drafts",
            sourceRevision,
            candidate.value,
            diagnostics
          );
          const candidateRecord = (
            /** @type {Record<string, unknown>} */
            candidate.value
          );
          if (candidateRecord.source_revision !== sourceRevision) return revisionReply(
            runDirectory,
            "case_drafts",
            sourceRevision,
            candidate.value,
            [{
              category: "traceability",
              code: "SOURCE_REVISION_MISMATCH",
              path: "/source_revision",
              message: "The staged artifact must match the active accepted source revision."
            }]
          );
          caseArtifact = candidate;
          caseFromStaging = true;
        }
        if (!caseFromStaging) {
          const acceptedCaseDiagnostics = artifactDiagnostics(
            caseArtifact.value,
            registry.schemas.get(STAGE_SCHEMA.case_drafts)
          );
          if (acceptedCaseDiagnostics.length > 0) return fatalReply(
            "RUN_INTEGRITY_ERROR",
            "Accepted case_drafts failed deterministic integrity validation."
          );
        }
        const compilation = derived.compilation ?? inferredCompilation(
          /** @type {Record<string, unknown>} */
          accepted.behavior_views
        );
        const clarification = await guardedAwait2(
          () => clarificationInput(runDirectory, sourceRevision, sourcePack)
        );
        const result = (
          /** @type {any} */
          evaluateRevision({
            schema_version: "1.0.0",
            source_revision: sourceRevision,
            compiler_version: registry.compilerVersion,
            lineage: {
              source_digest: digest(sourcePack),
              case_draft_digest: digest(caseArtifact.value)
            },
            source_pack: sourcePack,
            evidence_claims: accepted.evidence_claims,
            behavior_views: accepted.behavior_views,
            obligation_compilation: compilation,
            case_drafts: caseArtifact.value,
            clarification,
            limits: ["Compilation is limited to the accepted immutable revision."],
            expert_recall_limits: ["Expert recall is benchmark-only."]
          }, { interactionPolicy: "pause_for_clarification" })
        );
        if (result.status === "need_revision") {
          if (!caseFromStaging) return fatalReply(
            "RUN_INTEGRITY_ERROR",
            "Accepted complete revision no longer passes deterministic evaluation."
          );
          const stage = (
            /** @type {keyof typeof STAGE_SCHEMA} */
            externalStage(result.stage)
          );
          return revisionReply(
            runDirectory,
            stage,
            sourceRevision,
            caseArtifact.value,
            result.diagnostics
          );
        }
        if (caseFromStaging) await guardedAwait2(() => promoteArtifact(
          runDirectory,
          sourceRevision,
          "case_drafts",
          caseArtifact.value,
          caseArtifact
        ));
        const clarificationState = (
          /** @type {Record<string, unknown>} */
          result.clarification_state
        );
        await guardedAwait2(() => atomicWriteJson(
          runDirectory,
          clarificationStatePath(runDirectory, sourceRevision),
          clarificationState
        ));
        const digests = await guardedAwait2(() => acceptedDigests(runDirectory, sourceRevision));
        if (result.status === "need_user_answers") {
          await guardedAwait2(() => writeCheckpoint(runDirectory, checkpoint(
            sourceRevision,
            "verification",
            sourcePack,
            clarificationState,
            digests
          )));
          return {
            status: "need_user_answers",
            source_revision: sourceRevision,
            stage: "clarification",
            diagnostics: [],
            blockers: result.pending_root_issues.map((item) => ({
              root_issue_id: item.root_issue_id,
              root_issue_key: item.root_issue_key,
              missing_type: item.missing_type,
              scope: item.scope,
              affected_obligation_ids: item.affected_obligation_ids,
              risk_counts: item.risk_counts,
              source_revision: item.source_revision,
              question: item.question,
              batch_id: item.batch_id
            }))
          };
        }
        if (result.status !== "finished") return fatalReply(
          "RUN_INTEGRITY_ERROR",
          "Pure revision evaluator returned an unsupported workflow result."
        );
        const paths = await guardedAwait2(() => writeFinalOutput(
          runDirectory,
          sourceRevision,
          result.bundle,
          result.markdown
        ));
        digests.test_bundle = result.bundle_digest;
        await guardedAwait2(() => writeCheckpoint(runDirectory, checkpoint(
          sourceRevision,
          "finished",
          sourcePack,
          clarificationState,
          digests
        )));
        const current = {
          source_revision: sourceRevision,
          bundle_path: paths.bundle,
          bundle_digest: result.bundle_digest,
          markdown_path: paths.markdown
        };
        await guardedAwait2(() => atomicWriteJson(
          runDirectory,
          outputPaths(runDirectory, sourceRevision).current,
          current
        ));
        return { status: "finished", ...current };
      } finally {
        await baseGuardedAwait(releaseRunLock());
      }
    }
  } catch (error) {
    if (error instanceof CoreIntrinsicMutationError) return fatalReply(
      "CORE_INTRINSIC_INVALID",
      "Run-store evaluation requires captured native collection traversal intrinsics."
    );
    return fatalReply("RUN_INTEGRITY_ERROR", errorMessage(error));
  }
}
function advanceStrict(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return new NATIVE_PROMISE2((resolve) => resolve(fatalReply(
    "CORE_INTRINSIC_INVALID",
    "Run-store evaluation requires captured native collection traversal intrinsics."
  )));
  let key;
  try {
    key = typeof runDirectory === "string" ? pathResolve2(runDirectory) : "<invalid-run>";
  } catch {
    return new NATIVE_PROMISE2((resolve) => resolve(fatalReply(
      "RUN_INTEGRITY_ERROR",
      "Run directory could not be resolved at the outer run boundary."
    )));
  }
  const previous = mapGet2(ACTIVE_RUNS, key);
  let release = () => {
  };
  const turn = new NATIVE_PROMISE2((resolve) => {
    release = () => {
      resolve(void 0);
    };
  });
  mapSet2(ACTIVE_RUNS, key, turn);
  return (async () => {
    if (previous) await previous;
    else await new NATIVE_PROMISE2((resolve) => resolve(void 0));
    try {
      return await advanceStrictExclusive(runDirectory);
    } finally {
      release();
      if (mapGet2(ACTIVE_RUNS, key) === turn) mapDelete2(ACTIVE_RUNS, key);
    }
  })();
}

// src/entry.mjs
async function main() {
  try {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
    const compilerVersion = true ? "0.1.0" : "0.1.0";
    const reply = nodeMajor >= 20 ? compilerVersion.length > 0 ? await advanceStrict(process.argv[2] ?? "") : {
      status: "fatal",
      diagnostics: [{
        category: "reference",
        code: "compiler_version_missing",
        message: "The bundled compiler version is missing."
      }]
    } : {
      status: "fatal",
      diagnostics: [{
        category: "reference",
        code: "runtime_node20_required",
        message: "Node.js 20 or newer is required."
      }]
    };
    process.stdout.write(`${JSON.stringify(reply)}
`);
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : "private runner failed to form a JSON reply";
    process.stderr.write(`test-compiler process failure: ${message}
`);
  }
}
await main();
