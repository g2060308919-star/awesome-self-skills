/** The overlay replaces target Facts and supersedes their prior Claims. Readonly
 * source_claim_ids are deliberately absent from this write set.
 * @param {any[]} facts @param {any[]} claims @param {any[]} roots */
export function assertClarificationWriteTargetsV4(facts, claims, roots) {
  const factById = new Map(facts.map(fact => [fact.fact_id, fact]));
  const claimById = new Map(claims.map(claim => [claim.claim_id, claim]));
  const factOwners = new Map(); const claimOwners = new Map();
  /** @param {string} code @param {string[]} rootIds @param {string[]} factIds @param {string[]} [claimIds] */
  const failure = (code, rootIds, factIds, claimIds = []) => new ClarificationTargetErrorV4(code, {
    root_issue_ids: [...new Set(rootIds)].sort(),
    facts: [...new Set(factIds)].sort().map(id => ({ fact_id: id, status: factById.get(id)?.status ?? 'missing' })),
    claim_ids: [...new Set(claimIds)].sort()
  });
  /** @param {string} id */
  const factsUsing = id => facts.filter(fact => (fact.claim_ids ?? [fact.claim_id]).includes(id)).map(fact => fact.fact_id);
  for (const root of [...roots].sort((a, b) => a.root_issue_id.localeCompare(b.root_issue_id))) {
    const targets = new Set(root.subject_fact_ids);
    const groups = new Map();
    for (const id of [...targets].sort()) {
      const fact = factById.get(id);
      if (!fact) throw failure('CLARIFICATION_TARGET_FACT_UNKNOWN', [root.root_issue_id], [id]);
      if (!['ambiguous', 'conflicted'].includes(fact.status)) {
        throw failure('CLARIFICATION_TARGET_FACT_NOT_AMBIGUOUS', [root.root_issue_id], [id]);
      }
      if (factOwners.has(id) && factOwners.get(id) !== root.root_issue_id) {
        throw failure('CLARIFICATION_WRITE_FACT_SHARED', [factOwners.get(id), root.root_issue_id], [id]);
      }
      factOwners.set(id, root.root_issue_id);
      const ids = [...new Set(fact.claim_ids ?? [fact.claim_id])].sort();
      if (!ids.length || ids.some(id => !claimById.has(id))) {
        throw failure('CLARIFICATION_TARGET_CLAIM_UNKNOWN', [root.root_issue_id], [id], ids);
      }
      groups.set(JSON.stringify(ids), ids);
    }
    const localClaims = new Set();
    for (const ids of groups.values()) for (const id of ids) {
      if (localClaims.has(id)) throw failure('CLARIFICATION_WRITE_CLAIM_PARTIAL_OVERLAP', [root.root_issue_id], factsUsing(id), [id]);
      localClaims.add(id);
      if (claimOwners.has(id) && claimOwners.get(id) !== root.root_issue_id) {
        throw failure('CLARIFICATION_WRITE_CLAIM_SHARED', [claimOwners.get(id), root.root_issue_id], factsUsing(id), [id]);
      }
      claimOwners.set(id, root.root_issue_id);
    }
  }
  // Run after cross-root checks so the same invalid batch has one deterministic
  // diagnostic, independent of Agent/root/answer order.
  for (const [id, owner] of claimOwners) for (const fact of facts) {
    if ((fact.claim_ids ?? [fact.claim_id]).includes(id)
      && fact.status !== 'obsolete' && factOwners.get(fact.fact_id) !== owner) {
      throw failure('CLARIFICATION_WRITE_NON_TARGET_FACT', [owner], factsUsing(id), [id]);
    }
  }
}

/** Validate the effective presentation, not the raw diagnostic ledger. Resolved
 * temporary roots remain visible for the existing final-authority gate; their
 * accepted Decisions are not new pending writes. Actual new answers are always
 * checked again at ingress, including historical presentations.
 * @param {any} checkpoint @param {any} evidence @param {any[]|null} [events] @param {any[]} [acceptedEvents] */
export function assertCheckpointAnswerTargetsV4(checkpoint, evidence, events = null, acceptedEvents = []) {
  if (checkpoint.schema_version !== '4.3.3') return;
  const accepted = new Set(acceptedEvents.map(event => canonicalStringify(event)));
  const selected = events === null
    ? new Set((checkpoint.clarification_state.presentation?.question_parts ?? [])
      .filter((/** @type {any} */ part) => part.available_actions.includes('answer_question_part'))
      .filter((/** @type {any} */ part) => !checkpoint.clarification_state.root_states.some(
        (/** @type {any} */ state) => state.root_issue_id === part.root_issue_id
          && ['resolved_final', 'resolved_temporary'].includes(state.status)))
      .map((/** @type {any} */ part) => part.root_issue_id))
    : new Set(events.filter(event => event.event_type === 'answer_question_part')
      .filter(event => !accepted.has(canonicalStringify(event)))
      .filter(event => checkpoint.clarification_state.root_states.some((/** @type {any} */ state) =>
        state.root_issue_id === event.root_issue_id && state.root_version_digest === event.root_version_digest
        && state.question_part_id === event.question_part_id
        && (state.status === 'presented' || requiresRecoverableCriticalQuestionV4(
          checkpoint.semantic_gap_ledger.find((/** @type {any} */ root) => root.root_issue_id === state.root_issue_id), state))))
      .map(event => event.root_issue_id));
  assertClarificationWriteTargetsV4(evidence.fact_ledger, evidence.claims,
    checkpoint.semantic_gap_ledger.filter((/** @type {any} */ root) => selected.has(root.root_issue_id)));
}
import { canonicalStringify } from './canonical.mjs';
import { requiresRecoverableCriticalQuestionV4 } from './semantic-delivery-gate-v4.mjs';

class ClarificationTargetErrorV4 extends TypeError {
  /** @param {string} code @param {any} details */
  constructor(code, details) {
    super(code);
    this.diagnostic = { category: 'traceability', code, path: '/semantic_gaps',
      message: `Repair clarification write targets without changing known facts: ${JSON.stringify(details)}.` };
  }
}

/** Keep target identities in the existing diagnostic shape, without adding public fields.
 * @param {unknown} error */
export function clarificationTargetDiagnosticV4(error) {
  return error instanceof ClarificationTargetErrorV4 ? error.diagnostic : {
    category: 'traceability', code: error instanceof Error ? error.message : 'CLARIFICATION_TARGET_INVALID',
    path: '/semantic_gaps', message: 'Repair clarification write ownership before submitting answers.'
  };
}
