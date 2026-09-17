import behaviorViewsSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };

import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

/** @param {string} code @param {string} path @param {string} message */
function problem(code, path, message) {
  return { category: 'traceability', code, path, message };
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown[]} values @param {string} key @param {string} code @param {any[]} diagnostics */
function uniqueIndex(values, key, code, diagnostics) {
  const result = new Map();
  values.forEach((value, index) => {
    const id = record(value) ? value[key] : undefined;
    if (typeof id !== 'string') return;
    if (result.has(id)) diagnostics.push(problem(code, `/${key}/${index}`, `${key} must be unique.`));
    else result.set(id, value);
  });
  return result;
}

/** @param {unknown} value */
function canonicalClone(value) {
  return JSON.parse(canonicalStringify(value));
}

/**
 * Validate the closed 4.3 design record without manufacturing business truth.
 * The caller supplies compiler-verified reference inventories.
 * @param {unknown} submitted
 * @param {unknown} submittedContext
 * @returns {{diagnostics:any[],normalized:any}}
 */
export function validateDesignAssuranceV4(submitted, submittedContext) {
  const diagnostics = validateAgainstSchema(submitted, {
    $defs: behaviorViewsSchema.$defs,
    $ref: '#/$defs/v4DesignAssurance'
  });
  if (!record(submittedContext)
    || !Array.isArray(submittedContext.source_claim_ids)
    || !Array.isArray(submittedContext.semantic_gap_ids)
    || !Array.isArray(submittedContext.view_element_ids)) {
    diagnostics.push(problem('DESIGN_ASSURANCE_CONTEXT_INVALID', '/', 'Compiler reference inventories are required.'));
  }
  if (diagnostics.length || !record(submitted) || !record(submittedContext)) {
    return { diagnostics, normalized: null };
  }

  const assurance = /** @type {Record<string,any>} */ (canonicalClone(submitted));
  const knownClaims = new Set(submittedContext.source_claim_ids);
  const knownGaps = new Set(submittedContext.semantic_gap_ids);
  const knownElements = new Set(submittedContext.view_element_ids);
  const batches = uniqueIndex(assurance.batches, 'batch_id', 'DESIGN_ASSURANCE_BATCH_DUPLICATE', diagnostics);
  const groups = uniqueIndex(assurance.rule_groups, 'rule_group_id', 'DESIGN_ASSURANCE_RULE_GROUP_DUPLICATE', diagnostics);
  const responsibilities = uniqueIndex(
    assurance.candidate_responsibilities, 'candidate_id',
    'DESIGN_ASSURANCE_RESPONSIBILITY_DUPLICATE', diagnostics
  );
  const dispositions = uniqueIndex(
    assurance.candidate_dispositions, 'candidate_id',
    'DESIGN_ASSURANCE_DISPOSITION_DUPLICATE', diagnostics
  );
  const sequences = new Set();
  const candidateOwners = new Map();

  const checkClaims = (/** @type {unknown[]} */ claimIds, /** @type {string} */ path) => {
    for (const claimId of claimIds) if (!knownClaims.has(claimId)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_SOURCE_CLAIM_UNKNOWN', path,
      'Design rationale must reference a current verified source Claim.'
    ));
  };

  for (const [index, batch] of assurance.batches.entries()) {
    if (sequences.has(batch.sequence)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_BATCH_SEQUENCE_DUPLICATE', `/batches/${index}/sequence`,
      'Batch sequence must be unique.'
    ));
    sequences.add(batch.sequence);
    if (batch.status !== 'complete') diagnostics.push(problem(
      'DESIGN_ASSURANCE_BATCH_INCOMPLETE', `/batches/${index}/status`,
      'Every submitted design batch must be complete.'
    ));
    if (batch.sequence > assurance.plan_revision) diagnostics.push(problem(
      'DESIGN_ASSURANCE_PLAN_REVISION_STALE', '/plan_revision',
      'Plan revision must cover every submitted batch sequence.'
    ));
    checkClaims(batch.source_claim_ids, `/batches/${index}/source_claim_ids`);
  }

  for (const [index, group] of assurance.rule_groups.entries()) {
    const batch = batches.get(group.batch_id);
    if (!batch || !batch.rule_group_ids.includes(group.rule_group_id)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_BATCH_RULE_GROUP_MISMATCH', `/rule_groups/${index}/batch_id`,
      'Every rule group must be owned by exactly one declared batch.'
    ));
    checkClaims(group.source_claim_ids, `/rule_groups/${index}/source_claim_ids`);
    for (const candidateId of group.candidate_ids) {
      if (candidateOwners.has(candidateId)) diagnostics.push(problem(
        'DESIGN_ASSURANCE_CANDIDATE_DUPLICATE', `/rule_groups/${index}/candidate_ids`,
        'A design candidate may belong to only one rule group.'
      ));
      else candidateOwners.set(candidateId, group.rule_group_id);
    }
  }
  for (const [batchId, batch] of batches) {
    const actual = assurance.rule_groups.filter((/** @type {any} */ group) => group.batch_id === batchId)
      .map((/** @type {any} */ group) => group.rule_group_id).sort();
    const declared = [...batch.rule_group_ids].sort();
    if (canonicalStringify(actual) !== canonicalStringify(declared)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_BATCH_RULE_GROUP_MISMATCH', `/batches/${batchId}/rule_group_ids`,
      'Batch rule-group inventory must be total and exact.'
    ));
  }

  for (const [candidateId, ownerGroupId] of candidateOwners) {
    const responsibility = responsibilities.get(candidateId);
    if (!responsibility || responsibility.rule_group_id !== ownerGroupId) diagnostics.push(problem(
      'DESIGN_ASSURANCE_RESPONSIBILITY_MISSING', `/candidate_responsibilities/${candidateId}`,
      'Every candidate needs one responsibility owned by its rule group.'
    ));
    if (!dispositions.has(candidateId)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_DISPOSITION_MISSING', `/candidate_dispositions/${candidateId}`,
      'Every candidate needs one auditable disposition.'
    ));
  }
  for (const [candidateId, responsibility] of responsibilities) {
    if (!candidateOwners.has(candidateId) || responsibility.rule_group_id !== candidateOwners.get(candidateId)) {
      diagnostics.push(problem(
        'DESIGN_ASSURANCE_RESPONSIBILITY_UNKNOWN', `/candidate_responsibilities/${candidateId}`,
        'Responsibility must reference one declared candidate and its owning rule group.'
      ));
    }
    checkClaims(responsibility.source_claim_ids, `/candidate_responsibilities/${candidateId}/source_claim_ids`);
  }

  for (const [candidateId, disposition] of dispositions) {
    if (!candidateOwners.has(candidateId)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_DISPOSITION_UNKNOWN', `/candidate_dispositions/${candidateId}`,
      'Disposition must reference one declared candidate.'
    ));
    if (disposition.disposition === 'retained'
      && disposition.retained_element_ids.some((/** @type {string} */ id) => !knownElements.has(id))) {
      diagnostics.push(problem(
        'DESIGN_ASSURANCE_RETAINED_TARGET_UNKNOWN', `/candidate_dispositions/${candidateId}/retained_element_ids`,
        'Retained candidates must bind current behavior-view elements.'
      ));
    }
    if (['representative_value', 'equivalent_merge'].includes(disposition.disposition)
      && (!candidateOwners.has(disposition.retained_candidate_id)
        || disposition.retained_candidate_id === candidateId)) {
      diagnostics.push(problem(
        'DESIGN_ASSURANCE_RETAINED_CANDIDATE_UNKNOWN', `/candidate_dispositions/${candidateId}/retained_candidate_id`,
        'Representative or merged candidates must target another declared candidate.'
      ));
    }
    if (disposition.disposition === 'evidence_exclusion') {
      checkClaims(disposition.source_claim_ids, `/candidate_dispositions/${candidateId}/source_claim_ids`);
    }
    if (disposition.disposition === 'semantic_gap' && !knownGaps.has(disposition.semantic_gap_id)) {
      diagnostics.push(problem(
        'DESIGN_ASSURANCE_SEMANTIC_GAP_UNKNOWN', `/candidate_dispositions/${candidateId}/semantic_gap_id`,
        'Semantic-gap disposition must reference a current semantic gap.'
      ));
    }
  }

  for (const candidateId of candidateOwners.keys()) {
    const initialDisposition = dispositions.get(candidateId);
    if (!initialDisposition
      || !['representative_value', 'equivalent_merge'].includes(initialDisposition.disposition)) continue;
    const visited = new Set();
    let cursor = candidateId;
    while (true) {
      if (visited.has(cursor)) {
        diagnostics.push(problem(
          'DESIGN_ASSURANCE_MERGE_CYCLE', `/candidate_dispositions/${candidateId}`,
          'Representative and merge targets cannot form a cycle.'
        ));
        break;
      }
      visited.add(cursor);
      const disposition = dispositions.get(cursor);
      if (!disposition || !['representative_value', 'equivalent_merge'].includes(disposition.disposition)) {
        if (!disposition || disposition.disposition !== 'retained'
          || disposition.retained_element_ids.some(
            (/** @type {string} */ id) => !knownElements.has(id)
          )) {
          diagnostics.push(problem(
            'DESIGN_ASSURANCE_RETAINED_CHAIN_INVALID',
            `/candidate_dispositions/${candidateId}/retained_candidate_id`,
            'Representative and merge chains must terminate at a retained candidate with current elements.'
          ));
        }
        break;
      }
      cursor = disposition.retained_candidate_id;
    }
  }

  const impactedIds = new Set();
  for (const [index, impact] of assurance.impacted_prior_batches.entries()) {
    if (impactedIds.has(impact.batch_id)) diagnostics.push(problem(
      'DESIGN_ASSURANCE_IMPACT_DUPLICATE', `/impacted_prior_batches/${index}/batch_id`,
      'A prior batch may appear only once in an impact record.'
    ));
    impactedIds.add(impact.batch_id);
    const prior = batches.get(impact.batch_id);
    const triggers = impact.trigger_rule_group_ids.map((/** @type {string} */ id) => groups.get(id));
    const triggerBatches = triggers.map((/** @type {any} */ group) =>
      group ? batches.get(group.batch_id) : null);
    if (!prior || triggers.some((/** @type {any} */ value) => !value)
      || triggerBatches.some((/** @type {any} */ value) => !value)
      || triggerBatches.some((/** @type {any} */ batch) => batch.sequence <= prior.sequence)) {
      diagnostics.push(problem(
        'DESIGN_ASSURANCE_PRIOR_BATCH_INVALID', `/impacted_prior_batches/${index}`,
        'An impacted prior batch must precede every triggering rule group batch.'
      ));
    }
    checkClaims(impact.source_claim_ids, `/impacted_prior_batches/${index}/source_claim_ids`);
  }

  return { diagnostics, normalized: assurance };
}
