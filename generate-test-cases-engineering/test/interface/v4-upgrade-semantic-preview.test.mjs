// @ts-nocheck -- Contract tests intentionally exercise discriminated runtime replies and malformed inputs.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as entry from '../../src/entry.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

async function stage(directory, name, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', `${name}.json`), `${canonicalStringify(value)}\n`);
}

async function pendingRun() {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-preview-catalog-'));
  const created = await entry.createV4RunDirectory(catalog, 'case_document');
  const directory = created.run_directory;
  const fixture = await bendReviewJourneyFixture(created.run_id);
  await stage(directory, 'source-pack', fixture.artifacts.source_pack);
  assert.equal((await entry.advanceStrict(directory)).stage, 'evidence_claims');
  await stage(directory, 'evidence-claims', fixture.artifacts.evidence_claims);
  const reply = await entry.advanceStrict(directory);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  return { catalog, directory, reply };
}

function ipAnswerRequest(reply, options = {}) {
  const part = reply.semantic_presentation.question_parts.find((item) => /IP/u.test(item.question));
  assert.ok(part);
  const answer = options.answer ?? '发布者提交评价时的 IP 归属地';
  const userMessage = options.user_message ?? `答复：${answer}`;
  return {
    outer: {
      presentation_id: reply.semantic_presentation.presentation_id,
      user_message: userMessage,
      requests: [{
        action: 'answer_question_part', question_part_id: part.question_part_id,
        answer, user_message: userMessage,
        resolution: options.resolution ?? 'temporary',
        origin_type: options.origin_type ?? 'user_statement',
        ...(options.answer_start_scalar === undefined
          ? {} : { answer_start_scalar: options.answer_start_scalar })
      }]
    },
    part
  };
}

test('T01/T03 preview contract exposes the two high-level V4 Adapter operations and closed Schema', async () => {
  assert.equal(typeof entry.prepareSemanticAnswerBatchV4, 'function');
  assert.equal(typeof entry.commitSemanticAnswerBatchV4, 'function');
  await readFile(new URL(
    '../../skill/generate-test-cases/scripts/schemas/semantic-answer-preview.schema.json',
    import.meta.url
  ), 'utf8');
});

