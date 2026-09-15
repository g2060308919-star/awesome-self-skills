import assert from 'node:assert/strict';
import test from 'node:test';

import runInstanceSchema from '../../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { withRun } from '../helpers/v4-revision-transaction-fixture.mjs';

const RUN_ID = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARENT_ID = 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXECUTION_ID = 'RUN-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA = `sha256:${'a'.repeat(64)}`;

function semanticReopenLineage() {
  return {
    creation_reason: 'reopen_semantic_question',
    parent_case_document_ref: {
      run_id: PARENT_ID, revision: 4, manifest_digest: SHA, bundle_digest: SHA
    },
    parent_execution_run_id: EXECUTION_ID,
    reopen_event_id: 'EVENT-reopen',
    reopened_targets: [{
      root_issue_id: `ROOT-${'1'.repeat(64)}`,
      prior_root_version_digest: SHA,
      reopened_root_version_digest: `sha256:${'b'.repeat(64)}`,
      decision_suspension: {
        newly_suspended_decision_ids: [`DEC-${'2'.repeat(64)}`],
        cumulative_suspended_decision_ids: [`DEC-${'2'.repeat(64)}`],
        reopen_event_id: 'EVENT-reopen'
      }
    }],
    decision_reopen_overlay_digest: `sha256:${'c'.repeat(64)}`,
    inherited_artifacts: {
      source_pack_digest: SHA,
      decision_journal_digest: SHA,
      evidence_digest: SHA,
      scope_manifest_digest: SHA
    }
  };
}

test('T10 run-instance schema is a closed v3/v4 discriminator for fresh, replay and reopen identities', async () => {
  const v3 = {
    schema_version: '3.0.0', run_instance_id: RUN_ID,
    created_at: '2026-09-09T00:00:00.000Z'
  };
  const fresh = {
    schema_version: '4.0.0', compiler_version: '0.5.0', run_id: RUN_ID,
    delivery_intent: 'case_document', created_at: '2026-09-09T00:00:00.000Z', lineage: null
  };
  const reopened = { ...fresh, lineage: semanticReopenLineage() };
  assert.deepEqual(validateAgainstSchema(v3, runInstanceSchema), []);
  assert.deepEqual(validateAgainstSchema(fresh, runInstanceSchema), []);
  assert.deepEqual(validateAgainstSchema(reopened, runInstanceSchema), []);
  for (const invalid of [
    { ...fresh, extra: true },
    { ...fresh, compiler_version: '0.4.0' },
    { ...fresh, delivery_intent: 'combined' },
    { ...fresh, lineage: { ...semanticReopenLineage(), parent_run_id: PARENT_ID } }
  ]) assert.notDeepEqual(validateAgainstSchema(invalid, runInstanceSchema), []);

  await withRun(async (directory) => {
    const first = await ensureV4RunInstance(directory, {
      run_id: RUN_ID, delivery_intent: 'case_document'
    });
    const replay = await ensureV4RunInstance(directory, {
      run_id: RUN_ID, delivery_intent: 'case_document'
    });
    assert.deepEqual(validateAgainstSchema(first, runInstanceSchema), []);
    assert.deepEqual(replay, first);
    await assert.rejects(ensureV4RunInstance(directory, {
      run_id: RUN_ID, delivery_intent: 'execution_plan'
    }), /RUN_INSTANCE_BINDING_CONFLICT/u);
  });
});

test('T10 migration and cancelled-resume siblings use the canonical v4 identity with typed lineage', () => {
  for (const creationReason of ['migration_v3', 'resume_cancelled']) {
    const sibling = {
      schema_version: '4.0.0', compiler_version: '0.5.0', run_id: RUN_ID,
      delivery_intent: 'case_document', created_at: '2026-09-09T00:00:00.000Z',
      lineage: { creation_reason: creationReason, parent_run_id: PARENT_ID }
    };
    assert.deepEqual(validateAgainstSchema(sibling, runInstanceSchema), [], creationReason);
    assert.notDeepEqual(validateAgainstSchema({
      ...sibling, run_instance_id: RUN_ID
    }, runInstanceSchema), [], creationReason);
  }
});
