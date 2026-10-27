import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { constructV4Action } from '../../src/agent-action-adapter-v4.mjs';
import { stageV4SourceAcquisitionAction } from '../../src/source-acquisition-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { reliabilityFixture, stageCollection } from '../helpers/v4-reliability-fixture.mjs';
import { run, stage, sourceAppend, startImageBaseline, answerCandidates } from '../helpers/v4-material-recovery-fixture.mjs';

/** @param {any} reply @param {any} part @param {string} answer */
function answerEvent(reply, part, answer) {
  return constructV4Action(reply, { action: 'answer_question_part', question_part_id: part.question_part_id,
    answer, user_message: `测试 fixture 模拟业务确认：${answer}`, resolution: 'final', origin_type: 'authorized_confirmation' });
}

test('T04/T06 full synthetic runner only completes reopening rule and preserves both known rules', async (/** @type {any} */ t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtc-form-known-rules-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const runId = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const fixture = reliabilityFixture(runId, { form: true });
  await ensureV4RunInstance(dir, { run_id: runId, delivery_intent: 'case_document', contract: latestV4Contract() });
  await stageCollection(dir, await run(dir), fixture.artifacts.source_pack);
  await stage(dir, 'source_pack', fixture.artifacts.source_pack); assert.equal((await run(dir)).stage, 'evidence_claims');
  await stage(dir, 'evidence_claims', fixture.artifacts.evidence_claims);
  const question = await run(dir); assert.equal(question.status, 'need_user_answers', JSON.stringify(question));
  assert.equal(question.semantic_presentation.question_parts.length, 1);
  const beforeSource = await readFile(path.join(dir, 'accepted/r000/source-pack.json'), 'utf8');
  const beforeEvidence = await readFile(path.join(dir, 'accepted/r000/evidence-claims.json'), 'utf8');
  const source = JSON.parse(beforeSource); const evidence = JSON.parse(beforeEvidence);
  const event = answerEvent(question, question.semantic_presentation.question_parts[0], '重新打开后清空未提交内容');
  await stage(dir, 'source_pack', sourceAppend(source, [event]));
  const advanced = await run(dir); assert.equal(advanced.stage, 'behavior_views', JSON.stringify(advanced));
  const after = JSON.parse(await readFile(path.join(dir, 'accepted/r001/evidence-claims.json'), 'utf8'));
  for (const [factId, claimId] of [['f200', 'c200'], ['f210', 'c210']]) {
    assert.deepEqual(after.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === factId),
      evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === factId));
    assert.deepEqual(after.claims.find((/** @type {any} */ claim) => claim.claim_id === claimId),
      evidence.claims.find((/** @type {any} */ claim) => claim.claim_id === claimId));
  }
  assert.equal(after.claims.filter((/** @type {any} */ claim) => claim.superseded_by).length, 1);
  assert.equal(after.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === 'f205').status, 'active');
  assert.equal(await readFile(path.join(dir, 'accepted/r000/source-pack.json'), 'utf8'), beforeSource);
  assert.equal(await readFile(path.join(dir, 'accepted/r000/evidence-claims.json'), 'utf8'), beforeEvidence);
});

test('T07 legacy presentation mixed valid/active target answer batch is rejected before material writes', async (/** @type {any} */ t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtc-legacy-target-batch-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = JSON.parse(gunzipSync(await readFile(new URL('../fixtures/v4/clarification-active-target-legacy.json.gz', import.meta.url))).toString());
  assert.equal(fixture.base_commit, '02eb8d92c4f0894353f55047d78ac15465bed430');
  for (const file of fixture.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split('/').includes('..'));
    await mkdir(path.dirname(path.join(dir, file.path)), { recursive: true });
    await writeFile(path.join(dir, file.path), file.text);
  }
  const replay = await run(dir); assert.equal(replay.status, 'need_revision', JSON.stringify(replay));
  assert.equal(replay.incomplete_reason.code, 'CLARIFICATION_TARGET_FACT_NOT_AMBIGUOUS');
  assert.match(replay.diagnostics[0].message, /FACT-ip.*active/u);
  const before = await readFile(path.join(dir, 'derived/source-acquisition.json'), 'utf8');
  const source = JSON.parse(await readFile(path.join(dir, 'accepted/r000/source-pack.json'), 'utf8'));
  const question = fixture.presentation;
  const events = [
    answerEvent(question, question.semantic_presentation.question_parts.find((/** @type {any} */ part) => /排序/u.test(part.question)), '升序'),
    answerEvent(question, question.semantic_presentation.question_parts.find((/** @type {any} */ part) => /IP/u.test(part.question)), '评价地点信息')
  ];
  for (const batch of [events, [...events].reverse()]) {
    await stage(dir, 'source_pack', sourceAppend(source, batch));
    const reply = await run(dir); assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.incomplete_reason.code, 'CLARIFICATION_TARGET_FACT_NOT_AMBIGUOUS');
    assert.equal(await readFile(path.join(dir, 'derived/source-acquisition.json'), 'utf8'), before);
    for (const file of fixture.files) assert.equal(await readFile(path.join(dir, file.path), 'utf8'), file.text);
    await assert.rejects(readFile(path.join(dir, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
  }
});

test('T15 new final answer to a temporary critical root is rejected before material mutation; exact replay remains legal', async (/** @type {any} */ t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtc-temporary-target-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const baseline = await startImageBaseline(dir);
  const { valid } = await answerCandidates(dir, baseline);
  await stage(dir, 'source_pack', valid);
  const stop = await run(dir); assert.equal(stop.status, 'need_artifact', JSON.stringify(stop));
  await stageV4SourceAcquisitionAction(dir, stop, valid, [{ artifact_request_id: stop.artifact_requests[0].artifact_request_id,
    input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-temporary-answer', media_type: 'image/png',
      byte_length: baseline.assetBytes.length, content_digest: sourceByteDigest(baseline.assetBytes) }, material: baseline.assetBytes }]);
  const question = await run(dir); assert.equal(question.status, 'need_user_answers', JSON.stringify(question));
  const historyFiles = ['accepted/r000/source-pack.json', 'accepted/r000/evidence-claims.json',
    'accepted/r001/source-pack.json', 'accepted/r001/evidence-claims.json', 'checkpoint.json', 'derived/source-acquisition.json'];
  const history = await Promise.all(historyFiles.map(file => readFile(path.join(dir, file), 'utf8')));
  const accepted = JSON.parse(history[2]);
  await stage(dir, 'source_pack', accepted);
  assert.deepEqual(await run(dir), question, 'the accepted temporary answer still replays');
  const part = question.semantic_presentation.question_parts.find((/** @type {any} */ item) => /IP/u.test(item.question));
  const event = answerEvent(question, part, '发布者提交评价时的 IP 归属地');
  await stage(dir, 'source_pack', sourceAppend(accepted, [event]));
  const rejected = await run(dir);
  assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
  assert.equal(rejected.incomplete_reason.code, 'CLARIFICATION_TARGET_FACT_NOT_AMBIGUOUS');
  assert.match(rejected.diagnostics[0].message, /FACT-ip.*active/u);
  for (const [index, file] of historyFiles.entries()) assert.equal(await readFile(path.join(dir, file), 'utf8'), history[index]);
  await assert.rejects(readFile(path.join(dir, 'accepted/r002/source-pack.json')), { code: 'ENOENT' });
});
