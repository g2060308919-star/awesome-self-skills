import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digest } from '../../src/canonical.mjs';
import { V5_POLICY_DIGEST_KEYS, generateV5Contracts, loadV5Contracts } from '../../src/v5/registry-generator.mjs';

const policyDirectory = new URL('../../skill/generate-test-cases/scripts/policies/', import.meta.url);
const schemaDirectory = new URL('../../skill/generate-test-cases/scripts/schemas/', import.meta.url);

const EXPECTED_COUNTS = Object.freeze({
  action_templates: 9,
  fsm_cells: 16,
  fsm_outcomes: 51,
  invariant_rules: 34,
  read_only_profiles: 4,
  runtime_error_rules: 40,
  stable_id_rows: 28
});

const EXPECTED_CONTROL_TOKENS = Object.freeze({
  confirmation_tokens: ['确认提交', '确认以上变更'],
  temporary_marker_tokens: ['临时按此口径', '暂按此口径'],
  clone_marker_tokens: ['同一回答适用于', '以下回答同时适用'],
  control_tokens: {
    defer: ['暂缓回答', '稍后回答'],
    unknown: ['目前未知', '暂不清楚'],
    close_for_delivery: ['关闭该问题并继续交付', '保留未解决并继续交付']
  }
});

test('v5 registry generator emits the exact frozen inventory', () => {
  const contracts = generateV5Contracts();
  const runtimeRules = contracts.policyRegistry.rules.filter((/** @type {any} */ rule) => rule.kind === 'runtime_error');
  const invariantRules = contracts.policyRegistry.rules.filter((/** @type {any} */ rule) => rule.kind === 'invariant');

  assert.equal(contracts.fsmRegistry.action_templates.length, EXPECTED_COUNTS.action_templates);
  assert.equal(contracts.fsmRegistry.cells.length, EXPECTED_COUNTS.fsm_cells);
  assert.equal(contracts.fsmRegistry.outcomes.length, EXPECTED_COUNTS.fsm_outcomes);
  assert.equal(contracts.fsmRegistry.read_only_profiles.length, EXPECTED_COUNTS.read_only_profiles);
  assert.equal(runtimeRules.length, EXPECTED_COUNTS.runtime_error_rules);
  assert.equal(invariantRules.length, EXPECTED_COUNTS.invariant_rules);
  assert.equal(contracts.stableIdPreimageRegistry.rows.length, EXPECTED_COUNTS.stable_id_rows);
  assert.equal(contracts.sourceAcquisitionPolicy.max_requests_per_batch, 16);
  assert.equal(contracts.sourceAcquisitionPolicy.batch_order, 'required_desc_then_request_id_asc');
  assert.equal(contracts.sourceAcquisitionPolicy.bootstrap_array_semantics, 'set');
  assert.equal(contracts.sourceAcquisitionPolicy.disposition_array_semantics, 'set');
  assert.deepEqual({
    confirmation_tokens: contracts.clarificationControlRegistry.confirmation_tokens,
    temporary_marker_tokens: contracts.clarificationControlRegistry.temporary_marker_tokens,
    clone_marker_tokens: contracts.clarificationControlRegistry.clone_marker_tokens,
    control_tokens: contracts.clarificationControlRegistry.control_tokens
  }, EXPECTED_CONTROL_TOKENS);
  assert.deepEqual(contracts.answerConstraintRegistry.text_ambiguity_guards[0].forbidden_tokens,
    ['正常', '正确', '对应', '原值', '按原值', '所有', '否则', '其他', '及时', '合理', '默认']);
});

test('v5 registries have valid self-digests and no orphan references', () => {
  const contracts = generateV5Contracts();
  for (const [contractKey, contract] of Object.entries(contracts)) {
    const digestKey = /** @type {Record<string, string>} */ (V5_POLICY_DIGEST_KEYS)[contractKey];
    assert.ok(digestKey, 'every generated registry has a declared self-digest key');
    const { [digestKey]: declaredDigest, ...payload } = contract;
    assert.equal(declaredDigest, `sha256:${digest(payload)}`);
  }

  const cells = new Set(contracts.fsmRegistry.cells.map((/** @type {any} */ cell) => cell.cell_id));
  const templates = new Set(contracts.fsmRegistry.action_templates.map((/** @type {any} */ row) => row.template_id));
  for (const outcome of contracts.fsmRegistry.outcomes) {
    assert.ok(cells.has(outcome.target_cell_id));
    if (outcome.trigger.kind === 'advance') {
      assert.ok(cells.has(outcome.trigger.from_cell_id));
      assert.ok(templates.has(outcome.trigger.action_template_id));
    }
  }

  const errorCodes = new Set(contracts.policyRegistry.rules
    .filter((/** @type {any} */ rule) => rule.kind === 'runtime_error').map((/** @type {any} */ rule) => rule.error_code));
  assert.equal(errorCodes.size, 40);
  for (const target of contracts.policyRegistry.accepted_closure_integrity_policy.target_rules) {
    assert.ok(errorCodes.has(target.diagnostic_code));
  }
  assert.deepEqual(new Set(contracts.replyContracts.error_codes), errorCodes);
});

test('committed v5 registries load with byte-stable generated content', async () => {
  const loaded = await loadV5Contracts(schemaDirectory, policyDirectory);
  const generated = generateV5Contracts();
  assert.equal(loaded.rulesBundleDigest, generated.replyContracts.rules_bundle_digest);
  assert.deepEqual(loaded.contracts, generated);

  const fsm = JSON.parse(await readFile(new URL('v5-fsm-registry.json', policyDirectory), 'utf8'));
  assert.equal(fsm.registry_digest, generated.fsmRegistry.registry_digest);
});
