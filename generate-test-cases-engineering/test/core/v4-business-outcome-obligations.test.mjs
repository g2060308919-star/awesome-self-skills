import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import behaviorSchema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import obligationSchema from '../../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { compileNotApplicable, riskKinds } from '../../src/not-applicable.mjs';
const business = /** @type {any} */ (await import('../../src/obligations/business-outcomes-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));
/** @returns {any} */
function fixture() {
  const element = { element_id: 'EL-star', kind: 'input_domain', fact_id: 'FACT-star', business_outcome: '显示评价星级',
    partitions: [{ kind: 'enum', value: 500, expected: '推荐' }, { kind: 'enum', value: 1, expected: '常规' }, { kind: 'enum', value: 0, expected: '不推荐' }],
    evidence_bindings: [{ field_path: '/business_outcome', claim_ids: ['CLM-star'] },
      ...[0, 1, 2].flatMap(index => ['value', 'expected'].map(field => ({ field_path: `/partitions/${index}/${field}`, claim_ids: ['CLM-star'] })))] };
  const artifact = { schema_version: '4.0.0', source_revision: 0,
    views: [{ view_id: 'VIEW-star', module_id: 'admin', type: 'input-domain', scope: 'admin.review', source_claim_ids: ['CLM-star'], elements: [element], relations: [] }],
    interaction_matrix: [], interaction_candidates: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] } };
  return { artifact, evidence: evidenceFor(element) };
}
/** @param {any} element @returns {any} */
function evidenceFor(element) {
  return { facts: [{ fact_id: element.fact_id, module_id: 'admin', acceptance_role: 'primary_acceptance', condition_field: 'star_level' }],
    claims: [{ claim_id: 'CLM-star', level: 'E3', supported: true, assertions: element.evidence_bindings.map((/** @type {any} */ binding) => ({
      fact_id: element.fact_id, field_path: binding.field_path,
      value: binding.field_path.slice(1).split('/').reduce((/** @type {any} */ value, /** @type {string} */ key) => value[key], element)
    })) }] };
}
/** @param {any} [value] */
function compile(value = fixture()) {
  assert.equal(typeof business.compileBusinessOutcomesV4, 'function', 'the outcome compiler must exist');
  return business.compileBusinessOutcomesV4(value.artifact, value.evidence);
}
/** @returns {any} */
const coverageContext = () => ({ semantic_gaps: [], not_applicable_records: [], not_applicable_context: { subjects: [], verified_bases: [] } });
/** @param {any} compiled @param {any[]} cases @param {any} [context] */
const assess = (compiled, cases, context = coverageContext()) => business.aggregateBusinessOutcomeCoverageV4(compiled, cases, context);

test('[P-10][BR-12] v4 business outcomes persist three enum Test Points and count coverage by result rather than shared Fact', () => {
  const input = fixture(); assert.deepEqual(validateAgainstSchema(input.artifact, behaviorSchema), []);
  const result = compile(input); assert.equal(result.kind, 'compiled'); assert.equal(result.outcomes.length, 3); assert.equal(result.formal_test_points.length, 3);
  assert.deepEqual(result.outcomes.map((/** @type {any} */ item) => item.condition.star_level).sort((/** @type {number} */ a, /** @type {number} */ b) => a - b), [0, 1, 500]);
  assert.ok(result.outcomes.every((/** @type {any} */ item) => Object.keys(item.condition).length === 1));
  const selected = result.outcomes.find((/** @type {any} */ item) => item.condition.star_level === 500);
  const point = result.formal_test_points.find((/** @type {any} */ item) => item.outcome_id === selected.outcome_id);
  const coverage = assess(result, [{ case_id: 'CASE-500', primary_test_point_id: point.formal_test_point_id, valid: true, semantic_status: 'Grounded' }]);
  assert.equal(coverage.kind, 'fatal'); assert.equal(coverage.result_kind, 'quality_failure');
  assert.equal(coverage.reviewed_formal_count, 3); assert.equal(coverage.covered_count, 1); assert.equal(coverage.applicable_count, 3);
  assert.equal(coverage.ledger.filter((/** @type {any} */ item) => item.classification === null).length, 2);
});

