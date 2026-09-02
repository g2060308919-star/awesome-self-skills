import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, digest, stableId } from '../../src/canonical.mjs';
import { evaluateRevision } from '../../src/core.mjs';
import { resolveSourcePolicy } from '../../src/source-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dimensions = [
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
];
const digestA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const digestB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const digestC = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/**
 * Task 11 pure input is a closed complete revision:
 * `{source_pack,evidence_claims,behavior_views,case_drafts}` plus private
 * system options. The core alone derives every
 * Task 7–10 result; fixtures never submit a classification or final bundle.
 * @param {string} name
 */
async function journeyFixture(name) {
  return JSON.parse(await readFile(path.join(
    repositoryRoot, `test/fixtures/journeys/${name}.json`
  ), 'utf8'));
}

/** @param {any} rule */
function obligationId(rule) {
  if (rule.viewType === 'role') return stableId('obligation', {
    kind: 'role', responsibility: 'permission', scope: rule.scope,
    role: 'tester', permission: `execute-${rule.key}`
  });
  return stableId('obligation', {
    kind: 'decision', responsibility: 'rule', scope: rule.scope,
    rule: { conditions: [...rule.conditions].sort(), result: rule.result, priority: rule.priority }
  });
}

/** @param {number} sourceRevision @param {number} eventSeq */
function initialClarificationState(sourceRevision, eventSeq) {
  return {
    source_revision: sourceRevision,
    clarification_event_seq: eventSeq,
    asked_root_issue_ids: [],
    root_issue_dispositions: [],
    last_pending_root_issue_ids: [],
    last_question_set_digest: '',
    clarification_stop: null,
    semantic_snapshot: null,
    root_snapshot_ledger: []
  };
}

/** @param {string[]} modules @param {any|null} candidate */
function interactionArtifacts(modules, candidate = null) {
  return {
    matrix: dimensions.map((dimension) => ({
      module_ids: [...modules], dimension,
      status: candidate?.dimension === dimension ? 'candidate' : 'checked-no-signal'
    })),
    candidates: candidate ? [candidate] : []
  };
}

/** @param {any} rule */
function evidenceClaim(rule) {
  if (rule.level === 'E1') return {
    claim_id: rule.claimId, claim_form: 'decision-record', level: 'E1', kind: 'assumption',
    scope: rule.scope, value: rule.result, source_locator_ids: [rule.locatorId],
    decision_id: `decision_${rule.key}`, authority: rule.scope
  };
  return {
    claim_id: rule.claimId, claim_form: 'direct', level: 'E3', kind: rule.kind ?? 'requirement',
    scope: rule.scope, value: rule.result, source_locator_ids: [rule.locatorId],
    source_id: rule.sourceId ?? 'source_prd'
  };
}

/** @param {any} rule */
function behaviorView(rule) {
  if (rule.viewType === 'role') return {
    view_id: rule.viewId,
    type: 'role',
    scope: rule.scope,
    source_claim_ids: [rule.claimId],
    elements: [{
      element_id: rule.elementId,
      kind: 'role-permission',
      role: 'tester',
      permissions: [`execute-${rule.key}`],
      source_claim_ids: [rule.claimId],
      model_refs: []
    }],
    relations: []
  };
  return {
    view_id: rule.viewId,
    type: 'decision',
    scope: rule.scope,
    source_claim_ids: [rule.claimId],
    elements: [{
      element_id: rule.elementId,
      kind: 'decision-rule',
      conditions: [...rule.conditions],
      result: rule.result,
      priority: rule.priority,
      source_claim_ids: [rule.claimId],
      model_refs: []
    }],
    relations: []
  };
}

/** @param {any[]} rules */
function obligationInputs(rules) {
  return {
    view_contexts: rules.filter((rule) => rule.viewType === 'role').map((rule) => ({
      view_id: rule.viewId,
      bindings: [{
        selector: {
          kind: 'permission', element_id: rule.elementId, permission: `execute-${rule.key}`
        },
        risk: rule.risk,
        source_claim_ids: [rule.claimId],
        required_oracle_refs: rule.hasOracle === false ? [] : [rule.claimId],
        required_capabilities: ['run-control']
      }]
    })),
    terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
  };
}

/** @param {any} rule */
function caseDraft(rule) {
  const id = obligationId(rule);
  const expectationId = `expectation_${rule.key}`;
  const precondition = canonicalStringify([{
    condition: rule.conditions[0], reachable_from: 'revision start'
  }]);
  const dataPartition = canonicalStringify([{
    name: 'scenario input', value: rule.key
  }]);
  /** @type {any} */
  const draft = {
    case_id: `case_${rule.key}`,
    title: `Verify ${rule.result}`,
    scope: rule.scope,
    risk: rule.risk,
    role: { value: 'tester', evidence_ref: rule.claimId, support_review: 'supported' },
    fact_ids: [rule.factId],
    obligation_ids: [id],
    source_claim_ids: [rule.claimId],
    preconditions: [{
      condition: rule.conditions[0], reachable_from: 'revision start',
      source_claim_ids: [rule.claimId], evidence_ref: rule.claimId, support_review: 'supported'
    }],
    data: [{
      name: 'scenario input', value: rule.key,
      provenance: { type: 'evidence', ref: rule.claimId }, support_review: 'supported'
    }],
    steps: [{
      step_id: `step_${rule.key}`, action: `Exercise ${rule.key}`,
      action_evidence_ref: rule.claimId, support_review: 'supported',
      expectations: [{
        kind: 'obligation-oracle',
        expectation_id: expectationId,
        business_assertion: rule.result,
        preceding_action_id: `step_${rule.key}`,
        observer: 'tester', observation_surface: 'UI', observation_target: 'result',
        oracle: { type: 'state', expected_state: rule.result, comparison: 'equals' },
        evidence_ref: rule.claimId, oracle_evidence_refs: [rule.claimId],
        closes_obligation_id: id, support_review: 'supported'
      }]
    }],
    testability_profile: {
      capabilities: [{ capability: 'run-control', status: 'provided', provenance_ref: rule.claimId }],
      observers: [{ observer: 'tester', observation_target: 'result', status: 'verified', provenance_ref: rule.claimId }],
      controls: [{ control: `exercise-${rule.key}`, status: 'provided', provenance_ref: rule.claimId }]
    },
    post_state: { state: rule.result, evidence_ref: rule.claimId, support_review: 'supported' },
    cleanup: {
      required: false, no_cleanup_reason: 'The scenario is isolated.',
      no_cleanup_evidence_ref: rule.claimId, support_review: 'supported'
    },
    evidence_refs: [rule.claimId],
    execution_signature: {
      role: 'tester', precondition_state: precondition, data_partition: dataPartition,
      action_path: [`Exercise ${rule.key}`], oracle_refs: [expectationId]
    }
  };
  if (rule.level === 'E1') draft.temporary_assumption = {
    claim_id: rule.claimId,
    invalidation_condition: 'A final rule replaces this temporary decision.'
  };
  return draft;
}

/**
 * Build one complete raw revision without calling any Task 3–10 production
 * function. Only the already-frozen Task 2 stable-ID primitive is used to bind
 * independently hand-authored Case references to deterministic obligations.
 * @param {any[]} rules
 * @param {{sourceRevision?:number, interaction?:any, extraClaims?:any[], extraLocators?:any[], extraSources?:any[], extraPolicyRules?:any[], decisions?:any[]}} [options]
 * @returns {any}
 */
