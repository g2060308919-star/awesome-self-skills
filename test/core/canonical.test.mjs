import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify, digest, stableId } from '../../src/canonical.mjs';

const signatureA = {
  root_issue_id: 'root_payment_currency',
  source_revision: 3,
  created_at: '2026-08-01T00:00:00Z',
  source_locator_ids: ['locator_b', 'locator_a'],
  action_path: ['open checkout', 'submit order'],
  steps: ['enter card', 'confirm payment']
};

const reorderedSignatureA = {
  steps: ['enter card', 'confirm payment'],
  action_path: ['open checkout', 'submit order'],
  source_locator_ids: ['locator_a', 'locator_b'],
  updated_at: '2026-08-02T00:00:00Z',
  root_issue_id: 'root_payment_currency'
};

test('canonical form sorts object keys and set-like arrays without reordering steps', () => {
  assert.equal(
    canonicalStringify({ source_locator_ids: ['z', 'a'], steps: ['second', 'first'], a: 1 }),
    '{"a":1,"source_locator_ids":["a","z"],"steps":["second","first"]}'
  );
});

test('stable id ignores stable-identity volatile revision and timestamp fields', () => {
  assert.equal(stableId('fact', signatureA), stableId('fact', reorderedSignatureA));
  assert.equal(stableId('fact', signatureA), stableId('fact', { ...signatureA, source_revision: 9 }));
});

test('stable id retains semantically different execution signatures', () => {
  const caseA = {
    role: 'member',
    execution_signature: {
      action_path: ['open settings', 'save'],
      test_point_ids: ['obligation_a']
    }
  };

  assert.notEqual(stableId('case', caseA), stableId('case', { ...caseA, role: 'admin' }));
});

test('root issue IDs exclude mutable case and Test Point associations only', () => {
  const rootIssue = { missing_type: 'oracle', scope: 'refund', case_ids: ['case_a'], test_point_ids: ['obligation_a'] };

  assert.equal(
    stableId('root', rootIssue),
    stableId('root', { ...rootIssue, case_ids: ['case_b'], test_point_ids: ['obligation_b'] })
  );
  assert.notEqual(
    stableId('root', rootIssue),
    stableId('root', { ...rootIssue, scope: 'chargeback' })
  );
});

test('unrelated identity fields remain distinguishing', () => {
  assert.notEqual(
    stableId('fact', { fact_type: 'limit', test_point_ids: ['obligation_a'] }),
    stableId('fact', { fact_type: 'limit', test_point_ids: ['obligation_b'] })
  );
});

test('canonical set ordering is code-point deterministic while ordered transitions remain ordered', () => {
  assert.equal(
    canonicalStringify({ source_locator_ids: ['ä', 'z'], transition_order: ['second', 'first'] }),
    '{"source_locator_ids":["z","ä"],"transition_order":["second","first"]}'
  );
});

test('canonical set ordering uses true Unicode code points and retains duplicate set values', () => {
  assert.equal(
    canonicalStringify({ source_ids: ['\u{10000}', '\uE000', '\uE000'], steps: ['first', 'second'] }),
    '{"source_ids":["","","𐀀"],"steps":["first","second"]}'
  );
  assert.notEqual(canonicalStringify({}), canonicalStringify({ source_ids: [] }));
});

test('case stable IDs normalize direct and nested execution-signature Test Point sets', () => {
  const direct = { role: 'member', action_path: ['open', 'save'], oracle_refs: ['oracle_b', 'oracle_a'], test_point_ids: ['obligation_b', 'obligation_a'] };
  const nested = { title: 'Save settings', execution_signature: direct };

  assert.equal(stableId('case', direct), stableId('case', { ...direct, test_point_ids: ['obligation_a', 'obligation_b'] }));
  assert.equal(stableId('case', nested), stableId('case', { ...nested, execution_signature: { ...direct, test_point_ids: ['obligation_a', 'obligation_b'] } }));
  assert.notEqual(stableId('case', nested), stableId('case', { ...nested, execution_signature: { ...direct, role: 'admin' } }));
});

