import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { materializeCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import {
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  constructSemanticClarificationEventV4
} from '../../src/clarification-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';

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
    subject_fact_ids: [evidence.fact_ledger[0].fact_id],
    missing_aspect: `expected outcome ${index + 1}`, scope_ref: `checkout/rule-${index + 1}`,
    question: `规则 ${index + 1} 的预期结果是什么？`,
    why_needed: '该口径决定业务验收结果。',
    decision_impact: '答案会改变对应测试用例的预期。',
    unresolved_outcome: '该业务结果无法进入最终验收。',
    answer_options: ['确定结果'], risk_level: 'high',
    source_claim_ids: [evidence.claims[0].claim_id],
    discovery_phase: 'pre_case', affected_test_point_ids: []
  };
}

/** @param {any} sourcePack @param {any} evidence @param {string} runId @param {number} revision @param {Uint8Array} baseBytes */
function initialCheckpoint(sourcePack, evidence, runId, revision, baseBytes) {
  const expected = sourcePack.sources.flatMap((/** @type {any} */ source) =>
    source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id));
  const reviewed = sourcePack.source_reviews.flatMap((/** @type {any} */ review) =>
    review.units.map((/** @type {any} */ unit) => unit.unit_id));
  return compileSemanticClarificationCheckpointV4({
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
  const fixture = v4PipelineFixture();
  const sourcePack = clone(fixture.artifacts.source_pack);
  const evidence = clone(fixture.artifacts.evidence_claims);
  const behaviorViews = clone(fixture.artifacts.behavior_views);
  const caseDrafts = clone(fixture.artifacts.case_drafts);
  for (const artifact of [sourcePack, evidence, behaviorViews, caseDrafts]) {
    artifact.source_revision = revision;
  }
  sourcePack.run_instance_id = runId;

  // Compile the Case Document before the optional semantic-root audit fixture
  // is added. The latter is resolved before final delivery and exists only to
  // exercise reopen/suspension durability.
  const compiled = compileCaseDocumentRevisionV4(
    { source_pack: sourcePack, evidence_claims: evidence, behavior_views: behaviorViews, case_drafts: caseDrafts },
    fixture.system
  );
  if (compiled.status !== 'compiled') throw new TypeError('REVISION_FIXTURE_COMPILE_FAILED');

  const gapCount = options.semantic_gap_count ?? (options.semantic_root ? 1 : 0);
  evidence.semantic_gaps = Array.from({ length: gapCount }, (_, index) => semanticGap(index, evidence));
  const genesis = `${canonicalStringify({
    schema_version: '4.0.0', compiler_version: '0.5.0', run_id: runId, genesis: true
  })}\n`;
  const baseBytes = new TextEncoder().encode(options.base_checkpoint_text ?? genesis);
  let checkpoint = initialCheckpoint(sourcePack, evidence, runId, revision, baseBytes);
  const resolveCount = options.resolved_gap_count
    ?? (profile === 'pre_case_pending' ? 0 : gapCount);
  const resolved = resolveCheckpointRoots(checkpoint, resolveCount);
  checkpoint = resolved.checkpoint;
  sourcePack.decision_records = resolved.decisions;
  sourcePack.clarification_events = resolved.events;
  if (profile !== 'pre_case_pending') {
    checkpoint = compileSemanticClarificationCheckpointV4({
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
      schema_version: '4.0.0', source_revision: revision,
      decisions: clone(sourcePack.decision_records)
    }),
    evidence_claims: json(evidence),
    fact_ledger: json({
      schema_version: '4.0.0', source_revision: revision,
      facts: clone(evidence.fact_ledger)
    }),
    scope_manifest: json({
      schema_version: '4.0.0', source_revision: revision,
      ...clone(evidence.scope_manifest)
    }),
    clarification_state: json({
      schema_version: '4.0.0', source_revision: revision,
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
    const delivery = materializeCaseDocumentDeliveryV4({
      run_id: runId, completed_at: '2026-09-09T00:00:00.000Z',
      bundle: compiled.bundle, render_options: { include_audit_appendix: false },
      non_blocking_diagnostics: []
    });
    Object.assign(base, {
      bundle: json(JSON.parse(delivery.bundle_bytes)),
      markdown: text(delivery.markdown_bytes),
      worksheet: text(delivery.worksheet_bytes),
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
