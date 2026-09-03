import assert from 'node:assert/strict';
import {
  mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const witnessSource = path.join(repositoryRoot, 'benchmark/operator-witness.mjs');
const cryptoModule = /** @type {any} */ (await import('node:crypto'));
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const randomUUID = cryptoModule.randomUUID ?? cryptoModule.default.randomUUID;
const link = fsPromises.link;
const builderSource = path.join(repositoryRoot, 'benchmark/build-capture-ledger.mjs');
const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;

/** @param {string} caseId */
function agentForCase(caseId) {
  if (caseId.startsWith('PF-TR-') || caseId.startsWith('PF-ID-')) return '/root/formal_defect_gate_audit';
  if (caseId.startsWith('PF-WF-') || caseId.startsWith('PF-FM-')) return '/root/time_quota_defect_expansion';
  return '/root/time_quota_defect_expansion/standards_review';
}

/** @param {string} caseId @param {number} repeat @param {Record<string, unknown>} [overrides] */
function transcript(caseId, repeat, overrides = {}) {
  return {
    schema_version: '1.0.0',
    capture_id: `${caseId}-r${repeat}`,
    case_id: caseId,
    system: 'generate-test-cases',
    repeat,
    session_id: `session-${caseId}-${repeat}`,
    source_sha256: 'a'.repeat(64),
    task_sha256: 'b'.repeat(64),
    runtime_revision: 'c'.repeat(40),
    artifact_digests: {
      compiler: 'd'.repeat(64), schema: 'e'.repeat(64),
      schema_manifest: 'f'.repeat(64), skill: '1'.repeat(64), bundle: '2'.repeat(64)
    },
    operator_witness: {
      method: 'operator-observed-codex-subagent-v1',
      operator_task_id: '/root',
      agent_task_id: agentForCase(caseId),
      observation_id: `observation-${caseId}-${repeat}`
    },
    events: [{
      stage: 'case_drafts', artifact: {}, reply: { status: 'finished' }
    }],
    ...overrides
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'capture-ledger-builder-'));
  const releaseRoot = path.join(root, 'benchmark/release/v1');
  const workRoot = path.join(releaseRoot, 'operator-work');
  const evidenceRoot = path.join(releaseRoot, 'evidence');
  const ledgerPath = path.join(releaseRoot, 'captures.json');
  const manifestPath = path.join(releaseRoot, 'manifest.json');
  const catalogPath = path.join(root, 'benchmark/public-pilot/v1/catalog.json');
  const copiedBuilder = path.join(root, 'benchmark/build-capture-ledger.mjs');
  const caseIds = ['TR', 'ID', 'WF', 'FM', 'AS', 'TM'].flatMap((prefix) =>
    Array.from({ length: 5 }, (_, index) => `PF-${prefix}-${String(index + 1).padStart(2, '0')}`)
  );
  await mkdir(workRoot, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(copiedBuilder, await readFile(builderSource));
  await writeFile(path.join(root, 'benchmark/operator-witness.mjs'), await readFile(witnessSource));
  await writeFile(catalogPath, `${JSON.stringify({
    items: caseIds.map((pilot_id) => ({ pilot_id, status: 'pilot-admitted' }))
  })}\n`);
  await writeFile(path.join(evidenceRoot, 'sentinel.txt'), 'old-evidence\n');
  await writeFile(ledgerPath, 'old-ledger\n');
  await writeFile(manifestPath, `${JSON.stringify({ capture_ledger: { sha256: '0'.repeat(64) } })}\n`);
  for (const caseId of caseIds) {
    for (let repeat = 1; repeat <= 3; repeat += 1) {
      const filename = path.join(workRoot, caseId.toLowerCase(), `repeat-${repeat}`, 'transcript.json');
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, `${JSON.stringify(transcript(caseId, repeat))}\n`);
    }
  }
  const module = await import(`${pathToFileURL(copiedBuilder).href}?fixture=${randomUUID()}`);
  return {
    root, releaseRoot, workRoot, evidenceRoot, ledgerPath, manifestPath, caseIds,
    buildCaptureLedger: module.buildCaptureLedger
  };
}

/** @param {Awaited<ReturnType<typeof fixture>>} setup */
async function oldOutputs(setup) {
  return {
    evidence: await readFile(path.join(setup.evidenceRoot, 'sentinel.txt'), 'utf8'),
    ledger: await readFile(setup.ledgerPath, 'utf8'),
    manifest: await readFile(setup.manifestPath, 'utf8')
  };
}

/** @param {Awaited<ReturnType<typeof fixture>>} setup @param {Awaited<ReturnType<typeof oldOutputs>>} before */
async function assertOutputsUnchanged(setup, before) {
  assert.equal(await readFile(path.join(setup.evidenceRoot, 'sentinel.txt'), 'utf8'), before.evidence);
  assert.equal(await readFile(setup.ledgerPath, 'utf8'), before.ledger);
  assert.equal(await readFile(setup.manifestPath, 'utf8'), before.manifest);
  assert.deepEqual(await readdir(setup.evidenceRoot), ['sentinel.txt']);
}

