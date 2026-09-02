import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalStringify, stableId } from '../../src/canonical.mjs';
import { classifyCaseDrafts, executionSignature } from '../../src/classify.mjs';
import {
  IDS, acceptedClaim, baseCase, baseClaims, baseObligation, classificationContext, clone,
  refreshExecutionSignature
} from '../helpers/classification-context.mjs';
import { buildJourney, runInstalledRevision } from '../helpers/run-journey.mjs';

const compilationStages = ['source_pack', 'evidence_claims', 'behavior_views'];

/** @param {any} revision @param {string} claimId @param {string} parentClaimId @param {number} value */
function addValueClaim(revision, claimId, parentClaimId, value) {
  revision.evidence_claims.claims.push({
    claim_id: claimId,
    claim_form: 'derived',
    level: 'E2',
    kind: 'test-data',
    scope: 'checkout',
    value: String(value),
    source_locator_ids: ['locator_checkout'],
    derivation_kind: 'boundary-representative',
    derivation_target: 'test-data',
    parent_claim_ids: [parentClaimId],
    parameters: {},
    rule_input: { lower: 0, upper: 1, inclusive: true }
  });
}

/** @param {{parameters?:number,strength?:number,constraints?:any[],riskEvidence?:string[],vectorOracles?:any[]}} [options] */
function combinationRevision(options = {}) {
  const revision = buildJourney('all-e3');
  const parameterCount = options.parameters ?? 3;
  const parameters = [];
  for (let parameterIndex = 0; parameterIndex < parameterCount; parameterIndex += 1) {
    const parameterId = String.fromCharCode('a'.charCodeAt(0) + parameterIndex);
    const values = [];
    for (const valueId of ['0', '1']) {
      const claimId = `claim_${parameterId}_${valueId}`;
      addValueClaim(revision, claimId, 'claim_checkout', Number(valueId));
      values.push({ value_id: valueId, evidence_claim_id: claimId });
    }
    parameters.push({ parameter_id: parameterId, values });
  }
  revision.behavior_views.obligation_inputs.combination_requests.push({
    owner: {
      view_id: 'view_checkout',
      fact_ids: ['fact_checkout'],
      view_element_refs: [{ view_id: 'view_checkout', element_id: 'rule_checkout' }]
    },
    scope: 'checkout',
    strength: options.strength ?? 2,
    parameters,
    constraints: options.constraints ?? [],
    interaction_risk: { risk: 'high', evidence_refs: options.riskEvidence ?? ['claim_checkout'] },
    vector_oracles: options.vectorOracles ?? []
  });
  return revision;
}

/** @param {any} revision @param {string} claimId @param {string} parentClaimId */
function addExpectedClaim(revision, claimId, parentClaimId) {
  revision.evidence_claims.claims.push({
    claim_id: claimId, claim_form: 'derived', level: 'E2', kind: 'expected-value',
    scope: 'checkout', value: 'checkout accepted', source_locator_ids: ['locator_checkout'],
    derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
    parent_claim_ids: [parentClaimId], parameters: { table_id: claimId },
    rule_input: { conditions: ['combination target'], outcome: 'checkout accepted' }
  });
}

/** @param {any} revision @param {string} claimId @param {string[]} parentClaimIds */
function addForbidTargetClaim(revision, claimId, parentClaimIds) {
  addExpectedClaim(revision, claimId, parentClaimIds[0]);
  const claim = revision.evidence_claims.claims.find(
    (/** @type {any} */ item) => item.claim_id === claimId
  );
  claim.value = '1';
  claim.parent_claim_ids = [...parentClaimIds];
  claim.rule_input = { conditions: ['forbidden selected values'], outcome: '1' };
}

/** @param {any} revision @param {string} claimId */
function addDiagnosticClaim(revision, claimId) {
  revision.evidence_claims.claims.push({
    claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'diagnostic',
    scope: 'checkout', value: claimId, source_locator_ids: ['locator_checkout'],
    source_id: 'source_prd'
  });
}

/** @param {any} revision */
async function installedCompilation(revision) {
  const run = await runInstalledRevision(revision, { stageNames: compilationStages });
  let artifact = null;
  if (run.reply.status === 'need_artifact' && run.reply.stage === 'case_drafts') artifact = JSON.parse(
    await readFile(path.join(run.runDirectory, 'derived/r000/test-obligations.json'), 'utf8')
  );
  return { run, artifact };
}

