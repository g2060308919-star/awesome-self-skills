import { createHash } from 'node:crypto';

import checkpointSchema from '../skill/generate-test-cases/scripts/schemas/checkpoint.schema.json' with { type: 'json' };
import presentationSchema from '../skill/generate-test-cases/scripts/schemas/presentation.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import {
  compileSemanticDecisionV4,
  normalizeDecisionMessageV4
} from './decision-record.mjs';
import { sortNonBlockingDiagnosticsV4 } from './non-blocking-diagnostics-v4.mjs';
import {
  canonicalStringSetV4,
  canonicalTextV4,
  compareUnicodeScalar,
  compileSemanticGapRootsV4,
  sha256CanonicalV4
} from './semantic-gaps-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const ACTIONS = Object.freeze([
  'answer_question_part',
  'defer_question_part',
  'mark_question_unknown',
  'request_delivery'
]);
const RESOLVED_ROOT_STATES = new Set(['resolved_final', 'resolved_temporary']);
const TERMINAL_ROOT_STATES = new Set([
  ...RESOLVED_ROOT_STATES, 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery', 'obsolete'
]);
const ROOT_STATES = new Set(['presented', ...TERMINAL_ROOT_STATES]);
const MIGRATION_INITIAL_ROOT_STATES = new Set([
  'presented', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery'
]);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RISK_RANK = new Map([['critical', 0], ['high', 1], ['medium', 2], ['low', 3]]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} code */
function requireDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new TypeError(code);
  return value;
}

/** @param {unknown} bytes */
function exactByteDigest(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('COMMITTED_CHECKPOINT_BYTES_REQUIRED');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {string[]} left @param {string[]} right */
function sameStringSet(left, right) {
  return canonicalStringify([...left].sort(compareUnicodeScalar)) === canonicalStringify([...right].sort(compareUnicodeScalar));
}

/** @param {any} left @param {any} right */
function compareSemanticRoots(left, right) {
  return (RISK_RANK.get(left.risk_level) ?? 4) - (RISK_RANK.get(right.risk_level) ?? 4)
    || compareUnicodeScalar(left.scope_ref, right.scope_ref)
    || compareUnicodeScalar(left.missing_aspect, right.missing_aspect)
    || compareUnicodeScalar(left.root_issue_id, right.root_issue_id);
}

/** @param {any} root */
function publicRoot(root) {
  return {
    semantic_gap_id: root.semantic_gap_id,
    root_issue_id: root.root_issue_id,
    root_version_digest: root.root_version_digest,
    question_part_id: root.question_part_id,
    subject_fact_ids: [...root.subject_fact_ids],
    missing_aspect: root.missing_aspect,
    scope_ref: root.scope_ref,
    code: root.code,
    question: root.question,
    why_needed: root.why_needed,
    decision_impact: root.decision_impact,
    unresolved_outcome: root.unresolved_outcome,
    answer_options: [...root.answer_options],
    risk_level: root.risk_level,
    source_claim_ids: [...root.source_claim_ids],
    affected_test_point_ids: [...root.affected_test_point_ids],
    affected_facts: [...root.affected_facts],
    discovery_phase: root.discovery_phase
  };
}

/** @param {any} root @param {string} presentationId */
function questionPart(root, presentationId) {
  return {
    question_part_id: root.question_part_id,
    root_issue_id: root.root_issue_id,
    root_version_digest: root.root_version_digest,
    question: root.question,
    why_needed: root.why_needed,
    decision_impact: root.decision_impact,
    unresolved_outcome: root.unresolved_outcome,
    affected_facts: [...root.affected_facts],
    answer_options: [...root.answer_options],
    risk_level: root.risk_level,
    available_actions: [...ACTIONS],
    action_context: {
      presentation_id: presentationId,
      question_part_id: root.question_part_id,
      root_issue_id: root.root_issue_id,
      root_version_digest: root.root_version_digest
    }
  };
}

/**
 * @param {{run_id:string,committed_revision:number,committed_checkpoint_digest:string,phase:string,
 * supersedes_presentation_id:string|null,answered_part_ids:string[],roots:any[]}} input
 */
function buildPresentation(input) {
  const remaining = input.roots.map((root) => root.question_part_id).sort(compareUnicodeScalar);
  const cycleDigest = sha256CanonicalV4(input.roots.map((root) => ({
    root_issue_id: root.root_issue_id,
    root_version_digest: root.root_version_digest,
    question_part_id: root.question_part_id
  })));
  const identity = {
    run_id: input.run_id,
    committed_revision: input.committed_revision,
    committed_checkpoint_digest: input.committed_checkpoint_digest,
    phase: input.phase,
    cycle_digest: cycleDigest,
    supersedes_presentation_id: input.supersedes_presentation_id
  };
  const presentationId = `PRES-${sha256CanonicalV4(identity).slice('sha256:'.length)}`;
  return {
    schema_version: '4.0.0',
    presentation_id: presentationId,
    phase: input.phase,
    supersedes_presentation_id: input.supersedes_presentation_id,
    answered_part_ids: [...input.answered_part_ids].sort(compareUnicodeScalar),
    remaining_part_ids: remaining,
    cycle_digest: cycleDigest,
    run_actions: ['cancel_run'],
    recovery: {
      mode: 'append_clarification_event',
      run_id: input.run_id,
      committed_revision: input.committed_revision,
      committed_checkpoint_digest: input.committed_checkpoint_digest,
      after_partial_answer: 'issue_successor_for_remaining_parts'
    },
    question_parts: input.roots.map((root) => questionPart(root, presentationId))
  };
}

/** @param {Record<string, unknown>} event */
function identifiedEvent(event) {
  return {
    event_id: `EVENT-${sha256CanonicalV4(event).slice('sha256:'.length)}`,
    ...event
  };
}

/** @param {any} event */
function hasCanonicalEventIdentity(event) {
  if (!isRecord(event) || typeof event.event_id !== 'string') return false;
  const body = { ...event };
  delete body.event_id;
  return event.event_id === `EVENT-${sha256CanonicalV4(body).slice('sha256:'.length)}`;
}

/** @param {any} checkpoint @param {string|null} supersedesPresentationId */
function refreshCheckpointPresentation(checkpoint, supersedesPresentationId) {
  const ledger = new Map(checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => [root.root_issue_id, root]));
  const remainingRoots = checkpoint.clarification_state.root_states
    .filter((/** @type {any} */ state) => state.status === 'presented')
    .map((/** @type {any} */ state) => ledger.get(state.root_issue_id))
    .filter(Boolean)
    .sort(compareSemanticRoots);
  const answered = checkpoint.clarification_state.root_states
    .filter((/** @type {any} */ state) => RESOLVED_ROOT_STATES.has(state.status))
    .map((/** @type {any} */ state) => state.question_part_id).sort(compareUnicodeScalar);
  const closed = checkpoint.clarification_state.root_states
    .filter((/** @type {any} */ state) => state.status === 'closed_for_delivery')
    .map((/** @type {any} */ state) => state.question_part_id).sort(compareUnicodeScalar);
  const presentation = remainingRoots.length > 0 ? buildPresentation({
    run_id: checkpoint.run_id,
    committed_revision: checkpoint.revision,
    committed_checkpoint_digest: checkpoint.base_checkpoint_digest,
    phase: checkpoint.commit_profile === 'pre_case_pending' ? 'requirements_analysis' : 'case_design',
    supersedes_presentation_id: supersedesPresentationId,
    answered_part_ids: answered,
    roots: remainingRoots
  }) : null;
  checkpoint.clarification_state.answered_part_ids = answered;
  checkpoint.clarification_state.remaining_part_ids = presentation?.remaining_part_ids ?? [];
  checkpoint.clarification_state.closed_for_delivery_part_ids = closed;
  checkpoint.clarification_state.presentation = presentation;
  checkpoint.clarification_state.presentation_digest = presentation ? sha256CanonicalV4(presentation) : null;
  checkpoint.clarification_state.latest_presentation_id = presentation?.presentation_id ?? supersedesPresentationId;
  checkpoint.clarification_state.cycle_digest = presentation?.cycle_digest ?? sha256CanonicalV4([]);
  return presentation;
}

