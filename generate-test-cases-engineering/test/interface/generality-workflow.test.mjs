import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { digest } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { buildJourney, journeyRule, revisionFromRules } from '../helpers/run-journey.mjs';

/** @param {string} dir @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function submit(dir, stage, value) {
  await mkdir(path.join(dir, 'staging'), { recursive: true });
  await writeFile(path.join(dir, 'staging', STAGE_FILES[stage]), JSON.stringify(value));
}
/** @param {string} dir @param {'case_document'|'execution_plan'} [intent] @param {string} [journeyName] */
async function initial(dir, intent = 'execution_plan', journeyName = 'all-e3') {
  const request = await advanceStrict(dir);
  const input = buildJourney(journeyName);
  input.source_pack.run_instance_id = request.scope.run_instance_id;
  input.source_pack.delivery_intent = intent;
  return input;
}

test('generality P21/P23: a bounded staged batch finishes a case document without an execution confirmation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-document-'));
  try {
    const input = await initial(dir, 'case_document');
    input.source_pack.output_language = 'zh-CN';
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const reply = await advanceStrict(dir);
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    assert.equal(reply.runner_ready, false);
    assert.equal(reply.preview_control, null);
    const current = JSON.parse(await readFile(path.join(dir, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'document_only');
    const bundle = JSON.parse(await readFile(reply.bundle_path, 'utf8'));
    assert.deepEqual(bundle.execution_plan.runner_case_ids, []);
    const markdown = await readFile(path.join(dir, 'output/r000/test-cases.md'), 'utf8');
    assert.doesNotMatch(markdown, /Compilation is limited to the accepted immutable revision/u);
    assert.match(markdown, /本次编译仅限已接受的不可变资料修订/u);
    assert.deepEqual(await advanceStrict(dir), reply);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P16: semantic clarification group risk counts agree with its actual affected Test Points', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-group-risk-'));
  try {
    const input = await initial(dir, 'case_document', 'clarification-grounded');
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const reply = await advanceStrict(dir);
    assert.equal(reply.purpose, 'semantic_clarification', JSON.stringify(reply));
    assert.equal(reply.groups.length, 1);
    assert.deepEqual(reply.groups[0].risk_counts, { critical: 0, high: 1, medium: 0, low: 0 });
    assert.deepEqual(reply.groups[0].risk_counts, reply.blockers[0].risk_counts);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P23: a document-only preview request cannot create a ready pointer during recovery', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-document-preview-'));
  try {
    const input = await initial(dir, 'case_document');
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const delivered = await advanceStrict(dir);
    assert.equal(delivered.status, 'finished');
    const original = await readFile(delivered.bundle_path, 'utf8');
    await rm(path.join(dir, 'output/current.json'));
    await writeFile(path.join(dir, 'staging/post-ready-preview-request.json'), JSON.stringify({
      operation: 'cancel_preview', request_instance_id: 'PREVIEW-' + 'a'.repeat(32),
      expected_preview_epoch: 0, run_instance_id: delivered.run_instance_id,
      bound_source_revision: 0, bound_bundle_digest: delivered.bundle_digest,
      bound_plan_digest: delivered.plan_digest, bound_confirmation_semantic_digest: 'b'.repeat(64),
      cancels_presentation_id: 'PRESENTATION-' + 'c'.repeat(24)
    }));
    const rejected = await advanceStrict(dir);
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some((/** @type {any} */ item) => item.code === 'POST_READY_PREVIEW_NOT_READY'));
    await assert.rejects(readFile(path.join(dir, 'output/current.json')));
    assert.equal(await readFile(delivered.bundle_path, 'utf8'), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P18: generated evidence can be repaired after acceptance without deleting history or creating a sibling run', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-repair-'));
  try {
    const input = await initial(dir, 'case_document');
    await submit(dir, 'source_pack', input.source_pack);
    await submit(dir, 'evidence_claims', input.evidence_claims);
    assert.equal((await advanceStrict(dir)).stage, 'behavior_views');
    const priorBytes = await readFile(path.join(dir, 'accepted/r000/evidence-claims.json'), 'utf8');
    const source = structuredClone(input.source_pack);
    source.source_revision = 1;
    source.artifact_repairs = [{
      repair_seq: 1, base_source_revision: 0, stage: 'evidence_claims',
      accepted_artifact_digest: digest(input.evidence_claims),
      reason: 'The accepted extraction omitted a requirement; re-read the frozen source.'
    }];
    await submit(dir, 'source_pack', source);
    const request = await advanceStrict(dir);
    assert.equal(request.status, 'need_artifact', JSON.stringify(request));
    assert.equal(request.stage, 'evidence_claims');
    assert.equal(request.scope.source_revision, 1);
    assert.equal(await readFile(path.join(dir, 'accepted/r000/evidence-claims.json'), 'utf8'), priorBytes);
    // A retry rebuilds this incomplete repair hop from accepted history.
    assert.deepEqual(await advanceStrict(dir), request);
    for (const stage of /** @type {const} */ (['evidence_claims', 'behavior_views', 'case_drafts'])) {
      const artifact = { ...input[stage], source_revision: 1 };
      await submit(dir, stage, artifact);
    }
    const result = await advanceStrict(dir);
    assert.equal(result.status, 'finished', JSON.stringify(result));
    assert.equal(result.source_revision, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P18: accepted Case repair can change semantic dependencies and replay without erasing history', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-semantic-repair-'));
  try {
    const request = await advanceStrict(dir);
    const input = revisionFromRules([
      journeyRule('save', { scope: 'checkout', capabilityStatus: 'unknown' }),
      journeyRule('cancel', { scope: 'checkout', capabilityStatus: 'unknown' })
    ]);
    input.source_pack.run_instance_id = request.scope.run_instance_id;
    input.source_pack.delivery_intent = 'case_document';
    input.case_drafts.cases[0].testability_profile.capabilities.push({
      ...input.case_drafts.cases[0].testability_profile.capabilities[0],
      capability: 'extra audit fixture', status: 'unavailable'
    });
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const delivered = await advanceStrict(dir);
    assert.equal(delivered.status, 'finished', JSON.stringify(delivered));
    const priorBytes = await readFile(delivered.bundle_path, 'utf8');
    const prior = JSON.parse(priorBytes);
    assert.equal(prior.blocked.length, 2);
    const source = structuredClone(input.source_pack);
    source.source_revision = 1;
    source.artifact_repairs = [{
      repair_seq: 1, base_source_revision: 0, stage: 'case_drafts',
      accepted_artifact_digest: digest(input.case_drafts), reason: 'Correct generated capability bindings from the already accepted source.'
    }];
    await submit(dir, 'source_pack', source);
    assert.equal((await advanceStrict(dir)).stage, 'case_drafts');
    const cases = structuredClone(input.case_drafts);
    cases.source_revision = 1;
    for (const draft of cases.cases) draft.testability_profile.capabilities[0] = {
      capability: 'run-control', status: 'provided', provenance_ref: draft.source_claim_ids[0]
    };
    await submit(dir, 'case_drafts', cases);
    const repaired = await advanceStrict(dir);
    assert.equal(repaired.status, 'finished', JSON.stringify(repaired));
    const bundle = JSON.parse(await readFile(repaired.bundle_path, 'utf8'));
    assert.equal(bundle.coverage.formal.total, 2);
    assert.equal(bundle.blocked.length, 1);
    assert.equal(bundle.grounded.length, 1);
    assert.equal(bundle.blocked[0].blocking_roots.length, 1);
    assert.equal(await readFile(delivered.bundle_path, 'utf8'), priorBytes);
    await rm(path.join(dir, 'checkpoint.json'));
    assert.deepEqual(await advanceStrict(dir), repaired);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P19: a valid execution-only append reuses accepted semantic artifacts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-execution-reuse-'));
  try {
    const input = await initial(dir);
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const shown = await advanceStrict(dir);
    assert.equal(shown.purpose, 'final_confirmation', JSON.stringify(shown));
    // Risk counts summarize compiled formal responsibilities (medium here),
    // not the authored Case draft risk (high).
    assert.deepEqual(shown.groups[0].risk_counts, { critical: 0, high: 0, medium: 1, low: 0 });
    const source = structuredClone(input.source_pack);
    source.source_revision = 1;
    source.execution_events.push({
      event_id: 'confirm-reuse', clarification_event_seq: shown.next_event_seq,
      type: 'confirm_execution_plan', actor: 'operator', event_at: '2026-09-05T00:00:00.000Z',
      authority_scope: '*', run_instance_id: source.run_instance_id,
      run_identity_digest: shown.execution_plan.run_identity_digest,
      presented_prompt_id: shown.prompt_id, presented_plan_digest: shown.execution_plan.plan_digest,
      presented_plan_change_head_seq: shown.execution_plan.plan_change_head_seq,
      presented_source_revision: shown.source_revision
    });
    await submit(dir, 'source_pack', source);
    const finished = await advanceStrict(dir);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.runner_ready, true);
    for (const stage of /** @type {const} */ (['evidence_claims', 'behavior_views', 'case_drafts'])) {
      const carried = JSON.parse(await readFile(path.join(dir, 'accepted/r001', STAGE_FILES[stage]), 'utf8'));
      const prior = JSON.parse(await readFile(path.join(dir, 'accepted/r000', STAGE_FILES[stage]), 'utf8'));
      assert.deepEqual(carried, { ...prior, source_revision: 1 });
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P18: a forged repair or changed original scope cannot overwrite a delivered document', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-repair-forgery-'));
  try {
    const input = await initial(dir, 'case_document');
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const delivered = await advanceStrict(dir);
    assert.equal(delivered.status, 'finished', JSON.stringify(delivered));
    const oldBundle = await readFile(delivered.bundle_path, 'utf8');
    const source = structuredClone(input.source_pack);
    source.source_revision = 1;
    source.artifact_repairs = [{
      repair_seq: 1, base_source_revision: 0, stage: 'source_pack',
      accepted_artifact_digest: 'f'.repeat(64), reason: 'Correct generated source review.'
    }];
    await submit(dir, 'source_pack', source);
    const forged = await advanceStrict(dir);
    assert.equal(forged.status, 'need_revision', JSON.stringify(forged));
    assert.ok(forged.diagnostics.some((/** @type {any} */ item) => item.code === 'ARTIFACT_REPAIR_INVALID'));
    source.artifact_repairs[0].accepted_artifact_digest = digest(input.source_pack);
    source.run_scope = 'a materially different product';
    await submit(dir, 'source_pack', source);
    const changed = await advanceStrict(dir);
    assert.equal(changed.status, 'fatal', JSON.stringify(changed));
    assert.ok(changed.diagnostics.some((/** @type {any} */ item) => item.code === 'NEW_RUN_REQUIRED'));
    assert.equal(await readFile(delivered.bundle_path, 'utf8'), oldBundle);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generality P18/P23: document-to-execution repair tombstones old output and crash recovery requires a fresh confirmation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'generality-intent-repair-'));
  try {
    const input = await initial(dir, 'case_document');
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) await submit(dir, stage, input[stage]);
    const delivered = await advanceStrict(dir);
    assert.equal(delivered.status, 'finished', JSON.stringify(delivered));
    const oldBundle = await readFile(delivered.bundle_path, 'utf8');
    const oldCurrent = await readFile(path.join(dir, 'output/current.json'), 'utf8');
    const source = structuredClone(input.source_pack);
    source.source_revision = 1;
    source.delivery_intent = 'execution_plan';
    source.artifact_repairs = [{
      repair_seq: 1, base_source_revision: 0, stage: 'source_pack',
      accepted_artifact_digest: digest(input.source_pack), reason: 'The user now requests an execution plan.'
    }];
    await submit(dir, 'source_pack', source);
    const request = await advanceStrict(dir);
    assert.equal(request.status, 'need_artifact', JSON.stringify(request));
    assert.equal(request.stage, 'evidence_claims');
    let current = JSON.parse(await readFile(path.join(dir, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'stale');
    assert.equal(current.active_source_revision, 1);
    // Real crash residue: accepted higher Source Pack, no checkpoint, stale lower current.
    await rm(path.join(dir, 'checkpoint.json'));
    await writeFile(path.join(dir, 'output/current.json'), oldCurrent);
    assert.deepEqual(await advanceStrict(dir), request);
    current = JSON.parse(await readFile(path.join(dir, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'stale');
    assert.equal(current.active_source_revision, 1);
    for (const stage of /** @type {const} */ (['evidence_claims', 'behavior_views', 'case_drafts'])) await submit(dir, stage, {
      ...input[stage], source_revision: 1
    });
    const shown = await advanceStrict(dir);
    assert.equal(shown.status, 'need_user_answers', JSON.stringify(shown));
    assert.equal(shown.purpose, 'final_confirmation');
    assert.equal(shown.execution_plan.confirmation, null);
    assert.equal(await readFile(delivered.bundle_path, 'utf8'), oldBundle);
    await assert.rejects(readFile(path.join(dir, 'output/r001/test-bundle.json')));
    assert.deepEqual(await advanceStrict(dir), shown);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
