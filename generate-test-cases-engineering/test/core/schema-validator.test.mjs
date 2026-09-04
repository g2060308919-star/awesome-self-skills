import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertSupportedSchema,
  validateAgainstSchema,
  validateUniqueStableIds
} from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePackSchema = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/schemas/source-pack.schema.json'
), 'utf8'));
const claimsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json'
), 'utf8'));
const schemaDirectory = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(schemaDirectory, 'behavior-views.schema.json'), 'utf8'));
const replySchema = JSON.parse(await readFile(path.join(schemaDirectory, 'reply.schema.json'), 'utf8'));
const caseDraftsSchema = JSON.parse(await readFile(path.join(schemaDirectory, 'case-drafts.schema.json'), 'utf8'));
const testBundleSchema = JSON.parse(await readFile(path.join(schemaDirectory, 'test-bundle.schema.json'), 'utf8'));

/** @returns {any} */
function minimumSourcePack() {
  return {
    schema_version: '2.1.0',
    source_revision: 0,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    run_scope: 'checkout',
    sources: [],
    locators: [],
    source_reviews: [],
    source_policy: { rules: [] },
    decision_records: [],
    clarification_events: [],
    execution_events: []
  };
}

/** @returns {any} */
function minimumClaims() {
  return {
    schema_version: '2.1.0',
    source_revision: 0,
    claims: [],
    fact_ledger: []
  };
}

/** @param {string} [caseId] @returns {any} */
function completeCase(caseId = 'case_a') {
  return {
    case_id: caseId,
    title: 'Save settings',
    scope: 'checkout',
    risk: 'medium',
    role: { value: 'member', evidence_ref: 'claim_role', support_review: 'supported' },
    fact_ids: ['fact_a'],
    obligation_ids: ['obligation_a'],
    source_claim_ids: ['claim_a'],
    preconditions: [{ condition: 'Signed in', reachable_from: 'login', source_claim_ids: ['claim_a'], evidence_ref: 'claim_a', support_review: 'supported' }],
    data: [
      { name: 'name', value: 'Ada', provenance: { type: 'evidence', ref: 'claim_a' }, support_review: 'supported' },
      { name: 'boundary', value: '10', provenance: { type: 'derivation', ref: 'claim_e2' }, support_review: 'supported' }
    ],
    steps: [{
      step_id: 'step_save', action: 'Save', action_evidence_ref: 'claim_a', support_review: 'supported',
      expectations: [
        { kind: 'obligation-oracle', expectation_id: 'expect_value', business_assertion: 'The save confirmation is visible.', preceding_action_id: 'step_save', observer: 'member', observation_surface: 'ui', observation_target: 'toast', oracle: { type: 'value', expected_value: 'Saved', comparison: 'equals' }, evidence_ref: 'claim_a', oracle_evidence_refs: ['claim_a'], closes_obligation_id: 'obligation_a', support_review: 'supported' },
        { kind: 'auxiliary', expectation_id: 'expect_state', business_assertion: 'The profile enters saved state.', preceding_action_id: 'step_save', observer: 'member', observation_surface: 'api', observation_target: 'profile.state', oracle: { type: 'state', expected_state: 'saved', comparison: 'equals' }, evidence_ref: 'claim_a', oracle_evidence_refs: ['claim_a'], support_review: 'supported' },
        { kind: 'auxiliary', expectation_id: 'expect_event', business_assertion: 'A profile event is emitted.', preceding_action_id: 'step_save', observer: 'event-reader', observation_surface: 'event-stream', observation_target: 'profile.saved', oracle: { type: 'event', expected_event: 'profile.saved', comparison: 'equals' }, evidence_ref: 'claim_a', oracle_evidence_refs: ['claim_a'], support_review: 'supported' },
        { kind: 'auxiliary', expectation_id: 'expect_effect', business_assertion: 'The audit entry is persisted.', preceding_action_id: 'step_save', observer: 'auditor', observation_surface: 'database', observation_target: 'audit_log', oracle: { type: 'side-effect', expected_side_effect: 'one new save entry', comparison: 'equals' }, evidence_ref: 'claim_a', oracle_evidence_refs: ['claim_a'], support_review: 'supported' }
      ]
    }],
    testability_profile: {
      capabilities: [{ capability: 'browser', status: 'provided', provenance_ref: 'environment_browser' }],
      observers: [{ observer: 'member', observation_target: 'toast', status: 'verified', provenance_ref: 'claim_a' }],
      controls: [{ control: 'member-account', status: 'provided', provenance_ref: 'environment_account' }]
    },
    post_state: { state: 'saved', evidence_ref: 'claim_a', support_review: 'supported' },
    cleanup: { required: false, no_cleanup_reason: 'The fixture is isolated.', no_cleanup_evidence_ref: 'claim_a', support_review: 'supported' },
    evidence_refs: ['claim_a', 'claim_e2', 'claim_role'],
    execution_signature: { role: 'member', precondition_state: 'signed-in', data_partition: 'valid-boundary', action_path: ['open', 'save'], oracle_refs: ['expect_effect', 'expect_event', 'expect_state', 'expect_value'] }
  };
}

