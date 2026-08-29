import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
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
  artifact.claims.push({ claim_id: 'claim_a' });

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
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'ENUM_MISMATCH'), true);
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

test('all eight schemas accept hand-derived representative nested fixtures', async () => {
  const schemas = Object.fromEntries(await Promise.all((/** @type {string[]} */ (await readdir(schemaDirectory)))
    .filter((/** @type {string} */ file) => file.endsWith('.schema.json'))
    .map(async (/** @type {string} */ file) => [file, JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'))])));
  const fixtures = {
    'source-pack.schema.json': { schema_version: '1.0.0', source_revision: 0, run_scope: 'checkout', sources: [{ source_id: 'source_a', content: 'Rule', content_digest: 'a'.repeat(64) }], locators: [{ locator_id: 'locator_a', source_id: 'source_a', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: 'a'.repeat(64), extraction_integrity: 'verified' }], source_policy: { rules: [{ rule_id: 'policy_a', source_ids: ['source_a'], scope: 'checkout' }] }, decision_records: [{ decision_id: 'decision_a', question_id: 'question_a', root_issue_ids: ['root_a'], affected_obligation_ids: ['obligation_a'], clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-01', question: 'Question?', answer: 'Answer.', disposition: 'temporary', authority_scope: 'task', effective_scope: 'checkout' }], clarification_events: [{ event_id: 'event_a', clarification_event_seq: 2, type: 'request_delivery', actor: 'owner', event_at: '2026-08-01', root_issue_ids: ['root_a'] }] },
    'evidence-claims.schema.json': { schema_version: '1.0.0', source_revision: 0, claims: [{ claim_id: 'claim_a', source_locator_ids: ['locator_a'] }], fact_ledger: [{ fact_id: 'fact_a', claim_id: 'claim_a' }] },
    'behavior-views.schema.json': { schema_version: '1.0.0', source_revision: 0, views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', elements: [{ element_id: 'element_a', kind: 'action', source_claim_ids: ['claim_a'] }] }], interaction_matrix: [{ module_ids: ['checkout'], dimension: 'role', status: 'checked-no-signal' }], interaction_candidates: [{ candidate_id: 'candidate_a', module_ids: ['checkout'], dimension: 'role', disposition: 'formal' }] },
    'test-obligations.schema.json': { schema_version: '1.0.0', source_revision: 0, obligations: [{ obligation_id: 'obligation_a', kind: 'flow', risk: 'medium', scope: 'checkout', source_claim_ids: ['claim_a'], view_element_refs: ['element_a'], required_oracle_refs: ['oracle_a'], required_capabilities: ['browser'] }], fact_routes: [{ fact_id: 'fact_a', route_type: 'obligations', obligation_ids: ['obligation_a'] }], interaction_routes: [{ candidate_id: 'candidate_a', route_type: 'view', view_id: 'view_a' }] },
    'case-drafts.schema.json': { schema_version: '1.0.0', source_revision: 0, cases: [{ case_id: 'case_a', title: 'Save settings', scope: 'checkout', risk: 'medium', role: 'member', steps: [{ action: 'Save', expected: 'Saved' }], execution_signature: { role: 'member', precondition_state: 'ready', data_partition: 'valid', action_path: ['open', 'save'], oracle_refs: ['oracle_a'], test_point_ids: ['obligation_a'] } }], obligation_dispositions: [{ obligation_id: 'obligation_a', status: 'case_candidate', case_ids: ['case_a'] }], exploratory_candidates: [{ exploratory_id: 'exploratory_a', title: 'Explore retry', scope: 'checkout', risk: 'low' }] },
    'test-bundle.schema.json': { schema_version: '1.0.0', source_revision: 0, grounded: [{ case_id: 'case_a', title: 'Save settings' }], conditional: [], blocked: [{ obligation_id: 'obligation_b', reason: 'Missing oracle' }], exploratory: [{ exploratory_id: 'exploratory_a', title: 'Explore retry' }], coverage: { requirements: { total: 1, accounted: 1 }, formal: { total: 2, covered: 1 }, executable: { total: 1, grounded: 1 }, expert_recall: { status: 'benchmark_only' } }, quality: { delivery_status: 'critical_gaps', compiler_version: '0.1.0', schema_version: '1.0.0' } },
    'checkpoint.schema.json': { input_digest: 'a'.repeat(64), source_revision: 0, stage: 'source_pack', compiler_version: '0.1.0', schema_version: '1.0.0', accepted_artifact_digests: { source_pack: 'a'.repeat(64) }, clarification_event_seq: 1, asked_root_issue_ids: ['root_a'], root_issue_dispositions: [{ root_issue_id: 'root_a', status: 'asked' }], last_question_set_digest: 'b'.repeat(64), clarification_stop: { reason: 'converged', source_revision: 0 } },
    'reply.schema.json': { status: 'need_artifact', stage: 'source_pack', schema_ref: 'source-pack.schema.json', scope: { source_revision: 0 }, diagnostics: [{ category: 'schema', code: 'EXAMPLE', message: 'Example diagnostic', path: '/sources/0' }] }
  };

  for (const [file, fixture] of Object.entries(fixtures)) assert.deepEqual(validateAgainstSchema(fixture, schemas[file]), [], file);
});