test('canonical contracts normalize policy, interaction, and checkpoint unordered collections', () => {
  const policy = { source_policy: { rules: [{ rule_id: 'rule_b', source_ids: ['source_b', 'source_a'], scope: 'all' }, { rule_id: 'rule_a', source_ids: ['source_a'], scope: 'all' }] } };
  const interactions = { interaction_matrix: [{ module_ids: ['billing', 'orders'], dimension: 'time', status: 'candidate' }, { module_ids: ['accounts'], dimension: 'role', status: 'checked-no-signal' }] };
  const checkpoint = { root_issue_dispositions: [{ root_issue_id: 'root_b', status: 'asked' }, { root_issue_id: 'root_a', status: 'open' }] };

  assert.equal(canonicalStringify(policy), canonicalStringify({ source_policy: { rules: [...policy.source_policy.rules].reverse() } }));
  assert.equal(canonicalStringify(interactions), canonicalStringify({ interaction_matrix: [...interactions.interaction_matrix].reverse() }));
  assert.equal(canonicalStringify(checkpoint), canonicalStringify({ root_issue_dispositions: [...checkpoint.root_issue_dispositions].reverse() }));
});

test('append-only clarification histories preserve their written order', () => {
  const decisions = { decision_records: [{ decision_id: 'decision_a', clarification_event_seq: 1 }, { decision_id: 'decision_b', clarification_event_seq: 2 }] };
  const events = { clarification_events: [{ event_id: 'event_a', clarification_event_seq: 1 }, { event_id: 'event_b', clarification_event_seq: 2 }] };

  assert.notEqual(canonicalStringify(decisions), canonicalStringify({ decision_records: [...decisions.decision_records].reverse() }));
  assert.notEqual(canonicalStringify(events), canonicalStringify({ clarification_events: [...events.clarification_events].reverse() }));
});

test('same-named arrays outside declared paths retain their input order', () => {
  assert.notEqual(
    canonicalStringify({ metadata: { source_ids: ['source_b', 'source_a'] } }),
    canonicalStringify({ metadata: { source_ids: ['source_a', 'source_b'] } })
  );
});

test('case and root stable IDs retain unrelated nested association fields', () => {
  const caseSignature = { role: 'member', execution_signature: { role: 'member', test_point_ids: ['obligation_a'] }, metadata: { test_point_ids: ['metadata_a'], obligation_ids: ['metadata_obligation_a'] } };
  const rootSignature = { missing_type: 'oracle', scope: 'checkout', test_point_ids: ['obligation_a'], metadata: { test_point_ids: ['metadata_a'] } };

  assert.notEqual(stableId('case', caseSignature), stableId('case', { ...caseSignature, metadata: { test_point_ids: ['metadata_b'], obligation_ids: ['metadata_obligation_a'] } }));
  assert.notEqual(stableId('case', caseSignature), stableId('case', { ...caseSignature, metadata: { test_point_ids: ['metadata_a'], obligation_ids: ['metadata_obligation_b'] } }));
  assert.notEqual(stableId('root', rootSignature), stableId('root', { ...rootSignature, metadata: { test_point_ids: ['metadata_b'] } }));
});

