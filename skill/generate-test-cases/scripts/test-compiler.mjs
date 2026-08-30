// src/advance-strict.mjs
import { readdir, stat } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// src/schema-registry.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";

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
function pathKey(path3) {
  return `/${joinArray(path3, "/")}`;
}
function stableSemanticKey(path3, value) {
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") return `number:${value}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (value === null) return "null";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = (
      /** @type {Record<string, unknown>} */
      value
    );
    const collectionPath = pathKey(path3);
    const idField = COLLECTION_ID_FIELDS.get(collectionPath);
    if (idField && typeof object[idField] === "string") return `id:${object[idField]}:${JSON.stringify(object)}`;
    if (collectionPath === "/interaction_matrix") return `interaction:${JSON.stringify({ dimension: object.dimension, module_ids: object.module_ids })}:${JSON.stringify(object)}`;
  }
  return JSON.stringify(value);
}
function canonicalize(value, path3 = []) {
  if (Array.isArray(value)) {
    const values = mapArray(value, (item) => canonicalize(item, path3));
    const currentPath = pathKey(path3);
    if (ORDERED_ARRAY_PATHS.has(currentPath)) return values;
    if (SET_ARRAY_PATHS.has(currentPath)) return sortArray(
      [...values],
      (left, right) => compareCodePoints(stableSemanticKey(path3, left), stableSemanticKey(path3, right))
    );
    return values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(mapArray(
      sortArray(Object.entries(value), ([left], [right]) => compareCodePoints(left, right)),
      ([key, item]) => [key, canonicalize(item, [...path3, key])]
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
var NATIVE_ARRAY_FILTER2 = Array.prototype.filter;
var NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
var NATIVE_ARRAY_FOR_EACH = Array.prototype.forEach;
var NATIVE_ARRAY_JOIN2 = Array.prototype.join;
var NATIVE_ARRAY_MAP2 = Array.prototype.map;
var NATIVE_ARRAY_PUSH = Array.prototype.push;
var NATIVE_ARRAY_SLICE = Array.prototype.slice;
var NATIVE_ARRAY_SOME = Array.prototype.some;
function mapArray2(values, project) {
  return (
    /** @type {U[]} */
    Reflect.apply(NATIVE_ARRAY_MAP2, values, [project])
  );
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

// src/schema-registry.mjs
async function loadSchemaRegistry(schemaDirectory2, embeddedManifestDigest2, embeddedCompilerVersion2) {
  const manifestPath = path.join(schemaDirectory2, "..", "schema-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expectedManifestDigest = embeddedManifestDigest2 ?? manifest.digest;
  if (digest({ compiler_version: manifest.compiler_version, schema_version: manifest.schema_version, schemas: manifest.schemas }) !== expectedManifestDigest || manifest.digest !== expectedManifestDigest) {
    throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  }
  if (!Array.isArray(manifest.schemas) || typeof manifest.schema_version !== "string" || typeof manifest.compiler_version !== "string" || embeddedCompilerVersion2 && manifest.compiler_version !== embeddedCompilerVersion2) throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  const schemas = /* @__PURE__ */ new Map();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== "object" || typeof entry.file !== "string" || typeof entry.digest !== "string") throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    const schema = JSON.parse(await readFile(path.join(schemaDirectory2, entry.file), "utf8"));
    if (digest(schema) !== entry.digest) throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    assertSupportedSchema(schema);
    schemas.set(entry.file, schema);
  }
  return { compilerVersion: manifest.compiler_version, schemaVersion: manifest.schema_version, schemas };
}

// src/advance-strict.mjs
var moduleDirectory = path2.dirname(fileURLToPath(import.meta.url));
var schemaDirectory = path2.resolve(
  moduleDirectory,
  true ? "schemas" : "../skill/generate-test-cases/scripts/schemas"
);
var embeddedManifestDigest = true ? "75c7363283064eb598d474e7329d4da01dcb5b7d429cdea44ec4b6d9b2190891" : void 0;
var embeddedSchemaVersion = true ? "1.0.0" : void 0;
var embeddedCompilerVersion = true ? "0.1.0" : void 0;
var emptyRunReply = Object.freeze({
  status: "need_artifact",
  stage: "source_pack",
  schema_ref: "source-pack.schema.json",
  scope: Object.freeze({ source_revision: 0 }),
  diagnostics: Object.freeze([])
});
async function advanceStrict(runDirectory) {
  try {
    const registry = await loadSchemaRegistry(schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion);
    if (embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion) return fatalReply("SCHEMA_INTEGRITY_MISMATCH", "Bundled schema version does not match the compiler.");
  } catch {
    return fatalReply("SCHEMA_INTEGRITY_MISMATCH", "Bundled schemas or schema manifest failed integrity verification.");
  }
  if (!path2.isAbsolute(runDirectory)) {
    return fatalReply("run_directory_absolute", "Run directory must be an absolute path.");
  }
  try {
    if (!(await stat(runDirectory)).isDirectory()) {
      return fatalReply("run_directory_directory", "Run directory must be a directory.");
    }
    if ((await readdir(runDirectory)).length === 0) {
      return emptyRunReply;
    }
    return fatalReply("run_directory_empty", "Run directory is not an empty initial run.");
  } catch (error) {
    return fatalReply("run_directory_unavailable", errorMessage(error));
  }
}
function fatalReply(code, message) {
  return {
    status: "fatal",
    diagnostics: [{ category: "reference", code, message }]
  };
}
function errorMessage(error) {
  return error instanceof Error ? error.message : "Run directory is unavailable.";
}

// src/entry.mjs
var nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
var compilerVersion = true ? "0.1.0" : "0.1.0";
var reply = nodeMajor >= 20 ? compilerVersion.length > 0 ? await advanceStrict(process.argv[2] ?? "") : {
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
