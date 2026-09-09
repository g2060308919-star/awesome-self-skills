import assert from 'node:assert/strict';
import test from 'node:test';

import testBundleSchema from '../../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { digest } from '../../src/canonical.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { v4PipelineFixture as fixture } from '../helpers/v4-pipeline-fixture.mjs';

test('the v4 production pipeline compiles all four Agent artifacts into one canonical Case Document bundle', () => {
  const input = fixture();
  const result = compileCaseDocumentRevisionV4(input.artifacts, input.system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.compiler_version, '0.5.0');
  assert.equal(result.bundle.schema_version, '4.0.0');
  assert.equal(result.bundle.delivery_intent, 'case_document');
  assert.equal(result.bundle.result_kind, 'delivered_cases');
  assert.equal(result.bundle.cases.length, 1);
  assert.equal(result.bundle.cases[0].semantic_status, 'Grounded');
  assert.deepEqual(result.bundle.ordered_case_ids, [result.bundle.cases[0].case_id]);
  assert.deepEqual(validateAgainstSchema(result.bundle, testBundleSchema), []);
  assert.equal(Object.hasOwn(result.bundle, 'runner_projection'), false);
});

test('case-document production compilation is invariant to absent, unknown, or verified execution resources', () => {
  const input = fixture();
  const baseline = compileCaseDocumentRevisionV4(input.artifacts, input.system);
  for (const execution_resources of [undefined, { environment: 'unknown' }, { environment: 'verified', account: 'verified' }]) {
    const system = execution_resources === undefined
      ? input.system : { ...input.system, execution_resources };
    const result = compileCaseDocumentRevisionV4(input.artifacts, system);
    assert.equal(result.status, 'compiled');
    assert.deepEqual(result.bundle, baseline.bundle);
  }
});

test('an applicable formal outcome with zero Cases is a quality failure, never an empty success', () => {
  const input = fixture();
  input.artifacts.case_drafts.cases = [];
  const result = compileCaseDocumentRevisionV4(input.artifacts, input.system);
  assert.deepEqual({ status: result.status, result_kind: result.result_kind, reason_code: result.reason_code }, {
    status: 'fatal', result_kind: 'quality_failure', reason_code: 'APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE'
  });
  assert.equal(result.bundle, undefined);
});

test('pre-case semantic gaps stop before Behavior Views or Case Draft defects can influence the reply', () => {
  const input = fixture();
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  const claim = input.artifacts.evidence_claims.claims[0];
  input.artifacts.evidence_claims.semantic_gaps = [{
    category: 'semantic_gap', code: 'ACCEPTANCE_TIMING_UNRESOLVED', subject_fact_ids: [fact.fact_id],
    missing_aspect: 'acceptance_timing', scope_ref: 'checkout', question: '订单何时视为已接受？',
    why_needed: '需要明确业务完成时点。', decision_impact: '决定观察步骤和预期。',
    unresolved_outcome: '接受时机相关场景保持待确认。', answer_options: ['提交成功时', '异步处理完成时'],
    risk_level: 'high', source_claim_ids: [claim.claim_id], discovery_phase: 'pre_case',
    affected_test_point_ids: []
  }];
  input.artifacts.behavior_views = /** @type {any} */ ({ invalid: true });
  input.artifacts.case_drafts = /** @type {any} */ ({ invalid: true });
  const result = compileCaseDocumentRevisionV4(input.artifacts, input.system);
  assert.equal(result.status, 'need_user_answers');
  assert.equal(result.phase, 'requirements_analysis');
  assert.equal(result.semantic_roots.length, 1);
  assert.equal(result.semantic_roots[0].question, '订单何时视为已接受？');
});

test('revision and schema disagreement is attributed to the Agent-owned artifact without writing output', () => {
  const input = fixture();
  input.artifacts.case_drafts.source_revision = 1;
  const result = compileCaseDocumentRevisionV4(input.artifacts, input.system);
  assert.equal(result.status, 'need_revision');
  assert.equal(result.stage, 'case_drafts');
  assert.ok(result.diagnostics.some((/** @type {any} */ diagnostic) => diagnostic.code === 'SOURCE_REVISION_MISMATCH'));
});

