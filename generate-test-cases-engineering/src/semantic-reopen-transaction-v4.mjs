import { createHash } from 'node:crypto';
import path from 'node:path';

import runInstanceSchema from '../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateSemanticClarificationCheckpointV4 } from './clarification-v4.mjs';
import {
  RunStoreIntegrityError,
  acquireRunLock,
  atomicWriteJson,
  atomicWriteText,
  readJsonIfPresent,
  readTextIfPresent,
  revisionName
} from './run-store.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import {
  commitRevisionTransactionV4, revisionArtifactPathV4
} from './revision-transaction-v4.mjs';

const VERSION = '4.0.0';
const COMPILER_VERSION = '0.5.0';
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const PHASES = Object.freeze(['reserved', 'sibling_committed', 'execution_superseded', 'complete']);

/** @param {string|Uint8Array} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {unknown} value */
function canonicalDigest(value) {
  return byteDigest(canonicalStringify(value));
}

/** @param {any} value */
function canonicalClone(value) {
  return JSON.parse(canonicalStringify(value));
}

/** @param {unknown} value */
function jsonArtifact(value) {
  return { format: 'json', value: canonicalClone(value) };
}

/** @param {string} runId */
function siblingGenesisDigest(runId) {
  return byteDigest(`${canonicalStringify({
    schema_version: VERSION, compiler_version: COMPILER_VERSION,
    run_id: runId, genesis: true
  })}\n`);
}

/** @param {string} prefix @param {unknown} identity */
function contentId(prefix, identity) {
  return `${prefix}-${canonicalDigest(identity).slice('sha256:'.length)}`;
}

/** @param {unknown} value @param {string} code */
function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return /** @type {Record<string,any>} */ (value);
}

/** @param {unknown} value @param {string} code */
function text(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value;
}

/** @param {unknown} value @param {string} code */
function sha(value, code) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(code);
  return value;
}

/** @param {unknown} ownership */
function requireHeldLock(ownership) {
  if (typeof ownership !== 'function'
    || typeof /** @type {any} */ (ownership).assertHealthy !== 'function') {
    throw new TypeError('RUN_LOCK_OWNERSHIP_REQUIRED');
  }
  /** @type {any} */ (ownership).assertHealthy();
  return /** @type {(()=>Promise<void>) & {assertHealthy:()=>void}} */ (ownership);
}

/** @param {string[]} values */
function sortedUnique(values) {
  return [...new Set(values.map((value) => value.normalize('NFC')))].sort(compareCodePoints);
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** @param {unknown} value @returns {any[]} */
function decisions(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(/** @type {any} */ (value).decisions)) {
    return /** @type {any} */ (value).decisions;
  }
  throw new TypeError('DECISION_JOURNAL_INVALID');
}

/** @param {unknown} value @returns {any[]} */
function normalizeSuspensionLedger(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('DECISION_SUSPENSION_LEDGER_INVALID');
  const byRoot = new Map();
  for (const submitted of value) {
    const item = record(submitted, 'DECISION_SUSPENSION_LEDGER_INVALID');
    const rootId = text(item.root_issue_id, 'DECISION_SUSPENSION_LEDGER_INVALID').normalize('NFC');
    if (byRoot.has(rootId) || !Array.isArray(item.cumulative_suspended_decision_ids)) {
      throw new TypeError('DECISION_SUSPENSION_LEDGER_INVALID');
    }
    const ids = item.cumulative_suspended_decision_ids.map((id) =>
      text(id, 'DECISION_SUSPENSION_LEDGER_INVALID'));
    byRoot.set(rootId, sortedUnique(ids));
  }
  return [...byRoot.entries()].sort(([left], [right]) => compareCodePoints(left, right))
    .map(([root_issue_id, cumulative_suspended_decision_ids]) => ({
      root_issue_id, cumulative_suspended_decision_ids
    }));
}