function revisionFromRules(rules, options = {}) {
  const sourceRevision = options.sourceRevision ?? (rules.some((rule) => rule.level === 'E1') ? 1 : 0);
  const baseSource = {
    source_id: 'source_prd', kind: 'prd', version: '1', status: 'effective', authority: 'owner',
    content: 'Frozen journey requirements.', content_digest: digestA, scope: '*'
  };
  const sources = [baseSource, ...(options.extraSources ?? [])];
  const locators = rules.map((rule, index) => ({
    locator_id: rule.locatorId, source_id: rule.sourceId ?? 'source_prd', type: 'text-range',
    text_range: { start: index, end: index + 1 }, content_digest: rule.digest ?? digestA,
    extraction_integrity: 'verified'
  }));
  locators.push(...(options.extraLocators ?? []));
  const decisions = options.decisions ?? rules.filter((rule) => rule.level === 'E1').map((rule, index) => ({
    decision_id: `decision_${rule.key}`, question_id: `question_${rule.key}`,
    root_issue_ids: [`root_answer_${rule.key}`], affected_obligation_ids: [obligationId(rule)],
    clarification_event_seq: index + 1, confirmer: 'owner', confirmed_at: '2026-08-30',
    question: `What is the ${rule.key} result?`, answer: rule.result, disposition: 'temporary',
    authority_scope: rule.scope, effective_scope: rule.scope,
    evidence_ref: rule.locatorId, evidence_level: 'E1'
  }));
  const policyRules = [{
    rule_id: 'policy_prd', source_ids: ['source_prd'], scope: '*', authority: 'owner', status: 'effective'
  }, ...(options.extraPolicyRules ?? [])];
  const views = rules.map(behaviorView);
  const interaction = options.interaction ?? interactionArtifacts(['checkout']);
  const claims = [...rules.map(evidenceClaim), ...(options.extraClaims ?? [])];
  const facts = rules.map((rule) => ({
    fact_id: rule.factId, claim_id: rule.claimId, status: 'active', source_claim_ids: [rule.claimId]
  }));
  const cases = rules.filter((rule) => rule.mode === 'case').map(caseDraft);
  const dispositions = rules.map((rule) => {
    const id = obligationId(rule);
    if (rule.mode === 'blocker') return {
      status: 'blocker', affected_obligation_ids: [id],
      issue_intent: {
        missing_type: 'oracle', scope: rule.scope, answerable: true, risk: rule.risk,
        reasons: ['FORMAL_ORACLE_MISSING'], evidence_refs: [rule.claimId]
      },
      subject: { kind: 'facts', fact_ids: [rule.factId] }
    };
    if (rule.mode === 'not_applicable') return {
      obligation_id: id, status: 'not_applicable', exclusion_claim_id: 'claim_exclusion',
      scope: rule.scope, support_review: 'supported'
    };
    return { obligation_id: id, status: 'case_candidate', case_ids: [`case_${rule.key}`] };
  });
  return {
    schema_version: '1.0.0', source_revision: sourceRevision, compiler_version: '0.1.0',
    lineage: { source_digest: digestB, case_draft_digest: digestC },
    source_pack: {
      schema_version: '1.0.0', source_revision: sourceRevision, run_scope: '*',
      sources, locators, source_policy: { rules: policyRules },
      decision_records: decisions, clarification_events: []
    },
    evidence_claims: {
      schema_version: '1.0.0', source_revision: sourceRevision, claims, fact_ledger: facts
    },
    behavior_views: {
      schema_version: '1.0.0', source_revision: sourceRevision, views,
      interaction_matrix: interaction.matrix, interaction_candidates: interaction.candidates,
      obligation_inputs: obligationInputs(rules)
    },
    case_drafts: {
      schema_version: '1.0.0', source_revision: sourceRevision, cases,
      obligation_dispositions: dispositions, exploratory_candidates: []
    },
    clarification: {
      prior_state: initialClarificationState(sourceRevision, decisions.length),
      append_batch: { decision_records: [], clarification_events: [] }
    },
    limits: ['Compilation is limited to the supplied revision.'],
    expert_recall_limits: ['Expert recall is benchmark-only.']
  };
}

/** @param {string} key @param {Partial<any>} [overrides] */
function rule(key, overrides = {}) {
  return {
    key, claimId: `claim_${key}`, factId: `fact_${key}`, locatorId: `locator_${key}`,
    viewId: `view_${key}`, elementId: `rule_${key}`, conditions: [`${key} is ready`],
    result: `${key} accepted`, priority: 0, scope: 'checkout', risk: 'high',
    level: 'E3', hasOracle: true, mode: 'case', ...overrides
  };
}

/** @param {string} scenario */
function buildRevision(scenario) {
  if (scenario === 'grounded') return revisionFromRules([rule('checkout')]);
  if (scenario === 'conditional') return revisionFromRules([
    rule('checkout', { level: 'E1' })
  ]);
  if (scenario === 'partial-blocked') return revisionFromRules([
    rule('checkout'),
    rule('refund', {
      viewType: 'role', hasOracle: false, mode: 'blocker', risk: 'critical',
      result: 'refund failure handled'
    })
  ]);
  if (scenario === 'all-blocked') return revisionFromRules([
    rule('refund', {
      viewType: 'role', hasOracle: false, mode: 'blocker', risk: 'high',
      result: 'refund failure handled'
    })
  ]);
  if (scenario === 'all-not-applicable') {
    const exclusion = {
      claim_id: 'claim_exclusion', claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: 'checkout', value: 'This scenario is excluded.',
      source_locator_ids: ['locator_exclusion'], source_id: 'source_prd'
    };
    return revisionFromRules([rule('legacy', { mode: 'not_applicable', risk: 'low' })], {
      extraClaims: [exclusion],
      extraLocators: [{
        locator_id: 'locator_exclusion', source_id: 'source_prd', type: 'text-range',
        text_range: { start: 100, end: 101 }, content_digest: digestA,
        extraction_integrity: 'verified'
      }]
    });
  }
  if (scenario === 'interaction') {
    const candidate = {
      candidate_id: 'candidate_checkout_payments', module_ids: ['checkout', 'payments'],
      dimension: 'interface-event', disposition: 'formal-view',
      source_claim_ids: ['claim_checkout'],
      semantic_subject_refs: [{ kind: 'view-element', view_id: 'view_checkout', element_id: 'rule_checkout' }],
      formal_view_id: 'view_checkout'
    };
    return revisionFromRules([rule('checkout')], {
      interaction: interactionArtifacts(['checkout', 'payments'], candidate)
    });
  }
  if (scenario === 'risk-only') {
    const candidate = {
      candidate_id: 'candidate_latency', module_ids: ['checkout'], dimension: 'time',
      disposition: 'exploratory', source_claim_ids: ['claim_latency_signal'],
      semantic_subject_refs: [{ kind: 'model-element', model_ref: 'claim_latency' }],
      exploratory_id: 'exploratory_latency'
    };
    const input = revisionFromRules([], {
      extraClaims: [{
        claim_id: 'claim_latency_signal', claim_form: 'direct', level: 'E3', kind: 'description',
        scope: 'checkout', value: 'Latency is an investigation signal.',
        source_locator_ids: ['locator_latency'], source_id: 'source_prd'
      }, {
        claim_id: 'claim_latency', claim_form: 'derived', level: 'E2', kind: 'model-element',
        scope: 'checkout', value: 'Latency is an investigation signal.',
        source_locator_ids: ['locator_latency'], derivation_kind: 'decision-table-instance',
        derivation_target: 'model-element', parent_claim_ids: ['claim_latency_signal'],
        parameters: { table_id: 'latency-signal' },
        rule_input: {
          conditions: ['latency signal exists'], outcome: 'Latency is an investigation signal.'
        }
      }],
      extraLocators: [{
        locator_id: 'locator_latency', source_id: 'source_prd', type: 'text-range',
        text_range: { start: 0, end: 1 }, content_digest: digestA, extraction_integrity: 'verified'
      }],
      interaction: interactionArtifacts(['checkout'], candidate)
    });
    input.case_drafts.exploratory_candidates = [{
      exploratory_id: 'exploratory_latency', title: 'Explore latency', scope: 'checkout',
      risk: 'medium', source_claim_ids: ['claim_latency_signal']
    }];
    return input;
  }
  if (scenario === 'conflict') return conflictRevision();
  throw new Error(`unknown test journey ${scenario}`);
}

/** @param {any} input @param {'pause_for_clarification'|'record_only'} interactionPolicy @returns {any} */
function runRevision(input, interactionPolicy) {
  return evaluateRevision({
    source_pack: input.source_pack,
    evidence_claims: input.evidence_claims,
    behavior_views: input.behavior_views,
    case_drafts: input.case_drafts
  }, {
    systemLineage: {
      compiler_version: input.compiler_version,
      lineage: input.lineage,
      expert_recall_limits: input.expert_recall_limits
    },
    clarificationState: input.clarification,
    interactionPolicy,
    limits: input.limits
  });
}