test('T03/T06 preview policy enrolls new Case Documents but excludes Execution Plans', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-preview-policy-'));
  try {
    const document = await entry.createV4RunDirectory(catalog, 'case_document');
    const execution = await entry.createV4RunDirectory(catalog, 'execution_plan');
    assert.deepEqual(JSON.parse(await readFile(path.join(
      document.run_directory, 'derived/semantic-answer-policy.json'
    ), 'utf8')), {
      contract_version: 'semantic-answer-preview/v1', schema_version: '1.0.0',
      compiler_version: '0.6.0', run_schema_version: '4.1.0',
      compatible_artifact_schema_versions: ['4.0.0'],
      run_id: document.run_id, mode: 'preview_required'
    });
    await assert.rejects(
      readFile(path.join(execution.run_directory, 'derived/semantic-answer-policy.json'), 'utf8'),
      (error) => error && error.code === 'ENOENT'
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T03 AT15/AT16 prepare persists a deterministic pre-case preview without accepted mutation', async () => {
  const run = await pendingRun();
  try {
    const beforeSource = await readFile(path.join(run.directory, 'accepted/r000/source-pack.json'), 'utf8');
    const beforeCheckpoint = await readFile(path.join(run.directory, 'checkpoint.json'), 'utf8');
    const request = ipAnswerRequest(run.reply).outer;
    const first = await entry.prepareSemanticAnswerBatchV4(run.directory, request);
    const second = await entry.prepareSemanticAnswerBatchV4(run.directory, request);
    assert.equal(first.kind, 'prepared', JSON.stringify(first));
    assert.deepEqual(second, first);
    assert.equal(first.value.targets[0].evidence_level, 'E1');
    assert.equal(first.value.targets[0].resolution, 'temporary');
    assert.equal(first.value.retained_items.pending_part_ids.length, 2);
    assert.equal(await readFile(path.join(run.directory, 'accepted/r000/source-pack.json'), 'utf8'), beforeSource);
    assert.equal(await readFile(path.join(run.directory, 'checkpoint.json'), 'utf8'), beforeCheckpoint);
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT06/AT09 reordered batch is identity-stable and omitted parts remain pending', async () => {
  const run = await pendingRun();
  try {
    const [firstPart, secondPart] = run.reply.semantic_presentation.question_parts;
    const answer = '回答第一项';
    const message = `1：${answer}；2：暂缓`;
    const answerStart = Array.from('1：').length;
    const answerRequest = {
      action: 'answer_question_part', question_part_id: firstPart.question_part_id,
      answer, user_message: message, resolution: 'temporary', origin_type: 'user_statement',
      answer_start_scalar: answerStart
    };
    const deferRequest = {
      action: 'defer_question_part', question_part_id: secondPart.question_part_id
    };
    const base = {
      presentation_id: run.reply.semantic_presentation.presentation_id,
      user_message: message
    };
    const ordered = await entry.prepareSemanticAnswerBatchV4(run.directory, {
      ...base, requests: [answerRequest, deferRequest]
    });
    const reversed = await entry.prepareSemanticAnswerBatchV4(run.directory, {
      ...base, requests: [deferRequest, answerRequest]
    });
    assert.equal(ordered.kind, 'prepared', JSON.stringify(ordered));
    assert.deepEqual(reversed, ordered);
    assert.equal(ordered.value.retained_items.pending_part_ids.length, 1);
    assert.deepEqual(ordered.value.retained_items.deferred_part_ids, [secondPart.question_part_id]);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT07/AT08 ambiguous repeated text is rejected until an exact Unicode-scalar span is supplied', async () => {
  const run = await pendingRun();
  try {
    const message = '😀可以；第二项也可以';
    const ambiguous = ipAnswerRequest(run.reply, { answer: '可以', user_message: message }).outer;
    const rejected = await entry.prepareSemanticAnswerBatchV4(run.directory, ambiguous);
    assert.equal(rejected.kind, 'not_prepared');
    assert.equal(rejected.runner_reply.incomplete_reason.code, 'PREVIEW_INPUT_INVALID');
    const exact = ipAnswerRequest(run.reply, {
      answer: '可以', user_message: message, answer_start_scalar: 1
    }).outer;
    const prepared = await entry.prepareSemanticAnswerBatchV4(run.directory, exact);
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    assert.deepEqual(prepared.value.targets[0].answer_span, {
      start_scalar: 1, end_scalar: 3,
      excerpt_digest: prepared.value.targets[0].answer_span.excerpt_digest
    });
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT14 normal apply confirmation cannot upgrade an ordinary requested-final answer', async () => {
  const run = await pendingRun();
  try {
    const prepared = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply, { resolution: 'final' }).outer
    );
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    assert.equal(prepared.value.targets[0].resolution, 'temporary');
    assert.equal(prepared.value.targets[0].evidence_level, 'E1');
    const result = await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认按预览应用',
      decision: 'apply'
    });
    assert.equal(result.status, 'need_user_answers', JSON.stringify(result));
    const accepted = JSON.parse(await readFile(path.join(run.directory, 'accepted/r001/source-pack.json'), 'utf8'));
    assert.equal(accepted.decision_records.length, 1);
    assert.equal(accepted.decision_records[0].resolution, 'temporary');
    assert.equal(accepted.decision_records[0].evidence_level, 'E1');
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT11 authorized final answer keeps scope-final E3 through preview and apply', async () => {
  const run = await pendingRun();
  try {
    const prepared = await entry.prepareSemanticAnswerBatchV4(run.directory, ipAnswerRequest(run.reply, {
      resolution: 'final', origin_type: 'authorized_confirmation'
    }).outer);
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    assert.equal(prepared.value.targets[0].resolution, 'final');
    assert.equal(prepared.value.targets[0].evidence_level, 'E3');
    await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认应用已明确的本次范围最终口径',
      decision: 'apply'
    });
    const accepted = JSON.parse(await readFile(path.join(run.directory, 'accepted/r001/source-pack.json'), 'utf8'));
    assert.equal(accepted.decision_records[0].resolution, 'final');
    assert.equal(accepted.decision_records[0].evidence_level, 'E3');
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT16 revise and cancel_preview leave accepted facts and revision unchanged', async () => {
  for (const decision of ['revise', 'cancel_preview']) {
    const run = await pendingRun();
    try {
      const prepared = await entry.prepareSemanticAnswerBatchV4(
        run.directory, ipAnswerRequest(run.reply).outer
      );
      assert.equal(prepared.kind, 'prepared');
      const before = await readFile(path.join(run.directory, 'checkpoint.json'), 'utf8');
      const reply = await entry.commitSemanticAnswerBatchV4(run.directory, {
        preview_id: prepared.value.preview_id,
        confirmation_message: decision === 'revise' ? '我要修改这批回答' : '放弃本次预览',
        decision
      });
      assert.equal(reply.status, 'need_user_answers');
      assert.equal(await readFile(path.join(run.directory, 'checkpoint.json'), 'utf8'), before);
      assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
    } finally {
      await rm(run.catalog, { recursive: true, force: true });
    }
  }
});

