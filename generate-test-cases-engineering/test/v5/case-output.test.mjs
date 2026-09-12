import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileV5CaseDocument, compileV5CaseDocumentTransaction, projectCompatibilityExecutionPlan } from '../../src/v5/case-compiler.mjs';
import { deriveCaseStatus } from '../../src/v5/case-status.mjs';
import { renderV5Csv } from '../../src/v5/render-csv.mjs';
import { renderV5Json } from '../../src/v5/render-json.mjs';
import { renderV5Markdown } from '../../src/v5/render-markdown.mjs';
import { caseOutputFixture } from './case-output-fixture.mjs';

const compilerInput = caseOutputFixture;

test('status classification is evidence-only and follows Blocked > Conditional > Grounded', () => {
  assert.equal(deriveCaseStatus({ evidence_levels: ['E2', 'E3'], unresolved_gap_ids: [] }), 'Grounded');
  assert.equal(deriveCaseStatus({ evidence_levels: ['E2', 'E1'], unresolved_gap_ids: [] }), 'Conditional');
  assert.equal(deriveCaseStatus({ evidence_levels: ['E1'], unresolved_gap_ids: ['gap'] }), 'Blocked');
  assert.equal(deriveCaseStatus({ evidence_levels: ['E2'], unresolved_gap_ids: [], not_applicable_basis_levels: ['E2'] }), 'NotApplicable');
  assert.equal(deriveCaseStatus({ evidence_levels: ['E2'], unresolved_gap_ids: [], exploratory_only: true }), 'Exploratory');
  assert.throws(() => deriveCaseStatus({ evidence_levels: ['E0'], unresolved_gap_ids: [] }), /SEMANTIC_REVIEW_CANDIDATE_MISSING/u);
});

test('compiler emits all five statuses, typed semantics, separate coverage, and downstream-only provenance', () => {
  const document = compileV5CaseDocument(compilerInput());
  assert.deepEqual(document.cases.map((item) => item.semantic_status).sort(), ['Blocked', 'Conditional', 'Exploratory', 'Grounded', 'NotApplicable'].sort());
  assert.deepEqual(document.classification_counts, { Blocked: 1, Conditional: 1, Exploratory: 1, Grounded: 1, NotApplicable: 1 });
  assert.equal(document.coverage.formal_test_point.total, 4);
  assert.equal(document.coverage.formal_test_point.blocked, 1);
  assert.equal(document.coverage.semantic_partition.total, 2);
  assert.equal(document.coverage.value_instance.total, 1);
  assert.equal(document.coverage.permission_cell.total, 3);
  assert.equal(document.coverage.permission_cell.covered, 1);
  assert.equal(document.coverage.risk_review.reviewed, 9);
  assert.equal(document.provenance.output_role, 'downstream_only');
  assert.equal(document.semantic_audit.value_states[0].data_state.value.value, 0);
  assert.equal(/** @type {Record<string,any>} */ (document.permission_coverage).data_scope.semantic_gap, 1);
});

test('Agent client-key renames do not change compiler-owned Case, Step, or Oracle IDs', () => {
  const original = compileV5CaseDocument(compilerInput());
  const renamedInput = compilerInput();
  renamedInput.case_drafts = renamedInput.case_drafts.map((draft, index) => ({
    ...draft,
    case_client_key: `renamed-${index}`,
    case_step_semantic_bindings: draft.case_step_semantic_bindings.map((binding) => ({ ...binding, case_client_key: `renamed-${index}` }))
  }));
  const renamed = compileV5CaseDocument(renamedInput);
  assert.deepEqual(renamed.cases.map((item) => ({ case_id: item.case_id, step_ids: item.steps.map((step) => step.step_id), oracle_ids: item.oracles.map((oracle) => oracle.oracle_id) })), original.cases.map((item) => ({ case_id: item.case_id, step_ids: item.steps.map((step) => step.step_id), oracle_ids: item.oracles.map((oracle) => oracle.oracle_id) })));
});

test('Case V5 extensions are mandatory and compiler output contains only stable identities', () => {
  for (const field of ['case_step_semantic_bindings', 'domain_selections']) {
    const invalid = compilerInput();
    delete invalid.case_drafts[0][field];
    assert.throws(() => compileV5CaseDocument(invalid), (error) => error.code === 'SCHEMA_VALIDATION_FAILED');
  }

  const compiled = compileV5CaseDocumentTransaction(compilerInput());
  assert.equal(compiled.client_key_bindings.length, 15);
  assert.equal(compiled.client_key_bindings.every((binding) => typeof binding.client_key === 'string' && /^(CASE|STEP|ORACLE)-[0-9a-f]{64}$/u.test(binding.stable_id)), true);
  assert.doesNotMatch(JSON.stringify(compiled.document), /(?:case|step|oracle|selection)_client_key/u);
});

