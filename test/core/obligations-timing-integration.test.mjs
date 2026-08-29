import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { compile as compileIntegration } from '../../src/obligations/integration.mjs';
import { compile as compileTiming } from '../../src/obligations/timing.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../../src/schema-validator.mjs';
import { auditInteractionMatrix } from '../../src/views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/behavior-views.schema.json'
), 'utf8'));
const obligationsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-obligations.schema.json'
), 'utf8'));
const sourcePackSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/source-pack.schema.json'
), 'utf8'));
const evidenceSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json'
), 'utf8'));
const sourceDigest = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

/** @param {string} name */
async function fixture(name) {
  return JSON.parse(await readFile(path.join(repositoryRoot, `test/fixtures/views/${name}-obligations.json`), 'utf8'));
}

/** @param {any} artifact @returns {any} */
function acceptedView(artifact) {
  assert.deepEqual(validateAgainstSchema(artifact, behaviorSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const view = artifact.views[0];
  const claimIds = [...new Set([
    ...view.source_claim_ids,
    ...view.elements.flatMap((/** @type {any} */ element) => [...element.source_claim_ids, ...element.model_refs])
  ])];
  const sourcePack = {
    schema_version: '1.0.0', source_revision: artifact.source_revision, run_scope: view.scope,
    sources: [{
      source_id: 'source_task6_time_integration', kind: 'prd', version: '1', status: 'effective', authority: 'owner',
      content: 'Task 6 timing and integration evidence', content_digest: sourceDigest, scope: view.scope
    }],
    locators: [{
      locator_id: 'locator_task6_time_integration', source_id: 'source_task6_time_integration', type: 'text-range',
      text_range: { start: 0, end: 38 }, content_digest: sourceDigest, extraction_integrity: 'verified'
    }],
    source_policy: { rules: [{
      rule_id: 'rule_task6_time_integration', source_ids: ['source_task6_time_integration'],
      scope: view.scope, authority: 'owner', status: 'effective'
    }] },
    decision_records: [], clarification_events: []
  };
  const evidenceClaims = {
    schema_version: '1.0.0', source_revision: artifact.source_revision,
    claims: claimIds.map((claimId) => ({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement', scope: view.scope,
      value: claimId, source_locator_ids: ['locator_task6_time_integration'], source_id: 'source_task6_time_integration'
    })),
    fact_ledger: []
  };
  assert.deepEqual(validateAgainstSchema(sourcePack, sourcePackSchema), []);
  assert.deepEqual(validateAgainstSchema(evidenceClaims, evidenceSchema), []);
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  assert.deepEqual(evidence.diagnostics, []);
  const validated = validateBehaviorViews(
    { claimsById: evidence.claimsById, factLedger: [], runScope: view.scope }, artifact
  );
  assert.deepEqual(validated.diagnostics, []);
  return { view: validated.viewsById.get(view.view_id), claimsById: evidence.claimsById };
}

/** @param {Map<string, any>} claimsById */
function timingContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([['timing_expiry', 'high']]),
    requiredOracleRefsByElementId: new Map([['timing_expiry', ['claim_expiry_threshold']]]),
    requiredCapabilitiesByElementId: new Map([['timing_expiry', ['clock-control', 'session-observer']]]),
    timingSpecialResponsibilitiesByElementId: new Map([['timing_expiry', [
      {
        type: 'timeout', signal: 'session times out at threshold',
        source_claim_ids: ['claim_timeout_signal'], required_oracle_refs: ['claim_timeout_signal']
      },
      {
        type: 'retry', signal: 'retry once after timeout',
        source_claim_ids: ['claim_retry_signal'], required_oracle_refs: []
      },
      {
        type: 'retry', signal: 'generic retry risk',
        source_claim_ids: [], required_oracle_refs: []
      }
    ]]])
  };
}

/** @param {Map<string, any>} claimsById */
function integrationContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([['integration_payment', 'critical']]),
    requiredOracleRefsByElementId: new Map([['integration_payment', ['claim_integration_contract']]]),
    requiredCapabilitiesByElementId: new Map([['integration_payment', ['api-observer', 'event-observer', 'persistence-observer']]]),
    integrationInvariantsByElementId: new Map([['integration_payment', [{
      invariant: 'accepted payment changes merchant balance once',
      source_claim_ids: ['claim_balance_invariant'], required_oracle_refs: ['claim_balance_invariant']
    }]]]),
    integrationSpecialResponsibilitiesByElementId: new Map([['integration_payment', [
      {
        type: 'contract-compatibility', signal: 'v1 clients remain compatible',
        source_claim_ids: ['claim_contract_compatibility'], required_oracle_refs: ['claim_contract_compatibility']
      },
      {
        type: 'concurrency', signal: 'two captures may race',
        source_claim_ids: ['claim_concurrency_signal'], required_oracle_refs: []
      },
      {
        type: 'idempotency', signal: 'duplicate requests share one payment',
        source_claim_ids: ['claim_idempotency_signal'], required_oracle_refs: []
      },
      {
        type: 'security-abuse', signal: 'tampered amount is rejected',
        source_claim_ids: ['claim_security_signal'], required_oracle_refs: []
      },
      {
        type: 'security-abuse', signal: 'generic security risk',
        source_claim_ids: [], required_oracle_refs: []
      }
    ]]])
  };
}

