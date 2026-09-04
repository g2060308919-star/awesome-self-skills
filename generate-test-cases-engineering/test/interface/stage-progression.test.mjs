import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { stableId } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { resolveSourcePolicy } from '../../src/source-policy.mjs';
import { completeSourcePack } from '../helpers/source-pack.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const fixturePath = path.join(repositoryRoot, 'test/fixtures/recovery/grounded-revision.json');
const integrationFixturePath = path.join(repositoryRoot, 'test/fixtures/views/integration-obligations.json');
const entryPath = path.join(repositoryRoot, 'src/entry.mjs');
const stdoutFailurePreload = path.join(
  repositoryRoot, 'test/fixtures/recovery/stdout-write-failure.cjs'
);

/** @returns {Promise<any>} */
async function fixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

/** @param {string} [label] */
async function temporaryRun(label = 'stage progression') {
  return mkdtemp(path.join(os.tmpdir(), `${label} 空格-测试-`));
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
  const staging = path.join(runDirectory, 'staging');
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, STAGE_FILES[stageName]), `${JSON.stringify(artifact)}\n`, 'utf8');
}

/** @param {string} runDirectory @returns {Promise<any>} */
async function advance(runDirectory) { return advanceStrict(runDirectory); }

/** @param {string} runDirectory @param {any} revision */
async function submitCompleteRevision(runDirectory, revision) {
  /** @type {Array<keyof typeof STAGE_FILES>} */
  const stages = ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'];
  let reply;
  for (const stageName of stages) {
    await stage(runDirectory, stageName, revision[stageName]);
    reply = await advance(runDirectory);
  }
  return reply;
}

/** Drive only the private execution-decision/final-confirmation tail. */
/** @param {string} runDirectory @param {any} submitted @param {any} initialReply */
async function finishExecutionClosure(runDirectory, submitted, initialReply) {
  let revision = structuredClone(submitted);
  let reply = initialReply;
  for (let attempt = 0; attempt < 3 && reply.status === 'need_user_answers'; attempt += 1) {
    const next = structuredClone(revision);
    setRevision(next, next.source_pack.source_revision + 1);
    const plan = reply.execution_plan;
    const sequence = reply.next_event_seq;
    if (reply.purpose === 'execution_closure') {
      const reasons = {
        conditional: 'temporary_rule_unconfirmed', blocked: 'business_rule_missing',
        exploratory: 'risk_not_adopted'
      };
      next.source_pack.execution_events.push({
        event_id: `event_test_decisions_${sequence}`, clarification_event_seq: sequence,
        type: 'set_dispositions', actor: 'test-operator', event_at: '2026-09-03T00:00:00.000Z',
        authority_scope: '*', run_instance_id: next.source_pack.run_instance_id,
        run_identity_digest: plan.run_identity_digest,
        presented_plan_digest: plan.plan_digest,
        presented_presentation_id: reply.presentation_id,
        decision_group_ids: reply.groups.map((/** @type {any} */ group) => group.group_id),
        decisions: reply.pending_items.map((/** @type {any} */ item) => ({
          item_kind: item.item_kind, item_id: item.item_id,
          item_semantic_digest: item.item_semantic_digest,
          item_semantic_change_head_seq: item.item_semantic_change_head_seq,
          execution_disposition: 'do_not_execute',
          reason_code: reasons[/** @type {keyof typeof reasons} */ (item.semantic_status)] ?? 'other_explicit',
          reason: 'Explicitly excluded by the test operator.'
        }))
      });
    } else if (reply.purpose === 'final_confirmation') {
      next.source_pack.execution_events.push({
        event_id: `event_test_confirmation_${sequence}`, clarification_event_seq: sequence,
        type: 'confirm_execution_plan', actor: 'test-operator', event_at: '2026-09-03T00:00:00.000Z',
        authority_scope: '*', run_instance_id: next.source_pack.run_instance_id,
        run_identity_digest: plan.run_identity_digest,
        presented_prompt_id: reply.prompt_id,
        presented_plan_digest: plan.plan_digest,
        presented_plan_change_head_seq: plan.plan_change_head_seq,
        presented_source_revision: reply.source_revision
      });
    } else return reply;
    reply = await submitCompleteRevision(runDirectory, next);
    revision = next;
  }
  return reply;
}

