import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { stableId } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(repositoryRoot, 'test/fixtures/recovery/grounded-revision.json');
const entryPath = path.join(repositoryRoot, 'src/entry.mjs');
const stdoutFailurePreload = path.join(
  repositoryRoot, 'test/fixtures/recovery/stdout-write-failure.cjs'
);

/** @returns {Promise<any>} */
async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

/** @param {string} [label] */
async function temporaryRun(label = 'stage progression') {
  return mkdtemp(path.join(os.tmpdir(), `${label} 空格-测试-`));
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stageName @param {any} artifact */
async function stage(runDirectory, stageName, artifact) {
  const staging = path.join(runDirectory, 'staging');
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, STAGE_FILES[stageName]), `${JSON.stringify(artifact)}\n`, 'utf8');
}

/** @param {string} runDirectory @returns {Promise<any>} */
async function advance(runDirectory) { return advanceStrict(runDirectory); }

/** @param {string} runDirectory @param {any} revision */
async function submitCompleteRevision(runDirectory, revision) {
  /** @type {Array<keyof typeof STAGE_FILES>} */
  const stages = ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'];
  let reply;
  for (const stageName of stages) {
    await stage(runDirectory, stageName, revision[stageName]);
    reply = await advance(runDirectory);
  }
  return reply;
}

/** @param {any} revision */
function makeAnswerableConflict(revision) {
  revision.source_pack.sources.push({
    source_id: 'source_old', kind: 'formal-rule', version: '0', status: 'effective',
    authority: 'owner', content: 'checkout rejected',
    content_digest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    scope: 'checkout'
  });
  revision.source_pack.source_policy.rules.push({
    rule_id: 'policy_old', source_ids: ['source_old'], scope: 'checkout',
    authority: 'owner', status: 'effective'
  });
  revision.source_pack.decision_records = [{
    decision_id: 'decision_checkout', question_id: 'question_temp',
    root_issue_ids: ['root_unrelated'], affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: 'Temporary checkout?', answer: 'checkout accepted', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_checkout',
    evidence_level: 'E1'
  }];
  const claim = revision.evidence_claims.claims[0];
  delete claim.source_id;
  Object.assign(claim, {
    claim_form: 'decision-record', level: 'E1', kind: 'assumption',
    decision_id: 'decision_checkout', authority: 'checkout'
  });
  revision.case_drafts.cases[0].temporary_assumption = {
    claim_id: 'claim_checkout',
    invalidation_condition: 'A final rule replaces this temporary decision.'
  };
  return revision;
}

/** @param {any} revision @param {number} sourceRevision */
function setRevision(revision, sourceRevision) {
  for (const stageName of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
    revision[stageName].source_revision = sourceRevision;
  }
}