function conflictRevision() {
  const shipping = rule('shipping', {
    sourceId: 'source_shipping', locatorId: 'locator_shipping', scope: 'checkout.shipping',
    result: 'shipping confirmed', risk: 'high'
  });
  const payment = rule('payment', {
    level: 'E1', sourceId: 'source_payment_new', locatorId: 'locator_payment_new',
    scope: 'checkout.payment', result: 'payment settles in two days', risk: 'critical',
    viewType: 'role'
  });
  const decision = {
    decision_id: 'decision_payment', question_id: 'question_payment', root_issue_ids: ['root_unrelated'],
    affected_obligation_ids: [obligationId(payment)], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-30', question: 'Temporary settlement?',
    answer: payment.result, disposition: 'temporary', authority_scope: payment.scope,
    effective_scope: payment.scope, evidence_ref: payment.locatorId, evidence_level: 'E1'
  };
  const input = revisionFromRules([shipping, payment], {
    sourceRevision: 1,
    decisions: [decision],
    extraSources: [
      {
        source_id: 'source_shipping', kind: 'prd', version: '1', status: 'effective',
        authority: 'shipping-owner', content: 'Shipping confirmation is shown.',
        content_digest: digestB, scope: 'checkout.shipping'
      },
      {
        source_id: 'source_payment_old', kind: 'formal-rule', version: '1', status: 'effective',
        authority: 'payments-owner', content: 'Payments settle in one day.',
        content_digest: digestA, scope: 'checkout.payment'
      },
      {
        source_id: 'source_payment_new', kind: 'formal-rule', version: '2', status: 'effective',
        authority: 'payments-owner', content: 'Payments settle in two days.',
        content_digest: digestC, scope: 'checkout.payment'
      }
    ],
    extraPolicyRules: [
      { rule_id: 'policy_shipping', source_ids: ['source_shipping'], scope: 'checkout.shipping', authority: 'shipping-owner', status: 'effective' },
      { rule_id: 'policy_payment_old', source_ids: ['source_payment_old'], scope: 'checkout.payment', authority: 'payments-owner', status: 'effective' },
      { rule_id: 'policy_payment_new', source_ids: ['source_payment_new'], scope: 'checkout.payment', authority: 'payments-owner', status: 'effective' }
    ]
  });
  input.source_pack.source_policy.rules = input.source_pack.source_policy.rules.filter((/** @type {any} */ item) => item.rule_id !== 'policy_prd');
  return input;
}

/** @param {any} input @param {number} sourceRevision */
function setSourceRevision(input, sourceRevision) {
  input.source_revision = sourceRevision;
  for (const artifact of [
    input.source_pack, input.evidence_claims, input.behavior_views, input.case_drafts
  ]) artifact.source_revision = sourceRevision;
}

/** Load private orchestration helpers without adding production exports. */
async function loadConflictGate(salt = '') {
  let source = await readFile(path.join(repositoryRoot, 'src/core.mjs'), 'utf8');
  source = source.replaceAll("from '../skill/", `from 'file://${repositoryRoot}/skill/`);
  source = source.replaceAll("from './", `from 'file://${repositoryRoot}/src/`);
  source += `\nexport { applyLocalConflictBlocks, externalizePendingRoots, prepareConflictRelations };\n// ${salt}\n`;
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

/** @param {any} result @param {any} expected */
function assertFinished(result, expected) {
  assert.equal(result.status, expected.status, canonicalStringify(result));
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.bundle.grounded.length, expected.grounded);
  assert.equal(result.bundle.conditional.length, expected.conditional);
  assert.equal(result.bundle.blocked.length, expected.blocked);
  assert.equal(result.bundle.exploratory.length, expected.exploratory);
  assert.equal(result.bundle.coverage.not_applicable.length, expected.not_applicable ?? 0);
  assert.equal(result.bundle.quality.delivery_status, expected.delivery_status);
  assert.equal(result.bundle_digest, digest(result.bundle));
  assert.equal(result.markdown_digest, digest(result.markdown));
}

for (const fixtureName of [
  'grounded', 'conditional', 'all-blocked', 'all-not-applicable', 'conflict', 'interaction'
]) {
  test(`core journey ${fixtureName} crosses the complete deterministic pipeline`, async () => {
    const fixture = await journeyFixture(fixtureName);
    const input = buildRevision(fixture.scenario);
    const before = structuredClone(input);
    const first = runRevision(input, fixture.interaction_policy);
    const second = runRevision(structuredClone(input), fixture.interaction_policy);
    assertFinished(first, fixture.expected);
    assert.equal(second.bundle_digest, first.bundle_digest, 'the canonical bundle digest must be stable');
    assert.equal(second.markdown_digest, first.markdown_digest, 'the Markdown projection digest must be stable');
    assert.deepEqual(input, before, 'pure core must not mutate the submitted revision');
    if (fixtureName === 'conflict') {
      assert.equal(first.bundle.grounded[0].scope, 'checkout.shipping');
      assert.match(first.bundle.blocked[0].reason, /UNRESOLVED_CONFLICT/u);
    }
    if (fixtureName === 'interaction') {
      assert.equal(input.behavior_views.interaction_matrix.length, 7);
      assert.equal(input.behavior_views.interaction_candidates[0].disposition, 'formal-view');
    }
  });
}

test('core journey one missing capability pauses strict while preserving its unaffected Grounded Case', async () => {
  const fixture = await journeyFixture('partial-blocked');
  const input = buildRevision(fixture.scenario);
  const strict = runRevision(input, 'pause_for_clarification');
  assert.equal(strict.status, fixture.expected.strict_status, canonicalStringify(strict));
  assert.deepEqual(strict.diagnostics, []);
  assert.equal(strict.pending_root_issues.length, 1);
  assert.deepEqual(strict.semantic_snapshot.delivery_sections.grounded.length, 1);
  assert.deepEqual(strict.semantic_snapshot.delivery_sections.blocked.length, 1);

  const delivered = runRevision(input, fixture.interaction_policy);
  assertFinished(delivered, fixture.expected);
  assert.equal(delivered.bundle.grounded[0].scope, 'checkout');
  const blockerDisposition = input.case_drafts.obligation_dispositions.find((/** @type {any} */ item) => item.status === 'blocker');
  assert.ok(blockerDisposition);
  assert.equal(delivered.bundle.blocked[0].obligation_id, blockerDisposition.affected_obligation_ids[0]);
});

test('core journey risk-only stays Exploratory and outside every formal denominator', () => {
  const result = runRevision(buildRevision('risk-only'), 'pause_for_clarification');
  assertFinished(result, {
    status: 'finished', grounded: 0, conditional: 0, blocked: 0, exploratory: 1,
    not_applicable: 0, delivery_status: 'no_applicable_formal_test_points'
  });
  assert.equal(result.bundle.coverage.formal.total, 0);
  assert.equal(result.bundle.coverage.requirements.total, 0);
});

test('core journey diagnostics fail closed in canonical stable order at the owning stage', () => {
  const input = buildRevision('grounded');
  input.source_pack.sources[0].unexpected = true;
  input.evidence_claims.claims[0].unexpected = true;
  const first = runRevision(input, 'pause_for_clarification');
  const second = runRevision(structuredClone(input), 'pause_for_clarification');
  assert.equal(first.status, 'need_revision');
  assert.equal(first.stage, 'schema');
  assert.deepEqual(first, second);
  assert.deepEqual(first.diagnostics, [...first.diagnostics].sort((left, right) => (
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(String(left.related_id ?? ''), String(right.related_id ?? ''))
  )));
});