test('v4 business outcome IDs ignore Adapter ordering and evidence set changes but distinguish actual values', () => {
  const first = compile(); const value = fixture(); const item = value.artifact.views[0].elements[0];
  item.partitions.reverse(); value.evidence = evidenceFor(item); item.evidence_bindings.reverse();
  value.evidence.claims.push({ ...structuredClone(value.evidence.claims[0]), claim_id: 'CLM-extra' });
  for (const binding of item.evidence_bindings) binding.claim_ids.push('CLM-extra'); value.artifact.views[0].source_claim_ids.push('CLM-extra');
  const next = compile(value); assert.equal(next.kind, 'compiled');
  assert.deepEqual(next.outcomes.map((/** @type {any} */ item) => item.outcome_id), first.outcomes.map((/** @type {any} */ item) => item.outcome_id));
  assert.deepEqual(next.formal_test_points, first.formal_test_points);
  const changed = fixture(); changed.artifact.views[0].elements[0].partitions[0].value = 501; changed.evidence = evidenceFor(changed.artifact.views[0].elements[0]);
  assert.notDeepEqual(compile(changed).formal_test_points, first.formal_test_points);
});

test('v4 integration creates one business Test Point with response/UI observations and no six-surface expansion', () => {
  const value = fixture(); const item = { element_id: 'EL-source', kind: 'integration', fact_id: 'FACT-source', business_outcome: '来源 22 显示打车去过',
    surfaces: [{ kind: 'response', assertion: 'source 返回 22' }, { kind: 'ui', assertion: '来源列显示打车去过' }],
    evidence_bindings: ['/business_outcome', '/surfaces/0/assertion', '/surfaces/1/assertion'].map(field_path => ({ field_path, claim_ids: ['CLM-star'] })) };
  value.artifact.views[0].type = 'integration'; value.artifact.views[0].elements = [item]; value.evidence = evidenceFor(item);
  const result = compile(value); assert.equal(result.kind, 'compiled'); assert.equal(result.formal_test_points.length, 1);
  assert.deepEqual(result.supporting_observations.map((/** @type {any} */ item) => item.surface).sort(), ['response', 'ui']);
  assert.equal(result.outcomes.length, 1); assert.deepEqual(result.outcomes[0].condition, {});
});

test('v4 business outcome aggregation is Grounded then Conditional then gap Blocked, never cross-candidate poison', () => {
  const result = compile(); const [a, b, c] = result.formal_test_points;
  const context = coverageContext(); context.semantic_gaps = [{ semantic_gap_id: 'GAP-c', formal_test_point_ids: [c.formal_test_point_id] }];
  const cases = [
    { case_id: 'CASE-bad', primary_test_point_id: a.formal_test_point_id, valid: false, semantic_status: 'Blocked' },
    { case_id: 'CASE-a', primary_test_point_id: a.formal_test_point_id, valid: true, semantic_status: 'Grounded' },
    { case_id: 'CASE-a-conditional', primary_test_point_id: a.formal_test_point_id, valid: true, semantic_status: 'Conditional' },
    { case_id: 'CASE-b', primary_test_point_id: b.formal_test_point_id, valid: true, semantic_status: 'Conditional' },
    { case_id: 'CASE-c', primary_test_point_id: c.formal_test_point_id, valid: false, semantic_status: 'Blocked' }
  ];
  const coverage = assess(result, cases, context); assert.equal(coverage.kind, 'assessed');
  assert.deepEqual(coverage.ledger.map((/** @type {any} */ item) => item.classification), ['Grounded', 'Conditional', 'Blocked']);
  assert.deepEqual(assess(result, cases.reverse(), context), coverage);
  assert.equal(assess(result, cases.filter(item => item.case_id !== 'CASE-bad'), context).ledger[0].classification, 'Grounded');
  assert.equal(assess(result, [{ case_id: 'CASE-forged', primary_test_point_id: 'TP-missing', valid: true, semantic_status: 'Grounded' }]).kind, 'fatal');
});