test('production compiler state is deterministically derived from the four artifacts without a fifth semantic input', () => {
  const input = fixture();
  const derived = deriveV4SystemContext(input.artifacts);
  assert.deepEqual(Object.keys(derived).sort(), [
    'behavior_evidence', 'claim_assessments', 'decisions', 'interaction',
    'ordering', 'semantic_evidence', 'source', 'topology'
  ]);
  assert.equal(Object.hasOwn(derived, 'execution_resources'), false);
  const first = compileCaseDocumentRevisionV4(input.artifacts, derived);
  const second = compileCaseDocumentRevisionV4(structuredClone(input.artifacts), deriveV4SystemContext(
    structuredClone(input.artifacts)
  ));
  assert.equal(first.status, 'compiled', JSON.stringify(first));
  assert.deepEqual(second, first);
});

test('derived production evidence cannot be manufactured by changing a View and its matching Case together', () => {
  const input = fixture();
  const element = input.artifacts.behavior_views.views[0].elements[0];
  element.business_outcome = '订单进入已拒绝状态';
  element.expected = '已拒绝';
  const outcomeId = `OUT-${digest({
    fact_id: element.fact_id, condition: element.condition, expected: element.expected,
    acceptance_role: 'primary_acceptance'
  })}`;
  input.artifacts.case_drafts.cases[0].primary_test_point_id =
    `TP-${digest({ outcome_id: outcomeId })}`;
  input.artifacts.case_drafts.cases[0].oracles[0].expected = '订单状态显示为已拒绝';

  const result = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(result.status, 'need_revision', JSON.stringify(result));
  assert.equal(result.stage, 'behavior_views');
  assert.ok(result.diagnostics.some((/** @type {any} */ item) => item.code === 'BEHAVIOR_FIELD_UNSUPPORTED'));
});

test('submitted topology cannot authorize itself by changing its disposition and manifest together', () => {
  const input = fixture();
  input.artifacts.evidence_claims.topology_dispositions[0].role = 'upstream';
  input.artifacts.evidence_claims.scope_manifest.modules[0].role = 'upstream';

  const result = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(result.status, 'need_revision', JSON.stringify(result));
  assert.equal(result.stage, 'evidence_claims');
  assert.ok(result.diagnostics.some((/** @type {any} */ item) =>
    ['TOPOLOGY_ROLE_BASIS_INVALID', 'SCOPE_PRIMARY_SURFACE_INVALID'].includes(item.code)));
});

test('resolved semantic roots remain in the canonical audit while leaving the active gap count', () => {
  const input = fixture();
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  const claim = input.artifacts.evidence_claims.claims[0];
  input.artifacts.evidence_claims.semantic_gaps = [{
    category: 'semantic_gap', code: 'ACCEPTANCE_TIMING_UNRESOLVED',
    subject_fact_ids: [fact.fact_id], missing_aspect: 'acceptance_timing',
    scope_ref: 'checkout', question: '订单何时视为已接受？',
    why_needed: '需要明确业务完成时点。', decision_impact: '决定观察步骤和预期。',
    unresolved_outcome: '接受时机相关场景保持待确认。',
    answer_options: ['提交成功时', '异步处理完成时'], risk_level: 'high',
    source_claim_ids: [claim.claim_id], discovery_phase: 'pre_case',
    affected_test_point_ids: []
  }];
  const pending = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
  const system = /** @type {any} */ (deriveV4SystemContext(input.artifacts));
  system.decisions = {
    delivery_requested: false,
    root_statuses: [{
      root_issue_id: pending.semantic_roots[0].root_issue_id,
      status: 'resolved_temporary'
    }]
  };

  const result = compileCaseDocumentRevisionV4(input.artifacts, system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.coverage.semantic_gap_count, 0);
  assert.equal(result.bundle.semantic_root_groups.length, 1);
  assert.equal(result.bundle.semantic_root_groups[0].status, 'resolved');
});

test('production validates relative-baseline semantics against the verified Claim instead of trusting the Case Draft', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  claim.semantic_value.relative_baseline_assertions = [{
    reference: '当前线上', comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    }
  }];
  input.artifacts.case_drafts.cases[0].baseline_spec = {
    baseline_id: 'BASELINE-current-production', kind: 'declared_reference',
    acquisition: 'capture_at_execution', reference: '当前线上',
    comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    },
    claim_ids: [claim.claim_id]
  };

  const accepted = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(accepted.status, 'compiled', JSON.stringify(accepted));
  assert.equal(accepted.bundle.cases[0].baseline_spec.acquisition, 'capture_at_execution');
  assert.equal(accepted.bundle.cases[0].steps.length, 4);
  assert.match(accepted.bundle.cases[0].steps[0].action, /执行时.*记录.*当前线上/u);
  assert.match(accepted.bundle.cases[0].steps[1].action, /待测版本/u);
  assert.match(accepted.bundle.cases[0].steps[2].action, /全部可观察行为/u);
  assert.match(accepted.bundle.cases[0].steps[3].action, /只允许.*新增结算状态/u);

  input.artifacts.case_drafts.cases[0].baseline_spec.comparison_contract = {
    kind: 'selected_dimensions', dimensions: ['名称', '顺序'], allowed_differences: []
  };
  const invented = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(invented.status, 'need_revision', JSON.stringify(invented));
  assert.equal(invented.stage, 'case_drafts');
  assert.ok(invented.diagnostics.some((/** @type {any} */ item) => item.code === 'BASELINE_EVIDENCE_UNRESOLVED'));
});

