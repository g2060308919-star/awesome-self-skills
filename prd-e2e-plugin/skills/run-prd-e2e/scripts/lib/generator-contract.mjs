import { canonicalJsonBytes, canonicalStringify, sha256Text, sha256Value } from "./digest.mjs";
import { fail, requireCondition } from "./errors.mjs";

export const GENERATOR_SCHEMA_VERSION = "4.2.0";
export const GENERATOR_COMPILER_VERSION = "0.7.0";

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function requireCanonicalBytes(value, rawBytes, label) {
  requireCondition(typeof rawBytes === "string" && rawBytes === canonicalJsonBytes(value), "HANDOFF_REF_MISMATCH", `${label} bytes are not the canonical Generator artifact.`);
}

function requireContract(value, label) {
  requireCondition(value?.schema_version === GENERATOR_SCHEMA_VERSION && value?.compiler_version === GENERATOR_COMPILER_VERSION, "HANDOFF_REF_MISMATCH", `${label} does not use the locked Generator contract.`);
}

function requireCaseDocumentRef(value, label) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), "HANDOFF_REF_MISMATCH", `${label} is missing.`);
  requireCondition(typeof value.run_id === "string" && value.run_id.trim(), "HANDOFF_REF_MISMATCH", `${label}.run_id is invalid.`);
  requireCondition(Number.isSafeInteger(value.revision) && value.revision >= 0, "HANDOFF_REF_MISMATCH", `${label}.revision is invalid.`);
  requireCondition(/^sha256:[a-f0-9]{64}$/.test(value.manifest_digest) && /^sha256:[a-f0-9]{64}$/.test(value.bundle_digest), "HANDOFF_REF_MISMATCH", `${label} digests are invalid.`);
}

function requireArtifact(value, label) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), "HANDOFF_REF_MISMATCH", `${label} is missing.`);
  requireCondition(
    typeof value.path === "string"
      && value.path.trim()
      && !value.path.startsWith("/")
      && !value.path.split(/[\\/]/).includes(".."),
    "HANDOFF_REF_MISMATCH",
    `${label}.path is invalid.`
  );
  requireCondition(/^sha256:[a-f0-9]{64}$/.test(value.digest), "HANDOFF_REF_MISMATCH", `${label}.digest is invalid.`);
}

export function validateCaseDocumentHandoff(input) {
  const {
    generationRef,
    caseDocumentManifest,
    caseDocumentManifestBytes,
    caseDocument,
    caseDocumentBytes
  } = input;
  const reference = generationRef?.case_document_ref;
  requireCaseDocumentRef(reference, "generationRef.case_document_ref");
  requireCanonicalBytes(caseDocumentManifest, caseDocumentManifestBytes, "Case Document manifest");
  requireCanonicalBytes(caseDocument, caseDocumentBytes, "Case Document bundle");
  requireCondition(sha256Text(caseDocumentManifestBytes) === reference.manifest_digest, "HANDOFF_REF_MISMATCH", "Case Document manifest digest does not match its immutable reference.");
  requireCondition(sha256Text(caseDocumentBytes) === reference.bundle_digest, "HANDOFF_REF_MISMATCH", "Case Document bundle digest does not match its immutable reference.");

  requireContract(caseDocumentManifest, "Case Document manifest");
  requireContract(caseDocument, "Case Document bundle");
  requireCondition(caseDocumentManifest.delivery_intent === "case_document" && caseDocumentManifest.authority === "canonical", "HANDOFF_REF_MISMATCH", "Case Document manifest is not canonical.");
  requireCondition(["delivered_cases", "delivered_with_gaps"].includes(caseDocumentManifest.result_kind), "CASE_NOT_EXECUTABLE", "Case Document does not contain executable Cases.");
  requireCondition(caseDocument.delivery_intent === "case_document" && ["delivered_cases", "delivered_with_gaps"].includes(caseDocument.result_kind), "CASE_NOT_EXECUTABLE", "Case Document bundle is not executable.");
  requireCondition(caseDocumentManifest.run_id === reference.run_id && caseDocumentManifest.revision === reference.revision, "HANDOFF_REF_MISMATCH", "Case Document identity does not match its reference.");
  requireArtifact(caseDocumentManifest.bundle, "Case Document bundle artifact");
  requireCondition(caseDocument.source_revision === reference.revision && caseDocumentManifest.bundle?.digest === reference.bundle_digest, "HANDOFF_REF_MISMATCH", "Case Document revision or bundle digest does not match.");

  requireCondition(Array.isArray(caseDocument.cases) && Array.isArray(caseDocument.ordered_case_ids), "INPUT_CONTRACT", "Case Document Case arrays are missing.");
  const documentIds = caseDocument.cases.map(item => item?.case_id);
  requireCondition(documentIds.every(id => typeof id === "string" && id.trim()) && new Set(documentIds).size === documentIds.length, "INPUT_CONTRACT", "Case Document Case IDs must be unique.");
  requireCondition(caseDocument.ordered_case_ids.length === documentIds.length && new Set(caseDocument.ordered_case_ids).size === documentIds.length && documentIds.every(id => caseDocument.ordered_case_ids.includes(id)), "INPUT_CONTRACT", "Case Document ordering is inconsistent.");
  return structuredClone(reference);
}

