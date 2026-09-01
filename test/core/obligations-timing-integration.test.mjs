import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { compile as compileIntegration } from '../../src/obligations/integration.mjs';
import { compile as compileTiming } from '../../src/obligations/timing.mjs';
import { responsibilityKey } from '../../src/obligations/responsibility.mjs';
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
    responsibilityBindings: [
      binding(timingKey('timing_expiry', 'threshold', 'before'), 'medium',
        ['claim_expiry_before'], ['claim_expiry_before'], ['before-clock']),
      binding(timingKey('timing_expiry', 'threshold', 'equal'), 'critical',
        ['claim_expiry_equal'], [], ['equal-clock']),
      binding(timingKey('timing_expiry', 'threshold', 'after'), 'high',
        ['claim_expiry_after'], ['claim_expiry_after'], ['after-clock']),
      binding(timingKey('timing_expiry', 'timeout', 'session times out at threshold'), 'critical',
        ['claim_timeout_signal'], ['claim_timeout_signal'], ['timeout-observer']),
      binding(timingKey('timing_expiry', 'retry', 'retry once after timeout'), 'high',
        ['claim_retry_signal'], [], ['retry-control'])
    ],
    timingSpecialResponsibilitiesByElementId: new Map([['timing_expiry', [
      { type: 'timeout', signal: 'session times out at threshold' },
      { type: 'retry', signal: 'retry once after timeout' },
      { type: 'retry', signal: 'generic retry risk' }
    ]]])
  };
}

/** @param {Map<string, any>} claimsById */
function integrationContext(claimsById) {
  return {
    claimsById,
    responsibilityBindings: [
      ...['request', 'response', 'persistence', 'event', 'callback', 'compensation'].map((surface) => binding(
        integrationKey('integration_payment', 'surface', surface),
        surface === 'request' ? 'critical' : 'high', [`claim_integration_${surface}`],
        surface === 'compensation' ? [] : [`claim_integration_${surface}`], [`${surface}-observer`]
      )),
      binding(integrationKey('integration_payment', 'side-effect', {
        kind: 'ledger', target: 'merchant balance'
      }), 'critical', ['claim_integration_ledger'], [], ['ledger-observer']),
      binding(integrationKey('integration_payment', 'side-effect', {
        kind: 'notification', target: 'buyer receipt'
      }), 'medium', ['claim_integration_notification'], [], ['notification-observer']),
      binding(integrationKey('integration_payment', 'invariant',
        'accepted payment changes merchant balance once'), 'critical',
      ['claim_balance_invariant'], ['claim_balance_invariant'], ['balance-observer']),
      binding(integrationKey('integration_payment', 'contract-compatibility',
        'v1 clients remain compatible'), 'high',
      ['claim_contract_compatibility'], ['claim_contract_compatibility'], ['contract-observer']),
      binding(integrationKey('integration_payment', 'concurrency', 'two captures may race'), 'critical',
        ['claim_concurrency_signal'], [], ['race-control']),
      binding(integrationKey('integration_payment', 'idempotency',
        'duplicate requests share one payment'), 'critical',
      ['claim_idempotency_signal'], [], ['dedup-observer']),
      binding(integrationKey('integration_payment', 'security-abuse',
        'tampered amount is rejected'), 'critical',
      ['claim_security_signal'], [], ['security-observer'])
    ],
    integrationInvariantsByElementId: new Map([['integration_payment', [{
      invariant: 'accepted payment changes merchant balance once'
    }]]]),
    integrationSpecialResponsibilitiesByElementId: new Map([['integration_payment', [
      { type: 'contract-compatibility', signal: 'v1 clients remain compatible' },
      { type: 'concurrency', signal: 'two captures may race' },
      { type: 'idempotency', signal: 'duplicate requests share one payment' },
      { type: 'security-abuse', signal: 'tampered amount is rejected' },
      { type: 'security-abuse', signal: 'generic security risk' }
    ]]])
  };
}

