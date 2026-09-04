import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { completeSourcePack } from '../helpers/source-pack.mjs';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { compile as compileDecision } from '../../src/obligations/decision.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../../src/schema-validator.mjs';
import { auditInteractionMatrix } from '../../src/views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/behavior-views.schema.json'
), 'utf8'));
const sourcePackSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/source-pack.schema.json'
), 'utf8'));
const evidenceClaimsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json'
), 'utf8'));
const testObligationsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-obligations.schema.json'
), 'utf8'));
const sourceDigest = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** @returns {Promise<any>} */
async function decisionFixture() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures/views/decision-obligations.json'), 'utf8'));
}

function oracleSourcePack() {
  return completeSourcePack({
    schema_version: '2.1.0', source_revision: 0,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
    sources: [{
      source_id: 'source_oracle', kind: 'prd', version: '1', status: 'effective', authority: 'owner',
      content: 'Oracle rules', content_digest: sourceDigest, scope: 'checkout'
    }],
    locators: [
      {
        locator_id: 'locator_formula', source_id: 'source_oracle', type: 'text-range',
        text_range: { start: 0, end: 7 }, content_digest: sourceDigest, extraction_integrity: 'verified'
      },
      {
        locator_id: 'locator_table', source_id: 'source_oracle', type: 'text-range',
        text_range: { start: 8, end: 14 }, content_digest: sourceDigest, extraction_integrity: 'verified'
      }
    ],
    source_policy: { rules: [{
      rule_id: 'rule_oracle_source', source_ids: ['source_oracle'], scope: ' * ', authority: 'owner', status: 'effective'
    }] },
    decision_records: [], clarification_events: [], execution_events: []
  }, oracleEvidenceClaims());
}

function oracleEvidenceClaims() {
  return {
    schema_version: '2.1.0', source_revision: 0,
    claims: [
      {
        claim_id: 'claim_total_rule', claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: ' all ', value: '12.50', source_locator_ids: ['locator_formula'], source_id: 'source_oracle'
      },
      {
        claim_id: 'claim_total', claim_form: 'derived', level: 'E2', kind: 'expected-value',
        scope: 'checkout.total', value: '12.50', source_locator_ids: ['locator_formula'],
        derivation_kind: 'formula', derivation_target: 'expected-value', parent_claim_ids: ['claim_total_rule'],
        parameters: { unit: 'USD', precision: 2, rounding: 'half-up' },
        rule_input: {
          formula: 'subtotal + tax', inputs: [{ name: 'subtotal', value: 10 }, { name: 'tax', value: 2.5 }],
          unit: 'USD', precision: 2, rounding: 'half-up'
        }
      },
      {
        claim_id: 'model_total_rule', claim_form: 'derived', level: 'E2', kind: 'model-element',
        scope: 'checkout', value: '12.50', source_locator_ids: ['locator_formula'],
        derivation_kind: 'decision-table-instance', derivation_target: 'model-element', parent_claim_ids: ['claim_total_rule'],
        parameters: { table_id: 'table_total_model' },
        rule_input: { conditions: ['total calculated'], outcome: '12.50' }
      },
      {
        claim_id: 'claim_total_boundary', claim_form: 'derived', level: 'E2', kind: 'test-data',
        scope: 'checkout.total', value: '1', source_locator_ids: ['locator_formula'],
        derivation_kind: 'boundary-representative', derivation_target: 'test-data', parent_claim_ids: ['claim_total_rule'],
        parameters: { domain_id: 'domain_total' },
        rule_input: { lower: 1, upper: 2, inclusive: true }
      },
      {
        claim_id: 'claim_review_rule', claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: 'checkout', value: 'manual review', source_locator_ids: ['locator_table'], source_id: 'source_oracle'
      },
      {
        claim_id: 'claim_review_result', claim_form: 'derived', level: 'E2', kind: 'expected-value',
        scope: 'checkout.total', value: 'manual review', source_locator_ids: ['locator_table'],
        derivation_kind: 'decision-table-instance', derivation_target: 'expected-value', parent_claim_ids: ['claim_review_rule'],
        parameters: { table_id: 'table_review' },
        rule_input: { conditions: ['total above review threshold'], outcome: 'manual review' }
      }
    ],
    fact_ledger: []
  };
}

