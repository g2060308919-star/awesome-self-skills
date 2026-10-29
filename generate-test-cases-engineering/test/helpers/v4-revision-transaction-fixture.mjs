import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { materializeCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { canonicalArtifactSnapshot, canonicalStringify, digest } from '../../src/canonical.mjs';
import {
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  constructSemanticClarificationEventV4
} from '../../src/clarification-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { compileIndependentReviewTargetV4 } from '../../src/independent-review-v4.mjs';
import { materializeRelativeBaselinesV4 } from '../../src/relative-baseline-materialization-v4.mjs';
import { deriveV4CaseSemanticContext } from '../../src/v4-system-context.mjs';
import { bindGeneralQualityFixture } from './v4-general-quality-fixture.mjs';
import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';
import { RELIABILITY_V4_CONTRACT, isGeneralQualityV4Contract } from '../../src/v4-contract.mjs';

/** @param {unknown} value */
export const sha = (value) => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
/** @param {string|Uint8Array} value */
export const byteDigest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** @param {(directory:string)=>Promise<any>} callback */
export async function withRun(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-revision-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** @param {(directory:string)=>Promise<any>} callback */
export async function withCatalog(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-catalog-'));
  await mkdir(path.join(directory, 'runs'), { recursive: true });
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** @param {any} value */
const json = (value) => ({ format: 'json', value });
/** @param {string} value */
const text = (value) => ({ format: 'text', text: value });

/** @param {any} value */
const clone = (value) => structuredClone(value);

/** @param {number} index @param {any} evidence */
function semanticGap(index, evidence) {
  return {
    category: 'semantic_gap', code: `OUTCOME_RULE_${index + 1}`,
    subject_fact_ids: [`FACT-optional-${index + 1}`],
    missing_aspect: `optional explanation ${index + 1}`, scope_ref: `checkout/rule-${index + 1}`,
    question: `规则 ${index + 1} 的预期结果是什么？`,
    why_needed: '该可选补充说明独立于已知主要验收结果。',
    decision_impact: '答案会补充可选说明。',
    unresolved_outcome: '可选补充说明保持未决。',
    answer_options: ['确定结果'], risk_level: 'high',
    source_claim_ids: [`CLM-optional-${index + 1}`],
    discovery_phase: 'pre_case', affected_test_point_ids: [],
    acceptance_impact: {classification:'noncritical',criteria:['does_not_change_required_acceptance'],rationale:'该事务夹具只跟踪补充说明，已确定的主要验收结果不依赖它。'}
  };
}

/** @param {any} sourcePack @param {any} evidence @param {string} runId @param {number} revision @param {Uint8Array} baseBytes */
function initialCheckpoint(sourcePack, evidence, runId, revision, baseBytes, /** @type {any} */ contract) {
  const expected = sourcePack.sources.flatMap((/** @type {any} */ source) =>
    source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id));
  const reviewed = sourcePack.source_reviews.flatMap((/** @type {any} */ review) =>
    review.units.map((/** @type {any} */ unit) => unit.unit_id));
  return compileSemanticClarificationCheckpointV4({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, committed_revision: revision, committed_checkpoint_bytes: baseBytes,
    discovery_phase: 'pre_case',
    source_review_witness: { expected_unit_ids: expected, reviewed_unit_ids: reviewed },
    fact_ledger_digest: `sha256:${digest(evidence.fact_ledger)}`,
    scope_manifest_digest: `sha256:${digest(evidence.scope_manifest)}`,
    behavior_views_digest: null, case_drafts_digest: null,
    facts: evidence.fact_ledger, claims: evidence.claims,
    diagnostic_candidates: evidence.semantic_gaps, prior_checkpoint: null
  }).checkpoint;
}

/** @param {any} checkpoint @param {number} count */
function resolveCheckpointRoots(checkpoint, count) {
  let current = checkpoint;
  /** @type {any[]} */
  let decisions = [];
  /** @type {any[]} */
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const presentation = current.clarification_state.presentation;
    const part = presentation?.question_parts[0];
    if (!presentation || !part) throw new TypeError('REVISION_FIXTURE_ROOT_MISSING');
    const message = '确定结果';
    const messageDigest = sha(message);
    const event = constructSemanticClarificationEventV4(
      presentation, part, 'answer_question_part', {
        answer: message, authority: 'product_final', resolution: 'final',
        answer_origin: {
          type: 'authorized_confirmation', presentation_id: presentation.presentation_id,
          message_digest: messageDigest,
          answer_span: { start_scalar: 0, end_scalar: 4, excerpt_digest: messageDigest }
        }
      }
    );
    const applied = applySemanticClarificationEventsV4({
      checkpoint: current, clarification_events: [event], existing_decisions: decisions,
      presentation_history: [], normalized_user_messages: [message],
      previous_obligations_by_root: [], current_obligations_by_root: []
    });
    current = applied.checkpoint;
    decisions = applied.decisions;
    events.push(event);
  }
  return { checkpoint: current, decisions, events };
}

/**
 * @param {'pre_case_pending'|'post_case_pending'|'final'} profile
 * @param {number} revision
 * @param {any} [options]
 * @returns {Record<string,any>}
 */
export function revisionArtifacts(profile, revision, options = {}) {
  const runId = options.run_id ?? 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const contract = options.contract ?? RELIABILITY_V4_CONTRACT;
  const fixture = v4PipelineFixture();
  const sourcePack = clone(fixture.artifacts.source_pack);
  const evidence = clone(fixture.artifacts.evidence_claims);
  const behaviorViews = clone(fixture.artifacts.behavior_views);
  const caseDrafts = clone(fixture.artifacts.case_drafts);
  for (const artifact of [sourcePack, evidence, behaviorViews, caseDrafts]) {
    artifact.schema_version = contract.schema_version;
    artifact.source_revision = revision;
  }
  sourcePack.run_instance_id = runId;
  if (isGeneralQualityV4Contract(contract)) bindGeneralQualityFixture({
    artifacts: {
      source_pack: sourcePack, evidence_claims: evidence,
      behavior_views: behaviorViews, case_drafts: caseDrafts
    },
    system: fixture.system
  }, contract.schema_version);

  // Compile the Case Document before the optional semantic-root audit fixture
  // is added. The latter is resolved before final delivery and exists only to
  // exercise reopen/suspension durability.
  const compiled = compileCaseDocumentRevisionV4(
    { source_pack: sourcePack, evidence_claims: evidence, behavior_views: behaviorViews, case_drafts: caseDrafts },
    fixture.system
  );
  if (compiled.status !== 'compiled') throw new TypeError('REVISION_FIXTURE_COMPILE_FAILED');

  const gapCount = options.semantic_gap_count ?? (options.semantic_root ? 1 : 0);
  // Protocol-only optional roots need distinct ambiguous write targets. They
  // cannot reuse the known acceptance Fact or supersede its Claim.
  for (let index = 0; index < gapCount; index += 1) {
    const claimId = `CLM-optional-${index + 1}`;
    const claim = clone(evidence.claims[0]);
    claim.claim_id = claimId;
    delete claim.semantic_value.behavior_assertions;
    evidence.claims.push(claim);
    evidence.fact_ledger.push({ ...clone(evidence.fact_ledger[0]),
      fact_id: `FACT-optional-${index + 1}`, status: 'ambiguous', claim_ids: [claimId] });
  }
  evidence.semantic_gaps = Array.from({ length: gapCount }, (_, index) => semanticGap(index, evidence));
  Object.assign(evidence, canonicalArtifactSnapshot(evidence));
  if (gapCount > 0 && profile !== 'pre_case_pending' && isGeneralQualityV4Contract(contract)) {
    // Protocol simulation only: the added Facts change the review projection.
    // Bind this synthetic completion to the final fixture content, without
    // treating it as a real source-first business review or changing Case IDs.
    const semantic = deriveV4CaseSemanticContext(evidence);
    const materialized = materializeRelativeBaselinesV4(
      caseDrafts.cases, semantic.semantic_evidence, semantic.claim_assessments
    );
    if (materialized.diagnostics.length) throw new TypeError('REVISION_FIXTURE_REVIEW_CASES_INVALID');
    const reviewTarget = compileIndependentReviewTargetV4({
      source_revision: revision,
      source_first_targets: caseDrafts.independent_review.source_first_targets,
      facts: evidence.fact_ledger, views: behaviorViews.views,
      formal_test_points: compiled.obligations.formal_test_points,
      candidate_responsibilities: behaviorViews.design_assurance.candidate_responsibilities,
      cases: materialized.cases
    });
    caseDrafts.independent_review.source_first_targets = reviewTarget.projection.source_first_targets;
    caseDrafts.independent_review.review_target_digest = reviewTarget.digest;
    caseDrafts.independent_review.reviewer_identity.separation_basis =
      'Protocol-only transaction fixture; no real independent business review is asserted.';
    for (const assessment of caseDrafts.independent_review.target_assessments) {
      assessment.rationale = 'Protocol-only review binding for reopen and transaction recovery tests.';
    }
    compiled.bundle.independent_review_summary.review_target_digest = reviewTarget.digest;
  }
  const genesis = `${canonicalStringify({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, genesis: true
  })}\n`;
  const baseBytes = new TextEncoder().encode(options.base_checkpoint_text ?? genesis);
  let checkpoint = initialCheckpoint(sourcePack, evidence, runId, revision, baseBytes, contract);
  const resolveCount = options.resolved_gap_count
    ?? (profile === 'pre_case_pending' ? 0 : gapCount);
  const resolved = resolveCheckpointRoots(checkpoint, resolveCount);
  checkpoint = resolved.checkpoint;
  sourcePack.decision_records = resolved.decisions;
  sourcePack.clarification_events = resolved.events;
  if (profile !== 'pre_case_pending') {
    checkpoint = compileSemanticClarificationCheckpointV4({
      schema_version: contract.schema_version, compiler_version: contract.compiler_version,
      run_id: runId, committed_revision: revision, committed_checkpoint_bytes: baseBytes,
      discovery_phase: 'post_case', source_review_witness: checkpoint.source_review_witness,
      fact_ledger_digest: `sha256:${digest(evidence.fact_ledger)}`,
      scope_manifest_digest: `sha256:${digest(evidence.scope_manifest)}`,
      behavior_views_digest: `sha256:${digest(behaviorViews)}`,
      case_drafts_digest: `sha256:${digest(caseDrafts)}`,
      facts: evidence.fact_ledger, claims: evidence.claims,
      diagnostic_candidates: [], prior_checkpoint: checkpoint
    }).checkpoint;
  }
  if (profile === 'final') checkpoint.commit_profile = 'final';

  const base = {
    source_pack: json(sourcePack),
    decision_journal: json({
      schema_version: contract.schema_version, source_revision: revision,
      decisions: clone(sourcePack.decision_records)
    }),
    evidence_claims: json(evidence),
    fact_ledger: json({
      schema_version: contract.schema_version, source_revision: revision,
      facts: clone(evidence.fact_ledger)
    }),
    scope_manifest: json({
      schema_version: contract.schema_version, source_revision: revision,
      ...clone(evidence.scope_manifest)
    }),
    clarification_state: json({
      schema_version: contract.schema_version, source_revision: revision,
      ...clone(checkpoint.clarification_state)
    }),
    checkpoint: json(checkpoint)
  };
  if (profile === 'post_case_pending' || profile === 'final') Object.assign(base, {
    behavior_views: json(behaviorViews),
    test_obligations: json(compiled.obligations),
    case_drafts: json(caseDrafts)
  });
  if (profile === 'final') {
    const sourceReading = {
      version: '1.0.0', source_binding_digest: sha(`source-binding-${revision}`),
      scope: {
        mode: 'provided_materials', root_ref: 'provided:revision-fixture',
        collection_window: { started_at: '2026-09-09T00:00:00.000Z', ended_at: '2026-09-09T00:00:01.000Z' },
        source_version: sourcePack.sources[0]?.version ?? null
      },
      status: 'complete_within_scope',
      items: [{
        item_id: 'provided-body', parent_item_id: null, channel: 'body',
        acquisition_status: 'acquired', review_status: 'reviewed',
        source_id: sourcePack.sources[0]?.source_id ?? null, asset_id: null
      }],
      limitations: []
    };
    const delivery = /** @type {any} */ (materializeCaseDocumentDeliveryV4({
      run_id: runId, completed_at: '2026-09-09T00:00:00.000Z',
      bundle: compiled.bundle,
      ...(contract.candidate ? { source_reading: sourceReading } : {}),
      render_options: { include_audit_appendix: false },
      non_blocking_diagnostics: []
    }));
    Object.assign(base, {
      bundle: json(JSON.parse(delivery.bundle_bytes)),
      markdown: text(delivery.markdown_bytes),
      worksheet: text(delivery.worksheet_bytes),
      ...(contract.candidate ? {
        html: text(delivery.html_bytes), table: text(delivery.table_bytes),
        source_reading: json(JSON.parse(delivery.source_reading_bytes))
      } : {}),
      manifest: json(delivery.manifest)
    });
  }
  return base;
}

/**
 * @param {'pre_case_pending'|'post_case_pending'|'final'} profile
 * @param {number|null} baseRevision
 * @param {number} candidateRevision
 * @param {any} [options]
 */
export function appendRequest(profile, baseRevision, candidateRevision, options = {}) {
  return {
    append_id: options.append_id ?? `APPEND-${candidateRevision}`,
    append_digest: options.append_digest ?? sha(`append-${candidateRevision}`),
    base_revision: baseRevision,
    candidate_revision: candidateRevision,
    commit_profile: profile,
    semantic_digest: options.semantic_digest ?? sha(`semantic-${candidateRevision}`),
    artifacts: options.artifacts ?? revisionArtifacts(profile, candidateRevision, options),
    ...(options.repair_pending ? { repair_pending: true } : {})
  };
}

/** @param {string} file */
export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}
