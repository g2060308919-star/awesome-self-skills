import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

const ACTIONABLE_STATES = new Set(['presented', 'deferred_by_user', 'unknown_by_user']);
const ALL_STATES = new Set([...ACTIONABLE_STATES, 'resolved_final', 'resolved_temporary', 'closed_for_delivery', 'obsolete']);
const EDGES = /** @type {Readonly<Record<string,ReadonlySet<string>>>} */ (Object.freeze({
  presented: new Set(['resolved_final', 'resolved_temporary', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery', 'obsolete']),
  deferred_by_user: new Set(['resolved_final', 'resolved_temporary', 'closed_for_delivery', 'obsolete']),
  unknown_by_user: new Set(['resolved_final', 'resolved_temporary', 'closed_for_delivery', 'obsolete']),
  resolved_final: new Set(['obsolete']), resolved_temporary: new Set(['obsolete']), closed_for_delivery: new Set(['obsolete']), obsolete: new Set()
}));

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown} value */
function digest(value) { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value); }

/** @param {Record<string,any>} contract */
export function questionAnswerContractDigest(contract) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/question-answer-contract', format_version: 1, contract });
}

/** @param {Record<string,any>} presentationWithoutDigest */
function clarificationPresentationDigest(presentationWithoutDigest) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/clarification-presentation', format_version: 1, presentation: presentationWithoutDigest });
}

/** @param {Record<string,any>} record @returns {Record<string,any>} */
function sealStateRecord(record) { return { ...record, state_record_digest: canonicalObjectDigest(record) }; }

/**
 * @param {string} caseDocumentLineageId
 * @param {string} semanticRootDigest
 * @param {Array<Record<string,any>>} gaps
 */
