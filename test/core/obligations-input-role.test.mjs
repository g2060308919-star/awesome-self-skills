import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { compile as compileInput } from '../../src/obligations/input-domain.mjs';
import { compile as compileRole } from '../../src/obligations/role.mjs';
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
const sourceDigest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

/** @param {string} name */
async function fixture(name) {
  return JSON.parse(await readFile(path.join(repositoryRoot, `test/fixtures/views/${name}-obligations.json`), 'utf8'));
}

/** Task 3, Schema, stable-ID, and Task 4 gates are real; strategies never consume raw submitted evidence. @param {any} artifact @returns {any} */
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
      source_id: 'source_task6', kind: 'prd', version: '1', status: 'effective', authority: 'owner',
      content: 'Task 6 behavior evidence', content_digest: sourceDigest, scope: view.scope
    }],
    locators: [{
      locator_id: 'locator_task6', source_id: 'source_task6', type: 'text-range',
      text_range: { start: 0, end: 24 }, content_digest: sourceDigest, extraction_integrity: 'verified'
    }],
    source_policy: { rules: [{
      rule_id: 'rule_task6', source_ids: ['source_task6'], scope: view.scope, authority: 'owner', status: 'effective'
    }] },
    decision_records: [], clarification_events: []
  };
  const evidenceClaims = {
    schema_version: '1.0.0', source_revision: artifact.source_revision,
    claims: claimIds.map((claimId) => ({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement', scope: view.scope,
      value: claimId, source_locator_ids: ['locator_task6'], source_id: 'source_task6'
    })),
    fact_ledger: []
  };
  assert.deepEqual(validateAgainstSchema(sourcePack, sourcePackSchema), []);
  assert.deepEqual(validateAgainstSchema(evidenceClaims, evidenceSchema), []);
  assert.deepEqual(validateUniqueStableIds(evidenceClaims), []);
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  assert.deepEqual(evidence.diagnostics, []);
  const validated = validateBehaviorViews(
    { claimsById: evidence.claimsById, factLedger: [], runScope: view.scope }, artifact
  );
  assert.deepEqual(validated.diagnostics, []);
  return { view: validated.viewsById.get(view.view_id), claimsById: evidence.claimsById };
}

/** @param {Map<string, any>} claimsById */
function inputContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([['input_amount', 'high']]),
    requiredOracleRefsByElementId: new Map([['input_amount', ['claim_amount_domain']]]),
    requiredCapabilitiesByElementId: new Map([['input_amount', ['amount-control', 'amount-observer']]])
  };
}

/** @param {Map<string, any>} claimsById */
function roleContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([['role_cashier', 'high'], ['role_auditor', 'medium']]),
    requiredOracleRefsByElementId: new Map([
      ['role_cashier', ['claim_cashier_permissions']],
      ['role_auditor', ['claim_auditor_permissions']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['role_cashier', ['permission-observer']],
      ['role_auditor', ['permission-observer']]
    ])
  };
}

const inputIds = [
  'obligation_5b30bb4e4045fdc7',
  'obligation_b4206bcd80da9069',
  'obligation_d272da6ada2f16a8',
  'obligation_e4e1c5cd0d489062'
];
const roleIds = [
  'obligation_0bdf31dd3da4f87d',
  'obligation_4c780a191eaae8ce',
  'obligation_b3f1e1dd8916f9b3'
];

// Break caught: dropping an explicit class/bound, inventing an outside value, or collapsing lower and upper changes this literal 2+2 count/ID set.
test('input role obligations hand-count two explicit classes plus inclusive lower and upper responsibilities', async () => {
  const { view, claimsById } = acceptedView(await fixture('input'));
  const before = JSON.stringify(view);

  const actual = compileInput(view, inputContext(claimsById));

  assert.equal(actual.length, 4);
  assert.deepEqual(actual.map((seed) => seed.obligation_id), inputIds);
  assert.deepEqual(new Set(actual.flatMap((seed) => seed.required_oracle_refs)), new Set(['claim_amount_domain']));
  assert.equal(actual.every((seed) => seed.view_element_refs[0] === 'view_amount_input#input_amount'), true);
  assert.equal(actual.some((seed) => seed.source_claim_ids.some((id) => id.includes('generic'))), false);
  assert.equal(JSON.stringify(view), before);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '1.0.0', source_revision: 6, obligations: actual, fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds({ obligations: actual }), []);
});

// Break caught: a generic denial template or one seed per role would lose an explicit allow/deny permission responsibility.
test('input role obligations preserve every sourced role-permission combination and its exact evidence', async () => {
  const { view, claimsById } = acceptedView(await fixture('role'));

  const actual = compileRole(view, roleContext(claimsById));

  assert.equal(actual.length, 3);
  assert.deepEqual(actual.map((seed) => seed.obligation_id), roleIds);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_cashier_permissions')).length, 2);
  assert.equal(actual.filter((seed) => seed.source_claim_ids.includes('claim_auditor_permissions')).length, 1);
  assert.equal(actual.every((seed) => seed.required_oracle_refs.every((id) => !id.includes('generic-denial'))), true);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '1.0.0', source_revision: 6, obligations: actual, fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
});

// Break caught: treating a known formal negative responsibility as Exploratory would remove it instead of retaining an Oracle gap for Task 8.
test('input role obligations retain formal invalid and deny responsibilities with empty Oracle refs when the Oracle mapping is absent', async () => {
  const input = acceptedView(await fixture('input'));
  const role = acceptedView(await fixture('role'));
  const inputMissing = inputContext(input.claimsById);
  inputMissing.requiredOracleRefsByElementId.set('input_amount', []);
  const roleMissing = roleContext(role.claimsById);
  roleMissing.requiredOracleRefsByElementId.set('role_cashier', []);

  const inputSeeds = compileInput(input.view, inputMissing);
  const roleSeeds = compileRole(role.view, roleMissing);

  assert.equal(inputSeeds.length, 4);
  assert.equal(inputSeeds.every((seed) => seed.required_oracle_refs.length === 0), true);
  assert.equal(roleSeeds.filter((seed) => seed.source_claim_ids.includes('claim_cashier_permissions'))
    .every((seed) => seed.required_oracle_refs.length === 0), true);
  assert.equal(roleSeeds.length, 3);
});

// Break caught: using collection position or locale sorting changes IDs/output after semantically irrelevant reordering.
test('input role obligations are code-point deterministic, fresh, and non-mutating under view reorder', async () => {
  const inputArtifact = await fixture('input');
  inputArtifact.views[0].elements[0].classes.reverse();
  inputArtifact.source_revision = 99;
  const input = acceptedView(inputArtifact);
  const roleArtifact = await fixture('role');
  roleArtifact.views[0].elements.reverse();
  roleArtifact.views[0].elements.forEach((/** @type {any} */ element) => element.permissions.reverse());
  const role = acceptedView(roleArtifact);

  const firstInput = compileInput(input.view, inputContext(input.claimsById));
  const secondInput = compileInput(input.view, inputContext(input.claimsById));
  const firstRole = compileRole(role.view, roleContext(role.claimsById));

  assert.deepEqual(firstInput.map((seed) => seed.obligation_id), inputIds);
  assert.deepEqual(firstRole.map((seed) => seed.obligation_id), roleIds);
  assert.notStrictEqual(firstInput, secondInput);
  assert.notStrictEqual(firstInput[0], secondInput[0]);
  firstInput[0].source_claim_ids.push('mutation');
  assert.equal(secondInput[0].source_claim_ids.includes('mutation'), false);
});
