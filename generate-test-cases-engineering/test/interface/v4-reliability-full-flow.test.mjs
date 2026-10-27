import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import normalBaseline from '../fixtures/v4/reliability-normal-business-baseline.json' with { type: 'json' };
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { bindGeneralQualityFixture, v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { stageRaw } from '../helpers/v4-reliability-fixture.mjs';
import { collectionOrderReliabilityFixture, twoModuleReliabilityFixture } from '../helpers/v4-reliability-two-module-fixture.mjs';

// The same assertions run against the distributed CLI when this absolute path
// is set. Only public Adapter helpers are imported; every advance is a fresh
// process invoking the real one-argument CLI, never advanceStrict in-process.
const runner = process.env.GTC_RELIABILITY_RUNNER
  ?? fileURLToPath(new URL('../../src/entry.mjs', import.meta.url));
const adapter = /** @type {any} */ (await import(pathToFileURL(runner).href));
const execute = promisify(execFile);
const contract = latestV4Contract();

/** @param {string|Uint8Array} bytes */
function byteDigest(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }

/** @param {string} directory */
async function cli(directory) {
  const { stdout, stderr } = await execute(process.execPath, [runner, directory], {
    maxBuffer: 8 * 1024 * 1024, timeout: 30_000
  });
  assert.equal(stderr, '', 'formal CLI must not emit process errors');
  const reply = JSON.parse(stdout);
  assert.deepEqual(validateAgainstSchema(reply, replySchema), [], stdout);
  return reply;
}

/** @param {string} directory @param {string} relative */
async function json(directory, relative) {
  return JSON.parse(await readFile(path.join(directory, relative), 'utf8'));
}

/** @param {string} directory */
async function noDelivery(directory) {
  await assert.rejects(readFile(path.join(directory, 'output/current.json')), { code: 'ENOENT' });
}

/** @param {any} fixture */
function requireReview(fixture) {
  const completed = fixture.artifacts.case_drafts.independent_review;
  fixture.artifacts.case_drafts.independent_review = {
    protocol_version: completed.protocol_version, status: 'pending', review_mode: completed.review_mode,
    reviewer_identity: completed.reviewer_identity,
    source_first_targets: completed.source_first_targets.map((/** @type {any} */ target) => {
      const { target_id: _id, ...body } = target;
      return body;
    })
  };
}

/** @param {string} directory @param {any} initial @param {any} pack */
async function collect(directory, initial, pack) {
  const source = pack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  await adapter.stageV4PrdCollectionObservation(directory, initial, {
    version: '1.0.0', scope: {
      mode: 'provided_materials', root_ref: 'provided:synthetic-reliability-full-flow-fixture',
      source_version: source.version,
      collection_window: { started_at: '2026-10-22T00:00:00.000Z', ended_at: '2026-10-22T00:00:01.000Z' }
    },
    channels: [
      { channel: 'body', enumeration_status: 'exhausted', page_count: 1, terminal_page_observed: true, diagnostic_code: null },
      ...['table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: 'not_applicable', page_count: 0,
        terminal_page_observed: false, diagnostic_code: null
      }))
    ],
    items: [{
      item_id: 'synthetic-body', parent_item_id: null, channel: 'body', source_id: source.source_id,
      asset_id: null, unit_ids: source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id),
      acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null
    }]
  }, [{ item_id: 'synthetic-body', raw_response_bytes: bytes, capture_bytes: bytes }]);
}