/** @param {string} caseId */
function completeBundleCase(caseId) {
  const candidate = completeCase(caseId);
  candidate.data[0].value_origin = 'requirement';
  candidate.data[1].value_origin = 'derived';
  return candidate;
}

/** @returns {any} */
function completeBundle() {
  const readyItems = [
    ['case', 'case_grounded', 'grounded', ['obligation_a'], 'execute', 'selected_for_run', { origin: 'default_grounded_recommendation' }],
    ['case', 'case_conditional', 'conditional', ['obligation_a'], 'do_not_execute', 'temporary_rule_unconfirmed', { origin: 'user_execution_decision', execution_decision_semantic_digest: '1'.repeat(64) }],
    ['formal_test_point', 'obligation_blocked', 'blocked', ['obligation_blocked'], 'do_not_execute', 'business_rule_missing', { origin: 'user_execution_decision', execution_decision_semantic_digest: '2'.repeat(64) }],
    ['exploratory', 'exploratory_retry', 'exploratory', [], 'do_not_execute', 'risk_not_adopted', { origin: 'user_execution_decision', execution_decision_semantic_digest: '3'.repeat(64) }]
  ].map(([item_kind, item_id, semantic_status, related_obligation_ids, execution_disposition, reason_code, basis]) => ({
    item_kind, item_id, title: String(item_id), semantic_status,
    item_semantic_digest: '4'.repeat(64), related_obligation_ids,
    execution_disposition, reason_code, reason: String(reason_code), basis
  }));
  return {
    schema_version: '2.1.0', source_revision: 0,
    grounded: [completeBundleCase('case_grounded')],
    conditional: [{ ...completeBundleCase('case_conditional'), temporary_assumption: { claim_id: 'claim_e1', invalidation_condition: 'The owner rejects the temporary rule.' } }],
    blocked: [{ obligation_id: 'obligation_blocked', root_issue_id: 'root_oracle', subject: 'Checkout result', reason: 'Missing Oracle', scope: 'checkout', risk: 'high', recovery: { missing_type: 'oracle', required_material: 'Expected outcome', question: 'What result is expected?' } }],
    exploratory: [{ exploratory_id: 'exploratory_retry', title: 'Explore retry behavior', scope: 'checkout', risk: 'low', reason: 'Risk hypothesis only.' }],
    coverage: {
      requirements: { total: 1, accounted: 1, entries: [{ fact_id: 'fact_a', status: 'covered' }] },
      formal: { total: 1, covered: 1, entries: [{ obligation_id: 'obligation_a', status: 'grounded' }] },
      executable: { total: 1, grounded: 1, entries: [{ obligation_id: 'obligation_a', case_id: 'case_grounded' }] },
      expert_recall: { status: 'benchmark_only', limits: ['No hidden labels available.'] },
      not_applicable: []
    },
    quality: { delivery_status: 'executable_subset_ready', compiler_version: '0.3.0', schema_version: '2.1.0', lineage: { semantic_source_digest: 'a'.repeat(64), evidence_semantic_digest: 'b'.repeat(64), behavior_views_semantic_digest: 'c'.repeat(64), test_obligations_semantic_digest: 'd'.repeat(64), case_drafts_semantic_digest: 'e'.repeat(64) }, limits: ['Expert recall is benchmark-only.'] },
    execution_plan: {
      status: 'ready', semantic_source_digest: 'a'.repeat(64),
      plan_digest: '6'.repeat(64), semantic_result_digest: '7'.repeat(64), items: readyItems,
      runner_case_ids: ['case_grounded'], promoted_exploratory: [],
      test_point_execution_coverage: [{ obligation_id: 'obligation_a', related_grounded_case_ids: ['case_grounded'], execute_case_ids: ['case_grounded'], status: 'full' }],
      summary: { case_count: 2, formal_test_point_count: 2, applicable_formal_test_point_count: 2, not_applicable_formal_test_point_count: 0, full_test_point_count: 1, partial_test_point_count: 0, none_test_point_count: 1, exploratory_count: 1, execute_case_count: 1, do_not_execute_case_count: 1, do_not_execute_formal_test_point_count: 1, do_not_execute_exploratory_count: 1, pending_case_count: 0, pending_formal_test_point_count: 0, pending_exploratory_count: 0 },
      confirmation: { confirmed: true, confirmed_plan_digest: '6'.repeat(64), actor: 'owner', authority_scope: '*', confirmation_semantic_digest: '8'.repeat(64) }
    }
  };
}

