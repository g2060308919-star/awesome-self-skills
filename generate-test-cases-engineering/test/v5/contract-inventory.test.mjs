import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inventoryUrl = new URL('../../docs/superpowers/evidence/v5-symbol-schema-map.json', import.meta.url);

test('v5 development inventory freezes the verified v4 baseline and complete contract surface', async () => {
  const inventory = JSON.parse(await readFile(inventoryUrl, 'utf8'));

  assert.equal(inventory.baseline.commit, '858fdd1de77ba31655ff57810fbf0ff8a47872c9');
  assert.equal(inventory.baseline.schema_version, '4.0.0');
  assert.equal(inventory.baseline.compiler_version, '0.5.0');
  assert.deepEqual(inventory.baseline.public_exports, [
    'advanceStrict',
    'constructV4Action',
    'createV4RunDirectory',
    'sourceAcquisitionMaterialPathV4',
    'stageV4SourceAcquisitionAction'
  ]);
  assert.deepEqual(inventory.baseline.commands, [
    'npm run check',
    'npm run test:benchmark',
    'npm run public-pilot'
  ]);
  assert.deepEqual(inventory.baseline.results, {
    npm_run_check: { core: 1447, repeatability: 2, failed: 0 },
    npm_run_public_pilot: { pilot_admitted: 30, status: 'pilot_ready', total: 30 },
    npm_run_test_benchmark: { failed: 0, passed: 145 }
  });
  assert.equal(inventory.baseline.schemas.length, 16);
  assert.deepEqual(inventory.baseline.reference_policies, [
    'behavior-views.md',
    'case-writing-policy.md',
    'clarification-policy.md',
    'evidence-policy.md',
    'execution-closure-policy.md',
    'run-management.md'
  ]);
  assert.deepEqual(inventory.v5.requirements, Array.from({ length: 16 }, (_, index) =>
    `C${String(index + 1).padStart(2, '0')}`));
  assert.equal(inventory.v5.schema_version, '5.0.0');
  assert.equal(inventory.v5.compiler_version, '0.6.0');
  assert.deepEqual(inventory.v5.public_exports, [
    'advanceV5Run',
    'createV5RunDirectory',
    'inspectV5Run'
  ]);
  assert.doesNotMatch(JSON.stringify(inventory), /\/Users\//u);
});
