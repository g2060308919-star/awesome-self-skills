import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import * as revisionTransactions from '../../src/revision-transaction-v4.mjs';
import {
  abortPendingRevisionV4,
  commitRevisionTransactionV4,
  ensureV4RunInstance,
  readRevisionTransactionV4
} from '../../src/revision-transaction-v4.mjs';
import { acquireRunLock, atomicWriteJson, ensureRunInstance } from '../../src/run-store.mjs';
import {
  appendRequest, readJson, revisionArtifacts, sha, withRun
} from '../helpers/v4-revision-transaction-fixture.mjs';

/** @param {string} file */
const missing = async (file) => assert.rejects(readFile(file), { code: 'ENOENT' });

test('T10 creates an immutable v4 run identity without changing legacy v3 creation', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const first = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const second = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    assert.equal(first.schema_version, '4.0.0');
    assert.equal(first.compiler_version, '0.5.0');
    assert.equal(first.delivery_intent, 'case_document');
    assert.match(first.run_id, /^RUN-[0-9a-f-]{36}$/u);
    assert.deepEqual(second, first);
    await assert.rejects(
      ensureV4RunInstance(directory, { delivery_intent: 'execution_plan' }),
      /RUN_INSTANCE_BINDING_CONFLICT/
    );
  });
  await withRun(async (/** @type {string} */ directory) => {
    const legacy = await ensureRunInstance(directory);
    assert.equal(legacy.schema_version, '3.0.0');
    assert.match(legacy.run_instance_id, /^RUN-/u);
  });
});

test('T10 adopts a pristine v3 bootstrap as v4 without changing its durable identity', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const bootstrap = await ensureRunInstance(directory);
    const adopted = await ensureV4RunInstance(directory, {
      run_id: bootstrap.run_instance_id, delivery_intent: 'case_document'
    });
    assert.deepEqual(adopted, {
      schema_version: '4.0.0', compiler_version: '0.5.0',
      run_id: bootstrap.run_instance_id, delivery_intent: 'case_document',
      created_at: bootstrap.created_at, lineage: null
    });
    assert.deepEqual(await ensureV4RunInstance(directory, {
      run_id: bootstrap.run_instance_id, delivery_intent: 'case_document'
    }), adopted);
  });
});

test('T10 refuses to reinterpret an established v3 run as a v4 bootstrap', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const legacy = await ensureRunInstance(directory);
    await atomicWriteJson(directory, path.join(directory, 'checkpoint.json'), {
      schema_version: '3.0.0', run_instance_id: legacy.run_instance_id, source_revision: 0
    });
    await assert.rejects(ensureV4RunInstance(directory, {
      run_id: legacy.run_instance_id, delivery_intent: 'case_document'
    }), /V3_BOOTSTRAP_NOT_ADOPTABLE/);
    assert.equal((await readJson(path.join(directory, 'run-instance.json'))).schema_version, '3.0.0');
  });
});

test('T10 exposes explicit held-lock entry points for the production runner transaction', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const bootstrap = await ensureRunInstance(directory);
    await assert.rejects(revisionTransactions.ensureV4RunInstanceWithHeldLock(directory, {
      run_id: bootstrap.run_instance_id, delivery_intent: 'case_document'
    }, undefined), /RUN_LOCK_OWNERSHIP_REQUIRED/);
    const release = await acquireRunLock(directory);
    try {
      const run = await revisionTransactions.ensureV4RunInstanceWithHeldLock(directory, {
        run_id: bootstrap.run_instance_id, delivery_intent: 'case_document'
      }, release);
      const committed = await revisionTransactions.commitRevisionTransactionV4WithHeldLock(
        directory,
        appendRequest('pre_case_pending', null, 0, { run_id: run.run_id }),
        release
      );
      assert.equal(committed.status, 'committed');
      assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).revision, 0);
    } finally {
      await release();
    }
  });
});

