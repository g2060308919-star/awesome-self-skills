import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { digest } from '../../src/canonical.mjs';
import { acquireRunLock, STAGE_FILES } from '../../src/run-store.mjs';
import { buildJourney, setSourceRevision } from '../helpers/run-journey.mjs';
import { completeSourcePack } from '../helpers/source-pack.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const rename = fsPromises.rename;
const symlink = fsPromises.symlink;
const utimes = fsPromises.utimes;
const recoveryRoot = path.join(repositoryRoot, 'test/fixtures/recovery');
const crashFixtureNames = [
  'staging-before-promotion', 'accepted-before-checkpoint', 'obligations-before-checkpoint',
  'case-drafts-before-bundle', 'bundle-before-finished-checkpoint',
  'json-bundle-before-markdown',
  'finished-checkpoint-before-current', 'truncated-checkpoint', 'old-current-pointer',
  'r000-finished-r001-source', 'r001-partially-accepted', 'r000-finished-r001-reopen',
  'finished-checkpoint-bundle-missing', 'finished-checkpoint-bundle-digest-mismatch'
];

/** @type {Readonly<Record<string,string>>} */
const expectedCrashStateByFixture = Object.freeze({
  'staging-before-promotion': 'staging_source',
  'accepted-before-checkpoint': 'accepted_before_checkpoint',
  'obligations-before-checkpoint': 'obligations_before_checkpoint',
  'case-drafts-before-bundle': 'case_drafts_before_bundle',
  'bundle-before-finished-checkpoint': 'bundle_and_markdown_without_finished_checkpoint',
  'json-bundle-before-markdown': 'json_bundle_without_markdown',
  'finished-checkpoint-before-current': 'finished_without_current',
  'truncated-checkpoint': 'truncated_checkpoint',
  'old-current-pointer': 'old_current',
  'r000-finished-r001-source': 'new_source_only',
  'r001-partially-accepted': 'new_partial',
  'r000-finished-r001-reopen': 'new_reopen_source',
  'finished-checkpoint-bundle-missing': 'finished_checkpoint_bundle_missing',
  'finished-checkpoint-bundle-digest-mismatch': 'finished_checkpoint_bundle_digest_mismatch'
});

const finishedRunLayout = Object.freeze([
  'accepted', 'accepted/r000',
  'accepted/r000/source-pack.json', 'accepted/r000/evidence-claims.json',
  'accepted/r000/behavior-views.json', 'accepted/r000/case-drafts.json',
  'accepted/r001',
  'accepted/r001/source-pack.json', 'accepted/r001/evidence-claims.json',
  'accepted/r001/behavior-views.json', 'accepted/r001/case-drafts.json',
  'checkpoint.json',
  'derived', 'derived/r000', 'derived/r000/test-obligations.json', 'derived/r000/clarification-state.json',
  'derived/r001', 'derived/r001/test-obligations.json', 'derived/r001/clarification-state.json',
  'output', 'output/r001', 'output/r001/test-bundle.json',
  'output/r001/test-cases.md', 'output/current.json',
  'staging'
]);

/** @param {string[]} removed */
function finishedLayoutWithout(...removed) {
  const omitted = new Set(removed);
  return finishedRunLayout.filter((entry) => !omitted.has(entry));
}

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
  if (stageName === 'source_pack') {
    let runInstance;
    try {
      runInstance = JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8'));
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
      await advanceStrict(runDirectory);
      try {
        runInstance = JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8'));
      } catch (secondError) {
        if (!secondError || typeof secondError !== 'object' || !('code' in secondError) || secondError.code !== 'ENOENT') throw secondError;
      }
    }
    if (runInstance) artifact.run_instance_id = runInstance.run_instance_id;
  }
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
    let reply = /** @type {any} */ (await advanceStrict(runDirectory));
    if (stageName !== 'case_drafts') assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    else {
      assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
      assert.equal(reply.purpose, 'final_confirmation');
      const confirmed = structuredClone(revision);
      for (const artifact of [
        confirmed.source_pack, confirmed.evidence_claims,
        confirmed.behavior_views, confirmed.case_drafts
      ]) artifact.source_revision = 1;
      confirmed.source_pack.execution_events.push({
        event_id: 'event_recovery_confirmation', clarification_event_seq: reply.next_event_seq,
        type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
        authority_scope: '*', run_instance_id: confirmed.source_pack.run_instance_id,
        run_identity_digest: reply.execution_plan.run_identity_digest,
        presented_prompt_id: reply.prompt_id,
        presented_plan_digest: reply.execution_plan.plan_digest,
        presented_plan_change_head_seq: reply.execution_plan.plan_change_head_seq,
        presented_source_revision: reply.source_revision
      });
      reply = await submitCompleteRevision(runDirectory, confirmed);
      assert.equal(reply.status, 'finished', JSON.stringify(reply));
    }
  }
  return /** @type {Promise<any>} */ (advanceStrict(runDirectory));
}

/** @param {string} runDirectory @param {any} revision */
async function submitCompleteRevision(runDirectory, revision) {
  /** @type {any} */
  let reply;
  for (const stageName of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
    await stage(
      runDirectory, /** @type {keyof typeof STAGE_FILES} */ (stageName), revision[stageName]
    );
    reply = await advanceStrict(runDirectory);
    if (reply.status === 'need_revision' || reply.status === 'fatal') break;
  }
  return reply;
}

/** @param {any} sourcePack @param {any} pendingReply */
function deliverySourceRevision(sourcePack, pendingReply) {
  const next = structuredClone(sourcePack);
  next.source_revision = 1;
  next.clarification_events.push({
    event_id: 'event_delivery', clarification_event_seq: 1, type: 'request_delivery',
    actor: 'owner', event_at: '2026-08-30',
    presentation_id: pendingReply.presentation_id,
    decision_group_ids: pendingReply.groups.map((/** @type {any} */ group) => group.group_id),
    root_issue_ids: pendingReply.blockers.map((/** @type {any} */ item) => item.root_issue_id)
  });
  return next;
}

/** @param {any} sourcePack @param {string[]} rootIssueIds @param {any} pendingReply */
function reopenSourceRevision(sourcePack, rootIssueIds, pendingReply) {
  const next = structuredClone(sourcePack);
  next.source_revision = 2;
  next.clarification_events.push({
    event_id: 'event_reopen', clarification_event_seq: 2, type: 'reopen_root_issues',
    actor: 'owner', event_at: '2026-08-31',
    presentation_id: pendingReply.presentation_id,
    decision_group_ids: pendingReply.groups.map((/** @type {any} */ group) => group.group_id),
    root_issue_ids: [...rootIssueIds]
  });
  return next;
}

/** @param {string} target */
async function removeIfPresent(target) {
  await rm(target, { force: true });
}

/** @param {string} value */
function byteDigest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** @param {string} runDirectory */
async function finishedSnapshot(runDirectory) {
  const bundlePath = path.join(runDirectory, 'output/r001/test-bundle.json');
  const markdownPath = path.join(runDirectory, 'output/r001/test-cases.md');
  const checkpointPath = path.join(runDirectory, 'checkpoint.json');
  const currentPath = path.join(runDirectory, 'output/current.json');
  const [bundleText, markdownText, checkpointText, currentText] = await Promise.all([
    readFile(bundlePath, 'utf8'), readFile(markdownPath, 'utf8'),
    readFile(checkpointPath, 'utf8'), readFile(currentPath, 'utf8')
  ]);
  return {
    bundlePath, markdownPath, checkpointPath, currentPath,
    bundleText, markdownText, checkpointText, currentText,
    bundleDigest: digest(JSON.parse(bundleText)),
    markdownDigest: byteDigest(markdownText)
  };
}

/** @param {string} runDirectory @param {readonly string[]} expected */
async function assertExactRunLayout(runDirectory, expected) {
  const actual = (await readdir(runDirectory, { recursive: true })).sort();
  assert.deepEqual(actual, [...new Set(['run-instance.json', ...expected])].sort());
}

