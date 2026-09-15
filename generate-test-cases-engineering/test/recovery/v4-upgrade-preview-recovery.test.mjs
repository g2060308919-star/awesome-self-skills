// @ts-nocheck -- Fault-state tests intentionally materialize partial compiler-owned transactions.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  advanceStrict, commitSemanticAnswerBatchV4, createV4RunDirectory,
  prepareSemanticAnswerBatchV4
} from '../../src/entry.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

async function writeJson(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${canonicalStringify(value)}\n`, 'utf8');
}

async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function pendingRun() {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-preview-recovery-'));
  const created = await createV4RunDirectory(catalog, 'case_document');
  const fixture = await bendReviewJourneyFixture(created.run_id);
  await writeJson(path.join(created.run_directory, 'staging/source-pack.json'), fixture.artifacts.source_pack);
  assert.equal((await advanceStrict(created.run_directory)).stage, 'evidence_claims');
  await writeJson(path.join(created.run_directory, 'staging/evidence-claims.json'), fixture.artifacts.evidence_claims);
  const reply = await advanceStrict(created.run_directory);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  return { catalog, directory: created.run_directory, reply };
}

async function preparedRun() {
  const run = await pendingRun();
  const part = run.reply.semantic_presentation.question_parts.find((item) => /IP/u.test(item.question));
  assert.ok(part);
  const answer = '发布者提交评价时的 IP 归属地';
  const userMessage = `答复：${answer}`;
  const prepared = await prepareSemanticAnswerBatchV4(run.directory, {
    presentation_id: run.reply.semantic_presentation.presentation_id,
    user_message: userMessage,
    requests: [{
      action: 'answer_question_part', question_part_id: part.question_part_id,
      answer, user_message: userMessage, resolution: 'temporary', origin_type: 'user_statement'
    }]
  });
  assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
  const stored = JSON.parse(await readFile(path.join(
    run.directory, 'derived/semantic-answer-previews/by-id', `${prepared.value.preview_id}.json`
  ), 'utf8'));
  const candidate = JSON.parse(await readFile(path.join(
    run.directory, 'derived/semantic-answer-previews/by-id', `${prepared.value.preview_id}.source-pack.json`
  ), 'utf8'));
  return { ...run, part, userMessage, prepared: prepared.value, stored, candidate };
}

function confirmedReceipt(run, confirmationMessage) {
  return {
    contract_version: 'semantic-answer-preview/v1',
    preview_id: run.prepared.preview_id,
    preview_digest: run.prepared.preview_digest,
    decision: 'apply',
    confirmation_message: confirmationMessage,
    confirmation_message_digest: sourceByteDigest(new TextEncoder().encode(confirmationMessage)),
    base_revision: run.prepared.run_binding.accepted_revision,
    target_revision: run.prepared.run_binding.accepted_revision + 1,
    event_ids: [...run.stored.event_ids],
    state: 'confirmed',
    runner_reply_digest: null
  };
}

for (const crashPoint of ['after_receipt', 'after_staging', 'after_accepted']) {
  test(`T03 AT19 ${crashPoint} resumes the exact preview append once`, async () => {
    const run = await preparedRun();
    try {
      const confirmationMessage = '确认按预览应用';
      await writeJson(path.join(
        run.directory, 'transactions/semantic-answer-preview-appends', `${run.prepared.preview_id}.json`
      ), confirmedReceipt(run, confirmationMessage));
      if (crashPoint !== 'after_receipt') {
        await writeJson(path.join(run.directory, 'staging/source-pack.json'), run.candidate);
      }
      if (crashPoint === 'after_accepted') {
        const accepted = await advanceStrict(run.directory);
        assert.equal(accepted.status, 'need_user_answers', JSON.stringify(accepted));
      }

      const recovered = await commitSemanticAnswerBatchV4(run.directory, {
        preview_id: run.prepared.preview_id,
        confirmation_message: confirmationMessage,
        decision: 'apply'
      });
      assert.equal(recovered.status, 'need_user_answers', JSON.stringify(recovered));
      assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000', 'r001']);
      const source = JSON.parse(await readFile(path.join(run.directory, 'accepted/r001/source-pack.json'), 'utf8'));
      assert.equal(source.clarification_events.filter(
        (event) => event.event_id === run.stored.event_ids[0]
      ).length, 1);
      assert.equal(source.decision_records.length, 1);
      const receipt = JSON.parse(await readFile(path.join(
        run.directory, 'transactions/semantic-answer-preview-appends', `${run.prepared.preview_id}.json`
      ), 'utf8'));
      assert.equal(receipt.state, 'applied');
      assert.match(receipt.runner_reply_digest, /^sha256:[0-9a-f]{64}$/u);
      const pointer = JSON.parse(await readFile(path.join(
        run.directory, 'derived/semantic-answer-previews/active.json'
      ), 'utf8'));
      assert.equal(pointer.state, 'applied');
      assert.equal(await exists(path.join(
        run.directory, 'transactions/semantic-answer-previews', `${run.prepared.preview_id}-confirmed.json`
      )), true);
      assert.equal(await exists(path.join(
        run.directory, 'transactions/semantic-answer-previews', `${run.prepared.preview_id}-applied.json`
      )), true);
      assert.equal(run.stored.prepared_request.user_message, run.userMessage);
      assert.equal(receipt.confirmation_message, confirmationMessage);
      assert.notEqual(receipt.confirmation_message, run.stored.prepared_request.user_message);
    } finally {
      await rm(run.catalog, { recursive: true, force: true });
    }
  });
}

test('T03 AT18 legal-shape preview tampering is rejected by semantic digest bindings', async () => {
  const run = await preparedRun();
  try {
    const target = path.join(
      run.directory, 'derived/semantic-answer-previews/by-id', `${run.prepared.preview_id}.json`
    );
    const tampered = structuredClone(run.stored);
    tampered.prepared_request.user_message = `被篡改：${run.userMessage}`;
    const preimage = structuredClone(tampered);
    delete preimage.content_digest;
    tampered.content_digest = `sha256:${digest(preimage)}`;
    await writeJson(target, tampered);
    const rejected = await commitSemanticAnswerBatchV4(run.directory, {
      preview_id: run.prepared.preview_id,
      confirmation_message: '确认按预览应用',
      decision: 'apply'
    });
    assert.equal(rejected.incomplete_reason.code, 'PREVIEW_INTEGRITY_ERROR');
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T06 AT37 recovery rejects a schema-valid conflicting compiler audit entry', async () => {
  const run = await preparedRun();
  try {
    const confirmationMessage = '确认按预览应用';
    await writeJson(path.join(
      run.directory, 'transactions/semantic-answer-preview-appends', `${run.prepared.preview_id}.json`
    ), confirmedReceipt(run, confirmationMessage));
    await writeJson(path.join(run.directory, 'staging/source-pack.json'), run.candidate);
    const accepted = await advanceStrict(run.directory);
    assert.equal(accepted.status, 'need_user_answers', JSON.stringify(accepted));

    const conflictingMessage = '伪造的确认记录';
    await writeJson(path.join(
      run.directory, 'transactions/semantic-answer-previews', `${run.prepared.preview_id}-confirmed.json`
    ), {
      contract_version: 'semantic-answer-preview/v1', event: 'confirmed',
      preview_id: run.prepared.preview_id, preview_digest: run.prepared.preview_digest,
      base_revision: run.prepared.run_binding.accepted_revision,
      related_preview_id: null, confirmation_message: conflictingMessage,
      confirmation_message_digest: sourceByteDigest(new TextEncoder().encode(conflictingMessage)),
      runner_reply_digest: null
    });
    const rejected = await commitSemanticAnswerBatchV4(run.directory, {
      preview_id: run.prepared.preview_id,
      confirmation_message: confirmationMessage,
      decision: 'apply'
    });
    assert.equal(rejected.incomplete_reason.code, 'PREVIEW_INTEGRITY_ERROR');
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});
