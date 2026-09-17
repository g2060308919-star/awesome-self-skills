import behaviorSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };

import { canonicalStringify, digest } from './canonical.mjs';
import { validateDesignAssuranceV4 } from './design-assurance-v4.mjs';
import {
  compileRelativeBaselineCaseV4,
  compileSemanticCaseDocumentV4,
  validateRelativeBaselineEvidenceV4,
  validateTestValueOriginsV4
} from './case-semantics-v4.mjs';
import { classifyFinalOutcomeV4 } from './final-outcome-v4.mjs';
import { canonicalIds, compareScalar, compileNotApplicable, riskKinds } from './not-applicable.mjs';
import {
  aggregateBusinessOutcomeCoverageV4,
  assembleObligationsArtifactV4,
  compileBusinessOutcomesV4
} from './obligations/business-outcomes-v4.mjs';
import { compileCaseOrdering, compileOrderingRegistry } from './ordering-registry.mjs';
import { compileSemanticGapRootsV4 } from './semantic-gaps-v4.mjs';
import {
  deriveSemanticDeliveryGateV4,
  requiresRecoverableCriticalQuestionV4
} from './semantic-delivery-gate-v4.mjs';
import {
  compileScopeManifestV4,
  validateInteractionReviewV4
} from './scope-manifest-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { routeGapCategoryV4 } from './gap-kinds-v4.mjs';
import { compileSourceEvidence } from './source-compiler-v4.mjs';
import { isGeneralQualityV4Contract, v4ContractForSchema } from './v4-contract.mjs';

const ALLOWED_SYSTEM_KEYS = new Set([
  'source', 'topology', 'interaction', 'behavior_evidence', 'ordering',
  'claim_assessments', 'decisions', 'execution_resources', 'semantic_evidence'
]);

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {string} stage @param {any[]} diagnostics */
function needRevision(stage, diagnostics) {
  const route = routeGapCategoryV4('adapter_revision', { delivery_intent: 'case_document' });
  return {
    status: route.status, stage,
    diagnostics: diagnostics.map(item => ({
      category: item.category ?? 'adapter_revision',
      code: item.code ?? 'ARTIFACT_INVALID',
      path: item.path ?? '/',
      message: item.message ?? 'The submitted artifact failed v4 validation.'
    }))
  };
}

/** @param {string} code @param {any[]} [diagnostics] */
function qualityFailure(code, diagnostics = []) {
  const route = routeGapCategoryV4('quality_failure', { delivery_intent: 'case_document' });
  return {
    status: route.status, result_kind: route.result_kind, reason_code: code,
    diagnostics: diagnostics.length ? diagnostics : [{
      category: 'quality_failure', code, path: '/',
      message: 'The canonical v4 Case Document quality gate did not close.'
    }]
  };
}

/** @param {unknown} artifact @param {any} schema @param {string} stage */
function validateArtifact(artifact, schema, stage) {
  const diagnostics = validateAgainstSchema(artifact, schema);
  return diagnostics.length ? needRevision(stage, diagnostics) : null;
}

/** @param {any[]} points @param {any[]} outcomes */
function pointsWithRoles(points, outcomes) {
  const byId = new Map(outcomes.map(outcome => [outcome.outcome_id, outcome]));
  return points.map(point => ({
    formal_test_point_id: point.formal_test_point_id,
    outcome_id: point.outcome_id,
    acceptance_role: byId.get(point.outcome_id)?.acceptance_role
  }));
}

/** @param {any} evidence @param {'pre_case'|'post_case'} phase @param {any} contract */
function semanticRoots(evidence, phase, contract) {
  return compileSemanticGapRootsV4({
    contract,
    facts: evidence.fact_ledger,
    claims: evidence.claims,
    diagnostic_candidates: evidence.semantic_gaps.filter(
      (/** @type {any} */ gap) => gap.discovery_phase === phase
    ),
    discovery_phase: phase
  });
}

/** @param {any[]} roots @param {any[]} rootStatuses */
function rootState(roots, rootStatuses) {
  const statusById = new Map(rootStatuses.map(item => [item.root_issue_id, item]));
  return roots.map(root => {
    const state = statusById.get(root.root_issue_id);
    return {
      ...root,
      status: state?.status ?? 'presented',
      state_root_version_digest: state?.root_version_digest ?? null
    };
  });
}

/** @param {any[]} roots @param {any} [contract] */
function openRoots(roots, contract) {
  return roots.filter(root => root.status === 'presented'
    || (isGeneralQualityV4Contract(contract) && requiresRecoverableCriticalQuestionV4(root, root)));
}

