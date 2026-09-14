import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCaseDrafts } from '../../src/classify.mjs';
import { classificationContext, refreshExecutionSignature } from '../helpers/classification-context.mjs';

test('generality P14: legacy observer labels tolerate case, spacing and terminal punctuation', () => {
  const context = classificationContext();
  const draft = context.caseDrafts.cases[0];
  draft.testability_profile.observers[0].observer = `  ${draft.steps[0].expectations[0].observer.toUpperCase()}  `;
  draft.testability_profile.observers[0].observation_target = `${draft.steps[0].expectations[0].observation_target}.`;
  const result = classifyCaseDrafts(context);
  assert.equal(result.grounded.length, 1, JSON.stringify(result));
});

test('generality P15: a dangling observer is an adapter revision, not a business blocker', () => {
  const context = classificationContext();
  context.caseDrafts.cases[0].steps[0].expectations[0].observer = 'undeclared-observer';
  refreshExecutionSignature(context.caseDrafts.cases[0]);
  const result = classifyCaseDrafts(context);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'TESTABILITY_REFERENCE_MISMATCH'), JSON.stringify(result));
});

test('generality P14: stable observer references survive display-label changes', () => {
  const context = classificationContext();
  const draft = context.caseDrafts.cases[0];
  Object.assign(draft.testability_profile.observers[0], { observer_id: 'observer-checkout', target_id: 'target-result' });
  Object.assign(draft.steps[0].expectations[0], { observer_ref: 'observer-checkout', target_ref: 'target-result' });
  draft.testability_profile.observers[0].observer = '值班质量工程师';
  draft.testability_profile.observers[0].observation_target = '结算结果面板';
  const result = classifyCaseDrafts(context);
  assert.equal(result.grounded.length, 1, JSON.stringify(result));
});

test('generality P15: genuinely unavailable declared observers remain Blocked', () => {
  const context = classificationContext();
  context.caseDrafts.cases[0].testability_profile.observers[0].status = 'unavailable';
  const result = classifyCaseDrafts(context);
  assert.equal(result.grounded.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.diagnostics.length, 0);
});
