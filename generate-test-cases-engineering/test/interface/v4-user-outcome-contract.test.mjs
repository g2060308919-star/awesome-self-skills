import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { stableId } from '../../src/canonical.mjs';
import { evaluateClarification } from '../../src/clarification.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { journeyRule, revisionFromRules } from '../helpers/run-journey.mjs';

// Task 01 characterization of compiler 0.4.0 / schema 3.0.0, not v4-format
// fixtures or rewritten v3 goldens. Each test first proves valid old input,
// then asserts the replacement user outcome. RED must be semantic, not parsing.
// Minimal projections isolate each defect; these are not the full T15 journey.
// In particular, no synthetic setup URI is supplied to satisfy v3 Case gates.
const fixtureRoot = new URL('../fixtures/v4/bend-review-platform/', import.meta.url);
const sourceFixture = JSON.parse(await readFile(new URL('source-pack.json', fixtureRoot), 'utf8'));
const partialAnswers = JSON.parse(await readFile(new URL('partial-answers.json', fixtureRoot), 'utf8'));
const prd = await readFile(new URL('prd.md', fixtureRoot), 'utf8');
const schemaRoot = new URL('../../skill/generate-test-cases/scripts/schemas/', import.meta.url);
const sourceSchema = JSON.parse(await readFile(new URL('source-pack.schema.json', schemaRoot), 'utf8'));

/** @param {string} content */
const rawDigest = (content) => createHash('sha256').update(content, 'utf8').digest('hex');

/** @param {string} content */
function sourcePackFor(content) {
  const pack = structuredClone(sourceFixture);
  pack.sources[0].content = content;
  pack.sources[0].content_digest = rawDigest(content);
  pack.locators = [];
  pack.source_reviews = [{
    source_id: 'source_prd', content_digest: rawDigest(content),
    spans: [{
      span_id: 'review_projected_requirement', start: 0, end: content.length,
      classification: 'normative',
      rationale: 'Minimal characterization excerpt; full fixture coverage is a later journey.',
      review_basis: { reviewer: 'fixture-author', method: 'exact excerpt review', evidence: content }
    }]
  }];
  assert.deepEqual(validateAgainstSchema(pack, sourceSchema), [], 'Source Pack must be v3 Schema-valid');
  return pack;
}

/** @param {any} input */
async function assertV3Artifacts(input) {
  assert.equal(sourceFixture.sources[0].content, prd, 'fixture source text must be the actual PRD');
  assert.equal(sourceFixture.sources[0].content_digest, rawDigest(prd));
  assert.deepEqual(validateAgainstSchema(sourceFixture, sourceSchema), []);
  for (const [stage, artifactFile] of Object.entries(STAGE_FILES)) {
    const schemaFile = artifactFile.replace('.json', '.schema.json');
    const schema = JSON.parse(await readFile(new URL(schemaFile, schemaRoot), 'utf8'));
    assert.deepEqual(validateAgainstSchema(input[stage], schema), [], stage + ' must pass the current v3 Schema');
  }
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} artifact */
async function submit(directory, stage, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), JSON.stringify(artifact));
}

/** @param {string} directory */
async function stageResourceGap(directory) {
  const excerpt = prd.split('\n').find((/** @type {string} */ line) => line.startsWith('当 source=22'));
  assert.ok(excerpt, 'source=22 business rule must exist in the fixture');
  const rule = journeyRule('source22', {
    scope: 'review-platform', conditions: ['source=22'], result: excerpt, mode: 'blocker'
  });
  const input = revisionFromRules([rule]);
  input.source_pack = sourcePackFor(excerpt);
  input.source_pack.locators = [{
    locator_id: rule.locatorId, source_id: 'source_prd', type: 'text-range',
    text_range: { start: 0, end: excerpt.length },
    content_digest: rawDigest(excerpt), extraction_integrity: 'verified'
  }];
  // This is the existing official adapter seam for genuinely absent resources,
  // not an invented environment, capability proof, or missing business Oracle.
  input.case_drafts.obligation_dispositions[0].issue_intent = {
    missing_type: 'execution-preparation', scope: rule.scope, answerable: false,
    risk: rule.risk, reasons: ['EXECUTION_RESOURCES_NOT_PROVIDED'], evidence_refs: []
  };
  const initial = await advanceStrict(directory);
  assert.equal(initial.status, 'need_artifact', JSON.stringify(initial));
  input.source_pack.run_instance_id = initial.scope.run_instance_id;
  await assertV3Artifacts(input);
  for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
    await submit(directory, stage, input[stage]);
  }
  const reply = await advanceStrict(directory);
  assert.notEqual(reply.status, 'need_revision', 'valid old artifacts must not fail Schema/model validation: ' + JSON.stringify(reply));
  assert.equal(reply.diagnostics?.length ?? 0, 0, JSON.stringify(reply));
  assert.ok(reply.bundle_path, 'characterization must reach the old real delivery path: ' + JSON.stringify(reply));
  const bundle = JSON.parse(await readFile(reply.bundle_path, 'utf8'));
  assert.ok(bundle.coverage.formal.total > 0, 'applicable formal Test Points must not disappear');
  return { reply, bundle };
}