test('Domain selections do not participate in Case, Step, or Oracle identity preimages', () => {
  const input = compilerInput();
  const draft = input.case_drafts[0];
  draft.domain_selections = [{
    selection_client_key: 'selection-grounded-target', case_client_key: draft.case_client_key,
    formal_test_point_id: draft.primary_test_point_id, oracle_semantic_contract_id: draft.oracles[0].oracle_semantic_contract_id,
    domain_contract_id: 'domain-status', partition_id: 'partition-target',
    selection: { kind: 'exhaustive_members', selected_values: [{ kind: 'string', value: 'draft' }], membership: { kind: 'closed_domain_membership' } }
  }];
  input.semantic_audit.domains = [{
    domain_contract_id: 'domain-status',
    domain: { kind: 'closed_enum', members: [{ kind: 'string', value: 'draft' }, { kind: 'string', value: 'published' }], closed_world_basis: [{ kind: 'claim', claim_id: 'claim-e2' }] },
    partitions: [
      { partition_id: 'partition-target', kind: 'exact_members', semantic_role: 'target', values: [{ kind: 'string', value: 'draft' }] },
      { partition_id: 'partition-other', kind: 'exact_members', semantic_role: 'other', values: [{ kind: 'string', value: 'published' }] }
    ]
  }];
  const exhaustive = compileV5CaseDocument(input);
  const sampledInput = structuredClone(input);
  sampledInput.case_drafts[0].domain_selections[0].selection = {
    kind: 'sampled', selected_values: [{ kind: 'string', value: 'draft' }], residual_risk: 'One valid member sampled.', membership: { kind: 'closed_domain_membership' }
  };
  const sampled = compileV5CaseDocument(sampledInput);
  const projectIds = (document) => {
    const current = document.cases.find((item) => item.primary_test_point_id === draft.primary_test_point_id);
    return { case_id: current.case_id, step_ids: current.steps.map((step) => step.step_id), oracle_ids: current.oracles.map((oracle) => oracle.oracle_id) };
  };
  assert.deepEqual(projectIds(sampled), projectIds(exhaustive));
  assert.notEqual(sampled.cases.find((item) => item.primary_test_point_id === draft.primary_test_point_id).domain_selections[0].domain_selection_id, exhaustive.cases.find((item) => item.primary_test_point_id === draft.primary_test_point_id).domain_selections[0].domain_selection_id);
});

test('Oracle-only changes leave Step identity unchanged', () => {
  const original = compileV5CaseDocument(compilerInput());
  const changedInput = compilerInput();
  const draft = changedInput.case_drafts[0];
  draft.oracles[0].assertion.expected_text = 'changed';
  const accepted = changedInput.oracle_semantic_contracts.find((contract) => contract.oracle_semantic_contract_id === draft.oracles[0].oracle_semantic_contract_id);
  accepted.assertion.expected_text = 'changed';
  const changed = compileV5CaseDocument(changedInput);
  const originalCase = original.cases.find((item) => item.primary_test_point_id === draft.primary_test_point_id);
  const changedCase = changed.cases.find((item) => item.primary_test_point_id === draft.primary_test_point_id);
  assert.equal(changedCase.steps[0].step_id, originalCase.steps[0].step_id);
  assert.notEqual(changedCase.oracles[0].oracle_id, originalCase.oracles[0].oracle_id);
});

test('Domain selections are compiler-bound to one Case, Test Point, Oracle, Domain, and Partition', () => {
  const input = compilerInput();
  const draft = input.case_drafts[0];
  draft.case_step_semantic_bindings = [{
    case_client_key: draft.case_client_key,
    step_client_key: draft.steps[0].step_client_key,
    action_ref: draft.steps[0].semantic_action_ref
  }];
  draft.domain_selections = [{
    selection_client_key: 'selection-grounded-target',
    case_client_key: draft.case_client_key,
    formal_test_point_id: draft.primary_test_point_id,
    oracle_semantic_contract_id: draft.oracles[0].oracle_semantic_contract_id,
    domain_contract_id: 'domain-status',
    partition_id: 'partition-target',
    selection: {
      kind: 'exhaustive_members',
      selected_values: [{ kind: 'string', value: 'draft' }],
      membership: { kind: 'closed_domain_membership' }
    }
  }];
  input.semantic_audit.domains = [{
    domain_contract_id: 'domain-status',
    domain: {
      kind: 'closed_enum',
      members: [{ kind: 'string', value: 'draft' }, { kind: 'string', value: 'published' }],
      closed_world_basis: [{ kind: 'claim', claim_id: 'claim-e2' }]
    },
    partitions: [
      { partition_id: 'partition-target', kind: 'exact_members', semantic_role: 'target', values: [{ kind: 'string', value: 'draft' }] },
      { partition_id: 'partition-other', kind: 'exact_members', semantic_role: 'other', values: [{ kind: 'string', value: 'published' }] }
    ]
  }];
  input.semantic_partitions = undefined;
  input.value_instances = undefined;

  const transaction = compileV5CaseDocumentTransaction(input);
  const document = transaction.document;
  const compiled = document.cases.find((current) => current.primary_test_point_id === draft.primary_test_point_id);
  assert.match(compiled.domain_selections[0].domain_selection_id, /^dsl5_[0-9a-f]{64}$/u);
  assert.equal(transaction.client_key_bindings.find((binding) => binding.client_key === 'selection-grounded-target').stable_id, compiled.domain_selections[0].domain_selection_id);
  assert.deepEqual(document.coverage.semantic_partition, {
    total: 2, covered: 1, gap: 1, not_applicable: 0
  });
  assert.deepEqual(document.coverage.value_instance, {
    total: 1, covered: 1, gap: 0, not_applicable: 0
  });

  const invalid = structuredClone(input);
  invalid.case_drafts[0].domain_selections[0].partition_id = 'partition-other';
  assert.throws(() => compileV5CaseDocument(invalid), (error) => error.code === 'DOMAIN_CONTRACT_REQUIRED');
});

