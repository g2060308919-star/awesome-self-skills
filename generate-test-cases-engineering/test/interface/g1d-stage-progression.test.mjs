import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { stableId } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { buildJourney } from '../helpers/run-journey.mjs';
import { completeSourcePack } from '../helpers/source-pack.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(
  repositoryRoot, 'test/fixtures/recovery/grounded-revision.json'
);

async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stageName @param {any} artifact */
async function stage(runDirectory, stageName, artifact) {
  if (stageName === 'source_pack') {
    let runInstance;
    try {
      runInstance = JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8'));
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
      await advanceStrict(runDirectory);
      runInstance = JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8'));
    }
    artifact.run_instance_id = runInstance.run_instance_id;
  }
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(
    path.join(runDirectory, 'staging', STAGE_FILES[stageName]),
    `${JSON.stringify(artifact)}\n`, 'utf8'
  );
}

/** @param {string} runDirectory @param {any} revision */
async function submitCompleteRevision(runDirectory, revision) {
  /** @type {any} */
  let reply;
  for (const stageName of [
    /** @type {const} */ ('source_pack'), /** @type {const} */ ('evidence_claims'),
    /** @type {const} */ ('behavior_views'), /** @type {const} */ ('case_drafts')
  ]) {
    await stage(runDirectory, stageName, revision[stageName]);
    reply = await advanceStrict(runDirectory);
  }
  return reply;
}

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/** @param {string} runDirectory @param {any} reply */
async function recoveryObservation(runDirectory, reply) {
  return {
    status: reply.status,
    diagnostic_codes: (reply.diagnostics ?? []).map((/** @type {any} */ item) => item.code),
    current_exists: await exists(path.join(runDirectory, 'output/current.json')),
    bundle_exists: await exists(path.join(runDirectory, 'output/r000/test-bundle.json'))
  };
}

/** @param {any} revision */
function makeAnswerableConflict(revision) {
  revision.source_pack.sources.push({
    source_id: 'source_old', kind: 'formal-rule', version: '0', status: 'effective',
    authority: 'owner', content: 'checkout rejected',
    content_digest: '8e326c5917f32d5b88099c533c75f37410af7e8dc896faaca1e5b57dffd77eff', scope: 'checkout'
  });
  revision.source_pack.source_policy.rules.push({
    rule_id: 'policy_old', source_ids: ['source_old'], scope: 'checkout',
    authority: 'owner', status: 'effective'
  });
  revision.source_pack.decision_records = [{
    decision_id: 'decision_checkout', question_id: 'question_temp',
    presentation_id: 'presentation_accepted_checkout', decision_group_ids: ['group_accepted_checkout'],
    root_issue_ids: ['root_unrelated'],
    affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: 'Temporary checkout?', answer: 'checkout accepted', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E1'
  }];
  const claim = revision.evidence_claims.claims[0];
  delete claim.source_id;
  Object.assign(claim, {
    claim_form: 'decision-record', level: 'E1', kind: 'assumption',
    decision_id: 'decision_checkout', authority: 'checkout'
  });
  revision.case_drafts.cases[0].temporary_assumption = {
    claim_id: 'claim_checkout',
    invalidation_condition: 'A final rule replaces this temporary decision.'
  };
  completeSourcePack(revision.source_pack, revision.evidence_claims);
  return revision;
}

