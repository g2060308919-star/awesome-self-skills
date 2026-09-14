import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import executionPlanSchema from '../../skill/generate-test-cases/scripts/schemas/execution-plan.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const delivery = /** @type {any} */ (await import('../../src/canonical-delivery-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));
const byteDigest = (/** @type {string} */ value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

/** @param {string} eventId */
function warning(eventId) {
  return {
    code: 'FINAL_AUTHORITY_NOT_GRANTED', severity: 'warning',
    message: 'Final authority was not granted.', source_event_id: eventId,
    affected_question_part_ids: [`QP-${eventId}`]
  };
}

/** @returns {any} */
function fixture() {
  const riskKinds = [
    'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
    'long_content', 'pagination', 'refresh', 'business_permission_boundary'
  ];
  return {
    run_id: 'RUN-delivery-v4', completed_at: '2026-09-09T00:00:00.000Z',
    bundle: {
      schema_version: '4.0.0', compiler_version: '0.5.0', delivery_intent: 'case_document',
      source_revision: 3, result_kind: 'delivered_cases', ordered_case_ids: ['CASE-review'],
      scope_manifest: {
        primary_surface: 'admin',
        modules: [{ module_id: 'admin', name: '评价中台', role: 'primary', claim_ids: ['CLM-module'] }],
        boundaries: []
      },
      cases: [{
        case_id: 'CASE-review', title: '管理员查看评价来源', module_id: 'admin', priority: 'P0',
        ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: [] },
        acceptance_role: 'primary_acceptance', fact_ids: ['FACT-source'], semantic_status: 'Grounded',
        primary_test_point_id: 'TP-source', supporting_observation_ids: [],
        business_preconditions: [{ precondition_id: 'PRE-login', description: '管理员已登录' }],
        data_conditions: [{ condition_id: 'DATA-review', description: '存在来源为打车去过的评价' }],
        steps: [{ step_id: 'STEP-open', action: '打开评价列表' }],
        oracles: [{ oracle_id: 'ORACLE-source', observe_after_step_id: 'STEP-open', surface: 'ui', expected: '来源显示为打车去过', claim_ids: ['CLM-source'] }]
      }],
      coverage: {
        primary: { reviewed_formal_test_point_count: 1, covered_formal_test_point_count: 1, not_applicable_formal_test_point_count: 0 },
        boundary: { reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0 },
        semantic_gap_count: 0, exploratory_count: riskKinds.length, not_applicable_count: 0
      },
      semantic_root_groups: [],
      exploratory: riskKinds.map(riskKind => ({
        exploratory_id: `EXP-${riskKind}`, module_id: 'admin', title: `${riskKind} 风险`, reason: '版本化风险目录建议探索检查'
      })),
      not_applicable: [],
      risk_review_ledger: riskKinds.map(riskKind => ({
        module_id: 'admin', risk_kind: riskKind, acceptance_role: 'primary_acceptance', status: 'exploratory',
        review_basis: { kind: 'risk_catalog', policy_id: `risk.${riskKind}`, policy_version: '1.0.0' },
        exploratory_ids: [`EXP-${riskKind}`]
      }))
    },
    render_options: { include_audit_appendix: false }, non_blocking_diagnostics: []
  };
}

function executionFixture(resultKind = 'execution_ready') {
  const document = delivery.materializeCaseDocumentDeliveryV4(fixture());
  const manifestBytes = `${canonicalStringify(document.manifest)}\n`;
  const caseIds = resultKind === 'execution_ready' ? ['CASE-review'] : [];
  const caseDocumentRef = {
    run_id: document.manifest.run_id, revision: document.manifest.revision,
    manifest_digest: byteDigest(manifestBytes),
    bundle_digest: document.manifest.bundle.digest
  };
  return {
    input: {
      run_id: 'RUN-execution-v4', revision: 1, completed_at: '2026-09-09T01:00:00.000Z',
      case_document_ref: caseDocumentRef,
      execution_plan: {
        schema_version: '4.0.0', compiler_version: '0.5.0', delivery_intent: 'execution_plan',
        status: 'finished', result_kind: resultKind, case_document_ref: caseDocumentRef,
        items: [{ case_id: 'CASE-review', semantic_status: 'Grounded', disposition: resultKind === 'execution_ready' ? 'execute' : 'do_not_execute', ready: resultKind === 'execution_ready' }],
        runner_ready: resultKind === 'execution_ready',
        runner_projection: { case_ids: caseIds, case_ids_digest: `sha256:${digest(caseIds)}` }
      },
      non_blocking_diagnostics: []
    },
    resolver: async () => ({ manifest_bytes: manifestBytes, bundle_bytes: document.bundle_bytes })
  };
}