/** @param {unknown} value @returns {any[]} */
function normalizeTargets(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('REOPEN_TARGETS_INVALID');
  const seen = new Set();
  const output = value.map((submitted) => {
    const item = record(submitted, 'REOPEN_TARGETS_INVALID');
    const rootIssueId = text(item.root_issue_id, 'REOPEN_TARGETS_INVALID').normalize('NFC');
    const priorDigest = sha(item.prior_root_version_digest ?? item.root_version_digest, 'REOPEN_TARGETS_INVALID');
    if (seen.has(rootIssueId)) throw new TypeError('REOPEN_TARGETS_INVALID');
    seen.add(rootIssueId);
    return { root_issue_id: rootIssueId, prior_root_version_digest: priorDigest };
  });
  return output.sort((left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
}

/**
 * Return both the effective projection and the audit-preserving status view.
 * Suspension is applied before ordinary Decision supersession, so an ancestor
 * suspended by an earlier reopen can never be revived.
 * @param {unknown} submittedDecisions
 * @param {unknown} submittedLedger
 */
export function projectEffectiveDecisionsV4(submittedDecisions, submittedLedger) {
  /** @type {any[]} */
  const journal = decisions(submittedDecisions).map((item) => canonicalClone(record(item, 'DECISION_INVALID')));
  const ledger = normalizeSuspensionLedger(submittedLedger);
  const byId = new Map();
  for (const decision of journal) {
    const decisionId = text(decision.decision_id, 'DECISION_ID_INVALID');
    const targetRoot = text(decision.target?.root_issue_id, 'DECISION_TARGET_INVALID');
    if (byId.has(decisionId)) throw new TypeError('DECISION_JOURNAL_DUPLICATE');
    byId.set(decisionId, targetRoot);
  }
  for (const item of ledger) for (const decisionId of item.cumulative_suspended_decision_ids) {
    if (!byId.has(decisionId)) throw new TypeError('DECISION_SUSPENSION_ID_UNKNOWN');
    if (byId.get(decisionId) !== item.root_issue_id) {
      throw new TypeError('DECISION_SUSPENSION_ROOT_MISMATCH');
    }
  }
  const suspended = new Set(ledger.flatMap((item) => item.cumulative_suspended_decision_ids));
  const candidates = journal.filter((item) => !suspended.has(item.decision_id)
    && (item.status === undefined || item.status === 'active'));
  const superseded = new Set(candidates.flatMap((item) => Array.isArray(item.supersedes_decision_ids)
    ? item.supersedes_decision_ids : []));
  const effective = candidates.filter((item) => !superseded.has(item.decision_id))
    .sort((left, right) => compareCodePoints(String(left.decision_id), String(right.decision_id)));
  const audit = journal.map((item) => suspended.has(item.decision_id)
    ? { ...item, status: 'suspended_by_reopen' } : item)
    .sort((left, right) => compareCodePoints(String(left.decision_id), String(right.decision_id)));
  return { effective_decisions: effective, audit_decisions: audit };
}

/**
 * Derive compiler-owned newly/cumulative suspension sets and root versions.
 * @param {{reopen_event_id:string,targets:unknown,decisions:unknown,prior_suspension_ledger?:unknown}} input
 */
export function deriveDecisionReopenOverlayV4(input) {
  const value = record(input, 'REOPEN_OVERLAY_INPUT_INVALID');
  const eventId = text(value.reopen_event_id, 'REOPEN_EVENT_ID_INVALID').normalize('NFC');
  const targets = normalizeTargets(value.targets);
  const priorLedger = normalizeSuspensionLedger(value.prior_suspension_ledger ?? []);
  const priorByRoot = new Map(priorLedger.map((item) =>
    [item.root_issue_id, item.cumulative_suspended_decision_ids]));
  const projection = projectEffectiveDecisionsV4(value.decisions, priorLedger);
  const reopenedTargets = targets.map((target) => {
    const newly = sortedUnique(projection.effective_decisions
      .filter((decision) => decision.target?.root_issue_id === target.root_issue_id)
      .map((decision) => text(decision.decision_id, 'DECISION_ID_INVALID')));
    const cumulative = sortedUnique([...(priorByRoot.get(target.root_issue_id) ?? []), ...newly]);
    priorByRoot.set(target.root_issue_id, cumulative);
    const reopenedRootVersionDigest = canonicalDigest({
      root_issue_id: target.root_issue_id,
      prior_root_version_digest: target.prior_root_version_digest,
      reopen_event_id: eventId,
      newly_suspended_decision_ids: newly
    });
    return {
      root_issue_id: target.root_issue_id,
      prior_root_version_digest: target.prior_root_version_digest,
      reopened_root_version_digest: reopenedRootVersionDigest,
      decision_suspension: {
        newly_suspended_decision_ids: newly,
        cumulative_suspended_decision_ids: cumulative,
        reopen_event_id: eventId
      }
    };
  });
  const decisionSuspensionLedger = [...priorByRoot.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([root_issue_id, cumulative_suspended_decision_ids]) => ({
      root_issue_id, cumulative_suspended_decision_ids: sortedUnique(cumulative_suspended_decision_ids)
    }));
  const overlayDigest = canonicalDigest({
    decision_suspension_ledger: decisionSuspensionLedger,
    reopened_targets: reopenedTargets
  });
  return {
    reopened_targets: reopenedTargets,
    decision_suspension_ledger: decisionSuspensionLedger,
    decision_reopen_overlay_digest: overlayDigest
  };
}

/**
 * The first Decision on a reopened version must supersede exactly the active
 * set suspended by this reopen, never the cumulative ancestor set.
 * @param {unknown} submittedDecision @param {unknown} submittedTarget
 */
export function validateReopenedDecisionV4(submittedDecision, submittedTarget) {
  const decision = record(submittedDecision, 'REOPEN_DECISION_INVALID');
  const target = record(submittedTarget, 'REOPEN_TARGET_INVALID');
  const supplied = Array.isArray(decision.supersedes_decision_ids)
    ? sortedUnique(decision.supersedes_decision_ids.map((id) => text(id, 'REOPEN_DECISION_INVALID'))) : null;
  const expected = target.decision_suspension?.newly_suspended_decision_ids;
  if (!decision.target || decision.target.root_issue_id !== target.root_issue_id
    || decision.target.root_version_digest !== target.reopened_root_version_digest
    || supplied === null || !Array.isArray(expected)
    || canonicalStringify(supplied) !== canonicalStringify(sortedUnique(expected))) {
    throw new TypeError('REOPEN_DECISION_SUPERSESSION_INVALID');
  }
  return canonicalClone(decision);
}

/** @param {string} runDirectory */
const lifecyclePath = (runDirectory) => path.join(runDirectory, 'state', 'lifecycle.json');

/**
 * Create the mutable lifecycle while the production runner holds its run lock.
 * @param {string} runDirectory @param {unknown} ownership
 */
export async function ensureActiveRunLifecycleV4WithHeldLock(runDirectory, ownership) {
  const heldLock = requireHeldLock(ownership);
  try {
    const instance = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
    if (!instance || instance.value.schema_version !== VERSION
      || instance.value.delivery_intent !== 'execution_plan') throw new RunStoreIntegrityError('V4_EXECUTION_RUN_REQUIRED');
    const expected = {
      schema_version: VERSION, run_id: instance.value.run_id, delivery_intent: 'execution_plan',
      status: 'active', version: 1, superseded_by: null, semantic_reopen_txn_id: null
    };
    const existing = await readJsonIfPresent(runDirectory, lifecyclePath(runDirectory));
    if (existing) {
      if (canonicalStringify(existing.value) !== canonicalStringify(expected)) {
        throw new RunStoreIntegrityError('RUN_LIFECYCLE_ALREADY_TRANSITIONED');
      }
      return existing.value;
    }
    await atomicWriteJson(runDirectory, lifecyclePath(runDirectory), expected);
    return expected;
  } finally {
    heldLock.assertHealthy();
  }
}

/** Create the lifecycle for callers that do not already own the run lock. @param {string} runDirectory */
export async function ensureActiveRunLifecycleV4(runDirectory) {
  const release = await acquireRunLock(runDirectory);
  try {
    return await ensureActiveRunLifecycleV4WithHeldLock(runDirectory, release);
  } finally {
    await release();
  }
}

/** @param {string} catalogRoot @param {string} executionRunId @param {string} reopenEventId */
function transactionPath(catalogRoot, executionRunId, reopenEventId) {
  const eventKey = createHash('sha256').update(`${executionRunId}\0${reopenEventId}`).digest('hex');
  return path.join(catalogRoot, 'transactions', 'semantic-reopen', `${eventKey}.json`);
}

/** @param {string} root @param {string} target */
function requireCatalogDescendant(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new RunStoreIntegrityError('REOPEN_RUN_DIRECTORY_OUTSIDE_CATALOG');
  }
  return path.resolve(target);
}

/** @param {string} catalogRoot @param {string} digest */
function objectPath(catalogRoot, digest) {
  return path.join(catalogRoot, 'objects', 'sha256', digest.slice('sha256:'.length));
}

/** @param {string} catalogRoot @param {string} target @param {string} content */
async function writeImmutableText(catalogRoot, target, content) {
  const existing = await readTextIfPresent(catalogRoot, target);
  if (existing !== null && existing !== content) throw new RunStoreIntegrityError('CONTENT_OBJECT_CONFLICT');
  if (existing === null) await atomicWriteText(catalogRoot, target, content);
}

/** @param {string} catalogRoot @param {any} reference */
async function readInheritedObject(catalogRoot, reference) {
  const value = record(reference, 'REOPEN_INHERITED_REF_INVALID');
  const expectedDigest = sha(value.digest, 'REOPEN_INHERITED_REF_INVALID');
  const expectedPath = objectPath(catalogRoot, expectedDigest);
  if (typeof value.object_path !== 'string'
    || path.resolve(catalogRoot, value.object_path) !== path.resolve(expectedPath)) {
    throw new RunStoreIntegrityError('REOPEN_INHERITED_REF_INVALID');
  }
  const objectText = await readTextIfPresent(catalogRoot, expectedPath);
  if (objectText === null || byteDigest(objectText) !== expectedDigest) {
    throw new RunStoreIntegrityError('REOPEN_INHERITED_OBJECT_INVALID');
  }
  try { return JSON.parse(objectText); } catch {
    throw new RunStoreIntegrityError('REOPEN_INHERITED_OBJECT_INVALID');
  }
}

/**
 * Remove the semantic effect of suspended Decision Claims while retaining the
 * complete Decision journal separately for audit. Direct evidence that a
 * suspended decision superseded is restored as the active Fact ancestry.
 * @param {unknown} submittedEvidence @param {unknown} submittedLedger
 * @param {unknown} submittedRoots
 */
export function projectReopenedEvidenceV4(submittedEvidence, submittedLedger, submittedRoots) {
  const evidence = canonicalClone(record(submittedEvidence, 'REOPEN_EVIDENCE_INVALID'));
  if (!Array.isArray(evidence.claims) || !Array.isArray(evidence.fact_ledger)) {
    throw new TypeError('REOPEN_EVIDENCE_INVALID');
  }
  const ledger = normalizeSuspensionLedger(submittedLedger);
  const suspendedDecisionIds = new Set(ledger.flatMap((item) => item.cumulative_suspended_decision_ids));
  /** @type {any[]} */
  const originalClaims = evidence.claims.map((/** @type {any} */ claim) =>
    canonicalClone(record(claim, 'REOPEN_EVIDENCE_INVALID')));
  /** @type {Map<string,any>} */
  const claimById = new Map(originalClaims.map((/** @type {any} */ claim) => [claim.claim_id, claim]));
  if (claimById.size !== originalClaims.length || [...claimById.keys()].some((id) => typeof id !== 'string')) {
    throw new TypeError('REOPEN_EVIDENCE_INVALID');
  }
  const removedClaimIds = new Set(originalClaims.filter((/** @type {any} */ claim) =>
    claim.claim_form === 'decision-record' && suspendedDecisionIds.has(claim.decision_id))
    .map((/** @type {any} */ claim) => claim.claim_id));
  /** @type {Map<string,string[]>} */
  const predecessors = new Map();
  for (const claim of originalClaims) if (typeof claim.superseded_by === 'string') {
    const values = predecessors.get(claim.superseded_by) ?? [];
    values.push(claim.claim_id); predecessors.set(claim.superseded_by, values);
  }
  /** @param {string} claimId @param {Set<string>} [visited] @returns {string[]} */
  const restoredClaimIds = (claimId, visited = new Set()) => {
    if (!removedClaimIds.has(claimId)) return claimById.has(claimId) ? [claimId] : [];
    if (visited.has(claimId)) throw new TypeError('REOPEN_EVIDENCE_SUPERSESSION_CYCLE');
    const nextVisited = new Set(visited); nextVisited.add(claimId);
    return sortedUnique((predecessors.get(claimId) ?? []).flatMap((/** @type {string} */ id) =>
      restoredClaimIds(id, nextVisited)));
  };
  /** @type {any[]} */
  const retained = originalClaims.filter((/** @type {any} */ claim) => !removedClaimIds.has(claim.claim_id));
  for (const claim of retained) {
    if (typeof claim.superseded_by === 'string' && removedClaimIds.has(claim.superseded_by)) {
      let cursor = claim.superseded_by;
      const visited = new Set();
      while (removedClaimIds.has(cursor)) {
        if (visited.has(cursor)) throw new TypeError('REOPEN_EVIDENCE_SUPERSESSION_CYCLE');
        visited.add(cursor);
        const successor = claimById.get(cursor)?.superseded_by;
        if (typeof successor !== 'string') { delete claim.superseded_by; break; }
        cursor = successor;
      }
      if (!removedClaimIds.has(cursor)) claim.superseded_by = cursor;
    }
    if (Array.isArray(claim.parent_claim_ids)) {
      claim.parent_claim_ids = sortedUnique(claim.parent_claim_ids.flatMap((/** @type {any} */ id) =>
        typeof id === 'string' ? restoredClaimIds(id) : []));
    }
  }
  /** @type {any[]} */
  const roots = Array.isArray(submittedRoots) ? submittedRoots.map((/** @type {any} */ root) =>
    record(root, 'REOPEN_ROOTS_INVALID')) : [];
  const reopenedFactIds = new Set(roots.flatMap((/** @type {any} */ root) => Array.isArray(root.subject_fact_ids)
    ? root.subject_fact_ids.filter((/** @type {any} */ id) => typeof id === 'string') : []));
  for (const fact of evidence.fact_ledger) {
    if (!reopenedFactIds.has(fact.fact_id)) continue;
    if (Array.isArray(fact.claim_ids)) {
      const restored = sortedUnique(fact.claim_ids.flatMap((/** @type {any} */ id) =>
        typeof id === 'string' ? restoredClaimIds(id) : []));
      if (restored.length === 0) throw new TypeError('REOPEN_EVIDENCE_ANCESTRY_MISSING');
      fact.claim_ids = restored;
    } else if (typeof fact.claim_id === 'string') {
      const restored = restoredClaimIds(fact.claim_id);
      if (restored.length !== 1) throw new TypeError('REOPEN_EVIDENCE_ANCESTRY_AMBIGUOUS');
      fact.claim_id = restored[0];
      if (Array.isArray(fact.source_claim_ids)) {
        fact.source_claim_ids = sortedUnique(fact.source_claim_ids.flatMap((/** @type {any} */ id) =>
          typeof id === 'string' ? restoredClaimIds(id) : []));
      }
    }
    fact.status = 'ambiguous';
  }
  evidence.claims = retained;
  return evidence;
}

/** @param {any} left @param {any} right */
function compareReopenRoots(left, right) {
  const risk = new Map([['critical', 0], ['high', 1], ['medium', 2], ['low', 3]]);
  return (risk.get(left.risk_level) ?? 4) - (risk.get(right.risk_level) ?? 4)
    || compareCodePoints(String(left.scope_ref), String(right.scope_ref))
    || compareCodePoints(String(left.missing_aspect), String(right.missing_aspect))
    || compareCodePoints(String(left.root_issue_id), String(right.root_issue_id));
}

/** @param {any} root @param {string} presentationId */
function reopenedQuestionPart(root, presentationId) {
  return {
    question_part_id: root.question_part_id, root_issue_id: root.root_issue_id,
    root_version_digest: root.root_version_digest, question: root.question,
    why_needed: root.why_needed, decision_impact: root.decision_impact,
    unresolved_outcome: root.unresolved_outcome, affected_facts: [...root.affected_facts],
    answer_options: [...root.answer_options], risk_level: root.risk_level,
    available_actions: [
      'answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery'
    ],
    action_context: {
      presentation_id: presentationId, question_part_id: root.question_part_id,
      root_issue_id: root.root_issue_id, root_version_digest: root.root_version_digest
    }
  };
}

/** @param {any} checkpoint @param {string|null} supersedesPresentationId */
function compileReopenedPresentation(checkpoint, supersedesPresentationId) {
  /** @type {Map<string,any>} */
  const roots = new Map(checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => [root.root_issue_id, root]));
  /** @type {any[]} */
  const pending = checkpoint.clarification_state.root_states
    .filter((/** @type {any} */ state) => state.status === 'presented')
    .map((/** @type {any} */ state) => roots.get(state.root_issue_id))
    .filter(Boolean).sort(compareReopenRoots);
  if (pending.length === 0) return null;
  const answeredPartIds = checkpoint.clarification_state.root_states
    .filter((/** @type {any} */ state) => state.status === 'resolved_final' || state.status === 'resolved_temporary')
    .map((/** @type {any} */ state) => state.question_part_id).sort(compareCodePoints);
  const remainingPartIds = pending.map((/** @type {any} */ root) => root.question_part_id).sort(compareCodePoints);
  const cycleDigest = canonicalDigest(pending.map((/** @type {any} */ root) => ({
    root_issue_id: root.root_issue_id,
    root_version_digest: root.root_version_digest,
    question_part_id: root.question_part_id
  })));
  const identity = {
    run_id: checkpoint.run_id, committed_revision: checkpoint.revision,
    committed_checkpoint_digest: checkpoint.base_checkpoint_digest,
    phase: 'requirements_analysis', cycle_digest: cycleDigest,
    supersedes_presentation_id: supersedesPresentationId
  };
  const presentationId = contentId('PRES', identity);
  return {
    schema_version: VERSION, presentation_id: presentationId,
    phase: 'requirements_analysis', supersedes_presentation_id: supersedesPresentationId,
    answered_part_ids: answeredPartIds, remaining_part_ids: remainingPartIds,
    cycle_digest: cycleDigest, run_actions: ['cancel_run'],
    recovery: {
      mode: 'append_clarification_event', run_id: checkpoint.run_id,
      committed_revision: checkpoint.revision,
      committed_checkpoint_digest: checkpoint.base_checkpoint_digest,
      after_partial_answer: 'issue_successor_for_remaining_parts'
    },
    question_parts: pending.map((/** @type {any} */ root) => reopenedQuestionPart(root, presentationId))
  };
}