/** @param {any} t @param {boolean} [withGaps] */
async function start(t, withGaps = false) {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-reliability-cli-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await adapter.createV4RunDirectory(catalog, 'case_document');
  const directory = run.run_directory;
  const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(run.run_id), contract.schema_version);
  requireReview(fixture);
  if (withGaps) {
    // This distinct sorting proposition is first presented in case_design.
    // It cannot be confused with, or resolved by, either earlier answer.
    fixture.artifacts.evidence_claims.semantic_gaps[2].discovery_phase = 'post_case';
  }
  const initial = await cli(directory);
  assert.equal(initial.stage, 'source_pack', JSON.stringify(initial));
  await collect(directory, initial, fixture.artifacts.source_pack);
  await stageRaw(directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((await cli(directory)).stage, 'evidence_claims');
  const reading = await json(directory, 'derived/source-acquisition.json');
  assert.equal(reading.summary.status, 'complete_within_scope');
  const accepted = await json(directory, 'accepted/r000/source-pack.json');
  assert.equal(reading.accepted_source_pack_digest, `sha256:${digest(accepted)}`);
  assert.equal(accepted.source_reviews[0].units.length, fixture.artifacts.source_pack.sources[0].semantic_projection.structure.length);
  await stageRaw(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  return { catalog, run, directory, fixture, reply: await cli(directory) };
}

test('[reliability T02/T22] formal CLI preserves four distinct gaps across two source-reviewed modules', async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-reliability-two-module-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await adapter.createV4RunDirectory(catalog, 'case_document');
  const fixture = twoModuleReliabilityFixture(run.run_id, adapter);
  await collect(run.run_directory, await cli(run.run_directory), fixture.source_pack);
  await stageRaw(run.run_directory, 'source_pack', fixture.source_pack);
  assert.equal((await cli(run.run_directory)).stage, 'evidence_claims');
  await stageRaw(run.run_directory, 'evidence_claims', fixture.evidence_claims);
  const pending = await cli(run.run_directory);
  assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
  const checkpoint = await json(run.run_directory, 'checkpoint.json');
  assert.equal(checkpoint.semantic_gap_ledger.length, 4);
  assert.equal(pending.semantic_presentation.question_parts.length, 4);
  assert.equal(new Set(checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => root.root_issue_id)).size, 4);
  for (const [scope, facts, claims] of /** @type {Array<[string,string[],string[]]>} */ ([
    ['benefits', ['f200', 'f205'], ['c200', 'c205']],
    ['theme', ['f224', 'f229'], ['c224', 'c229']]
  ])) {
    const roots = checkpoint.semantic_gap_ledger.filter((/** @type {any} */ root) => root.scope_ref === scope);
    assert.equal(roots.length, 2);
    for (const root of roots) {
      assert.deepEqual(root.subject_fact_ids, facts.map(id => id + (root.missing_aspect === 'failure_retry' ? '_retry' : '')));
      assert.deepEqual(root.source_claim_ids, claims.map(id => id + (root.missing_aspect === 'failure_retry' ? '_retry' : '')));
      const part = pending.semantic_presentation.question_parts.find((/** @type {any} */ part) => part.root_issue_id === root.root_issue_id);
      assert.equal(part.affected_facts.length, 2);
      assert.equal(new Set(part.affected_facts).size, 2);
      assert.ok(part.affected_facts.some((/** @type {string} */ label) => label.includes('保存草稿')));
      assert.ok(part.affected_facts.some((/** @type {string} */ label) => label.includes('保存并生效')));
    }
  }
  const accepted = await json(run.run_directory, 'accepted/r000/evidence-claims.json');
  assert.deepEqual(accepted.fact_ledger.map((/** @type {any} */ fact) => fact.fact_id).sort(), ['f200', 'f205', 'f224', 'f229'].flatMap(id => [id, id + '_known', id + '_retry']).sort());
  assert.equal(accepted.scope_manifest.modules.length, 2);
  await noDelivery(run.run_directory);
  assert.deepEqual(await cli(run.run_directory), pending);
});

