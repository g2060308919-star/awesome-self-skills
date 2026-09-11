import { canonicalV5Stringify } from './canonical-v5.mjs';
import { answerValueDigest, validateAndBindResponseUnits } from './clarification-parser.mjs';
import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';
import { validateQuestionPartStateSet } from './question-parts.mjs';

/** @param {Record<string,any>} previewWithoutDigest */
function previewDigest(previewWithoutDigest) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/clarification-preview', format_version: 1, preview: previewWithoutDigest });
}

/** @param {Record<string,any>} unit */
function proposedUnit(unit) {
  const { evidence_level: ignored, ...payload } = unit;
  return structuredClone(payload);
}

/** @param {Record<string,any>} unit */
function previewBinding(unit) {
  return {
    unit_client_key: unit.unit_client_key,
    ...(unit.shared_origin_group_id ? { shared_origin_group_id: unit.shared_origin_group_id } : {}),
    question_part_id: unit.target.question_part_id,
    display_token: unit.target.display_token,
    action: unit.action,
    origin: structuredClone(unit.origin),
    ...(unit.answer ? { answer: structuredClone(unit.answer) } : {})
  };
}

/** @param {Array<Record<string,any>>} bound @param {Record<string,any>} stateSet @param {Map<string,Record<string,any>>} gapByPart */
function defaultProjection(bound, stateSet, gapByPart) {
  const stateById = new Map(stateSet.parts.map((/** @type {Record<string,any>} */ part) => [part.question_part_id, part.current_state]));
  const targetState = (/** @type {Record<string,any>} */ unit) => unit.action === 'answer' ? (unit.answer.nature === 'final' ? 'resolved_final' : 'resolved_temporary') : unit.action === 'defer' ? 'deferred_by_user' : unit.action === 'unknown' ? 'unknown_by_user' : 'closed_for_delivery';
  return {
    resolved_gap_ids: bound.filter((unit) => unit.action === 'answer').map((unit) => {
      const gap = gapByPart.get(unit.target.question_part_id);
      if (!gap) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Projection references an unknown gap.');
      return gap.gap_binding.gap_id;
    }).sort(),
    invalidated_artifact_ids: [],
    semantic_changes: [],
    status_changes: bound.map((unit) => ({ ref: unit.target.question_part_id, from: stateById.get(unit.target.question_part_id), to: targetState(unit) })).sort((left, right) => left.ref.localeCompare(right.ref)),
    coverage_changes: [],
    no_semantic_change: false
  };
}

/**
 * @param {{preview:Record<string,any>,canonical_units:Array<Record<string,any>>,decision_proposals:Array<Record<string,any>>,base_checkpoint_digest:string}} input
 */
export function createPendingClarificationCommit(input) {
  const { preview, canonical_units: units, decision_proposals: proposals } = input;
  const fail = () => { throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Pending clarification must be an exact replay of its preview and canonical units.'); };
  if (!preview || typeof preview.preview_digest !== 'string' || !Array.isArray(preview.bindings) || !Array.isArray(units) || !Array.isArray(proposals)) return fail();
  const unitKeys = units.map((unit) => unit.unit_client_key).sort();
  const bindingKeys = preview.bindings.map((/** @type {Record<string,any>} */ binding) => binding.unit_client_key).sort();
  if (new Set(unitKeys).size !== unitKeys.length || canonicalV5Stringify(unitKeys) !== canonicalV5Stringify(bindingKeys)) return fail();
  for (const unit of units) {
    const binding = preview.bindings.find((/** @type {Record<string,any>} */ item) => item.unit_client_key === unit.unit_client_key);
    if (!binding || canonicalV5Stringify(previewBinding(unit)) !== canonicalV5Stringify(binding)) return fail();
  }
  const answerPartIds = units.filter((unit) => unit.action === 'answer').map((unit) => unit.target.question_part_id).sort();
  const proposalPartIds = proposals.map((proposal) => proposal.question_part_id).sort();
  if (canonicalV5Stringify(answerPartIds) !== canonicalV5Stringify(proposalPartIds)) return fail();
  return {
    status: 'pending',
    preview_digest: preview.preview_digest,
    presentation_id: preview.presentation_id,
    presentation_digest: preview.presentation_digest,
    semantic_root_digest: preview.semantic_root_digest,
    base_question_part_state_set_digest: preview.question_part_state_set_digest,
    source_revision: preview.source_revision,
    base_checkpoint_digest: input.base_checkpoint_digest,
    canonical_units: units.map(proposedUnit).sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key)),
    decision_proposals: structuredClone(proposals).sort((left, right) => left.question_part_id.localeCompare(right.question_part_id)),
    deterministic_projection: structuredClone(preview.deterministic_projection),
    unknown_future_effects: structuredClone(preview.unknown_future_effects)
  };
}