test('core journey preserves a surfaced source-conflict root through a legal final Decision revision', () => {
  const broadPayment = rule('payment', {
    level: 'E1', sourceId: 'source_payment_new', locatorId: 'locator_payment_new',
    scope: 'checkout.payment', result: 'payment settles in two days', risk: 'critical',
    viewType: 'role'
  });
  const narrowPayment = { ...broadPayment, scope: 'checkout.payment.card' };
  const firstInput = JSON.parse(JSON.stringify(conflictRevision())
    .replaceAll('checkout.payment', 'checkout.payment.card')
    .replaceAll(obligationId(broadPayment), obligationId(narrowPayment)));
  for (const policyRule of firstInput.source_pack.source_policy.rules) {
    if (policyRule.rule_id === 'policy_payment_old' || policyRule.rule_id === 'policy_payment_new') {
      policyRule.scope = 'checkout.payment';
    }
  }
  const policy = resolveSourcePolicy(firstInput.source_pack);
  assert.equal(policy.conflicts.length, 1);
  const sourceConflictRootId = policy.conflicts[0].root_issue_id;
  assert.equal(policy.conflicts[0].scope, 'checkout.payment');
  const first = runRevision(firstInput, 'pause_for_clarification');

  assert.equal(first.status, 'need_user_answers', canonicalStringify(first));
  assert.equal(first.pending_root_issues.length, 1);
  assert.equal(first.pending_root_issues[0].root_issue_id, sourceConflictRootId);
  assert.equal(first.pending_root_issues[0].scope, 'checkout.payment');
  assert.equal(first.pending_root_issues[0].question, 'Clarification required for source-conflict in checkout.payment.');
  assert.equal(first.pending_root_issues[0].root_issue_key, canonicalStringify({
    missing_type: 'source-conflict',
    rule_ids: policy.conflicts[0].rule_ids,
    scope: 'checkout.payment',
    source_ids: policy.conflicts[0].source_ids
  }));

  const paymentObligationId = obligationId(rule('payment', {
    level: 'E1', sourceId: 'source_payment_new', locatorId: 'locator_payment_new',
    scope: 'checkout.payment.card', result: 'payment settles in two days', risk: 'critical',
    viewType: 'role'
  }));
  const finalDecision = {
    decision_id: 'decision_payment_conflict_final',
    question_id: stableId('question', { root_issue_ids: [sourceConflictRootId] }),
    root_issue_ids: [sourceConflictRootId], affected_obligation_ids: [paymentObligationId],
    clarification_event_seq: 2, confirmer: 'payments-owner', confirmed_at: '2026-08-30',
    question: first.pending_root_issues[0].question,
    answer: 'payment settles in two days', disposition: 'final',
    authority_scope: 'checkout.payment', effective_scope: 'checkout.payment',
    evidence_ref: 'locator_payment_new', evidence_level: 'E3'
  };
  const secondInput = structuredClone(firstInput);
  setSourceRevision(secondInput, 2);
  secondInput.source_pack.decision_records.push(finalDecision);
  const paymentClaim = secondInput.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === 'claim_payment');
  paymentClaim.level = 'E3';
  paymentClaim.kind = 'requirement';
  paymentClaim.authority = 'checkout.payment';
  paymentClaim.decision_id = finalDecision.decision_id;
  const paymentCase = secondInput.case_drafts.cases.find((/** @type {any} */ item) => item.case_id === 'case_payment');
  delete paymentCase.temporary_assumption;
  secondInput.clarification.prior_state = first.clarification_state;
  secondInput.clarification.append_batch.decision_records = [finalDecision];

  const invalidQuestionInput = structuredClone(secondInput);
  invalidQuestionInput.clarification.append_batch.decision_records[0].question_id = 'question_forged';
  const invalidQuestion = runRevision(invalidQuestionInput, 'pause_for_clarification');
  assert.equal(invalidQuestion.status, 'need_revision');
  assert.equal(invalidQuestion.stage, 'clarification', canonicalStringify(invalidQuestion));

  const second = runRevision(secondInput, 'pause_for_clarification');
  assert.equal(second.status, 'finished', canonicalStringify(second));
  assert.equal(second.bundle.grounded.length, 2);
  assert.equal(second.bundle.blocked.length, 0);
  assert.deepEqual(second.bundle.grounded.map((/** @type {any} */ item) => item.scope).sort(), [
    'checkout.payment.card', 'checkout.shipping'
  ]);
});

test('core boundary snapshots own data without executing submitted accessors or accepting hidden structure', () => {
  const cases = [
    {
      name: 'own-symbol',
      mutate(/** @type {any} */ input) { input.source_pack[Symbol('extra')] = 'outside contract'; }
    },
    {
      name: 'non-enumerable',
      mutate(/** @type {any} */ input) {
        Object.defineProperty(input.source_pack, 'hidden_extra', { value: true, enumerable: false });
      }
    },
    {
      name: 'custom-prototype',
      mutate(/** @type {any} */ input) { Object.setPrototypeOf(input.source_pack, { polluted: true }); }
    }
  ];
  for (const item of cases) {
    const input = buildRevision('grounded');
    item.mutate(input);
    const result = runRevision(input, 'pause_for_clarification');
    assert.equal(result.status, 'need_revision', item.name);
    assert.equal(result.stage, 'schema', item.name);
  }

  const accessorInput = buildRevision('grounded');
  let accessorReads = 0;
  Object.defineProperty(accessorInput.source_pack, 'schema_version', {
    enumerable: true,
    get() { accessorReads += 1; return '0.1.0'; }
  });
  const accessorResult = runRevision(accessorInput, 'pause_for_clarification');
  assert.equal(accessorReads, 0);
  assert.equal(accessorResult.status, 'need_revision');
  assert.equal(/** @type {any} */ (accessorResult).stage, 'schema');

  const controlledArrayInput = buildRevision('grounded');
  let iteratorCalls = 0;
  Object.defineProperty(controlledArrayInput.limits, Symbol.iterator, {
    value() { iteratorCalls += 1; return [][Symbol.iterator](); }
  });
  const controlledArrayResult = runRevision(controlledArrayInput, 'pause_for_clarification');
  assert.equal(iteratorCalls, 0);
  assert.equal(controlledArrayResult.status, 'need_revision');
  assert.equal(controlledArrayResult.stage, 'schema');

  const sparseInput = buildRevision('grounded');
  sparseInput.limits = new Array(2);
  sparseInput.limits[1] = 'retained';
  const sparseResult = runRevision(sparseInput, 'pause_for_clarification');
  assert.equal(sparseResult.status, 'need_revision');
  assert.equal(sparseResult.stage, 'schema');
});

test('core boundary snapshots options once and contains revoked proxies and patched Array methods', () => {
  const input = buildRevision('partial-blocked');
  let policyReads = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, 'interactionPolicy', {
    enumerable: true,
    get() { policyReads += 1; return policyReads === 1 ? 'pause_for_clarification' : 'record_only'; }
  });
  const accessorResult = evaluateRevision(input, accessorOptions);
  assert.equal(policyReads, 0);
  assert.equal(accessorResult.status, 'need_revision');
  assert.equal(/** @type {any} */ (accessorResult).stage, 'schema');

  const revokedInput = Proxy.revocable({}, {});
  revokedInput.revoke();
  /** @type {any} */
  let proxyResult = null;
  assert.doesNotThrow(() => {
    proxyResult = evaluateRevision(revokedInput.proxy, { interactionPolicy: 'pause_for_clarification' });
  });
  assert.equal(proxyResult.status, 'need_revision');

  let revokeDuringSnapshot = () => {};
  const selfRevokingInput = new Proxy({ only: true }, {
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      revokeDuringSnapshot();
      return descriptor;
    }
  });
  const selfRevoking = Proxy.revocable(selfRevokingInput, {});
  revokeDuringSnapshot = selfRevoking.revoke;
  assert.doesNotThrow(() => {
    proxyResult = evaluateRevision(selfRevoking.proxy, { interactionPolicy: 'pause_for_clarification' });
  });
  assert.equal(proxyResult.status, 'need_revision');

  const revokedOptions = Proxy.revocable({ interactionPolicy: 'pause_for_clarification' }, {});
  revokedOptions.revoke();
  assert.doesNotThrow(() => {
    proxyResult = evaluateRevision({}, /** @type {any} */ (revokedOptions.proxy));
  });
  assert.equal(proxyResult.status, 'need_revision');

  const sortDescriptor = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(Array.prototype, 'sort')
  );
  const validSortInput = buildRevision('grounded');
  let sortReads = 0;
  try {
    Object.defineProperty(Array.prototype, 'sort', {
      configurable: true,
      get() { sortReads += 1; return sortDescriptor.value; }
    });
    const result = evaluateRevision(validSortInput, { interactionPolicy: 'pause_for_clarification' });
    assert.equal(result.status, 'need_revision');
    assert.equal(sortReads, 0);
  } finally {
    Object.defineProperty(Array.prototype, 'sort', sortDescriptor);
  }

  const iteratorDescriptor = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)
  );
  let iteratorReads = 0;
  let iteratorInvocations = 0;
  try {
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      get() {
        iteratorReads += 1;
        return /** @this {any} */ function submittedPrototypeIterator() {
          iteratorInvocations += 1;
          return Reflect.apply(iteratorDescriptor.value, this, []);
        };
      }
    });
    const result = evaluateRevision({}, { interactionPolicy: 'pause_for_clarification' });
    assert.equal(result.status, 'need_revision');
    assert.equal(iteratorReads, 0);
    assert.equal(iteratorInvocations, 0);
  } finally {
    Object.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
  }

  const inheritedSetterInput = buildRevision('grounded');
  let numericSetterCalls = 0;
  let inheritedSetterResult;
  try {
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      set() { numericSetterCalls += 1; }
    });
    inheritedSetterResult = evaluateRevision(inheritedSetterInput, {
      interactionPolicy: 'pause_for_clarification'
    });
  } finally {
    delete Array.prototype[0];
  }
  assert.equal(inheritedSetterResult.status, 'need_revision');
  assert.equal(numericSetterCalls, 0);
});