test('T10 abort entry point participates in the same already-held runner lock', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const release = await acquireRunLock(directory);
    try {
      const run = await revisionTransactions.ensureV4RunInstanceWithHeldLock(
        directory, { delivery_intent: 'case_document' }, release
      );
      const request = appendRequest('pre_case_pending', null, 0, {
        run_id: run.run_id, append_id: 'APPEND-held-abort'
      });
      await assert.rejects(revisionTransactions.commitRevisionTransactionV4WithHeldLock(
        directory, request, release, {
          after_phase(phase) { if (phase === 'reserved') throw new Error('STOP_HELD_CANDIDATE'); }
        }
      ), /STOP_HELD_CANDIDATE/);
      const aborted = await revisionTransactions.abortPendingRevisionV4WithHeldLock(
        directory, { append_id: request.append_id, append_digest: request.append_digest }, release
      );
      assert.equal(aborted.status, 'aborted');
      await missing(path.join(directory, 'checkpoint.json'));
    } finally {
      await release();
    }
  });
});

test('T10 commit profiles expose only a complete committed checkpoint and only final switches current', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const pre = appendRequest('pre_case_pending', null, 0, { run_id: run.run_id });
    const first = await commitRevisionTransactionV4(directory, pre);
    assert.equal(first.status, 'committed');
    assert.equal(first.committed_revision, 0);
    assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).commit_profile, 'pre_case_pending');
    await missing(path.join(directory, 'output/current.json'));
    await missing(path.join(directory, 'accepted/r000/behavior-views.json'));
    await missing(path.join(directory, 'accepted/r000/case-drafts.json'));

    const preCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const final = appendRequest('final', 0, 1, {
      run_id: run.run_id, base_checkpoint_text: preCheckpoint
    });
    const delivered = await commitRevisionTransactionV4(directory, final);
    const originalCurrent = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    assert.equal(delivered.delivery_manifest_digest, sha256Bytes(originalCurrent));
    assert.equal((await readJson(path.join(directory, 'output/current.json'))).revision, 1);

    const finalCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const post = appendRequest('post_case_pending', 1, 2, {
      run_id: run.run_id, base_checkpoint_text: finalCheckpoint
    });
    await commitRevisionTransactionV4(directory, post);
    assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).revision, 2);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), originalCurrent);

    const postCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const laterPre = appendRequest('pre_case_pending', 2, 3, {
      run_id: run.run_id, base_checkpoint_text: postCheckpoint
    });
    await commitRevisionTransactionV4(directory, laterPre);
    assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).revision, 3);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), originalCurrent);
    assert.equal((await readRevisionTransactionV4(directory, delivered.txn_id)).phase, 'complete');
  });
});

test('T10 atomically promotes one semantic revision from pre-case through post-case to final', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const semanticDigest = sha('semantic-profile-promotion');
    const pre = appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-promote-pre', semantic_digest: semanticDigest
    });
    const preResult = await commitRevisionTransactionV4(directory, pre);
    const preSource = await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8');
    const preCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');

    const post = appendRequest('post_case_pending', 0, 0, {
      run_id: run.run_id, append_id: 'APPEND-promote-post', semantic_digest: semanticDigest,
      base_checkpoint_text: preCheckpoint
    });
    const postResult = await commitRevisionTransactionV4(directory, post);
    assert.equal(postResult.status, 'committed');
    assert.equal(postResult.committed_revision, 0);
    assert.equal(postResult.commit_profile, 'post_case_pending');
    assert.notEqual(postResult.txn_id, preResult.txn_id);
    assert.equal(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'), preSource);
    assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).commit_profile, 'post_case_pending');
    await missing(path.join(directory, 'output/current.json'));

    const postCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const final = appendRequest('final', 0, 0, {
      run_id: run.run_id, append_id: 'APPEND-promote-final', semantic_digest: semanticDigest,
      base_checkpoint_text: postCheckpoint
    });
    const finalResult = await commitRevisionTransactionV4(directory, final);
    assert.deepEqual(await commitRevisionTransactionV4(directory, structuredClone(final)), finalResult);
    assert.equal(finalResult.status, 'committed');
    assert.equal(finalResult.committed_revision, 0);
    assert.equal(finalResult.commit_profile, 'final');
    assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).commit_profile, 'final');
    assert.equal((await readJson(path.join(directory, 'output/current.json'))).revision, 0);
    assert.equal(
      (await readJson(path.join(directory, 'transactions/committed/r000.json'))).commit_profile,
      'final'
    );

    const beforeCurrent = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const downgrade = appendRequest('post_case_pending', 0, 0, {
      run_id: run.run_id, append_id: 'APPEND-promote-downgrade', semantic_digest: semanticDigest,
      base_checkpoint_text: await readFile(path.join(directory, 'checkpoint.json'), 'utf8')
    });
    await assert.rejects(
      commitRevisionTransactionV4(directory, downgrade), /REVISION_PROFILE_PROMOTION_INVALID/u
    );
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), beforeCurrent);
    await missing(path.join(directory, 'staging/pending-revision.json'));
  });
});