/**
 * Validate and speculatively compile one clarification response without mutating semantic state.
 * @param {{raw_response:string,presentation:Record<string,any>,state_set:Record<string,any>,gaps:Array<Record<string,any>>,units:Array<Record<string,any>>,control_registry:Record<string,any>,answer_registry:Record<string,any>,base_checkpoint_digest:string,projection?:Record<string,any>,unknown_future_effects?:string[]}} input
 */
export function previewClarificationResponse(input) {
  validateQuestionPartStateSet(input.state_set);
  if (input.presentation.semantic_root_digest !== input.state_set.current_semantic_root_digest || input.presentation.question_part_state_set_digest !== input.state_set.state_set_digest) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Presentation does not bind the current semantic root and Question Part state set.');
  const bound = /** @type {Array<Record<string,any>>} */ (validateAndBindResponseUnits(input));
  const gapByBinding = new Map(input.gaps.map((gap) => [`${gap.gap_binding.kind}\0${gap.gap_binding.gap_id}`, gap]));
  const partById = new Map(input.state_set.parts.map((/** @type {Record<string,any>} */ part) => [part.question_part_id, part]));
  const gapByPart = new Map();
  for (const part of input.state_set.parts) {
    const gap = gapByBinding.get(`${part.gap_binding.kind}\0${part.gap_binding.gap_id}`);
    if (gap) gapByPart.set(part.question_part_id, gap);
  }
  for (const unit of bound) if (!gapByPart.has(unit.target.question_part_id)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Response unit cannot resolve to an accepted gap.');
  const bindings = bound.map(previewBinding).sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key));
  const projection = input.projection ?? defaultProjection(bound, input.state_set, gapByPart);
  if (projection.no_semantic_change !== false) throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Applying clarification units must advertise a semantic or evidence-state change.');
  const unknownEffects = input.unknown_future_effects ?? (bound.some((unit) => unit.action === 'answer') ? ['Downstream Agent artifacts may require recompilation from confirmed Decisions.'] : []);
  const payload = {
    presentation_id: input.presentation.presentation_id,
    presentation_digest: input.presentation.presentation_digest,
    semantic_root_digest: input.presentation.semantic_root_digest,
    question_part_state_set_digest: input.presentation.question_part_state_set_digest,
    source_revision: input.presentation.source_revision,
    response_message_digest: bound[0].origin.message_digest,
    bindings,
    deterministic_projection: structuredClone(projection),
    unknown_future_effects: [...unknownEffects]
  };
  if (bound.some((unit) => unit.origin.message_digest !== payload.response_message_digest)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'All units must originate from the same current raw response.');
  const preview = { ...payload, preview_digest: previewDigest(payload) };
  const proposals = bound.filter((unit) => unit.action === 'answer').map((unit) => {
    const part = partById.get(unit.target.question_part_id); const gap = gapByPart.get(unit.target.question_part_id);
    if (!part || !gap) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Decision proposal cannot resolve its exact part and gap.');
    return {
      question_part_id: part.question_part_id,
      gap_binding: structuredClone(part.gap_binding),
      target: structuredClone(gap.target),
      answer_contract_digest: part.answer_contract_digest,
      answer_value: structuredClone(unit.answer.value),
      answer_value_digest: answerValueDigest(unit.answer.value),
      source_text: unit.answer.source_text,
      evidence_level: unit.evidence_level,
      case_document_lineage_id: input.state_set.case_document_lineage_id,
      origin: structuredClone(unit.origin),
      ...(unit.answer.nature === 'temporary' ? { temporary_basis: structuredClone(unit.answer.temporary_basis) } : {})
    };
  });
  const pending = createPendingClarificationCommit({ preview, canonical_units: bound, decision_proposals: proposals, base_checkpoint_digest: input.base_checkpoint_digest });
  return { preview, pending };
}

/** @param {Record<string,any>} preview */
export function verifyClarificationPreviewDigest(preview) {
  const { preview_digest: declared, ...payload } = preview;
  if (previewDigest(payload) !== declared) throw new V5ProtocolError('CLARIFICATION_PREVIEW_STALE', 'Clarification preview digest is invalid.');
  return structuredClone(preview);
}
