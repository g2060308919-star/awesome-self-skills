import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { reliabilityFixture, stageRaw, stageCollection } from '../helpers/v4-reliability-fixture.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };

const adapter = /** @type {any} */ (await import(process.env.GTC_RELIABILITY_RUNNER
  ? pathToFileURL(process.env.GTC_RELIABILITY_RUNNER).href : '../../src/entry.mjs'));
const { advanceStrict, createV4RunDirectory } = adapter;

for (const collision of [true, false]) test(`regression ${collision ? 'A: same statement preserves distinct facts' : 'B: unordered fact collection survives serialized commit'}`, async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-reliability-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await createV4RunDirectory(catalog, 'case_document');
  const fixture = reliabilityFixture(run.run_id, { collision });
  const initial = await advanceStrict(run.run_directory);
  await stageCollection(run.run_directory, initial, fixture.artifacts.source_pack);
  await stageRaw(run.run_directory, 'source_pack', fixture.artifacts.source_pack);
  const source = await advanceStrict(run.run_directory);
  assert.equal(source.stage, 'evidence_claims', JSON.stringify(source));
  await stageRaw(run.run_directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const reply = await advanceStrict(run.run_directory);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  const checkpoint = JSON.parse(await readFile(path.join(run.run_directory, 'checkpoint.json'), 'utf8'));
  assert.deepEqual(checkpoint.semantic_gap_ledger[0].subject_fact_ids, ['f200', 'f205']);
  assert.equal(reply.semantic_presentation.question_parts[0].affected_facts.length, 2);
  assert.deepEqual(await advanceStrict(run.run_directory), reply);
});

for (const invalid of ['missing fact', 'duplicate fact', 'sensitive duplicate']) test(`T05/T23 invalid Evidence ${invalid} is a safe candidate revision`, async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-reliability-invalid-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await createV4RunDirectory(catalog, 'case_document');
  const fixture = reliabilityFixture(run.run_id);
  await stageCollection(run.run_directory, await advanceStrict(run.run_directory), fixture.artifacts.source_pack);
  await stageRaw(run.run_directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((await advanceStrict(run.run_directory)).stage, 'evidence_claims');
  const acceptedPath = path.join(run.run_directory, 'accepted/r000/source-pack.json');
  const before = await readFile(acceptedPath, 'utf8');
  const e = fixture.artifacts.evidence_claims;
  if (invalid === 'missing fact') e.semantic_gaps[0].subject_fact_ids.push('missing-fact');
  else {
    if (invalid === 'sensitive duplicate') e.fact_ledger[0].fact_id =
      'https://host.invalid/file?token=do-not-echo&signature=private#' + 'x'.repeat(8000);
    e.fact_ledger.push(structuredClone(e.fact_ledger[0]));
  }
  await stageRaw(run.run_directory, 'evidence_claims', e);
  const reply = await advanceStrict(run.run_directory);
  assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
  assert.equal(reply.stage, 'evidence_claims');
  assert.ok(reply.diagnostics.some((/** @type {any} */ d) => d.path && d.code));
  assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
  if (invalid === 'sensitive duplicate') {
    assert.doesNotMatch(JSON.stringify(reply), /do-not-echo|signature=private|host\.invalid/);
    assert.ok(JSON.stringify(reply.diagnostics).length < 20000);
    assert.ok(reply.diagnostics.some((/** @type {any} */ d) => d.path.startsWith('/fact_ledger/')));
  }
  assert.equal(await readFile(acceptedPath, 'utf8'), before);
  await assert.rejects(readFile(path.join(run.run_directory, 'checkpoint.json')), /ENOENT/);
});