export function validateGeneratorHandoff(input) {
  const {
    generationRef,
    caseDocumentManifest,
    caseDocumentManifestBytes,
    caseDocument,
    caseDocumentBytes,
    executionPlanManifest,
    executionPlanManifestBytes,
    executionPlan,
    executionPlanBytes
  } = input;
  const reference = validateCaseDocumentHandoff(input);

  requireContract(executionPlanManifest, "Execution Plan manifest");
  requireContract(executionPlan, "Execution Plan");
  requireCanonicalBytes(executionPlanManifest, executionPlanManifestBytes, "Execution Plan manifest");
  requireCanonicalBytes(executionPlan, executionPlanBytes, "Execution Plan");
  requireCondition(typeof executionPlanManifest.run_id === "string" && executionPlanManifest.run_id.trim(), "HANDOFF_REF_MISMATCH", "Execution Plan manifest Run ID is invalid.");
  requireCondition(Number.isSafeInteger(executionPlanManifest.revision) && executionPlanManifest.revision >= 0, "HANDOFF_REF_MISMATCH", "Execution Plan manifest revision is invalid.");
  requireCondition(typeof executionPlanManifest.completed_at === "string" && executionPlanManifest.completed_at.trim(), "HANDOFF_REF_MISMATCH", "Execution Plan manifest completion time is invalid.");
  requireCondition(executionPlanManifest.delivery_intent === "execution_plan" && executionPlanManifest.authority === "canonical", "HANDOFF_REF_MISMATCH", "Execution Plan manifest is not canonical.");
  requireCondition(executionPlan.delivery_intent === "execution_plan", "HANDOFF_REF_MISMATCH", "Execution Plan intent is invalid.");
  requireCondition(same(executionPlanManifest.case_document_ref, reference) && same(executionPlan.case_document_ref, reference), "HANDOFF_REF_MISMATCH", "Execution Plan is bound to a different Case Document.");
  requireArtifact(executionPlanManifest.execution_plan_artifact, "Execution Plan artifact");
  requireCondition(executionPlanManifest.execution_plan_artifact.digest === sha256Text(executionPlanBytes), "HANDOFF_REF_MISMATCH", "Execution Plan artifact digest does not match.");
  requireCondition(executionPlan.status === "finished" && executionPlan.result_kind === "execution_ready" && executionPlan.runner_ready === true, "CASE_NOT_EXECUTABLE", "Execution Plan is not execution-ready.");
  requireCondition(executionPlanManifest.result_kind === "execution_ready" && executionPlanManifest.runner_ready === true, "CASE_NOT_EXECUTABLE", "Execution Plan manifest is not execution-ready.");
  requireCondition(same(executionPlanManifest.runner_projection, executionPlan.runner_projection), "HANDOFF_REF_MISMATCH", "Execution Plan projection differs from its manifest.");

  const caseIds = executionPlan.runner_projection?.case_ids;
  requireCondition(Array.isArray(caseIds) && caseIds.length > 0 && new Set(caseIds).size === caseIds.length, "CASE_NOT_EXECUTABLE", "Runner projection must contain unique Case IDs.");
  requireCondition(executionPlan.runner_projection.case_ids_digest === sha256Value(caseIds), "HANDOFF_REF_MISMATCH", "Runner projection digest is invalid.");
  requireCondition(Array.isArray(executionPlan.items), "CASE_NOT_EXECUTABLE", "Execution Plan items are missing.");
  const itemById = new Map();
  for (const item of executionPlan.items) {
    requireCondition(item && typeof item.case_id === "string" && !itemById.has(item.case_id), "INPUT_CONTRACT", "Execution Plan Case IDs must be unique.");
    itemById.set(item.case_id, item);
  }
  for (const caseId of caseIds) {
    const item = itemById.get(caseId);
    requireCondition(item?.semantic_status === "Grounded" && item?.disposition === "execute" && item?.ready === true, "CASE_NOT_EXECUTABLE", `Projected Case ${caseId} is not Grounded + execute + ready.`);
  }

  return { reference: structuredClone(reference), projectedCaseIds: [...caseIds] };
}