test('v4 user outcome RED: missing execution resources do not become Case Document blockers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v4-resource-characterization-'));
  try {
    const { bundle } = await stageResourceGap(directory);
    const resourceBlocked = bundle.blocked.filter((/** @type {any} */ item) =>
      JSON.stringify(item).includes('execution-preparation'));
    assert.equal(resourceBlocked.length, 0,
      'v3 incorrectly retains an execution-preparation blocker for the fully specified source=22 business outcome');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

/** @param {string[]} groundedKeys */
function clarificationContext(groundedKeys = []) {
  const questions = partialAnswers.questions;
  const points = questions.map((/** @type {any} */ question) => ({
    obligation_id: 'obligation_' + question.key,
    evidence_level: groundedKeys.includes(question.key) ? 'E3' : 'E0',
    classification: groundedKeys.includes(question.key) ? 'grounded' : 'blocked',
    blocked_reason: groundedKeys.includes(question.key) ? null : 'FORMAL_ORACLE_MISSING'
  }));
  const ids = (/** @type {string} */ lane) => points.filter((/** @type {any} */ point) =>
    point.classification === lane).map((/** @type {any} */ point) => point.obligation_id).sort();
  return {
    source_revision: 0,
    blocked_obligations: questions.filter((/** @type {any} */ question) => !groundedKeys.includes(question.key))
      .map((/** @type {any} */ question) => ({
        obligation_id: 'obligation_' + question.key, missing_type: 'oracle',
        semantic_refs: ['fact_' + question.key], scope: 'review-platform', risk: 'high',
        reason: 'FORMAL_ORACLE_MISSING', evidence_refs: ['claim_' + question.key],
        answerable: true, question: question.question
      })),
    prior_state: {
      source_revision: 0, clarification_event_seq: 0, asked_root_issue_ids: [],
      root_issue_dispositions: [], last_pending_root_issue_ids: [], last_question_set_digest: '',
      clarification_stop: null, semantic_snapshot: null, root_snapshot_ledger: []
    },
    append_batch: { decision_records: [], clarification_events: [], execution_events: [] },
    semantic_snapshot: {
      formal_test_points: points, coverage_denominator: points.length,
      delivery_sections: {
        grounded: ids('grounded'), conditional: [], blocked: ids('blocked'), exploratory: [],
        coverage: { formal_denominator: points.length },
        quality: { delivery_status: groundedKeys.length ? 'executable_subset_ready' : 'no_deterministic_cases' }
      }
    }
  };
}

test('v4 user outcome RED: answering IP alone keeps the other two presented questions pending', () => {
  const first = evaluateClarification(clarificationContext(), 'pause_for_clarification');
  assert.deepEqual(first.diagnostics, [], 'old clarification input must be valid');
  assert.equal(first.pending_root_issues.length, 3);
  const answer = partialAnswers.rounds[0].answers[0];
  assert.equal(answer.key, 'ip');
  const answeredRoot = first.pending_root_issues.find((/** @type {any} */ root) =>
    root.affected_obligation_ids.includes('obligation_ip'));
  const remainingIds = first.pending_root_issues.filter((/** @type {any} */ root) =>
    root.root_issue_id !== answeredRoot.root_issue_id).map((/** @type {any} */ root) => root.root_issue_id).sort();
  const secondInput = clarificationContext(['ip']);
  secondInput.source_revision = 1;
  secondInput.prior_state = first.state;
  secondInput.append_batch.decision_records = /** @type {any} */ ([{
    decision_id: 'decision_ip', question_id: stableId('question', { root_issue_ids: [answeredRoot.root_issue_id] }),
    presentation_id: 'PRESENTATION-characterization-three-questions', decision_group_ids: ['GROUP-ip'],
    root_issue_ids: [answeredRoot.root_issue_id], affected_obligation_ids: ['obligation_ip'],
    clarification_event_seq: 1, confirmer: 'review-platform-owner', confirmed_at: '2026-09-09',
    question: answeredRoot.question, answer: answer.answer, disposition: answer.disposition,
    authority_scope: 'review-platform', effective_scope: 'review-platform',
    evidence_ref: 'locator_user_ip_answer', evidence_level: 'E3'
  }]);
  assert.deepEqual(validateAgainstSchema(secondInput.append_batch.decision_records,
    sourceSchema.properties.decision_records), [], 'the partial Decision must also satisfy the v3 public artifact schema');
  const second = evaluateClarification(secondInput, 'pause_for_clarification');
  assert.deepEqual(second.diagnostics, [], 'partial answer must be accepted, not rejected as a malformed event');
  assert.equal(second.state.root_issue_dispositions.find((/** @type {any} */ item) =>
    item.root_issue_id === answeredRoot.root_issue_id).status, 'resolved_final', 'the IP answer must take effect first');
  const remaining = second.state.root_issue_dispositions.filter((/** @type {any} */ item) =>
    remainingIds.includes(item.root_issue_id));
  assert.deepEqual(remaining.map((/** @type {any} */ item) => item.status), ['asked', 'asked'],
    'v3 silently changes the two omitted questions to suppressed_deferred');
  assert.deepEqual([...second.state.last_pending_root_issue_ids].sort(), remainingIds);
});

test('v4 user outcome RED: signed-source refresh does not force a semantic new run', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v4-signed-source-characterization-'));
  try {
    const a = await readFile(new URL('signed-source-a.md', fixtureRoot), 'utf8');
    const b = await readFile(new URL('signed-source-b.md', fixtureRoot), 'utf8');
    // Whitelist exactly the two changed signing parameters. versionId and all
    // business text remain intact; this is not a test that drops every query.
    const unsigned = (/** @type {string} */ content) => content
      .replace(/X-Amz-Date=[^&)]*/gu, 'X-Amz-Date=<capture>')
      .replace(/X-Amz-Signature=[^&)]*/gu, 'X-Amz-Signature=<signature>');
    assert.notEqual(rawDigest(a), rawDigest(b), 'raw captures are allowed to differ');
    assert.equal(unsigned(a), unsigned(b), 'only temporary signing fields may change');
    const firstRequest = await advanceStrict(directory);
    const sourceA = sourcePackFor(a);
    sourceA.run_instance_id = firstRequest.scope.run_instance_id;
    await submit(directory, 'source_pack', sourceA);
    const accepted = await advanceStrict(directory);
    assert.equal(accepted.status, 'need_artifact', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims', 'first source must be genuinely accepted');
    const sourceB = sourcePackFor(b);
    sourceB.run_instance_id = sourceA.run_instance_id;
    sourceB.source_revision = 1;
    await submit(directory, 'source_pack', sourceB);
    const refreshed = await advanceStrict(directory);
    assert.notEqual(refreshed.status, 'need_revision', 'not a malformed v3 Source Pack: ' + JSON.stringify(refreshed));
    assert.equal(refreshed.diagnostics?.some((/** @type {any} */ item) => item.code === 'NEW_RUN_REQUIRED') ?? false, false,
      'v3 compares signed raw source bytes as immutable semantic identity: ' + JSON.stringify(refreshed));
    assert.equal(refreshed.scope?.source_revision, 0, 'authentication-only refresh must retain semantic revision');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('v4 user outcome RED: applicable zero-Case output cannot be reported as completed', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v4-zero-case-characterization-'));
  try {
    const { reply, bundle } = await stageResourceGap(directory);
    assert.equal(bundle.grounded.length + bundle.conditional.length, 0, 'old zero-Case path must actually be reached');
    assert.equal(bundle.quality.delivery_status, 'no_deterministic_cases');
    assert.equal(reply.status, 'fatal',
      'v3 returns finished for applicable zero-Case output without an explicit semantic-gap delivery decision');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
