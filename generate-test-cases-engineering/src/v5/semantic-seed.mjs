import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { canonicalObjectDigest, sealV5Record } from './storage-records.mjs';

const AMBIGUITY_TOKENS = Object.freeze([
  ['正常', 'expected_outcome'], ['正确', 'expected_outcome'], ['对应', 'reference'],
  ['原值', 'comparison'], ['按原值', 'comparison'], ['所有', 'quantifier_scope'],
  ['否则', 'condition'], ['其他', 'complement'], ['及时', 'timing'], ['合理', 'other'], ['默认', 'authority_source']
]);

/** @param {string} value */
function digest(value) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/semantic-slot', format_version: 1, value });
}

/** @param {string} text @param {number} start @param {number} end */
function span(text, start, end) {
  const excerpt = Array.from(text).slice(start, end).join('');
  return { start_scalar: start, end_scalar: end, excerpt, excerpt_digest: canonicalObjectDigest(excerpt) };
}

/** @param {string} content */
function nonblankLines(content) {
  const scalars = Array.from(content);
  const lines = [];
  let start = 0;
  for (let index = 0; index <= scalars.length; index += 1) {
    if (index !== scalars.length && scalars[index] !== '\n') continue;
    const raw = scalars.slice(start, index).join('');
    const leading = Array.from(raw).findIndex((character) => !/\s/u.test(character));
    if (leading >= 0) {
      const reversed = [...Array.from(raw)].reverse();
      const trailing = reversed.findIndex((character) => !/\s/u.test(character));
      lines.push({ text: Array.from(raw).slice(leading, Array.from(raw).length - trailing).join(''), start: start + leading, end: index - trailing });
    }
    start = index + 1;
  }
  return lines;
}

/** @param {string} text */
function observationPhrases(text) {
  const phrases = text.split(/[，,]\s*(?:并且|并|且|同时|以及)/u).map((value) => value.trim()).filter(Boolean);
  return phrases.length === 0 ? [text] : phrases;
}

/**
 * The seed deriver intentionally advertises candidates rather than asserting
 * that its lexical signals are true business semantics. The review artifact
 * remains the authority boundary.
 * @param {{acceptedSourceStateDigest:string,sourcePacks:Array<Record<string,any>>,permissionDerivationRegistryDigest?:string}} input
 * @returns {Record<string, any>}
 */
export function deriveSemanticReviewSeed(input) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.acceptedSourceStateDigest) || !Array.isArray(input.sourcePacks) || input.sourcePacks.length === 0) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Semantic seed requires a verified cumulative source context.');
  const normativeUnits = [];
  const ambiguityCandidates = [];
  const mentionCandidates = [];
  for (const pack of [...input.sourcePacks].sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest))) {
    for (const source of [...pack.payload.sources].sort((left, right) => left.source_object_digest.localeCompare(right.source_object_digest))) {
      const locatorId = `loc5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest }).slice(7)}`;
      for (const line of nonblankLines(source.content)) {
        const unitSpan = span(source.content, line.start, line.end);
        const unitId = `sunit5_${canonicalObjectDigest({ source_object_digest: source.source_object_digest, source_span: unitSpan }).slice(7)}`;
        const observations = observationPhrases(line.text).map((phrase) => digest(`observation:${phrase}`));
        const atomSignature = {
          subject_slot_digest: digest(`subject:${line.text}`),
          condition_slot_digest: digest(`condition:${line.text}`),
          action_slot_digest: digest(`action:${line.text}`),
          primary_observation_slot_digest: observations[0],
          branch_slot_digest: digest(`branch:${line.text}`)
        };
        const candidatePreimage = {
          accepted_source_state_digest: input.acceptedSourceStateDigest,
          locator_id: locatorId,
          source_span: unitSpan,
          atom_signature: atomSignature,
          required_observation_slot_digests: observations
        };
        const outcomeCandidate = {
          candidate_id: stableV5Id('outcome_candidate', candidatePreimage),
          locator_id: locatorId,
          source_span: unitSpan,
          compound_signal_codes: observations.length > 1 ? ['coordinated_observations'] : [],
          atom_signature: atomSignature,
          required_observation_slot_digests: observations
        };
        normativeUnits.push({ unit_id: unitId, locator_id: locatorId, unit_digest: canonicalObjectDigest({ locator_id: locatorId, source_span: unitSpan }), outcome_candidates: [outcomeCandidate] });
        for (const [token, ambiguityKind] of AMBIGUITY_TOKENS) {
          let offset = 0;
          while (true) {
            const relative = Array.from(line.text).slice(offset).join('').indexOf(token);
            if (relative < 0) break;
            const before = Array.from(Array.from(line.text).slice(offset).join('').slice(0, relative)).length;
            const tokenStart = line.start + offset + before;
            const tokenSpan = span(source.content, tokenStart, tokenStart + Array.from(token).length);
            const preimage = { accepted_source_state_digest: input.acceptedSourceStateDigest, locator_id: locatorId, source_span: tokenSpan, ambiguity_kind: ambiguityKind };
            ambiguityCandidates.push({ candidate_id: stableV5Id('ambiguity_candidate', preimage), locator_id: locatorId, source_span: tokenSpan, ambiguity_kind: ambiguityKind, detector_codes: [`bounded_vague_token:${token}`] });
            offset = tokenStart - line.start + Array.from(token).length;
          }
        }
        const quoted = /[“"`]([^”"`]+)[”"`]/gu;
        for (const match of line.text.matchAll(quoted)) {
          const observedName = match[1];
          const relativeStart = Array.from(line.text.slice(0, match.index)).length + 1;
          const mentionSpan = span(source.content, line.start + relativeStart, line.start + relativeStart + Array.from(observedName).length);
          const preimage = { accepted_source_state_digest: input.acceptedSourceStateDigest, locator_id: locatorId, source_span: mentionSpan, observed_name: observedName };
          mentionCandidates.push({ candidate_id: stableV5Id('entity_mention_candidate', preimage), conflict_group_id: '', locator_id: locatorId, source_span: mentionSpan, observed_name: observedName });
        }
      }
    }
  }
  if (normativeUnits.length === 0) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every accepted normative source must expose a review unit.');
  const entityConflictGroups = [];
  if (mentionCandidates.length >= 2) {
    const mentionIds = mentionCandidates.map((candidate) => candidate.candidate_id).sort();
    const conflictGroupId = stableV5Id('entity_conflict_group', { mention_candidate_ids: mentionIds });
    for (const candidate of mentionCandidates) candidate.conflict_group_id = conflictGroupId;
    entityConflictGroups.push({ conflict_group_id: conflictGroupId, mention_candidate_ids: mentionIds });
  } else mentionCandidates.length = 0;
  const base = {
    accepted_source_state_digest: input.acceptedSourceStateDigest,
    normative_units: normativeUnits.sort((left, right) => left.unit_id.localeCompare(right.unit_id)),
    ambiguity_candidates: ambiguityCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    outcome_dedup_groups: [],
    entity_mention_candidates: mentionCandidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)),
    entity_conflict_groups: entityConflictGroups,
    permission_scope_candidates: [], permission_scope_groups: [],
    permission_derivation_registry_digest: input.permissionDerivationRegistryDigest ?? `sha256:${'0'.repeat(64)}`
  };
  return sealV5Record(base, 'seed_digest');
}

export { AMBIGUITY_TOKENS };