/** @param {string} claimId @param {string[]} parentClaimIds @param {string} [scope] */
function expectedOracleClaim(claimId, parentClaimIds, scope = 'checkout.total') {
  return {
    claim_id: claimId, claim_form: 'derived', level: 'E2', kind: 'expected-value',
    scope, value: '1', source_locator_ids: ['locator_formula'],
    derivation_kind: 'formula', derivation_target: 'expected-value', parent_claim_ids: parentClaimIds,
    parameters: { unit: 'count', precision: 0, rounding: 'half-up' },
    rule_input: {
      formula: 'constant', inputs: [{ name: 'constant', value: 1 }],
      unit: 'count', precision: 0, rounding: 'half-up'
    }
  };
}

/**
 * @param {any} [submittedEvidence]
 * @param {string} [viewScope]
 * @returns {Promise<{view: any, claimsById: Map<string, any>, artifact: any, sourcePack: any}>}
 */
async function validatedOracleDecision(submittedEvidence = oracleEvidenceClaims(), viewScope = 'checkout.total') {
  const sourcePack = oracleSourcePack();
  const evidenceClaims = submittedEvidence;
  assert.deepEqual(validateAgainstSchema(sourcePack, sourcePackSchema), []);
  assert.deepEqual(validateUniqueStableIds(sourcePack), []);
  assert.deepEqual(validateAgainstSchema(evidenceClaims, evidenceClaimsSchema), []);
  assert.deepEqual(validateUniqueStableIds(evidenceClaims), []);
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  assert.deepEqual(evidence.diagnostics, []);

  const artifact = await decisionFixture();
  artifact.source_revision = 0;
  artifact.views[0] = {
    view_id: 'view_total_decision', type: 'decision', scope: viewScope,
    source_claim_ids: ['claim_review_rule', 'model_total_rule'],
    elements: [
      {
        element_id: 'rule_total', kind: 'decision-rule', conditions: ['total is calculated'], result: 'total is 12.50', priority: 0,
        source_claim_ids: [], model_refs: ['model_total_rule']
      },
      {
        element_id: 'rule_review', kind: 'decision-rule', conditions: ['total above review threshold'], result: 'manual review', priority: 1,
        source_claim_ids: ['claim_review_rule'], model_refs: []
      }
    ],
    relations: []
  };
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const views = validateBehaviorViews({ claimsById: evidence.claimsById, factLedger: [], runScope: sourcePack.run_scope }, artifact);
  assert.deepEqual(views.diagnostics, []);
  return { view: views.viewsById.get('view_total_decision'), claimsById: evidence.claimsById, artifact, sourcePack };
}

/** @param {any} artifact */
function evidenceGraphFor(artifact) {
  const view = artifact.views[0];
  const claimsById = new Map();
  for (const claimId of view.source_claim_ids) claimsById.set(claimId, {
    claim_id: claimId, level: 'E3', kind: 'requirement', scope: view.scope, parent_claim_ids: []
  });
  for (const element of view.elements) {
    for (const claimId of element.model_refs) claimsById.set(claimId, {
      claim_id: claimId, level: 'E2', kind: 'model-element', derivation_target: 'model-element',
      scope: view.scope, parent_claim_ids: [element.source_claim_ids[0]]
    });
  }
  return { claimsById, factLedger: [], runScope: view.scope };
}

/** @param {any} artifact @param {any} graph @returns {any} */
function validatedDecision(artifact, graph) {
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const result = validateBehaviorViews(graph, artifact);
  assert.deepEqual(result.diagnostics, []);
  return result.viewsById.get('view_discount_decision');
}

/** @param {Map<string, any>} claimsById */
function decisionContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([['rule_vip', 'high'], ['rule_standard', 'medium'], ['rule_none', 'low']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_vip', ['claim_discount_vip']],
      ['rule_standard', ['claim_discount_standard']],
      ['rule_none', ['claim_discount_none']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_vip', ['pricing-engine']],
      ['rule_standard', ['pricing-engine']],
      ['rule_none', ['cap_𐀀', 'cap_']]
    ])
  };
}

