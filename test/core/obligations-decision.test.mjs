import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile as compileDecision } from '../../src/obligations/decision.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../../src/schema-validator.mjs';
import { auditInteractionMatrix } from '../../src/views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/behavior-views.schema.json'
), 'utf8'));
const testObligationsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-obligations.schema.json'
), 'utf8'));

/** @returns {Promise<any>} */
async function decisionFixture() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures/views/decision-obligations.json'), 'utf8'));
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
    schema_version: '1.0.0', source_revision: 11, obligations: actual, fact_routes: [], interaction_routes: []
  };
  assert.deepEqual(validateAgainstSchema(obligationsArtifact, testObligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds(obligationsArtifact), []);
  assert.equal(new Set(actual.map((seed) => seed.obligation_id)).size, 3);
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
