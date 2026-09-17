import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  commitRevisionTransactionV4, ensureV4RunInstance
} from '../../src/revision-transaction-v4.mjs';
import { verifyCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { GENERAL_QUALITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import currentPointerSchema from '../../skill/generate-test-cases/scripts/schemas/current-pointer.schema.json' with { type: 'json' };
import {
  appendRequest, withRun
} from '../helpers/v4-revision-transaction-fixture.mjs';

test('AT27/AT28: a newer 4.3 non-ready revision revokes older ready current authority', async () => {
  await withRun(async directory => {
    const run = await ensureV4RunInstance(directory, {
      delivery_intent: 'case_document', contract: GENERAL_QUALITY_V4_CONTRACT
    });
    await commitRevisionTransactionV4(directory, appendRequest('final', null, 0, {
      run_id: run.run_id, contract: GENERAL_QUALITY_V4_CONTRACT
    }));
    const readyBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const ready = JSON.parse(readyBytes);
    assert.equal(ready.revision, 0);
    assert.match(ready.review_target_digest, /^sha256:[0-9a-f]{64}$/u);

    const checkpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', 0, 1, {
      run_id: run.run_id, contract: GENERAL_QUALITY_V4_CONTRACT,
      base_checkpoint_text: checkpoint
    }));
    const firstStale = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
    assert.deepEqual(validateAgainstSchema(firstStale, currentPointerSchema), []);
    await assert.rejects(
      () => verifyCaseDocumentDeliveryV4(directory), /CANONICAL_MANIFEST_INVALID/u
    );
    assert.deepEqual(firstStale, {
      status: 'stale', schema_version: '4.3.0', compiler_version: '0.8.0',
      run_id: run.run_id, active_revision: 1, reason: 'higher_revision_not_ready',
      previous_ready_revision: 0,
      previous_ready_manifest_digest: `sha256:${createHash('sha256').update(readyBytes).digest('hex')}`
    });

    const newerCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', 1, 2, {
      run_id: run.run_id, contract: GENERAL_QUALITY_V4_CONTRACT,
      base_checkpoint_text: newerCheckpoint
    }));
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8')), {
      ...firstStale, active_revision: 2
    });
  });
});