/** @param {any} behavior @param {any} scopeManifest @param {any} semanticEvidence */
function compileNotApplicableReview(behavior, scopeManifest, semanticEvidence) {
  const outcomes = new Map(behavior.outcomes.map((/** @type {any} */ item) => [item.outcome_id, item]));
  const points = behavior.formal_test_points.map((/** @type {any} */ point) => ({
    point, outcome: outcomes.get(point.outcome_id)
  }));
  const primaryModules = scopeManifest.modules.filter((/** @type {any} */ item) => item.role === 'primary');
  const subjects = [
    ...points.map((/** @type {any} */ entry) => ({
      subject: { kind: 'formal_test_point', formal_test_point_id: entry.point.formal_test_point_id },
      acceptance_role: entry.outcome.acceptance_role
    })),
    ...primaryModules.flatMap((/** @type {any} */ module) => riskKinds.map(risk_kind => ({
      subject: { kind: 'risk', module_id: module.module_id, risk_kind },
      acceptance_role: 'primary_acceptance'
    })))
  ];
  /** @type {any[]} */ const requests = [];
  for (const declaration of semanticEvidence.not_applicable_assertions ?? []) {
    let subject = declaration.subject;
    if (subject.kind === 'formal_outcome') {
      const matches = points.filter((/** @type {any} */ entry) => entry.outcome.fact_id === subject.fact_id
        && canonicalStringify(entry.outcome.condition) === canonicalStringify(subject.condition));
      if (matches.length !== 1) throw new TypeError('NOT_APPLICABLE_OUTCOME_UNRESOLVED');
      subject = {
        kind: 'formal_test_point', formal_test_point_id: matches[0].point.formal_test_point_id
      };
      if (matches[0].outcome.acceptance_role !== declaration.acceptance_role) {
        throw new TypeError('NOT_APPLICABLE_ROLE_MISMATCH');
      }
    }
    requests.push({ ...declaration, subject });
  }
  const verified_bases = requests.map(({ reason, ...identity }) => identity);
  const context = { subjects, verified_bases };
  /** @type {Map<string,any>} */ const records = new Map();
  for (const request of requests) {
    const compiled = compileNotApplicable(request, context);
    const previous = records.get(compiled.not_applicable_record_id);
    if (previous && canonicalStringify(previous) !== canonicalStringify(compiled)) {
      throw new TypeError('NOT_APPLICABLE_RECORD_CONFLICT');
    }
    records.set(compiled.not_applicable_record_id, compiled);
  }
  return {
    records: [...records.values()].sort((a, b) => compareScalar(a.not_applicable_record_id, b.not_applicable_record_id)),
    context
  };
}

