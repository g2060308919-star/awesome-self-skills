import { canonicalV5Stringify } from './canonical-v5.mjs';
import { typedContractRefKey, validateTypedValue } from './behavior-contracts.mjs';
import { deriveCaseStatus } from './case-status.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { validateTypedOracle } from './oracles.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown} value */
function nonempty(value) { return Array.isArray(value) && value.length > 0; }
/** @param {string[]} values @param {string} name */
function unique(values, name) { if (new Set(values).size !== values.length || values.some((value) => !nonblank(value))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', `${name} must be a unique nonblank set.`); return [...values].sort(); }
/** @param {unknown} value */
function records(value) { return Array.isArray(value) ? /** @type {Array<Record<string,any>>} */ (value) : []; }

/** @param {Record<string,any>} domain @param {Record<string,any>} partition */
function finitePartitionMembers(domain, partition) {
  if (domain.domain?.kind !== 'closed_enum') return null;
  if (partition.kind === 'exact_members') return records(partition.values);
  if (partition.kind === 'complement') {
    if (Array.isArray(partition.derived_members)) return records(partition.derived_members);
    const excluded = new Set(records(partition.excluded_values).map((value) => canonicalV5Stringify(value)));
    return records(domain.domain.members).filter((value) => !excluded.has(canonicalV5Stringify(value)));
  }
  return null;
}

/**
 * @param {Record<string,any>} draft
 * @param {string} caseAnchorDigest
 * @param {Record<string,any>} input
 * @param {string} status
 */
function compileDomainSelections(draft, caseAnchorDigest, input, status) {
  const domainById = new Map(records(input.semantic_audit?.domains).map((domain) => [domain.domain_contract_id, domain]));
  const equivalenceById = new Map(records(input.semantic_audit?.behavior_equivalence_contracts).map((contract) => [contract.behavior_equivalence_contract_id, contract]));
  const oracleIds = new Set(records(draft.oracles).map((oracle) => oracle.oracle_semantic_contract_id));
  const seenKeys = new Set();
  const seenCoordinates = new Set();
  return records(draft.domain_selections).map((selection) => {
    const keys = ['selection_client_key', 'case_client_key', 'formal_test_point_id', 'oracle_semantic_contract_id', 'domain_contract_id', 'partition_id', 'selection'];
    if (!exact(selection, keys) || !nonblank(selection.selection_client_key) || seenKeys.has(selection.selection_client_key) || selection.case_client_key !== draft.case_client_key || selection.formal_test_point_id !== draft.primary_test_point_id || !oracleIds.has(selection.oracle_semantic_contract_id)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection ownership must exactly match its Case, formal Test Point, and accepted Oracle.');
    seenKeys.add(selection.selection_client_key);
    const coordinate = `${selection.domain_contract_id}\0${selection.partition_id}\0${selection.formal_test_point_id}\0${selection.oracle_semantic_contract_id}`;
    if (seenCoordinates.has(coordinate)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'A Case may bind a Domain partition at most once for one Test Point and Oracle.');
    seenCoordinates.add(coordinate);
    const domain = domainById.get(selection.domain_contract_id);
    const partition = records(domain?.partitions).find((candidate) => candidate.partition_id === selection.partition_id);
    const choice = selection.selection;
    if (!domain || !partition || !object(choice) || !nonempty(choice.selected_values) || choice.selected_values.some((value) => !validateTypedValue(value))) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection must resolve one current-root Domain partition and typed values.');
    const selectedDigests = choice.selected_values.map((value) => canonicalObjectDigest(value));
    if (new Set(selectedDigests).size !== selectedDigests.length) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection values must be unique.');
    const finiteMembers = finitePartitionMembers(domain, partition);
    const finiteDigests = finiteMembers === null ? null : finiteMembers.map((value) => canonicalObjectDigest(value)).sort();
    const membership = choice.membership;
    if (!object(membership)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection membership evidence is required.');
    if (membership.kind === 'closed_domain_membership') {
      if (!exact(membership, ['kind']) || finiteDigests === null || selectedDigests.some((digest) => !finiteDigests.includes(digest))) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Closed-domain membership must select only members of the bound partition.');
    } else if (membership.kind === 'decidable_predicate') {
      if (!exact(membership, ['kind', 'predicate_contract_id']) || partition.kind !== 'predicate' || !nonblank(membership.predicate_contract_id) || membership.predicate_contract_id !== partition.predicate_contract_id) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Predicate membership must bind the partition predicate contract exactly.');
    } else if (membership.kind === 'membership_witnesses') {
      const witnesses = records(membership.witnesses);
      if (!exact(membership, ['kind', 'witnesses']) || witnesses.length === 0 || witnesses.some((witness) => !exact(witness, ['selected_value_digest', 'basis']) || !nonempty(witness.basis)) || canonicalV5Stringify(witnesses.map((witness) => witness.selected_value_digest).sort()) !== canonicalV5Stringify([...selectedDigests].sort())) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Membership witnesses must exactly cover the selected values with evidence.');
    } else throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection membership kind is unknown.');
    if (choice.kind === 'exhaustive_members') {
      if (!exact(choice, ['kind', 'selected_values', 'membership']) || membership.kind !== 'closed_domain_membership' || finiteDigests === null || canonicalV5Stringify([...selectedDigests].sort()) !== canonicalV5Stringify(finiteDigests)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Exhaustive selection must enumerate the complete finite partition.');
    } else if (choice.kind === 'representative') {
      if (!exact(choice, ['kind', 'selected_values', 'behavior_equivalence_contract_id', 'membership'])) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Representative selection is not closed.');
      const equivalence = equivalenceById.get(choice.behavior_equivalence_contract_id);
      if (!equivalence || equivalence.domain_contract_id !== selection.domain_contract_id || equivalence.partition_id !== selection.partition_id || equivalence.formal_test_point_id !== selection.formal_test_point_id || equivalence.oracle_semantic_contract_id !== selection.oracle_semantic_contract_id) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Representative selection must bind the exact accepted equivalence contract.');
    } else if (choice.kind === 'sampled') {
      if (!exact(choice, ['kind', 'selected_values', 'residual_risk', 'membership']) || !nonblank(choice.residual_risk)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Sampled selection requires a nonblank residual risk.');
    } else throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Domain selection kind is unknown.');
    return {
      ...structuredClone(selection), selected_value_digests: [...selectedDigests].sort(),
      coverage_disposition: status === 'NotApplicable' ? 'not_applicable' : ['Grounded', 'Conditional'].includes(status) ? 'covered' : 'gap',
      domain_selection_id: stableV5Id('domain_selection', {
        input_semantic_root_digest: input.semantic_root_digest, case_anchor_digest: caseAnchorDigest,
        formal_test_point_id: selection.formal_test_point_id, oracle_semantic_contract_id: selection.oracle_semantic_contract_id,
        domain_contract_id: selection.domain_contract_id, partition_id: selection.partition_id, selection: choice
      })
    };
  }).sort((left, right) => left.domain_selection_id.localeCompare(right.domain_selection_id));
}

/** @param {Record<string,any>} input @param {Array<Record<string,any>>} cases */
function deriveDomainCoverage(input, cases) {
  const domains = records(input.semantic_audit?.domains);
  const domainById = new Map(domains.map((domain) => [domain.domain_contract_id, domain]));
  const selections = cases.flatMap((current) => records(current.domain_selections));
  const groups = new Map();
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
    const grounded = []; const conditional = []; const blocked = [];
    for (const partitionId of requiredIds) {
      const selection = byPartition.get(partitionId);
      const currentCase = cases.find((candidate) => records(candidate.domain_selections).some((item) => item.domain_selection_id === selection?.domain_selection_id));
      const disposition = selection?.coverage_disposition ?? 'gap';
      partitionRows.push({ partition_id: partitionId, disposition });
      if (!selection || ['Blocked', 'Exploratory'].includes(currentCase?.semantic_status)) blocked.push(partitionId);
      else if (currentCase?.semantic_status === 'Conditional') conditional.push(partitionId);
      else if (currentCase?.semantic_status === 'Grounded') grounded.push(partitionId);
    }
    semanticPartitionCoverage.push({
      domain_contract_id: group.domain_contract_id, formal_test_point_id: group.formal_test_point_id,
      oracle_semantic_contract_id: group.oracle_semantic_contract_id, required_partition_ids: requiredIds,
      grounded_partition_ids: grounded.sort(), conditional_partition_ids: conditional.sort(), blocked_partition_ids: blocked.sort(),
      status: blocked.length === 0 && conditional.length === 0 ? 'covered' : grounded.length === 0 && conditional.length === 0 ? 'blocked' : 'partial'
    });
  }
  const valueRows = selections.map((selection) => ({ value_instance_id: selection.domain_selection_id, disposition: selection.coverage_disposition }));
  const valueInstanceCoverage = selections.map((selection) => {
    const domain = domainById.get(selection.domain_contract_id);
    const partition = records(domain?.partitions).find((candidate) => candidate.partition_id === selection.partition_id);
    const finite = domain && partition ? finitePartitionMembers(domain, partition) : null;
    return {
      domain_contract_id: selection.domain_contract_id, formal_test_point_id: selection.formal_test_point_id,
      oracle_semantic_contract_id: selection.oracle_semantic_contract_id, partition_id: selection.partition_id,
      universe: finite === null ? { kind: 'open_or_unknown' } : { kind: 'finite', total_instances: finite.length },
      selected_value_digests: selection.selected_value_digests,
      status: selection.selection.kind === 'exhaustive_members' ? 'exhaustive' : finite === null ? 'unknown' : 'partial'
    };
  }).sort((left, right) => `${left.domain_contract_id}\0${left.partition_id}`.localeCompare(`${right.domain_contract_id}\0${right.partition_id}`));
  return { partitionRows, valueRows, semanticPartitionCoverage, valueInstanceCoverage };
}

/** @param {string} prefix @param {unknown} payload */
function legacyStableId(prefix, payload) { return `${prefix}-${canonicalObjectDigest(payload).slice(7)}`; }

/** @param {Record<string,any>} input @param {Array<Record<string,any>>} cases */
function deriveCoverage(input, cases, domainCoverage) {
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
    semantic_partition: summarize(domainCoverage.partitionRows.length > 0 ? domainCoverage.partitionRows : records(input.semantic_partitions)),
    value_instance: summarize(domainCoverage.valueRows.length > 0 ? domainCoverage.valueRows : records(input.value_instances)),
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
function compileV5CaseDocumentBundle(input) {
  if (!object(input) || !nonblank(input.case_document_lineage_id) || !/^sha256:[0-9a-f]{64}$/u.test(input.semantic_root_digest) || !Number.isSafeInteger(input.source_revision) || input.source_revision < 0 || !Array.isArray(input.case_drafts)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case compilation input is invalid.');
  const assessmentByClaim = new Map();
  for (const assessment of records(input.claim_assessments)) {
    if (!nonblank(assessment.claim_id) || assessmentByClaim.has(assessment.claim_id) || !['E1', 'E2', 'E3'].includes(assessment.level) || !['supported', 'uncertain', 'unsupported'].includes(assessment.support_review)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Claim assessment inventory is invalid or ambiguous.');
    assessmentByClaim.set(assessment.claim_id, assessment);
  }
  const acceptedGapIds = new Set(unique(input.accepted_gap_ids ?? [], 'Accepted gap IDs'));
  const oracleContractById = new Map(records(input.oracle_semantic_contracts).map((contract) => [contract.oracle_semantic_contract_id, contract]));
  if (oracleContractById.size !== records(input.oracle_semantic_contracts).length) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Accepted Oracle semantic-contract identities are duplicated.');
  const seenClientKeys = new Set();
  const clientKeyBindings = [];
  const bindClientKey = (/** @type {string} */ clientKey, /** @type {string} */ stableId) => {
    if (!nonblank(clientKey) || seenClientKeys.has(clientKey)) throw new V5ProtocolError('CLIENT_KEY_INVALID', 'Case, Step, Oracle, and DomainSelection client keys must be globally unique within the Case batch.');
    seenClientKeys.add(clientKey);
    clientKeyBindings.push({ client_key: clientKey, stable_id: stableId });
  };
  const seenCaseClientKeys = new Set();
  const cases = input.case_drafts.map((/** @type {Record<string,any>} */ draft) => {
    if (!nonblank(draft.case_client_key) || seenCaseClientKeys.has(draft.case_client_key) || !nonblank(draft.title) || !nonblank(draft.module_id) || !['P0', 'P1', 'P2', 'P3'].includes(draft.priority) || !nonblank(draft.primary_test_point_id) || !Array.isArray(draft.steps) || draft.steps.length === 0 || !Array.isArray(draft.case_step_semantic_bindings) || !Array.isArray(draft.domain_selections) || !Array.isArray(draft.oracles) || draft.oracles.length === 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case Draft is incomplete, lacks its V5 extension, or duplicates a client key.');
    seenCaseClientKeys.add(draft.case_client_key);
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
    const acceptedContractRefs = new Set(records(input.semantic_audit?.permission_auxiliary_contracts).map((contract) => typedContractRefKey({ contract_id: contract.permission_auxiliary_contract_id, contract_kind: contract.payload?.contract_kind, semantic_root_digest: input.semantic_root_digest })));
    const permissionCells = records(input.permission_cells).map((cell) => {
      let formalOutcome;
      if (cell.disposition === 'formal' && cell.permission_dimension === 'decision') formalOutcome = { permission_dimension: 'decision', action_ref: cell.action_ref, expected: cell.expected };
      else if (cell.disposition === 'formal' && cell.permission_dimension === 'denial_behavior') formalOutcome = { permission_dimension: 'denial_behavior', decision_cell_key: cell.decision_cell_key, denial_contract_ref: cell.denial_contract_ref };
      else if (cell.disposition === 'formal' && cell.permission_dimension === 'data_scope') formalOutcome = { permission_dimension: 'data_scope', data_scope_contract_ref: cell.data_scope_contract_ref };
      return { ...structuredClone(cell), ...(formalOutcome ? { formal_outcome: formalOutcome } : {}) };
    });
    const oracleContext = { semanticRootDigest: input.semantic_root_digest, semanticRuleIndex: input.semantic_rule_index ?? { by_id: {} }, stepClientKeys: stepKeys, acceptedClaimIds: claimIds, oracleSemanticContractIds: [...oracleContractById.keys()], fieldCorrespondenceIds: records(input.semantic_audit?.field_correspondences).map((row) => row.field_correspondence_id), permissionCells, acceptedContractRefs };
    const caseAnchorDigest = canonicalObjectDigest({
      module_id: draft.module_id, title: draft.title, primary_test_point_id: draft.primary_test_point_id,
      business_preconditions: draft.business_preconditions, data_conditions: draft.data_conditions,
      steps: draft.steps.map((/** @type {Record<string,any>} */ step) => ({ action: step.action, semantic_action_ref: step.semantic_action_ref, claim_ids: [...step.claim_ids].sort() })),
      canonical_names: [...draft.canonical_names].sort(), claim_ids: claimIds, semantic_gap_ids: gapIds, semantic_status: status
    });
    const bindings = records(draft.case_step_semantic_bindings);
    if (bindings.length !== draft.steps.length) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Case step semantic bindings must exactly cover all Case steps.');
    for (const step of draft.steps) {
      const matches = bindings.filter((binding) => exact(binding, ['case_client_key', 'step_client_key', 'action_ref']) && binding.case_client_key === draft.case_client_key && binding.step_client_key === step.step_client_key && canonicalV5Stringify(binding.action_ref) === canonicalV5Stringify(step.semantic_action_ref));
      if (matches.length !== 1) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Each Case step needs one exact accepted semantic-action binding.');
    }
    const domainSelections = compileDomainSelections(draft, caseAnchorDigest, input, status);
    const steps = draft.steps.map((/** @type {Record<string,any>} */ step, /** @type {number} */ index) => {
      if (!nonblank(step.action) || !Array.isArray(step.claim_ids) || step.claim_ids.some((/** @type {string} */ claimId) => !claimIds.includes(claimId))) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case step action or Claim binding is invalid.');
      return { step_id: legacyStableId('STEP', { case_anchor_digest: caseAnchorDigest, sequence: index + 1, action: step.action, semantic_action_ref: step.semantic_action_ref }), step_client_key: step.step_client_key, sequence: index + 1, action: step.action, semantic_action_ref: structuredClone(step.semantic_action_ref), claim_ids: [...step.claim_ids].sort() };
    });
    const stepIdByKey = new Map(steps.map((step) => [step.step_client_key, step.step_id]));
    const oracles = draft.oracles.map((/** @type {Record<string,any>} */ oracle) => {
      validateTypedOracle(oracle, oracleContext);
      const semanticContract = oracleContractById.get(oracle.oracle_semantic_contract_id);
      const semanticAssertion = structuredClone(oracle.assertion);
      if (semanticAssertion.kind === 'transition') delete semanticAssertion.trigger_step_client_key;
      if (!semanticContract || canonicalV5Stringify(oracle.observation_ref) !== canonicalV5Stringify(semanticContract.observation_ref) || canonicalV5Stringify(semanticAssertion) !== canonicalV5Stringify(semanticContract.assertion) || canonicalV5Stringify(oracle.evaluation_scope) !== canonicalV5Stringify(semanticContract.evaluation_scope) || canonicalV5Stringify(oracle.observation_window) !== canonicalV5Stringify(semanticContract.observation_window)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Case Oracle does not exactly project its accepted semantic contract.');
      return {
        oracle_client_key: oracle.oracle_client_key,
        oracle_id: legacyStableId('ORACLE', { case_anchor_digest: caseAnchorDigest, oracle_semantic_contract_id: oracle.oracle_semantic_contract_id, observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key), observation_ref: oracle.observation_ref, assertion: oracle.assertion, evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window, claim_ids: [...oracle.claim_ids].sort() }),
        oracle_semantic_contract_id: oracle.oracle_semantic_contract_id,
        observe_after_step_id: stepIdByKey.get(oracle.observe_after_step_client_key),
        observation_ref: structuredClone(oracle.observation_ref), assertion: structuredClone(oracle.assertion),
        evaluation_scope: structuredClone(oracle.evaluation_scope), observation_window: structuredClone(oracle.observation_window), claim_ids: [...oracle.claim_ids].sort()
      };
    }).sort((left, right) => left.oracle_id.localeCompare(right.oracle_id));
    const publicSteps = steps.map(({ step_client_key: ignored, ...step }) => step);
    const publicOracles = oracles.map(({ oracle_client_key: ignored, ...oracle }) => oracle);
    const identity = {
      module_id: draft.module_id, primary_test_point_id: draft.primary_test_point_id, title: draft.title,
      business_preconditions: draft.business_preconditions, data_conditions: draft.data_conditions,
      steps: publicSteps, oracles: publicOracles,
      canonical_names: [...draft.canonical_names].sort(), claim_ids: claimIds,
      semantic_gap_ids: gapIds, semantic_status: status
    };
    const caseId = legacyStableId('CASE', identity);
    bindClientKey(draft.case_client_key, caseId);
    for (const step of steps) bindClientKey(step.step_client_key, step.step_id);
    for (const oracle of oracles) bindClientKey(oracle.oracle_client_key, oracle.oracle_id);
    const publicDomainSelections = domainSelections.map(({ selection_client_key: clientKey, case_client_key: ignoredCaseKey, ...selection }) => {
      bindClientKey(clientKey, selection.domain_selection_id);
      return { ...selection, case_id: caseId };
    });
    return {
      case_id: caseId, title: draft.title, module_id: draft.module_id, priority: draft.priority,
      primary_test_point_id: draft.primary_test_point_id, semantic_status: status,
      business_preconditions: structuredClone(draft.business_preconditions), data_conditions: structuredClone(draft.data_conditions),
      steps: publicSteps, oracles: publicOracles, canonical_names: unique(draft.canonical_names, 'Canonical names'),
      claim_ids: claimIds, semantic_gap_ids: gapIds, domain_selections: publicDomainSelections,
      ...(status === 'NotApplicable' ? { not_applicable_basis: structuredClone(draft.not_applicable_basis) } : {}),
      ...(status === 'Exploratory' ? { observation_intent: draft.observation_intent } : {})
    };
  }).sort((left, right) => left.case_id.localeCompare(right.case_id));
  if (new Set(cases.map((current) => current.case_id)).size !== cases.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Derived Case identities collide.');
  /** @type {Record<string,number>} */
  const classificationCounts = { Blocked: 0, Conditional: 0, Exploratory: 0, Grounded: 0, NotApplicable: 0 };
  for (const current of cases) classificationCounts[current.semantic_status] += 1;
  const domainCoverage = deriveDomainCoverage(input, cases);
  const manifestDigest = canonicalObjectDigest({ schema_version: '5.0.0', case_document_lineage_id: input.case_document_lineage_id, semantic_root_digest: input.semantic_root_digest, case_ids: cases.map((current) => current.case_id), formal_test_point_ids: [...(input.formal_test_point_ids ?? [])].sort() });
  const payload = {
    schema_version: '5.0.0', compiler_version: '0.6.0', delivery_intent: 'case_document',
    case_document_lineage_id: input.case_document_lineage_id, semantic_root_digest: input.semantic_root_digest, source_revision: input.source_revision,
    manifest_digest: manifestDigest, cases, classification_counts: classificationCounts,
    coverage: deriveCoverage(input, cases, domainCoverage), permission_coverage: derivePermissionCoverage(records(input.permission_cells)),
    semantic_partition_coverage: domainCoverage.semanticPartitionCoverage,
    value_instance_coverage: domainCoverage.valueInstanceCoverage,
    risk_ledger: structuredClone(input.risk_ledger ?? { reviewed_cell_count: 0, items: [] }),
    semantic_audit: structuredClone(input.semantic_audit ?? { value_states: [], field_correspondences: [], domains: [], populations: [] }),
    provenance: { output_role: 'downstream_only', may_supply_upstream_evidence: false, semantic_root_digest: input.semantic_root_digest }
  };
  return {
    document: { ...payload, bundle_digest: canonicalObjectDigest(payload) },
    client_key_bindings: clientKeyBindings.sort((left, right) => left.client_key.localeCompare(right.client_key))
  };
}

/** @param {Record<string,any>} input */
export function compileV5CaseDocument(input) {
  return compileV5CaseDocumentBundle(input).document;
}

/** @param {Record<string,any>} input */
export function compileV5CaseDocumentTransaction(input) {
  return compileV5CaseDocumentBundle(input);
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
