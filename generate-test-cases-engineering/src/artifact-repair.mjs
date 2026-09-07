import { canonicalStringify, digest } from './canonical.mjs';

export const SEMANTIC_STAGES = Object.freeze(['evidence_claims', 'behavior_views', 'case_drafts']);

/** @param {any} source */
function repairs(source) { return Array.isArray(source?.artifact_repairs) ? source.artifact_repairs : []; }

/** @param {any} prior @param {any} next */
export function appendedRepair(prior, next) {
  const before = repairs(prior);
  const after = repairs(next);
  return after.length === before.length + 1 ? after[after.length - 1] : null;
}

/** A repair is a generation correction, never a business decision or evidence claim.
 * @param {any} priorContext @param {any} next */
export function repairDiagnostics(priorContext, next) {
  const prior = priorContext?.source_pack;
  const before = repairs(prior);
  const after = repairs(next);
  const issue = (/** @type {string} */ message) => [{
    category: 'traceability', code: 'ARTIFACT_REPAIR_INVALID', path: '/artifact_repairs', message
  }];
  if (canonicalStringify(after.slice(0, before.length)) !== canonicalStringify(before)) return issue('Repair history is append-only.');
  if (after.length === before.length) return [];
  const repair = appendedRepair(prior, next);
  if (!prior || !repair || repair.repair_seq !== after.length
    || repair.base_source_revision !== prior.source_revision) return issue('One repair must bind the immediately preceding revision and next repair sequence.');
  const target = repair.stage === 'source_pack' ? prior : priorContext.artifacts?.[repair.stage];
  if (!target || digest(target) !== repair.accepted_artifact_digest) return issue('Repair target must match an existing immutable accepted artifact digest.');
  for (const key of ['decision_records', 'clarification_events', 'execution_events']) {
    if (canonicalStringify(prior[key] ?? []) !== canonicalStringify(next[key] ?? [])) return issue('A generation repair cannot also append business or execution decisions.');
  }
  return [];
}

/** @param {any} prior @param {any} next */
export function reusableStages(prior, next) {
  const repair = appendedRepair(prior, next);
  if (repair) {
    const index = SEMANTIC_STAGES.indexOf(repair.stage);
    return index < 0 ? [] : SEMANTIC_STAGES.slice(0, index);
  }
  const executionOnly = canonicalStringify(prior.decision_records) === canonicalStringify(next.decision_records)
    && canonicalStringify(prior.clarification_events) === canonicalStringify(next.clarification_events)
    && (next.execution_events?.length ?? 0) > (prior.execution_events?.length ?? 0);
  return executionOnly ? [...SEMANTIC_STAGES] : [];
}

/** A regenerated artifact invalidates confirmation even when the extracted content is unchanged.
 * @param {any} state */
export function unconfirmedWorkflow(state) {
  if (!state) return null;
  const copy = structuredClone(state);
  copy.confirmation = null;
  copy.presentation_snapshot = null;
  copy.active_pause = null;
  if (copy.execution_plan) {
    copy.execution_plan.confirmation = null;
    copy.execution_plan.status = 'decision_required';
  }
  return copy;
}
