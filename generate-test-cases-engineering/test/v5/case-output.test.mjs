import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileV5CaseDocument, projectCompatibilityExecutionPlan } from '../../src/v5/case-compiler.mjs';
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
  renamedInput.case_drafts = renamedInput.case_drafts.map((draft, index) => ({ ...draft, case_client_key: `renamed-${index}` }));
  const renamed = compileV5CaseDocument(renamedInput);
  assert.deepEqual(renamed.cases.map((item) => ({ case_id: item.case_id, step_ids: item.steps.map((step) => step.step_id), oracle_ids: item.oracles.map((oracle) => oracle.oracle_id) })), original.cases.map((item) => ({ case_id: item.case_id, step_ids: item.steps.map((step) => step.step_id), oracle_ids: item.oracles.map((oracle) => oracle.oracle_id) })));
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