function semanticReply() {
  const presentationId = 'presentation_currency';
  return {
    status: 'need_user_answers', purpose: 'semantic_clarification', entry_context: 'active_analysis',
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', source_revision: 2,
    next_event_seq: 3, presentation_id: presentationId, presentation_digest: 'a'.repeat(64),
    groups: [{
      question_id: 'question_currency', presentation_id: presentationId, group_id: 'group_currency',
      question: 'Which currency is expected?',
      affected_items: [{ item_kind: 'formal_test_point', item_id: 'obligation_currency', title: 'Currency expectation' }],
      counts_by_kind: { case: 0, formal_test_point: 1, exploratory: 0 },
      risk_counts: { critical: 0, high: 1, medium: 0, low: 0 },
      options: [{ option_code: 'final', label: 'Final', meaning: 'Provide the final rule.' }],
      answer_example: 'USD is required.'
    }],
    diagnostics: [],
    blockers: [{ root_issue_id: 'root_currency', root_issue_key: 'currency|checkout', missing_type: 'oracle', scope: 'checkout', affected_obligation_ids: ['obligation_currency'], risk_counts: { critical: 0, high: 1, medium: 0, low: 0 }, source_revision: 2, question: 'Which currency is expected?', batch_id: 'batch_2' }]
  };
}

test('schema accepts the minimum legal source pack fixture', () => {
  assert.deepEqual(validateAgainstSchema(minimumSourcePack(), sourcePackSchema), []);
});

test('source review schema is closed and requires typed exhaustive spans', () => {
  const artifact = minimumSourcePack();
  artifact.sources.push({
    source_id: 'source_a', kind: 'prd', version: '1', status: 'effective',
    authority: 'owner', content: 'Rule', content_digest: 'a'.repeat(64)
  });
  artifact.source_reviews.push({
    source_id: 'source_a', content_digest: 'a'.repeat(64),
    spans: [{
      span_id: 'span_a', start: 0, end: 4, classification: 'normative',
      rationale: 'Explicit rule.'
    }]
  });

  assert.deepEqual(validateAgainstSchema(artifact, sourcePackSchema), []);

  artifact.source_reviews[0].spans[0].unexpected = true;
  assert.equal(validateAgainstSchema(artifact, sourcePackSchema).some(
    (item) => item.path === '/source_reviews/0/spans/0/unexpected'
      && item.code === 'ADDITIONAL_PROPERTY'
  ), true);

  delete artifact.source_reviews[0].spans[0].unexpected;
  artifact.source_reviews[0].spans[0].rationale = '   ';
  assert.equal(validateAgainstSchema(artifact, sourcePackSchema).some(
    (item) => item.path === '/source_reviews/0/spans/0/rationale'
  ), true);
});

test('schema reports a missing required claim field at its JSON pointer', () => {
  const artifact = minimumClaims();
  artifact.claims.push({ claim_id: 'claim_a', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'Save', source_id: 'source_a' });

  assert.deepEqual(validateAgainstSchema(artifact, claimsSchema), [{
    category: 'schema',
    code: 'REQUIRED_FIELD_MISSING',
    path: '/claims/0/source_locator_ids',
    message: 'required field is missing'
  }]);
});

test('schema diagnostics escape user-controlled JSON Pointer segments', () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false };

  assert.deepEqual(validateAgainstSchema({ 'a/b': true, 'c~d': true }, schema), [
    { category: 'schema', code: 'ADDITIONAL_PROPERTY', path: '/a~1b', message: 'additional properties are not allowed' },
    { category: 'schema', code: 'ADDITIONAL_PROPERTY', path: '/c~0d', message: 'additional properties are not allowed' }
  ]);
});

test('schema rejects an unknown schema version', () => {
  const artifact = minimumSourcePack();
  artifact.schema_version = '9.0.0';

  assert.equal(validateAgainstSchema(artifact, sourcePackSchema)[0]?.code, 'CONST_MISMATCH');
});

