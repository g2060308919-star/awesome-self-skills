import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  constructSemanticClarificationEventV4
} from '../../src/clarification.mjs';
import { digest, stableId } from '../../src/canonical.mjs';
import {
  canonicalizeSourceCapture, createSourceProviderRegistry
} from '../../src/source-canonicalization.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

// Task 01 characterization was recorded against compiler 0.4.0/schema 3.0.0
// in precursor commit 4277522: missing execution resources blocked Case
// delivery, partial answers suppressed omitted questions, signed-query churn
// changed semantic identity, and an applicable zero-Case path completed. Those
// failures reached valid v3 semantic paths rather than fixture/schema errors.
// The four tests below are their v4 GREEN contracts; v3 goldens stay unchanged.
const fixtureRoot = new URL('../fixtures/v4/bend-review-platform/', import.meta.url);

/** @param {string} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

test('v4 user outcome: missing execution resources do not become Case Document blockers', () => {
  const input = v4PipelineFixture();
  const system = deriveV4SystemContext(input.artifacts);
  assert.equal(Object.hasOwn(system, 'execution_resources'), false);

  const result = compileCaseDocumentRevisionV4(input.artifacts, system);

  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.cases.length, 1);
  assert.equal(result.bundle.coverage.semantic_gap_count, 0);
  for (const forbidden of ['execution_resources', 'execution_plan', 'runner_projection', 'runner_case_ids']) {
    assert.equal(Object.hasOwn(result.bundle, forbidden), false, forbidden);
  }
});

function partialAnswerCheckpoint() {
  /** @type {Array<[string,string,string,string[]]>} */
  const definitions = [
    ['ip', 'IP 列', 'IP 表示网络地址还是定位城市？', ['网络 IP', '定位城市']],
    ['empty', '空值展示', '空值显示为空白还是横线？', ['空白', '—']],
    ['sort', '默认排序', '默认排序是升序还是降序？', ['升序', '降序']]
  ];
  const facts = definitions.map(([key, statement]) => ({
    fact_id: `FACT-${key}`, statement, claim_ids: [`CLM-${key}`]
  }));
  const diagnostic_candidates = definitions.map(([key, _statement, question, answer_options]) => ({
    category: 'semantic_gap', code: `${key.toUpperCase()}_UNRESOLVED`,
    subject_fact_ids: [`FACT-${key}`], missing_aspect: `${key}_meaning`,
    scope_ref: `review.${key}`, question,
    why_needed: `需要明确${question}`, decision_impact: `答案决定 ${key} 的测试预期。`,
    unresolved_outcome: `${key} 场景保持待确认。`, answer_options,
    risk_level: 'high', source_claim_ids: [`CLM-${key}`], discovery_phase: 'pre_case',
    affected_test_point_ids: []
  }));
  return compileSemanticClarificationCheckpointV4({
    run_id: 'RUN-user-outcome', committed_revision: 0,
    committed_checkpoint_bytes: new TextEncoder().encode('{}\n'),
    discovery_phase: 'pre_case',
    source_review_witness: { expected_unit_ids: ['BLOCK-prd'], reviewed_unit_ids: ['BLOCK-prd'] },
    fact_ledger_digest: `sha256:${digest(facts)}`,
    scope_manifest_digest: `sha256:${digest({ primary_surface: 'review' })}`,
    behavior_views_digest: null, case_drafts_digest: null,
    facts, diagnostic_candidates, prior_checkpoint: null
  });
}

test('v4 user outcome: answering IP alone keeps the other two presented questions pending', () => {
  const initial = partialAnswerCheckpoint();
  const ip = initial.presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('IP'));
  assert.ok(ip);
  const answer = ip.answer_options[0];
  const message = `IP 口径：${answer}`;
  const characters = Array.from(message); const answerCharacters = Array.from(answer);
  const start = characters.join('').indexOf(answer);
  const event = constructSemanticClarificationEventV4(
    initial.presentation, ip, 'answer_question_part', {
      answer, resolution: 'temporary', authority: 'task_scoped',
      answer_origin: {
        type: 'user_statement', presentation_id: initial.presentation.presentation_id,
        message_digest: byteDigest(message),
        answer_span: {
          start_scalar: start, end_scalar: start + answerCharacters.length,
          excerpt_digest: byteDigest(answer)
        }
      }
    }
  );
  const obligations = initial.checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => ({
    root_issue_id: root.root_issue_id, obligation_ids: [`OBL-${root.missing_aspect}`]
  }));

  const result = applySemanticClarificationEventsV4({
    checkpoint: initial.checkpoint, clarification_events: [event], existing_decisions: [],
    presentation_history: [initial.presentation], normalized_user_messages: [message],
    previous_obligations_by_root: obligations, current_obligations_by_root: obligations
  });

  assert.equal(result.commit_required, true);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.presentation.question_parts.length, 2);
  assert.equal(result.checkpoint.clarification_state.remaining_part_ids.length, 2);
  assert.equal(result.checkpoint.clarification_state.root_states.filter(
    (/** @type {any} */ state) => state.status === 'resolved_temporary'
  ).length, 1);
  assert.equal(result.checkpoint.clarification_state.root_states.filter(
    (/** @type {any} */ state) => state.status === 'presented'
  ).length, 2);
});

test('v4 user outcome: signed-source refresh preserves semantic identity and generated identities', async () => {
  const providers = createSourceProviderRegistry([{
    provider: 'cooper', version: '1',
    hosts: ['prd-assets.example.invalid'], kind: 'cooper', query_order: 'sensitive'
  }]);
  const capture = (/** @type {string} */ content) => canonicalizeSourceCapture({
    stable_source_id: 'SOURCE-review', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: []
  }, providers);
  const a = capture(await readFile(new URL('signed-source-a.md', fixtureRoot), 'utf8'));
  const b = capture(await readFile(new URL('signed-source-b.md', fixtureRoot), 'utf8'));

  assert.equal(a.status, 'canonical');
  assert.equal(b.status, 'canonical');
  assert.notEqual(a.capture_digest, b.capture_digest);
  assert.equal(a.semantic_digest, b.semantic_digest);
  assert.equal(stableId('fact', { subject: 'source22', source: a.semantic_digest }),
    stableId('fact', { subject: 'source22', source: b.semantic_digest }));
  assert.equal(stableId('case', { outcome: 'source22-label', source: a.semantic_digest }),
    stableId('case', { outcome: 'source22-label', source: b.semantic_digest }));
});

test('v4 user outcome: applicable zero-Case output is fatal quality_failure', () => {
  const input = v4PipelineFixture();
  input.artifacts.case_drafts.cases = [];

  const result = compileCaseDocumentRevisionV4(
    input.artifacts, deriveV4SystemContext(input.artifacts)
  );

  assert.equal(result.status, 'fatal', JSON.stringify(result));
  assert.equal(result.result_kind, 'quality_failure');
  assert.equal(result.reason_code, 'APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE');
  assert.equal(Object.hasOwn(result, 'bundle'), false);
});
