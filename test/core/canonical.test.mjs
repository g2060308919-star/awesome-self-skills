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

test('digest is a lowercase SHA-256 hexadecimal value', () => {
  assert.equal(digest({ a: 1 }), '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862');
});