/** @param {unknown} checkpoint */
function assertCheckpoint(checkpoint) {
  const diagnostics = validateSemanticClarificationCheckpointV4(checkpoint);
  if (diagnostics.length) throw new TypeError(diagnostics[0].code);
  return /** @type {any} */ (checkpoint);
}

/**
 * Build the pre-case or post-case semantic clarification checkpoint. Reality
 * resources are intentionally absent from this interface.
 *
 * @param {unknown} submitted
 */
export function compileSemanticClarificationCheckpointV4(submitted) {
  if (!isRecord(submitted)) throw new TypeError('CLARIFICATION_INPUT_INVALID');
  const runId = canonicalTextV4(submitted.run_id, 'CLARIFICATION_RUN_INVALID');
  const revision = submitted.committed_revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new TypeError('CLARIFICATION_REVISION_INVALID');
  const discoveryPhase = submitted.discovery_phase;
  if (discoveryPhase !== 'pre_case' && discoveryPhase !== 'post_case') throw new TypeError('CLARIFICATION_PHASE_INVALID');
  const sourceWitness = submitted.source_review_witness;
  if (!isRecord(sourceWitness)) throw new TypeError('SOURCE_REVIEW_INCOMPLETE');
  const expectedUnitIds = canonicalStringSetV4(sourceWitness.expected_unit_ids, 'SOURCE_REVIEW_INCOMPLETE', false);
  const reviewedUnitIds = canonicalStringSetV4(sourceWitness.reviewed_unit_ids, 'SOURCE_REVIEW_INCOMPLETE', false);
  if (expectedUnitIds.length === 0 || !sameStringSet(expectedUnitIds, reviewedUnitIds)) throw new TypeError('SOURCE_REVIEW_INCOMPLETE');
  const factLedgerDigest = requireDigest(submitted.fact_ledger_digest, 'FACT_LEDGER_INCOMPLETE');
  const scopeManifestDigest = requireDigest(submitted.scope_manifest_digest, 'SCOPE_MANIFEST_INCOMPLETE');
  const behaviorViewsDigest = submitted.behavior_views_digest;
  const caseDraftsDigest = submitted.case_drafts_digest;
  if (discoveryPhase === 'pre_case' && (behaviorViewsDigest !== null || caseDraftsDigest !== null)) {
    throw new TypeError('PRE_CASE_ARTIFACT_ORDER_INVALID');
  }
  if (discoveryPhase === 'post_case' && (!DIGEST.test(String(behaviorViewsDigest)) || !DIGEST.test(String(caseDraftsDigest)))) {
    throw new TypeError('POST_CASE_ARTIFACT_ORDER_INVALID');
  }
  const committedCheckpointDigest = exactByteDigest(submitted.committed_checkpoint_bytes);
  const currentRoots = compileSemanticGapRootsV4({
    facts: submitted.facts,
    claims: submitted.claims,
    diagnostic_candidates: submitted.diagnostic_candidates,
    discovery_phase: discoveryPhase
  });

  let prior = null;
  if (submitted.prior_checkpoint !== null) {
    prior = assertCheckpoint(submitted.prior_checkpoint);
    if (prior.run_id !== runId) throw new TypeError('CLARIFICATION_RUN_MISMATCH');
  }
  if (discoveryPhase === 'post_case' && !prior) throw new TypeError('POST_CASE_PRIOR_CHECKPOINT_REQUIRED');

  /** A migration seed is compiler-owned input used only while creating the
   * first pre-case checkpoint. It preserves proven v3 lifecycle intent, but
   * every referenced root still has to be reproduced by fresh v4 semantic
   * analysis before the disposition can be applied. */
  const initialRootDispositions = new Map();
  if (submitted.initial_root_dispositions !== undefined) {
    if (prior || discoveryPhase !== 'pre_case'
      || !Array.isArray(submitted.initial_root_dispositions)) {
      throw new TypeError('MIGRATION_ROOT_DISPOSITIONS_INVALID');
    }
    for (const disposition of submitted.initial_root_dispositions) {
      if (!isRecord(disposition)
        || Object.keys(disposition).length !== 2
        || typeof disposition.root_issue_id !== 'string'
        || typeof disposition.status !== 'string'
        || !MIGRATION_INITIAL_ROOT_STATES.has(disposition.status)
        || initialRootDispositions.has(disposition.root_issue_id)) {
        throw new TypeError('MIGRATION_ROOT_DISPOSITIONS_INVALID');
      }
      initialRootDispositions.set(disposition.root_issue_id, disposition.status);
    }
    const currentRootIds = new Set(currentRoots.map((root) => root.root_issue_id));
    for (const rootId of initialRootDispositions.keys()) {
      if (!currentRootIds.has(rootId)) throw new TypeError('MIGRATION_ROOT_REANALYSIS_MISMATCH');
    }
  }

  /** @type {Map<string, any>} */
  const ledger = new Map();
  /** @type {Map<string, any>} */
  const stateByRoot = new Map();
  for (const root of prior?.semantic_gap_ledger ?? []) ledger.set(root.root_issue_id, structuredClone(root));
  for (const state of prior?.clarification_state.root_states ?? []) stateByRoot.set(state.root_issue_id, structuredClone(state));
  for (const root of currentRoots) {
    const state = stateByRoot.get(root.root_issue_id);
    if (state && TERMINAL_ROOT_STATES.has(state.status)) continue;
    const nextRoot = publicRoot(root);
    ledger.set(root.root_issue_id, nextRoot);
    stateByRoot.set(root.root_issue_id, {
      root_issue_id: root.root_issue_id,
      root_version_digest: root.root_version_digest,
      question_part_id: root.question_part_id,
      status: initialRootDispositions.get(root.root_issue_id) ?? 'presented'
    });
  }

  const pendingRoots = [...stateByRoot.values()]
    .filter((state) => state.status === 'presented')
    .map((state) => ledger.get(state.root_issue_id))
    .filter(Boolean)
    .sort(compareSemanticRoots);
  const answered = [...stateByRoot.values()]
    .filter((state) => RESOLVED_ROOT_STATES.has(state.status))
    .map((state) => state.question_part_id).sort(compareUnicodeScalar);
  const previousPresentationId = prior?.clarification_state.latest_presentation_id ?? null;
  const phase = discoveryPhase === 'pre_case' ? 'requirements_analysis' : 'case_design';
  const candidatePresentation = pendingRoots.length > 0 ? buildPresentation({
    run_id: runId,
    committed_revision: Number(revision),
    committed_checkpoint_digest: committedCheckpointDigest,
    phase,
    supersedes_presentation_id: previousPresentationId,
    answered_part_ids: answered,
    roots: pendingRoots
  }) : null;
  const presentation = prior?.clarification_state.presentation
    && prior.clarification_state.presentation.phase === phase
    && prior.clarification_state.presentation.cycle_digest === candidatePresentation?.cycle_digest
    && sameStringSet(prior.clarification_state.presentation.answered_part_ids, answered)
    && prior.clarification_state.presentation.recovery.committed_checkpoint_digest === committedCheckpointDigest
    && prior.clarification_state.presentation.recovery.committed_revision === revision
    ? structuredClone(prior.clarification_state.presentation)
    : candidatePresentation;
  const remaining = presentation?.remaining_part_ids ?? [];
  const rootStates = [...stateByRoot.values()].sort((left, right) => compareUnicodeScalar(left.root_issue_id, right.root_issue_id));
  const closed = [...stateByRoot.values()]
    .filter((state) => state.status === 'closed_for_delivery')
    .map((state) => state.question_part_id).sort(compareUnicodeScalar);
  const reopenOverlay = prior && Object.hasOwn(prior, 'reopened_targets')
    ? {
        reopened_targets: structuredClone(prior.reopened_targets),
        decision_suspension_ledger: structuredClone(prior.decision_suspension_ledger),
        decision_reopen_overlay_digest: prior.decision_reopen_overlay_digest
      }
    : {};
  const checkpoint = {
    schema_version: '4.0.0',
    compiler_version: '0.5.0',
    run_id: runId,
    revision: Number(revision),
    commit_profile: discoveryPhase === 'pre_case' ? 'pre_case_pending' : 'post_case_pending',
    source_review_witness: { expected_unit_ids: expectedUnitIds, reviewed_unit_ids: reviewedUnitIds },
    fact_ledger_digest: factLedgerDigest,
    scope_manifest_digest: scopeManifestDigest,
    behavior_views_digest: discoveryPhase === 'pre_case' ? null : behaviorViewsDigest,
    case_drafts_digest: discoveryPhase === 'pre_case' ? null : caseDraftsDigest,
    base_checkpoint_digest: committedCheckpointDigest,
    ...reopenOverlay,
    semantic_gap_ledger: [...ledger.values()].sort((left, right) => compareUnicodeScalar(left.root_issue_id, right.root_issue_id)),
    clarification_state: {
      root_states: rootStates,
      answered_part_ids: answered,
      remaining_part_ids: [...remaining],
      closed_for_delivery_part_ids: closed,
      cycle_digest: presentation?.cycle_digest ?? sha256CanonicalV4([]),
      latest_presentation_id: presentation?.presentation_id ?? previousPresentationId,
      presentation,
      presentation_digest: presentation ? sha256CanonicalV4(presentation) : null
    }
  };
  const diagnostics = validateSemanticClarificationCheckpointV4(checkpoint);
  if (diagnostics.length) throw new TypeError(diagnostics[0].code);
  return {
    status: presentation ? 'need_user_answers' : 'clarification_complete',
    committed_revision: Number(revision),
    presentation,
    checkpoint
  };
}

