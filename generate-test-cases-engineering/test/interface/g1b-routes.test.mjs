import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalStringify, stableId } from '../../src/canonical.mjs';
import {
  buildJourney, evaluateJourneyRevision, journeyRule, revisionFromRules, runInstalledRevision
} from '../helpers/run-journey.mjs';

const runnerStages = ['source_pack', 'evidence_claims', 'behavior_views'];

/** @param {any} revision @param {string} claimId @param {string} scope @param {string} [kind] */
function addClaim(revision, claimId, scope, kind = 'requirement') {
  revision.evidence_claims.claims.push({
    claim_id: claimId,
    claim_form: 'direct',
    level: 'E3',
    kind,
    scope,
    value: claimId,
    source_locator_ids: ['locator_checkout'],
    source_id: 'source_prd'
  });
}

/** @param {any} revision @param {string} factId @param {string} claimId */
function addFact(revision, factId, claimId) {
  revision.evidence_claims.fact_ledger.push({
    fact_id: factId,
    claim_id: claimId,
    status: 'active',
    source_claim_ids: [claimId]
  });
}

/** @param {{answerable?:boolean}} [options] */
function terminalGapRevision(options = {}) {
  const revision = buildJourney('all-e3');
  addClaim(revision, 'claim_failure_rule', 'checkout');
  addFact(revision, 'fact_failure_rule', 'claim_failure_rule');
  revision.behavior_views.obligation_inputs.terminal_fact_routes.push({
    fact_id: 'fact_failure_rule',
    disposition: 'blocked',
    issue_intent: {
      missing_type: 'failure-oracle',
      scope: 'checkout',
      answerable: options.answerable ?? true,
      risk: 'high',
      reasons: ['Failure outcome is not specified.'],
      evidence_refs: ['claim_failure_rule']
    }
  });
  return revision;
}

function factGapSubject() {
  return { kind: 'facts', fact_ids: ['fact_failure_rule'] };
}

function factGapRootId() {
  return stableId('root', {
    missing_type: 'failure-oracle',
    semantic_refs: [canonicalStringify(factGapSubject())],
    scope: 'checkout'
  });
}

function factGapObligationId() {
  return stableId('obligation', {
    kind: 'requirement-gap',
    owner: { kind: 'fact', fact_id: 'fact_failure_rule' },
    missing_type: 'failure-oracle',
    scope: 'checkout'
  });
}

/** @param {{answerable?:boolean,candidateId?:string,moduleIds?:string[],sourceClaimIds?:string[],semanticSubjectRefs?:any[],risk?:string,reasons?:string[]}} [options] */
function interactionGapRevision(options = {}) {
  const moduleIds = options.moduleIds ?? ['checkout'];
  const revision = revisionFromRules([journeyRule('checkout', { scope: 'checkout' })], {
    modules: [...moduleIds]
  });
  if ((options.sourceClaimIds ?? []).includes('claim_checkout_model')) {
    revision.evidence_claims.claims.push({
      claim_id: 'claim_checkout_model', claim_form: 'derived', level: 'E2',
      kind: 'model-element', scope: 'checkout', value: 'checkout accepted',
      source_locator_ids: ['locator_checkout'], derivation_kind: 'decision-table-instance',
      derivation_target: 'model-element', parent_claim_ids: ['claim_checkout'],
      parameters: { table_id: 'checkout_interaction' },
      rule_input: { conditions: ['checkout requested'], outcome: 'checkout accepted' }
    });
  }
  const cell = revision.behavior_views.interaction_matrix.find(
    (/** @type {any} */ item) => item.dimension === 'interface-event'
  );
  cell.status = 'candidate';
  revision.behavior_views.interaction_candidates = [{
    candidate_id: options.candidateId ?? 'candidate_checkout_event',
    module_ids: [...moduleIds], dimension: 'interface-event', disposition: 'blocker',
    source_claim_ids: options.sourceClaimIds ?? ['claim_checkout'],
    semantic_subject_refs: options.semanticSubjectRefs ?? [{ kind: 'fact', fact_id: 'fact_checkout' }],
    issue_intent: {
      missing_type: 'interaction-oracle', scope: 'checkout',
      answerable: options.answerable ?? true, risk: options.risk ?? 'medium',
      reasons: options.reasons ?? ['Interaction outcome is unspecified.'],
      evidence_refs: ['claim_checkout']
    }
  }];
  return revision;
}

/** @param {any} responsibility */
function customResponsibilityId(responsibility) {
  const responsibilityKey = canonicalStringify({
    responsibility_type: responsibility.responsibility_type,
    owner: responsibility.owner,
    scope: responsibility.scope
  });
  const kinds = new Map([
    ['flow-path', 'flow'], ['decision-outcome', 'decision'],
    ['state-transition', 'state'], ['input-partition', 'input-domain'],
    ['role-permission', 'role'], ['temporal-rule', 'timing'],
    ['integration-contract', 'integration'],
    ['cross-module-interaction', 'interaction']
  ]);
  return stableId('obligation', {
    kind: kinds.get(responsibility.responsibility_type), responsibility_key: responsibilityKey
  });
}

/** @param {any} revision */
function addCheckoutModelClaim(revision) {
  revision.evidence_claims.claims.push({
    claim_id: 'claim_checkout_model', claim_form: 'derived', level: 'E2',
    kind: 'model-element', scope: 'checkout', value: 'checkout accepted',
    source_locator_ids: ['locator_checkout'], derivation_kind: 'decision-table-instance',
    derivation_target: 'model-element', parent_claim_ids: ['claim_checkout'],
    parameters: { table_id: 'checkout_interaction' },
    rule_input: { conditions: ['checkout requested'], outcome: 'checkout accepted' }
  });
}

