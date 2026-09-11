import { canonicalV5Stringify } from './canonical-v5.mjs';
import { deriveCaseStatus } from './case-status.mjs';
import { V5ProtocolError } from './errors.mjs';
import { validateTypedOracle } from './oracles.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {string[]} values @param {string} name */
function unique(values, name) { if (new Set(values).size !== values.length || values.some((value) => !nonblank(value))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', `${name} must be a unique nonblank set.`); return [...values].sort(); }
/** @param {unknown} value */
function records(value) { return Array.isArray(value) ? /** @type {Array<Record<string,any>>} */ (value) : []; }

/** @param {string} prefix @param {unknown} payload */
function legacyStableId(prefix, payload) { return `${prefix}-${canonicalObjectDigest(payload).slice(7)}`; }

/** @param {Record<string,any>} input @param {Array<Record<string,any>>} cases */
function deriveCoverage(input, cases) {
  const caseByPoint = new Map(cases.filter((current) => current.semantic_status !== 'Exploratory').map((current) => [current.primary_test_point_id, current]));
  const formalIds = unique(input.formal_test_point_ids ?? [], 'Formal Test Point IDs');
  const formal = { total: formalIds.length, covered: 0, blocked: 0, not_applicable: 0 };
  for (const id of formalIds) {
    const current = caseByPoint.get(id);
    if (!current) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every formal Test Point must have one Case or exclusion projection.');
    if (['Grounded', 'Conditional'].includes(current.semantic_status)) formal.covered += 1;
    else if (current.semantic_status === 'Blocked') formal.blocked += 1;
    else if (current.semantic_status === 'NotApplicable') formal.not_applicable += 1;
  }
  const summarize = (/** @type {Array<Record<string,any>>} */ rows) => ({
    total: rows.length,
    covered: rows.filter((row) => row.disposition === 'covered').length,
    gap: rows.filter((row) => row.disposition === 'gap').length,
    not_applicable: rows.filter((row) => row.disposition === 'not_applicable').length
  });
  const permissionRows = records(input.permission_cells);
  const permission = {
    total: permissionRows.length,
    covered: permissionRows.filter((row) => row.disposition === 'formal').length,
    gap: permissionRows.filter((row) => row.disposition === 'semantic_gap').length,
    not_applicable: permissionRows.filter((row) => row.disposition === 'not_applicable').length
  };
  return {
    formal_test_point: formal,
    semantic_partition: summarize(records(input.semantic_partitions)),
    value_instance: summarize(records(input.value_instances)),
    permission_cell: permission,
    risk_review: { reviewed: Number(input.risk_ledger?.reviewed_cell_count ?? 0), material_items: records(input.risk_ledger?.items).length }
  };
}

/** @param {Array<Record<string,any>>} cells */
function derivePermissionCoverage(cells) {
  const dimensions = ['decision', 'denial_behavior', 'data_scope'];
  /** @type {Record<string,any>} */
  const result = {};
  for (const dimension of dimensions) {
    const rows = cells.filter((cell) => cell.permission_dimension === dimension);
    result[dimension] = {
      required: rows.length,
      formal: rows.filter((cell) => cell.disposition === 'formal').length,
      semantic_gap: rows.filter((cell) => cell.disposition === 'semantic_gap').length,
      not_applicable: rows.filter((cell) => cell.disposition === 'not_applicable').length,
      ...(dimension === 'decision' ? { outcomes: Object.fromEntries(rows.filter((cell) => cell.disposition === 'formal').map((cell) => [`${cell.action_ref}:${cell.expected}`, 1])) } : {})
    };
  }
  return result;
}

/**
 * Compile accepted V5 Case Drafts to the single authoritative canonical document.
 * @param {Record<string,any>} input
 */
export function compileV5CaseDocument(input) {
  if (!object(input) || !nonblank(input.case_document_lineage_id) || !/^sha256:[0-9a-f]{64}$/u.test(input.semantic_root_digest) || !Number.isSafeInteger(input.source_revision) || input.source_revision < 0 || !Array.isArray(input.case_drafts)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case compilation input is invalid.');
  const assessmentByClaim = new Map();
  for (const assessment of records(input.claim_assessments)) {
    if (!nonblank(assessment.claim_id) || assessmentByClaim.has(assessment.claim_id) || !['E1', 'E2', 'E3'].includes(assessment.level) || !['supported', 'uncertain', 'unsupported'].includes(assessment.support_review)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Claim assessment inventory is invalid or ambiguous.');
    assessmentByClaim.set(assessment.claim_id, assessment);
  }
  const acceptedGapIds = new Set(unique(input.accepted_gap_ids ?? [], 'Accepted gap IDs'));
  const seenClientKeys = new Set();
  const cases = input.case_drafts.map((/** @type {Record<string,any>} */ draft) => {
    if (!nonblank(draft.case_client_key) || seenClientKeys.has(draft.case_client_key) || !nonblank(draft.title) || !nonblank(draft.module_id) || !['P0', 'P1', 'P2', 'P3'].includes(draft.priority) || !nonblank(draft.primary_test_point_id) || !Array.isArray(draft.steps) || draft.steps.length === 0 || !Array.isArray(draft.oracles) || draft.oracles.length === 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case Draft is incomplete or duplicates a client key.');
    seenClientKeys.add(draft.case_client_key);
    const claimIds = unique(draft.claim_ids ?? [], 'Case Claim IDs');
    const assessments = claimIds.map((claimId) => assessmentByClaim.get(claimId));
    if (assessments.some((assessment) => !assessment || assessment.support_review !== 'supported')) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Case references unsupported or unknown business evidence.');
    const gapIds = unique(draft.semantic_gap_ids ?? [], 'Case semantic gap IDs');
    if (gapIds.some((gapId) => !acceptedGapIds.has(gapId))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Case references an unaccepted semantic gap.');
    const notApplicableLevels = draft.not_applicable_basis === undefined ? undefined : records(draft.not_applicable_basis).map((basis) => {
      const assessment = assessmentByClaim.get(basis.claim_id);
      if (basis.kind !== 'claim' || !assessment || assessment.support_review !== 'supported') throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'NotApplicable basis is not accepted evidence.');
      return assessment.level;
    });
    const status = deriveCaseStatus({ evidence_levels: assessments.map((assessment) => assessment.level), unresolved_gap_ids: gapIds, not_applicable_basis_levels: notApplicableLevels, exploratory_only: draft.exploratory_only === true });
    const stepKeys = unique(draft.steps.map((/** @type {Record<string,any>} */ step) => step.step_client_key), 'Case step client keys');
    const oracleContext = { semanticRootDigest: input.semantic_root_digest, semanticRuleIndex: input.semantic_rule_index ?? { by_id: {} }, stepClientKeys: stepKeys, acceptedClaimIds: claimIds, oracleSemanticContractIds: draft.oracles.map((/** @type {Record<string,any>} */ oracle) => oracle.oracle_semantic_contract_id), fieldCorrespondenceIds: records(input.semantic_audit?.field_correspondences).map((row) => row.mapping_id), permissionDecisionCells: records(input.permission_cells).filter((cell) => cell.permission_dimension === 'decision').map((cell) => ({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key })) };
    const caseAnchorDigest = canonicalObjectDigest({
      module_id: draft.module_id, title: draft.title, primary_test_point_id: draft.primary_test_point_id,
      business_preconditions: draft.business_preconditions, data_conditions: draft.data_conditions,
      steps: draft.steps.map((/** @type {Record<string,any>} */ step) => ({ action: step.action, semantic_action_ref: step.semantic_action_ref, claim_ids: [...step.claim_ids].sort() })),
      oracles: draft.oracles.map((/** @type {Record<string,any>} */ oracle) => ({ oracle_semantic_contract_id: oracle.oracle_semantic_contract_id, observation_ref: oracle.observation_ref, assertion: oracle.assertion, evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window, claim_ids: [...oracle.claim_ids].sort() })),
      population_scope: draft.population_scope, canonical_names: [...draft.canonical_names].sort(), claim_ids: claimIds, semantic_gap_ids: gapIds, semantic_status: status
    });
    const steps = draft.steps.map((/** @type {Record<string,any>} */ step, /** @type {number} */ index) => {
      if (!nonblank(step.action) || !Array.isArray(step.claim_ids) || step.claim_ids.some((/** @type {string} */ claimId) => !claimIds.includes(claimId))) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case step action or Claim binding is invalid.');
      return { step_id: legacyStableId('STEP', { case_anchor_digest: caseAnchorDigest, sequence: index + 1, action: step.action, semantic_action_ref: step.semantic_action_ref }), step_client_key: step.step_client_key, sequence: index + 1, action: step.action, semantic_action_ref: structuredClone(step.semantic_action_ref), claim_ids: [...step.claim_ids].sort() };
    });
    const stepIdByKey = new Map(steps.map((step) => [step.step_client_key, step.step_id]));
    const oracles = draft.oracles.map((/** @type {Record<string,any>} */ oracle) => {
      validateTypedOracle(oracle, oracleContext);
      return {
        oracle_id: legacyStableId('ORACLE', { case_anchor_digest: caseAnchorDigest, oracle_semantic_contract_id: oracle.oracle_semantic_contract_id, observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key), observation_ref: oracle.observation_ref, assertion: oracle.assertion, evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window, claim_ids: [...oracle.claim_ids].sort() }),
        oracle_semantic_contract_id: oracle.oracle_semantic_contract_id,
        observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key),
        observation_ref: structuredClone(oracle.observation_ref), assertion: structuredClone(oracle.assertion),
        evaluation_scope: structuredClone(oracle.evaluation_scope), observation_window: structuredClone(oracle.observation_window), claim_ids: [...oracle.claim_ids].sort()
      };
    }).sort((left, right) => left.oracle_id.localeCompare(right.oracle_id));
    const identity = {
      module_id: draft.module_id, primary_test_point_id: draft.primary_test_point_id, title: draft.title,
      business_preconditions: draft.business_preconditions, data_conditions: draft.data_conditions,
      steps: steps.map(({ step_client_key: ignored, ...step }) => step), oracles,
      population_scope: draft.population_scope, canonical_names: [...draft.canonical_names].sort(), claim_ids: claimIds,
      semantic_gap_ids: gapIds, semantic_status: status
    };
    return {
      case_id: legacyStableId('CASE', identity), title: draft.title, module_id: draft.module_id, priority: draft.priority,
      primary_test_point_id: draft.primary_test_point_id, semantic_status: status,
      business_preconditions: structuredClone(draft.business_preconditions), data_conditions: structuredClone(draft.data_conditions),
      steps, oracles, population_scope: structuredClone(draft.population_scope), canonical_names: unique(draft.canonical_names, 'Canonical names'),
      claim_ids: claimIds, semantic_gap_ids: gapIds,
      ...(status === 'NotApplicable' ? { not_applicable_basis: structuredClone(draft.not_applicable_basis) } : {}),
      ...(status === 'Exploratory' ? { observation_intent: draft.observation_intent } : {})
    };
  }).sort((left, right) => left.case_id.localeCompare(right.case_id));
  if (new Set(cases.map((current) => current.case_id)).size !== cases.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Derived Case identities collide.');
  /** @type {Record<string,number>} */
  const classificationCounts = { Blocked: 0, Conditional: 0, Exploratory: 0, Grounded: 0, NotApplicable: 0 };
  for (const current of cases) classificationCounts[current.semantic_status] += 1;
  const manifestDigest = canonicalObjectDigest({ schema_version: '5.0.0', case_document_lineage_id: input.case_document_lineage_id, semantic_root_digest: input.semantic_root_digest, case_ids: cases.map((current) => current.case_id), formal_test_point_ids: [...(input.formal_test_point_ids ?? [])].sort() });
  const payload = {
    schema_version: '5.0.0', compiler_version: '0.6.0', delivery_intent: 'case_document',
    case_document_lineage_id: input.case_document_lineage_id, semantic_root_digest: input.semantic_root_digest, source_revision: input.source_revision,
    manifest_digest: manifestDigest, cases, classification_counts: classificationCounts,
    coverage: deriveCoverage(input, cases), permission_coverage: derivePermissionCoverage(records(input.permission_cells)),
    risk_ledger: structuredClone(input.risk_ledger ?? { reviewed_cell_count: 0, items: [] }),
    semantic_audit: structuredClone(input.semantic_audit ?? { value_states: [], field_correspondences: [], domains: [], populations: [] }),
    provenance: { output_role: 'downstream_only', may_supply_upstream_evidence: false, semantic_root_digest: input.semantic_root_digest }
  };
  return { ...payload, bundle_digest: canonicalObjectDigest(payload) };
}

/** @param {Record<string,any>} document */
export function validateV5CaseDocument(document) {
  if (!object(document) || document.schema_version !== '5.0.0' || document.compiler_version !== '0.6.0' || document.delivery_intent !== 'case_document' || !Array.isArray(document.cases) || document.provenance?.output_role !== 'downstream_only') throw new V5ProtocolError('CANONICAL_RENDER_MISMATCH', 'Canonical V5 Case Document shape is invalid.');
  const { bundle_digest: declared, ...payload } = document;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError('CANONICAL_RENDER_MISMATCH', 'Canonical V5 Case Document digest is invalid.');
  return structuredClone(document);
}

/** @param {Record<string,any>} document @param {{run_id:string,revision:number}} metadata */
export function projectCompatibilityExecutionPlan(document, metadata) {
  validateV5CaseDocument(document);
  if (!nonblank(metadata.run_id) || !Number.isSafeInteger(metadata.revision) || metadata.revision < 0) throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Execution Plan requires an immutable Case Document revision.');
  const operationKinds = ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition'];
  const items = document.cases.map((/** @type {Record<string,any>} */ current) => ({ case_id: current.case_id, title: current.title, semantic_status: current.semantic_status, execution_disposition: 'pending', available_actions: current.semantic_status === 'Grounded' ? ['provide_capability_proof', 'set_execution_disposition'] : current.semantic_status === 'NotApplicable' ? [] : ['set_execution_disposition'] }));
  const payload = {
    schema_version: '5.0.0', compiler_version: '0.6.0', delivery_intent: 'execution_plan',
    case_document_ref: { run_id: metadata.run_id, revision: metadata.revision, manifest_digest: document.manifest_digest, bundle_digest: document.bundle_digest, case_document_lineage_id: document.case_document_lineage_id, schema_version: '5.0.0' },
    operation_kinds: operationKinds, items
  };
  return { ...payload, plan_digest: canonicalObjectDigest(payload) };
}