test('production validates structured test-value origins against exact Claim assertions', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  claim.semantic_value.test_value_assertions = [{
    subject_ref: 'checkout.order', field_path: '/source', value: 22
  }];
  input.artifacts.case_drafts.cases[0].test_values = [{
    value_id: 'VAL-source-22', subject_ref: 'checkout.order', field_path: '/source', value: 22,
    used_by_refs: ['STEP-submit'], value_origin: { kind: 'requirement', claim_ids: [claim.claim_id] }
  }];
  const accepted = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(accepted.status, 'compiled', JSON.stringify(accepted));

  input.artifacts.case_drafts.cases[0].test_values[0].value = 23;
  const unsupported = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(unsupported.status, 'need_revision', JSON.stringify(unsupported));
  assert.equal(unsupported.stage, 'case_drafts');
  assert.ok(unsupported.diagnostics.some((/** @type {any} */ item) => item.code === 'VALUE_EVIDENCE_UNRESOLVED'));
});

test('production compiles evidence-backed formal-point NotApplicable and permits a canonical zero-Case result', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  const condition = structuredClone(input.artifacts.behavior_views.views[0].elements[0].condition);
  claim.semantic_value.not_applicable_assertions = [{
    subject: { kind: 'formal_outcome', fact_id: fact.fact_id, condition },
    acceptance_role: 'primary_acceptance', reason_code: 'out_of_scope',
    reason: '该结算状态已由本轮范围决定明确排除'
  }];
  input.artifacts.case_drafts.cases = [];

  const result = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.result_kind, 'no_applicable_cases');
  assert.equal(result.obligations.not_applicable_records.length, 1);
  assert.equal(result.bundle.not_applicable.length, 1);
  assert.equal(result.bundle.coverage.not_applicable_count, 1);
});

test('production rejects NotApplicable that conflicts with a Case or merely says the PRD omitted a rule', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  claim.semantic_value.not_applicable_assertions = [{
    subject: {
      kind: 'formal_outcome', fact_id: fact.fact_id,
      condition: structuredClone(input.artifacts.behavior_views.views[0].elements[0].condition)
    },
    acceptance_role: 'primary_acceptance', reason_code: 'out_of_scope',
    reason: '该结算状态已由本轮范围决定明确排除'
  }];
  const conflict = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(conflict.status, 'fatal', JSON.stringify(conflict));
  assert.equal(conflict.reason_code, 'NOT_APPLICABLE_CASE_CONFLICT');

  claim.semantic_value.not_applicable_assertions[0].reason = 'PRD 未提及该业务规则';
  const absentIsNotProof = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(absentIsNotProof.status, 'need_revision', JSON.stringify(absentIsNotProof));
  assert.equal(absentIsNotProof.stage, 'evidence_claims');
  assert.ok(absentIsNotProof.diagnostics.some((/** @type {any} */ item) => item.code === 'CLAIM_SEMANTIC_ASSERTION_INVALID'));
});

test('execution-binding Claims cannot prove Case semantics, exclusions, risks, or ordering', () => {
  const input = fixture();
  const source = input.artifacts.evidence_claims.claims[0];
  const execution = {
    ...structuredClone(source), claim_id: 'CLM-execution-only', kind: 'description',
    domain: 'execution_binding', field_path: '/environment/url',
    semantic_value: {
      test_value_assertions: [{ subject_ref: 'checkout.order', field_path: '/source', value: 22 }],
      risk_review_assertions: [{ module_id: 'checkout', risk_kind: 'refresh', status: 'formal' }],
      not_applicable_assertions: [{
        subject: { kind: 'risk', module_id: 'checkout', risk_kind: 'business_permission_boundary' },
        acceptance_role: 'primary_acceptance', reason_code: 'inapplicable_condition', reason: '执行环境不支持'
      }],
      ordering_assertions: [{
        kind: 'flow', module_id: 'checkout', subject_ref: 'forged-flow',
        locator_id: source.source_locator_ids[0]
      }]
    }
  };
  delete execution.subject_descriptor;
  input.artifacts.evidence_claims.claims.push(execution);
  const derived = deriveV4SystemContext(input.artifacts);
  assert.equal(derived.semantic_evidence.supported_claim_ids.includes(execution.claim_id), false);
  assert.equal(derived.semantic_evidence.not_applicable_assertions.length, 0);
  assert.equal(derived.semantic_evidence.risk_review_assertions.length, 0);
  assert.equal(derived.ordering.flows.length, 0);
});

