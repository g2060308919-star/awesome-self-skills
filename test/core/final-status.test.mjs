import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildBundle } from '../../src/coverage.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(await readFile(path.join(
  repositoryRoot, 'test/fixtures/journeys/final-critical-gaps.json'
), 'utf8'));

function base() {
  return structuredClone(fixture);
}

/** @param {any} input @param {string[]} obligationIds */
function retain(input, obligationIds) {
  const retained = new Set(obligationIds);
  input.obligations_artifact.obligations = input.obligations_artifact.obligations
    .filter((/** @type {any} */ item) => retained.has(item.obligation_id));
  const retainedExclusions = new Set(input.classification.not_applicable
    .filter((/** @type {any} */ item) => retained.has(item.obligation_id))
    .map((/** @type {any} */ item) => item.exclusion_claim_id));
  input.obligations_artifact.fact_routes = input.obligations_artifact.fact_routes
    .filter((/** @type {any} */ item) => item.obligation_ids?.some((/** @type {string} */ id) => retained.has(id))
      || retainedExclusions.has(item.not_applicable_claim_id));
  const retainedFacts = new Set(input.obligations_artifact.fact_routes.map((/** @type {any} */ item) => item.fact_id));
  input.evidence_claims.fact_ledger = input.evidence_claims.fact_ledger
    .filter((/** @type {any} */ item) => retainedFacts.has(item.fact_id));
  for (const lane of ['grounded', 'conditional']) input.classification[lane] = input.classification[lane]
    .filter((/** @type {any} */ item) => item.obligation_ids.some((/** @type {string} */ id) => retained.has(id)));
  input.classification.blocked = input.classification.blocked
    .filter((/** @type {any} */ item) => retained.has(item.obligation_id));
  input.classification.not_applicable = input.classification.not_applicable
    .filter((/** @type {any} */ item) => retained.has(item.obligation_id));
  const snapshot = input.clarification.semantic_snapshot;
  snapshot.formal_test_points = snapshot.formal_test_points.filter((/** @type {any} */ item) => retained.has(item.obligation_id));
  snapshot.coverage_denominator = snapshot.formal_test_points.length;
  for (const lane of ['grounded', 'conditional', 'blocked']) snapshot.delivery_sections[lane] = snapshot.delivery_sections[lane]
    .filter((/** @type {string} */ id) => retained.has(id));
  snapshot.delivery_sections.coverage.formal_denominator = snapshot.formal_test_points.length;
  input.clarification.root_issues = input.clarification.root_issues.map((/** @type {any} */ root) => ({
    ...root,
    affected_obligation_ids: root.affected_obligation_ids.filter((/** @type {string} */ id) => retained.has(id))
  })).filter((/** @type {any} */ root) => root.affected_obligation_ids.length > 0);
  input.clarification.state.root_snapshot_ledger = input.clarification.state.root_snapshot_ledger.map((/** @type {any} */ root) => ({
    ...root,
    affected_obligation_ids: root.affected_obligation_ids.filter((/** @type {string} */ id) => retained.has(id))
  })).filter((/** @type {any} */ root) => root.affected_obligation_ids.length > 0);
  const retainedRoots = new Set(input.clarification.state.root_snapshot_ledger
    .map((/** @type {any} */ root) => root.root_issue_id));
  input.clarification.state.root_issue_dispositions = input.clarification.state.root_issue_dispositions
    .filter((/** @type {any} */ disposition) => retainedRoots.has(disposition.root_issue_id));
  return input;
}

test('final status priority is mutually exclusive and frozen', () => {
  const none = retain(base(), []);
  none.obligations_artifact.fact_routes = [];
  assert.equal(buildBundle(none).quality.delivery_status, 'no_applicable_formal_test_points');

  const allNa = retain(base(), ['obligation_na']);
  assert.equal(buildBundle(allNa).quality.delivery_status, 'no_applicable_formal_test_points');

  const allBlocked = retain(base(), ['obligation_blocked']);
  assert.equal(buildBundle(allBlocked).quality.delivery_status, 'no_deterministic_cases');

  const criticalGaps = base();
  assert.equal(buildBundle(criticalGaps).quality.delivery_status, 'critical_gaps');

  const executable = retain(base(), ['obligation_grounded']);
  assert.equal(buildBundle(executable).quality.delivery_status, 'executable_subset_ready');
});

test('Conditional Case counts as executable but never as Grounded executable coverage', () => {
  const input = retain(base(), ['obligation_grounded']);
  const candidate = input.classification.grounded.pop();
  candidate.temporary_assumption = {
    claim_id: 'claim_assumption', invalidation_condition: 'The owner rejects the temporary rule.'
  };
  input.classification.conditional.push(candidate);
  const point = input.clarification.semantic_snapshot.formal_test_points[0];
  point.classification = 'conditional';
  point.evidence_level = 'E1';
  input.clarification.semantic_snapshot.delivery_sections.grounded = [];
  input.clarification.semantic_snapshot.delivery_sections.conditional = ['obligation_grounded'];

  const bundle = buildBundle(input);
  assert.equal(bundle.quality.delivery_status, 'executable_subset_ready');
  assert.equal(bundle.coverage.formal.covered, 1);
  assert.deepEqual(bundle.coverage.executable, { total: 0, grounded: 0, entries: [] });
});
