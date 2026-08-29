// src/advance-strict.mjs
import { readdir, stat } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// src/schema-registry.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";

// src/canonical.mjs
import { createHash } from "node:crypto";
var orderedArrayField = /^(?:steps|action_path|flow|flow_sequence|sequence)$/;
var setLikeArrayField = /(?:_ids|_refs|root_issue_ids|source_locator_ids|affected_obligation_ids)$/;
function canonicalize(value, field = "") {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item));
    if (orderedArrayField.test(field)) return values;
    if (setLikeArrayField.test(field)) {
      return [...values].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
    }
    return values;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item, key)]));
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
async function loadSchemaRegistry(schemaDirectory2, embeddedManifestDigest2) {
  const manifestPath = path.join(schemaDirectory2, "..", "schema-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expectedManifestDigest = embeddedManifestDigest2 ?? manifest.digest;
  if (digest({ schema_version: manifest.schema_version, schemas: manifest.schemas }) !== expectedManifestDigest || manifest.digest !== expectedManifestDigest) {
    throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  }
  if (!Array.isArray(manifest.schemas) || typeof manifest.schema_version !== "string") throw new Error("SCHEMA_INTEGRITY_MISMATCH");
  const schemas = /* @__PURE__ */ new Map();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== "object" || typeof entry.file !== "string" || typeof entry.digest !== "string") throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    const schema = JSON.parse(await readFile(path.join(schemaDirectory2, entry.file), "utf8"));
    if (digest(schema) !== entry.digest) throw new Error("SCHEMA_INTEGRITY_MISMATCH");
    assertSupportedSchema(schema);
    schemas.set(entry.file, schema);
  }
  return { schemaVersion: manifest.schema_version, schemas };
}

// src/advance-strict.mjs
var moduleDirectory = path2.dirname(fileURLToPath(import.meta.url));
var schemaDirectory = path2.resolve(
  moduleDirectory,
  true ? "schemas" : "../skill/generate-test-cases/scripts/schemas"
);
var embeddedManifestDigest = true ? "67f6e180952368c13351d9e036078f2cba9ec393b69a15f9538015daa5e974e9" : void 0;
var embeddedSchemaVersion = true ? "1.0.0" : void 0;
var emptyRunReply = Object.freeze({
  status: "need_artifact",
  stage: "source_pack",
  schema_ref: "source-pack.schema.json",
  scope: Object.freeze({ source_revision: 0 }),
  diagnostics: Object.freeze([])
});
async function advanceStrict(runDirectory) {
  try {
    const registry = await loadSchemaRegistry(schemaDirectory, embeddedManifestDigest);
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