/** @param {string} elementId @param {string} responsibility @param {string} discriminator */
function timingKey(elementId, responsibility, discriminator) {
  return responsibilityKey('timing', elementId, responsibility === 'threshold'
    ? { responsibility, threshold_relation: discriminator }
    : { responsibility, signal: discriminator });
}

/** @param {string} elementId @param {string} responsibility @param {unknown} discriminator */
function integrationKey(elementId, responsibility, discriminator) {
  if (responsibility === 'surface') return responsibilityKey('integration', elementId, {
    responsibility, surface: discriminator
  });
  if (responsibility === 'side-effect') return responsibilityKey('integration', elementId, {
    responsibility, side_effect: discriminator
  });
  if (responsibility === 'invariant') return responsibilityKey('integration', elementId, {
    responsibility, invariant: discriminator
  });
  return responsibilityKey('integration', elementId, { responsibility, signal: discriminator });
}

/** @param {string} responsibilityKeyValue @param {string} risk @param {string[]} sourceClaimIds @param {string[]} oracleRefs @param {string[]} capabilities */
function binding(responsibilityKeyValue, risk, sourceClaimIds, oracleRefs, capabilities) {
  return {
    responsibility_key: responsibilityKeyValue,
    risk, source_claim_ids: sourceClaimIds,
    required_oracle_refs: oracleRefs, required_capabilities: capabilities
  };
}

const timingIds = [
  'obligation_1274117c5d6fbf96',
  'obligation_426fc295cd2e7f40',
  'obligation_6597da7824660f5f',
  'obligation_7664bb8dc2ffe3f2',
  'obligation_9b81ddb8c62bce14'
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
  assert.deepEqual(actual.map((seed) => seed.source_claim_ids).sort(), [
    ['claim_expiry_after'], ['claim_expiry_before'], ['claim_expiry_equal'],
    ['claim_retry_signal'], ['claim_timeout_signal']
  ]);
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
  assert.equal(actual.every((seed) => seed.source_claim_ids.length === 1), true);
  for (const surface of ['request', 'response', 'persistence', 'event', 'callback', 'compensation']) {
    assert.equal(actual.filter((seed) => seed.source_claim_ids.includes(`claim_integration_${surface}`)).length, 1);
  }
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
    (/** @type {string} */ claimId) => claimId === 'claim_integration_request'
      ? 'claim_integration_request_v2' : claimId
  );
  provenanceArtifact.views[0].elements[0].source_claim_ids =
    provenanceArtifact.views[0].elements[0].source_claim_ids.map(
      (/** @type {string} */ claimId) => claimId === 'claim_integration_request'
        ? 'claim_integration_request_v2' : claimId
    );
  const provenance = acceptedView(provenanceArtifact);
  const provenanceContext = integrationContext(provenance.claimsById);
  const requestBinding = provenanceContext.responsibilityBindings.find((item) => item.responsibility_key
    === integrationKey('integration_payment', 'surface', 'request'));
  if (!requestBinding) throw new Error('request binding missing from test context');
  requestBinding.source_claim_ids = ['claim_integration_request_v2'];
  requestBinding.required_oracle_refs = ['claim_integration_request_v2'];
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
  const refundClaims = [
    'claim_refund_request', 'claim_refund_response', 'claim_refund_persistence',
    'claim_refund_event', 'claim_refund_callback', 'claim_refund_compensation',
    'claim_refund_ledger', 'claim_refund_notification'
  ];
  second.source_claim_ids = [...refundClaims, 'claim_balance_invariant', 'claim_contract_compatibility'];
  artifact.views[0].elements.push(second);
  artifact.views[0].source_claim_ids.push(...refundClaims);
  const { view, claimsById } = acceptedView(artifact);
  const context = integrationContext(claimsById);
  context.responsibilityBindings.push(
    ...['request', 'response', 'persistence', 'event', 'callback', 'compensation'].map((surface) => binding(
      integrationKey('integration_refund', 'surface', surface), 'high', [`claim_refund_${surface}`],
      [`claim_refund_${surface}`], [`refund-${surface}-observer`]
    )),
    binding(integrationKey('integration_refund', 'side-effect', {
      kind: 'ledger', target: 'refund balance'
    }), 'high', ['claim_refund_ledger'], [], ['refund-ledger-observer']),
    binding(integrationKey('integration_refund', 'side-effect', {
      kind: 'notification', target: 'refund receipt'
    }), 'medium', ['claim_refund_notification'], [], ['refund-notification-observer']),
    binding(integrationKey('integration_refund', 'invariant',
      'accepted payment changes merchant balance once'), 'critical',
    ['claim_balance_invariant'], ['claim_balance_invariant'], ['refund-balance-observer']),
    binding(integrationKey('integration_refund', 'contract-compatibility',
      'v1 clients remain compatible'), 'high',
    ['claim_contract_compatibility'], ['claim_contract_compatibility'], ['refund-contract-observer'])
  );
  context.integrationInvariantsByElementId.set('integration_refund', [{
    invariant: 'accepted payment changes merchant balance once'
  }]);
  context.integrationSpecialResponsibilitiesByElementId.set('integration_refund', [{
    type: 'contract-compatibility', signal: 'v1 clients remain compatible'
  }]);

  const actual = compileIntegration(view, context);

  assert.equal(actual.length, 23);
  assert.equal(new Set(actual.map((seed) => seed.obligation_id)).size, 23);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_balance_invariant')).length, 2);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_contract_compatibility')).length, 2);
});

