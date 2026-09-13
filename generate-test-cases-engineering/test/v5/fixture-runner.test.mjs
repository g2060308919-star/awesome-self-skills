import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  acquireV5FixtureSandbox,
  resolveFixturePointer,
  runV5FixtureManifest,
  v5FixtureSandboxPaths,
  validateManifestRelativePath,
  validateV5FixtureManifest
} from '../fixtures-v5-runner.mjs';
import { V5_REQUIRED_FIXTURE_LEAF_IDS } from './fixture-inventory.mjs';
import { canonicalV5Stringify } from '../../src/v5/canonical-v5.mjs';

const manifestPath = path.resolve('tests/fixtures/v5/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function cloneManifest() { return structuredClone(manifest); }

test('manifest is the closed and complete discovery source for C01-C16', () => {
  const validated = validateV5FixtureManifest(cloneManifest());
  assert.equal(validated.fixtures.length, V5_REQUIRED_FIXTURE_LEAF_IDS.length);
  assert.deepEqual(validated.fixtures.map((/** @type {Record<string,any>} */ fixture) => fixture.fixture_id).sort(), V5_REQUIRED_FIXTURE_LEAF_IDS);
  for (let index = 1; index <= 16; index += 1) {
    const requirement = `C${String(index).padStart(2, '0')}`;
    const leaves = validated.fixtures.filter((/** @type {Record<string,any>} */ fixture) => fixture.requirement_ids.includes(requirement));
    assert.ok(leaves.some((/** @type {Record<string,any>} */ fixture) => fixture.fixture_id.includes('.positive.')), requirement);
    assert.ok(leaves.some((/** @type {Record<string,any>} */ fixture) => /\.(negative|blocked|protocol)\./u.test(fixture.fixture_id)), requirement);
  }
});

test('every normative leaf has an independent trigger and assertion body', () => {
  const bodies = new Map();
  for (const fixture of validateV5FixtureManifest(cloneManifest()).fixtures) {
    const body = structuredClone(fixture);
    delete body.fixture_id;
    delete body.requirement_ids;
    const encoded = canonicalV5Stringify(body);
    assert.equal(bodies.has(encoded), false, `${fixture.fixture_id} aliases ${bodies.get(encoded)}`);
    bodies.set(encoded, fixture.fixture_id);
  }
});

test('runner rejects open manifests, cardinality drift, forward bindings, and unverified process control', () => {
  const opened = cloneManifest();
  opened.extra = true;
  assert.throws(() => validateV5FixtureManifest(opened), /root is not closed/u);

  const cardinality = cloneManifest();
  cardinality.fixtures[0].expected_steps = [];
  assert.throws(() => validateV5FixtureManifest(cardinality), /cardinality differs/u);

  const forward = cloneManifest();
  forward.fixtures[0].action_sequence[0].request_bindings = [{
    target_json_pointer: '/source_bootstrap',
    value_from: { source_step_id: 'create', source_json_pointer: '/work_packet' }
  }];
  assert.throws(() => validateV5FixtureManifest(forward), /backward-only/u);

  const processControl = cloneManifest();
  processControl.fixtures[0].action_sequence.push({ step_id: 'restart', api: 'restart_process' });
  processControl.fixtures[0].expected_steps.push({ kind: 'process_control', api: 'restart_process', result: 'restarted' });
  assert.throws(() => validateV5FixtureManifest(processControl), /lacks later API evidence/u);
});

test('manifest paths and JSON pointers are exact and traversal-safe', () => {
  for (const rejected of ['/absolute.json', '../escape.json', 'a/../b.json', 'a//b.json', 'a\\b.json', 'a\0b.json']) {
    assert.throws(() => validateManifestRelativePath(rejected), /unsafe manifest-relative path/u);
  }
  assert.equal(validateManifestRelativePath('requests/create-valid.json'), 'requests/create-valid.json');
  assert.equal(resolveFixturePointer({ a: [{ 'b/c': 7 }] }, '/a/0/b~1c'), 7);
  assert.throws(() => resolveFixturePointer({ a: 1 }, '/missing'), /does not resolve exactly once/u);
});

test('fixed sandbox uses the frozen SHA-256 paths, modes, lock, and cleanup contract', async () => {
  const fixtureId = 'F-C15-protocol.positive.baseline';
  const relativePath = 'inputs/local-source.input';
  const bytes = await readFile(path.resolve('tests/fixtures/v5', relativePath));
  const paths = v5FixtureSandboxPaths(fixtureId, relativePath, bytes);
  assert.match(paths.directory, /^\/tmp\/generate-test-cases-v5-fixtures-v1\/[0-9a-f]{64}$/u);
  assert.match(paths.input, /^\/tmp\/generate-test-cases-v5-fixtures-v1\/[0-9a-f]{64}\/[0-9a-f]{64}\.input$/u);

  const sandbox = await acquireV5FixtureSandbox(fixtureId);
  try {
    assert.equal((await lstat(sandbox.directory)).mode & 0o777, 0o700);
    assert.equal((await lstat(paths.lock)).mode & 0o777, 0o700);
    await assert.rejects(() => acquireV5FixtureSandbox(fixtureId), /already locked/u);
  } finally {
    await sandbox.release();
  }
  await assert.rejects(() => lstat(paths.lock), { code: 'ENOENT' });
  await assert.rejects(() => lstat(paths.directory), { code: 'ENOENT' });
});

test('all leaves execute twice with byte-identical normalized transcript digests', async () => {
  const first = await runV5FixtureManifest(manifestPath);
  const second = await runV5FixtureManifest(manifestPath);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    schema_version: '5.0.0',
    requirement_groups_passed: 16,
    fixture_leaves_passed: 105,
    transcript_digest: 'sha256:bcead0bdce92510cd8b3b4d0e16eadd4ad429c82b7dfc768e53a548650020729'
  });
});
