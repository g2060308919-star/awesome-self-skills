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

/** @returns {any} */
function minimumSourcePack() {
  return {
    schema_version: '1.0.0',
    source_revision: 0,
    run_scope: 'checkout',
    sources: [],
    locators: [],
    source_policy: { rules: [] },
    decision_records: [],
    clarification_events: []
  };
}

/** @returns {any} */
function minimumClaims() {
  return {
    schema_version: '1.0.0',
    source_revision: 0,
    claims: [],
    fact_ledger: []
  };
}

test('schema accepts the minimum legal source pack fixture', () => {
  assert.deepEqual(validateAgainstSchema(minimumSourcePack(), sourcePackSchema), []);
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
    schema_version: '1.0.0', source_revision: 0, views: [], interaction_candidates: [],
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
    schema_version: '1.0.0', source_revision: 0,
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
  const artifact = { schema_version: '1.0.0', source_revision: 0, claims: [
    derived('formula', 'test-data', { formula: 'x+1' }), derived('formula', 'expected-value', { formula: 'x+1' }),
    derived('decision-table-instance', 'expected-value', { outcome: 'approved' }), derived('decision-table-instance', 'model-element', {}),
    derived('boundary-representative', 'test-data', { lower: 1, upper: 2 }), derived('enumeration-complement', 'test-data', { closed_world: true }), derived('enumeration-complement', 'model-element', { closed_world: false }),
    derived('graph-reachability', 'model-element', { from: 'a', to: 'b' }), derived('boundary-representative', 'expected-value', {})
  ], fact_ledger: [] };
  assert.deepEqual(validateAgainstSchema(artifact, claimsSchema), []);
});

test('behavior views allow model-only support pending Task 4 semantic validation', () => {
  const artifact = { schema_version: '1.0.0', source_revision: 0, views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: [], elements: [{ element_id: 'node_a', kind: 'flow-node', node_type: 'action', label: 'Open', source_claim_ids: [], model_refs: ['claim_e2'] }], relations: [{ relation_id: 'relation_a', kind: 'sequence', from_element_id: 'node_a', to_element_id: 'node_a', sequence: 0, source_claim_ids: [], model_refs: ['claim_e2'] }] }], interaction_matrix: [], interaction_candidates: [] };
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
});

test('schema validates structured behavior forms and rejects their unknown properties', () => {
  const artifact = {
    schema_version: '1.0.0', source_revision: 0,
    views: [{
      view_id: 'view_checkout', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'],
      elements: [
        { element_id: 'node_open', kind: 'flow-node', node_type: 'action', label: 'Open checkout', source_claim_ids: ['claim_a'], model_refs: [] },
        { element_id: 'edge_save', kind: 'flow-edge', from_element_id: 'node_open', to_element_id: 'node_open', condition: 'valid cart', result: 'saved', sequence: 1, source_claim_ids: ['claim_a'], model_refs: ['node_open'] }
      ],
      relations: [{ relation_id: 'relation_a', kind: 'sequence', from_element_id: 'node_open', to_element_id: 'edge_save', sequence: 1, source_claim_ids: ['claim_a'], model_refs: ['node_open', 'edge_save'] }]
    }],
    interaction_matrix: [{ module_ids: ['checkout'], dimension: 'role', status: 'checked-no-signal' }],
    interaction_candidates: [{ candidate_id: 'candidate_a', module_ids: ['checkout'], dimension: 'role', disposition: 'formal-view', source_claim_ids: ['claim_a'], formal_view_id: 'view_checkout' }]
  };
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  /** @type {any} */ (artifact.views[0].elements[0]).unknown = true;
  assert.equal(validateAgainstSchema(artifact, behaviorViewsSchema).some((item) => item.path.endsWith('/unknown') && item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('schema requires a non-empty complete clarification blocker ledger', () => {
  const shallow = { status: 'need_user_answers', diagnostics: [], blockers: [] };
  const complete = {
    status: 'need_user_answers', source_revision: 2, stage: 'clarification', diagnostics: [],
    blockers: [{ root_issue_id: 'root_currency', root_issue_key: 'currency|checkout', missing_type: 'oracle', scope: 'checkout', affected_obligation_ids: ['obligation_currency'], risk_counts: { critical: 0, high: 1, medium: 0, low: 0 }, source_revision: 2, question: 'Which currency is expected?', batch_id: 'batch_2' }]
  };
  assert.notDeepEqual(validateAgainstSchema(shallow, replySchema), []);
  assert.deepEqual(validateAgainstSchema(complete, replySchema), []);
});

test('schema accepts all five closed reply variants', () => {
  const diagnostics = [{ category: 'schema', code: 'EXAMPLE', message: 'Example' }];
  const replies = [
    { status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json', scope: { source_revision: 0 }, diagnostics },
    { status: 'need_user_answers', source_revision: 1, stage: 'clarification', diagnostics, blockers: [{ root_issue_id: 'root_a', root_issue_key: 'a', missing_type: 'oracle', scope: 'checkout', affected_obligation_ids: ['obligation_a'], risk_counts: { critical: 0, high: 0, medium: 1, low: 0 }, source_revision: 1, question: 'Expected result?', batch_id: 'batch_a' }] },
    { status: 'need_revision', stage: 'case_drafts', schema_ref: 'case-drafts.schema.json', source_revision: 1, artifact_path: 'staging/cases.json', artifact_digest: 'a'.repeat(64), diagnostics },
    { status: 'finished', source_revision: 1, bundle_path: 'accepted/test-bundle.json', bundle_digest: 'a'.repeat(64), markdown_path: 'accepted/test-cases.md' },
    { status: 'fatal', diagnostics }
  ];
  for (const reply of replies) assert.deepEqual(validateAgainstSchema(reply, replySchema), [], reply.status);
});

test('schema detects duplicate nested definition IDs but excludes reference arrays', () => {
  const artifact = {
    schema_version: '1.0.0', source_revision: 0,
    views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'], elements: [
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open', source_claim_ids: ['claim_a'], model_refs: [] },
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open again', source_claim_ids: ['claim_a'], model_refs: [] }
    ], relations: [] }], interaction_matrix: [], interaction_candidates: []
  };
  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema', code: 'DUPLICATE_STABLE_ID', path: '/views/0/elements/1/element_id', message: 'duplicate stable ID "element_same"'
  }]);
});