/** @param {any} revision */
async function installedObligations(revision) {
  const run = await runInstalledRevision(revision, { stageNames: compilationStages });
  try {
    assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
    assert.equal(run.reply.stage, 'case_drafts', JSON.stringify(run.reply));
    return JSON.parse(await readFile(
      path.join(run.runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
}

/** @param {any} caseDraft @param {string} [oracleRef] */
function closeOnlyObligation(caseDraft, oracleRef = 'claim_fact') {
  const expectation = caseDraft.steps[0].expectations[0];
  expectation.kind = 'obligation-oracle';
  expectation.closes_obligation_id = IDS.obligation;
  expectation.evidence_ref = oracleRef;
  expectation.oracle_evidence_refs = [oracleRef];
  caseDraft.execution_signature.oracle_refs = [expectation.expectation_id];
  delete caseDraft.execution_signature.test_point_ids;
  return caseDraft;
}

test('installed t-wise request compiles the frozen binary strength-2 cover with owner routes and value evidence', async () => {
  const artifact = await installedObligations(combinationRevision());
  const vectors = artifact.obligations
    .filter((/** @type {any} */ obligation) => obligation.combination_vector)
    .map((/** @type {any} */ obligation) => Object.fromEntries(
      obligation.combination_vector.assignments.map(
        (/** @type {any} */ assignment) => [assignment.parameter_id, assignment.value_id]
      )
    ))
    .sort((/** @type {any} */ left, /** @type {any} */ right) => (
      JSON.stringify(left).localeCompare(JSON.stringify(right), 'en')
    ));
  assert.deepEqual(vectors, [
    { a: '0', b: '0', c: '0' },
    { a: '0', b: '1', c: '1' },
    { a: '1', b: '0', c: '1' },
    { a: '1', b: '1', c: '0' }
  ]);
  const vectorObligations = artifact.obligations.filter(
    (/** @type {any} */ obligation) => obligation.combination_vector
  );
  assert.equal(vectorObligations.every((/** @type {any} */ obligation) => (
    obligation.kind === 'interaction'
      && obligation.caseable === true
      && obligation.source_claim_ids.includes('claim_checkout')
      && obligation.combination_vector.assignments.every((/** @type {any} */ assignment) => (
        obligation.source_claim_ids.includes(`claim_${assignment.parameter_id}_${assignment.value_id}`)
      ))
  )), true);
  const ownerRoute = artifact.fact_routes.find(
    (/** @type {any} */ route) => route.fact_id === 'fact_checkout'
  );
  assert.equal(vectorObligations.every(
    (/** @type {any} */ obligation) => ownerRoute.obligation_ids.includes(obligation.obligation_id)
  ), true);
});

test('installed t-wise strength is closed to the declared parameter count', async (/** @type {any} */ t) => {
  await t.test('strength equal to three declared parameters compiles all full-strength vectors', async () => {
    const artifact = await installedObligations(combinationRevision({ strength: 3 }));
    const vectors = artifact.obligations.filter(
      (/** @type {any} */ obligation) => obligation.combination_vector
    );
    assert.equal(vectors.length, 8);
    assert.equal(vectors.every(
      (/** @type {any} */ obligation) => obligation.combination_vector.strength === 3
        && obligation.combination_vector.assignments.length === 3
    ), true);
  });

  await t.test('strength above the declared parameter count is rejected', async () => {
    const { run } = await installedCompilation(combinationRevision({ strength: 4 }));
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.stage, 'behavior_views');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_REQUEST_INVALID'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
});

test('installed t-wise owner must exist, model every owner fact, close every element, and cover scope', async (/** @type {any} */ t) => {
  /** @type {Array<[string, (request:any)=>void, string]>} */
  const cases = [
    ['unknown view', (/** @type {any} */ request) => { request.owner.view_id = 'view_missing'; }, 'TWISE_OWNER_VIEW_UNKNOWN'],
    ['unknown fact', (/** @type {any} */ request) => { request.owner.fact_ids = ['fact_missing']; }, 'TWISE_OWNER_FACT_UNKNOWN'],
    ['unknown element', (/** @type {any} */ request) => { request.owner.view_element_refs[0].element_id = 'missing'; }, 'TWISE_OWNER_ELEMENT_UNKNOWN'],
    ['scope mismatch', (/** @type {any} */ request) => { request.scope = 'other'; }, 'TWISE_OWNER_SCOPE_MISMATCH']
  ];
  for (const [name, mutate, code] of cases) await t.test(String(name), async () => {
    const revision = combinationRevision();
    mutate(revision.behavior_views.obligation_inputs.combination_requests[0]);
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === code), true, JSON.stringify(run.reply));
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  });

  await t.test('owner fact is not connected to the selected element', async () => {
    const revision = combinationRevision();
    revision.evidence_claims.claims.push({
      claim_id: 'claim_unrelated_description', claim_form: 'direct', level: 'E3', kind: 'description',
      scope: 'checkout', value: 'unrelated display', source_locator_ids: ['locator_checkout'],
      source_id: 'source_prd'
    }, {
      claim_id: 'claim_unrelated_element', claim_form: 'derived', level: 'E2', kind: 'model-element',
      scope: 'checkout', value: 'unrelated display', source_locator_ids: ['locator_checkout'],
      derivation_kind: 'decision-table-instance', derivation_target: 'model-element',
      parent_claim_ids: ['claim_unrelated_description'], parameters: { table_id: 'unrelated' },
      rule_input: { conditions: ['display'], outcome: 'unrelated display' }
    });
    revision.behavior_views.views[0].elements.push({
      element_id: 'rule_unrelated', kind: 'decision-rule', conditions: ['display only'],
      result: 'shown', priority: 1, source_claim_ids: [], model_refs: ['claim_unrelated_element']
    });
    revision.behavior_views.obligation_inputs.combination_requests[0].owner.view_element_refs = [{
      view_id: 'view_checkout', element_id: 'rule_unrelated'
    }];
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_OWNER_FACT_AMBIGUOUS'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('broad request cannot attach to a narrower owner view or primary fact scope', async () => {
    const revision = combinationRevision();
    revision.evidence_claims.claims.find(
      (/** @type {any} */ claim) => claim.claim_id === 'claim_checkout'
    ).scope = 'checkout.child';
    for (const claim of revision.evidence_claims.claims) {
      if (claim.claim_id.startsWith('claim_') && claim.claim_id !== 'claim_checkout') {
        claim.scope = 'checkout.child';
      }
    }
    revision.behavior_views.views[0].scope = 'checkout.child';
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_OWNER_SCOPE_MISMATCH'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('every selected owner element must resolve to an owner fact', async () => {
    const revision = combinationRevision();
    revision.evidence_claims.claims.push({
      claim_id: 'claim_unrelated_description', claim_form: 'direct', level: 'E3', kind: 'description',
      scope: 'checkout', value: 'unrelated display', source_locator_ids: ['locator_checkout'],
      source_id: 'source_prd'
    }, {
      claim_id: 'claim_unrelated_element', claim_form: 'derived', level: 'E2', kind: 'model-element',
      scope: 'checkout', value: 'unrelated display', source_locator_ids: ['locator_checkout'],
      derivation_kind: 'decision-table-instance', derivation_target: 'model-element',
      parent_claim_ids: ['claim_unrelated_description'], parameters: { table_id: 'unrelated' },
      rule_input: { conditions: ['display'], outcome: 'unrelated display' }
    });
    revision.behavior_views.views[0].elements.push({
      element_id: 'rule_unrelated', kind: 'decision-rule', conditions: ['display only'],
      result: 'shown', priority: 1, source_claim_ids: [], model_refs: ['claim_unrelated_element']
    });
    revision.behavior_views.obligation_inputs.combination_requests[0].owner.view_element_refs.push({
      view_id: 'view_checkout', element_id: 'rule_unrelated'
    });
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_OWNER_ELEMENT_NOT_MODELED'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
});

test('installed t-wise risk and forbid evidence fail closed unless strong, related, and scope-covering', async (/** @type {any} */ t) => {
  await t.test('interaction risk is mandatory', async () => {
    const revision = combinationRevision();
    delete revision.behavior_views.obligation_inputs.combination_requests[0].interaction_risk;
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.stage, 'behavior_views');
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('diagnostic interaction risk is rejected', async () => {
    const revision = combinationRevision({ riskEvidence: ['claim_risk_diagnostic'] });
    addDiagnosticClaim(revision, 'claim_risk_diagnostic');
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === 'TWISE_EVIDENCE_LEVEL_INVALID'), true);
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('unrelated same-scope forbid evidence is rejected', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [{ parameter_id: 'a', value_id: '1' }],
      evidence_refs: ['claim_unrelated_forbid']
    }] });
    revision.evidence_claims.claims.push({
      claim_id: 'claim_unrelated_forbid', claim_form: 'direct', level: 'E3', kind: 'description',
      scope: 'checkout', value: 'unrelated', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    });
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === 'TWISE_EVIDENCE_UNRELATED'), true);
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('related E1 forbid evidence cannot remove candidates', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [{ parameter_id: 'a', value_id: '1' }],
      evidence_refs: ['claim_forbid_e1']
    }] });
    revision.behavior_views.obligation_inputs.combination_requests[0]
      .parameters[0].values[1].evidence_claim_id = 'claim_forbid_e1';
    revision.source_pack.decision_records.push({
      decision_id: 'decision_forbid', question_id: 'question_forbid',
      root_issue_ids: ['root_forbid'], affected_obligation_ids: ['obligation_forbid'],
      clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
      question: 'May this value be used?', answer: '1',
      disposition: 'temporary', authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_checkout', evidence_level: 'E1'
    });
    revision.evidence_claims.claims.push({
      claim_id: 'claim_forbid_e1', claim_form: 'decision-record', level: 'E1', kind: 'assumption',
      scope: 'checkout', value: '1', source_locator_ids: ['locator_checkout'],
      decision_id: 'decision_forbid', authority: 'checkout'
    });
    revision.evidence_claims.fact_ledger.push({
      fact_id: 'fact_forbid_e1', claim_id: 'claim_forbid_e1', status: 'active',
      source_claim_ids: ['claim_forbid_e1']
    });
    revision.behavior_views.views[0].source_claim_ids.push('claim_forbid_e1');
    revision.behavior_views.views[0].elements[0].source_claim_ids.push('claim_forbid_e1');
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_EVIDENCE_LEVEL_INVALID'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('a generic owner claim cannot exclude an assignment tuple', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [
        { parameter_id: 'a', value_id: '1' }, { parameter_id: 'b', value_id: '1' }
      ], evidence_refs: ['claim_checkout']
    }] });
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
      assert.equal(run.reply.stage, 'behavior_views');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_FORBID_TARGET_UNCLOSED'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('a multi-assignment forbid must close every selected-value target', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [
        { parameter_id: 'a', value_id: '1' }, { parameter_id: 'b', value_id: '1' }
      ], evidence_refs: ['claim_forbid_a_only']
    }] });
    addForbidTargetClaim(revision, 'claim_forbid_a_only', ['claim_a_1']);
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
      assert.equal(run.reply.stage, 'behavior_views');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_FORBID_TARGET_UNCLOSED'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('separate selected-value claims cannot masquerade as one joint tuple proof', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [
        { parameter_id: 'a', value_id: '1' }, { parameter_id: 'b', value_id: '1' }
      ], evidence_refs: ['claim_a_1', 'claim_b_1']
    }] });
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
      assert.equal(run.reply.stage, 'behavior_views');
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'TWISE_FORBID_TARGET_UNCLOSED'
      ), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('a non-owner E3 joint requirement may prove the full forbidden tuple', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [
        { parameter_id: 'a', value_id: '1' }, { parameter_id: 'b', value_id: '1' }
      ], evidence_refs: ['claim_joint_forbid_e3']
    }] });
    revision.evidence_claims.claims.push({
      claim_id: 'claim_joint_forbid_e3', claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: 'checkout', value: '1', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    });
    revision.evidence_claims.fact_ledger.push({
      fact_id: 'fact_joint_forbid', claim_id: 'claim_joint_forbid_e3', status: 'active',
      source_claim_ids: ['claim_joint_forbid_e3']
    });
    revision.behavior_views.views[0].source_claim_ids.push('claim_joint_forbid_e3');
    revision.behavior_views.views[0].elements.push({
      element_id: 'rule_joint_forbid', kind: 'decision-rule',
      conditions: ['a=1 and b=1'], result: 'forbidden', priority: 1,
      source_claim_ids: ['claim_joint_forbid_e3'], model_refs: []
    });
    for (const claimId of ['claim_a_1', 'claim_b_1']) revision.evidence_claims.claims.find(
      (/** @type {any} */ claim) => claim.claim_id === claimId
    ).parent_claim_ids.push('claim_joint_forbid_e3');
    const { run, artifact } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
      const vectors = artifact.obligations.filter((/** @type {any} */ item) => item.combination_vector);
      assert.equal(vectors.some((/** @type {any} */ item) => {
        const values = Object.fromEntries(item.combination_vector.assignments.map(
          (/** @type {any} */ assignment) => [assignment.parameter_id, assignment.value_id]
        ));
        return values.a === '1' && values.b === '1';
      }), false);
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });

  await t.test('supported related forbid removes candidates but never enters selected Oracle prebindings', async () => {
    const revision = combinationRevision({ constraints: [{
      kind: 'forbid', assignments: [
        { parameter_id: 'a', value_id: '1' }, { parameter_id: 'b', value_id: '1' }
      ], evidence_refs: ['claim_forbid']
    }] });
    addForbidTargetClaim(revision, 'claim_forbid', ['claim_a_1', 'claim_b_1']);
    const { run, artifact } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
      const vectors = artifact.obligations.filter((/** @type {any} */ item) => item.combination_vector);
      assert.equal(vectors.some((/** @type {any} */ item) => {
        const values = Object.fromEntries(item.combination_vector.assignments.map(
          (/** @type {any} */ assignment) => [assignment.parameter_id, assignment.value_id]
        ));
        return values.a === '1' && values.b === '1';
      }), false);
      assert.equal(vectors.every((/** @type {any} */ item) => !item.required_oracle_refs.includes('claim_forbid')), true);
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
});