for (const phase of ['reserved', 'artifacts_committed', 'checkpoint_committed', 'delivery_committed']) {
  test(`T10 recovers a same-revision final promotion after ${phase}`, async () => {
    await withRun(async (/** @type {string} */ directory) => {
      const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
      const semanticDigest = sha(`semantic-promotion-crash-${phase}`);
      await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, {
        run_id: run.run_id, append_id: `APPEND-promotion-base-${phase}`, semantic_digest: semanticDigest
      }));
      const request = appendRequest('final', 0, 0, {
        run_id: run.run_id, append_id: `APPEND-promotion-${phase}`, semantic_digest: semanticDigest,
        base_checkpoint_text: await readFile(path.join(directory, 'checkpoint.json'), 'utf8')
      });
      let injected = false;
      await assert.rejects(commitRevisionTransactionV4(directory, request, {
        after_phase(observed) {
          if (!injected && observed === phase) {
            injected = true;
            throw new Error(`CRASH_PROMOTION_AFTER_${phase}`);
          }
        }
      }), new RegExp(`CRASH_PROMOTION_AFTER_${phase}`, 'u'));
      const recovered = await commitRevisionTransactionV4(directory, request);
      assert.equal(recovered.status, 'committed');
      assert.equal(recovered.committed_revision, 0);
      assert.equal(recovered.commit_profile, 'final');
      assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).commit_profile, 'final');
      assert.equal((await readJson(path.join(directory, 'output/current.json'))).revision, 0);
      await missing(path.join(directory, 'staging/pending-revision.json'));
    });
  });
}

test('T10 rejects a same-revision promotion that changes an inherited semantic artifact', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const semanticDigest = sha('semantic-promotion-inherited-change');
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-promotion-inherited-base', semantic_digest: semanticDigest
    }));
    const before = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const artifacts = revisionArtifacts('post_case_pending', 0, {
      run_id: run.run_id, base_checkpoint_text: before
    });
    artifacts.source_pack.value.output_language = 'en';
    await assert.rejects(commitRevisionTransactionV4(directory, appendRequest(
      'post_case_pending', 0, 0, {
        run_id: run.run_id, append_id: 'APPEND-promotion-inherited-change', semantic_digest: semanticDigest,
        artifacts
      }
    )), /REVISION_PROFILE_PROMOTION_CONTENT_CHANGED/u);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), before);
    await missing(path.join(directory, 'staging/pending-revision.json'));
    await missing(path.join(directory, 'accepted/r000/behavior-views.json'));
  });
});