test('schema rejects controlled extra properties and invalid locator enums', () => {
  const artifact = minimumSourcePack();
  artifact.unexpected = true;
  artifact.locators.push({
    locator_id: 'locator_a',
    source_id: 'source_a',
    type: 'spreadsheet-row',
    content_digest: 'a'.repeat(64),
    extraction_integrity: 'verified'
  });

  const diagnostics = validateAgainstSchema(artifact, sourcePackSchema);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'ADDITIONAL_PROPERTY'), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'ONE_OF_MISMATCH'), true);
});

test('schema detects duplicate stable IDs only inside definition collections', () => {
  const artifact = minimumClaims();
  artifact.claims.push(
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] },
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/claims/1/claim_id',
    message: 'duplicate stable ID "claim_same"'
  }]);
});

test('schema detects duplicate fact ledger definition IDs without treating references as definitions', () => {
  const artifact = minimumClaims();
  artifact.fact_ledger.push(
    { fact_id: 'fact_same', claim_id: 'claim_a' },
    { fact_id: 'fact_same', claim_id: 'claim_b' }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/fact_ledger/1/fact_id',
    message: 'duplicate stable ID "fact_same"'
  }]);
});

test('schema rejects unknown nested compiler-controlled properties', () => {
  const artifact = minimumSourcePack();
  artifact.source_policy.rules.push({ rule_id: 'policy_a', source_ids: [], unexpected: true });

  const diagnostics = validateAgainstSchema(artifact, sourcePackSchema);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.path === '/source_policy/rules/0/unexpected' && diagnostic.code === 'ADDITIONAL_PROPERTY'), true);
});

test('schema rejects ill-typed nested interaction items', () => {
  const artifact = {
    schema_version: '2.1.0', source_revision: 0, views: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [],
    interaction_matrix: [{ module_ids: 'orders', dimension: 'role', status: 'checked-no-signal' }]
  };

  assert.equal(validateAgainstSchema(artifact, behaviorViewsSchema).some((diagnostic) => diagnostic.path === '/interaction_matrix/0/module_ids' && diagnostic.code === 'TYPE_MISMATCH'), true);
});

test('schema grammar rejects malformed supported keyword values before validation', () => {
  assert.throws(() => assertSupportedSchema({ type: 'record' }), /type/);
  assert.throws(() => assertSupportedSchema({ required: 'id' }), /required/);
  assert.throws(() => assertSupportedSchema({ properties: [] }), /properties/);
  assert.throws(() => assertSupportedSchema({ uniqueItems: 'yes' }), /uniqueItems/);
  assert.throws(() => assertSupportedSchema({ additionalProperties: 1 }), /additionalProperties/);
  assert.throws(() => assertSupportedSchema({ pattern: '[' }), /regular expression/);
  assert.throws(() => assertSupportedSchema({ minimum: 2, maximum: 1 }), /minimum/);
});

