import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillRoot = path.join(repositoryRoot, 'skill/generate-test-cases');

/** @param {string} relativePath */
async function text(relativePath) {
  return readFile(path.join(skillRoot, relativePath), 'utf8');
}

/** @param {string} [directory] @param {string} [prefix] */
async function installedFiles(directory = skillRoot, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (/** @type {any} */ entry) => {
    const relativePath = path.join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `installed artifact must not contain symlinks: ${relativePath}`);
    return entry.isDirectory()
      ? installedFiles(path.join(directory, entry.name), relativePath)
      : [relativePath];
  }));
  return files.flat().sort();
}

/** @param {string} source */
async function prohibitedRunnerUses(source) {
  /** @type {string[]} */
  const violations = [];
  const networkModules = new Set([
    'http', 'http2', 'https', 'net', 'tls', 'dns', 'dgram', 'undici', 'ws', 'websocket'
  ]);
  const providerModules = new Set(['openai', 'anthropic', '@anthropic-ai/sdk']);
  const parsed = await build({
    stdin: { contents: source, resolveDir: repositoryRoot, sourcefile: 'test-compiler.mjs' },
    bundle: true, write: false, metafile: true, platform: 'node', format: 'esm',
    external: ['*'], logLevel: 'silent'
  });
  const imports = Object.values(parsed.metafile.outputs).flatMap((output) => output.imports);
  for (const item of imports) {
    const specifier = item.path;
    const normalized = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
    const root = normalized.split('/')[0];
    if (networkModules.has(root)) violations.push(`network-module:${specifier}`);
    if ([...providerModules].some((provider) =>
      normalized === provider || normalized.startsWith(`${provider}/`))) {
      violations.push(`model-provider:${specifier}`);
    }
  }
  const normalizedOutput = parsed.outputFiles.map((file) => file.text).join('\n');
  if (/\bimport\s*\(\s*(?!["'])/u.test(normalizedOutput)) violations.push('computed-dynamic-import');
  if (/(?:\bfetch|\bglobalThis\s*(?:\.\s*fetch|\[\s*["']fetch["']\s*\]))\s*\(/u
    .test(normalizedOutput)) violations.push('global-fetch');
  if (/(?:\bWebSocket|\bglobalThis\s*(?:\.\s*WebSocket|\[\s*["']WebSocket["']\s*\]))\s*\(/u
    .test(normalizedOutput)) violations.push('global-websocket');
  return [...new Set(violations)].sort();
}

test('skill static contract keeps the adapter private concise and complete', async () => {
  const skill = await text('SKILL.md');
  const lines = skill.split(/\r?\n/u);
  assert.ok(lines.length < 500, `SKILL.md has ${lines.length} lines`);

  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/u);
  assert.ok(frontmatter, 'SKILL.md must begin with YAML frontmatter');
  const keys = [...frontmatter[1].matchAll(/^([a-z_]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(keys, ['name', 'description']);
  assert.match(frontmatter[1], /PRD/u);
  assert.match(frontmatter[1], /module description/u);
  assert.match(frontmatter[1], /manual functional/u);
  assert.match(frontmatter[1], /accuracy/u);
  assert.match(frontmatter[1], /coverage/u);
  assert.match(frontmatter[1], /traceab/u);
  assert.match(frontmatter[1], /Blocked/u);
  assert.match(frontmatter[1], /clarification/u);
  for (const trigger of [
    'PRD', 'module description', 'module-description', '需求文档', '模块说明',
    '功能变更', '规则变更', '验收标准', '交互说明', '接口契约', '粘贴需求',
    '测试用例', '测试点', '测试场景'
  ]) assert.ok(frontmatter[1].includes(trigger), `frontmatter trigger missing: ${trigger}`);
  for (const excluded of [
    'Playwright', '浏览器 E2E', 'API', '接口自动化', '单元测试代码生成',
    'code-review-only', '仅代码审查'
  ]) assert.ok(frontmatter[1].includes(excluded), `frontmatter exclusion missing: ${excluded}`);

  assert.ok(skill.includes(
    'node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>'
  ));
  for (const status of [
    'need_artifact', 'need_user_answers', 'need_revision', 'finished', 'fatal'
  ]) assert.match(skill, new RegExp(`Handle ${String.fromCodePoint(96)}${status}${String.fromCodePoint(96)}`, 'u'));
  assert.match(skill, /INPUT_UNAVAILABLE/u);
  assert.match(skill, /pre-case clarification[\s\S]*source review[\s\S]*atomic fact[\s\S]*scope manifest[\s\S]*before Behavior Views/iu);
  assert.match(skill, /three repair attempts/u);
  assert.match(skill, /fourth identical no-progress result/u);
  assert.match(skill, /PIPELINE_NO_PROGRESS/u);
  assert.doesNotMatch(skill, /record_only/iu);
  assert.doesNotMatch(skill, /\bnpm\b/iu);
  assert.doesNotMatch(skill, /\bCLI\b/u);
  assert.doesNotMatch(skill, /batch interface/iu);

  const references = [
    'evidence-policy.md', 'behavior-views.md',
    'clarification-policy.md', 'case-writing-policy.md'
  ];
  for (const reference of references) {
    const tick = String.fromCodePoint(96);
    assert.match(skill, new RegExp(`Read ${tick}references/${reference}${tick} before`, 'u'));
    assert.ok((await text(`references/${reference}`)).trim().length > 0);
  }
});

test('skill static policies freeze v4 evidence, modeling, clarification, and Case boundaries', async () => {
  const evidence = await text('references/evidence-policy.md');
  for (const route of [
    '`formula` -> `test-data` or `expected-value`',
    '`decision-table-instance` -> `expected-value` or `model-element`',
    '`boundary-representative` -> `test-data`',
    '`enumeration-complement` -> `test-data` or `model-element`',
    '`graph-reachability` -> `model-element`'
  ]) assert.match(evidence, new RegExp(route, 'u'));
  assert.match(evidence, /capture_digest[\s\S]*semantic_digest/iu);
  assert.match(evidence, /Treat a user-supplied current PRD or module description as effective[\s\S]*draft or historical/u);
  assert.match(evidence, /`decision-table-instance`[\s\S]*`value` equals `rule_input\.outcome` exactly/u);
  assert.match(evidence, /Multiple unrelated atomic Claims must never reuse a whole-document locator/u);
  assert.match(evidence, /document_level_claim=true[\s\S]*512[\s\S]*2048/iu);
  assert.match(evidence, /unsupported and out of scope[\s\S]*two Claims[\s\S]*NotApplicable requires/iu);
  assert.match(evidence, /Test-process and output-format instructions are diagnostic context, not product behavior/iu);
  assert.match(evidence, /Product behavior remains formal even when execution resources are unavailable/iu);
  assert.match(evidence, /each explicitly named unresolved in-scope scenario separate/iu);
  assert.match(evidence, /scope_manifest[\s\S]*reviewed candidates[\s\S]*cannot create or delete scope/iu);
  assert.match(evidence, /risk_review_ledger[\s\S]*null_or_missing[\s\S]*business_permission_boundary/iu);

  const behavior = await text('references/behavior-views.md');
  for (const viewType of [
    'flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration'
  ]) assert.match(behavior, new RegExp(`${String.fromCodePoint(96)}${viewType}${String.fromCodePoint(96)}`, 'u'));
  assert.match(
    behavior,
    /`shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, and `side-effect`/u
  );
  assert.match(
    behavior,
    /candidate must carry nonempty `source_claim_ids`[\s\S]*closed `semantic_subject_refs`/u
  );
  assert.match(
    behavior,
    /actual facts, view elements, model elements, or integration surfaces[\s\S]*`\(side_effect_kind, target\)`/u
  );
  assert.match(
    behavior,
    /blocker submits a typed `issue_intent`, never a root key or root ID/u
  );
  assert.match(
    behavior,
    /Provenance does not define root identity[\s\S]*normalized module IDs, dimension, and semantic subjects/u
  );
  assert.match(
    behavior,
    /custom responsibility cannot discharge a missing dedicated view/iu
  );
  assert.match(
    behavior,
    /Combination coverage never supplies a product Oracle[\s\S]*forbidden tuple[\s\S]*blocked/iu
  );
  assert.match(
    behavior,
    /Every evidence binding[\s\S]*exact element field[\s\S]*nonempty accepted Claim IDs/iu
  );
  assert.match(
    behavior,
    /Every applicable formal Fact[\s\S]*exactly one final route[\s\S]*semantic gap/iu
  );

  const clarification = await text('references/clarification-policy.md');
  assert.match(clarification, /task-scoped E3/u);
  assert.match(clarification, /explicit temporary assumption at E1/u);
  assert.match(clarification, /answer without a declared nature defaults to E1/u);
  assert.match(clarification, /Every unanswered item remains presented and pending/iu);
  assert.match(clarification, /defer_question_part[\s\S]*mark_question_unknown[\s\S]*request_delivery/u);
  assert.match(clarification, /request_delivery[\s\S]*complete pending-root set[\s\S]*never pre-closes a future root/iu);
  assert.match(clarification, /fresh answerable roots[\s\S]*one risk-ordered presentation/iu);
  assert.match(clarification, /Non-answerable source, evidence, or process gaps[\s\S]*never become business questions/iu);
  assert.match(clarification, /Copy the compiler-provided[\s\S]*bindings exactly[\s\S]*Never mint or infer protocol IDs/iu);

  const cases = await text('references/case-writing-policy.md');
  assert.match(cases, /read-only source rebuttal pass/u);
  assert.match(cases, /review must never introduce a new business fact/iu);
  assert.match(cases, /one `primary_test_point_id`/u);
  assert.match(cases, /Every Oracle[\s\S]*`observe_after_step_id`[\s\S]*existing step/iu);
  assert.match(cases, /dangling or cross-Case ref[\s\S]*cannot enter a formal result/iu);
  assert.match(cases, /coverage selection cannot supply expected product truth/iu);
  assert.match(cases, /`comparison_contract`[\s\S]*`capture_at_execution` deliberately does not contain an environment URL/iu);
  assert.match(cases, /`value_origin` branch[\s\S]*`requirement`[\s\S]*`example`[\s\S]*`derived`[\s\S]*`temporary_assumption`/iu);
  assert.match(cases, /Never mix fields from different branches/iu);
  assert.match(cases, /E1 or temporary-assumption input caps the Case at Conditional/iu);
  assert.match(cases, /Missing formal source behavior remains a semantic gap, not Exploratory/iu);
  assert.doesNotMatch(cases, /clarification has converged or delivery was requested/u);
});

test('skill static UI metadata remains the generated closed interface', async () => {
  assert.equal(await text('agents/openai.yaml'), `interface:\n  display_name: "高精度测试用例生成"\n  short_description: "生成可追溯的人工功能测试用例；按明确请求另建执行清单"\n  default_prompt: "使用 $generate-test-cases 根据 PRD/module description/module-description、需求文档、模块说明、功能变更、规则变更、验收标准、交互说明、接口契约或粘贴需求，生成高准确、可追溯的人工功能测试用例和测试点。普通请求只交付 Case Document；仅在我明确要求执行清单时，才引用该文档另建并确认 Execution Plan。不会自动执行 E2E 测试，也不用于 Playwright、API 自动化、单元测试代码生成或仅代码审查。"\n`);
});

test('skill adapter validates Reply before writes and freezes durable run recovery', async () => {
  const skill = await text('SKILL.md');
  assert.match(
    skill,
    /stdout contains one JSON reply[\s\S]*Validate it against `scripts\/schemas\/reply\.schema\.json` before inspecting status or writing/iu
  );
  assert.match(
    skill,
    /requested `scripts\/schemas\/<schema_ref>`[\s\S]*source_pack[\s\S]*evidence_claims[\s\S]*behavior_views[\s\S]*case_drafts/iu
  );
  assert.match(skill, /Unknown status\/stage[\s\S]*stage\/schema mismatch[\s\S]*PIPELINE_PROTOCOL_ERROR[\s\S]*write no artifact/iu);
  assert.doesNotMatch(skill, /If another stage is requested, follow its returned `schema_ref`/u);

  assert.match(
    skill,
    /persistent private run directory owned by the current task[\s\S]*canonical absolute path is durable run identity/iu
  );
  assert.match(skill, /outside the Skill installation[\s\S]*outside OS temporary storage/iu);
  assert.match(skill, /context recovery[\s\S]*same run directory[\s\S]*invoke the runner first/iu);
  assert.match(skill, /`\.\.`[\s\S]*same canonical run/iu);
  assert.match(
    skill,
    /clarification[\s\S]*request_delivery[\s\S]*reopen_semantic_question[\s\S]*Copy all presentation[\s\S]*bindings exactly/iu
  );
  assert.match(
    skill,
    /New authoritative source bytes or a material scope change requires `NEW_RUN_REQUIRED`; preserve the old run/iu
  );
});

test('progressive references close reply routing and durable append boundaries', async () => {
  const behavior = await text('references/behavior-views.md');
  assert.match(
    behavior,
    /before writing `behavior_views`[\s\S]*runner requested `behavior_views` with `behavior-views\.schema\.json`/iu
  );
  const cases = await text('references/case-writing-policy.md');
  assert.match(
    cases,
    /before writing `case_drafts`[\s\S]*runner requested `case_drafts` with `case-drafts\.schema\.json`/iu
  );
  const [clarification, runs] = await Promise.all([
    text('references/clarification-policy.md'), text('references/run-management.md')
  ]);
  assert.match(
    runs,
    /recovery or resume[\s\S]*runner on the same absolute directory first[\s\S]*Do not infer the next stage/iu
  );
  assert.match(
    runs,
    /original source-byte change[\s\S]*material scope change[\s\S]*NEW_RUN_REQUIRED[\s\S]*preserving the old run[\s\S]*linked sibling/iu
  );
  assert.match(
    clarification,
    /Read this policy before presenting[\s\S]*answer_question_part[\s\S]*request_delivery[\s\S]*rejected group creates no accepted revision or checkpoint/iu
  );
});

test('skill presents business-readable clarification and manual delivery without leaking audit identifiers', async () => {
  const skill = await text('SKILL.md');
  const clarification = await text('references/clarification-policy.md');
  const cases = await text('references/case-writing-policy.md');
  const evidence = await text('references/evidence-policy.md');
  const execution = await text('references/execution-closure-policy.md');

  assert.match(skill, /Freeze product, module, role, client, version, region, environment[\s\S]*material scope/iu);
  assert.match(skill, /Do not broaden or narrow scope because later analysis discovers more material/iu);
  assert.match(skill, /已审阅 formal test-point 覆盖[\s\S]*Never claim unbounded “100% requirement coverage”/iu);
  assert.match(skill, /business Markdown[\s\S]*Internal IDs appear only[\s\S]*audit appendix/iu);

  assert.match(clarification, /Never show root, Fact, Claim, obligation, question-part, digest, or other internal ID/iu);
  assert.match(clarification, /risk labels[\s\S]*严重\/高\/中\/低/iu);
  assert.match(clarification, /one concrete `question` about one independently answerable business dimension/iu);
  assert.match(clarification, /why_needed[\s\S]*decision_impact[\s\S]*unresolved_outcome/iu);
  assert.match(clarification, /semantic-rule gaps[\s\S]*source\/evidence acquisition gaps[\s\S]*scope exclusions[\s\S]*execution preparation/iu);

  assert.match(cases, /one independently diagnosable primary business outcome/iu);
  assert.match(cases, /Same as baseline[\s\S]*not an executable Oracle/iu);
  assert.match(cases, /`example`[\s\S]*replaceable=true[\s\S]*illustrative[\s\S]*never a fixed expected value/iu);
  assert.match(cases, /Never[\s\S]*treat a derived result as an authorized rule/iu);
  assert.match(evidence, /capture_digest[\s\S]*semantic_digest[\s\S]*v4SourceLocator/iu);
  assert.match(evidence, /canonical text block, table cell, and image region[\s\S]*normative, non-normative, or uncertain[\s\S]*source_reviews/iu);
  assert.match(cases, /`value_origin` branch[\s\S]*example[\s\S]*derived[\s\S]*temporary_assumption/iu);
  assert.match(execution, /execution-worksheet\.csv[\s\S]*blank human worksheet[\s\S]*execution_status=not_run/iu);
  assert.match(execution, /Execution results[\s\S]*defects belong downstream[\s\S]*bundle digest[\s\S]*stable Case ID/iu);
});

test('installed artifact excludes development surfaces model calls and network dependencies', async () => {
  const files = await installedFiles();
  for (const file of files) {
    const segments = file.split(path.sep);
    assert.equal(segments.includes('package.json'), false, `package manifest leaked into installed artifact: ${file}`);
    assert.equal(segments.some((/** @type {string} */ segment) => ['src', 'test', 'tests', 'benchmark', 'labels', 'bin', 'node_modules'].includes(segment)), false, `development or public surface leaked into installed artifact: ${file}`);
  }

  const runner = await text('scripts/test-compiler.mjs');
  assert.deepEqual(await prohibitedRunnerUses(runner), []);
  assert.deepEqual(await prohibitedRunnerUses('import "node:http";'), ['network-module:node:http']);
  assert.deepEqual(await prohibitedRunnerUses('import "node:http2";'), ['network-module:node:http2']);
  assert.deepEqual(await prohibitedRunnerUses('import "node:dgram";'), ['network-module:node:dgram']);
  assert.deepEqual(await prohibitedRunnerUses('import("undici");'), ['network-module:undici']);
  assert.deepEqual(await prohibitedRunnerUses('import("openai/resources");'), ['model-provider:openai/resources']);
  assert.deepEqual(await prohibitedRunnerUses('import("@anthropic-ai/sdk/resources");'), ['model-provider:@anthropic-ai/sdk/resources']);
  assert.deepEqual(await prohibitedRunnerUses('const moduleName = "node:http"; import(moduleName);'), ['computed-dynamic-import']);
  assert.deepEqual(await prohibitedRunnerUses('globalThis["fetch"]("https://example.test");'), ['global-fetch']);
  assert.deepEqual(await prohibitedRunnerUses('new WebSocket("wss://example.test");'), ['global-websocket']);
  assert.deepEqual(await prohibitedRunnerUses('// OpenAI is mentioned only in documentation.\nconst local = 1;'), []);
});
