import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { canonicalStringify } from '../../src/canonical.mjs';
import {
  JOURNEY_NAMES, evaluateJourney, loadJourneySpec
} from '../helpers/run-journey.mjs';

// Production defect caught: delivery lanes or formal coverage can drift while
// output remains schema-valid, and generated expectations can hide the drift.
// Rule reversal caught: an Exploratory denominator, NotApplicable numerator,
// missing Blocked point, or unreviewed output breaks hand-owned byte goldens.

const goldenRoot = path.resolve('test/golden/journeys');

test('canonical bundles: ten reviewed JSON and Markdown goldens remain exact', async () => {
  assert.equal(JOURNEY_NAMES.length, 10);
  for (const name of JOURNEY_NAMES) {
    const expectedBundleText = await readFile(path.join(goldenRoot, `${name}.json`), 'utf8');
    const expectedMarkdown = await readFile(path.join(goldenRoot, `${name}.md`), 'utf8');
    const result = await evaluateJourney(name);
    assert.equal(result.status, 'finished', name);
    assert.equal(`${canonicalStringify(result.bundle)}\n`, expectedBundleText, `${name}: JSON`);
    assert.equal(result.markdown, expectedMarkdown, `${name}: Markdown`);
  }
});

test('canonical bundle hard gates: Exploratory is outside the formal denominator', async () => {
  const baseline = (await evaluateJourney('risk-only-exploratory')).bundle;
  assert.equal(baseline.exploratory.length, 1);
  assert.equal(baseline.coverage.formal.total, 0, 'reversal counts Exploratory in denominator');
  assert.equal(baseline.coverage.requirements.total, 0);
});

test('canonical bundle hard gates: NotApplicable is accounted but never covered', async () => {
  const bundle = (await evaluateJourney('all-not-applicable')).bundle;
  assert.equal(bundle.coverage.not_applicable.length, 1);
  assert.equal(bundle.coverage.formal.total, 1);
  assert.equal(bundle.coverage.formal.covered, 0, 'reversal counts NotApplicable in numerator');
  assert.equal(bundle.coverage.formal.entries[0].status, 'not_applicable');
  assert.equal(bundle.coverage.requirements.entries[0].status, 'not_applicable');
});

test('canonical bundle hard gates: Blocked retains the formal Test Point and recovery', async () => {
  const spec = await loadJourneySpec('all-blocked');
  const result = await evaluateJourney(spec.scenario, spec.interaction_policy);
  const bundle = result.bundle;
  assert.equal(bundle.blocked.length, 1, 'reversal drops a missing Blocked Test Point');
  assert.equal(bundle.coverage.formal.total, 1);
  assert.equal(bundle.coverage.formal.entries[0].status, 'blocked');
  assert.ok(bundle.blocked[0].obligation_id);
  assert.match(result.markdown, /Recovery/u);
});