test('core boundary rejects replaced join and collection iterators without reading their getters', () => {
  const patchedIntrinsics = /** @type {Array<[string, object, PropertyKey]>} */ ([
    ['array-join', Array.prototype, 'join'],
    ['set-iterator', Set.prototype, Symbol.iterator],
    ['set-add', Set.prototype, 'add'],
    ['set-has', Set.prototype, 'has'],
    ['map-iterator', Map.prototype, Symbol.iterator],
    ['map-get', Map.prototype, 'get'],
    ['map-set', Map.prototype, 'set']
  ]);
  const observations = [];
  for (const [name, prototype, key] of patchedIntrinsics) {
    const descriptor = /** @type {PropertyDescriptor} */ (
      Object.getOwnPropertyDescriptor(prototype, key)
    );
    const intrinsicInput = buildRevision('grounded');
    let getterReads = 0;
    let intrinsicResult;
    try {
      Object.defineProperty(prototype, key, {
        configurable: true,
        get() { getterReads += 1; return descriptor.value; }
      });
      intrinsicResult = evaluateRevision(intrinsicInput, {
        interactionPolicy: 'pause_for_clarification'
      });
    } finally {
      Object.defineProperty(prototype, key, descriptor);
    }
    observations.push({ name, getterReads, status: intrinsicResult.status });
  }
  assert.deepEqual(observations, [
    { name: 'array-join', getterReads: 0, status: 'need_revision' },
    { name: 'set-iterator', getterReads: 0, status: 'need_revision' },
    { name: 'set-add', getterReads: 0, status: 'need_revision' },
    { name: 'set-has', getterReads: 0, status: 'need_revision' },
    { name: 'map-iterator', getterReads: 0, status: 'need_revision' },
    { name: 'map-get', getterReads: 0, status: 'need_revision' },
    { name: 'map-set', getterReads: 0, status: 'need_revision' }
  ]);
});

test('core boundary never resolves replaced global collection constructors', () => {
  const observations = [];
  for (const name of ['Set', 'Map']) {
    const descriptor = /** @type {PropertyDescriptor} */ (
      Object.getOwnPropertyDescriptor(globalThis, name)
    );
    let constructorCalls = 0;
    let result = null;
    let raw = null;
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true, writable: true,
        value: class ReplacedCollection {
          constructor() { constructorCalls += 1; throw new Error('constructor executed'); }
        }
      });
      try {
        result = evaluateRevision({}, { interactionPolicy: 'pause_for_clarification' });
      } catch (error) {
        raw = String(error);
      }
    } finally {
      Object.defineProperty(globalThis, name, descriptor);
    }
    observations.push({ name, constructorCalls, status: result?.status ?? null, raw });
  }
  assert.deepEqual(observations, [
    { name: 'Set', constructorCalls: 0, status: 'need_revision', raw: null },
    { name: 'Map', constructorCalls: 0, status: 'need_revision', raw: null }
  ]);
});

test('core boundary never consults a replaced String iterator while sorting diagnostics', () => {
  const descriptor = /** @type {PropertyDescriptor} */ (
    Object.getOwnPropertyDescriptor(String.prototype, Symbol.iterator)
  );
  let getterReads = 0;
  let result = null;
  let raw = null;
  try {
    Object.defineProperty(String.prototype, Symbol.iterator, {
      configurable: true,
      get() { getterReads += 1; throw new Error('string iterator executed'); }
    });
    try {
      result = evaluateRevision({}, { interactionPolicy: 'pause_for_clarification' });
    } catch (error) {
      raw = String(error);
    }
  } finally {
    Object.defineProperty(String.prototype, Symbol.iterator, descriptor);
  }
  assert.deepEqual({ getterReads, status: result?.status ?? null, raw }, {
    getterReads: 0, status: 'need_revision', raw: null
  });
});

test('core rejects polluted constructors and dynamic String methods before a valid revision executes them', async () => {
  const fixture = await journeyFixture('grounded');
  const input = buildRevision(fixture.scenario);
  assert.equal(runRevision(input, 'pause_for_clarification').status, 'finished');

  const constructorNames = ['Array', 'Set', 'Map', 'String'];
  const stringMethodNames = ['trim', 'includes', 'split'];
  const constructorDescriptors = constructorNames.map((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (!descriptor) throw new Error(`missing global constructor ${name}`);
    return descriptor;
  });
  const stringMethodDescriptors = stringMethodNames.map((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
    if (!descriptor) throw new Error(`missing String method ${name}`);
    return descriptor;
  });
  let constructorCalls = 0;
  let stringMethodCalls = 0;
  /** @type {any} */
  let result;
  try {
    for (let index = 0; index < constructorNames.length; index += 1) {
      const descriptor = constructorDescriptors[index];
      const original = descriptor.value;
      Object.defineProperty(globalThis, constructorNames[index], {
        ...descriptor,
        value: new Proxy(original, {
          apply(target, thisArg, args) {
            constructorCalls += 1;
            return Reflect.apply(target, thisArg, args);
          },
          construct(target, args, newTarget) {
            constructorCalls += 1;
            return Reflect.construct(target, args, newTarget);
          }
        })
      });
    }
    for (let index = 0; index < stringMethodNames.length; index += 1) {
      const descriptor = stringMethodDescriptors[index];
      Object.defineProperty(String.prototype, stringMethodNames[index], {
        ...descriptor,
        value: new Proxy(descriptor.value, {
          apply(target, thisArg, args) {
            stringMethodCalls += 1;
            return Reflect.apply(target, thisArg, args);
          }
        })
      });
    }
    result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
  } finally {
    for (let index = stringMethodNames.length - 1; index >= 0; index -= 1) {
      Object.defineProperty(String.prototype, stringMethodNames[index], stringMethodDescriptors[index]);
    }
    for (let index = constructorNames.length - 1; index >= 0; index -= 1) {
      Object.defineProperty(globalThis, constructorNames[index], constructorDescriptors[index]);
    }
  }
  assert.equal(constructorCalls, 0);
  assert.equal(stringMethodCalls, 0);
  assert.equal(result.status, 'need_revision');
  assert.equal(result.stage, 'schema');
  assert.deepEqual(result.diagnostics.map((/** @type {any} */ item) => item.code), [
    'CORE_INTRINSIC_INVALID'
  ]);
});