const timingIds = [
  'obligation_382b8847885e1014',
  'obligation_41b5e5e2071b182b',
  'obligation_6bdd46b77c317872',
  'obligation_ac69bfeba059cbec',
  'obligation_cf73099fcb3890df'
];
const integrationIds = [
  'obligation_386cf0d09f4ae53b',
  'obligation_4f54e56d9e21aa88',
  'obligation_516fb4f8bfc543d6',
  'obligation_7e914612d895ce12',
  'obligation_9c9c3ec476d59024',
  'obligation_9e250381784ca354',
  'obligation_a6fd78cc90513afe',
  'obligation_b1bfc454499face5',
  'obligation_b3db5d55dac8cc64',
  'obligation_b5f0a5c471a91ec3',
  'obligation_bb2e2fa4bf1eb677',
  'obligation_d98c95e3a4687058',
  'obligation_f52ae3cf752bfca0'
];

// Break caught: skipping equality, inventing timeout/retry from risk alone, or collapsing threshold sides changes the literal 3+2 responsibilities.
test('timing integration obligations hand-count before equal after and only evidence-backed timeout retry responsibilities', async () => {
  const { view, claimsById } = acceptedView(await fixture('timing'));

  const actual = compileTiming(view, timingContext(claimsById));

  assert.equal(actual.length, 5);
  assert.deepEqual(actual.map((seed) => seed.obligation_id), timingIds);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_expiry_threshold')).length, 5);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_timeout_signal')).length, 1);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_retry_signal')).length, 1);
  assert.equal(actual.some((seed) => seed.source_claim_ids.some((claim) => claim.includes('generic'))), false);
  const retry = actual.find((seed) => seed.source_claim_ids.includes('claim_retry_signal'));
  assert.deepEqual(retry?.required_oracle_refs, []);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '1.0.0', source_revision: 6, obligations: actual, fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
});

// Break caught: merging integration surfaces or omitting a side effect/invariant changes the literal 8 core + 1 invariant + 4 approved responsibilities.
test('timing integration obligations keep every request response persistence event callback compensation side effect invariant and approved special signal distinct', async () => {
  const { view, claimsById } = acceptedView(await fixture('integration'));

  const actual = compileIntegration(view, integrationContext(claimsById));

  assert.equal(actual.length, 13);
  assert.deepEqual(actual.map((seed) => seed.obligation_id), integrationIds);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_integration_contract')).length, 13);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_balance_invariant')).length, 1);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_contract_compatibility')).length, 1);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_concurrency_signal')).length, 1);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_idempotency_signal')).length, 1);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_security_signal')).length, 1);
  assert.equal(actual.some((seed) => seed.source_claim_ids.some((claim) => claim.includes('generic'))), false);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '1.0.0', source_revision: 6, obligations: actual, fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds({ obligations: actual }), []);
});

// Break caught: a high risk flag manufactures an Oracle or an expected result instead of retaining a formal Blocked seed / caller-owned Exploratory risk.
test('timing integration obligations never turn risk alone into a formal seed or a generic Oracle', async () => {
  const timing = acceptedView(await fixture('timing'));
  const integration = acceptedView(await fixture('integration'));

  const timingSeeds = compileTiming(timing.view, timingContext(timing.claimsById));
  const integrationSeeds = compileIntegration(integration.view, integrationContext(integration.claimsById));

  assert.equal(timingSeeds.length, 5);
  assert.equal(integrationSeeds.length, 13);
  for (const claimId of ['claim_concurrency_signal', 'claim_idempotency_signal', 'claim_security_signal']) {
    const seed = integrationSeeds.find((candidate) => candidate.source_claim_ids.includes(claimId));
    assert.deepEqual(seed?.required_oracle_refs, []);
  }
  assert.equal([...timingSeeds, ...integrationSeeds]
    .some((seed) => seed.required_oracle_refs.some((claim) => claim.includes('generic'))), false);
});

