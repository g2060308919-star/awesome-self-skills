import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { compile as compileInput } from '../../src/obligations/input-domain.mjs';
import { compile as compileRole } from '../../src/obligations/role.mjs';
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
const sourceDigest = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

/** @param {string} name */
async function fixture(name) {
  return JSON.parse(await readFile(path.join(repositoryRoot, `test/fixtures/views/${name}-obligations.json`), 'utf8'));
}

/** Task 3, Schema, stable-ID, and Task 4 gates are real; strategies never consume raw submitted evidence. @param {any} artifact @param {Array<{claim_id: string, scope: string}>} [extraClaims] @returns {any} */
function acceptedView(artifact, extraClaims = []) {
  assert.deepEqual(validateAgainstSchema(artifact, behaviorSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const view = artifact.views[0];
  const claimIds = [...new Set([
    ...view.source_claim_ids,
    ...view.elements.flatMap((/** @type {any} */ element) => [...element.source_claim_ids, ...element.model_refs]),
    ...extraClaims.map(({ claim_id: claimId }) => claimId)
  ])];
  const sourcePack = {
    schema_version: '2.0.0', source_revision: artifact.source_revision,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: view.scope,
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
    decision_records: [], clarification_events: [], execution_events: []
  };
  const evidenceClaims = {
    schema_version: '2.0.0', source_revision: artifact.source_revision,
    claims: claimIds.map((claimId) => ({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement', scope: view.scope,
      value: claimId, source_locator_ids: ['locator_task6'], source_id: 'source_task6'
    })).map((claim) => ({
      ...claim,
      scope: extraClaims.find(({ claim_id: claimId }) => claimId === claim.claim_id)?.scope ?? claim.scope
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
    responsibilityBindings: [
      binding(
        responsibilityKey('input-domain', 'input_amount', {
          responsibility: 'equivalence-class', class_id: 'class_standard'
        }), 'medium', ['claim_amount_standard'], ['claim_amount_standard'], ['standard-observer']
      ),
      binding(
        responsibilityKey('input-domain', 'input_amount', {
          responsibility: 'equivalence-class', class_id: 'class_zero'
        }), 'high', ['claim_amount_zero'], [], ['invalid-observer']
      ),
      binding(
        responsibilityKey('input-domain', 'input_amount', {
          responsibility: 'boundary', boundary: 'lower'
        }), 'critical', ['claim_amount_lower'], ['claim_amount_lower'], ['lower-control']
      ),
      binding(
        responsibilityKey('input-domain', 'input_amount', {
          responsibility: 'boundary', boundary: 'upper'
        }), 'low', ['claim_amount_upper'], [], ['upper-control']
      )
    ]
  };
}

/** @param {Map<string, any>} claimsById */
function roleContext(claimsById) {
  return {
    claimsById,
    responsibilityBindings: [
      binding(
        responsibilityKey('role', 'role_cashier', { responsibility: 'permission', permission: 'allow:create' }),
        'critical', ['claim_cashier_create'], ['claim_cashier_create'], ['create-observer']
      ),
      binding(
        responsibilityKey('role', 'role_cashier', { responsibility: 'permission', permission: 'deny:refund' }),
        'high', ['claim_cashier_refund_deny'], [], ['refund-denial-observer']
      ),
      binding(
        responsibilityKey('role', 'role_auditor', { responsibility: 'permission', permission: 'allow:view' }),
        'low', ['claim_auditor_view'], ['claim_auditor_view'], ['view-observer']
      )
    ]
  };
}

/** @param {string} responsibilityKeyValue @param {string} risk @param {string[]} sourceClaimIds @param {string[]} oracleRefs @param {string[]} capabilities */
function binding(responsibilityKeyValue, risk, sourceClaimIds, oracleRefs, capabilities) {
  return {
    responsibility_key: responsibilityKeyValue,
    risk,
    source_claim_ids: sourceClaimIds,
    required_oracle_refs: oracleRefs,
    required_capabilities: capabilities
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
  assert.deepEqual(actual.map((seed) => seed.source_claim_ids).sort(), [
    ['claim_amount_lower'], ['claim_amount_standard'], ['claim_amount_upper'], ['claim_amount_zero']
  ]);
  assert.deepEqual(new Set(actual.flatMap((seed) => seed.required_oracle_refs)), new Set([
    'claim_amount_lower', 'claim_amount_standard'
  ]));
  assert.deepEqual(new Set(actual.map((seed) => seed.risk)), new Set(['critical', 'high', 'low', 'medium']));
  assert.deepEqual(new Set(actual.flatMap((seed) => seed.required_capabilities)), new Set([
    'invalid-observer', 'lower-control', 'standard-observer', 'upper-control'
  ]));
  assert.equal(actual.every((seed) => seed.view_element_refs[0] === 'view_amount_input#input_amount'), true);
  assert.equal(actual.some((seed) => seed.source_claim_ids.some((id) => id.includes('generic'))), false);
  assert.equal(JSON.stringify(view), before);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '2.0.0', source_revision: 6,
    obligations: actual.map((seed) => ({ ...seed, caseable: true })),
    fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds({ obligations: actual }), []);
});

// Break caught: a generic denial template or one seed per role would lose an explicit allow/deny permission responsibility.
test('input role obligations preserve every sourced role-permission combination and its exact evidence', async () => {
  const { view, claimsById } = acceptedView(await fixture('role'));

  const actual = compileRole(view, roleContext(claimsById));

  assert.equal(actual.length, 3);
  assert.deepEqual(actual.map((seed) => seed.obligation_id), roleIds);
  assert.deepEqual(actual.map((seed) => seed.source_claim_ids).sort(), [
    ['claim_auditor_view'], ['claim_cashier_create'], ['claim_cashier_refund_deny']
  ]);
  assert.equal(actual.every((seed) => seed.required_oracle_refs.every((id) => !id.includes('generic-denial'))), true);
  assert.deepEqual(validateAgainstSchema({
    schema_version: '2.0.0', source_revision: 6,
    obligations: actual.map((seed) => ({ ...seed, caseable: true })),
    fact_routes: [], interaction_routes: []
  }, obligationsSchema), []);
});

// Break caught: treating a known formal negative responsibility as Exploratory would remove it instead of retaining an Oracle gap for Task 8.
test('input role obligations retain formal invalid and deny responsibilities with empty Oracle refs when the Oracle mapping is absent', async () => {
  const input = acceptedView(await fixture('input'));
  const role = acceptedView(await fixture('role'));
  const inputSeeds = compileInput(input.view, inputContext(input.claimsById));
  const roleSeeds = compileRole(role.view, roleContext(role.claimsById));

  assert.equal(inputSeeds.length, 4);
  assert.equal(inputSeeds.filter((seed) => seed.required_oracle_refs.length === 0).length, 2);
  assert.equal(roleSeeds.find((seed) => seed.source_claim_ids.includes('claim_cashier_refund_deny'))
    ?.required_oracle_refs.length, 0);
  assert.equal(roleSeeds.length, 3);
});

// Break caught: missing/unknown/duplicate responsibility declarations are guessed, ignored, or overwrite one another.
test('input role obligations require one closed binding for every base responsibility and reject unknown or duplicate keys', async () => {
  const input = acceptedView(await fixture('input'));
  const missing = inputContext(input.claimsById);
  missing.responsibilityBindings.pop();
  assert.throws(() => compileInput(input.view, missing), /missing responsibility binding/);

  const unknown = inputContext(input.claimsById);
  unknown.responsibilityBindings.push(binding(
    responsibilityKey('input-domain', 'input_amount', { responsibility: 'boundary', boundary: 'outside' }),
    'low', ['claim_amount_lower'], [], []
  ));
  assert.throws(() => compileInput(input.view, unknown), /unknown responsibility binding/);

  const duplicate = inputContext(input.claimsById);
  duplicate.responsibilityBindings.push(structuredClone(duplicate.responsibilityBindings[0]));
  assert.throws(() => compileInput(input.view, duplicate), /duplicate responsibility binding/);

  for (const field of [
    'responsibility_key', 'source_claim_ids', 'required_oracle_refs', 'required_capabilities'
  ]) {
    const padded = inputContext(input.claimsById);
    const paddedBinding = /** @type {any} */ (padded.responsibilityBindings[0]);
    if (field === 'responsibility_key') paddedBinding[field] = '   ';
    else paddedBinding[field] = ['   '];
    assert.throws(() => compileInput(input.view, padded), /nonblank/);
  }
  assert.throws(() => responsibilityKey('   ', 'input_amount', { responsibility: 'boundary' }), /requires/);
  assert.throws(() => responsibilityKey('input-domain', '   ', { responsibility: 'boundary' }), /requires/);
  for (const field of [
    'responsibility_key', 'source_claim_ids', 'required_oracle_refs', 'required_capabilities'
  ]) {
    const padded = inputContext(input.claimsById);
    const paddedBinding = /** @type {any} */ (padded.responsibilityBindings[0]);
    const value = field === 'responsibility_key' ? paddedBinding[field] : paddedBinding[field][0];
    if (field === 'responsibility_key') paddedBinding[field] = ` ${value} `;
    else paddedBinding[field] = [` ${value} `];
    assert.throws(() => compileInput(input.view, padded), /unpadded/);
  }
  assert.throws(() => responsibilityKey(' input-domain', 'input_amount', { responsibility: 'boundary' }), /requires/);
  assert.throws(() => responsibilityKey('input-domain', 'input_amount ', { responsibility: 'boundary' }), /requires/);
});

// Break caught: the same owning evidence closure is rebuilt once per responsibility, making one large element quadratic.
test('input role obligations compute one local owning ancestry closure for two thousand responsibilities', () => {
  const permissionCount = 2_000;
  let parentReads = 0;
  const permissions = Array.from({ length: permissionCount }, (_, index) => `allow:p${String(index).padStart(4, '0')}`);
  const claimIds = permissions.map((_, index) => `claim_role_large_${String(index).padStart(4, '0')}`);
  const claimsById = new Map(claimIds.map((claimId) => {
    const claim = {
      claim_id: claimId, level: 'E3', kind: 'requirement', scope: 'role.large'
    };
    Object.defineProperty(claim, 'parent_claim_ids', {
      enumerable: true,
      get() {
        parentReads += 1;
        return [];
      }
    });
    return [claimId, claim];
  }));
  const view = {
    view_id: 'view_role_large', type: 'role', scope: 'role.large',
    elements: [{
      element_id: 'role_large', kind: 'role-permission', role: 'large', permissions,
      source_claim_ids: claimIds, model_refs: []
    }]
  };
  const context = {
    claimsById,
    responsibilityBindings: permissions.map((permission, index) => binding(
      responsibilityKey('role', 'role_large', { responsibility: 'permission', permission }),
      'low', [claimIds[index]], [], []
    ))
  };
  const started = performance.now();

  const actual = compileRole(view, context);
  const elapsed = performance.now() - started;

  assert.equal(actual.length, permissionCount);
  assert.equal(parentReads <= permissionCount * 3, true, `owning ancestry read ${parentReads} claim parents`);
  assert.equal(elapsed < 1_500, true, `two-thousand-responsibility compile took ${elapsed.toFixed(1)}ms`);
});

// Break caught: a same-scope accepted claim unrelated to the owning element is promoted into responsibility evidence.
test('input role obligations require binding evidence to belong to the owning element accepted ancestry', async () => {
  const input = acceptedView(await fixture('input'), [{
    claim_id: 'claim_same_scope_unrelated', scope: 'checkout.amount'
  }]);
  const unrelated = inputContext(input.claimsById);
  unrelated.responsibilityBindings[0].source_claim_ids = ['claim_same_scope_unrelated'];
  unrelated.responsibilityBindings[0].required_oracle_refs = [];
  assert.throws(() => compileInput(input.view, unrelated), /not validated support of owning element/);

  const siblingOracle = inputContext(input.claimsById);
  siblingOracle.responsibilityBindings[0].required_oracle_refs = ['claim_amount_zero'];
  assert.throws(() => compileInput(input.view, siblingOracle), /not validated evidence/);
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
  const reorderedRoleContext = roleContext(role.claimsById);
  reorderedRoleContext.responsibilityBindings.reverse();
  const firstRole = compileRole(role.view, reorderedRoleContext);

  assert.deepEqual(firstInput.map((seed) => seed.obligation_id), inputIds);
  assert.deepEqual(firstRole.map((seed) => seed.obligation_id), roleIds);
  assert.notStrictEqual(firstInput, secondInput);
  assert.notStrictEqual(firstInput[0], secondInput[0]);
  firstInput[0].source_claim_ids.push('mutation');
  assert.equal(secondInput[0].source_claim_ids.includes('mutation'), false);
});
