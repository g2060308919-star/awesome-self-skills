import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { digest } from '../../src/canonical.mjs';
import { start } from '../helpers/remediation-stage-fixture.mjs';
import { startImageBaseline } from '../helpers/v4-material-recovery-fixture.mjs';

const api = /** @type {any} */ (await import(process.env.GTC_RECOVERY_RUNNER
  ? pathToFileURL(process.env.GTC_RECOVERY_RUNNER).href : '../../src/entry.mjs'));

/** @param {string} directory @returns {Promise<Record<string,string>>} */
async function snapshot(directory) {
  const result = /** @type {Record<string,string>} */ ({});
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of Object.entries(await snapshot(target))) result[`${entry.name}/${name}`] = bytes;
    } else result[entry.name] = (await readFile(target)).toString('hex');
  }
  return result;
}

/** @param {string} directory */
async function stageRepair(directory) {
  const source = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'));
  const evidence = JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json'), 'utf8'));
  const candidate = structuredClone(source);
  candidate.source_revision = 1;
  candidate.artifact_repairs = [{ repair_seq: 1, base_source_revision: 0,
    stage: 'evidence_claims', accepted_artifact_digest: digest(evidence), reason: 'Synthetic extraction repair regression' }];
  await writeFile(path.join(directory, 'staging/source-pack.json'), JSON.stringify(candidate));
  const reply = await api.advanceStrict(directory);
  assert.equal(reply.stage, 'evidence_claims', JSON.stringify(reply));
  assert.equal(reply.scope.source_revision, 1);
  const { schema_version, source_revision, ...payload } = evidence;
  return { candidate, source, evidence, payload, reply };
}

test('Evidence repair helper prepares the requested next revision read-only and supports a rejected Evidence correction', async (/** @type {any} */ t) => {
  const { dir } = await start(t, { api });
  const { source, evidence, payload, reply } = await stageRepair(dir);
  const before = await snapshot(dir);
  const prepared = await api.prepareStageArtifact(dir, reply, { stage: 'evidence_claims', payload });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  assert.deepEqual(prepared.artifact, { ...evidence, source_revision: 1 });
  assert.deepEqual(await snapshot(dir), before);

  const invalid = structuredClone(prepared.artifact);
  invalid.claims[0].source_locator_ids = ['LOC-absent'];
  await writeFile(path.join(dir, 'staging/evidence-claims.json'), JSON.stringify(invalid));
  const rejected = await api.advanceStrict(dir);
  assert.equal(rejected.stage, 'evidence_claims', JSON.stringify(rejected));
  assert.ok(rejected.diagnostics.length);
  const rejectedSnapshot = await snapshot(dir);
  const corrected = await api.prepareStageArtifact(dir, rejected, { stage: 'evidence_claims', payload });
  assert.equal(corrected.status, 'prepared', JSON.stringify(corrected));
  assert.deepEqual(await snapshot(dir), rejectedSnapshot);
  await writeFile(path.join(dir, 'staging/evidence-claims.json'), JSON.stringify(corrected.artifact));
  const advanced = await api.advanceStrict(dir);
  assert.equal(advanced.stage, 'behavior_views', JSON.stringify(advanced));
  assert.equal(advanced.scope.source_revision, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'accepted/r000/source-pack.json'), 'utf8')), source);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'accepted/r001/evidence-claims.json'), 'utf8')), corrected.artifact);
  const stale = await api.prepareStageArtifact(dir, reply, { stage: 'evidence_claims', payload });
  assert.equal(stale.status, 'invalid');
  await assert.rejects(readFile(path.join(dir, 'accepted/r002/source-pack.json')), { code: 'ENOENT' });
});

test('Evidence repair helper rejects missing or invalid repair bases and forged requests without writes', async (/** @type {any} */ t) => {
  const { dir } = await start(t, { api });
  const { candidate, payload, reply } = await stageRepair(dir);
  /** @param {any} request */
  const reject = async request => {
    const before = await snapshot(dir);
    const result = await api.prepareStageArtifact(dir, request, { stage: 'evidence_claims', payload });
    assert.equal(result.status, 'invalid', JSON.stringify(result));
    assert.equal(result.artifact, undefined);
    assert.deepEqual(await snapshot(dir), before);
  };
  for (const mutate of /** @type {Array<(value:any)=>void>} */ ([
    value => { value.artifact_repairs[0].accepted_artifact_digest = '0'.repeat(64); },
    value => { value.artifact_repairs[0].base_source_revision = 1; },
    value => { value.source_revision = 2; },
    value => { value.run_instance_id = 'RUN-11111111-1111-4111-8111-111111111111'; },
    value => { value.run_scope = 'changed-original-scope'; },
    value => { value.artifact_repairs.push({ ...value.artifact_repairs[0], repair_seq: 2 }); }
  ])) {
    const changed = structuredClone(candidate); mutate(changed);
    await writeFile(path.join(dir, 'staging/source-pack.json'), JSON.stringify(changed));
    await reject(reply);
  }
  await unlink(path.join(dir, 'staging/source-pack.json'));
  await reject(reply);
  await writeFile(path.join(dir, 'staging/source-pack.json'), JSON.stringify(candidate));
  for (const mutate of /** @type {Array<(value:any)=>void>} */ ([
    value => { value.run_id = 'RUN-11111111-1111-4111-8111-111111111111'; },
    value => { value.scope.source_revision = 0; },
    value => { value.scope.run_instance_id = 'RUN-11111111-1111-4111-8111-111111111111'; },
    value => { value.incomplete_reason.code = 'FORGED_REPAIR_REQUEST'; }
  ])) {
    const forged = structuredClone(reply); mutate(forged); await reject(forged);
  }
});

test('Evidence repair preparation reuses acquired material without deleting staged private bytes', async (/** @type {any} */ t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'remediation-repair-material-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Synthetic transport fixture only; this does not assert business review.
  await startImageBaseline(dir);
  const { payload, reply } = await stageRepair(dir);
  await mkdir(path.join(dir, 'staging/source-acquisition'), { recursive: true });
  const materialPath = path.join(dir, 'staging/source-acquisition', `EVENT-${'a'.repeat(64)}.bin`);
  await writeFile(materialPath, new Uint8Array([1, 2, 3, 4]));
  const before = await snapshot(dir);
  const prepared = await api.prepareStageArtifact(dir, reply, { stage: 'evidence_claims', payload });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  assert.deepEqual(await snapshot(dir), before);
  assert.deepEqual(await readFile(materialPath), Buffer.from([1, 2, 3, 4]));
});