test('installed t-wise selected-value evidence must exist, be non-diagnostic, and cover scope', async (/** @type {any} */ t) => {
  /** @type {Array<[string, (revision:any)=>void, string]>} */
  const cases = [
    ['dangling', (/** @type {any} */ revision) => {
      revision.behavior_views.obligation_inputs.combination_requests[0]
        .parameters[0].values[0].evidence_claim_id = 'claim_missing';
    }, 'TWISE_EVIDENCE_DANGLING'],
    ['diagnostic', (/** @type {any} */ revision) => {
      addDiagnosticClaim(revision, 'claim_value_diagnostic');
      revision.behavior_views.obligation_inputs.combination_requests[0]
        .parameters[0].values[0].evidence_claim_id = 'claim_value_diagnostic';
    }, 'TWISE_EVIDENCE_LEVEL_INVALID'],
    ['scope', (/** @type {any} */ revision) => {
      revision.evidence_claims.claims.find(
        (/** @type {any} */ claim) => claim.claim_id === 'claim_a_0'
      ).scope = 'checkout/other';
    }, 'TWISE_EVIDENCE_SCOPE_MISMATCH']
  ];
  for (const [name, mutate, code] of cases) await t.test(String(name), async () => {
    const revision = combinationRevision();
    mutate(revision);
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === code), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
});

test('installed t-wise rejects partial duplicate unknown assignments and any public candidate cap', async (/** @type {any} */ t) => {
  const invalidMappings = [
    ['partial', [
      { parameter_id: 'a', value_id: '0' }, { parameter_id: 'b', value_id: '0' }
    ]],
    ['duplicate', [
      { parameter_id: 'a', value_id: '0' }, { parameter_id: 'a', value_id: '1' },
      { parameter_id: 'c', value_id: '0' }
    ]],
    ['unknown', [
      { parameter_id: 'a', value_id: '0' }, { parameter_id: 'b', value_id: '0' },
      { parameter_id: 'missing', value_id: '0' }
    ]]
  ];
  for (const [name, assignments] of invalidMappings) await t.test(String(name), async () => {
    const revision = combinationRevision({ vectorOracles: [{
      assignments, required_oracle_refs: []
    }] });
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === 'TWISE_REQUEST_INVALID'), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
  await t.test('public maxCandidates', async () => {
    const revision = combinationRevision();
    revision.behavior_views.obligation_inputs.combination_requests[0].maxCandidates = 8;
    const { run } = await installedCompilation(revision);
    try {
      assert.equal(run.reply.status, 'need_revision');
      assert.equal(run.reply.stage, 'behavior_views');
      assert.equal(run.reply.diagnostics.some((/** @type {any} */ item) => item.code === 'ADDITIONAL_PROPERTY'), true, JSON.stringify(run.reply));
    } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
  });
});

test('installed t-wise cap overflow derives one non-answerable owner-linked resource gap without sampling', async () => {
  const revision = combinationRevision({ parameters: 13 });
  const { run, artifact } = await installedCompilation(revision);
  try {
    assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
    const vectors = artifact.obligations.filter((/** @type {any} */ item) => item.combination_vector);
    const gaps = artifact.obligations.filter((/** @type {any} */ item) => (
      item.kind === 'requirement-gap' && item.gap_issue?.missing_type === 'resource_limit'
    ));
    assert.equal(vectors.length, 0);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].caseable, false);
    assert.equal(gaps[0].gap_issue.answerable, false);
    assert.equal(artifact.fact_routes.find((/** @type {any} */ item) => item.fact_id === 'fact_checkout')
      .obligation_ids.includes(gaps[0].obligation_id), true);
  } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
});