// Break caught: source/provenance/order changes perturb semantic IDs, mutate the validated view, or share returned arrays.
test('timing integration obligations stay stable, code-point sorted, fresh, and non-mutating under semantic reorder', async () => {
  const timingArtifact = await fixture('timing');
  timingArtifact.source_revision = 77;
  timingArtifact.views[0].source_claim_ids.reverse();
  const timing = acceptedView(timingArtifact);
  const integrationArtifact = await fixture('integration');
  integrationArtifact.views[0].elements[0].side_effects.reverse();
  integrationArtifact.views[0].source_claim_ids.reverse();
  const integration = acceptedView(integrationArtifact);
  const provenanceArtifact = await fixture('integration');
  provenanceArtifact.views[0].source_claim_ids = provenanceArtifact.views[0].source_claim_ids.map(
    (/** @type {string} */ claimId) => claimId === 'claim_integration_contract'
      ? 'claim_integration_contract_v2' : claimId
  );
  provenanceArtifact.views[0].elements[0].source_claim_ids = ['claim_integration_contract_v2'];
  const provenance = acceptedView(provenanceArtifact);
  const provenanceContext = integrationContext(provenance.claimsById);
  provenanceContext.requiredOracleRefsByElementId.set(
    'integration_payment', ['claim_integration_contract_v2']
  );
  const timingBefore = JSON.stringify(timing.view);
  const integrationBefore = JSON.stringify(integration.view);

  const timingFirst = compileTiming(timing.view, timingContext(timing.claimsById));
  const timingSecond = compileTiming(timing.view, timingContext(timing.claimsById));
  const integrationFirst = compileIntegration(integration.view, integrationContext(integration.claimsById));
  const provenanceFirst = compileIntegration(provenance.view, provenanceContext);

  assert.deepEqual(timingFirst.map((seed) => seed.obligation_id), timingIds);
  assert.deepEqual(integrationFirst.map((seed) => seed.obligation_id), integrationIds);
  assert.deepEqual(provenanceFirst.map((seed) => seed.obligation_id), integrationIds);
  assert.equal(JSON.stringify(timing.view), timingBefore);
  assert.equal(JSON.stringify(integration.view), integrationBefore);
  assert.notStrictEqual(timingFirst, timingSecond);
  assert.notStrictEqual(timingFirst[0], timingSecond[0]);
});

// Break caught: owner-free identities collapse equal invariant/signal text from two semantically distinct contracts.
test('timing integration obligations bind shared invariant and special text to its owning semantic contract', async () => {
  const artifact = await fixture('integration');
  const second = structuredClone(artifact.views[0].elements[0]);
  second.element_id = 'integration_refund';
  second.request = { target: 'POST /refunds', payload: 'payment id and amount' };
  second.response = { status: '202', body: 'refund id and pending state' };
  second.persistence = { operation: 'insert', target: 'refunds' };
  second.event = { name: 'refund.accepted', direction: 'publish' };
  second.callback = { target: 'payment service', event: 'refund confirmed' };
  second.compensation = { action: 'cancel refund', trigger: 'payment update fails' };
  second.side_effects = [
    { kind: 'ledger', target: 'refund balance' },
    { kind: 'notification', target: 'refund receipt' }
  ];
  second.source_claim_ids = ['claim_refund_contract'];
  artifact.views[0].elements.push(second);
  artifact.views[0].source_claim_ids.push('claim_refund_contract');
  const { view, claimsById } = acceptedView(artifact);
  const context = integrationContext(claimsById);
  context.riskByElementId.set('integration_refund', 'high');
  context.requiredOracleRefsByElementId.set('integration_refund', ['claim_refund_contract']);
  context.requiredCapabilitiesByElementId.set('integration_refund', ['api-observer']);
  context.integrationInvariantsByElementId.set('integration_refund', [{
    invariant: 'accepted payment changes merchant balance once',
    source_claim_ids: ['claim_balance_invariant'], required_oracle_refs: ['claim_balance_invariant']
  }]);
  context.integrationSpecialResponsibilitiesByElementId.set('integration_refund', [{
    type: 'contract-compatibility', signal: 'v1 clients remain compatible',
    source_claim_ids: ['claim_contract_compatibility'], required_oracle_refs: ['claim_contract_compatibility']
  }]);

  const actual = compileIntegration(view, context);

  assert.equal(actual.length, 23);
  assert.equal(new Set(actual.map((seed) => seed.obligation_id)).size, 23);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_balance_invariant')).length, 2);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_contract_compatibility')).length, 2);
});