test('production risk ledger uses verified Claim routes for formal, semantic-gap and NotApplicable dispositions', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  claim.semantic_value.risk_review_assertions = [
    { module_id: 'checkout', risk_kind: 'refresh', status: 'formal' },
    { module_id: 'checkout', risk_kind: 'loading_failure', status: 'formal' },
    { module_id: 'checkout', risk_kind: 'unknown_enum', status: 'semantic_gap' }
  ];
  claim.semantic_value.not_applicable_assertions = [{
    subject: { kind: 'risk', module_id: 'checkout', risk_kind: 'business_permission_boundary' },
    acceptance_role: 'primary_acceptance', reason_code: 'inapplicable_condition',
    reason: '该只读结算状态不改变业务权限'
  }];
  input.artifacts.evidence_claims.semantic_gaps = [{
    category: 'semantic_gap', code: 'UNKNOWN_ENUM_UNRESOLVED',
    subject_fact_ids: [fact.fact_id], missing_aspect: 'unknown_enum', scope_ref: 'checkout',
    question: '出现未知状态值时应如何展示？', why_needed: '需要确定未知值的业务结果。',
    decision_impact: '答案决定未知值用例的预期。', unresolved_outcome: '未知值场景保持待确认。',
    answer_options: ['原值', '统一兜底'], risk_level: 'medium', source_claim_ids: [claim.claim_id],
    discovery_phase: 'post_case', affected_test_point_ids: []
  }];
  const first = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(first.status, 'need_user_answers', JSON.stringify(first));
  const system = /** @type {any} */ (deriveV4SystemContext(input.artifacts));
  system.decisions = {
    delivery_requested: true,
    root_statuses: [{ root_issue_id: first.semantic_roots[0].root_issue_id, status: 'closed_for_delivery' }]
  };
  const result = compileCaseDocumentRevisionV4(input.artifacts, system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  const byKind = new Map(result.bundle.risk_review_ledger.map((/** @type {any} */ item) => [item.risk_kind, item]));
  assert.equal(byKind.get('refresh').status, 'formal');
  assert.equal(byKind.get('loading_failure').status, 'formal');
  assert.equal(byKind.get('unknown_enum').status, 'semantic_gap');
  assert.equal(byKind.get('business_permission_boundary').status, 'not_applicable');
  assert.equal(result.bundle.exploratory.length, 5);
});

test('production ordering registry is derived from source-backed Claim assertions and rejects forged Case selectors', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  const locatorId = claim.source_locator_ids[0];
  const flowSubject = { kind: 'flow', module_id: 'checkout', subject_ref: 'checkout-submit' };
  const actionSubject = {
    kind: 'action', module_id: 'checkout', flow_subject_ref: 'checkout-submit', subject_ref: 'submit-order'
  };
  claim.semantic_value.ordering_assertions = [
    { ...flowSubject, locator_id: locatorId }, { ...actionSubject, locator_id: locatorId }
  ];
  input.artifacts.case_drafts.cases[0].ordering = {
    business_flow_ref: `FLOW-${digest(flowSubject)}`,
    page_action_ref: `ACTION-${digest(actionSubject)}`
  };
  const system = deriveV4SystemContext(input.artifacts);
  assert.equal(system.ordering.flows.length, 1);
  assert.equal(system.ordering.actions.length, 1);
  const result = compileCaseDocumentRevisionV4(input.artifacts, system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.cases[0].ordering.business_flow_ref, input.artifacts.case_drafts.cases[0].ordering.business_flow_ref);

  input.artifacts.case_drafts.cases[0].ordering.page_action_ref = `ACTION-${'0'.repeat(64)}`;
  const forged = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(forged.status, 'fatal', JSON.stringify(forged));
  assert.equal(forged.result_kind, 'quality_failure');
  assert.equal(forged.reason_code, 'CASE_ORDERING_FAILED');
});