test('representative Domain selections require the exact accepted equivalence contract', () => {
  const input = compilerInput();
  const draft = input.case_drafts[0];
  draft.case_step_semantic_bindings = [{ case_client_key: draft.case_client_key, step_client_key: draft.steps[0].step_client_key, action_ref: draft.steps[0].semantic_action_ref }];
  draft.domain_selections = [{
    selection_client_key: 'selection-grounded-target', case_client_key: draft.case_client_key,
    formal_test_point_id: draft.primary_test_point_id, oracle_semantic_contract_id: draft.oracles[0].oracle_semantic_contract_id,
    domain_contract_id: 'domain-open', partition_id: 'partition-open',
    selection: {
      kind: 'representative', selected_values: [{ kind: 'string', value: 'sample' }],
      behavior_equivalence_contract_id: 'beq5-accepted',
      membership: { kind: 'membership_witnesses', witnesses: [{ selected_value_digest: 'sha256:invalid', basis: [{ kind: 'claim', claim_id: 'claim-e2' }] }] }
    }
  }];
  input.semantic_audit.domains = [{
    domain_contract_id: 'domain-open', domain: { kind: 'open_domain', boundary_description: 'all strings', boundary_basis: [{ kind: 'claim', claim_id: 'claim-e2' }] },
    partitions: [{ partition_id: 'partition-open', kind: 'predicate', semantic_role: 'target', predicate_contract_id: 'predicate-open' }]
  }];
  input.semantic_audit.behavior_equivalence_contracts = [{
    behavior_equivalence_contract_id: 'beq5-accepted', domain_contract_id: 'domain-open', partition_id: 'partition-open',
    formal_test_point_id: draft.primary_test_point_id, oracle_semantic_contract_id: draft.oracles[0].oracle_semantic_contract_id
  }];
  assert.throws(() => compileV5CaseDocument(input), (error) => error.code === 'DOMAIN_CONTRACT_REQUIRED');
});

test('JSON, Markdown, and CSV are byte-stable mechanical projections with parity', async () => {
  const document = compileV5CaseDocument(compilerInput());
  const json = renderV5Json(document); const markdown = renderV5Markdown(document); const csv = renderV5Csv(document);
  const goldenDirectory = new URL('../../test/golden/v5/', import.meta.url);
  assert.equal(json, await readFile(new URL('case-document.json', goldenDirectory), 'utf8'));
  assert.equal(markdown, await readFile(new URL('case-document.md', goldenDirectory), 'utf8'));
  assert.equal(csv, await readFile(new URL('execution-worksheet.csv', goldenDirectory), 'utf8'));
  const parsed = JSON.parse(json);
  for (const current of parsed.cases) {
    assert.match(markdown, new RegExp(`${current.case_id}.*${current.semantic_status}`, 'u'));
    assert.match(markdown, new RegExp(current.canonical_names[0], 'u'));
    assert.match(csv, new RegExp(`${current.case_id},${current.semantic_status}`, 'u'));
    for (const step of current.steps) assert.equal(markdown.includes(step.action), true);
    for (const oracle of current.oracles) assert.equal(csv.includes(oracle.oracle_id), true);
  }
});

test('compatibility Execution Plan uses exactly the existing four operation kinds', async () => {
  const plan = projectCompatibilityExecutionPlan(compileV5CaseDocument(compilerInput()), { run_id: 'run-case', revision: 9 });
  assert.deepEqual(plan.operation_kinds, ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition']);
  assert.equal(plan.items.every((/** @type {Record<string,any>} */ item) => item.execution_disposition === 'pending'), true);
  const expected = await readFile(new URL('../../test/golden/v5/execution-plan.json', import.meta.url), 'utf8');
  assert.equal(`${JSON.stringify(plan, null, 2)}\n`, expected);
});