/** @param {any} pending @param {string} variant */
function revisionOneSource(pending, variant) {
  const next = structuredClone(pending.revision.source_pack);
  next.source_revision = 1;
  const rootIds = pending.reply.blockers.map((/** @type {any} */ item) => item.root_issue_id);
  const affectedIds = [...new Set(pending.reply.blockers.flatMap(
    (/** @type {any} */ item) => item.affected_obligation_ids
  ))].sort();
  const binding = {
    presentation_id: pending.reply.presentation_id,
    decision_group_ids: pending.reply.groups.map((/** @type {any} */ group) => group.group_id)
  };
  if (variant === 'invalid-delivery') next.clarification_events.push({
    event_id: 'event_invalid_delivery', clarification_event_seq: 2,
    type: 'request_delivery', actor: 'owner', event_at: '2026-08-31',
    ...binding, root_issue_ids: ['root_not_pending']
  });
  else if (variant === 'invalid-reopen') next.clarification_events.push({
    event_id: 'event_invalid_reopen', clarification_event_seq: 2,
    type: 'reopen_root_issues', actor: 'owner', event_at: '2026-08-31',
    ...binding, root_issue_ids: rootIds
  });
  else if (variant === 'invalid-decision') next.decision_records.push({
    ...binding, decision_id: 'decision_invalid_answer', question_id: 'question_not_the_pending_set',
    root_issue_ids: rootIds, affected_obligation_ids: affectedIds,
    clarification_event_seq: 2, confirmer: 'owner', confirmed_at: '2026-08-31',
    question: pending.reply.blockers[0].question, answer: 'checkout accepted',
    disposition: 'final', authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E3'
  });
  else if (variant === 'valid-decision') next.decision_records.push({
    ...binding, decision_id: 'decision_valid_answer',
    question_id: stableId('question', { root_issue_ids: rootIds }),
    root_issue_ids: rootIds, affected_obligation_ids: affectedIds,
    clarification_event_seq: 2, confirmer: 'owner', confirmed_at: '2026-08-31',
    question: pending.reply.blockers[0].question, answer: 'checkout accepted',
    disposition: 'final', authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E3'
  });
  else next.clarification_events.push({
    event_id: 'event_valid_delivery', clarification_event_seq: 2,
    type: 'request_delivery', actor: 'owner', event_at: '2026-08-31',
    ...binding, root_issue_ids: rootIds
  });
  return next;
}

/** @param {Record<string, unknown>} sourcePack */
function invalidDecisionWithoutPriorLifecycle(sourcePack) {
  const next = structuredClone(sourcePack);
  next.source_revision = 1;
  (/** @type {any[]} */ (next.decision_records)).push({
    decision_id: 'decision_without_prior_lifecycle',
    presentation_id: 'presentation_without_prior_lifecycle',
    decision_group_ids: ['group_without_prior_lifecycle'],
    question_id: 'question_forged_without_prior_lifecycle',
    root_issue_ids: ['root_forged_without_prior_lifecycle'],
    affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-31',
    question: 'Forged question?', answer: 'Forged answer.', disposition: 'final',
    authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_checkout', evidence_level: 'E3'
  });
  return next;
}

