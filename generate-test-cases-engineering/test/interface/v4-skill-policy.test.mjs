import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillRoot = path.join(repositoryRoot, 'skill/generate-test-cases');
/** @param {string} relative */
const load = relative => readFile(path.join(skillRoot, relative), 'utf8');

test('v4 Skill makes Case Document the ordinary resource-independent path and Execution Plan an explicit downstream path', async () => {
  const skill = await load('SKILL.md');
  assert.match(skill, /v4[\s\S]*only public|唯一公开[\s\S]*v4/iu);
  assert.match(skill, /ordinary[\s\S]*`delivery_intent=case_document`[\s\S]*explicit/iu);
  assert.match(skill, /`delivery_intent=execution_plan`[\s\S]*only when the user explicitly asks/iu);
  assert.match(skill, /Case Document[\s\S]*(?:does not|must not)[\s\S]*(?:environment URL|account)[\s\S]*(?:observer|control)[\s\S]*resource/iu);
  assert.match(skill, /execution plan[\s\S]*immutable `case_document_ref`[\s\S]*manifest_digest[\s\S]*bundle_digest/iu);
  assert.match(skill, /v3[\s\S]*legacy[\s\S]*read-only[\s\S]*(?:never|not)[\s\S]*fallback/iu);
  assert.doesNotMatch(skill, /complete A[–-]G analysis before (?:asking|presenting) clarification/iu);
});

test('v4 Skill performs two semantic clarification phases and preserves unanswered parts', async () => {
  const [skill, clarification] = await Promise.all([
    load('SKILL.md'), load('references/clarification-policy.md')
  ]);
  for (const content of [skill, clarification]) {
    assert.match(content, /pre-case[\s\S]*source review[\s\S]*atomic fact[\s\S]*scope manifest[\s\S]*(?:before|prior to)[\s\S]*Behavior Views/iu);
    assert.match(content, /post-case|case_design/iu);
    assert.match(content, /unanswered[\s\S]*(?:remain|stays?)[\s\S]*(?:presented|pending)/iu);
    assert.match(content, /`defer_question_part`[\s\S]*`mark_question_unknown`[\s\S]*`request_delivery`/u);
    assert.match(content, /blank|unparseable|cannot be reliably bound/iu);
  }
  assert.doesNotMatch(clarification, /Every unanswered item[\s\S]{0,80}becomes deferred/iu);
  assert.match(clarification, /no_information_gain[\s\S]*same pending[\s\S]*(?:no|without)[\s\S]*(?:revision|suppress)/iu);
});

test('v4 policies force the matching reference before every write or user action', async () => {
  const skill = await load('SKILL.md');
  const rules = [
    ['evidence-policy.md', 'source_pack|evidence_claims'],
    ['behavior-views.md', 'behavior_views'],
    ['case-writing-policy.md', 'case_drafts'],
    ['clarification-policy.md', 'answer_question_part|defer_question_part|request_delivery'],
    ['execution-closure-policy.md', 'provide_capability_proof|set_execution_disposition|pause_execution|reopen_semantic_question'],
    ['run-management.md', 'recover|resume|cancel_run']
  ];
  for (const [file, action] of rules) {
    assert.match(skill, new RegExp(`Read ${String.fromCodePoint(96)}references/${file}${String.fromCodePoint(96)}[\\s\\S]*(?:before|prior to)[\\s\\S]*(?:${action})`, 'iu'));
  }
});

test('v4 Skill routes every advertised action through the installed private action adapter', async () => {
  const [skill, evidence] = await Promise.all([
    load('SKILL.md'), load('references/evidence-policy.md')
  ]);
  assert.match(skill, /import[\s\S]*`createV4RunDirectory`[\s\S]*`constructV4Action`[\s\S]*`stageV4SourceAcquisitionAction`[\s\S]*test-compiler\.mjs/iu);
  assert.match(skill, /`createV4RunDirectory`[\s\S]*compiler issues the run ID[\s\S]*never mint a run ID/iu);
  assert.match(skill, /never (?:mint|compute|invent)[\s\S]*(?:event ID|event_id)[\s\S]*(?:digest|protocol ID)/iu);
  assert.match(skill, /semantic[\s\S]*`constructV4Action`[\s\S]*execution/iu);
  assert.match(skill, /`need_artifact`[\s\S]*complete batch[\s\S]*`stageV4SourceAcquisitionAction`[\s\S]*(?:call|invoke)[\s\S]*runner again/iu);
  assert.match(skill, /`need_artifact`[\s\S]*reserved[\s\S]*source-acquisition recovery contract/iu);
  assert.match(skill, /`need_revision`[\s\S]*`STAGE_ARTIFACT_REQUIRED`[\s\S]*`staging\/source-pack\.json`[\s\S]*`staging\/case-drafts\.json`/iu);
  assert.match(evidence, /`stageV4SourceAcquisitionAction`[\s\S]*exact material bytes[\s\S]*safe input[\s\S]*Source Pack/iu);
  assert.match(evidence, /signed retrieval URL[\s\S]*(?:never|must not)[\s\S]*(?:Source Pack|staging|persist)/iu);
});