test('T10 aborting a same-revision promotion restores the prior committed profile exactly', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const semanticDigest = sha('semantic-aborted-promotion');
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-abort-promotion-base', semantic_digest: semanticDigest
    }));
    const checkpointBefore = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const derivedCheckpointBefore = await readFile(
      path.join(directory, 'derived/r000/checkpoint.json'), 'utf8'
    );
    const clarificationBefore = await readFile(
      path.join(directory, 'derived/r000/clarification-state.json'), 'utf8'
    );
    const request = appendRequest('post_case_pending', 0, 0, {
      run_id: run.run_id, append_id: 'APPEND-abort-promotion', semantic_digest: semanticDigest,
      base_checkpoint_text: checkpointBefore
    });
    await assert.rejects(commitRevisionTransactionV4(directory, request, {
      after_phase(phase) {
        if (phase === 'artifacts_committed') throw new Error('STOP_PROMOTION_AFTER_ARTIFACTS');
      }
    }), /STOP_PROMOTION_AFTER_ARTIFACTS/u);
    const aborted = await abortPendingRevisionV4(directory, {
      append_id: request.append_id, append_digest: request.append_digest
    });
    assert.equal(aborted.status, 'aborted');
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpointBefore);
    assert.equal(
      await readFile(path.join(directory, 'derived/r000/checkpoint.json'), 'utf8'),
      derivedCheckpointBefore
    );
    assert.equal(
      await readFile(path.join(directory, 'derived/r000/clarification-state.json'), 'utf8'),
      clarificationBefore
    );
    await missing(path.join(directory, 'accepted/r000/behavior-views.json'));
    await missing(path.join(directory, 'accepted/r000/case-drafts.json'));
    await missing(path.join(directory, 'derived/r000/test-obligations.json'));
    assert.equal(
      (await readJson(path.join(directory, 'transactions/committed/r000.json'))).commit_profile,
      'pre_case_pending'
    );
  });
});

test('T10 pre-case partial answers persist the exact remaining question set across replay', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const artifacts = revisionArtifacts('pre_case_pending', 0, {
      run_id: run.run_id, semantic_gap_count: 3, resolved_gap_count: 1
    });
    const rootStates = artifacts.checkpoint.value.clarification_state.root_states;
    const request = appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-partial-answer', artifacts
    });

    const first = await commitRevisionTransactionV4(directory, request);
    const replay = await commitRevisionTransactionV4(directory, structuredClone(request));
    const persisted = await readJson(path.join(directory, 'derived/r000/clarification-state.json'));
    assert.deepEqual(replay, first);
    assert.deepEqual(persisted.root_states, rootStates);
    assert.deepEqual(persisted.root_states.filter(
      (/** @type {any} */ state) => state.status === 'presented'
    ).map((/** @type {any} */ state) => state.question_part_id),
    rootStates.filter((/** @type {any} */ state) => state.status === 'presented')
      .map((/** @type {any} */ state) => state.question_part_id));
    await missing(path.join(directory, 'accepted/r000/behavior-views.json'));
  });
});

test('T10 validates the complete profile before reserving and leaves committed state untouched', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, { run_id: run.run_id }));
    const before = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const artifacts = revisionArtifacts('final', 1, {
      run_id: run.run_id, base_checkpoint_text: before
    });
    delete artifacts.worksheet;
    await assert.rejects(
      commitRevisionTransactionV4(directory, appendRequest('final', 0, 1, { run_id: run.run_id, artifacts })),
      /REVISION_PROFILE_INCOMPLETE/
    );
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), before);
    await missing(path.join(directory, 'staging/pending-revision.json'));
  });
});

test('T10 rejects schema-invalid pre/post/final artifacts before reserving or changing current', async () => {
  /** @type {Array<[
   * 'pre_case_pending'|'post_case_pending'|'final', (artifacts:any)=>void
   * ]>} */
  const cases = [
    ['pre_case_pending', (artifacts) => { artifacts.source_pack.value.untrusted_extra = true; }],
    ['post_case_pending', (artifacts) => { artifacts.behavior_views.value.untrusted_extra = true; }],
    ['final', (artifacts) => { artifacts.bundle.value.result_kind = 'finished'; }]
  ];
  for (const [profile, mutate] of cases) {
    await withRun(async (/** @type {string} */ directory) => {
      const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
      const artifacts = revisionArtifacts(profile, 0, { run_id: run.run_id });
      mutate(artifacts);
      await assert.rejects(commitRevisionTransactionV4(directory, appendRequest(
        profile, null, 0, { run_id: run.run_id, artifacts }
      )), /REVISION_ARTIFACT_SCHEMA_INVALID/u);
      await missing(path.join(directory, 'staging/pending-revision.json'));
      await missing(path.join(directory, 'checkpoint.json'));
      await missing(path.join(directory, 'output/current.json'));
    });
  }
});