// Break caught: timing identities omit stable ownership/business order, so equal rules collide or order changes preserve IDs.
test('timing integration obligations bind threshold and special identities to timing owner and explicit order', async () => {
  const artifact = await fixture('timing');
  const second = structuredClone(artifact.views[0].elements[0]);
  second.element_id = 'timing_expiry_secondary';
  second.order = 1;
  artifact.views[0].elements.push(second);
  const accepted = acceptedView(artifact);
  const context = timingContext(accepted.claimsById);
  for (const original of [...context.responsibilityBindings]) {
    const replacements = [
      ['threshold', 'before'], ['threshold', 'equal'], ['threshold', 'after'],
      ['timeout', 'session times out at threshold'], ['retry', 'retry once after timeout']
    ];
    const replacement = replacements.find(([responsibility, discriminator]) => original.responsibility_key
      === timingKey('timing_expiry', responsibility, discriminator));
    if (replacement) context.responsibilityBindings.push({
      ...structuredClone(original),
      responsibility_key: timingKey('timing_expiry_secondary', replacement[0], replacement[1])
    });
  }
  context.timingSpecialResponsibilitiesByElementId.set(
    'timing_expiry_secondary', structuredClone(
      context.timingSpecialResponsibilitiesByElementId.get('timing_expiry') ?? []
    )
  );

  const original = compileTiming(accepted.view, context);
  const reorderedArtifact = structuredClone(artifact);
  reorderedArtifact.views[0].elements.reverse();
  const reordered = acceptedView(reorderedArtifact);
  const changedOrderArtifact = structuredClone(artifact);
  changedOrderArtifact.views[0].elements[0].order = 2;
  const changedOrder = acceptedView(changedOrderArtifact);

  assert.equal(original.length, 10);
  assert.equal(new Set(original.map((seed) => seed.obligation_id)).size, 10);
  assert.deepEqual(compileTiming(reordered.view, context), original);
  assert.notDeepEqual(
    compileTiming(changedOrder.view, context).map((seed) => seed.obligation_id),
    original.map((seed) => seed.obligation_id)
  );
  assert.equal(original.every((seed) => seed.view_element_refs[0] === 'view_session_timing#timing_expiry'
    || seed.view_element_refs[0] === 'view_session_timing#timing_expiry_secondary'), true);
});