/**
 * Cross-field validation that JSON Schema cannot express: recovery bytes,
 * action context equality and exact cycle membership.
 * @param {unknown} submitted
 * @param {{committed_checkpoint_bytes?:Uint8Array}} [context]
 */
export function validateSemanticPresentationV4(submitted, context = {}) {
  const diagnostics = validateAgainstSchema(submitted, presentationSchema).map((item) => ({
    code: 'PRESENTATION_SCHEMA_INVALID', path: item.path, message: item.message
  }));
  if (!isRecord(submitted) || submitted.schema_version !== '4.0.0') {
    diagnostics.push({ code: 'V4_PRESENTATION_REQUIRED', path: '/schema_version', message: 'v4 semantic presentation required' });
    return diagnostics;
  }
  const presentation = /** @type {any} */ (submitted);
  const seen = new Set();
  for (let index = 0; index < (Array.isArray(presentation.question_parts) ? presentation.question_parts.length : 0); index += 1) {
    const part = presentation.question_parts[index];
    if (!isRecord(part)) continue;
    if (seen.has(part.question_part_id)) diagnostics.push({
      code: 'QUESTION_PART_DUPLICATE', path: `/question_parts/${index}`, message: 'question parts must be unique'
    });
    seen.add(part.question_part_id);
    const expected = {
      presentation_id: presentation.presentation_id,
      question_part_id: part.question_part_id,
      root_issue_id: part.root_issue_id,
      root_version_digest: part.root_version_digest
    };
    if (canonicalStringify(part.action_context) !== canonicalStringify(expected)) diagnostics.push({
      code: 'ACTION_CONTEXT_MISMATCH', path: `/question_parts/${index}/action_context`, message: 'action context must equal outer stable refs'
    });
  }
  const expectedRemaining = [...seen].sort(compareUnicodeScalar);
  if (!sameStringSet(presentation.remaining_part_ids ?? [], expectedRemaining)) diagnostics.push({
    code: 'PRESENTATION_REMAINING_MISMATCH', path: '/remaining_part_ids', message: 'remaining IDs must equal question parts'
  });
  if (context.committed_checkpoint_bytes) {
    const expected = exactByteDigest(context.committed_checkpoint_bytes);
    if (presentation.recovery?.committed_checkpoint_digest !== expected) diagnostics.push({
      code: 'STALE_RECOVERY_DIGEST', path: '/recovery/committed_checkpoint_digest', message: 'recovery digest is stale'
    });
  }
  return diagnostics;
}

