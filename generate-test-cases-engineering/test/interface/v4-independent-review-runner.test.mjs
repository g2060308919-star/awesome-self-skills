import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict } from '../../src/advance-strict.mjs';
import { constructIndependentReviewCompletionV4 } from '../../src/agent-action-adapter-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stageArtifact(directory, stage, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stage]),
    `${canonicalStringify(value)}\n`, 'utf8'
  );
}

/** @param {any} reply @param {any} fixture */
function completedReviewFromRequest(reply, fixture) {
  const claimId = fixture.artifacts.evidence_claims.claims[0].claim_id;
  const targetId = reply.review_request.source_first_targets[0].target_id;
  const pointId = reply.review_request.review_target_projection.formal_test_points[0]
    .formal_test_point_id;
  const caseId = reply.review_request.review_target_projection.cases[0].case_id;
  return constructIndependentReviewCompletionV4(reply, {
    target_assessments: [{
      target_id: targetId, disposition: 'verified',
      affected_items: [
        { item_kind: 'formal_test_point', item_id: pointId },
        { item_kind: 'case', item_id: caseId }
      ],
      source_claim_ids: [claimId], decision_ids: [],
      rationale: '当前 Case 的可判定 Oracle 验证该必要目标。',
      required_recheck: {
        status: 'passed', affected_items: [{ item_kind: 'case', item_id: caseId }]
      }
    }],
    findings: []
  });
}

function pendingReview() {
  return {
    protocol_version: '1.0.0', status: 'pending', review_mode: 'independent_source_first',
    reviewer_identity: {
      identity_class: 'independent_context', separation_basis: '先形成来源目标，再读取生成投影。'
    },
    source_first_targets: [{
      target_kind: 'business_result', acceptance_role: 'primary_acceptance',
      objective: '有效提交后订单进入已接受状态', source_claim_ids: ['CLM-checkout'], decision_ids: []
    }]
  };
}

test('AT23/AT24: existing case_drafts stage issues a target then accepts an adapter-bound completed review', () => {
  const fixture = v4GeneralQualityFixture();
  const pending = pendingReview();
  pending.source_first_targets[0].source_claim_ids = [
    fixture.artifacts.evidence_claims.claims[0].claim_id
  ];
  fixture.artifacts.case_drafts.independent_review = pending;

  const first = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(first.status, 'need_revision');
  assert.equal(first.stage, 'case_drafts');
  assert.equal(first.diagnostics[0].code, 'INDEPENDENT_REVIEW_REQUIRED');
  assert.match(first.review_request.review_target_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.review_request.review_target_projection.cases.length, 1);

  const completed = completedReviewFromRequest(first, fixture);
  fixture.artifacts.case_drafts.independent_review = completed;
  assert.equal(compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system).status, 'compiled');
});