test('builds the exact catalog case by repeat set and replaces old outputs only after staging', async (/** @type {any} */ context) => {
  const setup = await fixture();
  context.after(() => rm(setup.root, { recursive: true, force: true }));

  const result = await setup.buildCaptureLedger();
  const ledger = JSON.parse(await readFile(setup.ledgerPath, 'utf8'));

  assert.equal(result.captures, 90);
  assert.equal(ledger.captures.length, 90);
  assert.equal((await readdir(setup.evidenceRoot)).includes('sentinel.txt'), false);
  assert.equal(
    JSON.parse(await readFile(path.join(setup.evidenceRoot, 'pf-tr-01/repeat-1/transcript.json'), 'utf8')).case_id,
    'PF-TR-01'
  );
  assert.deepEqual(
    (await readdir(setup.releaseRoot)).filter((/** @type {string} */ entry) => entry.startsWith('.capture-ledger-')),
    []
  );
});

test('rejects a late invalid transcript and leaves evidence, ledger, and manifest unchanged', async (/** @type {any} */ context) => {
  const setup = await fixture();
  context.after(() => rm(setup.root, { recursive: true, force: true }));
  const before = await oldOutputs(setup);
  const filename = path.join(setup.workRoot, 'pf-wf-05/repeat-3/transcript.json');
  const invalid = transcript('PF-WF-05', 3);
  invalid.operator_witness.agent_task_id = '/root/unapproved-agent';
  await writeFile(filename, `${JSON.stringify(invalid)}\n`);

  await assert.rejects(setup.buildCaptureLedger(), /Agent|transcript|allowlist/iu);
  await assertOutputsUnchanged(setup, before);
});

test('rejects traversal and duplicate catalog case-repeat identities before writing', async (/** @type {any} */ context) => {
  const setup = await fixture();
  context.after(() => rm(setup.root, { recursive: true, force: true }));
  const before = await oldOutputs(setup);
  const filename = path.join(setup.workRoot, 'pf-tm-05/repeat-3/transcript.json');
  await writeFile(filename, `${JSON.stringify(transcript('../escaped', 3, {
    capture_id: 'traversal-r3', session_id: 'traversal-session',
    operator_witness: {
      method: 'operator-observed-codex-subagent-v1', operator_task_id: '/root',
      agent_task_id: '/root/time_quota_defect_expansion', observation_id: 'traversal-observation'
    }
  }))}\n`);

  await assert.rejects(setup.buildCaptureLedger(), /case|path|catalog/iu);
  await assertOutputsUnchanged(setup, before);
  await assert.rejects(readFile(path.join(setup.releaseRoot, 'escaped/repeat-3/transcript.json')));

  await writeFile(filename, `${JSON.stringify(transcript('PF-TR-01', 1, {
    capture_id: 'duplicate-pair', session_id: 'duplicate-pair-session',
    operator_witness: {
      method: 'operator-observed-codex-subagent-v1', operator_task_id: '/root',
      agent_task_id: '/root/formal_defect_gate_audit', observation_id: 'duplicate-pair-observation'
    }
  }))}\n`);
  await assert.rejects(setup.buildCaptureLedger(), /case|repeat|duplicate/iu);
  await assertOutputsUnchanged(setup, before);
});

test('rejects transcript symlinks, hardlinks, and oversized bytes', async (/** @type {any} */ context) => {
  await context.test('symlink', async (/** @type {any} */ childContext) => {
    const setup = await fixture();
    childContext.after(() => rm(setup.root, { recursive: true, force: true }));
    const before = await oldOutputs(setup);
    const external = path.join(setup.root, 'external-symlink-transcript.json');
    await writeFile(external, `${JSON.stringify(transcript('PF-TR-01', 1))}\n`);
    const linkPath = path.join(setup.workRoot, 'extra/transcript.json');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(external, linkPath);

    await assert.rejects(setup.buildCaptureLedger(), /symbolic|regular|link/iu);
    await assertOutputsUnchanged(setup, before);
  });

  await context.test('hardlink', async (/** @type {any} */ childContext) => {
    const setup = await fixture();
    childContext.after(() => rm(setup.root, { recursive: true, force: true }));
    const before = await oldOutputs(setup);
    const filename = path.join(setup.workRoot, 'pf-tm-05/repeat-3/transcript.json');
    const external = path.join(setup.root, 'external-hardlink-transcript.json');
    await rm(filename);
    await writeFile(external, `${JSON.stringify(transcript('PF-TM-05', 3))}\n`);
    await link(external, filename);

    await assert.rejects(setup.buildCaptureLedger(), /singly linked|hardlink|link/iu);
    await assertOutputsUnchanged(setup, before);
  });

  await context.test('oversized', async (/** @type {any} */ childContext) => {
    const setup = await fixture();
    childContext.after(() => rm(setup.root, { recursive: true, force: true }));
    const before = await oldOutputs(setup);
    const filename = path.join(setup.workRoot, 'pf-tm-05/repeat-3/transcript.json');
    const oversized = transcript('PF-TM-05', 3);
    oversized.events[0].artifact = { padding: 'x'.repeat(MAX_TRANSCRIPT_BYTES) };
    await writeFile(filename, `${JSON.stringify(oversized)}\n`);

    await assert.rejects(setup.buildCaptureLedger(), /size|large|limit/iu);
    await assertOutputsUnchanged(setup, before);
  });
});
