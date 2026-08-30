import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(repositoryRoot, 'test/fixtures/recovery/grounded-revision.json');
const digestB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const digestC = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

/** @returns {Promise<any>} */
async function revisionFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

async function temporaryRun() {
  return mkdtemp(path.join(os.tmpdir(), 'source-revision-'));
}

/** @param {string} runDirectory @param {any} sourcePack */
async function stageSource(runDirectory, sourcePack) {
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(
    path.join(runDirectory, 'staging', STAGE_FILES.source_pack),
    `${JSON.stringify(sourcePack)}\n`, 'utf8'
  );
}

function decision(sequence = 1) {
  return {
    decision_id: `decision_${sequence}`, question_id: `question_${sequence}`,
    root_issue_ids: [`root_${sequence}`], affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: sequence, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: 'What should checkout do?', answer: 'Keep the accepted behavior.',
    disposition: 'final', authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E3'
  };
}

/** @param {string} kind @param {string} sourceId @param {string} contentDigest */
function additionalSource(kind, sourceId, contentDigest) {
  return {
    source_id: sourceId, kind, version: '1', status: 'effective', authority: 'owner',
    content: `${kind} content`, content_digest: contentDigest, scope: 'checkout'
  };
}

/** @param {string} runDirectory @param {any} sourcePack */
async function acceptInitialSource(runDirectory, sourcePack) {
  await stageSource(runDirectory, sourcePack);
  const reply = /** @type {any} */ (await advanceStrict(runDirectory));
  assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
  assert.equal(reply.stage, 'evidence_claims');
}

/** @param {any} reply */
function integrityCodes(reply) {
  return reply.diagnostics.map((/** @type {any} */ item) => item.code);
}