/**
 * Compile the first sibling checkpoint from immutable parent state. Only the
 * selected roots receive a new version and return to `presented`.
 * @param {unknown} submittedSeed @param {unknown} submittedParentCheckpoint
 * @param {unknown} submittedProjectedEvidence @param {unknown} submittedScopeManifest
 */
export function compileSemanticReopenSiblingCheckpointV4(
  submittedSeed, submittedParentCheckpoint, submittedProjectedEvidence, submittedScopeManifest
) {
  const seed = record(submittedSeed, 'REOPEN_SIBLING_SEED_INVALID');
  const parent = record(submittedParentCheckpoint, 'REOPEN_PARENT_CHECKPOINT_INVALID');
  const evidence = record(submittedProjectedEvidence, 'REOPEN_EVIDENCE_INVALID');
  const scopeManifest = record(submittedScopeManifest, 'REOPEN_SCOPE_MANIFEST_INVALID');
  if (validateSemanticClarificationCheckpointV4(parent).length
    || canonicalStringify(parent.semantic_gap_ledger) !== canonicalStringify(seed.parent_semantic_gap_ledger)
    || canonicalStringify(parent.clarification_state?.root_states) !== canonicalStringify(seed.parent_root_states)) {
    throw new TypeError('REOPEN_PARENT_CHECKPOINT_INVALID');
  }
  const targets = normalizeTargets(seed.reopened_targets.map((/** @type {any} */ target) => ({
    root_issue_id: target.root_issue_id,
    prior_root_version_digest: target.prior_root_version_digest
  })));
  /** @type {Map<string,any>} */
  const targetByRoot = new Map(seed.reopened_targets.map((/** @type {any} */ target) => [target.root_issue_id, target]));
  validateTargetVersions(parent, targets);
  /** @type {any[]} */
  const semanticGapLedger = parent.semantic_gap_ledger.map((/** @type {any} */ root) => {
    const target = targetByRoot.get(root.root_issue_id);
    if (!target) return canonicalClone(root);
    const rootVersionDigest = target.reopened_root_version_digest;
    return {
      ...canonicalClone(root),
      semantic_gap_id: contentId('SG', {
        root_issue_id: root.root_issue_id, root_version_digest: rootVersionDigest
      }),
      root_version_digest: rootVersionDigest,
      question_part_id: contentId('QP', {
        root_issue_id: root.root_issue_id,
        root_version_digest: rootVersionDigest,
        missing_aspect: root.missing_aspect
      })
    };
  }).sort((/** @type {any} */ left, /** @type {any} */ right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
  /** @type {Map<string,any>} */
  const gapByRoot = new Map(semanticGapLedger.map((/** @type {any} */ root) => [root.root_issue_id, root]));
  /** @type {any[]} */
  const rootStates = parent.clarification_state.root_states.map((/** @type {any} */ state) => {
    if (!targetByRoot.has(state.root_issue_id)) return canonicalClone(state);
    const root = gapByRoot.get(state.root_issue_id);
    return {
      root_issue_id: state.root_issue_id, root_version_digest: root.root_version_digest,
      question_part_id: root.question_part_id, status: 'presented'
    };
  }).sort((/** @type {any} */ left, /** @type {any} */ right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
  /** @type {any} */
  const checkpoint = {
    schema_version: VERSION, compiler_version: COMPILER_VERSION,
    run_id: text(seed.run_id, 'REOPEN_SIBLING_SEED_INVALID'), revision: 0,
    commit_profile: 'pre_case_pending',
    source_review_witness: canonicalClone(parent.source_review_witness),
    fact_ledger_digest: canonicalDigest(evidence.fact_ledger),
    scope_manifest_digest: canonicalDigest(scopeManifest),
    behavior_views_digest: null, case_drafts_digest: null,
    // This is revision zero of a new durable run. The immutable parent
    // checkpoint remains available through the content-addressed seed, while
    // the sibling revision transaction must bind its own canonical genesis.
    base_checkpoint_digest: siblingGenesisDigest(seed.run_id),
    reopened_targets: canonicalClone(seed.reopened_targets),
    decision_suspension_ledger: normalizeSuspensionLedger(seed.decision_suspension_ledger),
    decision_reopen_overlay_digest: sha(
      seed.decision_reopen_overlay_digest, 'REOPEN_SIBLING_SEED_INVALID'
    ),
    semantic_gap_ledger: semanticGapLedger,
    clarification_state: {
      root_states: rootStates, answered_part_ids: [], remaining_part_ids: [],
      closed_for_delivery_part_ids: [], cycle_digest: canonicalDigest([]),
      latest_presentation_id: null, presentation: null, presentation_digest: null
    }
  };
  const supersedesPresentationId = typeof parent.clarification_state.latest_presentation_id === 'string'
    ? parent.clarification_state.latest_presentation_id : null;
  const presentation = compileReopenedPresentation(checkpoint, supersedesPresentationId);
  checkpoint.clarification_state.answered_part_ids = rootStates
    .filter((/** @type {any} */ state) => state.status === 'resolved_final' || state.status === 'resolved_temporary')
    .map((/** @type {any} */ state) => state.question_part_id).sort(compareCodePoints);
  checkpoint.clarification_state.remaining_part_ids = presentation?.remaining_part_ids ?? [];
  checkpoint.clarification_state.closed_for_delivery_part_ids = rootStates
    .filter((/** @type {any} */ state) => state.status === 'closed_for_delivery')
    .map((/** @type {any} */ state) => state.question_part_id).sort(compareCodePoints);
  checkpoint.clarification_state.cycle_digest = presentation?.cycle_digest ?? canonicalDigest([]);
  checkpoint.clarification_state.latest_presentation_id = presentation?.presentation_id ?? supersedesPresentationId;
  checkpoint.clarification_state.presentation = presentation;
  checkpoint.clarification_state.presentation_digest = presentation ? canonicalDigest(presentation) : null;
  const diagnostics = validateSemanticClarificationCheckpointV4(checkpoint);
  if (diagnostics.length) throw new TypeError(diagnostics[0].code);
  return canonicalClone(checkpoint);
}

/** @param {string} catalogRoot @param {any} seed */
async function compileProductionSiblingRevision(catalogRoot, seed) {
  const parentCheckpoint = await readInheritedObject(
    catalogRoot, seed.inherited_artifact_refs?.parent_checkpoint
  );
  const inheritedSource = await readInheritedObject(
    catalogRoot, seed.inherited_artifact_refs?.source_pack
  );
  const inheritedJournal = await readInheritedObject(
    catalogRoot, seed.inherited_artifact_refs?.decision_journal
  );
  const evidence = await readInheritedObject(catalogRoot, seed.inherited_artifact_refs?.evidence);
  const scopeArtifact = await readInheritedObject(
    catalogRoot, seed.inherited_artifact_refs?.scope_manifest
  );
  const scopeManifest = canonicalClone(scopeArtifact);
  delete scopeManifest.schema_version; delete scopeManifest.source_revision;
  const projectedEvidence = projectReopenedEvidenceV4(
    evidence, seed.decision_suspension_ledger, seed.parent_semantic_gap_ledger
      .filter((/** @type {any} */ root) => seed.reopened_targets.some(
        (/** @type {any} */ target) => target.root_issue_id === root.root_issue_id
      ))
  );
  projectedEvidence.source_revision = 0;
  const sourcePack = canonicalClone(record(inheritedSource, 'REOPEN_INHERITED_SOURCE_INVALID'));
  sourcePack.run_instance_id = seed.run_id;
  sourcePack.source_revision = 0;
  sourcePack.decision_records = canonicalClone(decisions(inheritedJournal));
  const checkpoint = compileSemanticReopenSiblingCheckpointV4(
    seed, parentCheckpoint, projectedEvidence, scopeManifest
  );
  const decisionJournal = {
    schema_version: VERSION, source_revision: 0,
    decisions: canonicalClone(sourcePack.decision_records)
  };
  const factLedger = {
    schema_version: VERSION, source_revision: 0,
    facts: canonicalClone(projectedEvidence.fact_ledger)
  };
  const persistedScopeManifest = {
    schema_version: VERSION, source_revision: 0, ...canonicalClone(scopeManifest)
  };
  const clarificationState = {
    schema_version: VERSION, source_revision: 0,
    ...canonicalClone(checkpoint.clarification_state)
  };
  const semanticDigest = canonicalDigest({
    source_semantic_digests: Array.isArray(sourcePack.sources)
      ? sourcePack.sources.map((/** @type {any} */ source) => source.semantic_digest) : [],
    evidence: projectedEvidence,
    clarification_state: checkpoint.clarification_state,
    decision_reopen_overlay_digest: seed.decision_reopen_overlay_digest
  });
  const appendIdentity = {
    run_id: seed.run_id, base_revision: null, candidate_revision: 0,
    reopen_event_id: seed.reopened_targets[0]?.decision_suspension?.reopen_event_id,
    decision_reopen_overlay_digest: seed.decision_reopen_overlay_digest,
    semantic_digest: semanticDigest
  };
  return {
    checkpoint,
    request: {
      append_id: `APPEND-semantic-reopen-${canonicalDigest(appendIdentity).slice('sha256:'.length)}`,
      append_digest: canonicalDigest(appendIdentity),
      base_revision: null, candidate_revision: 0,
      commit_profile: 'pre_case_pending', semantic_digest: semanticDigest,
      artifacts: {
        source_pack: jsonArtifact(sourcePack),
        decision_journal: jsonArtifact(decisionJournal),
        evidence_claims: jsonArtifact(projectedEvidence),
        fact_ledger: jsonArtifact(factLedger),
        scope_manifest: jsonArtifact(persistedScopeManifest),
        clarification_state: jsonArtifact(clarificationState),
        checkpoint: jsonArtifact(checkpoint)
      }
    }
  };
}

/** @param {string} catalogRoot @param {string} runDirectory @param {string} runId @param {string} intent */
async function requireRunInstance(catalogRoot, runDirectory, runId, intent) {
  const snapshot = await readJsonIfPresent(catalogRoot, path.join(runDirectory, 'run-instance.json'));
  if (!snapshot || validateAgainstSchema(snapshot.value, runInstanceSchema).length
    || snapshot.value.schema_version !== VERSION || snapshot.value.compiler_version !== COMPILER_VERSION
    || snapshot.value.run_id !== runId || snapshot.value.delivery_intent !== intent) {
    throw new RunStoreIntegrityError(`REOPEN_${intent === 'execution_plan' ? 'EXECUTION' : 'CASE_DOCUMENT'}_RUN_INVALID`);
  }
  return snapshot.value;
}

/** @param {string} catalogRoot @param {string} caseDirectory @param {any} reference */
async function readParentCase(catalogRoot, caseDirectory, reference) {
  const manifestText = await readTextIfPresent(catalogRoot, path.join(caseDirectory, 'output', 'current.json'));
  if (manifestText === null) throw new RunStoreIntegrityError('REOPEN_PARENT_MANIFEST_MISSING');
  if (byteDigest(manifestText) !== reference.manifest_digest) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_MANIFEST_DIGEST_MISMATCH');
  }
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { throw new RunStoreIntegrityError('REOPEN_PARENT_MANIFEST_INVALID'); }
  if (`${canonicalStringify(manifest)}\n` !== manifestText || manifest.run_id !== reference.run_id
    || manifest.revision !== reference.revision || manifest.delivery_intent !== 'case_document'
    || manifest.authority !== 'canonical' || !manifest.bundle?.path || !manifest.bundle?.digest) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_MANIFEST_INVALID');
  }
  const bundleText = await readTextIfPresent(catalogRoot, path.join(caseDirectory, manifest.bundle.path));
  if (bundleText === null || byteDigest(bundleText) !== reference.bundle_digest
    || manifest.bundle.digest !== reference.bundle_digest) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_BUNDLE_DIGEST_MISMATCH');
  }
  const revision = reference.revision;
  const keys = ['source_pack', 'decision_journal', 'evidence_claims', 'scope_manifest', 'checkpoint'];
  /** @type {Record<string,string>} */
  const artifactTexts = {};
  for (const key of keys) {
    const value = await readTextIfPresent(catalogRoot, revisionArtifactPathV4(caseDirectory, revision, key));
    if (value === null) throw new RunStoreIntegrityError('REOPEN_PARENT_ARTIFACT_MISSING');
    artifactTexts[key] = value;
  }
  const storedManifestText = await readTextIfPresent(
    catalogRoot, revisionArtifactPathV4(caseDirectory, revision, 'manifest')
  );
  const committed = await readJsonIfPresent(
    catalogRoot,
    path.join(caseDirectory, 'transactions', 'committed', `${revisionName(revision)}.json`)
  );
  const expectedDigests = {
    source_pack: byteDigest(artifactTexts.source_pack),
    decision_journal: byteDigest(artifactTexts.decision_journal),
    evidence_claims: byteDigest(artifactTexts.evidence_claims),
    scope_manifest: byteDigest(artifactTexts.scope_manifest),
    checkpoint: byteDigest(artifactTexts.checkpoint),
    bundle: byteDigest(bundleText),
    manifest: byteDigest(manifestText)
  };
  if (storedManifestText !== manifestText || !committed
    || committed.value.revision !== revision || committed.value.commit_profile !== 'final'
    || committed.value.delivery_manifest_digest !== expectedDigests.manifest) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_ARTIFACT_DIGEST_MISMATCH');
  }
  for (const [key, expectedDigest] of Object.entries(expectedDigests)) {
    if (committed.value.artifact_digests?.[key] !== expectedDigest) {
      throw new RunStoreIntegrityError('REOPEN_PARENT_ARTIFACT_DIGEST_MISMATCH');
    }
  }
  let checkpoint;
  let journal;
  try {
    checkpoint = JSON.parse(artifactTexts.checkpoint);
    journal = JSON.parse(artifactTexts.decision_journal);
  } catch { throw new RunStoreIntegrityError('REOPEN_PARENT_ARTIFACT_INVALID'); }
  if (checkpoint.run_id !== reference.run_id || checkpoint.revision !== revision
    || checkpoint.schema_version !== VERSION) throw new RunStoreIntegrityError('REOPEN_PARENT_CHECKPOINT_INVALID');
  return { manifest, manifestText, bundleText, artifactTexts, checkpoint, journal };
}