test('T03/T12 final execution-plan artifact is closed and version-correct', async () => {
  const { input, resolver } = executionFixture();
  const materialized = await delivery.materializeExecutionPlanDeliveryV4(
    input, { resolve_case_document: resolver }
  );
  assert.deepEqual(validateAgainstSchema(materialized.execution_plan, executionPlanSchema), []);

  for (const mutate of [
    (/** @type {any} */ plan) => { delete plan.compiler_version; },
    (/** @type {any} */ plan) => { plan.schema_version = '3.0.0'; },
    (/** @type {any} */ plan) => { plan.unexpected = true; },
    (/** @type {any} */ plan) => { plan.items[0].unexpected = true; }
  ]) {
    const malformed = executionFixture();
    mutate(malformed.input.execution_plan);
    await assert.rejects(
      () => delivery.materializeExecutionPlanDeliveryV4(
        malformed.input, { resolve_case_document: malformed.resolver }
      ),
      /EXECUTION_PLAN_SCHEMA_INVALID/u
    );
  }
});

test('T12 materializes JSON, Markdown and CSV from one canonical bundle and binds exact bytes', () => {
  assert.equal(typeof delivery.materializeCaseDocumentDeliveryV4, 'function');
  const result = delivery.materializeCaseDocumentDeliveryV4(fixture());
  assert.equal(JSON.parse(result.bundle_bytes).ordered_case_ids[0], 'CASE-review');
  assert.match(result.markdown_bytes, /\| 评价中台 \| P0 \| 管理员查看评价来源 \| 已确认 \|/u);
  assert.match(result.worksheet_bytes, /\nCASE-review,primary_acceptance,评价中台,P0,管理员查看评价来源,/u);
  assert.equal(result.bundle_bytes.endsWith('\n'), true);
  assert.equal(result.markdown_bytes.endsWith('\n'), true);
  assert.equal(result.worksheet_bytes.endsWith('\n'), true);
  assert.deepEqual(result.manifest, {
    run_id: 'RUN-delivery-v4', revision: 3, schema_version: '4.0.0', compiler_version: '0.5.0',
    delivery_intent: 'case_document', authority: 'canonical', result_kind: 'delivered_cases',
    bundle: { path: 'output/r003/test-bundle.json', digest: result.manifest.bundle.digest },
    markdown: { path: 'output/r003/test-cases.md', digest: result.manifest.markdown.digest },
    execution_worksheet: { path: 'output/r003/execution-worksheet.csv', digest: result.manifest.execution_worksheet.digest, format: 'csv' },
    render_options: { include_audit_appendix: false }, case_count: 1, blocked_root_count: 0,
    closed_for_delivery_root_count: 0, not_applicable_count: 0, exploratory_count: 9,
    completed_at: '2026-09-09T00:00:00.000Z'
  });
  for (const value of [result.manifest.bundle.digest, result.manifest.markdown.digest, result.manifest.execution_worksheet.digest]) {
    assert.match(value, /^sha256:[0-9a-f]{64}$/u);
  }
});

test('T12 canonical delivery refuses an incomplete primary-module risk review', () => {
  const value = fixture();
  value.bundle.risk_review_ledger.pop();
  value.bundle.exploratory.pop();
  value.bundle.coverage.exploratory_count -= 1;
  assert.throws(() => delivery.materializeCaseDocumentDeliveryV4(value), /RISK_REVIEW_INCOMPLETE/u);
});

test('T12 publishes current.json only after all three artifacts survive exact read-back', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-delivery-'));
  const result = await delivery.publishCaseDocumentDeliveryV4(directory, fixture());
  const current = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
  assert.deepEqual(current, result.manifest);
  assert.equal(result.reply.status, 'finished');
  assert.deepEqual(result.reply.produced_artifacts.map((/** @type {any} */ item) => item.kind), [
    'case_document', 'business_markdown', 'execution_worksheet'
  ]);
  assert.equal(result.reply.incomplete_reason, null);
});

test('T12 finished delivery canonicalizes public warning order at its construction boundary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-delivery-warning-order-'));
  const input = fixture();
  input.non_blocking_diagnostics = [warning('EVENT-z'), warning('EVENT-a')];
  const result = await delivery.publishCaseDocumentDeliveryV4(directory, input);
  assert.deepEqual(
    result.reply.non_blocking_diagnostics.map((/** @type {any} */ item) => item.source_event_id),
    ['EVENT-a', 'EVENT-z']
  );
});

test('T12 finished verification rejects a missing or byte-tampered JSON, Markdown or CSV', async () => {
  for (const artifact of ['bundle', 'markdown', 'execution_worksheet']) {
    const directory = await mkdtemp(path.join(os.tmpdir(), `gtc-v4-tamper-${artifact}-`));
    const published = await delivery.publishCaseDocumentDeliveryV4(directory, fixture());
    const target = path.join(directory, published.manifest[artifact].path);
    await writeFile(target, `${await readFile(target, 'utf8')}tampered`, 'utf8');
    await assert.rejects(() => delivery.verifyCaseDocumentDeliveryV4(directory), /CANONICAL_ARTIFACT_(?:DIGEST_MISMATCH|INVALID)/u);
  }
});