test('stage progression rejects clarification append when the prior revision is incomplete', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-incomplete-prior-'));
  const revision = await fixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const acceptedR0 = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(acceptedR0.status, 'need_artifact', JSON.stringify(acceptedR0));
    assert.equal(acceptedR0.stage, 'evidence_claims');

    await stage(
      runDirectory, 'source_pack', invalidDecisionWithoutPriorLifecycle(revision.source_pack)
    );
    const rejected = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.equal(rejected.stage, 'source_pack', JSON.stringify(rejected));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));

    await rm(path.join(runDirectory, 'staging/source-pack.json'));
    const resumed = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(resumed.status, 'need_artifact', JSON.stringify(resumed));
    assert.equal(resumed.stage, 'evidence_claims');
    assert.equal(resumed.scope.source_revision, 0);
    assert.match(resumed.scope.run_instance_id, /^RUN-/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('stage progression rebuilds missing prior clarification state before append validation', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-missing-prior-state-'));
  try {
    const revision = makeAnswerableConflict(await fixture());
    const pendingReply = await submitCompleteRevision(runDirectory, revision);
    assert.equal(pendingReply.status, 'need_user_answers', JSON.stringify(pendingReply));
    const pending = { revision, reply: pendingReply };
    const statePath = path.join(runDirectory, 'derived/r000/clarification-state.json');
    await rm(statePath);

    await stage(runDirectory, 'source_pack', revisionOneSource(pending, 'invalid-delivery'));
    const rejected = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.equal(rejected.stage, 'source_pack', JSON.stringify(rejected));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));
    await stat(statePath);

    await stage(runDirectory, 'source_pack', revisionOneSource(pending, 'valid-delivery'));
    const corrected = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(corrected.status, 'need_artifact', JSON.stringify(corrected));
    assert.equal(corrected.stage, 'evidence_claims');
    assert.equal(corrected.scope.source_revision, 1);
    assert.match(corrected.scope.run_instance_id, /^RUN-/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('case-classification blockers retain only formal-related evidence across delivery revision preflight', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-case-blocker-revision-'));
  try {
    const revision = await fixture();
    revision.evidence_claims.claims.push({
      claim_id: 'claim_observer', claim_form: 'direct', level: 'E3', kind: 'description',
      scope: 'checkout', value: 'The tester can inspect an auxiliary observer.',
      source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    });
    const draft = revision.case_drafts.cases[0];
    draft.testability_profile.capabilities[0].provenance_ref = 'claim_observer';
    draft.cleanup.support_review = 'uncertain';
    draft.evidence_refs = ['claim_checkout', 'claim_observer'];

    const pendingReply = await submitCompleteRevision(runDirectory, revision);
    assert.equal(pendingReply.status, 'need_user_answers', JSON.stringify(pendingReply));
    const priorState = JSON.parse(await readFile(
      path.join(runDirectory, 'derived/r000/clarification-state.json'), 'utf8'
    ));
    const leaksUnrelatedEvidence = priorState.root_snapshot_ledger.some(
      (/** @type {any} */ root) => root.evidence_refs.includes('claim_observer')
    );
    const retainsFormalEvidence = priorState.root_snapshot_ledger.every(
      (/** @type {any} */ root) => root.evidence_refs.includes('claim_checkout')
    );

    const nextSource = structuredClone(revision.source_pack);
    nextSource.source_revision = 1;
    nextSource.clarification_events.push({
      event_id: 'event_case_blocker_delivery', clarification_event_seq: 1,
      type: 'request_delivery', actor: 'owner', event_at: '2026-09-02',
      presentation_id: pendingReply.presentation_id,
      decision_group_ids: pendingReply.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: pendingReply.blockers.map(
        (/** @type {any} */ blocker) => blocker.root_issue_id
      )
    });
    await stage(runDirectory, 'source_pack', nextSource);
    const advanced = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(advanced.scope.source_revision, 1);
    assert.match(advanced.scope.run_instance_id, /^RUN-/u);
    assert.deepEqual({
      leaks_unrelated_evidence: leaksUnrelatedEvidence,
      retains_formal_evidence: retainsFormalEvidence,
      reply: observableReply(advanced)
    }, {
      leaks_unrelated_evidence: false,
      retains_formal_evidence: true,
      reply: {
        status: 'need_artifact', stage: 'evidence_claims',
        schema_ref: 'evidence-claims.schema.json', diagnostic_codes: []
      }
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('stage progression never uses orphan clarification state to bypass an incomplete prior revision', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-orphan-prior-state-'));
  try {
    const revision = makeAnswerableConflict(await fixture());
    const pendingReply = await submitCompleteRevision(runDirectory, revision);
    assert.equal(pendingReply.status, 'need_user_answers', JSON.stringify(pendingReply));
    const pending = { revision, reply: pendingReply };
    await rm(path.join(runDirectory, 'accepted/r000/case-drafts.json'));

    await stage(runDirectory, 'source_pack', revisionOneSource(pending, 'invalid-delivery'));
    const rejected = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.equal(rejected.stage, 'source_pack', JSON.stringify(rejected));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));

    await rm(path.join(runDirectory, 'staging/source-pack.json'));
    const resumed = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(resumed.status, 'need_artifact', JSON.stringify(resumed));
    assert.equal(resumed.stage, 'case_drafts');
    assert.equal(resumed.scope.source_revision, 0);
    assert.match(resumed.scope.run_instance_id, /^RUN-/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('accepted-run reinvoke rejects a forged delivered clarification state before publishing output', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-reinvoke-forged-stop-'));
  try {
    const revision = buildJourney('clarification-grounded');
    const pending = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const statePath = path.join(runDirectory, 'derived/r000/clarification-state.json');
    const forged = JSON.parse(await readFile(statePath, 'utf8'));
    forged.root_issue_dispositions[0].status = 'suppressed_deferred';
    forged.last_pending_root_issue_ids = [];
    forged.last_question_set_digest = '';
    forged.clarification_stop = { reason: 'user_requested_delivery', source_revision: 0 };
    await writeFile(statePath, `${JSON.stringify(forged)}\n`, 'utf8');

    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.deepEqual(await recoveryObservation(runDirectory, reply), {
      status: 'fatal', diagnostic_codes: ['RUN_INTEGRITY_ERROR'],
      current_exists: true, bundle_exists: false
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('accepted-run reinvoke rejects a forged clarification event sequence before replying', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-reinvoke-forged-seq-'));
  try {
    const revision = buildJourney('clarification-grounded');
    const pending = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const statePath = path.join(runDirectory, 'derived/r000/clarification-state.json');
    const forged = JSON.parse(await readFile(statePath, 'utf8'));
    forged.clarification_event_seq = 1;
    await writeFile(statePath, `${JSON.stringify(forged)}\n`, 'utf8');

    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.deepEqual(await recoveryObservation(runDirectory, reply), {
      status: 'fatal', diagnostic_codes: ['RUN_INTEGRITY_ERROR'],
      current_exists: true, bundle_exists: false
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('accepted-run reinvoke rebuilds missing clarification state and returns the same owned reply', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-reinvoke-missing-state-'));
  try {
    const revision = makeAnswerableConflict(await fixture());
    const pending = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const statePath = path.join(runDirectory, 'derived/r000/clarification-state.json');
    await rm(statePath);

    const recovered = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.deepEqual(recovered, pending);
    await stat(statePath);
    assert.deepEqual(await recoveryObservation(runDirectory, recovered), {
      status: 'need_user_answers', diagnostic_codes: [],
      current_exists: true, bundle_exists: false
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('stage progression rejects invalid r001 clarification append before Source Pack promotion', async (/** @type {any} */ t) => {
  for (const variant of ['invalid-delivery', 'invalid-reopen', 'invalid-decision']) {
    await t.test(variant, async () => {
      const runDirectory = await mkdtemp(path.join(os.tmpdir(), `g1d-poison-${variant}-`));
      try {
        const revision = makeAnswerableConflict(await fixture());
        const pendingReply = await submitCompleteRevision(runDirectory, revision);
        assert.equal(pendingReply.status, 'need_user_answers', JSON.stringify(pendingReply));
        const pending = { revision, reply: pendingReply };

        await stage(runDirectory, 'source_pack', revisionOneSource(pending, variant));
        const invalidReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(invalidReply.status, 'need_revision', JSON.stringify(invalidReply));
        assert.equal(invalidReply.stage, 'source_pack', JSON.stringify(invalidReply));
        await assert.rejects(stat(path.join(runDirectory, 'accepted/r001/source-pack.json')));

        const correction = variant === 'invalid-decision' ? 'valid-decision' : 'valid-delivery';
        await stage(runDirectory, 'source_pack', revisionOneSource(pending, correction));
        const correctedReply = /** @type {any} */ (await advanceStrict(runDirectory));
        assert.equal(correctedReply.status, 'need_artifact', JSON.stringify(correctedReply));
        assert.equal(correctedReply.stage, 'evidence_claims');
        assert.equal(correctedReply.scope.source_revision, 1);
        assert.match(correctedReply.scope.run_instance_id, /^RUN-/u);
        await stat(path.join(runDirectory, 'accepted/r001/source-pack.json'));
      } finally {
        await rm(runDirectory, { recursive: true, force: true });
      }
    });
  }
});

/** @param {any} reply */
function observableReply(reply) {
  return {
    status: reply.status,
    ...(reply.stage ? { stage: reply.stage } : {}),
    ...(reply.schema_ref ? { schema_ref: reply.schema_ref } : {}),
    ...(Number.isSafeInteger(reply.source_revision)
      ? { source_revision: reply.source_revision } : {}),
    ...(reply.bundle_digest ? { bundle_digest: reply.bundle_digest } : {}),
    diagnostic_codes: (reply.diagnostics ?? []).map((/** @type {any} */ item) => item.code)
  };
}

/** @param {boolean} forged */
async function runJourney(forged) {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), `g1d-forged-${forged}-`));
  const revision = await fixture();
  const forgedObligations = '{"forged":"test-obligations"}\n';
  const forgedVerification = '{"forged":"verification"}\n';
  try {
    if (forged) {
      await mkdir(path.join(runDirectory, 'staging'));
      await writeFile(
        path.join(runDirectory, 'staging/test-obligations.json'), forgedObligations, 'utf8'
      );
      await writeFile(
        path.join(runDirectory, 'staging/verification.json'), forgedVerification, 'utf8'
      );
    }
    const replies = [observableReply(await advanceStrict(runDirectory))];
    let lastReply;
    for (const stageName of [
      /** @type {const} */ ('source_pack'), /** @type {const} */ ('evidence_claims'),
      /** @type {const} */ ('behavior_views'), /** @type {const} */ ('case_drafts')
    ]) {
      await stage(runDirectory, stageName, revision[stageName]);
      lastReply = await advanceStrict(runDirectory);
      replies.push(observableReply(lastReply));
    }
    assert.equal(lastReply.status, 'need_user_answers');
    assert.equal(lastReply.purpose, 'final_confirmation');
    const confirmed = structuredClone(revision);
    for (const artifact of [
      confirmed.source_pack, confirmed.evidence_claims,
      confirmed.behavior_views, confirmed.case_drafts
    ]) artifact.source_revision = 1;
    confirmed.source_pack.execution_events.push({
      event_id: 'event_confirm_forged_staging_test',
      clarification_event_seq: lastReply.next_event_seq,
      type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
      authority_scope: '*', run_instance_id: confirmed.source_pack.run_instance_id,
      run_identity_digest: lastReply.execution_plan.run_identity_digest,
      presented_prompt_id: lastReply.prompt_id,
      presented_plan_digest: lastReply.execution_plan.plan_digest,
      presented_plan_change_head_seq: lastReply.execution_plan.plan_change_head_seq,
      presented_source_revision: 0
    });
    for (const stageName of [
      /** @type {const} */ ('source_pack'), /** @type {const} */ ('evidence_claims'),
      /** @type {const} */ ('behavior_views'), /** @type {const} */ ('case_drafts')
    ]) {
      await stage(runDirectory, stageName, confirmed[stageName]);
      lastReply = await advanceStrict(runDirectory);
      replies.push(observableReply(lastReply));
    }
    assert.equal(lastReply.status, 'finished', JSON.stringify(lastReply));
    const bundle = JSON.parse(await readFile(
      path.join(runDirectory, 'output/r001/test-bundle.json'), 'utf8'
    ));
    const obligations = JSON.parse(await readFile(
      path.join(runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
    if (forged) {
      assert.equal(
        await readFile(path.join(runDirectory, 'staging/test-obligations.json'), 'utf8'),
        forgedObligations
      );
      assert.equal(
        await readFile(path.join(runDirectory, 'staging/verification.json'), 'utf8'),
        forgedVerification
      );
    }
    return { replies, bundle, obligations };
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

test('stage progression ignores forged derived staging for replies coverage obligations and bundle', async () => {
  const clean = await runJourney(false);
  const forged = await runJourney(true);
  assert.deepEqual(forged.replies, clean.replies);
  assert.deepEqual(forged.obligations, clean.obligations);
  assert.deepEqual(forged.bundle.coverage, clean.bundle.coverage);
  assert.deepEqual(forged.bundle, clean.bundle);
});
