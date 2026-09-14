// @ts-nocheck -- End-to-end contract test narrows runtime reply unions through assertions.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  advanceStrict, commitSemanticAnswerBatchV4, createV4RunDirectory,
  prepareSemanticAnswerBatchV4
} from '../../src/entry.mjs';
import { compileBusinessOutcomesV4 } from '../../src/obligations/business-outcomes-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

async function stage(directory, name, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', `${name}.json`), `${canonicalStringify(value)}\n`);
}

test('T03 AT17 one confirmed answer batch changes Decisions, Facts, test points, Cases, Markdown, and CSV', { timeout: 60_000 }, async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-preview-delivery-'));
  try {
    const created = await createV4RunDirectory(catalog, 'case_document');
    const revision0 = await bendReviewJourneyFixture(created.run_id);
    await stage(created.run_directory, 'source-pack', revision0.artifacts.source_pack);
    assert.equal((await advanceStrict(created.run_directory)).stage, 'evidence_claims');
    await stage(created.run_directory, 'evidence-claims', revision0.artifacts.evidence_claims);
    const pending = await advanceStrict(created.run_directory);
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));

    const answerByQuestion = new Map([
      ['IP', '发布者提交评价时的 IP 归属地'],
      ['空值', '—'],
      ['排序', '降序']
    ]);
    const message = 'IP：发布者提交评价时的 IP 归属地；空值：—；排序：降序';
    const requests = pending.semantic_presentation.question_parts.map((part) => {
      const entry = [...answerByQuestion.entries()].find(([label]) => part.question.includes(label));
      assert.ok(entry, part.question);
      const answer = entry[1];
      return {
        action: 'answer_question_part', question_part_id: part.question_part_id,
        answer, user_message: message, resolution: 'temporary', origin_type: 'user_statement'
      };
    });
    const prepared = await prepareSemanticAnswerBatchV4(created.run_directory, {
      presentation_id: pending.semantic_presentation.presentation_id,
      user_message: message,
      requests
    });
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    const afterAnswers = await commitSemanticAnswerBatchV4(created.run_directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认按上面的三项预览应用',
      decision: 'apply'
    });
    assert.equal(afterAnswers.status, 'need_revision', JSON.stringify(afterAnswers));
    assert.equal(afterAnswers.stage, 'behavior_views');

    const source = JSON.parse(await readFile(path.join(
      created.run_directory, 'accepted/r001/source-pack.json'
    ), 'utf8'));
    const evidence = JSON.parse(await readFile(path.join(
      created.run_directory, 'accepted/r001/evidence-claims.json'
    ), 'utf8'));
    assert.equal(source.decision_records.length, 3);
    const decisionClaims = evidence.claims.filter((claim) => claim.claim_form === 'decision-record');
    assert.equal(decisionClaims.length, 3);
    const answerFacts = evidence.fact_ledger.filter((fact) =>
      ['FACT-ip', 'FACT-empty', 'FACT-sort'].includes(fact.fact_id));
    assert.ok(answerFacts.every((fact) => fact.status === 'active'));

    const downstream = await bendReviewJourneyFixture(created.run_id, 1);
    const behavior = structuredClone(downstream.artifacts.behavior_views);
    for (const fact of answerFacts) {
      const claim = decisionClaims.find((item) => fact.claim_ids.includes(item.claim_id));
      assert.ok(claim);
      const assertion = (fieldPath) => claim.semantic_value.behavior_assertions.find(
        (item) => item.fact_id === fact.fact_id && item.field_path === fieldPath
      )?.value;
      behavior.views.push({
        view_id: `VIEW-answer-${fact.fact_id}`,
        module_id: 'review-admin', type: 'state', scope: claim.scope,
        source_claim_ids: [claim.claim_id],
        elements: [{
          element_id: `EL-answer-${fact.fact_id}`,
          kind: 'state', fact_id: fact.fact_id,
          business_outcome: assertion('/business_outcome'),
          condition: assertion('/condition'), expected: assertion('/expected'),
          evidence_bindings: [
            { field_path: '/business_outcome', claim_ids: [claim.claim_id] },
            { field_path: '/condition', claim_ids: [claim.claim_id] },
            { field_path: '/expected', claim_ids: [claim.claim_id] }
          ]
        }],
        relations: []
      });
    }
    const context = deriveV4SystemContext({
      source_pack: source,
      evidence_claims: evidence,
      behavior_views: behavior,
      case_drafts: downstream.artifacts.case_drafts
    });
    const compiled = compileBusinessOutcomesV4(behavior, context.behavior_evidence);
    assert.equal(compiled.kind, 'compiled', JSON.stringify(compiled));
    const cases = structuredClone(downstream.artifacts.case_drafts);
    for (const fact of answerFacts) {
      const claimId = fact.claim_ids[0];
      const outcome = compiled.outcomes.find((item) => item.fact_id === fact.fact_id);
      const point = compiled.formal_test_points.find((item) => item.outcome_id === outcome?.outcome_id);
      assert.ok(outcome && point);
      const key = fact.fact_id.slice('FACT-'.length);
      cases.cases.push({
        case_id: `CASE-answer-${key}`,
        title: `按已确认口径验收 ${key}`,
        module_id: 'review-admin', priority: 'P0',
        ordering: { business_flow_ref: null, page_action_ref: null },
        acceptance_role: 'primary_acceptance', fact_ids: [fact.fact_id],
        primary_test_point_id: point.formal_test_point_id,
        supporting_observation_ids: [], business_preconditions: [], data_conditions: [],
        steps: [{ step_id: `STEP-answer-${key}`, action: `查看 ${key} 对应业务结果` }],
        oracles: [{
          oracle_id: `ORACLE-answer-${key}`,
          observe_after_step_id: `STEP-answer-${key}`,
          surface: 'ui', expected: outcome.expected, claim_ids: [claimId]
        }]
      });
    }

    await stage(created.run_directory, 'behavior-views', behavior);
    const caseRequest = await advanceStrict(created.run_directory);
    assert.equal(caseRequest.status, 'need_revision', JSON.stringify(caseRequest));
    assert.equal(caseRequest.stage, 'case_drafts');
    await stage(created.run_directory, 'case-drafts', cases);
    const finished = await advanceStrict(created.run_directory);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'delivered_cases');

    const manifest = JSON.parse(await readFile(path.join(
      created.run_directory, 'output/current.json'
    ), 'utf8'));
    const bundleText = await readFile(path.join(created.run_directory, manifest.bundle.path), 'utf8');
    const markdown = await readFile(path.join(created.run_directory, manifest.markdown.path), 'utf8');
    const csv = await readFile(path.join(created.run_directory, manifest.execution_worksheet.path), 'utf8');
    const bundle = JSON.parse(bundleText);
    assert.equal(bundle.cases.length, revision0.artifacts.case_drafts.cases.length + 3);
    for (const answer of answerByQuestion.values()) {
      assert.match(bundleText, new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
      assert.match(markdown, new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
      assert.match(csv, new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    }
    assert.equal(new Set(bundle.cases.map((item) => item.case_id)).size, bundle.cases.length);
    const answerFactIds = new Set(answerFacts.map((fact) => fact.fact_id));
    const deliveredAnswerCases = bundle.cases.filter((item) =>
      item.fact_ids.some((factId) => answerFactIds.has(factId)));
    assert.equal(deliveredAnswerCases.length, 3);
    const answerOutcomeIds = new Set(compiled.outcomes
      .filter((outcome) => answerFactIds.has(outcome.fact_id))
      .map((outcome) => outcome.outcome_id));
    const answerPointIds = new Set(compiled.formal_test_points
      .filter((point) => answerOutcomeIds.has(point.outcome_id))
      .map((point) => point.formal_test_point_id));
    assert.ok(deliveredAnswerCases.every((item) => answerPointIds.has(item.primary_test_point_id)));
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('T02/T03 AT20 post-case discovery remains a separate preview-capable clarification phase', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-preview-post-case-'));
  try {
    const created = await createV4RunDirectory(catalog, 'case_document');
    const fixture = v4PipelineFixture();
    fixture.artifacts.source_pack.run_instance_id = created.run_id;
    const fact = fixture.artifacts.evidence_claims.fact_ledger[0];
    const claim = fixture.artifacts.evidence_claims.claims[0];
    fixture.artifacts.evidence_claims.semantic_gaps = [{
      category: 'semantic_gap', code: 'REFRESH_TIMING_UNRESOLVED',
      subject_fact_ids: [fact.fact_id], missing_aspect: 'refresh_timing', scope_ref: 'checkout',
      question: '刷新后何时应看到最新订单状态？', why_needed: '需要明确刷新后的业务完成时机。',
      decision_impact: '答案会改变刷新步骤和观察时点。', unresolved_outcome: '刷新时机场景保持待确认。',
      answer_options: ['刷新完成后立即', '后台同步完成后'], risk_level: 'high',
      source_claim_ids: [claim.claim_id], discovery_phase: 'post_case', affected_test_point_ids: []
    }];
    for (const [key, filename] of [
      ['source_pack', 'source-pack'], ['evidence_claims', 'evidence-claims'],
      ['behavior_views', 'behavior-views'], ['case_drafts', 'case-drafts']
    ]) {
      await stage(created.run_directory, filename, fixture.artifacts[key]);
      var pending = await advanceStrict(created.run_directory);
    }
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.equal(pending.phase, 'case_design');
    const part = pending.semantic_presentation.question_parts[0];
    const prepared = await prepareSemanticAnswerBatchV4(created.run_directory, {
      presentation_id: pending.semantic_presentation.presentation_id,
      user_message: '该项先按缺口交付',
      requests: [{ action: 'request_delivery', question_part_id: part.question_part_id }]
    });
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    assert.equal(prepared.value.presentation_binding.phase, 'case_design');
    const finished = await commitSemanticAnswerBatchV4(created.run_directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认按缺口交付该项',
      decision: 'apply'
    });
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'delivered_with_gaps');
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});
