import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const recoveryRoot = path.join(repositoryRoot, 'test/fixtures/recovery');
const crashFixtureNames = [
  'staging-before-promotion', 'accepted-before-checkpoint', 'obligations-before-checkpoint',
  'case-drafts-before-bundle', 'bundle-before-finished-checkpoint',
  'finished-checkpoint-before-current', 'truncated-checkpoint', 'old-current-pointer',
  'r000-finished-r001-source', 'r001-partially-accepted', 'r000-finished-r001-reopen'
];

/** @param {string} name @returns {Promise<any>} */
async function jsonFixture(name) {
  return JSON.parse(await readFile(path.join(recoveryRoot, `${name}.json`), 'utf8'));
}

/** @returns {Promise<any>} */
async function revisionFixture() {
  return jsonFixture('grounded-revision');
}

async function temporaryRun() {
  return mkdtemp(path.join(os.tmpdir(), 'checkpoint-recovery-'));
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stageName @param {any} artifact */
async function stage(runDirectory, stageName, artifact) {
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(
    path.join(runDirectory, 'staging', STAGE_FILES[stageName]),
    `${JSON.stringify(artifact)}\n`, 'utf8'
  );
}

/** @param {string} runDirectory @param {any} revision @returns {Promise<any>} */
async function finish(runDirectory, revision) {
  /** @type {Array<keyof typeof STAGE_FILES>} */
  const stages = ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'];
  for (const stageName of stages) {
    await stage(runDirectory, stageName, revision[stageName]);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    if (stageName !== 'case_drafts') assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    else assert.equal(reply.status, 'finished', JSON.stringify(reply));
  }
  return /** @type {Promise<any>} */ (advanceStrict(runDirectory));
}

/** @param {any} revision @param {string} [kind] @returns {any} */
function revisionOneSource(revision, kind = 'decision') {
  const next = structuredClone(revision.source_pack);
  next.source_revision = 1;
  if (kind === 'reopen') next.clarification_events.push({
    event_id: 'event_reopen', clarification_event_seq: 1, type: 'reopen_root_issues',
    actor: 'owner', event_at: '2026-08-30', root_issue_ids: ['root_historical']
  });
  else next.decision_records.push({
    decision_id: 'decision_followup', question_id: 'question_followup',
    root_issue_ids: ['root_followup'], affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: 'Keep the accepted behavior?', answer: 'unknown', disposition: 'unknown',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_checkout',
    evidence_level: 'E1'
  });
  return next;
}

/** @param {string} target */
async function removeIfPresent(target) {
  await rm(target, { force: true });
}

test('all declared Task12 crash fixtures exist and cover at least ten independent recovery boundaries', async () => {
  assert.ok(crashFixtureNames.length >= 10);
  const fixtures = await Promise.all(crashFixtureNames.map(jsonFixture));
  assert.equal(new Set(fixtures.map((item) => item.state)).size, crashFixtureNames.length - 1);
  assert.ok(fixtures.some((item) => item.state === 'new_reopen_source'));
});

test('an accepted artifact that no longer passes its deterministic gate is a run integrity error', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  try {
    await finish(runDirectory, revision);
    revision.case_drafts.cases[0].steps[0].expectations[0].evidence_ref = 'claim_missing';
    await writeFile(
      path.join(runDirectory, 'accepted/r000/case-drafts.json'),
      `${JSON.stringify(revision.case_drafts)}\n`, 'utf8'
    );
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal');
    assert.equal(reply.diagnostics[0].code, 'RUN_INTEGRITY_ERROR');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

for (const fixtureName of crashFixtureNames) {
  test(`recovery fixture ${fixtureName} selects accepted state deterministically`, async () => {
    const descriptor = await jsonFixture(fixtureName);
    const revision = await revisionFixture();
    const runDirectory = await temporaryRun();
    try {
      let baselineDigest = '';
      if (descriptor.state === 'staging_source') {
        await stage(runDirectory, 'source_pack', revision.source_pack);
      } else {
        const baseline = await finish(runDirectory, revision);
        baselineDigest = baseline.bundle_digest;
        if (descriptor.state === 'accepted_complete' || descriptor.state === 'bundle_without_finished_checkpoint'
          || descriptor.state === 'derived_then_staged_case') {
          await removeIfPresent(path.join(runDirectory, 'checkpoint.json'));
          await removeIfPresent(path.join(runDirectory, 'output/current.json'));
        }
        if (descriptor.state === 'accepted_complete') {
          await rm(path.join(runDirectory, 'output/r000'), { recursive: true, force: true });
        } else if (descriptor.state === 'derived_then_staged_case') {
          await removeIfPresent(path.join(runDirectory, 'accepted/r000/case-drafts.json'));
          await rm(path.join(runDirectory, 'output/r000'), { recursive: true, force: true });
          await stage(runDirectory, 'case_drafts', revision.case_drafts);
        } else if (descriptor.state === 'finished_without_current') {
          await removeIfPresent(path.join(runDirectory, 'output/current.json'));
        } else if (descriptor.state === 'truncated_checkpoint') {
          await writeFile(path.join(runDirectory, 'checkpoint.json'), '{"source_revision":', 'utf8');
        } else if (descriptor.state === 'old_current') {
          await writeFile(path.join(runDirectory, 'output/current.json'), `${JSON.stringify({
            source_revision: 999,
            bundle_path: path.join(runDirectory, 'output/r999/test-bundle.json'),
            bundle_digest: 'f'.repeat(64),
            markdown_path: path.join(runDirectory, 'output/r999/test-cases.md')
          })}\n`, 'utf8');
        } else if (descriptor.state.startsWith('new_')) {
          const nextSource = revisionOneSource(
            revision, descriptor.state === 'new_reopen_source' ? 'reopen' : 'decision'
          );
          await stage(
            runDirectory, 'source_pack', nextSource
          );
          if (descriptor.state === 'new_partial') {
            const sourceReply = /** @type {any} */ (await advanceStrict(runDirectory));
            assert.equal(sourceReply.stage, 'evidence_claims');
            const nextEvidence = structuredClone(revision.evidence_claims);
            nextEvidence.source_revision = 1;
            await stage(runDirectory, 'evidence_claims', nextEvidence);
            const evidenceReply = /** @type {any} */ (await advanceStrict(runDirectory));
            assert.equal(evidenceReply.stage, 'behavior_views');
          }
        }
      }

      const recovered = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(recovered.status, descriptor.expected_status, JSON.stringify(recovered));
      if (recovered.status === 'finished') {
        assert.equal(recovered.bundle_digest, baselineDigest);
        assert.equal(recovered.source_revision, 0);
        const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
        assert.equal(current.bundle_digest, baselineDigest);
        assert.equal(current.source_revision, 0);
      } else if (descriptor.state.startsWith('new_')) {
        assert.equal(recovered.scope.source_revision, 1);
        assert.notEqual(recovered.status, 'finished', 'old finished output must not mask a newer accepted revision');
      }
      const entries = await readdir(runDirectory);
      assert.ok(entries.every((/** @type {string} */ name) => !name.includes('.tmp-')), 'atomic recovery must not expose temp files');
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  });
}
