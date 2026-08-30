import assert from 'node:assert/strict';
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
import { acquireRunLock, STAGE_FILES } from '../../src/run-store.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const rename = fsPromises.rename;
const symlink = fsPromises.symlink;
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
    const nextSource = revisionOneSource(revision);
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
  child.on('message', (/** @type {unknown} */ value) => {
    if (typeof value === 'string' && messageResolvers[value]) messageResolvers[value]();
  });
  const closed = new Promise((resolve) => child.on(
    'close', (/** @type {number|null} */ code) => resolve(code)
  ));
  try {
    await ready;
    child.send('GO');
    await startedSignal;
    const startedAt = Date.now();
    const releaseContender = await acquireRunLock(runDirectory);
    const waitedMs = Date.now() - startedAt;
    assert.ok(waitedMs >= 2_800, `contender reclaimed a live holder after only ${waitedMs}ms`);
    await released;
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
  } finally {
    Worker.prototype.postMessage = originalPostMessage;
  }
  try {
    const release = await faultingAcquire(runDirectory);
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

test('acquisition refuses a heartbeat worker that exits during readiness', async () => {
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
    await assert.rejects(
      faultingAcquire(runDirectory), /heartbeat worker exited unexpectedly/u
    );
    await assert.rejects(stat(lockDirectory), { code: 'ENOENT' });
  } finally {
    Worker.prototype.on = originalOn;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('heartbeat worker boots when eval syntax detection is disabled', async () => {
  const runDirectory = await temporaryRun();
  const program = `
    import { acquireRunLock } from ${JSON.stringify(path.join(repositoryRoot, 'src/run-store.mjs'))};
    const release = await acquireRunLock(${JSON.stringify(runDirectory)});
    await release();
  `;
  const child = spawn(process.execPath, [
    '--no-experimental-detect-module', '--input-type=module', '-e', program
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

test('a different live PID with a static forged heartbeat cannot impersonate the owner', { timeout: 10_000 }, async () => {
  const runDirectory = await temporaryRun();
  const lockDirectory = path.join(runDirectory, '.compiler-advance.lock');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
  try {
    assert.ok(child.pid);
    await mkdir(lockDirectory);
    await writeFile(path.join(lockDirectory, 'owner.json'), `${JSON.stringify({
      pid: child.pid, token: 'reused-external-pid', lease_expires_at_ms: Date.now() + 60_000,
      process_start_identity: `${child.pid}:forged-start`, heartbeat_seq: 7
    })}\n`, 'utf8');
    const contender = acquireRunLock(runDirectory);
    const release = await Promise.race([
      contender,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 600))
    ]);
    if (release === 'waiting') {
      await rm(lockDirectory, { recursive: true, force: true });
      const lateRelease = await contender;
      await lateRelease();
    }
    assert.notEqual(release, 'waiting', 'an unrelated live PID impersonated the compiler owner');
    if (release !== 'waiting') await (/** @type {()=>Promise<void>} */ (release))();
  } finally {
    child.kill();
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('accepted artifact resolves its stale promotion claim before a newer canonical staging file', async () => {
  const runDirectory = await temporaryRun();
  const revision = await revisionFixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((/** @type {any} */ (await advanceStrict(runDirectory))).stage, 'evidence_claims');
    const nextSource = revisionOneSource(revision);
    await writeFile(
      path.join(runDirectory, 'staging/.source-pack.json.claim-424242-1'),
      `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
    );
    await stage(runDirectory, 'source_pack', nextSource);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.deepEqual(reply.scope, { source_revision: 1 });
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