test('T10 rejects derived and canonical delivery relationship mismatches before mutation', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const derived = revisionArtifacts('pre_case_pending', 0, { run_id: run.run_id });
    derived.fact_ledger.value.facts = [];
    await assert.rejects(commitRevisionTransactionV4(directory, appendRequest(
      'pre_case_pending', null, 0, { run_id: run.run_id, artifacts: derived }
    )), /REVISION_ARTIFACT_RELATION_INVALID/u);
    await missing(path.join(directory, 'staging/pending-revision.json'));

    const forgedGenesis = revisionArtifacts('pre_case_pending', 0, { run_id: run.run_id });
    forgedGenesis.checkpoint.value.base_checkpoint_digest = sha('forged-genesis');
    await assert.rejects(commitRevisionTransactionV4(directory, appendRequest(
      'pre_case_pending', null, 0, {
        run_id: run.run_id, append_id: 'APPEND-forged-genesis', artifacts: forgedGenesis
      }
    )), /REVISION_ARTIFACT_RELATION_INVALID/u);
    await missing(path.join(directory, 'staging/pending-revision.json'));

    const delivery = revisionArtifacts('final', 0, { run_id: run.run_id });
    delivery.manifest.value.case_count = 99;
    await assert.rejects(commitRevisionTransactionV4(directory, appendRequest(
      'final', null, 0, { run_id: run.run_id, artifacts: delivery }
    )), /CANONICAL_MANIFEST_INVALID/u);
    await missing(path.join(directory, 'staging/pending-revision.json'));
    await missing(path.join(directory, 'output/current.json'));
  });
});

for (const phase of ['reserved', 'artifacts_committed', 'checkpoint_committed', 'delivery_committed']) {
  test(`T10 recovers a crash after ${phase} without a half commit`, async () => {
    await withRun(async (/** @type {string} */ directory) => {
      const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
      const request = appendRequest('final', null, 0, { run_id: run.run_id });
      let injected = false;
      await assert.rejects(commitRevisionTransactionV4(directory, request, {
        after_phase(observed) {
          if (!injected && observed === phase) {
            injected = true;
            throw new Error(`CRASH_AFTER_${phase}`);
          }
        }
      }), new RegExp(`CRASH_AFTER_${phase}`, 'u'));
      const recovered = await commitRevisionTransactionV4(directory, request);
      assert.equal(recovered.status, 'committed');
      assert.equal((await readJson(path.join(directory, 'checkpoint.json'))).revision, 0);
      assert.equal((await readJson(path.join(directory, 'output/current.json'))).revision, 0);
      assert.equal((await readRevisionTransactionV4(directory, recovered.txn_id)).phase, 'complete');
      await missing(path.join(directory, 'staging/pending-revision.json'));
    });
  });
}

test('T10 aborts only an uncommitted candidate and records an auditable tombstone', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    await commitRevisionTransactionV4(directory, appendRequest('final', null, 0, { run_id: run.run_id }));
    const baseCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const request = appendRequest('pre_case_pending', 0, 1, {
      run_id: run.run_id, base_checkpoint_text: baseCheckpoint
    });
    await assert.rejects(commitRevisionTransactionV4(directory, request, {
      after_phase(phase) { if (phase === 'reserved') throw new Error('STOP_CANDIDATE'); }
    }), /STOP_CANDIDATE/);
    const beforeCheckpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const beforeCurrent = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const result = await abortPendingRevisionV4(directory, {
      append_id: request.append_id, append_digest: request.append_digest
    });
    assert.equal(result.status, 'aborted');
    assert.equal((await readRevisionTransactionV4(directory, result.txn_id)).phase, 'aborted');
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), beforeCheckpoint);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), beforeCurrent);
    await missing(path.join(directory, 'staging/pending-revision.json'));

    const replay = await abortPendingRevisionV4(directory, {
      append_id: request.append_id, append_digest: request.append_digest
    });
    assert.deepEqual(replay, result);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), beforeCheckpoint);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), beforeCurrent);
  });
});

/** @param {string} text */
function sha256Bytes(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}