const expectedDecisionSeeds = [
  {
    obligation_id: 'obligation_4d94521006ab582c', kind: 'decision', risk: 'high', scope: 'checkout.discount',
    source_claim_ids: ['claim_discount_priority', 'claim_discount_vip', 'model_vip_rule'],
    view_element_refs: ['view_discount_decision#rule_vip'],
    required_oracle_refs: ['claim_discount_vip'], required_capabilities: ['pricing-engine']
  },
  {
    obligation_id: 'obligation_50bf36ce625f9caa', kind: 'decision', risk: 'low', scope: 'checkout.discount',
    source_claim_ids: ['claim_discount_none'],
    view_element_refs: ['view_discount_decision#rule_none'],
    required_oracle_refs: ['claim_discount_none'], required_capabilities: ['cap_', 'cap_𐀀']
  },
  {
    obligation_id: 'obligation_9787f4b49165459a', kind: 'decision', risk: 'medium', scope: 'checkout.discount',
    source_claim_ids: ['claim_discount_standard'],
    view_element_refs: ['view_discount_decision#rule_standard'],
    required_oracle_refs: ['claim_discount_standard'], required_capabilities: ['pricing-engine']
  }
];

test('decision obligations hand-count each explicit valid rule once with priority, conditions, result evidence, and no truth-table completion', async () => {
  const artifact = await decisionFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedDecision(artifact, graph);

  const actual = compileDecision(view, decisionContext(graph.claimsById));

  assert.equal(actual.length, 3);
  assert.deepEqual(actual, expectedDecisionSeeds);
  const obligationsArtifact = {
    schema_version: '2.1.0', source_revision: 11,
    obligations: actual.map((seed) => ({ ...seed, caseable: true })),
    fact_routes: [], interaction_routes: []
  };
  assert.deepEqual(validateAgainstSchema(obligationsArtifact, testObligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds(obligationsArtifact), []);
  assert.equal(new Set(actual.map((seed) => seed.obligation_id)).size, 3);
});

test('decision obligations accept Task 3 expected-value Oracles through source and model-ref ancestry', async () => {
  const { view, claimsById } = await validatedOracleDecision();
  const context = {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_total', ['claim_total']], ['rule_review', ['claim_review_result']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  };

  const actual = compileDecision(view, context);

  assert.equal(actual.length, 2);
  assert.deepEqual(actual.map((seed) => seed.required_oracle_refs).sort(), [
    ['claim_review_result'], ['claim_total']
  ]);
  assert.deepEqual(
    actual.find((seed) => seed.required_oracle_refs.includes('claim_total'))?.source_claim_ids,
    ['claim_total', 'model_total_rule']
  );
  const obligationsArtifact = {
    schema_version: '2.1.0', source_revision: 0,
    obligations: actual.map((seed) => ({ ...seed, caseable: true })),
    fact_routes: [], interaction_routes: []
  };
  assert.deepEqual(validateAgainstSchema(obligationsArtifact, testObligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds(obligationsArtifact), []);
});

test('decision obligations accept a mapped E3 Oracle that is an ancestor of model-only element evidence', async () => {
  const { view, claimsById } = await validatedOracleDecision();
  const actual = compileDecision(view, {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_total', ['claim_total_rule']], ['rule_review', ['claim_review_rule']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  });

  assert.equal(actual.length, 2);
  assert.deepEqual(
    actual.find((seed) => seed.view_element_refs.includes('view_total_decision#rule_total'))?.required_oracle_refs,
    ['claim_total_rule']
  );
  assert.deepEqual(
    actual.find((seed) => seed.view_element_refs.includes('view_total_decision#rule_review'))?.required_oracle_refs,
    ['claim_review_rule']
  );
});

test('decision obligations find a mapped ancestor through a long accepted model-ref chain independent of claim order', async () => {
  const submitted = oracleEvidenceClaims();
  let parentClaimId = 'claim_total_rule';
  for (let index = 0; index < 4000; index += 1) {
    const claimId = `claim_z_model_ancestor_${String(index).padStart(4, '0')}`;
    submitted.claims.push(expectedOracleClaim(claimId, [parentClaimId]));
    parentClaimId = claimId;
  }
  const modelClaim = /** @type {any} */ (submitted.claims.find((claim) => claim.claim_id === 'model_total_rule'));
  assert.ok(modelClaim);
  modelClaim.scope = 'checkout.total';
  modelClaim.value = '1';
  modelClaim.parent_claim_ids = [parentClaimId];
  modelClaim.rule_input.outcome = '1';

  /** @param {any} evidenceClaims */
  const compileAncestor = async (evidenceClaims) => {
    const { view, claimsById } = await validatedOracleDecision(evidenceClaims);
    return compileDecision(view, {
      claimsById,
      riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
      requiredOracleRefsByElementId: new Map([
        ['rule_total', ['claim_total_rule']], ['rule_review', ['claim_review_rule']]
      ]),
      requiredCapabilitiesByElementId: new Map([
        ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
      ])
    });
  };

  const ordered = await compileAncestor(submitted);
  const reversedEvidence = structuredClone(submitted);
  reversedEvidence.claims.reverse();
  const reversed = await compileAncestor(reversedEvidence);

  assert.deepEqual(reversed, ordered);
  assert.equal(ordered.find((seed) => seed.view_element_refs.includes('view_total_decision#rule_total'))
    ?.required_oracle_refs[0], 'claim_total_rule');
});

test('decision obligations require an Oracle scope to cover the view after accepted shared ancestry', async () => {
  const submitted = oracleEvidenceClaims();
  submitted.claims.push(
    expectedOracleClaim('claim_scope_broad', ['claim_total_rule'], ' checkout '),
    expectedOracleClaim('claim_scope_exact', ['claim_total_rule'], 'checkout.total'),
    expectedOracleClaim('claim_scope_universal', ['claim_total_rule'], ' all '),
    expectedOracleClaim('claim_scope_disjoint', ['claim_total_rule'], 'checkout.shipping')
  );
  const { view, claimsById } = await validatedOracleDecision(submitted);
  /** @param {string} oracleId */
  const compileWithOracle = (oracleId) => compileDecision(view, {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_total', [oracleId]], ['rule_review', ['claim_review_rule']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  });

  for (const oracleId of ['claim_scope_broad', 'claim_scope_exact', 'claim_scope_universal']) {
    assert.equal(compileWithOracle(oracleId).some((seed) => seed.required_oracle_refs.includes(oracleId)), true);
  }
  assert.throws(() => compileWithOracle('claim_scope_disjoint'), /Oracle claim/);
});

test('decision obligations reject a narrow Oracle for a broader validated view', async () => {
  const submitted = oracleEvidenceClaims();
  submitted.claims.push(expectedOracleClaim('claim_scope_narrow', ['claim_total_rule'], 'checkout.total'));
  const { view, claimsById } = await validatedOracleDecision(submitted, 'checkout');

  assert.throws(() => compileDecision(view, {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_total', ['claim_scope_narrow']], ['rule_review', ['claim_review_rule']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  }), /Oracle claim/);
});

test('decision obligations reject accepted unrelated and non-Oracle claims after every contract gate', async () => {
  const { view, claimsById } = await validatedOracleDecision();
  const baseContext = {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['rule_total', ['claim_total']], ['rule_review', ['claim_review_result']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  };
  const cases = [
    { name: 'same-scope sibling with no shared atomic support', elementId: 'rule_review', oracle: 'claim_total' },
    { name: 'E2 test data is not an Oracle', elementId: 'rule_total', oracle: 'claim_total_boundary' },
    { name: 'E2 model element is not an Oracle', elementId: 'rule_total', oracle: 'model_total_rule' }
  ];

  for (const item of cases) {
    const context = {
      ...baseContext,
      requiredOracleRefsByElementId: new Map([
        ...baseContext.requiredOracleRefsByElementId,
        [item.elementId, [item.oracle]]
      ])
    };
    assert.throws(() => compileDecision(view, context), /Oracle claim/, item.name);
  }
});

test('decision obligations consume only Task 3 accepted output for cyclic and dangling Oracle claims', async () => {
  const sourcePack = oracleSourcePack();
  const baseEvidence = oracleEvidenceClaims();
  const { view, artifact } = await validatedOracleDecision(baseEvidence);
  const cases = [
    {
      name: 'cyclic expected-value ancestry', oracle: 'claim_cycle_a', code: 'E2_CYCLE',
      claims: [
        expectedOracleClaim('claim_cycle_a', ['claim_total_rule', 'claim_cycle_b']),
        expectedOracleClaim('claim_cycle_b', ['claim_cycle_a'])
      ]
    },
    {
      name: 'dangling expected-value ancestry', oracle: 'claim_dangling_expected', code: 'E2_PARENT_DANGLING',
      claims: [expectedOracleClaim('claim_dangling_expected', ['claim_total_rule', 'claim_missing_parent'])]
    }
  ];

  for (const item of cases) {
    const submitted = structuredClone(baseEvidence);
    submitted.claims.push(...item.claims);
    assert.deepEqual(validateAgainstSchema(submitted, evidenceClaimsSchema), [], item.name);
    assert.deepEqual(validateUniqueStableIds(submitted), [], item.name);
    const evidence = validateEvidenceGraph(sourcePack, submitted);
    assert.equal(evidence.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, item.name);
    assert.equal(evidence.claimsById.has(item.oracle), false, item.name);
    const views = validateBehaviorViews(
      { claimsById: evidence.claimsById, factLedger: [], runScope: sourcePack.run_scope }, artifact
    );
    assert.deepEqual(views.diagnostics, [], item.name);
    const context = {
      claimsById: evidence.claimsById,
      riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
      requiredOracleRefsByElementId: new Map([
        ['rule_total', [item.oracle]], ['rule_review', ['claim_review_result']]
      ]),
      requiredCapabilitiesByElementId: new Map([
        ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
      ])
    };
    assert.throws(() => compileDecision(view, context), /Oracle claim/, item.name);
  }
});

test('decision obligations traverse deep shared accepted Oracle ancestry once per seed', async () => {
  const submitted = oracleEvidenceClaims();
  const oracleIds = [];
  let parentClaimId = 'claim_total_rule';
  for (let index = 0; index < 4000; index += 1) {
    const claimId = `claim_z_expected_${String(index).padStart(4, '0')}`;
    submitted.claims.push(expectedOracleClaim(claimId, [parentClaimId]));
    oracleIds.push(claimId);
    parentClaimId = claimId;
  }
  const { view, claimsById } = await validatedOracleDecision(submitted);
  const baseContext = {
    claimsById,
    riskByElementId: new Map([['rule_total', 'high'], ['rule_review', 'medium']]),
    requiredCapabilitiesByElementId: new Map([
      ['rule_total', ['calculator']], ['rule_review', ['review-queue']]
    ])
  };

  const deepStarted = performance.now();
  const deep = compileDecision(view, {
    ...baseContext,
    requiredOracleRefsByElementId: new Map([
      ['rule_total', [parentClaimId]], ['rule_review', ['claim_review_result']]
    ])
  });
  const deepElapsed = performance.now() - deepStarted;
  assert.equal(deep.find((seed) => seed.view_element_refs.includes('view_total_decision#rule_total'))
    ?.required_oracle_refs[0], 'claim_z_expected_3999');
  assert.equal(deepElapsed < 2000, true, `deep Oracle traversal took ${deepElapsed.toFixed(1)}ms`);

  const sharedStarted = performance.now();
  const shared = compileDecision(view, {
    ...baseContext,
    requiredOracleRefsByElementId: new Map([
      ['rule_total', oracleIds], ['rule_review', ['claim_review_result']]
    ])
  });
  const sharedElapsed = performance.now() - sharedStarted;
  assert.equal(shared.find((seed) => seed.view_element_refs.includes('view_total_decision#rule_total'))
    ?.required_oracle_refs.length, 4000);
  assert.equal(sharedElapsed < 1000, true, `shared Oracle traversal took ${sharedElapsed.toFixed(1)}ms`);
});

test('decision obligations preserve semantic IDs under rule and condition reorder with code-point deterministic output', async () => {
  const artifact = await decisionFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedDecision(artifact, graph);
  const context = decisionContext(graph.claimsById);
  const before = JSON.stringify(view);
  const first = compileDecision(view, context);

  const reorderedArtifact = structuredClone(artifact);
  reorderedArtifact.source_revision = 88;
  reorderedArtifact.views[0].elements.reverse();
  for (const rule of reorderedArtifact.views[0].elements) rule.conditions.reverse();
  const reordered = validatedDecision(reorderedArtifact, graph);
  const second = compileDecision(reordered, context);

  assert.deepEqual(second, expectedDecisionSeeds);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(view), before);
  assert.deepEqual(second[1].required_capabilities, ['cap_', 'cap_𐀀']);
  assert.notStrictEqual(first, compileDecision(view, context));
  assert.notStrictEqual(first[0], compileDecision(view, context)[0]);
});

test('decision obligation identity ignores supplemental provenance that does not change rule semantics', async () => {
  const artifact = await decisionFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedDecision(artifact, graph);
  const original = compileDecision(view, decisionContext(graph.claimsById));
  const originalId = original.find((seed) => seed.view_element_refs.includes('view_discount_decision#rule_none'))?.obligation_id;

  const supplemental = structuredClone(artifact);
  supplemental.views[0].source_claim_ids.push('claim_discount_none_secondary');
  supplemental.views[0].elements.find((/** @type {any} */ element) => element.element_id === 'rule_none')
    .source_claim_ids.push('claim_discount_none_secondary');
  const supplementalGraph = evidenceGraphFor(supplemental);
  const supplementalView = validatedDecision(supplemental, supplementalGraph);
  const compiled = compileDecision(supplementalView, decisionContext(supplementalGraph.claimsById));
  const supplementalId = compiled.find((seed) => seed.view_element_refs.includes('view_discount_decision#rule_none'))?.obligation_id;

  assert.equal(supplementalId, originalId);
  assert.deepEqual(compiled.find((seed) => seed.obligation_id === supplementalId)?.source_claim_ids, [
    'claim_discount_none', 'claim_discount_none_secondary'
  ]);
});

test('decision obligations reject an Oracle mapping unrelated to the selected element evidence', async () => {
  const artifact = await decisionFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedDecision(artifact, graph);
  const context = decisionContext(graph.claimsById);
  const unrelatedOracle = {
    ...context,
    requiredOracleRefsByElementId: new Map([
      ...context.requiredOracleRefsByElementId,
      ['rule_none', ['claim_discount_standard']]
    ])
  };

  assert.throws(
    () => compileDecision(view, unrelatedOracle),
    /Oracle claim "claim_discount_standard" is not validated evidence for element "rule_none"/
  );
});

test('decision obligations reject duplicate semantic rule signatures and Task 4 owns unsupported inputs', async () => {
  const artifact = await decisionFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedDecision(artifact, graph);
  const context = decisionContext(graph.claimsById);
  const duplicateView = structuredClone(view);
  duplicateView.elements.push({ ...structuredClone(
    duplicateView.elements.find((/** @type {any} */ element) => element.element_id === 'rule_vip')
  ), element_id: 'rule_vip_duplicate' });
  const duplicateContext = {
    ...context,
    riskByElementId: new Map([...context.riskByElementId, ['rule_vip_duplicate', 'high']]),
    requiredOracleRefsByElementId: new Map([...context.requiredOracleRefsByElementId, ['rule_vip_duplicate', ['claim_discount_vip']]]),
    requiredCapabilitiesByElementId: new Map([...context.requiredCapabilitiesByElementId, ['rule_vip_duplicate', ['pricing-engine']]])
  };
  assert.throws(() => compileDecision(duplicateView, duplicateContext), /duplicate decision obligation semantic signature/);

  const unsupported = structuredClone(artifact);
  unsupported.views[0].type = 'flow';
  const invalid = validateBehaviorViews(graph, unsupported);
  assert.equal(invalid.diagnostics.some((item) => item.code === 'VIEW_ELEMENT_KIND_MISMATCH'), true);
  assert.equal(invalid.viewsById.has('view_discount_decision'), false);
});
