import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { advanceStrict } from '../../src/advance-strict.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(
  repositoryRoot, 'test/fixtures/recovery/grounded-revision.json'
);

async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

/** @param {string} runDirectory @param {any} sourcePack */
async function stageSource(runDirectory, sourcePack) {
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(
    path.join(runDirectory, 'staging/source-pack.json'),
    `${JSON.stringify(sourcePack)}\n`, 'utf8'
  );
}

function decision() {
  return {
    decision_id: 'decision_scope_change', question_id: 'question_scope_change',
    root_issue_ids: ['root_scope_change'],
    affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-31',
    question: 'Which scope applies?', answer: 'Use the new scope.', disposition: 'final',
    authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E3'
  };
}

test('recovery canonical absolute path containing dot-dot resumes the same durable run', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'g1d-canonical-run-'));
  const runDirectory = path.join(parent, 'persistent private task');
  const equivalentPath = path.join(runDirectory, 'unused-segment', '..');
  const revision = await fixture();
  try {
    await mkdir(runDirectory);
    const initial = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(initial.status, 'need_artifact');
    assert.equal(initial.stage, 'source_pack');

    await stageSource(runDirectory, revision.source_pack);
    const accepted = /** @type {any} */ (await advanceStrict(equivalentPath));
    assert.equal(accepted.status, 'need_artifact', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
    assert.deepEqual(accepted.scope, { source_revision: 0 });
    await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));

    const recovered = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.deepEqual(recovered, accepted, 'recovery must re-invoke before guessing a stage');
    await assert.rejects(stat(path.join(runDirectory, 'unused-segment')));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('source revision material run_scope change returns NEW_RUN_REQUIRED and preserves the old run', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-scope-change-'));
  const revision = await fixture();
  try {
    /** @type {any} */
    let initial;
    for (const [filename, artifact] of [
      ['source-pack.json', revision.source_pack],
      ['evidence-claims.json', revision.evidence_claims],
      ['behavior-views.json', revision.behavior_views],
      ['case-drafts.json', revision.case_drafts]
    ]) {
      await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
      await writeFile(
        path.join(runDirectory, 'staging', filename), `${JSON.stringify(artifact)}\n`, 'utf8'
      );
      initial = await advanceStrict(runDirectory);
    }
    assert.equal(initial.status, 'finished', JSON.stringify(initial));
    const acceptedBefore = await readFile(
      path.join(runDirectory, 'accepted/r000/source-pack.json'), 'utf8'
    );
    const currentBefore = await readFile(path.join(runDirectory, 'output/current.json'), 'utf8');
    const bundleBefore = await readFile(
      path.join(runDirectory, 'output/r000/test-bundle.json'), 'utf8'
    );

    const changed = structuredClone(revision.source_pack);
    changed.source_revision = 1;
    changed.run_scope = 'checkout/materially-changed';
    changed.decision_records.push(decision());
    await stageSource(runDirectory, changed);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.deepEqual(
      reply.diagnostics.map((/** @type {any} */ item) => item.code),
      ['RUN_INTEGRITY_ERROR', 'NEW_RUN_REQUIRED']
    );
    assert.equal(
      await readFile(path.join(runDirectory, 'accepted/r000/source-pack.json'), 'utf8'),
      acceptedBefore
    );
    assert.equal(
      await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'), currentBefore
    );
    assert.equal(
      await readFile(path.join(runDirectory, 'output/r000/test-bundle.json'), 'utf8'),
      bundleBefore
    );
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