/** @param {unknown} submitted */
export function validateSemanticClarificationCheckpointV4(submitted) {
  const schemaDiagnostics = validateAgainstSchema(submitted, checkpointSchema);
  const diagnostics = schemaDiagnostics.map((item) => ({
    code: 'CHECKPOINT_SCHEMA_INVALID', path: item.path, message: item.message
  }));
  if (!isRecord(submitted) || submitted.schema_version !== '4.0.0') {
    diagnostics.push({ code: 'V4_CHECKPOINT_REQUIRED', path: '/schema_version', message: 'v4 semantic checkpoint required' });
    return diagnostics;
  }
  const checkpoint = /** @type {any} */ (submitted);
  const reopenFields = [
    'reopened_targets', 'decision_suspension_ledger', 'decision_reopen_overlay_digest'
  ];
  const presentReopenFields = reopenFields.filter((field) => Object.hasOwn(checkpoint, field));
  if (presentReopenFields.length !== 0 && presentReopenFields.length !== reopenFields.length) {
    diagnostics.push({
      code: 'CHECKPOINT_REOPEN_OVERLAY_INCOMPLETE', path: '/',
      message: 'A reopened checkpoint must persist targets, the cumulative suspension ledger, and their digest together.'
    });
  } else if (presentReopenFields.length === reopenFields.length) {
    try {
      const targets = checkpoint.reopened_targets;
      const suspensionLedger = checkpoint.decision_suspension_ledger;
      if (!Array.isArray(targets) || targets.length === 0 || !Array.isArray(suspensionLedger)) {
        throw new TypeError('CHECKPOINT_REOPEN_OVERLAY_INVALID');
      }
      const rootIds = canonicalStringSetV4(
        targets.map((/** @type {any} */ target) => target.root_issue_id),
        'CHECKPOINT_REOPEN_OVERLAY_INVALID'
      );
      if (rootIds.length !== targets.length
        || canonicalStringify(targets) !== canonicalStringify([...targets].sort(
          (left, right) => compareUnicodeScalar(left.root_issue_id, right.root_issue_id)
        ))
        || canonicalStringify(suspensionLedger) !== canonicalStringify([...suspensionLedger].sort(
          (left, right) => compareUnicodeScalar(left.root_issue_id, right.root_issue_id)
        ))) throw new TypeError('CHECKPOINT_REOPEN_OVERLAY_INVALID');
      const ledgerByRoot = new Map(suspensionLedger.map((/** @type {any} */ item) => [
        item.root_issue_id, item.cumulative_suspended_decision_ids
      ]));
      for (const target of targets) {
        const newly = canonicalStringSetV4(
          target.decision_suspension?.newly_suspended_decision_ids ?? [],
          'CHECKPOINT_REOPEN_OVERLAY_INVALID', false
        );
        const cumulative = canonicalStringSetV4(
          target.decision_suspension?.cumulative_suspended_decision_ids ?? [],
          'CHECKPOINT_REOPEN_OVERLAY_INVALID', false
        );
        if (canonicalStringify(newly) !== canonicalStringify(
          target.decision_suspension.newly_suspended_decision_ids
        ) || canonicalStringify(cumulative) !== canonicalStringify(
          target.decision_suspension.cumulative_suspended_decision_ids
        ) || newly.some((id) => !cumulative.includes(id))
          || canonicalStringify(ledgerByRoot.get(target.root_issue_id)) !== canonicalStringify(cumulative)) {
          throw new TypeError('CHECKPOINT_REOPEN_OVERLAY_INVALID');
        }
      }
      if (checkpoint.decision_reopen_overlay_digest !== sha256CanonicalV4({
        decision_suspension_ledger: suspensionLedger,
        reopened_targets: targets
      })) throw new TypeError('CHECKPOINT_REOPEN_OVERLAY_INVALID');
    } catch {
      diagnostics.push({
        code: 'CHECKPOINT_REOPEN_OVERLAY_INVALID', path: '/decision_reopen_overlay_digest',
        message: 'The reopened target set and cumulative Decision suspension ledger must be canonical and digest-bound.'
      });
    }
  }
  if ((checkpoint.commit_profile === 'pre_case_pending'
      && (checkpoint.behavior_views_digest !== null || checkpoint.case_drafts_digest !== null))
    || (checkpoint.commit_profile === 'post_case_pending'
      && (!DIGEST.test(String(checkpoint.behavior_views_digest)) || !DIGEST.test(String(checkpoint.case_drafts_digest))))) {
    diagnostics.push({ code: 'CHECKPOINT_PROFILE_MISMATCH', path: '/commit_profile', message: 'checkpoint artifact set does not match commit profile' });
  }
  const ledgerEntries = checkpoint.semantic_gap_ledger ?? [];
  const ledger = new Map(ledgerEntries.map((/** @type {any} */ root) => [root.root_issue_id, root]));
  if (ledger.size !== ledgerEntries.length) diagnostics.push({
    code: 'CHECKPOINT_LEDGER_DUPLICATE', path: '/semantic_gap_ledger', message: 'semantic gap roots must be unique'
  });
  const stateEntries = checkpoint.clarification_state?.root_states ?? [];
  const stateIds = new Set();
  const remaining = [];
  const answered = [];
  const closed = [];
  for (const state of stateEntries) {
    if (stateIds.has(state.root_issue_id)) diagnostics.push({
      code: 'CHECKPOINT_ROOT_STATE_DUPLICATE', path: '/clarification_state/root_states', message: 'root states must be unique'
    });
    stateIds.add(state.root_issue_id);
    const root = ledger.get(state.root_issue_id);
    if (!ROOT_STATES.has(state.status) || !root) diagnostics.push({
      code: 'CHECKPOINT_ROOT_STATE_INVALID', path: '/clarification_state/root_states', message: 'root state must reference the semantic gap ledger'
    });
    else if (state.root_version_digest !== root.root_version_digest || state.question_part_id !== root.question_part_id) diagnostics.push({
      code: 'CHECKPOINT_ROOT_BINDING_MISMATCH', path: '/clarification_state/root_states', message: 'root state version and part must equal the ledger root'
    });
    if (state.status === 'presented') remaining.push(state.question_part_id);
    if (RESOLVED_ROOT_STATES.has(state.status)) answered.push(state.question_part_id);
    if (state.status === 'closed_for_delivery') closed.push(state.question_part_id);
  }
  if (stateIds.size !== ledger.size) diagnostics.push({
    code: 'CHECKPOINT_LEDGER_STATE_MISMATCH', path: '/clarification_state/root_states', message: 'every semantic gap root must have exactly one state'
  });
  if (!sameStringSet(checkpoint.clarification_state?.remaining_part_ids ?? [], remaining)) diagnostics.push({
    code: 'CHECKPOINT_REMAINING_MISMATCH', path: '/clarification_state/remaining_part_ids', message: 'remaining set must equal presented roots'
  });
  if (!sameStringSet(checkpoint.clarification_state?.answered_part_ids ?? [], answered)) diagnostics.push({
    code: 'CHECKPOINT_ANSWERED_MISMATCH', path: '/clarification_state/answered_part_ids', message: 'answered set must equal resolved roots'
  });
  if (!sameStringSet(checkpoint.clarification_state?.closed_for_delivery_part_ids ?? [], closed)) diagnostics.push({
    code: 'CHECKPOINT_CLOSED_MISMATCH', path: '/clarification_state/closed_for_delivery_part_ids', message: 'delivery-closed set must equal closed roots'
  });
  const presentation = checkpoint.clarification_state?.presentation;
  const expectedPhase = checkpoint.commit_profile === 'pre_case_pending' ? 'requirements_analysis' : 'case_design';
  const remainingRoots = stateEntries
    .filter((/** @type {any} */ state) => state.status === 'presented')
    .map((/** @type {any} */ state) => ledger.get(state.root_issue_id))
    .filter(Boolean)
    .sort(compareSemanticRoots);
  if ((remainingRoots.length > 0) !== Boolean(presentation)) diagnostics.push({
    code: 'CHECKPOINT_PRESENTATION_STATE_MISMATCH', path: '/clarification_state/presentation', message: 'pending roots require one presentation and a complete state requires none'
  });
  if (presentation) {
    diagnostics.push(...validateSemanticPresentationV4(presentation));
    const expectedPresentation = buildPresentation({
      run_id: checkpoint.run_id,
      committed_revision: checkpoint.revision,
      committed_checkpoint_digest: checkpoint.base_checkpoint_digest,
      phase: expectedPhase,
      supersedes_presentation_id: presentation.supersedes_presentation_id,
      answered_part_ids: answered,
      roots: remainingRoots
    });
    if (canonicalStringify(presentation) !== canonicalStringify(expectedPresentation)) diagnostics.push({
      code: 'CHECKPOINT_RECOVERY_MISMATCH', path: '/clarification_state/presentation', message: 'presentation must exactly bind checkpoint roots, phase and recovery identity'
    });
    if (checkpoint.clarification_state.presentation_digest !== sha256CanonicalV4(presentation)) diagnostics.push({
      code: 'PRESENTATION_DIGEST_MISMATCH', path: '/clarification_state/presentation_digest', message: 'presentation digest must be exact'
    });
    if (checkpoint.clarification_state.latest_presentation_id !== presentation.presentation_id) diagnostics.push({
      code: 'LATEST_PRESENTATION_MISMATCH', path: '/clarification_state/latest_presentation_id', message: 'latest presentation ID must match'
    });
    if (checkpoint.clarification_state.cycle_digest !== presentation.cycle_digest) diagnostics.push({
      code: 'CHECKPOINT_CYCLE_MISMATCH', path: '/clarification_state/cycle_digest', message: 'checkpoint cycle digest must equal the presentation cycle'
    });
  } else {
    if (checkpoint.clarification_state.presentation_digest !== null) diagnostics.push({
      code: 'PRESENTATION_DIGEST_MISMATCH', path: '/clarification_state/presentation_digest', message: 'a missing presentation has no digest'
    });
    if (checkpoint.clarification_state.cycle_digest !== sha256CanonicalV4([])) diagnostics.push({
      code: 'CHECKPOINT_CYCLE_MISMATCH', path: '/clarification_state/cycle_digest', message: 'a complete clarification has the empty cycle digest'
    });
  }
  return diagnostics;
}