/** @param {any} behavior @param {any} scopeManifest @param {any[]} roots @param {any} exclusions @param {any} semanticEvidence */
function compileProductionRiskReview(behavior, scopeManifest, roots, exclusions, semanticEvidence) {
  const outcomeById = new Map(behavior.outcomes.map((/** @type {any} */ item) => [item.outcome_id, item]));
  const factModule = new Map(behavior.fact_modules.map((/** @type {any} */ item) => [item.fact_id, item.module_id]));
  const pointTargets = behavior.formal_test_points.map((/** @type {any} */ point) => ({
    point, outcome: outcomeById.get(point.outcome_id)
  }));
  const primaryModuleIds = scopeManifest.modules.filter((/** @type {any} */ module) => module.role === 'primary')
    .map((/** @type {any} */ module) => module.module_id);
  /** @type {any[]} */ const ledger = [];
  /** @type {any[]} */ const exploratory = [];
  /** @type {any[]} */ const formal_test_points = [];
  /** @type {any[]} */ const semantic_gaps = [];
  const assertions = semanticEvidence.risk_review_assertions ?? [];
  if (assertions.some((/** @type {any} */ item) => !primaryModuleIds.includes(item.module_id))) {
    throw new TypeError('RISK_MODULE_UNRESOLVED');
  }
  for (const moduleId of primaryModuleIds) for (const riskKind of riskKinds) {
    const pairAssertions = assertions.filter((/** @type {any} */ item) =>
      item.module_id === moduleId && item.risk_kind === riskKind);
    const formalAssertions = pairAssertions.filter((/** @type {any} */ item) => item.status === 'formal');
    const gapAssertions = pairAssertions.filter((/** @type {any} */ item) => item.status === 'semantic_gap');
    const formalTargets = pointTargets.filter((/** @type {any} */ entry) => factModule.get(entry.outcome.fact_id) === moduleId
      && formalAssertions.some((/** @type {any} */ item) => entry.outcome.claim_ids.includes(item.claim_id)));
    const gapTargets = roots.filter(root => root.subject_fact_ids.some((/** @type {string} */ id) => factModule.get(id) === moduleId)
      && gapAssertions.some((/** @type {any} */ item) => root.source_claim_ids.includes(item.claim_id)));
    const naTargets = exclusions.records.filter((/** @type {any} */ item) => item.subject.kind === 'risk'
      && item.subject.module_id === moduleId && item.subject.risk_kind === riskKind
      && item.acceptance_role === 'primary_acceptance');
    if (formalAssertions.length && !formalTargets.length || gapAssertions.length && !gapTargets.length) {
      throw new TypeError('RISK_TARGET_UNRESOLVED');
    }
    const activeKinds = [formalTargets.length > 0, gapTargets.length > 0, naTargets.length > 0].filter(Boolean).length;
    if (activeKinds > 1) throw new TypeError('RISK_DISPOSITION_CONFLICT');
    if (formalTargets.length) {
      const claimIds = canonicalIds(formalAssertions.map((/** @type {any} */ item) => item.claim_id));
      if (formalTargets.some((/** @type {any} */ entry) => claimIds.some(id => !entry.outcome.claim_ids.includes(id)))) {
        throw new TypeError('RISK_FORMAL_BASIS_AMBIGUOUS');
      }
      const ids = canonicalIds(formalTargets.map((/** @type {any} */ entry) => entry.point.formal_test_point_id));
      ledger.push({
        module_id: moduleId, risk_kind: riskKind, acceptance_role: 'primary_acceptance', status: 'formal',
        review_basis: { kind: 'evidence', claim_ids: claimIds }, formal_test_point_ids: ids
      });
      for (const entry of formalTargets) formal_test_points.push({
        module_id: moduleId, risk_kind: riskKind, acceptance_role: entry.outcome.acceptance_role,
        formal_test_point_id: entry.point.formal_test_point_id, claim_ids: [...entry.outcome.claim_ids]
      });
      continue;
    }
    if (gapTargets.length) {
      const basisKeys = new Map(gapTargets.map(root => [canonicalStringify({
        subject_fact_ids: canonicalIds(root.subject_fact_ids), missing_aspect: root.missing_aspect
      }), root]));
      if (basisKeys.size !== 1) throw new TypeError('RISK_SEMANTIC_GAP_BASIS_AMBIGUOUS');
      const root = gapTargets[0];
      const basis = {
        kind: 'semantic_gap_analysis', subject_fact_ids: canonicalIds(root.subject_fact_ids),
        missing_aspect: root.missing_aspect
      };
      ledger.push({
        module_id: moduleId, risk_kind: riskKind, acceptance_role: 'primary_acceptance', status: 'semantic_gap',
        review_basis: basis, semantic_gap_ids: canonicalIds(gapTargets.map(item => item.semantic_gap_id))
      });
      for (const item of gapTargets) semantic_gaps.push({
        module_id: moduleId, risk_kind: riskKind, acceptance_role: 'primary_acceptance',
        semantic_gap_id: item.semantic_gap_id, subject_fact_ids: canonicalIds(item.subject_fact_ids),
        missing_aspect: item.missing_aspect
      });
      continue;
    }
    if (naTargets.length) {
      const bases = new Map(naTargets.map((/** @type {any} */ item) => [canonicalStringify(item.basis), item.basis]));
      if (bases.size !== 1) throw new TypeError('RISK_NOT_APPLICABLE_BASIS_AMBIGUOUS');
      ledger.push({
        module_id: moduleId, risk_kind: riskKind, acceptance_role: 'primary_acceptance', status: 'not_applicable',
        review_basis: structuredClone(naTargets[0].basis),
        not_applicable_record_ids: canonicalIds(naTargets.map((/** @type {any} */ item) => item.not_applicable_record_id))
      });
      continue;
    }
    const policyId = `risk-catalog.${riskKind.replaceAll('_', '-')}`;
    const identity = {
      module_id: moduleId, risk_kind: riskKind,
      acceptance_role: 'primary_acceptance', policy_id: policyId, policy_version: '1.0.0'
    };
    const exploratory_id = `EXP-${digest(identity)}`;
    exploratory.push({ ...identity, exploratory_id });
    ledger.push({
      module_id: moduleId, risk_kind: riskKind, acceptance_role: 'primary_acceptance', status: 'exploratory',
      review_basis: { kind: 'risk_catalog', policy_id: policyId, policy_version: '1.0.0' },
      exploratory_ids: [exploratory_id]
    });
  }
  exploratory.sort((a, b) => compareScalar(a.exploratory_id, b.exploratory_id));
  ledger.sort((a, b) => compareScalar(a.module_id, b.module_id) || compareScalar(a.risk_kind, b.risk_kind));
  return {
    exploratory, ledger,
    context: {
      primary_module_ids: primaryModuleIds, formal_test_points, semantic_gaps,
      exploratory, not_applicable_records: exclusions.records,
      not_applicable_context: exclusions.context
    }
  };
}

