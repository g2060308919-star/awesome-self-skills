import { compareUnicodeScalar } from './semantic-gaps-v4.mjs';
import { isGeneralQualityV4Contract } from './v4-contract.mjs';

const CRITICAL_CRITERIA = new Set([
  'changes_core_acceptance',
  'changes_required_branch',
  'makes_required_result_undecidable'
]);
const NONCRITICAL_CRITERIA = new Set(['does_not_change_required_acceptance']);

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {any} root */
export function validateAcceptanceImpactV4(root) {
  const impact = record(root?.acceptance_impact) ? root.acceptance_impact : null;
  if (!impact || !['critical', 'noncritical'].includes(impact.classification)
    || !Array.isArray(impact.criteria) || impact.criteria.length === 0
    || new Set(impact.criteria).size !== impact.criteria.length
    || typeof impact.rationale !== 'string' || !impact.rationale.normalize('NFC').trim()) {
    throw new TypeError('SEMANTIC_IMPACT_REQUIRED');
  }
  const allowed = impact.classification === 'critical' ? CRITICAL_CRITERIA : NONCRITICAL_CRITERIA;
  if (impact.criteria.some((/** @type {unknown} */ criterion) => typeof criterion !== 'string' || !allowed.has(criterion))) {
    throw new TypeError('SEMANTIC_IMPACT_INVALID');
  }
  return {
    classification: impact.classification,
    criteria: [...impact.criteria].sort(compareUnicodeScalar),
    rationale: impact.rationale.normalize('NFC').trim()
  };
}

/** @param {any} root @param {any[]} decisions */
function finalBasis(root, decisions) {
  for (const decision of decisions) {
    if (!record(decision)) continue;
    const target = record(decision.target) ? decision.target : decision;
    if (target.root_issue_id !== root.root_issue_id
      || target.root_version_digest !== root.root_version_digest) continue;
    if (decision.resolution === 'final' && decision.evidence_level === 'E3'
      && decision.authority === 'product_final') return 'final_e3_decision';
    if (decision.resolution_kind === 'derived_e2' && decision.evidence_level === 'E2'
      && decision.replayable === true && Array.isArray(decision.source_claim_ids)
      && decision.source_claim_ids.length > 0) return 'replayable_e2_derivation';
    if (['evidence_not_applicable', 'evidence_obsolete'].includes(decision.resolution_kind)
      && ['E2', 'E3'].includes(decision.evidence_level) && decision.replayable === true
      && Array.isArray(decision.source_claim_ids) && decision.source_claim_ids.length > 0) {
      return decision.resolution_kind;
    }
  }
  return null;
}

/**
 * Compiler-owned final semantic gate. `risk_level` is deliberately ignored:
 * acceptance impact and a current, auditable final basis are the only inputs
 * that can release a critical root for formal Case Document materialization.
 *
 * @param {{contract:unknown,roots:unknown,rootStates:unknown,decisions?:unknown}} input
 */