test('schema detects nested rule, candidate, and exploratory duplicate definition IDs', () => {
  const artifact = {
    source_policy: { rules: [{ rule_id: 'rule_same' }, { rule_id: 'rule_same' }] },
    interaction_candidates: [{ candidate_id: 'candidate_same' }, { candidate_id: 'candidate_same' }],
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

test('all eight schemas accept hand-derived representative nested fixtures', async () => {
  const schemas = Object.fromEntries(await Promise.all((/** @type {string[]} */ (await readdir(schemaDirectory)))
    .filter((/** @type {string} */ file) => file.endsWith('.schema.json'))
    .map(async (/** @type {string} */ file) => [file, JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'))])));
  const fixtures = {
    'source-pack.schema.json': { schema_version: '1.0.0', source_revision: 0, run_scope: 'checkout', sources: [{ source_id: 'source_a', kind: 'prd', version: '1', status: 'effective', authority: 'owner', content: 'Rule', content_digest: 'a'.repeat(64) }], locators: [{ locator_id: 'locator_a', source_id: 'source_a', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: 'a'.repeat(64), extraction_integrity: 'verified' }], source_policy: { rules: [{ rule_id: 'policy_a', source_ids: ['source_a'], scope: 'checkout', authority: 'owner', status: 'effective' }] }, decision_records: [{ decision_id: 'decision_a', question_id: 'question_a', root_issue_ids: ['root_a'], affected_obligation_ids: ['obligation_a'], clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-01', question: 'Question?', answer: 'Answer.', disposition: 'temporary', authority_scope: 'task', effective_scope: 'checkout', evidence_ref: 'locator_a', evidence_level: 'E1' }], clarification_events: [{ event_id: 'event_a', clarification_event_seq: 2, type: 'request_delivery', actor: 'owner', event_at: '2026-08-01', root_issue_ids: ['root_a'] }] },
    'evidence-claims.schema.json': { schema_version: '1.0.0', source_revision: 0, claims: [{ claim_id: 'claim_a', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'Save', source_locator_ids: ['locator_a'], source_id: 'source_a' }], fact_ledger: [{ fact_id: 'fact_a', claim_id: 'claim_a', status: 'active', source_claim_ids: ['claim_a'] }] },
    'behavior-views.schema.json': { schema_version: '1.0.0', source_revision: 0, views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'], elements: [{ element_id: 'element_a', kind: 'flow-node', node_type: 'action', label: 'Save', source_claim_ids: ['claim_a'], model_refs: [] }], relations: [] }], interaction_matrix: [{ module_ids: ['checkout'], dimension: 'role', status: 'checked-no-signal' }], interaction_candidates: [{ candidate_id: 'candidate_a', module_ids: ['checkout'], dimension: 'role', disposition: 'formal-view', source_claim_ids: ['claim_a'], formal_view_id: 'view_a' }] },
    'test-obligations.schema.json': { schema_version: '1.0.0', source_revision: 0, obligations: [{ obligation_id: 'obligation_a', kind: 'flow', risk: 'medium', scope: 'checkout', source_claim_ids: ['claim_a'], view_element_refs: ['element_a'], required_oracle_refs: ['oracle_a'], required_capabilities: ['browser'] }], fact_routes: [{ fact_id: 'fact_a', route_type: 'obligations', obligation_ids: ['obligation_a'] }], interaction_routes: [{ candidate_id: 'candidate_a', route_type: 'formal-view', formal_view_id: 'view_a' }] },
    'case-drafts.schema.json': { schema_version: '1.0.0', source_revision: 0, cases: [{ case_id: 'case_a', title: 'Save settings', scope: 'checkout', risk: 'medium', role: 'member', fact_ids: ['fact_a'], obligation_ids: ['obligation_a'], preconditions: [{ condition: 'Signed in', reachable_from: 'login', source_claim_ids: ['claim_a'] }], data: [{ name: 'name', value: 'Ada', evidence_ref: 'claim_a', derivation_ref: 'claim_a' }], steps: [{ step_id: 'step_save', action: 'Save', expectations: [{ expectation_id: 'expect_a', preceding_action_id: 'step_save', observer: 'member', observation_surface: 'ui', target: 'toast', expected_value: 'Saved', comparison: 'equals', evidence_ref: 'claim_a', support_review: 'supported' }] }], testability_profile: { capabilities: ['browser'], observers: ['ui'], controls: ['account'] }, post_state: { state: 'saved', evidence_ref: 'claim_a' }, cleanup: { required: false, no_cleanup_evidence_ref: 'claim_a' }, evidence_refs: ['claim_a'], execution_signature: { role: 'member', precondition_state: 'ready', data_partition: 'valid', action_path: ['open', 'save'], oracle_refs: ['oracle_a'], test_point_ids: ['obligation_a'] } }], obligation_dispositions: [{ obligation_id: 'obligation_a', status: 'case_candidate', case_ids: ['case_a'] }], exploratory_candidates: [{ exploratory_id: 'exploratory_a', title: 'Explore retry', scope: 'checkout', risk: 'low', source_claim_ids: ['claim_a'] }] },
    'test-bundle.schema.json': { schema_version: '1.0.0', source_revision: 0, grounded: [{ case_id: 'case_a', title: 'Save settings', obligation_ids: ['obligation_a'], markdown_sections: ['Steps'], evidence_refs: ['claim_a'] }], conditional: [], blocked: [{ obligation_id: 'obligation_b', root_issue_id: 'root_a', reason: 'Missing oracle', risk: 'high', recovery: { missing_type: 'oracle', required_material: 'Expected outcome', question: 'What happens?' } }], exploratory: [{ exploratory_id: 'exploratory_a', title: 'Explore retry', scope: 'checkout', risk: 'low', reason: 'Risk observation' }], coverage: { requirements: { total: 1, accounted: 1, entries: [{ fact_id: 'fact_a', status: 'covered' }] }, formal: { total: 2, covered: 1, entries: [{ obligation_id: 'obligation_a', status: 'grounded' }] }, executable: { total: 1, grounded: 1, entries: [{ obligation_id: 'obligation_a', case_id: 'case_a' }] }, expert_recall: { status: 'benchmark_only', limits: ['No labels'] }, not_applicable: [] }, quality: { delivery_status: 'critical_gaps', compiler_version: '0.1.0', schema_version: '1.0.0', lineage: { source_digest: 'a'.repeat(64), case_draft_digest: 'b'.repeat(64) }, limits: ['Missing oracle'] } },
    'checkpoint.schema.json': { input_digest: 'a'.repeat(64), source_revision: 0, stage: 'source_pack', compiler_version: '0.1.0', schema_version: '1.0.0', accepted_artifact_digests: { source_pack: 'a'.repeat(64) }, clarification_event_seq: 1, asked_root_issue_ids: ['root_a'], root_issue_dispositions: [{ root_issue_id: 'root_a', status: 'asked' }], last_question_set_digest: 'b'.repeat(64), clarification_stop: { reason: 'converged', source_revision: 0 } },
    'reply.schema.json': { status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json', scope: { source_revision: 0 }, diagnostics: [{ category: 'schema', code: 'EXAMPLE', message: 'Example diagnostic', path: '/sources/0' }] }
  };

  for (const [file, fixture] of Object.entries(fixtures)) assert.deepEqual(validateAgainstSchema(fixture, schemas[file]), [], file);
});
