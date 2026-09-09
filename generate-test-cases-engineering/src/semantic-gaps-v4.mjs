import { createHash } from 'node:crypto';

import { canonicalStringify } from './canonical.mjs';

const RISK = new Set(['critical', 'high', 'medium', 'low']);
const PHASE = new Set(['pre_case', 'post_case']);

/** @param {string} left @param {string} right */
export function compareUnicodeScalar(left, right) {
  const a = Array.from(left.normalize('NFC'), (value) => value.codePointAt(0) ?? 0);
  const b = Array.from(right.normalize('NFC'), (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** @param {unknown} value @param {string} code */
export function canonicalTextV4(value, code) {
  if (typeof value !== 'string') throw new TypeError(code);
  const result = value.normalize('NFC').trim();
  if (!result) throw new TypeError(code);
  return result;
}

/** @param {unknown} value @param {string} code @param {boolean} [nonempty] */
export function canonicalStringSetV4(value, code, nonempty = true) {
  if (!Array.isArray(value)) throw new TypeError(code);
  const output = [...new Set(value.map((item) => canonicalTextV4(item, code)))].sort(compareUnicodeScalar);
  if (nonempty && output.length === 0) throw new TypeError(code);
  return output;
}

/** @param {unknown} value */
export function sha256CanonicalV4(value) {
  return `sha256:${createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex')}`;
}

/** @param {string} prefix @param {unknown} value */
function contentId(prefix, value) {
  return `${prefix}-${sha256CanonicalV4(value).slice('sha256:'.length)}`;
}

/** @param {unknown} value */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : null;
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} code */
function closed(value, allowed, code) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(code);
}

/**
 * Compile adapter-discovered business-semantic gaps into compiler-owned roots.
 * Other diagnostic categories deliberately remain available to their own
 * recovery routes but can never become user business questions here.
 *
 * @param {{facts:unknown,claims?:unknown,diagnostic_candidates:unknown,discovery_phase:unknown}} input
 */
export function compileSemanticGapRootsV4(input) {
  if (!record(input) || typeof input.discovery_phase !== 'string' || !PHASE.has(input.discovery_phase)) {
    throw new TypeError('SEMANTIC_GAP_INPUT_INVALID');
  }
  if (!Array.isArray(input.facts) || !Array.isArray(input.diagnostic_candidates)) throw new TypeError('SEMANTIC_GAP_INPUT_INVALID');
  if (input.claims !== undefined && !Array.isArray(input.claims)) throw new TypeError('SEMANTIC_GAP_INPUT_INVALID');
  const claimById = new Map();
  for (const rawClaim of input.claims ?? []) {
    const claim = record(rawClaim);
    if (!claim) throw new TypeError('SEMANTIC_GAP_CLAIM_INVALID');
    const claimId = canonicalTextV4(claim.claim_id, 'SEMANTIC_GAP_CLAIM_INVALID');
    if (claimById.has(claimId)) throw new TypeError('SEMANTIC_GAP_CLAIM_DUPLICATE');
    claimById.set(claimId, {
      claim_id: claimId,
      value: canonicalTextV4(claim.value, 'SEMANTIC_GAP_CLAIM_INVALID')
    });
  }
  const factById = new Map();
  for (const rawFact of input.facts) {
    const fact = record(rawFact);
    if (!fact) throw new TypeError('SEMANTIC_GAP_FACT_INVALID');
    const factId = canonicalTextV4(fact.fact_id, 'SEMANTIC_GAP_FACT_INVALID');
    if (factById.has(factId)) throw new TypeError('SEMANTIC_GAP_FACT_DUPLICATE');
    let statement;
    let claimIds;
    if (Object.hasOwn(fact, 'statement')) {
      closed(fact, [
        'fact_id', 'statement', 'claim_ids', 'status', 'acceptance_role', 'module_refs', 'field_path'
      ], 'SEMANTIC_GAP_FACT_INVALID');
      statement = canonicalTextV4(fact.statement, 'SEMANTIC_GAP_FACT_INVALID');
      claimIds = canonicalStringSetV4(fact.claim_ids, 'SEMANTIC_GAP_FACT_INVALID');
    } else {
      closed(fact, [
        'fact_id', 'claim_id', 'status', 'source_claim_ids', 'required_view_kinds', 'view_review_basis'
      ], 'SEMANTIC_GAP_FACT_INVALID');
      const claimId = canonicalTextV4(fact.claim_id, 'SEMANTIC_GAP_FACT_INVALID');
      const claim = claimById.get(claimId);
      if (!claim) throw new TypeError('SEMANTIC_GAP_FACT_CLAIM_UNKNOWN');
      statement = claim.value;
      claimIds = canonicalStringSetV4(fact.source_claim_ids, 'SEMANTIC_GAP_FACT_INVALID');
    }
    factById.set(factId, {
      fact_id: factId,
      statement,
      claim_ids: claimIds
    });
  }

  /** @type {Map<string, any>} */
  const byRoot = new Map();
  for (const rawCandidate of input.diagnostic_candidates) {
    const candidate = record(rawCandidate);
    if (!candidate || typeof candidate.category !== 'string') throw new TypeError('SEMANTIC_GAP_CANDIDATE_INVALID');
    if (candidate.category !== 'semantic_gap') continue;
    closed(candidate, [
      'category', 'code', 'subject_fact_ids', 'missing_aspect', 'scope_ref', 'question', 'why_needed',
      'decision_impact', 'unresolved_outcome', 'answer_options', 'risk_level', 'source_claim_ids',
      'discovery_phase', 'affected_test_point_ids'
    ], 'SEMANTIC_GAP_CANDIDATE_INVALID');
    if (candidate.discovery_phase !== input.discovery_phase) throw new TypeError('SEMANTIC_GAP_PHASE_INVALID');
    const subjectFactIds = canonicalStringSetV4(candidate.subject_fact_ids, 'SEMANTIC_GAP_FACT_REFS_INVALID');
    for (const id of subjectFactIds) if (!factById.has(id)) throw new TypeError('SEMANTIC_GAP_FACT_UNKNOWN');
    const missingAspect = canonicalTextV4(candidate.missing_aspect, 'SEMANTIC_GAP_ASPECT_INVALID');
    const scopeRef = canonicalTextV4(candidate.scope_ref, 'SEMANTIC_GAP_SCOPE_INVALID');
    const rootIdentity = { subject_fact_ids: subjectFactIds, missing_aspect: missingAspect, scope_ref: scopeRef };
    const rootIssueId = contentId('ROOT', rootIdentity);
    const semantic = {
      code: canonicalTextV4(candidate.code, 'SEMANTIC_GAP_CODE_INVALID'),
      question: canonicalTextV4(candidate.question, 'SEMANTIC_GAP_QUESTION_INVALID'),
      why_needed: canonicalTextV4(candidate.why_needed, 'SEMANTIC_GAP_WHY_INVALID'),
      decision_impact: canonicalTextV4(candidate.decision_impact, 'SEMANTIC_GAP_IMPACT_INVALID'),
      unresolved_outcome: canonicalTextV4(candidate.unresolved_outcome, 'SEMANTIC_GAP_OUTCOME_INVALID'),
      risk_level: canonicalTextV4(candidate.risk_level, 'SEMANTIC_GAP_RISK_INVALID')
    };
    if (!RISK.has(semantic.risk_level)) throw new TypeError('SEMANTIC_GAP_RISK_INVALID');
    const answerOptions = canonicalStringSetV4(candidate.answer_options, 'SEMANTIC_GAP_OPTIONS_INVALID');
    const sourceClaimIds = canonicalStringSetV4(candidate.source_claim_ids, 'SEMANTIC_GAP_CLAIMS_INVALID');
    if (claimById.size > 0) {
      for (const id of sourceClaimIds) if (!claimById.has(id)) throw new TypeError('SEMANTIC_GAP_CLAIM_UNKNOWN');
    }
    const affectedTestPointIds = candidate.affected_test_point_ids === undefined
      ? [] : canonicalStringSetV4(candidate.affected_test_point_ids, 'SEMANTIC_GAP_TEST_POINTS_INVALID', false);
    const existing = byRoot.get(rootIssueId);
    if (existing) {
      if (canonicalStringify(existing._semantic) !== canonicalStringify(semantic)) {
        throw new TypeError('SEMANTIC_GAP_ROOT_CONFLICT');
      }
      existing.answer_options = canonicalStringSetV4([...existing.answer_options, ...answerOptions], 'SEMANTIC_GAP_OPTIONS_INVALID');
      existing.source_claim_ids = canonicalStringSetV4([...existing.source_claim_ids, ...sourceClaimIds], 'SEMANTIC_GAP_CLAIMS_INVALID');
      existing.affected_test_point_ids = canonicalStringSetV4(
        [...existing.affected_test_point_ids, ...affectedTestPointIds], 'SEMANTIC_GAP_TEST_POINTS_INVALID', false
      );
      continue;
    }
    byRoot.set(rootIssueId, {
      root_issue_id: rootIssueId,
      subject_fact_ids: subjectFactIds,
      missing_aspect: missingAspect,
      scope_ref: scopeRef,
      ...semantic,
      answer_options: answerOptions,
      source_claim_ids: sourceClaimIds,
      affected_test_point_ids: affectedTestPointIds,
      affected_facts: subjectFactIds.map((id) => factById.get(id).statement),
      discovery_phase: input.discovery_phase,
      _semantic: semantic
    });
  }

  const riskRank = new Map([['critical', 0], ['high', 1], ['medium', 2], ['low', 3]]);
  const roots = [...byRoot.values()].map((root) => {
    const { _semantic, ...versioned } = root;
    const rootVersionDigest = sha256CanonicalV4(versioned);
    const questionPartId = contentId('QP', {
      root_issue_id: root.root_issue_id,
      root_version_digest: rootVersionDigest,
      missing_aspect: root.missing_aspect
    });
    return {
      semantic_gap_id: contentId('SG', { root_issue_id: root.root_issue_id, root_version_digest: rootVersionDigest }),
      ...versioned,
      root_version_digest: rootVersionDigest,
      question_part_id: questionPartId
    };
  });
  roots.sort((left, right) => (riskRank.get(left.risk_level) ?? 4) - (riskRank.get(right.risk_level) ?? 4)
    || compareUnicodeScalar(left.scope_ref, right.scope_ref)
    || compareUnicodeScalar(left.missing_aspect, right.missing_aspect)
    || compareUnicodeScalar(left.root_issue_id, right.root_issue_id));
  return roots;
}