test('installed vector Oracle prebindings attach only to the exact canonical assignment', async () => {
  const assignments = [
    { parameter_id: 'a', value_id: '0' },
    { parameter_id: 'b', value_id: '0' },
    { parameter_id: 'c', value_id: '0' }
  ];
  const revision = combinationRevision({ vectorOracles: [{
    assignments, required_oracle_refs: ['claim_vector_oracle']
  }] });
  addExpectedClaim(revision, 'claim_vector_oracle', 'claim_checkout');
  const artifact = await installedObligations(revision);
  const vectors = artifact.obligations.filter((/** @type {any} */ item) => item.combination_vector);
  const prebound = vectors.filter((/** @type {any} */ item) => item.required_oracle_refs.length > 0);
  assert.equal(prebound.length, 1);
  assert.deepEqual(prebound[0].required_oracle_refs, ['claim_vector_oracle']);
  assert.deepEqual(prebound[0].combination_vector.assignments.map(
    (/** @type {any} */ item) => ({ parameter_id: item.parameter_id, value_id: item.value_id })
  ), assignments);
  assert.equal(vectors.filter((/** @type {any} */ item) => item !== prebound[0])
    .every((/** @type {any} */ item) => item.required_oracle_refs.length === 0), true);
});

test('installed vector Oracle prebindings reject accepted non-Oracle evidence', async () => {
  const revision = combinationRevision({ vectorOracles: [{
    assignments: [
      { parameter_id: 'a', value_id: '0' },
      { parameter_id: 'b', value_id: '0' },
      { parameter_id: 'c', value_id: '0' }
    ],
    required_oracle_refs: ['claim_a_0']
  }] });
  const { run } = await installedCompilation(revision);
  try {
    assert.equal(run.reply.status, 'need_revision');
    assert.equal(run.reply.stage, 'behavior_views');
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'TWISE_ORACLE_EVIDENCE_INVALID'
    ), true, JSON.stringify(run.reply));
  } finally { await rm(run.runDirectory, { recursive: true, force: true }); }
});

test('installed t-wise compilation is invariant to request, parameter, value, owner, and evidence array order', async () => {
  const first = combinationRevision();
  const second = clone(first);
  const request = second.behavior_views.obligation_inputs.combination_requests[0];
  request.parameters.reverse();
  for (const parameter of request.parameters) parameter.values.reverse();
  request.owner.fact_ids.reverse();
  request.owner.view_element_refs.reverse();
  request.interaction_risk.evidence_refs.reverse();
  second.evidence_claims.claims.reverse();
  const [left, right] = await Promise.all([installedCompilation(first), installedCompilation(second)]);
  try {
    assert.equal(left.run.reply.status, 'need_artifact', JSON.stringify(left.run.reply));
    assert.equal(right.run.reply.status, 'need_artifact', JSON.stringify(right.run.reply));
    assert.equal(canonicalStringify(left.artifact), canonicalStringify(right.artifact));
  } finally {
    await rm(left.run.runDirectory, { recursive: true, force: true });
    await rm(right.run.runDirectory, { recursive: true, force: true });
  }
});