/**
 * An unchanged analysis result is explicitly non-terminal and does not create
 * a revision or alter any pending root.
 * @param {unknown} submittedCheckpoint
 * @param {unknown} submittedRequest
 */
export function replayNoInformationGainV4(submittedCheckpoint, submittedRequest) {
  const checkpoint = assertCheckpoint(submittedCheckpoint);
  if (!isRecord(submittedRequest)
    || submittedRequest.presentation_id !== checkpoint.clarification_state.latest_presentation_id
    || submittedRequest.cycle_digest !== checkpoint.clarification_state.cycle_digest
    || submittedRequest.committed_revision !== checkpoint.revision) throw new TypeError('STALE_PRESENTATION');
  return {
    status: 'need_user_answers',
    committed_revision: checkpoint.revision,
    no_information_gain: true,
    presentation: structuredClone(checkpoint.clarification_state.presentation),
    checkpoint: structuredClone(checkpoint)
  };
}

/**
 * Apply only the explicit selected subset. This pure state transition is the
 * checkpoint rule; append persistence and Decision creation belong to T09/T10.
 * @param {any} checkpoint
 * @param {unknown} submittedEvent
 * @param {any[]} [presentationHistory]
 */
function applyRequestDeliverySelectionV4(checkpoint, submittedEvent, presentationHistory = []) {
  if (!isRecord(submittedEvent) || submittedEvent.event_type !== 'request_delivery'
    || typeof submittedEvent.presentation_id !== 'string'
    || !Array.isArray(submittedEvent.question_part_refs) || submittedEvent.question_part_refs.length === 0) {
    throw new TypeError('REQUEST_DELIVERY_INVALID');
  }
  const currentPresentation = checkpoint.clarification_state.presentation;
  const targetsCurrentPresentation = submittedEvent.presentation_id === currentPresentation?.presentation_id;
  const historicalMatches = presentationHistory.filter(
    (presentation) => presentation?.presentation_id === submittedEvent.presentation_id
  );
  const latestPresentationId = checkpoint.clarification_state.latest_presentation_id;
  const targetsHistoricalPresentation = !targetsCurrentPresentation
    && historicalMatches.length === 1
    && typeof latestPresentationId === 'string'
    && (submittedEvent.presentation_id === latestPresentationId
      || isUniquePresentationAncestor(submittedEvent.presentation_id, latestPresentationId, presentationHistory));
  if (!targetsCurrentPresentation && !targetsHistoricalPresentation) {
    throw new TypeError('REQUEST_DELIVERY_STALE_OR_DUPLICATE');
  }
  const selectedPresentation = targetsCurrentPresentation ? currentPresentation : historicalMatches[0];
  const presentationParts = new Map(selectedPresentation.question_parts
    .map((/** @type {any} */ part) => [part.question_part_id, part]));
  const selected = new Set();
  for (const raw of submittedEvent.question_part_refs) {
    if (!isRecord(raw)) throw new TypeError('REQUEST_DELIVERY_INVALID');
    const part = presentationParts.get(raw.question_part_id);
    const state = checkpoint.clarification_state.root_states.find(
      (/** @type {any} */ item) => item.question_part_id === raw.question_part_id
    );
    const statusCanClose = targetsCurrentPresentation
      ? state?.status === 'presented'
      : state?.status === 'deferred_by_user' || state?.status === 'unknown_by_user';
    if (!part || raw.root_issue_id !== part.root_issue_id || raw.root_version_digest !== part.root_version_digest
      || !statusCanClose || state.root_issue_id !== part.root_issue_id
      || state.root_version_digest !== part.root_version_digest || selected.has(raw.question_part_id)) {
      throw new TypeError('REQUEST_DELIVERY_STALE_OR_DUPLICATE');
    }
    selected.add(String(raw.question_part_id));
  }
  for (const state of checkpoint.clarification_state.root_states) {
    if (selected.has(state.question_part_id)) state.status = 'closed_for_delivery';
  }
  checkpoint.clarification_state.closed_for_delivery_part_ids = canonicalStringSetV4([
    ...checkpoint.clarification_state.closed_for_delivery_part_ids,
    ...selected
  ], 'CLARIFICATION_CLOSED_INVALID', false);
  checkpoint.clarification_state.remaining_part_ids = checkpoint.clarification_state.remaining_part_ids
    .filter((/** @type {string} */ id) => !selected.has(id)).sort(compareUnicodeScalar);
  return checkpoint.clarification_state.latest_presentation_id;
}