test('core rejects Number Object and Symbol proxies before any forwarding or throwing trap runs', async () => {
  const fixture = await journeyFixture('grounded');
  const input = buildRevision(fixture.scenario);
  assert.equal(runRevision(input, 'pause_for_clarification').status, 'finished');
  const defineProperty = Object.defineProperty;
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const globalNames = ['Number', 'Object', 'Symbol'];
  const modes = ['forward', 'throw'];
  const summaries = [];
  for (let nameIndex = 0; nameIndex < globalNames.length; nameIndex += 1) {
    const name = globalNames[nameIndex];
    const descriptor = getOwnPropertyDescriptor(globalThis, name);
    if (!descriptor) throw new Error(`missing global ${name}`);
    for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
      const mode = modes[modeIndex];
      let calls = 0;
      const polluted = new Proxy(descriptor.value, {
        apply(target, thisArg, args) {
          calls += 1;
          if (mode === 'throw') throw new Error(`${name} apply trap executed`);
          return Reflect.apply(target, thisArg, args);
        },
        construct(target, args, newTarget) {
          calls += 1;
          if (mode === 'throw') throw new Error(`${name} construct trap executed`);
          return Reflect.construct(target, args, newTarget);
        },
        get(target, key, receiver) {
          calls += 1;
          if (mode === 'throw') throw new Error(`${name} get trap executed`);
          return Reflect.get(target, key, receiver);
        }
      });
      /** @type {any} */
      let result;
      try {
        Reflect.apply(defineProperty, Object, [globalThis, name, { ...descriptor, value: polluted }]);
        result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
      } finally {
        Reflect.apply(defineProperty, Object, [globalThis, name, descriptor]);
      }
      summaries.push({
        name, mode, calls, status: result.status, stage: result.stage,
        codes: result.diagnostics.map((/** @type {any} */ item) => item.code)
      });
    }
  }
  assert.deepEqual(summaries, [
    { name: 'Number', mode: 'forward', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { name: 'Number', mode: 'throw', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { name: 'Object', mode: 'forward', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { name: 'Object', mode: 'throw', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { name: 'Symbol', mode: 'forward', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { name: 'Symbol', mode: 'throw', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] }
  ]);
});

test('core rejects RegExp test pollution before snapshotting a complete valid revision', async () => {
  const fixture = await journeyFixture('grounded');
  const input = buildRevision(fixture.scenario);
  const descriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
  if (!descriptor) throw new Error('missing RegExp.prototype.test');
  const summaries = [];
  for (const mode of ['forward', 'throw']) {
    let calls = 0;
    /** @type {any} */
    let result;
    try {
      Object.defineProperty(RegExp.prototype, 'test', {
        ...descriptor,
        value: new Proxy(descriptor.value, {
          apply(target, thisArg, args) {
            calls += 1;
            if (mode === 'throw') throw new Error('RegExp test trap executed');
            return Reflect.apply(target, thisArg, args);
          }
        })
      });
      result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
    } finally {
      Object.defineProperty(RegExp.prototype, 'test', descriptor);
    }
    summaries.push({
      mode, calls, status: result.status, stage: result.stage,
      codes: result.diagnostics.map((/** @type {any} */ item) => item.code)
    });
  }
  assert.deepEqual(summaries, [
    { mode: 'forward', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { mode: 'throw', calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] }
  ]);
});

test('core rejects Map size pollution before finalizing one closed input diagnostic', async () => {
  const fixture = await journeyFixture('grounded');
  const input = buildRevision(fixture.scenario);
  input.compiler_version = ' invalid ';
  const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'size');
  if (!descriptor || typeof descriptor.get !== 'function') {
    throw new Error('missing Map.prototype.size getter');
  }
  const summaries = [];
  for (const mode of ['forward', 'throw']) {
    let reads = 0;
    /** @type {any} */
    let result;
    try {
      Object.defineProperty(Map.prototype, 'size', {
        ...descriptor,
        get: new Proxy(descriptor.get, {
          apply(target, thisArg, args) {
            reads += 1;
            if (mode === 'throw') throw new Error('Map size getter executed');
            return Reflect.apply(target, thisArg, args);
          }
        })
      });
      result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
    } finally {
      Object.defineProperty(Map.prototype, 'size', descriptor);
    }
    summaries.push({
      mode, reads, status: result.status, stage: result.stage,
      codes: result.diagnostics.map((/** @type {any} */ item) => item.code)
    });
  }
  assert.deepEqual(summaries, [
    { mode: 'forward', reads: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { mode: 'throw', reads: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] }
  ]);
});

test('core rejects derived RegExp and Array species intrinsics before a valid revision executes them', async () => {
  const fixture = await journeyFixture('grounded');
  const input = buildRevision(fixture.scenario);
  const cases = [
    { owner: RegExp.prototype, key: 'exec', kind: 'method' },
    { owner: Array.prototype, key: 'constructor', kind: 'getter' },
    { owner: Array, key: Symbol.species, kind: 'getter' }
  ];
  const summaries = [];
  for (const item of cases) {
    const descriptor = Object.getOwnPropertyDescriptor(item.owner, item.key);
    if (!descriptor) throw new Error(`missing derived intrinsic ${String(item.key)}`);
    for (const mode of ['forward', 'throw']) {
      let calls = 0;
      /** @type {any} */
      let result;
      try {
        if (item.kind === 'method') {
          Object.defineProperty(item.owner, item.key, {
            ...descriptor,
            value: new Proxy(descriptor.value, {
              apply(target, thisArg, args) {
                calls += 1;
                if (mode === 'throw') throw new Error('derived intrinsic method executed');
                return Reflect.apply(target, thisArg, args);
              }
            })
          });
        } else {
          Object.defineProperty(item.owner, item.key, {
            configurable: true,
            get() {
              calls += 1;
              if (mode === 'throw') throw new Error('derived intrinsic getter executed');
              return item.owner === Array ? Array : Array;
            }
          });
        }
        result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
      } finally {
        Object.defineProperty(item.owner, item.key, descriptor);
      }
      summaries.push({
        key: String(item.key), mode, calls, status: result.status, stage: result.stage,
        codes: result.diagnostics.map((/** @type {any} */ entry) => entry.code)
      });
    }
  }
  assert.equal(summaries.length, 6);
  for (const summary of summaries) assert.deepEqual(
    { calls: summary.calls, status: summary.status, stage: summary.stage, codes: summary.codes },
    { calls: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] }
  );
});

test('core rejects String Symbol.split pollution without resolving its getter', () => {
  const input = buildRevision('conflict');
  const summaries = [];
  for (const mode of ['forward', 'throw']) {
    let reads = 0;
    /** @type {any} */
    let result;
    try {
      Object.defineProperty(String.prototype, Symbol.split, {
        configurable: true,
        get() {
          reads += 1;
          if (mode === 'throw') throw new Error('String Symbol.split getter executed');
          return undefined;
        }
      });
      result = evaluateRevision(input, { interactionPolicy: 'pause_for_clarification' });
    } finally {
      Reflect.deleteProperty(String.prototype, Symbol.split);
    }
    summaries.push({
      mode, reads, status: result.status, stage: result.stage,
      codes: result.diagnostics.map((/** @type {any} */ item) => item.code)
    });
  }
  assert.deepEqual(summaries, [
    { mode: 'forward', reads: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] },
    { mode: 'throw', reads: 0, status: 'need_revision', stage: 'schema', codes: ['CORE_INTRINSIC_INVALID'] }
  ]);
});

test('core owns the schema diagnostic for a nonnumeric source revision', () => {
  const input = buildRevision('grounded');
  input.source_pack.source_revision = {};
  const result = /** @type {any} */ (runRevision(input, 'pause_for_clarification'));
  assert.equal(result.status, 'need_revision');
  assert.equal(result.stage, 'schema');
  assert.ok(result.diagnostics.some((/** @type {any} */ item) =>
    item.code === 'CORE_SOURCE_REVISION_INVALID' && item.path === '/source_pack/source_revision'));
  assert.ok(!result.diagnostics.some((/** @type {any} */ item) =>
    item.code === 'CORE_EVALUATION_FAILED'));
});