test('empty Oracle prebinding is optional when a closed supported Oracle is supplied by the Case', () => {
  const candidate = closeOnlyObligation(baseCase());
  const result = classifyCaseDrafts(classificationContext({
    obligations: [baseObligation({ required_oracle_refs: [] })],
    cases: [candidate]
  }));
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.grounded.length, 1);
  assert.equal(result.blocked.length, 0);
});

test('Oracle semantic signature ignores IDs and evidence while preserving typed expected meaning', () => {
  const first = closeOnlyObligation(baseCase());
  const renamed = clone(first);
  renamed.steps[0].expectations[0].expectation_id = 'expectation_renamed';
  renamed.steps[0].expectations[0].closes_obligation_id = 'obligation_renamed';
  renamed.steps[0].expectations[0].evidence_ref = 'claim_renamed';
  renamed.steps[0].expectations[0].oracle_evidence_refs = ['claim_renamed'];
  renamed.steps[0].expectations[0].support_review = 'uncertain';
  const changedMeaning = clone(first);
  changedMeaning.steps[0].expectations[0].oracle.expected_state = 'rejected';

  assert.equal(executionSignature(first), executionSignature(renamed));
  assert.notEqual(executionSignature(first), executionSignature(changedMeaning));
});

/** @param {any} draft */
function expectation(draft) {
  return draft.steps[0].expectations[0];
}

/** @param {any} draft */
function refreshOracleRefs(draft) {
  refreshExecutionSignature(draft);
  return draft;
}

test('obligation Oracle closure is exactly one-to-one and auxiliary expectations never cover formal obligations', async (/** @type {any} */ t) => {
  await t.test('missing closure', () => {
    const draft = baseCase();
    expectation(draft).kind = 'auxiliary';
    delete expectation(draft).closes_obligation_id;
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'OBLIGATION_ORACLE_EXPECTATION_UNMAPPED'
    ), true, JSON.stringify(result));
  });

  await t.test('duplicate closure', () => {
    const draft = baseCase();
    draft.steps[0].expectations.push({
      ...clone(expectation(draft)), expectation_id: 'expectation_duplicate'
    });
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'OBLIGATION_ORACLE_EXPECTATION_DUPLICATE'
    ), true, JSON.stringify(result));
  });

  await t.test('auxiliary plus one formal closure', () => {
    const draft = baseCase();
    draft.steps[0].expectations.push({
      ...clone(expectation(draft)), kind: 'auxiliary', expectation_id: 'expectation_auxiliary',
      business_assertion: 'Audit trail is visible',
      observation_target: 'audit trail',
      oracle: { type: 'event', expected_event: 'audit visible', comparison: 'equals' }
    });
    delete draft.steps[0].expectations[1].closes_obligation_id;
    draft.testability_profile.observers.push({
      observer: 'tester', observation_target: 'audit trail', status: 'verified',
      provenance_ref: 'claim_capability'
    });
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length, 1, JSON.stringify(result));
  });
});

test('two obligations require two distinct explicit closures instead of automatic Oracle matching', async (/** @type {any} */ t) => {
  const secondObligationId = 'obligation_2222222222222222';
  const obligations = [baseObligation(), baseObligation({ obligation_id: secondObligationId })];
  const dispositions = obligations.map((item) => ({
    obligation_id: item.obligation_id, status: 'case_candidate', case_ids: [IDS.case]
  }));

  await t.test('two distinct closures pass', () => {
    const draft = baseCase({ obligation_ids: [IDS.obligation, secondObligationId] });
    draft.steps[0].expectations.push({
      ...clone(expectation(draft)), expectation_id: 'expectation_second',
      closes_obligation_id: secondObligationId
    });
    refreshOracleRefs(draft);
    const context = classificationContext({ obligations, cases: [draft], dispositions });
    context.obligations.fact_routes[0].obligation_ids.push(secondObligationId);
    const result = classifyCaseDrafts(context);
    assert.equal(result.grounded.length, 1, JSON.stringify(result));
  });

  await t.test('two expectations competing for one obligation fail both duplicate and unmapped checks', () => {
    const draft = baseCase({ obligation_ids: [IDS.obligation, secondObligationId] });
    draft.steps[0].expectations.push({
      ...clone(expectation(draft)), expectation_id: 'expectation_competing'
    });
    refreshOracleRefs(draft);
    const context = classificationContext({ obligations, cases: [draft], dispositions });
    context.obligations.fact_routes[0].obligation_ids.push(secondObligationId);
    const result = classifyCaseDrafts(context);
    const codes = result.diagnostics.map((item) => item.code);
    assert.equal(codes.includes('OBLIGATION_ORACLE_EXPECTATION_DUPLICATE'), true, JSON.stringify(result));
    assert.equal(codes.includes('OBLIGATION_ORACLE_EXPECTATION_UNMAPPED'), true, JSON.stringify(result));
  });
});

