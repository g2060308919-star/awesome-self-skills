// src/advance-strict.mjs
import { readdir, stat } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// src/schema-registry.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";

// src/canonical.mjs
import { createHash } from "node:crypto";
var ORDERED_ARRAY_FIELDS = /* @__PURE__ */ new Set(["steps", "action_path", "flow", "flow_sequence", "sequence", "transition_order"]);
var SET_ARRAY_FIELDS = /* @__PURE__ */ new Set(["source_locator_ids", "source_claim_ids", "root_issue_ids", "affected_obligation_ids", "case_ids", "obligation_ids", "view_element_refs", "required_oracle_refs", "required_capabilities", "parent_claim_ids"]);
function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function stableSemanticKey(value) {
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") return `number:${value}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (value === null) return "null";
  return JSON.stringify(canonicalize(value, []));
}
function canonicalize(value, path3 = []) {
  if (Array.isArray(value)) {
    const field = path3.at(-1) ?? "";
    const values = value.map((item) => canonicalize(item, path3));
    if (ORDERED_ARRAY_FIELDS.has(field)) return values;
    if (SET_ARRAY_FIELDS.has(field)) return [...values].sort((left, right) => compareCodePoints(stableSemanticKey(left), stableSemanticKey(right)));
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
