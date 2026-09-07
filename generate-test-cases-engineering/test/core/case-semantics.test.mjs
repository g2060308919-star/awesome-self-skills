import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCaseDrafts, executionSignature } from '../../src/classify.mjs';
import { classificationContext, refreshExecutionSignature } from '../helpers/classification-context.mjs';
import { buildBundle } from '../../src/coverage.mjs';
import bundleFixture from '../fixtures/journeys/final-critical-gaps.json' with {type:'json'};

function context() {
  const c = classificationContext();
  const d = c.caseDrafts.cases[0];
  d.scenario = {operation_id:'submit',operation_ref:'view_checkout#edge_submit',partition_id:'valid-cart',subject_ref:'order.status',intent:'behavior'};
  d.risk_basis = {impact:'Checkout fails',likelihood:'Every submit uses this path',exposure:'All buyers'};
  d.execution_effects = [];
  d.cleanup.resolved_effects = [];
  d.preconditions[0].setup = {resource_kind:'fixture',resource_ref:'fixture:ready-cart',completion:{subject_ref:'cart.ready',operator:'equals',operand:{type:'boolean',value:true}},mutation_effects:[]};
  d.steps[0].oracle_unused = undefined;
  delete d.steps[0].oracle_unused;
  d.steps[0].operation_id = 'submit';
  d.steps[0].expectations[0].oracle.assertion = {subject_ref:'order.status',surface:'UI',operator:'equals',operand:{type:'string',value:'accepted'}};
  refreshExecutionSignature(d);
  return c;
}
test('structured atomic scenario remains grounded and deterministic', () => {
  const c = context();
  const result = classifyCaseDrafts(c);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.grounded.length, 1);
  assert.deepEqual(classifyCaseDrafts(structuredClone(c)), result);
});
for (const [name, mutate] of /** @type {Array<[string,(d:any)=>void]>} */ ([
  ['combined operation', d => {d.scenario.operation_id=['submit','cancel'];}],
  ['combined enum partition', d => {d.scenario.partition_id=['valid','invalid'];}],
  ['multiple assertion subjects', d => {d.steps[0].expectations[0].oracle.assertion.subject_ref=['order.status','order.id'];}],
  ['multiple surfaces', d => {d.steps[0].expectations[0].oracle.assertion.surface=['UI','database'];}],
  ['untyped operand', d => {d.steps[0].expectations[0].oracle.assertion.operand='accepted and persisted';}],
  ['compatibility missing baseline', d => {d.scenario.intent='compatibility';}],
  ['vague setup', d => {delete d.preconditions[0].setup;}],
  ['unresolved setup effects', d => {d.preconditions[0].setup.mutation_effects=['created-account'];}],
  ['missing risk rationale', d => {delete d.risk_basis;}],
  ['different action operation', d => {d.steps[0].operation_id='cancel';}],
  ['unknown modeled operation', d => {d.scenario.operation_ref='view_checkout#unknown';}],
  ['mixed data partitions', d => {d.data[0].partition_id='another';}],
  ['unresolved setup resource', d => {d.preconditions[0].setup.resource_ref='fixture:missing';}],
  ['vague setup locator', d => {d.testability_profile.setup_resources[0].locator='prepare data';}],
  ['contradictory display Oracle', d => {d.steps[0].expectations[0].oracle.expected_state='rejected';}],
  ['renamed observer cannot bypass subject binding', d => {d.testability_profile.observers[0].observer=' TESTER. ';d.testability_profile.observers[0].subject_ref='different';}],
])) test(`rejects ${name}`, () => {
  const c=context(); mutate(c.caseDrafts.cases[0]); refreshExecutionSignature(c.caseDrafts.cases[0]);
  const result=classifyCaseDrafts(c);
  assert.equal(result.grounded.length,0);
  assert(result.diagnostics.length>0 || result.blocked.length>0);
});
test('typed operand and scenario partition drive signature', () => {
  const d=context().caseDrafts.cases[0]; const first=executionSignature(d);
  d.steps[0].expectations[0].oracle.assertion.operand.value='rejected';
  assert.notEqual(executionSignature(d),first);
  const second=executionSignature(d); d.scenario.partition_id='invalid-cart';
  assert.notEqual(executionSignature(d),second);
});
test('unsourced heuristic is non-evidence exploratory', () => {
  const c=context(); c.caseDrafts.exploratory_candidates=[{exploratory_id:'exploratory_concurrent',title:'Repeated submit',scope:'checkout',risk:'medium',origin:'heuristic',category:'concurrency',hypothesis:'Repeated submit may duplicate orders',rationale:'Concurrent requests can race'}];
  const result=classifyCaseDrafts(c);
  assert.deepEqual(result.diagnostics,[]);
  assert.equal(result.exploratory.length,1);
  assert.equal(result.grounded.length,1);
});
test('compatibility compares a sourced baseline dimension', () => {
  const c=context();const d=c.caseDrafts.cases[0];
  d.scenario.intent='compatibility';d.scenario.compatibility={baseline_ref:'fixture:ready-cart',dimensions:['status']};
  refreshExecutionSignature(d);
  assert.equal(classifyCaseDrafts(c).grounded.length,1);
  d.scenario.compatibility.baseline_ref='missing';refreshExecutionSignature(d);
  assert.equal(classifyCaseDrafts(c).grounded.length,0);
});
test('cleanup resolves preparation and execution effects explicitly', () => {
  const c=context();const d=c.caseDrafts.cases[0];
  d.preconditions[0].setup.mutation_effects=['created-account'];d.execution_effects=['created-order'];
  d.cleanup={required:true,steps:['Delete order and fixture account'],resolved_effects:['created-order','created-account'],evidence_ref:'claim_cleanup',support_review:'supported'};
  refreshExecutionSignature(d);
  assert.equal(classifyCaseDrafts(c).grounded.length,1);
  d.cleanup.resolved_effects.pop();
  assert.equal(classifyCaseDrafts(c).grounded.length,0);
});
test('empty observer and capability registries require adapter repair', () => {
  for(const registry of ['observers','capabilities']) {
    const c=context();c.caseDrafts.cases[0].testability_profile[registry]=[];
    const result=classifyCaseDrafts(c);
    assert(result.diagnostics.some(e=>e.code==='TESTABILITY_REFERENCE_MISMATCH'));
    assert.equal(result.blocked.length,0);
  }
});
test('stable observer refs determine signature despite renamed labels', () => {
  const d=context().caseDrafts.cases[0];const e=d.steps[0].expectations[0];
  Object.assign(e,{observer_ref:'observer:tester',target_ref:'target:status'});
  const signature=executionSignature(d);
  e.observer='quality engineer';e.observation_target='result label';
  assert.equal(executionSignature(d),signature);
});
test('heuristics cannot carry formal evidence or Oracle claims', () => {
  for(const field of ['source_claim_ids','level','oracle','fact_ids','obligation_ids','runner_eligible']) {
    const c=context();c.caseDrafts.exploratory_candidates=[{exploratory_id:'exploratory_race',title:'Race',scope:'checkout',risk:'medium',origin:'heuristic',category:'concurrency',hypothesis:'Concurrent submit may race',rationale:'Generic race risk',[field]:field==='runner_eligible'?true:['claim_fact']}];
    assert(classifyCaseDrafts(c).diagnostics.length>0);
  }
});
test('bundle replay rejects forged modeled operation and preserves nonformal heuristic label', () => {
  const input=structuredClone(bundleFixture);
  const baseline=buildBundle(input);
  const heuristic={exploratory_id:'exploratory_concurrency',title:'Concurrency',scope:'checkout',risk:'medium',origin:'heuristic',category:'concurrency',hypothesis:'Requests may race',rationale:'Independent generic risk'};
  input.classification.exploratory.push(/** @type {any} */ (heuristic));
  input.clarification.semantic_snapshot.delivery_sections.exploratory.push(heuristic.exploratory_id);
  const bundle=buildBundle(input);
  assert.deepEqual(bundle.coverage,baseline.coverage);
  assert.equal(bundle.exploratory.find((/** @type {any} */ e)=>e.exploratory_id===heuristic.exploratory_id).runner_eligible,false);
  const d=/** @type {any} */ (input.classification.grounded[0]);d.scenario.operation_ref='view_forged#action';
  d.execution_signature=JSON.parse(executionSignature(d));
  assert.throws(()=>buildBundle(input),(/** @type {any} */ error)=>error.diagnostics.some((/** @type {any} */ e)=>e.code==='CASE_OPERATION_REFERENCE_INVALID'));
});