test('auxiliary expectations retain their own Oracle, evidence, support, and scope gates', async (/** @type {any} */ t) => {
  /** @param {any} draft */
  const addAuxiliary = (draft) => {
    draft.steps[0].expectations.push({
      ...clone(expectation(draft)), kind: 'auxiliary', expectation_id: 'expectation_auxiliary_gate',
      business_assertion: 'Audit trail is visible', observation_target: 'audit trail',
      oracle: { type: 'event', expected_event: 'audit visible', comparison: 'equals' }
    });
    delete draft.steps[0].expectations[1].closes_obligation_id;
    draft.testability_profile.observers.push({
      observer: 'tester', observation_target: 'audit trail', status: 'verified',
      provenance_ref: 'claim_capability'
    });
    refreshOracleRefs(draft);
    return draft;
  };

  await t.test('invalid typed Oracle', () => {
    const draft = addAuxiliary(baseCase());
    draft.steps[0].expectations[1].oracle.expected_event = '';
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.match(result.blocked[0].reason, /ORACLE_INVALID/u);
  });

  await t.test('unrelated evidence', () => {
    const unrelated = acceptedClaim('claim_auxiliary_unrelated');
    const draft = addAuxiliary(baseCase());
    draft.steps[0].expectations[1].evidence_ref = unrelated.claim_id;
    draft.steps[0].expectations[1].oracle_evidence_refs = [unrelated.claim_id];
    draft.evidence_refs.push(unrelated.claim_id);
    const result = classifyCaseDrafts(classificationContext({
      claims: [...baseClaims(), unrelated], cases: [draft]
    }));
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'AUXILIARY_ORACLE_EVIDENCE_UNRELATED'
    ), true, JSON.stringify(result));
  });

  await t.test('uncertain support review', () => {
    const draft = addAuxiliary(baseCase());
    draft.steps[0].expectations[1].support_review = 'uncertain';
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.match(result.blocked[0].reason, /SUPPORT_REVIEW_UNCERTAIN/u);
  });

  await t.test('out-of-scope evidence', () => {
    const outOfScope = acceptedClaim('claim_auxiliary_scope', 'E3', { scope: 'other' });
    const draft = addAuxiliary(baseCase());
    draft.steps[0].expectations[1].evidence_ref = outOfScope.claim_id;
    draft.steps[0].expectations[1].oracle_evidence_refs = [outOfScope.claim_id];
    draft.evidence_refs.push(outOfScope.claim_id);
    const result = classifyCaseDrafts(classificationContext({
      claims: [...baseClaims(), outOfScope], cases: [draft]
    }));
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'AUXILIARY_ORACLE_EVIDENCE_UNRELATED'
    ), true, JSON.stringify(result));
  });
});

test('Oracle closure requires prebindings, primary membership, legal ancestry, and a linked caseable target', async (/** @type {any} */ t) => {
  await t.test('prebinding coverage', () => {
    const draft = closeOnlyObligation(baseCase(), 'claim_fact');
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'OBLIGATION_ORACLE_PREBINDING_MISSING'
    ), true, JSON.stringify(result));
  });

  await t.test('primary membership', () => {
    const draft = baseCase();
    expectation(draft).oracle_evidence_refs = ['claim_fact'];
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'ORACLE_PRIMARY_EVIDENCE_NOT_DECLARED'
    ), true, JSON.stringify(result));
  });

  await t.test('unrelated same-scope E3', () => {
    const unrelated = acceptedClaim('claim_unrelated_oracle');
    const draft = baseCase();
    expectation(draft).evidence_ref = unrelated.claim_id;
    expectation(draft).oracle_evidence_refs = [unrelated.claim_id];
    draft.evidence_refs.push(unrelated.claim_id);
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({
      claims: [...baseClaims(), unrelated], cases: [draft],
      obligations: [baseObligation({ required_oracle_refs: [] })]
    }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'OBLIGATION_ORACLE_EVIDENCE_UNRELATED'
    ), true, JSON.stringify(result));
  });

  await t.test('unlinked close target', () => {
    const draft = baseCase();
    expectation(draft).closes_obligation_id = 'obligation_unlinked';
    refreshOracleRefs(draft);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some(
      (item) => item.code === 'ORACLE_CLOSE_TARGET_INVALID'
    ), true, JSON.stringify(result));
  });

  await t.test('legal E2 transitive ancestry', () => {
    const direct = acceptedClaim('claim_owner_root');
    const derived = acceptedClaim('claim_derived_oracle', 'E2', {
      kind: 'expected-value', derivation_kind: 'formula', derivation_target: 'expected-value',
      parent_claim_ids: [direct.claim_id], rule_input: { expression: 'owner total + tax' }
    });
    const draft = closeOnlyObligation(baseCase(), derived.claim_id);
    draft.evidence_refs.push(direct.claim_id, derived.claim_id);
    const result = classifyCaseDrafts(classificationContext({
      claims: [...baseClaims(), direct, derived], cases: [draft],
      obligations: [baseObligation({ source_claim_ids: [direct.claim_id], required_oracle_refs: [] })]
    }));
    assert.equal(result.grounded.length, 1, JSON.stringify(result));
  });
});

test('forbid evidence never becomes a selected-vector Oracle even when it descends from an owner root', () => {
  const forbid = acceptedClaim('claim_forbid_oracle', 'E2', {
    kind: 'expected-value', derivation_kind: 'decision-table-instance',
    derivation_target: 'expected-value', parent_claim_ids: ['claim_fact'],
    parameters: { table_id: 'forbid_table' },
    rule_input: { conditions: ['a=1 and b=1'], outcome: 'forbidden' }
  });
  const obligation = baseObligation({
    kind: 'interaction',
    required_oracle_refs: [],
    combination_vector: {
      policy_id: 'twise-candidate-cap-v1', strength: 2,
      owner: {
        view_id: 'view_checkout', fact_ids: [IDS.fact],
        view_element_refs: [{ view_id: 'view_checkout', element_id: 'edge_submit' }]
      },
      assignments: [
        { parameter_id: 'a', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'b', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'c', value_id: '0', evidence_claim_id: 'claim_fact' }
      ],
      forbid_evidence_refs: [forbid.claim_id]
    }
  });
  const draft = closeOnlyObligation(baseCase(), forbid.claim_id);
  draft.evidence_refs.push(forbid.claim_id);
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), forbid], obligations: [obligation], cases: [draft]
  }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some(
    (item) => item.code === 'OBLIGATION_ORACLE_EVIDENCE_FORBIDDEN'
  ), true, JSON.stringify(result));
});