test('one append-only Decision batch creates exactly the next accepted source revision', async () => {
  const runDirectory = await temporaryRun();
  const fixture = await revisionFixture();
  try {
    await acceptInitialSource(runDirectory, fixture.source_pack);
    const next = structuredClone(fixture.source_pack);
    next.source_revision = 1;
    next.decision_records.push(decision());
    await stageSource(runDirectory, next);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.deepEqual(reply.scope, { source_revision: 1 });
    await stat(path.join(runDirectory, 'accepted/r001/source-pack.json'));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

/** @type {Array<{name:string,seed:(pack:any)=>void,mutate:(pack:any)=>void}>} */
const sourceMutations = [
  {
    name: 'primary PRD digest',
    seed(pack) {},
    mutate(pack) { pack.sources[0].content_digest = digestB; }
  },
  {
    name: 'acceptance criteria digest',
    seed(pack) { pack.sources.push(additionalSource('acceptance-criteria', 'source_acceptance', digestB)); },
    mutate(pack) { pack.sources[1].content_digest = digestC; }
  },
  {
    name: 'interface contract digest',
    seed(pack) { pack.sources.push(additionalSource('interface-contract', 'source_contract', digestB)); },
    mutate(pack) { pack.sources[1].content_digest = digestC; }
  },
  {
    name: 'added supplementary source',
    seed(pack) {},
    mutate(pack) { pack.sources.push(additionalSource('review-record', 'source_review', digestB)); }
  },
  {
    name: 'removed supplementary source',
    seed(pack) { pack.sources.push(additionalSource('review-record', 'source_review', digestB)); },
    mutate(pack) { pack.sources.pop(); }
  }
];
for (const mutation of sourceMutations) {
  test(`source revision rejects ${mutation.name} with the frozen new-run contract`, async () => {
    const runDirectory = await temporaryRun();
    const fixture = await revisionFixture();
    mutation.seed(fixture.source_pack);
    try {
      await acceptInitialSource(runDirectory, fixture.source_pack);
      const next = structuredClone(fixture.source_pack);
      next.source_revision = 1;
      next.decision_records.push(decision());
      mutation.mutate(next);
      await stageSource(runDirectory, next);
      const first = /** @type {any} */ (await advanceStrict(runDirectory));
      const second = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(first.status, 'fatal');
      assert.deepEqual(second, first, 'same invalid source digest must be deterministic');
      assert.deepEqual(integrityCodes(first), ['RUN_INTEGRITY_ERROR', 'NEW_RUN_REQUIRED']);
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  });
}

test('source revision rejects history modification, deletion, reordering, and event sequence reuse', async () => {
  /** @type {Array<[string,(next:any)=>void]>} */
  const variants = [
    ['modified', (next) => { next.decision_records[0].answer = 'changed'; }],
    ['deleted', (next) => { next.decision_records.pop(); }],
    ['reordered', (next) => { next.decision_records.reverse(); }],
    ['decision identity reuse', (next) => {
      next.decision_records[next.decision_records.length - 1].decision_id = 'decision_1';
    }],
    ['sequence reuse', (next) => { next.clarification_events.push({
      event_id: 'event_reopen', clarification_event_seq: 2, type: 'reopen_root_issues',
      actor: 'owner', event_at: '2026-08-30', root_issue_ids: ['root_1']
    }); }]
  ];
  for (const [name, mutate] of variants) {
    const runDirectory = await temporaryRun();
    const fixture = await revisionFixture();
    fixture.source_pack.source_revision = 0;
    fixture.source_pack.decision_records = [decision(1), decision(2)];
    try {
      await acceptInitialSource(runDirectory, fixture.source_pack);
      const next = structuredClone(fixture.source_pack);
      next.source_revision = 1;
      next.decision_records.push(decision(3));
      mutate(next);
      await stageSource(runDirectory, next);
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(reply.status, 'fatal', name);
      assert.equal(integrityCodes(reply)[0], 'RUN_INTEGRITY_ERROR', name);
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('immutable source replacement outranks policy diagnostics and is never promoted', async () => {
  const runDirectory = await temporaryRun();
  const fixture = await revisionFixture();
  try {
    await acceptInitialSource(runDirectory, fixture.source_pack);
    const next = structuredClone(fixture.source_pack);
    next.source_revision = 1;
    next.sources[0].source_id = 'source_replaced';
    next.decision_records.push(decision(1));
    await stageSource(runDirectory, next);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.deepEqual(integrityCodes(reply), ['RUN_INTEGRITY_ERROR', 'NEW_RUN_REQUIRED']);
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('malformed next source is a schema revision request before immutable comparison', async () => {
  const runDirectory = await temporaryRun();
  const fixture = await revisionFixture();
  try {
    await acceptInitialSource(runDirectory, fixture.source_pack);
    await stageSource(runDirectory, {});
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'source_pack');
    assert.ok(reply.diagnostics.length > 0);
    assert.ok(reply.diagnostics.every((/** @type {any} */ item) => (
      item.code !== 'NEW_RUN_REQUIRED'
    )));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('initial clarification control history is never silently treated as already applied', async () => {
  const runDirectory = await temporaryRun();
  const fixture = await revisionFixture();
  fixture.source_pack.clarification_events.push({
    event_id: 'event_initial', clarification_event_seq: 1, type: 'reopen_root_issues',
    actor: 'owner', event_at: '2026-08-30', root_issue_ids: ['root_never_existed']
  });
  try {
    /** @type {any} */
    let reply;
    for (const stageName of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
      const typedStage = /** @type {keyof typeof STAGE_FILES} */ (stageName);
      await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
      await writeFile(
        path.join(runDirectory, 'staging', STAGE_FILES[typedStage]),
        `${JSON.stringify(fixture[typedStage])}\n`, 'utf8'
      );
      reply = await advanceStrict(runDirectory);
    }
    assert.notEqual(reply.status, 'finished', JSON.stringify(reply));
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'source_pack');
    assert.ok(reply.diagnostics.some((/** @type {any} */ item) => (
      item.code === 'INITIAL_CLARIFICATION_HISTORY_UNSUPPORTED'
    )), JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('initial Decision and control history must start at one and be globally contiguous', async () => {
  for (const mutate of [
    (/** @type {any} */ pack) => { pack.decision_records = [decision(2)]; },
    (/** @type {any} */ pack) => { pack.clarification_events = [{
      event_id: 'event_gap', clarification_event_seq: 100, type: 'reopen_root_issues',
      actor: 'owner', event_at: '2026-08-30', root_issue_ids: ['root_never_existed']
    }]; }
  ]) {
    const runDirectory = await temporaryRun();
    const fixture = await revisionFixture();
    try {
      mutate(fixture.source_pack);
      await stageSource(runDirectory, fixture.source_pack);
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(reply.status, 'fatal', JSON.stringify(reply));
      assert.equal(integrityCodes(reply)[0], 'RUN_INTEGRITY_ERROR');
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('accepted recovery requires r000, consecutive directories, and matching artifact revisions', async () => {
  const fixture = await revisionFixture();
  const cases = [
    {
      name: 'orphan r999',
      setup: async (/** @type {string} */ runDirectory) => {
        const source = structuredClone(fixture.source_pack);
        source.source_revision = 999;
        await mkdir(path.join(runDirectory, 'accepted/r999'), { recursive: true });
        await writeFile(path.join(runDirectory, 'accepted/r999/source-pack.json'), `${JSON.stringify(source)}\n`);
      }
    },
    {
      name: 'gap r000 to r002',
      setup: async (/** @type {string} */ runDirectory) => {
        await mkdir(path.join(runDirectory, 'accepted/r000'), { recursive: true });
        await writeFile(path.join(runDirectory, 'accepted/r000/source-pack.json'), `${JSON.stringify(fixture.source_pack)}\n`);
        const source = structuredClone(fixture.source_pack);
        source.source_revision = 2;
        source.decision_records.push(decision(1));
        await mkdir(path.join(runDirectory, 'accepted/r002'), { recursive: true });
        await writeFile(path.join(runDirectory, 'accepted/r002/source-pack.json'), `${JSON.stringify(source)}\n`);
      }
    },
    {
      name: 'accepted evidence revision mismatch',
      setup: async (/** @type {string} */ runDirectory) => {
        await mkdir(path.join(runDirectory, 'accepted/r000'), { recursive: true });
        await writeFile(path.join(runDirectory, 'accepted/r000/source-pack.json'), `${JSON.stringify(fixture.source_pack)}\n`);
        const evidence = structuredClone(fixture.evidence_claims);
        evidence.source_revision = 999;
        await writeFile(path.join(runDirectory, 'accepted/r000/evidence-claims.json'), `${JSON.stringify(evidence)}\n`);
      }
    }
  ];
  for (const item of cases) {
    const runDirectory = await temporaryRun();
    try {
      await item.setup(runDirectory);
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(reply.status, 'fatal', `${item.name}: ${JSON.stringify(reply)}`);
      assert.equal(integrityCodes(reply)[0], 'RUN_INTEGRITY_ERROR', item.name);
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('accepted recovery validates append-only integrity at every historical hop', async () => {
  const runDirectory = await temporaryRun();
  const fixture = await revisionFixture();
  try {
    await mkdir(path.join(runDirectory, 'accepted/r000'), { recursive: true });
    await writeFile(path.join(runDirectory, 'accepted/r000/source-pack.json'), `${JSON.stringify(fixture.source_pack)}\n`);
    const one = structuredClone(fixture.source_pack);
    one.source_revision = 1;
    one.decision_records.push(decision(1));
    await mkdir(path.join(runDirectory, 'accepted/r001'), { recursive: true });
    await writeFile(path.join(runDirectory, 'accepted/r001/source-pack.json'), `${JSON.stringify(one)}\n`);
    const two = structuredClone(one);
    two.source_revision = 2;
    two.decision_records[0].answer = 'historically rewritten';
    two.decision_records.push(decision(2));
    await mkdir(path.join(runDirectory, 'accepted/r002'), { recursive: true });
    await writeFile(path.join(runDirectory, 'accepted/r002/source-pack.json'), `${JSON.stringify(two)}\n`);
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(integrityCodes(reply)[0], 'RUN_INTEGRITY_ERROR');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