test('AT23/AT24: strict runner retries a pending review without accepting it, then commits its bound completion', async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v43-independent-review-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await createV4RunDirectory(catalog, 'case_document');
  const fixture = v4GeneralQualityFixture();
  fixture.artifacts.source_pack.run_instance_id = run.run_id;
  const baselineClaim = fixture.artifacts.evidence_claims.claims[0];
  baselineClaim.semantic_value.relative_baseline_assertions = [{
    reference: '当前线上', comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    }
  }];
  fixture.artifacts.case_drafts.cases[0].baseline_spec = {
    baseline_id: 'BASELINE-current-production', kind: 'declared_reference',
    acquisition: 'capture_at_execution', reference: '当前线上',
    comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    },
    claim_ids: [baselineClaim.claim_id]
  };

  let reply = /** @type {any} */ (await advanceStrict(run.run_directory));
  const source = fixture.artifacts.source_pack.sources[0];
  const unit = source.semantic_projection.structure[0];
  const bytes = new TextEncoder().encode(source.content);
  await stageV4PrdCollectionObservation(run.run_directory, reply, {
    version: '1.0.0',
    scope: {
      mode: 'provided_materials', root_ref: 'provided:independent-review-prd',
      source_version: source.version,
      collection_window: {
        started_at: '2026-09-17T00:00:00.000Z', ended_at: '2026-09-17T00:00:01.000Z'
      }
    },
    channels: [
      {
        channel: 'body', enumeration_status: 'exhausted', page_count: 1,
        terminal_page_observed: true, diagnostic_code: null
      },
      ...['table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: 'not_applicable', page_count: 0,
        terminal_page_observed: false, diagnostic_code: null
      }))
    ],
    items: [{
      item_id: 'provided-body', parent_item_id: null, channel: 'body',
      source_id: source.source_id, asset_id: null, unit_ids: [unit.unit_id],
      acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null
    }]
  }, [{ item_id: 'provided-body', raw_response_bytes: bytes, capture_bytes: bytes }]);

  for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ ([
    'source_pack', 'evidence_claims', 'behavior_views'
  ])) {
    await stageArtifact(run.run_directory, stage, fixture.artifacts[stage]);
    reply = /** @type {any} */ (await advanceStrict(run.run_directory));
  }

  const pending = pendingReview();
  pending.source_first_targets[0].source_claim_ids = [
    fixture.artifacts.evidence_claims.claims[0].claim_id
  ];
  fixture.artifacts.case_drafts.independent_review = pending;
  await stageArtifact(run.run_directory, 'case_drafts', fixture.artifacts.case_drafts);
  const first = /** @type {any} */ (await advanceStrict(run.run_directory));
  assert.equal(first.status, 'need_revision', JSON.stringify(first));
  assert.equal(first.stage, 'case_drafts');
  assert.ok(first.review_request, JSON.stringify(first));
  assert.equal(first.review_request.review_target_projection.cases[0].steps.length, 4);
  await assert.rejects(
    readFile(path.join(run.run_directory, 'accepted/r000/case-drafts.json'), 'utf8'), /ENOENT/u
  );

  const retry = /** @type {any} */ (await advanceStrict(run.run_directory));
  assert.deepEqual(retry, first, 'crash/retry must reproduce the same compiler-issued review target');
  fixture.artifacts.case_drafts.independent_review = completedReviewFromRequest(first, fixture);
  await stageArtifact(run.run_directory, 'case_drafts', fixture.artifacts.case_drafts);

  const finished = /** @type {any} */ (await advanceStrict(run.run_directory));
  assert.equal(finished.status, 'finished', JSON.stringify(finished));
  const accepted = JSON.parse(await readFile(
    path.join(run.run_directory, 'accepted/r000/case-drafts.json'), 'utf8'
  ));
  assert.equal(accepted.independent_review.review_target_digest,
    first.review_request.review_target_digest);
  assert.deepEqual(
    await advanceStrict(run.run_directory), finished,
    'accepted review replay must be byte-stable after recovery'
  );
});

test('AT24/AT29: 4.3 cannot omit current review while 4.2 retains its frozen Case Draft shape', () => {
  const current = v4GeneralQualityFixture();
  delete current.artifacts.case_drafts.independent_review;
  const rejected = compileCaseDocumentRevisionV4(current.artifacts, current.system);
  assert.equal(rejected.status, 'need_revision');
  assert.equal(rejected.stage, 'case_drafts');

  const old = v4GeneralQualityFixture();
  for (const artifact of Object.values(old.artifacts)) artifact.schema_version = '4.2.0';
  delete old.artifacts.behavior_views.design_assurance;
  delete old.artifacts.case_drafts.independent_review;
  assert.equal(compileCaseDocumentRevisionV4(old.artifacts, old.system).status, 'compiled');
});

test('AT24: review binds the materialized relative-baseline Case that is actually delivered', () => {
  const fixture = v4GeneralQualityFixture();
  const claim = fixture.artifacts.evidence_claims.claims[0];
  claim.semantic_value.relative_baseline_assertions = [{
    reference: '当前线上', comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    }
  }];
  fixture.artifacts.case_drafts.cases[0].baseline_spec = {
    baseline_id: 'BASELINE-current-production', kind: 'declared_reference',
    acquisition: 'capture_at_execution', reference: '当前线上',
    comparison_contract: {
      kind: 'all_observable_behavior_except', exceptions: ['新增结算状态']
    },
    claim_ids: [claim.claim_id]
  };
  fixture.system = deriveV4SystemContext(fixture.artifacts);

  const rawReviewDigest = fixture.artifacts.case_drafts.independent_review.review_target_digest;
  const first = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(first.status, 'need_revision', JSON.stringify(first));
  assert.equal(first.diagnostics[0].code, 'INDEPENDENT_REVIEW_TARGET_MISMATCH');
  assert.notEqual(first.review_request.review_target_digest, rawReviewDigest);
  assert.equal(first.review_request.review_target_projection.cases[0].steps.length, 4);

  fixture.artifacts.case_drafts.independent_review = completedReviewFromRequest(first, fixture);
  const compiled = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(compiled.status, 'compiled', JSON.stringify(compiled));
  assert.deepEqual(
    compiled.bundle.cases[0].steps,
    first.review_request.review_target_projection.cases[0].steps
  );
  assert.deepEqual(
    compiled.bundle.cases[0].oracles,
    first.review_request.review_target_projection.cases[0].oracles
  );
});