test('v4 formal Test Point exclusion requires its exact verified NotApplicable subject and role', () => {
  const result = compile(); const context = coverageContext();
  const request = { subject: { kind: 'formal_test_point', formal_test_point_id: result.formal_test_points[0].formal_test_point_id },
    acceptance_role: 'primary_acceptance', reason_code: 'out_of_scope', reason: '本轮已明确排除', basis: { kind: 'scope_decision', decision_ids: ['DEC-scope'] } };
  const { reason, ...proof } = request;
  context.not_applicable_context = { subjects: [{ subject: request.subject, acceptance_role: request.acceptance_role }], verified_bases: [proof] };
  context.not_applicable_records = [compileNotApplicable(request, context.not_applicable_context)];
  const cases = result.formal_test_points.slice(1).map((/** @type {any} */ point, /** @type {number} */ index) => ({ case_id: `CASE-${index}`, primary_test_point_id: point.formal_test_point_id, valid: true, semantic_status: 'Grounded' }));
  const coverage = assess(result, cases, context); assert.equal(coverage.kind, 'assessed'); assert.equal(coverage.applicable_count, 2); assert.equal(coverage.covered_count, 2);
  const forged = structuredClone(context); forged.not_applicable_records[0].acceptance_role = 'context_only'; assert.equal(assess(result, cases, forged).kind, 'fatal');
  const gap = structuredClone(context); gap.semantic_gaps = [{ semantic_gap_id: 'GAP-a', formal_test_point_ids: [request.subject.formal_test_point_id] }];
  assert.equal(assess(result, cases, gap).ledger[0].classification, 'Blocked', 'NotApplicable cannot close a semantic gap');
});

test('v4 obligation artifact carries complete risk/NA records and schema rejects cross-branch risk contracts', () => {
  const result = compile();
  const exploratory = riskKinds.map(risk_kind => ({ exploratory_id: `EXP-${risk_kind}`, module_id: 'admin', risk_kind, acceptance_role: 'primary_acceptance', policy_id: 'general', policy_version: '1' }));
  const ledger = exploratory.map(item => ({ module_id: item.module_id, risk_kind: item.risk_kind, acceptance_role: item.acceptance_role,
    status: 'exploratory', review_basis: { kind: 'risk_catalog', policy_id: 'general', policy_version: '1' }, exploratory_ids: [item.exploratory_id] }));
  const context = { primary_module_ids: ['admin'], formal_test_points: [], semantic_gaps: [], exploratory, not_applicable_records: [], not_applicable_context: { subjects: [], verified_bases: [] } };
  const finalized = business.assembleObligationsArtifactV4(result, ledger, context);
  assert.equal(finalized.kind, 'assembled'); assert.deepEqual(validateAgainstSchema(finalized.artifact, obligationSchema), []);
  assert.equal(finalized.artifact.outcomes.length, 3); assert.equal(finalized.artifact.exploratory.length, 9);
  assert.equal(business.assembleObligationsArtifactV4(result, ledger.slice(1), context).kind, 'fatal');
  const defs = /** @type {any} */ (obligationSchema).$defs;
  for (const item of [
    { module_id: 'admin', risk_kind: 'refresh', acceptance_role: 'primary_acceptance', status: 'formal', review_basis: { kind: 'evidence', claim_ids: ['CLM-refresh'] }, formal_test_point_ids: ['TP-refresh'] },
    { module_id: 'admin', risk_kind: 'refresh', acceptance_role: 'primary_acceptance', status: 'semantic_gap', review_basis: { kind: 'semantic_gap_analysis', subject_fact_ids: ['FACT-refresh'], missing_aspect: '刷新规则' }, semantic_gap_ids: ['GAP-refresh'] },
    ledger[0],
    { module_id: 'admin', risk_kind: 'refresh', acceptance_role: 'primary_acceptance', status: 'not_applicable', review_basis: { kind: 'scope_decision', decision_ids: ['DEC-refresh'] }, not_applicable_record_ids: [`NA-${'a'.repeat(64)}`] }
  ]) {
    assert.deepEqual(validateAgainstSchema(item, { $defs: defs, $ref: '#/$defs/riskReviewItem' }), []);
    assert.ok(validateAgainstSchema({ ...item, wrong_result_ids: ['bad'] }, { $defs: defs, $ref: '#/$defs/riskReviewItem' }).length);
    assert.ok(validateAgainstSchema({ ...item, review_basis: { kind: 'note', reason: 'PRD 未提及' } }, { $defs: defs, $ref: '#/$defs/riskReviewItem' }).length);
  }
});

