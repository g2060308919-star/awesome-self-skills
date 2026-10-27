import { constructV4Action } from '../../src/agent-action-adapter-v4.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { acquisitionBaseLocationV4, currentAcquisitionContextV4, readAcquisitionSnapshotV4,
  readAcceptedAcquisitionV4 } from '../../src/source-acquisition-context-v4.mjs';
import { stageV4SourceAcquisitionAction } from '../../src/source-acquisition-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { run, stage, startImageBaseline, answerCandidates, evidenceRepairCandidate, sourceAppend } from '../helpers/v4-material-recovery-fixture.mjs';

/** @param {string} dir @param {string} file */
const json = async (dir, file) => JSON.parse(await readFile(path.join(dir, file), 'utf8'));
/** @param {string} dir @param {any} stop @param {any} source @param {Uint8Array} bytes */
async function supply(dir, stop, source, bytes) {
  await stageV4SourceAcquisitionAction(dir, stop, source, [{ artifact_request_id: stop.artifact_requests[0].artifact_request_id,
    input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-recovery-candidate', media_type: 'image/png',
      byte_length: bytes.length, content_digest: sourceByteDigest(bytes) }, material: bytes }]);
}
/** @param {any} t */
async function setup(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtc-ownership-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const baseline = await startImageBaseline(dir);
  const candidates = await answerCandidates(dir, baseline);
  const history = { source: await readFile(path.join(dir, 'accepted/r000/source-pack.json'), 'utf8'),
    evidence: await readFile(path.join(dir, 'accepted/r000/evidence-claims.json'), 'utf8'),
    checkpoint: await readFile(path.join(dir, 'derived/r000/checkpoint.json'), 'utf8') };
  return { dir, baseline, candidates, history };
}
/** @param {any} scene */
async function assertHistory(scene) {
  for (const [name, file] of Object.entries({ source: 'accepted/r000/source-pack.json',
    evidence: 'accepted/r000/evidence-claims.json', checkpoint: 'derived/r000/checkpoint.json' })) {
    assert.equal(await readFile(path.join(scene.dir, file), 'utf8'), scene.history[name]);
  }
}
/** @param {any} scene @param {number} [revision] */
async function repair(scene, revision = 0) {
  const prefix = `accepted/r${String(revision).padStart(3,'0')}`;
  const source = await json(scene.dir, prefix + '/source-pack.json');
  const evidence = await json(scene.dir, prefix + '/evidence-claims.json');
  const next = evidenceRepairCandidate(source, evidence);
  await stage(scene.dir, 'source_pack', next.source); await stage(scene.dir, 'evidence_claims', next.evidence);
  const reply = await run(scene.dir);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  const accepted = await json(scene.dir, `accepted/r${String(revision+1).padStart(3,'0')}/source-pack.json`);
  assert.deepEqual(accepted.clarification_events, source.clarification_events);
  assert.deepEqual(accepted.artifact_events, source.artifact_events);
  assert.deepEqual(accepted.decision_records, source.decision_records);
  assert.deepEqual(await run(scene.dir), reply);
  await assertHistory(scene);
  return reply;
}
/** @param {any} scene */
async function rejectAcquired(scene) {
  await stage(scene.dir, 'source_pack', scene.candidates.invalid);
  const stop = await run(scene.dir); assert.equal(stop.status, 'need_artifact', JSON.stringify(stop));
  assert.deepEqual(await run(scene.dir), stop, 'same pending request replays without a new event');
  await supply(scene.dir, stop, scene.candidates.invalid, scene.baseline.assetBytes);
  const reply = await run(scene.dir);
  assert.equal(reply.incomplete_reason?.code, 'V4_DECISION_MESSAGE_PROVENANCE_INVALID', JSON.stringify(reply));
  const context = await currentAcquisitionContextV4(scene.dir);
  const state = await readAcquisitionSnapshotV4(scene.dir, context.state_ref);
  assert.equal(context.phase, 'rejected'); assert.equal(state.status, 'acquired');
  assert.equal(state.committed_revision, 1); assert.equal((await json(scene.dir, 'checkpoint.json')).revision, 0);
  assert.equal((await json(scene.dir, 'derived/source-acquisition.json')).committed_revision, 0);
  return { context, state };
}