test('T03 AT16 naked answer append is rejected at the real new-run acceptance boundary', async () => {
  const run = await pendingRun();
  try {
    const prepared = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply).outer
    );
    assert.equal(prepared.kind, 'prepared');
    const candidate = JSON.parse(await readFile(path.join(
      run.directory, 'derived/semantic-answer-previews/by-id', `${prepared.value.preview_id}.source-pack.json`
    ), 'utf8'));
    await stage(run.directory, 'source-pack', candidate);
    const rejected = await entry.advanceStrict(run.directory);
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some((item) => item.code === 'PREVIEW_CONFIRMATION_REQUIRED'));
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03/AT43 a preview-required run cannot downgrade by deleting its policy marker', async () => {
  const run = await pendingRun();
  try {
    await rm(path.join(run.directory, 'derived/semantic-answer-policy.json'));
    const request = ipAnswerRequest(run.reply).outer.requests[0];
    const event = entry.constructV4Action(run.reply, request);
    const candidate = JSON.parse(await readFile(path.join(
      run.directory, 'accepted/r000/source-pack.json'
    ), 'utf8'));
    candidate.source_revision += 1;
    candidate.clarification_events.push(event);
    await stage(run.directory, 'source-pack', candidate);
    const rejected = await entry.advanceStrict(run.directory);
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some((item) => item.code === 'PREVIEW_INTEGRITY_ERROR'));
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT18 duplicate target rejects the whole batch without an accepted revision', async () => {
  const run = await pendingRun();
  try {
    const answer = ipAnswerRequest(run.reply);
    const duplicate = {
      ...answer.outer,
      requests: [
        answer.outer.requests[0],
        { action: 'defer_question_part', question_part_id: answer.part.question_part_id }
      ]
    };
    const rejected = await entry.prepareSemanticAnswerBatchV4(run.directory, duplicate);
    assert.equal(rejected.kind, 'not_prepared');
    assert.equal(rejected.runner_reply.incomplete_reason.code, 'PREVIEW_INPUT_INVALID');
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT10 explicit defer, unknown, and delivery controls remain distinct in a control-only batch', async () => {
  const run = await pendingRun();
  try {
    const [deferred, unknown, closed] = run.reply.semantic_presentation.question_parts;
    const message = '第一项暂缓；第二项不知道；第三项先按缺口交付';
    const prepared = await entry.prepareSemanticAnswerBatchV4(run.directory, {
      presentation_id: run.reply.semantic_presentation.presentation_id,
      user_message: message,
      requests: [
        { action: 'defer_question_part', question_part_id: deferred.question_part_id },
        { action: 'mark_question_unknown', question_part_id: unknown.question_part_id },
        { action: 'request_delivery', question_part_id: closed.question_part_id }
      ]
    });
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    assert.deepEqual(prepared.value.retained_items, {
      pending_part_ids: [],
      deferred_part_ids: [deferred.question_part_id],
      unknown_part_ids: [unknown.question_part_id],
      closed_for_delivery_part_ids: [closed.question_part_id]
    });
    const applied = await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: message,
      decision: 'apply'
    });
    assert.notEqual(applied.status, 'fatal', JSON.stringify(applied));
    const accepted = JSON.parse(await readFile(path.join(run.directory, 'accepted/r001/source-pack.json'), 'utf8'));
    assert.equal(accepted.decision_records.length, 0);
    assert.deepEqual(
      accepted.clarification_events.map((item) => item.event_type).sort(),
      ['defer_question_part', 'mark_question_unknown', 'request_delivery'].sort()
    );
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT16 apply requires a nonblank confirmation and superseded previews stay stale', async () => {
  const run = await pendingRun();
  try {
    const first = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply, { answer: '第一版口径' }).outer
    );
    assert.equal(first.kind, 'prepared');
    const missing = await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: first.value.preview_id,
      confirmation_message: '   ',
      decision: 'apply'
    });
    assert.equal(missing.incomplete_reason.code, 'PREVIEW_CONFIRMATION_REQUIRED');
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);

    const second = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply, { answer: '第二版口径' }).outer
    );
    assert.equal(second.kind, 'prepared');
    assert.notEqual(second.value.preview_id, first.value.preview_id);
    const stale = await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: first.value.preview_id,
      confirmation_message: '确认第一版',
      decision: 'apply'
    });
    assert.equal(stale.incomplete_reason.code, 'PREVIEW_TARGET_STALE');
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT19 exact apply replay is idempotent and changed confirmation is rejected', async () => {
  const run = await pendingRun();
  try {
    const prepared = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply).outer
    );
    assert.equal(prepared.kind, 'prepared');
    const request = {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认按该预览应用',
      decision: 'apply'
    };
    const first = await entry.commitSemanticAnswerBatchV4(run.directory, request);
    const replay = await entry.commitSemanticAnswerBatchV4(run.directory, request);
    assert.deepEqual(replay, first);
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000', 'r001']);
    const accepted = JSON.parse(await readFile(path.join(run.directory, 'accepted/r001/source-pack.json'), 'utf8'));
    assert.equal(new Set(accepted.clarification_events.map((item) => item.event_id)).size, 1);
    assert.equal(accepted.decision_records.length, 1);

    const changed = await entry.commitSemanticAnswerBatchV4(run.directory, {
      ...request, confirmation_message: '换一句确认'
    });
    assert.equal(changed.incomplete_reason.code, 'PREVIEW_CONTENT_CHANGED');
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000', 'r001']);
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});