test('schema validates closed evidence claim forms and source policy metadata', () => {
  const sourcePack = minimumSourcePack();
  sourcePack.sources.push({
    source_id: 'source_a', kind: 'prd', version: '1.2', status: 'approved', authority: 'product-owner',
    content: 'The cart total is capped.', content_digest: 'a'.repeat(64)
  });
  sourcePack.source_policy.rules.push({ rule_id: 'rule_a', source_ids: ['source_a'], scope: 'checkout', authority: 'product-owner', status: 'effective' });
  const claims = {
    schema_version: '2.1.0', source_revision: 0,
    claims: [
      { claim_id: 'claim_direct', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'Cap total.', source_locator_ids: ['locator_a'], source_id: 'source_a' },
      { claim_id: 'claim_decision', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout', value: 'Use USD.', decision_id: 'decision_a', authority: 'product-owner', source_locator_ids: ['locator_a'] },
      { claim_id: 'claim_derived', claim_form: 'derived', level: 'E2', kind: 'test-data', scope: 'checkout', value: '10', derivation_kind: 'boundary-representative', derivation_target: 'test-data', parent_claim_ids: ['claim_direct'], source_locator_ids: ['locator_a'], parameters: {}, rule_input: { lower: 1, upper: 10 } }
    ],
    fact_ledger: [{ fact_id: 'fact_a', claim_id: 'claim_direct', status: 'active', source_claim_ids: ['claim_direct'] }]
  };

  assert.deepEqual(validateAgainstSchema(sourcePack, sourcePackSchema), []);
  assert.deepEqual(validateAgainstSchema(claims, claimsSchema), []);
  assert.equal(validateAgainstSchema({ ...claims, claims: [{ ...claims.claims[0], unknown: true }] }, claimsSchema).some((item) => item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('evidence schema admits every E2 derivation shape and defers semantic matrix errors', () => {
  /** @param {string} derivation_kind @param {string} derivation_target @param {Record<string, unknown>} rule_input */
  const derived = (derivation_kind, derivation_target, rule_input) => ({ claim_id: `claim_${derivation_kind}_${derivation_target}`, claim_form: 'derived', level: 'E2', kind: 'test-data', scope: 'checkout', value: 'derived', source_locator_ids: ['locator_a'], derivation_kind, derivation_target, parent_claim_ids: ['claim_e1'], parameters: {}, rule_input });
  const formula = derived('formula', 'expected-value', {
    formula: 'subtotal * tax_rate',
    inputs: [{ name: 'subtotal', value: 10, unit: 'USD' }, { name: 'tax_rate', value: 0.2 }],
    unit: 'USD', precision: 2, rounding: 'half-up'
  });
  formula.parameters = { formula_id: 'tax_total', unit: 'USD', precision: 2, rounding: 'half-up' };
  const artifact = { schema_version: '2.1.0', source_revision: 0, claims: [
    derived('formula', 'test-data', { formula: 'x+1' }), formula,
    derived('decision-table-instance', 'expected-value', { outcome: 'approved' }), derived('decision-table-instance', 'model-element', {}),
    derived('boundary-representative', 'test-data', { lower: 1, upper: 2, inclusive: true }), derived('enumeration-complement', 'test-data', { enumerated_values: ['draft', 'saved'], closed_world: true }), derived('enumeration-complement', 'model-element', { closed_world: false }),
    derived('graph-reachability', 'model-element', { from: 'a', to: 'b' }), derived('boundary-representative', 'expected-value', {})
  ], fact_ledger: [] };
  assert.deepEqual(validateAgainstSchema(artifact, claimsSchema), []);

  const e0 = {
    schema_version: '2.1.0', source_revision: 0, fact_ledger: [],
    claims: [{ claim_id: 'claim_e0', claim_form: 'direct', level: 'E0', kind: 'requirement', scope: 'checkout', value: 'Speculation', source_locator_ids: ['locator_a'], source_id: 'source_a' }]
  };
  assert.deepEqual(validateAgainstSchema(e0, claimsSchema), [{
    category: 'schema', code: 'ONE_OF_MISMATCH', path: '/claims/0', message: 'must match exactly one schema variant'
  }]);
});

test('all seven behavior views allow evidence-only, model-only, and pending support shapes', () => {
  const common = { source_claim_ids: [], model_refs: [] };
  const fixtures = [
    ['flow', { element_id: 'flow_a', kind: 'flow-node', node_type: 'action', label: 'Open', ...common }],
    ['decision', { element_id: 'decision_a', kind: 'decision-rule', conditions: ['member', 'valid'], result: 'approved', priority: 0, ...common }],
    ['state', { element_id: 'state_a', kind: 'state', state: 'saved', ...common }],
    ['input-domain', { element_id: 'domain_a', kind: 'input-domain', domain: 'quantity', classes: [{ class_id: 'valid', label: 'Valid' }], bounds: { lower: 1, upper: 10, inclusive: true }, ...common }],
    ['role', { element_id: 'role_a', kind: 'role-permission', role: 'member', permissions: ['save'], ...common }],
    ['timing', { element_id: 'timing_a', kind: 'timing-rule', timing_event: 'timeout', threshold: 30, order: 0, ...common }],
    ['integration', { element_id: 'integration_a', kind: 'integration-contract', request: { target: 'profile', payload: '{}' }, response: { status: '200', body: '{}' }, persistence: { operation: 'update', target: 'profile' }, event: { name: 'profile.saved', direction: 'publish' }, callback: { target: 'audit', event: 'saved' }, compensation: { action: 'restore', trigger: 'failure' }, side_effects: [{ kind: 'audit', target: 'audit_log' }], ...common }]
  ];

  for (const [type, element] of fixtures) {
    const artifact = { schema_version: '2.1.0', source_revision: 0, views: [{ view_id: `view_${type}`, type, scope: 'checkout', source_claim_ids: [], elements: [element], relations: [] }], interaction_matrix: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [] };
    assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), [], type);
  }

  const relation = { relation_id: 'relation_model', kind: 'sequence', from_element_id: 'node_model', to_element_id: 'node_model', sequence: 0 };
  const modelOnly = { schema_version: '2.1.0', source_revision: 0, views: [{ view_id: 'view_model', type: 'flow', scope: 'checkout', source_claim_ids: [], elements: [{ element_id: 'node_model', kind: 'flow-node', node_type: 'action', label: 'Open', source_claim_ids: [], model_refs: ['claim_e2'] }], relations: [{ ...relation, source_claim_ids: [], model_refs: ['claim_e2'] }] }], interaction_matrix: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [] };
  assert.deepEqual(validateAgainstSchema(modelOnly, behaviorViewsSchema), []);

  const bothEmpty = structuredClone(modelOnly);
  bothEmpty.views[0].relations[0].model_refs = [];
  assert.deepEqual(validateAgainstSchema(bothEmpty, behaviorViewsSchema), []);
});

test('schema validates structured behavior forms and rejects their unknown properties', () => {
  const artifact = {
    schema_version: '2.1.0', source_revision: 0,
    views: [{
      view_id: 'view_checkout', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'],
      elements: [
        { element_id: 'node_open', kind: 'flow-node', node_type: 'action', label: 'Open checkout', source_claim_ids: ['claim_a'], model_refs: [] },
        { element_id: 'edge_save', kind: 'flow-edge', from_element_id: 'node_open', to_element_id: 'node_open', condition: 'valid cart', result: 'saved', sequence: 1, source_claim_ids: ['claim_a'], model_refs: ['node_open'] }
      ],
      relations: [{ relation_id: 'relation_a', kind: 'sequence', from_element_id: 'node_open', to_element_id: 'edge_save', sequence: 1, source_claim_ids: ['claim_a'], model_refs: ['node_open', 'edge_save'] }]
    }],
    interaction_matrix: [{ module_ids: ['checkout'], dimension: 'role', status: 'checked-no-signal' }],
    obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [{ candidate_id: 'candidate_a', module_ids: ['checkout'], dimension: 'role', disposition: 'formal-view', source_claim_ids: ['claim_a'], semantic_subject_refs: [{ kind: 'fact', fact_id: 'fact_a' }], formal_view_id: 'view_checkout' }]
  };
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  /** @type {any} */ (artifact.views[0].elements[0]).unknown = true;
  assert.equal(validateAgainstSchema(artifact, behaviorViewsSchema).some((item) => item.path.endsWith('/unknown') && item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('case draft schema carries every factual support and Testability gate', () => {
  const artifact = {
    schema_version: '2.1.0', source_revision: 0, cases: [completeCase()],
    obligation_dispositions: [{ obligation_id: 'obligation_a', status: 'case_candidate', case_ids: ['case_a'] }],
    exploratory_candidates: []
  };
  assert.deepEqual(validateAgainstSchema(artifact, caseDraftsSchema), []);

  const missingCapabilityStatus = structuredClone(artifact);
  delete missingCapabilityStatus.cases[0].testability_profile.capabilities[0].status;
  assert.equal(validateAgainstSchema(missingCapabilityStatus, caseDraftsSchema).some((item) => item.path.endsWith('/status') && item.code === 'REQUIRED_FIELD_MISSING'), true);

  for (const collection of ['capabilities', 'observers', 'controls']) {
    for (const status of ['provided', 'verified', 'approved-assumption', 'unavailable', 'unknown']) {
      const statusArtifact = structuredClone(artifact);
      statusArtifact.cases[0].testability_profile[collection][0].status = status;
      assert.deepEqual(validateAgainstSchema(statusArtifact, caseDraftsSchema), [], `${collection}:${status}`);
    }
  }
});

test('test bundle stores complete structured Cases and rejects prose summaries', () => {
  assert.deepEqual(validateAgainstSchema(completeBundle(), testBundleSchema), []);

  const missingBlockedSubject = completeBundle();
  delete missingBlockedSubject.blocked[0].subject;
  assert.equal(validateAgainstSchema(missingBlockedSubject, testBundleSchema).some(
    (item) => item.path === '/blocked/0/subject' && item.code === 'REQUIRED_FIELD_MISSING'
  ), true);

  for (const collection of ['capabilities', 'observers', 'controls']) {
    for (const status of ['provided', 'verified', 'approved-assumption', 'unavailable', 'unknown']) {
      const statusBundle = completeBundle();
      statusBundle.conditional[0].testability_profile[collection][0].status = status;
      assert.deepEqual(validateAgainstSchema(statusBundle, testBundleSchema), [], `conditional:${collection}:${status}`);
    }
  }

  const shallowBundle = completeBundle();
  shallowBundle.grounded = [{ case_id: 'case_shallow', title: 'Summary only', obligation_ids: ['obligation_a'], markdown_sections: ['Unstructured prose'], evidence_refs: ['claim_a'] }];
  assert.notDeepEqual(validateAgainstSchema(shallowBundle, testBundleSchema), []);
  assert.equal(validateAgainstSchema(shallowBundle, testBundleSchema).some((item) => item.path.endsWith('/markdown_sections') && item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('schema requires a non-empty complete clarification blocker ledger', () => {
  const shallow = { status: 'need_user_answers', diagnostics: [], blockers: [] };
  const complete = semanticReply();
  assert.notDeepEqual(validateAgainstSchema(shallow, replySchema), []);
  assert.deepEqual(validateAgainstSchema(complete, replySchema), []);
});

test('schema accepts the five public statuses and rejects cross-purpose field leakage', () => {
  const diagnostics = [{ category: 'schema', code: 'EXAMPLE', message: 'Example' }];
  const replies = [
    { status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json', scope: { source_revision: 0, run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc' }, diagnostics },
    semanticReply(),
    { status: 'need_revision', stage: 'case_drafts', schema_ref: 'case-drafts.schema.json', source_revision: 1, artifact_path: 'staging/cases.json', artifact_digest: 'a'.repeat(64), diagnostics },
    { status: 'finished', run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', source_revision: 1, bundle_path: 'accepted/test-bundle.json', bundle_digest: 'a'.repeat(64), plan_digest: 'b'.repeat(64), markdown_path: 'accepted/test-cases.md', semantic_result_digest: 'c'.repeat(64), execute_case_count: 1, do_not_execute_case_count: 0, do_not_execute_formal_test_point_count: 0, do_not_execute_exploratory_count: 0, applicable_test_point_coverage: { full: 1, partial: 0, none: 0 }, modification_hint: 'No E2E tests were started.', preview_control: { expected_preview_epoch: 0, next_request_instance_id: 'PREVIEW-next' } },
    { status: 'fatal', diagnostics }
  ];
  for (const reply of replies) assert.deepEqual(validateAgainstSchema(reply, replySchema), [], reply.status);
  assert.notDeepEqual(validateAgainstSchema({ ...replies[0], purpose: 'final_confirmation' }, replySchema), []);
});

test('schema detects duplicate nested definition IDs but excludes reference arrays', () => {
  const artifact = {
    schema_version: '2.1.0', source_revision: 0,
    views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'], elements: [
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open', source_claim_ids: ['claim_a'], model_refs: [] },
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open again', source_claim_ids: ['claim_a'], model_refs: [] }
    ], relations: [] }], interaction_matrix: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: []
  };
  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema', code: 'DUPLICATE_STABLE_ID', path: '/views/0/elements/1/element_id', message: 'duplicate stable ID "element_same"'
  }]);
});

test('schema detects nested rule, candidate, and exploratory duplicate definition IDs', () => {
  const artifact = {
    source_policy: { rules: [{ rule_id: 'rule_same' }, { rule_id: 'rule_same' }] },
    obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [{ candidate_id: 'candidate_same' }, { candidate_id: 'candidate_same' }],
    exploratory_candidates: [{ exploratory_id: 'explore_same' }, { exploratory_id: 'explore_same' }]
  };
  assert.deepEqual(validateUniqueStableIds(artifact).map((item) => item.path), [
    '/source_policy/rules/1/rule_id', '/interaction_candidates/1/candidate_id', '/exploratory_candidates/1/exploratory_id'
  ]);
});

test('artifact-global identity namespaces reject duplicate element and bundle case IDs', () => {
  const artifact = { views: [{ elements: [{ element_id: 'element_a' }], relations: [] }, { elements: [{ element_id: 'element_a' }], relations: [] }], grounded: [{ case_id: 'case_a' }], conditional: [{ case_id: 'case_a' }] };
  assert.deepEqual(validateUniqueStableIds(artifact).map((item) => item.path), ['/views/1/elements/0/element_id', '/conditional/0/case_id']);
});

test('step and expectation identities are local to a Case but unique within it', () => {
  const first = completeCase('case_first');
  const second = completeCase('case_second');
  assert.deepEqual(validateUniqueStableIds({ cases: [first, second] }), []);

  const duplicateExpectation = structuredClone(first.steps[0].expectations[0]);
  first.steps.push({ step_id: 'step_verify', action: 'Verify', action_evidence_ref: 'claim_a', support_review: 'supported', expectations: [duplicateExpectation] });
  assert.deepEqual(validateUniqueStableIds({ cases: [first] }).map((item) => item.path), ['/cases/0/steps/1/expectations/0/expectation_id']);
});

test('the six persisted domain artifact schemas accept hand-derived representative nested fixtures', async () => {
  const schemas = Object.fromEntries(await Promise.all((/** @type {string[]} */ (await readdir(schemaDirectory)))
    .filter((/** @type {string} */ file) => file.endsWith('.schema.json'))
    .map(async (/** @type {string} */ file) => [file, JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'))])));
  const fixtures = {
    'source-pack.schema.json': { schema_version: '2.1.0', source_revision: 0, run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout', sources: [{ source_id: 'source_a', kind: 'prd', version: '1', status: 'effective', authority: 'owner', content: 'Rule', content_digest: 'a'.repeat(64) }], locators: [{ locator_id: 'locator_a', source_id: 'source_a', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: 'a'.repeat(64), extraction_integrity: 'verified' }], source_reviews: [{ source_id: 'source_a', content_digest: 'a'.repeat(64), spans: [{ span_id: 'span_a', start: 0, end: 4, classification: 'normative', rationale: 'Fixture rule.' }] }], source_policy: { rules: [{ rule_id: 'policy_a', source_ids: ['source_a'], scope: 'checkout', authority: 'owner', status: 'effective' }] }, decision_records: [{ decision_id: 'decision_a', question_id: 'question_a', presentation_id: 'PRESENTATION-a', decision_group_ids: ['GROUP-a'], root_issue_ids: ['root_a'], affected_obligation_ids: ['obligation_a'], clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-01', question: 'Question?', answer: 'Answer.', disposition: 'temporary', authority_scope: 'task', effective_scope: 'checkout', evidence_ref: 'locator_a', evidence_level: 'E1' }], clarification_events: [{ event_id: 'event_a', clarification_event_seq: 2, type: 'request_delivery', actor: 'owner', event_at: '2026-08-01', presentation_id: 'PRESENTATION-a', decision_group_ids: ['GROUP-a'], root_issue_ids: ['root_a'] }], execution_events: [] },
    'evidence-claims.schema.json': { schema_version: '2.1.0', source_revision: 0, claims: [{ claim_id: 'claim_a', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'Save', source_locator_ids: ['locator_a'], source_id: 'source_a' }], fact_ledger: [{ fact_id: 'fact_a', claim_id: 'claim_a', status: 'active', source_claim_ids: ['claim_a'] }] },
    'behavior-views.schema.json': { schema_version: '2.1.0', source_revision: 0, views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'], elements: [{ element_id: 'element_a', kind: 'flow-node', node_type: 'action', label: 'Save', source_claim_ids: ['claim_a'], model_refs: [] }], relations: [] }], interaction_matrix: [{ module_ids: ['checkout'], dimension: 'role', status: 'checked-no-signal' }], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [{ candidate_id: 'candidate_a', module_ids: ['checkout'], dimension: 'role', disposition: 'formal-view', source_claim_ids: ['claim_a'], semantic_subject_refs: [{ kind: 'fact', fact_id: 'fact_a' }], formal_view_id: 'view_a' }] },
    'test-obligations.schema.json': { schema_version: '2.1.0', source_revision: 0, obligations: [{ obligation_id: 'obligation_a', kind: 'flow', caseable: true, risk: 'medium', scope: 'checkout', source_claim_ids: ['claim_a'], view_element_refs: ['element_a'], required_oracle_refs: ['oracle_a'], required_capabilities: ['browser'] }], fact_routes: [{ fact_id: 'fact_a', route_type: 'obligations', obligation_ids: ['obligation_a'] }], interaction_routes: [{ candidate_id: 'candidate_a', route_type: 'formal-view', formal_view_id: 'view_a' }] },
    'case-drafts.schema.json': { schema_version: '2.1.0', source_revision: 0, cases: [completeCase()], obligation_dispositions: [{ obligation_id: 'obligation_a', status: 'case_candidate', case_ids: ['case_a'] }], exploratory_candidates: [{ exploratory_id: 'exploratory_a', title: 'Explore retry', scope: 'checkout', risk: 'low', source_claim_ids: ['claim_a'] }] },
    'test-bundle.schema.json': completeBundle()
  };

  for (const [file, fixture] of Object.entries(fixtures)) assert.deepEqual(validateAgainstSchema(fixture, schemas[file]), [], file);
});
