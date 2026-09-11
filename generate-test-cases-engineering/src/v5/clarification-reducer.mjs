import { canonicalV5Stringify } from './canonical-v5.mjs';
import { minimalOriginFromRaw } from './clarification-parser.mjs';
import { verifyClarificationPreviewDigest } from './clarification-preview.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { applyQuestionPartTransitions, validateQuestionPartStateSet } from './question-parts.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

/** @param {Record<string,any>} decisionWithoutDigest */
function decisionDigest(decisionWithoutDigest) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/clarification-decision-record', format_version: 1, record: decisionWithoutDigest });
}

/** @param {Record<string,any>} pending @param {Record<string,any>} preview @param {Record<string,any>} current */
function verifyCurrent(pending, preview, current) {
  verifyClarificationPreviewDigest(preview);
  if (pending.status !== 'pending' || pending.preview_digest !== preview.preview_digest || pending.presentation_id !== preview.presentation_id || pending.presentation_digest !== preview.presentation_digest || pending.semantic_root_digest !== preview.semantic_root_digest || pending.base_question_part_state_set_digest !== preview.question_part_state_set_digest || pending.source_revision !== preview.source_revision || pending.base_checkpoint_digest !== current.checkpoint_digest || pending.semantic_root_digest !== current.semantic_root_digest || pending.presentation_digest !== current.presentation_digest || pending.base_question_part_state_set_digest !== current.question_part_state_set_digest || pending.source_revision !== current.source_revision || canonicalV5Stringify(pending.deterministic_projection) !== canonicalV5Stringify(preview.deterministic_projection) || canonicalV5Stringify(pending.unknown_future_effects) !== canonicalV5Stringify(preview.unknown_future_effects)) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Pending clarification no longer binds the current preview, root, state set, source revision, and checkpoint.');
  const unitKeys = pending.canonical_units.map((/** @type {Record<string,any>} */ unit) => unit.unit_client_key).sort();
  const bindingKeys = preview.bindings.map((/** @type {Record<string,any>} */ binding) => binding.unit_client_key).sort();
  if (canonicalV5Stringify(unitKeys) !== canonicalV5Stringify(bindingKeys)) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Pending units do not match preview bindings.');
}

/** @param {string} raw @param {{start_scalar:number,end_scalar:number}} range @param {Record<string,any>} registry */
function confirmationOrigin(raw, range, registry) {
  let origin;
  try { origin = minimalOriginFromRaw(raw, range); } catch { throw new V5ProtocolError('CLARIFICATION_CONFIRMATION_INVALID', 'Confirmation range is invalid.'); }
  const scalars = [...raw];
  const outside = `${scalars.slice(0, range.start_scalar).join('')}${scalars.slice(range.end_scalar).join('')}`;
  const token = origin.excerpt.trim();
  if (outside.trim().length > 0 || !registry.confirmation_tokens.includes(token)) throw new V5ProtocolError('CLARIFICATION_CONFIRMATION_INVALID', 'Confirmation must be exactly one registered token with whitespace only outside its range.');
  if (origin.excerpt !== token) throw new V5ProtocolError('CLARIFICATION_CONFIRMATION_INVALID', 'Confirmation range must tightly select the registered token.');
  return origin;
}

/**
 * Revalidate and commit exactly one pending preview projection.
 * @param {{pending:Record<string,any>,preview:Record<string,any>,state_set:Record<string,any>,raw_confirmation:string,confirmation_range:{start_scalar:number,end_scalar:number},control_registry:Record<string,any>,current:Record<string,any>}} input
 */