test('T03 AT18 first apply rejects a confirmation that changes value, scope, or adopted nature', async () => {
  for (const confirmationMessage of [
    '确认，但把答案改为评价地点信息',
    '确认，同时把适用 scope 扩大到所有报表',
    '确认并把这条暂定回答改成最终口径'
  ]) {
    const run = await pendingRun();
    try {
      const prepared = await entry.prepareSemanticAnswerBatchV4(
        run.directory, ipAnswerRequest(run.reply).outer
      );
      assert.equal(prepared.kind, 'prepared');
      const rejected = await entry.commitSemanticAnswerBatchV4(run.directory, {
        preview_id: prepared.value.preview_id,
        confirmation_message: confirmationMessage,
        decision: 'apply'
      });
      assert.equal(rejected.incomplete_reason.code, 'PREVIEW_CONTENT_CHANGED');
      assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
    } finally {
      await rm(run.catalog, { recursive: true, force: true });
    }
  }
});

test('T06 AT40 cancelling a run after prepare makes the preview permanently inapplicable', async () => {
  const run = await pendingRun();
  try {
    const prepared = await entry.prepareSemanticAnswerBatchV4(
      run.directory, ipAnswerRequest(run.reply).outer
    );
    assert.equal(prepared.kind, 'prepared');
    const current = JSON.parse(await readFile(
      path.join(run.directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    const cancellation = entry.constructV4Action(run.reply, { action: 'cancel_run' });
    const candidate = structuredClone(current);
    candidate.source_revision += 1;
    candidate.clarification_events.push(cancellation);
    await stage(run.directory, 'source-pack', candidate);
    const cancelled = await entry.advanceStrict(run.directory);
    assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));

    const rejected = await entry.commitSemanticAnswerBatchV4(run.directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认应用已失效的预览',
      decision: 'apply'
    });
    assert.equal(rejected.status, 'cancelled', JSON.stringify(rejected));
    assert.deepEqual(await readdir(path.join(run.directory, 'accepted')), ['r000']);
    await assert.rejects(
      readFile(path.join(
        run.directory, 'transactions/semantic-answer-preview-appends',
        `${prepared.value.preview_id}.json`
      ), 'utf8'),
      (error) => error && error.code === 'ENOENT'
    );
  } finally {
    await rm(run.catalog, { recursive: true, force: true });
  }
});