test('complete Case sets normalize while steps and cleanup actions remain ordered', () => {
  const caseRecord = {
    case_id: 'case_a',
    preconditions: [{ condition: 'b' }, { condition: 'a' }],
    data: [{ name: 'b' }, { name: 'a' }],
    steps: [
      { step_id: 'step_a', expectations: [{ expectation_id: 'expect_b' }, { expectation_id: 'expect_a' }] },
      { step_id: 'step_b', expectations: [] }
    ],
    testability_profile: { capabilities: [{ capability: 'b' }, { capability: 'a' }], observers: [], controls: [] },
    cleanup: { steps: ['second', 'first'] }
  };
  const reorderedSets = {
    ...caseRecord,
    preconditions: [...caseRecord.preconditions].reverse(), data: [...caseRecord.data].reverse(),
    steps: [{ ...caseRecord.steps[0], expectations: [...caseRecord.steps[0].expectations].reverse() }, caseRecord.steps[1]],
    testability_profile: { ...caseRecord.testability_profile, capabilities: [...caseRecord.testability_profile.capabilities].reverse() }
  };

  assert.equal(canonicalStringify({ grounded: [caseRecord] }), canonicalStringify({ grounded: [reorderedSets] }));
  assert.equal(stableId('case', caseRecord), stableId('case', reorderedSets));
  assert.notEqual(canonicalStringify({ grounded: [caseRecord] }), canonicalStringify({ grounded: [{ ...caseRecord, steps: [...caseRecord.steps].reverse() }] }));
  assert.notEqual(canonicalStringify({ grounded: [caseRecord] }), canonicalStringify({ grounded: [{ ...caseRecord, cleanup: { steps: ['first', 'second'] } }] }));
  assert.notEqual(stableId('case', caseRecord), stableId('case', { ...caseRecord, cleanup: { steps: ['first', 'second'] } }));
});

test('coverage ledgers and nested model sets normalize without flattening ordered sequences', () => {
  const coverage = {
    coverage: {
      requirements: { entries: [{ fact_id: 'fact_b', status: 'covered' }, { fact_id: 'fact_a', status: 'covered' }] },
      formal: { entries: [{ obligation_id: 'obligation_b', status: 'grounded' }, { obligation_id: 'obligation_a', status: 'grounded' }] },
      executable: { entries: [{ obligation_id: 'obligation_b', case_id: 'case_b' }, { obligation_id: 'obligation_a', case_id: 'case_a' }] },
      not_applicable: [{ obligation_id: 'obligation_d' }, { obligation_id: 'obligation_c' }]
    }
  };
  const reorderedCoverage = /** @type {any} */ (structuredClone(coverage));
  for (const ledger of ['requirements', 'formal', 'executable']) reorderedCoverage.coverage[ledger].entries.reverse();
  reorderedCoverage.coverage.not_applicable.reverse();
  assert.equal(canonicalStringify(coverage), canonicalStringify(reorderedCoverage));

  const models = { views: [{ view_id: 'view_a', elements: [
    { element_id: 'domain_a', kind: 'input-domain', classes: [{ class_id: 'class_b', label: 'B' }, { class_id: 'class_a', label: 'A' }] },
    { element_id: 'decision_a', kind: 'decision-rule', conditions: ['member', 'valid'] },
    { element_id: 'integration_a', kind: 'integration-contract', side_effects: [{ kind: 'event', target: 'b' }, { kind: 'audit', target: 'a' }] },
    { element_id: 'transition_a', kind: 'transition', transition_order: ['validate', 'save'] }
  ] }] };
  const reorderedModels = /** @type {any} */ (structuredClone(models));
  reorderedModels.views[0].elements.reverse();
  reorderedModels.views[0].elements.find((/** @type {any} */ item) => item.element_id === 'domain_a').classes.reverse();
  reorderedModels.views[0].elements.find((/** @type {any} */ item) => item.element_id === 'decision_a').conditions.reverse();
  reorderedModels.views[0].elements.find((/** @type {any} */ item) => item.element_id === 'integration_a').side_effects.reverse();
  assert.equal(canonicalStringify(models), canonicalStringify(reorderedModels));

  const reorderedTransition = /** @type {any} */ (structuredClone(models));
  reorderedTransition.views[0].elements.find((/** @type {any} */ item) => item.element_id === 'transition_a').transition_order.reverse();
  assert.notEqual(canonicalStringify(models), canonicalStringify(reorderedTransition));
});

test('digest is a lowercase SHA-256 hexadecimal value', () => {
  assert.equal(digest({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
});
