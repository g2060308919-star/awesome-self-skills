import { canonicalV5Stringify } from './canonical-v5.mjs';
import {
  compileDomain,
  typedContractRefKey,
  validateFieldCorrespondence,
  validatePopulationContract,
  validatePopulationProof
} from './behavior-contracts.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { validateOracleSemanticContract } from './oracles.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown} value */
function nonempty(value) { return Array.isArray(value) && value.length > 0; }

/**
 * Compile Agent-local Behavior client keys into current-root stable contracts.
 * The returned projections are Compiler state; the accepted Agent envelope stays
 * byte-faithful to the submitted artifact.
 * @param {{semanticRootDigest:string,semanticRuleIndex:Record<string,any>,artifact:Record<string,any>,permissionCells?:Array<Record<string,any>>,acceptedContractRefs?:Set<string>}} input
 */
export function compileBehaviorContracts(input) {
  const { semanticRootDigest, semanticRuleIndex, artifact } = input;
  const acceptedContractRefs = new Set(input.acceptedContractRefs ?? []);
  const bindings = [];
  const stableByClientKey = new Map();
  const bind = (/** @type {string} */ clientKey, /** @type {string} */ stableId) => {
    if (!nonblank(clientKey) || stableByClientKey.has(clientKey)) throw new V5ProtocolError('CLIENT_KEY_INVALID', 'Behavior client keys must be nonblank and globally unique within one batch.');
    stableByClientKey.set(clientKey, stableId);
    bindings.push({ client_key: clientKey, stable_id: stableId });
  };

  const fieldCorrespondences = artifact.field_correspondences.map((/** @type {Record<string,any>} */ mapping) => {
    const validated = validateFieldCorrespondence(mapping, semanticRuleIndex);
    const fieldCorrespondenceId = stableV5Id('field_correspondence', {
      input_semantic_root_digest: semanticRootDigest, authority_side: validated.authority_side,
      left: validated.left, right: validated.right, join: validated.join, transform: validated.transform,
      comparison: validated.comparison, null_policy_ref: validated.null_policy_ref,
      freshness: validated.freshness, basis: validated.basis
    });
    bind(validated.mapping_client_key, fieldCorrespondenceId);
    return { ...validated, field_correspondence_id: fieldCorrespondenceId };
  });
  const fieldIdByClientKey = new Map(fieldCorrespondences.map((row) => [row.mapping_client_key, row.field_correspondence_id]));

  const permissionCellByTarget = new Map((input.permissionCells ?? []).map((cell) => [
    canonicalV5Stringify({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key }), cell
  ]));
  const permissionAuxiliaryContracts = (artifact.permission_auxiliary_contracts ?? []).map((/** @type {Record<string,any>} */ contract) => {
    if (!exact(contract, ['contract_client_key', 'permission_target', 'payload', 'basis']) || !nonblank(contract.contract_client_key) || !object(contract.permission_target) || !exact(contract.permission_target, ['matrix_id', 'required_cell_key']) || !nonblank(contract.permission_target.matrix_id) || !nonblank(contract.permission_target.required_cell_key) || !object(contract.payload) || !nonempty(contract.basis)) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission auxiliary contract must be a closed, evidenced, same-cell contract.');
    const targetCell = permissionCellByTarget.get(canonicalV5Stringify(contract.permission_target));
    const contractKind = contract.payload.contract_kind;
    if (!targetCell || !['denial_behavior', 'data_scope'].includes(contractKind) || targetCell.permission_dimension !== contractKind) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission auxiliary target and contract kind must equal one advertised required cell.');
    let payload;
    if (contractKind === 'denial_behavior') {
      if (!exact(contract.payload, ['contract_kind', 'observation_ref', 'assertion', 'observation_window']) || ['transition', 'permission'].includes(contract.payload.assertion?.kind)) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Denial behavior must use one closed, non-transition, non-permission assertion.');
      const validated = validateOracleSemanticContract({
        oracle_contract_client_key: contract.contract_client_key,
        formal_test_point_id: targetCell.required_cell_key,
        observation_ref: contract.payload.observation_ref,
        assertion: contract.payload.assertion,
        evaluation_scope: { kind: 'single' },
        observation_window: contract.payload.observation_window,
        basis: contract.basis
      }, {
        semanticRootDigest, semanticRuleIndex,
        fieldCorrespondenceIds: artifact.field_correspondences.map((mapping) => mapping.mapping_client_key),
        permissionDecisionCells: []
      });
      const assertion = structuredClone(validated.assertion);
      if (assertion.kind === 'cross_surface_equals') {
        const stableFieldId = fieldIdByClientKey.get(assertion.field_correspondence_id);
        if (!stableFieldId) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Denial behavior cross-surface assertion must resolve a same-batch field correspondence.');
        assertion.field_correspondence_id = stableFieldId;
      }
      payload = { contract_kind: contractKind, observation_ref: validated.observation_ref, assertion, observation_window: validated.observation_window };
    } else {
      if (!exact(contract.payload, ['contract_kind', 'scope'])) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Data-scope auxiliary contract must contain only its typed population scope.');
      const validated = validatePopulationContract({ population_contract_client_key: contract.contract_client_key, scope: contract.payload.scope }, semanticRootDigest, acceptedContractRefs);
      payload = { contract_kind: contractKind, scope: validated.scope };
    }
    const permissionAuxiliaryContractId = stableV5Id('permission_auxiliary_contract', {
      input_semantic_root_digest: semanticRootDigest, contract_kind: contractKind,
      permission_target: contract.permission_target, payload, basis: contract.basis
    });
    acceptedContractRefs.add(typedContractRefKey({ contract_id: permissionAuxiliaryContractId, contract_kind: contractKind, semantic_root_digest: semanticRootDigest }));
    bind(contract.contract_client_key, permissionAuxiliaryContractId);
    return { ...structuredClone(contract), payload, permission_auxiliary_contract_id: permissionAuxiliaryContractId };
  });
  const auxiliaryByClientKey = new Map(permissionAuxiliaryContracts.map((contract) => [contract.contract_client_key, contract]));

  const auxiliaryBehaviorRefs = new Map();
  for (const review of artifact.behavior_contract_reviews ?? []) {
    if (review.disposition?.kind !== 'formal') continue;
    for (const clientKey of review.disposition.contract_client_keys ?? []) {
      if (!auxiliaryByClientKey.has(clientKey)) continue;
      auxiliaryBehaviorRefs.set(clientKey, (auxiliaryBehaviorRefs.get(clientKey) ?? 0) + 1);
    }
  }
  const auxiliaryPermissionRefs = new Map();
  const permissionMatrixReviews = structuredClone(artifact.permission_matrix_reviews ?? []);
  for (const review of permissionMatrixReviews) for (const row of review.cell_dispositions ?? []) {
    if (row.disposition?.kind !== 'formal') continue;
    const refField = row.disposition.outcome?.permission_dimension === 'denial_behavior' ? 'denial_contract_ref'
      : row.disposition.outcome?.permission_dimension === 'data_scope' ? 'data_scope_contract_ref' : null;
    if (!refField) continue;
    const ref = row.disposition.outcome[refField];
    if (ref?.kind !== 'same_behavior_batch') continue;
    const contract = auxiliaryByClientKey.get(ref.contract_client_key);
    const target = { matrix_id: review.matrix_id, required_cell_key: row.required_cell_key };
    if (!contract || ref.contract_kind !== contract.payload.contract_kind || canonicalV5Stringify(target) !== canonicalV5Stringify(contract.permission_target)) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Same-batch permission reference must resolve the exact auxiliary kind and target.');
    auxiliaryPermissionRefs.set(ref.contract_client_key, (auxiliaryPermissionRefs.get(ref.contract_client_key) ?? 0) + 1);
    row.disposition.outcome[refField] = { kind: 'accepted', ref: { contract_id: contract.permission_auxiliary_contract_id, contract_kind: contract.payload.contract_kind, semantic_root_digest: semanticRootDigest } };
  }
  for (const contract of permissionAuxiliaryContracts) {
    if (auxiliaryBehaviorRefs.get(contract.contract_client_key) !== 1 || auxiliaryPermissionRefs.get(contract.contract_client_key) !== 1) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Every permission auxiliary contract needs exactly one matching Behavior review and Permission cell review.');
  }
  const permissionDispositionByTarget = new Map();
  for (const review of permissionMatrixReviews) for (const row of review.cell_dispositions ?? []) {
    permissionDispositionByTarget.set(canonicalV5Stringify({ matrix_id: review.matrix_id, required_cell_key: row.required_cell_key }), row.disposition);
  }
  const reviewedPermissionCells = (input.permissionCells ?? []).map((cell) => {
    const disposition = permissionDispositionByTarget.get(canonicalV5Stringify({ matrix_id: cell.matrix_id, required_cell_key: cell.required_cell_key }));
    return { ...structuredClone(cell), ...(disposition?.kind === 'formal' ? { formal_outcome: structuredClone(disposition.outcome) } : {}) };
  });

  const predicateContracts = artifact.predicate_contracts.map((/** @type {Record<string,any>} */ contract) => {
    if (!exact(contract, ['predicate_contract_client_key', 'predicate_ref', 'mutual_exclusion_group', 'exhaustiveness', 'basis']) || !nonblank(contract.predicate_contract_client_key) || !object(contract.predicate_ref) || !exact(contract.predicate_ref, ['contract_id', 'contract_kind', 'semantic_root_digest']) || !nonblank(contract.predicate_ref.contract_id) || contract.predicate_ref.contract_kind !== 'domain_predicate' || contract.predicate_ref.semantic_root_digest !== semanticRootDigest || !acceptedContractRefs.has(typedContractRefKey(contract.predicate_ref)) || !nonblank(contract.mutual_exclusion_group) || !['closed_partition_set', 'non_exhaustive_open_set'].includes(contract.exhaustiveness) || !nonempty(contract.basis)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Predicate contract must resolve to the advertised current-root accepted inventory.');
    const predicateContractId = stableV5Id('predicate_contract', {
      input_semantic_root_digest: semanticRootDigest, predicate_ref: contract.predicate_ref,
      mutual_exclusion_group: contract.mutual_exclusion_group, exhaustiveness: contract.exhaustiveness, basis: contract.basis
    });
    bind(contract.predicate_contract_client_key, predicateContractId);
    return { ...structuredClone(contract), predicate_contract_id: predicateContractId };
  });

  const domains = artifact.domain_contracts.map((/** @type {Record<string,any>} */ contract) => {
    const compiled = compileDomain(semanticRootDigest, contract, artifact.predicate_contracts, acceptedContractRefs);
    bind(compiled.domain_client_key, compiled.domain_contract_id);
    for (const partition of compiled.partitions) bind(partition.partition_client_key, partition.partition_id);
    return compiled;
  });

  const populations = artifact.population_contracts.map((/** @type {Record<string,any>} */ contract) => {
    const validated = validatePopulationContract(contract, semanticRootDigest, acceptedContractRefs);
    const populationContractId = stableV5Id('population_contract', { input_semantic_root_digest: semanticRootDigest, scope: validated.scope });
    bind(validated.population_contract_client_key, populationContractId);
    return { ...validated, population_contract_id: populationContractId };
  });
  const populationIdByClientKey = new Map(populations.map((row) => [row.population_contract_client_key, row.population_contract_id]));
  const populationProofs = artifact.population_proofs.map((/** @type {Record<string,any>} */ proof) => {
    const validated = validatePopulationProof(proof, semanticRootDigest, artifact.population_contracts.map((/** @type {Record<string,any>} */ row) => row.population_contract_client_key), acceptedContractRefs);
    const populationContractId = populationIdByClientKey.get(validated.population_contract_client_key);
    if (!populationContractId) throw new V5ProtocolError('POPULATION_CONTRACT_REQUIRED', 'Population proof references an unknown same-batch population.');
    const basis = validated.payload.kind === 'enumerate_population' ? [] : validated.basis;
    const populationProofId = stableV5Id('population_proof', { input_semantic_root_digest: semanticRootDigest, population_contract_id: populationContractId, payload: validated.payload, basis });
    bind(validated.proof_client_key, populationProofId);
    return { ...validated, population_contract_id: populationContractId, population_proof_id: populationProofId };
  });
  const populationProofIdByClientKey = new Map(populationProofs.map((row) => [row.proof_client_key, row.population_proof_id]));

  const oracleSemanticContracts = artifact.oracle_semantic_contracts.map((/** @type {Record<string,any>} */ contract) => {
    const candidate = structuredClone(contract);
    const denial = candidate.assertion?.kind === 'permission' && candidate.assertion.expected === 'deny' && candidate.assertion.denial_behavior?.kind === 'required'
      ? candidate.assertion.denial_behavior : null;
    if (denial?.denial_contract_ref?.kind === 'same_behavior_batch') {
      const auxiliary = auxiliaryByClientKey.get(denial.denial_contract_ref.contract_client_key);
      const expectedTarget = { matrix_id: candidate.assertion.decision_cell_ref?.matrix_id, required_cell_key: denial.denial_required_cell_key };
      if (!auxiliary || denial.denial_contract_ref.contract_kind !== 'denial_behavior' || auxiliary.payload.contract_kind !== 'denial_behavior' || canonicalV5Stringify(auxiliary.permission_target) !== canonicalV5Stringify(expectedTarget)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Oracle denial Behavior ref must resolve the exact same-batch auxiliary target.');
      denial.denial_contract_ref = { kind: 'accepted', ref: { contract_id: auxiliary.permission_auxiliary_contract_id, contract_kind: 'denial_behavior', semantic_root_digest: semanticRootDigest } };
    }
    const validated = validateOracleSemanticContract(candidate, {
      semanticRootDigest, semanticRuleIndex,
      fieldCorrespondenceIds: artifact.field_correspondences.map((/** @type {Record<string,any>} */ mapping) => mapping.mapping_client_key),
      permissionCells: reviewedPermissionCells,
      acceptedContractRefs
    });
    const assertion = structuredClone(validated.assertion);
    if (assertion.kind === 'cross_surface_equals') {
      const stableFieldId = fieldIdByClientKey.get(assertion.field_correspondence_id);
      if (!stableFieldId) throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', 'Cross-surface Oracle must reference a same-batch FieldCorrespondence client key.');
      assertion.field_correspondence_id = stableFieldId;
    }
    const evaluationScope = validated.evaluation_scope.kind === 'single' ? { kind: 'single' } : {
      kind: 'forall',
      population_contract_id: populationIdByClientKey.get(validated.evaluation_scope.population_contract_client_key),
      population_proof_id: populationProofIdByClientKey.get(validated.evaluation_scope.population_proof_client_key)
    };
    if (evaluationScope.kind === 'forall' && (!evaluationScope.population_contract_id || !evaluationScope.population_proof_id)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Forall Oracle must resolve same-batch Population and Proof client keys.');
    const oracleSemanticContractId = stableV5Id('oracle_semantic_contract', {
      input_semantic_root_digest: semanticRootDigest, formal_test_point_id: validated.formal_test_point_id,
      observation_ref: validated.observation_ref, assertion, evaluation_scope: evaluationScope,
      observation_window: validated.observation_window, basis: validated.basis
    });
    bind(validated.oracle_contract_client_key, oracleSemanticContractId);
    return { ...validated, assertion, evaluation_scope: evaluationScope, oracle_semantic_contract_id: oracleSemanticContractId };
  });
  const oracleIdByClientKey = new Map(oracleSemanticContracts.map((row) => [row.oracle_contract_client_key, row.oracle_semantic_contract_id]));

  const behaviorEquivalenceContracts = artifact.behavior_equivalence_contracts.map((/** @type {Record<string,any>} */ contract) => {
    if (!exact(contract, ['equivalence_contract_client_key', 'domain_contract_client_key', 'partition_client_key', 'formal_test_point_id', 'oracle_semantic_contract_client_key', 'equivalence_scope', 'basis']) || !nonblank(contract.equivalence_contract_client_key) || !nonblank(contract.formal_test_point_id) || contract.equivalence_scope !== 'all_members_same_observable_behavior' || !nonempty(contract.basis)) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Behavior equivalence contract is incomplete.');
    const domain = domains.find((row) => row.domain_client_key === contract.domain_contract_client_key);
    const partition = domain?.partitions.find((row) => row.partition_client_key === contract.partition_client_key);
    const oracleSemanticContractId = oracleIdByClientKey.get(contract.oracle_semantic_contract_client_key);
    if (!domain || !partition || !oracleSemanticContractId) throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', 'Behavior equivalence references are not closed within the same Behavior batch.');
    const behaviorEquivalenceContractId = stableV5Id('behavior_equivalence_contract', {
      input_semantic_root_digest: semanticRootDigest, domain_contract_id: domain.domain_contract_id,
      partition_id: partition.partition_id, formal_test_point_id: contract.formal_test_point_id,
      oracle_semantic_contract_id: oracleSemanticContractId, equivalence_scope: contract.equivalence_scope, basis: contract.basis
    });
    bind(contract.equivalence_contract_client_key, behaviorEquivalenceContractId);
    return { ...structuredClone(contract), domain_contract_id: domain.domain_contract_id, partition_id: partition.partition_id, oracle_semantic_contract_id: oracleSemanticContractId, behavior_equivalence_contract_id: behaviorEquivalenceContractId };
  });

  for (const review of artifact.risk_reviews) {
    const riskReviewId = stableV5Id('risk_review', { input_semantic_root_digest: semanticRootDigest, module_ref: review.module_ref, risk_kind: review.risk_kind });
    bind(review.review_client_key, riskReviewId);
  }

  return {
    field_correspondences: fieldCorrespondences, predicate_contracts: predicateContracts,
    domain_contracts: domains, behavior_equivalence_contracts: behaviorEquivalenceContracts,
    population_contracts: populations, population_proofs: populationProofs,
    permission_auxiliary_contracts: permissionAuxiliaryContracts,
    permission_matrix_reviews: permissionMatrixReviews,
    oracle_semantic_contracts: oracleSemanticContracts,
    client_key_bindings: bindings.sort((left, right) => left.client_key.localeCompare(right.client_key))
  };
}

/** @param {Array<{client_key:string,stable_id:string}>} bindings */
export function assertUniqueBehaviorBindings(bindings) {
  const keys = bindings.map((binding) => binding.client_key);
  if (new Set(keys).size !== keys.length) throw new V5ProtocolError('CLIENT_KEY_INVALID', `Behavior client-key binding collision: ${canonicalV5Stringify(keys)}.`);
  return bindings;
}