/** @param {any} revision */
async function uninterruptedSnapshot(revision) {
  const runDirectory = await temporaryRun();
  try {
    const reply = /** @type {any} */ (await finish(runDirectory, revision));
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    return await finishedSnapshot(runDirectory);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

/** @param {string} runDirectory @param {ReturnType<typeof finishedSnapshot> extends Promise<infer T> ? T : never} baseline @param {any} recovered */
async function assertRecoveredFinishedState(runDirectory, baseline, recovered) {
  const actual = await finishedSnapshot(runDirectory);
  assert.equal(actual.bundleText, baseline.bundleText, 'recovery changed canonical JSON bytes');
  assert.equal(actual.markdownText, baseline.markdownText, 'recovery changed canonical Markdown bytes');
  assert.equal(actual.bundleDigest, baseline.bundleDigest);
  assert.equal(actual.markdownDigest, baseline.markdownDigest);
  const checkpoint = JSON.parse(actual.checkpointText);
  const current = JSON.parse(actual.currentText);
  assert.equal(checkpoint.stage, 'finished');
  assert.equal(checkpoint.source_revision, 1);
  assert.equal(checkpoint.accepted_artifact_digests.test_bundle, baseline.bundleDigest);
  assert.equal(current.source_revision, 1);
  assert.equal(current.bundle_digest, baseline.bundleDigest);
  assert.equal(current.bundle_path, actual.bundlePath);
  assert.equal(recovered.bundle_digest, baseline.bundleDigest);
}

test('all declared Task12 crash fixtures exist and cover at least ten independent recovery boundaries', async () => {
  assert.ok(crashFixtureNames.length >= 10);
  const fixtures = await Promise.all(crashFixtureNames.map(jsonFixture));
  assert.deepEqual(
    fixtures.map((item, index) => [crashFixtureNames[index], item.state]),
    crashFixtureNames.map((name) => [name, expectedCrashStateByFixture[name]])
  );
  assert.equal(
    new Set(fixtures.map((item) => item.state)).size,
    crashFixtureNames.length,
    'each declared crash boundary requires one observable, unique filesystem state'
  );
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

test('controlled symlink descendants fail closed without escaping the real run root', async () => {
  const revision = await revisionFixture();
  for (const controlledName of ['accepted', 'staging', 'derived', 'output']) {
    const runDirectory = await temporaryRun();
    const outside = await temporaryRun();
    try {
      await symlink(outside, path.join(runDirectory, controlledName));
      if (controlledName === 'staging') await writeFile(
        path.join(outside, STAGE_FILES.source_pack), `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
      );
      else await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
      if (controlledName !== 'staging') await writeFile(
        path.join(runDirectory, 'staging', STAGE_FILES.source_pack),
        `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
      );
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(reply.status, 'fatal', `${controlledName}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'RUN_INTEGRITY_ERROR');
      assert.deepEqual(await readdir(outside), controlledName === 'staging'
        ? [STAGE_FILES.source_pack] : []);
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun();
  const outside = await temporaryRun();
  try {
    await mkdir(path.join(runDirectory, 'accepted'), { recursive: true });
    await symlink(outside, path.join(runDirectory, 'accepted/r000'));
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'RUN_INTEGRITY_ERROR');
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('recovery removes dead nested temp files and reconciles identical staging residue', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  try {
    for (const directory of ['accepted/r000', 'derived/r777', 'output/r777']) {
      await mkdir(path.join(runDirectory, directory), { recursive: true });
      await writeFile(path.join(runDirectory, directory, '.dead.json.tmp-424242-7'), '{"partial":');
    }
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const first = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(first.stage, 'evidence_claims', JSON.stringify(first));
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const replay = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(replay.status, 'need_artifact', JSON.stringify(replay));
    assert.equal(replay.stage, 'evidence_claims');
    await assert.rejects(stat(path.join(runDirectory, 'staging/source-pack.json')));
    for (const directory of ['accepted/r000', 'derived/r777', 'output/r777']) {
      assert.ok((await readdir(path.join(runDirectory, directory))).every(
        (/** @type {string} */ name) => !name.includes('.tmp-')
      ));
    }
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('recovery never removes an atomic temp owned by a live writer process', async () => {
  const runDirectory = await temporaryRun();
  const liveTemporary = path.join(
    runDirectory, `accepted/r000/.source-pack.json.tmp-${process.pid}-999999`
  );
  try {
    await mkdir(path.dirname(liveTemporary), { recursive: true });
    await writeFile(liveTemporary, '{"still":"writing"}');
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'source_pack');
    assert.equal(await readFile(liveTemporary, 'utf8'), '{"still":"writing"}');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('recovery restores an atomically claimed staging artifact after a promotion crash', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    await fsPromises.rename(
      path.join(runDirectory, 'staging/source-pack.json'),
      path.join(runDirectory, 'staging/.source-pack.json.claim-424242-1')
    );
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));
    assert.deepEqual(await readdir(path.join(runDirectory, 'staging')), []);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a newer partial revision cannot hide invalid accepted semantics in an older revision', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  try {
    await finish(runDirectory, revision);
    const invalidCase = structuredClone(revision.case_drafts);
    invalidCase.cases[0].steps[0].expectations[0].evidence_ref = 'claim_missing';
    await writeFile(
      path.join(runDirectory, 'accepted/r000/case-drafts.json'),
      `${JSON.stringify(invalidCase)}\n`, 'utf8'
    );
    const nextSource = structuredClone(revision.source_pack);
    nextSource.source_revision = 1;
    await mkdir(path.join(runDirectory, 'accepted/r001'), { recursive: true });
    await writeFile(
      path.join(runDirectory, 'accepted/r001/source-pack.json'),
      `${JSON.stringify(nextSource)}\n`, 'utf8'
    );
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'RUN_INTEGRITY_ERROR');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('promotion never deletes a staging file replaced after validation', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  revision.source_pack.sources[0].content = 'x'.repeat(32 * 1024 * 1024);
  completeSourcePack(revision.source_pack, revision.evidence_claims);
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { advanceStrict } from ${JSON.stringify(path.join(repositoryRoot, 'src/advance-strict.mjs'))};
      process.stdout.write(JSON.stringify(await advanceStrict(${JSON.stringify(runDirectory)})));
    `], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { output += chunk; });
    let sawTemporary = false;
    for (let attempt = 0; attempt < 30_000; attempt += 1) {
      try {
        const names = await readdir(path.join(runDirectory, 'accepted/r000'));
        if (names.some((/** @type {string} */ name) => name.includes('.tmp-'))) {
          sawTemporary = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.equal(sawTemporary, true, 'fixture must overlap the accepted-file write');
    await writeFile(path.join(runDirectory, 'staging/source-pack.json'), '{"replacement":true}\n');
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(output).stage, 'evidence_claims');
    assert.equal(await readFile(path.join(runDirectory, 'staging/source-pack.json'), 'utf8'), '{"replacement":true}\n');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('parallel advances of one valid staging snapshot are serialized and idempotent', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const runDirectory = await temporaryRun();
    const revision = await revisionFixture();
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      const replies = /** @type {any[]} */ (await Promise.all([
        advanceStrict(runDirectory), advanceStrict(runDirectory)
      ]));
      assert.deepEqual(
        replies.map((reply) => `${reply.status}/${reply.stage}`),
        ['need_artifact/evidence_claims', 'need_artifact/evidence_claims'],
        `attempt ${attempt}: ${JSON.stringify(replies)}`
      );
      await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));
      await assert.rejects(stat(path.join(runDirectory, 'staging/source-pack.json')));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('separate processes coordinate one run and return the same idempotent result', { timeout: 20_000 }, async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  revision.source_pack.sources[0].content = 'x'.repeat(32 * 1024 * 1024);
  completeSourcePack(revision.source_pack, revision.evidence_claims);
  const startPath = path.join(runDirectory, 'start');
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const program = `
      import { stat } from 'node:fs/promises';
      import { advanceStrict } from ${JSON.stringify(path.join(repositoryRoot, 'src/advance-strict.mjs'))};
      process.stderr.write('READY\\n');
      while (true) {
        try { await stat(${JSON.stringify(startPath)}); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 1)); }
      }
      process.stdout.write(JSON.stringify(await advanceStrict(${JSON.stringify(runDirectory)})));
    `;
    const children = [0, 1].map(() => spawn(
      process.execPath, ['--input-type=module', '-e', program],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    ));
    const outputs = children.map((child) => {
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
      child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
      const ready = new Promise((resolve) => {
        const check = () => { if (stderr.includes('READY')) resolve(undefined); };
        child.stderr.on('data', check);
        check();
      });
      const closed = new Promise((resolve) => child.on('close', (/** @type {number|null} */ code) => resolve({
        code, stdout: () => stdout, stderr: () => stderr
      })));
      return { ready, closed };
    });
    await Promise.all(outputs.map((item) => item.ready));
    await writeFile(startPath, 'go', 'utf8');
    const completed = /** @type {any[]} */ (await Promise.all(
      outputs.map((item) => item.closed)
    ));
    const replies = completed.map((item) => {
      assert.equal(item.code, 0, item.stderr());
      return JSON.parse(item.stdout());
    });
    assert.deepEqual(replies[0], replies[1]);
    assert.equal(replies[0].status, 'need_artifact', JSON.stringify(replies));
    assert.equal(replies[0].stage, 'evidence_claims');
    assert.ok(replies.every((reply) => !reply.diagnostics?.some((/** @type {any} */ item) => (
      /tmp-|claim-|ENOENT/u.test(item.message)
    ))), JSON.stringify(replies));
    await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));
    await assert.rejects(stat(path.join(runDirectory, 'staging/source-pack.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('run coordination reclaims a dead owner but never deletes a live owner lock', { timeout: 10_000 }, async () => {
  for (const owner of [
    { pid: 999_999_999, token: 'dead-owner', lease_expires_at_ms: 0 },
    { pid: process.pid, token: 'live-owner', lease_expires_at_ms: Date.now() + 60_000 }
  ]) {
    const runDirectory = await temporaryRun();
    const revision = await revisionFixture();
    const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      await mkdir(lockDirectory);
      await writeFile(
        path.join(lockDirectory, 'owner.json'), `${JSON.stringify(owner)}\n`, 'utf8'
      );
      const pending = advanceStrict(runDirectory);
      if (owner.token === 'live-owner') {
        const state = await Promise.race([
          pending.then(() => 'settled'),
          new Promise((resolve) => setTimeout(() => resolve('waiting'), 250))
        ]);
        assert.equal(state, 'waiting', 'an active owner lock must not be removed or bypassed');
        await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
        await rm(lockDirectory, { recursive: true, force: true });
      }
      const reply = /** @type {any} */ (await pending);
      assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
      assert.equal(reply.stage, 'evidence_claims');
      await assert.rejects(stat(lockDirectory));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('post-acquire intrinsic failure releases ownership before returning', { timeout: 10_000 }, async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const originalSort = Array.prototype.sort;
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    await mkdir(lockDirectory);
    await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
      pid: process.pid, token: 'external-live-owner', lease_expires_at_ms: Date.now() + 60_000
    })}\n`, 'utf8');
    const pending = advanceStrict(runDirectory);
    await new Promise((resolve) => setTimeout(resolve, 100));
    Array.prototype.sort = function (/** @type {any[]} */ ...args) {
      return Reflect.apply(originalSort, this, args);
    };
    await rm(lockDirectory, { recursive: true, force: true });
    const reply = /** @type {any} */ (await pending);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    Array.prototype.sort = originalSort;
    await assert.rejects(stat(lockDirectory), 'failed intrinsic check leaked run ownership');
    const retry = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(retry.status, 'need_artifact', JSON.stringify(retry));
    assert.equal(retry.stage, 'evidence_claims');
  } finally {
    Array.prototype.sort = originalSort;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('lock wait and release use captured Object Date and process intrinsics', { timeout: 10_000 }, async () => {
  const originalReflectApply = Reflect.apply;
  /** @type {Array<[Record<string,any>,string]>} */
  const cases = [
    [/** @type {any} */ (Object), 'fromEntries'],
    [/** @type {any} */ (Date), 'now'],
    [/** @type {any} */ (process), 'kill']
  ];
  for (const [owner, method] of cases) {
    const runDirectory = await temporaryRun();
    const revision = await revisionFixture();
    const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
    const original = owner[method];
    let calls = 0;
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      await mkdir(lockDirectory);
      await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
        pid: process.pid, token: `wait-${method}`, lease_expires_at_ms: Date.now() + 60_000
      })}\n`, 'utf8');
      const pending = advanceStrict(runDirectory);
      await new Promise((resolve) => setTimeout(resolve, 100));
      owner[method] = function (/** @type {any[]} */ ...args) {
        calls += 1;
        return originalReflectApply(original, this, args);
      };
      await new Promise((resolve) => setTimeout(resolve, 75));
      await rm(lockDirectory, { recursive: true, force: true });
      const reply = /** @type {any} */ (await pending);
      assert.equal(calls, 0, `${method} caller code executed while waiting or releasing`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
      owner[method] = original;
      await assert.rejects(stat(lockDirectory));
    } finally {
      owner[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('expired or reused PID owners recover while a renewed live lease remains held', { timeout: 10_000 }, async () => {
  for (const owner of [
    { pid: process.pid, token: 'expired-live-pid', lease_expires_at_ms: 0 },
    {
      pid: process.pid, token: 'reused-live-pid', lease_expires_at_ms: Date.now() + 60_000,
      process_start_identity: 'different-process-start'
    }
  ]) {
    const runDirectory = await temporaryRun();
    const revision = await revisionFixture();
    const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      await mkdir(lockDirectory);
      await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify(owner)}\n`, 'utf8');
      const pending = advanceStrict(runDirectory);
      const state = await Promise.race([
        pending, new Promise((resolve) => setTimeout(() => resolve('waiting'), 500))
      ]);
      if (state === 'waiting') {
        await rm(lockDirectory, { recursive: true, force: true });
        await pending;
      }
      assert.notEqual(state, 'waiting', `${owner.token} was mistaken for the active owner`);
      assert.equal((/** @type {any} */ (state)).stage, 'evidence_claims');
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const ownerPath = path.join(lockDirectory, 'owner.json');
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    await mkdir(lockDirectory);
    const owner = {
      pid: process.pid, token: 'renewed-live-owner', lease_expires_at_ms: Date.now() + 150
    };
    await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, 'utf8');
    const pending = advanceStrict(runDirectory);
    await new Promise((resolve) => setTimeout(resolve, 75));
    owner.lease_expires_at_ms = Date.now() + 1_000;
    const replacement = `${ownerPath}.replacement`;
    await writeFile(replacement, `${JSON.stringify(owner)}\n`, 'utf8');
    await rename(replacement, ownerPath);
    const state = await Promise.race([
      pending.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 300))
    ]);
    assert.equal(state, 'waiting', 'a renewed live lease was reclaimed');
    await rm(lockDirectory, { recursive: true, force: true });
    assert.equal((/** @type {any} */ (await pending)).stage, 'evidence_claims');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('lock rename crash residues are durably removed but matching symlinks fail closed', async () => {
  const runDirectory = await temporaryRun();
  const outside = await temporaryRun();
  const revision = await revisionFixture();
  const residues = [
    path.join(runDirectory, '.compiler-advance.lock.release-999-1'),
    path.join(runDirectory, '.compiler-advance.lock.stale-999-2')
  ];
  try {
    for (const residue of residues) {
      await mkdir(path.join(residue, 'nested'), { recursive: true });
      await writeFile(path.join(residue, 'nested/owner.json'), '{}\n', 'utf8');
    }
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.stage, 'evidence_claims', JSON.stringify(reply));
    for (const residue of residues) await assert.rejects(stat(residue));

    const symlinkResidue = path.join(runDirectory, '.compiler-advance.lock.release-999-3');
    await symlink(outside, symlinkResidue);
    const rejected = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(rejected.status, 'fatal', JSON.stringify(rejected));
    assert.equal(rejected.diagnostics[0].code, 'RUN_INTEGRITY_ERROR');
    await stat(symlinkResidue);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('advance cleans release residues only after it owns the run lock', async () => {
  const runDirectory = await temporaryRun();
  const residue = path.join(runDirectory, '.compiler-advance.lock.release-999-1');
  try {
    const releaseHolder = await acquireRunLock(runDirectory);
    await mkdir(path.join(residue, 'nested'), { recursive: true });
    await writeFile(path.join(residue, 'nested/owner.json'), '{}\n', 'utf8');
    const pending = advanceStrict(runDirectory);
    const state = await Promise.race([
      pending.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 300))
    ]);
    assert.equal(state, 'waiting');
    await stat(residue);
    await releaseHolder();
    const reply = /** @type {any} */ (await pending);
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    await assert.rejects(stat(residue), { code: 'ENOENT' });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('residue cleanup rejects a replacement with copied process metadata', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.cleanup-original-holder');
  const residue = path.join(runDirectory, '.compiler-advance.lock.release-999-77');
  try {
    await mkdir(path.join(residue, 'nested'), { recursive: true });
    await writeFile(path.join(residue, 'nested/owner.json'), '{}\n', 'utf8');
    await assert.rejects(acquireRunLock(runDirectory, {
      beforeResidueCleanup: async () => {
        const originalOwner = JSON.parse(await readFile(
          path.join(lockDirectory, 'owner.json'), 'utf8'
        ));
        await rename(lockDirectory, displacedDirectory);
        await mkdir(lockDirectory);
        await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
          ...originalOwner, token: 'copied-metadata-replacement'
        })}\n`, 'utf8');
      }
    }), /exact acquired ownership/u);
    await stat(residue);
    assert.equal(JSON.parse(await readFile(
      path.join(lockDirectory, 'owner.json'), 'utf8'
    )).token, 'copied-metadata-replacement');
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
    await rm(displacedDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('residue cleanup restores its atomic claim if ownership changes after observation', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.cleanup-postclaim-holder');
  const residue = path.join(runDirectory, '.compiler-advance.lock.release-999-78');
  try {
    await mkdir(path.join(residue, 'nested'), { recursive: true });
    await writeFile(path.join(residue, 'nested/owner.json'), '{}\n', 'utf8');
    await assert.rejects(acquireRunLock(runDirectory, {
      afterResidueClaim: async () => {
        const originalOwner = JSON.parse(await readFile(
          path.join(lockDirectory, 'owner.json'), 'utf8'
        ));
        await rename(lockDirectory, displacedDirectory);
        await mkdir(lockDirectory);
        await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
          ...originalOwner, token: 'postclaim-replacement'
        })}\n`, 'utf8');
      }
    }), /exact acquired ownership/u);
    await stat(residue);
    assert.ok((await readdir(runDirectory)).every(
      (/** @type {string} */ name) => !name.startsWith(
        '.compiler-advance.lock.release-999-78.cleanup-'
      )
    ));
    assert.equal(JSON.parse(await readFile(
      path.join(lockDirectory, 'owner.json'), 'utf8'
    )).token, 'postclaim-replacement');
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
    await rm(displacedDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a cleanup claim abandoned by process exit is recovered by the next owner', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const residue = path.join(runDirectory, '.compiler-advance.lock.release-999-79');
  const moduleUrl = new URL('../../src/run-store.mjs', import.meta.url).href;
  try {
    await mkdir(path.join(residue, 'nested'), { recursive: true });
    await writeFile(path.join(residue, 'nested/owner.json'), '{}\n', 'utf8');
    const childSource = `
      import { acquireRunLock } from ${JSON.stringify(moduleUrl)};
      await acquireRunLock(process.argv[1], {
        afterResidueClaim: async () => { process.exit(0); }
      });
    `;
    const child = spawn(process.execPath, [
      '--input-type=module', '-e', childSource, runDirectory
    ], { stdio: 'ignore' });
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(exitCode, 0);
    assert.ok((await readdir(runDirectory)).some(
      (/** @type {string} */ name) => name.startsWith(`${path.basename(residue)}.cleanup-`)
    ));

    const release = await acquireRunLock(runDirectory);
    await release();
    assert.ok((await readdir(runDirectory)).every(
      (/** @type {string} */ name) => !name.startsWith(path.basename(residue))
    ));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a production lock holder renews its fenced lease while a contender waits', { timeout: 10_000 }, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const ownerPath = path.join(runDirectory, '.compiler-advance.lock/owner.json');
  try {
    const releaseHolder = await acquireRunLock(runDirectory);
    const first = JSON.parse(await readFile(ownerPath, 'utf8'));
    const firstHeartbeat = (await stat(lockDirectory)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 2_750));
    const renewed = JSON.parse(await readFile(ownerPath, 'utf8'));
    const renewedHeartbeat = (await stat(lockDirectory)).mtimeMs;
    assert.ok(renewedHeartbeat > firstHeartbeat, JSON.stringify({ firstHeartbeat, renewedHeartbeat }));
    assert.equal(renewed.token, first.token);
    const contender = acquireRunLock(runDirectory);
    const state = await Promise.race([
      contender.then(() => 'acquired'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 500))
    ]);
    assert.equal(state, 'waiting', 'a valid long-running holder lost its lease');
    await releaseHolder();
    const releaseContender = await contender;
    await releaseContender();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a synchronous holder cannot starve the production heartbeat and lose its lock', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const program = `
    import { acquireRunLock } from ${JSON.stringify(path.join(repositoryRoot, 'src/run-store.mjs'))};
    const release = await acquireRunLock(${JSON.stringify(runDirectory)});
    process.send('READY');
    await new Promise((resolve) => process.once('message', resolve));
    process.send('STARTED');
    const until = Date.now() + 3_000;
    while (Date.now() < until) {}
    await release();
    process.send('RELEASED');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
  /** @type {Record<string,(value?:unknown)=>void>} */
  const messageResolvers = {};
  /** @param {string} name */
  const message = (name) => new Promise((resolve) => { messageResolvers[name] = resolve; });
  const ready = message('READY');
  const startedSignal = message('STARTED');
  const released = message('RELEASED');
  let releasedSeen = false;
  child.on('message', (/** @type {unknown} */ value) => {
    if (value === 'RELEASED') releasedSeen = true;
    if (typeof value === 'string' && messageResolvers[value]) messageResolvers[value]();
  });
  const childFailure = new Promise((_, reject) => {
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => {
      if (!releasedSeen) reject(new Error(`holder exited before release (${code}): ${stderr}`));
    });
  });
  const closed = new Promise((resolve) => child.on(
    'close', (/** @type {number|null} */ code) => resolve(code)
  ));
  try {
    await Promise.race([ready, childFailure]);
    child.send('GO');
    await Promise.race([startedSignal, childFailure]);
    const startedAt = Date.now();
    const releaseContender = await acquireRunLock(runDirectory);
    const waitedMs = Date.now() - startedAt;
    assert.ok(waitedMs >= 2_800, `contender reclaimed a live holder after only ${waitedMs}ms`);
    await Promise.race([released, childFailure]);
    await releaseContender();
    assert.equal(await closed, 0, stderr);
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('release restores a successor substituted after ownership observation', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.original-holder');
  const successor = {
    pid: process.pid, token: 'release-race-successor',
    lease_expires_at_ms: Date.now() + 60_000,
    process_start_identity: `${process.pid}:successor`, heartbeat_seq: 0
  };
  try {
    const release = await acquireRunLock(runDirectory, {
      afterReleaseObservation: async () => {
        await rename(lockDirectory, displacedDirectory);
        await mkdir(lockDirectory);
        await writeFile(
          path.join(lockDirectory, 'owner.json'), `${JSON.stringify(successor)}\n`, 'utf8'
        );
      }
    });
    await assert.rejects(release, /release moved a different generation/u);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(lockDirectory, 'owner.json'), 'utf8')), successor
    );
    assert.ok((await readdir(runDirectory)).every(
      (/** @type {string} */ name) => !name.startsWith('.compiler-advance.lock.release-')
    ));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('release transaction restores its successor before a third contender can claim', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const originalDirectory = path.join(runDirectory, '.original-holder');
  const secondOwner = {
    pid: process.pid, token: 'second-generation', lease_expires_at_ms: Date.now() + 60_000
  };
  /** @type {Promise<()=>Promise<void>>|undefined} */
  let thirdAcquire;
  try {
    const releaseFirst = await acquireRunLock(runDirectory, {
      afterReleaseObservation: async () => {
        await rename(lockDirectory, originalDirectory);
        await mkdir(lockDirectory);
        await writeFile(
          path.join(lockDirectory, 'owner.json'), `${JSON.stringify(secondOwner)}\n`, 'utf8'
        );
        thirdAcquire = acquireRunLock(runDirectory);
      }
    });
    await assert.rejects(releaseFirst, /release moved a different generation/u);
    assert.deepEqual(JSON.parse(await readFile(
      path.join(lockDirectory, 'owner.json'), 'utf8'
    )), secondOwner);
    assert.ok((await readdir(runDirectory)).every(
      (/** @type {string} */ name) => !name.startsWith('.compiler-advance.lock.release-')
        && !name.startsWith('.compiler-advance.lock.preserved-')
    ));
    const pendingThird = thirdAcquire;
    if (!pendingThird) throw new Error('third contender was not started');
    const thirdState = await Promise.race([
      pendingThird.then(() => 'acquired'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 350))
    ]);
    assert.equal(thirdState, 'waiting');
    await rm(lockDirectory, { recursive: true, force: true });
    const releaseThird = await pendingThird;
    await releaseThird();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a live release transaction keeps its canonical gap fenced beyond one lease', {
  timeout: 15_000
}, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.long-release-holder');
  /** @type {Promise<()=>Promise<void>>|undefined} */
  let contender;
  let contenderState = 'not-started';
  try {
    const releaseHolder = await acquireRunLock(runDirectory, {
      afterReleaseObservation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2_750));
        await rename(lockDirectory, displacedDirectory);
        contender = acquireRunLock(runDirectory);
        contenderState = await Promise.race([
          contender.then(() => 'acquired'),
          new Promise((resolve) => setTimeout(() => resolve('waiting'), 800))
        ]);
        await rename(displacedDirectory, lockDirectory);
      }
    });
    await releaseHolder();
    assert.equal(contenderState, 'waiting');
    const pendingContender = contender;
    if (!pendingContender) throw new Error('long-release contender was not started');
    const releaseContender = await pendingContender;
    await releaseContender();
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
    await rm(displacedDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('changing heartbeat proof keeps a live transaction fenced with fixed directory mtime', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const transactionDirectory = path.join(runDirectory, '.compiler-advance.transaction');
  const markerPath = path.join(transactionDirectory, '.heartbeat-worker-1');
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let heartbeatTimer;
  /** @type {(()=>Promise<void>)|undefined} */
  let acquiredRelease;
  try {
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, 'owner.json'), `${JSON.stringify({
      pid: process.pid,
      token: 'coarse-timestamp-live-transaction',
      lease_expires_at_ms: Date.now() + 60_000,
      process_start_identity: `${process.pid}:${Date.now() - process.uptime() * 1_000}`,
      heartbeat_seq: 0,
      heartbeat_ready: true
    })}\n`, 'utf8');
    await writeFile(markerPath, '0\n', 'utf8');
    const fixedSeconds = Math.floor(Date.now() / 10_000) * 10;
    await utimes(transactionDirectory, fixedSeconds, fixedSeconds);
    let sequence = 0;
    heartbeatTimer = setInterval(() => {
      sequence += 1;
      void writeFile(markerPath, `${sequence}\n`, 'utf8');
    }, 75);

    const contender = acquireRunLock(runDirectory);
    const state = await Promise.race([
      contender.then((release) => {
        acquiredRelease = release;
        return 'acquired';
      }),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 900))
    ]);
    if (state === 'acquired' && acquiredRelease) await acquiredRelease();
    assert.equal(state, 'waiting', 'dynamic proof was ignored when directory mtime stayed fixed');

    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    await rm(transactionDirectory, { recursive: true, force: true });
    const release = await contender;
    await release();
  } finally {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    if (acquiredRelease) await acquiredRelease().catch(() => {});
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a forged future transaction lease cannot block recovery behind a reused PID', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const transactionDirectory = path.join(runDirectory, '.compiler-advance.transaction');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 7000)']);
  try {
    assert.ok(child.pid);
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, 'owner.json'), `${JSON.stringify({
      pid: child.pid, token: 'forged-future-transaction',
      lease_expires_at_ms: Number.MAX_SAFE_INTEGER,
      process_start_identity: `${child.pid}:${Date.now() - 60_000}`,
      heartbeat_seq: 0, heartbeat_ready: true
    })}\n`, 'utf8');
    const contender = acquireRunLock(runDirectory);
    const release = await Promise.race([
      contender,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 3_500))
    ]);
    if (release === 'waiting') {
      await rm(transactionDirectory, { recursive: true, force: true });
      const lateRelease = await contender;
      await lateRelease();
    }
    assert.notEqual(release, 'waiting', 'a static future lease caused an unbounded wait');
    if (release !== 'waiting') await (/** @type {()=>Promise<void>} */ (release))();
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('heartbeat worker stop failure closes the claim and removes only its lock', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const originalPostMessage = Worker.prototype.postMessage;
  const originalTerminate = Worker.prototype.terminate;
  Worker.prototype.postMessage = function (/** @type {any} */ message) {
    if (message?.type === 'stop') {
      Reflect.apply(originalTerminate, this, []);
      return;
    }
    return Reflect.apply(originalPostMessage, this, [message]);
  };
  let faultingAcquire;
  try {
    const faultModuleUrl = new URL('../../src/run-store.mjs', import.meta.url);
    faultModuleUrl.search = '?worker-stop-failure';
    faultingAcquire = (await import(faultModuleUrl.href)).acquireRunLock;
    const release = await faultingAcquire(runDirectory);
    Worker.prototype.postMessage = originalPostMessage;
    await assert.rejects(release, /heartbeat worker exited unexpectedly/u);
    await assert.rejects(stat(lockDirectory), { code: 'ENOENT' });
    const releaseRetry = await acquireRunLock(runDirectory);
    await releaseRetry();
    await assert.rejects(stat(lockDirectory), { code: 'ENOENT' });
  } finally {
    Worker.prototype.postMessage = originalPostMessage;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('release failure before transaction acquisition stops every heartbeat helper', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const transactionPath = path.join(runDirectory, '.compiler-advance.transaction');
  try {
    const release = await acquireRunLock(runDirectory);
    await writeFile(transactionPath, 'not a directory\n', 'utf8');
    await assert.rejects(release, /claim is not a real directory|transaction is not a real directory/u);
    await assert.rejects(stat(lockDirectory), { code: 'ENOENT' });
    await rm(transactionPath);
    const releaseRetry = await acquireRunLock(runDirectory);
    await releaseRetry();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('heartbeat readiness uses the captured native EventEmitter listener', async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const originalOn = Worker.prototype.on;
  const originalTerminate = Worker.prototype.terminate;
  Worker.prototype.on = function (/** @type {string} */ event, /** @type {Function} */ listener) {
    if (event !== 'message') return Reflect.apply(originalOn, this, [event, listener]);
    const worker = this;
    return Reflect.apply(originalOn, this, [event, (/** @type {any} */ workerMessage) => {
      if (workerMessage?.type === 'ready') Reflect.apply(originalTerminate, worker, []);
      return listener(workerMessage);
    }]);
  };
  let faultingAcquire;
  try {
    const faultModuleUrl = new URL('../../src/run-store.mjs', import.meta.url);
    faultModuleUrl.search = '?worker-readiness-failure';
    faultingAcquire = (await import(faultModuleUrl.href)).acquireRunLock;
  } finally {
    Worker.prototype.on = originalOn;
  }
  try {
    const release = await faultingAcquire(runDirectory);
    await release();
    await assert.rejects(stat(lockDirectory), { code: 'ENOENT' });
  } finally {
    Worker.prototype.on = originalOn;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('heartbeat worker source runs when eval is forced to CommonJS', async () => {
  const runDirectory = await temporaryRun();
  const moduleUrl = new URL('../../src/run-store.mjs', import.meta.url).href;
  const program = `
    (async () => {
      const { acquireRunLock } = await import(${JSON.stringify(moduleUrl)});
      const release = await acquireRunLock(${JSON.stringify(runDirectory)});
      await release();
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const child = spawn(process.execPath, [
    '--input-type=commonjs', '-e', program
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
  try {
    const code = await new Promise((resolve) => child.on(
      'close', (/** @type {number|null} */ value) => resolve(value)
    ));
    assert.equal(code, 0, stderr);
    await assert.rejects(stat(path.join(runDirectory, '.compiler-advance.lock')));
  } finally {
    if (child.exitCode === null) child.kill();
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('heartbeat renewal remains bound to its acquired directory generation', { timeout: 10_000 }, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.compiler-advance.lock.displaced');
  const replacement = {
    pid: process.pid, token: 'replacement-during-heartbeat',
    lease_expires_at_ms: Date.now() + 60_000
  };
  let swaps = 0;
  let swappedResolve = () => {};
  const swapped = new Promise((resolve) => { swappedResolve = () => resolve(undefined); });
  try {
    const releaseHolder = await acquireRunLock(runDirectory, {
      afterHeartbeatObservation: async () => {
        if (swaps > 0) return;
        swaps += 1;
        await rename(lockDirectory, displacedDirectory);
        await mkdir(lockDirectory);
        await writeFile(
          path.join(lockDirectory, 'owner.json'), `${JSON.stringify(replacement)}\n`, 'utf8'
        );
        swappedResolve();
      }
    });
    await Promise.race([
      swapped,
      new Promise((_, reject) => setTimeout(() => reject(new Error('heartbeat hook not reached')), 1_000))
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(
      JSON.parse(await readFile(path.join(lockDirectory, 'owner.json'), 'utf8')), replacement
    );
    await assert.rejects(releaseHolder, /ownership changed|fencing changed/u);
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
    await rm(displacedDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('production heartbeat helpers never write proof into a successor generation', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const displacedDirectory = path.join(runDirectory, '.production-heartbeat-original');
  try {
    const release = await acquireRunLock(runDirectory);
    await rename(lockDirectory, displacedDirectory);
    await mkdir(lockDirectory);
    await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
      pid: process.pid,
      token: 'production-heartbeat-successor',
      lease_expires_at_ms: Date.now() + 60_000,
      process_start_identity: `${process.pid}:${Date.now() - process.uptime() * 1_000}`,
      heartbeat_seq: 0,
      heartbeat_ready: true
    })}\n`, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 700));

    assert.ok((await readdir(lockDirectory)).every(
      (/** @type {string} */ name) => !name.startsWith('.heartbeat-')
    ), 'an old heartbeat helper wrote proof into its successor generation');
    assert.ok((await readdir(displacedDirectory)).some(
      (/** @type {string} */ name) => name.startsWith('.heartbeat-')
    ));
    await assert.rejects(release, /ownership changed/u);
    assert.equal(JSON.parse(await readFile(
      path.join(lockDirectory, 'owner.json'), 'utf8'
    )).token, 'production-heartbeat-successor');
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
    await rm(displacedDirectory, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('stale reclaim restores a newer lock generation instead of deleting it', { timeout: 10_000 }, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const ownerPath = path.join(lockDirectory, 'owner.json');
  let hookCalls = 0;
  try {
    await mkdir(lockDirectory);
    await writeFile(ownerPath, `${JSON.stringify({
      pid: 999_999_999, token: 'observed-old-owner', lease_expires_at_ms: 0
    })}\n`, 'utf8');
    const contender = acquireRunLock(runDirectory, {
      afterStaleObservation: async () => {
        hookCalls += 1;
        await rm(lockDirectory, { recursive: true, force: true });
        await mkdir(lockDirectory);
        await writeFile(ownerPath, `${JSON.stringify({
          pid: process.pid, token: 'replacement-owner',
          lease_expires_at_ms: Date.now() + 60_000,
          heartbeat_seq: 1
        })}\n`, 'utf8');
      }
    });
    const state = await Promise.race([
      contender.then(() => 'acquired'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 350))
    ]);
    assert.equal(hookCalls, 1);
    assert.equal(state, 'waiting', 'the contender deleted and replaced a newer owner generation');
    assert.equal(JSON.parse(await readFile(ownerPath, 'utf8')).token, 'replacement-owner');
    await rm(lockDirectory, { recursive: true, force: true });
    const release = await contender;
    await release();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('one stopped heartbeat worker leaves a second live proof for a synchronous owner', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  try {
    let stoppedOne = false;
    const releaseHolder = await acquireRunLock(runDirectory, {
      afterHeartbeatWorkerReady: async (stopOne) => {
        await stopOne();
        stoppedOne = true;
      }
    });
    assert.equal(stoppedOne, true);
    const firstHeartbeat = (await stat(lockDirectory)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 2_750));
    const renewedHeartbeat = (await stat(lockDirectory)).mtimeMs;
    assert.ok(renewedHeartbeat > firstHeartbeat);
    const contender = acquireRunLock(runDirectory);
    const state = await Promise.race([
      contender.then(() => 'acquired'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 700))
    ]);
    assert.equal(state, 'waiting', 'one worker failure erased the live owner proof');
    await releaseHolder();
    const releaseContender = await contender;
    await releaseContender();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('two stopped heartbeat workers leave an independent guardian proof', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  try {
    const releaseHolder = await acquireRunLock(runDirectory, {
      afterHeartbeatWorkerReady: async (_stopOne, stopWorkers) => {
        await stopWorkers();
      }
    });
    const firstHeartbeat = (await stat(lockDirectory)).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 2_750));
    const renewedHeartbeat = (await stat(lockDirectory)).mtimeMs;
    assert.ok(renewedHeartbeat > firstHeartbeat);
    const contender = acquireRunLock(runDirectory);
    const state = await Promise.race([
      contender.then(() => 'acquired'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 700))
    ]);
    assert.equal(state, 'waiting', 'worker loss erased the guardian liveness proof');
    await releaseHolder();
    const releaseContender = await contender;
    await releaseContender();
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('known loss of every heartbeat helper rejects the next operation before it starts', async () => {
  const runDirectory = await temporaryRun();
  /** @type {undefined|(()=>Promise<void>)} */
  let failAll;
  try {
    const release = await acquireRunLock(runDirectory, {
      afterHeartbeatWorkerReady: async (_stopOne, _stopWorkers, failEveryHelper) => {
        failAll = failEveryHelper;
      }
    });
    assert.equal(typeof failAll, 'function');
    if (!failAll) throw new Error('all-helper failure control was not provided');
    const failEveryHelper = failAll;
    await failEveryHelper();
    let operationStarted = false;
    await assert.rejects(
      release.guardedAwait(async () => {
        operationStarted = true;
      }),
      /heartbeat failed/u
    );
    assert.equal(operationStarted, false);
    await assert.rejects(release, /heartbeat/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a canonical ready record cannot turn an unrelated reused PID into a live owner', {
  timeout: 10_000
}, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
  try {
    assert.ok(child.pid);
    await mkdir(lockDirectory);
    await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
      pid: child.pid, token: 'reused-external-pid', lease_expires_at_ms: 0,
      process_start_identity: `${child.pid}:${Date.now() - 60_000}`, heartbeat_seq: 7,
      heartbeat_ready: true
    })}\n`, 'utf8');
    const contender = acquireRunLock(runDirectory);
    const release = await Promise.race([
      contender,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 1_200))
    ]);
    if (release === 'waiting') {
      await rm(lockDirectory, { recursive: true, force: true });
      const lateRelease = await contender;
      await lateRelease();
    }
    assert.notEqual(release, 'waiting', 'a static ready record authenticated an unrelated live PID');
    if (release !== 'waiting') await (/** @type {()=>Promise<void>} */ (release))();
  } finally {
    child.kill();
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('accepted artifact resolves its stale promotion claim before a newer canonical staging file', async () => {
  const runDirectory = await temporaryRun();
  const revision = buildJourney('clarification-grounded');
  try {
    const pending = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const nextSource = deliverySourceRevision(revision.source_pack, pending);
    await writeFile(
      path.join(runDirectory, 'staging/.source-pack.json.claim-424242-1'),
      `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
    );
    await stage(runDirectory, 'source_pack', nextSource);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.scope.source_revision, 1);
    assert.match(reply.scope.run_instance_id, /^RUN-/u);
    await stat(path.join(runDirectory, 'accepted/r001/source-pack.json'));
    await assert.rejects(stat(
      path.join(runDirectory, 'staging/.source-pack.json.claim-424242-1')
    ));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

for (const fixtureName of crashFixtureNames) {
  test(`recovery fixture ${fixtureName} selects accepted state deterministically`, async () => {
    const descriptor = await jsonFixture(fixtureName);
    const runDirectory = await temporaryRun();
    try {
      let baselineDigest = '';
      let baselineOutput = null;
      let expectedSourceRevision = 1;
      let recovered = null;
      const revision = descriptor.state.startsWith('new_')
        ? buildJourney('clarification-grounded') : await revisionFixture();
      if (descriptor.state === 'staging_source') {
        await stage(runDirectory, 'source_pack', revision.source_pack);
        await assertExactRunLayout(runDirectory, [
          'run-instance.json', 'staging', 'staging/source-pack.json'
        ]);
      } else if (descriptor.state.startsWith('new_')) {
        const pending = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
        assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
        const rootIssueIds = pending.blockers.map(
          (/** @type {any} */ item) => item.root_issue_id
        );
        const nextSource = deliverySourceRevision(revision.source_pack, pending);
        if (descriptor.state === 'new_reopen_source') {
          const deliveryRevision = setSourceRevision(structuredClone(revision), 1);
          deliveryRevision.source_pack = nextSource;
          const delivered = /** @type {any} */ (
            await submitCompleteRevision(runDirectory, deliveryRevision)
          );
          assert.equal(delivered.status, 'need_user_answers', JSON.stringify(delivered));
          assert.equal(delivered.purpose, 'execution_closure');
          expectedSourceRevision = 2;
          await stage(
            runDirectory, 'source_pack', reopenSourceRevision(nextSource, rootIssueIds, delivered)
          );
        } else {
          await stage(runDirectory, 'source_pack', nextSource);
          if (descriptor.state === 'new_partial') {
            const sourceReply = /** @type {any} */ (await advanceStrict(runDirectory));
            assert.equal(sourceReply.stage, 'evidence_claims', JSON.stringify(sourceReply));
            const nextEvidence = structuredClone(revision.evidence_claims);
            nextEvidence.source_revision = 1;
            await stage(runDirectory, 'evidence_claims', nextEvidence);
            const evidenceReply = /** @type {any} */ (await advanceStrict(runDirectory));
            assert.equal(evidenceReply.stage, 'behavior_views', JSON.stringify(evidenceReply));
          }
        }
      } else if (descriptor.state === 'accepted_before_checkpoint') {
        baselineOutput = await uninterruptedSnapshot(revision);
        baselineDigest = baselineOutput.bundleDigest;

        await stage(runDirectory, 'source_pack', revision.source_pack);
        const promoted = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(promoted.status, 'need_artifact', JSON.stringify(promoted));
        assert.equal(promoted.stage, 'evidence_claims');
        const sourceCheckpoint = JSON.parse(await readFile(
          path.join(runDirectory, 'checkpoint.json'), 'utf8'
        ));
        assert.equal(sourceCheckpoint.stage, 'source_pack');
        assert.deepEqual(Object.keys(sourceCheckpoint.accepted_artifact_digests), [
          'source_pack'
        ]);
        await removeIfPresent(path.join(runDirectory, 'checkpoint.json'));
        await assertExactRunLayout(runDirectory, [
          'accepted', 'accepted/r000', 'accepted/r000/source-pack.json',
          'output', 'output/current.json', 'staging'
        ]);
        assert.deepEqual(await readdir(path.join(runDirectory, 'staging')), []);

        const firstRecovery = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(firstRecovery.status, 'need_artifact', JSON.stringify(firstRecovery));
        assert.equal(firstRecovery.stage, 'evidence_claims');
        assert.equal(firstRecovery.scope.source_revision, 0);
        assert.match(firstRecovery.scope.run_instance_id, /^RUN-/u);

        await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
        const evidenceReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(evidenceReply.status, 'need_artifact', JSON.stringify(evidenceReply));
        assert.equal(evidenceReply.stage, 'behavior_views');
        await stage(runDirectory, 'behavior_views', revision.behavior_views);
        const viewsReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(viewsReply.status, 'need_artifact', JSON.stringify(viewsReply));
        assert.equal(viewsReply.stage, 'case_drafts');
        await stage(runDirectory, 'case_drafts', revision.case_drafts);
        recovered = /** @type {any} */ (await advanceStrict(runDirectory));
      } else if (descriptor.state === 'obligations_before_checkpoint') {
        baselineOutput = await uninterruptedSnapshot(revision);
        baselineDigest = baselineOutput.bundleDigest;

        await stage(runDirectory, 'source_pack', revision.source_pack);
        const sourceReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(sourceReply.stage, 'evidence_claims', JSON.stringify(sourceReply));
        await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
        const evidenceReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(evidenceReply.stage, 'behavior_views', JSON.stringify(evidenceReply));
        const evidenceCheckpoint = await readFile(
          path.join(runDirectory, 'checkpoint.json'), 'utf8'
        );
        assert.equal(JSON.parse(evidenceCheckpoint).stage, 'evidence_claims');

        await stage(runDirectory, 'behavior_views', revision.behavior_views);
        const viewsReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(viewsReply.status, 'need_artifact', JSON.stringify(viewsReply));
        assert.equal(viewsReply.stage, 'case_drafts');
        await writeFile(path.join(runDirectory, 'checkpoint.json'), evidenceCheckpoint, 'utf8');
        await assertExactRunLayout(runDirectory, [
          'accepted', 'accepted/r000',
          'accepted/r000/source-pack.json',
          'accepted/r000/evidence-claims.json',
          'accepted/r000/behavior-views.json',
          'checkpoint.json', 'derived', 'derived/r000',
          'derived/r000/test-obligations.json',
          'output', 'output/current.json', 'staging'
        ]);
        assert.deepEqual(await readdir(path.join(runDirectory, 'staging')), []);
        assert.equal(JSON.parse(await readFile(
          path.join(runDirectory, 'checkpoint.json'), 'utf8'
        )).stage, 'evidence_claims');

        const firstRecovery = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(firstRecovery.status, 'need_artifact', JSON.stringify(firstRecovery));
        assert.equal(firstRecovery.stage, 'case_drafts');
        assert.equal(firstRecovery.scope.source_revision, 0);
        assert.match(firstRecovery.scope.run_instance_id, /^RUN-/u);
        await stage(runDirectory, 'case_drafts', revision.case_drafts);
        recovered = /** @type {any} */ (await advanceStrict(runDirectory));
      } else {
        const baseline = await finish(runDirectory, revision);
        baselineDigest = baseline.bundle_digest;
        baselineOutput = await finishedSnapshot(runDirectory);
        if (descriptor.state === 'case_drafts_before_bundle') {
          const priorCheckpoint = JSON.parse(baselineOutput.checkpointText);
          delete priorCheckpoint.accepted_artifact_digests.case_drafts;
          delete priorCheckpoint.accepted_artifact_digests.test_bundle;
          priorCheckpoint.stage = 'behavior_views';
          priorCheckpoint.input_digest = digest({
            source_revision: 0,
            accepted_artifact_digests: priorCheckpoint.accepted_artifact_digests
          });
          await writeFile(
            path.join(runDirectory, 'checkpoint.json'), `${JSON.stringify(priorCheckpoint)}\n`, 'utf8'
          );
          await removeIfPresent(path.join(runDirectory, 'derived/r000/clarification-state.json'));
          await rm(path.join(runDirectory, 'output'), { recursive: true, force: true });
          await assertExactRunLayout(runDirectory, finishedLayoutWithout(
            'derived/r000/clarification-state.json',
            'output', 'output/r001', 'output/r001/test-bundle.json',
            'output/r001/test-cases.md', 'output/current.json'
          ));
          assert.deepEqual(await readdir(path.join(runDirectory, 'staging')), []);
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'checkpoint.json'), 'utf8'
          )).stage, 'behavior_views');
        } else if (descriptor.state === 'bundle_and_markdown_without_finished_checkpoint') {
          await removeIfPresent(path.join(runDirectory, 'checkpoint.json'));
          await removeIfPresent(path.join(runDirectory, 'output/current.json'));
          await assertExactRunLayout(runDirectory, finishedLayoutWithout(
            'checkpoint.json', 'output/current.json'
          ));
          assert.deepEqual(
            (await readdir(path.join(runDirectory, 'output/r001'))).sort(),
            ['test-bundle.json', 'test-cases.md']
          );
          assert.equal(
            await readFile(path.join(runDirectory, 'output/r001/test-bundle.json'), 'utf8'),
            baselineOutput.bundleText
          );
          assert.equal(
            await readFile(path.join(runDirectory, 'output/r001/test-cases.md'), 'utf8'),
            baselineOutput.markdownText
          );
          await assert.rejects(stat(path.join(runDirectory, 'checkpoint.json')));
          await assert.rejects(stat(path.join(runDirectory, 'output/current.json')));
        } else if (descriptor.state === 'json_bundle_without_markdown') {
          await removeIfPresent(path.join(runDirectory, 'output/r001/test-cases.md'));
          await removeIfPresent(path.join(runDirectory, 'checkpoint.json'));
          await removeIfPresent(path.join(runDirectory, 'output/current.json'));
          await assertExactRunLayout(runDirectory, finishedLayoutWithout(
            'checkpoint.json', 'output/current.json', 'output/r001/test-cases.md'
          ));
          assert.deepEqual(await readdir(path.join(runDirectory, 'output/r001')), [
            'test-bundle.json'
          ]);
          assert.equal(
            await readFile(path.join(runDirectory, 'output/r001/test-bundle.json'), 'utf8'),
            baselineOutput.bundleText
          );
          await assert.rejects(stat(path.join(runDirectory, 'output/r001/test-cases.md')));
          await assert.rejects(stat(path.join(runDirectory, 'checkpoint.json')));
          await assert.rejects(stat(path.join(runDirectory, 'output/current.json')));
        } else if (descriptor.state === 'finished_checkpoint_bundle_missing') {
          await removeIfPresent(path.join(runDirectory, 'output/r001/test-bundle.json'));
          await assertExactRunLayout(runDirectory, finishedLayoutWithout(
            'output/r001/test-bundle.json'
          ));
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'checkpoint.json'), 'utf8'
          )).stage, 'finished');
          await stat(path.join(runDirectory, 'output/r001/test-cases.md'));
          await stat(path.join(runDirectory, 'output/current.json'));
          await assert.rejects(stat(path.join(runDirectory, 'output/r001/test-bundle.json')));
        } else if (descriptor.state === 'finished_checkpoint_bundle_digest_mismatch') {
          await writeFile(
            path.join(runDirectory, 'output/r001/test-bundle.json'),
            '{"tampered":true}\n', 'utf8'
          );
          await assertExactRunLayout(runDirectory, finishedRunLayout);
          assert.notEqual(digest(JSON.parse(await readFile(
            path.join(runDirectory, 'output/r001/test-bundle.json'), 'utf8'
          ))), baselineOutput.bundleDigest);
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'checkpoint.json'), 'utf8'
          )).accepted_artifact_digests.test_bundle, baselineOutput.bundleDigest);
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'output/current.json'), 'utf8'
          )).bundle_digest, baselineOutput.bundleDigest);
        } else if (descriptor.state === 'finished_without_current') {
          await removeIfPresent(path.join(runDirectory, 'output/current.json'));
          await assertExactRunLayout(runDirectory, finishedLayoutWithout(
            'output/current.json'
          ));
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'checkpoint.json'), 'utf8'
          )).stage, 'finished');
          assert.deepEqual(
            (await readdir(path.join(runDirectory, 'output/r001'))).sort(),
            ['test-bundle.json', 'test-cases.md']
          );
          await assert.rejects(stat(path.join(runDirectory, 'output/current.json')));
        } else if (descriptor.state === 'truncated_checkpoint') {
          await writeFile(path.join(runDirectory, 'checkpoint.json'), '{"source_revision":', 'utf8');
          await assertExactRunLayout(runDirectory, finishedRunLayout);
          assert.equal(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'), '{"source_revision":');
          await stat(path.join(runDirectory, 'output/r001/test-bundle.json'));
          await stat(path.join(runDirectory, 'output/r001/test-cases.md'));
          await stat(path.join(runDirectory, 'output/current.json'));
        } else if (descriptor.state === 'old_current') {
          await writeFile(path.join(runDirectory, 'output/current.json'), `${JSON.stringify({
            source_revision: 999,
            bundle_path: path.join(runDirectory, 'output/r999/test-bundle.json'),
            bundle_digest: 'f'.repeat(64),
            markdown_path: path.join(runDirectory, 'output/r999/test-cases.md')
          })}\n`, 'utf8');
          await assertExactRunLayout(runDirectory, finishedRunLayout);
          assert.equal(JSON.parse(await readFile(
            path.join(runDirectory, 'output/current.json'), 'utf8'
          )).source_revision, 999);
          await stat(path.join(runDirectory, 'output/r001/test-bundle.json'));
          await stat(path.join(runDirectory, 'output/r001/test-cases.md'));
        }
      }

      if (!recovered) recovered = /** @type {any} */ (await advanceStrict(runDirectory));
      if (descriptor.expected_status === 'finished'
        && recovered.status === 'need_user_answers'
        && recovered.purpose === 'final_confirmation') {
        const confirmed = structuredClone(revision);
        for (const artifact of [
          confirmed.source_pack, confirmed.evidence_claims,
          confirmed.behavior_views, confirmed.case_drafts
        ]) artifact.source_revision = 1;
        confirmed.source_pack.execution_events.push({
          event_id: 'event_recovery_fixture_confirmation',
          clarification_event_seq: recovered.next_event_seq,
          type: 'confirm_execution_plan', actor: 'owner',
          event_at: '2026-09-03T00:00:00.000Z', authority_scope: '*',
          run_instance_id: confirmed.source_pack.run_instance_id,
          run_identity_digest: recovered.execution_plan.run_identity_digest,
          presented_prompt_id: recovered.prompt_id,
          presented_plan_digest: recovered.execution_plan.plan_digest,
          presented_plan_change_head_seq: recovered.execution_plan.plan_change_head_seq,
          presented_source_revision: recovered.source_revision
        });
        recovered = await submitCompleteRevision(runDirectory, confirmed);
      }
      assert.equal(recovered.status, descriptor.expected_status, JSON.stringify(recovered));
      if (recovered.status === 'finished') {
        assert.equal(recovered.bundle_digest, baselineDigest);
        assert.equal(recovered.source_revision, 1);
        if (!baselineOutput) throw new Error(
          'finished recovery requires an uninterrupted baseline snapshot'
        );
        await assertRecoveredFinishedState(runDirectory, baselineOutput, recovered);
      } else if (descriptor.state.startsWith('new_')) {
        assert.equal(recovered.scope.source_revision, expectedSourceRevision);
        assert.notEqual(recovered.status, 'finished', 'old finished output must not mask a newer accepted revision');
      }
      const entries = await readdir(runDirectory);
      assert.ok(entries.every((/** @type {string} */ name) => !name.includes('.tmp-')), 'atomic recovery must not expose temp files');
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  });
}
