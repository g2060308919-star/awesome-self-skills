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

  const behavior = await text('references/behavior-views.md');
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
    /interaction issue scope[\s\S]*candidate module[\s\S]*every semantic subject scope/u
  );
  assert.match(
    behavior,
    /fact owner[\s\S]*scope must contain the custom responsibility scope/u
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
  assert.match(cases, /one distinct expectation for each linked obligation[\s\S]*covers every `required_oracle_refs` entry/u);
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
  assert.equal(await text('agents/openai.yaml'), `interface:\n  display_name: "高精度测试用例生成"\n  short_description: "从 PRD 生成高准确、高覆盖且可追溯的人工功能测试用例"\n  default_prompt: "使用 $generate-test-cases 根据这份 PRD 生成有依据、可执行的测试用例。"\n`);
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