/** @param {unknown} submittedCheckpoint @param {unknown} submittedEvent */
export function applyRequestDeliveryV4(submittedCheckpoint, submittedEvent) {
  const checkpoint = structuredClone(assertCheckpoint(submittedCheckpoint));
  const priorPresentationId = applyRequestDeliverySelectionV4(checkpoint, submittedEvent);
  const presentation = refreshCheckpointPresentation(checkpoint, priorPresentationId);
  const diagnostics = validateSemanticClarificationCheckpointV4(checkpoint);
  if (diagnostics.length) throw new TypeError(diagnostics[0].code);
  return {
    status: presentation ? 'need_user_answers' : 'clarification_complete',
    committed_revision: checkpoint.revision,
    presentation,
    checkpoint
  };
}

/**
 * Construct the exact public event advertised by a semantic presentation.
 * The caller supplies only the answer text/authority choice that cannot exist
 * in the presentation itself; every stable target comes from action_context.
 * @param {unknown} submittedPresentation
 * @param {unknown} submittedPart
 * @param {unknown} submittedAction
 * @param {unknown} submittedPayload
 */
export function constructSemanticClarificationEventV4(
  submittedPresentation,
  submittedPart,
  submittedAction,
  submittedPayload = {}
) {
  const presentationDiagnostics = validateSemanticPresentationV4(submittedPresentation);
  if (presentationDiagnostics.length) throw new TypeError('PRESENTATION_INVALID');
  const presentation = /** @type {any} */ (submittedPresentation);
  if (submittedAction === 'cancel_run') return identifiedEvent({
    event_type: 'cancel_run',
    run_id: presentation.recovery.run_id,
    phase: presentation.phase,
    phase_version: presentation.recovery.committed_revision
  });
  if (!isRecord(submittedPart)) throw new TypeError('SEMANTIC_ACTION_NOT_ADVERTISED');
  const partRecord = /** @type {any} */ (submittedPart);
  const advertisedPart = presentation.question_parts.find(
    (/** @type {any} */ part) => part.question_part_id === partRecord.question_part_id
  );
  if (!ACTIONS.includes(String(submittedAction))
    || !advertisedPart
    || canonicalStringify(partRecord) !== canonicalStringify(advertisedPart)
    || !Array.isArray(partRecord.available_actions)
    || !partRecord.available_actions.includes(submittedAction)) {
    throw new TypeError('SEMANTIC_ACTION_NOT_ADVERTISED');
  }
  if (!isRecord(partRecord.action_context)) throw new TypeError('SEMANTIC_ACTION_NOT_ADVERTISED');
  const context = /** @type {any} */ (structuredClone(partRecord.action_context));
  if (submittedAction === 'request_delivery') return identifiedEvent({
    event_type: 'request_delivery',
    presentation_id: context.presentation_id,
    question_part_refs: [{
      question_part_id: context.question_part_id,
      root_issue_id: context.root_issue_id,
      root_version_digest: context.root_version_digest
    }]
  });
  if (submittedAction === 'answer_question_part') {
    if (!isRecord(submittedPayload)) throw new TypeError('SEMANTIC_ANSWER_INVALID');
    const answer = canonicalTextV4(submittedPayload.answer, 'SEMANTIC_ANSWER_INVALID');
    if (submittedPayload.resolution !== 'final' && submittedPayload.resolution !== 'temporary') {
      throw new TypeError('SEMANTIC_ANSWER_INVALID');
    }
    if (!isRecord(submittedPayload.answer_origin)
      || (submittedPayload.answer_origin.type !== 'user_statement'
        && submittedPayload.answer_origin.type !== 'authorized_confirmation')
      || submittedPayload.answer_origin.presentation_id !== context.presentation_id
      || typeof submittedPayload.authority !== 'string'
      || (submittedPayload.answer_origin.type === 'user_statement' && submittedPayload.authority !== 'task_scoped')
      || (submittedPayload.answer_origin.type === 'authorized_confirmation' && submittedPayload.authority !== 'product_final')) {
      throw new TypeError('SEMANTIC_ANSWER_INVALID');
    }
    return identifiedEvent({
      event_type: submittedAction, ...context, answer,
      answer_origin: structuredClone(submittedPayload.answer_origin),
      authority: submittedPayload.authority.normalize('NFC').trim(),
      resolution: submittedPayload.resolution
    });
  }
  return identifiedEvent({ event_type: submittedAction, ...context });
}