test('v4 policies prohibit fictional modeling, broad locators and noncanonical fallback delivery', async () => {
  const [skill, evidence, behavior, cases] = await Promise.all([
    load('SKILL.md'), load('references/evidence-policy.md'), load('references/behavior-views.md'),
    load('references/case-writing-policy.md')
  ]);
  assert.match(skill, /never[\s\S]*hand[- ]?written|manual[\s\S]*fallback[\s\S]*(?:final|official)/iu);
  assert.match(skill, /fatal[\s\S]*no[\s\S]*(?:Markdown|spreadsheet|test cases)[\s\S]*fallback/iu);
  assert.match(evidence, /capture_digest[\s\S]*semantic_digest/iu);
  assert.match(evidence, /document_level_claim[\s\S]*512[\s\S]*2048/iu);
  assert.match(evidence, /multiple unrelated|多个不相关[\s\S]*whole-document|全文[\s\S]*locator/iu);
  assert.match(evidence, /`unit_id`[\s\S]*`content_digest`[\s\S]*`classification`[\s\S]*(?:do not invent|不得)[\s\S]*`basis`/iu);
  assert.match(behavior, /sparse[\s\S]*`surfaces`[\s\S]*(?:do not|never)[\s\S]*invent/iu);
  assert.match(behavior, /risk_review_ledger[\s\S]*null_or_missing[\s\S]*business_permission_boundary/iu);
  assert.match(behavior, /`not_applicable`[\s\S]*verified-evidence[\s\S]*scope-Decision/iu);
  assert.match(cases, /`observe_after_step_id`[\s\S]*existing[\s\S]*step/iu);
  assert.match(cases, /capture_at_execution[\s\S]*(?:does not|must not)[\s\S]*(?:URL|account|screenshot)/iu);
  assert.doesNotMatch(cases, /`provided` or `verified` for Grounded eligibility/iu);
});

test('v4 user presentations expose business meaning and every stop path exposes a real recovery action', async () => {
  const [skill, clarification, execution, runs] = await Promise.all([
    load('SKILL.md'), load('references/clarification-policy.md'),
    load('references/execution-closure-policy.md'), load('references/run-management.md')
  ]);
  for (const status of ['finished', 'need_user_answers', 'need_artifact', 'need_revision', 'fatal', 'cancelled']) {
    assert.match(skill, new RegExp(`${status}[\\s\\S]*(?:current state|当前状态)[\\s\\S]*(?:produced|已产出)[\\s\\S]*(?:reason|原因)[\\s\\S]*(?:next action|下一步)[\\s\\S]*(?:recovery|恢复)`, 'iu'));
  }
  assert.match(clarification, /question[\s\S]*why_needed[\s\S]*decision_impact[\s\S]*unresolved_outcome/iu);
  assert.match(clarification, /MUST NOT|never[\s\S]*(?:root|fact|claim|obligation)[\s\S]*ID[\s\S]*business/iu);
  assert.match(clarification, /late answer[\s\S]*internal stale transition[\s\S]*current committed state[\s\S]*never report compiler fatal/iu);
  assert.match(execution, /`provide_capability_proof`[\s\S]*`set_execution_disposition`[\s\S]*`pause_execution`[\s\S]*`reopen_semantic_question`/u);
  assert.match(execution, /source acquisition[\s\S]*semantic clarification[\s\S]*execution closure[\s\S]*final confirmation[\s\S]*cancel_run/iu);
  for (const content of [skill, execution, runs]) {
    assert.match(content, /cancelled[\s\S]*createV4RunDirectory/iu);
    assert.match(content, /parent_run_id[\s\S]*resume_cancelled/iu);
  }
  assert.match(runs, /verified parent lineage[\s\S]*fresh run[\s\S]*source request/iu);
});

test('v4 final delivery is canonical, business-readable and never starts E2E', async () => {
  const [skill, cases, execution] = await Promise.all([
    load('SKILL.md'), load('references/case-writing-policy.md'),
    load('references/execution-closure-policy.md')
  ]);
  assert.match(skill, /`output\/current\.json`[\s\S]*only authoritative|唯一权威/iu);
  assert.match(skill, /JSON[\s\S]*HTML[\s\S]*CSV[\s\S]*Markdown[\s\S]*same canonical Case bundle|同一 canonical/iu);
  assert.match(cases, /已审阅 formal test-point 覆盖[\s\S]*semantic gap[\s\S]*Exploratory[\s\S]*NotApplicable/u);
  assert.match(cases, /one scenario per line|一行一场景[\s\S]*module|模块[\s\S]*priority|优先级[\s\S]*title|标题[\s\S]*status|状态/iu);
  assert.match(execution, /Grounded[\s\S]*Execute[\s\S]*runner_projection\.case_ids/iu);
  assert.match(skill, /does not automatically start E2E|绝不自动启动 E2E/iu);
  assert.match(execution, /execution results[\s\S]*downstream[\s\S]*bundle digest[\s\S]*Case ID/iu);
});
