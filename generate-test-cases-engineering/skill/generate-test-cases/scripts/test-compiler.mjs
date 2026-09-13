// src/entry.mjs
import { realpathSync } from "node:fs";
import path6 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// src/v5/runtime.mjs
import { createHash as createHash7 } from "node:crypto";
import { readFile as readFile3 } from "node:fs/promises";
import path5 from "node:path";

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
var ROOT_ISSUE_ASSOCIATIONS = /* @__PURE__ */ new Set(["case_ids", "case_id", "test_point_ids", "test_point_id", "obligation_ids", "obligation_id"]);
var EXECUTION_SIGNATURE_ASSOCIATIONS = /* @__PURE__ */ new Set(["obligation_ids", "obligation_id"]);
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
    const object9 = (
      /** @type {Record<string, unknown>} */
      value
    );
    const collectionPath = pathKey(path7);
    const idField = COLLECTION_ID_FIELDS.get(collectionPath);
    if (idField && typeof object9[idField] === "string") return `id:${object9[idField]}:${JSON.stringify(object9)}`;
    if (collectionPath === "/interaction_matrix") return `interaction:${JSON.stringify({ dimension: object9.dimension, module_ids: object9.module_ids })}:${JSON.stringify(object9)}`;
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
function stripForEntity(value, entity, path7 = []) {
  if (Array.isArray(value)) return mapArray(value, (item) => stripForEntity(item, entity, path7));
  if (!value || typeof value !== "object") return value;
  const rootAssociations = entity === "root" && path7.length === 0;
  const directExecutionAssociations = entity === "execution" && path7.length === 0;
  const caseExecutionAssociations = entity === "case" && path7.length === 1 && path7[0] === "execution_signature";
  const stableEntries = filterArray(Object.entries(value), ([key]) => !VOLATILE_FIELDS.has(key));
  const rootEntries = filterArray(stableEntries, ([key]) => !(rootAssociations && ROOT_ISSUE_ASSOCIATIONS.has(key)));
  const executionEntries = filterArray(rootEntries, ([key]) => !((directExecutionAssociations || caseExecutionAssociations) && EXECUTION_SIGNATURE_ASSOCIATIONS.has(key)));
  return Object.fromEntries(mapArray(
    executionEntries,
    ([key, item]) => [key, stripForEntity(item, entity, [...path7, key])]
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

// src/schema-validator.mjs
var supportedKeywords = /* @__PURE__ */ new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "type",
  "required",
  "properties",
  "items",
  "enum",
  "const",
  "oneOf",
  "allOf",
  "not",
  "minItems",
  "maxItems",
  "prefixItems",
  "minLength",
  "pattern",
  "minimum",
  "maximum",
  "uniqueItems",
  "additionalProperties",
  "unevaluatedProperties"
]);
var supportedTypes = /* @__PURE__ */ new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);
var NATIVE_ARRAY_EVERY = Array.prototype.every;
var NATIVE_ARRAY_FILTER2 = Array.prototype.filter;
var NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
var NATIVE_ARRAY_FOR_EACH = Array.prototype.forEach;
var NATIVE_ARRAY_JOIN2 = Array.prototype.join;
var NATIVE_ARRAY_MAP2 = Array.prototype.map;
var NATIVE_ARRAY_SLICE = Array.prototype.slice;
var NATIVE_ARRAY_SOME = Array.prototype.some;
var NATIVE_DEFINE_PROPERTY = Object.defineProperty;
var NATIVE_HAS_OWN = Object.hasOwn;
function everyArray(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_EVERY, values, [predicate])
  );
}
function filterArray2(values, predicate) {
  return (
    /** @type {T[]} */
    Reflect.apply(NATIVE_ARRAY_FILTER2, values, [predicate])
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
    Reflect.apply(NATIVE_ARRAY_MAP2, values, [project])
  );
}
function pushArray(values, ...items) {
  for (let index = 0; index < items.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY, Object, [
    values,
    String(values.length),
    { value: items[index], writable: true, enumerable: true, configurable: true }
  ]);
  return values.length;
}
function someArray(values, predicate) {
  return (
    /** @type {boolean} */
    Reflect.apply(NATIVE_ARRAY_SOME, values, [predicate])
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
function diagnostic(code, path7, message) {
  return { category: "schema", code, path: path7, message };
}
function escapePointerSegment(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
function childPointer(path7, segment) {
  return `${path7}/${escapePointerSegment(segment)}`;
}
function assertSupportedSchema(schema) {
  if (!isSchemaObject(schema)) {
    throw new Error("Schema must be an object.");
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!supportedKeywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (key === "$schema" || key === "$id" || key === "pattern" || key === "$ref") {
      if (typeof value !== "string") throw new Error(`Schema ${key} must be a string.`);
      if (key === "pattern") {
        try {
          new RegExp(value);
        } catch {
          throw new Error("Schema pattern must be a valid regular expression.");
        }
      }
      if (key === "$ref" && !value.startsWith("#/$defs/")) throw new Error("Schema $ref must be a local $defs reference.");
    } else if (key === "$defs") {
      if (!isSchemaObject(value)) throw new Error("Schema $defs must be an object.");
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === "type") {
      const types = Array.isArray(value) ? value : [value];
      if (!types.length || someArray(types, (item) => typeof item !== "string" || !supportedTypes.has(item)) || new Set(types).size !== types.length) throw new Error("Schema type must name supported unique types.");
    } else if (key === "required") {
      assertStringArray(value, "required");
    } else if (key === "properties") {
      if (!isSchemaObject(value)) throw new Error("Schema properties must be an object.");
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === "items") {
      if (typeof value !== "boolean") assertSupportedSchema(value);
    } else if (key === "not") {
      assertSupportedSchema(value);
    } else if (key === "oneOf" || key === "allOf" || key === "prefixItems") {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`Schema ${key} must be a non-empty array of schema objects.`);
      for (const child of value) assertSupportedSchema(child);
    } else if (key === "enum") {
      if (!Array.isArray(value) || value.length === 0 || new Set(mapArray2(value, (item) => canonicalStringify(item))).size !== value.length) throw new Error("Schema enum must be a non-empty array of unique values.");
    } else if (key === "minItems" || key === "maxItems" || key === "minLength") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Schema ${key} must be a non-negative integer.`);
    } else if (key === "minimum" || key === "maximum") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Schema ${key} must be a finite number.`);
    } else if (key === "uniqueItems") {
      if (typeof value !== "boolean") throw new Error("Schema uniqueItems must be boolean.");
    } else if (key === "additionalProperties" || key === "unevaluatedProperties") {
      if (typeof value !== "boolean" && !isSchemaObject(value)) throw new Error(`Schema ${key} must be boolean or a schema object.`);
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
    "",
    /** @type {Record<string, unknown>} */
    schema
  );
}
function resolveReference(root, reference) {
  const segments = mapArray2(
    reference.slice(2).split("/"),
    (part) => part.replaceAll("~1", "/").replaceAll("~0", "~")
  );
  let current = root;
  for (const segment of segments) {
    if (!isSchemaObject(current) || !NATIVE_HAS_OWN(current, segment)) throw new Error(`Schema reference does not exist: ${reference}`);
    current = current[segment];
  }
  if (!isSchemaObject(current)) throw new Error(`Schema reference is not an object: ${reference}`);
  return current;
}
function validate(value, schema, path7, root, parentEvaluatedProperties) {
  const diagnostics = [];
  const evaluatedProperties = /* @__PURE__ */ new Set();
  const pointer = path7 || "/";
  if (typeof schema.$ref === "string") pushArray(
    diagnostics,
    ...validate(value, resolveReference(root, schema.$ref), path7, root, evaluatedProperties)
  );
  if (schema.type && !matchesType(value, schema.type)) {
    return [diagnostic("TYPE_MISMATCH", pointer, `must be ${Array.isArray(schema.type) ? joinArray2(schema.type, " or ") : schema.type}`)];
  }
  if (NATIVE_HAS_OWN(schema, "const") && canonicalStringify(value) !== canonicalStringify(schema.const)) {
    pushArray(diagnostics, diagnostic("CONST_MISMATCH", pointer, "must equal the schema constant"));
  }
  if (Array.isArray(schema.enum) && !someArray(schema.enum, (item) => canonicalStringify(item) === canonicalStringify(value))) {
    pushArray(diagnostics, diagnostic("ENUM_MISMATCH", pointer, "must be one of the allowed values"));
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) pushArray(diagnostics, diagnostic("MIN_LENGTH", pointer, "is shorter than the minimum length"));
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) pushArray(diagnostics, diagnostic("PATTERN_MISMATCH", pointer, "does not match the required pattern"));
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) pushArray(diagnostics, diagnostic("MINIMUM", pointer, "is below the minimum"));
    if (typeof schema.maximum === "number" && value > schema.maximum) pushArray(diagnostics, diagnostic("MAXIMUM", pointer, "is above the maximum"));
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) pushArray(diagnostics, diagnostic("MIN_ITEMS", pointer, "has too few items"));
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) pushArray(diagnostics, diagnostic("MAX_ITEMS", pointer, "has too many items"));
    if (schema.uniqueItems === true) {
      const seen = /* @__PURE__ */ new Set();
      forEachArray(value, (item, index) => {
        const key = canonicalStringify(item);
        if (seen.has(key)) pushArray(diagnostics, diagnostic("UNIQUE_ITEMS", `${path7}/${index}`, "must not contain duplicate items"));
        seen.add(key);
      });
    }
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    forEachArray(value, (item, index) => {
      if (index < prefixItems.length) {
        pushArray(diagnostics, ...validate(
          item,
          /** @type {Record<string, unknown>} */
          prefixItems[index],
          `${path7}/${index}`,
          root
        ));
      } else if (schema.items === false) {
        pushArray(diagnostics, diagnostic("ADDITIONAL_ITEM", `${path7}/${index}`, "additional items are not allowed"));
      } else if (isSchemaObject(schema.items)) {
        pushArray(diagnostics, ...validate(item, schema.items, `${path7}/${index}`, root));
      }
    });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object9 = (
      /** @type {Record<string, unknown>} */
      value
    );
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? (
      /** @type {Record<string, Record<string, unknown>>} */
      schema.properties
    ) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !NATIVE_HAS_OWN(object9, key)) pushArray(diagnostics, diagnostic("REQUIRED_FIELD_MISSING", childPointer(path7, key), "required field is missing"));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object9)) {
        if (!NATIVE_HAS_OWN(properties, key)) pushArray(diagnostics, diagnostic("ADDITIONAL_PROPERTY", childPointer(path7, key), "additional properties are not allowed"));
      }
    } else if (schema.additionalProperties === true || isSchemaObject(schema.additionalProperties)) {
      for (const key of Object.keys(object9)) {
        if (!NATIVE_HAS_OWN(properties, key)) {
          evaluatedProperties.add(key);
          if (isSchemaObject(schema.additionalProperties)) pushArray(diagnostics, ...validate(object9[key], schema.additionalProperties, childPointer(path7, key), root));
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (NATIVE_HAS_OWN(object9, key)) {
        evaluatedProperties.add(key);
        pushArray(diagnostics, ...validate(object9[key], childSchema, childPointer(path7, key), root));
      }
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) pushArray(diagnostics, ...validate(
    value,
    /** @type {Record<string, unknown>} */
    child,
    path7,
    root,
    evaluatedProperties
  ));
  if (Array.isArray(schema.oneOf)) {
    const variants = mapArray2(schema.oneOf, (child) => {
      const variantSchema = (
        /** @type {Record<string, unknown>} */
        child
      );
      const variantEvaluatedProperties = /* @__PURE__ */ new Set();
      return {
        schema: variantSchema,
        diagnostics: validate(value, variantSchema, path7, root, variantEvaluatedProperties),
        evaluatedProperties: variantEvaluatedProperties
      };
    });
    const matching = filterArray2(variants, (child) => child.diagnostics.length === 0);
    if (matching.length === 1) {
      for (const key of matching[0].evaluatedProperties) evaluatedProperties.add(key);
    } else {
      const discriminated = filterArray2(variants, (child) => matchesDiscriminator(value, child.schema, root));
      if (matching.length === 0 && discriminated.length === 1) pushArray(diagnostics, ...discriminated[0].diagnostics);
      else pushArray(diagnostics, diagnostic("ONE_OF_MISMATCH", pointer, "must match exactly one schema variant"));
    }
  }
  if (isSchemaObject(schema.not) && validate(value, schema.not, path7, root).length === 0) {
    pushArray(diagnostics, diagnostic("NOT_MATCHED", pointer, "must not match the prohibited schema"));
  }
  if (isSchemaObject(value) && NATIVE_HAS_OWN(schema, "unevaluatedProperties")) {
    for (const key of Object.keys(value)) {
      if (evaluatedProperties.has(key)) continue;
      if (schema.unevaluatedProperties === false) {
        pushArray(diagnostics, diagnostic("UNEVALUATED_PROPERTY", childPointer(path7, key), "unevaluated properties are not allowed"));
      } else {
        evaluatedProperties.add(key);
        if (isSchemaObject(schema.unevaluatedProperties)) pushArray(diagnostics, ...validate(value[key], schema.unevaluatedProperties, childPointer(path7, key), root));
      }
    }
  }
  if (diagnostics.length === 0 && parentEvaluatedProperties) {
    for (const key of evaluatedProperties) parentEvaluatedProperties.add(key);
  }
  return diagnostics;
}
function matchesDiscriminator(value, schema, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof schema.$ref === "string") return matchesDiscriminator(
    value,
    resolveReference(root, schema.$ref),
    root
  );
  const properties = schema.properties;
  if (!isSchemaObject(properties)) return false;
  const constants = flatMapArray(Object.entries(properties), ([key, candidate]) => isSchemaObject(candidate) && NATIVE_HAS_OWN(candidate, "const") ? [[key, candidate]] : []);
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

// src/v5/action-tokens.mjs
import { createHash as createHash3, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// src/v5/errors.mjs
var V5ProtocolError = class extends Error {
  /** @param {string} code @param {string} message @param {string} [jsonPointer] */
  constructor(code, message, jsonPointer) {
    super(`${code}: ${message}`);
    this.name = "V5ProtocolError";
    this.code = code;
    this.integrity_target_kind = void 0;
    this.affected_refs = void 0;
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

// src/v5/interface-schemas.mjs
var V5_INTERFACE_SCHEMA_FILE_MAP = Object.freeze({
  createRequest: "v5-create-request",
  advanceRequest: "v5-advance-request",
  runIdentity: "v5-run-identity",
  reply: "v5-reply-oneof"
});
var DIGEST2 = "^sha256:[0-9a-f]{64}$";
var CLIENT_KEY = "^[A-Za-z][A-Za-z0-9._:-]{0,127}$";
var RUN_ID = "^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$";
function closedObject(properties, required = Object.keys(properties)) {
  return { type: "object", required, properties, additionalProperties: false };
}
function constant(value) {
  return { const: value };
}
function arrayOf(item, minimum = 0) {
  return { type: "array", minItems: minimum, items: item };
}
function nonblankString() {
  return { type: "string", minLength: 1 };
}
function digestString() {
  return { type: "string", pattern: DIGEST2 };
}
function clientKeyString() {
  return { type: "string", pattern: CLIENT_KEY };
}
function integer() {
  return { type: "integer" };
}
function nonnegativeInteger() {
  return { type: "integer", minimum: 0 };
}
function positiveInteger() {
  return { type: "integer", minimum: 1 };
}
function stringArray(minimum = 0) {
  return arrayOf(nonblankString(), minimum);
}
function digestArray(minimum = 0) {
  return arrayOf(digestString(), minimum);
}
function exactValueSchema(value) {
  if (Array.isArray(value)) return {
    type: "array",
    minItems: value.length,
    maxItems: value.length,
    prefixItems: value.map(exactValueSchema),
    items: false
  };
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return closedObject(Object.fromEntries(entries.map(([key, child]) => [key, exactValueSchema(child)])), entries.map(([key]) => key));
  }
  return constant(value);
}
function typedValueSchema() {
  return { oneOf: [
    closedObject({ kind: constant("null") }),
    closedObject({ kind: constant("empty_string") }),
    closedObject({ kind: constant("string"), value: nonblankString() }),
    closedObject({ kind: constant("number"), value: { type: "number" } }),
    closedObject({ kind: constant("boolean"), value: { type: "boolean" } })
  ] };
}
function evidenceRefSchema() {
  return { oneOf: [
    closedObject({ kind: constant("claim"), claim_id: nonblankString() }),
    closedObject({ kind: constant("decision"), decision_id: nonblankString() })
  ] };
}
function requirementsEvidenceRefSchema() {
  return { oneOf: [
    ...evidenceRefSchema().oneOf,
    closedObject({ kind: constant("source_unit"), source_unit_id: nonblankString(), source_digest: digestString() })
  ] };
}
function reviewBasisRefSchema() {
  return { oneOf: [
    ...evidenceRefSchema().oneOf,
    closedObject({ kind: constant("source_unit"), source_unit_id: nonblankString() })
  ] };
}
function typedContractRefSchema(contractKind) {
  return closedObject({ contract_id: nonblankString(), contract_kind: contractKind ? constant(contractKind) : nonblankString(), semantic_root_digest: digestString() });
}
function semanticRuleRefSchema() {
  return closedObject({
    source: constant("closed_registry"),
    registry_digest: digestString(),
    rule_id: nonblankString(),
    rule_kind: nonblankString(),
    implementation_digest: digestString()
  });
}
function outcomeSignatureSchema() {
  return closedObject({
    subject_slot_digest: digestString(),
    condition_slot_digest: digestString(),
    action_slot_digest: digestString(),
    primary_observation_slot_digest: digestString(),
    branch_slot_digest: digestString()
  });
}
function sourceSpanSchema() {
  return closedObject({ start_scalar: nonnegativeInteger(), end_scalar: nonnegativeInteger(), excerpt: { type: "string" }, excerpt_digest: digestString() });
}
function locatorSchema() {
  return { oneOf: [
    closedObject({ kind: constant("inline_text"), media_type: { enum: ["text/plain", "text/markdown"] }, content: nonblankString() }),
    closedObject({ kind: constant("local_file"), absolute_path: { type: "string", minLength: 1, pattern: "^/" } }),
    closedObject({ kind: constant("https_url"), url: { type: "string", minLength: 9, pattern: "^https://" } }),
    closedObject({ kind: constant("attachment"), attachment_ref: nonblankString() })
  ] };
}
function sourceBootstrapSchema() {
  return closedObject({ source_request_seeds: {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: closedObject({
      source_request_client_key: clientKeyString(),
      source_role: { enum: ["primary_prd", "supplemental_requirement", "technical_contract", "reference"] },
      locator: locatorSchema(),
      required: { type: "boolean" }
    })
  } });
}
function caseDocumentRefSchema() {
  return closedObject({
    run_id: { type: "string", pattern: RUN_ID },
    revision: { type: "integer", minimum: 0 },
    manifest_digest: digestString(),
    bundle_digest: digestString(),
    case_document_lineage_id: nonblankString(),
    schema_version: constant(V5_SCHEMA_VERSION)
  });
}
function createRequestSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "v5-create-request.schema.json",
    oneOf: [
      closedObject({ idempotency_key: nonblankString(), delivery_intent: constant("case_document"), source_bootstrap: sourceBootstrapSchema() }),
      closedObject({ idempotency_key: nonblankString(), delivery_intent: constant("execution_plan"), case_document_ref: caseDocumentRefSchema() }),
      closedObject({ idempotency_key: nonblankString(), creation_reason: constant("resume_cancelled"), parent_run_id: { type: "string", pattern: RUN_ID } })
    ]
  };
}
function sourceDispositionSchema() {
  return { oneOf: [
    closedObject({ request_id: nonblankString(), outcome: constant("fulfilled"), source_client_keys: { type: "array", minItems: 1, uniqueItems: true, items: clientKeyString() } }),
    closedObject({ request_id: nonblankString(), outcome: constant("skipped_optional"), skip_reason: { type: "string", minLength: 1 } })
  ] };
}
function sourceBatchPayloadSchema() {
  const source = closedObject({ source_client_key: clientKeyString(), media_type: { enum: ["text/plain", "text/markdown"] }, content: nonblankString() });
  return { oneOf: [
    closedObject({ kind: constant("fulfilled_sources"), source_pack: closedObject({ sources: { type: "array", minItems: 1, uniqueItems: true, items: source } }) }),
    closedObject({ kind: constant("all_skipped_optional") })
  ] };
}
function answerValueContractSchema() {
  return { oneOf: [
    closedObject({ kind: constant("text"), min_scalars: nonnegativeInteger(), max_scalars: positiveInteger(), ambiguity_guard_ref: nonblankString() }, ["kind", "min_scalars", "max_scalars"]),
    closedObject({ kind: constant("enum"), allowed_values: stringArray(1) }),
    closedObject({ kind: constant("boolean") }),
    closedObject({ kind: constant("integer"), minimum: integer(), maximum: integer() }, ["kind"]),
    closedObject({ kind: constant("number"), minimum: { type: "number" }, maximum: { type: "number" } }, ["kind"]),
    closedObject({ kind: constant("duration_ms"), minimum: positiveInteger(), maximum: positiveInteger() }, ["kind"]),
    closedObject({ kind: constant("identifier"), pattern_ref: nonblankString() }),
    closedObject({ kind: constant("set"), member_schema: nonblankString(), min_items: nonnegativeInteger() }),
    closedObject({ kind: constant("mapping"), key_schema: nonblankString(), value_schema: nonblankString() }),
    closedObject({ kind: constant("scope"), allowed_ref_kinds: stringArray(1) }),
    closedObject({ kind: constant("requirements_quantifier"), allowed_values: stringArray(1) }),
    closedObject({
      kind: { enum: ["population_scope", "population_proof", "oracle_observation", "oracle_assertion", "oracle_scope", "oracle_window", "permission_auxiliary"] },
      existing_candidates: stringArray(),
      allow_typed_creation: { type: "boolean" },
      creation_constraints: closedObject({ allowed_scope_kinds: stringArray(1), semantic_root_digest: digestString() })
    })
  ] };
}
function answerContractSchema() {
  return closedObject({
    answer_mode: constant("typed_answer"),
    allowed_controls: stringArray(1),
    value_schema: answerValueContractSchema()
  });
}
function questionImpactSchema(includePartId = false) {
  const compact = (
    /** @type {Record<string,any>} */
    { affected_case_keys: stringArray(), impact_kinds: stringArray() }
  );
  if (includePartId) compact.question_part_id = nonblankString();
  const detailed = (
    /** @type {Record<string,any>} */
    {
      affected_module_ids: stringArray(),
      affected_business_refs: stringArray(),
      affected_claim_ids: stringArray(),
      current_test_point_ids: stringArray(),
      blocked_count: nonnegativeInteger(),
      conditional_count: nonnegativeInteger(),
      unresolved_outcome: nonblankString()
    }
  );
  if (includePartId) detailed.question_part_id = nonblankString();
  return { oneOf: [closedObject(compact), closedObject(detailed)] };
}
function claimInputSchema() {
  return closedObject({
    claim_client_key: clientKeyString(),
    primary_outcome_signature: outcomeSignatureSchema(),
    observation_slot_digests: digestArray(1),
    subject_ref: nonblankString(),
    intent_ref: nonblankString(),
    basis: arrayOf(requirementsEvidenceRefSchema(), 1)
  }, ["claim_client_key", "primary_outcome_signature", "observation_slot_digests"]);
}
function claimOutputSchema() {
  return closedObject({
    claim_id: nonblankString(),
    primary_outcome_signature: outcomeSignatureSchema(),
    observation_slot_digests: digestArray(1),
    outcome_candidate_ids: stringArray(1),
    subject_ref: nonblankString(),
    intent_ref: nonblankString(),
    basis: arrayOf(requirementsEvidenceRefSchema(), 1)
  }, ["claim_id", "primary_outcome_signature", "observation_slot_digests", "outcome_candidate_ids"]);
}
function sameBatchGapRefSchema() {
  return closedObject({ kind: constant("same_behavior_batch"), semantic_gap_client_key: clientKeyString() });
}
function semanticGapRefSchema() {
  return { oneOf: [
    closedObject({ kind: constant("accepted_gap"), semantic_gap_id: nonblankString() }),
    sameBatchGapRefSchema()
  ] };
}
function requirementsGapSchema() {
  const origin = { oneOf: [
    closedObject({ kind: constant("outcome_decomposition"), outcome_candidate_id: nonblankString() }),
    closedObject({ kind: constant("ambiguity"), ambiguity_candidate_id: nonblankString(), ambiguity_kind: nonblankString() }),
    closedObject({ kind: constant("entity_resolution"), conflict_group_id: nonblankString(), mention_candidate_ids: stringArray(1) })
  ] };
  const target = { oneOf: [closedObject({ origin }), closedObject({ kind: nonblankString(), origin })] };
  return closedObject({
    semantic_gap_client_key: clientKeyString(),
    target,
    question: nonblankString(),
    why_needed: nonblankString(),
    answer_contract: answerContractSchema(),
    question_impact_summary: questionImpactSchema()
  });
}
function decompositionReviewSchema() {
  return closedObject({
    seed_digest: digestString(),
    candidate_id: nonblankString(),
    disposition: { oneOf: [
      closedObject({ kind: constant("single_claim"), claim_client_key: clientKeyString() }),
      closedObject({ kind: constant("split_claims"), claim_client_keys: arrayOf(clientKeyString(), 2) }),
      closedObject({ kind: constant("semantic_gap"), semantic_gap_client_key: clientKeyString() }),
      closedObject({ kind: constant("non_normative"), reason: nonblankString(), source_review_id: nonblankString() })
    ] }
  });
}
function ambiguityReviewSchema() {
  return closedObject({
    seed_digest: digestString(),
    candidate_id: nonblankString(),
    disposition: { oneOf: [
      closedObject({ kind: constant("resolved_by_claims"), claim_client_keys: arrayOf(clientKeyString(), 1) }),
      closedObject({ kind: constant("not_ambiguous"), claim_client_keys: arrayOf(clientKeyString(), 1), reason: nonblankString() }),
      closedObject({ kind: constant("resolved_by_decision"), decision_ids: stringArray(1) }),
      closedObject({ kind: constant("semantic_gap"), semantic_gap_client_key: clientKeyString() })
    ] }
  });
}
function entityResolutionSchema() {
  const mention = closedObject({ mention_candidate_id: nonblankString(), name_role: { enum: ["canonical_business_name", "business_alias", "exact_ui_label"] } });
  const cluster = closedObject({
    entity_client_key: clientKeyString(),
    canonical_name: nonblankString(),
    mentions: arrayOf(mention, 1),
    basis_claim_client_keys: arrayOf(clientKeyString()),
    basis_decision_ids: stringArray()
  });
  return closedObject({
    seed_digest: digestString(),
    conflict_group_id: nonblankString(),
    mention_candidate_ids: stringArray(1),
    resolution: { oneOf: [
      closedObject({ kind: constant("resolved_clusters"), clusters: arrayOf(cluster, 1) }),
      closedObject({ kind: constant("unresolved"), semantic_gap_client_key: clientKeyString() })
    ] }
  });
}
function valueStateSchema() {
  const dataState = { oneOf: [
    closedObject({ presence: constant("missing") }),
    closedObject({ presence: constant("present"), value: typedValueSchema() })
  ] };
  const content = { oneOf: [
    closedObject({ kind: constant("empty") }),
    closedObject({ kind: constant("text"), value: nonblankString() }),
    closedObject({ kind: constant("formatted_value"), value: nonblankString(), format_ref: nonblankString() })
  ] };
  const renderState = { oneOf: [
    closedObject({ presence: constant("not_rendered") }),
    closedObject({ presence: constant("rendered"), content })
  ] };
  return { oneOf: [
    closedObject({ axes: constant("data_only"), data_state: dataState }),
    closedObject({ axes: constant("render_only"), render_state: renderState }),
    closedObject({ axes: constant("data_and_render"), data_state: dataState, render_state: renderState })
  ] };
}
function fieldCorrespondenceSchema() {
  const side = closedObject({ semantic_role: { enum: ["ui", "authoritative_source", "peer_surface"] }, logical_surface_ref: nonblankString(), collection_path: nonblankString(), item_field_path: nonblankString() });
  const join = { oneOf: [
    closedObject({ kind: constant("singleton") }),
    closedObject({ kind: constant("key_equality"), left_key_path: nonblankString(), right_key_path: nonblankString(), cardinality: { enum: ["one_to_one", "many_to_one", "one_to_many"] }, key_normalization_ref: semanticRuleRefSchema() }, ["kind", "left_key_path", "right_key_path", "cardinality"])
  ] };
  const transform = { oneOf: [closedObject({ kind: constant("identity") }), closedObject({ kind: constant("registered"), transform_ref: semanticRuleRefSchema() })] };
  const comparison = { oneOf: [closedObject({ kind: constant("strict_equal") }), closedObject({ kind: constant("normalized_equal"), normalization_ref: semanticRuleRefSchema() })] };
  const freshness = { oneOf: [closedObject({ kind: constant("same_logical_snapshot") }), closedObject({ kind: constant("within_business_window"), duration_ms: positiveInteger() })] };
  return closedObject({ mapping_client_key: clientKeyString(), authority_side: { enum: ["left", "right"] }, left: side, right: side, join, transform, comparison, null_policy_ref: semanticRuleRefSchema(), freshness, basis: arrayOf(evidenceRefSchema(), 1) });
}
function predicateContractSchema() {
  return closedObject({ predicate_contract_client_key: clientKeyString(), predicate_ref: typedContractRefSchema("domain_predicate"), mutual_exclusion_group: nonblankString(), exhaustiveness: { enum: ["closed_partition_set", "non_exhaustive_open_set"] }, basis: arrayOf(evidenceRefSchema(), 1) });
}
function domainContractSchema() {
  const domain = { oneOf: [
    closedObject({ kind: constant("closed_enum"), members: arrayOf(typedValueSchema(), 1), closed_world_basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant("predicate_partition"), universe_ref: typedContractRefSchema("universe"), boundary_basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant("open_domain"), boundary_description: nonblankString(), boundary_basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  const partition = { oneOf: [
    closedObject({ partition_client_key: clientKeyString(), kind: constant("exact_members"), semantic_role: { enum: ["target", "other"] }, values: arrayOf(typedValueSchema(), 1) }),
    closedObject({ partition_client_key: clientKeyString(), kind: constant("complement"), semantic_role: constant("complement"), universe: closedObject({ kind: constant("parent_domain") }), excluded_values: arrayOf(typedValueSchema()) }),
    closedObject({ partition_client_key: clientKeyString(), kind: constant("predicate"), semantic_role: { enum: ["target", "other"] }, predicate_contract_client_key: clientKeyString() })
  ] };
  return closedObject({ domain_client_key: clientKeyString(), subject_ref: nonblankString(), field_path: nonblankString(), domain, partitions: arrayOf(partition, 1) });
}
function populationScopeSchema() {
  const optionalFilter = { filter_ref: typedContractRefSchema("filter") };
  return { oneOf: [
    closedObject({ kind: constant("single_item"), identity_contract_ref: typedContractRefSchema("identity") }),
    closedObject({ kind: constant("visible_region"), region_contract_ref: typedContractRefSchema("region") }),
    closedObject({ kind: constant("current_page"), collection_ref: typedContractRefSchema("collection"), ...optionalFilter }, ["kind", "collection_ref"]),
    closedObject({ kind: constant("current_response"), collection_ref: typedContractRefSchema("collection"), ...optionalFilter }, ["kind", "collection_ref"]),
    closedObject({ kind: constant("all_pages"), collection_ref: typedContractRefSchema("collection"), filter_ref: typedContractRefSchema("filter"), page_model_ref: typedContractRefSchema("page_model"), termination_contract_ref: typedContractRefSchema("termination"), consistency_contract_ref: typedContractRefSchema("consistency") }, ["kind", "collection_ref", "page_model_ref", "termination_contract_ref", "consistency_contract_ref"]),
    closedObject({ kind: constant("full_dataset"), universe_ref: typedContractRefSchema("universe"), snapshot_contract_ref: typedContractRefSchema("snapshot"), consistency_contract_ref: typedContractRefSchema("consistency"), filter_ref: typedContractRefSchema("filter"), tenant_or_region_ref: typedContractRefSchema("tenant_or_region") }, ["kind", "universe_ref", "snapshot_contract_ref", "consistency_contract_ref"])
  ] };
}
function populationContractSchema() {
  return closedObject({ population_contract_client_key: clientKeyString(), scope: populationScopeSchema() });
}
function populationProofSchema() {
  return { oneOf: [
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant("enumerate_population"), enumeration_contract_ref: typedContractRefSchema("enumeration") }) }),
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant("authoritative_aggregate"), aggregate_contract_ref: typedContractRefSchema("aggregate") }), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant("sourced_invariant"), invariant_contract_ref: typedContractRefSchema("invariant") }), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
}
function observationRefSchema() {
  const common = { logical_surface_ref: nonblankString(), subject_ref: nonblankString(), field_path: nonblankString() };
  return { oneOf: [
    closedObject({ kind: constant("ui"), ...common, locator_contract_ref: semanticRuleRefSchema() }, ["kind", "logical_surface_ref", "subject_ref", "locator_contract_ref"]),
    ...["response", "storage", "event", "system_state"].map((kind) => closedObject({ kind: constant(kind), ...common }, ["kind", "logical_surface_ref", "subject_ref"]))
  ] };
}
function actionRefSchema() {
  return closedObject({ action_id: nonblankString(), semantic_root_digest: digestString() });
}
function acceptedOrBatchContractRefSchema(contractKind) {
  return { oneOf: [
    closedObject({ kind: constant("accepted"), ref: typedContractRefSchema(contractKind) }),
    closedObject({ kind: constant("same_behavior_batch"), contract_client_key: clientKeyString(), contract_kind: constant(contractKind) })
  ] };
}
function oracleAssertionSchema() {
  const normalization = semanticRuleRefSchema();
  const decisionCellRef = closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() });
  return { oneOf: [
    closedObject({ kind: constant("exact_text"), expected_text: nonblankString() }),
    closedObject({ kind: constant("semantic_text"), expected_text: nonblankString(), equivalence_rule_ref: semanticRuleRefSchema() }),
    closedObject({ kind: constant("value_equals"), expected_value: typedValueSchema(), normalization_ref: normalization }, ["kind", "expected_value"]),
    closedObject({ kind: constant("value_state_equals"), expected_value_state: valueStateSchema() }),
    closedObject({ kind: constant("exists") }),
    closedObject({ kind: constant("absent") }),
    closedObject({ kind: constant("set_contains"), expected_members: arrayOf(typedValueSchema(), 1), normalization_ref: normalization }),
    closedObject({ kind: constant("set_equals"), expected_members: arrayOf(typedValueSchema()), order_sensitive: { type: "boolean" }, normalization_ref: normalization }),
    closedObject({ kind: constant("count_equals"), expected_count: nonnegativeInteger() }),
    closedObject({ kind: constant("count_at_least"), minimum_count: nonnegativeInteger() }),
    closedObject({ kind: constant("transition"), from_state: typedValueSchema(), to_state: typedValueSchema(), trigger_action_ref: actionRefSchema(), trigger_step_client_key: clientKeyString() }, ["kind", "from_state", "to_state", "trigger_action_ref"]),
    closedObject({ kind: constant("cross_surface_equals"), field_correspondence_id: nonblankString() }),
    closedObject({ kind: constant("permission"), expected: constant("allow"), decision_cell_ref: decisionCellRef }),
    closedObject({ kind: constant("permission"), expected: constant("deny"), decision_cell_ref: decisionCellRef, denial_behavior: { oneOf: [
      closedObject({ kind: constant("not_required") }),
      closedObject({ kind: constant("required"), denial_required_cell_key: nonblankString(), denial_contract_ref: acceptedOrBatchContractRefSchema("denial_behavior") })
    ] } })
  ] };
}
function observationWindowSchema() {
  return { oneOf: [
    closedObject({ kind: constant("after_step") }),
    closedObject({ kind: constant("within"), duration_ms: positiveInteger() }),
    closedObject({ kind: constant("stable_for"), duration_ms: positiveInteger() }),
    closedObject({ kind: constant("until_signal"), signal_ref: nonblankString(), timeout_ms: positiveInteger() })
  ] };
}
function oracleSemanticContractSchema() {
  return closedObject({
    oracle_contract_client_key: clientKeyString(),
    formal_test_point_id: nonblankString(),
    observation_ref: observationRefSchema(),
    assertion: oracleAssertionSchema(),
    evaluation_scope: { oneOf: [
      closedObject({ kind: constant("single") }),
      closedObject({ kind: constant("forall"), population_contract_client_key: clientKeyString(), population_proof_client_key: clientKeyString() })
    ] },
    observation_window: observationWindowSchema(),
    basis: arrayOf(evidenceRefSchema(), 1)
  });
}
function permissionAuxiliaryContractSchema() {
  const target = closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() });
  return { oneOf: [
    closedObject({ contract_client_key: clientKeyString(), permission_target: target, payload: closedObject({ contract_kind: constant("denial_behavior"), observation_ref: observationRefSchema(), assertion: oracleAssertionSchema(), observation_window: observationWindowSchema() }), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ contract_client_key: clientKeyString(), permission_target: target, payload: closedObject({ contract_kind: constant("data_scope"), scope: populationScopeSchema() }), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
}
function permissionOutcomeSchema() {
  return { oneOf: [
    closedObject({ permission_dimension: constant("decision"), action_ref: nonblankString(), expected: { enum: ["visible", "hidden", "allow", "deny"] } }),
    closedObject({ permission_dimension: constant("denial_behavior"), decision_cell_key: nonblankString(), denial_contract_ref: acceptedOrBatchContractRefSchema("denial_behavior") }),
    closedObject({ permission_dimension: constant("data_scope"), data_scope_contract_ref: acceptedOrBatchContractRefSchema("data_scope") })
  ] };
}
function permissionMatrixReviewSchema() {
  const disposition = { oneOf: [
    closedObject({ kind: constant("formal"), outcome: permissionOutcomeSchema(), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant("semantic_gap"), gap_ref: semanticGapRefSchema() }),
    closedObject({ kind: constant("not_applicable"), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  return closedObject({ matrix_id: nonblankString(), seed_digest: digestString(), cell_dispositions: arrayOf(closedObject({ required_cell_key: nonblankString(), disposition })) });
}
function riskReviewSchema() {
  const commonItem = {
    candidate_client_key: clientKeyString(),
    trigger_basis: arrayOf(reviewBasisRefSchema(), 1),
    affected_refs: stringArray(1),
    why_material: nonblankString(),
    recommended_action: nonblankString(),
    severity: { enum: ["low", "medium", "high", "critical"] },
    likelihood: { enum: ["low", "medium", "high"] },
    evidence_confidence: { enum: ["low", "medium", "high"] },
    testability: { enum: ["low", "medium", "high"] }
  };
  const item = { oneOf: [
    closedObject({ ...commonItem, risk_disposition: constant("formal_requirement"), formal_claim_id: nonblankString() }),
    closedObject({ ...commonItem, risk_disposition: constant("semantic_gap"), gap_ref: semanticGapRefSchema() }),
    closedObject({ ...commonItem, risk_disposition: constant("exploratory"), observation_intent: nonblankString() }),
    closedObject({ ...commonItem, risk_disposition: constant("not_applicable"), exclusion_basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  const common = { review_client_key: clientKeyString(), module_ref: nonblankString(), risk_kind: nonblankString(), review_basis: arrayOf(reviewBasisRefSchema(), 1) };
  return { oneOf: [
    closedObject({ ...common, risk_signal_status: constant("no_signal") }),
    closedObject({ ...common, risk_signal_status: constant("signal_found"), risk_item: item })
  ] };
}
function behaviorGapSchema() {
  const target = { oneOf: [
    closedObject({ kind: constant("behavior_contract"), required_contract_key: nonblankString() }),
    closedObject({ kind: constant("permission_cell"), matrix_id: nonblankString(), required_cell_key: nonblankString() }),
    closedObject({ kind: constant("risk"), module_ref: nonblankString(), risk_kind: nonblankString() })
  ] };
  return closedObject({
    semantic_gap_client_key: clientKeyString(),
    target,
    missing_semantics: nonblankString(),
    question: nonblankString(),
    answer_contract: answerContractSchema(),
    basis: arrayOf(evidenceRefSchema(), 1),
    why_needed: nonblankString(),
    question_impact_summary: questionImpactSchema()
  }, ["semantic_gap_client_key", "target", "missing_semantics", "question", "answer_contract", "basis"]);
}
function behaviorReviewSchema() {
  return closedObject({ seed_digest: digestString(), required_contract_key: nonblankString(), disposition: { oneOf: [
    closedObject({ kind: constant("formal"), contract_client_keys: arrayOf(clientKeyString(), 1) }),
    closedObject({ kind: constant("semantic_gap"), gap_ref: semanticGapRefSchema() }),
    closedObject({ kind: constant("not_applicable"), basis: arrayOf(evidenceRefSchema(), 1) })
  ] } });
}
function behaviorEquivalenceSchema() {
  return closedObject({
    equivalence_contract_client_key: clientKeyString(),
    domain_contract_client_key: clientKeyString(),
    partition_client_key: clientKeyString(),
    formal_test_point_id: nonblankString(),
    oracle_semantic_contract_client_key: clientKeyString(),
    equivalence_scope: constant("all_members_same_observable_behavior"),
    basis: arrayOf(evidenceRefSchema(), 1)
  });
}
function typedOracleSchema() {
  return closedObject({
    oracle_client_key: clientKeyString(),
    oracle_semantic_contract_id: nonblankString(),
    observe_after_step_client_key: clientKeyString(),
    observation_ref: observationRefSchema(),
    assertion: oracleAssertionSchema(),
    evaluation_scope: { oneOf: [
      closedObject({ kind: constant("single") }),
      closedObject({ kind: constant("forall"), population_contract_id: nonblankString(), population_proof_id: nonblankString() })
    ] },
    observation_window: observationWindowSchema(),
    claim_ids: stringArray(1)
  });
}
function selectionMembershipSchema() {
  return { oneOf: [
    closedObject({ kind: constant("closed_domain_membership") }),
    closedObject({ kind: constant("decidable_predicate"), predicate_contract_id: nonblankString() }),
    closedObject({ kind: constant("membership_witnesses"), witnesses: arrayOf(closedObject({ selected_value_digest: digestString(), basis: arrayOf(evidenceRefSchema(), 1) }), 1) })
  ] };
}
function domainSelectionSchema() {
  const selection = { oneOf: [
    closedObject({ kind: constant("exhaustive_members"), selected_values: arrayOf(typedValueSchema(), 1), membership: closedObject({ kind: constant("closed_domain_membership") }) }),
    closedObject({ kind: constant("representative"), selected_values: arrayOf(typedValueSchema(), 1), behavior_equivalence_contract_id: nonblankString(), membership: selectionMembershipSchema() }),
    closedObject({ kind: constant("sampled"), selected_values: arrayOf(typedValueSchema(), 1), residual_risk: nonblankString(), membership: selectionMembershipSchema() })
  ] };
  return closedObject({
    selection_client_key: clientKeyString(),
    case_client_key: clientKeyString(),
    formal_test_point_id: nonblankString(),
    oracle_semantic_contract_id: nonblankString(),
    domain_contract_id: nonblankString(),
    partition_id: nonblankString(),
    selection
  });
}
function caseDraftSchema() {
  const ordering = closedObject({
    business_flow_ref: { oneOf: [nonblankString(), { type: "null" }] },
    page_action_ref: { oneOf: [nonblankString(), { type: "null" }] }
  });
  const step = closedObject({ step_client_key: clientKeyString(), action: nonblankString() });
  const binding = closedObject({ case_client_key: clientKeyString(), step_client_key: clientKeyString(), action_ref: actionRefSchema() });
  const precondition = closedObject({ precondition_id: nonblankString(), description: nonblankString() });
  const dataCondition = closedObject({ condition_id: nonblankString(), description: nonblankString() });
  const semanticEffect = closedObject({
    effect_id: nonblankString(),
    kind: nonblankString(),
    subject: nonblankString(),
    before: nonblankString(),
    after: nonblankString(),
    claim_ids: stringArray(1)
  }, ["effect_id", "kind", "subject", "after", "claim_ids"]);
  const comparisonContract = { oneOf: [
    closedObject({ kind: constant("all_observable_behavior_except"), exceptions: stringArray() }),
    closedObject({ kind: constant("selected_dimensions"), dimensions: stringArray(1), allowed_differences: stringArray() })
  ] };
  const baselineSpec = closedObject({
    baseline_id: nonblankString(),
    kind: constant("declared_reference"),
    acquisition: constant("capture_at_execution"),
    reference: nonblankString(),
    comparison_contract: comparisonContract,
    claim_ids: stringArray(1)
  });
  const derivation = closedObject({ method_id: nonblankString(), method_version: nonblankString(), inputs_digest: digestString() });
  const valueOrigin = { oneOf: [
    closedObject({ kind: constant("requirement"), claim_ids: stringArray(1) }),
    closedObject({ kind: constant("example"), claim_ids: stringArray(1), replaceable: constant(true) }),
    closedObject({ kind: constant("derived"), input_claim_ids: stringArray(1), derivation, evidence_level: constant("derived") }),
    closedObject({
      kind: constant("temporary_assumption"),
      assumption_id: nonblankString(),
      semantic_gap_ids: stringArray(1),
      reason: nonblankString(),
      requires_case_status: constant("Conditional")
    })
  ] };
  const testValue = closedObject({
    value_id: nonblankString(),
    subject_ref: nonblankString(),
    field_path: { type: "string", pattern: "^(?:/(?:[^~/]|~[01])*)+$" },
    value: {},
    used_by_refs: stringArray(1),
    value_origin: valueOrigin
  });
  return closedObject({
    case_client_key: clientKeyString(),
    title: nonblankString(),
    module_id: nonblankString(),
    priority: { enum: ["P0", "P1", "P2", "P3"] },
    ordering,
    acceptance_role: { enum: ["primary_acceptance", "dependency_contract", "context_only"] },
    fact_ids: stringArray(1),
    primary_test_point_id: nonblankString(),
    supporting_observation_ids: stringArray(),
    business_preconditions: arrayOf(precondition),
    data_conditions: arrayOf(dataCondition),
    steps: arrayOf(step, 1),
    case_step_semantic_bindings: arrayOf(binding, 1),
    domain_selections: arrayOf(domainSelectionSchema()),
    oracles: arrayOf(typedOracleSchema(), 1),
    semantic_effects: arrayOf(semanticEffect, 1),
    baseline_spec: baselineSpec,
    test_values: arrayOf(testValue, 1)
  }, [
    "case_client_key",
    "title",
    "module_id",
    "priority",
    "ordering",
    "acceptance_role",
    "fact_ids",
    "primary_test_point_id",
    "supporting_observation_ids",
    "business_preconditions",
    "data_conditions",
    "steps",
    "case_step_semantic_bindings",
    "domain_selections",
    "oracles"
  ]);
}
function evidenceArtifactSchema() {
  return closedObject({
    semantic_review_seed_digest: digestString(),
    claims: arrayOf(claimInputSchema()),
    semantic_gaps: arrayOf(requirementsGapSchema()),
    decomposition_reviews: arrayOf(decompositionReviewSchema()),
    ambiguity_reviews: arrayOf(ambiguityReviewSchema()),
    entity_resolutions: arrayOf(entityResolutionSchema())
  });
}
function behaviorArtifactSchema() {
  return closedObject({
    behavior_contract_seed_digest: digestString(),
    field_correspondences: arrayOf(fieldCorrespondenceSchema()),
    value_states: arrayOf(valueStateSchema()),
    predicate_contracts: arrayOf(predicateContractSchema()),
    domain_contracts: arrayOf(domainContractSchema()),
    behavior_equivalence_contracts: arrayOf(behaviorEquivalenceSchema()),
    population_contracts: arrayOf(populationContractSchema()),
    population_proofs: arrayOf(populationProofSchema()),
    permission_auxiliary_contracts: arrayOf(permissionAuxiliaryContractSchema()),
    oracle_semantic_contracts: arrayOf(oracleSemanticContractSchema()),
    behavior_contract_reviews: arrayOf(behaviorReviewSchema()),
    permission_matrix_reviews: arrayOf(permissionMatrixReviewSchema()),
    risk_reviews: arrayOf(riskReviewSchema()),
    semantic_gap_proposals: arrayOf(behaviorGapSchema())
  });
}
function artifactRootSchema(artifactKind) {
  if (artifactKind === "evidence_claims") return evidenceArtifactSchema();
  if (artifactKind === "behavior_views") return behaviorArtifactSchema();
  if (artifactKind === "case_drafts") return closedObject({ case_drafts: arrayOf(caseDraftSchema(), 1) });
  throw new Error(`Unknown Agent artifact kind: ${artifactKind}`);
}
function originRangeSchema() {
  return closedObject({ start_scalar: { type: "integer", minimum: 0 }, end_scalar: { type: "integer", minimum: 0 } });
}
function scalarAnswerValueSchema() {
  return { oneOf: [
    ...["text", "enum", "identifier"].map((kind) => closedObject({ kind: constant(kind), value: nonblankString() })),
    closedObject({ kind: constant("boolean"), value: { type: "boolean" } }),
    closedObject({ kind: constant("integer"), value: { type: "integer" } }),
    closedObject({ kind: constant("number"), value: { type: "number" } }),
    closedObject({ kind: constant("duration_ms"), value: { type: "integer", minimum: 1 } })
  ] };
}
function answerValueSchema() {
  const scalar = scalarAnswerValueSchema();
  return { oneOf: [
    ...scalar.oneOf,
    closedObject({ kind: constant("set"), members: arrayOf(scalar) }),
    closedObject({ kind: constant("mapping"), entries: arrayOf(closedObject({ from: scalar, to: scalar })) }),
    closedObject({ kind: constant("scope"), included_refs: arrayOf(nonblankString()), excluded_refs: arrayOf(nonblankString()) }),
    closedObject({ kind: constant("requirements_quantifier"), value: { enum: ["one", "some", "all", "none"] } })
  ] };
}
function proposedAnswerSchema() {
  return { oneOf: [
    closedObject({ value: answerValueSchema(), source_text: nonblankString(), nature: constant("final") }),
    closedObject({ value: answerValueSchema(), source_text: nonblankString(), nature: constant("temporary"), temporary_basis: closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() }) })
  ] };
}
function clarificationUnitSchema() {
  const origin = closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() });
  const target = closedObject({ display_token: nonblankString(), question_part_id: nonblankString(), root_version_digest: digestString() });
  const base = { unit_client_key: clientKeyString(), origin, target };
  return { oneOf: [
    closedObject({ ...base, action: { enum: ["defer", "unknown", "close_for_delivery"] } }),
    closedObject({ ...base, shared_origin_group_id: clientKeyString(), action: constant("answer"), answer: proposedAnswerSchema() }, ["unit_client_key", "origin", "target", "shared_origin_group_id", "action", "answer"]),
    closedObject({ ...base, action: constant("answer"), answer: proposedAnswerSchema() })
  ] };
}
function executionOperationSchema() {
  return { oneOf: [
    closedObject({ kind: constant("set_execution_disposition"), case_id: nonblankString(), disposition: { enum: ["execute", "do_not_execute"] } }),
    closedObject({ kind: constant("provide_capability_proof"), case_id: nonblankString(), proof: closedObject({ type: nonblankString(), value: nonblankString() }) }),
    closedObject({ kind: constant("pause_execution") }),
    closedObject({ kind: constant("confirm_execution_plan") })
  ] };
}
function advanceRequestSchema() {
  const token = nonblankString();
  const actionBranches = [
    closedObject({ kind: constant("cancel_run"), action_token: token, reason: nonblankString() }),
    closedObject({ kind: constant("submit_source_batch"), action_token: token, request_ids: { type: "array", minItems: 1, uniqueItems: true, items: nonblankString() }, request_dispositions: { type: "array", minItems: 1, uniqueItems: true, items: sourceDispositionSchema() }, source_payload: sourceBatchPayloadSchema() }),
    ...["evidence_claims", "behavior_views", "case_drafts"].map((artifactKind) => closedObject({ kind: constant("submit_artifact"), action_token: token, artifact_kind: constant(artifactKind), artifact: artifactRootSchema(artifactKind) })),
    closedObject({ kind: constant("preview_clarification_response"), action_token: token, presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_intent: { enum: ["apply_units", "discard_pending"] }, raw_response: { type: "string" }, proposed_units: arrayOf(clarificationUnitSchema()) }),
    closedObject({ kind: constant("commit_clarification_response"), action_token: token, presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_digest: digestString(), raw_confirmation: nonblankString(), confirmation_range: originRangeSchema() }),
    closedObject({ kind: constant("advance_execution_plan"), action_token: token, operation: executionOperationSchema() })
  ];
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "v5-advance-request.schema.json",
    type: "object",
    required: ["idempotency_key", "action"],
    properties: { idempotency_key: nonblankString(), action: { oneOf: actionBranches } },
    additionalProperties: false
  };
}
function resumeLineageSchema() {
  const acceptedSourceState = { oneOf: [
    closedObject({ kind: constant("none") }),
    closedObject({ kind: constant("accepted"), accepted_source_state_digest: digestString() })
  ] };
  const resumeBase = { oneOf: [
    closedObject({ kind: constant("source_checkpoint"), parent_checkpoint_digest: digestString(), source_acquisition_state_digest: digestString(), accepted_source_state: acceptedSourceState }),
    closedObject({ kind: constant("case_semantic_checkpoint"), parent_checkpoint_digest: digestString(), semantic_root_digest: digestString(), accepted_artifact_digests: arrayOf(digestString()) }),
    closedObject({ kind: constant("execution_checkpoint"), parent_checkpoint_digest: digestString(), case_document_ref: caseDocumentRefSchema(), execution_snapshot_digest: digestString(), accepted_execution_receipt_digests: arrayOf(digestString()) })
  ] };
  return closedObject({
    creation_reason: constant("resume_cancelled"),
    parent_run_id: { type: "string", pattern: RUN_ID },
    parent_cancel_event_digest: digestString(),
    resume_base: resumeBase
  });
}
function runIdentitySchema() {
  const common = {
    kind: constant("v5_run_identity"),
    schema_version: constant(V5_SCHEMA_VERSION),
    compiler_version: constant(V5_COMPILER_VERSION),
    run_id: { type: "string", pattern: RUN_ID },
    run_directory_key: { type: "string", pattern: RUN_ID },
    delivery_intent: { enum: ["case_document", "execution_plan"] },
    case_document_lineage_id: nonblankString(),
    canonical_create_request_digest: digestString(),
    run_identity_digest: digestString()
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "v5-run-identity.schema.json",
    oneOf: [
      closedObject({ ...common, delivery_intent: constant("case_document"), creation_binding: closedObject({ kind: constant("case_document"), source_bootstrap_digest: digestString(), source_acquisition_policy_digest: digestString() }) }),
      closedObject({ ...common, delivery_intent: constant("execution_plan"), creation_binding: closedObject({ kind: constant("execution_plan"), case_document_ref: caseDocumentRefSchema() }) }),
      closedObject({ ...common, creation_binding: resumeLineageSchema() })
    ]
  };
}
function diagnosticSchema(errorCode) {
  return closedObject({
    code: constant(errorCode),
    json_pointer: nonblankString(),
    affected_refs: arrayOf(nonblankString()),
    message: nonblankString()
  }, ["code", "affected_refs", "message"]);
}
function capabilitySchema(template) {
  if (template.kind === "cancel_run") return closedObject({ kind: constant("cancel_run") });
  if (template.kind === "submit_artifact") return closedObject({ kind: constant("submit_artifact"), artifact_kind: constant(template.artifact_kind) });
  if (template.kind === "submit_source_batch") return closedObject({ kind: constant("submit_source_batch"), request_ids: { type: "array", minItems: 1, uniqueItems: true, items: nonblankString() } });
  if (template.kind === "preview_clarification_response") return closedObject({ kind: constant(template.kind), presentation_id: nonblankString(), semantic_root_digest: digestString() });
  if (template.kind === "commit_clarification_response") return closedObject({ kind: constant(template.kind), presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_digest: digestString() });
  if (template.kind === "advance_execution_plan") return closedObject({ kind: constant(template.kind), allowed_operation_kinds: { type: "array", minItems: 1, uniqueItems: true, items: { enum: ["confirm_execution_plan", "pause_execution", "provide_capability_proof", "set_execution_disposition"] } } });
  throw new Error(`Unknown reply action template: ${template.kind}`);
}
function selectorsSchema(templates) {
  if (templates.length === 0) return { type: "array", maxItems: 0, items: false };
  return {
    type: "array",
    minItems: templates.length,
    maxItems: templates.length,
    uniqueItems: true,
    items: { oneOf: templates.map((template) => closedObject({ capability: capabilitySchema(template), action_token: nonblankString() })) }
  };
}
function sourceRequestSchema() {
  return closedObject({
    request_id: nonblankString(),
    source_request_client_key: clientKeyString(),
    source_role: { enum: ["primary_prd", "supplemental_requirement", "technical_contract", "reference"] },
    locator: locatorSchema(),
    required: { type: "boolean" }
  });
}
function acceptedSourceContextSchema() {
  const source = closedObject({ media_type: { enum: ["text/plain", "text/markdown"] }, content: { type: "string" }, source_object_digest: digestString() });
  const pack = closedObject({ artifact_digest: digestString(), accepted_revision: nonnegativeInteger(), payload: closedObject({ sources: arrayOf(source, 1) }) });
  return closedObject({ accepted_source_state_digest: digestString(), source_packs: arrayOf(pack, 1) });
}
function semanticRuleIndexSchema() {
  const registeredRule = closedObject({ rule_id: nonblankString(), rule_kind: { enum: ["locator", "key_normalization", "transform", "value_normalization", "null_policy", "semantic_equivalence"] }, implementation_digest: digestString() });
  return closedObject({
    semantic_root_digest: digestString(),
    registry_digest: digestString(),
    registered_rules: arrayOf(registeredRule),
    accepted_rule_contract_refs: arrayOf(typedContractRefSchema()),
    index_digest: digestString()
  });
}
function compilerRulesSchema(contracts2) {
  return closedObject({
    rules_bundle_digest: constant(contracts2.replyContracts.rules_bundle_digest),
    answer_constraint_registry: exactValueSchema(contracts2.answerConstraintRegistry),
    clarification_control_registry: exactValueSchema(contracts2.clarificationControlRegistry),
    source_acquisition_policy: exactValueSchema(contracts2.sourceAcquisitionPolicy),
    permission_derivation_registry: exactValueSchema(contracts2.permissionDerivationRegistry),
    semantic_rule_index_projection: { oneOf: [
      closedObject({ kind: constant("not_available_before_behavior") }),
      closedObject({ kind: constant("available"), index: semanticRuleIndexSchema() })
    ] }
  });
}
function semanticSeedSchema() {
  const ambiguity = closedObject({ candidate_id: nonblankString(), locator_id: nonblankString(), source_span: sourceSpanSchema(), ambiguity_kind: nonblankString(), detector_codes: stringArray(1) });
  const outcome = closedObject({
    candidate_id: nonblankString(),
    locator_id: nonblankString(),
    source_span: sourceSpanSchema(),
    compound_signal_codes: stringArray(),
    atom_signature: outcomeSignatureSchema(),
    required_observation_slot_digests: digestArray(1)
  });
  const unit = closedObject({ unit_id: nonblankString(), locator_id: nonblankString(), unit_digest: digestString(), outcome_candidates: arrayOf(outcome, 1) });
  const mention = closedObject({ candidate_id: nonblankString(), conflict_group_id: nonblankString(), locator_id: nonblankString(), observed_name: nonblankString(), source_span: sourceSpanSchema() });
  const conflict = closedObject({ conflict_group_id: nonblankString(), mention_candidate_ids: stringArray(1) });
  const requirementRef = closedObject({ kind: constant("requirements_ref"), ref: requirementsEvidenceRefSchema() });
  const decisionDefined = closedObject({ kind: constant("decision_defined"), canonical_name: nonblankString() });
  const coordinateValue = { oneOf: [nonblankString(), closedObject({ context_key: nonblankString() }), requirementRef, decisionDefined] };
  const coordinateEvidence = { oneOf: [
    closedObject({ evidence_kind: constant("source"), coordinate: nonblankString(), value: coordinateValue, locator_id: nonblankString(), source_span: sourceSpanSchema(), coordinate_evidence_digest: digestString() }),
    closedObject({ evidence_kind: constant("decision"), coordinate: nonblankString(), value: coordinateValue, decision_id: nonblankString(), answer_value_digest: digestString(), coordinate_evidence_digest: digestString() })
  ] };
  const slots = closedObject({ role_candidates: arrayOf(coordinateEvidence), resource_candidates: arrayOf(coordinateEvidence), action_candidates: arrayOf(coordinateEvidence), context_candidates: arrayOf(coordinateEvidence) });
  const permission = closedObject({ candidate_id: nonblankString(), scope_group_id: nonblankString(), locator_id: nonblankString(), source_span: sourceSpanSchema(), coordinate_slots: slots, signaled_dimensions: arrayOf(coordinateEvidence, 1), detector_codes: stringArray(1) });
  const permissionGroup = closedObject({ scope_group_id: nonblankString(), permission_scope_candidate_ids: stringArray(1) });
  return closedObject({
    accepted_source_state_digest: digestString(),
    normative_units: arrayOf(unit, 1),
    ambiguity_candidates: arrayOf(ambiguity),
    outcome_dedup_groups: { type: "array", maxItems: 0, items: false },
    entity_mention_candidates: arrayOf(mention),
    entity_conflict_groups: arrayOf(conflict),
    permission_scope_candidates: arrayOf(permission),
    permission_scope_groups: arrayOf(permissionGroup),
    permission_derivation_registry_digest: digestString(),
    seed_digest: digestString()
  });
}
function semanticPayloadSchema() {
  return closedObject({
    semantic_review_seed_digest: digestString(),
    claims: arrayOf(claimOutputSchema()),
    semantic_gaps: arrayOf(requirementsGapSchema()),
    decomposition_reviews: arrayOf(decompositionReviewSchema()),
    ambiguity_reviews: arrayOf(ambiguityReviewSchema()),
    entity_resolutions: arrayOf(entityResolutionSchema())
  });
}
function termRegistrySchema() {
  const entry = closedObject({
    entity_id: nonblankString(),
    canonical_name: nonblankString(),
    alias_names: stringArray(),
    exact_ui_labels: stringArray(),
    mention_candidate_ids: stringArray(1),
    basis: arrayOf(evidenceRefSchema(), 1)
  });
  return closedObject({ semantic_root_digest: digestString(), entries: arrayOf(entry), registry_digest: digestString() });
}
function projectionRecordSchema(payload) {
  return closedObject({ artifact_digest: digestString(), accepted_revision: nonnegativeInteger(), payload });
}
function testObligationsSchema() {
  const acceptanceRole = { enum: ["primary_acceptance", "dependency_contract", "context_only"] };
  const outcome = closedObject({
    outcome_id: { type: "string", pattern: "^OUT-[0-9a-f]{64}$" },
    fact_id: nonblankString(),
    condition: closedObject({ condition_slot_digest: digestString(), action_slot_digest: digestString(), branch_slot_digest: digestString() }),
    expected: nonblankString(),
    acceptance_role: acceptanceRole,
    claim_ids: stringArray(1)
  });
  const formalTestPoint = closedObject({ formal_test_point_id: { type: "string", pattern: "^TP-[0-9a-f]{64}$" }, outcome_id: nonblankString(), semantic_gap_refs: stringArray() });
  const supportingObservation = closedObject({
    supporting_observation_id: { type: "string", pattern: "^OBS-[0-9a-f]{64}$" },
    outcome_id: nonblankString(),
    surface: { enum: ["ui", "request", "response", "persistence", "event", "callback", "compensation", "side_effect", "external_observation"] },
    assertion: nonblankString(),
    claim_ids: stringArray(1)
  });
  return closedObject({
    schema_version: constant("4.0.0"),
    source_revision: nonnegativeInteger(),
    outcomes: arrayOf(outcome),
    formal_test_points: arrayOf(formalTestPoint),
    supporting_observations: arrayOf(supportingObservation),
    risk_review_ledger: { type: "array", maxItems: 0, items: false },
    not_applicable_records: { type: "array", maxItems: 0, items: false },
    exploratory: { type: "array", maxItems: 0, items: false }
  });
}
function contextSchema(contracts2) {
  const source = acceptedSourceContextSchema();
  const compilerRules = compilerRulesSchema(contracts2);
  const semantics = projectionRecordSchema(semanticPayloadSchema());
  const termRegistry = projectionRecordSchema(termRegistrySchema());
  const behavior = projectionRecordSchema(behaviorArtifactSchema());
  const testObligations = projectionRecordSchema(testObligationsSchema());
  return { oneOf: [
    closedObject({ source, compiler_rules: compilerRules }),
    closedObject({ source, semantics, term_registry: termRegistry, test_obligations: testObligations, compiler_rules: compilerRules }),
    closedObject({ source, semantics, term_registry: termRegistry, behavior, test_obligations: testObligations, compiler_rules: compilerRules })
  ] };
}
function behaviorSeedSchema() {
  const gapCatalog = (left, right) => closedObject({ [left]: { type: "array", maxItems: 0, items: false }, [right]: { type: "array", maxItems: 0, items: false } });
  const base = { required_contract_key: nonblankString(), contract_kind: nonblankString(), subject_ref: nonblankString(), intent_ref: nonblankString(), basis: arrayOf(evidenceRefSchema(), 1) };
  const requirement = { oneOf: [
    closedObject(base),
    closedObject({ ...base, population_gap_catalog: gapCatalog("scope_candidates", "proof_candidates") }),
    closedObject({ ...base, oracle_gap_catalog: closedObject({ observation_candidates: { type: "array", maxItems: 0, items: false }, assertion_candidates: { type: "array", maxItems: 0, items: false }, scope_candidates: { type: "array", maxItems: 0, items: false }, window_candidates: { type: "array", maxItems: 0, items: false } }) }),
    closedObject({ ...base, auxiliary_contract_kind: { enum: ["denial_behavior", "data_scope"] }, permission_target: closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() }) })
  ] };
  return closedObject({ semantic_root_digest: digestString(), semantic_rule_index: semanticRuleIndexSchema(), risk_review_module_ids: stringArray(), required_contracts: arrayOf(requirement), seed_digest: digestString() });
}
function coordinateRefSchema(coordinate) {
  return closedObject({ coordinate: coordinate ? constant(coordinate) : nonblankString(), coordinate_evidence_digest: digestString() });
}
function permissionMatrixSchema() {
  const requiredCell = closedObject({
    required_cell_key: nonblankString(),
    role_ref: coordinateRefSchema("role"),
    resource_ref: coordinateRefSchema("resource"),
    action_ref: nonblankString(),
    context_key: nonblankString(),
    permission_dimension: { enum: ["decision", "denial_behavior", "data_scope"] },
    coordinate_refs: closedObject({ action: coordinateRefSchema("action"), context: coordinateRefSchema("context"), permission_dimension: coordinateRefSchema("permission_dimension") })
  });
  const route = { oneOf: [
    closedObject({ candidate_id: nonblankString(), kind: constant("required_cells"), required_cell_keys: stringArray(1) }),
    closedObject({ candidate_id: nonblankString(), kind: constant("semantic_gap"), semantic_gap_id: nonblankString(), unresolved_coordinates: stringArray(1) })
  ] };
  return closedObject({
    matrix_id: nonblankString(),
    semantic_root_digest: digestString(),
    seed_digest: digestString(),
    permission_derivation_registry_digest: digestString(),
    scope_candidate_ids: stringArray(1),
    candidate_routes: arrayOf(route, 1),
    role_domain: closedObject({ role_refs: arrayOf(coordinateRefSchema("role")), basis: arrayOf(evidenceRefSchema()) }),
    matrix_scope: closedObject({ resource_refs: arrayOf(coordinateRefSchema("resource")), action_refs: stringArray(), contexts: arrayOf(closedObject({ context_key: nonblankString(), context_ref: coordinateRefSchema("context") })), basis: arrayOf(evidenceRefSchema()) }),
    required_cells: arrayOf(requiredCell)
  });
}
function presentationSchema() {
  const part = closedObject({
    question_part_id: nonblankString(),
    display_token: { type: "string", pattern: "^Q[0-9]{3,6}$" },
    question_state: nonblankString(),
    current_allowed_controls: stringArray(1),
    question: nonblankString(),
    why_needed: nonblankString(),
    answer_contract: answerContractSchema(),
    question_impact_summary: questionImpactSchema(true)
  });
  return closedObject({ presentation_id: nonblankString(), semantic_root_digest: digestString(), question_part_state_set_digest: digestString(), source_revision: nonnegativeInteger(), parts: arrayOf(part, 1), presentation_digest: digestString() });
}
function deterministicProjectionSchema() {
  return closedObject({
    resolved_gap_ids: stringArray(),
    invalidated_artifact_ids: stringArray(),
    semantic_changes: { type: "array", maxItems: 0, items: false },
    status_changes: arrayOf(closedObject({ ref: nonblankString(), from: nonblankString(), to: nonblankString() })),
    coverage_changes: { type: "array", maxItems: 0, items: false },
    no_semantic_change: constant(false)
  });
}
function clarificationPreviewSchema() {
  const bindingBase = { unit_client_key: clientKeyString(), shared_origin_group_id: clientKeyString(), question_part_id: nonblankString(), display_token: nonblankString(), origin: closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() }) };
  const binding = { oneOf: [
    closedObject({ ...bindingBase, action: { enum: ["defer", "unknown", "close_for_delivery"] } }, ["unit_client_key", "question_part_id", "display_token", "action", "origin"]),
    closedObject({ ...bindingBase, action: constant("answer"), answer: proposedAnswerSchema() }, ["unit_client_key", "question_part_id", "display_token", "action", "origin", "answer"])
  ] };
  return closedObject({
    presentation_id: nonblankString(),
    presentation_digest: digestString(),
    semantic_root_digest: digestString(),
    question_part_state_set_digest: digestString(),
    source_revision: nonnegativeInteger(),
    response_message_digest: digestString(),
    bindings: arrayOf(binding),
    deterministic_projection: deterministicProjectionSchema(),
    unknown_future_effects: stringArray(),
    preview_digest: digestString()
  });
}
function executionProjectionSchema() {
  const item = closedObject({
    case_id: nonblankString(),
    title: nonblankString(),
    semantic_status: { enum: ["Grounded", "Conditional", "Blocked", "NotApplicable", "Exploratory"] },
    execution_disposition: { enum: ["pending", "execute", "do_not_execute"] },
    available_actions: { type: "array", uniqueItems: true, items: { enum: ["provide_capability_proof", "set_execution_disposition"] } },
    capability_ready: { type: "boolean" }
  }, ["case_id", "title", "semantic_status", "execution_disposition", "available_actions"]);
  const receipt = closedObject({ kind: constant("capability_proof"), ready: { type: "boolean" }, case_id: nonblankString(), receipt_digest: digestString() });
  return closedObject({
    kind: constant("v5_execution_projection"),
    schema_version: constant(V5_SCHEMA_VERSION),
    compiler_version: constant(V5_COMPILER_VERSION),
    case_document_ref: caseDocumentRefSchema(),
    plan_digest: digestString(),
    operation_kinds: { type: "array", minItems: 4, maxItems: 4, uniqueItems: true, items: { enum: ["confirm_execution_plan", "pause_execution", "provide_capability_proof", "set_execution_disposition"] } },
    items: arrayOf(item),
    capability_receipts: arrayOf(receipt),
    paused: { type: "boolean" },
    confirmed: { type: "boolean" },
    execution_snapshot_digest: digestString()
  });
}
function workPacketSchema(exactWorkPacket, contracts2) {
  if (exactWorkPacket.kind === "terminal") {
    const properties = (
      /** @type {Record<string,any>} */
      { kind: constant("terminal_work"), terminal_kind: constant(exactWorkPacket.terminal_kind) }
    );
    const terminalKind = exactWorkPacket.terminal_kind;
    if (terminalKind === "case_document_finished") properties.case_document_ref = caseDocumentRefSchema();
    if (terminalKind === "execution_plan_finished") {
      properties.case_document_ref = caseDocumentRefSchema();
      properties.execution_projection = executionProjectionSchema();
    }
    if (terminalKind === "execution_plan_cancelled") {
      properties.case_document_ref = caseDocumentRefSchema();
      properties.last_execution_projection = executionProjectionSchema();
    }
    if (terminalKind === "execution_plan_fatal") {
      properties.case_document_ref = caseDocumentRefSchema();
      properties.last_verified_execution_projection = { oneOf: [executionProjectionSchema(), { type: "null" }] };
    }
    return closedObject(properties, Object.keys(properties).filter((key) => !["case_document_ref", "last_verified_execution_projection"].includes(key) || terminalKind !== "execution_plan_fatal"));
  }
  const kind = exactWorkPacket.packet_kind;
  if (kind === "source_work") return closedObject({
    kind: constant(kind),
    accepted_source_state: { oneOf: [
      closedObject({ kind: constant("none") }),
      closedObject({ kind: constant("partial"), accepted_source_state_digest: digestString() }),
      closedObject({ kind: constant("partial"), source: acceptedSourceContextSchema() })
    ] },
    source_requests: arrayOf(sourceRequestSchema(), 1),
    source_acquisition_policy: exactValueSchema(contracts2.sourceAcquisitionPolicy),
    source_acquisition_state_digest: digestString()
  });
  if (kind === "semantic_review_work") return closedObject({ kind: constant(kind), context: contextSchema(contracts2), semantic_review_seed: semanticSeedSchema() });
  if (kind === "clarification_work") return closedObject({ kind: constant(kind), context: contextSchema(contracts2), presentation: presentationSchema() });
  if (kind === "clarification_confirmation_work") return closedObject({ kind: constant(kind), context: contextSchema(contracts2), presentation: presentationSchema(), clarification_preview: clarificationPreviewSchema() });
  if (kind === "behavior_work") return closedObject({ kind: constant(kind), context: contextSchema(contracts2), permission_matrix_worklists: arrayOf(permissionMatrixSchema()), behavior_contract_worklist: behaviorSeedSchema() });
  if (kind === "case_work") return closedObject({ kind: constant(kind), context: contextSchema(contracts2) });
  if (kind === "execution_work") return closedObject({ kind: constant(kind), case_document_ref: caseDocumentRefSchema(), execution_projection: executionProjectionSchema() });
  throw new Error(`Unknown reply work packet: ${kind}`);
}
function bindingSchema() {
  return closedObject({ client_key: clientKeyString(), stable_id: nonblankString() });
}
function commitReceiptSchema(exactCommit) {
  if (exactCommit.kind === "none") return { type: "null" };
  const common = { committed_action_digest: digestString(), client_key_bindings: arrayOf(bindingSchema()) };
  if (exactCommit.kind === "artifact_commit") return closedObject({ kind: constant("artifact_commit"), ...common, semantic_revision_delta: constant(1) });
  if (exactCommit.kind === "clarification_commit") return closedObject({
    kind: constant("clarification_commit"),
    ...common,
    semantic_revision_delta: constant(1),
    applied_clarification_impact: closedObject({
      preview_digest: digestString(),
      decision_ids: stringArray(),
      before_graph_digest: digestString(),
      after_graph_digest: digestString(),
      actual_projection: deterministicProjectionSchema()
    })
  }, ["kind", "committed_action_digest", "semantic_revision_delta", "client_key_bindings"]);
  if (exactCommit.kind === "operational_commit") return closedObject({ kind: constant("operational_commit"), ...common, semantic_revision_delta: constant(0), operational_effect: constant(exactCommit.effect) });
  throw new Error(`Unknown reply commit kind: ${exactCommit.kind}`);
}
function lastVerifiedStateSchema(exactState) {
  if (exactState.kind === "none") return closedObject({ kind: constant("none") });
  return closedObject({ kind: constant("checkpoint"), fsm_cell_id: constant(exactState.fsm_cell_id), stage: nonblankString(), obligation: nonblankString(), current_revision: { type: "integer", minimum: 0 }, checkpoint_digest: digestString() });
}
function workPacketDefinitionKey(exactWorkPacket) {
  const suffix = exactWorkPacket.kind === "terminal" ? exactWorkPacket.terminal_kind : exactWorkPacket.packet_kind;
  return `work_packet_${suffix.replaceAll(/[^A-Za-z0-9_]/gu, "_")}`;
}
function replySchemaBranch(row) {
  const diagnostics = row.exact_diagnostic.kind === "none" ? { type: "array", maxItems: 0, items: false } : { type: "array", minItems: 1, maxItems: 1, items: diagnosticSchema(row.exact_diagnostic.error_code) };
  if (row.exact_projection_kind === "pre_run_error") return closedObject({
    kind: constant("pre_run_error"),
    schema_version: constant(V5_SCHEMA_VERSION),
    reply_contract_id: constant(row.reply_contract_id),
    reply_status: constant(row.exact_reply_status),
    diagnostics
  });
  const identity = {
    kind: constant("run_reply"),
    schema_version: constant(V5_SCHEMA_VERSION),
    run_id: { type: "string", pattern: RUN_ID },
    run_directory: nonblankString(),
    case_document_lineage_id: nonblankString(),
    delivery_intent: { enum: ["case_document", "execution_plan"] },
    projection_kind: constant(row.exact_projection_kind),
    reply_contract_id: constant(row.reply_contract_id),
    run_lifecycle: constant(row.exact_lifecycle),
    reply_status: constant(row.exact_reply_status),
    selector_snapshot_digest: row.exact_projection_kind === "read_only_integrity_fatal" ? { type: "null" } : digestString(),
    available_actions: selectorsSchema(row.exact_action_templates),
    work_packet: { $ref: `#/$defs/${workPacketDefinitionKey(row.exact_work_packet)}` },
    commit_receipt: commitReceiptSchema(row.exact_commit),
    diagnostics
  };
  if (row.exact_projection_kind === "read_only_integrity_fatal") {
    return closedObject({ ...identity, last_verified_state: lastVerifiedStateSchema(row.exact_last_verified_state) });
  }
  return closedObject({
    ...identity,
    stage: constant(row.exact_stage),
    obligation: constant(row.exact_obligation),
    current_revision: { type: "integer", minimum: 0 },
    checkpoint_digest: digestString()
  });
}
function replySchema(contracts2) {
  const workPacketDefinitions = {};
  for (const row of contracts2.replyContracts.rows) {
    if (row.exact_work_packet.kind === "absent") continue;
    const key = workPacketDefinitionKey(row.exact_work_packet);
    if (!workPacketDefinitions[key]) workPacketDefinitions[key] = workPacketSchema(row.exact_work_packet, contracts2);
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "v5-reply-oneof.schema.json",
    $defs: workPacketDefinitions,
    oneOf: contracts2.replyContracts.rows.map(replySchemaBranch)
  };
}
function generateV5InterfaceSchemas(contracts2) {
  return {
    createRequest: createRequestSchema(),
    advanceRequest: advanceRequestSchema(),
    runIdentity: runIdentitySchema(),
    reply: replySchema(contracts2)
  };
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
  const acceptedClosureError = ["ACCEPTED_STATE_INTEGRITY_FAILURE", "CLARIFICATION_IMPACT_MISMATCH", "CANONICAL_RENDER_MISMATCH"].includes(errorCode);
  if (acceptedClosureError) {
    const inspectProfiles = V5_ACTIVE_FSM_CELL_IDS.concat(["cd.terminal.finished", "cd.terminal.cancelled", "cd.terminal.fatal", "ep.terminal.finished", "ep.terminal.cancelled", "ep.terminal.fatal"]).map((cellId) => ({ state_profile_id: `inspect.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "checkpoint" } }));
    if (errorCode === "ACCEPTED_STATE_INTEGRITY_FAILURE") inspectProfiles.push(
      { state_profile_id: "inspect.none.case", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "case_document" }, reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "none" } },
      { state_profile_id: "inspect.none.execution", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "execution_plan" }, reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "none" } }
    );
    const responses2 = [
      { response_variant_id: "inspect_verified", context: "run_inspect", state_profiles: inspectProfiles, response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: "mutation_terminalize", context: "run_mutation", state_profiles: V5_ACTIVE_FSM_CELL_IDS.concat(["cd.terminal.finished", "cd.terminal.cancelled", "ep.terminal.finished", "ep.terminal.cancelled"]).map((cellId) => persistedProfile(cellId, cellId.startsWith("cd.") ? "cd.terminal.fatal" : "ep.terminal.fatal")), response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "record_terminal_fatal", exact_commit: operationalCommit("fatal_incident_recorded"), next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: "mutation_already_fatal", context: "run_mutation", state_profiles: ["cd.terminal.fatal", "ep.terminal.fatal"].map((cellId) => ({ state_profile_id: `fatal.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: "read_only_integrity_fatal", last_verified_state_kind: "checkpoint" } })), response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey }
    ];
    if (errorCode === "ACCEPTED_STATE_INTEGRITY_FAILURE") {
      responses2.unshift({ response_variant_id: "pre_run_identity", context: "pre_run", response_channel: "pre_run_error", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "none", exact_commit: { kind: "none" }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
      responses2.splice(3, 0, { response_variant_id: "mutation_quarantine", context: "run_mutation", state_profiles: [
        { state_profile_id: "quarantine.none.case", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "case_document" }, reply_projection: { kind: "persisted_fsm_cell", reply_fsm_cell_id: "cd.terminal.fatal" } },
        { state_profile_id: "quarantine.none.execution", trigger_state: { kind: "no_verified_fsm_cell", delivery_intent: "execution_plan" }, reply_projection: { kind: "persisted_fsm_cell", reply_fsm_cell_id: "ep.terminal.fatal" } }
      ], response_channel: "run_reply", reply_status: "fatal", semantic_commit_policy: "no_semantic_commit", failure_record_policy: "record_terminal_fatal", exact_commit: operationalCommit("fatal_incident_recorded"), next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
    }
    return responses2;
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
    profiles = [
      persistedProfile("cd.active.requirements.resolve", "cd.active.requirements.confirm"),
      persistedProfile("cd.active.case.resolve", "cd.active.case.confirm")
    ];
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
  const executableErrorFixture = Object.freeze({
    ACCEPTED_STATE_INTEGRITY_FAILURE: "F-C15-protocol.protocol.read-only-integrity-fatal",
    COMPLEMENT_COVERAGE_OVERCLAIMED: "F-C11-complement.negative.empty-finite-partition"
  });
  const runtimeRules = Object.entries(V5_ERROR_CATALOG).map(([errorCode, catalogRow]) => {
    const phase = phaseLookup.get(errorCode);
    const responses = createRuntimeResponses(errorCode, catalogRow);
    return {
      rule_id: `ERROR.${errorCode}`,
      owner: "compiler",
      enforcement: ["schema", "invariant", "fsm", "transaction"],
      applicability: [...new Set(responses.map((response) => response.context))].map((context) => context === "pre_run" ? { kind: "pre_run" } : { kind: context, stages: ["source_acquisition", "requirements_analysis", "case_design", "execution_closure", "final_confirmation", "delivery"] }),
      normative_refs: [`SPEC.ERROR.${errorCode}`],
      test_ids: [
        /** @type {Record<string,string>} */
        executableErrorFixture[errorCode] ?? `F-${errorRequirement(errorCode)}.negative.rejection`
      ],
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
  const identityFixed = await readFixedSealedRecord(layout.identity, "run_identity_digest");
  const pointerFixed = await readFixedSealedRecord(layout.currentPointer, "pointer_digest");
  const pointer = pointerFixed.record;
  if (pointer.run_id !== identityFixed.record.run_id) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run pointer identity binding is invalid.");
  const genesis = await readSealedV5Record(layout.genesisRecords, pointer.run_genesis_record_digest, "run_genesis_record_digest");
  const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, "transaction_digest");
  if (transaction.transaction_kind === "integrity_quarantine") {
    const checkpoint2 = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, "checkpoint_digest");
    const selectorSidecar2 = await readSealedV5Record(layout.selectorSidecars, transaction.selector_sidecar_digest, "selector_sidecar_digest");
    const index2 = await readSealedV5Record(layout.idempotencyIndexes, transaction.idempotency_index_digest, "index_digest");
    const reply2 = await readCasJson(path2.join(layout.replies, digestFilename(transaction.reply_object_digest)), transaction.reply_object_digest);
    const receipt2 = await readSealedV5Record(layout.receipts, transaction.receipt_digest, "receipt_digest");
    const incident2 = await readSealedV5Record(layout.incidents, transaction.incident_record_digest, "incident_record_digest");
    if (genesis.run_id !== identityFixed.record.run_id || genesis.run_identity_digest !== identityFixed.record.run_identity_digest || canonicalV5Stringify(genesis.run_identity) !== canonicalV5Stringify(identityFixed.record) || transaction.run_id !== identityFixed.record.run_id || transaction.run_genesis_record_digest !== genesis.run_genesis_record_digest || transaction.previous_run_transaction_digest !== null || transaction.recovery_sequence !== 1) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Quarantine transaction identity binding is invalid.");
    if (checkpoint2.run_id !== identityFixed.record.run_id || checkpoint2.run_lifecycle !== "fatal" || checkpoint2.fatal_incident_record_digest !== incident2.incident_record_digest || selectorSidecar2.checkpoint_digest !== checkpoint2.checkpoint_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Quarantine checkpoint binding is invalid.");
    if (index2.scope !== "run_integrity_quarantine" || index2.index_sequence !== 1 || index2.entries.length !== 1 || receipt2.scope !== "run_integrity_quarantine") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Quarantine idempotency scope is invalid.");
    const entry = index2.entries[0];
    if (entry.idempotency_key !== receipt2.idempotency_key || entry.canonical_action_digest !== receipt2.canonical_action_digest || entry.receipt_digest !== receipt2.receipt_digest || entry.reply_digest !== transaction.reply_object_digest || receipt2.reply_object_ref.reply_digest !== transaction.reply_object_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Quarantine receipt/index/reply binding is invalid.");
    return { layout, identity: identityFixed.record, pointer, pointerBytes: pointerFixed.bytes, genesis, transaction, checkpoint: checkpoint2, selectorSidecar: selectorSidecar2, index: index2, receipt: receipt2, operationalEvent: null, incident: incident2, reply: reply2 };
  }
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
  let incident = null;
  if (transaction.operational_event_ref?.kind !== "none") {
    if (transaction.operational_event_ref?.kind !== "cancel_event" || typeof transaction.operational_event_ref.event_digest !== "string") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Operational event reference is invalid.");
    operationalEvent = await readSealedV5Record(layout.events, transaction.operational_event_ref.event_digest, "cancel_event_digest");
  }
  if (transaction.transaction_kind === "normal_fatal") {
    if (typeof transaction.incident_record_digest !== "string") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Normal fatal transaction has no incident binding.");
    incident = await readSealedV5Record(layout.incidents, transaction.incident_record_digest, "incident_record_digest");
    if (checkpoint.fatal_incident_record_digest !== incident.incident_record_digest || incident.previous_run_transaction_digest !== transaction.previous_run_transaction_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Normal fatal incident binding is invalid.");
  } else if (Object.hasOwn(transaction, "incident_record_digest")) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Non-fatal transaction unexpectedly references a fatal incident.");
  if (genesis.run_id !== identityFixed.record.run_id || genesis.run_identity_digest !== identityFixed.record.run_identity_digest || canonicalV5Stringify(genesis.run_identity) !== canonicalV5Stringify(identityFixed.record) || genesis.run_directory_key !== identityFixed.record.run_directory_key || genesis.case_document_lineage_id !== identityFixed.record.case_document_lineage_id || genesis.checkpoint_digest !== chainCursor.checkpoint_digest || genesis.selector_sidecar_digest !== chainCursor.selector_sidecar_digest || chainCursor.run_identity_digest !== identityFixed.record.run_identity_digest || path2.basename(layout.root) !== identityFixed.record.run_directory_key || transaction.run_id !== identityFixed.record.run_id || checkpoint.run_id !== identityFixed.record.run_id || index.run_id !== identityFixed.record.run_id) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Run object cross-binding is invalid.");
  if (selectorSidecar.checkpoint_digest !== checkpoint.checkpoint_digest || index.index_sequence !== transaction.transaction_sequence || index.entries.length !== transaction.transaction_sequence) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Checkpoint/sidecar/index sequence binding is invalid.");
  if (receipt && (receipt.reply_object_ref.reply_digest !== transaction.reply_object_digest || !index.entries.some((entry) => entry.receipt_digest === receipt.receipt_digest && entry.reply_digest === transaction.reply_object_digest))) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Receipt/index/reply binding is invalid.");
  if (operationalEvent && (checkpoint.cancel_event_digest !== operationalEvent.cancel_event_digest || receipt?.canonical_action_digest !== operationalEvent.canonical_cancel_action_digest || transaction.previous_run_transaction_digest !== operationalEvent.previous_run_transaction_digest)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Cancel event transaction binding is invalid.");
  for (const entry of index.entries) {
    const indexedReceipt = await readSealedV5Record(layout.receipts, entry.receipt_digest, "receipt_digest");
    if (indexedReceipt.run_id !== identityFixed.record.run_id || indexedReceipt.idempotency_key !== entry.idempotency_key || indexedReceipt.canonical_action_digest !== entry.canonical_action_digest || indexedReceipt.reply_object_ref.reply_digest !== entry.reply_digest) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Indexed receipt binding is invalid.");
    await readCasJson(path2.join(layout.replies, digestFilename(entry.reply_digest)), entry.reply_digest);
  }
  return { layout, identity: identityFixed.record, pointer, pointerBytes: pointerFixed.bytes, genesis, transaction, checkpoint, selectorSidecar, index, receipt, operationalEvent, incident, reply };
}
var COMPILER_SEALED_DIGEST_FIELDS = /* @__PURE__ */ new Map([
  ["source_acquisition_state_digest", "state_digest"],
  ["semantic_review_seed_digest", "seed_digest"],
  ["term_registry_digest", "registry_digest"],
  ["behavior_contract_seed_digest", "seed_digest"],
  ["clarification_gaps_digest", "gaps_digest"],
  ["pending_clarification_digest", "pending_record_digest"],
  ["test_obligations_digest", "obligations_digest"],
  ["case_compilation_context_digest", "context_digest"],
  ["provenance_graph_digest", "graph_digest"]
]);
function acceptedClosureFailure(code, targetKind, affectedRefs, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new V5ProtocolError(code, `${targetKind} accepted-closure verification failed: ${detail}`);
  error.integrity_target_kind = targetKind;
  error.affected_refs = [...affectedRefs];
  return error;
}
async function verifyV5AcceptedClosure(current) {
  const acceptedDigests = [...new Set(current.checkpoint.accepted_artifact_digests ?? [])].sort();
  for (const digest4 of acceptedDigests) {
    try {
      await readSealedV5Record(current.layout.acceptedArtifacts, digest4, "envelope_digest");
    } catch (error) {
      throw acceptedClosureFailure("ACCEPTED_STATE_INTEGRITY_FAILURE", "accepted_artifact", [digest4], error);
    }
  }
  const compilerRefs = [];
  const scalarFields = [
    "source_acquisition_state_digest",
    "accepted_source_state_digest",
    "semantic_review_seed_digest",
    "term_registry_digest",
    "behavior_contract_seed_digest",
    "clarification_gaps_digest",
    "question_part_state_set_digest",
    "presentation_digest",
    "preview_digest",
    "pending_clarification_digest",
    "test_obligations_digest",
    "risk_ledger_digest",
    "case_compilation_context_digest",
    "provenance_graph_digest",
    "case_document_digest",
    "execution_plan_digest",
    "execution_snapshot_digest",
    "final_execution_projection_digest"
  ];
  for (const field of scalarFields) if (typeof current.checkpoint[field] === "string") compilerRefs.push({ field, digest: current.checkpoint[field] });
  const arrayFields = ["accepted_decision_digests", "accepted_execution_receipt_digests", "compiler_projection_digests"];
  for (const field of arrayFields) for (const digest4 of current.checkpoint[field] ?? []) if (typeof digest4 === "string") compilerRefs.push({ field, digest: digest4 });
  for (const { field, digest: digest4 } of compilerRefs.sort((left, right) => `${left.field}:${left.digest}`.localeCompare(`${right.field}:${right.digest}`))) {
    try {
      const digestField = field === "compiler_projection_digests" ? "projection_record_digest" : COMPILER_SEALED_DIGEST_FIELDS.get(field);
      if (digestField) await readSealedV5Record(current.layout.compilerState, digest4, digestField);
      else await readSemanticV5Record(current.layout.compilerState, digest4);
    } catch (error) {
      throw acceptedClosureFailure("ACCEPTED_STATE_INTEGRITY_FAILURE", "compiler_state", [digest4], error);
    }
  }
  if (typeof current.checkpoint.applied_clarification_impact_digest === "string") {
    const digest4 = current.checkpoint.applied_clarification_impact_digest;
    try {
      const impact = await readSemanticV5Record(current.layout.compilerState, digest4);
      if (impact.impact_digest !== digest4) throw new V5ProtocolError("CLARIFICATION_IMPACT_MISMATCH", "Applied clarification impact digest binding is invalid.");
    } catch (error) {
      throw acceptedClosureFailure("CLARIFICATION_IMPACT_MISMATCH", "compiler_projection", [digest4], error);
    }
  }
  for (const digest4 of [...new Set(current.checkpoint.rendered_output_digests ?? [])].sort()) {
    try {
      await readSealedV5Record(current.layout.renderedOutputs, digest4, "rendered_output_digest");
    } catch (error) {
      throw acceptedClosureFailure("CANONICAL_RENDER_MISMATCH", "renderer_output", [digest4], error);
    }
  }
  return current;
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
var EVIDENCE_LEVEL_RANK = Object.freeze({ E1: 1, E2: 2, E3: 3 });
function validateEvidenceReference(ref, context, options = {}) {
  const errorCode = options.errorCode ?? "SEMANTIC_REVIEW_CANDIDATE_UNKNOWN";
  const fail = (message) => {
    throw new V5ProtocolError(errorCode, message);
  };
  if (!object(ref) || !nonblank2(ref.kind)) return fail("Evidence reference is not a closed accepted reference.");
  if (ref.kind === "source_unit") {
    if (!options.allowSourceUnit || !exact(ref, ["kind", "source_unit_id"]) || !nonblank2(ref.source_unit_id) || !context.sourceUnitIds.has(ref.source_unit_id)) return fail("Source-unit evidence does not resolve to an accepted source unit.");
    return ref;
  }
  const idField = ref.kind === "claim" ? "claim_id" : ref.kind === "decision" ? "decision_id" : null;
  if (!idField || !exact(ref, ["kind", idField]) || !nonblank2(ref[idField])) return fail("Evidence reference must be an exact Claim or Decision reference.");
  const level = context.evidenceLevels.get(ref[idField]);
  const minimum = options.minimumLevel ?? "E1";
  if (!level || /** @type {Record<string,number>} */
  EVIDENCE_LEVEL_RANK[level] < /** @type {Record<string,number>} */
  EVIDENCE_LEVEL_RANK[minimum]) return fail(`Evidence ${ref[idField]} is not accepted at ${minimum} or above.`);
  return ref;
}
function validateBehaviorEvidenceClosure(value, context) {
  const visit = (current, allowSourceUnit = false) => {
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, allowSourceUnit));
      return;
    }
    if (!object(current)) return;
    if (["claim", "decision", "source_unit"].includes(current.kind)) validateEvidenceReference(current, context, { allowSourceUnit });
    for (const [key, child] of Object.entries(current)) visit(child, key === "review_basis" || key === "trigger_basis");
  };
  visit(value);
  return structuredClone(value);
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
function validateFieldCorrespondence(mapping, ruleIndex) {
  const fail = (message) => {
    throw new V5ProtocolError("FIELD_CORRESPONDENCE_REQUIRED", message);
  };
  try {
    if (!object(mapping) || !nonblank2(mapping.mapping_client_key) || !["left", "right"].includes(mapping.authority_side) || !nonempty(mapping.basis)) return fail("Field mapping identity or basis is missing.");
    const sideKeys = ["semantic_role", "logical_surface_ref", "collection_path", "item_field_path"];
    if (!exact(mapping.left, sideKeys) || !exact(mapping.right, sideKeys) || ![mapping.left, mapping.right].every((side) => ["ui", "authoritative_source", "peer_surface"].includes(side.semantic_role) && [side.logical_surface_ref, side.collection_path, side.item_field_path].every(nonblank2))) return fail("Field sides are not closed.");
    if (mapping[mapping.authority_side].semantic_role !== "authoritative_source" || [mapping.left, mapping.right].filter((side) => side.semantic_role === "authoritative_source").length !== 1) return fail("Exactly the authority side must be authoritative_source.");
    if (mapping.join?.kind === "singleton") {
      if (!exact(mapping.join, ["kind"])) return fail("Singleton join cannot contain record keys.");
    } else if (mapping.join?.kind === "key_equality") {
      const allowed = mapping.join.key_normalization_ref ? ["kind", "left_key_path", "right_key_path", "cardinality", "key_normalization_ref"] : ["kind", "left_key_path", "right_key_path", "cardinality"];
      if (!exact(mapping.join, allowed) || !nonblank2(mapping.join.left_key_path) || !nonblank2(mapping.join.right_key_path) || !["one_to_one", "many_to_one", "one_to_many"].includes(mapping.join.cardinality)) return fail("Key join is incomplete.");
      if (mapping.join.key_normalization_ref) resolveSemanticRuleRef(mapping.join.key_normalization_ref, "key_normalization", ruleIndex);
    } else return fail("Join kind is unknown.");
    if (mapping.transform?.kind === "identity") {
      if (!exact(mapping.transform, ["kind"])) return fail("Identity transform is not closed.");
    } else if (mapping.transform?.kind === "registered" && exact(mapping.transform, ["kind", "transform_ref"])) resolveSemanticRuleRef(mapping.transform.transform_ref, "transform", ruleIndex);
    else return fail("Transform must be identity or a typed registered rule.");
    if (mapping.comparison?.kind === "strict_equal") {
      if (!exact(mapping.comparison, ["kind"])) return fail("Strict comparison cannot carry normalization.");
    } else if (mapping.comparison?.kind === "normalized_equal" && exact(mapping.comparison, ["kind", "normalization_ref"])) resolveSemanticRuleRef(mapping.comparison.normalization_ref, "value_normalization", ruleIndex);
    else return fail("Comparison branch is invalid.");
    resolveSemanticRuleRef(mapping.null_policy_ref, "null_policy", ruleIndex);
    if (!(mapping.freshness?.kind === "same_logical_snapshot" && exact(mapping.freshness, ["kind"])) && !(mapping.freshness?.kind === "within_business_window" && exact(mapping.freshness, ["kind", "duration_ms"]) && Number.isSafeInteger(mapping.freshness.duration_ms) && mapping.freshness.duration_ms > 0)) return fail("Freshness is not executable.");
    return structuredClone(mapping);
  } catch (error) {
    if (error instanceof V5ProtocolError && error.code === "ORACLE_NOT_DECIDABLE") return fail(error.message);
    throw error;
  }
}
function compileClosedDomain(semanticRootDigest, input) {
  const fail = (message) => {
    throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", message);
  };
  const failComplementCoverage = (message) => {
    throw new V5ProtocolError("COMPLEMENT_COVERAGE_OVERCLAIMED", message);
  };
  if (!object(input) || input.domain?.kind !== "closed_enum" || !nonblank2(input.domain_client_key) || !nonblank2(input.subject_ref) || !nonblank2(input.field_path) || !nonempty(input.domain.members) || !nonempty(input.domain.closed_world_basis) || !nonempty(input.partitions)) return fail("Closed Domain is incomplete.");
  if (
    /** @type {any[]} */
    input.domain.members.some((value) => !validateTypedValue(value))
  ) return fail("Domain members must be typed values.");
  const memberMap = new Map(
    /** @type {any[]} */
    input.domain.members.map((value) => [canonicalV5Stringify(value), value])
  );
  if (memberMap.size !== input.domain.members.length) return fail("Domain members must be unique.");
  const claimed = /* @__PURE__ */ new Set();
  let complementCount = 0;
  const domainAnchorDigest = canonicalObjectDigest({ subject_ref: input.subject_ref, field_path: input.field_path, domain: input.domain });
  const partitions = (
    /** @type {Array<Record<string, any>>} */
    input.partitions.map((partition) => {
      if (partition.kind === "exact_members") {
        if (!exact(partition, ["partition_client_key", "kind", "semantic_role", "values"]) || !["target", "other"].includes(partition.semantic_role) || !nonempty(partition.values)) return fail("Exact partition is invalid.");
        const values = [...new Map(
          /** @type {any[]} */
          partition.values.map((value) => [canonicalV5Stringify(value), value])
        ).values()];
        if (values.length !== partition.values.length || values.some((value) => !memberMap.has(canonicalV5Stringify(value)) || claimed.has(canonicalV5Stringify(value)))) return fail("Exact partitions overlap or escape the universe.");
        values.forEach((value) => claimed.add(canonicalV5Stringify(value)));
        const normalized = { kind: partition.kind, semantic_role: partition.semantic_role, values };
        return { ...structuredClone(partition), partition_id: stableV5Id("domain_partition", { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
      }
      if (partition.kind === "complement") {
        complementCount += 1;
        if (complementCount > 1 || !exact(partition, ["partition_client_key", "kind", "semantic_role", "universe", "excluded_values"]) || partition.semantic_role !== "complement" || canonicalV5Stringify(partition.universe) !== '{"kind":"parent_domain"}' || !Array.isArray(partition.excluded_values)) return fail("Complement partition is invalid.");
        const excluded = new Set(
          /** @type {any[]} */
          partition.excluded_values.map((value) => canonicalV5Stringify(value))
        );
        if ([...excluded].some((key) => !memberMap.has(key))) return fail("Complement exclusion escapes the universe.");
        const derived = [...memberMap.entries()].filter(([key]) => !excluded.has(key)).map(([, value]) => value);
        if (derived.length === 0 || derived.some((value) => claimed.has(canonicalV5Stringify(value)))) return failComplementCoverage("Complement coverage must be nonempty and disjoint from explicitly claimed members.");
        derived.forEach((value) => claimed.add(canonicalV5Stringify(value)));
        const normalized = { kind: partition.kind, semantic_role: partition.semantic_role, universe: partition.universe, excluded_values: partition.excluded_values };
        return { ...structuredClone(partition), derived_members: derived, partition_id: stableV5Id("domain_partition", { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
      }
      return fail("Closed enums allow only exact and complement partitions.");
    })
  );
  if (claimed.size !== memberMap.size) return fail("Closed Domain partitions must cover the complete universe.");
  const partitionIds = partitions.map((partition) => partition.partition_id).sort();
  return { ...structuredClone(input), partitions, domain_contract_id: stableV5Id("domain_contract", { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, partition_ids: partitionIds }) };
}
function compileDomain(semanticRootDigest, input, predicateContracts = [], acceptedContractRefs) {
  if (input.domain?.kind === "closed_enum") return compileClosedDomain(semanticRootDigest, input);
  const fail = (message) => {
    throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", message);
  };
  if (!object(input) || !["predicate_partition", "open_domain"].includes(input.domain?.kind) || !nonblank2(input.domain_client_key) || !nonblank2(input.subject_ref) || !nonblank2(input.field_path) || !nonempty(input.partitions)) return fail("Predicate/Open Domain is incomplete.");
  const contractByKey = new Map(predicateContracts.map((contract) => [contract.predicate_contract_client_key, contract]));
  const boundaryBasis = input.domain.kind === "open_domain" ? input.domain.boundary_basis : input.domain.boundary_basis;
  if (!nonempty(boundaryBasis) || input.domain.kind === "open_domain" && !nonblank2(input.domain.boundary_description) || input.domain.kind === "predicate_partition" && !typedRef(input.domain.universe_ref, "universe", semanticRootDigest, acceptedContractRefs)) return fail("Domain boundary is not closed by evidence and a typed universe.");
  const domainAnchorDigest = canonicalObjectDigest({ subject_ref: input.subject_ref, field_path: input.field_path, domain: input.domain });
  const partitions = (
    /** @type {Array<Record<string,any>>} */
    input.partitions.map((partition) => {
      if (!exact(partition, ["partition_client_key", "kind", "semantic_role", "predicate_contract_client_key"]) || partition.kind !== "predicate" || !["target", "other"].includes(partition.semantic_role)) return fail("Open/predicate Domains allow only predicate partitions.");
      const contract = contractByKey.get(partition.predicate_contract_client_key);
      if (!contract || !nonempty(contract.basis) || !typedRef(contract.predicate_ref, "domain_predicate", semanticRootDigest, acceptedContractRefs) || input.domain.kind === "open_domain" && contract.exhaustiveness !== "non_exhaustive_open_set") return fail("Predicate partition does not resolve to an admissible typed contract.");
      const normalized = { kind: "predicate", semantic_role: partition.semantic_role, predicate_contract_client_key: partition.predicate_contract_client_key };
      return { ...structuredClone(partition), partition_id: stableV5Id("domain_partition", { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
    })
  );
  if (new Set(partitions.map((partition) => partition.partition_client_key)).size !== partitions.length) return fail("Predicate partition keys must be unique.");
  const partitionIds = partitions.map((partition) => partition.partition_id).sort();
  return { ...structuredClone(input), partitions, domain_contract_id: stableV5Id("domain_contract", { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, partition_ids: partitionIds }) };
}
function typedContractRefKey(ref) {
  return canonicalV5Stringify(ref);
}
function typedRef(ref, kind, root, acceptedContractRefs) {
  return object(ref) && exact(ref, ["contract_id", "contract_kind", "semantic_root_digest"]) && nonblank2(ref.contract_id) && ref.contract_kind === kind && ref.semantic_root_digest === root && (!acceptedContractRefs || acceptedContractRefs.has(typedContractRefKey(ref)));
}
function validatePopulationContract(contract, semanticRootDigest, acceptedContractRefs) {
  const fail = () => {
    throw new V5ProtocolError("POPULATION_CONTRACT_REQUIRED", "Population scope needs exact current-root typed contracts.");
  };
  if (!object(contract) || !exact(contract, ["population_contract_client_key", "scope"]) || !nonblank2(contract.population_contract_client_key) || !object(contract.scope)) return fail();
  const scope = contract.scope;
  const optionalFilter = !scope.filter_ref || typedRef(scope.filter_ref, "filter", semanticRootDigest, acceptedContractRefs);
  let valid = false;
  if (scope.kind === "single_item") valid = exact(scope, ["kind", "identity_contract_ref"]) && typedRef(scope.identity_contract_ref, "identity", semanticRootDigest, acceptedContractRefs);
  else if (scope.kind === "visible_region") valid = exact(scope, ["kind", "region_contract_ref"]) && typedRef(scope.region_contract_ref, "region", semanticRootDigest, acceptedContractRefs);
  else if (scope.kind === "current_page" || scope.kind === "current_response") valid = exact(scope, scope.filter_ref ? ["kind", "collection_ref", "filter_ref"] : ["kind", "collection_ref"]) && typedRef(scope.collection_ref, "collection", semanticRootDigest, acceptedContractRefs) && optionalFilter;
  else if (scope.kind === "all_pages") valid = exact(scope, scope.filter_ref ? ["kind", "collection_ref", "filter_ref", "page_model_ref", "termination_contract_ref", "consistency_contract_ref"] : ["kind", "collection_ref", "page_model_ref", "termination_contract_ref", "consistency_contract_ref"]) && typedRef(scope.collection_ref, "collection", semanticRootDigest, acceptedContractRefs) && optionalFilter && typedRef(scope.page_model_ref, "page_model", semanticRootDigest, acceptedContractRefs) && typedRef(scope.termination_contract_ref, "termination", semanticRootDigest, acceptedContractRefs) && typedRef(scope.consistency_contract_ref, "consistency", semanticRootDigest, acceptedContractRefs);
  else if (scope.kind === "full_dataset") {
    const keys = ["kind", "universe_ref", "snapshot_contract_ref", "consistency_contract_ref", ...scope.filter_ref ? ["filter_ref"] : [], ...scope.tenant_or_region_ref ? ["tenant_or_region_ref"] : []];
    valid = exact(scope, keys) && typedRef(scope.universe_ref, "universe", semanticRootDigest, acceptedContractRefs) && optionalFilter && (!scope.tenant_or_region_ref || typedRef(scope.tenant_or_region_ref, "tenant_or_region", semanticRootDigest, acceptedContractRefs)) && typedRef(scope.snapshot_contract_ref, "snapshot", semanticRootDigest, acceptedContractRefs) && typedRef(scope.consistency_contract_ref, "consistency", semanticRootDigest, acceptedContractRefs);
  }
  if (!valid) return fail();
  return structuredClone(contract);
}
function validatePopulationProof(proof, semanticRootDigest, populationClientKeys, acceptedContractRefs) {
  const fail = () => {
    throw new V5ProtocolError("POPULATION_CONTRACT_REQUIRED", "Population proof must bind one current-root typed proof contract.");
  };
  if (!object(proof) || !nonblank2(proof.proof_client_key) || !populationClientKeys.includes(proof.population_contract_client_key) || !object(proof.payload)) return fail();
  const payload = proof.payload;
  if (payload.kind === "enumerate_population") {
    if (!exact(proof, ["proof_client_key", "population_contract_client_key", "payload"]) || !exact(payload, ["kind", "enumeration_contract_ref"]) || !typedRef(payload.enumeration_contract_ref, "enumeration", semanticRootDigest, acceptedContractRefs)) return fail();
  } else if (payload.kind === "authoritative_aggregate") {
    if (!exact(proof, ["proof_client_key", "population_contract_client_key", "payload", "basis"]) || !nonempty(proof.basis) || !exact(payload, ["kind", "aggregate_contract_ref"]) || !typedRef(payload.aggregate_contract_ref, "aggregate", semanticRootDigest, acceptedContractRefs)) return fail();
  } else if (payload.kind === "sourced_invariant") {
    if (!exact(proof, ["proof_client_key", "population_contract_client_key", "payload", "basis"]) || !nonempty(proof.basis) || !exact(payload, ["kind", "invariant_contract_ref"]) || !typedRef(payload.invariant_contract_ref, "invariant", semanticRootDigest, acceptedContractRefs)) return fail();
  } else return fail();
  return structuredClone(proof);
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
function validateRiskReviews(semanticRootDigest, moduleIds, reviews, context) {
  const expected = moduleIds.flatMap((moduleRef) => RISK_KINDS.map((riskKind) => `${moduleRef}\0${riskKind}`)).sort();
  const actual = reviews.map((review) => `${review.module_ref}\0${review.risk_kind}`).sort();
  if (new Set(actual).size !== actual.length || canonicalV5Stringify(actual) !== canonicalV5Stringify(expected)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk reviews must exactly cover module \xD7 nine-risk denominator.");
  const items = [];
  for (const review of reviews) {
    if (!nonblank2(review.review_client_key) || !nonempty(review.review_basis) || !RISK_KINDS.includes(review.risk_kind)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk review identity or basis is missing.");
    review.review_basis.forEach((ref) => validateEvidenceReference(ref, context, { allowSourceUnit: true, errorCode: "RISK_LEDGER_INVALID" }));
    if (review.risk_signal_status === "no_signal") {
      if (Object.hasOwn(review, "risk_item")) throw new V5ProtocolError("RISK_LEDGER_INVALID", "no_signal review cannot carry a risk item.");
      continue;
    }
    const item = review.risk_item;
    if (review.risk_signal_status !== "signal_found" || !object(item) || !nonblank2(item.candidate_client_key) || !nonempty(item.trigger_basis) || !nonempty(item.affected_refs) || !nonblank2(item.why_material) || !nonblank2(item.recommended_action) || !["low", "medium", "high", "critical"].includes(item.severity) || !["low", "medium", "high"].includes(item.likelihood) || !["low", "medium", "high"].includes(item.evidence_confidence) || !["low", "medium", "high"].includes(item.testability)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Signal-found risk item is incomplete.");
    item.trigger_basis.forEach((ref) => validateEvidenceReference(ref, context, { allowSourceUnit: true, errorCode: "RISK_LEDGER_INVALID" }));
    if (item.risk_disposition === "formal_requirement") {
      if (!nonblank2(item.formal_claim_id)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Formal risk needs a Claim.");
      validateEvidenceReference({ kind: "claim", claim_id: item.formal_claim_id }, context, { minimumLevel: "E2", errorCode: "RISK_LEDGER_INVALID" });
    }
    if (item.risk_disposition === "semantic_gap" && (!object(item.gap_ref) || !(item.gap_ref.kind === "accepted_gap" && exact(item.gap_ref, ["kind", "semantic_gap_id"]) && nonblank2(item.gap_ref.semantic_gap_id) || item.gap_ref.kind === "same_behavior_batch" && exact(item.gap_ref, ["kind", "semantic_gap_client_key"]) && nonblank2(item.gap_ref.semantic_gap_client_key)))) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Risk gap reference is missing or not closed.");
    if (item.risk_disposition === "exploratory" && !nonblank2(item.observation_intent)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "Exploratory risk needs a nonblank observation intent.");
    if (item.risk_disposition === "not_applicable") {
      if (!nonempty(item.exclusion_basis)) throw new V5ProtocolError("RISK_LEDGER_INVALID", "N/A risk needs E2/E3 exclusion basis.");
      item.exclusion_basis.forEach((ref) => validateEvidenceReference(ref, context, { minimumLevel: "E2", errorCode: "RISK_LEDGER_INVALID" }));
    }
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
function validateBehaviorContractReviews(seed, reviews, artifact, evidenceContext) {
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
      if (requirement.contract_kind === "permission_auxiliary") {
        if (disposition.contract_client_keys.length !== 1) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Permission auxiliary requirement resolves to exactly one contract.");
        const contract = (
          /** @type {Array<Record<string,any>>} */
          artifact.permission_auxiliary_contracts.find((item) => item.contract_client_key === disposition.contract_client_keys[0])
        );
        if (!contract || contract.payload?.contract_kind !== requirement.auxiliary_contract_kind || canonicalV5Stringify(contract.permission_target) !== canonicalV5Stringify(requirement.permission_target)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Permission auxiliary review must bind the exact advertised kind and permission target.");
      }
    } else if (disposition.kind === "semantic_gap") {
      if (!object(disposition.gap_ref)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Behavior gap disposition needs an exact gap reference.");
    } else if (disposition.kind === "not_applicable") {
      if (!nonempty(disposition.basis)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "N/A behavior disposition needs E2/E3 basis.");
      if (evidenceContext) disposition.basis.forEach((ref) => validateEvidenceReference(ref, evidenceContext, { minimumLevel: "E2", errorCode: "SEMANTIC_REVIEW_CANDIDATE_MISSING" }));
    } else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior disposition kind is unknown.");
  }
  return structuredClone(reviews);
}

// src/v5/oracles.mjs
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
function uniqueTyped(values) {
  return new Set(values.map((value) => canonicalV5Stringify(value))).size === values.length && values.every(validateTypedValue);
}
function validateOracleAssertion(assertion, context) {
  const fail = (message = "Oracle assertion is not a closed decidable branch.") => {
    throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", message);
  };
  if (!object2(assertion) || typeof assertion.kind !== "string") return fail();
  if (assertion.kind === "exact_text") {
    if (!exact2(assertion, ["kind", "expected_text"]) || !nonblank3(assertion.expected_text)) return fail();
  } else if (assertion.kind === "semantic_text") {
    if (!exact2(assertion, ["kind", "expected_text", "equivalence_rule_ref"]) || !nonblank3(assertion.expected_text)) return fail();
    resolveSemanticRuleRef(assertion.equivalence_rule_ref, "semantic_equivalence", context.semanticRuleIndex);
  } else if (assertion.kind === "value_equals") {
    const keys = assertion.normalization_ref ? ["kind", "expected_value", "normalization_ref"] : ["kind", "expected_value"];
    if (!exact2(assertion, keys) || !validateTypedValue(assertion.expected_value)) return fail();
    if (assertion.normalization_ref) resolveSemanticRuleRef(assertion.normalization_ref, "value_normalization", context.semanticRuleIndex);
  } else if (assertion.kind === "value_state_equals") {
    if (!exact2(assertion, ["kind", "expected_value_state"])) return fail();
    try {
      validateValueState(assertion.expected_value_state);
    } catch {
      return fail();
    }
  } else if (assertion.kind === "exists" || assertion.kind === "absent") {
    if (!exact2(assertion, ["kind"])) return fail();
  } else if (assertion.kind === "set_contains" || assertion.kind === "set_equals") {
    const keys = assertion.kind === "set_contains" ? ["kind", "expected_members", "normalization_ref"] : ["kind", "expected_members", "order_sensitive", "normalization_ref"];
    if (!exact2(assertion, keys) || !Array.isArray(assertion.expected_members) || assertion.kind === "set_contains" && assertion.expected_members.length === 0 || !uniqueTyped(assertion.expected_members) || assertion.kind === "set_equals" && typeof assertion.order_sensitive !== "boolean") return fail();
    resolveSemanticRuleRef(assertion.normalization_ref, "value_normalization", context.semanticRuleIndex);
  } else if (assertion.kind === "count_equals" || assertion.kind === "count_at_least") {
    const field = assertion.kind === "count_equals" ? "expected_count" : "minimum_count";
    if (!exact2(assertion, ["kind", field]) || !Number.isSafeInteger(assertion[field]) || assertion[field] < 0) return fail();
  } else if (assertion.kind === "transition") {
    const keys = assertion.trigger_step_client_key ? ["kind", "from_state", "to_state", "trigger_action_ref", "trigger_step_client_key"] : ["kind", "from_state", "to_state", "trigger_action_ref"];
    if (!exact2(assertion, keys) || !validateTypedValue(assertion.from_state) || !validateTypedValue(assertion.to_state) || !nonblank3(assertion.trigger_action_ref?.action_id) || assertion.trigger_action_ref.semantic_root_digest !== context.semanticRootDigest || assertion.trigger_step_client_key !== void 0 && !nonblank3(assertion.trigger_step_client_key)) return fail();
  } else if (assertion.kind === "cross_surface_equals") {
    if (!exact2(assertion, ["kind", "field_correspondence_id"]) || !context.fieldCorrespondenceIds?.includes(assertion.field_correspondence_id)) return fail();
  } else if (assertion.kind === "permission") {
    if (assertion.expected === "allow") {
      if (!exact2(assertion, ["kind", "expected", "decision_cell_ref"])) return fail();
    } else if (assertion.expected === "deny") {
      if (!exact2(assertion, ["kind", "expected", "decision_cell_ref", "denial_behavior"]) || !object2(assertion.denial_behavior)) return fail();
      if (assertion.denial_behavior.kind === "not_required" && !exact2(assertion.denial_behavior, ["kind"])) return fail();
      if (assertion.denial_behavior.kind === "required" && !exact2(assertion.denial_behavior, ["kind", "denial_required_cell_key", "denial_contract_ref"])) return fail();
      if (!["not_required", "required"].includes(assertion.denial_behavior.kind)) return fail();
    } else return fail();
    const cells = (
      /** @type {Array<Record<string,any>>} */
      context.permissionCells ?? []
    );
    const decisionCell = cells.find((cell) => cell.matrix_id === assertion.decision_cell_ref?.matrix_id && cell.required_cell_key === assertion.decision_cell_ref?.required_cell_key && cell.permission_dimension === "decision");
    if (!decisionCell || decisionCell.formal_outcome?.permission_dimension !== "decision" || decisionCell.formal_outcome.expected !== assertion.expected) return fail("Permission Oracle expected value must equal the accepted formal decision cell.");
    if (assertion.expected === "deny") {
      const coordinateKeys = ["role_ref", "resource_ref", "action_ref", "context_key"];
      const denialCell = cells.find((cell) => cell.matrix_id === decisionCell.matrix_id && cell.permission_dimension === "denial_behavior" && coordinateKeys.every((key) => canonicalV5Stringify(cell[key]) === canonicalV5Stringify(decisionCell[key])));
      if (!denialCell) {
        if (assertion.denial_behavior.kind !== "not_required") return fail("Permission Oracle supplied a denial contract for a coordinate without a required denial cell.");
      } else {
        const denial = assertion.denial_behavior;
        const formalRef = denialCell.formal_outcome?.denial_contract_ref;
        if (denial.kind !== "required" || denial.denial_required_cell_key !== denialCell.required_cell_key || denialCell.formal_outcome?.permission_dimension !== "denial_behavior" || denialCell.formal_outcome.decision_cell_key !== decisionCell.required_cell_key || canonicalV5Stringify(denial.denial_contract_ref) !== canonicalV5Stringify(formalRef)) return fail("Permission Oracle must bind the exact same-coordinate formal denial cell and contract.");
        const ref = denial.denial_contract_ref?.ref;
        if (denial.denial_contract_ref?.kind !== "accepted" || ref?.contract_kind !== "denial_behavior" || ref.semantic_root_digest !== context.semanticRootDigest) return fail();
        if (context.acceptedContractRefs && !context.acceptedContractRefs.has(typedContractRefKey(ref))) return fail("Denial behavior contract does not resolve to the current accepted inventory.");
      }
    }
  } else return fail();
  return structuredClone(assertion);
}
function validateObservation(observation, context) {
  if (!object2(observation) || !["ui", "response", "storage", "event", "system_state"].includes(observation.kind) || !nonblank3(observation.logical_surface_ref) || !nonblank3(observation.subject_ref)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation reference is invalid.");
  const common = ["kind", "logical_surface_ref", "subject_ref", ...Object.hasOwn(observation, "field_path") ? ["field_path"] : []];
  if (Object.hasOwn(observation, "field_path") && !nonblank3(observation.field_path)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation field path must be nonblank when present.");
  if (observation.kind === "ui") {
    if (!exact2(observation, [...common, "locator_contract_ref"])) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "UI observation has non-contract fields.");
    resolveSemanticRuleRef(observation.locator_contract_ref, "locator", context.semanticRuleIndex);
  } else if (!exact2(observation, common)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Observation has non-contract fields.");
}
function validateObservationWindow(window) {
  return object2(window) && (window.kind === "after_step" && exact2(window, ["kind"]) || ["within", "stable_for"].includes(window.kind) && exact2(window, ["kind", "duration_ms"]) && Number.isSafeInteger(window.duration_ms) && window.duration_ms > 0 || window.kind === "until_signal" && exact2(window, ["kind", "signal_ref", "timeout_ms"]) && nonblank3(window.signal_ref) && Number.isSafeInteger(window.timeout_ms) && window.timeout_ms > 0);
}
function validateOracleSemanticContract(contract, context) {
  const keys = ["oracle_contract_client_key", "formal_test_point_id", "observation_ref", "assertion", "evaluation_scope", "observation_window", "basis"];
  if (!object2(contract) || !exact2(contract, keys) || !nonblank3(contract.oracle_contract_client_key) || !nonblank3(contract.formal_test_point_id) || !Array.isArray(contract.basis) || contract.basis.length === 0) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle semantic contract identity or basis is incomplete.");
  validateObservation(contract.observation_ref, context);
  validateOracleAssertion(contract.assertion, context);
  const scope = contract.evaluation_scope;
  const validScope = object2(scope) && (scope.kind === "single" && exact2(scope, ["kind"]) || scope.kind === "forall" && exact2(scope, ["kind", "population_contract_client_key", "population_proof_client_key"]) && nonblank3(scope.population_contract_client_key) && nonblank3(scope.population_proof_client_key));
  if (!validScope || !validateObservationWindow(contract.observation_window)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle semantic scope or observation window is invalid.");
  return structuredClone(contract);
}
function validateTypedOracle(oracle, context) {
  const keys = ["oracle_client_key", "oracle_semantic_contract_id", "observe_after_step_client_key", "observation_ref", "assertion", "evaluation_scope", "observation_window", "claim_ids"];
  if (!object2(oracle) || !exact2(oracle, keys) || !nonblank3(oracle.oracle_client_key) || !context.oracleSemanticContractIds.includes(oracle.oracle_semantic_contract_id) || !context.stepClientKeys.includes(oracle.observe_after_step_client_key) || !Array.isArray(oracle.claim_ids) || oracle.claim_ids.length === 0 || oracle.claim_ids.some((id) => !context.acceptedClaimIds.includes(id)) || new Set(oracle.claim_ids).size !== oracle.claim_ids.length) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Typed Oracle ownership or evidence binding is invalid.");
  validateObservation(oracle.observation_ref, context);
  validateOracleAssertion(oracle.assertion, context);
  if (oracle.assertion.kind === "transition" && oracle.assertion.trigger_step_client_key !== oracle.observe_after_step_client_key) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Transition trigger and observation step must be explicitly bound.");
  const window = oracle.observation_window;
  if (!validateObservationWindow(window)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle observation window is invalid.");
  if (!(oracle.evaluation_scope?.kind === "single" && exact2(oracle.evaluation_scope, ["kind"])) && !(oracle.evaluation_scope?.kind === "forall" && exact2(oracle.evaluation_scope, ["kind", "population_contract_id", "population_proof_id"]) && nonblank3(oracle.evaluation_scope.population_contract_id) && nonblank3(oracle.evaluation_scope.population_proof_id))) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle evaluation scope is invalid.");
  return structuredClone(oracle);
}

// src/v5/behavior-compiler.mjs
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
function nonempty2(value) {
  return Array.isArray(value) && value.length > 0;
}
function projectAcceptedBehaviorViews(artifact, bindings) {
  const stableByClientKey = new Map(bindings.map((binding) => [binding.client_key, binding.stable_id]));
  const rewrite = (value) => {
    if (typeof value === "string") return stableByClientKey.get(value) ?? value;
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
  };
  return rewrite(structuredClone(artifact));
}
function compileBehaviorContracts(input) {
  const { semanticRootDigest, semanticRuleIndex, artifact } = input;
  const acceptedContractRefs = new Set(input.acceptedContractRefs ?? []);
  const bindings = [];
  const stableByClientKey = /* @__PURE__ */ new Map();
  const bind = (clientKey, stableId2) => {
    if (!nonblank4(clientKey) || stableByClientKey.has(clientKey)) throw new V5ProtocolError("CLIENT_KEY_INVALID", "Behavior client keys must be nonblank and globally unique within one batch.");
    stableByClientKey.set(clientKey, stableId2);
    bindings.push({ client_key: clientKey, stable_id: stableId2 });
  };
  const fieldCorrespondences = artifact.field_correspondences.map((mapping) => {
    const validated = validateFieldCorrespondence(mapping, semanticRuleIndex);
    const fieldCorrespondenceId = stableV5Id("field_correspondence", {
      input_semantic_root_digest: semanticRootDigest,
      authority_side: validated.authority_side,
      left: validated.left,
      right: validated.right,
      join: validated.join,
      transform: validated.transform,
      comparison: validated.comparison,
      null_policy_ref: validated.null_policy_ref,
      freshness: validated.freshness,
      basis: validated.basis
    });
    bind(validated.mapping_client_key, fieldCorrespondenceId);
    return { ...validated, field_correspondence_id: fieldCorrespondenceId };
  });
  const fieldIdByClientKey = new Map(fieldCorrespondences.map((row) => [row.mapping_client_key, row.field_correspondence_id]));
  const permissionCellByTarget = new Map((input.permissionCells ?? []).map((cell) => [
    canonicalV5Stringify({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key }),
    cell
  ]));
  const permissionAuxiliaryContracts = (artifact.permission_auxiliary_contracts ?? []).map((contract) => {
    if (!exact3(contract, ["contract_client_key", "permission_target", "payload", "basis"]) || !nonblank4(contract.contract_client_key) || !object3(contract.permission_target) || !exact3(contract.permission_target, ["matrix_id", "required_cell_key"]) || !nonblank4(contract.permission_target.matrix_id) || !nonblank4(contract.permission_target.required_cell_key) || !object3(contract.payload) || !nonempty2(contract.basis)) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission auxiliary contract must be a closed, evidenced, same-cell contract.");
    const targetCell = permissionCellByTarget.get(canonicalV5Stringify(contract.permission_target));
    const contractKind = contract.payload.contract_kind;
    if (!targetCell || !["denial_behavior", "data_scope"].includes(contractKind) || targetCell.permission_dimension !== contractKind) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission auxiliary target and contract kind must equal one advertised required cell.");
    let payload;
    if (contractKind === "denial_behavior") {
      if (!exact3(contract.payload, ["contract_kind", "observation_ref", "assertion", "observation_window"]) || ["transition", "permission"].includes(contract.payload.assertion?.kind)) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Denial behavior must use one closed, non-transition, non-permission assertion.");
      const validated = validateOracleSemanticContract({
        oracle_contract_client_key: contract.contract_client_key,
        formal_test_point_id: targetCell.required_cell_key,
        observation_ref: contract.payload.observation_ref,
        assertion: contract.payload.assertion,
        evaluation_scope: { kind: "single" },
        observation_window: contract.payload.observation_window,
        basis: contract.basis
      }, {
        semanticRootDigest,
        semanticRuleIndex,
        fieldCorrespondenceIds: artifact.field_correspondences.map((mapping) => mapping.mapping_client_key),
        permissionDecisionCells: []
      });
      const assertion = structuredClone(validated.assertion);
      if (assertion.kind === "cross_surface_equals") {
        const stableFieldId = fieldIdByClientKey.get(assertion.field_correspondence_id);
        if (!stableFieldId) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Denial behavior cross-surface assertion must resolve a same-batch field correspondence.");
        assertion.field_correspondence_id = stableFieldId;
      }
      payload = { contract_kind: contractKind, observation_ref: validated.observation_ref, assertion, observation_window: validated.observation_window };
    } else {
      if (!exact3(contract.payload, ["contract_kind", "scope"])) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Data-scope auxiliary contract must contain only its typed population scope.");
      const validated = validatePopulationContract({ population_contract_client_key: contract.contract_client_key, scope: contract.payload.scope }, semanticRootDigest, acceptedContractRefs);
      payload = { contract_kind: contractKind, scope: validated.scope };
    }
    const permissionAuxiliaryContractId = stableV5Id("permission_auxiliary_contract", {
      input_semantic_root_digest: semanticRootDigest,
      contract_kind: contractKind,
      permission_target: contract.permission_target,
      payload,
      basis: contract.basis
    });
    acceptedContractRefs.add(typedContractRefKey({ contract_id: permissionAuxiliaryContractId, contract_kind: contractKind, semantic_root_digest: semanticRootDigest }));
    bind(contract.contract_client_key, permissionAuxiliaryContractId);
    return { ...structuredClone(contract), payload, permission_auxiliary_contract_id: permissionAuxiliaryContractId };
  });
  const auxiliaryByClientKey = new Map(permissionAuxiliaryContracts.map((contract) => [contract.contract_client_key, contract]));
  const auxiliaryBehaviorRefs = /* @__PURE__ */ new Map();
  for (const review of artifact.behavior_contract_reviews ?? []) {
    if (review.disposition?.kind !== "formal") continue;
    for (const clientKey of review.disposition.contract_client_keys ?? []) {
      if (!auxiliaryByClientKey.has(clientKey)) continue;
      auxiliaryBehaviorRefs.set(clientKey, (auxiliaryBehaviorRefs.get(clientKey) ?? 0) + 1);
    }
  }
  const auxiliaryPermissionRefs = /* @__PURE__ */ new Map();
  const permissionMatrixReviews = structuredClone(artifact.permission_matrix_reviews ?? []);
  for (const review of permissionMatrixReviews) for (const row of review.cell_dispositions ?? []) {
    if (row.disposition?.kind !== "formal") continue;
    const refField = row.disposition.outcome?.permission_dimension === "denial_behavior" ? "denial_contract_ref" : row.disposition.outcome?.permission_dimension === "data_scope" ? "data_scope_contract_ref" : null;
    if (!refField) continue;
    const ref = row.disposition.outcome[refField];
    if (ref?.kind !== "same_behavior_batch") continue;
    const contract = auxiliaryByClientKey.get(ref.contract_client_key);
    const target = { matrix_id: review.matrix_id, required_cell_key: row.required_cell_key };
    if (!contract || ref.contract_kind !== contract.payload.contract_kind || canonicalV5Stringify(target) !== canonicalV5Stringify(contract.permission_target)) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Same-batch permission reference must resolve the exact auxiliary kind and target.");
    auxiliaryPermissionRefs.set(ref.contract_client_key, (auxiliaryPermissionRefs.get(ref.contract_client_key) ?? 0) + 1);
    row.disposition.outcome[refField] = { kind: "accepted", ref: { contract_id: contract.permission_auxiliary_contract_id, contract_kind: contract.payload.contract_kind, semantic_root_digest: semanticRootDigest } };
  }
  for (const contract of permissionAuxiliaryContracts) {
    if (auxiliaryBehaviorRefs.get(contract.contract_client_key) !== 1 || auxiliaryPermissionRefs.get(contract.contract_client_key) !== 1) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Every permission auxiliary contract needs exactly one matching Behavior review and Permission cell review.");
  }
  const permissionDispositionByTarget = /* @__PURE__ */ new Map();
  for (const review of permissionMatrixReviews) for (const row of review.cell_dispositions ?? []) {
    permissionDispositionByTarget.set(canonicalV5Stringify({ matrix_id: review.matrix_id, required_cell_key: row.required_cell_key }), row.disposition);
  }
  const reviewedPermissionCells = (input.permissionCells ?? []).map((cell) => {
    const disposition = permissionDispositionByTarget.get(canonicalV5Stringify({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key }));
    return { ...structuredClone(cell), ...disposition?.kind === "formal" ? { formal_outcome: structuredClone(disposition.outcome) } : {} };
  });
  const predicateContracts = artifact.predicate_contracts.map((contract) => {
    if (!exact3(contract, ["predicate_contract_client_key", "predicate_ref", "mutual_exclusion_group", "exhaustiveness", "basis"]) || !nonblank4(contract.predicate_contract_client_key) || !object3(contract.predicate_ref) || !exact3(contract.predicate_ref, ["contract_id", "contract_kind", "semantic_root_digest"]) || !nonblank4(contract.predicate_ref.contract_id) || contract.predicate_ref.contract_kind !== "domain_predicate" || contract.predicate_ref.semantic_root_digest !== semanticRootDigest || !acceptedContractRefs.has(typedContractRefKey(contract.predicate_ref)) || !nonblank4(contract.mutual_exclusion_group) || !["closed_partition_set", "non_exhaustive_open_set"].includes(contract.exhaustiveness) || !nonempty2(contract.basis)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Predicate contract must resolve to the advertised current-root accepted inventory.");
    const predicateContractId = stableV5Id("predicate_contract", {
      input_semantic_root_digest: semanticRootDigest,
      predicate_ref: contract.predicate_ref,
      mutual_exclusion_group: contract.mutual_exclusion_group,
      exhaustiveness: contract.exhaustiveness,
      basis: contract.basis
    });
    bind(contract.predicate_contract_client_key, predicateContractId);
    return { ...structuredClone(contract), predicate_contract_id: predicateContractId };
  });
  const domains = (
    /** @type {Array<Record<string,any>>} */
    artifact.domain_contracts.map((contract) => {
      const compiled = (
        /** @type {Record<string,any>} */
        compileDomain(semanticRootDigest, contract, artifact.predicate_contracts, acceptedContractRefs)
      );
      bind(compiled.domain_client_key, compiled.domain_contract_id);
      for (
        const partition of
        /** @type {Array<Record<string,any>>} */
        compiled.partitions
      ) bind(partition.partition_client_key, partition.partition_id);
      return compiled;
    })
  );
  const populations = artifact.population_contracts.map((contract) => {
    const validated = validatePopulationContract(contract, semanticRootDigest, acceptedContractRefs);
    const populationContractId = stableV5Id("population_contract", { input_semantic_root_digest: semanticRootDigest, scope: validated.scope });
    bind(validated.population_contract_client_key, populationContractId);
    return { ...validated, population_contract_id: populationContractId };
  });
  const populationIdByClientKey = new Map(populations.map((row) => [row.population_contract_client_key, row.population_contract_id]));
  const populationProofs = artifact.population_proofs.map((proof) => {
    const validated = validatePopulationProof(proof, semanticRootDigest, artifact.population_contracts.map((row) => row.population_contract_client_key), acceptedContractRefs);
    const populationContractId = populationIdByClientKey.get(validated.population_contract_client_key);
    if (!populationContractId) throw new V5ProtocolError("POPULATION_CONTRACT_REQUIRED", "Population proof references an unknown same-batch population.");
    const basis = validated.payload.kind === "enumerate_population" ? [] : validated.basis;
    const populationProofId = stableV5Id("population_proof", { input_semantic_root_digest: semanticRootDigest, population_contract_id: populationContractId, payload: validated.payload, basis });
    bind(validated.proof_client_key, populationProofId);
    return { ...validated, population_contract_id: populationContractId, population_proof_id: populationProofId };
  });
  const populationProofIdByClientKey = new Map(populationProofs.map((row) => [row.proof_client_key, row.population_proof_id]));
  const oracleSemanticContracts = artifact.oracle_semantic_contracts.map((contract) => {
    const candidate = structuredClone(contract);
    const denial = candidate.assertion?.kind === "permission" && candidate.assertion.expected === "deny" && candidate.assertion.denial_behavior?.kind === "required" ? candidate.assertion.denial_behavior : null;
    if (denial?.denial_contract_ref?.kind === "same_behavior_batch") {
      const auxiliary = auxiliaryByClientKey.get(denial.denial_contract_ref.contract_client_key);
      const expectedTarget = { matrix_id: candidate.assertion.decision_cell_ref?.matrix_id, required_cell_key: denial.denial_required_cell_key };
      if (!auxiliary || denial.denial_contract_ref.contract_kind !== "denial_behavior" || auxiliary.payload.contract_kind !== "denial_behavior" || canonicalV5Stringify(auxiliary.permission_target) !== canonicalV5Stringify(expectedTarget)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Oracle denial Behavior ref must resolve the exact same-batch auxiliary target.");
      denial.denial_contract_ref = { kind: "accepted", ref: { contract_id: auxiliary.permission_auxiliary_contract_id, contract_kind: "denial_behavior", semantic_root_digest: semanticRootDigest } };
    }
    const validated = validateOracleSemanticContract(candidate, {
      semanticRootDigest,
      semanticRuleIndex,
      fieldCorrespondenceIds: artifact.field_correspondences.map((mapping) => mapping.mapping_client_key),
      permissionCells: reviewedPermissionCells,
      acceptedContractRefs
    });
    const assertion = structuredClone(validated.assertion);
    if (assertion.kind === "cross_surface_equals") {
      const stableFieldId = fieldIdByClientKey.get(assertion.field_correspondence_id);
      if (!stableFieldId) throw new V5ProtocolError("ORACLE_NOT_DECIDABLE", "Cross-surface Oracle must reference a same-batch FieldCorrespondence client key.");
      assertion.field_correspondence_id = stableFieldId;
    }
    const evaluationScope = validated.evaluation_scope.kind === "single" ? { kind: "single" } : {
      kind: "forall",
      population_contract_id: populationIdByClientKey.get(validated.evaluation_scope.population_contract_client_key),
      population_proof_id: populationProofIdByClientKey.get(validated.evaluation_scope.population_proof_client_key)
    };
    if (evaluationScope.kind === "forall" && (!evaluationScope.population_contract_id || !evaluationScope.population_proof_id)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Forall Oracle must resolve same-batch Population and Proof client keys.");
    const oracleSemanticContractId = stableV5Id("oracle_semantic_contract", {
      input_semantic_root_digest: semanticRootDigest,
      formal_test_point_id: validated.formal_test_point_id,
      observation_ref: validated.observation_ref,
      assertion,
      evaluation_scope: evaluationScope,
      observation_window: validated.observation_window,
      basis: validated.basis
    });
    bind(validated.oracle_contract_client_key, oracleSemanticContractId);
    return { ...validated, assertion, evaluation_scope: evaluationScope, oracle_semantic_contract_id: oracleSemanticContractId };
  });
  const oracleIdByClientKey = new Map(oracleSemanticContracts.map((row) => [row.oracle_contract_client_key, row.oracle_semantic_contract_id]));
  const behaviorEquivalenceContracts = artifact.behavior_equivalence_contracts.map((contract) => {
    if (!exact3(contract, ["equivalence_contract_client_key", "domain_contract_client_key", "partition_client_key", "formal_test_point_id", "oracle_semantic_contract_client_key", "equivalence_scope", "basis"]) || !nonblank4(contract.equivalence_contract_client_key) || !nonblank4(contract.formal_test_point_id) || contract.equivalence_scope !== "all_members_same_observable_behavior" || !nonempty2(contract.basis)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Behavior equivalence contract is incomplete.");
    const domain = domains.find((row) => row.domain_client_key === contract.domain_contract_client_key);
    const partition = domain?.partitions.find((row) => row.partition_client_key === contract.partition_client_key);
    const oracleSemanticContractId = oracleIdByClientKey.get(contract.oracle_semantic_contract_client_key);
    if (!domain || !partition || !oracleSemanticContractId) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Behavior equivalence references are not closed within the same Behavior batch.");
    const behaviorEquivalenceContractId = stableV5Id("behavior_equivalence_contract", {
      input_semantic_root_digest: semanticRootDigest,
      domain_contract_id: domain.domain_contract_id,
      partition_id: partition.partition_id,
      formal_test_point_id: contract.formal_test_point_id,
      oracle_semantic_contract_id: oracleSemanticContractId,
      equivalence_scope: contract.equivalence_scope,
      basis: contract.basis
    });
    bind(contract.equivalence_contract_client_key, behaviorEquivalenceContractId);
    return { ...structuredClone(contract), domain_contract_id: domain.domain_contract_id, partition_id: partition.partition_id, oracle_semantic_contract_id: oracleSemanticContractId, behavior_equivalence_contract_id: behaviorEquivalenceContractId };
  });
  for (const review of artifact.risk_reviews) {
    const riskReviewId = stableV5Id("risk_review", { input_semantic_root_digest: semanticRootDigest, module_ref: review.module_ref, risk_kind: review.risk_kind });
    bind(review.review_client_key, riskReviewId);
  }
  return {
    field_correspondences: fieldCorrespondences,
    predicate_contracts: predicateContracts,
    domain_contracts: domains,
    behavior_equivalence_contracts: behaviorEquivalenceContracts,
    population_contracts: populations,
    population_proofs: populationProofs,
    permission_auxiliary_contracts: permissionAuxiliaryContracts,
    permission_matrix_reviews: permissionMatrixReviews,
    oracle_semantic_contracts: oracleSemanticContracts,
    client_key_bindings: bindings.sort((left, right) => left.client_key.localeCompare(right.client_key))
  };
}

// src/v5/evidence-compiler.mjs
function nonblank5(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function phase0StableId(prefix, value) {
  return `${prefix}-${canonicalObjectDigest(value).slice(7)}`;
}
function compileEvidenceSemantics(input) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.semanticRootDigest) || !Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0 || !Array.isArray(input.claims)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Evidence semantic compilation input is invalid.");
  const claimIds = /* @__PURE__ */ new Set();
  const rows = input.claims.map((claim) => {
    if (!nonblank5(claim.claim_id) || claimIds.has(claim.claim_id) || !Array.isArray(claim.outcome_candidate_ids) || claim.outcome_candidate_ids.length === 0 || !claim.primary_outcome_signature) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Accepted Claim projection is incomplete or duplicated.");
    claimIds.add(claim.claim_id);
    const signature = structuredClone(claim.primary_outcome_signature);
    const statement = canonicalV5Stringify({ primary_outcome_signature: signature });
    const factIdentity = {
      statement,
      status: "active",
      acceptance_role: "primary_acceptance",
      claim_ids: [claim.claim_id],
      module_refs: [claim.subject_ref ?? "requirements"],
      field_path: "/"
    };
    const fact = { fact_id: phase0StableId("FACT", factIdentity), ...factIdentity };
    const outcomeIdentity = {
      fact_id: fact.fact_id,
      condition: {
        condition_slot_digest: signature.condition_slot_digest,
        action_slot_digest: signature.action_slot_digest,
        branch_slot_digest: signature.branch_slot_digest
      },
      expected: signature.primary_observation_slot_digest,
      acceptance_role: fact.acceptance_role
    };
    const outcome = { outcome_id: phase0StableId("OUT", outcomeIdentity), ...outcomeIdentity, claim_ids: [claim.claim_id] };
    const formalTestPoint = { formal_test_point_id: phase0StableId("TP", { outcome_id: outcome.outcome_id }), outcome_id: outcome.outcome_id, semantic_gap_refs: [] };
    const supportingObservations2 = [...new Set(claim.observation_slot_digests ?? [])].filter((digest4) => digest4 !== signature.primary_observation_slot_digest).map((assertion) => {
      const identity = { outcome_id: outcome.outcome_id, surface: "external_observation", assertion };
      return { supporting_observation_id: phase0StableId("OBS", identity), ...identity, claim_ids: [claim.claim_id] };
    });
    return { claim, fact, outcome, formalTestPoint, supportingObservations: supportingObservations2 };
  }).sort((left, right) => left.fact.fact_id.localeCompare(right.fact.fact_id));
  const facts = rows.map((row) => row.fact);
  const outcomes = rows.map((row) => row.outcome).sort((left, right) => left.outcome_id.localeCompare(right.outcome_id));
  const formalTestPoints = rows.map((row) => row.formalTestPoint).sort((left, right) => left.formal_test_point_id.localeCompare(right.formal_test_point_id));
  const supportingObservations = rows.flatMap((row) => row.supportingObservations).sort((left, right) => left.supporting_observation_id.localeCompare(right.supporting_observation_id));
  return {
    facts,
    test_obligations: {
      schema_version: "4.0.0",
      source_revision: input.sourceRevision,
      outcomes,
      formal_test_points: formalTestPoints,
      supporting_observations: supportingObservations,
      risk_review_ledger: [],
      not_applicable_records: [],
      exploratory: []
    },
    fact_assessments: facts.map((fact) => ({ fact_id: fact.fact_id, claim_ids: [...fact.claim_ids] })),
    formal_test_point_dispositions: formalTestPoints.map((point) => ({ formal_test_point_id: point.formal_test_point_id, kind: "formal" }))
  };
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
function object4(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact4(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank6(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function digest2(value) {
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
  if (!nonblank6(caseDocumentLineageId) || !digest2(semanticRootDigest) || !Array.isArray(gaps)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part inventory identity is invalid.");
  const parts = (
    /** @type {Array<Record<string,any>>} */
    gaps.map((gap) => {
      const binding = gap.gap_binding;
      if (!object4(binding) || !["requirements_gap", "behavior_gap"].includes(binding.kind) || !nonblank6(binding.gap_id) || !digest2(binding.gap_payload_digest) || !object4(gap.answer_contract)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Question Part gap or answer contract is invalid.");
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
  if (!object4(stateSet) || !exact4(stateSet, ["kind", "case_document_lineage_id", "current_semantic_root_digest", "parts", "state_set_digest"]) || stateSet.kind !== "question_part_state_set" || !nonblank6(stateSet.case_document_lineage_id) || !digest2(stateSet.current_semantic_root_digest) || !Array.isArray(stateSet.parts)) return fail("Question Part state set shape is invalid.");
  const { state_set_digest: ignored, ...statePayload } = stateSet;
  if (canonicalObjectDigest(statePayload) !== stateSet.state_set_digest) return fail("Question Part state-set digest is invalid.");
  const sorted2 = [...stateSet.parts].sort((left, right) => left.question_part_id.localeCompare(right.question_part_id));
  if (canonicalV5Stringify(sorted2.map((part) => part.question_part_id)) !== canonicalV5Stringify(stateSet.parts.map((part) => part.question_part_id)) || new Set(sorted2.map((part) => part.question_part_id)).size !== sorted2.length) return fail("Question Parts must be a sorted unique set.");
  for (const part of sorted2) {
    if (!exact4(part, ["kind", "question_part_id", "case_document_lineage_id", "gap_binding", "initial_semantic_root_digest", "answer_contract_digest", "current_state", "transition_history", "state_record_digest"]) || part.kind !== "question_part_state" || part.case_document_lineage_id !== stateSet.case_document_lineage_id || !/^qpt5_[0-9a-f]{64}$/u.test(part.question_part_id) || !digest2(part.answer_contract_digest) || !ALL_STATES.has(part.current_state) || !Array.isArray(part.transition_history)) return fail("Question Part state-record shape is invalid.");
    const { state_record_digest: ignoredRecord, ...recordPayload } = part;
    if (canonicalObjectDigest(recordPayload) !== part.state_record_digest) return fail("Question Part state-record digest is invalid.");
    let previous = "presented";
    for (let index = 0; index < part.transition_history.length; index += 1) {
      const transition = part.transition_history[index];
      if (!object4(transition) || transition.transition_sequence !== index + 1 || transition.from_state !== previous || !EDGES[previous]?.has(transition.to_state)) return fail("Question Part transition history is discontinuous or illegal.");
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
  if (!digest2(nextSemanticRootDigest)) throw new V5ProtocolError("QUESTION_PART_TRANSITION_INVALID", "Next semantic root digest is invalid.");
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

// src/v5/behavior-gaps.mjs
var COMPATIBLE_MISSING_SEMANTICS = Object.freeze({
  field_correspondence: /* @__PURE__ */ new Set(["authority", "join", "transform", "null_policy", "freshness"]),
  domain: /* @__PURE__ */ new Set(["domain_boundary"]),
  population: /* @__PURE__ */ new Set(["population_scope", "population_proof"]),
  oracle_semantics: /* @__PURE__ */ new Set(["oracle_observation", "oracle_assertion", "oracle_scope", "oracle_window"]),
  permission_auxiliary: /* @__PURE__ */ new Set(["denial_behavior", "data_scope"])
});
function object5(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function nonblank7(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateAnswerContract(contract) {
  if (!object5(contract) || !Array.isArray(contract.allowed_controls) || contract.allowed_controls.length === 0 || new Set(contract.allowed_controls).size !== contract.allowed_controls.length || !object5(contract.value_schema)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Behavior gap answer contract is invalid.");
  if (contract.answer_mode === "typed_answer") {
    if (canonicalV5Stringify(contract.allowed_controls) !== '["answer","defer","unknown","close_for_delivery"]' || contract.value_schema.kind === "unavailable") throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "V1 Behavior answers must advertise the frozen typed controls and a typed value schema.");
  } else throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "V1 does not register control-only Behavior gaps.");
  return structuredClone(contract);
}
function compileBehaviorSemanticGaps(semanticRootDigest, seed, proposals, reviews, context = {}) {
  const requirements = new Map(
    /** @type {Array<Record<string,any>>} */
    (seed.required_contracts ?? []).map((requirement) => [requirement.required_contract_key, requirement])
  );
  const permissionCells = new Map((context.permissionMatrices ?? []).flatMap((matrix) => matrix.required_cells.map((cell) => [`${matrix.matrix_id}\0${cell.required_cell_key}`, { ...cell, matrix_id: matrix.matrix_id }])));
  const riskKeys = new Set((seed.risk_review_module_ids ?? []).flatMap((moduleRef) => ["null_or_missing", "unknown_enum", "api_failure", "loading_failure", "sync_delay", "long_content", "pagination", "refresh", "business_permission_boundary"].map((riskKind) => `${moduleRef}\0${riskKind}`)));
  const proposalByClientKey = /* @__PURE__ */ new Map();
  const acceptedById = /* @__PURE__ */ new Map();
  const accepted = [];
  const bindings = [];
  for (const gap of context.acceptedBehaviorGaps ?? []) {
    const normalized = {
      target: structuredClone(gap.target),
      missing_semantics: gap.missing_semantics,
      question: gap.question,
      answer_contract: structuredClone(gap.answer_contract),
      basis: structuredClone(gap.basis)
    };
    const sourceProposalDigest = canonicalObjectDigest({ namespace: "generate-test-cases/v5/behavior-semantic-gap-proposal", format_version: 1, proposal: normalized });
    const expectedId = stableV5Id("behavior_semantic_gap", {
      input_semantic_root_digest: gap.semantic_root_digest,
      target: normalized.target,
      missing_semantics: normalized.missing_semantics,
      answer_contract_digest: questionAnswerContractDigest(normalized.answer_contract),
      basis: normalized.basis
    });
    if (!nonblank7(gap.semantic_gap_id) || acceptedById.has(gap.semantic_gap_id) || gap.source_proposal_digest !== sourceProposalDigest || gap.semantic_gap_id !== expectedId) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Accepted Behavior gap does not pass reverse identity verification.");
    acceptedById.set(gap.semantic_gap_id, structuredClone(gap));
  }
  for (const proposal of proposals) {
    if (!object5(proposal) || !nonblank7(proposal.semantic_gap_client_key) || proposalByClientKey.has(proposal.semantic_gap_client_key) || !object5(proposal.target) || !nonblank7(proposal.missing_semantics) || !nonblank7(proposal.question) || !Array.isArray(proposal.basis) || proposal.basis.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior gap proposal identity, target, question, or basis is invalid.");
    if (proposal.target.kind === "behavior_contract") {
      const requirement = requirements.get(proposal.target.required_contract_key);
      if (!requirement || !/** @type {Record<string,Set<string>>} */
      COMPATIBLE_MISSING_SEMANTICS[requirement.contract_kind]?.has(proposal.missing_semantics)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior gap target or missing semantics does not match the advertised requirement.");
    } else if (proposal.target.kind === "permission_cell") {
      const cell = permissionCells.get(`${proposal.target.matrix_id}\0${proposal.target.required_cell_key}`);
      const requiredMissing = cell?.permission_dimension === "decision" ? "permission_outcome" : cell?.permission_dimension;
      if (!cell || proposal.missing_semantics !== requiredMissing) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Permission gap must target one advertised cell and its exact missing semantics.");
    } else if (proposal.target.kind === "risk") {
      if (!riskKeys.has(`${proposal.target.module_ref}\0${proposal.target.risk_kind}`) || proposal.missing_semantics !== "risk_rule") throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Risk gap must target one advertised module \xD7 risk cell.");
    } else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior gap target kind is not registered.");
    const answerContract = validateAnswerContract(proposal.answer_contract);
    const normalized = {
      target: structuredClone(proposal.target),
      missing_semantics: proposal.missing_semantics,
      question: proposal.question.trim(),
      answer_contract: answerContract,
      basis: structuredClone(proposal.basis)
    };
    const sourceProposalDigest = canonicalObjectDigest({ namespace: "generate-test-cases/v5/behavior-semantic-gap-proposal", format_version: 1, proposal: normalized });
    const answerContractDigest = questionAnswerContractDigest(answerContract);
    const semanticGapId = stableV5Id("behavior_semantic_gap", {
      input_semantic_root_digest: semanticRootDigest,
      target: normalized.target,
      missing_semantics: normalized.missing_semantics,
      answer_contract_digest: answerContractDigest,
      basis: normalized.basis
    });
    const row = {
      semantic_gap_id: semanticGapId,
      semantic_root_digest: semanticRootDigest,
      ...normalized,
      source_proposal_digest: sourceProposalDigest
    };
    proposalByClientKey.set(proposal.semantic_gap_client_key, row);
    accepted.push(row);
    bindings.push({ client_key: proposal.semantic_gap_client_key, stable_id: semanticGapId });
  }
  const referenced = /* @__PURE__ */ new Set();
  const referencedGaps = /* @__PURE__ */ new Map();
  const resolveGapReference = (reference, expectedTarget, message) => {
    let gap;
    if (object5(reference) && reference.kind === "same_behavior_batch" && nonblank7(reference.semantic_gap_client_key)) {
      gap = proposalByClientKey.get(reference.semantic_gap_client_key);
      if (!gap || referenced.has(reference.semantic_gap_client_key)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", message);
      referenced.add(reference.semantic_gap_client_key);
    } else if (object5(reference) && reference.kind === "accepted_gap" && nonblank7(reference.semantic_gap_id)) gap = acceptedById.get(reference.semantic_gap_id);
    else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", message);
    if (!gap || canonicalV5Stringify(gap.target) !== canonicalV5Stringify(expectedTarget)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", message);
    referencedGaps.set(gap.semantic_gap_id, gap);
    return gap;
  };
  for (const review of reviews) {
    if (review.disposition?.kind !== "semantic_gap") continue;
    const reference = review.disposition.gap_ref;
    resolveGapReference(reference, { kind: "behavior_contract", required_contract_key: review.required_contract_key }, "Behavior gap review target is missing, duplicated, or cross-wired.");
  }
  for (const matrixReview of context.permissionMatrixReviews ?? []) {
    for (const row of matrixReview.cell_dispositions ?? []) {
      if (row.disposition?.kind !== "semantic_gap") continue;
      const reference = row.disposition.gap_ref;
      resolveGapReference(reference, { kind: "permission_cell", matrix_id: matrixReview.matrix_id, required_cell_key: row.required_cell_key }, "Permission gap reference is missing, duplicated, or cross-wired.");
    }
  }
  for (const riskReview of context.riskReviews ?? []) {
    if (riskReview.risk_item?.risk_disposition !== "semantic_gap") continue;
    const reference = riskReview.risk_item.gap_ref;
    resolveGapReference(reference, { kind: "risk", module_ref: riskReview.module_ref, risk_kind: riskReview.risk_kind }, "Risk gap reference is missing, duplicated, or cross-wired.");
  }
  if (referenced.size !== proposalByClientKey.size) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Every same-batch Behavior gap must have exactly one matching review.");
  accepted.sort((left, right) => left.semantic_gap_id.localeCompare(right.semantic_gap_id));
  bindings.sort((left, right) => left.client_key.localeCompare(right.client_key));
  return { accepted_gaps: [...referencedGaps.values()].sort((left, right) => left.semantic_gap_id.localeCompare(right.semantic_gap_id)), new_accepted_gaps: accepted, client_key_bindings: bindings };
}
function clarificationGapsFromAcceptedBehavior(acceptedGaps) {
  return acceptedGaps.map((gap) => {
    const gapPayloadDigest = canonicalObjectDigest(gap);
    return {
      gap_binding: { kind: "behavior_gap", gap_id: gap.semantic_gap_id, gap_payload_digest: gapPayloadDigest },
      answer_contract: structuredClone(gap.answer_contract),
      target: structuredClone(gap.target),
      question: gap.question,
      why_needed: gap.why_needed ?? `The ${gap.missing_semantics} semantics must be resolved before dependent cases can be formal.`,
      question_impact_summary: structuredClone(gap.question_impact_summary ?? { affected_case_keys: [], impact_kinds: [gap.missing_semantics] })
    };
  }).sort((left, right) => left.gap_binding.gap_id.localeCompare(right.gap_binding.gap_id));
}

// src/v5/permission.mjs
var COORDINATES = Object.freeze(["role", "resource", "action", "context", "permission_dimension"]);
var DIMENSIONS = /* @__PURE__ */ new Set(["decision", "denial_behavior", "data_scope"]);
function permissionCoordinateEvidenceDigest(evidence) {
  const payload = evidence.evidence_kind === "source" ? { evidence_kind: "source", coordinate: evidence.coordinate, value: evidence.value, locator_id: evidence.locator_id, source_span: evidence.source_span } : { evidence_kind: "decision", coordinate: evidence.coordinate, value: evidence.value, decision_id: evidence.decision_id, answer_value_digest: evidence.answer_value_digest };
  return canonicalObjectDigest(payload);
}
function unresolvedCoordinates(candidate) {
  const unresolved = [];
  const slots = candidate.coordinate_slots;
  if (slots.role_candidates.length !== 1) unresolved.push("role");
  if (slots.resource_candidates.length !== 1) unresolved.push("resource");
  if (slots.action_candidates.length !== 1) unresolved.push("action");
  if (slots.context_candidates.length !== 1) unresolved.push("context");
  const dimensions = (
    /** @type {Array<Record<string,any>>} */
    candidate.signaled_dimensions.map((item) => item.value)
  );
  if (dimensions.length !== new Set(dimensions).size || dimensions.filter((value) => value === "decision").length !== 1 || dimensions.some((value) => !DIMENSIONS.has(value))) unresolved.push("permission_dimension");
  return COORDINATES.filter((coordinate) => unresolved.includes(coordinate));
}
function verifyEvidence(evidence, coordinate) {
  if (evidence.coordinate !== coordinate || evidence.coordinate_evidence_digest !== permissionCoordinateEvidenceDigest(evidence)) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Permission coordinate evidence digest is invalid.");
}
function derivePermissionMatrices(semanticRootDigest, seed, registryDigest) {
  if (seed.permission_derivation_registry_digest !== registryDigest) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Permission derivation Registry digest is stale.");
  const candidateById = new Map(
    /** @type {Array<Record<string,any>>} */
    seed.permission_scope_candidates.map((candidate) => [candidate.candidate_id, candidate])
  );
  return (
    /** @type {Array<Record<string,any>>} */
    seed.permission_scope_groups.map((group) => {
      const maybeCandidates = (
        /** @type {string[]} */
        group.permission_scope_candidate_ids.map((id) => candidateById.get(id))
      );
      if (maybeCandidates.length === 0 || maybeCandidates.some((candidate) => !candidate || candidate.scope_group_id !== group.scope_group_id)) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Permission scope group membership is invalid.");
      const candidates = (
        /** @type {Array<Record<string,any>>} */
        maybeCandidates
      );
      const unresolved = COORDINATES.filter((coordinate) => candidates.some((candidate) => unresolvedCoordinates(candidate).includes(coordinate)));
      const resolvable = unresolved.length === 0;
      const roleRefs = resolvable ? candidates.map((candidate) => ({ coordinate: "role", coordinate_evidence_digest: candidate.coordinate_slots.role_candidates[0].coordinate_evidence_digest })) : [];
      const resourceRefs = resolvable ? candidates.map((candidate) => ({ coordinate: "resource", coordinate_evidence_digest: candidate.coordinate_slots.resource_candidates[0].coordinate_evidence_digest })) : [];
      const actionRefs = resolvable ? candidates.map((candidate) => candidate.coordinate_slots.action_candidates[0].value) : [];
      const contexts = resolvable ? candidates.map((candidate) => ({ context_key: candidate.coordinate_slots.context_candidates[0].value.context_key, context_ref: { coordinate: "context", coordinate_evidence_digest: candidate.coordinate_slots.context_candidates[0].coordinate_evidence_digest } })) : [];
      const roleDomain = { role_refs: [...new Map(roleRefs.map((ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), basis: [] };
      const matrixScope = { resource_refs: [...new Map(resourceRefs.map((ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), action_refs: [...new Set(actionRefs)].sort(), contexts: [...new Map(contexts.map((ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), basis: [] };
      const matrixId = stableV5Id("permission_matrix_seed", { input_semantic_root_digest: semanticRootDigest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, role_domain: roleDomain, matrix_scope: matrixScope });
      if (!resolvable) {
        const gapId = `reqgap5_${canonicalObjectDigest({ seed_digest: seed.seed_digest, scope_group_id: group.scope_group_id, permission_scope_candidate_ids: group.permission_scope_candidate_ids, unresolved_coordinates: unresolved }).slice(7)}`;
        return { matrix_id: matrixId, semantic_root_digest: semanticRootDigest, seed_digest: seed.seed_digest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, candidate_routes: candidates.map((candidate) => ({ candidate_id: candidate.candidate_id, kind: "semantic_gap", semantic_gap_id: gapId, unresolved_coordinates: unresolved })), role_domain: roleDomain, matrix_scope: matrixScope, required_cells: [] };
      }
      const cells = [];
      const routes = [];
      for (const candidate of candidates) {
        const role = candidate.coordinate_slots.role_candidates[0];
        const resource = candidate.coordinate_slots.resource_candidates[0];
        const action = candidate.coordinate_slots.action_candidates[0];
        const context = candidate.coordinate_slots.context_candidates[0];
        [role, resource, action, context].forEach((evidence, index) => verifyEvidence(evidence, COORDINATES[index]));
        const candidateCellKeys = [];
        for (const dimension of candidate.signaled_dimensions) {
          verifyEvidence(dimension, "permission_dimension");
          const coordinateDigests = [role, resource, action, context, dimension].map((item) => item.coordinate_evidence_digest).sort();
          const cell = {
            required_cell_key: stableV5Id("permission_required_cell", { matrix_id: matrixId, role_value: role.value, resource_value: resource.value, action_value: action.value, context_value: context.value, permission_dimension_value: dimension.value, coordinate_evidence_digests: coordinateDigests }),
            role_ref: { coordinate: "role", coordinate_evidence_digest: role.coordinate_evidence_digest },
            resource_ref: { coordinate: "resource", coordinate_evidence_digest: resource.coordinate_evidence_digest },
            action_ref: action.value,
            context_key: context.value.context_key,
            permission_dimension: dimension.value,
            coordinate_refs: { action: { coordinate: "action", coordinate_evidence_digest: action.coordinate_evidence_digest }, context: { coordinate: "context", coordinate_evidence_digest: context.coordinate_evidence_digest }, permission_dimension: { coordinate: "permission_dimension", coordinate_evidence_digest: dimension.coordinate_evidence_digest } }
          };
          cells.push(cell);
          candidateCellKeys.push(cell.required_cell_key);
        }
        routes.push({ candidate_id: candidate.candidate_id, kind: "required_cells", required_cell_keys: candidateCellKeys.sort() });
      }
      const uniqueCells = [...new Map(cells.map((cell) => [cell.required_cell_key, cell])).values()].sort((left, right) => left.required_cell_key.localeCompare(right.required_cell_key));
      return { matrix_id: matrixId, semantic_root_digest: semanticRootDigest, seed_digest: seed.seed_digest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, candidate_routes: routes.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)), role_domain: roleDomain, matrix_scope: matrixScope, required_cells: uniqueCells };
    })
  );
}
function validatePermissionMatrixReview(matrix, review, semanticRootDigest, evidenceContext) {
  if (review.matrix_id !== matrix.matrix_id || review.seed_digest !== matrix.seed_digest || !Array.isArray(review.cell_dispositions) || review.cell_dispositions.length !== matrix.required_cells.length) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Permission review must cover every required cell exactly once.");
  const cellByKey = new Map(
    /** @type {Array<Record<string,any>>} */
    matrix.required_cells.map((cell) => [cell.required_cell_key, cell])
  );
  const dispositionByKey = /* @__PURE__ */ new Map();
  for (const row of review.cell_dispositions) {
    const cell = cellByKey.get(row.required_cell_key);
    if (!cell || dispositionByKey.has(row.required_cell_key)) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Permission review cell is unknown or duplicated.");
    dispositionByKey.set(row.required_cell_key, row.disposition);
    const disposition = row.disposition;
    if (disposition.kind === "semantic_gap") {
      if (!disposition.gap_ref) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission gap reference is missing.");
      continue;
    }
    if (disposition.kind === "not_applicable") {
      const levels = (disposition.basis ?? []).map((ref) => evidenceContext?.evidenceLevels.get(ref.claim_id ?? ref.decision_id));
      if (!Array.isArray(disposition.basis) || disposition.basis.length === 0 || evidenceContext && levels.some((level) => !level || !["E2", "E3"].includes(level))) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission N/A needs accepted E2/E3 basis.");
      continue;
    }
    if (disposition.kind !== "formal" || !Array.isArray(disposition.basis) || disposition.basis.length === 0 || disposition.outcome.permission_dimension !== cell.permission_dimension) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission formal outcome does not match its cell.");
    const outcome = disposition.outcome;
    if (cell.permission_dimension === "decision") {
      const expectedAllowed = cell.action_ref === "discover" ? ["visible", "hidden"] : ["allow", "deny"];
      if (outcome.action_ref !== cell.action_ref || !expectedAllowed.includes(outcome.expected)) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Permission decision outcome is incompatible with the action.");
    } else if (cell.permission_dimension === "data_scope") {
      const ref = outcome.data_scope_contract_ref?.ref;
      if (outcome.data_scope_contract_ref?.kind !== "accepted" || !ref || ref.contract_kind !== "data_scope" || ref.semantic_root_digest !== semanticRootDigest || evidenceContext?.acceptedContractRefs && !evidenceContext.acceptedContractRefs.has(typedContractRefKey(ref))) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Data-scope cell requires an accepted current-root typed contract.");
    }
  }
  for (const row of review.cell_dispositions) {
    const cell = cellByKey.get(row.required_cell_key);
    const outcome = row.disposition.outcome;
    if (cell?.permission_dimension !== "denial_behavior" || row.disposition.kind !== "formal") continue;
    const decisionCell = cellByKey.get(outcome.decision_cell_key);
    const decisionDisposition = dispositionByKey.get(outcome.decision_cell_key);
    const sameCoordinates = decisionCell && ["role_ref", "resource_ref", "action_ref", "context_key"].every((key) => canonicalV5Stringify(decisionCell[key]) === canonicalV5Stringify(cell[key]));
    const ref = outcome.denial_contract_ref?.ref;
    if (!sameCoordinates || decisionCell.permission_dimension !== "decision" || decisionDisposition?.kind !== "formal" || decisionDisposition.outcome.expected !== "deny" || outcome.denial_contract_ref?.kind !== "accepted" || !ref || ref.contract_kind !== "denial_behavior" || ref.semantic_root_digest !== semanticRootDigest || evidenceContext?.acceptedContractRefs && !evidenceContext.acceptedContractRefs.has(typedContractRefKey(ref))) throw new V5ProtocolError("PERMISSION_OUTCOME_UNRESOLVED", "Denial behavior must bind the same-coordinate deny decision and an accepted typed contract.");
  }
  return structuredClone(review.cell_dispositions);
}

// src/v5/provenance.mjs
var provenancePolicy = generateV5Contracts().policyRegistry.provenance_policy;
var edgeRules = new Map(provenancePolicy.allowed_edges.map((row) => [`${row.from_kind}->${row.to_kind}`, row]));
var downstreamKinds = /* @__PURE__ */ new Set(["behavior_contract", "atomic_outcome", "formal_test_point", "case", "case_oracle", "case_document", "execution_plan", "execution_result", "rendered_output"]);
function compileBehaviorProvenanceGraph(input) {
  const common = {
    run_id: input.runId,
    case_document_lineage_id: input.caseDocumentLineageId,
    semantic_root_digest: input.semanticRootDigest,
    accepted: true
  };
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const addNode = (node) => {
    if (!node.node_id || nodes.has(node.node_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Compiler provenance identities must be nonblank and unique.");
    nodes.set(node.node_id, node);
  };
  const claims = /* @__PURE__ */ new Map();
  for (const claim of input.claims) {
    if (typeof claim.claim_id !== "string" || !Array.isArray(claim.outcome_candidate_ids) || claim.outcome_candidate_ids.length === 0 || !["E1", "E2", "E3"].includes(claim.evidence_level)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Compiler provenance Claim projection is incomplete.");
    addNode({ node_id: claim.claim_id, kind: "claim", ...common, evidence_level: claim.evidence_level });
    claims.set(claim.claim_id, claim);
    for (const sourceUnitId of [...new Set(claim.outcome_candidate_ids)].sort()) {
      if (!nodes.has(sourceUnitId)) addNode({ node_id: sourceUnitId, kind: "source_unit", ...common });
      edges.push({ from: sourceUnitId, to: claim.claim_id });
    }
  }
  const facts = /* @__PURE__ */ new Map();
  for (const fact of input.facts) {
    if (typeof fact.fact_id !== "string" || !Array.isArray(fact.claim_ids) || fact.claim_ids.length === 0) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Compiler provenance Fact projection is incomplete.");
    addNode({ node_id: fact.fact_id, kind: "fact", ...common });
    facts.set(fact.fact_id, fact);
    for (const claimId of [...new Set(fact.claim_ids)].sort()) {
      if (!claims.has(claimId)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Fact provenance must resolve accepted Compiler-owned Claims.");
      edges.push({ from: claimId, to: fact.fact_id });
    }
  }
  const behaviorContracts = /* @__PURE__ */ new Map();
  for (const contract of input.behaviorContracts) {
    if (typeof contract.contract_id !== "string" || !Array.isArray(contract.basis) || contract.basis.length === 0) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Compiler provenance Behavior contract projection is incomplete.");
    addNode({ node_id: contract.contract_id, kind: "behavior_contract", ...common });
    behaviorContracts.set(contract.contract_id, contract);
    for (const basis of contract.basis) {
      if (basis.kind !== "claim" || !claims.has(basis.claim_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Behavior provenance must resolve accepted Compiler-owned Claim basis.");
      edges.push({ from: basis.claim_id, to: contract.contract_id });
    }
  }
  const outcomes = /* @__PURE__ */ new Map();
  for (const outcome of input.atomicOutcomes) {
    if (typeof outcome.outcome_id !== "string" || typeof outcome.fact_id !== "string" || !facts.has(outcome.fact_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "AtomicOutcome provenance must resolve one Compiler-owned Fact.");
    addNode({ node_id: outcome.outcome_id, kind: "atomic_outcome", ...common });
    outcomes.set(outcome.outcome_id, outcome);
    edges.push({ from: outcome.fact_id, to: outcome.outcome_id });
  }
  const pointById = /* @__PURE__ */ new Map();
  const outcomeByPointId = /* @__PURE__ */ new Map();
  for (const point of input.formalTestPoints) {
    if (typeof point.formal_test_point_id !== "string" || typeof point.outcome_id !== "string" || !outcomes.has(point.outcome_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "FormalTestPoint provenance must resolve one Compiler-owned AtomicOutcome.");
    addNode({ node_id: point.formal_test_point_id, kind: "formal_test_point", ...common });
    pointById.set(point.formal_test_point_id, point);
    outcomeByPointId.set(point.formal_test_point_id, point.outcome_id);
    edges.push({ from: point.outcome_id, to: point.formal_test_point_id });
  }
  for (const contract of behaviorContracts.values()) {
    for (const pointId of [...new Set(contract.formal_test_point_ids ?? [])].sort()) {
      const outcomeId = outcomeByPointId.get(pointId);
      if (!pointById.has(pointId) || !outcomeId) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Behavior provenance references an unknown formal Test Point.");
      edges.push({ from: contract.contract_id, to: outcomeId });
    }
  }
  const graphBase = {
    nodes: [...nodes.values()].sort((left, right) => left.node_id.localeCompare(right.node_id)),
    edges: [...new Map(edges.map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()].sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`))
  };
  validateV5ProvenanceGraph(graphBase);
  return { ...graphBase, graph_digest: canonicalObjectDigest(graphBase) };
}
function extendCaseProvenanceGraph(input) {
  validateV5ProvenanceGraph(input.graph);
  const nodes = new Map(input.graph.nodes.map((node) => [node.node_id, structuredClone(node)]));
  const edges = input.graph.edges.map((edge) => structuredClone(edge));
  const common = { run_id: input.runId, case_document_lineage_id: input.caseDocumentLineageId, semantic_root_digest: input.semanticRootDigest, accepted: true };
  for (const node of nodes.values()) {
    if (node.run_id !== input.runId || node.case_document_lineage_id !== input.caseDocumentLineageId || node.semantic_root_digest !== input.semanticRootDigest || node.accepted !== true) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case provenance cannot extend a different run, lineage, or semantic root.");
  }
  const addNode = (node) => {
    if (!node.node_id || nodes.has(node.node_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case provenance identities must be nonblank and unique.");
    nodes.set(node.node_id, node);
  };
  for (const current of input.cases) {
    if (typeof current.case_id !== "string" || nodes.get(current.primary_test_point_id)?.kind !== "formal_test_point" || !Array.isArray(current.oracles) || current.oracles.length === 0) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case provenance must resolve one formal Test Point and at least one Case Oracle.");
    addNode({ node_id: current.case_id, kind: "case", ...common });
    edges.push({ from: current.primary_test_point_id, to: current.case_id });
    for (const oracle of current.oracles) {
      if (typeof oracle.oracle_id !== "string" || nodes.get(oracle.oracle_semantic_contract_id)?.kind !== "behavior_contract" || !Array.isArray(oracle.claim_ids) || oracle.claim_ids.length === 0) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case Oracle provenance must resolve its accepted semantic contract and Claims.");
      addNode({ node_id: oracle.oracle_id, kind: "case_oracle", ...common });
      edges.push({ from: oracle.oracle_semantic_contract_id, to: current.case_id }, { from: current.case_id, to: oracle.oracle_id });
      for (const claimId of [...new Set(oracle.claim_ids)].sort()) {
        if (nodes.get(claimId)?.kind !== "claim") throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case Oracle evidence must resolve an accepted Claim.");
        edges.push({ from: claimId, to: oracle.oracle_id });
      }
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.caseDocumentDigest)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Case Document provenance digest is invalid.");
  addNode({ node_id: input.caseDocumentDigest, kind: "case_document", ...common, immutable_digest: input.caseDocumentDigest });
  for (const current of input.cases) edges.push({ from: current.case_id, to: input.caseDocumentDigest });
  for (const digest4 of [...new Set(input.renderedOutputDigests)].sort()) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest4)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Rendered output provenance digest is invalid.");
    addNode({ node_id: digest4, kind: "rendered_output", ...common });
    edges.push({ from: input.caseDocumentDigest, to: digest4, immutable_digest_ref: input.caseDocumentDigest });
  }
  const graphBase = {
    nodes: [...nodes.values()].sort((left, right) => left.node_id.localeCompare(right.node_id)),
    edges: [...new Map(edges.map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()].sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`))
  };
  validateV5ProvenanceGraph(graphBase);
  return { ...graphBase, graph_digest: canonicalObjectDigest(graphBase) };
}
function conditionHolds(condition, from, to, edge) {
  if (condition.kind === "same_run") return from.run_id === to.run_id;
  if (condition.kind === "same_lineage") return from.case_document_lineage_id === to.case_document_lineage_id;
  if (condition.kind === "current_semantic_root") return from.semantic_root_digest === to.semantic_root_digest;
  if (condition.kind === "accepted_ancestor") return from.accepted === true && to.accepted === true;
  if (condition.kind === "immutable_digest_ref") return typeof from.immutable_digest === "string" && edge.immutable_digest_ref === from.immutable_digest;
  if (condition.kind === "external_downstream_only") return to.external_downstream === true;
  if (condition.kind === "evidence_level_in") return condition.levels.includes(from.evidence_level);
  return false;
}
function validateV5ProvenanceGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Provenance graph must contain nodes and edges.");
  const nodes = /* @__PURE__ */ new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.node_id !== "string" || typeof node.kind !== "string" || nodes.has(node.node_id)) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Provenance nodes must have unique IDs.");
    nodes.set(node.node_id, node);
  }
  const adjacency = new Map(graph.nodes.map((node) => [node.node_id, []]));
  const indegree = new Map(graph.nodes.map((node) => [node.node_id, 0]));
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Provenance edge references an unknown node.");
    if (to.kind === "source_unit" && downstreamKinds.has(from.kind)) throw new V5ProtocolError("DOWNSTREAM_ARTIFACT_AS_SOURCE", "Downstream artifacts cannot re-enter Source.");
    const rule = edgeRules.get(`${from.kind}->${to.kind}`);
    if (!rule || !rule.conditions.every((condition) => conditionHolds(condition, from, to, edge))) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", `Provenance edge ${from.kind}->${to.kind} is not allowed.`);
    adjacency.get(from.node_id)?.push(to.node_id);
    indegree.set(to.node_id, (indegree.get(to.node_id) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([nodeId]) => nodeId).sort();
  const topologicalOrder = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === void 0) break;
    topologicalOrder.push(nodeId);
    for (const target of (adjacency.get(nodeId) ?? []).sort()) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }
  if (topologicalOrder.length !== nodes.size) throw new V5ProtocolError("PROVENANCE_CYCLE", "Provenance graph contains a cycle.");
  return { valid: true, topological_order: topologicalOrder };
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
function digest3(value) {
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
  const permissionCandidates = [];
  for (const pack of [...input.sourcePacks].sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest))) {
    for (const source of [...pack.payload.sources].sort((left, right) => left.source_object_digest.localeCompare(right.source_object_digest))) {
      const locatorId = `loc5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest }).slice(7)}`;
      for (const line of nonblankLines(source.content)) {
        const unitSpan = span(source.content, line.start, line.end);
        const unitId = `sunit5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest, source_span: unitSpan }).slice(7)}`;
        const observations = observationPhrases(line.text).map((phrase) => digest3(`observation:${phrase}`));
        const atomSignature = {
          subject_slot_digest: digest3(`subject:${line.text}`),
          condition_slot_digest: digest3(`condition:${line.text}`),
          action_slot_digest: digest3(`action:${line.text}`),
          primary_observation_slot_digest: observations[0],
          branch_slot_digest: digest3(`branch:${line.text}`)
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
        if (line.text.includes("\u6743\u9650")) {
          const evidence = (coordinate, value, sourceSpan) => {
            const baseEvidence = { evidence_kind: "source", coordinate, value, locator_id: locatorId, source_span: sourceSpan };
            return { ...baseEvidence, coordinate_evidence_digest: permissionCoordinateEvidenceDigest(baseEvidence) };
          };
          const roleToken = line.text.includes("\u7BA1\u7406\u5458") ? "\u7BA1\u7406\u5458" : "\u7528\u6237";
          const resourceToken = line.text.includes("\u8BA2\u5355") ? "\u8BA2\u5355" : line.text;
          const scalarLine = Array.from(line.text);
          const tokenSpan = (token) => {
            const offset = scalarLine.join("").indexOf(token);
            const scalarOffset = Array.from(scalarLine.join("").slice(0, Math.max(0, offset))).length;
            return span(source.content, line.start + scalarOffset, line.start + scalarOffset + Array.from(token).length);
          };
          const action = line.text.includes("\u67E5\u770B") ? "view" : line.text.includes("\u8FDB\u5165") ? "enter" : "mutate";
          const dimensions = ["decision", ...line.text.includes("\u62D2\u7EDD") ? ["denial_behavior"] : [], ...line.text.includes("\u8303\u56F4") ? ["data_scope"] : []];
          const coordinateSlots = {
            role_candidates: [evidence("role", { kind: "requirements_ref", ref: { kind: "source_unit", source_unit_id: unitId, source_digest: input.acceptedSourceStateDigest } }, tokenSpan(roleToken))],
            resource_candidates: [evidence("resource", { kind: "requirements_ref", ref: { kind: "source_unit", source_unit_id: unitId, source_digest: input.acceptedSourceStateDigest } }, tokenSpan(resourceToken))],
            action_candidates: [evidence("action", action, unitSpan)],
            context_candidates: [evidence("context", { context_key: "default" }, unitSpan)]
          };
          const signaledDimensions = dimensions.map((dimension) => evidence("permission_dimension", dimension, unitSpan));
          const candidateId = stableV5Id("permission_scope_candidate", { accepted_source_state_digest: input.acceptedSourceStateDigest, locator_id: locatorId, source_span: unitSpan, coordinate_slots: coordinateSlots, signaled_dimensions: signaledDimensions });
          permissionCandidates.push({ candidate_id: candidateId, scope_group_id: "", locator_id: locatorId, source_span: unitSpan, coordinate_slots: coordinateSlots, signaled_dimensions: signaledDimensions, detector_codes: ["permission-language"] });
        }
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
  const permissionGroups = permissionCandidates.map((candidate) => {
    const scopeGroupId = stableV5Id("permission_scope_group", { permission_scope_candidate_ids: [candidate.candidate_id] });
    candidate.scope_group_id = scopeGroupId;
    return { scope_group_id: scopeGroupId, permission_scope_candidate_ids: [candidate.candidate_id] };
  });
  const base = {
    accepted_source_state_digest: input.acceptedSourceStateDigest,
    normative_units: normativeUnits.sort((left, right) => left.unit_id.localeCompare(right.unit_id)),
    ambiguity_candidates: ambiguityCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    outcome_dedup_groups: [],
    entity_mention_candidates: mentionCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    entity_conflict_groups: entityConflictGroups,
    permission_scope_candidates: permissionCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    permission_scope_groups: permissionGroups.sort((left, right) => left.scope_group_id.localeCompare(right.scope_group_id)),
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
  if (claimByKey.size !== (artifact.claims ?? []).length || [...claimByKey.keys()].some((key) => typeof key !== "string" || key.trim().length === 0)) throw new V5ProtocolError("CLIENT_KEY_INVALID", "Evidence Claim client keys must be nonblank and unique within the batch.");
  const candidateIdsByClaimKey = /* @__PURE__ */ new Map();
  const bindClaimCandidate = (claimKey, candidateId) => candidateIdsByClaimKey.set(claimKey, [.../* @__PURE__ */ new Set([...candidateIdsByClaimKey.get(claimKey) ?? [], candidateId])].sort());
  const seenCandidates = /* @__PURE__ */ new Set();
  for (const review of decomposition) {
    const candidate = candidateById.get(review.candidate_id);
    if (!candidate || review.seed_digest !== seed.seed_digest || seenCandidates.has(review.candidate_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Outcome review candidate binding is invalid.");
    seenCandidates.add(review.candidate_id);
    const disposition = review.disposition;
    if (disposition.kind === "single_claim") {
      const claim = claimByKey.get(disposition.claim_client_key);
      if (!claim || candidate.required_observation_slot_digests.length !== 1 || !sharedSignatureMatches(claim, candidate) || claim.primary_outcome_signature.primary_observation_slot_digest !== candidate.required_observation_slot_digests[0] || !sameSet2(claim.observation_slot_digests, candidate.required_observation_slot_digests)) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Single Claim does not close exactly one advertised observation slot.");
      bindClaimCandidate(disposition.claim_client_key, candidate.candidate_id);
    } else if (disposition.kind === "split_claims") {
      if (!Array.isArray(disposition.claim_client_keys) || disposition.claim_client_keys.length < 2 || new Set(disposition.claim_client_keys).size !== disposition.claim_client_keys.length) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Composite outcome must split into unique Claims.");
      const primary = [];
      for (const key of disposition.claim_client_keys) {
        const claim = claimByKey.get(key);
        const primaryDigest = claim?.primary_outcome_signature?.primary_observation_slot_digest;
        if (!claim || !sharedSignatureMatches(claim, candidate) || !candidate.required_observation_slot_digests.includes(primaryDigest) || !sameSet2(claim.observation_slot_digests, [primaryDigest])) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Split Claim does not isolate one advertised observation slot.");
        primary.push(primaryDigest);
        bindClaimCandidate(key, candidate.candidate_id);
      }
      if (!sameSet2(primary, candidate.required_observation_slot_digests)) throw new V5ProtocolError("ATOMIC_OUTCOME_NOT_SINGLE", "Split Claims do not exactly cover the composite outcome.");
    } else if (disposition.kind === "semantic_gap") {
      if (!/** @type {Array<Record<string, any>>} */
      (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === disposition.semantic_gap_client_key && gap.target?.origin?.kind === "outcome_decomposition" && gap.target.origin.outcome_candidate_id === candidate.candidate_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Outcome semantic gap is not exact.");
    } else if (disposition.kind === "non_normative") {
      if (typeof disposition.reason !== "string" || disposition.reason.trim().length === 0 || typeof disposition.source_review_id !== "string" || disposition.source_review_id.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Non-normative disposition needs direct review basis.");
    } else throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Outcome disposition kind is unknown.");
  }
  if ([...claimByKey.keys()].some((claimKey) => !candidateIdsByClaimKey.has(claimKey))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Every submitted Claim must close at least one advertised outcome candidate.");
  const compiledClaims = (
    /** @type {Array<Record<string,any>>} */
    [...claimByKey.entries()].map(([claimClientKey, claim]) => {
      const semanticClaim = {
        accepted_source_state_digest: seed.accepted_source_state_digest,
        outcome_candidate_ids: candidateIdsByClaimKey.get(claimClientKey),
        primary_outcome_signature: claim.primary_outcome_signature,
        observation_slot_digests: [...claim.observation_slot_digests].sort(),
        ...claim.subject_ref === void 0 ? {} : { subject_ref: claim.subject_ref },
        ...claim.intent_ref === void 0 ? {} : { intent_ref: claim.intent_ref }
      };
      return { ...structuredClone(claim), claim_id: stableId("claim", semanticClaim), outcome_candidate_ids: semanticClaim.outcome_candidate_ids };
    }).sort((left, right) => left.claim_id.localeCompare(right.claim_id))
  );
  const claimIdByClientKey = new Map(compiledClaims.map((claim) => [claim.claim_client_key, claim.claim_id]));
  for (const claim of compiledClaims) {
    if (Array.isArray(claim.basis)) claim.basis = claim.basis.map((basis) => basis.kind === "claim" && claimIdByClientKey.has(basis.claim_id) ? { ...basis, claim_id: claimIdByClientKey.get(basis.claim_id) } : basis);
  }
  const clientKeyBindings = compiledClaims.map((claim) => ({ client_key: claim.claim_client_key, stable_id: claim.claim_id })).sort((left, right) => left.client_key.localeCompare(right.client_key));
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
      (cluster.basis_claim_client_keys ?? []).map((claimKey) => ({ kind: "claim", claim_id: claimIdByClientKey.get(claimKey) })), .../** @type {string[]} */
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
  const termEntryRows = [...entityAggregates.entries()].map(([clientKey, aggregate]) => {
    const mentionIds = [...new Set(
      /** @type {Array<Record<string, any>>} */
      aggregate.mentions.map((entry) => entry.mention_candidate_id)
    )].sort();
    const basis = [...new Map(
      /** @type {Array<Record<string, any>>} */
      aggregate.basis.map((item) => [canonicalV5Stringify(item), item])
    ).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
    return { clientKey, entry: {
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
    } };
  }).sort((left, right) => left.entry.entity_id.localeCompare(right.entry.entity_id));
  const termEntries = termEntryRows.map((row) => row.entry);
  clientKeyBindings.push(...termEntryRows.map((row) => ({ client_key: row.clientKey, stable_id: row.entry.entity_id })));
  clientKeyBindings.sort((left, right) => left.client_key.localeCompare(right.client_key));
  return {
    ...structuredClone(artifact),
    compiled_claims: compiledClaims,
    client_key_bindings: clientKeyBindings,
    term_registry: sealV5Record({ semantic_root_digest: seed.seed_digest, entries: termEntries }, "registry_digest")
  };
}

// src/v5/transactions.mjs
import { lstat as lstat3, mkdir as mkdir2, readFile as readFile2, readdir } from "node:fs/promises";
import path4 from "node:path";

// src/v5/runtime-services.mjs
import { createHash as createHash6, randomBytes, randomUUID as randomUUID2 } from "node:crypto";
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
function currentV5ExecutionServices() {
  if (!testProfile) return {};
  return {
    /** @param {Record<string,any>} input */
    async verifyCapabilityProof(input) {
      if (input.proof?.type !== "account" || input.proof?.value !== "fixture-proof") return { verified: false, ready: false, receipt: {} };
      const receiptPayload = { kind: "capability_proof", ready: true, case_id: input.case_id };
      return { verified: true, ready: true, receipt: { ...receiptPayload, receipt_digest: canonicalObjectDigest(receiptPayload) } };
    }
  };
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
  if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(input.identity.run_id) || input.identity.run_directory_key !== input.identity.run_id || input.identity.schema_version !== V5_SCHEMA_VERSION || input.identity.compiler_version !== V5_COMPILER_VERSION) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Run identity is invalid.");
  const runDirectory = path4.join(catalog.runsDirectory, input.identity.run_directory_key);
  await ensureV5Directory(catalog.catalogTransactions);
  await ensureV5Directory(catalog.catalogRunGenesisRecords);
  await ensureV5Directory(catalog.catalogReplies);
  await ensureV5Directory(catalog.runsDirectory);
  const identity = sealV5Record(input.identity, "run_identity_digest");
  let recoveringOrphan = false;
  try {
    await lstat3(runDirectory);
    const orphanLayout = await resolveRunLayout(runDirectory);
    const orphanIdentity = await readFixedSealedRecord(orphanLayout.identity, "run_identity_digest");
    if (canonicalV5Stringify(orphanIdentity.record) !== canonicalV5Stringify(identity)) throw new V5ProtocolError("IDEMPOTENCY_CONFLICT", "Run directory belongs to a different create transaction.");
    recoveringOrphan = true;
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (!recoveringOrphan) await mkdir2(runDirectory);
  const run = await resolveRunLayout(runDirectory);
  for (const directory of [run.transactions, run.receipts, run.idempotencyIndexes, run.replies, run.checkpoints, run.selectorSidecars, run.genesisRecords, run.acceptedArtifacts, run.compilerState, run.renderedOutputs, run.events, run.incidents, run.rawSourceBytes, run.staging]) await ensureV5Directory(directory);
  await writeAtomicFile(run.identity, Buffer.from(canonicalV5Stringify(identity)));
  for (const item of input.compilerStateRecords ?? []) {
    if (item.semanticDigest) await writeSemanticV5Record(run.compilerState, item.record, item.semanticDigest);
    else if (item.digestField) await writeSealedV5Record(run.compilerState, item.record, item.digestField);
    else throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Compiler state record storage contract is missing.");
  }
  for (const item of input.acceptedArtifacts ?? []) await writeSealedV5Record(run.acceptedArtifacts, item.record, item.digestField);
  validateCheckpointIdentity(input.checkpoint, input.identity);
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
    run_identity_digest: identity.run_identity_digest,
    operational_event_ref: { kind: "none" },
    checkpoint_digest: checkpoint.digest,
    selector_sidecar_digest: sidecar.digest,
    reply_object_digest: reply.digest,
    receipt_digest: null,
    idempotency_index_digest: index.digest
  }, "transaction_digest");
  if (services.failAt === "after_run_transaction") throw new Error("INJECTED_CRASH: after_run_transaction");
  const genesis = await writeSealedV5Record(run.genesisRecords, {
    kind: "catalog_run_genesis_record",
    schema_version: V5_SCHEMA_VERSION,
    run_id: input.identity.run_id,
    run_directory_key: input.identity.run_directory_key,
    case_document_lineage_id: input.identity.case_document_lineage_id,
    run_identity: identity,
    run_identity_digest: identity.run_identity_digest,
    checkpoint_digest: checkpoint.digest,
    selector_sidecar_digest: sidecar.digest,
    initial_run_transaction_digest: transaction.digest
  }, "run_genesis_record_digest");
  await writeSealedV5Record(catalog.catalogRunGenesisRecords, genesis.record, "run_genesis_record_digest");
  if (services.failAt === "after_catalog_genesis_record") throw new Error("INJECTED_CRASH: after_catalog_genesis_record");
  const runPointerPayload = { kind: "run_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, head_transaction_digest: transaction.digest };
  let pointer;
  try {
    const existingPointer = await readFixedSealedRecord(run.currentPointer, "pointer_digest");
    const expectedPointer = sealV5Record(runPointerPayload, "pointer_digest");
    if (canonicalV5Stringify(existingPointer.record) !== canonicalV5Stringify(expectedPointer)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Recovered run pointer differs from the pending genesis transaction.");
    pointer = existingPointer.record;
  } catch (error) {
    if (error instanceof V5ProtocolError && !error.message.includes("unavailable")) throw error;
    pointer = await publishFixedRecord(run.currentPointer, runPointerPayload, "pointer_digest", null);
  }
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
  if (services.failAt === "after_catalog_pointer_cas") throw new Error("INJECTED_CRASH: after_catalog_pointer_cas");
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
    const incident = nextState.incidentRecord ? await writeSealedV5Record(current.layout.incidents, nextState.incidentRecord, "incident_record_digest") : null;
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
    const transactionPayload = {
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
    };
    if (incident) transactionPayload.incident_record_digest = incident.digest;
    const transaction = await writeSealedV5Record(current.layout.transactions, transactionPayload, "transaction_digest");
    if (services.failAt === "before_pointer_publish") throw new Error("INJECTED_CRASH: before_pointer_publish");
    await publishFixedRecord(current.layout.currentPointer, { kind: "run_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, run_id: current.identity.run_id, run_genesis_record_digest: current.genesis.run_genesis_record_digest, head_transaction_digest: transaction.digest }, "pointer_digest", current.pointerBytes);
    return readCasJson(path4.join(current.layout.replies, digestFilename(reply.digest)), reply.digest);
  });
}
async function publishIntegrityQuarantine(runDirectory, incident, request, services = currentV5TransactionServices()) {
  return withV5RunLock(runDirectory, async () => {
    const layout = await resolveRunLayout(runDirectory);
    const identityFixed = await readFixedSealedRecord(layout.identity, "run_identity_digest");
    const identity = identityFixed.record;
    let oldBytes = null;
    try {
      oldBytes = await readFile2(layout.currentPointer);
    } catch {
    }
    let runGenesisRecordDigest = null;
    try {
      const pointer = await readFixedSealedRecord(layout.currentPointer, "pointer_digest");
      if (pointer.record.run_id === identity.run_id) runGenesisRecordDigest = pointer.record.run_genesis_record_digest;
    } catch {
    }
    if (typeof runGenesisRecordDigest !== "string") {
      for (const filename of (await readdir(layout.genesisRecords)).sort()) {
        if (!/^[0-9a-f]{64}\.json$/u.test(filename)) continue;
        const digest4 = `sha256:${filename.slice(0, 64)}`;
        try {
          const genesis = await readSealedV5Record(layout.genesisRecords, digest4, "run_genesis_record_digest");
          if (genesis.run_id === identity.run_id && genesis.run_identity_digest === identity.run_identity_digest) {
            runGenesisRecordDigest = digest4;
            break;
          }
        } catch {
        }
      }
    }
    if (typeof runGenesisRecordDigest !== "string") throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "A trusted run genesis record is required for quarantine publication.");
    const terminalCellId = identity.delivery_intent === "case_document" ? "cd.terminal.fatal" : "ep.terminal.fatal";
    const terminalKind = identity.delivery_intent === "case_document" ? "case_document_fatal" : "execution_plan_fatal";
    const currentRevision = incident.last_verified_revision ?? 0;
    const incidentRecord = await writeSealedV5Record(layout.incidents, {
      kind: "integrity_quarantine_incident",
      schema_version: V5_SCHEMA_VERSION,
      run_id: identity.run_id,
      diagnostic_code: "ACCEPTED_STATE_INTEGRITY_FAILURE",
      affected_refs: incident.affected_refs ?? [],
      observed_failure: incident.observed_failure,
      last_verified_state: incident.last_verified_state ?? { kind: "none" },
      quarantined_pointer_bytes_digest: oldBytes === null ? null : canonicalObjectDigest({ bytes_base64: oldBytes.toString("base64") })
    }, "incident_record_digest");
    const checkpoint = await writeSealedV5Record(layout.checkpoints, { kind: "v5_run_checkpoint", schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION, run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: identity.delivery_intent, run_lifecycle: "fatal", current_revision: currentRevision, fsm_cell_id: terminalCellId, stage: "delivery", obligation: "complete", fatal_incident_record_digest: incidentRecord.digest }, "checkpoint_digest");
    const sidecar = await writeSealedV5Record(layout.selectorSidecars, { kind: "v5_selector_sidecar", schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, checkpoint_digest: checkpoint.digest, selectors: [] }, "selector_sidecar_digest");
    const actionDigest = actionDigestV5("advance", request.action);
    const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "fatal_incident_recorded" };
    const reply = {
      kind: "run_reply",
      schema_version: V5_SCHEMA_VERSION,
      projection_kind: "persisted_run_state",
      reply_contract_id: incident.reply_contract_id,
      reply_status: "fatal",
      run_id: identity.run_id,
      run_directory: layout.root,
      case_document_lineage_id: identity.case_document_lineage_id,
      delivery_intent: identity.delivery_intent,
      run_lifecycle: "fatal",
      stage: "delivery",
      obligation: "complete",
      current_revision: currentRevision,
      checkpoint_digest: checkpoint.digest,
      selector_snapshot_digest: sidecar.digest,
      diagnostics: [{ code: "ACCEPTED_STATE_INTEGRITY_FAILURE", affected_refs: incident.affected_refs ?? [], message: incident.observed_failure }],
      available_actions: [],
      commit_receipt: commitReceipt,
      work_packet: { kind: "terminal_work", terminal_kind: terminalKind }
    };
    const replyObject = await writeCasJson(layout.replies, reply);
    const receipt = await writeSealedV5Record(layout.receipts, { kind: "v5_action_receipt", schema_version: V5_SCHEMA_VERSION, scope: "run_integrity_quarantine", run_id: identity.run_id, receipt_sequence: 1, idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, reply_object_ref: { reply_digest: replyObject.digest }, commit_receipt: commitReceipt }, "receipt_digest");
    const index = await writeSealedV5Record(layout.idempotencyIndexes, { kind: "operational_idempotency_index", schema_version: V5_SCHEMA_VERSION, scope: "run_integrity_quarantine", run_id: identity.run_id, index_sequence: 1, entries: [{ idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, receipt_digest: receipt.digest, reply_digest: replyObject.digest }] }, "index_digest");
    const transaction = await writeSealedV5Record(layout.transactions, { scope: { kind: "run", run_id: identity.run_id }, run_id: identity.run_id, transaction_kind: "integrity_quarantine", recovery_sequence: 1, transaction_sequence: 1, previous_run_transaction_digest: null, run_genesis_record_digest: runGenesisRecordDigest, incident_record_digest: incidentRecord.digest, checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest, reply_object_digest: replyObject.digest, receipt_digest: receipt.digest, idempotency_index_digest: index.digest }, "transaction_digest");
    if (services.failAt === "before_pointer_publish") throw new Error("INJECTED_CRASH: before_pointer_publish");
    await publishFixedRecord(layout.currentPointer, { kind: "run_current_transaction_pointer", schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, run_genesis_record_digest: runGenesisRecordDigest, head_transaction_digest: transaction.digest }, "pointer_digest", oldBytes);
    if (services.failAt === "after_run_pointer") throw new Error("INJECTED_CRASH: after_run_pointer");
    return readCasJson(path4.join(layout.replies, digestFilename(replyObject.digest)), replyObject.digest);
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
var DIGEST3 = /^sha256:[0-9a-f]{64}$/u;
function object6(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact5(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank8(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateImmutableV5CaseDocumentRef(value) {
  if (!object6(value) || !exact5(value, ["run_id", "revision", "manifest_digest", "bundle_digest", "case_document_lineage_id", "schema_version"]) || value.schema_version !== "5.0.0" || !nonblank8(value.run_id) || !nonblank8(value.case_document_lineage_id) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !DIGEST3.test(value.manifest_digest) || !DIGEST3.test(value.bundle_digest)) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Immutable V5 Case Document reference is invalid.");
  return structuredClone(value);
}
function createV5ExecutionProjection(plan) {
  validateImmutableV5CaseDocumentRef(plan?.case_document_ref);
  if (!object6(plan) || !exact5(plan, ["schema_version", "compiler_version", "delivery_intent", "case_document_ref", "operation_kinds", "items", "plan_digest"]) || plan.schema_version !== "5.0.0" || plan.compiler_version !== "0.6.0" || plan.delivery_intent !== "execution_plan" || !Array.isArray(plan.operation_kinds) || JSON.stringify([...plan.operation_kinds].sort()) !== JSON.stringify(V5_EXECUTION_OPERATION_KINDS) || !Array.isArray(plan.items)) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Compatibility Execution Plan is invalid.");
  const { plan_digest: declaredPlanDigest, ...planPayload } = plan;
  if (!DIGEST3.test(declaredPlanDigest) || canonicalObjectDigest(planPayload) !== declaredPlanDigest) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Compatibility Execution Plan digest is invalid.");
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
  if (!object6(receipt) || !nonblank8(receipt.kind) || !DIGEST3.test(receipt.receipt_digest)) throw new V5ProtocolError("RESUME_PARENT_INVALID", "Existing execution receipt is not in the closed receipt union.");
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
  if (!object6(operation) || !V5_EXECUTION_OPERATION_KINDS.includes(operation.kind) || projection?.kind !== "v5_execution_projection" || projection.confirmed === true) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution operation is not advertised.");
  const next = structuredClone(projection);
  let receipt = null;
  if (operation.kind === "set_execution_disposition") {
    if (!exact5(operation, ["kind", "case_id", "disposition"]) || !["execute", "do_not_execute"].includes(operation.disposition)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Execution disposition operation is invalid.");
    const item = next.items.find((candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution disposition target is not advertised.");
    item.execution_disposition = operation.disposition;
    next.paused = false;
  } else if (operation.kind === "provide_capability_proof") {
    if (!exact5(operation, ["kind", "case_id", "proof"]) || !object6(operation.proof) || !exact5(operation.proof, ["type", "value"]) || !nonblank8(operation.proof.type) || !nonblank8(operation.proof.value) || typeof services.verifyCapabilityProof !== "function") throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof requires the registered external verifier and the frozen V4 proof shape.");
    const item = next.items.find((candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof target is not advertised.");
    const verified = await services.verifyCapabilityProof({ case_document_ref: structuredClone(next.case_document_ref), case_id: operation.case_id, proof: structuredClone(operation.proof) });
    if (verified?.verified !== true || typeof verified.ready !== "boolean" || !object6(verified.receipt)) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Capability proof was not independently verified.");
    receipt = structuredClone(verified.receipt);
    next.capability_receipts.push(receipt);
    item.capability_ready = verified.ready;
    next.paused = false;
  } else if (operation.kind === "pause_execution") {
    if (!exact5(operation, ["kind"])) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Pause operation is invalid.");
    next.paused = true;
  } else {
    if (!exact5(operation, ["kind"])) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Confirmation operation is invalid.");
    if (!next.items.every((item) => item.execution_disposition !== "pending")) throw new V5ProtocolError("ACTION_NOT_ADVERTISED", "Execution Plan cannot be confirmed while dispositions are pending.");
    next.confirmed = true;
    next.paused = false;
  }
  const sealed = reseal(next);
  const closureComplete = sealed.items.every((item) => item.execution_disposition !== "pending");
  const resultKey = operation.kind === "provide_capability_proof" || operation.kind === "set_execution_disposition" ? `${operation.kind}:${closureComplete ? "closure_complete" : "closure_open"}` : operation.kind;
  return { projection: sealed, result_key: resultKey, ...receipt ? { receipt } : {} };
}

// src/v5/clarification-parser.mjs
var UNIT_ACTIONS = /* @__PURE__ */ new Set(["answer", "defer", "unknown", "close_for_delivery"]);
var PROPER_TOKEN = /^Q[0-9]{3,6}$/u;
var TOKENISH = /Q[0-9]+/gu;
function object7(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact6(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank9(value) {
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
  if (typeof raw !== "string" || !object7(range) || !exact6(range, ["start_scalar", "end_scalar"]) || !Number.isSafeInteger(range.start_scalar) || !Number.isSafeInteger(range.end_scalar)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin range must use safe Unicode scalar offsets.");
  const scalars = [...raw];
  if (range.start_scalar < 0 || range.end_scalar <= range.start_scalar || range.end_scalar > scalars.length) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin range is out of bounds or empty.");
  const excerpt = scalars.slice(range.start_scalar, range.end_scalar).join("");
  if (scalars.length > 65536 || scalarLength2(excerpt) > 256) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Clarification message or origin excerpt is too long.");
  return { message_digest: clarificationMessageDigest(raw), range: { ...range }, excerpt, excerpt_digest: rawBytesDigest(excerpt) };
}
function verifyOrigin(supplied, raw) {
  const expected = minimalOriginFromRaw(raw, supplied?.range);
  if (!object7(supplied) || !exact6(supplied, ["message_digest", "range", "excerpt", "excerpt_digest"]) || canonicalV5Stringify(supplied) !== canonicalV5Stringify(expected)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Origin must be derived exactly from the current raw message.");
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
  if (!object7(value) || value.kind !== schema.kind) return fail();
  if (value.kind === "text") {
    if (!exact6(value, ["kind", "value"]) || !nonblank9(value.value)) return fail();
    const text = value.value.trim();
    const length = scalarLength2(text);
    if (length < schema.min_scalars || length > schema.max_scalars || length > 1024 || schema.ambiguity_guard_ref !== "answer.no-unresolved-vague-token.v1") return fail();
    const guard = registry.text_ambiguity_guards.find((item) => item.guard_ref === schema.ambiguity_guard_ref);
    if (!guard || guard.match_mode !== "unicode_scalar_substring" || guard.forbidden_tokens.some((token) => text.includes(token))) return fail();
  } else if (value.kind === "boolean") {
    if (!exact6(value, ["kind", "value"]) || typeof value.value !== "boolean") return fail();
  } else if (value.kind === "integer" || value.kind === "number") {
    if (!exact6(value, ["kind", "value"]) || typeof value.value !== "number" || !Number.isFinite(value.value) || value.kind === "integer" && !Number.isSafeInteger(value.value) || schema.minimum !== void 0 && value.value < schema.minimum || schema.maximum !== void 0 && value.value > schema.maximum) return fail();
  } else if (value.kind === "duration_ms") {
    if (!exact6(value, ["kind", "value"]) || !Number.isSafeInteger(value.value) || value.value <= 0 || schema.maximum !== void 0 && value.value > schema.maximum) return fail();
  } else if (value.kind === "identifier") {
    const pattern = registry.identifier_patterns.find((item) => item.pattern_ref === schema.pattern_ref);
    if (!exact6(value, ["kind", "value"]) || !pattern || !new RegExp(pattern.expression, "u").test(value.value)) return fail();
  } else if (value.kind === "enum") {
    if (!exact6(value, ["kind", "value"]) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === "set") {
    if (!exact6(value, ["kind", "members"]) || !Array.isArray(value.members) || value.members.length < schema.min_items || schema.max_items !== void 0 && value.members.length > schema.max_items) return fail();
    for (const member of value.members) if (!object7(member) || member.kind !== schema.member_kind || !validateScalar(member)) return fail();
    if (new Set(value.members.map((member) => canonicalV5Stringify(member))).size !== value.members.length) return fail();
    if (schema.allowed_members && value.members.some((member) => !schema.allowed_members.some((allowed) => canonicalV5Stringify(allowed) === canonicalV5Stringify(member)))) return fail();
  } else if (value.kind === "mapping") {
    if (!exact6(value, ["kind", "entries"]) || !Array.isArray(value.entries)) return fail();
    for (const entry of value.entries) if (!object7(entry) || !exact6(entry, ["from", "to"]) || entry.from?.kind !== schema.key_kind || entry.to?.kind !== schema.mapped_value_kind || !validateScalar(entry.from) || !validateScalar(entry.to)) return fail();
    if (new Set(value.entries.map((entry) => canonicalV5Stringify(entry.from))).size !== value.entries.length) return fail();
    if (schema.required_keys && !sameCanonicalSet(value.entries.map((entry) => entry.from), schema.required_keys)) return fail();
  } else if (value.kind === "scope") {
    if (!exact6(value, ["kind", "included_refs", "excluded_refs"]) || !uniqueNonblankStrings(value.included_refs) || !uniqueNonblankStrings(value.excluded_refs) || value.included_refs.some((ref) => value.excluded_refs.includes(ref))) return fail();
    const allowed = schema.allowed_refs;
    if (allowed && [...value.included_refs, ...value.excluded_refs].some((ref) => !allowed.includes(ref))) return fail();
  } else if (value.kind === "requirements_quantifier") {
    if (!exact6(value, ["kind", "value"]) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === "requirements_refs") {
    if (!exact6(value, ["kind", "refs"]) || !Array.isArray(value.refs) || value.refs.length < schema.min_items || schema.max_items !== void 0 && value.refs.length > schema.max_items || !value.refs.every(object7)) return fail();
    if (!sameCanonicalSubset(value.refs, schema.allowed_refs)) return fail();
  } else if (value.kind === "entity_resolution") {
    if (!validateEntityResolution(value.value, schema)) return fail();
  } else if (value.kind === "permission_coordinates") {
    if (!validatePermissionCoordinates(value.value, schema)) return fail();
  } else if (["oracle_observation", "oracle_assertion", "oracle_scope", "oracle_window", "population_scope", "population_proof"].includes(value.kind)) {
    if (!exact6(value, ["kind", "resolution"]) || !object7(value.resolution)) return fail();
    if (value.resolution.resolution_kind === "select_candidate") {
      if (!exact6(value.resolution, ["resolution_kind", "candidate"]) || !schema.existing_candidates?.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value.resolution.candidate))) return fail();
    } else if (value.resolution.resolution_kind === "create_typed") {
      if (!exact6(value.resolution, ["resolution_kind", "payload"]) || schema.allow_typed_creation !== true || !object7(value.resolution.payload)) return fail();
    } else return fail();
  } else if (value.kind === "permission_auxiliary_contract") {
    if (!exact6(value, ["kind", "resolution"]) || !object7(value.resolution)) return fail();
    if (value.resolution.resolution_kind === "select_candidate") {
      if (!exact6(value.resolution, ["resolution_kind", "contract_ref"]) || !schema.existing_contract_refs?.some((ref) => canonicalV5Stringify(ref) === canonicalV5Stringify(value.resolution.contract_ref))) return fail();
    } else if (!(value.resolution.resolution_kind === "create_typed" && exact6(value.resolution, ["resolution_kind", "payload"]) && object7(value.resolution.payload) && schema.allow_typed_creation === true)) return fail();
  } else return fail();
  return structuredClone(value);
}
function validateScalar(value) {
  if (!object7(value)) return false;
  if (value.kind === "text" || value.kind === "identifier" || value.kind === "enum") return exact6(value, ["kind", "value"]) && nonblank9(value.value);
  if (value.kind === "boolean") return exact6(value, ["kind", "value"]) && typeof value.value === "boolean";
  if (value.kind === "integer" || value.kind === "duration_ms") return exact6(value, ["kind", "value"]) && Number.isSafeInteger(value.value);
  return value.kind === "number" && exact6(value, ["kind", "value"]) && typeof value.value === "number" && Number.isFinite(value.value);
}
function uniqueNonblankStrings(values) {
  return Array.isArray(values) && values.every(nonblank9) && new Set(values).size === values.length;
}
function sameCanonicalSet(left, right) {
  return left.length === right.length && new Set(left.map(canonicalV5Stringify)).size === left.length && left.every((value) => right.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value)));
}
function sameCanonicalSubset(values, allowed) {
  return new Set(values.map(canonicalV5Stringify)).size === values.length && values.every((value) => allowed.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value)));
}
function validateEntityResolution(answer, schema) {
  if (!object7(answer) || !exact6(answer, ["conflict_group_id", "exact_mention_candidate_ids", "clusters"]) || answer.conflict_group_id !== schema.exact_conflict_group_id || !sameCanonicalSet(answer.exact_mention_candidate_ids, schema.exact_mention_candidate_ids) || !Array.isArray(answer.clusters) || answer.clusters.length === 0) return false;
  const mentions = [];
  for (const cluster of answer.clusters) {
    if (!object7(cluster) || !exact6(cluster, ["canonical_name", "mentions"]) || !nonblank9(cluster.canonical_name) || !Array.isArray(cluster.mentions) || cluster.mentions.length === 0) return false;
    for (const mention of cluster.mentions) {
      if (!object7(mention) || !exact6(mention, ["mention_candidate_id", "name_role"]) || !schema.allowed_name_roles.includes(mention.name_role)) return false;
      mentions.push(mention.mention_candidate_id);
    }
  }
  return sameCanonicalSet(mentions, schema.exact_mention_candidate_ids);
}
function validatePermissionCoordinates(answer, schema) {
  if (!object7(answer) || !exact6(answer, ["scope_group_id", "permission_scope_candidate_ids", "unresolved_coordinates", "coordinate_resolutions"]) || answer.scope_group_id !== schema.exact_scope_group_id || !sameCanonicalSet(answer.permission_scope_candidate_ids, schema.exact_permission_scope_candidate_ids) || !sameCanonicalSet(answer.unresolved_coordinates, schema.exact_unresolved_coordinates) || !Array.isArray(answer.coordinate_resolutions) || answer.coordinate_resolutions.length !== answer.unresolved_coordinates.length) return false;
  const byCoordinate = new Map(schema.coordinate_contracts.map((contract) => [contract.coordinate, contract]));
  if (new Set(answer.coordinate_resolutions.map((row) => row.coordinate)).size !== answer.coordinate_resolutions.length) return false;
  for (const row of answer.coordinate_resolutions) {
    const contract = byCoordinate.get(row.coordinate);
    if (!contract || !object7(row.resolution)) return false;
    if (row.resolution.resolution_kind === "select_candidate") {
      if (row.coordinate === "permission_dimension") {
        if (!exact6(row.resolution, ["resolution_kind", "coordinate_evidence_digests"]) || !sameCanonicalSubset(row.resolution.coordinate_evidence_digests, contract.existing_candidate_evidence_digests)) return false;
      } else if (!exact6(row.resolution, ["resolution_kind", "coordinate_evidence_digest"]) || !contract.existing_candidate_evidence_digests.includes(row.resolution.coordinate_evidence_digest)) return false;
    } else if (row.resolution.resolution_kind === "create_typed") {
      const payload = row.resolution.payload;
      if (!exact6(row.resolution, ["resolution_kind", "payload"]) || !object7(payload)) return false;
      if (row.coordinate === "role" || row.coordinate === "resource") {
        const n = scalarLength2(payload.canonical_name);
        if (!exact6(payload, ["canonical_name"]) || n < 1 || n > 128) return false;
      } else if (row.coordinate === "action") {
        if (!exact6(payload, ["action"]) || !contract.creation_constraints.allowed_actions.includes(payload.action)) return false;
      } else if (row.coordinate === "context") {
        const n = scalarLength2(payload.context_key);
        if (!exact6(payload, ["context_key"]) || n < 1 || n > 256) return false;
      } else if (!exact6(payload, ["dimensions"]) || !sameCanonicalSubset(payload.dimensions, contract.creation_constraints.allowed_dimensions) || new Set(payload.dimensions).size !== payload.dimensions.length || !payload.dimensions.includes("decision")) return false;
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
  if (typeof raw !== "string" || !object7(presentation) || !Array.isArray(presentation.parts) || !Array.isArray(input.units) || input.units.length === 0) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Clarification preview needs a nonempty unit set and current presentation.");
  const partById = new Map(presentation.parts.map((part) => [part.question_part_id, part]));
  const tokens = presentation.parts.map((part) => part.display_token);
  const seenPart = /* @__PURE__ */ new Set();
  const seenKey = /* @__PURE__ */ new Set();
  const bound = (
    /** @type {Array<Record<string,any>>} */
    input.units.map((unit) => {
      if (!object7(unit)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit must be an object.");
      if (!nonblank9(unit.unit_client_key) || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(unit.unit_client_key) || seenKey.has(unit.unit_client_key)) throw new V5ProtocolError("CLIENT_KEY_INVALID", "Response unit client key is invalid or duplicated.");
      if (!UNIT_ACTIONS.has(unit.action) || !object7(unit.target)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit shape or action is invalid.");
      seenKey.add(unit.unit_client_key);
      const part = partById.get(unit.target.question_part_id);
      if (!part || unit.target.display_token !== part.display_token || unit.target.root_version_digest !== presentation.semantic_root_digest) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit target is stale or unknown.");
      if (!part.current_allowed_controls.includes(unit.action)) throw new V5ProtocolError("QUESTION_PART_TRANSITION_INVALID", "Response unit action is not legal from the current Question Part state.");
      if (seenPart.has(part.question_part_id)) throw new V5ProtocolError("QUESTION_PART_ACTION_CONFLICT", "A Question Part has conflicting response units.");
      seenPart.add(part.question_part_id);
      const origin = verifyOrigin(unit.origin, raw);
      const optionalShared = Object.hasOwn(unit, "shared_origin_group_id");
      if (!optionalShared) verifyUnitTokenBinding(origin.excerpt, part.display_token, tokens);
      const expectedKeys = ["unit_client_key", ...optionalShared ? ["shared_origin_group_id"] : [], "origin", "target", "action", ...unit.action === "answer" ? ["answer"] : []];
      if (!exact6(unit, expectedKeys)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Response unit contains fields outside its closed branch.");
      let evidenceLevel = null;
      if (unit.action === "answer") {
        if (part.answer_contract.answer_mode !== "typed_answer" || !object7(unit.answer) || !exact6(unit.answer, ["value", "source_text", "nature", ...Object.hasOwn(unit.answer, "temporary_basis") ? ["temporary_basis"] : []]) || !nonblank9(unit.answer.source_text) || scalarLength2(unit.answer.source_text) > 256 || !origin.excerpt.includes(unit.answer.source_text)) throw new V5ProtocolError("ANSWER_BINDING_INVALID", "Answer is missing or does not bind its exact source text.");
        validateAnswerValue(unit.answer.value, part.answer_contract.value_schema, registry);
        if (unit.answer.nature === "final") {
          if (Object.hasOwn(unit.answer, "temporary_basis")) throw new V5ProtocolError("ANSWER_NATURE_INVALID", "Final answer cannot carry a temporary basis.");
          evidenceLevel = "E3";
        } else if (unit.answer.nature === "temporary") {
          if (!object7(unit.answer.temporary_basis)) throw new V5ProtocolError("TEMPORARY_BASIS_REQUIRED", "Temporary answer requires an exact registered marker origin.");
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

// src/v5/case-compiler.mjs
function object8(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact7(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function nonblank10(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function nonempty3(value) {
  return Array.isArray(value) && value.length > 0;
}
function unique(values, name) {
  if (new Set(values).size !== values.length || values.some((value) => !nonblank10(value))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", `${name} must be a unique nonblank set.`);
  return [...values].sort();
}
function records(value) {
  return Array.isArray(value) ? (
    /** @type {Array<Record<string,any>>} */
    value
  ) : [];
}
function canonicalizePhase0CaseFields(value) {
  const candidate = structuredClone(value);
  candidate.fact_ids = unique(candidate.fact_ids, "Case Fact IDs");
  if (Array.isArray(candidate.supporting_observation_ids)) candidate.supporting_observation_ids = unique(candidate.supporting_observation_ids, "Case supporting observation IDs");
  for (const oracle of records(candidate.oracles)) oracle.claim_ids = unique(oracle.claim_ids, "Oracle Claim IDs");
  for (const effect of records(candidate.semantic_effects)) effect.claim_ids = unique(effect.claim_ids, "Semantic effect Claim IDs");
  if (candidate.baseline_spec) {
    candidate.baseline_spec.claim_ids = unique(candidate.baseline_spec.claim_ids, "Baseline Claim IDs");
    const comparison = candidate.baseline_spec.comparison_contract;
    if (comparison.kind === "all_observable_behavior_except") comparison.exceptions = unique(comparison.exceptions, "Baseline exceptions");
    else {
      comparison.dimensions = unique(comparison.dimensions, "Baseline dimensions");
      comparison.allowed_differences = unique(comparison.allowed_differences, "Baseline allowed differences");
    }
  }
  for (const testValue of records(candidate.test_values)) {
    testValue.used_by_refs = unique(testValue.used_by_refs, "Test value usage refs");
    const origin = testValue.value_origin;
    if (Array.isArray(origin.claim_ids)) origin.claim_ids = unique(origin.claim_ids, "Test value Claim IDs");
    if (Array.isArray(origin.input_claim_ids)) origin.input_claim_ids = unique(origin.input_claim_ids, "Derived test value Claim IDs");
    if (Array.isArray(origin.semantic_gap_ids)) origin.semantic_gap_ids = unique(origin.semantic_gap_ids, "Temporary test value gap IDs");
  }
  return candidate;
}
function phase0CaseAnchorProjection(draft) {
  return {
    module_id: draft.module_id,
    primary_test_point_id: draft.primary_test_point_id,
    acceptance_role: draft.acceptance_role,
    fact_ids: unique(draft.fact_ids, "Case Fact IDs"),
    business_preconditions: structuredClone(draft.business_preconditions),
    data_conditions: structuredClone(draft.data_conditions),
    steps: draft.steps.map((step) => ({ action: step.action })),
    semantic_effects: draft.semantic_effects ? structuredClone(draft.semantic_effects) : null,
    baseline_spec: draft.baseline_spec ? structuredClone(draft.baseline_spec) : null,
    test_values: draft.test_values ? structuredClone(draft.test_values) : null
  };
}
function phase0RequiredClaimIds(draft) {
  const claimIds = records(draft.oracles).flatMap((oracle) => oracle.claim_ids);
  for (const effect of records(draft.semantic_effects)) claimIds.push(...effect.claim_ids);
  if (draft.baseline_spec) claimIds.push(...draft.baseline_spec.claim_ids);
  for (const testValue of records(draft.test_values)) {
    const origin = testValue.value_origin;
    if (Array.isArray(origin.claim_ids)) claimIds.push(...origin.claim_ids);
    if (Array.isArray(origin.input_claim_ids)) claimIds.push(...origin.input_claim_ids);
  }
  return unique(claimIds, "Case evidence Claim IDs");
}
function finitePartitionMembers(domain, partition) {
  if (domain.domain?.kind !== "closed_enum") return null;
  if (partition.kind === "exact_members") return records(partition.values);
  if (partition.kind === "complement") {
    if (Array.isArray(partition.derived_members)) return records(partition.derived_members);
    const excluded = new Set(records(partition.excluded_values).map((value) => canonicalV5Stringify(value)));
    return records(domain.domain.members).filter((value) => !excluded.has(canonicalV5Stringify(value)));
  }
  return null;
}
function compileDomainSelections(draft, caseAnchorDigest, input, status) {
  const domainById = new Map(records(input.semantic_audit?.domains).map((domain) => [domain.domain_contract_id, domain]));
  const equivalenceById = new Map(records(input.semantic_audit?.behavior_equivalence_contracts).map((contract) => [contract.behavior_equivalence_contract_id, contract]));
  const oracleIds = new Set(records(draft.oracles).map((oracle) => oracle.oracle_semantic_contract_id));
  const seenKeys = /* @__PURE__ */ new Set();
  const seenCoordinates = /* @__PURE__ */ new Set();
  return records(draft.domain_selections).map((selection) => {
    const keys = ["selection_client_key", "case_client_key", "formal_test_point_id", "oracle_semantic_contract_id", "domain_contract_id", "partition_id", "selection"];
    if (!exact7(selection, keys) || !nonblank10(selection.selection_client_key) || seenKeys.has(selection.selection_client_key) || selection.case_client_key !== draft.case_client_key || selection.formal_test_point_id !== draft.primary_test_point_id || !oracleIds.has(selection.oracle_semantic_contract_id)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection ownership must exactly match its Case, formal Test Point, and accepted Oracle.");
    seenKeys.add(selection.selection_client_key);
    const coordinate = `${selection.domain_contract_id}\0${selection.partition_id}\0${selection.formal_test_point_id}\0${selection.oracle_semantic_contract_id}`;
    if (seenCoordinates.has(coordinate)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "A Case may bind a Domain partition at most once for one Test Point and Oracle.");
    seenCoordinates.add(coordinate);
    const domain = domainById.get(selection.domain_contract_id);
    const partition = records(domain?.partitions).find((candidate) => candidate.partition_id === selection.partition_id);
    const choice = (
      /** @type {Record<string,any>} */
      selection.selection
    );
    if (!domain || !partition || !object8(choice) || !nonempty3(choice.selected_values) || choice.selected_values.some((value) => !validateTypedValue(value))) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection must resolve one current-root Domain partition and typed values.");
    const selectedDigests = choice.selected_values.map((value) => canonicalObjectDigest(value));
    if (new Set(selectedDigests).size !== selectedDigests.length) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection values must be unique.");
    const finiteMembers = finitePartitionMembers(domain, partition);
    const finiteDigests = finiteMembers === null ? null : finiteMembers.map((value) => canonicalObjectDigest(value)).sort();
    const membership = choice.membership;
    if (!object8(membership)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection membership evidence is required.");
    if (membership.kind === "closed_domain_membership") {
      if (!exact7(membership, ["kind"]) || finiteDigests === null || selectedDigests.some((digest4) => !finiteDigests.includes(digest4))) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Closed-domain membership must select only members of the bound partition.");
    } else if (membership.kind === "decidable_predicate") {
      if (!exact7(membership, ["kind", "predicate_contract_id"]) || partition.kind !== "predicate" || !nonblank10(membership.predicate_contract_id) || membership.predicate_contract_id !== partition.predicate_contract_id) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Predicate membership must bind the partition predicate contract exactly.");
    } else if (membership.kind === "membership_witnesses") {
      const witnesses = records(membership.witnesses);
      if (!exact7(membership, ["kind", "witnesses"]) || witnesses.length === 0 || witnesses.some((witness) => !exact7(witness, ["selected_value_digest", "basis"]) || !nonempty3(witness.basis)) || canonicalV5Stringify(witnesses.map((witness) => witness.selected_value_digest).sort()) !== canonicalV5Stringify([...selectedDigests].sort())) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Membership witnesses must exactly cover the selected values with evidence.");
    } else throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection membership kind is unknown.");
    if (choice.kind === "exhaustive_members") {
      if (!exact7(choice, ["kind", "selected_values", "membership"]) || membership.kind !== "closed_domain_membership" || finiteDigests === null || canonicalV5Stringify([...selectedDigests].sort()) !== canonicalV5Stringify(finiteDigests)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Exhaustive selection must enumerate the complete finite partition.");
    } else if (choice.kind === "representative") {
      if (!exact7(choice, ["kind", "selected_values", "behavior_equivalence_contract_id", "membership"])) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Representative selection is not closed.");
      const equivalence = equivalenceById.get(choice.behavior_equivalence_contract_id);
      if (!equivalence || equivalence.domain_contract_id !== selection.domain_contract_id || equivalence.partition_id !== selection.partition_id || equivalence.formal_test_point_id !== selection.formal_test_point_id || equivalence.oracle_semantic_contract_id !== selection.oracle_semantic_contract_id) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Representative selection must bind the exact accepted equivalence contract.");
    } else if (choice.kind === "sampled") {
      if (!exact7(choice, ["kind", "selected_values", "residual_risk", "membership"]) || !nonblank10(choice.residual_risk)) throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Sampled selection requires a nonblank residual risk.");
    } else throw new V5ProtocolError("DOMAIN_CONTRACT_REQUIRED", "Domain selection kind is unknown.");
    return {
      ...structuredClone(selection),
      selected_value_digests: [...selectedDigests].sort(),
      coverage_disposition: status === "NotApplicable" ? "not_applicable" : ["Grounded", "Conditional"].includes(status) ? "covered" : "gap",
      domain_selection_id: stableV5Id("domain_selection", {
        input_semantic_root_digest: input.semantic_root_digest,
        case_anchor_digest: caseAnchorDigest,
        formal_test_point_id: selection.formal_test_point_id,
        oracle_semantic_contract_id: selection.oracle_semantic_contract_id,
        domain_contract_id: selection.domain_contract_id,
        partition_id: selection.partition_id,
        selection: choice
      })
    };
  }).sort((left, right) => left.domain_selection_id.localeCompare(right.domain_selection_id));
}
function deriveDomainCoverage(input, cases) {
  const domains = records(input.semantic_audit?.domains);
  const domainById = new Map(domains.map((domain) => [domain.domain_contract_id, domain]));
  const selections = cases.flatMap((current) => records(current.domain_selections));
  const groups = /* @__PURE__ */ new Map();
  for (const selection of selections) {
    const key = `${selection.domain_contract_id}\0${selection.formal_test_point_id}\0${selection.oracle_semantic_contract_id}`;
    const group = groups.get(key) ?? { domain_contract_id: selection.domain_contract_id, formal_test_point_id: selection.formal_test_point_id, oracle_semantic_contract_id: selection.oracle_semantic_contract_id, selections: [] };
    group.selections.push(selection);
    groups.set(key, group);
  }
  const partitionRows = [];
  const semanticPartitionCoverage = [];
  for (const group of groups.values()) {
    const domain = domainById.get(group.domain_contract_id);
    const requiredIds = records(domain?.partitions).map((partition) => partition.partition_id).sort();
    const byPartition = new Map(group.selections.map((selection) => [selection.partition_id, selection]));
    const grounded = [];
    const conditional = [];
    const blocked = [];
    for (const partitionId of requiredIds) {
      const selection = byPartition.get(partitionId);
      const currentCase = cases.find((candidate) => records(candidate.domain_selections).some((item) => item.domain_selection_id === selection?.domain_selection_id));
      const disposition = selection?.coverage_disposition ?? "gap";
      partitionRows.push({ partition_id: partitionId, disposition });
      if (!selection || ["Blocked", "Exploratory"].includes(currentCase?.semantic_status)) blocked.push(partitionId);
      else if (currentCase?.semantic_status === "Conditional") conditional.push(partitionId);
      else if (currentCase?.semantic_status === "Grounded") grounded.push(partitionId);
    }
    semanticPartitionCoverage.push({
      domain_contract_id: group.domain_contract_id,
      formal_test_point_id: group.formal_test_point_id,
      oracle_semantic_contract_id: group.oracle_semantic_contract_id,
      required_partition_ids: requiredIds,
      grounded_partition_ids: grounded.sort(),
      conditional_partition_ids: conditional.sort(),
      blocked_partition_ids: blocked.sort(),
      status: blocked.length === 0 && conditional.length === 0 ? "covered" : grounded.length === 0 && conditional.length === 0 ? "blocked" : "partial"
    });
  }
  const valueRows = selections.map((selection) => ({ value_instance_id: selection.domain_selection_id, disposition: selection.coverage_disposition }));
  const valueInstanceCoverage = selections.map((selection) => {
    const domain = domainById.get(selection.domain_contract_id);
    const partition = records(domain?.partitions).find((candidate) => candidate.partition_id === selection.partition_id);
    const finite = domain && partition ? finitePartitionMembers(domain, partition) : null;
    return {
      domain_contract_id: selection.domain_contract_id,
      formal_test_point_id: selection.formal_test_point_id,
      oracle_semantic_contract_id: selection.oracle_semantic_contract_id,
      partition_id: selection.partition_id,
      universe: finite === null ? { kind: "open_or_unknown" } : { kind: "finite", total_instances: finite.length },
      selected_value_digests: selection.selected_value_digests,
      status: selection.selection.kind === "exhaustive_members" ? "exhaustive" : finite === null ? "unknown" : "partial"
    };
  }).sort((left, right) => `${left.domain_contract_id}\0${left.partition_id}`.localeCompare(`${right.domain_contract_id}\0${right.partition_id}`));
  return { partitionRows, valueRows, semanticPartitionCoverage, valueInstanceCoverage };
}
function legacyStableId(prefix, payload) {
  return `${prefix}-${canonicalObjectDigest(payload).slice(7)}`;
}
function deriveCoverage(input, cases, domainCoverage) {
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
    semantic_partition: summarize(domainCoverage.partitionRows.length > 0 ? domainCoverage.partitionRows : records(input.semantic_partitions)),
    value_instance: summarize(domainCoverage.valueRows.length > 0 ? domainCoverage.valueRows : records(input.value_instances)),
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
function compileV5CaseDocumentBundle(input) {
  if (!object8(input) || !nonblank10(input.case_document_lineage_id) || !/^sha256:[0-9a-f]{64}$/u.test(input.semantic_root_digest) || !Number.isSafeInteger(input.source_revision) || input.source_revision < 0 || !Array.isArray(input.case_drafts)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case compilation input is invalid.");
  const assessmentByClaim = /* @__PURE__ */ new Map();
  for (const assessment of records(input.claim_assessments)) {
    if (!nonblank10(assessment.claim_id) || assessmentByClaim.has(assessment.claim_id) || !["E1", "E2", "E3"].includes(assessment.level) || !["supported", "uncertain", "unsupported"].includes(assessment.support_review)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Claim assessment inventory is invalid or ambiguous.");
    assessmentByClaim.set(assessment.claim_id, assessment);
  }
  const factById = /* @__PURE__ */ new Map();
  for (const fact of records(input.fact_assessments)) {
    if (!nonblank10(fact.fact_id) || factById.has(fact.fact_id) || !Array.isArray(fact.claim_ids) || fact.claim_ids.length === 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Fact assessment inventory is invalid or ambiguous.");
    const claimIds = unique(fact.claim_ids, "Fact Claim IDs");
    if (claimIds.some((claimId) => !assessmentByClaim.has(claimId))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Fact ancestry must resolve accepted Claims.");
    factById.set(fact.fact_id, { ...structuredClone(fact), claim_ids: claimIds });
  }
  const acceptedGapIds = new Set(unique(input.accepted_gap_ids ?? [], "Accepted gap IDs"));
  const dispositionByPoint = /* @__PURE__ */ new Map();
  for (const disposition of records(input.formal_test_point_dispositions)) {
    if (!nonblank10(disposition.formal_test_point_id) || dispositionByPoint.has(disposition.formal_test_point_id) || !["formal", "semantic_gap", "not_applicable", "exploratory"].includes(disposition.kind)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Formal Test Point disposition inventory is invalid or ambiguous.");
    dispositionByPoint.set(disposition.formal_test_point_id, disposition);
  }
  const oracleContractById = new Map(records(input.oracle_semantic_contracts).map((contract) => [contract.oracle_semantic_contract_id, contract]));
  if (oracleContractById.size !== records(input.oracle_semantic_contracts).length) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Accepted Oracle semantic-contract identities are duplicated.");
  const seenClientKeys = /* @__PURE__ */ new Set();
  const clientKeyBindings = [];
  const bindClientKey = (clientKey, stableId2) => {
    if (!nonblank10(clientKey) || seenClientKeys.has(clientKey)) throw new V5ProtocolError("CLIENT_KEY_INVALID", "Case, Step, Oracle, and DomainSelection client keys must be globally unique within the Case batch.");
    seenClientKeys.add(clientKey);
    clientKeyBindings.push({ client_key: clientKey, stable_id: stableId2 });
  };
  const seenCaseClientKeys = /* @__PURE__ */ new Set();
  const cases = input.case_drafts.map((draft) => {
    const requiredKeys = ["case_client_key", "title", "module_id", "priority", "ordering", "acceptance_role", "fact_ids", "primary_test_point_id", "supporting_observation_ids", "business_preconditions", "data_conditions", "steps", "case_step_semantic_bindings", "domain_selections", "oracles"];
    const optionalKeys = ["semantic_effects", "baseline_spec", "test_values"];
    const actualKeys = Object.keys(draft);
    if (!requiredKeys.every((key) => actualKeys.includes(key)) || actualKeys.some((key) => !requiredKeys.includes(key) && !optionalKeys.includes(key)) || !nonblank10(draft.case_client_key) || seenCaseClientKeys.has(draft.case_client_key) || !nonblank10(draft.title) || !nonblank10(draft.module_id) || !["P0", "P1", "P2", "P3"].includes(draft.priority) || !object8(draft.ordering) || !["primary_acceptance", "dependency_contract", "context_only"].includes(draft.acceptance_role) || !nonblank10(draft.primary_test_point_id) || !Array.isArray(draft.fact_ids) || draft.fact_ids.length === 0 || !Array.isArray(draft.supporting_observation_ids) || !Array.isArray(draft.business_preconditions) || !Array.isArray(draft.data_conditions) || !Array.isArray(draft.steps) || draft.steps.length === 0 || !Array.isArray(draft.case_step_semantic_bindings) || !Array.isArray(draft.domain_selections) || !Array.isArray(draft.oracles) || draft.oracles.length === 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case Draft must preserve the frozen Phase 0 fields and exact V5 extension.");
    seenCaseClientKeys.add(draft.case_client_key);
    const factIds = unique(draft.fact_ids, "Case Fact IDs");
    const facts = factIds.map((factId) => factById.get(factId));
    if (facts.some((fact) => !fact)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Case references an unknown Compiler-owned Fact.");
    const claimIds = [.../* @__PURE__ */ new Set([...facts.flatMap((fact) => fact.claim_ids), ...phase0RequiredClaimIds(draft)])].sort();
    const assessments = claimIds.map((claimId) => assessmentByClaim.get(claimId));
    if (assessments.some((assessment) => !assessment || assessment.support_review !== "supported")) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Case references unsupported or unknown business evidence.");
    const disposition = dispositionByPoint.get(draft.primary_test_point_id) ?? { formal_test_point_id: draft.primary_test_point_id, kind: "formal" };
    let gapIds = [];
    let notApplicableLevels;
    let exploratoryOnly = false;
    if (disposition.kind === "semantic_gap") {
      if (!exact7(disposition, ["formal_test_point_id", "kind", "semantic_gap_ids"])) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Semantic-gap Test Point disposition is not closed.");
      gapIds = unique(disposition.semantic_gap_ids, "Test Point semantic gap IDs");
      if (gapIds.length === 0 || gapIds.some((gapId) => !acceptedGapIds.has(gapId))) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Test Point references an unaccepted semantic gap.");
    } else if (disposition.kind === "not_applicable") {
      if (!exact7(disposition, ["formal_test_point_id", "kind", "exclusion_basis"])) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "NotApplicable Test Point disposition is not closed.");
      notApplicableLevels = records(disposition.exclusion_basis).map((basis) => {
        const assessment = basis.kind === "claim" ? assessmentByClaim.get(basis.claim_id) : void 0;
        if (!assessment || assessment.support_review !== "supported") throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "NotApplicable basis is not accepted evidence.");
        return assessment.level;
      });
    } else if (disposition.kind === "exploratory") {
      if (!exact7(disposition, ["formal_test_point_id", "kind", "observation_intent"]) || !nonblank10(disposition.observation_intent)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Exploratory Test Point disposition is not closed.");
      exploratoryOnly = true;
    } else if (!exact7(disposition, ["formal_test_point_id", "kind"])) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Formal Test Point disposition is not closed.");
    const status = deriveCaseStatus({ evidence_levels: assessments.map((assessment) => assessment.level), unresolved_gap_ids: gapIds, not_applicable_basis_levels: notApplicableLevels, exploratory_only: exploratoryOnly });
    const stepKeys = unique(draft.steps.map((step) => step.step_client_key), "Case step client keys");
    const acceptedContractRefs = new Set(records(input.semantic_audit?.permission_auxiliary_contracts).map((contract) => typedContractRefKey({ contract_id: contract.permission_auxiliary_contract_id, contract_kind: contract.payload?.contract_kind, semantic_root_digest: input.semantic_root_digest })));
    const permissionCells = records(input.permission_cells).map((cell) => {
      let formalOutcome;
      if (cell.disposition === "formal" && cell.permission_dimension === "decision") formalOutcome = { permission_dimension: "decision", action_ref: cell.action_ref, expected: cell.expected };
      else if (cell.disposition === "formal" && cell.permission_dimension === "denial_behavior") formalOutcome = { permission_dimension: "denial_behavior", decision_cell_key: cell.decision_cell_key, denial_contract_ref: cell.denial_contract_ref };
      else if (cell.disposition === "formal" && cell.permission_dimension === "data_scope") formalOutcome = { permission_dimension: "data_scope", data_scope_contract_ref: cell.data_scope_contract_ref };
      return { ...structuredClone(cell), ...formalOutcome ? { formal_outcome: formalOutcome } : {} };
    });
    const oracleContext = { semanticRootDigest: input.semantic_root_digest, semanticRuleIndex: input.semantic_rule_index ?? { by_id: {} }, stepClientKeys: stepKeys, acceptedClaimIds: claimIds, oracleSemanticContractIds: [...oracleContractById.keys()], fieldCorrespondenceIds: records(input.semantic_audit?.field_correspondences).map((row) => row.field_correspondence_id), permissionCells, acceptedContractRefs };
    const anchorProjection = canonicalizePhase0CaseFields(phase0CaseAnchorProjection(draft));
    const caseAnchorDigest = canonicalObjectDigest({ input_semantic_root_digest: input.semantic_root_digest, case_identity_projection: anchorProjection });
    const bindings = records(draft.case_step_semantic_bindings);
    if (bindings.length !== draft.steps.length) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Case step semantic bindings must exactly cover all Case steps.");
    for (const step of draft.steps) {
      if (!exact7(step, ["step_client_key", "action"]) || !nonblank10(step.action)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case step must contain only a local key and action.");
      const matches = bindings.filter((binding) => exact7(binding, ["case_client_key", "step_client_key", "action_ref"]) && binding.case_client_key === draft.case_client_key && binding.step_client_key === step.step_client_key && object8(binding.action_ref) && binding.action_ref.semantic_root_digest === input.semantic_root_digest);
      if (matches.length !== 1) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Each Case step needs one exact accepted semantic-action binding.");
    }
    const bindingByStepKey = new Map(bindings.map((binding) => [binding.step_client_key, binding]));
    const domainSelections = compileDomainSelections(draft, caseAnchorDigest, input, status);
    const steps = draft.steps.map((step, index) => {
      const binding = bindingByStepKey.get(step.step_client_key);
      if (!binding) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Each Case step needs one exact accepted semantic-action binding.");
      const actionRef = binding.action_ref;
      return { step_id: legacyStableId("STEP", { case_anchor_digest: caseAnchorDigest, sequence: index + 1, action: step.action, action_ref: actionRef }), step_client_key: step.step_client_key, action: step.action, action_ref: structuredClone(actionRef) };
    });
    const stepIdByKey = new Map(steps.map((step) => [step.step_client_key, step.step_id]));
    const oracles = draft.oracles.map((oracle) => {
      validateTypedOracle(oracle, oracleContext);
      const semanticContract = oracleContractById.get(oracle.oracle_semantic_contract_id);
      const semanticAssertion = structuredClone(oracle.assertion);
      if (semanticAssertion.kind === "transition") delete semanticAssertion.trigger_step_client_key;
      if (!semanticContract || canonicalV5Stringify(oracle.observation_ref) !== canonicalV5Stringify(semanticContract.observation_ref) || canonicalV5Stringify(semanticAssertion) !== canonicalV5Stringify(semanticContract.assertion) || canonicalV5Stringify(oracle.evaluation_scope) !== canonicalV5Stringify(semanticContract.evaluation_scope) || canonicalV5Stringify(oracle.observation_window) !== canonicalV5Stringify(semanticContract.observation_window)) throw new V5ProtocolError("ORACLE_SEMANTICS_REQUIRED", "Case Oracle does not exactly project its accepted semantic contract.");
      return {
        oracle_client_key: oracle.oracle_client_key,
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
    const publicSteps = steps.map(({ step_client_key: ignoredKey, action_ref: ignoredRef, ...step }) => step);
    const publicOracles = oracles.map(({ oracle_client_key: ignored, ...oracle }) => oracle);
    const identity = canonicalizePhase0CaseFields({
      module_id: draft.module_id,
      primary_test_point_id: draft.primary_test_point_id,
      acceptance_role: draft.acceptance_role,
      fact_ids: factIds,
      business_preconditions: draft.business_preconditions,
      data_conditions: draft.data_conditions,
      steps: publicSteps,
      oracles: publicOracles,
      semantic_effects: draft.semantic_effects ?? null,
      baseline_spec: draft.baseline_spec ?? null,
      test_values: draft.test_values ?? null,
      supporting_observation_ids: draft.supporting_observation_ids
    });
    delete identity.supporting_observation_ids;
    const caseId = legacyStableId("CASE", identity);
    bindClientKey(draft.case_client_key, caseId);
    for (const step of steps) bindClientKey(step.step_client_key, step.step_id);
    for (const oracle of oracles) bindClientKey(oracle.oracle_client_key, oracle.oracle_id);
    const publicDomainSelections = domainSelections.map(({ selection_client_key: clientKey, case_client_key: ignoredCaseKey, ...selection }) => {
      bindClientKey(clientKey, selection.domain_selection_id);
      return { ...selection, case_id: caseId };
    });
    return {
      case_id: caseId,
      title: draft.title,
      module_id: draft.module_id,
      priority: draft.priority,
      ordering: structuredClone(draft.ordering),
      acceptance_role: draft.acceptance_role,
      fact_ids: factIds,
      primary_test_point_id: draft.primary_test_point_id,
      supporting_observation_ids: unique(draft.supporting_observation_ids, "Case supporting observation IDs"),
      semantic_status: status,
      business_preconditions: structuredClone(draft.business_preconditions),
      data_conditions: structuredClone(draft.data_conditions),
      steps: publicSteps,
      oracles: publicOracles,
      case_step_semantic_bindings: steps.map((step) => ({ case_id: caseId, step_id: step.step_id, action_ref: structuredClone(step.action_ref) })),
      domain_selections: publicDomainSelections,
      ...draft.semantic_effects ? { semantic_effects: structuredClone(draft.semantic_effects) } : {},
      ...draft.baseline_spec ? { baseline_spec: structuredClone(draft.baseline_spec) } : {},
      ...draft.test_values ? { test_values: structuredClone(draft.test_values) } : {}
    };
  }).sort((left, right) => left.case_id.localeCompare(right.case_id));
  if (new Set(cases.map((current) => current.case_id)).size !== cases.length) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Derived Case identities collide.");
  const classificationCounts = { Blocked: 0, Conditional: 0, Exploratory: 0, Grounded: 0, NotApplicable: 0 };
  for (const current of cases) classificationCounts[current.semantic_status] += 1;
  const domainCoverage = deriveDomainCoverage(input, cases);
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
    coverage: deriveCoverage(input, cases, domainCoverage),
    permission_coverage: derivePermissionCoverage(records(input.permission_cells)),
    semantic_partition_coverage: domainCoverage.semanticPartitionCoverage,
    value_instance_coverage: domainCoverage.valueInstanceCoverage,
    risk_ledger: structuredClone(input.risk_ledger ?? { reviewed_cell_count: 0, items: [] }),
    semantic_audit: structuredClone(input.semantic_audit ?? { value_states: [], field_correspondences: [], domains: [], populations: [] }),
    provenance: { output_role: "downstream_only", may_supply_upstream_evidence: false, semantic_root_digest: input.semantic_root_digest }
  };
  return {
    document: { ...payload, bundle_digest: canonicalObjectDigest(payload) },
    client_key_bindings: clientKeyBindings.sort((left, right) => left.client_key.localeCompare(right.client_key))
  };
}
function compileV5CaseDocumentTransaction(input) {
  return compileV5CaseDocumentBundle(input);
}
function validateV5CaseDocument(document) {
  if (!object8(document) || document.schema_version !== "5.0.0" || document.compiler_version !== "0.6.0" || document.delivery_intent !== "case_document" || !Array.isArray(document.cases) || document.provenance?.output_role !== "downstream_only") throw new V5ProtocolError("CANONICAL_RENDER_MISMATCH", "Canonical V5 Case Document shape is invalid.");
  const { bundle_digest: declared, ...payload } = document;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError("CANONICAL_RENDER_MISMATCH", "Canonical V5 Case Document digest is invalid.");
  return structuredClone(document);
}
function projectCompatibilityExecutionPlan(document, metadata) {
  validateV5CaseDocument(document);
  if (!nonblank10(metadata.run_id) || !Number.isSafeInteger(metadata.revision) || metadata.revision < 0) throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Execution Plan requires an immutable Case Document revision.");
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
  Object.freeze({ single: "\u5355\u9879", forall: "\u5168\u79F0\u8303\u56F4" })
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
    lines.push(`- Acceptance role: ${current.acceptance_role}`);
    lines.push(`- Primary Test Point: ${current.primary_test_point_id}`);
    lines.push(`- Facts: ${current.fact_ids.join("\u3001")}`);
    const oracleScopes = [...new Set(current.oracles.map((oracle) => scopeText(oracle.evaluation_scope)))];
    lines.push(`- Scope: ${oracleScopes.join("\u3001")}`);
    lines.push("", "Steps:");
    for (const [index, step] of current.steps.entries()) {
      lines.push(`${index + 1}. ${step.action}`);
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
  const rows = [["case_id", "semantic_status", "title", "module_id", "acceptance_role", "primary_test_point_id", "fact_ids", "scope_kind", "step_sequence", "step_id", "action", "oracle_id", "oracle_kind", "oracle_assertion"]];
  for (const current of document.cases) {
    for (const [index, step] of current.steps.entries()) {
      const oracles = current.oracles.filter((oracle) => oracle.observe_after_step_id === step.step_id);
      if (oracles.length === 0) oracles.push({});
      for (const oracle of oracles) rows.push([
        current.case_id,
        current.semantic_status,
        current.title,
        current.module_id,
        current.acceptance_role,
        current.primary_test_point_id,
        current.fact_ids.join("|"),
        [...new Set(current.oracles.map((item) => item.evaluation_scope.kind))].join("|"),
        index + 1,
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
var interfaceSchemas = generateV5InterfaceSchemas(contracts);
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
function validatePublicRequestSchema(request, kind) {
  const schema = kind === "create" ? interfaceSchemas.createRequest : interfaceSchemas.advanceRequest;
  const issues = validateAgainstSchema(request, schema);
  if (issues.length === 0) return;
  throw new V5ProtocolError(kind === "create" ? "RUN_ARGUMENT_INVALID" : "SCHEMA_VALIDATION_FAILED", `Public ${kind} request violates its closed Schema at ${issues[0].path}.`);
}
var COMPILER_OWNED_ARTIFACT_FIELDS = /* @__PURE__ */ new Set([
  "schema_version",
  "compiler_version",
  "accepted_revision",
  "canonical_payload_digest",
  "envelope_digest",
  "payload_producer",
  "envelope_producer",
  "producer_stage",
  "producer_run_id",
  "case_document_lineage_id",
  "input_digests",
  "run_id",
  "checkpoint_digest",
  "selector_snapshot_digest",
  "commit_receipt",
  "claim_assessments",
  "accepted_gap_ids",
  "formal_test_point_ids",
  "semantic_partitions",
  "value_instances",
  "permission_cells",
  "risk_ledger",
  "semantic_audit",
  "provenance_graph"
]);
function validateAgentArtifactRoot(artifact, allowed) {
  const extra = Object.keys(artifact).filter((key) => !allowed.includes(key));
  if (extra.some((key) => COMPILER_OWNED_ARTIFACT_FIELDS.has(key))) throw new V5ProtocolError("COMPILER_OWNED_FIELD_SUBMITTED", "Agent artifact contains a Compiler-owned envelope or state field.");
  if (extra.length > 0) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Agent artifact contains fields outside its closed branch.");
}
function rewriteBatchLocalReferences(value, bindings) {
  const stableByClientKey = new Map(bindings.map((binding) => [binding.client_key, binding.stable_id]));
  const rewrite = (candidate) => {
    if (typeof candidate === "string") return stableByClientKey.get(candidate) ?? candidate;
    if (Array.isArray(candidate)) return candidate.map(rewrite);
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(Object.entries(candidate).map(([key, child]) => [key, rewrite(child)]));
  };
  return rewrite(structuredClone(value));
}
function validateAcceptedClaimReferences(value, acceptedClaimIds) {
  if (Array.isArray(value)) {
    value.forEach((item) => validateAcceptedClaimReferences(item, acceptedClaimIds));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = (
    /** @type {Record<string,any>} */
    value
  );
  if (record.kind === "claim" && typeof record.claim_id === "string" && !acceptedClaimIds.has(record.claim_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Downstream artifacts must reference accepted Compiler-owned Claim IDs, not batch-local client keys.");
  if (typeof record.formal_claim_id === "string" && !acceptedClaimIds.has(record.formal_claim_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Formal risk requirements must reference an accepted Compiler-owned Claim ID.");
  Object.values(record).forEach((item) => validateAcceptedClaimReferences(item, acceptedClaimIds));
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
function readOnlyIntegrityReply(current, code, message, context, affectedRefs = []) {
  const trigger = { kind: "verified_fsm_cell", fsm_cell_id: current.checkpoint.fsm_cell_id };
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === code && candidate.source.response_context === context && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(trigger) && candidate.exact_projection_kind === "read_only_integrity_fatal");
  if (!row) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Read-only integrity reply contract is missing for ${code}/${context}/${current.checkpoint.fsm_cell_id}.`);
  return {
    kind: "run_reply",
    schema_version: V5_SCHEMA_VERSION,
    run_id: current.identity.run_id,
    run_directory: current.layout.root,
    case_document_lineage_id: current.identity.case_document_lineage_id,
    delivery_intent: current.identity.delivery_intent,
    projection_kind: "read_only_integrity_fatal",
    reply_contract_id: row.reply_contract_id,
    run_lifecycle: "fatal",
    reply_status: "fatal",
    last_verified_state: { kind: "checkpoint", fsm_cell_id: current.checkpoint.fsm_cell_id, stage: current.checkpoint.stage, obligation: current.checkpoint.obligation, current_revision: current.checkpoint.current_revision, checkpoint_digest: current.checkpoint.checkpoint_digest },
    selector_snapshot_digest: null,
    available_actions: [],
    work_packet: { kind: "terminal_work", terminal_kind: current.identity.delivery_intent === "case_document" ? "case_document_fatal" : "execution_plan_fatal" },
    commit_receipt: null,
    diagnostics: [{ code, affected_refs: affectedRefs, message }]
  };
}
async function persistAcceptedClosureFatal(current, request, error) {
  if (current.checkpoint.run_lifecycle === "fatal") return readOnlyIntegrityReply(current, error.code, error.message, "run_mutation", Array.isArray(error.affected_refs) ? error.affected_refs : []);
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === error.code && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id && candidate.exact_projection_kind === "persisted_run_state");
  if (!row || row.exact_commit.kind !== "operational_commit") throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Fatal integrity reply contract is missing for ${error.code}/${current.checkpoint.fsm_cell_id}.`);
  const affectedRefs = Array.isArray(error.affected_refs) ? error.affected_refs : [];
  const actionDigest = actionDigestV5("advance", request.action);
  const incidentRecord = sealV5Record({
    kind: "normal_chain_fatal_incident",
    schema_version: V5_SCHEMA_VERSION,
    run_id: current.identity.run_id,
    diagnostic_code: error.code,
    target_kind: error.integrity_target_kind ?? "accepted_closure",
    affected_refs: affectedRefs,
    prior_checkpoint_digest: current.checkpoint.checkpoint_digest,
    previous_run_transaction_digest: current.transaction.transaction_digest
  }, "incident_record_digest");
  const targetCellId = current.identity.delivery_intent === "case_document" ? "cd.terminal.fatal" : "ep.terminal.fatal";
  const checkpointBase = {
    ...current.checkpoint,
    run_lifecycle: "fatal",
    fsm_cell_id: targetCellId,
    stage: row.exact_stage,
    obligation: row.exact_obligation,
    fatal_incident_record_digest: incidentRecord.incident_record_digest
  };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, []);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: row.exact_commit.effect };
  const reply = {
    kind: "run_reply",
    schema_version: V5_SCHEMA_VERSION,
    projection_kind: row.exact_projection_kind,
    reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status,
    run_id: current.identity.run_id,
    run_directory: current.layout.root,
    case_document_lineage_id: current.identity.case_document_lineage_id,
    delivery_intent: current.identity.delivery_intent,
    run_lifecycle: "fatal",
    stage: row.exact_stage,
    obligation: row.exact_obligation,
    current_revision: current.checkpoint.current_revision,
    checkpoint_digest: selectorState.checkpoint.checkpoint_digest,
    selector_snapshot_digest: selectorState.sidecar.selector_sidecar_digest,
    diagnostics: [{ code: error.code, affected_refs: affectedRefs, message: error.message }],
    available_actions: [],
    commit_receipt: commitReceipt,
    work_packet: { kind: "terminal_work", terminal_kind: current.identity.delivery_intent === "case_document" ? "case_document_fatal" : "execution_plan_fatal" }
  };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, incidentRecord });
}
async function persistRunRejection(current, request, code, message) {
  const reply = runRejection(current, code, message);
  const internalReceipt = { kind: "operational_commit", committed_action_digest: actionDigestV5("advance", request.action), semantic_revision_delta: 0, client_key_bindings: [], operational_effect: "idempotency_only" };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: current.checkpoint, selectorSidecar: current.selectorSidecar, reply, commitReceipt: internalReceipt });
}
var BEHAVIOR_GAP_DIAGNOSTIC = Object.freeze({
  null_policy: "FIELD_CORRESPONDENCE_REQUIRED",
  domain_boundary: "DOMAIN_CONTRACT_REQUIRED",
  population_scope: "POPULATION_CONTRACT_REQUIRED",
  permission_outcome: "PERMISSION_OUTCOME_UNRESOLVED"
});
var BEHAVIOR_GAP_COMMIT_ERRORS = new Set(Object.values(BEHAVIOR_GAP_DIAGNOSTIC));
async function persistOracleReroute(current, request, message) {
  const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === "ORACLE_SEMANTICS_REQUIRED" && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id);
  if (!row || row.exact_commit.kind !== "operational_commit") throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Oracle reroute reply contract is unavailable.");
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, "seed_digest");
  const workPacket = { kind: "behavior_work", context: current.reply.work_packet.context, permission_matrix_worklists: await permissionMatricesForCurrent(current, current.checkpoint.semantic_root_digest), behavior_contract_worklist: seed };
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
  if (Object.hasOwn(request, "schema_version") && request.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError("UNSUPPORTED_SCHEMA_VERSION", "Only Schema 5.0.0 create requests are supported.");
  validatePublicRequestSchema(request, "create");
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
      run_directory_key: runId,
      delivery_intent: "case_document",
      case_document_lineage_id: lineageId,
      canonical_create_request_digest: canonicalObjectDigest(request),
      creation_binding: {
        kind: "case_document",
        source_bootstrap_digest: (
          /** @type {Record<string, any>} */
          sourceState.ledger.source_bootstrap_digest
        ),
        source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest
      }
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
  let sourceRun;
  try {
    sourceRun = await readVerifiedRun(path5.join(catalog.runsDirectory, caseDocumentRef.run_id));
  } catch {
    throw new V5ProtocolError("CASE_DOCUMENT_REFERENCE_INVALID", "Case Document reference does not resolve to a verified V5 delivery.");
  }
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
    run_directory_key: runId,
    delivery_intent: "execution_plan",
    case_document_lineage_id: caseDocumentRef.case_document_lineage_id,
    canonical_create_request_digest: canonicalObjectDigest(request),
    creation_binding: { kind: "execution_plan", case_document_ref: caseDocumentRef }
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
  let parent;
  try {
    parent = await readVerifiedRun(path5.join(catalog.runsDirectory, parentRunId));
  } catch {
    throw new V5ProtocolError("RESUME_PARENT_INVALID", "Parent run does not resolve to a verified cancelled V5 run.");
  }
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
  const compilerProjectionDigests = [];
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
    compilerProjectionDigests.push(projection.projection_record_digest);
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
    compilerProjectionDigests.push(projection.projection_record_digest);
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
    compiler_projection_digests: [...new Set(compilerProjectionDigests)].sort(),
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
    run_directory_key: runId,
    delivery_intent: parent.identity.delivery_intent,
    case_document_lineage_id: parent.identity.case_document_lineage_id,
    canonical_create_request_digest: canonicalObjectDigest(request),
    creation_binding: { kind: "resume_cancelled", ...checkpointBase.resume_lineage }
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
    if (error instanceof V5ProtocolError) {
      if (error.code === "RUN_ARGUMENT_INVALID") return preRunReply(error.code, error.message);
      if (!plainObject2(requestValue) || !hasExactKeys(requestValue, ["idempotency_key", "action"]) || typeof requestValue.idempotency_key !== "string" || requestValue.idempotency_key.length === 0 || !plainObject2(requestValue.action)) return preRunReply("ACCEPTED_STATE_INTEGRITY_FAILURE", error.message);
      try {
        const layout = await resolveRunLayout(runDirectory);
        const identity = (await readFixedSealedRecord(layout.identity, "run_identity_digest")).record;
        const trigger = { kind: "no_verified_fsm_cell", delivery_intent: identity.delivery_intent };
        const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === "ACCEPTED_STATE_INTEGRITY_FAILURE" && candidate.source.response_context === "run_mutation" && candidate.source.response_variant_id === "mutation_quarantine" && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(trigger));
        if (!row) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Integrity quarantine reply contract is unavailable.");
        let lastVerifiedState = { kind: "none" };
        try {
          const pointer = (await readFixedSealedRecord(layout.currentPointer, "pointer_digest")).record;
          const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, "transaction_digest");
          const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, "checkpoint_digest");
          if (pointer.run_id === identity.run_id && transaction.run_id === identity.run_id && checkpoint.run_id === identity.run_id) lastVerifiedState = { kind: "checkpoint", fsm_cell_id: checkpoint.fsm_cell_id, stage: checkpoint.stage, obligation: checkpoint.obligation, current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest };
        } catch {
        }
        return await publishIntegrityQuarantine(
          layout.root,
          {
            observed_failure: error.message,
            affected_refs: Array.isArray(error.affected_refs) ? error.affected_refs : [],
            last_verified_state: lastVerifiedState,
            last_verified_revision: lastVerifiedState.kind === "checkpoint" ? lastVerifiedState.current_revision : 0,
            reply_contract_id: row.reply_contract_id
          },
          /** @type {{idempotency_key:string,action:Record<string,any>}} */
          requestValue
        );
      } catch (quarantineError) {
        if (quarantineError instanceof V5ProtocolError) return preRunReply(quarantineError.code, quarantineError.message);
        throw quarantineError;
      }
    }
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
    try {
      await verifyV5AcceptedClosure(current);
    } catch (error) {
      if (!(error instanceof V5ProtocolError)) throw error;
      return await persistAcceptedClosureFatal(current, request, error);
    }
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
    if (error.code === "IDEMPOTENCY_CONFLICT") return runRejection(current, error.code, error.message, current.checkpoint.run_lifecycle === "active" ? "persisted_run_state" : "read_only_terminal_rejection");
    if (error.code === "ORACLE_SEMANTICS_REQUIRED" && current.checkpoint.fsm_cell_id === "cd.active.case.drafts") return persistOracleReroute(current, request, error.message);
    if (current.checkpoint.fsm_cell_id === "cd.active.case.behavior" && /** @type {Set<string>} */
    BEHAVIOR_GAP_COMMIT_ERRORS.has(error.code)) return persistRunRejection(current, request, "SCHEMA_VALIDATION_FAILED", error.message);
    return persistRunRejection(current, request, error.code, error.message);
  }
}
async function advanceExecution(current, request, templateId) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "operation"]) || action.kind !== "advance_execution_plan" || !plainObject2(action.operation)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Execution action is not a closed operation wrapper.");
  const capability = { kind: "advance_execution_plan", allowed_operation_kinds: templateId === "execution.advance_closure" ? ["provide_capability_proof", "set_execution_disposition"] : ["pause_execution", "confirm_execution_plan"] };
  validateAdvertisedAction(current, action, capability);
  validatePublicRequestSchema(request, "advance");
  const advanced = await advanceV5ExecutionProjection(current.reply.work_packet.execution_projection, action.operation, currentV5ExecutionServices());
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
  if (targetCell.lifecycle !== "active") {
    checkpointBase.run_lifecycle = targetCell.lifecycle;
    if (targetCell.lifecycle === "finished") checkpointBase.final_execution_projection_digest = advanced.projection.execution_snapshot_digest;
  }
  const workPacket = targetCell.lifecycle === "finished" ? { kind: "terminal_work", terminal_kind: "execution_plan_finished", case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection } : { kind: "execution_work", case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection };
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = (
    /** @type {Record<string,any>} */
    persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest)
  );
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
  if (action.presentation_id !== current.reply.work_packet.presentation.presentation_id || action.semantic_root_digest !== current.reply.work_packet.presentation.semantic_root_digest) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Clarification preview must bind the current presentation and semantic root.");
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
  validatePublicRequestSchema(request, "advance");
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "clarification.preview", result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  delete checkpointBase.checkpoint_digest;
  checkpointBase.fsm_cell_id = outcome.target_cell_id;
  checkpointBase.stage = targetCell.stage;
  checkpointBase.obligation = targetCell.obligation;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "operational_commit", committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = (
    /** @type {Record<string,any>} */
    persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest)
  );
  if (resultKey === "semantic_change") {
    const confirmationRow = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === "CLARIFICATION_CONFIRMATION_REQUIRED" && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id && candidate.exact_projection_kind === "persisted_run_state");
    if (!confirmationRow) throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", "Clarification confirmation reply contract is unavailable.");
    reply.reply_contract_id = confirmationRow.reply_contract_id;
    reply.reply_status = confirmationRow.exact_reply_status;
    reply.diagnostics = [{ code: "CLARIFICATION_CONFIRMATION_REQUIRED", affected_refs: [], message: "Preview is pending explicit confirmation." }];
  }
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}
async function advanceClarificationCommit(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "presentation_id", "semantic_root_digest", "preview_digest", "raw_confirmation", "confirmation_range"]) || typeof action.raw_confirmation !== "string" || !plainObject2(action.confirmation_range)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Clarification commit action is invalid.");
  if (action.presentation_id !== current.reply.work_packet.presentation.presentation_id || action.semantic_root_digest !== current.reply.work_packet.presentation.semantic_root_digest || action.preview_digest !== current.reply.work_packet.clarification_preview.preview_digest) throw new V5ProtocolError("CLARIFICATION_PREVIEW_STALE", "Clarification commit must bind the current presentation, semantic root, and preview.");
  validateAdvertisedAction(current, action, { kind: "commit_clarification_response", presentation_id: current.reply.work_packet.presentation.presentation_id, semantic_root_digest: current.reply.work_packet.presentation.semantic_root_digest, preview_digest: current.reply.work_packet.clarification_preview.preview_digest });
  const { stateSet, presentation, gaps } = await clarificationState(current);
  const preview = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.preview_digest);
  const pending = await readSealedV5Record(current.layout.compilerState, current.checkpoint.pending_clarification_digest, "pending_record_digest");
  const committed = commitClarificationResponse({ pending, preview, state_set: stateSet, raw_confirmation: action.raw_confirmation, confirmation_range: action.confirmation_range, control_registry: contracts.clarificationControlRegistry, current: { semantic_root_digest: current.checkpoint.semantic_root_digest, presentation_digest: current.checkpoint.presentation_digest, question_part_state_set_digest: current.checkpoint.question_part_state_set_digest, source_revision: current.checkpoint.current_revision, checkpoint_digest: pending.base_checkpoint_digest } });
  validatePublicRequestSchema(request, "advance");
  const unresolved = committed.next_state_set.parts.some((part) => ["presented", "deferred_by_user", "unknown_by_user"].includes(part.current_state));
  const invalidated = new Set(preview.deterministic_projection.invalidated_artifact_ids ?? []);
  const requirementsStage = current.checkpoint.stage === "requirements_analysis";
  let resultKey;
  if (unresolved) resultKey = "actionable_gaps";
  else if (requirementsStage) resultKey = invalidated.size > 0 ? "requirements_review_invalidated" : "requirements_ready";
  else if ([...invalidated].some((ref) => String(ref).includes("requirements"))) resultKey = "requirements_invalidated";
  else if ([...invalidated].some((ref) => String(ref).includes("behavior"))) resultKey = "behavior_invalidated";
  else resultKey = current.checkpoint.case_document_ref ? "all_gates_passed" : "case_drafts_required";
  const clarificationImpactDigest = canonicalObjectDigest(committed.impact);
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
    workPacket = { kind: "behavior_work", context: current.reply.work_packet.context, permission_matrix_worklists: await permissionMatricesForCurrent(current, committed.impact.after_graph_digest), behavior_contract_worklist: seed };
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
    applied_clarification_impact_digest: clarificationImpactDigest,
    accepted_decision_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_decision_digests ?? [], ...committed.decisions.map((decision) => decision.decision_digest)])].sort()
  };
  for (const key of ["checkpoint_digest", "preview_digest", "pending_clarification_digest"]) delete checkpointBase[key];
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "clarification_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const compilerStateRecords = [
    { record: committed.next_state_set, semanticDigest: committed.next_state_set.state_set_digest },
    { record: nextPresentation, semanticDigest: nextPresentation.presentation_digest },
    { record: { ...committed.impact, impact_digest: clarificationImpactDigest }, semanticDigest: clarificationImpactDigest },
    ...committed.decisions.map((decision) => ({ record: decision, semanticDigest: decision.decision_digest }))
  ];
  const reply = (
    /** @type {Record<string,any>} */
    persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest)
  );
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
async function behaviorEvidenceContext(current, semantics) {
  const evidenceLevels = new Map((semantics.claims ?? []).map((claim) => [claim.claim_id, "E2"]));
  for (const digest4 of current.checkpoint.accepted_decision_digests ?? []) {
    const decision = await readSemanticV5Record(current.layout.compilerState, digest4);
    if (typeof decision.decision_id !== "string" || !["E1", "E3"].includes(decision.evidence_level)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Accepted Decision evidence inventory is invalid.");
    evidenceLevels.set(decision.decision_id, decision.evidence_level);
  }
  const sourceUnitIds = /* @__PURE__ */ new Set();
  if (typeof current.checkpoint.semantic_review_seed_digest === "string") {
    const semanticSeed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, "seed_digest");
    for (const unit of semanticSeed.normative_units ?? []) if (typeof unit.unit_id === "string") sourceUnitIds.add(unit.unit_id);
  }
  return { evidenceLevels, sourceUnitIds };
}
var ACCEPTED_CONTRACT_KINDS = /* @__PURE__ */ new Set([
  "identity",
  "region",
  "collection",
  "filter",
  "page_model",
  "termination",
  "consistency",
  "universe",
  "tenant_or_region",
  "snapshot",
  "enumeration",
  "aggregate",
  "invariant",
  "domain_predicate",
  "locator",
  "key_normalization",
  "transform",
  "value_normalization",
  "null_policy",
  "semantic_equivalence",
  "denial_behavior",
  "data_scope"
]);
function acceptedTypedContractRefs(value, semanticRootDigest) {
  const refs = /* @__PURE__ */ new Set();
  const visit = (current) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!plainObject2(current)) return;
    if (hasExactKeys(current, ["contract_id", "contract_kind", "semantic_root_digest"]) && typeof current.contract_id === "string" && current.contract_id.length > 0 && ACCEPTED_CONTRACT_KINDS.has(current.contract_kind) && current.semantic_root_digest === semanticRootDigest) refs.add(typedContractRefKey(current));
    Object.values(current).forEach(visit);
  };
  visit(value);
  return refs;
}
async function acceptedBehaviorGaps(current) {
  if (typeof current.checkpoint.clarification_gaps_digest !== "string") return [];
  const inventory = await readSealedV5Record(current.layout.compilerState, current.checkpoint.clarification_gaps_digest, "gaps_digest");
  const gaps = [];
  for (const view of inventory.gaps ?? []) {
    if (view.gap_binding?.kind !== "behavior_gap") continue;
    const gap = await readSemanticV5Record(current.layout.compilerState, view.gap_binding.gap_payload_digest);
    if (gap.semantic_gap_id !== view.gap_binding.gap_id) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Accepted Behavior gap inventory is cross-wired.");
    gaps.push(gap);
  }
  return gaps;
}
async function permissionMatricesForCurrent(current, semanticRootDigest) {
  if (typeof current.checkpoint.semantic_review_seed_digest !== "string") return [];
  const semanticSeed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, "seed_digest");
  return derivePermissionMatrices(semanticRootDigest, semanticSeed, contracts.permissionDerivationRegistry.registry_digest);
}
async function advanceEvidenceClaims(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "artifact_kind", "artifact"]) || action.artifact_kind !== "evidence_claims" || !plainObject2(action.artifact)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Evidence Claims action is not a closed submit_artifact request.");
  validateAdvertisedAction(current, action, { kind: "submit_artifact", artifact_kind: "evidence_claims" });
  validateAgentArtifactRoot(action.artifact, ["semantic_review_seed_digest", "claims", "semantic_gaps", "decomposition_reviews", "ambiguity_reviews", "entity_resolutions"]);
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, "seed_digest");
  const validated = validateSemanticReviews(seed, action.artifact, { acceptedDecisionIds: [] });
  validatePublicRequestSchema(request, "advance");
  const {
    term_registry: provisionalTermRegistry,
    compiled_claims: compiledClaims,
    client_key_bindings: claimClientKeyBindings,
    ...acceptedPayload
  } = (
    /** @type {Record<string,any>} */
    validated
  );
  const compiledEvidencePayload = rewriteBatchLocalReferences({
    ...structuredClone(acceptedPayload),
    claims: compiledClaims.map((claim) => {
      const { claim_client_key: ignored, ...compiled } = claim;
      return compiled;
    })
  }, claimClientKeyBindings);
  const envelope = acceptArtifactEnvelope({ artifactKind: "evidence_claims", payload: compiledEvidencePayload, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "requirements_analysis", inputDigests: [seed.seed_digest, current.checkpoint.accepted_source_state_digest] });
  const semanticRootDigest = canonicalObjectDigest({
    namespace: "generate-test-cases/v5/semantic-root",
    format_version: 1,
    accepted_source_state_digest: current.checkpoint.accepted_source_state_digest,
    evidence_claims_payload_digest: envelope.canonical_payload_digest,
    decision_ids: []
  });
  const termRegistry = sealV5Record({ semantic_root_digest: semanticRootDigest, entries: provisionalTermRegistry.entries }, "registry_digest");
  const evidenceSemantics = compileEvidenceSemantics({ semanticRootDigest, sourceRevision: envelope.accepted_revision, claims: compiledEvidencePayload.claims });
  const testObligations = sealV5Record(evidenceSemantics.test_obligations, "obligations_digest");
  const ruleIndex = createSemanticRuleIndex(semanticRootDigest, { registry_digest: `sha256:${"0".repeat(64)}`, registered_rules: [], accepted_rule_contract_refs: [] });
  const claimIdByClientKey = new Map(compiledClaims.map((claim) => [claim.claim_client_key, claim.claim_id]));
  const rewriteEvidenceRefs = (refs) => refs.map((ref) => ref.kind === "claim" && claimIdByClientKey.has(ref.claim_id) ? { ...ref, claim_id: claimIdByClientKey.get(ref.claim_id) } : structuredClone(ref));
  const requirements = compiledClaims.map((claim) => ({
    contract_kind: "oracle_semantics",
    subject_ref: claim.subject_ref ?? claim.claim_id,
    intent_ref: claim.intent_ref ?? claim.claim_id,
    basis: claim.basis ? rewriteEvidenceRefs(claim.basis) : [{ kind: "claim", claim_id: claim.claim_id }],
    oracle_gap_catalog: { observation_candidates: [], assertion_candidates: [], scope_candidates: [], window_candidates: [] }
  }));
  const sourceSignalText = (seed.normative_units ?? []).map((unit) => unit.outcome_candidates?.[0]?.source_span?.excerpt ?? "").join("\n");
  const signalBasis = [{ kind: "claim", claim_id: compiledClaims[0]?.claim_id }];
  if (sourceSignalText.includes("\u5B57\u6BB5\u6620\u5C04\u8981\u6C42")) requirements.push({ contract_kind: "field_correspondence", subject_ref: compiledClaims[0].claim_id, intent_ref: "source-signaled-field-correspondence", basis: signalBasis });
  if (sourceSignalText.includes("\u72B6\u6001\u57DF\u8981\u6C42")) requirements.push({ contract_kind: "domain", subject_ref: compiledClaims[0].claim_id, intent_ref: "source-signaled-domain-boundary", basis: signalBasis });
  if (sourceSignalText.includes("\u4EBA\u53E3\u8303\u56F4\u8981\u6C42")) requirements.push({ contract_kind: "population", subject_ref: compiledClaims[0].claim_id, intent_ref: "source-signaled-population-scope", basis: signalBasis, population_gap_catalog: { scope_candidates: [], proof_candidates: [] } });
  const permissionMatrices = derivePermissionMatrices(semanticRootDigest, seed, contracts.permissionDerivationRegistry.registry_digest);
  for (const matrix of permissionMatrices) for (const cell of matrix.required_cells ?? []) {
    if (!["denial_behavior", "data_scope"].includes(cell.permission_dimension)) continue;
    requirements.push({
      contract_kind: "permission_auxiliary",
      subject_ref: cell.required_cell_key,
      intent_ref: `permission:${matrix.matrix_id}:${cell.required_cell_key}`,
      basis: signalBasis,
      auxiliary_contract_kind: cell.permission_dimension,
      permission_target: { matrix_id: matrix.matrix_id, required_cell_key: cell.required_cell_key },
      existing_contract_refs: []
    });
  }
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
    test_obligations_digest: testObligations.obligations_digest,
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
    semantics: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: compiledEvidencePayload },
    term_registry: { artifact_digest: termRegistry.registry_digest, accepted_revision: envelope.accepted_revision, payload: termRegistry },
    test_obligations: { artifact_digest: testObligations.obligations_digest, accepted_revision: envelope.accepted_revision, payload: evidenceSemantics.test_obligations },
    compiler_rules: { ...agentVisibleCompilerRules(), semantic_rule_index_projection: { kind: "available", index: ruleIndex } }
  };
  const workPacket = hasGaps ? { kind: "clarification_work", context, presentation } : { kind: "behavior_work", context, permission_matrix_worklists: permissionMatrices, behavior_contract_worklist: behaviorSeed };
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: claimClientKeyBindings };
  const reply = (
    /** @type {Record<string,any>} */
    persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest)
  );
  if (hasGaps) {
    const origins = acceptedPayload.semantic_gaps.map((gap) => gap.target?.origin?.kind);
    const diagnosticCode = origins.includes("ambiguity") ? "AMBIGUITY_UNRESOLVED" : origins.includes("entity_resolution") ? "ENTITY_RESOLUTION_UNRESOLVED" : null;
    if (diagnosticCode) {
      const errorRow = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === diagnosticCode && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id);
      if (!errorRow || errorRow.exact_commit.kind !== "artifact_commit") throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Requirements-gap reply contract is missing for ${diagnosticCode}.`);
      reply.reply_contract_id = errorRow.reply_contract_id;
      reply.reply_status = errorRow.exact_reply_status;
      reply.diagnostics = [{ code: diagnosticCode, affected_refs: acceptedPayload.semantic_gaps.map((gap) => gap.semantic_gap_client_key).sort(), message: "The accepted requirements artifact contains an explicit unresolved semantic gap." }];
    }
  }
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
        { record: testObligations, digestField: "obligations_digest" },
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
  if (action.artifact.provenance_graph !== void 0) {
    validateV5ProvenanceGraph(action.artifact.provenance_graph);
    throw new V5ProtocolError("COMPILER_OWNED_FIELD_SUBMITTED", "Behavior provenance is derived by the Compiler and cannot be submitted by the Agent.");
  }
  validateAgentArtifactRoot(action.artifact, ["behavior_contract_seed_digest", "field_correspondences", "value_states", "predicate_contracts", "domain_contracts", "behavior_equivalence_contracts", "population_contracts", "population_proofs", "permission_auxiliary_contracts", "oracle_semantic_contracts", "behavior_contract_reviews", "permission_matrix_reviews", "risk_reviews", "semantic_gap_proposals"]);
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, "seed_digest");
  const semantics = current.reply.work_packet.context.semantics.payload;
  const testObligationsRecord = await readSealedV5Record(current.layout.compilerState, current.checkpoint.test_obligations_digest, "obligations_digest");
  const { obligations_digest: ignoredObligationsDigest, ...testObligations } = testObligationsRecord;
  const evidenceSemantics = compileEvidenceSemantics({ semanticRootDigest: current.checkpoint.semantic_root_digest, sourceRevision: testObligations.source_revision, claims: semantics.claims ?? [] });
  if (canonicalV5Stringify(evidenceSemantics.test_obligations) !== canonicalV5Stringify(testObligations)) throw new V5ProtocolError("ACCEPTED_STATE_INTEGRITY_FAILURE", "Accepted Test Obligations do not match the Compiler-owned Evidence projection.");
  const acceptedFormalTestPointIds = new Set(testObligations.formal_test_points.map((point) => point.formal_test_point_id));
  for (const contract of [...action.artifact.oracle_semantic_contracts ?? [], ...action.artifact.behavior_equivalence_contracts ?? []]) {
    if (!acceptedFormalTestPointIds.has(contract.formal_test_point_id)) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_UNKNOWN", "Behavior contract must reference a Compiler-owned formal Test Point from the accepted work context.");
  }
  const evidenceContext = await behaviorEvidenceContext(current, semantics);
  const acceptedClaimIds = new Set((semantics.claims ?? []).map((claim) => claim.claim_id));
  validateAcceptedClaimReferences(action.artifact, acceptedClaimIds);
  validateBehaviorEvidenceClosure(action.artifact, evidenceContext);
  const requiredArrays = ["field_correspondences", "value_states", "predicate_contracts", "domain_contracts", "behavior_equivalence_contracts", "population_contracts", "population_proofs", "permission_auxiliary_contracts", "oracle_semantic_contracts", "behavior_contract_reviews", "permission_matrix_reviews", "risk_reviews", "semantic_gap_proposals"];
  if (action.artifact.behavior_contract_seed_digest !== seed.seed_digest || requiredArrays.some((key) => !Array.isArray(action.artifact[key]))) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Behavior Views must bind the advertised seed and every closed collection.");
  const semanticRootDigest = current.checkpoint.semantic_root_digest;
  const acceptedContractRefs = acceptedTypedContractRefs(current.reply.work_packet, semanticRootDigest);
  action.artifact.value_states.forEach(validateValueState);
  validateBehaviorContractReviews(seed, action.artifact.behavior_contract_reviews, action.artifact, evidenceContext);
  const matrices = current.reply.work_packet.permission_matrix_worklists ?? [];
  if (action.artifact.permission_matrix_reviews.length !== matrices.length) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Every advertised permission matrix must be reviewed exactly once.");
  for (const matrix of matrices) if (!action.artifact.permission_matrix_reviews.some((candidate) => candidate.matrix_id === matrix.matrix_id)) throw new V5ProtocolError("PERMISSION_MATRIX_INCOMPLETE", "Permission matrix review is missing.");
  const permissionCellsForCompilation = matrices.flatMap((matrix) => matrix.required_cells.map((cell) => ({ matrix_id: matrix.matrix_id, ...cell })));
  const compiledBehavior = compileBehaviorContracts({
    semanticRootDigest,
    semanticRuleIndex: seed.semantic_rule_index,
    artifact: action.artifact,
    permissionCells: permissionCellsForCompilation,
    acceptedContractRefs
  });
  const permissionAcceptedContractRefs = new Set(acceptedContractRefs);
  for (const contract of compiledBehavior.permission_auxiliary_contracts) {
    permissionAcceptedContractRefs.add(typedContractRefKey({
      contract_id: contract.permission_auxiliary_contract_id,
      contract_kind: contract.payload.contract_kind,
      semantic_root_digest: semanticRootDigest
    }));
  }
  for (const matrix of matrices) {
    const review = compiledBehavior.permission_matrix_reviews.find((candidate) => candidate.matrix_id === matrix.matrix_id);
    validatePermissionMatrixReview(matrix, review, semanticRootDigest, { ...evidenceContext, acceptedContractRefs: permissionAcceptedContractRefs });
  }
  const compiledDomains = compiledBehavior.domain_contracts;
  const requirementByKey = new Map(seed.required_contracts.map((requirement) => [requirement.required_contract_key, requirement]));
  const stableByClientKey = new Map(compiledBehavior.client_key_bindings.map((binding) => [binding.client_key, binding.stable_id]));
  const compiledContractById = new Map([
    ...compiledBehavior.field_correspondences.map((contract) => [contract.field_correspondence_id, contract]),
    ...compiledBehavior.predicate_contracts.map((contract) => [contract.predicate_contract_id, contract]),
    ...compiledBehavior.domain_contracts.map((contract) => [contract.domain_contract_id, contract]),
    ...compiledBehavior.behavior_equivalence_contracts.map((contract) => [contract.behavior_equivalence_contract_id, contract]),
    ...compiledBehavior.population_contracts.map((contract) => [contract.population_contract_id, contract]),
    ...compiledBehavior.population_proofs.map((contract) => [contract.population_proof_id, contract]),
    ...compiledBehavior.permission_auxiliary_contracts.map((contract) => [contract.permission_auxiliary_contract_id, contract]),
    ...compiledBehavior.oracle_semantic_contracts.map((contract) => [contract.oracle_semantic_contract_id, contract])
  ]);
  const provenanceContractById = /* @__PURE__ */ new Map();
  for (const review of action.artifact.behavior_contract_reviews) {
    if (review.disposition?.kind !== "formal") continue;
    const requirement = requirementByKey.get(review.required_contract_key);
    for (const clientKey of review.disposition.contract_client_keys) {
      const contractId = stableByClientKey.get(clientKey);
      if (!contractId || !requirement) throw new V5ProtocolError("PROVENANCE_EDGE_NOT_ALLOWED", "Formal Behavior provenance cannot resolve its Compiler-owned stable contract identity.");
      const aggregate = provenanceContractById.get(contractId) ?? { contract_id: contractId, basis: [], formal_test_point_ids: [] };
      aggregate.basis.push(...requirement.basis);
      aggregate.basis = [...new Map(aggregate.basis.map((basis) => [canonicalV5Stringify(basis), basis])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
      const formalTestPointId = compiledContractById.get(contractId)?.formal_test_point_id;
      if (typeof formalTestPointId === "string") aggregate.formal_test_point_ids = [.../* @__PURE__ */ new Set([...aggregate.formal_test_point_ids, formalTestPointId])].sort();
      provenanceContractById.set(contractId, aggregate);
    }
  }
  const provenanceGraph = compileBehaviorProvenanceGraph({
    runId: current.identity.run_id,
    caseDocumentLineageId: current.identity.case_document_lineage_id,
    semanticRootDigest: current.checkpoint.semantic_root_digest,
    claims: (semantics.claims ?? []).map((claim) => ({ ...claim, evidence_level: "E2" })),
    facts: evidenceSemantics.facts,
    atomicOutcomes: testObligations.outcomes,
    formalTestPoints: testObligations.formal_test_points,
    behaviorContracts: [...provenanceContractById.values()]
  });
  const semanticGaps = action.artifact.semantic_gap_proposals;
  const reviewHasGap = action.artifact.behavior_contract_reviews.some((review) => review.disposition?.kind === "semantic_gap") || action.artifact.permission_matrix_reviews.some((review) => review.cell_dispositions.some((row) => row.disposition?.kind === "semantic_gap")) || action.artifact.risk_reviews.some((review) => review.risk_item?.risk_disposition === "semantic_gap");
  const hasGaps = reviewHasGap || semanticGaps.length > 0;
  const compiledGaps = compileBehaviorSemanticGaps(semanticRootDigest, seed, semanticGaps, action.artifact.behavior_contract_reviews, { permissionMatrices: matrices, permissionMatrixReviews: action.artifact.permission_matrix_reviews, riskReviews: action.artifact.risk_reviews, acceptedBehaviorGaps: await acceptedBehaviorGaps(current) });
  if (hasGaps !== compiledGaps.accepted_gaps.length > 0) throw new V5ProtocolError("SEMANTIC_REVIEW_CANDIDATE_MISSING", "Behavior semantic-gap reviews require exact gap payloads.");
  const riskLedger = validateRiskReviews(current.checkpoint.semantic_root_digest, seed.risk_review_module_ids, action.artifact.risk_reviews, evidenceContext);
  validatePublicRequestSchema(request, "advance");
  const stableBehaviorPayload = projectAcceptedBehaviorViews(action.artifact, [...compiledGaps.client_key_bindings, ...compiledBehavior.client_key_bindings]);
  const envelope = acceptArtifactEnvelope({ artifactKind: "behavior_views", payload: stableBehaviorPayload, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "case_design", inputDigests: [seed.seed_digest, current.checkpoint.semantic_root_digest, current.checkpoint.test_obligations_digest] });
  const resultKey = hasGaps ? "actionable_gaps" : "no_actionable_gap";
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: "advance", from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: "artifact.submit_behavior_views", result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const formalTestPointIds = [...acceptedFormalTestPointIds].sort();
  const permissionCells = matrices.flatMap((matrix) => {
    const review = compiledBehavior.permission_matrix_reviews.find((candidate) => candidate.matrix_id === matrix.matrix_id);
    const dispositionByCell = new Map((review?.cell_dispositions ?? []).map((row) => [row.required_cell_key, row.disposition]));
    return matrix.required_cells.map((cell) => {
      const disposition = dispositionByCell.get(cell.required_cell_key);
      return { matrix_id: matrix.matrix_id, ...structuredClone(cell), disposition: disposition.kind, ...disposition.kind === "formal" ? structuredClone(disposition.outcome) : {}, ...disposition.kind === "semantic_gap" ? { gap_ref: structuredClone(disposition.gap_ref) } : {}, ...disposition.kind === "not_applicable" ? { basis: structuredClone(disposition.basis) } : {} };
    });
  });
  const caseCompilationContext = !hasGaps ? sealV5Record({
    kind: "case_compilation_context",
    schema_version: V5_SCHEMA_VERSION,
    semantic_root_digest: current.checkpoint.semantic_root_digest,
    claim_assessments: (semantics.claims ?? []).map((claim) => ({ claim_id: claim.claim_id ?? claim.claim_client_key, level: "E2", support_review: "supported" })).sort((left, right) => left.claim_id.localeCompare(right.claim_id)),
    fact_assessments: evidenceSemantics.fact_assessments,
    accepted_gap_ids: [],
    formal_test_point_ids: formalTestPointIds,
    formal_test_point_dispositions: evidenceSemantics.formal_test_point_dispositions,
    semantic_partitions: compiledDomains.flatMap((domain) => domain.partitions.map((partition) => ({ partition_id: partition.partition_id, disposition: "covered" }))).sort((left, right) => left.partition_id.localeCompare(right.partition_id)),
    value_instances: action.artifact.value_states.map((valueState) => ({ value_instance_id: canonicalObjectDigest(valueState), disposition: "covered" })).sort((left, right) => left.value_instance_id.localeCompare(right.value_instance_id)),
    permission_cells: permissionCells.sort((left, right) => left.required_cell_key.localeCompare(right.required_cell_key)),
    risk_ledger: riskLedger,
    oracle_semantic_contracts: structuredClone(compiledBehavior.oracle_semantic_contracts),
    semantic_audit: {
      value_states: structuredClone(action.artifact.value_states),
      field_correspondences: structuredClone(compiledBehavior.field_correspondences),
      predicate_contracts: structuredClone(compiledBehavior.predicate_contracts),
      domains: structuredClone(compiledDomains),
      behavior_equivalence_contracts: structuredClone(compiledBehavior.behavior_equivalence_contracts),
      populations: structuredClone(compiledBehavior.population_contracts),
      population_proofs: structuredClone(compiledBehavior.population_proofs),
      permission_auxiliary_contracts: structuredClone(compiledBehavior.permission_auxiliary_contracts),
      provenance_graph: structuredClone(provenanceGraph)
    },
    semantic_rule_index: structuredClone(seed.semantic_rule_index)
  }, "context_digest") : null;
  const compilerStateRecords = [
    { record: riskLedger, semanticDigest: canonicalObjectDigest(riskLedger) },
    { record: provenanceGraph, digestField: "graph_digest" },
    ...caseCompilationContext ? [{ record: caseCompilationContext, digestField: "context_digest" }] : [],
    ...compiledGaps.new_accepted_gaps.map((gap) => ({ record: gap, semanticDigest: canonicalObjectDigest(gap) }))
  ];
  let workPacket;
  const context = {
    ...current.reply.work_packet.context,
    behavior: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload }
  };
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    accepted_artifact_digests: [.../* @__PURE__ */ new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    behavior_views_artifact_digest: envelope.envelope_digest,
    risk_ledger_digest: canonicalObjectDigest(riskLedger),
    provenance_graph_digest: provenanceGraph.graph_digest,
    ...caseCompilationContext ? { case_compilation_context_digest: caseCompilationContext.context_digest } : {}
  };
  if (hasGaps) {
    const gaps = clarificationGapsFromAcceptedBehavior(compiledGaps.accepted_gaps);
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
  const clientKeyBindings = [
    ...compiledGaps.client_key_bindings,
    ...compiledBehavior.client_key_bindings
  ].sort((left, right) => left.client_key.localeCompare(right.client_key));
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: clientKeyBindings };
  const reply = (
    /** @type {Record<string,any>} */
    persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest)
  );
  const primaryGapDiagnostic = compiledGaps.accepted_gaps.map((gap) => (
    /** @type {Record<string,string>} */
    BEHAVIOR_GAP_DIAGNOSTIC[gap.missing_semantics]
  )).filter(Boolean)[0];
  if (primaryGapDiagnostic) {
    const errorRow = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === primaryGapDiagnostic && candidate.source.response_context === "run_mutation" && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id);
    if (!errorRow || errorRow.exact_commit.kind !== "artifact_commit") throw new V5ProtocolError("POLICY_REGISTRY_INCONSISTENT", `Explicit Behavior-gap reply contract is missing for ${primaryGapDiagnostic}.`);
    reply.reply_contract_id = errorRow.reply_contract_id;
    reply.reply_status = errorRow.exact_reply_status;
    reply.diagnostics = [{ code: primaryGapDiagnostic, affected_refs: compiledGaps.accepted_gaps.filter((gap) => (
      /** @type {Record<string,string>} */
      BEHAVIOR_GAP_DIAGNOSTIC[gap.missing_semantics] === primaryGapDiagnostic
    )).map((gap) => gap.semantic_gap_id).sort(), message: "The accepted Behavior artifact contains an explicit unresolved semantic gap." }];
  }
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts: [{ record: envelope, digestField: "envelope_digest" }], compilerStateRecords });
}
function renderedOutputRecord(mediaType, content) {
  return sealV5Record({ kind: "rendered_output", schema_version: V5_SCHEMA_VERSION, media_type: mediaType, content, content_digest: `sha256:${createHash7("sha256").update(content).digest("hex")}` }, "rendered_output_digest");
}
async function advanceCaseDrafts(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ["kind", "action_token", "artifact_kind", "artifact"]) || action.artifact_kind !== "case_drafts" || !plainObject2(action.artifact) || !Array.isArray(action.artifact.case_drafts)) throw new V5ProtocolError("SCHEMA_VALIDATION_FAILED", "Case Drafts action is not a closed submit_artifact request.");
  validateAdvertisedAction(current, action, { kind: "submit_artifact", artifact_kind: "case_drafts" });
  validateAgentArtifactRoot(action.artifact, ["case_drafts"]);
  if (typeof current.checkpoint.case_compilation_context_digest !== "string") throw new V5ProtocolError("CHECKPOINT_INVALID", "Case compilation context is not advertised by the verified checkpoint.");
  const caseCompilationContext = await readSealedV5Record(current.layout.compilerState, current.checkpoint.case_compilation_context_digest, "context_digest");
  if (caseCompilationContext.semantic_root_digest !== current.checkpoint.semantic_root_digest) throw new V5ProtocolError("CHECKPOINT_INVALID", "Case compilation context belongs to a different semantic root.");
  const compilation = compileV5CaseDocumentTransaction({
    ...caseCompilationContext,
    case_drafts: action.artifact.case_drafts,
    case_document_lineage_id: current.identity.case_document_lineage_id,
    semantic_root_digest: current.checkpoint.semantic_root_digest,
    source_revision: current.checkpoint.current_revision + 1
  });
  validatePublicRequestSchema(request, "advance");
  const document = compilation.document;
  const envelope = acceptArtifactEnvelope({ artifactKind: "case_drafts", payload: action.artifact, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: "case_design", inputDigests: [current.checkpoint.semantic_root_digest, current.checkpoint.test_obligations_digest, caseCompilationContext.context_digest] });
  const executionPlan = projectCompatibilityExecutionPlan(document, { run_id: current.identity.run_id, revision: current.checkpoint.current_revision + 1 });
  const caseDocumentRef = executionPlan.case_document_ref;
  const renderedOutputs = [renderedOutputRecord("application/json", renderV5Json(document)), renderedOutputRecord("text/markdown", renderV5Markdown(document)), renderedOutputRecord("text/csv", renderV5Csv(document))].map((record) => ({ record, digestField: "rendered_output_digest" }));
  const semanticProvenance = await readSealedV5Record(current.layout.compilerState, current.checkpoint.provenance_graph_digest, "graph_digest");
  const deliveredProvenance = extendCaseProvenanceGraph({
    graph: semanticProvenance,
    runId: current.identity.run_id,
    caseDocumentLineageId: current.identity.case_document_lineage_id,
    semanticRootDigest: current.checkpoint.semantic_root_digest,
    cases: document.cases,
    caseDocumentDigest: document.bundle_digest,
    renderedOutputDigests: renderedOutputs.map((item) => item.record.rendered_output_digest)
  });
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
    execution_plan_digest: executionPlan.plan_digest,
    rendered_output_digests: renderedOutputs.map((item) => item.record.rendered_output_digest).sort(),
    provenance_graph_digest: deliveredProvenance.graph_digest
  };
  delete checkpointBase.checkpoint_digest;
  const workPacket = { kind: "terminal_work", terminal_kind: "case_document_finished", case_document_ref: caseDocumentRef };
  const selectorState = checkpointSelectors(checkpointBase, []);
  const actionDigest = actionDigestV5("advance", action);
  const commitReceipt = { kind: "artifact_commit", committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: compilation.client_key_bindings };
  const reply = persistedReply(selectorState.checkpoint, workPacket, [], commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, {
    checkpoint: selectorState.checkpoint,
    selectorSidecar: selectorState.sidecar,
    reply,
    commitReceipt,
    acceptedArtifacts: [{ record: envelope, digestField: "envelope_digest" }],
    compilerStateRecords: [{ record: document, semanticDigest: document.bundle_digest }, { record: executionPlan, semanticDigest: executionPlan.plan_digest }, { record: deliveredProvenance, digestField: "graph_digest" }],
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
  validatePublicRequestSchema(request, "advance");
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
  validatePublicRequestSchema(request, "advance");
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
    identity = (await readFixedSealedRecord(layout.identity, "run_identity_digest")).record;
    const current = await readVerifiedRun(runDirectory);
    try {
      await verifyV5AcceptedClosure(current);
    } catch (error) {
      if (error instanceof V5ProtocolError) return readOnlyIntegrityReply(current, error.code, error.message, "run_inspect", Array.isArray(error.affected_refs) ? error.affected_refs : []);
      throw error;
    }
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
      const row = replyRows.find((candidate) => candidate.source.kind === "runtime_error" && candidate.source.error_code === error.code && candidate.source.response_context === "run_inspect" && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(trigger));
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
        diagnostics: [{ code: error.code, affected_refs: Array.isArray(error.affected_refs) ? error.affected_refs : [], message: error.message }]
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