test('Case and expectation closure cannot target requirement gaps, Blocked lanes, or NotApplicable lanes', async (/** @type {any} */ t) => {
  await t.test('requirement gap', () => {
    const gapId = IDS.obligation;
    const signature = { missing_type: 'resource_limit', semantic_refs: ['claim_fact'], scope: 'checkout' };
    const gap = baseObligation({
      kind: 'requirement-gap', caseable: false,
      gap_issue: {
        root_issue_id: stableId('root', signature), root_issue_key: canonicalStringify(signature),
        ...signature, answerable: false, reasons: ['resource limit'], evidence_refs: ['claim_fact']
      }
    });
    const result = classifyCaseDrafts(classificationContext({ obligations: [gap], dispositions: [] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some((item) => item.code === 'REQUIREMENT_GAP_CASE_FORBIDDEN'), true);
  });

  for (const lane of ['blocker', 'not_applicable']) await t.test(lane, () => {
    const disposition = lane === 'blocker'
      ? {
          status: 'blocker', affected_obligation_ids: [IDS.obligation],
          issue_intent: {
            missing_type: 'oracle', scope: 'checkout', answerable: true, risk: 'high',
            reasons: ['missing'], evidence_refs: ['claim_fact']
          }, subject: { kind: 'facts', fact_ids: [IDS.fact] }
        }
      : {
          obligation_id: IDS.obligation, status: 'not_applicable',
          exclusion_claim_id: 'claim_exclusion', scope: 'checkout', support_review: 'supported'
        };
    const claims = lane === 'not_applicable'
      ? [...baseClaims(), acceptedClaim('claim_exclusion')] : baseClaims();
    const result = classifyCaseDrafts(classificationContext({ claims, dispositions: [disposition] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.equal(result.diagnostics.some((item) => item.code === 'CASE_LANE_DISPOSITION_MISMATCH'), true);
  });
});

test('an E1 selected-value source caps an otherwise E3 Oracle Case at Conditional', () => {
  const valueClaim = acceptedClaim('claim_selected_value', 'E1');
  const obligation = baseObligation({
    kind: 'interaction',
    source_claim_ids: ['claim_fact', valueClaim.claim_id], required_oracle_refs: [],
    combination_vector: {
      policy_id: 'twise-candidate-cap-v1', strength: 3,
      owner: {
        view_id: 'view_checkout', fact_ids: [IDS.fact],
        view_element_refs: [{ view_id: 'view_checkout', element_id: 'edge_submit' }]
      },
      assignments: [
        { parameter_id: 'a', value_id: '0', evidence_claim_id: valueClaim.claim_id },
        { parameter_id: 'b', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'c', value_id: '0', evidence_claim_id: 'claim_fact' }
      ],
      forbid_evidence_refs: []
    }
  });
  const draft = closeOnlyObligation(baseCase(), 'claim_fact');
  draft.evidence_refs.push(valueClaim.claim_id);
  draft.temporary_assumption = {
    claim_id: valueClaim.claim_id,
    invalidation_condition: 'The selected input value receives final approval.'
  };
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), valueClaim], obligations: [obligation], cases: [draft]
  }));
  assert.equal(result.grounded.length, 0);
  assert.equal(result.conditional.length, 1, JSON.stringify(result));
});

test('selected vector cannot become executable when an assignment claim is absent from obligation sources', () => {
  const missing = acceptedClaim('claim_selected_missing', 'E2');
  const obligation = baseObligation({
    kind: 'interaction',
    required_oracle_refs: [],
    combination_vector: {
      policy_id: 'twise-candidate-cap-v1', strength: 2,
      owner: {
        view_id: 'view_checkout', fact_ids: [IDS.fact],
        view_element_refs: [{ view_id: 'view_checkout', element_id: 'edge_submit' }]
      },
      assignments: [
        { parameter_id: 'a', value_id: '0', evidence_claim_id: missing.claim_id },
        { parameter_id: 'b', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'c', value_id: '0', evidence_claim_id: 'claim_fact' }
      ],
      forbid_evidence_refs: []
    }
  });
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), missing], obligations: [obligation], cases: [baseCase()]
  }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some((item) => item.code === 'TWISE_SELECTED_VALUE_SOURCE_MISSING'), true);
});

test('classifier rejects a derived vector whose element refs name a different owner view', () => {
  const obligation = baseObligation({
    kind: 'interaction',
    combination_vector: {
      policy_id: 'twise-candidate-cap-v1', strength: 2,
      owner: {
        view_id: 'view_other', fact_ids: [IDS.fact],
        view_element_refs: [{ view_id: 'view_checkout', element_id: 'edge_submit' }]
      },
      assignments: [
        { parameter_id: 'a', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'b', value_id: '0', evidence_claim_id: 'claim_fact' }
      ],
      forbid_evidence_refs: []
    }
  });
  const result = classifyCaseDrafts(classificationContext({ obligations: [obligation] }));

  assert.equal(result.grounded.length + result.conditional.length, 0, JSON.stringify(result));
  assert.equal(result.diagnostics.some(
    (item) => item.code === 'TWISE_OWNER_VIEW_MISMATCH'
  ), true, JSON.stringify(result));
});

test('classifier independently rejects invalid selected-value evidence', () => {
  const selected = acceptedClaim('claim_selected_diagnostic', 'E3', { kind: 'diagnostic' });
  const obligation = baseObligation({
    kind: 'interaction',
    source_claim_ids: ['claim_fact', selected.claim_id], required_oracle_refs: [],
    combination_vector: {
      policy_id: 'twise-candidate-cap-v1', strength: 2,
      owner: {
        view_id: 'view_checkout', fact_ids: [IDS.fact],
        view_element_refs: [{ view_id: 'view_checkout', element_id: 'edge_submit' }]
      },
      assignments: [
        { parameter_id: 'a', value_id: '0', evidence_claim_id: selected.claim_id },
        { parameter_id: 'b', value_id: '0', evidence_claim_id: 'claim_fact' },
        { parameter_id: 'c', value_id: '0', evidence_claim_id: 'claim_fact' }
      ],
      forbid_evidence_refs: []
    }
  });
  const draft = closeOnlyObligation(baseCase(), 'claim_fact');
  draft.evidence_refs.push(selected.claim_id);
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), selected], obligations: [obligation], cases: [draft]
  }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some(
    (item) => item.code === 'TWISE_SELECTED_VALUE_EVIDENCE_INVALID'
  ), true, JSON.stringify(result));
});

test('Agent signature names exact expectation IDs while the classified Case exposes semantic Oracle IDs', () => {
  const draft = baseCase();
  const valid = classifyCaseDrafts(classificationContext({ cases: [draft] }));
  assert.equal(valid.grounded.length, 1, JSON.stringify(valid));
  const classified = /** @type {any} */ (valid.grounded[0]);
  assert.deepEqual(classified.execution_signature.oracle_refs.length, 1);
  assert.match(classified.execution_signature.oracle_refs[0], /^oracle_[a-f0-9]{16}$/u);
  assert.notEqual(classified.execution_signature.oracle_refs[0], IDS.expectation);

  const invalid = baseCase();
  invalid.execution_signature.oracle_refs = [executionSignature(invalid)];
  const rejected = classifyCaseDrafts(classificationContext({ cases: [invalid] }));
  assert.equal(rejected.grounded.length + rejected.conditional.length, 0);
  assert.match(rejected.blocked[0].reason, /EXECUTION_SIGNATURE_MISMATCH/u);
});