export function deriveSemanticDeliveryGateV4(input) {
  if (!record(input) || !Array.isArray(input.roots) || !Array.isArray(input.rootStates)
    || (input.decisions !== undefined && !Array.isArray(input.decisions))) {
    throw new TypeError('SEMANTIC_DELIVERY_GATE_INPUT_INVALID');
  }
  if (!isGeneralQualityV4Contract(input.contract)) {
    return {
      can_materialize_formal_case_document: true,
      unresolved_critical_root_ids: [],
      resolved_critical_roots: [],
      stale_root_state_ids: []
    };
  }
  const states = new Map();
  for (const state of input.rootStates) {
    if (!record(state) || typeof state.root_issue_id !== 'string' || states.has(state.root_issue_id)) {
      throw new TypeError('SEMANTIC_ROOT_STATE_INVALID');
    }
    states.set(state.root_issue_id, state);
  }
  const unresolved = [];
  const resolved = [];
  const stale = [];
  for (const root of input.roots) {
    if (!record(root) || typeof root.root_issue_id !== 'string'
      || typeof root.root_version_digest !== 'string') throw new TypeError('SEMANTIC_ROOT_INVALID');
    const impact = validateAcceptanceImpactV4(root);
    if (impact.classification !== 'critical') continue;
    const state = states.get(root.root_issue_id);
    if (!state || state.root_version_digest !== root.root_version_digest) {
      stale.push(root.root_issue_id);
      unresolved.push(root.root_issue_id);
      continue;
    }
    const basisKind = finalBasis(root, /** @type {any[]} */ (input.decisions ?? []));
    const statusAllowsFinal = state.status === 'resolved_final'
      || (state.status === 'obsolete' && ['evidence_not_applicable', 'evidence_obsolete'].includes(basisKind));
    if (!statusAllowsFinal || basisKind === null) {
      unresolved.push(root.root_issue_id);
      continue;
    }
    resolved.push({
      root_issue_id: root.root_issue_id,
      root_version_digest: root.root_version_digest,
      basis_kind: basisKind
    });
  }
  unresolved.sort(compareUnicodeScalar);
  resolved.sort((left, right) => compareUnicodeScalar(left.root_issue_id, right.root_issue_id));
  stale.sort(compareUnicodeScalar);
  return {
    can_materialize_formal_case_document: unresolved.length === 0,
    unresolved_critical_root_ids: unresolved,
    resolved_critical_roots: resolved,
    stale_root_state_ids: stale
  };
}

/** @param {any} root @param {any} state */
export function availableSemanticActionsV4(root, state) {
  const impact = validateAcceptanceImpactV4(root);
  if (impact.classification !== 'critical') {
    return state?.status === 'presented'
      ? ['answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery']
      : ['answer_question_part'];
  }
  if (state?.status === 'resolved_final' || state?.status === 'obsolete') return [];
  return state?.status === 'presented'
    ? ['answer_question_part', 'defer_question_part', 'mark_question_unknown']
    : ['answer_question_part'];
}

/** @param {any} root @param {any} state */
export function requiresRecoverableCriticalQuestionV4(root, state) {
  try {
    return validateAcceptanceImpactV4(root).classification === 'critical'
      && !['resolved_final', 'obsolete'].includes(state?.status);
  } catch {
    return false;
  }
}

/**
 * Recheck the compiler-owned 4.3 canonical root ledger at the materialization
 * boundary. This does not replace source/Decision validation in the pipeline;
 * it prevents a stale or partially prepared bundle from becoming authoritative.
 * @param {unknown} submittedBundle
 */
export function assertSemanticBundleDeliveryGateV4(submittedBundle) {
  if (!record(submittedBundle) || !isGeneralQualityV4Contract(submittedBundle)) return;
  if (!Array.isArray(submittedBundle.semantic_root_groups)) {
    throw new TypeError('SEMANTIC_DELIVERY_GATE_INPUT_INVALID');
  }
  for (const root of submittedBundle.semantic_root_groups) {
    const impact = validateAcceptanceImpactV4(root);
    if (impact.classification !== 'critical') continue;
    const basis = record(root.critical_resolution_basis) ? root.critical_resolution_basis : null;
    const basisMatches = basis
      && basis.root_issue_id === root.root_issue_id
      && basis.root_version_digest === root.root_version_digest
      && ['final_e3_decision', 'replayable_e2_derivation', 'evidence_not_applicable', 'evidence_obsolete']
        .includes(basis.basis_kind);
    const statusMatches = root.status === 'resolved_final'
      || (root.status === 'obsolete'
        && ['evidence_not_applicable', 'evidence_obsolete'].includes(basis?.basis_kind));
    if (!basisMatches || !statusMatches) throw new TypeError('CRITICAL_SEMANTIC_GAPS_REMAIN');
  }
}