export function validateNoExecutionHandoff(input) {
  const {
    generationRef,
    executionPlanManifest,
    executionPlanManifestBytes,
    executionPlan,
    executionPlanBytes
  } = input;
  const reference = validateCaseDocumentHandoff(input);
  requireContract(executionPlanManifest, "Execution Plan manifest");
  requireContract(executionPlan, "Execution Plan");
  requireCanonicalBytes(executionPlanManifest, executionPlanManifestBytes, "Execution Plan manifest");
  requireCanonicalBytes(executionPlan, executionPlanBytes, "Execution Plan");
  requireCondition(typeof executionPlanManifest.run_id === "string" && executionPlanManifest.run_id.trim(), "HANDOFF_REF_MISMATCH", "Execution Plan manifest Run ID is invalid.");
  requireCondition(Number.isSafeInteger(executionPlanManifest.revision) && executionPlanManifest.revision >= 0, "HANDOFF_REF_MISMATCH", "Execution Plan manifest revision is invalid.");
  requireCondition(typeof executionPlanManifest.completed_at === "string" && executionPlanManifest.completed_at.trim(), "HANDOFF_REF_MISMATCH", "Execution Plan manifest completion time is invalid.");
  requireCondition(executionPlanManifest.delivery_intent === "execution_plan" && executionPlanManifest.authority === "canonical", "HANDOFF_REF_MISMATCH", "Execution Plan manifest is not canonical.");
  requireCondition(executionPlan.delivery_intent === "execution_plan", "HANDOFF_REF_MISMATCH", "Execution Plan intent is invalid.");
  requireCondition(same(executionPlanManifest.case_document_ref, reference) && same(executionPlan.case_document_ref, reference), "HANDOFF_REF_MISMATCH", "Execution Plan is bound to a different Case Document.");
  requireArtifact(executionPlanManifest.execution_plan_artifact, "Execution Plan artifact");
  requireCondition(executionPlanManifest.execution_plan_artifact.digest === sha256Text(executionPlanBytes), "HANDOFF_REF_MISMATCH", "Execution Plan artifact digest does not match.");
  requireCondition(executionPlan.status === "finished" && executionPlan.result_kind === "no_execution_selected" && executionPlan.runner_ready === false, "CASE_NOT_EXECUTABLE", "Execution Plan is not a completed no-execution result.");
  requireCondition(executionPlanManifest.result_kind === "no_execution_selected" && executionPlanManifest.runner_ready === false, "CASE_NOT_EXECUTABLE", "Execution Plan manifest is not a completed no-execution result.");
  requireCondition(same(executionPlanManifest.runner_projection, executionPlan.runner_projection), "HANDOFF_REF_MISMATCH", "Execution Plan projection differs from its manifest.");
  const caseIds = executionPlan.runner_projection?.case_ids;
  requireCondition(Array.isArray(caseIds) && caseIds.length === 0, "CASE_NOT_EXECUTABLE", "No-execution projection must be empty.");
  requireCondition(executionPlan.runner_projection.case_ids_digest === sha256Value(caseIds), "HANDOFF_REF_MISMATCH", "No-execution projection digest is invalid.");
  requireCondition(Array.isArray(executionPlan.items) && executionPlan.items.length > 0, "CASE_NOT_EXECUTABLE", "Execution Plan items are missing.");
  const itemIds = new Set();
  for (const item of executionPlan.items) {
    requireCondition(item && typeof item.case_id === "string" && item.case_id.trim() && !itemIds.has(item.case_id), "INPUT_CONTRACT", "Execution Plan Case IDs must be unique.");
    itemIds.add(item.case_id);
    requireCondition(item.disposition === "do_not_execute", "CASE_NOT_EXECUTABLE", `No-execution Plan still marks Case ${item.case_id} for execution.`);
  }
  return { reference: structuredClone(reference), projectedCaseIds: [] };
}