test('external pending roots retain Task 9 risk order while hashing a sorted batch set', async () => {
  const { externalizePendingRoots } = await loadConflictGate();
  const root = (/** @type {string} */ id, /** @type {any} */ riskCounts, affected = ['obligation']) => ({
    root_issue_id: id, root_issue_key: id, missing_type: 'oracle', semantic_refs: [id],
    scope: 'checkout', affected_obligation_ids: affected, risk_counts: riskCounts,
    source_revision: 1, question: id, answerable: true, reasons: ['MISSING_ORACLE'],
    evidence_refs: [], batch_id: null
  });
  const pending = [
    root('root_a_low', { critical: 0, high: 0, medium: 0, low: 1 }),
    root('root_b_high_one', { critical: 0, high: 1, medium: 0, low: 0 }),
    root('root_c_critical', { critical: 1, high: 0, medium: 0, low: 0 }),
    root('root_d_high_two', { critical: 0, high: 1, medium: 0, low: 0 }, ['a', 'b'])
  ];
  const output = externalizePendingRoots(pending, [], new Map());
  assert.deepEqual(output.map((/** @type {any} */ item) => item.root_issue_id), [
    'root_c_critical', 'root_d_high_two', 'root_b_high_one', 'root_a_low'
  ]);
  const expectedBatchId = stableId('batch', {
    root_issue_ids: ['root_a_low', 'root_b_high_one', 'root_c_critical', 'root_d_high_two']
  });
  assert.deepEqual([...new Set(output.map((/** @type {any} */ item) => item.batch_id))], [expectedBatchId]);
});

test('source-conflict aliases come only from the compiler-owned structural bridge', async () => {
  const { externalizePendingRoots } = await loadConflictGate();
  const conflict = {
    conflict_id: 'source_conflict_payment', root_issue_id: 'root_source_policy',
    scope: 'checkout', rule_ids: ['new', 'old'], source_ids: ['source_new', 'source_old']
  };
  const internalSignature = {
    missing_type: 'source-conflict',
    semantic_refs: ['claim_payment', 'unresolved-source-policy'],
    scope: 'checkout.payment'
  };
  const internalId = stableId('root', internalSignature);
  const pendingRoot = (/** @type {any} */ overrides) => ({
    root_issue_id: internalId, root_issue_key: canonicalStringify(internalSignature),
    missing_type: 'source-conflict', semantic_refs: internalSignature.semantic_refs,
    scope: internalSignature.scope,
    affected_obligation_ids: ['obligation_payment'],
    risk_counts: { critical: 1, high: 0, medium: 0, low: 0 }, source_revision: 1,
    question: 'internal question', answerable: true, reasons: ['UNRESOLVED_CONFLICT'],
    evidence_refs: ['claim_payment'], batch_id: null, ...overrides
  });
  const forged = pendingRoot({
    root_issue_id: 'root_forged', root_issue_key: 'forged-key', missing_type: 'oracle',
    semantic_refs: ['source-policy-root:root_source_policy'],
    affected_obligation_ids: ['obligation_unrelated'], reasons: ['MISSING_ORACLE']
  });
  const bridge = new Map([[internalId, {
    internal_root_issue_id: internalId, internal_scope: 'checkout.payment',
    semantic_refs: ['claim_payment', 'unresolved-source-policy'],
    affected_obligation_ids: ['obligation_payment'], conflict
  }]]);
  const output = externalizePendingRoots([forged, pendingRoot({})], [conflict], bridge);
  assert.deepEqual(output.map((/** @type {any} */ item) => item.root_issue_id).sort(), [
    'root_forged', 'root_source_policy'
  ]);
  const external = output.find((/** @type {any} */ item) => item.root_issue_id === 'root_source_policy');
  assert.equal(external.scope, 'checkout');
  assert.equal(external.question, 'Clarification required for source-conflict in checkout.');
  assert.equal(output.find((/** @type {any} */ item) => item.root_issue_id === 'root_forged').missing_type, 'oracle');
});

test('local conflict candidate lookups scale with source associations rather than Cases times conflicts', async () => {
  const { applyLocalConflictBlocks } = await loadConflictGate();
  const reads = [];
  for (const size of [100, 200, 400, 800]) {
    let scopeReads = 0;
    const obligations = [];
    const cases = [];
    const conflicts = [];
    const claimsById = new Map();
    for (let index = 0; index < size; index += 1) {
      const suffix = String(index).padStart(4, '0');
      const obligationId = `obligation_${suffix}`;
      const claimId = `claim_${suffix}`;
      const sourceId = `source_${suffix}`;
      const scope = `checkout.part-${suffix}`;
      obligations.push({ obligation_id: obligationId, risk: 'high', scope });
      cases.push({
        case_id: `case_${suffix}`, scope, obligation_ids: [obligationId], evidence_refs: [claimId]
      });
      claimsById.set(claimId, { claim_id: claimId, source_id: sourceId, source_locator_ids: [] });
      const conflict = {
        conflict_id: `source_conflict_${suffix}`, root_issue_id: `root_${suffix}`,
        source_ids: [sourceId], rule_ids: [`old_${suffix}`, `new_${suffix}`]
      };
      Object.defineProperty(conflict, 'scope', {
        enumerable: true,
        get() { scopeReads += 1; return scope; }
      });
      conflicts.push(conflict);
    }
    const result = applyLocalConflictBlocks({
      grounded: cases, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
    }, obligations, claimsById, { locators: [] }, conflicts);
    assert.equal(result.blocked.length, size);
    reads.push(scopeReads);
  }
  assert.deepEqual(reads, [100, 200, 400, 800]);
});

test('dense shared conflict selections are cached by candidate union and Case scope', async () => {
  const { applyLocalConflictBlocks } = await loadConflictGate();
  const reads = [];
  for (const size of [100, 200, 400, 800]) {
    let scopeReads = 0;
    const cases = [];
    const obligations = [];
    const conflicts = [];
    for (let index = 0; index < size; index += 1) {
      const suffix = String(index).padStart(4, '0');
      cases.push({
        case_id: `case_${suffix}`, scope: 'checkout',
        obligation_ids: [`obligation_${suffix}`], evidence_refs: ['claim_shared']
      });
      obligations.push({
        obligation_id: `obligation_${suffix}`, risk: 'high', scope: 'checkout'
      });
      const conflict = {
        conflict_id: `conflict_${suffix}`, root_issue_id: `root_${suffix}`,
        source_ids: ['source_shared'], rule_ids: [`old_${suffix}`, `new_${suffix}`]
      };
      Object.defineProperty(conflict, 'scope', {
        enumerable: true,
        get() {
          scopeReads += 1;
          return 'checkout';
        }
      });
      conflicts.push(conflict);
    }
    const result = applyLocalConflictBlocks({
      grounded: cases, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
    }, obligations, new Map([[
      'claim_shared', {
        claim_id: 'claim_shared', source_id: 'source_shared',
        source_locator_ids: [], parent_claim_ids: []
      }
    ]]), { locators: [] }, conflicts);
    assert.ok(result.diagnostics.some((/** @type {any} */ item) =>
      item.code === 'CORE_SOURCE_CONFLICT_AMBIGUOUS'));
    reads.push(scopeReads);
  }
  assert.deepEqual(reads, [2, 2, 2, 2]);
});

test('shared evidence ancestry is indexed once across many conflict-dependent Cases', async () => {
  const { applyLocalConflictBlocks } = await loadConflictGate();
  const reads = [];
  for (const size of [100, 200, 400, 800]) {
    let parentReads = 0;
    const obligations = [];
    const cases = [];
    const claimsById = new Map();
    for (let index = 0; index < size; index += 1) {
      const suffix = String(index).padStart(4, '0');
      const claim = {
        claim_id: `claim_${suffix}`,
        source_id: index === 0 ? 'source_conflict' : `source_${suffix}`,
        source_locator_ids: []
      };
      Object.defineProperty(claim, 'parent_claim_ids', {
        enumerable: true,
        get() {
          parentReads += 1;
          return index === 0 ? [] : [`claim_${String(index - 1).padStart(4, '0')}`];
        }
      });
      claimsById.set(claim.claim_id, claim);
      obligations.push({ obligation_id: `obligation_${suffix}`, risk: 'high', scope: 'checkout' });
      cases.push({
        case_id: `case_${suffix}`, scope: 'checkout',
        obligation_ids: [`obligation_${suffix}`], evidence_refs: [claim.claim_id]
      });
    }
    const result = applyLocalConflictBlocks({
      grounded: cases, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
    }, obligations, claimsById, { locators: [] }, [{
      conflict_id: 'source_conflict', root_issue_id: 'root_conflict', scope: 'checkout',
      source_ids: ['source_conflict'], rule_ids: ['new', 'old']
    }]);
    assert.equal(result.blocked.length, size);
    reads.push(parentReads);
  }
  assert.deepEqual(reads, [100, 200, 400, 800]);
});