/** @param {any} revision @param {boolean} [duplicateSideEffect] */
function addCheckoutIntegrationView(revision, duplicateSideEffect = false) {
  const sideEffect = { kind: 'ledger-write', target: 'checkout ledger' };
  revision.behavior_views.views.push({
    view_id: 'view_checkout_integration', type: 'integration', scope: 'checkout',
    source_claim_ids: ['claim_checkout'],
    elements: [{
      element_id: 'integration_checkout', kind: 'integration-contract',
      request: { target: 'POST /checkout', payload: 'cart' },
      response: { status: 'accepted', body: 'order id' },
      persistence: { operation: 'insert', target: 'orders' },
      event: { name: 'checkout.accepted', direction: 'publish' },
      callback: { target: 'client', event: 'checkout.accepted' },
      compensation: { action: 'cancel order', trigger: 'payment failure' },
      side_effects: duplicateSideEffect
        ? [structuredClone(sideEffect), structuredClone(sideEffect)] : [sideEffect],
      source_claim_ids: ['claim_checkout'], model_refs: []
    }],
    relations: []
  });
  revision.behavior_views.obligation_inputs.view_contexts.push({
    view_id: 'view_checkout_integration',
    bindings: [
      ...['request', 'response', 'persistence', 'event', 'callback', 'compensation'].map(
        (kind) => ({
          selector: { kind, element_id: 'integration_checkout' },
          risk: 'medium', source_claim_ids: ['claim_checkout'],
          required_oracle_refs: [], required_capabilities: []
        })
      ),
      {
        selector: {
          kind: 'side-effect', element_id: 'integration_checkout',
          side_effect_kind: 'ledger-write', target: 'checkout ledger'
        },
        risk: 'medium', source_claim_ids: ['claim_checkout'],
        required_oracle_refs: [], required_capabilities: []
      }
    ]
  });
}