export function createQuestionPartStateSet(caseDocumentLineageId, semanticRootDigest, gaps) {
  if (!nonblank(caseDocumentLineageId) || !digest(semanticRootDigest) || !Array.isArray(gaps)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Question Part inventory identity is invalid.');
  const parts = /** @type {Array<Record<string,any>>} */ (gaps.map((gap) => {
    const binding = gap.gap_binding;
    if (!object(binding) || !['requirements_gap', 'behavior_gap'].includes(binding.kind) || !nonblank(binding.gap_id) || !digest(binding.gap_payload_digest) || !object(gap.answer_contract)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Question Part gap or answer contract is invalid.');
    const answerContractDigest = questionAnswerContractDigest(gap.answer_contract);
    return sealStateRecord({
      kind: 'question_part_state',
      question_part_id: stableV5Id('question_part', {
        case_document_lineage_id: caseDocumentLineageId,
        gap_kind: binding.kind,
        gap_id: binding.gap_id,
        gap_payload_digest: binding.gap_payload_digest,
        initial_semantic_root_digest: semanticRootDigest,
        answer_contract_digest: answerContractDigest
      }),
      case_document_lineage_id: caseDocumentLineageId,
      gap_binding: structuredClone(binding),
      initial_semantic_root_digest: semanticRootDigest,
      answer_contract_digest: answerContractDigest,
      current_state: 'presented',
      transition_history: []
    });
  })).sort((left, right) => left.question_part_id.localeCompare(right.question_part_id));
  if (new Set(parts.map((part) => part.question_part_id)).size !== parts.length) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Question Part gaps must be unique.');
  const payload = { kind: 'question_part_state_set', case_document_lineage_id: caseDocumentLineageId, current_semantic_root_digest: semanticRootDigest, parts };
  return { ...payload, state_set_digest: canonicalObjectDigest(payload) };
}

/** @param {Record<string,any>} stateSet */
export function validateQuestionPartStateSet(stateSet) {
  const fail = (/** @type {string} */ message) => { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', message); };
  if (!object(stateSet) || !exact(stateSet, ['kind', 'case_document_lineage_id', 'current_semantic_root_digest', 'parts', 'state_set_digest']) || stateSet.kind !== 'question_part_state_set' || !nonblank(stateSet.case_document_lineage_id) || !digest(stateSet.current_semantic_root_digest) || !Array.isArray(stateSet.parts)) return fail('Question Part state set shape is invalid.');
  const { state_set_digest: ignored, ...statePayload } = stateSet;
  if (canonicalObjectDigest(statePayload) !== stateSet.state_set_digest) return fail('Question Part state-set digest is invalid.');
  const sorted = [...stateSet.parts].sort((left, right) => left.question_part_id.localeCompare(right.question_part_id));
  if (canonicalV5Stringify(sorted.map((part) => part.question_part_id)) !== canonicalV5Stringify(stateSet.parts.map((/** @type {Record<string,any>} */ part) => part.question_part_id)) || new Set(sorted.map((part) => part.question_part_id)).size !== sorted.length) return fail('Question Parts must be a sorted unique set.');
  for (const part of sorted) {
    if (!exact(part, ['kind', 'question_part_id', 'case_document_lineage_id', 'gap_binding', 'initial_semantic_root_digest', 'answer_contract_digest', 'current_state', 'transition_history', 'state_record_digest']) || part.kind !== 'question_part_state' || part.case_document_lineage_id !== stateSet.case_document_lineage_id || !/^qpt5_[0-9a-f]{64}$/u.test(part.question_part_id) || !digest(part.answer_contract_digest) || !ALL_STATES.has(part.current_state) || !Array.isArray(part.transition_history)) return fail('Question Part state-record shape is invalid.');
    const { state_record_digest: ignoredRecord, ...recordPayload } = part;
    if (canonicalObjectDigest(recordPayload) !== part.state_record_digest) return fail('Question Part state-record digest is invalid.');
    let previous = 'presented';
    for (let index = 0; index < part.transition_history.length; index += 1) {
      const transition = part.transition_history[index];
      if (!object(transition) || transition.transition_sequence !== index + 1 || transition.from_state !== previous || !EDGES[previous]?.has(transition.to_state)) return fail('Question Part transition history is discontinuous or illegal.');
      const { transition_digest: ignoredTransition, ...transitionPayload } = transition;
      if (canonicalObjectDigest(transitionPayload) !== transition.transition_digest) return fail('Question Part transition digest is invalid.');
      if (transition.cause?.kind === 'answer' && !['E3', 'E1'].includes(transition.cause.evidence_level)) return fail('Answer transition evidence level is invalid.');
      if (transition.cause?.kind === 'control' && !['defer', 'unknown', 'close_for_delivery'].includes(transition.cause.action)) return fail('Control transition action is invalid.');
      if (transition.cause?.kind === 'compiler_obsolescence' && transition.to_state !== 'obsolete') return fail('Compiler obsolescence must transition to obsolete.');
      if (!['answer', 'control', 'compiler_obsolescence'].includes(transition.cause?.kind)) return fail('Question Part transition cause is invalid.');
      previous = transition.to_state;
    }
    if (part.current_state !== previous) return fail('Question Part current state does not match transition history.');
  }
  return structuredClone(stateSet);
}

/**
 * @param {Record<string,any>} stateSet
 * @param {number} sourceRevision
 * @param {Array<Record<string,any>>} gaps
 */
export function createClarificationPresentation(stateSet, sourceRevision, gaps) {
  validateQuestionPartStateSet(stateSet);
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Presentation source revision is invalid.');
  const gapByBinding = new Map(gaps.map((gap) => [`${gap.gap_binding.kind}\0${gap.gap_binding.gap_id}`, gap]));
  const active = /** @type {Array<Record<string,any>>} */ (stateSet.parts).filter((part) => ACTIONABLE_STATES.has(part.current_state));
  if (active.length > 999999) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Presentation exceeds the Q token namespace.');
  const parts = active.map((part, index) => {
    const gap = gapByBinding.get(`${part.gap_binding.kind}\0${part.gap_binding.gap_id}`);
    if (!gap || questionAnswerContractDigest(gap.answer_contract) !== part.answer_contract_digest) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Presentation gap inventory is stale or incomplete.');
    const controls = part.current_state === 'presented'
      ? gap.answer_contract.allowed_controls
      : gap.answer_contract.allowed_controls.filter((/** @type {string} */ control) => control === 'answer' || control === 'close_for_delivery');
    if (!Array.isArray(controls) || controls.length === 0) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Question Part has no currently allowed control.');
    return {
      question_part_id: part.question_part_id,
      display_token: `Q${String(index + 1).padStart(3, '0')}`,
      question_state: part.current_state,
      current_allowed_controls: [...controls],
      question: gap.question,
      why_needed: gap.why_needed,
      answer_contract: structuredClone(gap.answer_contract),
      question_impact_summary: { question_part_id: part.question_part_id, ...structuredClone(gap.question_impact_summary) }
    };
  });
  const presentationId = stableV5Id('clarification_presentation', {
    case_document_lineage_id: stateSet.case_document_lineage_id,
    input_semantic_root_digest: stateSet.current_semantic_root_digest,
    question_part_state_set_digest: stateSet.state_set_digest,
    visible_question_part_ids: parts.map((part) => part.question_part_id)
  });
  const payload = { presentation_id: presentationId, semantic_root_digest: stateSet.current_semantic_root_digest, question_part_state_set_digest: stateSet.state_set_digest, source_revision: sourceRevision, parts };
  return { ...payload, presentation_digest: clarificationPresentationDigest(payload) };
}

/**
 * @param {Record<string,any>} stateSet
 * @param {Array<{question_part_id:string,to_state:string,cause:Record<string,any>}>} changes
 * @param {string} [nextSemanticRootDigest]
 */
export function applyQuestionPartTransitions(stateSet, changes, nextSemanticRootDigest = stateSet.current_semantic_root_digest) {
  validateQuestionPartStateSet(stateSet);
  if (!digest(nextSemanticRootDigest)) throw new V5ProtocolError('QUESTION_PART_TRANSITION_INVALID', 'Next semantic root digest is invalid.');
  const byId = new Map(changes.map((change) => [change.question_part_id, change]));
  if (byId.size !== changes.length) throw new V5ProtocolError('QUESTION_PART_ACTION_CONFLICT', 'A Question Part may transition at most once per commit.');
  const parts = stateSet.parts.map((/** @type {Record<string,any>} */ part) => {
    const change = byId.get(part.question_part_id);
    if (!change) return structuredClone(part);
    if (!EDGES[part.current_state]?.has(change.to_state)) throw new V5ProtocolError('QUESTION_PART_TRANSITION_INVALID', 'Question Part transition is not allowed from the current state.');
    const transitionPayload = { transition_sequence: part.transition_history.length + 1, from_state: part.current_state, to_state: change.to_state, cause: structuredClone(change.cause) };
    const transition = { ...transitionPayload, transition_digest: canonicalObjectDigest(transitionPayload) };
    const { state_record_digest: ignored, ...payload } = part;
    return sealStateRecord({ ...payload, current_state: change.to_state, transition_history: [...part.transition_history, transition] });
  });
  for (const change of changes) if (!stateSet.parts.some((/** @type {Record<string,any>} */ part) => part.question_part_id === change.question_part_id)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Question Part transition targets an unknown part.');
  const payload = { kind: 'question_part_state_set', case_document_lineage_id: stateSet.case_document_lineage_id, current_semantic_root_digest: nextSemanticRootDigest, parts };
  const next = { ...payload, state_set_digest: canonicalObjectDigest(payload) };
  validateQuestionPartStateSet(next);
  return next;
}
