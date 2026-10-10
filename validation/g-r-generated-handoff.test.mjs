import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { advanceStrict } from '../generate-test-cases-engineering/src/advance-strict.mjs';
import { canonicalStringify } from '../generate-test-cases-engineering/src/canonical.mjs';
import { constructV4Action, prepareV4Source } from '../generate-test-cases-engineering/src/entry.mjs';
import { stageV4PrdCollectionObservation } from '../generate-test-cases-engineering/src/prd-source-collection-v4.mjs';
import { createV4RunDirectory } from '../generate-test-cases-engineering/src/run-bootstrap-v4.mjs';
import { STAGE_FILES } from '../generate-test-cases-engineering/src/run-store.mjs';
import { v4GeneralQualityFixture } from '../generate-test-cases-engineering/test/helpers/v4-general-quality-fixture.mjs';
import { loadGCaseDocumentHandoff } from '../b2b-e2e-runner/scripts/lib/g-case-document-handoff.mjs';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const execFileAsync = promisify(execFile);

test('official G Case Document and test-confirmed Execution Plan reach R init-g', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'g-r-generated-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const catalog = path.join(root, 'catalog');
  await mkdir(catalog);
  const g = await createV4RunDirectory(catalog, 'case_document');
  const fixture = v4GeneralQualityFixture('4.3.2');
  fixture.artifacts.source_pack.run_instance_id = g.run_id;
  let reply = await advanceStrict(g.run_directory);
  assert.equal(reply.status, 'need_revision');
  const source = fixture.artifacts.source_pack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  const prepared = prepareV4Source({
    metadata: Object.fromEntries(['source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain']
      .filter(key => source[key] !== undefined).map(key => [key, source[key]])),
    raw_response_bytes: bytes, capture_bytes: bytes, assets: [], acquisition: {}, additional_units: []
  });
  assert.equal(prepared.status, 'prepared');
  fixture.artifacts.source_pack.sources[0] = prepared.source;
  await stageV4PrdCollectionObservation(g.run_directory, reply, {
    version: '1.0.0',
    scope: { mode: 'provided_materials', root_ref: 'provided:synthetic-prd',
      source_version: source.version,
      collection_window: { started_at: '2026-10-09T00:00:00.000Z', ended_at: '2026-10-09T00:00:01.000Z' } },
    channels: [
      { channel: 'body', enumeration_status: 'exhausted', page_count: 1,
        terminal_page_observed: true, diagnostic_code: null },
      ...['table', 'image', 'comment', 'reply'].map(channel => ({ channel,
        enumeration_status: 'not_applicable', page_count: 0,
        terminal_page_observed: false, diagnostic_code: null }))
    ],
    items: [{ item_id: 'body', parent_item_id: null, channel: 'body', source_id: source.source_id,
      asset_id: null, unit_ids: [prepared.source.semantic_projection.structure[0].unit_id],
      acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null }]
  }, [{ item_id: 'body', raw_response_bytes: bytes, capture_bytes: bytes }]);
  for (const stage of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
    await mkdir(path.join(g.run_directory, 'staging'), { recursive: true });
    await writeFile(path.join(g.run_directory, 'staging', STAGE_FILES[stage]),
      `${canonicalStringify(fixture.artifacts[stage])}\n`);
    reply = await advanceStrict(g.run_directory);
  }
  assert.equal(reply.status, 'finished', JSON.stringify(reply));
  const caseManifestPath = path.join(g.run_directory, 'output/current.json');
  const caseManifestBytes = await readFile(caseManifestPath);
  const caseManifest = JSON.parse(caseManifestBytes);
  const bundle = JSON.parse(await readFile(path.join(g.run_directory, caseManifest.bundle.path)));
  const caseIds = bundle.ordered_case_ids;
  assert.equal(caseIds.length, 1);

  // The confirmation below is an explicit test input, not a business user's
  // approval of this synthetic scenario.
  const ref = { run_id: g.run_id, revision: caseManifest.revision,
    manifest_digest: hash(caseManifestBytes), bundle_digest: caseManifest.bundle.digest };
  const execution = await createV4RunDirectory(catalog, 'execution_plan');
  const executionSource = (revision, events) => ({
    schema_version: '4.3.2', source_revision: revision, run_instance_id: execution.run_id,
    run_scope: `execution:${g.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: ref, output_language: 'zh-CN',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] },
    decision_records: [], clarification_events: [], execution_events: events,
    source_assets: [], artifact_events: []
  });
  async function submitExecution(revision, events) {
    await mkdir(path.join(execution.run_directory, 'staging'), { recursive: true });
    await writeFile(path.join(execution.run_directory, 'staging', STAGE_FILES.source_pack),
      `${canonicalStringify(executionSource(revision, events))}\n`);
    return advanceStrict(execution.run_directory);
  }
  const events = [];
  let executionReply = await submitExecution(0, events);
  assert.equal(executionReply.phase, 'execution_closure', JSON.stringify(executionReply));
  for (const item of executionReply.execution_presentation.items.filter(item =>
    item.available_actions.includes('set_execution_disposition'))) {
    events.push(constructV4Action(executionReply, {
      action: 'set_execution_disposition', action_context: item.action_context,
      disposition: item.case_ids.includes(caseIds[0]) ? 'execute' : 'do_not_execute'
    }));
  }
  executionReply = await submitExecution(1, events);
  const proofItem = executionReply.execution_presentation.items.find(item =>
    item.available_actions.includes('provide_capability_proof') && item.case_ids.includes(caseIds[0]));
  assert.ok(proofItem, JSON.stringify(executionReply));
  events.push(constructV4Action(executionReply, {
    action: 'provide_capability_proof', action_context: proofItem.action_context,
    proof: { type: proofItem.proof_contract.type, value: 'verified_available' }
  }));
  executionReply = await submitExecution(2, events);
  assert.equal(executionReply.phase, 'final_confirmation', JSON.stringify(executionReply));
  events.push(constructV4Action(executionReply, { action: 'confirm_execution_plan' }));
  executionReply = await submitExecution(3, events);
  assert.equal(executionReply.status, 'finished', JSON.stringify(executionReply));
  assert.equal(executionReply.result_kind, 'execution_ready');
  const planManifestPath = path.join(execution.run_directory, 'output/current.json');
  const deliveredPlanManifest = JSON.parse(await readFile(planManifestPath, 'utf8'));
  const deliveredPlan = JSON.parse(await readFile(path.join(execution.run_directory,
    deliveredPlanManifest.execution_plan_artifact.path), 'utf8'));
  assert.equal(bundle.cases[0].semantic_status, 'Grounded');
  assert.equal(deliveredPlan.items.find(item => item.case_id === caseIds[0])?.disposition,
    'execute', JSON.stringify(deliveredPlan.items));
  const suite = { name: '非敏感生成交接', target_urls: ['https://staging.example.test'] };
  const gCompilerPath = fileURLToPath(new URL(
    '../generate-test-cases-engineering/skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url
  ));
  const casesInput = await loadGCaseDocumentHandoff({ caseManifestPath, planManifestPath,
    gCompilerPath, suite });
  const suitePath = path.join(root, 'suite.json');
  await writeFile(suitePath, JSON.stringify(suite));
  const { stdout } = await execFileAsync(process.execPath, [
    fileURLToPath(new URL('../b2b-e2e-runner/scripts/run-artifacts.mjs', import.meta.url)), 'init-g',
    '--workspace', path.join(root, 'runner'), '--case-manifest', caseManifestPath,
    '--plan-manifest', planManifestPath, '--g-compiler', gCompilerPath, '--suite', suitePath,
    '--workflow-profile', 'permission-batches-html-v3'
  ]);
  const r = JSON.parse(stdout);
  assert.equal(r.ok, true);
  const frozen = JSON.parse(await readFile(path.join(r.runRoot, 'test-cases.json')));
  assert.deepEqual(frozen, casesInput);
  assert.deepEqual(frozen.cases.map(item => item.case_id), caseIds);
  assert.deepEqual(frozen.cases[0].source_case, bundle.cases[0]);
  assert.deepEqual(frozen.cases[0].steps.flatMap(step => step.expected.map(oracle => oracle.text)),
    bundle.cases[0].oracles.map(oracle => oracle.expected));

  const oldCompilerPath = path.join(root, 'old-compiler.mjs');
  await writeFile(oldCompilerPath, 'export const advanceStrict = () => {};\n');
  await assert.rejects(loadGCaseDocumentHandoff({ caseManifestPath, planManifestPath,
    gCompilerPath: oldCompilerPath, suite }), /版本缺少正式交付校验入口/u);

  const forgedRun = path.join(root, 'forged-plan');
  await mkdir(path.join(forgedRun, 'output/r000'), { recursive: true });
  const realPlanManifest = JSON.parse(await readFile(planManifestPath, 'utf8'));
  const forgedPlan = JSON.parse(await readFile(path.join(execution.run_directory,
    realPlanManifest.execution_plan_artifact.path), 'utf8'));
  forgedPlan.runner_projection.case_ids = [];
  forgedPlan.runner_projection.case_ids_digest = hash('[]');
  const forgedBytes = `${JSON.stringify(forgedPlan)}\n`;
  await writeFile(path.join(forgedRun, 'output/r000/execution-plan.json'), forgedBytes);
  await writeFile(path.join(forgedRun, 'output/current.json'), `${JSON.stringify({
    ...realPlanManifest, revision: 0,
    runner_projection: forgedPlan.runner_projection,
    execution_plan_artifact: { path: 'output/r000/execution-plan.json', digest: hash(forgedBytes) }
  })}\n`);
  await assert.rejects(loadGCaseDocumentHandoff({ caseManifestPath,
    planManifestPath: path.join(forgedRun, 'output/current.json'), gCompilerPath, suite }),
  /G 官方/u);
});