test('v4 ordering registry artifact schema validates compiler-owned tuple and closed dependency basis', async () => {
  let orderingSchema;
  try { orderingSchema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/ordering-registry.schema.json', import.meta.url), 'utf8')); }
  catch (error) { assert.fail(`ordering registry artifact Schema is required: ${error}`); }
  const registry = { business_flows: [{ flow_id: `FLOW-${'a'.repeat(64)}`, module_id: 'admin', locator_order_key: [0, 0, [1], 3], claim_ids: ['CLM-flow'] }], page_actions: [], dependency_rules: [] };
  assert.deepEqual(validateAgainstSchema(registry, orderingSchema), []);
  const changed = structuredClone(registry); changed.business_flows[0].locator_order_key = [0, 0, [1], 3, 99];
  assert.ok(validateAgainstSchema(changed, orderingSchema).length);
});

test('v4 coverage rejects a valid exclusion for a foreign Test Point instead of silently ignoring it', () => {
  const result = compile(); const context = coverageContext();
  const request = { subject: { kind: 'formal_test_point', formal_test_point_id: 'TP-foreign' }, acceptance_role: 'primary_acceptance',
    reason_code: 'out_of_scope', reason: '另一个模块的排除', basis: { kind: 'scope_decision', decision_ids: ['DEC-foreign'] } };
  const { reason, ...proof } = request;
  context.not_applicable_context = { subjects: [{ subject: request.subject, acceptance_role: request.acceptance_role }], verified_bases: [proof] };
  context.not_applicable_records = [compileNotApplicable(request, context.not_applicable_context)];
  const cases = result.formal_test_points.map((/** @type {any} */ point, /** @type {number} */ index) => ({ case_id: `CASE-${index}`, primary_test_point_id: point.formal_test_point_id, valid: true, semantic_status: 'Grounded' }));
  assert.equal(assess(result, cases, context).kind, 'fatal');
});

test('v4 artifact assembly cannot omit a primary outcome module to evade the nine-risk review gate', () => {
  const result = compile();
  assert.equal(business.assembleObligationsArtifactV4(result, [], { primary_module_ids: [], formal_test_points: [], semantic_gaps: [], exploratory: [],
    not_applicable_records: [], not_applicable_context: { subjects: [], verified_bases: [] } }).kind, 'fatal');
});

test('v4 artifact assembly is deterministic under ledger and exploratory set reordering', () => {
  const result = compile();
  const exploratory = riskKinds.map(risk_kind => ({ exploratory_id: `EXP-${risk_kind}`, module_id: 'admin', risk_kind, acceptance_role: 'primary_acceptance', policy_id: 'general', policy_version: '1' }));
  const ledger = exploratory.map(item => ({ module_id: item.module_id, risk_kind: item.risk_kind, acceptance_role: item.acceptance_role,
    status: 'exploratory', review_basis: { kind: 'risk_catalog', policy_id: 'general', policy_version: '1' }, exploratory_ids: [item.exploratory_id] }));
  const context = { primary_module_ids: ['admin'], formal_test_points: [], semantic_gaps: [], exploratory, not_applicable_records: [], not_applicable_context: { subjects: [], verified_bases: [] } };
  const first = business.assembleObligationsArtifactV4(result, ledger, context);
  assert.deepEqual(business.assembleObligationsArtifactV4(result, [...ledger].reverse(), { ...context, exploratory: [...exploratory].reverse() }), first);
});