test('real advanceStrict progresses every fixed artifact stage and atomically publishes output', async () => {
  const runDirectory = await temporaryRun();
  const revision = await fixture();
  try {
    assert.deepEqual(await advance(runDirectory), {
      status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json',
      scope: { source_revision: 0 }, diagnostics: []
    });

    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));

    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    assert.equal((await advance(runDirectory)).stage, 'behavior_views');

    await stage(runDirectory, 'behavior_views', revision.behavior_views);
    const caseRequest = await advance(runDirectory);
    assert.equal(caseRequest.status, 'need_artifact');
    assert.equal(caseRequest.stage, 'case_drafts');
    const derived = JSON.parse(await readFile(
      path.join(runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
    assert.equal(derived.obligations.length, 1);
    assert.equal(derived.obligations[0].obligation_id, 'obligation_8cc31c1b2773c94c');

    await stage(runDirectory, 'case_drafts', revision.case_drafts);
    const finished = await advance(runDirectory);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.source_revision, 0);
    assert.equal(finished.bundle_path, path.join(runDirectory, 'output/r000/test-bundle.json'));
    assert.equal(finished.markdown_path, path.join(runDirectory, 'output/r000/test-cases.md'));
    assert.deepEqual(JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8')), {
      source_revision: 0,
      bundle_path: finished.bundle_path,
      bundle_digest: finished.bundle_digest,
      markdown_path: finished.markdown_path
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('invalid staging is deterministic and cannot move accepted state or checkpoint', async () => {
  const runDirectory = await temporaryRun('invalid staging');
  const revision = await fixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    const checkpointBefore = await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8');
    await stage(runDirectory, 'evidence_claims', {});
    const first = await advance(runDirectory);
    const second = await advance(runDirectory);
    assert.equal(first.status, 'need_revision');
    assert.equal(first.stage, 'evidence_claims');
    assert.deepEqual(second, first);
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
    assert.equal(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'), checkpointBefore);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('semantically invalid behavior staging is never promoted before derived obligations validate', async () => {
  const runDirectory = await temporaryRun('invalid behavior');
  const revision = await fixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    await advance(runDirectory);
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    await advance(runDirectory);
    const checkpointBefore = await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8');
    revision.behavior_views.interaction_matrix = [];
    await stage(runDirectory, 'behavior_views', revision.behavior_views);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/behavior-views.json')));
    assert.equal(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'), checkpointBefore);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

/** @param {string[]} args @param {{cwd:string,env?:Record<string,string|undefined>}} options @returns {Promise<any>} */
function spawnEntry(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
}

test('private subprocess works from arbitrary cwd and paths with spaces and non-ASCII', async () => {
  const runDirectory = await temporaryRun('任意 cwd');
  const cwd = await temporaryRun('调用目录');
  try {
    const result = await spawnEntry([runDirectory], { cwd });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = JSON.parse(result.stdout);
    assert.equal(reply.status, 'need_artifact');
    assert.equal(reply.stage, 'source_pack');
    assert.equal(result.stdout.trimEnd().split('\n').length, 1);

    const fatal = await spawnEntry(['relative-run'], { cwd });
    assert.equal(fatal.code, 0, fatal.stderr);
    assert.equal(JSON.parse(fatal.stdout).status, 'fatal');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('private subprocess returns all five workflow statuses with exit zero', async () => {
  const cwd = await temporaryRun('五状态 cwd');
  const empty = await temporaryRun('need artifact');
  const invalid = await temporaryRun('need revision');
  const finishedDirectory = await temporaryRun('finished');
  const clarificationDirectory = await temporaryRun('need answers');
  try {
    await stage(invalid, 'source_pack', {});
    await submitCompleteRevision(finishedDirectory, await fixture());
    const clarification = await submitCompleteRevision(
      clarificationDirectory, makeAnswerableConflict(await fixture())
    );
    assert.equal(clarification.status, 'need_user_answers', JSON.stringify(clarification));

    const inputs = [
      [empty, 'need_artifact'], [invalid, 'need_revision'],
      [finishedDirectory, 'finished'], [clarificationDirectory, 'need_user_answers'],
      ['relative-run', 'fatal']
    ];
    for (const [runDirectory, expectedStatus] of inputs) {
      const result = await spawnEntry([runDirectory], { cwd });
      assert.equal(result.code, 0, `${expectedStatus}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).status, expectedStatus);
    }
  } finally {
    for (const directory of [cwd, empty, invalid, finishedDirectory, clarificationDirectory]) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('private subprocess uses nonzero exit only when it cannot form a JSON reply', async () => {
  const cwd = await temporaryRun('process failure cwd');
  const runDirectory = await temporaryRun('process failure run');
  try {
    const result = await spawnEntry([runDirectory], {
      cwd,
      env: { ...process.env, NODE_OPTIONS: `--require ${stdoutFailurePreload}` }
    });
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /simulated stdout transport failure/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a higher resolved revision atomically replaces the current final output', async () => {
  const runDirectory = await temporaryRun('revision output switch');
  try {
    const firstRevision = makeAnswerableConflict(await fixture());
    const pending = await submitCompleteRevision(runDirectory, firstRevision);
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const blocker = pending.blockers[0];

    const secondRevision = structuredClone(firstRevision);
    setRevision(secondRevision, 1);
    const finalDecision = {
      decision_id: 'decision_checkout_final',
      question_id: stableId('question', { root_issue_ids: [blocker.root_issue_id] }),
      root_issue_ids: [blocker.root_issue_id],
      affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
      clarification_event_seq: 2, confirmer: 'owner', confirmed_at: '2026-08-30',
      question: blocker.question, answer: 'checkout accepted', disposition: 'final',
      authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_checkout', evidence_level: 'E3'
    };
    secondRevision.source_pack.decision_records.push(finalDecision);
    Object.assign(secondRevision.evidence_claims.claims[0], {
      claim_form: 'decision-record', level: 'E3', kind: 'requirement',
      decision_id: finalDecision.decision_id, authority: 'checkout'
    });
    delete secondRevision.case_drafts.cases[0].temporary_assumption;
    const finished = await submitCompleteRevision(runDirectory, secondRevision);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.source_revision, 1);
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.source_revision, 1);
    assert.equal(current.bundle_digest, finished.bundle_digest);
    assert.match(current.bundle_path, /output\/r001\/test-bundle\.json$/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('outer run boundary rejects mutable collection intrinsics without executing caller code', async () => {
  const methods = ['sort', 'map', 'some', 'filter', 'slice', 'includes', 'reverse', 'push'];
  for (const method of methods) {
    const runDirectory = await temporaryRun(`intrinsic ${method}`);
    const arrayPrototype = /** @type {any} */ (Array.prototype);
    const original = arrayPrototype[method];
    let calls = 0;
    arrayPrototype[method] = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(original, this, args);
    };
    try {
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(calls, 0, `${method} caller code executed`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    } finally {
      arrayPrototype[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('outer run boundary rejects mutable string and collection accessors before traversal', async () => {
  /** @type {Array<[any,string]>} */
  const methodCases = [
    [String.prototype, 'split'], [String.prototype, 'includes'], [String.prototype, 'startsWith'],
    [String.prototype, 'padStart']
  ];
  for (const [owner, method] of methodCases) {
    const runDirectory = await temporaryRun(`intrinsic ${String(method)}`);
    const record = /** @type {any} */ (owner);
    const original = record[method];
    let calls = 0;
    record[method] = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(original, this, args);
    };
    try {
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(calls, 0, `${String(method)} caller code executed`);
      assert.equal(reply.status, 'fatal', JSON.stringify(reply));
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    } finally {
      record[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun('intrinsic set size');
  const originalSize = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(Set.prototype, 'size')
  );
  assert.ok(originalSize?.get);
  const originalSizeGetter = /** @type {Function} */ (originalSize.get);
  let getterCalls = 0;
  try {
    Object.defineProperty(Set.prototype, 'size', {
      configurable: true,
      get() { getterCalls += 1; return Reflect.apply(originalSizeGetter, this, []); }
    });
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(getterCalls, 0);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
  } finally {
    Object.defineProperty(Set.prototype, 'size', originalSize);
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('intrinsic mutation during the first await cannot execute caller code or accept input', async () => {
  const runDirectory = await temporaryRun('intrinsic toctou');
  const revision = await fixture();
  const originalSort = Array.prototype.sort;
  let calls = 0;
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const pending = advanceStrict(runDirectory);
    Array.prototype.sort = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(originalSort, this, args);
    };
    const reply = /** @type {any} */ (await pending);
    assert.equal(calls, 0, 'caller sort must not run after the initial async boundary');
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
  } finally {
    Array.prototype.sort = originalSort;
    await rm(runDirectory, { recursive: true, force: true });
  }
});
