import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict } from '../../src/advance-strict.mjs';
import { constructSemanticClarificationEventV4 } from '../../src/clarification-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stage(directory, stage, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]), `${JSON.stringify(value)}\n`);
}

test('production runner commits and presents a newly discovered post-case semantic gap', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-post-case-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const fixture = v4PipelineFixture();
    fixture.artifacts.source_pack.run_instance_id = initial.scope.run_instance_id;
    const fact = fixture.artifacts.evidence_claims.fact_ledger[0];
    const claim = fixture.artifacts.evidence_claims.claims[0];
    fixture.artifacts.evidence_claims.semantic_gaps = [{
      category: 'semantic_gap', code: 'REFRESH_TIMING_UNRESOLVED',
      subject_fact_ids: [fact.fact_id], missing_aspect: 'refresh_timing',
      scope_ref: 'checkout', question: '刷新后何时应看到最新订单状态？',
      why_needed: '需要明确刷新后的业务完成时机。',
      decision_impact: '答案会改变刷新步骤和观察时点。',
      unresolved_outcome: '刷新时机场景保持待确认。',
      answer_options: ['刷新完成后立即', '后台同步完成后'], risk_level: 'high',
      source_claim_ids: [claim.claim_id], discovery_phase: 'post_case',
      affected_test_point_ids: []
    }];

    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (
      ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']
    )) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      var reply = /** @type {any} */ (await advanceStrict(directory));
    }

    assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
    assert.equal(reply.phase, 'case_design');
    assert.equal(reply.semantic_presentation.question_parts.length, 1);
    assert.match(reply.semantic_presentation.question_parts[0].question, /刷新/u);

    await assert.rejects(
      readFile(path.join(directory, 'output', 'current.json')),
      /ENOENT/u,
      'a post-case pending revision must not publish current.json'
    );
    const event = constructSemanticClarificationEventV4(
      reply.semantic_presentation,
      reply.semantic_presentation.question_parts[0],
      'request_delivery'
    );
    const answered = structuredClone(fixture.artifacts.source_pack);
    answered.source_revision = 1;
    answered.clarification_events.push(event);
    await stage(directory, 'source_pack', answered);

    const finished = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'delivered_with_gaps');
    assert.deepEqual(
      finished.produced_artifacts.map((/** @type {any} */ item) => item.kind),
      ['case_document', 'business_markdown', 'execution_worksheet']
    );
    const checkpoint = JSON.parse(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'));
    assert.equal(checkpoint.revision, 1);
    assert.equal(checkpoint.commit_profile, 'final');
    assert.equal(checkpoint.clarification_state.presentation, null);
    assert.equal(checkpoint.clarification_state.root_states[0].status, 'closed_for_delivery');
    for (const stageName of ['source-pack', 'evidence-claims', 'behavior-views', 'case-drafts']) {
      const value = JSON.parse(await readFile(
        path.join(directory, 'accepted', 'r001', `${stageName}.json`), 'utf8'
      ));
      assert.equal(value.source_revision, 1);
    }
    assert.deepEqual(await advanceStrict(directory), finished, 'finished replay must be byte-stable');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
