import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import executionBindingsSchema from '../fixtures/v4/retired-execution-bindings.schema.json' with { type: 'json' };
import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { compileSemanticCaseDocumentV4 } from '../../src/case-semantics-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { constructSemanticClarificationEventV4 } from '../../src/clarification.mjs';
import { constructV4ExecutionRunEvent } from '../../src/execution-events.mjs';
import {
  constructCancelRunEventV4, createResumeCancelledSiblingV4
} from '../../src/run-cancellation-v4.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { seedLegacyV4RunInstance } from '../helpers/v4-run-contract-fixture.mjs';

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stage(directory, stage, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stage]), `${canonicalStringify(value)}\n`, 'utf8'
  );
}

/** @param {string} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** @param {'confirm_execution_plan'|'cancel_run'} eventType @param {any} context */
function identifiedRunEvent(eventType, context) {
  const body = { event_type: eventType, ...structuredClone(context) };
  return { event_id: `EVENT-${byteDigest(canonicalStringify(body)).slice('sha256:'.length)}`, ...body };
}

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** @param {string} directory @param {any} manifest @param {'bundle'|'markdown'|'execution_worksheet'} key */
async function verifiedArtifact(directory, manifest, key) {
  const text = await readFile(path.join(directory, manifest[key].path), 'utf8');
  assert.equal(byteDigest(text), manifest[key].digest, `${key} digest`);
  return text;
}

/** @param {any} presentation @param {RegExp} pattern */
function questionPart(presentation, pattern) {
  const matches = presentation.question_parts.filter((/** @type {any} */ part) => pattern.test(part.question));
  assert.equal(matches.length, 1, pattern.source);
  return matches[0];
}

/** @param {any} presentation @param {RegExp} pattern @param {string} answer */
function answerEvent(presentation, pattern, answer) {
  const part = questionPart(presentation, pattern);
  const message = `答复：${answer}`;
  const start = Array.from('答复：').length;
  return {
    part,
    event: constructSemanticClarificationEventV4(
      presentation, part, 'answer_question_part', {
        answer, resolution: 'temporary', authority: 'task_scoped',
        answer_origin: {
          type: 'user_statement', presentation_id: presentation.presentation_id,
          message_digest: byteDigest(message),
          answer_span: {
            start_scalar: start, end_scalar: start + Array.from(answer).length,
            excerpt_digest: byteDigest(answer)
          }
        }
      }
    )
  };
}

/** @param {string} directory @param {any} reply @param {any} fixture */
async function satisfyArtifactRequests(directory, reply, fixture) {
  let current = reply;
  for (let count = 0; count < 4
    && current.status === 'need_revision'
    && current.incomplete_reason?.code === 'STAGE_ARTIFACT_REQUIRED'; count += 1) {
    assert.notEqual(current.stage, 'source_pack', 'the clarification revision Source Pack was already staged');
    await stage(directory, current.stage, fixture.artifacts[current.stage]);
    current = await advanceStrict(directory);
  }
  return /** @type {any} */ (current);
}