test('T10 same pending/acquired/committed candidate retry owns one event batch and one Decision', async (/** @type {any} */ t) => {
  const scene = await setup(t); const { state } = await rejectAcquired(scene);
  const candidate = scene.candidates.valid; candidate.artifact_events = structuredClone(state.events);
  await stage(scene.dir, 'source_pack', candidate);
  const reply = await run(scene.dir); assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  const accepted = await json(scene.dir, 'accepted/r001/source-pack.json');
  assert.equal(accepted.decision_records.length, 1);
  assert.equal(new Set(accepted.artifact_events.map((/** @type {any} */ event) => event.event_id)).size, state.events.length);
  await stage(scene.dir, 'source_pack', candidate);
  assert.deepEqual(await run(scene.dir), reply);
  await assert.rejects(readFile(path.join(scene.dir, 'accepted/r002/source-pack.json')), { code: 'ENOENT' });
  await assertHistory(scene);
});

for (const fault of ['none', 'missing_base', 'missing_receipt', 'tampered_base', 'cross_run', 'ambiguous_history']) {
  test(`T12-T14 legacy contaminated acquisition ${fault}`, async (/** @type {any} */ t) => {
    const scene = await setup(t); const { state } = await rejectAcquired(scene);
    const baseline = (await readAcceptedAcquisitionV4(scene.dir, 0)).state;
    for (const old of [baseline, state]) {
      await writeFile(path.join(scene.dir, `derived/source-acquisition-base-r${String(old.committed_revision).padStart(3,'0')}.json`),
        await readFile(acquisitionBaseLocationV4(scene.dir, old)));
    }
    // Legacy fixture: only remove the newly introduced private coordination
    // format; all source events, real byte receipts and original journals remain.
    await rm(path.join(scene.dir, 'transactions/source-acquisition'), { recursive: true });
    const legacy = structuredClone(state); delete legacy.candidate_context_id; delete legacy.state_digest;
    if (fault === 'missing_receipt') legacy.acquisitions.pop();
    if (fault === 'cross_run') legacy.run_id = 'RUN-11111111-1111-4111-8111-111111111111';
    if (fault === 'ambiguous_history') legacy.request_history.unshift(structuredClone(legacy.request_history[0]));
    legacy.state_digest = `sha256:${digest(legacy)}`;
    await writeFile(path.join(scene.dir, 'derived/source-acquisition.json'), canonicalStringify(legacy) + '\n');
    if (fault === 'missing_base') await rm(path.join(scene.dir, 'derived/source-acquisition-base-r000.json'));
    if (fault === 'tampered_base') {
      const base = await json(scene.dir, 'derived/source-acquisition-base-r000.json'); base.run_scope = 'foreign scope';
      await writeFile(path.join(scene.dir, 'derived/source-acquisition-base-r000.json'), canonicalStringify(base) + '\n');
    }
    const before = await readFile(path.join(scene.dir, 'derived/source-acquisition.json'), 'utf8');
    if (fault === 'none') {
      await repair(scene);
      assert.equal((await readAcceptedAcquisitionV4(scene.dir, 1)).state.committed_revision, 0,
        'verified older material remains valid after a later semantic revision');
      assert.equal(await readFile(path.join(scene.dir, 'derived/source-acquisition-base-r001.json'), 'utf8'),
        canonicalStringify(await json(scene.dir, 'derived/source-acquisition-base-r001.json')) + '\n');
    } else {
      const next = evidenceRepairCandidate(JSON.parse(scene.history.source), JSON.parse(scene.history.evidence));
      await stage(scene.dir, 'source_pack', next.source); await stage(scene.dir, 'evidence_claims', next.evidence);
      const reply = await run(scene.dir);
      assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
      assert.match(JSON.stringify(reply), /SOURCE_ACQUISITION_|ARTIFACT_REQUEST_STALE/);
      assert.equal(await readFile(path.join(scene.dir, 'derived/source-acquisition.json'), 'utf8'), before);
      await assert.rejects(readFile(path.join(scene.dir, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
      await assertHistory(scene);
    }
  });
}

for (const phase of ['base_saved', 'material_saved', 'semantic_rejected', 'artifacts_committed', 'checkpoint_committed', 'projection_synced']) {
  test(`T17/T19 actual process interruption after ${phase} preserves ownership and progresses`, async (/** @type {any} */ t) => {
    const scene = await setup(t);
    const commits = ['artifacts_committed', 'checkpoint_committed', 'projection_synced'].includes(phase);
    const source = commits ? scene.candidates.valid : scene.candidates.invalid;
    const crashLog = path.join(scene.dir, 'crash-observed.json');
    await stage(scene.dir, 'source_pack', source);
    let stop;
    if (phase === 'base_saved') {
      await run(scene.dir, { crash: phase, crashLog });
      const observed = await json(scene.dir, 'crash-observed.json');
      assert.equal(observed.value.phase, 'prepared'); assert.ok(observed.value.base_state_ref);
      assert.equal((await json(scene.dir, 'derived/source-acquisition.json')).committed_revision, 0);
      stop = await run(scene.dir);
    } else stop = await run(scene.dir);
    assert.equal(stop.status, 'need_artifact', JSON.stringify(stop));
    await supply(scene.dir, stop, source, scene.baseline.assetBytes);
    if (phase === 'base_saved') await run(scene.dir);
    else await run(scene.dir, { crash: phase, crashLog });
    const observed = await json(scene.dir, 'crash-observed.json');
    assert.equal(observed.phase, phase);
    if (phase === 'material_saved') assert.equal(observed.value.status, 'acquired');
    if (phase === 'semantic_rejected') {
      assert.equal(observed.value.phase, 'rejected');
      assert.equal((await json(scene.dir, 'derived/source-acquisition.json')).committed_revision, 1);
    }
    if (commits) {
      if (phase === 'artifacts_committed') assert.equal((await json(scene.dir, 'staging/pending-revision.json')).phase, 'artifacts_committed');
      if (phase === 'checkpoint_committed') assert.equal((await json(scene.dir, 'checkpoint.json')).revision, 1);
      // A different candidate cannot roll back the fully materialized original transaction.
      const staleRepair = evidenceRepairCandidate(JSON.parse(scene.history.source), JSON.parse(scene.history.evidence));
      await stage(scene.dir, 'source_pack', staleRepair.source); await stage(scene.dir, 'evidence_claims', staleRepair.evidence);
      await run(scene.dir);
      const accepted = await json(scene.dir, 'accepted/r001/source-pack.json');
      assert.equal(accepted.decision_records.length, 1);
      assert.deepEqual(accepted.clarification_events, scene.candidates.valid.clarification_events);
      assert.equal((await json(scene.dir, 'checkpoint.json')).revision, 1);
      assert.equal((await currentAcquisitionContextV4(scene.dir)).phase, 'accepted');
      await assert.rejects(readFile(path.join(scene.dir, 'staging/pending-revision.json')), { code: 'ENOENT' });
      await repair(scene, 1);
    } else {
      assert.equal((await json(scene.dir, 'checkpoint.json')).revision, 0);
      await repair(scene);
    }
    await assertHistory(scene);
  });
}

test('T11 different answer candidates at the same revision have isolated bases and immutable legacy audit', async (/** @type {any} */ t) => {
  const scene = await setup(t); const first = await rejectAcquired(scene);
  const firstBase = await readFile(acquisitionBaseLocationV4(scene.dir, first.state), 'utf8');
  const legacyPath = path.join(scene.dir, 'derived/source-acquisition-base-r001.json');
  await writeFile(legacyPath, firstBase);
  const next = await answerCandidates(scene.dir, scene.baseline, '评价地点信息');
  await stage(scene.dir, 'source_pack', next.valid);
  const stop = await run(scene.dir); assert.equal(stop.status, 'need_artifact', JSON.stringify(stop));
  await supply(scene.dir, stop, next.valid, scene.baseline.assetBytes);
  const reply = await run(scene.dir); assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  const second = await currentAcquisitionContextV4(scene.dir);
  assert.notEqual(second.candidate_id, first.context.candidate_id);
  assert.equal(second.candidate_revision, first.context.candidate_revision);
  const accepted = await json(scene.dir, 'accepted/r001/source-pack.json');
  assert.equal(accepted.decision_records.length, 1); assert.equal(accepted.decision_records[0].answer, '评价地点信息');
  assert.equal(await readFile(legacyPath, 'utf8'), firstBase);
  assert.equal(await readFile(acquisitionBaseLocationV4(scene.dir, first.state), 'utf8'), firstBase);
  await assertHistory(scene);
});

test('T18 first acquisition without an accepted baseline resumes after an actual process interruption', async (/** @type {any} */ t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtc-first-acquisition-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const baseline = await startImageBaseline(dir, { initialCrash: true });
  const observed = await json(dir, 'crash-observed.json');
  assert.equal(observed.value.status, 'acquired'); assert.equal(observed.value.committed_revision, 0);
  const context = await currentAcquisitionContextV4(dir);
  assert.equal(context.base_binding, null); assert.equal(context.phase, 'accepted');
  assert.equal((await json(dir, 'checkpoint.json')).revision, 0);
  assert.equal((await json(dir, 'accepted/r000/source-pack.json')).decision_records.length, 0);
  assert.deepEqual(await run(dir), baseline.question);
});

test('T16 changed root version never rebinds an unaccepted historical answer', async (/** @type {any} */ t) => {
  const scene = await setup(t);
  const beforeSource = JSON.parse(scene.history.source); const beforeEvidence = JSON.parse(scene.history.evidence);
  const changed = evidenceRepairCandidate(beforeSource, beforeEvidence);
  changed.evidence.semantic_gaps.find((/** @type {any} */ gap) => gap.code === 'IP_MEANING_UNRESOLVED').question += '（仅针对新建入口）';
  await stage(scene.dir, 'source_pack', changed.source); await stage(scene.dir, 'evidence_claims', changed.evidence);
  const currentQuestion = await run(scene.dir); assert.equal(currentQuestion.status, 'need_user_answers', JSON.stringify(currentQuestion));
  const oldPart = scene.baseline.question.semantic_presentation.question_parts.find((/** @type {any} */ part) => /IP/u.test(part.question));
  const answer = '评价地点信息';
  const event = constructV4Action(scene.baseline.question, { action: 'answer_question_part',
    question_part_id: oldPart.question_part_id, answer, user_message: `测试 fixture 模拟业务确认：${answer}`,
    resolution: 'final', origin_type: 'authorized_confirmation' });
  const prior = await json(scene.dir, 'accepted/r001/source-pack.json');
  const stale = sourceAppend(prior, [event]);
  await stage(scene.dir, 'source_pack', stale);
  const stop = await run(scene.dir); assert.equal(stop.status, 'need_artifact', JSON.stringify(stop));
  await supply(scene.dir, stop, stale, scene.baseline.assetBytes);
  assert.deepEqual(await run(scene.dir), currentQuestion);
  assert.equal((await currentAcquisitionContextV4(scene.dir)).phase, 'rejected');
  assert.equal((await json(scene.dir, 'checkpoint.json')).revision, 1);
  assert.equal((await json(scene.dir, 'accepted/r001/source-pack.json')).decision_records.length, 0);
  await assert.rejects(readFile(path.join(scene.dir, 'accepted/r002/source-pack.json')), { code: 'ENOENT' });
  await repair(scene, 1);
});