test('Agent execution signatures reject legacy Test Point IDs', () => {
  const draft = baseCase();
  draft.execution_signature.test_point_ids = [IDS.obligation];
  const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some((item) => item.code === 'UNKNOWN_KEY'), true);
});

test('same obligation preserves distinct typed execution signatures and merges only identical signatures', () => {
  const first = baseCase();
  const second = baseCase({ case_id: 'case_2222222222222222' });
  second.data[0].value = '99.00';
  refreshOracleRefs(second);
  const third = baseCase({ case_id: 'case_3333333333333333' });
  third.data[0].value = '101.00';
  refreshOracleRefs(third);
  const distinct = classifyCaseDrafts(classificationContext({
    cases: [first, second, third],
    dispositions: [{
      obligation_id: IDS.obligation, status: 'case_candidate',
      case_ids: [first.case_id, second.case_id, third.case_id]
    }]
  }));
  assert.equal(distinct.grounded.length, 3, JSON.stringify(distinct));
  assert.equal(new Set(distinct.grounded.map((item) => item.case_id)).size, 3);

  const duplicate = baseCase({ case_id: 'case_4444444444444444' });
  const merged = classifyCaseDrafts(classificationContext({
    cases: [first, duplicate],
    dispositions: [{
      obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [first.case_id, duplicate.case_id]
    }]
  }));
  assert.equal(merged.grounded.length, 1, JSON.stringify(merged));
  assert.deepEqual(merged.diagnostics, []);
});

test('identical-signature merge preserves fact, obligation, source, evidence, and Case associations', () => {
  const secondFactId = 'fact_checkout_secondary';
  const secondObligationId = 'obligation_2222222222222222';
  const secondClaim = acceptedClaim('claim_fact_secondary');
  const alternateOracle = acceptedClaim('claim_oracle_alternate', 'E2', {
    kind: 'expected-value', derivation_kind: 'formula', derivation_target: 'expected-value',
    parent_claim_ids: ['claim_oracle'], rule_input: { expression: 'accepted' }
  });
  const first = baseCase();
  const second = baseCase({
    case_id: 'case_2222222222222222', fact_ids: [secondFactId],
    obligation_ids: [secondObligationId], source_claim_ids: [secondClaim.claim_id]
  });
  expectation(second).closes_obligation_id = secondObligationId;
  expectation(second).evidence_ref = alternateOracle.claim_id;
  expectation(second).oracle_evidence_refs = ['claim_oracle', alternateOracle.claim_id];
  second.evidence_refs.push(secondClaim.claim_id, alternateOracle.claim_id);
  refreshOracleRefs(second);
  const context = classificationContext({
    claims: [...baseClaims(), secondClaim, alternateOracle],
    facts: [
      { fact_id: IDS.fact, claim_id: 'claim_fact', status: 'active', source_claim_ids: ['claim_fact'] },
      { fact_id: secondFactId, claim_id: secondClaim.claim_id, status: 'active', source_claim_ids: [secondClaim.claim_id] }
    ],
    obligations: [
      baseObligation(),
      baseObligation({ obligation_id: secondObligationId, source_claim_ids: [secondClaim.claim_id] })
    ],
    cases: [first, second],
    dispositions: [
      { obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [first.case_id] },
      { obligation_id: secondObligationId, status: 'case_candidate', case_ids: [second.case_id] }
    ]
  });
  context.obligations.fact_routes.push({
    fact_id: secondFactId, route_type: 'obligations', obligation_ids: [secondObligationId]
  });
  const result = classifyCaseDrafts(context);
  assert.equal(result.grounded.length, 1, JSON.stringify(result));
  assert.deepEqual(result.grounded[0].fact_ids, [IDS.fact, secondFactId].sort());
  assert.deepEqual(result.grounded[0].obligation_ids, [IDS.obligation, secondObligationId].sort());
  assert.deepEqual(result.grounded[0].source_claim_ids, ['claim_fact', secondClaim.claim_id].sort());
  assert.equal((/** @type {any} */ (result.grounded[0])).evidence_refs.includes(alternateOracle.claim_id), true);
  assert.deepEqual(context.caseDrafts.obligation_dispositions.map((/** @type {any} */ item) => item.case_ids), [
    [first.case_id], [second.case_id]
  ]);
});

test('same obligation cannot cross Grounded and Conditional lanes', () => {
  const assumption = acceptedClaim('claim_lane_assumption', 'E1');
  const grounded = baseCase();
  const conditional = baseCase({ case_id: 'case_2222222222222222' });
  conditional.data[0].value = 'temporary';
  conditional.evidence_refs.push(assumption.claim_id);
  conditional.temporary_assumption = {
    claim_id: assumption.claim_id,
    invalidation_condition: 'The temporary selected value receives final approval.'
  };
  conditional.testability_profile.capabilities[0] = {
    capability: 'checkout-control', status: 'approved-assumption', provenance_ref: assumption.claim_id
  };
  refreshOracleRefs(conditional);
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), assumption], cases: [grounded, conditional],
    dispositions: [{
      obligation_id: IDS.obligation, status: 'case_candidate',
      case_ids: [grounded.case_id, conditional.case_id]
    }]
  }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some((item) => item.code === 'OBLIGATION_EXECUTABLE_LANE_CONFLICT'), true);
});

test('Oracle expectation order and association/evidence metadata do not affect identity', () => {
  const first = baseCase();
  first.steps[0].expectations.push({
    ...clone(expectation(first)), kind: 'auxiliary', expectation_id: 'expectation_aux',
    oracle: { type: 'event', expected_event: 'audit', comparison: 'equals' }
  });
  delete first.steps[0].expectations[1].closes_obligation_id;
  const second = clone(first);
  second.steps[0].expectations.reverse();
  for (const item of second.steps[0].expectations) {
    item.expectation_id = `${item.expectation_id}_renamed`;
    item.oracle_evidence_refs.reverse();
  }
  assert.equal(executionSignature(first), executionSignature(second));
});
