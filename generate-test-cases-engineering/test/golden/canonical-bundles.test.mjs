import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalStringify } from '../../src/canonical.mjs';
import {
  JOURNEY_NAMES, evaluateJourney, loadHardGateExpectations, loadJourneySpec
} from '../helpers/run-journey.mjs';
import { materializeBendReviewGolden } from '../helpers/v4-bend-review-golden.mjs';

// Production defect caught: delivery lanes or formal coverage can drift while
// output remains schema-valid, and generated expectations can hide the drift.
// Rule reversal caught: an Exploratory denominator, NotApplicable numerator,
// missing Blocked point, or unreviewed output breaks hand-owned byte goldens.

const goldenRoot = path.resolve('test/golden/journeys');
const hardGateExpectations = await loadHardGateExpectations();

/** @param {any} bundle */
function v1SemanticCore(bundle) {
  const copy = structuredClone(bundle);
  delete copy.execution_plan;
  delete copy.quality;
  delete copy.schema_version;
  delete copy.source_revision;
  return copy;
}

test('[P-09][P-11][BR-14][BR-15] v4 canonical JSON is the sole authority for Markdown and worksheet Case membership and order', async () => {
  const { compilation, delivery } = await materializeBendReviewGolden();
  const canonicalBundle = JSON.parse(delivery.bundle_bytes);
  assert.equal(delivery.bundle_bytes, `${canonicalStringify(compilation.bundle)}\n`);
  assert.deepEqual([...canonicalBundle.ordered_case_ids].sort(),
    canonicalBundle.cases.map((/** @type {any} */ item) => item.case_id).sort());
  const casesById = new Map(canonicalBundle.cases.map(
    (/** @type {any} */ item) => [item.case_id, item]
  ));
  const orderedCases = canonicalBundle.ordered_case_ids.map(
    (/** @type {string} */ id) => casesById.get(id)
  );

  const markdownOrder = orderedCases.map((/** @type {any} */ item) =>
    delivery.markdown_bytes.indexOf(`| ${item.title} |`));
  assert.equal(markdownOrder.every((/** @type {number} */ position) => position >= 0), true);
  assert.deepEqual([...markdownOrder].sort((left, right) => left - right), markdownOrder);
  assert.deepEqual(
    [...delivery.worksheet_bytes.matchAll(/^(CASE-[^,]+)/gmu)].map(match => match[1]),
    canonicalBundle.ordered_case_ids
  );

  const tampered = structuredClone(compilation.bundle);
  tampered.ordered_case_ids = tampered.ordered_case_ids.slice(1);
  const { materializeCaseDocumentDeliveryV4 } = await import('../../src/canonical-delivery-v4.mjs');
  assert.throws(() => materializeCaseDocumentDeliveryV4({
    run_id: 'RUN-15151515-1515-4515-8515-151515151515',
    completed_at: '2026-09-09T12:00:00.000Z', bundle: tampered,
    render_options: { include_audit_appendix: false }, non_blocking_diagnostics: []
  }), /CASE_ORDER_INVALID|CANONICAL_DELIVERY_INPUT_INVALID/u);
});

test('canonical bundles preserve ten reviewed semantic cores and one exact v3 JSON/Markdown golden', async () => {
  assert.equal(JOURNEY_NAMES.length, 10);
  for (const name of JOURNEY_NAMES) {
    const expectedBundleText = await readFile(path.join(goldenRoot, `${name}.json`), 'utf8');
    const result = await evaluateJourney(name);
    assert.equal(result.status, 'finished', name);
    if (name === 'all-e3') {
      const expectedMarkdown = await readFile(path.join(goldenRoot, `${name}.md`), 'utf8');
      assert.equal(`${canonicalStringify(result.bundle)}\n`, expectedBundleText, `${name}: JSON`);
      assert.equal(result.markdown, expectedMarkdown, `${name}: Markdown`);
    } else {
      assert.deepEqual(v1SemanticCore(result.bundle), v1SemanticCore(JSON.parse(expectedBundleText)), `${name}: semantic core`);
      assert.equal(result.markdown, (await evaluateJourney(name)).markdown, `${name}: deterministic Markdown`);
    }
  }
});

test('canonical bundle hard gates: Exploratory is outside the formal denominator', async () => {
  assert.equal(
    hardGateExpectations.get('Exploratory-in-denominator'),
    'formal-coverage-unchanged'
  );
  const baseline = (await evaluateJourney('risk-only-exploratory')).bundle;
  assert.equal(baseline.exploratory.length, 1);
  assert.equal(baseline.coverage.formal.total, 0, 'reversal counts Exploratory in denominator');
  assert.equal(baseline.coverage.requirements.total, 0);
});

test('canonical bundle hard gates: NotApplicable is accounted but never covered', async () => {
  assert.equal(hardGateExpectations.get('NotApplicable-in-numerator'), 'not-covered');
  const bundle = (await evaluateJourney('all-not-applicable')).bundle;
  assert.equal(bundle.coverage.not_applicable.length, 1);
  assert.equal(bundle.coverage.formal.total, 1);
  assert.equal(bundle.coverage.formal.covered, 0, 'reversal counts NotApplicable in numerator');
  assert.equal(bundle.coverage.formal.entries[0].status, 'not_applicable');
  assert.equal(bundle.coverage.requirements.entries[0].status, 'not_applicable');
});

test('canonical bundle hard gates: Blocked retains the formal Test Point and recovery', async () => {
  assert.equal(hardGateExpectations.get('missing-Blocked-Test-Point'), 'blocked-retained');
  const spec = await loadJourneySpec('all-blocked');
  const result = await evaluateJourney(spec.scenario, spec.interaction_policy);
  const bundle = result.bundle;
  assert.equal(bundle.blocked.length, 1, 'reversal drops a missing Blocked Test Point');
  assert.equal(bundle.coverage.formal.total, 1);
  assert.equal(bundle.coverage.formal.entries[0].status, 'blocked');
  assert.ok(bundle.blocked[0].obligation_id);
  assert.ok(result.markdown.includes(bundle.blocked[0].recovery.question));
});