/** @param {string} runInstanceId @param {any} caseDocumentRef */
function executionSourcePack(runInstanceId, caseDocumentRef) {
  return {
    schema_version: '4.0.0', source_revision: 0, run_instance_id: runInstanceId,
    run_scope: `execution:${caseDocumentRef.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: structuredClone(caseDocumentRef), output_language: 'zh-CN',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] },
    decision_records: [], clarification_events: [], execution_events: [],
    source_assets: [], artifact_events: []
  };
}

/** @param {string} catalog @param {string} documentRunId */
async function deliverBendCaseDocument(catalog, documentRunId) {
  const directory = path.join(catalog, 'runs', documentRunId);
  await mkdir(directory, { recursive: true });
  await ensureV4RunInstance(directory, {
    run_id: documentRunId, delivery_intent: 'case_document'
  });
  const fixture = await bendReviewJourneyFixture(documentRunId);
  fixture.artifacts.evidence_claims.semantic_gaps = [];
  let reply;
  for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
    await stage(directory, stageName, fixture.artifacts[stageName]);
    reply = await advanceStrict(directory);
  }
  assert.equal(reply.status, 'finished', JSON.stringify(reply));
  const manifestPath = path.join(directory, 'output/current.json');
  const manifestBytes = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestBytes);
  const bundlePath = path.join(directory, manifest.bundle.path);
  const bundleBytes = await readFile(bundlePath, 'utf8');
  return {
    directory, manifestPath, manifestBytes, manifest, bundlePath, bundleBytes,
    caseDocumentRef: {
      run_id: documentRunId, revision: manifest.revision,
      manifest_digest: byteDigest(manifestBytes), bundle_digest: manifest.bundle.digest
    }
  };
}

/** Deliver the B-end document with one explicitly closed semantic root so an
 * execution sibling exposes the real `reopen_semantic_question` action.
 * @param {string} catalog @param {string} documentRunId */
async function deliverBendCaseDocumentWithClosedRoot(catalog, documentRunId) {
  const directory = path.join(catalog, 'runs', documentRunId);
  await mkdir(directory, { recursive: true });
  await seedLegacyV4RunInstance(directory, {
    run_id: documentRunId, delivery_intent: 'case_document'
  });
  await advanceStrict(directory);
  const revision0 = await bendReviewJourneyFixture(documentRunId);
  await stage(directory, 'source_pack', revision0.artifacts.source_pack);
  await advanceStrict(directory);
  await stage(directory, 'evidence_claims', revision0.artifacts.evidence_claims);
  const first = /** @type {any} */ (await advanceStrict(directory));
  const ip = answerEvent(first.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地');
  const revision1 = await bendReviewJourneyFixture(documentRunId, 1, [ip.event]);
  await stage(directory, 'source_pack', revision1.artifacts.source_pack);
  let afterIp = /** @type {any} */ (await advanceStrict(directory));
  if (afterIp.status === 'need_revision'
    && afterIp.incomplete_reason?.code === 'STAGE_ARTIFACT_REQUIRED') {
    afterIp = await satisfyArtifactRequests(directory, afterIp, revision1);
  }
  const empty = answerEvent(afterIp.semantic_presentation, /空值/u, '—');
  const sortPart = questionPart(afterIp.semantic_presentation, /排序/u);
  const requestDelivery = constructSemanticClarificationEventV4(
    afterIp.semantic_presentation, sortPart, 'request_delivery'
  );
  const revision2 = await bendReviewJourneyFixture(
    documentRunId, 2, [ip.event, empty.event, requestDelivery]
  );
  await stage(directory, 'source_pack', revision2.artifacts.source_pack);
  const completed = await satisfyArtifactRequests(
    directory, await advanceStrict(directory), revision2
  );
  assert.equal(completed.status, 'finished', JSON.stringify(completed));
  const manifestBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
  const manifest = JSON.parse(manifestBytes);
  return {
    directory, caseDocumentRef: {
      run_id: documentRunId, revision: manifest.revision,
      manifest_digest: byteDigest(manifestBytes), bundle_digest: manifest.bundle.digest
    }
  };
}

/** @param {string} catalog @param {string} executionRunId @param {any} caseDocumentRef */
async function startExecutionSibling(catalog, executionRunId, caseDocumentRef) {
  const directory = path.join(catalog, 'runs', executionRunId);
  await mkdir(directory, { recursive: true });
  await ensureV4RunInstance(directory, {
    run_id: executionRunId, delivery_intent: 'execution_plan'
  });
  const initial = /** @type {any} */ (await advanceStrict(directory));
  assert.equal(initial.status, 'need_revision', JSON.stringify(initial));
  assert.equal(initial.incomplete_reason.code, 'STAGE_ARTIFACT_REQUIRED');
  assert.equal(initial.phase, 'execution_closure');
  assert.equal(initial.stage, 'source_pack');
  assert.deepEqual(validateAgainstSchema(initial, replySchema), []);
  const source = executionSourcePack(executionRunId, caseDocumentRef);
  assert.deepEqual(validateAgainstSchema(source, sourcePackSchema), []);
  await stage(directory, 'source_pack', source);
  return { directory, source, reply: /** @type {any} */ (await advanceStrict(directory)) };
}

/** Complete a real execution sibling through disposition, capability proof and
 * final confirmation so recovery assertions exercise accepted production bytes.
 * @param {string} catalog @param {string} documentRunId @param {string} executionRunId */
async function finishVerifiedExecutionSibling(catalog, documentRunId, executionRunId) {
  const document = await deliverBendCaseDocument(catalog, documentRunId);
  const bundle = JSON.parse(document.bundleBytes);
  const selectedCaseId = bundle.cases.find(
    (/** @type {any} */ item) => item.semantic_status === 'Grounded'
  )?.case_id;
  assert.equal(typeof selectedCaseId, 'string');
  const execution = await startExecutionSibling(catalog, executionRunId, document.caseDocumentRef);
  const dispositionItems = execution.reply.execution_presentation.items.filter(
    (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
  );
  const decided = /** @type {any} */ (structuredClone(execution.source));
  decided.source_revision = 1;
  decided.execution_events = dispositionItems.map((/** @type {any} */ item) => ({
    ...item.action_context, event_type: 'set_execution_disposition',
    disposition: item.case_ids.includes(selectedCaseId) ? 'execute' : 'do_not_execute'
  }));
  await stage(execution.directory, 'source_pack', decided);
  const proofRequired = /** @type {any} */ (await advanceStrict(execution.directory));
  const capability = proofRequired.execution_presentation.items.find(
    (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
      && item.case_ids.includes(selectedCaseId)
  );
  assert.ok(capability);
  const proven = /** @type {any} */ (structuredClone(decided));
  proven.source_revision = 2;
  proven.execution_events.push({
    ...structuredClone(capability.action_context), event_type: 'provide_capability_proof',
    proof: { type: capability.proof_contract.type, value: 'verified_available' }
  });
  await stage(execution.directory, 'source_pack', proven);
  const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
  assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));
  const confirmed = /** @type {any} */ (structuredClone(proven));
  confirmed.source_revision = 3;
  confirmed.execution_events.push(identifiedRunEvent(
    'confirm_execution_plan', awaiting.execution_presentation.action_context
  ));
  await stage(execution.directory, 'source_pack', confirmed);
  const finished = /** @type {any} */ (await advanceStrict(execution.directory));
  assert.equal(finished.status, 'finished', JSON.stringify(finished));
  assert.equal(finished.result_kind, 'execution_ready');
  return { document, execution, selectedCaseId, finished };
}

/** Write the retired private-binding shape to prove it is not an authority in
 * the production path. This is deliberately outside staging and must be inert.
 * @param {string} directory @param {string} runId @param {any} caseDocumentRef
 * @param {string} selectedCaseId */
async function writeLegacyExecutionBinding(
  directory, runId, caseDocumentRef, selectedCaseId
) {
  const systemDirectory = path.join(directory, 'system');
  const bindingPath = path.join(systemDirectory, 'execution-bindings.json');
  await mkdir(systemDirectory, { recursive: true });
  const value = {
    schema_version: '4.0.0', run_id: runId,
    case_document_ref: structuredClone(caseDocumentRef),
    bindings: [{
      case_id: selectedCaseId, disposition: 'pending', availability: 'verified',
      readiness_evidence: {
        domain: 'testability', claim_ids: ['TCLM-bend-review-test-setup']
      }
    }]
  };
  assert.deepEqual(validateAgainstSchema(value, executionBindingsSchema), []);
  const text = `${canonicalStringify(value)}\n`;
  await writeFile(bindingPath, text, 'utf8');
  return { bindingPath, value, text };
}

// Regression for the original T15 RED: the runner used to wait for Behavior
// Views and then emit V4_PRESENTATION_NOT_COMMITTED instead of committing the
// three-question pre-case presentation immediately after Evidence.
test('T15 real runner reads the whole B-end PRD, seals five-module scope, and asks three business questions before Behavior Views', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-bend-pre-case-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    await stage(directory, 'source_pack', fixture.artifacts.source_pack);
    assert.equal((await advanceStrict(directory)).stage, 'evidence_claims');
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);

    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
    assert.equal(reply.phase, 'requirements_analysis');
    assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
    assert.equal(reply.semantic_presentation.question_parts.length, 3);
    for (const pattern of [/IP/u, /空值/u, /排序/u]) questionPart(reply.semantic_presentation, pattern);
    assert.doesNotMatch(
      reply.semantic_presentation.question_parts.map((/** @type {any} */ part) => part.question).join('\n'),
      /环境|账号|权限资源|样本数据|查询方式|observer|mock/iu
    );
    const acceptedEvidence = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/evidence-claims.json'), 'utf8'
    ));
    assert.deepEqual(
      acceptedEvidence.scope_manifest.modules.map((/** @type {any} */ module) => module.module_id).sort(),
      fixture.expectations.module_ids
    );
    assert.equal(
      acceptedEvidence.scope_manifest.modules.filter((/** @type {any} */ module) => module.role === 'primary').length,
      1
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T12 semantic-clarification cancellation rejects later appends and resumes only in a new sibling', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-semantic-cancel-catalog-'));
  const runId = 'RUN-30303030-3030-4030-8030-303030303030';
  const siblingRunId = 'RUN-40404040-4040-4040-8040-404040404040';
  const directory = path.join(catalog, 'runs', runId);
  try {
    await mkdir(directory, { recursive: true });
    await ensureV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document' });
    const revision0 = await bendReviewJourneyFixture(runId);
    await stage(directory, 'source_pack', revision0.artifacts.source_pack);
    assert.equal((await advanceStrict(directory)).stage, 'evidence_claims');
    await stage(directory, 'evidence_claims', revision0.artifacts.evidence_claims);
    const pending = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.equal(pending.phase, 'requirements_analysis');
    const acceptedBefore = await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8');
    const cancel = constructCancelRunEventV4({
      run_id: runId, phase: pending.phase,
      phase_version: pending.semantic_presentation.recovery.committed_revision
    });
    const revision1 = await bendReviewJourneyFixture(runId, 1, [cancel]);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);

    const first = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(first.status, 'cancelled', JSON.stringify(first));
    assert.equal(first.phase, 'requirements_analysis');
    assert.deepEqual(validateAgainstSchema(first, replySchema), []);
    assert.deepEqual(await advanceStrict(directory), first);
    assert.equal(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'), acceptedBefore);
    assert.equal(await exists(path.join(directory, 'accepted/r001/source-pack.json')), false);
    assert.equal(await exists(path.join(directory, 'output/current.json')), false);

    const ordinary = await bendReviewJourneyFixture(runId, 1, []);
    await stage(directory, 'source_pack', ordinary.artifacts.source_pack);
    assert.deepEqual(await advanceStrict(directory), first);
    assert.equal(await exists(path.join(directory, 'accepted/r001/source-pack.json')), false);

    await createResumeCancelledSiblingV4(catalog, {
      parent_run_id: runId, run_id: siblingRunId
    });
    const resumed = /** @type {any} */ (await advanceStrict(path.join(catalog, 'runs', siblingRunId)));
    assert.equal(resumed.status, 'need_revision', JSON.stringify(resumed));
    assert.equal(resumed.stage, 'source_pack');
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

// Recovery regression for the former T09/T10 production gap. A clarification
// append is staged in the same durable run and then replayed as though the
// Adapter process stopped before invoking the runner. The resumed invocation
// must commit the partial answer atomically and present only the omitted roots.
test('T15 real runner conserves pending questions across a recovered partial-answer transaction and delivers only after explicitly closing the sorting gap', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-bend-partial-'));
  try {
    await seedLegacyV4RunInstance(directory);
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const revision0 = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    await stage(directory, 'source_pack', revision0.artifacts.source_pack);
    await advanceStrict(directory);
    await stage(directory, 'evidence_claims', revision0.artifacts.evidence_claims);
    const first = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(first.status, 'need_user_answers', JSON.stringify(first));

    const ip = answerEvent(first.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地');
    const revision1 = await bendReviewJourneyFixture(initial.scope.run_instance_id, 1, [ip.event]);
    assert.deepEqual(validateAgainstSchema(revision1.artifacts.source_pack, sourcePackSchema), []);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    // This is the recovery boundary: no in-memory state from the Adapter is
    // required after the complete candidate event has reached staging.
    let afterIp = /** @type {any} */ (await advanceStrict(directory));
    if (afterIp.status === 'need_revision'
      && afterIp.incomplete_reason?.code === 'STAGE_ARTIFACT_REQUIRED') {
      assert.equal(afterIp.stage, 'evidence_claims', JSON.stringify(afterIp));
      afterIp = await satisfyArtifactRequests(directory, afterIp, revision1);
    }
    assert.equal(afterIp.status, 'need_user_answers', JSON.stringify(afterIp));
    assert.equal(afterIp.semantic_presentation.question_parts.length, 2);
    assert.deepEqual(afterIp.semantic_presentation.answered_part_ids, [ip.part.question_part_id]);
    assert.equal(afterIp.semantic_presentation.recovery.committed_revision, 1);
    assert.equal(questionPart(afterIp.semantic_presentation, /空值/u).question.includes('空值'), true);
    questionPart(afterIp.semantic_presentation, /排序/u);
    assert.equal(await exists(path.join(directory, 'output/current.json')), false);

    const empty = answerEvent(afterIp.semantic_presentation, /空值/u, '—');
    const sortPart = questionPart(afterIp.semantic_presentation, /排序/u);
    const closeSortForDelivery = constructSemanticClarificationEventV4(
      afterIp.semantic_presentation, sortPart, 'request_delivery'
    );
    const revision2 = await bendReviewJourneyFixture(
      initial.scope.run_instance_id, 2, [ip.event, empty.event, closeSortForDelivery]
    );
    assert.deepEqual(validateAgainstSchema(revision2.artifacts.source_pack, sourcePackSchema), []);
    await stage(directory, 'source_pack', revision2.artifacts.source_pack);
    let completed = await satisfyArtifactRequests(
      directory, await advanceStrict(directory), revision2
    );
    assert.notEqual(completed.status, 'need_user_answers', JSON.stringify(completed));
    assert.equal(completed.status, 'finished', JSON.stringify(completed));
    assert.equal(completed.result_kind, 'delivered_with_gaps');

    const manifest = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
    const bundle = JSON.parse(await verifiedArtifact(directory, manifest, 'bundle'));
    assert.equal(bundle.cases.length, 7);
    assert.equal(bundle.coverage.semantic_gap_count, 1);
    const sortingGap = bundle.semantic_root_groups.find(
      (/** @type {any} */ root) => /sort/u.test(`${root.title} ${root.business_object}`)
    );
    assert.equal(sortingGap?.status, 'closed_for_delivery');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 completed B-end Case Document binds exactly one JSON, Markdown, and CSV with seven independent business outcomes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-bend-delivery-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    // This direct final leg is intentionally a real runner run. The preceding
    // clarification transaction is exercised by the companion journey above;
    // once T09/T10 are wired, both legs share the same durable directory.
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      await advanceStrict(directory);
    }
    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    assert.equal(reply.result_kind, 'delivered_cases');
    assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
    const manifest = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
    assert.equal(manifest.case_count, 7);
    assert.deepEqual(reply.produced_artifacts.map((/** @type {any} */ item) => item.kind), [
      'case_document', 'business_markdown', 'execution_worksheet'
    ]);
    const bundleText = await verifiedArtifact(directory, manifest, 'bundle');
    const markdown = await verifiedArtifact(directory, manifest, 'markdown');
    const csv = await verifiedArtifact(directory, manifest, 'execution_worksheet');
    const bundle = JSON.parse(bundleText);
    assert.equal(bundle.cases.length, 7);
    assert.equal(new Set(bundle.cases.map((/** @type {any} */ item) => item.primary_test_point_id)).size, 7);
    for (const title of fixture.expectations.case_titles) {
      assert.equal(bundle.cases.some((/** @type {any} */ item) => item.title === title), true, title);
      assert.match(markdown, new RegExp(title, 'u'));
    }
    assert.equal(csv.split('\n')[0], [
      'case_id', 'acceptance_role', 'module', 'priority', 'title', 'preconditions', 'data_conditions',
      'steps', 'expected_results', 'execution_status', 'defect_ids', 'test_data_used', 'owner', 'notes'
    ].join(','));
    // RFC 4180 cells may contain real LF characters, so physical line count is
    // not a row count. Canonical Case IDs are unquoted first-column values.
    assert.equal(csv.split('\n').filter((/** @type {string} */ line) => line.startsWith('CASE-')).length, 7);
    assert.equal((await readFile(path.join(directory, 'output/current.json'), 'utf8')).endsWith('\n'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 refreshing only signed acquisition parameters preserves semantic projection, Fact and compiled Case identities, and business prose', async () => {
  const provider = [{
    provider: 'cooper', version: '1', hosts: ['prd-assets.example.invalid'],
    kind: 'cooper', query_order: 'sensitive'
  }];
  const variants = [];
  for (const source_file of ['signed-source-a.md', 'signed-source-b.md']) {
    const fixture = await bendReviewJourneyFixture(
      'RUN-12345678-1234-4234-8234-123456789abc', 0, [],
      { source_file, source_providers: provider }
    );
    const evidence = fixture.artifacts.evidence_claims;
    const drafts = fixture.artifacts.case_drafts.cases;
    const compiled = compileSemanticCaseDocumentV4({
      source_revision: 0,
      case_drafts: drafts,
      formal_test_points: drafts.map((/** @type {any} */ item) => ({
        formal_test_point_id: item.primary_test_point_id,
        outcome_id: `OUT-${item.primary_test_point_id}`,
        acceptance_role: item.acceptance_role
      })),
      claim_assessments: evidence.claims.map((/** @type {any} */ claim) => ({
        claim_id: claim.claim_id, domain: 'business_semantics', level: claim.level,
        support_review: 'supported'
      }))
    });
    variants.push({
      capture_digest: fixture.artifacts.source_pack.sources[0].capture_digest,
      semantic_digest: fixture.artifacts.source_pack.sources[0].semantic_digest,
      semantic_content: fixture.artifacts.source_pack.sources[0].semantic_projection.content,
      fact_ids: evidence.fact_ledger.map((/** @type {any} */ fact) => fact.fact_id),
      formal_test_point_ids: drafts.map((/** @type {any} */ item) => item.primary_test_point_id),
      cases: compiled.cases
    });
  }

  assert.notEqual(variants[0].capture_digest, variants[1].capture_digest);
  for (const field of [
    'semantic_digest', 'semantic_content', 'fact_ids', 'formal_test_point_ids', 'cases'
  ]) assert.deepEqual(variants[0][field], variants[1][field], field);
  assert.equal(variants[0].cases.length, 7);
});

// This is intentionally a production-runner test, not a direct call to the
// execution-plan compiler. The sibling lives under the same catalog as the
// immutable Case Document so the runner can resolve by run identity, never by
// an Agent-supplied filesystem path.
test('T15 production runner resolves a canonical Case Document ref and an all-DNE execution sibling finishes with an empty runner projection', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-catalog-'));
  const documentRunId = 'RUN-11111111-1111-4111-8111-111111111111';
  const executionRunId = 'RUN-22222222-2222-4222-8222-222222222222';
  const documentDirectory = path.join(catalog, 'runs', documentRunId);
  const executionDirectory = path.join(catalog, 'runs', executionRunId);
  try {
    await mkdir(documentDirectory, { recursive: true });
    await ensureV4RunInstance(documentDirectory, {
      run_id: documentRunId, delivery_intent: 'case_document'
    });
    const fixture = await bendReviewJourneyFixture(documentRunId);
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    let documentReply;
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(documentDirectory, stageName, fixture.artifacts[stageName]);
      documentReply = await advanceStrict(documentDirectory);
    }
    assert.equal(documentReply.status, 'finished', JSON.stringify(documentReply));
    const documentManifestBytes = await readFile(path.join(documentDirectory, 'output/current.json'), 'utf8');
    const documentManifest = JSON.parse(documentManifestBytes);
    const caseDocumentRef = {
      run_id: documentRunId, revision: documentManifest.revision,
      manifest_digest: byteDigest(documentManifestBytes),
      bundle_digest: documentManifest.bundle.digest
    };

    await mkdir(executionDirectory, { recursive: true });
    await ensureV4RunInstance(executionDirectory, {
      run_id: executionRunId, delivery_intent: 'execution_plan'
    });
    const source = executionSourcePack(executionRunId, caseDocumentRef);
    assert.deepEqual(validateAgainstSchema(source, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', source);
    const pending = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.equal(pending.phase, 'execution_closure');
    assert.deepEqual(validateAgainstSchema(pending, replySchema), []);
    const dispositionItems = pending.execution_presentation.items.filter(
      (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
    );
    assert.equal(dispositionItems.length, 7);

    const decided = /** @type {any} */ (structuredClone(source));
    decided.source_revision = 1;
    decided.execution_events = dispositionItems.map((/** @type {any} */ item) => ({
      ...item.action_context,
      event_type: 'set_execution_disposition', disposition: 'do_not_execute'
    }));
    assert.deepEqual(validateAgainstSchema(decided, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', decided);
    const awaiting = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(awaiting.status, 'need_user_answers', JSON.stringify(awaiting));
    assert.equal(awaiting.phase, 'final_confirmation');
    assert.equal(await exists(path.join(executionDirectory, 'output/current.json')), false);
    assert.deepEqual(validateAgainstSchema(awaiting, replySchema), []);

    const confirmed = /** @type {any} */ (structuredClone(decided));
    confirmed.source_revision = 2;
    confirmed.execution_events.push(identifiedRunEvent(
      'confirm_execution_plan', awaiting.execution_presentation.action_context
    ));
    const stale = /** @type {any} */ (structuredClone(confirmed));
    stale.execution_events[stale.execution_events.length - 1] = identifiedRunEvent(
      'confirm_execution_plan', {
        ...awaiting.execution_presentation.action_context,
        presented_plan_digest: `sha256:${'0'.repeat(64)}`
      }
    );
    assert.deepEqual(validateAgainstSchema(stale, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', stale);
    const rejected = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.deepEqual(validateAgainstSchema(rejected, replySchema), [], JSON.stringify(rejected));
    assert.equal(await exists(path.join(executionDirectory, 'output/current.json')), false);
    assert.deepEqual(validateAgainstSchema(confirmed, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', confirmed);
    const finished = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.delivery_intent, 'execution_plan');
    assert.equal(finished.result_kind, 'no_execution_selected');

    const currentPath = path.join(executionDirectory, 'output/current.json');
    const executionManifestBytes = await readFile(currentPath, 'utf8');
    const executionManifest = JSON.parse(executionManifestBytes);
    assert.deepEqual(executionManifest.case_document_ref, caseDocumentRef);
    assert.equal(executionManifest.runner_ready, false);
    assert.deepEqual(executionManifest.runner_projection.case_ids, []);
    assert.equal(executionManifest.runner_projection.case_ids_digest, `sha256:${byteDigest('[]').slice(7)}`);
    for (const forbidden of ['bundle', 'markdown', 'execution_worksheet']) {
      assert.equal(Object.hasOwn(executionManifest, forbidden), false, forbidden);
    }
    assert.equal(
      await readFile(path.join(documentDirectory, 'output/current.json'), 'utf8'),
      documentManifestBytes,
      'execution sibling cannot mutate the Case Document authority'
    );
    await rm(currentPath);
    const recovered = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(recovered.status, 'finished', JSON.stringify(recovered));
    assert.equal(
      await readFile(currentPath, 'utf8'), executionManifestBytes,
      'torn current recovery must reuse persisted completion time and reproduce exact bytes'
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-09] an execution append that leaves the computed plan unchanged folds to the prior final-confirmation reply', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-noop-'));
  const documentRunId = 'RUN-a1111111-1111-4111-8111-111111111111';
  const executionRunId = 'RUN-a2222222-2222-4222-8222-222222222222';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    const decided = /** @type {any} */ (structuredClone(execution.source));
    decided.source_revision = 1;
    decided.execution_events = execution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      }));
    const proof = execution.reply.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
    );
    assert.ok(proof);
    decided.execution_events.push({
      ...proof.action_context, event_type: 'provide_capability_proof',
      proof: { type: proof.proof_contract.type, value: 'verified_available' }
    });
    await stage(execution.directory, 'source_pack', decided);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));

    const duplicateNoOp = /** @type {any} */ (structuredClone(decided));
    duplicateNoOp.source_revision = 2;
    duplicateNoOp.execution_events.push(structuredClone(decided.execution_events[0]));
    await stage(execution.directory, 'source_pack', duplicateNoOp);

    const replay = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.deepEqual(replay, awaiting);
    assert.equal(await exists(path.join(execution.directory, 'accepted/r002/source-pack.json')), false);

    const duplicateProof = /** @type {any} */ (structuredClone(decided));
    duplicateProof.source_revision = 2;
    duplicateProof.execution_events.push(structuredClone(decided.execution_events.at(-1)));
    await stage(execution.directory, 'source_pack', duplicateProof);
    assert.deepEqual(await advanceStrict(execution.directory), awaiting);
    assert.equal(await exists(path.join(execution.directory, 'accepted/r002/source-pack.json')), false);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-09] re-staging an accepted execution Source Pack replays the prior reply after promotion recovery', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-replay-'));
  const documentRunId = 'RUN-b1111111-1111-4111-8111-111111111111';
  const executionRunId = 'RUN-b2222222-2222-4222-8222-222222222222';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    const decided = /** @type {any} */ (structuredClone(execution.source));
    decided.source_revision = 1;
    decided.execution_events = execution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      }));
    await stage(execution.directory, 'source_pack', decided);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));
    const acceptedBytes = await readFile(
      path.join(execution.directory, 'accepted/r001/source-pack.json'), 'utf8'
    );

    // Simulate a process stopping after Source Pack promotion but before its
    // derived final-confirmation presentation is durably re-created.
    await rm(path.join(execution.directory, 'state/execution-final-confirmation.json'));
    await mkdir(path.join(execution.directory, 'staging'), { recursive: true });
    await writeFile(
      path.join(execution.directory, 'staging', STAGE_FILES.source_pack), acceptedBytes, 'utf8'
    );

    const replay = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.deepEqual(replay, awaiting);
    assert.equal(await exists(path.join(execution.directory, 'accepted/r002/source-pack.json')), false);
    assert.equal(
      await exists(path.join(execution.directory, 'state/execution-final-confirmation.json')), true
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-09] a later valid execution action resumes a paused execution plan', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-pause-resume-'));
  const documentRunId = 'RUN-c1111111-1111-4111-8111-111111111111';
  const executionRunId = 'RUN-c2222222-2222-4222-8222-222222222222';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    const pause = execution.reply.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('pause_execution')
    );
    assert.ok(pause);
    const paused = /** @type {any} */ (structuredClone(execution.source));
    paused.source_revision = 1;
    paused.execution_events = [{ ...pause.action_context, event_type: 'pause_execution' }];
    await stage(execution.directory, 'source_pack', paused);
    const pausedReply = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(pausedReply.phase, 'execution_closure', JSON.stringify(pausedReply));

    const resumed = /** @type {any} */ (structuredClone(paused));
    resumed.source_revision = 2;
    resumed.execution_events.push(...execution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      })));
    await stage(execution.directory, 'source_pack', resumed);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-17] final confirmation rejects an exact replay of an earlier pause that would change the current plan', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-final-pause-replay-'));
  const documentRunId = 'RUN-c3111111-1111-4111-8111-111111111111';
  const executionRunId = 'RUN-c3222222-2222-4222-8222-222222222222';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    const pause = execution.reply.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('pause_execution')
    );
    assert.ok(pause);
    const paused = /** @type {any} */ (structuredClone(execution.source));
    paused.source_revision = 1;
    paused.execution_events = [{ ...pause.action_context, event_type: 'pause_execution' }];
    await stage(execution.directory, 'source_pack', paused);
    assert.equal((await advanceStrict(execution.directory)).phase, 'execution_closure');

    const resumed = /** @type {any} */ (structuredClone(paused));
    resumed.source_revision = 2;
    resumed.execution_events.push(...execution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      })));
    await stage(execution.directory, 'source_pack', resumed);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));

    const stalePauseReplay = /** @type {any} */ (structuredClone(resumed));
    stalePauseReplay.source_revision = 3;
    stalePauseReplay.execution_events.push(structuredClone(paused.execution_events[0]));
    await stage(execution.directory, 'source_pack', stalePauseReplay);
    const rejected = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.equal(rejected.phase, 'final_confirmation');
    assert.equal(rejected.incomplete_reason.code, 'FINAL_CONFIRMATION_ACTION_STALE');
    assert.equal(await exists(path.join(execution.directory, 'accepted/r003/source-pack.json')), false);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-17] final confirmation rejects every stale execution-closure action while confirm and cancel remain available', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-final-phase-'));
  const documentRunId = 'RUN-d1111111-1111-4111-8111-111111111111';
  const cancellationRunId = 'RUN-d2222222-2222-4222-8222-222222222222';
  const confirmationRunId = 'RUN-d3333333-3333-4333-8333-333333333333';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const execution = await startExecutionSibling(
      catalog, cancellationRunId, document.caseDocumentRef
    );
    const decided = /** @type {any} */ (structuredClone(execution.source));
    decided.source_revision = 1;
    const items = execution.reply.execution_presentation.items;
    decided.execution_events = items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      }));
    await stage(execution.directory, 'source_pack', decided);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));

    const disposition = items.find((/** @type {any} */ item) => (
      item.available_actions.includes('set_execution_disposition')
    ));
    const proof = items.find((/** @type {any} */ item) => (
      item.available_actions.includes('provide_capability_proof')
    ));
    const pause = items.find((/** @type {any} */ item) => (
      item.available_actions.includes('pause_execution')
    ));
    assert.ok(disposition); assert.ok(proof); assert.ok(pause);
    const staleEvents = [
      { name: 'disposition', event: { ...disposition.action_context, event_type: 'set_execution_disposition', disposition: 'execute' } },
      { name: 'proof', event: { ...proof.action_context, event_type: 'provide_capability_proof', proof: { type: proof.proof_contract.type, value: 'verified_available' } } },
      { name: 'pause', event: { ...pause.action_context, event_type: 'pause_execution' } }
    ];
    for (const staleEvent of staleEvents) {
      const candidate = /** @type {any} */ (structuredClone(decided));
      candidate.source_revision = 2;
      candidate.execution_events.push(staleEvent.event);
      await stage(execution.directory, 'source_pack', candidate);
      const rejected = /** @type {any} */ (await advanceStrict(execution.directory));
      assert.equal(rejected.status, 'need_revision', staleEvent.name);
      assert.equal(rejected.phase, 'final_confirmation', staleEvent.name);
      assert.ok(rejected.diagnostics.some((/** @type {any} */ item) => (
        item.code === 'FINAL_CONFIRMATION_ACTION_STALE'
      )), staleEvent.name);
      assert.equal(await exists(path.join(execution.directory, 'accepted/r002/source-pack.json')), false);
    }

    const cancellation = /** @type {any} */ (structuredClone(decided));
    cancellation.source_revision = 2;
    cancellation.execution_events.push(constructV4ExecutionRunEvent(
      awaiting.execution_presentation, 'cancel_run'
    ));
    await stage(execution.directory, 'source_pack', cancellation);
    const cancelled = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));

    const confirmation = await startExecutionSibling(
      catalog, confirmationRunId, document.caseDocumentRef
    );
    const confirmationDecided = /** @type {any} */ (structuredClone(confirmation.source));
    confirmationDecided.source_revision = 1;
    confirmationDecided.execution_events = confirmation.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      }));
    await stage(confirmation.directory, 'source_pack', confirmationDecided);
    const confirmationAwaiting = /** @type {any} */ (await advanceStrict(confirmation.directory));
    const confirmed = /** @type {any} */ (structuredClone(confirmationDecided));
    confirmed.source_revision = 2;
    confirmed.execution_events.push(constructV4ExecutionRunEvent(
      confirmationAwaiting.execution_presentation, 'confirm_execution_plan'
    ));
    await stage(confirmation.directory, 'source_pack', confirmed);
    assert.equal((await advanceStrict(confirmation.directory)).status, 'finished');

    const reopenDocument = await deliverBendCaseDocumentWithClosedRoot(
      catalog, 'RUN-d4444444-4444-4444-8444-444444444444'
    );
    const reopenExecution = await startExecutionSibling(
      catalog, 'RUN-d5555555-5555-4555-8555-555555555555', reopenDocument.caseDocumentRef
    );
    const reopenDecided = /** @type {any} */ (structuredClone(reopenExecution.source));
    reopenDecided.source_revision = 1;
    reopenDecided.execution_events = reopenExecution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition', disposition: 'do_not_execute'
      }));
    await stage(reopenExecution.directory, 'source_pack', reopenDecided);
    const reopenAwaiting = /** @type {any} */ (await advanceStrict(reopenExecution.directory));
    assert.equal(reopenAwaiting.phase, 'final_confirmation', JSON.stringify(reopenAwaiting));
    const staleReopen = reopenExecution.reply.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('reopen_semantic_question')
    );
    assert.ok(staleReopen);
    const reopenCandidate = /** @type {any} */ (structuredClone(reopenDecided));
    reopenCandidate.source_revision = 2;
    reopenCandidate.execution_events.push({
      ...staleReopen.action_context, event_type: 'reopen_semantic_question'
    });
    await stage(reopenExecution.directory, 'source_pack', reopenCandidate);
    const reopenRejected = /** @type {any} */ (await advanceStrict(reopenExecution.directory));
    assert.equal(reopenRejected.status, 'need_revision');
    assert.equal(reopenRejected.phase, 'final_confirmation');
    assert.ok(reopenRejected.diagnostics.some((/** @type {any} */ item) => (
      item.code === 'FINAL_CONFIRMATION_ACTION_STALE'
    )));
    assert.equal(await exists(path.join(reopenExecution.directory, 'accepted/r002/source-pack.json')), false);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T15 a resource-complete production execution sibling publishes one verified nonempty runner projection without mutating its Case Document', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-ready-catalog-'));
  const documentRunId = 'RUN-33333333-3333-4333-8333-333333333333';
  const executionRunId = 'RUN-44444444-4444-4444-8444-444444444444';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const bundle = JSON.parse(document.bundleBytes);
    const selectedCaseId = bundle.cases.find(
      (/** @type {any} */ item) => item.semantic_status === 'Grounded'
    )?.case_id;
    assert.equal(typeof selectedCaseId, 'string', 'journey requires at least one Grounded Case');

    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    assert.equal(execution.reply.status, 'need_user_answers', JSON.stringify(execution.reply));
    assert.equal(execution.reply.phase, 'execution_closure');
    const items = execution.reply.execution_presentation.items;
    const dispositionItems = items.filter(
      (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
    );
    assert.equal(dispositionItems.length, bundle.cases.length);
    const capabilityItems = items.filter(
      (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
    );
    assert.equal(
      capabilityItems.length,
      bundle.cases.filter((/** @type {any} */ item) => item.semantic_status === 'Grounded').length,
      'the production execution runner must expose one compiler-derived readiness root per Grounded Case'
    );
    assert.ok(
      capabilityItems.every((/** @type {any} */ item) => (
        item.case_ids.length === 1
        && item.root_refs.length === 1
        && item.root_refs[0].root_issue_id.startsWith('EXECROOT-')
        && item.proof_contract?.type === 'testability_availability'
      )),
      'capability actions must identify only execution-readiness roots and the registered proof type'
    );

    const decided = /** @type {any} */ (structuredClone(execution.source));
    decided.source_revision = 1;
    decided.execution_events = dispositionItems.map((/** @type {any} */ item) => ({
      ...item.action_context,
      event_type: 'set_execution_disposition',
      disposition: item.case_ids.includes(selectedCaseId) ? 'execute' : 'do_not_execute'
    }));
    assert.deepEqual(validateAgainstSchema(decided, sourcePackSchema), []);
    await stage(execution.directory, 'source_pack', decided);
    const proofRequired = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(proofRequired.status, 'need_user_answers', JSON.stringify(proofRequired));
    assert.equal(proofRequired.phase, 'execution_closure');
    assert.equal(await exists(path.join(execution.directory, 'output/current.json')), false);
    const selectedCapability = proofRequired.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
        && item.case_ids.includes(selectedCaseId)
    );
    assert.ok(selectedCapability, 'selected Grounded Case must retain its execution-readiness action');

    const invalidProofs = [
      {
        name: 'unknown proof type',
        proof: { type: 'business_semantics', value: 'verified_available' },
        mutate: (/** @type {any} */ _event) => {}
      },
      {
        name: 'unknown proof value',
        proof: { type: selectedCapability.proof_contract.type, value: 'self_asserted' },
        mutate: (/** @type {any} */ _event) => {}
      },
      {
        name: 'stale execution root version',
        proof: { type: selectedCapability.proof_contract.type, value: 'verified_available' },
        mutate: (/** @type {any} */ event) => {
          event.root_refs[0].root_version_digest = 'sha256:' + 'f'.repeat(64);
        }
      },
      {
        name: 'semantic gap root cannot satisfy execution readiness',
        proof: { type: selectedCapability.proof_contract.type, value: 'verified_available' },
        mutate: (/** @type {any} */ event) => {
          event.root_refs = [{
            root_issue_id: 'ROOT-' + 'e'.repeat(64),
            root_version_digest: 'sha256:' + 'd'.repeat(64)
          }];
        }
      }
    ];
    for (const invalid of invalidProofs) {
      const rejected = structuredClone(decided);
      rejected.source_revision = 2;
      const event = {
        ...structuredClone(selectedCapability.action_context),
        event_type: 'provide_capability_proof',
        proof: invalid.proof
      };
      invalid.mutate(event);
      rejected.execution_events.push(event);
      assert.deepEqual(validateAgainstSchema(rejected, sourcePackSchema), [], invalid.name);
      await stage(execution.directory, 'source_pack', rejected);
      const rejection = /** @type {any} */ (await advanceStrict(execution.directory));
      assert.equal(rejection.status, 'need_revision', `${invalid.name}: ${JSON.stringify(rejection)}`);
      assert.match(rejection.incomplete_reason.code, /EXECUTION_(?:PROOF|ACTION)/u, invalid.name);
      assert.equal(
        await exists(path.join(execution.directory, 'accepted/r002/source-pack.json')),
        false,
        `${invalid.name}: rejected proof must not append state`
      );
    }

    const proven = structuredClone(decided);
    proven.source_revision = 2;
    proven.execution_events.push({
      ...structuredClone(selectedCapability.action_context),
      event_type: 'provide_capability_proof',
      proof: {
        type: selectedCapability.proof_contract.type,
        value: 'verified_available'
      }
    });
    assert.deepEqual(validateAgainstSchema(proven, sourcePackSchema), []);
    await stage(execution.directory, 'source_pack', proven);
    const awaiting = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(awaiting.status, 'need_user_answers', JSON.stringify(awaiting));
    assert.equal(awaiting.phase, 'final_confirmation');
    assert.equal(await exists(path.join(execution.directory, 'output/current.json')), false);
    assert.deepEqual(validateAgainstSchema(awaiting, replySchema), []);

    const receiptLedger = JSON.parse(await readFile(
      path.join(execution.directory, 'state/execution-capability-receipts.json'), 'utf8'
    ));
    assert.equal(receiptLedger.run_id, executionRunId);
    assert.deepEqual(receiptLedger.case_document_ref, document.caseDocumentRef);
    assert.equal(receiptLedger.receipts.length, 1);
    assert.equal(receiptLedger.receipts[0].domain, 'testability');
    assert.deepEqual(receiptLedger.receipts[0].case_ids, [selectedCaseId]);
    assert.deepEqual(receiptLedger.receipts[0].root_refs, selectedCapability.root_refs);
    assert.equal(receiptLedger.receipts[0].ready, true);

    const confirmed = structuredClone(proven);
    confirmed.source_revision = 3;
    confirmed.execution_events.push(identifiedRunEvent(
      'confirm_execution_plan', awaiting.execution_presentation.action_context
    ));
    assert.deepEqual(validateAgainstSchema(confirmed, sourcePackSchema), []);
    await stage(execution.directory, 'source_pack', confirmed);
    const finished = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.delivery_intent, 'execution_plan');
    assert.equal(finished.result_kind, 'execution_ready');

    const currentText = await readFile(path.join(execution.directory, 'output/current.json'), 'utf8');
    const current = JSON.parse(currentText);
    assert.equal(current.runner_ready, true);
    assert.deepEqual(current.runner_projection.case_ids, [selectedCaseId]);
    assert.equal(
      current.runner_projection.case_ids_digest,
      byteDigest(canonicalStringify([selectedCaseId]))
    );
    const planText = await readFile(
      path.join(execution.directory, current.execution_plan_artifact.path), 'utf8'
    );
    assert.equal(byteDigest(planText), current.execution_plan_artifact.digest);
    const plan = JSON.parse(planText);
    assert.deepEqual(plan.case_document_ref, document.caseDocumentRef);
    assert.deepEqual(plan.runner_projection, current.runner_projection);
    assert.equal(byteDigest(await readFile(document.manifestPath, 'utf8')), document.caseDocumentRef.manifest_digest);
    assert.equal(byteDigest(await readFile(document.bundlePath, 'utf8')), document.caseDocumentRef.bundle_digest);
    assert.equal(await readFile(document.manifestPath, 'utf8'), document.manifestBytes);
    assert.equal(await readFile(document.bundlePath, 'utf8'), document.bundleBytes);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-09][BR-17] finished replay deterministically rebuilds a missing capability receipt ledger before returning delivery', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-finished-ledger-rebuild-'));
  try {
    const ready = await finishVerifiedExecutionSibling(
      catalog,
      'RUN-13131313-1313-4313-8313-131313131313',
      'RUN-14141414-1414-4414-8414-141414141414'
    );
    const ledgerPath = path.join(
      ready.execution.directory, 'state/execution-capability-receipts.json'
    );
    const expectedLedger = await readFile(ledgerPath, 'utf8');
    const expectedCurrent = await readFile(
      path.join(ready.execution.directory, 'output/current.json'), 'utf8'
    );
    await rm(ledgerPath);

    const replay = /** @type {any} */ (await advanceStrict(ready.execution.directory));

    assert.equal(replay.status, 'finished', JSON.stringify(replay));
    assert.equal(await readFile(ledgerPath, 'utf8'), expectedLedger);
    assert.equal(
      await readFile(path.join(ready.execution.directory, 'output/current.json'), 'utf8'),
      expectedCurrent,
      'ledger reconstruction must not republish or rewrite the canonical delivery'
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('[BR-09][BR-17] finished replay fails closed when accepted capability history no longer equals the delivered plan', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-finished-history-tamper-'));
  try {
    const ready = await finishVerifiedExecutionSibling(
      catalog,
      'RUN-15151515-1515-4515-8515-151515151515',
      'RUN-16161616-1616-4616-8616-161616161616'
    );
    const currentPath = path.join(ready.execution.directory, 'output/current.json');
    const expectedCurrent = await readFile(currentPath, 'utf8');
    const acceptedPath = path.join(
      ready.execution.directory, 'accepted/r003/source-pack.json'
    );
    const accepted = JSON.parse(await readFile(acceptedPath, 'utf8'));
    const proof = accepted.execution_events.find(
      (/** @type {any} */ event) => event.event_type === 'provide_capability_proof'
    );
    assert.ok(proof);
    proof.proof.value = 'verified_unavailable';
    await writeFile(acceptedPath, `${canonicalStringify(accepted)}\n`, 'utf8');

    const replay = /** @type {any} */ (await advanceStrict(ready.execution.directory));

    assert.equal(replay.status, 'fatal', JSON.stringify(replay));
    assert.equal(replay.result_kind, 'quality_failure');
    assert.match(replay.incomplete_reason.code, /INTEGRITY|HISTORY|DELIVERY/u);
    assert.equal(
      await readFile(currentPath, 'utf8'), expectedCurrent,
      'tampered accepted history cannot rewrite or replace the committed delivery'
    );
    assert.equal(await readFile(ready.document.manifestPath, 'utf8'), ready.document.manifestBytes);
    assert.equal(await readFile(ready.document.bundlePath, 'utf8'), ready.document.bundleBytes);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T12 execution-closure and final-confirmation cancellation are terminal and resumable only as siblings', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-cancel-catalog-'));
  const documentRunId = 'RUN-50505050-5050-4050-8050-505050505050';
  const closureRunId = 'RUN-60606060-6060-4060-8060-606060606060';
  const closureSiblingId = 'RUN-70707070-7070-4070-8070-707070707070';
  const finalRunId = 'RUN-80808080-8080-4080-8080-808080808080';
  const finalSiblingId = 'RUN-90909090-9090-4090-8090-909090909090';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);

    const closure = await startExecutionSibling(catalog, closureRunId, document.caseDocumentRef);
    assert.equal(closure.reply.phase, 'execution_closure', JSON.stringify(closure.reply));
    const closureCandidate = /** @type {any} */ (structuredClone(closure.source));
    closureCandidate.source_revision = 1;
    closureCandidate.execution_events = [constructV4ExecutionRunEvent(
      closure.reply.execution_presentation, 'cancel_run'
    )];
    await stage(closure.directory, 'source_pack', closureCandidate);
    const closureCancelled = /** @type {any} */ (await advanceStrict(closure.directory));
    assert.equal(closureCancelled.status, 'cancelled', JSON.stringify(closureCancelled));
    assert.equal(closureCancelled.phase, 'execution_closure');
    assert.deepEqual(validateAgainstSchema(closureCancelled, replySchema), []);
    assert.deepEqual(await advanceStrict(closure.directory), closureCancelled);
    assert.equal(await exists(path.join(closure.directory, 'accepted/r001/source-pack.json')), false);
    assert.equal(await exists(path.join(closure.directory, 'output/current.json')), false);
    const closureOrdinary = /** @type {any} */ (structuredClone(closure.source));
    closureOrdinary.source_revision = 1;
    const pause = closure.reply.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('pause_execution')
    );
    closureOrdinary.execution_events = [{ ...pause.action_context, event_type: 'pause_execution' }];
    await stage(closure.directory, 'source_pack', closureOrdinary);
    assert.deepEqual(await advanceStrict(closure.directory), closureCancelled);
    assert.equal(await exists(path.join(closure.directory, 'accepted/r001/source-pack.json')), false);
    await createResumeCancelledSiblingV4(catalog, {
      parent_run_id: closureRunId, run_id: closureSiblingId
    });
    const closureResumed = /** @type {any} */ (await advanceStrict(
      path.join(catalog, 'runs', closureSiblingId)
    ));
    assert.equal(closureResumed.status, 'need_revision', JSON.stringify(closureResumed));
    assert.equal(closureResumed.stage, 'source_pack');

    const final = await startExecutionSibling(catalog, finalRunId, document.caseDocumentRef);
    const dispositionItems = final.reply.execution_presentation.items.filter(
      (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
    );
    const decided = /** @type {any} */ (structuredClone(final.source));
    decided.source_revision = 1;
    decided.execution_events = dispositionItems.map((/** @type {any} */ item) => ({
      ...item.action_context, event_type: 'set_execution_disposition', disposition: 'do_not_execute'
    }));
    await stage(final.directory, 'source_pack', decided);
    const awaiting = /** @type {any} */ (await advanceStrict(final.directory));
    assert.equal(awaiting.phase, 'final_confirmation', JSON.stringify(awaiting));
    const finalCandidate = /** @type {any} */ (structuredClone(decided));
    finalCandidate.source_revision = 2;
    finalCandidate.execution_events.push(constructV4ExecutionRunEvent(
      awaiting.execution_presentation, 'cancel_run'
    ));
    await stage(final.directory, 'source_pack', finalCandidate);
    const finalCancelled = /** @type {any} */ (await advanceStrict(final.directory));
    assert.equal(finalCancelled.status, 'cancelled', JSON.stringify(finalCancelled));
    assert.equal(finalCancelled.phase, 'final_confirmation');
    assert.deepEqual(validateAgainstSchema(finalCancelled, replySchema), []);
    assert.deepEqual(await advanceStrict(final.directory), finalCancelled);
    assert.equal(await exists(path.join(final.directory, 'accepted/r002/source-pack.json')), false);
    assert.equal(await exists(path.join(final.directory, 'output/current.json')), false);
    const confirmAfterCancel = /** @type {any} */ (structuredClone(decided));
    confirmAfterCancel.source_revision = 2;
    confirmAfterCancel.execution_events.push(constructV4ExecutionRunEvent(
      awaiting.execution_presentation, 'confirm_execution_plan'
    ));
    await stage(final.directory, 'source_pack', confirmAfterCancel);
    assert.deepEqual(await advanceStrict(final.directory), finalCancelled);
    assert.equal(await exists(path.join(final.directory, 'output/current.json')), false);
    await createResumeCancelledSiblingV4(catalog, {
      parent_run_id: finalRunId, run_id: finalSiblingId
    });
    const finalResumed = /** @type {any} */ (await advanceStrict(
      path.join(catalog, 'runs', finalSiblingId)
    ));
    assert.equal(finalResumed.status, 'need_revision', JSON.stringify(finalResumed));
    assert.equal(finalResumed.stage, 'source_pack');

    assert.equal(await readFile(document.manifestPath, 'utf8'), document.manifestBytes);
    assert.equal(await readFile(document.bundlePath, 'utf8'), document.bundleBytes);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T15 production execution rejects tampered refs, manifests, and bundles atomically', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-tamper-catalog-'));
  const documentRunId = 'RUN-55555555-5555-4555-8555-555555555555';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const cases = [
      {
        name: 'ref', runId: 'RUN-66666666-6666-4666-8666-666666666666',
        ref: {
          ...document.caseDocumentRef,
          manifest_digest: `${document.caseDocumentRef.manifest_digest.slice(0, -1)}${
            document.caseDocumentRef.manifest_digest.endsWith('0') ? '1' : '0'
          }`
        },
        tamper: async () => {}
      },
      {
        name: 'manifest', runId: 'RUN-77777777-7777-4777-8777-777777777777',
        ref: document.caseDocumentRef,
        tamper: async () => writeFile(document.manifestPath, `${document.manifestBytes}\n`, 'utf8')
      },
      {
        name: 'bundle', runId: 'RUN-88888888-8888-4888-8888-888888888888',
        ref: document.caseDocumentRef,
        tamper: async () => writeFile(document.bundlePath, `${document.bundleBytes}\n`, 'utf8')
      }
    ];
    for (const item of cases) {
      await writeFile(document.manifestPath, document.manifestBytes, 'utf8');
      await writeFile(document.bundlePath, document.bundleBytes, 'utf8');
      await item.tamper();
      const parentManifestAtInvocation = await readFile(document.manifestPath, 'utf8');
      const parentBundleAtInvocation = await readFile(document.bundlePath, 'utf8');
      const execution = await startExecutionSibling(catalog, item.runId, item.ref);
      assert.equal(execution.reply.status, 'fatal', `${item.name}: ${JSON.stringify(execution.reply)}`);
      assert.equal(execution.reply.result_kind, 'quality_failure', item.name);
      assert.match(execution.reply.incomplete_reason.code, /CASE_DOCUMENT|RUN_INTEGRITY/u, item.name);
      assert.deepEqual(execution.reply.produced_artifacts, [], item.name);
      assert.equal(
        await exists(path.join(execution.directory, 'accepted/r000/source-pack.json')),
        false,
        `${item.name}: invalid reference bytes must not commit the execution Source Pack`
      );
      assert.equal(await exists(path.join(execution.directory, 'output/current.json')), false, item.name);
      assert.equal(await readFile(document.manifestPath, 'utf8'), parentManifestAtInvocation, item.name);
      assert.equal(await readFile(document.bundlePath, 'utf8'), parentBundleAtInvocation, item.name);
    }
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T15 production execution ignores the legacy private binding shortcut and requires a verified capability event', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-binding-bypass-'));
  const documentRunId = 'RUN-99999999-9999-4999-8999-999999999999';
  try {
    const document = await deliverBendCaseDocument(catalog, documentRunId);
    const bundle = JSON.parse(document.bundleBytes);
    const selectedCaseId = bundle.cases.find(
      (/** @type {any} */ item) => item.semantic_status === 'Grounded'
    ).case_id;
    const executionRunId = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const executionDirectory = path.join(catalog, 'runs', executionRunId);
    const forged = await writeLegacyExecutionBinding(
      executionDirectory, executionRunId, document.caseDocumentRef, selectedCaseId
    );
    const execution = await startExecutionSibling(
      catalog, executionRunId, document.caseDocumentRef
    );
    assert.equal(execution.reply.status, 'need_user_answers', JSON.stringify(execution.reply));
    assert.equal(execution.reply.phase, 'execution_closure');
    assert.ok(execution.reply.execution_presentation.items.some(
      (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
        && item.case_ids.includes(selectedCaseId)
    ));

    const decided = structuredClone(execution.source);
    decided.source_revision = 1;
    decided.execution_events = execution.reply.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => ({
        ...item.action_context,
        event_type: 'set_execution_disposition',
        disposition: item.case_ids.includes(selectedCaseId) ? 'execute' : 'do_not_execute'
      }));
    await stage(execution.directory, 'source_pack', decided);
    const stillPending = /** @type {any} */ (await advanceStrict(execution.directory));
    assert.equal(stillPending.status, 'need_user_answers', JSON.stringify(stillPending));
    assert.equal(stillPending.phase, 'execution_closure');
    assert.equal(await exists(path.join(execution.directory, 'output/current.json')), false);
    assert.equal(await readFile(forged.bindingPath, 'utf8'), forged.text);
    assert.equal(
      await exists(path.join(execution.directory, 'state/execution-capability-receipts.json')),
      true,
      'accepted execution state owns an empty receipt ledger instead of trusting legacy claim IDs'
    );
    const ledger = JSON.parse(await readFile(
      path.join(execution.directory, 'state/execution-capability-receipts.json'), 'utf8'
    ));
    assert.deepEqual(ledger.receipts, []);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});