export function commitClarificationResponse(input) {
  validateQuestionPartStateSet(input.state_set);
  verifyCurrent(input.pending, input.preview, input.current);
  if (input.state_set.state_set_digest !== input.pending.base_question_part_state_set_digest) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Question Part state changed after preview.');
  const confirmOrigin = confirmationOrigin(input.raw_confirmation, input.confirmation_range, input.control_registry);
  const bindingByKey = new Map(input.preview.bindings.map((/** @type {Record<string,any>} */ binding) => [binding.unit_client_key, binding]));
  for (const unit of input.pending.canonical_units) {
    const binding = bindingByKey.get(unit.unit_client_key);
    if (!binding || unit.target.question_part_id !== binding.question_part_id || unit.target.display_token !== binding.display_token || unit.action !== binding.action || canonicalV5Stringify(unit.origin) !== canonicalV5Stringify(binding.origin) || canonicalV5Stringify(unit.answer ?? null) !== canonicalV5Stringify(binding.answer ?? null)) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Pending unit was not the unit shown in preview.');
  }
  const decisions = /** @type {Array<Record<string,any>>} */ (input.pending.decision_proposals.map((/** @type {Record<string,any>} */ proposal) => {
    const decisionId = stableV5Id('clarification_decision', {
      case_document_lineage_id: proposal.case_document_lineage_id,
      input_semantic_root_digest: input.pending.semantic_root_digest,
      gap_binding: proposal.gap_binding,
      target: proposal.target,
      answer_contract_digest: proposal.answer_contract_digest,
      answer_value_digest: proposal.answer_value_digest,
      evidence_level: proposal.evidence_level
    });
    const payload = {
      kind: 'clarification_decision', schema_version: '5.0.0', decision_id: decisionId,
      case_document_lineage_id: proposal.case_document_lineage_id,
      input_semantic_root_digest: input.pending.semantic_root_digest,
      question_part_id: proposal.question_part_id,
      gap_binding: structuredClone(proposal.gap_binding), target: structuredClone(proposal.target),
      answer_contract_digest: proposal.answer_contract_digest,
      answer_value: structuredClone(proposal.answer_value), answer_value_digest: proposal.answer_value_digest,
      evidence_level: proposal.evidence_level, answer_origin: structuredClone(proposal.origin),
      temporary_basis: proposal.evidence_level === 'E1' ? structuredClone(proposal.temporary_basis) : null,
      presentation_digest: input.pending.presentation_digest, preview_digest: input.pending.preview_digest,
      confirmation_origin: structuredClone(confirmOrigin)
    };
    if ((proposal.evidence_level === 'E1') !== Boolean(proposal.temporary_basis)) throw new V5ProtocolError('TEMPORARY_BASIS_REQUIRED', 'Decision evidence level and temporary basis are inconsistent.');
    return { ...payload, decision_digest: decisionDigest(payload) };
  })).sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  const decisionByPart = new Map(decisions.map((/** @type {Record<string,any>} */ decision) => [decision.question_part_id, decision]));
  const beforeGraphDigest = canonicalObjectDigest({ semantic_root_digest: input.pending.semantic_root_digest, question_part_state_set_digest: input.state_set.state_set_digest });
  const afterGraphDigest = canonicalObjectDigest({ before_graph_digest: beforeGraphDigest, preview_digest: input.pending.preview_digest, decision_ids: decisions.map((/** @type {Record<string,any>} */ decision) => decision.decision_id), deterministic_projection: input.pending.deterministic_projection });
  const impact = {
    preview_digest: input.pending.preview_digest,
    decision_ids: decisions.map((/** @type {Record<string,any>} */ decision) => decision.decision_id),
    before_graph_digest: beforeGraphDigest,
    after_graph_digest: afterGraphDigest,
    actual_projection: structuredClone(input.pending.deterministic_projection)
  };
  if (canonicalV5Stringify(impact.actual_projection) !== canonicalV5Stringify(input.preview.deterministic_projection)) throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Committed impact differs from the confirmed preview.');
  const impactDigest = canonicalObjectDigest(impact);
  const changes = input.pending.canonical_units.map((/** @type {Record<string,any>} */ unit) => {
    const decision = decisionByPart.get(unit.target.question_part_id);
    if (unit.action === 'answer') {
      if (!decision) throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Answer unit has no exact Decision proposal.');
      return { question_part_id: unit.target.question_part_id, to_state: unit.answer.nature === 'final' ? 'resolved_final' : 'resolved_temporary', cause: { kind: 'answer', decision_id: decision.decision_id, evidence_level: decision.evidence_level, answer_value_digest: decision.answer_value_digest, applied_clarification_impact_digest: impactDigest } };
    }
    return { question_part_id: unit.target.question_part_id, to_state: unit.action === 'defer' ? 'deferred_by_user' : unit.action === 'unknown' ? 'unknown_by_user' : 'closed_for_delivery', cause: { kind: 'control', action: unit.action, control_origin: structuredClone(unit.origin), preview_digest: input.pending.preview_digest, applied_clarification_impact_digest: impactDigest } };
  });
  const nextStateSet = applyQuestionPartTransitions(input.state_set, changes, afterGraphDigest);
  return { decisions, impact, next_state_set: nextStateSet, semantic_revision_delta: 1, pending_status: 'committed' };
}

/** @param {Record<string,any>} pending */
export function discardPendingClarification(pending) {
  if (pending.status === 'superseded') return structuredClone(pending);
  if (pending.status !== 'pending') throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Only the current pending preview can be discarded.');
  return { ...structuredClone(pending), status: 'superseded' };
}