/** @param {unknown} value */
function v4ObjectArray(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {unknown} value */
function v4StringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {any[]} bindings @param {string} rootIssueId */
function obligationIdsFor(bindings, rootIssueId) {
  const matches = bindings.filter((binding) => binding.root_issue_id === rootIssueId);
  if (matches.length > 1) throw new TypeError('DECISION_OBLIGATION_AUDIT_AMBIGUOUS');
  return matches.length === 1 ? v4StringArray(matches[0].obligation_ids) : [];
}

/** @param {any} presentation @param {any} target */
function presentationPartMatches(presentation, target) {
  if (!isRecord(presentation) || presentation.presentation_id !== target.presentation_id
    || !Array.isArray(presentation.question_parts)) return false;
  const matches = presentation.question_parts.filter((/** @type {any} */ part) => isRecord(part)
    && part.question_part_id === target.question_part_id
    && part.root_issue_id === target.root_issue_id
    && part.root_version_digest === target.root_version_digest);
  return matches.length === 1;
}

/** @param {string} ancestorId @param {string} currentId @param {any[]} history */
function isUniquePresentationAncestor(ancestorId, currentId, history) {
  const byId = new Map();
  for (const presentation of history) {
    if (typeof presentation.presentation_id !== 'string') continue;
    const entries = byId.get(presentation.presentation_id) ?? [];
    entries.push(presentation); byId.set(presentation.presentation_id, entries);
  }
  const visited = new Set();
  let cursor = currentId;
  while (cursor !== ancestorId) {
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const entries = byId.get(cursor) ?? [];
    if (entries.length !== 1 || typeof entries[0].supersedes_presentation_id !== 'string') return false;
    cursor = entries[0].supersedes_presentation_id;
  }
  return true;
}

/**
 * Production semantic-append seam. It accepts only checkpoint-owned roots,
 * immutable presentation history, normalized user messages and obligation
 * snapshots; it returns a candidate state for T10's atomic revision commit.
 * Invalid/blank/unbound text is a no-op, while stale but well-formed targets are
 * distinguished so the runner can return the current presentation.
 * @param {unknown} submitted
 */
export function applySemanticClarificationEventsV4(submitted) {
  if (!isRecord(submitted)) throw new TypeError('SEMANTIC_APPEND_INVALID');
  const original = assertCheckpoint(submitted.checkpoint);
  const checkpoint = structuredClone(original);
  const submittedEvents = v4ObjectArray(submitted.clarification_events);
  const existingDecisions = v4ObjectArray(submitted.existing_decisions).map((item) => structuredClone(item));
  const history = v4ObjectArray(submitted.presentation_history);
  const previousBindings = v4ObjectArray(submitted.previous_obligations_by_root);
  const currentBindings = v4ObjectArray(submitted.current_obligations_by_root);
  const messages = new Map();
  for (const raw of v4StringArray(submitted.normalized_user_messages)) {
    const normalized = normalizeDecisionMessageV4(raw);
    const messageDigest = `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
    messages.set(messageDigest, normalized);
  }
  const noInformationGain = () => ({
    status: 'no_information_gain', commit_required: false, committed_revision: original.revision,
    presentation: structuredClone(original.clarification_state.presentation), checkpoint: structuredClone(original),
    decisions: existingDecisions, decision_claim_summaries: [], non_blocking_diagnostics: [],
    diagnostics: [{
      category: 'classification', code: 'NO_INFORMATION_GAIN', path: '/clarification_events',
      message: 'No answer could be safely bound; the same semantic questions remain pending.'
    }]
  });
  const staleAnswer = () => ({
    ...noInformationGain(), status: 'stale_answer',
    diagnostics: [{
      category: 'reference', code: 'STALE_ANSWER', path: '/clarification_events',
      message: 'The answer target is no longer the uniquely pending version; use the current presentation.'
    }]
  });
  if (submittedEvents.length === 0 || submittedEvents.length !== (Array.isArray(submitted.clarification_events)
    ? submitted.clarification_events.length : 0)
    || submittedEvents.some((event) => !hasCanonicalEventIdentity(event))) return noInformationGain();

  /** @type {any[]} */
  const decisions = [...existingDecisions];
  /** @type {any[]} */
  const decisionClaimSummaries = [];
  /** @type {any[]} */
  const warnings = [];
  let lastClassification = null;
  let changed = false;
  const successorBasePresentationId = checkpoint.clarification_state.latest_presentation_id;
  for (const event of submittedEvents) {
    if (event.event_type === 'request_delivery') {
      try {
        applyRequestDeliverySelectionV4(checkpoint, event, history);
        changed = true;
        continue;
      } catch { return noInformationGain(); }
    }
    if (event.event_type === 'defer_question_part' || event.event_type === 'mark_question_unknown') {
      const currentPresentation = checkpoint.clarification_state.presentation;
      if (event.presentation_id !== checkpoint.clarification_state.latest_presentation_id
        || !presentationPartMatches(currentPresentation, event)) return noInformationGain();
      const state = checkpoint.clarification_state.root_states.find((/** @type {any} */ item) => item.root_issue_id === event.root_issue_id);
      if (!state || state.status !== 'presented' || state.root_version_digest !== event.root_version_digest) return noInformationGain();
      state.status = event.event_type === 'defer_question_part' ? 'deferred_by_user' : 'unknown_by_user';
      changed = true;
      continue;
    }
    if (event.event_type !== 'answer_question_part' || !isRecord(event.answer_origin)
      || typeof event.presentation_id !== 'string'
      || typeof event.answer !== 'string' || !event.answer.trim()) return noInformationGain();
    const root = checkpoint.semantic_gap_ledger.find((/** @type {any} */ item) => item.root_issue_id === event.root_issue_id);
    const state = checkpoint.clarification_state.root_states.find((/** @type {any} */ item) => item.root_issue_id === event.root_issue_id);
    if (!root || !state) return staleAnswer();
    const message = messages.get(event.answer_origin.message_digest);
    if (message === undefined) return noInformationGain();
    const targetBindingCurrent = state.question_part_id === event.question_part_id
      && state.root_version_digest === event.root_version_digest
      && root.root_version_digest === event.root_version_digest;
    if (!targetBindingCurrent) return staleAnswer();
    const reopenedTarget = Array.isArray(checkpoint.reopened_targets)
      ? checkpoint.reopened_targets.find((/** @type {any} */ target) =>
        target.root_issue_id === root.root_issue_id
          && target.reopened_root_version_digest === root.root_version_digest)
      : null;
    const supersedesDecisionIds = reopenedTarget
      ? canonicalStringSetV4(
          reopenedTarget.decision_suspension?.newly_suspended_decision_ids ?? [],
          'REOPEN_DECISION_SUPERSESSION_INVALID', false
        )
      : [];
    /** @param {boolean} acceptedFromSuperseded */
    const compileDecision = (acceptedFromSuperseded) => compileSemanticDecisionV4({
      event, normalized_user_message: message, subject_fact_ids: root.subject_fact_ids,
      missing_aspect: root.missing_aspect,
      previous_obligation_ids: obligationIdsFor(previousBindings, root.root_issue_id),
      current_obligation_ids: obligationIdsFor(currentBindings, root.root_issue_id),
      accepted_from_superseded_presentation: acceptedFromSuperseded,
      supersedes_decision_ids: supersedesDecisionIds
    });
    let replayCandidate;
    try { replayCandidate = compileDecision(false); } catch { return noInformationGain(); }
    const replay = decisions.find((decision) => decision.decision_id === replayCandidate.decision.decision_id);
    if (replay) {
      const expectedStatus = replay.resolution === 'final' ? 'resolved_final' : 'resolved_temporary';
      if (state.status !== expectedStatus) return staleAnswer();
      return {
        status: 'replayed_decision', commit_required: false, committed_revision: original.revision,
        presentation: structuredClone(original.clarification_state.presentation), checkpoint: structuredClone(original),
        decisions: structuredClone(existingDecisions), replayed_decision_id: replay.decision_id,
        decision_claim_summaries: [],
        non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(replayCandidate.warnings), diagnostics: []
      };
    }
    let acceptedFromSuperseded = false;
    const isCurrent = event.presentation_id === checkpoint.clarification_state.latest_presentation_id
      && presentationPartMatches(checkpoint.clarification_state.presentation, event);
    if (!isCurrent) {
      const matchingHistory = history.filter((presentation) => presentationPartMatches(presentation, event));
      const currentBindingUnchanged = state.status === 'presented'
        && state.question_part_id === event.question_part_id
        && state.root_version_digest === event.root_version_digest
        && root.root_version_digest === event.root_version_digest;
      const hasIntermediateDecision = decisions.some((decision) => decision.target?.root_issue_id === event.root_issue_id);
      const currentPresentationId = checkpoint.clarification_state.latest_presentation_id;
      if (matchingHistory.length !== 1 || typeof currentPresentationId !== 'string'
        || !isUniquePresentationAncestor(event.presentation_id, currentPresentationId, history)
        || !currentBindingUnchanged || hasIntermediateDecision) return staleAnswer();
      acceptedFromSuperseded = true;
    }
    let compiled;
    try { compiled = acceptedFromSuperseded ? compileDecision(true) : replayCandidate; }
    catch { return noInformationGain(); }
    if (state.status !== 'presented' || state.root_version_digest !== event.root_version_digest
      || state.question_part_id !== event.question_part_id || root.root_version_digest !== event.root_version_digest) return staleAnswer();
    decisions.push(compiled.decision);
    decisionClaimSummaries.push({
      claim_id: `CLM-${sha256CanonicalV4({ decision_id: compiled.decision.decision_id }).slice('sha256:'.length)}`,
      claim_form: 'decision-record', level: compiled.decision.evidence_level,
      decision_id: compiled.decision.decision_id, value: compiled.decision.answer,
      authority: compiled.decision.authority, scope: root.scope_ref
    });
    warnings.push(...compiled.warnings);
    lastClassification = compiled.case_classification;
    state.status = compiled.decision.resolution === 'final' ? 'resolved_final' : 'resolved_temporary';
    changed = true;
  }
  if (!changed) return noInformationGain();
  refreshCheckpointPresentation(checkpoint, successorBasePresentationId);
  const diagnostics = validateSemanticClarificationCheckpointV4(checkpoint);
  if (diagnostics.length) throw new TypeError(diagnostics[0].code);
  return {
    status: checkpoint.clarification_state.presentation ? 'need_user_answers' : 'clarification_complete',
    commit_required: true,
    committed_revision: original.revision,
    presentation: structuredClone(checkpoint.clarification_state.presentation), checkpoint,
    decisions,
    decision_claim_summaries: decisionClaimSummaries,
    case_classification: lastClassification,
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(warnings),
    diagnostics: []
  };
}