/** @param {any[]} records @param {any} behavior */
function presentNotApplicable(records, behavior) {
  const pointById = new Map(behavior.formal_test_points.map((/** @type {any} */ item) => [item.formal_test_point_id, item]));
  const outcomeById = new Map(behavior.outcomes.map((/** @type {any} */ item) => [item.outcome_id, item]));
  const moduleByFact = new Map(behavior.fact_modules.map((/** @type {any} */ item) => [item.fact_id, item.module_id]));
  return records.map(record => {
    if (record.subject.kind === 'risk') return {
      not_applicable_record_id: record.not_applicable_record_id, module_id: record.subject.module_id,
      subject: `风险 ${record.subject.risk_kind}`, reason: record.reason
    };
    const point = pointById.get(record.subject.formal_test_point_id);
    const outcome = outcomeById.get(point?.outcome_id);
    return {
      not_applicable_record_id: record.not_applicable_record_id,
      module_id: moduleByFact.get(outcome?.fact_id), subject: outcome?.expected,
      reason: record.reason
    };
  });
}

/** Materialize the four-step relative-baseline protocol from the verified
 * declaration while preserving the Adapter's business title and selectors.
 * @param {any[]} candidates @param {any} semanticEvidence @param {any[]} claimAssessments */
function materializeRelativeBaselines(candidates, semanticEvidence, claimAssessments) {
  const assessmentById = new Map((Array.isArray(claimAssessments) ? claimAssessments : [])
    .map((/** @type {any} */ item) => [item.claim_id, item]));
  /** @type {any[]} */ const diagnostics = [];
  const cases = candidates.map(candidate => {
    if (!candidate.baseline_spec) return candidate;
    const assertion = semanticEvidence.baseline_assertions.find((/** @type {any} */ item) =>
      candidate.baseline_spec.claim_ids.includes(item.claim_id));
    if (!assertion) return candidate;
    const support = candidate.baseline_spec.claim_ids.map((/** @type {string} */ claimId) => {
      const assessment = assessmentById.get(claimId);
      const source = semanticEvidence.baseline_assertions.find((/** @type {any} */ item) => item.claim_id === claimId);
      return {
        claim_id: claimId, level: assessment?.level, scope: source?.scope_ref,
        support_review: assessment?.support_review
      };
    });
    const result = compileRelativeBaselineCaseV4({
      case_context: {
        module_id: candidate.module_id, scope_ref: assertion.scope_ref,
        business_scope: candidate.title,
        operation: candidate.steps.map((/** @type {any} */ item) => item.action).join('；'),
        priority: candidate.priority, ordering: candidate.ordering,
        acceptance_role: candidate.acceptance_role, fact_ids: candidate.fact_ids,
        primary_test_point_id: candidate.primary_test_point_id,
        business_preconditions: candidate.business_preconditions,
        data_conditions: candidate.data_conditions
      },
      baseline_spec: candidate.baseline_spec
    }, { claim_assessments: support });
    diagnostics.push(...result.diagnostics);
    if (result.semantic_gaps.length || result.cases.length !== 1) {
      diagnostics.push({
        category: 'adapter_revision', code: 'BASELINE_DECLARATION_INCOMPLETE', path: '/baseline_spec',
        message: 'A persisted relative baseline must already contain a complete source-declared comparison contract.'
      });
      return candidate;
    }
    return {
      ...candidate, steps: result.cases[0].steps, oracles: result.cases[0].oracles,
      baseline_spec: result.cases[0].baseline_spec
    };
  });
  return { cases, diagnostics };
}

/** @param {any} coverage @param {any[]} exploratory @param {any[]} notApplicable @param {any[]} gaps */
function coverageSummary(coverage, exploratory, notApplicable, gaps) {
  /** @param {string} acceptanceRole */
  const lane = acceptanceRole => {
    const entries = coverage.ledger.filter((/** @type {any} */ item) => item.acceptance_role === acceptanceRole);
    return {
      reviewed_formal_test_point_count: entries.length,
      covered_formal_test_point_count: entries.filter((/** @type {any} */ item) => ['Grounded', 'Conditional'].includes(item.classification)).length,
      not_applicable_formal_test_point_count: entries.filter((/** @type {any} */ item) => item.classification === 'NotApplicable').length
    };
  };
  return {
    primary: lane('primary_acceptance'), boundary: lane('dependency_contract'),
    semantic_gap_count: gaps.length, exploratory_count: exploratory.length,
    not_applicable_count: notApplicable.length
  };
}

