import behaviorViewsSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { canonicalStringify, digest, stableId } from './canonical.mjs';
import { evaluateClarification } from './clarification.mjs';
import { classifyCaseDrafts } from './classify.mjs';
import { buildBundle, BundleReconciliationError } from './coverage.mjs';
import { scopeContains } from './decision-record.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import {
  compileObligations, ObligationCompilationError
} from './obligations/compile-obligations.mjs';
import { renderMarkdown, BundleRenderError } from './render-markdown.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { resolveSourcePolicy } from './source-policy.mjs';
import { auditInteractionMatrix } from './views/interaction-matrix.mjs';
import { validateBehaviorViews } from './views/validate-views.mjs';

/** @typedef {{category:string,code:string,path:string,message:string,related_id?:string}} Diagnostic */

const INPUT_KEYS = Object.freeze([
  'schema_version', 'source_revision', 'compiler_version', 'lineage',
  'source_pack', 'evidence_claims', 'behavior_views', 'obligation_compilation',
  'case_drafts', 'clarification', 'limits', 'expert_recall_limits'
]);
const COMPILATION_KEYS = Object.freeze([
  'contexts_by_view_id', 'custom_obligations', 'fact_routes', 'not_applicable_reviews'
]);
const CLARIFICATION_KEYS = Object.freeze(['append_batch', 'prior_state']);
const POLICIES = new Set(['pause_for_clarification', 'record_only']);
const DIAGNOSTIC_LIMIT = 256;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {unknown} value */
function diagnosticArray(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item)
    && typeof item.category === 'string' && typeof item.code === 'string'
    && typeof item.path === 'string' && typeof item.message === 'string'
    ? [{
      category: item.category, code: item.code, path: item.path, message: item.message,
      ...(typeof item.related_id === 'string' ? { related_id: item.related_id } : {})
    }] : []);
}

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = new Map();
  let overflow = false;
  for (const item of diagnostics) {
    if (item.code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else unique.set(canonicalStringify(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const ordered = [...unique.values()].sort((left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.related_id ?? '', right.related_id ?? '')
    || compareCodePoints(left.message, right.message));
  if (!overflow) return ordered;
  const retained = ordered.slice(0, DIAGNOSTIC_LIMIT - 1);
  retained.push(diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/',
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return retained.sort((left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.related_id ?? '', right.related_id ?? '')
    || compareCodePoints(left.message, right.message));
}

/** @param {string} stage @param {number} sourceRevision @param {Diagnostic[]} diagnostics */
function revisionRequired(stage, sourceRevision, diagnostics) {
  return {
    status: 'need_revision', stage, source_revision: sourceRevision,
    diagnostics: finalizeDiagnostics(diagnostics)
  };
}

/** @param {Record<string, unknown>} value @param {readonly string[]} expected @param {string} path @param {Diagnostic[]} diagnostics */
function requireClosed(value, expected, path, diagnostics) {
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) if (!allowed.has(key)) diagnostics.push(diagnostic(
    'schema', 'CORE_PROPERTY_UNKNOWN', `${path}/${key}`, 'pure-core input contains a property outside its closed revision contract'
  ));
  for (const key of expected) if (!Object.hasOwn(value, key)) diagnostics.push(diagnostic(
    'schema', 'CORE_PROPERTY_MISSING', `${path}/${key}`, 'pure-core input is missing a required revision property'
  ));
}

/** @param {unknown} value */
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {unknown} value */
function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {unknown} submitted */
function normalizeInput(submitted) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  let input;
  try {
    input = structuredClone(submitted);
  } catch {
    return { input: null, diagnostics: [diagnostic(
      'schema', 'CORE_INPUT_UNREADABLE', '/', 'pure-core input must be a clonable own-data revision'
    )] };
  }
  if (!isRecord(input)) return { input: null, diagnostics: [diagnostic(
    'schema', 'CORE_INPUT_INVALID', '/', 'pure-core input must be a closed plain record'
  )] };
  requireClosed(input, INPUT_KEYS, '', diagnostics);
  const sourceRevision = Number(input.source_revision);
  if (input.schema_version !== '1.0.0') diagnostics.push(diagnostic(
    'schema', 'CORE_SCHEMA_VERSION_INVALID', '/schema_version', 'pure core requires schema version 1.0.0'
  ));
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) diagnostics.push(diagnostic(
    'schema', 'CORE_SOURCE_REVISION_INVALID', '/source_revision', 'source revision must be a nonnegative safe integer'
  ));
  if (typeof input.compiler_version !== 'string' || input.compiler_version.trim().length === 0
    || input.compiler_version !== input.compiler_version.trim()) diagnostics.push(diagnostic(
    'schema', 'CORE_COMPILER_VERSION_INVALID', '/compiler_version', 'compiler version must be nonblank and unpadded'
  ));
  if (!isRecord(input.lineage)) diagnostics.push(diagnostic(
    'schema', 'CORE_LINEAGE_INVALID', '/lineage', 'lineage must be an own-data record'
  ));
  const compilation = isRecord(input.obligation_compilation) ? input.obligation_compilation : null;
  if (!compilation) diagnostics.push(diagnostic(
    'schema', 'CORE_OBLIGATION_COMPILATION_INVALID', '/obligation_compilation', 'obligation compilation input must be a closed record'
  ));
  else {
    requireClosed(compilation, COMPILATION_KEYS, '/obligation_compilation', diagnostics);
    if (!isRecord(compilation.contexts_by_view_id)
      || !Array.isArray(compilation.custom_obligations)
      || !Array.isArray(compilation.fact_routes)
      || !Array.isArray(compilation.not_applicable_reviews)) diagnostics.push(diagnostic(
      'schema', 'CORE_OBLIGATION_COMPILATION_INVALID', '/obligation_compilation',
      'obligation compilation contexts must be a record and remaining fields arrays'
    ));
  }
  const clarification = isRecord(input.clarification) ? input.clarification : null;
  if (!clarification) diagnostics.push(diagnostic(
    'schema', 'CORE_CLARIFICATION_INVALID', '/clarification', 'clarification input must be a closed record'
  ));
  else requireClosed(clarification, CLARIFICATION_KEYS, '/clarification', diagnostics);
  return { input, diagnostics };
}

/** @param {Record<string, unknown>} input */
function validateArtifactSchemas(input) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  for (const [artifact, schema] of [
    [input.source_pack, sourcePackSchema],
    [input.evidence_claims, evidenceClaimsSchema],
    [input.behavior_views, behaviorViewsSchema],
    [input.case_drafts, caseDraftsSchema]
  ]) {
    diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, schema)));
    diagnostics.push(.../** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact)));
  }
  const revision = Number(input.source_revision);
  for (const [name, artifact] of [
    ['source_pack', input.source_pack], ['evidence_claims', input.evidence_claims],
    ['behavior_views', input.behavior_views], ['case_drafts', input.case_drafts]
  ]) if (!isRecord(artifact) || artifact.source_revision !== revision) diagnostics.push(diagnostic(
    'traceability', 'CORE_SOURCE_REVISION_MISMATCH', `/${name}/source_revision`,
    'every submitted artifact must identify the complete revision being evaluated'
  ));
  return finalizeDiagnostics(diagnostics);
}

/** @param {Record<string, unknown>} input @param {Map<string, Record<string, unknown>>} claimsById @param {Record<string, unknown>[]} conflicts */
function evidenceContext(input, claimsById, conflicts) {
  const sourcePack = /** @type {Record<string, unknown>} */ (input.source_pack);
  const evidenceClaims = /** @type {Record<string, unknown>} */ (input.evidence_claims);
  const compilation = /** @type {Record<string, unknown>} */ (input.obligation_compilation);
  const contexts = /** @type {Record<string, unknown>} */ (compilation.contexts_by_view_id);
  return {
    claimsById,
    factLedger: structuredClone(records(evidenceClaims.fact_ledger)),
    conflicts: structuredClone(conflicts),
    runScope: String(sourcePack.run_scope),
    obligationCompilation: {
      sourceRevision: Number(input.source_revision),
      contextsByViewId: new Map(Object.entries(structuredClone(contexts))),
      factRoutes: structuredClone(records(compilation.fact_routes)),
      notApplicableReviews: structuredClone(records(compilation.not_applicable_reviews)),
      customObligations: structuredClone(records(compilation.custom_obligations))
    }
  };
}

/** @param {string} left @param {string} right */
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/**
 * Source policy owns conflict discovery, while classification owns the
 * lowest-gate Case rule. Bridge those frozen interfaces without converting a
 * local conflict into a revision-wide error: trace each executable Case's
 * accepted evidence roots back to its source locators, then block only Cases
 * that intersect and depend on a reported conflict.
 * @param {any} classification
 * @param {Record<string, unknown>[]} obligations
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Record<string, unknown>} sourcePack
 * @param {Record<string, unknown>[]} conflicts
 */
function applyLocalConflictBlocks(classification, obligations, claimsById, sourcePack, conflicts) {
  if (conflicts.length === 0) return classification;
  const locatorSourceById = new Map(records(sourcePack.locators).map((item) => [
    String(item.locator_id), String(item.source_id)
  ]));
  /** @type {Map<string, Set<string>>} */
  const sourceIdsByClaim = new Map();
  /** @param {string} root */
  function sourceIdsFor(root) {
    const cached = sourceIdsByClaim.get(root);
    if (cached) return cached;
    const result = new Set();
    const pending = [root];
    const seen = new Set();
    while (pending.length > 0) {
      const claimId = pending.pop();
      if (claimId === undefined || seen.has(claimId)) continue;
      seen.add(claimId);
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      if (typeof claim.source_id === 'string') result.add(claim.source_id);
      for (const locatorId of strings(claim.source_locator_ids)) {
        const sourceId = locatorSourceById.get(locatorId);
        if (sourceId !== undefined) result.add(sourceId);
      }
      for (const parentId of strings(claim.parent_claim_ids)) pending.push(parentId);
    }
    sourceIdsByClaim.set(root, result);
    return result;
  }

  const executable = [
    ...records(classification.grounded).map((item) => ({ lane: 'grounded', item })),
    ...records(classification.conditional).map((item) => ({ lane: 'conditional', item }))
  ];
  /** @type {Map<string, number[]>} */
  const casesByObligation = new Map();
  for (let index = 0; index < executable.length; index += 1) {
    for (const obligationId of strings(executable[index].item.obligation_ids)) {
      const bucket = casesByObligation.get(obligationId);
      if (bucket) bucket.push(index);
      else casesByObligation.set(obligationId, [index]);
    }
  }
  const obligationsById = new Map(obligations.map((item) => [String(item.obligation_id), item]));
  const blockedByObligation = new Map(records(classification.blocked).map((item) => [
    String(item.obligation_id), structuredClone(item)
  ]));
  const blockedQueue = [...blockedByObligation.keys()].sort(compareCodePoints);
  const invalidCases = new Set();

  /** @param {string} obligationId @param {string} reason @param {string[]} evidenceRefs @param {string|null} rootIssueId */
  function block(obligationId, reason, evidenceRefs, rootIssueId) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) return;
    const existing = blockedByObligation.get(obligationId);
    const reasons = new Set([...(existing ? String(existing.reason).split(',') : []), reason]);
    reasons.delete('');
    const refs = new Set([...(existing ? strings(existing.evidence_refs) : []), ...evidenceRefs]);
    blockedByObligation.set(obligationId, {
      obligation_id: obligationId,
      root_issue_id: rootIssueId ?? String(existing?.root_issue_id ?? stableId('root', {
        missing_type: 'case-classification', obligation_id: obligationId,
        reason_codes: [...reasons].sort(compareCodePoints), scope: obligation.scope
      })),
      reason: [...reasons].sort(compareCodePoints).join(','),
      risk: String(obligation.risk), evidence_refs: [...refs].sort(compareCodePoints)
    });
    if (!existing) blockedQueue.push(obligationId);
  }

  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const caseSources = new Set();
    for (const ref of strings(caseDraft.evidence_refs)) {
      for (const sourceId of sourceIdsFor(ref)) caseSources.add(sourceId);
    }
    const conflict = conflicts.find((item) =>
      typeof item.scope === 'string' && typeof caseDraft.scope === 'string'
      && scopesIntersect(caseDraft.scope, item.scope)
      && strings(item.source_ids).some((sourceId) => caseSources.has(sourceId)));
    if (!conflict) continue;
    invalidCases.add(index);
    for (const obligationId of strings(caseDraft.obligation_ids)) block(
      obligationId, 'UNRESOLVED_CONFLICT', strings(caseDraft.evidence_refs),
      typeof conflict.root_issue_id === 'string' ? conflict.root_issue_id : null
    );
  }

  let cursor = 0;
  while (cursor < blockedQueue.length) {
    const blockedId = blockedQueue[cursor++];
    for (const caseIndex of casesByObligation.get(blockedId) ?? []) {
      if (invalidCases.has(caseIndex)) continue;
      invalidCases.add(caseIndex);
      const caseDraft = executable[caseIndex].item;
      for (const obligationId of strings(caseDraft.obligation_ids)) block(
        obligationId, 'CASE_SHARES_BLOCKED_OBLIGATION', strings(caseDraft.evidence_refs), null
      );
    }
  }

  return {
    ...classification,
    grounded: executable.filter((item, index) => item.lane === 'grounded' && !invalidCases.has(index)).map((item) => item.item),
    conditional: executable.filter((item, index) => item.lane === 'conditional' && !invalidCases.has(index)).map((item) => item.item),
    blocked: [...blockedByObligation.values()].sort((left, right) =>
      compareCodePoints(String(left.obligation_id), String(right.obligation_id)))
  };
}