test('production resolves a Claim-backed outcome dependency into compiler-owned Case dependencies', () => {
  const input = fixture();
  const claim = input.artifacts.evidence_claims.claims[0];
  const fact = input.artifacts.evidence_claims.fact_ledger[0];
  const locatorId = claim.source_locator_ids[0];
  const element = {
    element_id: 'EL-checkout-sequence', kind: 'input_domain', fact_id: fact.fact_id,
    business_outcome: '结算状态按阶段展示',
    partitions: [
      { kind: 'enum', value: 'created', expected: '订单已创建' },
      { kind: 'enum', value: 'accepted', expected: '订单已接受' }
    ],
    evidence_bindings: [
      { field_path: '/business_outcome', claim_ids: [claim.claim_id] },
      { field_path: '/partitions/0/value', claim_ids: [claim.claim_id] },
      { field_path: '/partitions/0/expected', claim_ids: [claim.claim_id] },
      { field_path: '/partitions/1/value', claim_ids: [claim.claim_id] },
      { field_path: '/partitions/1/expected', claim_ids: [claim.claim_id] }
    ]
  };
  input.artifacts.behavior_views.views[0].type = 'input-domain';
  input.artifacts.behavior_views.views[0].elements = [element];
  claim.semantic_value.behavior_assertions = element.evidence_bindings.map((/** @type {any} */ binding) => ({
    fact_id: fact.fact_id, field_path: binding.field_path,
    value: binding.field_path === '/business_outcome' ? element.business_outcome
      : binding.field_path.includes('/0/')
        ? element.partitions[0][binding.field_path.endsWith('/value') ? 'value' : 'expected']
        : element.partitions[1][binding.field_path.endsWith('/value') ? 'value' : 'expected']
  }));
  const outcome = (/** @type {string} */ value, /** @type {string} */ expected) => `OUT-${digest({
    fact_id: fact.fact_id, condition: { state: value }, expected,
    acceptance_role: 'primary_acceptance'
  })}`;
  const createdOutcome = outcome('created', '订单已创建');
  const acceptedOutcome = outcome('accepted', '订单已接受');
  const createdPoint = `TP-${digest({ outcome_id: createdOutcome })}`;
  const acceptedPoint = `TP-${digest({ outcome_id: acceptedOutcome })}`;
  const flowSubject = { kind: 'flow', module_id: 'checkout', subject_ref: 'checkout-lifecycle' };
  const actionSubject = {
    kind: 'action', module_id: 'checkout', flow_subject_ref: 'checkout-lifecycle', subject_ref: 'observe-state'
  };
  claim.semantic_value.ordering_assertions = [
    { ...flowSubject, locator_id: locatorId }, { ...actionSubject, locator_id: locatorId },
    { kind: 'outcome_dependency', predecessor_outcome_id: createdOutcome, successor_outcome_id: acceptedOutcome }
  ];
  const selectors = {
    business_flow_ref: `FLOW-${digest(flowSubject)}`,
    page_action_ref: `ACTION-${digest(actionSubject)}`
  };
  const makeCase = (/** @type {string} */ key, /** @type {string} */ point, /** @type {string} */ expected) => ({
    case_id: `CASE-adapter-${key}`, title: expected, module_id: 'checkout', priority: 'P0',
    ordering: selectors, acceptance_role: 'primary_acceptance', fact_ids: [fact.fact_id],
    primary_test_point_id: point, supporting_observation_ids: [], business_preconditions: [],
    data_conditions: [], steps: [{ step_id: `STEP-${key}`, action: '查看订单状态' }],
    oracles: [{
      oracle_id: `ORACLE-${key}`, observe_after_step_id: `STEP-${key}`, surface: 'ui',
      expected, claim_ids: [claim.claim_id]
    }]
  });
  input.artifacts.case_drafts.cases = [
    makeCase('accepted', acceptedPoint, '订单已接受'),
    makeCase('created', createdPoint, '订单已创建')
  ];

  const result = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  const created = result.bundle.cases.find((/** @type {any} */ item) => item.primary_test_point_id === createdPoint);
  const accepted = result.bundle.cases.find((/** @type {any} */ item) => item.primary_test_point_id === acceptedPoint);
  assert.deepEqual(created.ordering.depends_on_case_ids, []);
  assert.deepEqual(accepted.ordering.depends_on_case_ids, [created.case_id]);
  assert.deepEqual(result.bundle.ordered_case_ids, [created.case_id, accepted.case_id]);
});