test('multiple canonical conflicts for one formal obligation fail closed instead of first-wins aliasing', async () => {
  const { applyLocalConflictBlocks } = await loadConflictGate();
  const conflicts = [
    {
      conflict_id: 'conflict_a', root_issue_id: 'root_a', scope: 'checkout',
      source_ids: ['source_a'], rule_ids: ['rule_a1', 'rule_a2']
    },
    {
      conflict_id: 'conflict_b', root_issue_id: 'root_b', scope: 'checkout',
      source_ids: ['source_b'], rule_ids: ['rule_b1', 'rule_b2']
    }
  ];
  const claimsById = new Map([
    ['claim_a', { claim_id: 'claim_a', source_id: 'source_a', source_locator_ids: [], parent_claim_ids: [] }],
    ['claim_b', { claim_id: 'claim_b', source_id: 'source_b', source_locator_ids: [], parent_claim_ids: [] }]
  ]);
  const obligations = [{ obligation_id: 'obligation_shared', risk: 'high', scope: 'checkout' }];
  const classify = (/** @type {any[]} */ grounded) => applyLocalConflictBlocks({
    grounded, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
  }, obligations, claimsById, { locators: [] }, conflicts);

  const oneCase = classify([{
    case_id: 'case_both', scope: 'checkout', obligation_ids: ['obligation_shared'],
    evidence_refs: ['claim_a', 'claim_b']
  }]);
  const twoCases = classify([
    {
      case_id: 'case_a', scope: 'checkout', obligation_ids: ['obligation_shared'],
      evidence_refs: ['claim_a']
    },
    {
      case_id: 'case_b', scope: 'checkout', obligation_ids: ['obligation_shared'],
      evidence_refs: ['claim_b']
    }
  ]);
  for (const result of [oneCase, twoCases]) {
    assert.deepEqual(result.diagnostics.map((/** @type {any} */ item) => item.code), [
      'CORE_SOURCE_CONFLICT_AMBIGUOUS'
    ]);
    assert.equal(result.blocked.length, 0);
  }
});

test('shared multi-parent conflict closures reuse labels instead of copying them across every edge', async () => {
  const nativeForEach = Set.prototype.forEach;
  let labelVisits = 0;
  let privateCore;
  try {
    Object.defineProperty(Set.prototype, 'forEach', {
      configurable: true, writable: true,
      value(/** @type {Function} */ callback, /** @type {unknown} */ thisArg) {
        return Reflect.apply(nativeForEach, this, [function visit(value, key, set) {
          labelVisits += 1;
          return Reflect.apply(callback, thisArg, [value, key, set]);
        }]);
      }
    });
    privateCore = await loadConflictGate('count-set-for-each');
  } finally {
    Object.defineProperty(Set.prototype, 'forEach', {
      configurable: true, writable: true, value: nativeForEach
    });
  }

  const visits = [];
  for (const size of [20, 40, 80]) {
    const locators = [];
    const conflicts = [];
    const claimsById = new Map();
    for (let index = 0; index < size; index += 1) {
      locators.push({ locator_id: `locator_${index}`, source_id: `source_${index}` });
      conflicts.push({
        conflict_id: `conflict_${index}`, root_issue_id: `root_${index}`, scope: 'checkout',
        source_ids: [`source_${index}`], rule_ids: [`rule_${index}_a`, `rule_${index}_b`]
      });
    }
    for (let index = 0; index < size; index += 1) {
      claimsById.set(`claim_${index}`, {
        claim_id: `claim_${index}`,
        source_locator_ids: index === 0 ? locators.map((item) => item.locator_id) : [],
        parent_claim_ids: index === 0
          ? [] : Array.from({ length: index }, (_unused, parent) => `claim_${parent}`)
      });
    }
    labelVisits = 0;
    privateCore.prepareConflictRelations(claimsById, { locators }, conflicts);
    visits.push(labelVisits);
    assert.ok(labelVisits <= (size * size) + (8 * size), `${size}: ${labelVisits}`);
  }
  assert.deepEqual(visits, [289, 979, 3559]);

  const nestedVisits = [];
  for (const size of [20, 40, 80]) {
    const locators = [];
    const conflicts = [];
    const claimsById = new Map();
    for (let index = 0; index < size; index += 1) {
      locators.push({ locator_id: `nested_locator_${index}`, source_id: `nested_source_${index}` });
      conflicts.push({
        conflict_id: `nested_conflict_${index}`, root_issue_id: `nested_root_${index}`,
        scope: 'checkout', source_ids: [`nested_source_${index}`],
        rule_ids: [`nested_rule_${index}_a`, `nested_rule_${index}_b`]
      });
      claimsById.set(`nested_claim_${index}`, {
        claim_id: `nested_claim_${index}`,
        source_locator_ids: [`nested_locator_${index}`],
        parent_claim_ids: Array.from(
          { length: index }, (_unused, parent) => `nested_claim_${parent}`
        )
      });
    }
    labelVisits = 0;
    privateCore.prepareConflictRelations(claimsById, { locators }, conflicts);
    nestedVisits.push(labelVisits);
    assert.ok(labelVisits <= (3 * size * size) + (10 * size), `${size}: ${labelVisits}`);
  }
  assert.deepEqual(nestedVisits, [840, 3280, 12960]);
});

test('repeated children memoize unions of the same independent parent closures', async () => {
  const nativeForEach = Set.prototype.forEach;
  let labelVisits = 0;
  let privateCore;
  try {
    Object.defineProperty(Set.prototype, 'forEach', {
      configurable: true, writable: true,
      value(/** @type {Function} */ callback, /** @type {unknown} */ thisArg) {
        return Reflect.apply(nativeForEach, this, [function visit(value, key, set) {
          labelVisits += 1;
          return Reflect.apply(callback, thisArg, [value, key, set]);
        }]);
      }
    });
    privateCore = await loadConflictGate('count-repeated-parent-unions');
  } finally {
    Object.defineProperty(Set.prototype, 'forEach', {
      configurable: true, writable: true, value: nativeForEach
    });
  }

  const visits = [];
  for (const size of [10, 20, 40]) {
    const locators = [];
    const conflicts = [];
    const claimsById = new Map();
    for (let index = 0; index < size; index += 1) {
      locators.push({ locator_id: `repeated_locator_${index}`, source_id: `repeated_source_${index}` });
      conflicts.push({
        conflict_id: `repeated_conflict_${index}`, root_issue_id: `repeated_root_${index}`,
        scope: 'checkout', source_ids: [`repeated_source_${index}`],
        rule_ids: [`repeated_rule_${index}_a`, `repeated_rule_${index}_b`]
      });
      claimsById.set(`repeated_parent_${index}`, {
        claim_id: `repeated_parent_${index}`,
        source_locator_ids: Array.from(
          { length: index + 1 }, (_unused, locator) => `repeated_locator_${locator}`
        ),
        parent_claim_ids: []
      });
    }
    const parentClaimIds = Array.from(
      { length: size }, (_unused, index) => `repeated_parent_${index}`
    );
    for (let index = 0; index < size; index += 1) {
      claimsById.set(`repeated_child_${index}`, {
        claim_id: `repeated_child_${index}`,
        source_locator_ids: [],
        parent_claim_ids: parentClaimIds
      });
    }
    labelVisits = 0;
    privateCore.prepareConflictRelations(claimsById, { locators }, conflicts);
    visits.push(labelVisits);
  }
  assert.deepEqual(visits, [440, 1680, 6560]);
});