/**
 * Resolve reopenable semantic roots from the immutable Case Document named by
 * an execution Source Pack. Filesystem paths and root versions are never taken
 * from the execution event itself.
 * @param {string} catalogRoot @param {unknown} submittedReference
 */
export async function readCaseDocumentSemanticRootRefsV4(catalogRoot, submittedReference) {
  const reference = record(submittedReference, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  const caseRunId = text(reference.run_id, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  if (!Number.isSafeInteger(reference.revision) || reference.revision < 0) {
    throw new TypeError('REOPEN_CASE_DOCUMENT_REF_INVALID');
  }
  sha(reference.manifest_digest, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  sha(reference.bundle_digest, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  const caseDirectory = requireCatalogDescendant(
    catalogRoot, path.join(catalogRoot, 'runs', caseRunId)
  );
  const instance = await requireRunInstance(
    catalogRoot, caseDirectory, caseRunId, 'case_document'
  );
  const parent = await readParentCase(catalogRoot, caseDirectory, reference);
  validateParentSuspensionLineage(instance, parent.checkpoint);
  const states = new Map();
  for (const state of parent.checkpoint.clarification_state?.root_states ?? []) {
    if (states.has(state.root_issue_id)) {
      throw new RunStoreIntegrityError('REOPEN_PARENT_ROOT_STATE_INVALID');
    }
    states.set(state.root_issue_id, state);
  }
  const refs = [];
  for (const root of parent.checkpoint.semantic_gap_ledger ?? []) {
    const state = states.get(root.root_issue_id);
    if (!state || state.root_version_digest !== root.root_version_digest) {
      throw new RunStoreIntegrityError('REOPEN_PARENT_ROOT_STATE_INVALID');
    }
    if (state.status === 'obsolete') continue;
    refs.push({
      root_issue_id: root.root_issue_id,
      root_version_digest: root.root_version_digest
    });
  }
  const sorted = refs.sort((left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
  if (new Set(sorted.map((item) => item.root_issue_id)).size !== sorted.length) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_ROOT_STATE_INVALID');
  }
  return canonicalClone(sorted);
}

/** @param {any} checkpoint @param {any[]} targets */
function validateTargetVersions(checkpoint, targets) {
  const gaps = /** @type {any[]} */ (Array.isArray(checkpoint.semantic_gap_ledger) ? checkpoint.semantic_gap_ledger : []);
  const states = /** @type {any[]} */ (Array.isArray(checkpoint.clarification_state?.root_states)
    ? checkpoint.clarification_state.root_states : []);
  for (const target of targets) {
    const matches = gaps.filter((gap) => gap.root_issue_id === target.root_issue_id
      && gap.root_version_digest === target.prior_root_version_digest);
    const stateMatches = states.filter((state) => state.root_issue_id === target.root_issue_id
      && state.root_version_digest === target.prior_root_version_digest);
    if (matches.length !== 1 || stateMatches.length !== 1) {
      throw new RunStoreIntegrityError('REOPEN_ROOT_VERSION_STALE');
    }
  }
}

/** @param {any} instance @param {any} checkpoint */
function validateParentSuspensionLineage(instance, checkpoint) {
  const ledger = checkpoint.decision_suspension_ledger
    ?? checkpoint.clarification_state?.decision_suspension_ledger ?? [];
  if (instance.lineage?.creation_reason !== 'reopen_semantic_question') {
    if (Array.isArray(ledger) && ledger.length > 0) {
      throw new RunStoreIntegrityError('REOPEN_PARENT_SUSPENSION_LINEAGE_INVALID');
    }
    return;
  }
  const targets = instance.lineage.reopened_targets;
  const expectedDigest = instance.lineage.decision_reopen_overlay_digest;
  if (!Array.isArray(targets) || !SHA256.test(String(expectedDigest))
    || checkpoint.decision_reopen_overlay_digest !== expectedDigest
    || canonicalDigest({
      decision_suspension_ledger: normalizeSuspensionLedger(ledger),
      reopened_targets: canonicalClone(targets)
    }) !== expectedDigest) {
    throw new RunStoreIntegrityError('REOPEN_PARENT_SUSPENSION_LINEAGE_INVALID');
  }
}

/** @param {string} catalogRoot @param {string} executionDirectory @param {string} executionRunId */
async function activeExecution(catalogRoot, executionDirectory, executionRunId) {
  const snapshot = await readJsonIfPresent(catalogRoot, lifecyclePath(executionDirectory));
  if (!snapshot || snapshot.value.schema_version !== VERSION || snapshot.value.run_id !== executionRunId
    || snapshot.value.delivery_intent !== 'execution_plan' || snapshot.value.status !== 'active'
    || !Number.isSafeInteger(snapshot.value.version)) {
    throw new RunStoreIntegrityError('REOPEN_EXECUTION_NOT_ACTIVE');
  }
  return snapshot.value;
}

/** @param {any} transaction @param {string} phase */
function nextPhase(transaction, phase) {
  if (PHASES.indexOf(phase) !== PHASES.indexOf(transaction.phase) + 1) {
    throw new RunStoreIntegrityError('REOPEN_PHASE_TRANSITION_INVALID');
  }
  return { ...transaction, phase, phase_version: transaction.phase_version + 1 };
}

/** @param {any} hooks @param {string} phase */
async function phaseHook(hooks, phase) {
  if (typeof hooks?.after_phase === 'function') await hooks.after_phase(phase);
}

/** @param {any} checkpoint @param {any} seed */
function validateSiblingCheckpoint(checkpoint, seed) {
  if (!checkpoint || checkpoint.schema_version !== VERSION || checkpoint.compiler_version !== COMPILER_VERSION
    || checkpoint.run_id !== seed.run_id || checkpoint.revision !== 0
    || checkpoint.decision_reopen_overlay_digest !== seed.decision_reopen_overlay_digest
    || canonicalStringify(checkpoint.decision_suspension_ledger)
      !== canonicalStringify(seed.decision_suspension_ledger)) {
    throw new RunStoreIntegrityError('REOPEN_SIBLING_CHECKPOINT_INVALID');
  }
  if (validateSemanticClarificationCheckpointV4(checkpoint).length) {
    throw new RunStoreIntegrityError('REOPEN_SIBLING_CHECKPOINT_INVALID');
  }
  const states = /** @type {any[]} */ (Array.isArray(checkpoint.clarification_state?.root_states)
    ? checkpoint.clarification_state.root_states : []);
  for (const target of seed.reopened_targets) {
    const matches = states.filter((state) => state.root_issue_id === target.root_issue_id
      && state.root_version_digest === target.reopened_root_version_digest && state.status === 'presented');
    if (matches.length !== 1) throw new RunStoreIntegrityError('REOPEN_SIBLING_CHECKPOINT_INVALID');
  }
}

/** @param {any} transaction */
function resultFor(transaction) {
  return canonicalClone({
    status: 'semantic_reopen_committed', txn_id: transaction.txn_id,
    sibling_run_id: transaction.sibling_run_id,
    decision_reopen_overlay_digest: transaction.seed.decision_reopen_overlay_digest,
    reopened_targets: transaction.seed.reopened_targets
  });
}

/**
 * Catalog-scoped semantic reopen. Parent directories are resolved by trusted
 * compiler services rather than accepted from the user event. Production code
 * materializes and commits the complete sibling revision from the durable seed
 * before the parent execution can be superseded.
 * @param {string} catalogRoot
 * @param {unknown} submittedEvent
 * @param {{resolve_run_directory:(runId:string)=>string}} services
 * @param {{after_phase?:(phase:string)=>void|Promise<void>}} [hooks]
 */
export async function executeSemanticReopenTransactionV4(catalogRoot, submittedEvent, services, hooks = {}) {
  const event = record(submittedEvent, 'REOPEN_EVENT_INVALID');
  if (event.event_type !== 'reopen_semantic_question') throw new TypeError('REOPEN_EVENT_INVALID');
  const executionRunId = text(event.run_id, 'REOPEN_EVENT_INVALID');
  const reopenEventId = text(event.reopen_event_id, 'REOPEN_EVENT_INVALID').normalize('NFC');
  const reference = record(event.case_document_ref, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  const caseRunId = text(reference.run_id, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  if (!Number.isSafeInteger(reference.revision) || reference.revision < 0) {
    throw new TypeError('REOPEN_CASE_DOCUMENT_REF_INVALID');
  }
  sha(reference.manifest_digest, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  sha(reference.bundle_digest, 'REOPEN_CASE_DOCUMENT_REF_INVALID');
  const targets = normalizeTargets(event.root_refs);
  if (!services || typeof services.resolve_run_directory !== 'function') {
    throw new TypeError('REOPEN_SERVICES_INVALID');
  }
  const payload = {
    execution_run_id: executionRunId, reopen_event_id: reopenEventId,
    case_document_ref: canonicalClone(reference), targets
  };
  const payloadDigest = canonicalDigest(payload);
  const targetPath = transactionPath(catalogRoot, executionRunId, reopenEventId);
  const release = await acquireRunLock(catalogRoot);
  try {
    let snapshot = await readJsonIfPresent(catalogRoot, targetPath);
    let transaction = snapshot?.value ?? null;
    if (transaction) {
      if (transaction.payload_digest !== payloadDigest) {
        throw new RunStoreIntegrityError('REOPEN_EVENT_PAYLOAD_CONFLICT');
      }
      if (transaction.phase === 'complete') return canonicalClone(transaction.result);
    } else {
      const executionDirectory = requireCatalogDescendant(
        catalogRoot, services.resolve_run_directory(executionRunId)
      );
      const caseDirectory = requireCatalogDescendant(catalogRoot, services.resolve_run_directory(caseRunId));
      await requireRunInstance(catalogRoot, executionDirectory, executionRunId, 'execution_plan');
      const caseInstance = await requireRunInstance(
        catalogRoot, caseDirectory, caseRunId, 'case_document'
      );
      await activeExecution(catalogRoot, executionDirectory, executionRunId);
      const parent = await readParentCase(catalogRoot, caseDirectory, reference);
      validateParentSuspensionLineage(caseInstance, parent.checkpoint);
      validateTargetVersions(parent.checkpoint, targets);
      const priorLedger = parent.checkpoint.decision_suspension_ledger
        ?? parent.checkpoint.clarification_state?.decision_suspension_ledger ?? [];
      const overlay = deriveDecisionReopenOverlayV4({
        reopen_event_id: reopenEventId, targets,
        decisions: decisions(parent.journal), prior_suspension_ledger: priorLedger
      });
      const inherited = {
        source_pack_digest: byteDigest(parent.artifactTexts.source_pack),
        decision_journal_digest: byteDigest(parent.artifactTexts.decision_journal),
        evidence_digest: byteDigest(parent.artifactTexts.evidence_claims),
        scope_manifest_digest: byteDigest(parent.artifactTexts.scope_manifest)
      };
      const refs = /** @type {Record<string,string>} */ ({
        source_pack: inherited.source_pack_digest,
        decision_journal: inherited.decision_journal_digest,
        evidence: inherited.evidence_digest,
        scope_manifest: inherited.scope_manifest_digest,
        parent_checkpoint: byteDigest(parent.artifactTexts.checkpoint)
      });
      for (const [key, content] of Object.entries({
        source_pack: parent.artifactTexts.source_pack,
        decision_journal: parent.artifactTexts.decision_journal,
        evidence: parent.artifactTexts.evidence_claims,
        scope_manifest: parent.artifactTexts.scope_manifest,
        parent_checkpoint: parent.artifactTexts.checkpoint
      })) await writeImmutableText(catalogRoot, objectPath(catalogRoot, refs[key]), content);
      const hash = createHash('sha256').update(
        `${executionRunId}${reopenEventId}${canonicalStringify(targets)}`
      ).digest('hex');
      const transactionId = `REOPEN-${hash}`;
      const siblingRunId = `RUN-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
      const lineage = {
        creation_reason: 'reopen_semantic_question',
        parent_case_document_ref: canonicalClone(reference),
        parent_execution_run_id: executionRunId,
        reopen_event_id: reopenEventId,
        reopened_targets: overlay.reopened_targets,
        decision_reopen_overlay_digest: overlay.decision_reopen_overlay_digest,
        inherited_artifacts: inherited
      };
      const seed = {
        schema_version: VERSION, compiler_version: COMPILER_VERSION,
        run_id: siblingRunId, revision: 0,
        parent_checkpoint_digest: refs.parent_checkpoint,
        inherited_artifact_refs: Object.fromEntries(Object.entries(refs).map(([key, digestValue]) =>
          [key, { digest: digestValue, object_path: path.relative(catalogRoot, objectPath(catalogRoot, digestValue)) }])),
        parent_semantic_gap_ledger: canonicalClone(parent.checkpoint.semantic_gap_ledger),
        parent_root_states: canonicalClone(parent.checkpoint.clarification_state.root_states),
        reopened_targets: overlay.reopened_targets,
        decision_suspension_ledger: overlay.decision_suspension_ledger,
        decision_reopen_overlay_digest: overlay.decision_reopen_overlay_digest
      };
      transaction = {
        schema_version: VERSION, transaction_kind: 'semantic_reopen',
        txn_id: transactionId, payload_digest: payloadDigest,
        execution_run_id: executionRunId, case_document_run_id: caseRunId,
        reopen_event_id: reopenEventId, sibling_run_id: siblingRunId,
        created_at: new Date().toISOString(), lineage, seed,
        phase: 'reserved', phase_version: 1, result: null
      };
      await atomicWriteJson(catalogRoot, targetPath, transaction);
      await phaseHook(hooks, 'reserved');
    }

    const executionDirectory = requireCatalogDescendant(
      catalogRoot, services.resolve_run_directory(transaction.execution_run_id)
    );
    const siblingDirectory = requireCatalogDescendant(
      catalogRoot, services.resolve_run_directory(transaction.sibling_run_id)
    );
    if (transaction.phase === 'reserved') {
      const instance = {
        schema_version: VERSION, compiler_version: COMPILER_VERSION,
        run_id: transaction.sibling_run_id, delivery_intent: 'case_document',
        created_at: transaction.created_at, lineage: transaction.lineage
      };
      if (validateAgainstSchema(instance, runInstanceSchema).length) {
        throw new RunStoreIntegrityError('REOPEN_SIBLING_IDENTITY_INVALID');
      }
      const instancePath = path.join(siblingDirectory, 'run-instance.json');
      const existingInstance = await readJsonIfPresent(catalogRoot, instancePath);
      if (existingInstance && canonicalStringify(existingInstance.value) !== canonicalStringify(instance)) {
        throw new RunStoreIntegrityError('REOPEN_SIBLING_IDENTITY_CONFLICT');
      }
      if (!existingInstance) await atomicWriteJson(catalogRoot, instancePath, instance);
      const seedPath = path.join(siblingDirectory, 'staging', 'semantic-reopen-seed.json');
      const existingSeed = await readJsonIfPresent(catalogRoot, seedPath);
      if (existingSeed && canonicalStringify(existingSeed.value) !== canonicalStringify(transaction.seed)) {
        throw new RunStoreIntegrityError('REOPEN_SIBLING_SEED_CONFLICT');
      }
      if (!existingSeed) await atomicWriteJson(catalogRoot, seedPath, transaction.seed);
      const compiled = await compileProductionSiblingRevision(
        catalogRoot, canonicalClone(transaction.seed)
      );
      validateSiblingCheckpoint(compiled.checkpoint, transaction.seed);
      await commitRevisionTransactionV4(siblingDirectory, compiled.request);
      const checkpoint = await readJsonIfPresent(
        catalogRoot, path.join(siblingDirectory, 'checkpoint.json')
      );
      validateSiblingCheckpoint(checkpoint?.value, transaction.seed);
      await phaseHook(hooks, 'sibling_revision_committed');
      transaction = nextPhase(transaction, 'sibling_committed');
      await atomicWriteJson(catalogRoot, targetPath, transaction);
      await phaseHook(hooks, 'sibling_committed');
    }
    if (transaction.phase === 'sibling_committed') {
      const lifecycle = await readJsonIfPresent(catalogRoot, lifecyclePath(executionDirectory));
      if (!lifecycle) throw new RunStoreIntegrityError('REOPEN_EXECUTION_NOT_ACTIVE');
      if (lifecycle.value.status === 'active') {
        await atomicWriteJson(catalogRoot, lifecyclePath(executionDirectory), {
          schema_version: VERSION, run_id: transaction.execution_run_id,
          delivery_intent: 'execution_plan', status: 'superseded_by_semantic_reopen',
          version: lifecycle.value.version + 1,
          superseded_by: transaction.sibling_run_id,
          semantic_reopen_txn_id: transaction.txn_id
        });
      } else if (lifecycle.value.status !== 'superseded_by_semantic_reopen'
        || lifecycle.value.superseded_by !== transaction.sibling_run_id
        || lifecycle.value.semantic_reopen_txn_id !== transaction.txn_id) {
        throw new RunStoreIntegrityError('REOPEN_EXECUTION_STATE_CONFLICT');
      }
      transaction = nextPhase(transaction, 'execution_superseded');
      await atomicWriteJson(catalogRoot, targetPath, transaction);
      await phaseHook(hooks, 'execution_superseded');
    }
    if (transaction.phase !== 'execution_superseded') throw new RunStoreIntegrityError('REOPEN_PHASE_INVALID');
    const result = resultFor(transaction);
    transaction = { ...nextPhase(transaction, 'complete'), result };
    await atomicWriteJson(catalogRoot, targetPath, transaction);
    await phaseHook(hooks, 'complete');
    return canonicalClone(result);
  } finally {
    await release();
  }
}

/** @param {string} catalogRoot @param {string} executionRunId @param {string} reopenEventId */
export async function readSemanticReopenTransactionV4(catalogRoot, executionRunId, reopenEventId) {
  const snapshot = await readJsonIfPresent(
    catalogRoot,
    transactionPath(catalogRoot, text(executionRunId, 'REOPEN_EVENT_INVALID'), text(reopenEventId, 'REOPEN_EVENT_INVALID'))
  );
  return snapshot?.value ?? null;
}
