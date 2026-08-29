// src/advance-strict.mjs
import { readdir, stat } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// src/schema-registry.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";

// src/canonical.mjs
import { createHash } from "node:crypto";
var ORDERED_ARRAY_PATHS = /* @__PURE__ */ new Set(["/steps", "/action_path", "/flow", "/flow_sequence", "/sequence", "/transition_order", "/cases/steps", "/cases/execution_signature/action_path", "/execution_signature/action_path"]);
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
  "/decision_records",
  "/decision_records/root_issue_ids",
  "/decision_records/affected_obligation_ids",
  "/clarification_events",
  "/clarification_events/root_issue_ids",
  "/claims",
  "/claims/source_locator_ids",
  "/claims/parent_claim_ids",
  "/fact_ledger",
  "/views",
  "/views/elements",
  "/views/elements/source_claim_ids",
  "/interaction_matrix",
  "/interaction_matrix/module_ids",
  "/interaction_candidates",
  "/interaction_candidates/module_ids",
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
  "/cases/execution_signature/oracle_refs",
  "/cases/execution_signature/test_point_ids",
  "/execution_signature/oracle_refs",
  "/execution_signature/test_point_ids",
  "/obligation_dispositions",
  "/obligation_dispositions/case_ids",
  "/exploratory_candidates",
  "/grounded",
  "/conditional",
  "/blocked",
  "/exploratory",
  "/root_issue_dispositions"
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
  ["/interaction_candidates", "candidate_id"],
  ["/obligations", "obligation_id"],
  ["/fact_routes", "fact_id"],
  ["/interaction_routes", "candidate_id"],
  ["/cases", "case_id"],
  ["/obligation_dispositions", "obligation_id"],
  ["/exploratory_candidates", "exploratory_id"],
  ["/grounded", "case_id"],
  ["/conditional", "case_id"],
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
  return `/${path3.join("/")}`;
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
    if (idField && typeof object[idField] === "string") return `id:${object[idField]}`;
    if (collectionPath === "/interaction_matrix") return `interaction:${JSON.stringify({ dimension: object.dimension, module_ids: object.module_ids })}`;
  }
  return JSON.stringify(canonicalize(value, []));
}
function canonicalize(value, path3 = []) {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item, path3));
    const currentPath = pathKey(path3);
    if (ORDERED_ARRAY_PATHS.has(currentPath)) return values;
    if (SET_ARRAY_PATHS.has(currentPath)) return [...values].sort((left, right) => compareCodePoints(stableSemanticKey(path3, left), stableSemanticKey(path3, right)));
    return values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCodePoints(left, right)).map(([key, item]) => [key, canonicalize(item, [...path3, key])]));
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
  Object.freeze({ collection: "sources", id: "source_id" }),
  Object.freeze({ collection: "locators", id: "locator_id" }),
  Object.freeze({ collection: "decision_records", id: "decision_id" }),
  Object.freeze({ collection: "clarification_events", id: "event_id" }),
  Object.freeze({ collection: "claims", id: "claim_id" }),
  Object.freeze({ collection: "fact_ledger", id: "fact_id" }),
  Object.freeze({ collection: "views", id: "view_id" }),
  Object.freeze({ collection: "obligations", id: "obligation_id" }),
  Object.freeze({ collection: "cases", id: "case_id" })
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
function assertSupportedSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Schema must be an object.");
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!supportedKeywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === "items") {
      assertSupportedSchema(value);
    } else if ((key === "oneOf" || key === "allOf") && Array.isArray(value)) {
      for (const child of value) assertSupportedSchema(child);
    }
  }
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
var embeddedManifestDigest = true ? "4a0cadaf3e293690481e8a7326100c3f1127280d311ad2d03d819da1a9427d79" : void 0;
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