test('T12 ignores stray legacy output and reports only the artifacts bound by current.json', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-stray-'));
  await writeFile(path.join(directory, 'test-cases.md'), '# stale legacy output\n', 'utf8');
  const published = await delivery.publishCaseDocumentDeliveryV4(directory, fixture());
  const verified = await delivery.verifyCaseDocumentDeliveryV4(directory);
  assert.equal(verified.manifest.revision, 3);
  assert.equal(verified.artifacts.markdown, published.markdown_bytes);
  assert.doesNotMatch(verified.artifacts.markdown, /stale legacy/u);
});

test('T12 current authority cannot redirect canonical artifacts to a stale revision path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-redirect-'));
  const published = await delivery.publishCaseDocumentDeliveryV4(directory, fixture());
  const staleDirectory = path.join(directory, 'output/r002');
  await mkdir(staleDirectory, { recursive: true });
  await writeFile(path.join(staleDirectory, 'test-bundle.json'), published.bundle_bytes, 'utf8');
  const redirected = structuredClone(published.manifest);
  redirected.bundle.path = 'output/r002/test-bundle.json';
  await writeFile(path.join(directory, 'output/current.json'), `${canonicalStringify(redirected)}\n`, 'utf8');
  await assert.rejects(() => delivery.verifyCaseDocumentDeliveryV4(directory), /CANONICAL_MANIFEST/u);
});

test('T12 execution delivery references an immutable Case Document without copying its three artifacts', async () => {
  assert.equal(typeof delivery.publishExecutionPlanDeliveryV4, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-'));
  const { input, resolver } = executionFixture();
  const result = await delivery.publishExecutionPlanDeliveryV4(directory, input, { resolve_case_document: resolver });
  assert.equal(result.reply.status, 'finished');
  assert.equal(result.reply.result_kind, 'execution_ready');
  assert.deepEqual(result.reply.produced_artifacts.map((/** @type {any} */ item) => item.kind), ['execution_plan']);
  assert.equal(result.manifest.runner_ready, true);
  assert.deepEqual(result.manifest.runner_projection.case_ids, ['CASE-review']);
  for (const forbidden of ['bundle', 'markdown', 'execution_worksheet', 'case_count', 'blocked_root_count']) {
    assert.equal(Object.hasOwn(result.manifest, forbidden), false, forbidden);
  }
  const files = await delivery.verifyExecutionPlanDeliveryV4(directory, { resolve_case_document: resolver });
  assert.equal(files.execution_plan.result_kind, 'execution_ready');
});

test('T12 execution finished verification rejects plan, reference, runner digest and ordering tampering', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-tamper-'));
  const { input, resolver } = executionFixture();
  const published = await delivery.publishExecutionPlanDeliveryV4(directory, input, { resolve_case_document: resolver });
  const target = path.join(directory, published.manifest.execution_plan_artifact.path);
  await writeFile(target, `${await readFile(target, 'utf8')}tampered`, 'utf8');
  await assert.rejects(() => delivery.verifyExecutionPlanDeliveryV4(directory, { resolve_case_document: resolver }), /CANONICAL_ARTIFACT/u);

  for (const mutate of [
    (/** @type {any} */ value) => { value.execution_plan.runner_projection.case_ids_digest = `sha256:${'0'.repeat(64)}`; },
    (/** @type {any} */ value) => { value.execution_plan.runner_projection.case_ids = ['CASE-missing']; value.execution_plan.runner_projection.case_ids_digest = `sha256:${digest(['CASE-missing'])}`; },
    (/** @type {any} */ value) => { value.execution_plan.runner_ready = false; },
    (/** @type {any} */ value) => { value.case_document_ref.bundle_digest = `sha256:${'0'.repeat(64)}`; value.execution_plan.case_document_ref = value.case_document_ref; }
  ]) {
    const next = executionFixture(); mutate(next.input);
    const run = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-execution-invalid-'));
    await assert.rejects(() => delivery.publishExecutionPlanDeliveryV4(run, next.input, { resolve_case_document: next.resolver }), /EXECUTION|CASE_DOCUMENT|MANIFEST/u);
  }
});

test('T12 all-DNE execution has an empty verified runner projection and no runner readiness', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-no-execution-'));
  const { input, resolver } = executionFixture('no_execution_selected');
  const result = await delivery.publishExecutionPlanDeliveryV4(directory, input, { resolve_case_document: resolver });
  assert.equal(result.manifest.result_kind, 'no_execution_selected');
  assert.equal(result.manifest.runner_ready, false);
  assert.deepEqual(result.manifest.runner_projection.case_ids, []);
});