/** @param {number} seed */
function seededShuffle(seed) {
  let state = seed >>> 0;
  /** @template T @param {T[]} values */
  return values => {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const other = state % (index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return shuffled;
  };
}

test('[reliability T06/T22] seeded legal fact and nested-set permutations persist one canonical Evidence projection through the formal CLI', async (/** @type {any} */ t) => {
  const seeds = [3, 4, 10, 20261022];
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-reliability-cli-permutation-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  t.diagnostic(`T06 seeds=${seeds.join(',')}; samples=${seeds.length}; facts=f3,f10,f100,f229,f_scope`);
  const expectedIds = ['f10', 'f100', 'f229', 'f3', 'f_scope', ...['f200', 'f205', 'f224', 'f229'].flatMap(id => [id + '_known', id + '_retry'])].sort();
  /** @type {any[]} */ const results = [];
  const inputOrders = new Set();
  const nestedClaimOrders = new Set();
  const nestedModuleOrders = new Set();
  const scopeOrders = new Set();
  for (const seed of seeds) {
    const run = await adapter.createV4RunDirectory(catalog, 'case_document');
    const fixture = collectionOrderReliabilityFixture(run.run_id, adapter);
    const evidence = fixture.evidence_claims;
    const shuffle = seededShuffle(seed);
    evidence.fact_ledger = shuffle(evidence.fact_ledger).map((/** @type {any} */ fact) => ({
      ...fact, claim_ids: shuffle(fact.claim_ids), module_refs: shuffle(fact.module_refs)
    }));
    evidence.scope_manifest.modules = shuffle(evidence.scope_manifest.modules);
    const inputOrder = evidence.fact_ledger.map((/** @type {any} */ fact) => fact.fact_id);
    inputOrders.add(JSON.stringify(inputOrder));
    nestedClaimOrders.add(JSON.stringify(evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === 'f3').claim_ids));
    nestedModuleOrders.add(JSON.stringify(evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === 'f_scope').module_refs));
    scopeOrders.add(JSON.stringify(evidence.scope_manifest.modules.map((/** @type {any} */ module) => module.module_id)));
    const reproduce = `seed=${seed}; facts=${JSON.stringify(evidence.fact_ledger.map((/** @type {any} */ fact) => ({
      fact_id: fact.fact_id, claim_ids: fact.claim_ids, module_refs: fact.module_refs
    })))}; scope_modules=${JSON.stringify(evidence.scope_manifest.modules.map((/** @type {any} */ module) => module.module_id))}`;
    await collect(run.run_directory, await cli(run.run_directory), fixture.source_pack);
    await stageRaw(run.run_directory, 'source_pack', fixture.source_pack);
    assert.equal((await cli(run.run_directory)).stage, 'evidence_claims', reproduce);
    await stageRaw(run.run_directory, 'evidence_claims', evidence);
    const pending = await cli(run.run_directory);
    assert.equal(pending.status, 'need_user_answers', `${reproduce}\n${JSON.stringify(pending)}`);
    const acceptedBytes = await readFile(path.join(run.run_directory, 'accepted/r000/evidence-claims.json'), 'utf8');
    const accepted = JSON.parse(acceptedBytes);
    const factLedger = await json(run.run_directory, 'derived/r000/fact-ledger.json');
    const checkpoint = await json(run.run_directory, 'checkpoint.json');
    assert.deepEqual(accepted.fact_ledger.map((/** @type {any} */ fact) => fact.fact_id).sort(), expectedIds, reproduce);
    assert.deepEqual(factLedger.facts, accepted.fact_ledger, reproduce);
    assert.equal(acceptedBytes, `${canonicalStringify(accepted)}\n`, reproduce);
    // Hash the already-persisted exact subobject representation; do not sort or
    // otherwise rewrite it before checking the checkpoint relationship.
    assert.equal(checkpoint.fact_ledger_digest, byteDigest(JSON.stringify(accepted.fact_ledger)), reproduce);
    assert.equal(checkpoint.scope_manifest_digest, byteDigest(JSON.stringify(accepted.scope_manifest)), reproduce);
    assert.equal(checkpoint.semantic_gap_ledger.length, 4, reproduce);
    assert.deepEqual(await cli(run.run_directory), pending, reproduce);
    assert.equal(await readFile(path.join(run.run_directory, 'accepted/r000/evidence-claims.json'), 'utf8'), acceptedBytes, reproduce);
    results.push({ acceptedBytes, factDigest: checkpoint.fact_ledger_digest, scopeDigest: checkpoint.scope_manifest_digest });
  }
  assert.ok(inputOrders.size >= 3, 'fixed seeds must actually exercise different Fact orders');
  assert.equal(nestedClaimOrders.size, 2, 'both orders of a source-backed two-Claim fact are exercised');
  assert.equal(nestedModuleOrders.size, 2, 'both orders of the source-backed scope Fact module_refs are exercised');
  assert.equal(scopeOrders.size, 2, 'both legal scope module orders are exercised');
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

/** @param {any} reply @param {RegExp} pattern @param {string} answer @param {'final'|'temporary'} [resolution] */
function answer(reply, pattern, answer, resolution = 'final') {
  const parts = reply.semantic_presentation.question_parts.filter((/** @type {any} */ part) => pattern.test(part.question));
  assert.equal(parts.length, 1);
  // All answers and review assertions in this file are synthetic test data.
  const userMessage = `测试 fixture 模拟业务确认：${answer}`;
  return adapter.constructV4Action(reply, {
    action: 'answer_question_part', question_part_id: parts[0].question_part_id,
    answer, user_message: userMessage, resolution,
    origin_type: resolution === 'final' ? 'authorized_confirmation' : 'user_statement'
  });
}

/** Append only compiler-bound user messages to a legal immutable source prefix.
 * @param {any} prior @param {any[]} events */
function sourceAppend(prior, events) {
  const pack = structuredClone(prior);
  pack.source_revision += 1;
  pack.clarification_events.push(...events);
  const source = pack.sources[0];
  for (const event of events.filter(event => event.event_type === 'answer_question_part')) {
    const unitId = `UNIT-answer-${event.event_id}`;
    const text = `测试 fixture 模拟业务确认：${event.answer}`;
    assert.equal(byteDigest(text), event.answer_origin.message_digest);
    const span = {
      start: event.answer_origin.answer_span.start_scalar, end: event.answer_origin.answer_span.end_scalar
    };
    source.semantic_projection.structure.push({
      unit_id: unitId, type: 'user_statement', text, presentation_id: event.presentation_id,
      message_digest: event.answer_origin.message_digest, answer_span: span
    });
    pack.source_reviews[0].units.push({ unit_id: unitId, content_digest: byteDigest(text), classification: 'non_normative' });
    pack.locators.push({
      locator_id: `LOC-answer-${event.event_id}`, source_id: source.source_id,
      semantic_digest: source.semantic_digest, type: 'user_statement', unit_id: unitId,
      excerpt: event.answer, excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
      domain: 'business', field_path: `/clarification_answers/${pack.clarification_events.length}`,
      presentation_id: event.presentation_id, message_digest: event.answer_origin.message_digest, answer_span: span
    });
  }
  source.semantic_digest = `sha256:${digest(source.semantic_projection)}`;
  for (const locator of pack.locators) locator.semantic_digest = source.semantic_digest;
  pack.source_reviews[0].semantic_digest = source.semantic_digest;
  return pack;
}

/** @param {string} directory @param {number} revision */
async function acceptedSource(directory, revision) {
  return json(directory, `accepted/r${String(revision).padStart(3, '0')}/source-pack.json`);
}

/** @param {string} directory @param {any} fixture @param {number} revision */
async function design(directory, fixture, revision) {
  for (const stage of /** @type {const} */ (['behavior_views', 'case_drafts'])) {
    fixture.artifacts[stage].source_revision = revision;
    await stageRaw(directory, stage, fixture.artifacts[stage]);
    const reply = await cli(directory);
    if (stage === 'behavior_views') assert.equal(reply.stage, 'case_drafts', JSON.stringify(reply));
    else return reply;
  }
}

/** @param {string} directory @param {any} fixture @param {any} reply */
async function completeReview(directory, fixture, reply) {
  assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
  assert.equal(reply.stage, 'case_drafts');
  assert.ok(reply.review_request, JSON.stringify(reply));
  await noDelivery(directory);
  assert.deepEqual(await cli(directory), reply, 'pending review must replay without publication');
  const request = reply.review_request;
  fixture.artifacts.case_drafts.independent_review = adapter.constructIndependentReviewCompletionV4(reply, {
    target_assessments: request.source_first_targets.map((/** @type {any} */ target) => {
      const candidate = request.review_target_projection.cases.find((/** @type {any} */ candidate) =>
        candidate.oracles.some((/** @type {any} */ oracle) =>
          oracle.claim_ids.some((/** @type {string} */ id) => target.source_claim_ids.includes(id))));
      assert.ok(candidate, 'synthetic independent review must identify a source-supported Case');
      return {
        target_id: target.target_id, disposition: 'verified',
        affected_items: [{ item_kind: 'case', item_id: candidate.case_id }],
        source_claim_ids: target.source_claim_ids, decision_ids: target.decision_ids,
        rationale: '测试 fixture 的独立上下文已逐项核对来源目标、步骤和预期。',
        required_recheck: { status: 'passed', affected_items: [{ item_kind: 'case', item_id: candidate.case_id }] }
      };
    }), findings: []
  });
  await stageRaw(directory, 'case_drafts', fixture.artifacts.case_drafts);
  return cli(directory);
}

/** Parse RFC 4180 cells independently of the production exporter.
 * @param {string} text */
function csvRows(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell); cell = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else cell += c;
  }
  assert.equal(quoted, false);
  assert.equal(cell, '');
  return rows;
}