/** @param {any[]} roots @param {any} compiled @param {any} contract @param {any} semanticDeliveryGate */
function presentRoots(roots, compiled, contract, semanticDeliveryGate) {
  const outcomes = new Map(compiled.outcomes.map((/** @type {any} */ outcome) => [outcome.outcome_id, outcome]));
  return roots.map(root => {
    const affected = compiled.formal_test_points.filter((/** @type {any} */ point) => {
      const outcome = outcomes.get(point.outcome_id);
      return root.subject_fact_ids.includes(outcome?.fact_id)
        || root.affected_test_point_ids.includes(point.formal_test_point_id);
    }).map((/** @type {any} */ point) => ({
      item_kind: 'formal_test_point', item_id: point.formal_test_point_id,
      display_name: outcomes.get(point.outcome_id)?.expected ?? root.unresolved_outcome
    }));
    if (!affected.length) affected.push({
      item_kind: 'business_outcome', item_id: root.semantic_gap_id,
      display_name: root.unresolved_outcome
    });
    const strict = isGeneralQualityV4Contract(contract);
    const resolutionBasis = strict
      ? semanticDeliveryGate?.resolved_critical_roots?.find(
          (/** @type {any} */ item) => item.root_issue_id === root.root_issue_id
        ) ?? null
      : null;
    return {
      root_issue_id: root.root_issue_id,
      status: strict ? root.status
        : root.status === 'resolved_final' || root.status === 'resolved_temporary' ? 'resolved' : root.status,
      title: root.missing_aspect, business_object: root.scope_ref,
      question: root.question, why_needed: root.why_needed,
      decision_impact: root.decision_impact, unresolved_outcome: root.unresolved_outcome,
      affected_business_items: affected,
      ...(strict ? {
        root_version_digest: root.root_version_digest,
        acceptance_impact: structuredClone(root.acceptance_impact),
        critical_resolution_basis: resolutionBasis ? structuredClone(resolutionBasis) : null
      } : {})
    };
  });
}

/**
 * Pure v4 production orchestration. The first argument remains exactly the four
 * Agent-writable artifacts. Raw acquisition material and compiler verification
 * registries are private system state and never enter the semantic Case identity.
 *
 * @param {unknown} submittedArtifacts
 * @param {unknown} submittedSystem
 * @returns {any}
 */