/** @param {string} reason */
function missingType(reason) {
  if (reason.includes('ORACLE')) return 'oracle';
  if (reason.includes('CONFLICT')) return 'source-conflict';
  if (reason.includes('CAPABILITY') || reason.includes('OBSERVER') || reason.includes('CONTROL')) return 'testability';
  if (reason.includes('EXCLUSION')) return 'exclusion';
  return 'formal-test-point';
}

/** @param {Record<string, unknown>} obligation @param {string} reason */
function semanticRefs(obligation, reason) {
  const refs = new Set([
    ...strings(obligation.source_claim_ids),
    ...strings(obligation.required_oracle_refs),
    ...strings(obligation.view_element_refs)
  ]);
  if (refs.size === 0) refs.add(String(obligation.obligation_id));
  if (reason.includes('CONFLICT')) refs.add('unresolved-source-policy');
  return [...refs].sort(compareCodePoints);
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations */
function bindBlockedRootIdentity(classification, obligations) {
  const obligationById = new Map(obligations.map((item) => [String(item.obligation_id), item]));
  const blocked = records(classification.blocked).map((item) => {
    const obligation = obligationById.get(String(item.obligation_id)) ?? {};
    const signature = {
      missing_type: missingType(String(item.reason)),
      semantic_refs: semanticRefs(obligation, String(item.reason)),
      scope: String(obligation.scope ?? '')
    };
    return { ...item, root_issue_id: stableId('root', signature) };
  });
  return { ...classification, blocked };
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations */
function blockedDescriptors(classification, obligations) {
  const obligationById = new Map(obligations.map((item) => [String(item.obligation_id), item]));
  return records(classification.blocked).map((item) => {
    const obligation = obligationById.get(String(item.obligation_id)) ?? {};
    const reason = String(item.reason);
    const type = missingType(reason);
    const scope = String(obligation.scope ?? 'unknown');
    const technical = reason.includes('UNAVAILABLE') || reason.includes('UNKNOWN')
      || reason.includes('MISSING_CAPABILITY') || reason.includes('MISSING_OBSERVER')
      || reason.includes('MISSING_CONTROL');
    return {
      obligation_id: String(item.obligation_id), missing_type: type,
      semantic_refs: semanticRefs(obligation, reason), scope,
      risk: String(item.risk), reason, evidence_refs: strings(item.evidence_refs).sort(compareCodePoints),
      answerable: !technical,
      question: `Clarification required for ${type} in ${scope}.`
    };
  }).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
}

/** @param {Record<string, unknown>} obligation @param {Record<string, unknown>[]} cases @param {Map<string, Record<string, unknown>>} claimsById @param {string} lane @param {Record<string, unknown>|undefined} notApplicable */
function evidenceLevel(obligation, cases, claimsById, lane, notApplicable) {
  if (lane === 'blocked') return 'E0';
  if (lane === 'conditional') return 'E1';
  if (lane === 'not_applicable') {
    const claim = claimsById.get(String(notApplicable?.exclusion_claim_id));
    return claim?.level === 'E2' ? 'E2' : 'E3';
  }
  const refs = new Set([...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)]);
  for (const item of cases) for (const ref of strings(item.evidence_refs)) refs.add(ref);
  for (const ref of refs) if (claimsById.get(ref)?.level === 'E2') return 'E2';
  return 'E3';
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations @param {Map<string, Record<string, unknown>>} claimsById */
function semanticSnapshot(classification, obligations, claimsById) {
  /** @type {Map<string, {lane:string,reason:string|null,cases:Record<string, unknown>[],notApplicable?:Record<string, unknown>}>} */
  const disposition = new Map();
  for (const item of records(classification.grounded)) for (const id of strings(item.obligation_ids)) {
    const existing = disposition.get(id) ?? { lane: 'grounded', reason: null, cases: [] };
    existing.cases.push(item);
    disposition.set(id, existing);
  }
  for (const item of records(classification.conditional)) for (const id of strings(item.obligation_ids)) {
    const existing = disposition.get(id) ?? { lane: 'conditional', reason: null, cases: [] };
    existing.cases.push(item);
    disposition.set(id, existing);
  }
  for (const item of records(classification.blocked)) disposition.set(String(item.obligation_id), {
    lane: 'blocked', reason: String(item.reason), cases: []
  });
  for (const item of records(classification.not_applicable)) disposition.set(String(item.obligation_id), {
    lane: 'not_applicable', reason: null, cases: [], notApplicable: item
  });
  const points = obligations.map((obligation) => {
    const state = disposition.get(String(obligation.obligation_id));
    const lane = state?.lane ?? 'blocked';
    return {
      obligation_id: String(obligation.obligation_id),
      evidence_level: evidenceLevel(obligation, state?.cases ?? [], claimsById, lane, state?.notApplicable),
      classification: lane,
      blocked_reason: lane === 'blocked' ? (state?.reason ?? 'FORMAL_DISPOSITION_MISSING') : null
    };
  }).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const ids = (/** @type {string} */ lane) => points.filter((item) => item.classification === lane)
    .map((item) => item.obligation_id).sort(compareCodePoints);
  const grounded = ids('grounded');
  const conditional = ids('conditional');
  const blocked = ids('blocked');
  const notApplicable = ids('not_applicable');
  const executableCount = grounded.length + conditional.length;
  const riskById = new Map(obligations.map((item) => [String(item.obligation_id), String(item.risk)]));
  const hasHighBlocked = blocked.some((id) => riskById.get(id) === 'critical' || riskById.get(id) === 'high');
  const applicableCount = points.length - notApplicable.length;
  const deliveryStatus = applicableCount === 0 ? 'no_applicable_formal_test_points'
    : executableCount === 0 && blocked.length > 0 ? 'no_deterministic_cases'
      : executableCount > 0 && hasHighBlocked ? 'critical_gaps'
        : 'executable_subset_ready';
  return {
    formal_test_points: points,
    coverage_denominator: points.length,
    delivery_sections: {
      grounded, conditional, blocked,
      exploratory: records(classification.exploratory).map((item) => String(item.exploratory_id)).sort(compareCodePoints),
      coverage: { formal_denominator: points.length },
      quality: { delivery_status: deliveryStatus }
    }
  };
}

/**
 * Evaluate one complete immutable revision without filesystem or network I/O.
 * This export is an internal test seam; `advanceStrict(runDirectory)` remains
 * the sole external Module Interface.
 * @param {unknown} submittedInput
 * @param {{interactionPolicy:'pause_for_clarification'|'record_only'}} options
 */
export function evaluateRevision(submittedInput, options) {
  const normalized = normalizeInput(submittedInput);
  const initialRevision = isRecord(normalized.input) && Number.isSafeInteger(normalized.input.source_revision)
    ? Number(normalized.input.source_revision) : 0;
  if (!isRecord(options) || !POLICIES.has(String(options.interactionPolicy))) normalized.diagnostics.push(diagnostic(
    'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy',
    'pure core accepts only the two frozen internal interaction policies'
  ));
  if (normalized.diagnostics.length > 0 || !normalized.input) return revisionRequired(
    'schema', initialRevision, normalized.diagnostics
  );
  const input = normalized.input;
  const sourceRevision = Number(input.source_revision);
  try {
    const schemaDiagnostics = validateArtifactSchemas(input);
    if (schemaDiagnostics.length > 0) return revisionRequired('schema', sourceRevision, schemaDiagnostics);

    const sourcePolicy = resolveSourcePolicy(input.source_pack);
    const policyDiagnostics = diagnosticArray(sourcePolicy.diagnostics);
    if (policyDiagnostics.length > 0) return revisionRequired('source_policy', sourceRevision, policyDiagnostics);

    const evidence = validateEvidenceGraph(input.source_pack, input.evidence_claims);
    const evidenceDiagnostics = diagnosticArray(evidence.diagnostics);
    if (evidenceDiagnostics.length > 0) return revisionRequired('evidence_claims', sourceRevision, evidenceDiagnostics);
    const graph = evidenceContext(input, evidence.claimsById, records(sourcePolicy.conflicts));

    const viewValidation = validateBehaviorViews(graph, input.behavior_views);
    const interactionAudit = auditInteractionMatrix(input.behavior_views);
    const viewDiagnostics = [
      ...diagnosticArray(viewValidation.diagnostics), ...diagnosticArray(interactionAudit.diagnostics)
    ];
    if (viewDiagnostics.length > 0) return revisionRequired('behavior_views', sourceRevision, viewDiagnostics);

    let obligations;
    try {
      obligations = compileObligations(graph, input.behavior_views);
    } catch (error) {
      if (error instanceof ObligationCompilationError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }

    let classification = classifyCaseDrafts({
      sourceRevision,
      evidence: {
        claimsById: graph.claimsById,
        factLedger: graph.factLedger,
        conflicts: graph.conflicts
      },
      obligations,
      caseDrafts: input.case_drafts
    });
    if (classification.diagnostics.length > 0) return revisionRequired(
      'classification', sourceRevision, diagnosticArray(classification.diagnostics)
    );
    classification = applyLocalConflictBlocks(
      classification, records(obligations.obligations), graph.claimsById,
      /** @type {Record<string, unknown>} */ (input.source_pack), graph.conflicts
    );
    classification = bindBlockedRootIdentity(classification, records(obligations.obligations));
    const semantics = semanticSnapshot(
      classification, records(obligations.obligations), graph.claimsById
    );
    const clarificationInput = /** @type {Record<string, unknown>} */ (input.clarification);
    const clarification = evaluateClarification({
      source_revision: sourceRevision,
      blocked_obligations: blockedDescriptors(classification, records(obligations.obligations)),
      prior_state: clarificationInput.prior_state,
      append_batch: clarificationInput.append_batch,
      semantic_snapshot: semantics
    }, /** @type {'pause_for_clarification'|'record_only'} */ (options.interactionPolicy));
    if (clarification.diagnostics.length > 0) return revisionRequired(
      'clarification', sourceRevision, diagnosticArray(clarification.diagnostics)
    );
    if (clarification.action === 'need_user_answers') return {
      status: 'need_user_answers', source_revision: sourceRevision,
      pending_root_issues: structuredClone(clarification.pending_root_issues),
      clarification_state: structuredClone(clarification.state),
      semantic_snapshot: structuredClone(clarification.semantic_snapshot),
      diagnostics: []
    };

    let bundle;
    try {
      bundle = buildBundle({
        schema_version: '1.0.0', source_revision: sourceRevision,
        compiler_version: input.compiler_version, lineage: input.lineage,
        evidence_claims: input.evidence_claims, obligations_artifact: obligations,
        classification, clarification,
        limits: input.limits, expert_recall_limits: input.expert_recall_limits
      });
    } catch (error) {
      if (error instanceof BundleReconciliationError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    let markdown;
    try {
      markdown = renderMarkdown(bundle);
    } catch (error) {
      if (error instanceof BundleRenderError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    return {
      status: 'finished', source_revision: sourceRevision,
      bundle, bundle_digest: digest(bundle), markdown, markdown_digest: digest(markdown),
      clarification_state: structuredClone(clarification.state), diagnostics: []
    };
  } catch {
    return revisionRequired('core', sourceRevision, [diagnostic(
      'classification', 'CORE_EVALUATION_FAILED', '/',
      'complete revision evaluation failed without exposing an internal exception'
    )]);
  }
}