/** @param {any} revision */
async function installedObligations(revision) {
  const run = await runInstalledRevision(revision, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_artifact', JSON.stringify(run.reply));
    assert.equal(run.reply.stage, 'case_drafts', JSON.stringify(run.reply));
    const artifact = JSON.parse(await readFile(
      path.join(run.runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    ));
    return { artifact, reply: run.reply };
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
}

test('installed terminal fact route compiles one compiler-owned requirement gap and is the only final fact route', async () => {
  const { artifact } = await installedObligations(terminalGapRevision());
  const gapId = factGapObligationId();
  const rootId = factGapRootId();
  const gap = artifact.obligations.find(
    (/** @type {any} */ item) => item.obligation_id === gapId
  );
  assert.ok(gap, `expected compiler-owned gap ${gapId}`);
  assert.equal(gap.kind, 'requirement-gap');
  assert.equal(gap.caseable, false);
  assert.equal(gap.gap_issue.root_issue_id, rootId);
  assert.deepEqual(
    artifact.fact_routes.find(
      (/** @type {any} */ route) => route.fact_id === 'fact_failure_rule'
    ),
    {
      fact_id: 'fact_failure_rule',
      route_type: 'blocked',
      blocker_root_issue_id: rootId,
      gap_obligation_id: gapId
    }
  );
  assert.equal(artifact.fact_routes.filter(
    (/** @type {any} */ route) => route.fact_id === 'fact_failure_rule'
  ).length, 1);
});

test('terminal issue intent rejects unrelated scope and dangling evidence before deriving a gap', async (
  /** @type {any} */ t
) => {
  const cases = [
    {
      name: 'unrelated scope',
      prepare: (/** @type {any} */ revision) => {
        revision.behavior_views.obligation_inputs.terminal_fact_routes[0]
          .issue_intent.scope = 'unrelated';
      },
      code: 'TERMINAL_ISSUE_SCOPE_MISMATCH'
    },
    {
      name: 'dangling evidence',
      prepare: (/** @type {any} */ revision) => {
        revision.behavior_views.obligation_inputs.terminal_fact_routes[0]
          .issue_intent.evidence_refs = ['claim_missing'];
      },
      code: 'TERMINAL_ISSUE_EVIDENCE_DANGLING'
    },
    {
      name: 'evidence scope does not cover issue',
      prepare: (/** @type {any} */ revision) => {
        revision.evidence_claims.claims.find(
          (/** @type {any} */ claim) => claim.claim_id === 'claim_failure_rule'
        ).scope = 'checkout/detail';
      },
      code: 'TERMINAL_ISSUE_EVIDENCE_SCOPE_MISMATCH'
    },
    {
      name: 'evidence is unrelated to fact subject',
      prepare: (/** @type {any} */ revision) => {
        addClaim(revision, 'claim_unrelated_terminal_evidence', 'checkout', 'description');
        revision.behavior_views.obligation_inputs.terminal_fact_routes[0]
          .issue_intent.evidence_refs = ['claim_unrelated_terminal_evidence'];
      },
      code: 'TERMINAL_ISSUE_EVIDENCE_UNRELATED'
    }
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => {
      const revision = terminalGapRevision();
      scenario.prepare(revision);
      const run = await runInstalledRevision(revision, { stageNames: runnerStages });
      try {
        assert.equal(run.reply.status, 'need_revision', `${scenario.name}: ${JSON.stringify(run.reply)}`);
        assert.equal(run.reply.diagnostics.some(
          (/** @type {any} */ item) => item.code === scenario.code
        ), true, `${scenario.name}: ${JSON.stringify(run.reply)}`);
      } finally {
        await rm(run.runDirectory, { recursive: true, force: true });
      }
    });
});

test('installed final reconciliation rejects the same fact when its terminal route is deleted', async () => {
  const revision = terminalGapRevision();
  revision.behavior_views.obligation_inputs.terminal_fact_routes = [];
  const run = await runInstalledRevision(revision, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.stage, 'behavior_views');
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'FACT_ROUTE_MISSING'
    ), true,
      JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('installed NotApplicable terminal intent passes only with independent supported exclusion evidence', async () => {
  const revision = buildJourney('all-e3');
  addClaim(revision, 'claim_legacy_rule', 'checkout');
  addFact(revision, 'fact_legacy_rule', 'claim_legacy_rule');
  addClaim(revision, 'claim_exclusion', 'checkout', 'description');
  revision.behavior_views.obligation_inputs.terminal_fact_routes.push({
    fact_id: 'fact_legacy_rule',
    disposition: 'not_applicable',
    exclusion_claim_id: 'claim_exclusion',
    scope: 'checkout',
    support_review: 'supported'
  });
  const { artifact } = await installedObligations(revision);
  assert.deepEqual(
    artifact.fact_routes.find(
      (/** @type {any} */ route) => route.fact_id === 'fact_legacy_rule'
    ),
    {
      fact_id: 'fact_legacy_rule',
      route_type: 'not_applicable',
      not_applicable_claim_id: 'claim_exclusion'
    }
  );
});

test('installed blocked interaction derives identity from semantic subject instead of candidate or provenance', async () => {
  const revision = buildJourney('all-e3');
  const cell = revision.behavior_views.interaction_matrix.find(
    (/** @type {any} */ item) => item.dimension === 'interface-event'
  );
  cell.status = 'candidate';
  revision.behavior_views.interaction_candidates = [{
    candidate_id: 'candidate_checkout_event',
    module_ids: ['checkout'],
    dimension: 'interface-event',
    disposition: 'blocker',
    source_claim_ids: ['claim_checkout'],
    semantic_subject_refs: [{ kind: 'fact', fact_id: 'fact_checkout' }],
    issue_intent: {
      missing_type: 'interaction-oracle', scope: 'checkout', answerable: false,
      risk: 'medium', reasons: ['Interaction outcome is unspecified.'],
      evidence_refs: ['claim_checkout']
    }
  }];
  const { artifact } = await installedObligations(revision);
  const semanticRefs = [{ kind: 'fact', fact_id: 'fact_checkout' }];
  const subject = {
    kind: 'interactions', module_ids: ['checkout'], dimension: 'interface-event',
    semantic_subject_refs: semanticRefs
  };
  const rootId = stableId('root', {
    missing_type: 'interaction-oracle',
    semantic_refs: [canonicalStringify(subject)],
    scope: 'checkout'
  });
  const route = artifact.interaction_routes.find(
    (/** @type {any} */ item) => item.candidate_id === 'candidate_checkout_event'
  );
  assert.equal(route.blocker_root_issue_id, rootId);
  assert.match(route.gap_obligation_id, /^obligation_[0-9a-f]{16}$/);
  const gap = artifact.obligations.find(
    (/** @type {any} */ item) => item.obligation_id === route.gap_obligation_id
  );
  assert.equal(gap.kind, 'requirement-gap');
  assert.equal(gap.caseable, false);
  assert.equal(gap.gap_issue.root_issue_id, rootId);
});

test('blocked interaction issue scope must cover candidate modules and every semantic subject', async (
  /** @type {any} */ t
) => {
  for (const scenario of [
    { name: 'outside every candidate module', scope: 'unrelated', path: '/issue_intent/scope' },
    { name: 'narrower than its semantic subject', scope: 'checkout/detail', path: '/semantic_subject_refs/' }
  ]) await t.test(scenario.name, async () => {
    const revision = interactionGapRevision();
    revision.behavior_views.interaction_candidates[0].issue_intent.scope = scenario.scope;
    revision.behavior_views.interaction_candidates[0].issue_intent.evidence_refs = [];
    const run = await runInstalledRevision(revision, { stageNames: runnerStages });
    try {
      assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === 'INTERACTION_ISSUE_SCOPE_MISMATCH'
          && item.path.includes(scenario.path)
      ), true, JSON.stringify(run.reply));
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  });
});

test('interaction root ignores candidate and provenance churn plus module/ref reorder', async () => {
  const semanticRefs = [
    { kind: 'fact', fact_id: 'fact_checkout' },
    { kind: 'view-element', view_id: 'view_checkout', element_id: 'rule_checkout' }
  ];
  const first = await installedObligations(interactionGapRevision({
    candidateId: 'candidate_first', moduleIds: ['checkout', 'payments'],
    sourceClaimIds: ['claim_checkout', 'claim_checkout_model'],
    semanticSubjectRefs: semanticRefs
  }));
  const second = await installedObligations(interactionGapRevision({
    candidateId: 'candidate_reworded', moduleIds: ['payments', 'checkout'],
    sourceClaimIds: ['claim_checkout'], semanticSubjectRefs: [...semanticRefs].reverse(),
    risk: 'critical', reasons: ['Changed wording must remain audit metadata.']
  }));
  assert.equal(
    first.artifact.interaction_routes[0].blocker_root_issue_id,
    second.artifact.interaction_routes[0].blocker_root_issue_id
  );
  assert.equal(
    first.artifact.interaction_routes[0].gap_obligation_id,
    second.artifact.interaction_routes[0].gap_obligation_id
  );
});

test('two semantic subjects in one interaction cell compile distinct roots and routes', async () => {
  const revision = interactionGapRevision();
  revision.behavior_views.interaction_candidates.push({
    ...structuredClone(revision.behavior_views.interaction_candidates[0]),
    candidate_id: 'candidate_checkout_view',
    semantic_subject_refs: [
      { kind: 'view-element', view_id: 'view_checkout', element_id: 'rule_checkout' }
    ]
  });
  const { artifact } = await installedObligations(revision);
  assert.equal(artifact.interaction_routes.length, 2);
  assert.equal(new Set(artifact.interaction_routes.map(
    (/** @type {any} */ route) => route.blocker_root_issue_id
  )).size, 2);
  assert.equal(new Set(artifact.interaction_routes.map(
    (/** @type {any} */ route) => route.gap_obligation_id
  )).size, 2);
});

test('non-answerable interaction gap finishes Blocked without entering requirement coverage', async () => {
  const revision = interactionGapRevision({ answerable: false });
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'finished', JSON.stringify(run.reply));
    const bundle = JSON.parse(await readFile(run.reply.bundle_path, 'utf8'));
    const route = JSON.parse(await readFile(
      path.join(run.runDirectory, 'derived/r000/test-obligations.json'), 'utf8'
    )).interaction_routes[0];
    assert.equal(bundle.blocked.some(
      (/** @type {any} */ item) => item.obligation_id === route.gap_obligation_id
    ), true);
    assert.equal(bundle.coverage.formal.entries.some(
      (/** @type {any} */ item) => (
        item.obligation_id === route.gap_obligation_id && item.status === 'blocked'
      )
    ), true);
    assert.equal(bundle.coverage.requirements.entries.some(
      (/** @type {any} */ item) => item.obligation_id === route.gap_obligation_id
    ), false);
    assert.deepEqual(bundle.coverage.requirements.entries, [
      { fact_id: 'fact_checkout', status: 'covered' }
    ]);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('unknown and deferred answerable interaction gaps remain suppressed until explicitly reopened', () => {
  for (const disposition of ['unknown', 'deferred']) {
    const revision = interactionGapRevision({ answerable: true });
    const first = evaluateJourneyRevision(revision);
    assert.equal(first.status, 'need_user_answers', disposition);
    assert.equal(first.pending_root_issues.length, 1, disposition);
    const root = first.pending_root_issues[0];
    const next = /** @type {any} */ (structuredClone(revision));
    next.source_revision = 1;
    for (const artifact of [
      next.source_pack, next.evidence_claims, next.behavior_views, next.case_drafts
    ]) artifact.source_revision = 1;
    const decision = {
      decision_id: `decision_interaction_${disposition}`,
      question_id: stableId('question', { root_issue_ids: [root.root_issue_id] }),
      presentation_id: first.presentation.presentation_id,
      decision_group_ids: first.presentation.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: [root.root_issue_id],
      affected_obligation_ids: [...root.affected_obligation_ids],
      clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-09-02',
      question: root.question, answer: disposition === 'unknown' ? 'Unknown.' : 'Deferred.',
      disposition, authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_checkout', evidence_level: 'E1'
    };
    next.source_pack.decision_records.push(decision);
    next.clarification.prior_state = first.clarification_state;
    next.workflow = first.workflow_state;
    next.clarification.append_batch.decision_records = [structuredClone(decision)];
    const resolved = evaluateJourneyRevision(next);
    assert.equal(resolved.status, 'need_user_answers', `${disposition}: ${JSON.stringify(resolved)}`);
    assert.equal(resolved.purpose, 'execution_closure', disposition);
    const expectedStatus = disposition === 'unknown' ? 'suppressed_unknown' : 'suppressed_deferred';
    assert.equal(resolved.clarification_state.root_issue_dispositions.find(
      (/** @type {any} */ item) => item.root_issue_id === root.root_issue_id
    ).status, expectedStatus);

    const replay = /** @type {any} */ (structuredClone(next));
    replay.clarification.prior_state = resolved.clarification_state;
    replay.clarification.append_batch = { decision_records: [], clarification_events: [] };
    const replayed = evaluateJourneyRevision(replay);
    assert.equal(replayed.status, 'need_user_answers', disposition);
    assert.equal(replayed.purpose, 'execution_closure', disposition);
    assert.deepEqual(replayed.clarification_state.last_pending_root_issue_ids, [], disposition);

    const reopened = /** @type {any} */ (structuredClone(replay));
    reopened.source_revision = 2;
    for (const artifact of [
      reopened.source_pack, reopened.evidence_claims, reopened.behavior_views, reopened.case_drafts
    ]) artifact.source_revision = 2;
    reopened.clarification.prior_state = replayed.clarification_state;
    const reopenEvent = {
      event_id: `event_reopen_interaction_${disposition}`,
      clarification_event_seq: 2, type: 'reopen_root_issues', actor: 'owner',
      event_at: '2026-09-02',
      presentation_id: replayed.presentation.presentation_id,
      decision_group_ids: replayed.presentation.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: [root.root_issue_id]
    };
    reopened.workflow = replayed.workflow_state;
    reopened.source_pack.clarification_events.push(reopenEvent);
    reopened.clarification.append_batch = {
      decision_records: [], clarification_events: [structuredClone(reopenEvent)]
    };
    const askedAgain = evaluateJourneyRevision(reopened);
    assert.equal(askedAgain.status, 'need_user_answers', disposition);
    assert.deepEqual(askedAgain.pending_root_issues.map(
      (/** @type {any} */ item) => item.root_issue_id
    ), [root.root_issue_id], disposition);
  }
});

test('installed fact-owned custom responsibility enriches the modeled fact route and rejects semantic-key fake isolation', async () => {
  const revision = buildJourney('all-e3');
  const responsibility = {
    responsibility_type: 'cross-module-interaction',
    semantic_key: 'checkout-event-audit-label',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] },
    scope: 'checkout',
    risk: 'medium',
    source_claim_ids: ['claim_checkout'],
    required_oracle_refs: [],
    required_capabilities: []
  };
  revision.behavior_views.obligation_inputs.custom_responsibilities.push(responsibility);
  const { artifact } = await installedObligations(revision);
  const custom = artifact.obligations.find(
    (/** @type {any} */ item) => item.kind === 'interaction'
  );
  assert.ok(custom);
  assert.equal(custom.caseable, true);
  const route = artifact.fact_routes.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_checkout'
  );
  assert.equal(route.route_type, 'obligations');
  assert.equal(route.obligation_ids.includes(custom.obligation_id), true);

  const isolated = structuredClone(revision);
  isolated.behavior_views.obligation_inputs.custom_responsibilities.push({
    ...structuredClone(responsibility), semantic_key: 'different-label-same-responsibility'
  });
  const run = await runInstalledRevision(isolated, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
    ), true, JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('fact-owned custom responsibility scope must stay within every owner fact scope', async () => {
  const revision = buildJourney('all-e3');
  addClaim(revision, 'claim_global_secondary', '*');
  const ownerFact = revision.evidence_claims.fact_ledger.find(
    (/** @type {any} */ fact) => fact.fact_id === 'fact_checkout'
  );
  ownerFact.status = 'ambiguous';
  ownerFact.source_claim_ids.push('claim_global_secondary');
  revision.behavior_views.obligation_inputs.custom_responsibilities.push({
    responsibility_type: 'cross-module-interaction', semantic_key: 'wrong-owner-scope',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] }, scope: 'other', risk: 'medium',
    source_claim_ids: ['claim_global_secondary'], required_oracle_refs: [],
    required_capabilities: []
  });
  const run = await runInstalledRevision(revision, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'CUSTOM_OBLIGATION_OWNER_SCOPE_MISMATCH'
    ), true, JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('installed grouped case blocker gets a compiler-owned stable root from typed reachable subject', async () => {
  const revision = buildJourney('all-e3');
  const obligationId = revision.case_drafts.obligation_dispositions[0].obligation_id;
  revision.case_drafts.cases = [];
  revision.case_drafts.obligation_dispositions = [{
    status: 'blocker',
    affected_obligation_ids: [obligationId],
    issue_intent: {
      missing_type: 'behavior-gap', scope: 'checkout', answerable: true, risk: 'high',
      reasons: ['Expected failure response is absent.'], evidence_refs: ['claim_checkout']
    },
    subject: { kind: 'facts', fact_ids: ['fact_checkout'] }
  }];
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'need_user_answers', JSON.stringify(run.reply));
    assert.equal(run.reply.blockers.length, 1);
    const root = run.reply.blockers[0];
    const expectedRootId = stableId('root', {
      missing_type: 'behavior-gap',
      semantic_refs: [canonicalStringify({ kind: 'facts', fact_ids: ['fact_checkout'] })],
      scope: 'checkout'
    });
    assert.equal(root.root_issue_id, expectedRootId);
    assert.deepEqual(root.affected_obligation_ids, [obligationId]);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('compiler-only non-answerable gap needs no Agent disposition and finishes Blocked without asking', async () => {
  const revision = terminalGapRevision({ answerable: false });
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'finished', JSON.stringify(run.reply));
    const bundle = JSON.parse(await readFile(run.reply.bundle_path, 'utf8'));
    const gapId = factGapObligationId();
    const gap = bundle.blocked.find(
      (/** @type {any} */ item) => item.obligation_id === gapId
    );
    assert.ok(gap, `expected final blocked gap ${gapId}`);
    assert.equal(gap.root_issue_id, factGapRootId());
    assert.equal(bundle.coverage.formal.entries.some(
      (/** @type {any} */ item) => item.obligation_id === gapId && item.status === 'blocked'
    ), true);
    assert.equal(bundle.coverage.requirements.entries.some(
      (/** @type {any} */ item) => (
        item.fact_id === 'fact_failure_rule' && item.status === 'blocked'
      )
    ), true);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('grouped blocker subject must be reachable from every affected obligation, not merely one', async () => {
  const revision = revisionFromRules([
    journeyRule('checkout', { scope: 'checkout' }),
    journeyRule('payment', { scope: 'payment' })
  ], { modules: ['checkout', 'payment'] });
  const obligationIds = revision.case_drafts.obligation_dispositions.map(
    (/** @type {any} */ item) => String(item.obligation_id)
  );
  revision.case_drafts.cases = [];
  revision.case_drafts.obligation_dispositions = [{
    status: 'blocker', affected_obligation_ids: obligationIds,
    issue_intent: {
      missing_type: 'oracle', scope: '*', answerable: true, risk: 'high',
      reasons: ['A checkout fact cannot own the payment blocker.'], evidence_refs: []
    },
    subject: { kind: 'facts', fact_ids: ['fact_checkout'] }
  }];
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'BLOCKER_SUBJECT_UNREACHABLE'
    ), true,
      JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('capability and evidence-conflict subject set reorder preserves grouped blocker root identity', async () => {
  const responsibility = {
    responsibility_type: 'cross-module-interaction', semantic_key: 'checkout-control-audit',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] }, scope: 'checkout', risk: 'high',
    source_claim_ids: ['claim_checkout'], required_oracle_refs: [],
    required_capabilities: ['audit-log', 'run-control']
  };
  const obligationId = customResponsibilityId(responsibility);
  const makeRevision = (/** @type {any} */ subject) => {
    const revision = buildJourney('all-e3');
    revision.behavior_views.obligation_inputs.custom_responsibilities.push(responsibility);
    for (const suffix of ['a', 'b']) revision.evidence_claims.claims.push({
      claim_id: `claim_conflict_${suffix}`, claim_form: 'derived', level: 'E2',
      kind: 'expected-value', scope: 'checkout', value: 'checkout accepted',
      source_locator_ids: ['locator_checkout'], derivation_kind: 'decision-table-instance',
      derivation_target: 'expected-value', parent_claim_ids: ['claim_checkout'],
      parameters: { table_id: `table_conflict_${suffix}` },
      rule_input: { conditions: [`condition ${suffix}`], outcome: 'checkout accepted' }
    });
    revision.case_drafts.obligation_dispositions.push({
      status: 'blocker', affected_obligation_ids: [obligationId],
      issue_intent: {
        missing_type: 'capability', scope: 'checkout', answerable: true, risk: 'high',
        reasons: ['Execution capability is unresolved.'], evidence_refs: ['claim_checkout']
      }, subject
    });
    return revision;
  };
  for (const subjects of [
    [
      { kind: 'capabilities', capabilities: ['audit-log', 'run-control'] },
      { kind: 'capabilities', capabilities: ['run-control', 'audit-log'] }
    ],
    [
      { kind: 'evidence-conflict', claim_refs: ['claim_conflict_a', 'claim_conflict_b'] },
      { kind: 'evidence-conflict', claim_refs: ['claim_conflict_b', 'claim_conflict_a'] }
    ]
  ]) {
    const roots = [];
    for (const subject of subjects) {
      const run = await runInstalledRevision(makeRevision(subject));
      try {
        assert.equal(run.reply.status, 'need_user_answers', JSON.stringify(run.reply));
        roots.push(run.reply.blockers.find((/** @type {any} */ item) => (
          item.affected_obligation_ids.includes(obligationId)
        )).root_issue_id);
      } finally {
        await rm(run.runDirectory, { recursive: true, force: true });
      }
    }
    assert.equal(roots[0], roots[1], JSON.stringify(subjects));
  }
});

test('interaction provenance and issue evidence remain scope-covered and related although excluded from identity', async () => {
  const revision = buildJourney('all-e3');
  addClaim(revision, 'claim_unrelated', 'other', 'description');
  const cell = revision.behavior_views.interaction_matrix.find(
    (/** @type {any} */ item) => item.dimension === 'interface-event'
  );
  cell.status = 'candidate';
  revision.behavior_views.interaction_candidates = [{
    candidate_id: 'candidate_bad_provenance', module_ids: ['checkout'], dimension: 'interface-event',
    disposition: 'blocker', source_claim_ids: ['claim_checkout', 'claim_unrelated'],
    semantic_subject_refs: [{ kind: 'fact', fact_id: 'fact_checkout' }],
    issue_intent: {
      missing_type: 'interaction-oracle', scope: 'checkout', answerable: false, risk: 'medium',
      reasons: ['Interaction outcome is unspecified.'], evidence_refs: ['claim_unrelated']
    }
  }];
  const run = await runInstalledRevision(revision, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'INTERACTION_SOURCE_EVIDENCE_UNRELATED'
    ), true,
      JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'INTERACTION_ISSUE_EVIDENCE_UNRELATED'
    ), true,
      JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('view-element custom owner fails closed when one element resolves to multiple formal facts', async () => {
  const revision = buildJourney('all-e3');
  addClaim(revision, 'claim_checkout_alias', 'checkout');
  addFact(revision, 'fact_checkout_alias', 'claim_checkout_alias');
  revision.behavior_views.views[0].source_claim_ids.push('claim_checkout_alias');
  revision.behavior_views.views[0].elements[0].source_claim_ids.push('claim_checkout_alias');
  revision.behavior_views.obligation_inputs.custom_responsibilities.push({
    responsibility_type: 'cross-module-interaction', semantic_key: 'ambiguous-owner-audit',
    owner: {
      kind: 'view-elements',
      view_element_refs: [{ view_id: 'view_checkout', element_id: 'rule_checkout' }]
    },
    scope: 'checkout', risk: 'medium', source_claim_ids: ['claim_checkout'],
    required_oracle_refs: [], required_capabilities: []
  });
  const run = await runInstalledRevision(revision, { stageNames: runnerStages });
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => (
        item.code === 'CUSTOM_RESPONSIBILITY_VIEW_OWNER_AMBIGUOUS'
      )
    ), true, JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('all eight closed custom responsibility types compile to their fixed obligation kinds', async () => {
  const mappings = [
    ['flow-path', 'flow'], ['decision-outcome', 'decision'],
    ['state-transition', 'state'], ['input-partition', 'input-domain'],
    ['role-permission', 'role'], ['temporal-rule', 'timing'],
    ['integration-contract', 'integration'],
    ['cross-module-interaction', 'interaction']
  ];
  const revision = buildJourney('all-e3');
  const responsibilities = mappings.map(([responsibilityType], index) => ({
    responsibility_type: responsibilityType,
    semantic_key: `audit-label-${index}`,
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] },
    scope: 'checkout', risk: 'medium', source_claim_ids: ['claim_checkout'],
    required_oracle_refs: [], required_capabilities: []
  }));
  revision.behavior_views.obligation_inputs.custom_responsibilities.push(...responsibilities);
  const { artifact } = await installedObligations(revision);
  for (const [index, [, expectedKind]] of mappings.entries()) {
    const expectedId = customResponsibilityId(responsibilities[index]);
    const obligation = artifact.obligations.find(
      (/** @type {any} */ item) => item.obligation_id === expectedId
    );
    assert.ok(obligation, `expected compiler-owned custom obligation ${expectedId}`);
    assert.equal(obligation.kind, expectedKind);
    assert.equal(obligation.caseable, true);
  }
});

test('view-element custom owner resolves one formal fact and enriches its final route', async () => {
  const revision = buildJourney('all-e3');
  const responsibility = {
    responsibility_type: 'cross-module-interaction', semantic_key: 'view-owner-audit',
    owner: {
      kind: 'view-elements',
      view_element_refs: [{ view_id: 'view_checkout', element_id: 'rule_checkout' }]
    },
    scope: 'checkout', risk: 'medium', source_claim_ids: ['claim_checkout'],
    required_oracle_refs: [], required_capabilities: []
  };
  revision.behavior_views.obligation_inputs.custom_responsibilities.push(responsibility);
  const { artifact } = await installedObligations(revision);
  const obligationId = customResponsibilityId(responsibility);
  assert.equal(artifact.obligations.some(
    (/** @type {any} */ item) => (
      item.obligation_id === obligationId && item.kind === 'interaction'
    )
  ), true);
  assert.equal(artifact.fact_routes.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_checkout'
  ).obligation_ids.includes(obligationId), true);
});

test('interaction semantic subject closed union resolves fact view model and integration surfaces', async () => {
  const revision = buildJourney('all-e3');
  addCheckoutModelClaim(revision);
  addCheckoutIntegrationView(revision);
  const cell = revision.behavior_views.interaction_matrix.find(
    (/** @type {any} */ item) => item.dimension === 'side-effect'
  );
  cell.status = 'candidate';
  revision.behavior_views.interaction_candidates = [{
    candidate_id: 'candidate_closed_union', module_ids: ['checkout'],
    dimension: 'side-effect', disposition: 'blocker',
    source_claim_ids: ['claim_checkout', 'claim_checkout_model'],
    semantic_subject_refs: [
      { kind: 'fact', fact_id: 'fact_checkout' },
      { kind: 'view-element', view_id: 'view_checkout', element_id: 'rule_checkout' },
      { kind: 'model-element', model_ref: 'claim_checkout_model' },
      {
        kind: 'integration-surface', view_id: 'view_checkout_integration',
        element_id: 'integration_checkout', surface: 'request'
      },
      {
        kind: 'integration-surface', view_id: 'view_checkout_integration',
        element_id: 'integration_checkout', surface: 'side-effect',
        side_effect_kind: 'ledger-write', target: 'checkout ledger'
      }
    ],
    issue_intent: {
      missing_type: 'interaction-oracle', scope: 'checkout', answerable: false,
      risk: 'medium', reasons: ['Cross-surface outcome is not specified.'],
      evidence_refs: ['claim_checkout']
    }
  }];
  const { artifact } = await installedObligations(revision);
  assert.equal(artifact.interaction_routes.length, 1);
  assert.equal(artifact.interaction_routes[0].route_type, 'blocked');
});

test('interaction semantic subjects reject dangling out-of-scope unrelated and non-unique selectors', async () => {
  const cases = [
    {
      name: 'dangling',
      prepare: (/** @type {any} */ revision) => {
        revision.behavior_views.interaction_candidates[0].semantic_subject_refs = [
          { kind: 'fact', fact_id: 'fact_unknown' }
        ];
      },
      code: 'INTERACTION_SUBJECT_FACT_DANGLING'
    },
    {
      name: 'out-of-scope',
      prepare: (/** @type {any} */ revision) => {
        addClaim(revision, 'claim_other', 'other');
        addFact(revision, 'fact_other', 'claim_other');
        revision.behavior_views.interaction_candidates[0].semantic_subject_refs = [
          { kind: 'fact', fact_id: 'fact_other' }
        ];
        revision.behavior_views.interaction_candidates[0].source_claim_ids = ['claim_other'];
      },
      code: 'INTERACTION_SUBJECT_MODULE_MISMATCH'
    },
    {
      name: 'unrelated',
      prepare: (/** @type {any} */ revision) => {
        addClaim(revision, 'claim_unrelated_same_scope', 'checkout', 'description');
        revision.behavior_views.interaction_candidates[0].source_claim_ids = [
          'claim_unrelated_same_scope'
        ];
      },
      code: 'INTERACTION_SOURCE_EVIDENCE_UNRELATED'
    },
    {
      name: 'non-unique-side-effect',
      prepare: (/** @type {any} */ revision) => {
        addCheckoutIntegrationView(revision, true);
        revision.behavior_views.interaction_candidates[0].semantic_subject_refs = [{
          kind: 'integration-surface', view_id: 'view_checkout_integration',
          element_id: 'integration_checkout', surface: 'side-effect',
          side_effect_kind: 'ledger-write', target: 'checkout ledger'
        }];
      },
      code: 'INTERACTION_SUBJECT_SIDE_EFFECT_NOT_UNIQUE'
    }
  ];
  for (const scenario of cases) {
    const revision = interactionGapRevision();
    scenario.prepare(revision);
    const run = await runInstalledRevision(revision, { stageNames: runnerStages });
    try {
      assert.equal(run.reply.status, 'need_revision', `${scenario.name}: ${JSON.stringify(run.reply)}`);
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === scenario.code
      ), true, `${scenario.name}: ${JSON.stringify(run.reply)}`);
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  }
});

test('overlapping grouped case blockers are rejected before order-dependent expansion', async () => {
  const revision = revisionFromRules([
    journeyRule('checkout', { scope: 'checkout' }),
    journeyRule('payment', { scope: 'payment' })
  ], { modules: ['checkout', 'payment'] });
  const [checkoutId, paymentId] = revision.case_drafts.obligation_dispositions.map(
    (/** @type {any} */ item) => String(item.obligation_id)
  );
  revision.case_drafts.cases = [];
  revision.case_drafts.obligation_dispositions = [
    {
      status: 'blocker', affected_obligation_ids: [checkoutId, paymentId],
      issue_intent: {
        missing_type: 'oracle', scope: '*', answerable: true, risk: 'high',
        reasons: ['Both outcomes need Oracles.'], evidence_refs: []
      },
      subject: { kind: 'facts', fact_ids: ['fact_checkout', 'fact_payment'] }
    },
    {
      status: 'blocker', affected_obligation_ids: [paymentId],
      issue_intent: {
        missing_type: 'oracle', scope: 'payment', answerable: true, risk: 'critical',
        reasons: ['Payment is already owned by another blocker group.'], evidence_refs: []
      },
      subject: { kind: 'facts', fact_ids: ['fact_payment'] }
    }
  ];
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'need_revision', JSON.stringify(run.reply));
    assert.equal(run.reply.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'OBLIGATION_DISPOSITION_DUPLICATE'
    ), true, JSON.stringify(run.reply));
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('compiler-owned gaps reject Agent Case NotApplicable and expectation closure attempts', async () => {
  const gapId = factGapObligationId();
  const caseAttempt = terminalGapRevision();
  caseAttempt.case_drafts.cases[0].obligation_ids.push(gapId);
  caseAttempt.case_drafts.obligation_dispositions.push({
    obligation_id: gapId, status: 'case_candidate',
    case_ids: [caseAttempt.case_drafts.cases[0].case_id]
  });

  const notApplicableAttempt = terminalGapRevision();
  addClaim(notApplicableAttempt, 'claim_gap_exclusion', 'checkout', 'description');
  notApplicableAttempt.case_drafts.obligation_dispositions.push({
    obligation_id: gapId, status: 'not_applicable',
    exclusion_claim_id: 'claim_gap_exclusion', scope: 'checkout', support_review: 'supported'
  });

  const expectationAttempt = terminalGapRevision();
  expectationAttempt.case_drafts.cases[0].steps[0].expectations[0].closes_obligation_id = gapId;

  for (const [name, revision, expectedCode] of [
    ['case', caseAttempt, 'REQUIREMENT_GAP_AGENT_DISPOSITION_FORBIDDEN'],
    ['not-applicable', notApplicableAttempt, 'REQUIREMENT_GAP_AGENT_DISPOSITION_FORBIDDEN'],
    ['expectation', expectationAttempt, 'ORACLE_CLOSE_TARGET_INVALID']
  ]) {
    const run = await runInstalledRevision(revision);
    try {
      assert.equal(run.reply.status, 'need_revision', `${name}: ${JSON.stringify(run.reply)}`);
      assert.equal(run.reply.diagnostics.some(
        (/** @type {any} */ item) => item.code === expectedCode
      ), true, `${name}: ${JSON.stringify(run.reply)}`);
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  }
});

test('case blocker root is stable across affected-obligation regrouping reasons and risk', async () => {
  const responsibility = {
    responsibility_type: 'cross-module-interaction', semantic_key: 'shared-gap-audit',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] }, scope: 'checkout', risk: 'low',
    source_claim_ids: ['claim_checkout'], required_oracle_refs: [], required_capabilities: []
  };
  const makeRevision = (/** @type {boolean} */ split) => {
    const revision = buildJourney('all-e3');
    revision.behavior_views.obligation_inputs.custom_responsibilities.push(responsibility);
    const normalId = revision.case_drafts.obligation_dispositions[0].obligation_id;
    const customId = customResponsibilityId(responsibility);
    revision.case_drafts.cases = [];
    /**
     * @param {string[]} affectedIds
     * @param {'critical'|'high'|'medium'|'low'} risk
     * @param {string[]} reasons
     */
    const blocker = (affectedIds, risk, reasons) => ({
      status: 'blocker', affected_obligation_ids: affectedIds,
      issue_intent: {
        missing_type: 'behavior-gap', scope: 'checkout', answerable: true, risk,
        reasons, evidence_refs: ['claim_checkout']
      },
      subject: { kind: 'facts', fact_ids: ['fact_checkout'] }
    });
    revision.case_drafts.obligation_dispositions = split
      ? [
          blocker([normalId], 'critical', ['Reworded normal issue.']),
          blocker([customId], 'low', ['Reworded custom issue.'])
        ]
      : [blocker([normalId, customId], 'medium', ['One grouped issue.'])];
    return revision;
  };
  const roots = [];
  for (const revision of [makeRevision(false), makeRevision(true)]) {
    const run = await runInstalledRevision(revision);
    try {
      assert.equal(run.reply.status, 'need_user_answers', JSON.stringify(run.reply));
      assert.equal(run.reply.blockers.length, 1, JSON.stringify(run.reply));
      roots.push(run.reply.blockers[0]);
    } finally {
      await rm(run.runDirectory, { recursive: true, force: true });
    }
  }
  assert.equal(roots[0].root_issue_id, roots[1].root_issue_id);
  assert.deepEqual(roots[0].affected_obligation_ids, roots[1].affected_obligation_ids);
  assert.equal(roots[0].affected_obligation_ids.length, 2);
});