export function compileCaseDocumentRevisionV4(submittedArtifacts, submittedSystem) {
  if (!record(submittedArtifacts) || Object.keys(submittedArtifacts).length !== 4
    || !['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'].every(key => Object.hasOwn(submittedArtifacts, key))) {
    return needRevision('source_pack', [{ code: 'V4_ARTIFACT_SET_INVALID', path: '/', message: 'Exactly four Agent artifacts are required.' }]);
  }
  if (!record(submittedSystem) || Object.keys(submittedSystem).some(key => !ALLOWED_SYSTEM_KEYS.has(key))) {
    return qualityFailure('V4_SYSTEM_CONTEXT_INVALID');
  }
  const artifacts = /** @type {any} */ (structuredClone(submittedArtifacts));
  const system = /** @type {any} */ (submittedSystem);
  const sourcePack = artifacts.source_pack;
  const contract = record(sourcePack) ? v4ContractForSchema(sourcePack.schema_version) : null;
  if (!contract) {
    return needRevision('source_pack', [{ code: 'V4_SOURCE_PACK_REQUIRED', path: '/schema_version', message: 'The v4 pipeline requires a supported explicit v4 contract.' }]);
  }
  const revision = sourcePack.source_revision;
  for (const stage of ['evidence_claims']) {
    const artifact = artifacts[stage];
    if (record(artifact) && (artifact.schema_version !== contract.schema_version
      || (artifact.source_revision !== undefined && artifact.source_revision !== revision))) {
      return needRevision(stage, [{
        category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
        message: 'Every Agent artifact must bind the active source revision and explicit v4 contract.'
      }]);
    }
  }
  const source = compileSourceEvidence({
    source_pack: sourcePack, evidence_claims: artifacts.evidence_claims
  }, system.source ?? {});
  if (source.status === 'need_artifact') return source;
  if (source.status !== 'accepted') return needRevision('evidence_claims', source.diagnostics ?? []);
  const evidence = artifacts.evidence_claims;
  const semanticEvidence = system.semantic_evidence ?? {
    baseline_assertions: [], value_claims: [], supported_claim_ids: [], derivations: [],
    risk_review_assertions: [], not_applicable_assertions: [], diagnostics: []
  };
  if (Array.isArray(semanticEvidence.diagnostics) && semanticEvidence.diagnostics.length) {
    return needRevision('evidence_claims', semanticEvidence.diagnostics);
  }
  const scope = compileScopeManifestV4({
    discovery_digest: evidence.topology_discovery.discovery_digest,
    primary_surface: evidence.scope_manifest.primary_surface,
    topology_review: evidence.topology_review,
    topology_dispositions: evidence.topology_dispositions
  }, system.topology);
  if (scope.diagnostics.length) return needRevision('evidence_claims', scope.diagnostics);
  if (canonicalStringify(scope.discovery) !== canonicalStringify(evidence.topology_discovery)
    || canonicalStringify(scope.scope_manifest) !== canonicalStringify(evidence.scope_manifest)) {
    return needRevision('evidence_claims', [{
      category: 'adapter_revision', code: 'SCOPE_RECOMPUTATION_MISMATCH', path: '/scope_manifest',
      message: 'The submitted topology discovery and Scope Manifest must equal compiler recomputation.'
    }]);
  }
  const interactionDiagnostics = validateInteractionReviewV4(
    scope.scope_manifest, evidence.interaction_review, system.interaction
  );
  if (interactionDiagnostics.length) return needRevision('evidence_claims', interactionDiagnostics);

  let preCaseRoots;
  try { preCaseRoots = rootState(semanticRoots(evidence, 'pre_case', contract), system.decisions?.root_statuses ?? []); } catch (error) {
    return needRevision('evidence_claims', [{
      code: error instanceof Error ? error.message : 'SEMANTIC_GAP_INVALID', path: '/semantic_gaps',
      message: 'Semantic-gap inputs must bind verified Facts and Claims.'
    }]);
  }
  const pendingPreCase = openRoots(preCaseRoots, contract);
  if (pendingPreCase.length) return {
    status: 'need_user_answers', phase: 'requirements_analysis', semantic_roots: pendingPreCase,
    non_blocking_diagnostics: []
  };

  for (const stage of ['behavior_views', 'case_drafts']) {
    const artifact = artifacts[stage];
    if (record(artifact) && (artifact.schema_version !== contract.schema_version
      || (artifact.source_revision !== undefined && artifact.source_revision !== revision))) {
      return needRevision(stage, [{
        category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
        message: 'Every Agent artifact must bind the active source revision and explicit v4 contract.'
      }]);
    }
  }

  const behaviorSchemaFailure = validateArtifact(artifacts.behavior_views, behaviorSchema, 'behavior_views');
  if (behaviorSchemaFailure) return behaviorSchemaFailure;
  if (isGeneralQualityV4Contract(contract)) {
    const assurance = validateDesignAssuranceV4(artifacts.behavior_views.design_assurance, {
      source_claim_ids: evidence.claims.map((/** @type {any} */ item) => item.claim_id),
      semantic_gap_ids: evidence.semantic_gaps.map((/** @type {any} */ item) => item.semantic_gap_id),
      view_element_ids: artifacts.behavior_views.views.flatMap(
        (/** @type {any} */ view) => view.elements.map((/** @type {any} */ item) => item.element_id)
      )
    });
    if (assurance.diagnostics.length) return needRevision('behavior_views', assurance.diagnostics);
  }
  const behavior = compileBusinessOutcomesV4(artifacts.behavior_views, system.behavior_evidence);
  if (behavior.kind === 'need_revision') return needRevision('behavior_views', behavior.diagnostics);
  if (behavior.kind !== 'compiled') return qualityFailure('BUSINESS_OUTCOME_COMPILATION_FAILED', behavior.diagnostics);
  const caseSchemaFailure = validateArtifact(artifacts.case_drafts, caseDraftsSchema, 'case_drafts');
  if (caseSchemaFailure) return caseSchemaFailure;
  for (const candidate of artifacts.case_drafts.cases) {
    const diagnostics = validateRelativeBaselineEvidenceV4(candidate, semanticEvidence);
    if (diagnostics.length) return needRevision('case_drafts', diagnostics);
  }
  const materializedDrafts = materializeRelativeBaselines(
    artifacts.case_drafts.cases, semanticEvidence, system.claim_assessments
  );
  if (materializedDrafts.diagnostics.length) return needRevision('case_drafts', materializedDrafts.diagnostics);
  const formalPoints = pointsWithRoles(behavior.formal_test_points, behavior.outcomes);
  let semantic;
  try {
    semantic = compileSemanticCaseDocumentV4({
      source_revision: revision, case_drafts: materializedDrafts.cases,
      formal_test_points: formalPoints,
      claim_assessments: system.claim_assessments
    }, contract);
  } catch (error) {
    return needRevision('case_drafts', [{
      category: 'adapter_revision', code: error instanceof Error ? error.message : 'CASE_COMPILATION_FAILED',
      path: '/cases', message: 'Case Drafts must close one verified business result each.'
    }]);
  }

  let postCaseRoots;
  try { postCaseRoots = rootState(semanticRoots(evidence, 'post_case', contract), system.decisions?.root_statuses ?? []); } catch (error) {
    return needRevision('evidence_claims', [{
      code: error instanceof Error ? error.message : 'SEMANTIC_GAP_INVALID', path: '/semantic_gaps',
      message: 'Post-case semantic-gap inputs must bind verified Facts and Claims.'
    }]);
  }
  const allRoots = [...preCaseRoots, ...postCaseRoots].filter((root, index, values) =>
    values.findIndex(candidate => candidate.root_issue_id === root.root_issue_id) === index);
  const semanticGapIds = canonicalIds(allRoots.map(root => root.semantic_gap_id));
  for (const [index, candidate] of materializedDrafts.cases.entries()) {
    const diagnostics = validateTestValueOriginsV4(candidate, {
      semantic_status: semantic.cases[index].semantic_status,
      claims: semanticEvidence.value_claims ?? [], derivations: semanticEvidence.derivations ?? [],
      supported_claim_ids: semanticEvidence.supported_claim_ids ?? [],
      semantic_gap_ids: semanticGapIds
    });
    if (diagnostics.length) {
      const quality = diagnostics.some((/** @type {any} */ item) => item.category === 'quality_failure');
      return quality ? qualityFailure(diagnostics[0].code, diagnostics) : needRevision('case_drafts', diagnostics);
    }
  }
  let orderingRegistry;
  try { orderingRegistry = compileOrderingRegistry(system.ordering); } catch (error) {
    return qualityFailure(error instanceof Error ? error.message : 'ORDERING_REGISTRY_INVALID');
  }
  const orderingInputs = semantic.cases.map((/** @type {any} */ candidate) => ({
    ...candidate,
    ordering: {
      business_flow_ref: candidate.ordering.business_flow_ref,
      page_action_ref: candidate.ordering.page_action_ref
    }
  }));
  const ordered = compileCaseOrdering(orderingInputs, formalPoints, orderingRegistry, system.ordering);
  if (ordered.kind !== 'ordered') return qualityFailure('CASE_ORDERING_FAILED', ordered.diagnostics);
  const pendingPostCase = openRoots(postCaseRoots, contract);

  const activeGaps = allRoots.filter(root => !['resolved_final', 'resolved_temporary', 'obsolete'].includes(root.status));
  const mappedGaps = activeGaps.map(root => ({
    semantic_gap_id: root.semantic_gap_id,
    formal_test_point_ids: canonicalIds(behavior.formal_test_points.filter((/** @type {any} */ point) => {
      const outcome = behavior.outcomes.find((/** @type {any} */ item) => item.outcome_id === point.outcome_id);
      return root.subject_fact_ids.includes(outcome?.fact_id)
        || root.affected_test_point_ids.includes(point.formal_test_point_id);
    }).map((/** @type {any} */ point) => point.formal_test_point_id))
  })).filter(gap => gap.formal_test_point_ids.length);
  let exclusions;
  try { exclusions = compileNotApplicableReview(behavior, scope.scope_manifest, semanticEvidence); } catch (error) {
    return qualityFailure(error instanceof Error ? error.message : 'NOT_APPLICABLE_COMPILATION_FAILED');
  }
  const notApplicable = exclusions.records;
  const excludedFormalPointIds = new Set(notApplicable.filter((/** @type {any} */ item) =>
    item.subject.kind === 'formal_test_point').map((/** @type {any} */ item) => item.subject.formal_test_point_id));
  if (ordered.cases.some((/** @type {any} */ item) => excludedFormalPointIds.has(item.primary_test_point_id))) {
    return qualityFailure('NOT_APPLICABLE_CASE_CONFLICT');
  }
  const primaryPointIds = new Set(behavior.formal_test_points.filter((/** @type {any} */ point) => {
    const outcome = behavior.outcomes.find((/** @type {any} */ item) => item.outcome_id === point.outcome_id);
    return outcome?.acceptance_role === 'primary_acceptance';
  }).map((/** @type {any} */ point) => point.formal_test_point_id));
  const excludedPrimaryPointIds = new Set(notApplicable.filter((/** @type {any} */ item) =>
    item.subject.kind === 'formal_test_point' && primaryPointIds.has(item.subject.formal_test_point_id))
    .map((/** @type {any} */ item) => item.subject.formal_test_point_id));
  if (ordered.cases.length === 0 && activeGaps.length === 0 && primaryPointIds.size > excludedPrimaryPointIds.size) {
    return qualityFailure('APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE');
  }
  const coverage = aggregateBusinessOutcomeCoverageV4(behavior, ordered.cases.map((/** @type {any} */ candidate) => ({
    case_id: candidate.case_id, primary_test_point_id: candidate.primary_test_point_id,
    valid: candidate.semantic_status !== 'Blocked', semantic_status: candidate.semantic_status
  })), {
    semantic_gaps: mappedGaps, not_applicable_records: notApplicable,
    not_applicable_context: exclusions.context
  });
  if (coverage.kind !== 'assessed') return qualityFailure(
    coverage.diagnostics?.[0]?.code ?? 'FORMAL_COVERAGE_FAILED', coverage.diagnostics
  );
  let risk;
  try {
    risk = compileProductionRiskReview(
      behavior, scope.scope_manifest, allRoots, exclusions, semanticEvidence
    );
  } catch (error) {
    return qualityFailure(error instanceof Error ? error.message : 'RISK_REVIEW_FAILED');
  }
  const obligations = assembleObligationsArtifactV4(behavior, risk.ledger, risk.context);
  if (obligations.kind !== 'assembled') return qualityFailure('RISK_REVIEW_FAILED', obligations.diagnostics);
  obligations.artifact.schema_version = contract.schema_version;
  if (pendingPostCase.length) return {
    status: 'need_user_answers', phase: 'case_design', semantic_roots: pendingPostCase,
    obligations: obligations.artifact, non_blocking_diagnostics: []
  };

  let semanticDeliveryGate;
  try {
    semanticDeliveryGate = deriveSemanticDeliveryGateV4({
      contract,
      roots: allRoots,
      rootStates: allRoots.map(root => ({
        root_issue_id: root.root_issue_id,
        root_version_digest: isGeneralQualityV4Contract(contract)
          ? root.state_root_version_digest : root.root_version_digest,
        status: root.status
      })),
      decisions: system.decisions?.records ?? []
    });
  } catch (error) {
    return qualityFailure(error instanceof Error ? error.message : 'SEMANTIC_DELIVERY_GATE_INVALID');
  }
  if (!semanticDeliveryGate.can_materialize_formal_case_document) return {
    status: 'need_user_answers', phase: 'case_design', result_kind: null,
    reason_code: 'CRITICAL_SEMANTIC_GAPS_REMAIN',
    semantic_roots: allRoots.filter(root =>
      semanticDeliveryGate.unresolved_critical_root_ids.includes(root.root_issue_id)),
    obligations: obligations.artifact, non_blocking_diagnostics: []
  };

  const closedForDelivery = activeGaps.filter(root => root.status === 'closed_for_delivery').length;
  const outcome = classifyFinalOutcomeV4({
    delivery_intent: 'case_document', cancelled: false, case_count: ordered.cases.length,
    applicable_formal_test_point_count: coverage.applicable_count,
    decidable_primary_acceptance_count: coverage.applicable_count,
    blocked_root_count: activeGaps.length, closed_for_delivery_root_count: closedForDelivery,
    open_semantic_gap_count: activeGaps.length - closedForDelivery,
    not_applicable_count: notApplicable.length,
    all_reviewed_formal_points_not_applicable: coverage.ledger.length > 0
      && coverage.ledger.every((/** @type {any} */ item) => item.classification === 'NotApplicable'),
    delivery_requested: Boolean(system.decisions?.delivery_requested),
    ...(isGeneralQualityV4Contract(contract) ? {
      strict_semantic_delivery: true,
      unresolved_critical_semantic_gap_count:
        semanticDeliveryGate.unresolved_critical_root_ids.length
    } : {})
  });
  if (outcome.status !== 'finished') return outcome.status === 'fatal'
    ? qualityFailure(outcome.reason_code) : { ...outcome, semantic_roots: openRoots(activeGaps) };
  const bundle = {
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    delivery_intent: 'case_document',
    source_revision: revision, result_kind: outcome.result_kind,
    ordered_case_ids: ordered.cases.map((/** @type {any} */ candidate) => candidate.case_id),
    scope_manifest: structuredClone(scope.scope_manifest), cases: ordered.cases,
    coverage: coverageSummary(coverage, risk.exploratory, notApplicable, activeGaps),
    // Canonical JSON is the audit authority: resolved/obsolete roots stay in
    // the ledger even though only active roots contribute to delivery gaps and
    // user-facing unresolved sections.
    semantic_root_groups: presentRoots(allRoots, behavior, contract, semanticDeliveryGate),
    exploratory: risk.exploratory.map((/** @type {any} */ item) => ({
      exploratory_id: item.exploratory_id, module_id: item.module_id,
      title: `探索 ${item.risk_kind}`, reason: `依据 ${item.policy_id}@${item.policy_version} 审阅通用风险。`
    })),
    not_applicable: presentNotApplicable(notApplicable, behavior), risk_review_ledger: risk.ledger
  };
  const bundleDiagnostics = validateAgainstSchema(bundle, testBundleSchema);
  if (bundleDiagnostics.length) return qualityFailure('CANONICAL_BUNDLE_INVALID', bundleDiagnostics);
  return { status: 'compiled', result_kind: outcome.result_kind, bundle, obligations: obligations.artifact };
}