/** @param {string} text */
function htmlText(text) {
  return text.replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"').replace(/&#39;/gu, "'");
}

/** @param {string} directory @param {any} reply */
async function verifyDelivery(directory, reply) {
  assert.equal(reply.status, 'finished', JSON.stringify(reply));
  const manifestBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema_version, contract.schema_version);
  assert.equal(manifest.compiler_version, contract.compiler_version);
  const expectedKeys = ['bundle', 'markdown', 'execution_worksheet', 'html', 'chat_table', 'source_reading'];
  assert.deepEqual(Object.keys(manifest).filter(key => manifest[key]?.path).sort(), [...expectedKeys].sort());
  assert.equal(reply.produced_artifacts.length, expectedKeys.length);
  /** @type {Record<string,string>} */ const artifacts = {};
  for (const key of expectedKeys) {
    artifacts[key] = await readFile(path.join(directory, manifest[key].path), 'utf8');
    assert.equal(byteDigest(artifacts[key]), manifest[key].digest, `${key}: exact saved bytes`);
    const produced = reply.produced_artifacts.filter((/** @type {any} */ artifact) => artifact.path === manifest[key].path);
    assert.equal(produced.length, 1, key);
    assert.equal(produced[0].digest, manifest[key].digest);
  }
  const bundle = JSON.parse(artifacts.bundle);
  const ordered = bundle.ordered_case_ids.map((/** @type {string} */ id) => bundle.cases.find((/** @type {any} */ c) => c.case_id === id));
  assert.ok(ordered.length > 1, 'ordering assertions need multiple independent business Cases');
  assert.equal(new Set(bundle.ordered_case_ids).size, bundle.cases.length);
  const [headers, ...rows] = csvRows(artifacts.execution_worksheet);
  const column = (/** @type {string[]} */ row, /** @type {string} */ key) => row[headers.indexOf(key)];
  assert.deepEqual(rows.map(row => column(row, 'case_id')), bundle.ordered_case_ids);
  const htmlCases = [...artifacts.html.matchAll(/<article id="case-(\d+)">([\s\S]*?)<\/article>/gu)];
  const tableRows = artifacts.chat_table.split('\n').filter(line => /^\| \d+ \|/u.test(line));
  const markdownCases = [...artifacts.markdown.matchAll(/^### (.+)\n- 模块：[^]*?(?=^### |^## |$(?![^]))/gmu)];
  assert.equal(htmlCases.length, ordered.length);
  assert.equal(tableRows.length, ordered.length);
  assert.equal(markdownCases.length, ordered.length);
  for (const [index, candidate] of ordered.entries()) {
    const htmlCase = htmlText(htmlCases[index][2]);
    const table = htmlText(tableRows[index]).replace(/\\([\\`*_[\]|])/gu, '$1');
    const markdown = markdownCases[index][0].replace(/\\([\\`*_[\]<>#|])/gu, '$1');
    assert.equal(Number(htmlCases[index][1]), index + 1);
    assert.ok(htmlCase.includes(`<h3>${candidate.title}</h3>`));
    assert.ok(table.startsWith(`| ${index + 1} |`));
    assert.ok(table.includes(candidate.title));
    assert.equal(markdownCases[index][1], candidate.title);
    assert.equal(column(rows[index], 'title'), candidate.title);
    assert.equal(column(rows[index], 'priority'), candidate.priority);
    assert.equal(column(rows[index], 'execution_status'), 'not_run');
    assert.deepEqual(column(rows[index], 'steps').split('\n'), candidate.steps.map((/** @type {any} */ step, /** @type {number} */ n) => `${n + 1}. ${step.action}`));
    const expectedResults = candidate.oracles.map((/** @type {any} */ oracle) => `步骤${candidate.steps.findIndex((/** @type {any} */ step) => step.step_id === oracle.observe_after_step_id) + 1}：${oracle.expected}`);
    assert.deepEqual(column(rows[index], 'expected_results').split('\n').sort(), expectedResults.sort());
    const expectedTexts = candidate.oracles.map((/** @type {any} */ oracle) => oracle.expected).sort();
    assert.deepEqual([...htmlCases[index][2].matchAll(/<li><strong>步骤 \d+ 后（[^]*?）：<\/strong>([^]*?)<\/li>/gu)]
      .map(match => htmlText(match[1])).sort(), expectedTexts, 'HTML contains exactly the canonical Oracles');
    assert.deepEqual([...markdown.matchAll(/^   - 预期（[^）]*）：(.+)$/gmu)].map(match => match[1]).sort(), expectedTexts,
      'Markdown contains exactly the canonical Oracles');
    assert.deepEqual([...table.split(' | ')[3].matchAll(/步骤 \d+ 后（[^）]*）：([^]*?)(?=<br>|$)/gu)]
      .map(match => match[1]).sort(), expectedTexts, 'case-table contains exactly the canonical Oracles');
    const expectedActions = candidate.steps.map((/** @type {any} */ step) => step.action);
    assert.deepEqual([...htmlCases[index][2].matchAll(/<li><p>([^]*?)<\/p>/gu)].map(match => htmlText(match[1])), expectedActions);
    assert.deepEqual([...table.matchAll(/<br>步骤 \d+：([^]*?)(?=<br>| \|)/gu)].map(match => match[1]), expectedActions);
    assert.deepEqual([...markdown.split('#### 步骤与预期\n')[1].matchAll(/^\d+\. (.+)$/gmu)].map(match => match[1]), expectedActions);
    for (const oracle of candidate.oracles) {
      for (const [kind, projection] of [['html', htmlCase], ['case_table', table], ['markdown', markdown]]) {
        assert.ok(projection.includes(oracle.expected), `${kind} lost ${candidate.title}: ${oracle.expected}`);
      }
    }
  }
  assert.equal(JSON.parse(artifacts.source_reading).status, 'complete_within_scope');
  const before = await readdir(path.join(directory, 'accepted'));
  assert.deepEqual(await cli(directory), reply);
  assert.deepEqual(await readdir(path.join(directory, 'accepted')), before);
  assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), manifestBytes);
  return { bundle, manifest, manifestBytes, artifacts };
}

/** Exercise the read-only Case Document binding with the same formal CLI.
 * @param {string} catalog @param {any} run @param {any} delivery */
async function verifyExecutionBinding(catalog, run, delivery) {
  const ref = {
    run_id: run.run_id, revision: delivery.manifest.revision,
    manifest_digest: byteDigest(delivery.manifestBytes), bundle_digest: delivery.manifest.bundle.digest
  };
  const execution = await adapter.createV4RunDirectory(catalog, 'execution_plan');
  const source = {
    schema_version: contract.schema_version, source_revision: 0, run_instance_id: execution.run_id,
    run_scope: `execution:${run.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: ref, output_language: 'zh-CN', sources: [], locators: [], source_reviews: [],
    source_policy: { rules: [] }, decision_records: [], clarification_events: [], execution_events: [],
    source_assets: [], artifact_events: []
  };
  await stageRaw(execution.run_directory, 'source_pack', source);
  const pending = await cli(execution.run_directory);
  assert.equal(pending.phase, 'execution_closure', JSON.stringify(pending));
  const dispositions = pending.execution_presentation.items.filter((/** @type {any} */ item) =>
    item.available_actions.includes('set_execution_disposition'));
  assert.deepEqual(dispositions.flatMap((/** @type {any} */ item) => item.case_ids), delivery.bundle.ordered_case_ids);
  const decided = { ...source, source_revision: 1, execution_events: dispositions.map((/** @type {any} */ item) =>
    adapter.constructV4Action(pending, {
      action: 'set_execution_disposition', action_context: item.action_context, disposition: 'do_not_execute'
    })) };
  await stageRaw(execution.run_directory, 'source_pack', decided);
  const confirmation = await cli(execution.run_directory);
  assert.equal(confirmation.phase, 'final_confirmation', JSON.stringify(confirmation));
  await noDelivery(execution.run_directory);
  await stageRaw(execution.run_directory, 'source_pack', {
    ...decided, source_revision: 2,
    execution_events: [...decided.execution_events, adapter.constructV4Action(confirmation, { action: 'confirm_execution_plan' })]
  });
  const finished = await cli(execution.run_directory);
  assert.equal(finished.status, 'finished', JSON.stringify(finished));
  const verified = await adapter.verifyExecutionPlanDeliveryV4(execution.run_directory, {
    resolve_case_document: async (/** @type {any} */ requested) => {
      assert.deepEqual(requested, ref);
      return { manifest_bytes: delivery.manifestBytes, bundle_bytes: delivery.artifacts.bundle };
    }
  });
  assert.deepEqual(verified.manifest.case_document_ref, ref);
  assert.deepEqual(verified.manifest.runner_projection.case_ids, [], 'test does not execute any business action');

  const invalid = await adapter.createV4RunDirectory(catalog, 'execution_plan');
  await stageRaw(invalid.run_directory, 'source_pack', {
    ...source, run_instance_id: invalid.run_id,
    case_document_ref: { ...ref, manifest_digest: `sha256:${'0'.repeat(64)}` }
  });
  const rejection = await cli(invalid.run_directory);
  assert.equal(rejection.status, 'fatal', JSON.stringify(rejection));
  await noDelivery(invalid.run_directory);
  await assert.rejects(readFile(path.join(invalid.run_directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(run.run_directory, 'output/current.json'), 'utf8'), delivery.manifestBytes);
  for (const [key, bytes] of Object.entries(delivery.artifacts)) {
    assert.equal(await readFile(path.join(run.run_directory, delivery.manifest[key].path), 'utf8'), bytes);
  }
}

test('[reliability T11/T13/T14/T22/T24] formal latest CLI completes without post-case questions and verifies every export', async (/** @type {any} */ t) => {
  const { catalog, run, directory, fixture, reply } = await start(t);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  assert.equal(reply.phase, 'requirements_analysis');
  assert.equal(reply.semantic_presentation.question_parts.length, 3);
  await stageRaw(directory, 'source_pack', sourceAppend(await acceptedSource(directory, 0), [
    answer(reply, /IP/u, '发布者提交评价时的 IP 归属地'),
    answer(reply, /空值/u, '—'), answer(reply, /排序/u, '降序')
  ]));
  const ready = await cli(directory);
  assert.equal(ready.stage, 'behavior_views', JSON.stringify(ready));
  const review = await design(directory, fixture, 1);
  const finished = await completeReview(directory, fixture, review);
  const delivery = await verifyDelivery(directory, finished);
  assert.ok(delivery.bundle.semantic_root_groups.every((/** @type {any} */ root) => root.status === 'resolved_final'));
  assert.equal(delivery.bundle.coverage.semantic_gap_count, 0);
  assert.equal(delivery.bundle.independent_review_summary.status, 'completed');
  const checkpoint = await json(directory, 'checkpoint.json');
  assert.equal(checkpoint.commit_profile, 'final');
  assert.equal(checkpoint.revision, 1, 'no post-case clarification revision is needed');
  await verifyExecutionBinding(catalog, run, delivery);
});

test('[reliability T12/T14] formal CLI preserves partial answers and resolves a distinct post-case issue before finished', async (/** @type {any} */ t) => {
  const { directory, fixture, reply: initial } = await start(t, true);
  assert.equal(initial.status, 'need_user_answers', JSON.stringify(initial));
  assert.equal(initial.phase, 'requirements_analysis');
  assert.equal(initial.semantic_presentation.question_parts.length, 2);
  const firstEvent = answer(initial, /IP/u, '发布者提交评价时的 IP 归属地');
  const firstSource = sourceAppend(await acceptedSource(directory, 0), [firstEvent]);
  await stageRaw(directory, 'source_pack', firstSource);
  const partial = await cli(directory);
  assert.equal(partial.status, 'need_user_answers', JSON.stringify(partial));
  assert.equal(partial.semantic_presentation.question_parts.length, 1);
  assert.match(partial.semantic_presentation.question_parts[0].question, /空值/u);
  const accepted1 = await acceptedSource(directory, 1);
  assert.equal(accepted1.decision_records.length, 1);
  assert.equal(accepted1.decision_records[0].resolution, 'final');
  assert.equal(accepted1.decision_records[0].authority, 'product_final');
  assert.equal(accepted1.decision_records[0].answer, firstEvent.answer);
  const checkpoint1 = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
  await noDelivery(directory);
  assert.deepEqual(await cli(directory), partial);
  await stageRaw(directory, 'source_pack', firstSource);
  assert.deepEqual(await cli(directory), partial, 'repeating an accepted source action must be idempotent');
  const stale = sourceAppend(accepted1, [answer(initial, /IP/u, '评价地点信息')]);
  await stageRaw(directory, 'source_pack', stale);
  assert.deepEqual(await cli(directory), partial, 'a stale binding cannot replace the final answer');
  assert.deepEqual(await readdir(path.join(directory, 'accepted')), ['r000', 'r001']);
  assert.deepEqual(await acceptedSource(directory, 1), accepted1);
  assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpoint1);
  await stageRaw(directory, 'source_pack', sourceAppend(accepted1, [answer(partial, /空值/u, '—')]));
  const ready = await cli(directory);
  assert.equal(ready.stage, 'behavior_views', JSON.stringify(ready));
  const preRoots = (await json(directory, 'checkpoint.json')).clarification_state.root_states;
  assert.equal(preRoots.length, 2);
  assert.ok(preRoots.every((/** @type {any} */ root) => root.status === 'resolved_final'));
  const review = await design(directory, fixture, 2);
  const post = await completeReview(directory, fixture, review);
  assert.equal(post.status, 'need_user_answers', JSON.stringify(post));
  assert.equal(post.phase, 'case_design');
  assert.equal(post.semantic_presentation.question_parts.length, 1);
  const postPart = post.semantic_presentation.question_parts[0];
  assert.match(postPart.question, /排序/u);
  assert.ok(!preRoots.some((/** @type {any} */ root) => root.root_issue_id === postPart.root_issue_id));
  assert.equal((await json(directory, 'checkpoint.json')).commit_profile, 'post_case_pending');
  await noDelivery(directory);
  await stageRaw(directory, 'source_pack', sourceAppend(await acceptedSource(directory, 2), [answer(post, /排序/u, '降序')]));
  let finished = await cli(directory);
  if (finished.review_request) {
    fixture.artifacts.case_drafts.source_revision = 3;
    finished = await completeReview(directory, fixture, finished);
  }
  await verifyDelivery(directory, finished);
  const accepted3 = await acceptedSource(directory, 3);
  assert.equal(accepted3.decision_records.length, 3);
  assert.equal(new Set(accepted3.clarification_events.map((/** @type {any} */ event) => event.event_id)).size, 3);
  const roots = (await json(directory, 'checkpoint.json')).clarification_state.root_states;
  assert.equal(roots.length, 3);
  assert.ok(roots.every((/** @type {any} */ root) => root.status === 'resolved_final'));
});

test('[reliability T13] critical unknown, deferred and temporary answers never publish a Case Document', async (/** @type {any} */ t) => {
  for (const action of ['mark_question_unknown', 'defer_question_part', 'temporary']) {
    await t.test(action, async (/** @type {any} */ t) => {
      const { directory, fixture, reply } = await start(t);
      const part = reply.semantic_presentation.question_parts.find((/** @type {any} */ part) => /IP/u.test(part.question));
      assert.ok(!part.available_actions.includes('request_delivery'));
      const event = action === 'temporary'
        ? answer(reply, /IP/u, '发布者提交评价时的 IP 归属地', 'temporary')
        : adapter.constructV4Action(reply, { action, question_part_id: part.question_part_id });
      await stageRaw(directory, 'source_pack', sourceAppend(await acceptedSource(directory, 0), [
        event, answer(reply, /空值/u, '—'), answer(reply, /排序/u, '降序')
      ]));
      const blocked = await cli(directory);
      assert.equal(blocked.status, 'need_user_answers', JSON.stringify(blocked));
      assert.equal(blocked.semantic_presentation.question_parts.length, 1, 'only the tested critical question remains');
      assert.equal(blocked.semantic_presentation.question_parts[0].root_issue_id, part.root_issue_id);
      const checkpoint = await json(directory, 'checkpoint.json');
      const root = checkpoint.clarification_state.root_states.find((/** @type {any} */ root) => root.root_issue_id === part.root_issue_id);
      assert.equal(root.status, action === 'temporary' ? 'resolved_temporary'
        : action === 'mark_question_unknown' ? 'unknown_by_user' : 'deferred_by_user');
      await noDelivery(directory);
      assert.deepEqual(await cli(directory), blocked);
      for (const stage of /** @type {const} */ (['behavior_views', 'case_drafts'])) {
        fixture.artifacts[stage].source_revision = 1;
        await stageRaw(directory, stage, fixture.artifacts[stage]);
      }
      assert.deepEqual(await cli(directory), blocked, 'premature design artifacts cannot bypass the sole critical gate');
      await noDelivery(directory);
      const decisions = (await acceptedSource(directory, 1)).decision_records;
      const testedDecisions = decisions.filter((/** @type {any} */ decision) => decision.target.root_issue_id === part.root_issue_id);
      assert.equal(testedDecisions.length, action === 'temporary' ? 1 : 0);
      assert.ok(testedDecisions.every((/** @type {any} */ decision) => decision.resolution !== 'final'));
    });
  }
});

test('[reliability T21] current compiler preserves the business projection captured from unmodified 4.3.2/0.8.2 code', () => {
  const outputs = ['4.3.2', contract.schema_version].map(schema => {
    const fixture = v4GeneralQualityFixture(schema);
    const result = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
    assert.equal(result.status, 'compiled', JSON.stringify(result));
    // Protocol versions, generated identities/digests and trace-only references
    // may change; compare business meaning and ordered step-to-Oracle binding.
    return {
      facts: fixture.artifacts.evidence_claims.fact_ledger.map((/** @type {any} */ fact) => ({
        statement: fact.statement, status: fact.status, acceptance_role: fact.acceptance_role,
        field_path: fact.field_path, module_refs: fact.module_refs
      })),
      gaps: fixture.artifacts.evidence_claims.semantic_gaps,
      result_kind: result.result_kind, coverage: result.bundle.coverage,
      cases: result.bundle.ordered_case_ids.map((/** @type {string} */ id) => {
        const item = result.bundle.cases.find((/** @type {any} */ item) => item.case_id === id);
        return {
          title: item.title, module: item.module_id, priority: item.priority,
          semantic_status: item.semantic_status, acceptance_role: item.acceptance_role,
          preconditions: item.business_preconditions, data: item.data_conditions,
          steps: item.steps.map((/** @type {any} */ step) => step.action),
          oracles: item.oracles.map((/** @type {any} */ oracle) => ({
            after_step: item.steps.findIndex((/** @type {any} */ step) => step.step_id === oracle.observe_after_step_id),
            surface: oracle.surface, expected: oracle.expected
          }))
        };
      })
    };
  });
  assert.deepEqual(outputs[1], outputs[0]);
  assert.deepEqual(outputs[1], normalBaseline.business_projection,
    `Business regression against pre-fix revision ${normalBaseline.provenance.revision}`);
});