/** @param {any} revision */
function makeAnswerableConflict(revision) {
  revision.source_pack.sources.push({
    source_id: 'source_old', kind: 'formal-rule', version: '0', status: 'effective',
    authority: 'owner', content: 'checkout rejected',
    content_digest: '8e326c5917f32d5b88099c533c75f37410af7e8dc896faaca1e5b57dffd77eff',
    scope: 'checkout'
  });
  revision.source_pack.source_policy.rules.push({
    rule_id: 'policy_old', source_ids: ['source_old'], scope: 'checkout',
    authority: 'owner', status: 'effective'
  });
  revision.source_pack.decision_records = [{
    decision_id: 'decision_checkout', question_id: 'question_temp',
    presentation_id: 'presentation_accepted_checkout', decision_group_ids: ['group_accepted_checkout'],
    root_issue_ids: ['root_unrelated'], affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: 'Temporary checkout?', answer: 'checkout accepted', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_checkout',
    evidence_level: 'E1'
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

/** @param {any} revision @param {number} sourceRevision */
function setRevision(revision, sourceRevision) {
  for (const stageName of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
    revision[stageName].source_revision = sourceRevision;
  }
}

test('real advanceStrict progresses every fixed artifact stage and atomically publishes output', async () => {
  const runDirectory = await temporaryRun();
  const revision = await fixture();
  try {
    const initial = await advance(runDirectory);
    assert.match(initial.scope.run_instance_id, /^RUN-[0-9a-f-]{36}$/u);
    revision.source_pack.run_instance_id = initial.scope.run_instance_id;
    assert.deepEqual({ ...initial, scope: { source_revision: initial.scope.source_revision } }, {
      status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json',
      scope: { source_revision: 0 }, diagnostics: []
    });

    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stat(path.join(runDirectory, 'accepted/r000/source-pack.json'));

    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    assert.equal((await advance(runDirectory)).stage, 'behavior_views');

    await stage(runDirectory, 'behavior_views', revision.behavior_views);
    const caseRequest = await advance(runDirectory);
    assert.equal(caseRequest.status, 'need_artifact');
    assert.equal(caseRequest.stage, 'case_drafts');
    const derived = JSON.parse(await readFile(
      path.join(runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
    assert.equal(derived.obligations.length, 1);
    assert.equal(derived.obligations[0].obligation_id, 'obligation_8cc31c1b2773c94c');

    await stage(runDirectory, 'case_drafts', revision.case_drafts);
    const awaitingConfirmation = await advance(runDirectory);
    assert.equal(awaitingConfirmation.purpose, 'final_confirmation');
    const finished = await finishExecutionClosure(runDirectory, revision, awaitingConfirmation);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.source_revision, 1);
    assert.equal(finished.bundle_path, path.join(runDirectory, 'output/r001/test-bundle.json'));
    assert.equal(finished.markdown_path, path.join(runDirectory, 'output/r001/test-cases.md'));
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'ready');
    assert.equal(current.source_revision, 1);
    assert.equal(current.bundle_path, finished.bundle_path);
    assert.equal(current.bundle_digest, finished.bundle_digest);
    assert.equal(current.plan_digest, finished.plan_digest);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('case execution-signature mistakes stay repairable and never become business clarification roots', async () => {
  // Production defect caught: an Agent copied a compiler oracle_* semantic ID into
  // oracle_refs, the runner accepted it as business Blocked, and delivery froze the
  // false root. Rule reversal caught: accepting the draft or returning
  // need_user_answers instead of need_revision(case_drafts) must fail this test.
  const runDirectory = await temporaryRun('signature repair');
  const revision = await fixture();
  revision.case_drafts.cases[0].testability_profile.capabilities[0].status = 'unavailable';
  const validCaseDrafts = structuredClone(revision.case_drafts);
  revision.case_drafts.cases[0].execution_signature.oracle_refs = [
    'oracle_deadbeefdeadbeef'
  ];
  const invalidCaseDrafts = structuredClone(revision.case_drafts);
  try {
    assert.equal((await advance(runDirectory)).stage, 'source_pack');
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    assert.equal((await advance(runDirectory)).stage, 'behavior_views');
    await stage(runDirectory, 'behavior_views', revision.behavior_views);
    assert.equal((await advance(runDirectory)).stage, 'case_drafts');

    await stage(runDirectory, 'case_drafts', revision.case_drafts);
    const repair = await advance(runDirectory);
    assert.equal(repair.status, 'need_revision', JSON.stringify(repair));
    assert.equal(repair.stage, 'case_drafts');
    assert.equal(repair.schema_ref, 'case-drafts.schema.json');
    assert.equal(repair.artifact_path, path.join(runDirectory, 'staging/case-drafts.json'));
    assert.deepEqual(repair.diagnostics, [{
      category: 'traceability',
      code: 'CASE_EXECUTION_SIGNATURE_MISMATCH',
      path: '/caseDrafts/cases/case_checkout/execution_signature',
      message: 'Agent execution_signature must exactly summarize role, preconditions, data, ordered actions, and expectation IDs'
    }]);
    assert.deepEqual(
      JSON.parse(await readFile(repair.artifact_path, 'utf8')),
      invalidCaseDrafts
    );
    assert.deepEqual(await advance(runDirectory), repair);
    await assert.rejects(
      stat(path.join(runDirectory, 'accepted/r000/case-drafts.json')),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      stat(path.join(runDirectory, 'derived/r000/clarification-state.json')),
      { code: 'ENOENT' }
    );

    await stage(runDirectory, 'case_drafts', validCaseDrafts);
    const closure = await advance(runDirectory);
    const closureRevision = structuredClone(revision);
    closureRevision.case_drafts = validCaseDrafts;
    const finished = await finishExecutionClosure(runDirectory, closureRevision, closure);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.deepEqual(
      JSON.parse(await readFile(path.join(runDirectory, 'accepted/r000/case-drafts.json'), 'utf8')),
      validCaseDrafts
    );
    await assert.rejects(
      stat(path.join(runDirectory, 'staging/case-drafts.json')),
      { code: 'ENOENT' }
    );
    const bundle = JSON.parse(await readFile(finished.bundle_path, 'utf8'));
    assert.equal(bundle.blocked.length, 1, JSON.stringify(bundle));
    assert.match(bundle.blocked[0].reason, /CAPABILITY_UNAVAILABLE/u);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner fails closed when an integration view omits responsibility-specific context', async () => {
  const runDirectory = await temporaryRun('integration context');
  const behaviorViews = JSON.parse(await readFile(integrationFixturePath, 'utf8'));
  behaviorViews.source_revision = 0;
  const view = behaviorViews.views[0];
  const claimIds = [...new Set(view.source_claim_ids)];
  const sourceDigest = '8b3b0f135f46063311dae5777d88238f613a136aaec61cbcc5df4910620500da';
  const sourcePack = {
    schema_version: '2.1.0', source_revision: 0, run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: view.scope,
    sources: [{
      source_id: 'source_integration', kind: 'prd', version: '1', status: 'effective',
      authority: 'owner', content: 'Integration contract requirements',
      content_digest: sourceDigest, scope: view.scope
    }],
    locators: [{
      locator_id: 'locator_integration', source_id: 'source_integration', type: 'text-range',
      text_range: { start: 0, end: 33 }, content_digest: sourceDigest,
      extraction_integrity: 'verified'
    }],
    source_policy: { rules: [{
      rule_id: 'rule_integration', source_ids: ['source_integration'], scope: view.scope,
      authority: 'owner', status: 'effective'
    }] },
    decision_records: [], clarification_events: [], execution_events: []
  };
  const evidenceClaims = {
    schema_version: '2.1.0', source_revision: 0,
    claims: claimIds.map((claimId) => ({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: view.scope, value: claimId, source_locator_ids: ['locator_integration'],
      source_id: 'source_integration'
    })),
    fact_ledger: claimIds.map((claimId) => ({
      fact_id: `fact_${claimId.slice('claim_'.length)}`, claim_id: claimId,
      status: 'active', source_claim_ids: [claimId]
    }))
  };
  completeSourcePack(sourcePack, evidenceClaims);
  try {
    await stage(runDirectory, 'source_pack', sourcePack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', evidenceClaims);
    assert.equal((await advance(runDirectory)).stage, 'behavior_views');
    await stage(runDirectory, 'behavior_views', behaviorViews);
    const reply = await advance(runDirectory);

    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
      diagnostic.code === 'OBLIGATION_VIEW_CONTEXT_MISSING'), true, JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/behavior-views.json')));
    await assert.rejects(stat(path.join(runDirectory, 'derived/r000/test-obligations.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner rejects accepted normative claims omitted from the Fact Ledger', async () => {
  const runDirectory = await temporaryRun('unledgered normative claim');
  const revision = await fixture();
  revision.evidence_claims.fact_ledger = [];
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
      diagnostic.code === 'NORMATIVE_CLAIM_UNLEDGERED'), true, JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner rejects a normative claim disguised as a diagnostic Fact', async () => {
  const runDirectory = await temporaryRun('diagnostic normative claim');
  const revision = await fixture();
  revision.evidence_claims.fact_ledger[0].status = 'diagnostic';
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
      diagnostic.code === 'NORMATIVE_CLAIM_LEDGER_INVALID'), true, JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner accepts one grouped Fact that owns both accepted normative alternatives', async () => {
  for (const status of ['conflicted', 'ambiguous']) {
    const runDirectory = await temporaryRun(`${status} fact ownership`);
    const revision = await fixture();
    revision.evidence_claims.claims.push({
      ...structuredClone(revision.evidence_claims.claims[0]),
      claim_id: 'claim_checkout_rejected', value: 'checkout rejected'
    });
    Object.assign(revision.evidence_claims.fact_ledger[0], {
      status,
      source_claim_ids: ['claim_checkout', 'claim_checkout_rejected']
    });
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
      await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
      const reply = await advance(runDirectory);
      assert.equal(reply.status, 'need_artifact', JSON.stringify({ status, reply }));
      assert.equal(reply.stage, 'behavior_views');
      await stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json'));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('real runner accepts one ambiguous Fact as its normative primary owner', async () => {
  const runDirectory = await temporaryRun('ambiguous primary fact ownership');
  const revision = await fixture();
  revision.evidence_claims.fact_ledger[0].status = 'ambiguous';
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    await stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json'));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner rejects a single-source conflicted Fact owner', async () => {
  const runDirectory = await temporaryRun('single source conflict ownership');
  const revision = await fixture();
  revision.evidence_claims.fact_ledger[0].status = 'conflicted';
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
      diagnostic.code === 'NORMATIVE_CLAIM_LEDGER_INVALID'), true, JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner accepts conflicted normative alternatives across nested scopes', async () => {
  const runDirectory = await temporaryRun('nested scope conflict ownership');
  const revision = await fixture();
  revision.evidence_claims.claims[0].scope = 'checkout/child';
  revision.evidence_claims.claims.push({
    ...structuredClone(revision.evidence_claims.claims[0]),
    claim_id: 'claim_checkout_parent', scope: 'checkout', value: 'checkout rejected'
  });
  Object.assign(revision.evidence_claims.fact_ledger[0], {
    status: 'conflicted',
    source_claim_ids: ['claim_checkout', 'claim_checkout_parent']
  });
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    await stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json'));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner rejects grouped normative alternatives in disjoint sibling scopes', async () => {
  const runDirectory = await temporaryRun('sibling scope conflict ownership');
  const revision = await fixture();
  revision.evidence_claims.claims[0].scope = 'checkout/a';
  revision.evidence_claims.claims.push({
    ...structuredClone(revision.evidence_claims.claims[0]),
    claim_id: 'claim_checkout_sibling', scope: 'checkout/b', value: 'checkout rejected'
  });
  Object.assign(revision.evidence_claims.fact_ledger[0], {
    status: 'conflicted',
    source_claim_ids: ['claim_checkout', 'claim_checkout_sibling']
  });
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
      diagnostic.code === 'NORMATIVE_CLAIM_LEDGER_INVALID'), true, JSON.stringify(reply));
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('real runner rejects a grouped primary broader than an alternative scope', async () => {
  for (const status of ['conflicted', 'ambiguous']) {
    const runDirectory = await temporaryRun(`${status} broad primary ownership`);
    const revision = await fixture();
    revision.evidence_claims.claims.push({
      ...structuredClone(revision.evidence_claims.claims[0]),
      claim_id: 'claim_checkout_child', scope: 'checkout/child', value: 'checkout rejected'
    });
    Object.assign(revision.evidence_claims.fact_ledger[0], {
      status,
      source_claim_ids: ['claim_checkout', 'claim_checkout_child']
    });
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
      await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
      const reply = await advance(runDirectory);
      assert.equal(reply.status, 'need_revision', JSON.stringify({ status, reply }));
      assert.equal(reply.stage, 'evidence_claims');
      assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
        diagnostic.code === 'NORMATIVE_CLAIM_LEDGER_INVALID'), true,
      JSON.stringify({ status, reply }));
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('real runner rejects normative ownership laundered through a non-normative Fact', async () => {
  for (const primaryKind of ['description', 'diagnostic']) {
    for (const status of ['ambiguous', 'conflicted']) {
      const runDirectory = await temporaryRun(`${primaryKind} ${status} fact laundering`);
      const revision = await fixture();
      revision.evidence_claims.claims.push({
        ...structuredClone(revision.evidence_claims.claims[0]),
        claim_id: 'claim_context', kind: primaryKind, value: 'checkout context'
      });
      Object.assign(revision.evidence_claims.fact_ledger[0], {
        claim_id: 'claim_context', status,
        source_claim_ids: ['claim_context', 'claim_checkout']
      });
      try {
        await stage(runDirectory, 'source_pack', revision.source_pack);
        assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
        await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
        const reply = await advance(runDirectory);
        assert.equal(reply.status, 'need_revision', JSON.stringify({ primaryKind, status, reply }));
        assert.equal(reply.stage, 'evidence_claims');
        assert.equal(reply.diagnostics.some((/** @type {any} */ diagnostic) =>
          diagnostic.code === 'NORMATIVE_CLAIM_UNLEDGERED'), true,
        JSON.stringify({ primaryKind, status, reply }));
        await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
      } finally {
        await rm(runDirectory, { recursive: true, force: true });
      }
    }
  }
});

test('invalid staging is deterministic and cannot move accepted state or checkpoint', async () => {
  const runDirectory = await temporaryRun('invalid staging');
  const revision = await fixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    assert.equal((await advance(runDirectory)).stage, 'evidence_claims');
    const checkpointBefore = await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8');
    await stage(runDirectory, 'evidence_claims', {});
    const first = await advance(runDirectory);
    const second = await advance(runDirectory);
    assert.equal(first.status, 'need_revision');
    assert.equal(first.stage, 'evidence_claims');
    assert.deepEqual(second, first);
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
    assert.equal(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'), checkpointBefore);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('semantically invalid behavior staging is never promoted before derived obligations validate', async () => {
  const runDirectory = await temporaryRun('invalid behavior');
  const revision = await fixture();
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    await advance(runDirectory);
    await stage(runDirectory, 'evidence_claims', revision.evidence_claims);
    await advance(runDirectory);
    const checkpointBefore = await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8');
    revision.behavior_views.interaction_matrix = [];
    await stage(runDirectory, 'behavior_views', revision.behavior_views);
    const reply = await advance(runDirectory);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/behavior-views.json')));
    assert.equal(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'), checkpointBefore);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

/** @param {string[]} args @param {{cwd:string,env?:Record<string,string|undefined>}} options @returns {Promise<any>} */
function spawnEntry(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath, ...args], {
      cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
}

test('private subprocess works from arbitrary cwd and paths with spaces and non-ASCII', async () => {
  const runDirectory = await temporaryRun('任意 cwd');
  const cwd = await temporaryRun('调用目录');
  try {
    const result = await spawnEntry([runDirectory], { cwd });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = JSON.parse(result.stdout);
    assert.equal(reply.status, 'need_artifact');
    assert.equal(reply.stage, 'source_pack');
    assert.equal(result.stdout.trimEnd().split('\n').length, 1);

    const fatal = await spawnEntry(['relative-run'], { cwd });
    assert.equal(fatal.code, 0, fatal.stderr);
    assert.equal(JSON.parse(fatal.stdout).status, 'fatal');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test('private subprocess returns all five workflow statuses with exit zero', async () => {
  const cwd = await temporaryRun('五状态 cwd');
  const empty = await temporaryRun('need artifact');
  const invalid = await temporaryRun('need revision');
  const finishedDirectory = await temporaryRun('finished');
  const clarificationDirectory = await temporaryRun('need answers');
  try {
    await stage(invalid, 'source_pack', {});
    const finishedRevision = await fixture();
    const finishedTail = await submitCompleteRevision(finishedDirectory, finishedRevision);
    await finishExecutionClosure(finishedDirectory, finishedRevision, finishedTail);
    const clarification = await submitCompleteRevision(
      clarificationDirectory, makeAnswerableConflict(await fixture())
    );
    assert.equal(clarification.status, 'need_user_answers', JSON.stringify(clarification));

    const inputs = [
      [empty, 'need_artifact'], [invalid, 'need_revision'],
      [finishedDirectory, 'finished'], [clarificationDirectory, 'need_user_answers'],
      ['relative-run', 'fatal']
    ];
    for (const [runDirectory, expectedStatus] of inputs) {
      const result = await spawnEntry([runDirectory], { cwd });
      assert.equal(result.code, 0, `${expectedStatus}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).status, expectedStatus);
    }
  } finally {
    for (const directory of [cwd, empty, invalid, finishedDirectory, clarificationDirectory]) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('private subprocess uses nonzero exit only when it cannot form a JSON reply', async () => {
  const cwd = await temporaryRun('process failure cwd');
  const runDirectory = await temporaryRun('process failure run');
  try {
    const result = await spawnEntry([runDirectory], {
      cwd,
      env: { ...process.env, NODE_OPTIONS: `--require ${stdoutFailurePreload}` }
    });
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /simulated stdout transport failure/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a higher resolved revision atomically replaces the current final output', async () => {
  const runDirectory = await temporaryRun('revision output switch');
  try {
    const firstRevision = makeAnswerableConflict(await fixture());
    const pending = await submitCompleteRevision(runDirectory, firstRevision);
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const blocker = pending.blockers[0];

    const secondRevision = structuredClone(firstRevision);
    setRevision(secondRevision, 1);
    const finalDecision = {
      decision_id: 'decision_checkout_final',
      question_id: stableId('question', { root_issue_ids: [blocker.root_issue_id] }),
      presentation_id: pending.presentation_id,
      decision_group_ids: pending.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: [blocker.root_issue_id],
      affected_obligation_ids: ['obligation_8cc31c1b2773c94c'],
      clarification_event_seq: 2, confirmer: 'owner', confirmed_at: '2026-08-30',
      question: blocker.question, answer: 'checkout accepted', disposition: 'final',
      supersedes_decision_ids: ['decision_checkout'],
      authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_checkout', evidence_level: 'E3'
    };
    secondRevision.source_pack.decision_records.push(finalDecision);
    Object.assign(secondRevision.evidence_claims.claims[0], {
      claim_form: 'decision-record', level: 'E3', kind: 'requirement',
      decision_id: finalDecision.decision_id, authority: 'checkout'
    });
    delete secondRevision.case_drafts.cases[0].temporary_assumption;
    const closure = await submitCompleteRevision(runDirectory, secondRevision);
    const finished = await finishExecutionClosure(runDirectory, secondRevision, closure);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.ok(finished.source_revision > 1);
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.source_revision, finished.source_revision);
    assert.equal(current.bundle_digest, finished.bundle_digest);
    assert.match(current.bundle_path, new RegExp(`output/r${String(finished.source_revision).padStart(3, '0')}/test-bundle\\.json$`, 'u'));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('outer run boundary rejects mutable collection intrinsics without executing caller code', async () => {
  const methods = ['sort', 'map', 'some', 'filter', 'slice', 'includes', 'reverse', 'push'];
  for (const method of methods) {
    const runDirectory = await temporaryRun(`intrinsic ${method}`);
    const arrayPrototype = /** @type {any} */ (Array.prototype);
    const original = arrayPrototype[method];
    let calls = 0;
    arrayPrototype[method] = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(original, this, args);
    };
    try {
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(calls, 0, `${method} caller code executed`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    } finally {
      arrayPrototype[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('outer run boundary rejects mutable string and collection accessors before traversal', async () => {
  /** @type {Array<[any,string]>} */
  const methodCases = [
    [String.prototype, 'split'], [String.prototype, 'includes'], [String.prototype, 'startsWith'],
    [String.prototype, 'padStart']
  ];
  for (const [owner, method] of methodCases) {
    const runDirectory = await temporaryRun(`intrinsic ${String(method)}`);
    const record = /** @type {any} */ (owner);
    const original = record[method];
    let calls = 0;
    record[method] = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(original, this, args);
    };
    try {
      const reply = /** @type {any} */ (await advanceStrict(runDirectory));
      assert.equal(calls, 0, `${String(method)} caller code executed`);
      assert.equal(reply.status, 'fatal', JSON.stringify(reply));
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    } finally {
      record[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun('intrinsic set size');
  const originalSize = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(Set.prototype, 'size')
  );
  assert.ok(originalSize?.get);
  const originalSizeGetter = /** @type {Function} */ (originalSize.get);
  let getterCalls = 0;
  try {
    Object.defineProperty(Set.prototype, 'size', {
      configurable: true,
      get() { getterCalls += 1; return Reflect.apply(originalSizeGetter, this, []); }
    });
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(getterCalls, 0);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
  } finally {
    Object.defineProperty(Set.prototype, 'size', originalSize);
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('intrinsic mutation during the first await cannot execute caller code or accept input', async () => {
  const runDirectory = await temporaryRun('intrinsic toctou');
  const revision = await fixture();
  const originalSort = Array.prototype.sort;
  let calls = 0;
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const pending = advanceStrict(runDirectory);
    Array.prototype.sort = function (/** @type {any[]} */ ...args) {
      calls += 1;
      return Reflect.apply(originalSort, this, args);
    };
    const reply = /** @type {any} */ (await pending);
    assert.equal(calls, 0, 'caller sort must not run after the initial async boundary');
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
    await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
  } finally {
    Array.prototype.sort = originalSort;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('first-await mutation of static Array, path, and global conversion methods is contained', async () => {
  /** @type {Array<[Record<string,any>,string]>} */
  const cases = [
    [/** @type {any} */ (Array), 'isArray'],
    [/** @type {any} */ (path), 'isAbsolute'],
    [/** @type {any} */ (globalThis), 'String'],
    [/** @type {any} */ (globalThis), 'Number']
  ];
  for (const [owner, method] of cases) {
    const runDirectory = await temporaryRun(`intrinsic static ${method}`);
    const revision = await fixture();
    const original = owner[method];
    const originalDescriptor = Object.getOwnPropertyDescriptor(owner, method);
    let calls = 0;
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      const pending = advanceStrict(runDirectory);
      owner[method] = function (/** @type {any[]} */ ...args) {
        calls += 1;
        return Reflect.apply(original, this, args);
      };
      const reply = /** @type {any} */ (await pending);
      assert.equal(calls, 0, `${method} caller code executed`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
    } finally {
      if (originalDescriptor) Object.defineProperty(owner, method, originalDescriptor);
      else delete owner[method];
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});

test('first-await mutation of canonical and lock intrinsics never executes caller code', async () => {
  const originalReflectApply = Reflect.apply;
  /** @type {Array<[Record<string,any>,string]>} */
  const cases = [
    [/** @type {any} */ (Object), 'fromEntries'],
    [/** @type {any} */ (Reflect), 'apply'],
    [/** @type {any} */ (Math), 'min'],
    [/** @type {any} */ (String.prototype), 'codePointAt'],
    [/** @type {any} */ (Date), 'now']
  ];
  for (const [owner, method] of cases) {
    const runDirectory = await temporaryRun(`intrinsic canonical ${method}`);
    const revision = await fixture();
    const original = owner[method];
    let calls = 0;
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      const pending = advanceStrict(runDirectory);
      owner[method] = function (/** @type {any[]} */ ...args) {
        calls += 1;
        return originalReflectApply(original, this, args);
      };
      const reply = /** @type {any} */ (await pending);
      assert.equal(calls, 0, `${method} caller code executed`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
    } finally {
      owner[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun('intrinsic fromEntries throwing');
  const revision = await fixture();
  const originalFromEntries = Object.fromEntries;
  let calls = 0;
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const pending = advanceStrict(runDirectory);
    Object.fromEntries = () => {
      calls += 1;
      throw new Error('caller Object.fromEntries must not execute');
    };
    const reply = /** @type {any} */ (await pending);
    assert.equal(calls, 0);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
  } finally {
    Object.fromEntries = originalFromEntries;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('filesystem and String prototype methods are captured before any async run traversal', async () => {
  const probeDirectory = await temporaryRun('prototype probes');
  const probeFile = path.join(probeDirectory, 'probe.txt');
  await writeFile(probeFile, 'probe', 'utf8');
  const statsPrototype = Object.getPrototypeOf(await stat(probeFile));
  const direntPrototype = Object.getPrototypeOf((await fsPromises.readdir(
    probeDirectory, { withFileTypes: true }
  ))[0]);
  const probeHandle = await fsPromises.open(probeFile, 'r');
  const fileHandlePrototype = Object.getPrototypeOf(probeHandle);
  await probeHandle.close();
  await rm(probeDirectory, { recursive: true, force: true });
  const originalReflectApply = Reflect.apply;
  /** @type {Array<[Record<string,any>,string]>} */
  const cases = [
    [statsPrototype, 'isDirectory'], [statsPrototype, 'isSymbolicLink'], [statsPrototype, 'isFile'],
    [direntPrototype, 'isDirectory'], [direntPrototype, 'isSymbolicLink'], [direntPrototype, 'isFile'],
    [fileHandlePrototype, 'writeFile'], [fileHandlePrototype, 'sync'],
    [fileHandlePrototype, 'utimes'],
    [fileHandlePrototype, 'stat'], [fileHandlePrototype, 'readFile'],
    [/** @type {any} */ (String.prototype), 'split'],
    [/** @type {any} */ (String.prototype), 'startsWith']
  ];
  for (const [owner, method] of cases) {
    const runDirectory = await temporaryRun(`prototype ${method}`);
    const revision = await fixture();
    const original = owner[method];
    let calls = 0;
    try {
      await stage(runDirectory, 'source_pack', revision.source_pack);
      const pending = advanceStrict(runDirectory);
      owner[method] = function (/** @type {any[]} */ ...args) {
        calls += 1;
        return originalReflectApply(original, this, args);
      };
      const reply = /** @type {any} */ (await pending);
      assert.equal(calls, 0, `${method} caller code executed`);
      assert.equal(reply.status, 'fatal', `${method}: ${JSON.stringify(reply)}`);
      assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
    } finally {
      owner[method] = original;
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  const runDirectory = await temporaryRun('throwing stats method');
  const revision = await fixture();
  const originalIsDirectory = statsPrototype.isDirectory;
  const originalIsDirectoryDescriptor = Object.getOwnPropertyDescriptor(
    statsPrototype, 'isDirectory'
  );
  let calls = 0;
  try {
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const pending = advanceStrict(runDirectory);
    statsPrototype.isDirectory = () => {
      calls += 1;
      throw new Error('caller Stats method must not execute');
    };
    const reply = /** @type {any} */ (await pending);
    assert.equal(calls, 0);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
  } finally {
    if (originalIsDirectoryDescriptor) Object.defineProperty(
      statsPrototype, 'isDirectory', originalIsDirectoryDescriptor
    );
    else delete statsPrototype.isDirectory;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('pre-call path replacement is contained by the outermost run boundary', async () => {
  const runDirectory = await temporaryRun('intrinsic pre-call path');
  const original = path.resolve;
  let calls = 0;
  try {
    path.resolve = () => {
      calls += 1;
      throw new Error('caller path method must not execute');
    };
    const reply = /** @type {any} */ (await advanceStrict(runDirectory));
    assert.equal(calls, 0);
    assert.equal(reply.status, 'fatal', JSON.stringify(reply));
    assert.equal(reply.diagnostics[0].code, 'CORE_INTRINSIC_INVALID');
  } finally {
    path.resolve = original;
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('initial unknown and deferred Decisions cannot be accepted then ignored', async () => {
  for (const disposition of ['unknown', 'deferred']) {
    const runDirectory = await temporaryRun(`initial ${disposition}`);
    const revision = makeAnswerableConflict(await fixture());
    const policy = resolveSourcePolicy(revision.source_pack);
    assert.equal(policy.conflicts.length, 1);
    const canonicalRootId = policy.conflicts[0].root_issue_id;
    const decision = revision.source_pack.decision_records[0];
    decision.root_issue_ids = [canonicalRootId];
    decision.question_id = stableId('question', { root_issue_ids: [canonicalRootId] });
    decision.disposition = disposition;
    decision.answer = '';
    try {
      const reply = /** @type {any} */ (await submitCompleteRevision(runDirectory, revision));
      assert.equal(reply.status, 'need_revision', `${disposition}: ${JSON.stringify(reply)}`);
      assert.equal(reply.stage, 'source_pack');
      assert.ok(reply.diagnostics.some((/** @type {any} */ item) => (
        item.code === 'INITIAL_DECISION_DISPOSITION_UNSUPPORTED'
      )), JSON.stringify(reply));
      await assert.rejects(stat(path.join(runDirectory, 'accepted/r000/source-pack.json')));
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }
});
