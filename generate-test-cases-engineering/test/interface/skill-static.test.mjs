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
  assert.match(skill, /complete A–G analysis before (?:asking|presenting) clarification/u);
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
    assert.match(skill, new RegExp(`Read ${tick}references/${reference}${tick} when`, 'u'));
    assert.ok((await text(`references/${reference}`)).trim().length > 0);
  }
});

test('skill static policies freeze clarification and source-review boundaries', async () => {
  const evidence = await text('references/evidence-policy.md');
  for (const route of [
    '`formula` → `test-data` or `expected-value`',
    '`decision-table-instance` → `expected-value` or `model-element`',
    '`boundary-representative` → `test-data`',
    '`enumeration-complement` → `test-data` or `model-element`',
    '`graph-reachability` → `model-element`'
  ]) assert.match(evidence, new RegExp(route, 'u'));
  assert.match(evidence, /Scope strings are compiler identities, not prose summaries[\s\S]*reuse it verbatim for `run_scope`[\s\S]*Source Policy[\s\S]*Claim[\s\S]*Behavior View/u);
  assert.match(evidence, /Treat a user-supplied current PRD or module description as `effective`[\s\S]*explicitly identifies it as draft or historical/u);
  assert.match(evidence, /never delete the Claim or empty the Fact Ledger merely to advance/u);
  assert.match(evidence, /For `decision-table-instance`, `value` must exactly equal `rule_input\.outcome`/u);
  assert.match(evidence, /Before accepting `evidence_claims`[\s\S]*one replayable E2 `expected-value` child[\s\S]*all atomic Oracle parents/u);
  assert.match(
    evidence,
    /unsupported[\s\S]*outside[\s\S]*two atomic E3 claims[\s\S]*different `claim_id`[\s\S]*same source locator/iu
  );
  const exclusionPolicy = evidence.split('\n').find(
    (/** @type {string} */ line) => line.startsWith('Split exclusion language')
  );
  assert.ok(exclusionPolicy);
  assert.match(
    exclusionPolicy,
    /two atomic E3 claims[^\n]*formal capability fact[^\n]*scope-exclusion proof Claim[^\n]*`kind = description`[^\n]*Fact Ledger[^\n]*`diagnostic`[^\n]*must not[^\n]*formal Fact[^\n]*Behavior View[^\n]*decision rule[^\n]*custom responsibility[^\n]*obligation[^\n]*Only the unsupported capability Claim remains a normative fact/iu
  );
  assert.match(
    evidence,
    /test-process[\s\S]*output-format[\s\S]*not product behavior[\s\S]*diagnostic[\s\S]*never[\s\S]*formal Fact or Behavior View/iu
  );
  assert.match(
    evidence,
    /Product behavior or responsibility remains formal[\s\S]*missing Oracle or Testability[\s\S]*Blocked/iu
  );
  const enumeratedGapPolicy = evidence.split('\n').find(
    (/** @type {string} */ line) => line.startsWith('When a source explicitly enumerates distinct in-scope scenarios')
  );
  // Production defect: fresh input merged named unresolved scenarios. Rule reversal: requiring an extra test-process instruction or permitting a generic root must fail.
  assert.equal(
    enumeratedGapPolicy,
    'When a source explicitly enumerates distinct in-scope scenarios whose product outcome or Oracle is missing, create one separate formal responsibility per named scenario. Record one atomic `kind = requirement` Claim and one `status = ambiguous` Fact Ledger entry for each, then route it to its own Blocked Test Point; you must not collapse named scenarios into a generic missing-result or parse-failure gap. This records that each named behavior requires resolution and does not invent an outcome.'
  );
  assert.match(
    evidence,
    /source-defined forbidden tuple[\s\S]*E2 `expected-value`[\s\S]*`decision-table-instance`[\s\S]*selected-value claims[\s\S]*forbid rule/iu
  );
  const tWiseEvidencePolicy = evidence.split('\n').find(
    (/** @type {string} */ line) => line.startsWith('Apply that rule before t-wise modeling')
  );
  // Production defect: a two-field forbid was cloned across a third domain. Rule reversal: adding an unspecified assignment or expanding a non-exhaustive rule must fail.
  assert.equal(
    tWiseEvidencePolicy,
    'Apply that rule before t-wise modeling. For every source-defined forbidden tuple, create a separate replayable E2 `expected-value` using the closed `decision-table-instance` derivation. Its parents must include the atomic selected-value claims for every assignment in that tuple and the joint forbid rule; its `value` must exactly equal the sourced forbidden outcome in `rule_input.outcome`. An explicit partial forbidden tuple keeps its exact assignment arity: you must not add an unspecified parameter and must not clone it across an unspecified domain. Only an authoritative exclusive rule that exhaustively proves the combination permits exactly one value may expand into complement tuples, and only when an authoritative closed enumeration makes those tuples mechanical. For every tuple produced by that expansion, include the authoritative closed enumeration Claim itself in `parent_claim_ids`; recording only its source locator in `source_locator_ids` is not sufficient ancestry. Keep one E2 outcome per tuple. A broad enumeration claim or separate value claims are not joint forbid proof, and an open domain must remain Blocked rather than being completed from recall.'
  );

  const behavior = await text('references/behavior-views.md');
  // The stage-specific adapter rules must mirror the Evidence policy; deleting either copy reopens the observed forward-test defects.
  assert.equal(
    behavior.split('\n').find((/** @type {string} */ line) => line.startsWith('Keep every explicitly named unresolved in-scope scenario')),
    'Keep every explicitly named unresolved in-scope scenario separate. Each formal ambiguous Fact needs its own modeled or terminal route and its own Blocked Test Point; never merge several named missing outcomes into one generic reason or root.'
  );
  assert.equal(
    behavior.split('\n').find((/** @type {string} */ line) => line.startsWith('Submit one `forbid` constraint for every source-defined forbidden tuple')),
    'Submit one `forbid` constraint for every source-defined forbidden tuple. Its assignments must be that exact tuple, and its `evidence_refs` must cite the tuple\'s replayable E2 outcome prepared during Evidence Claims, not a broad enum or the individual value Claims. Keep an explicit partial forbid partial: do not add a parameter that its source rule leaves unspecified or clone it across that parameter\'s domain. Only an authoritative exclusive rule that exhaustively proves the combination permits exactly one value may expand into complement tuples, and only with an authoritative closed enumeration. `constraints` may be empty only after a read-only source rebuttal finds no explicit invalid-combination rule. If the compiler rejects a tuple proof, do not drop the constraint and allow forbidden vectors; the accepted Evidence Claims are missing a closed E2 tuple outcome, so stop at the repair boundary rather than weakening combination coverage. Do not submit an unconstrained request when the source contains a forbid whose closed proof is unavailable; preserve the affected combination responsibility as Blocked.'
  );
  assert.equal(
    behavior.split('\n').find((/** @type {string} */ line) => line.startsWith('Selection chooses input vectors')),
    'Selection chooses input vectors; every vector still needs a product Oracle that is source-backed and independent of coverage-selection metadata, either directly or through a legal E2 derivation. Coverage strength, the selected vector, and a coverage record cannot supply that Oracle. E1 selected-value evidence makes the eventual Case at most Conditional, even when its Oracle is stronger.'
  );
  for (const viewType of [
    'flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration'
  ]) assert.match(behavior, new RegExp(`${String.fromCodePoint(96)}${viewType}${String.fromCodePoint(96)}`, 'u'));
  assert.match(behavior, /For one declared module, record all seven `single-module` cells/u);
  assert.match(
    behavior,
    /`shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, and `side-effect`/u
  );
  assert.match(
    behavior,
    /Every interaction candidate[\s\S]*nonempty `source_claim_ids`[\s\S]*nonempty `semantic_subject_refs`/u
  );
  assert.match(
    behavior,
    /`fact`, `view-element`, `model-element`, or `integration-surface`[\s\S]*`\(side_effect_kind, target\)`/u
  );
  assert.match(
    behavior,
    /Blocked candidate[\s\S]*typed `issue_intent`[\s\S]*never[\s\S]*root key or root ID/u
  );
  assert.match(
    behavior,
    /provenance[\s\S]*not part of root identity[\s\S]*`module_ids`[\s\S]*`dimension`[\s\S]*`semantic_subject_refs`/u
  );
  assert.match(
    behavior,
    /custom responsibility[\s\S]*`facts` or `view-elements`[\s\S]*single modeled fact route/u
  );
  assert.match(
    behavior,
    /structural and modeling pass[\s\S]*built-in[\s\S]*custom responsibilities[\s\S]*single final reconciliation/u
  );
  assert.match(
    behavior,
    /terminal issue scope[\s\S]*fact scope[\s\S]*evidence reference[\s\S]*cover the issue scope[\s\S]*directionally connected/u
  );
  assert.match(
    behavior,
    /Before setting `support_review` to `supported`[\s\S]*directly proves the exclusion[\s\S]*generic same-scope claim[\s\S]*non-exhaustive inclusion list[\s\S]*route the fact as Blocked/u
  );
  assert.match(
    behavior,
    /interaction issue scope[\s\S]*candidate module[\s\S]*every semantic subject scope/u
  );
  assert.match(
    behavior,
    /fact owner[\s\S]*scope must contain the custom responsibility scope/u
  );
  assert.match(
    behavior,
    /`combination_requests`[\s\S]*closed owner[\s\S]*every owner fact's primary scope must contain the request scope/u
  );
  assert.match(
    behavior,
    /Never submit `maxCandidates`[\s\S]*compiler-private[\s\S]*non-answerable `resource_limit` requirement gap/u
  );
  assert.match(
    behavior,
    /forbid[\s\S]*supported E3\/E2[\s\S]*never becomes an Oracle/u
  );
  assert.match(
    behavior,
    /Every `vector_oracles` mapping[\s\S]*every declared `parameter_id` exactly once[\s\S]*one declared `value_id`/u
  );
  assert.match(
    behavior,
    /Every view element and relation[\s\S]*directly states that exact[\s\S]*state[\s\S]*transition[\s\S]*condition[\s\S]*result[\s\S]*surface[\s\S]*general path claim[\s\S]*omitted state/iu
  );
  assert.match(
    behavior,
    /one `forbid` constraint for every source-defined forbidden tuple[\s\S]*E2 outcome[\s\S]*(?:must not|do not) drop[\s\S]*constraint/iu
  );
  assert.match(behavior, /requirement-gap[\s\S]*`caseable=false`/u);

  const clarification = await text('references/clarification-policy.md');
  assert.match(clarification, /task-scoped E3/u);
  assert.match(clarification, /explicit temporary assumption[\s\S]*E1/u);
  assert.match(clarification, /unknown[\s\S]*skip[\s\S]*defer[\s\S]*Blocked[\s\S]*suppressed/iu);
  assert.match(clarification, /defaults to E1/u);
  assert.match(clarification, /unanswered[\s\S]*deferred/iu);
  assert.match(clarification, /request_delivery/u);
  assert.match(clarification, /complete pending-root set/u);
  assert.match(clarification, /reopen_root_issues/u);
  assert.match(clarification, /new Source Pack revision/u);
  assert.match(
    clarification,
    /answerable, open\/fresh, and unsuppressed[\s\S]*eligible for a question/u
  );
  assert.match(
    clarification,
    /Non-answerable compiler-owned gaps[\s\S]*Blocked[\s\S]*recovery[\s\S]*never become questions/u
  );
  assert.match(
    clarification,
    /copy[\s\S]*root IDs[\s\S]*runner reply[\s\S]*Decision[\s\S]*reopen[\s\S]*Never recompute/iu
  );

  const cases = await text('references/case-writing-policy.md');
  assert.match(cases, /read-only source rebuttal pass/u);
  assert.match(cases, /support_review = supported \| contradicted \| uncertain/u);
  assert.match(cases, /never introduce a new business fact/iu);
  assert.match(
    cases,
    /Submit complete candidate `case_drafts` after formal Test Points exist; this stage must precede any compiler `need_user_answers` reply/u
  );
  assert.match(cases, /Read `derived\/rNNN\/test-obligations\.json` before drafting/u);
  assert.match(cases, /exactly one `obligation-oracle` expectation for each linked obligation[\s\S]*cover every optional `required_oracle_refs` prebinding/u);
  assert.match(
    cases,
    /exactly one `obligation-oracle` expectation[\s\S]*single `closes_obligation_id`[\s\S]*nonempty, unique `oracle_evidence_refs`/u
  );
  const vectorOraclePolicy = cases.split('\n').find(
    (/** @type {string} */ line) => line.startsWith('For a compiler-derived combination Test Point')
  );
  // Production defect: coverage metadata was emitted as an obligation Oracle. Rule reversal: treating selection metadata as product truth or drafting without E3/E2 support must fail.
  assert.equal(
    vectorOraclePolicy,
    'For a compiler-derived combination Test Point, require a product Oracle that is source-backed and independent of coverage-selection metadata, either directly or through a legal E2 derivation. Coverage strength, the selected vector, or a coverage record is test-process metadata and must not become a business Oracle. If no accepted source or legal E2 derivation supplies the product outcome for that vector, block the Test Point rather than invent an expectation.'
  );
  assert.match(
    cases,
    /`auxiliary` expectation[\s\S]*never counts toward formal coverage/u
  );
  assert.match(
    cases,
    /Agent `execution_signature\.oracle_refs`[\s\S]*exact distinct expectation IDs[\s\S]*contains no Test Point or obligation IDs/u
  );
  const signaturePreflightPolicy = cases.split('\n').find(
    (/** @type {string} */ line) => line.startsWith('Immediately before writing `staging/case-drafts.json`')
  );
  assert.equal(
    signaturePreflightPolicy,
    'Immediately before writing `staging/case-drafts.json`, mechanically compare each Case: `sort(unique(execution_signature.oracle_refs))` must equal `sort(unique(expectation_id values from all Case expectations))`. Use the Agent-authored expectation IDs such as `expect-payment-success`; never copy a compiler-owned `oracle_*` semantic ID from derived or final output. A mismatch is a repairable `case_drafts` error, never a business blocker or clarification root.'
  );
  assert.match(cases, /`evidence_refs` must equal the exact sorted union of direct evidence roots/u);
  assert.match(
    cases,
    /grouped blocker[\s\S]*`affected_obligation_ids`[\s\S]*typed `subject`[\s\S]*typed `issue_intent`/u
  );
  assert.match(cases, /Never resubmit a compiler-owned requirement-gap obligation/u);
  assert.match(
    cases,
    /Never[\s\S]*root key or root ID[\s\S]*Case[\s\S]*NotApplicable[\s\S]*expectation[\s\S]*close a requirement gap/u
  );
  assert.doesNotMatch(cases, /clarification has converged or delivery was requested/u);
});

test('skill static UI metadata remains the generated closed interface', async () => {
  assert.equal(await text('agents/openai.yaml'), `interface:\n  display_name: "高精度测试用例生成"\n  short_description: "生成并确认可追溯的人工功能测试执行清单，不自动执行测试"\n  default_prompt: "使用 $generate-test-cases 根据 PRD/module description/module-description、需求文档、模块说明、功能变更、规则变更、验收标准、交互说明、接口契约或粘贴需求，生成高准确、可追溯的人工功能测试用例、测试点和经用户确认的执行清单；只生成并确认计划，不会自动执行 E2E 测试，也不用于 Playwright、API 自动化、单元测试代码生成或仅代码审查。"\n`);
});

test('skill adapter validates Reply before writes and freezes durable run recovery', async () => {
  const skill = await text('SKILL.md');
  assert.match(
    skill,
    /validate[\s\S]*single JSON reply[\s\S]*`scripts\/schemas\/reply\.schema\.json`[\s\S]*before[\s\S]*(?:inspect|handle)[\s\S]*status[\s\S]*before[\s\S]*writ/iu
  );
  assert.match(
    skill,
    /stage[\s\S]*schema_ref[\s\S]*one-to-one[\s\S]*source_pack[\s\S]*evidence_claims[\s\S]*behavior_views[\s\S]*case_drafts/iu
  );
  assert.match(skill, /unknown[\s\S]*mismatch[\s\S]*PIPELINE_PROTOCOL_ERROR[\s\S]*no artifact/iu);
  assert.doesNotMatch(skill, /If another stage is requested, follow its returned `schema_ref`/u);

  assert.match(
    skill,
    /run identity[\s\S]*canonical absolute[\s\S]*persistent[\s\S]*private[\s\S]*current task/iu
  );
  assert.match(skill, /never[\s\S]*Skill installation directory[\s\S]*OS temporary directory/iu);
  assert.match(skill, /context recovery[\s\S]*same[\s\S]*run directory[\s\S]*invoke[\s\S]*runner first/iu);
  assert.match(skill, /`\.\.`[\s\S]*same canonical run/iu);
  assert.match(
    skill,
    /clarification[\s\S]*request_delivery[\s\S]*reopen[\s\S]*unresolved business facts[\s\S]*append[\s\S]*same run/iu
  );
  assert.match(
    skill,
    /NEW_RUN_REQUIRED[\s\S]*preserve[\s\S]*old run[\s\S]*sibling[\s\S]*actual user[\s\S]*(?:source|scope) change/iu
  );
});

test('progressive references close reply routing and durable append boundaries', async () => {
  const behavior = await text('references/behavior-views.md');
  assert.match(
    behavior,
    /schema-validated[\s\S]*`behavior_views`[\s\S]*`behavior-views\.schema\.json`[\s\S]*before writing/iu
  );
  const cases = await text('references/case-writing-policy.md');
  assert.match(
    cases,
    /schema-validated[\s\S]*`case_drafts`[\s\S]*`case-drafts\.schema\.json`[\s\S]*before writing/iu
  );
  const clarification = await text('references/clarification-policy.md');
  assert.match(
    clarification,
    /same canonical absolute run directory[\s\S]*re-invoke the runner first[\s\S]*never guess the stage/iu
  );
  assert.match(
    clarification,
    /original PRD[\s\S]*supplementary source[\s\S]*task scope[\s\S]*NEW_RUN_REQUIRED[\s\S]*preserve the old run/iu
  );
  assert.match(
    clarification,
    /Read `references\/clarification-policy\.md` before writing[\s\S]*higher Source Pack revision/iu
  );
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
