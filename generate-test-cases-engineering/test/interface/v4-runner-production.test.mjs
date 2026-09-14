import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stage(directory, stage, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), `${canonicalStringify(value)}\n`, 'utf8');
}

/** @param {any} reply */
function assertV4StopContract(reply) {
  assert.deepEqual(validateAgainstSchema(reply, replySchema), [], JSON.stringify(reply));
  assert.equal(typeof reply.run_id, 'string');
  assert.ok(Array.isArray(reply.produced_artifacts));
  assert.equal(typeof reply.incomplete_reason?.code, 'string');
  assert.ok(Array.isArray(reply.user_next_steps) && reply.user_next_steps.length > 0);
  assert.equal(typeof reply.recovery?.mode, 'string');
  assert.ok(Array.isArray(reply.non_blocking_diagnostics));
}

test('advanceStrict drives a v4 Case Document through the four artifacts and publishes one canonical delivery', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-production-'));
  try {
    const input = v4PipelineFixture();
    const runInstance = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const initial = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(initial.status, 'need_revision', JSON.stringify(initial));
    assert.equal(initial.incomplete_reason.code, 'STAGE_ARTIFACT_REQUIRED');
    assert.equal(initial.stage, 'source_pack');
    assertV4StopContract(initial);
    input.artifacts.source_pack.run_instance_id = runInstance.run_id;

    const expectedStages = /** @type {const} */ (['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']);
    for (const [index, submittedStage] of expectedStages.entries()) {
      await stage(directory, submittedStage, input.artifacts[submittedStage]);
      const reply = /** @type {any} */ (await advanceStrict(directory));
      if (index < expectedStages.length - 1) {
        assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
        assert.equal(reply.incomplete_reason.code, 'STAGE_ARTIFACT_REQUIRED');
        assert.equal(reply.stage, expectedStages[index + 1]);
        assertV4StopContract(reply);
      } else {
        assert.equal(reply.status, 'finished', JSON.stringify(reply));
        assert.equal(reply.delivery_intent, 'case_document');
        assert.equal(reply.result_kind, 'delivered_cases');
        assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
        assert.deepEqual(reply.produced_artifacts.map((/** @type {any} */ item) => item.kind), [
          'case_document', 'business_markdown', 'execution_worksheet'
        ]);
      }
    }

    const manifestText = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.delivery_intent, 'case_document');
    assert.equal(manifest.compiler_version, '0.5.0');
    assert.equal(manifest.schema_version, '4.0.0');
    assert.equal(manifest.case_count, 1);
    for (const key of ['bundle', 'markdown', 'execution_worksheet']) {
      assert.equal(typeof await readFile(path.join(directory, manifest[key].path), 'utf8'), 'string');
    }

    const replay = await advanceStrict(directory);
    assert.deepEqual(replay, await advanceStrict(directory));
    assert.equal(replay.status, 'finished');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('every v4 Agent stage rejects an invalid artifact with the complete BR-16 stop contract', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-invalid-stage-contract-'));
  try {
    const input = v4PipelineFixture();
    const runInstance = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    input.artifacts.source_pack.run_instance_id = runInstance.run_id;
    const initial = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(initial.stage, 'source_pack');
    assertV4StopContract(initial);

    const stages = /** @type {const} */ (['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']);
    for (const [index, submittedStage] of stages.entries()) {
      await stage(directory, submittedStage, {});
      const rejected = /** @type {any} */ (await advanceStrict(directory));
      assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
      assert.equal(rejected.stage, submittedStage);
      assertV4StopContract(rejected);

      await stage(directory, submittedStage, input.artifacts[submittedStage]);
      const accepted = /** @type {any} */ (await advanceStrict(directory));
      if (index < stages.length - 1) {
        assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
        assert.equal(accepted.incomplete_reason.code, 'STAGE_ARTIFACT_REQUIRED');
        assert.equal(accepted.stage, stages[index + 1]);
        assertV4StopContract(accepted);
      } else {
        assert.equal(accepted.status, 'finished', JSON.stringify(accepted));
        assert.deepEqual(validateAgainstSchema(accepted, replySchema), []);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v4 Case Document production never persists a fifth Agent artifact or execution resource projection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-four-artifacts-'));
  try {
    const input = v4PipelineFixture();
    const initial = /** @type {any} */ (await advanceStrict(directory));
    input.artifacts.source_pack.run_instance_id = initial.scope.run_instance_id;
    for (const submittedStage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(directory, submittedStage, input.artifacts[submittedStage]);
      await advanceStrict(directory);
    }
    const acceptedFiles = await Promise.all(Object.values(STAGE_FILES).map(file =>
      readFile(path.join(directory, 'accepted/r000', file), 'utf8')
    ));
    assert.equal(acceptedFiles.length, 4);
    const bundle = JSON.parse(await readFile(path.join(directory, 'output/r000/test-bundle.json'), 'utf8'));
    for (const forbidden of ['execution_resources', 'execution_plan', 'runner_projection', 'runner_case_ids']) {
      assert.equal(Object.hasOwn(bundle, forbidden), false, forbidden);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
