import assert from 'node:assert/strict';
import test from 'node:test';

import { issueSelectors, verifySelector } from '../../src/v5/action-tokens.mjs';

const checkpoint = {
  run_id: 'RUN-token', run_lifecycle: 'active', stage: 'requirements_analysis',
  obligation: 'review_semantic_seed', fsm_cell_id: 'cd.active.requirements.review',
  current_revision: 3, checkpoint_digest: `sha256:${'a'.repeat(64)}`,
  semantic_root_digest: `sha256:${'b'.repeat(64)}`
};
const capability = { kind: 'submit_artifact', artifact_kind: 'evidence_claims' };
const oldKey = { key_id: 'key-1', key: Buffer.alloc(32, 1) };
const newKey = { key_id: 'key-2', key: Buffer.alloc(32, 2) };

test('selectors bind checkpoint and capability while persisting no secret or token', () => {
  const issued = issueSelectors(checkpoint, [capability], { current: oldKey, retained: [] });
  assert.equal(issued.selectors.length, 1);
  assert.equal(verifySelector(checkpoint, capability, issued.selectors[0].action_token, { current: oldKey, retained: [] }), true);
  assert.equal(JSON.stringify(issued.sidecar).includes(oldKey.key.toString('hex')), false);
  assert.equal(JSON.stringify(issued.sidecar).includes(issued.selectors[0].action_token), false);
  assert.throws(() => verifySelector({ ...checkpoint, current_revision: 4 }, capability, issued.selectors[0].action_token, { current: oldKey, retained: [] }), /ACTION_NOT_ADVERTISED/u);
});

test('retained verification keys permit controlled rotation and unknown keys fail closed', () => {
  const token = issueSelectors(checkpoint, [capability], { current: oldKey, retained: [] }).selectors[0].action_token;
  assert.equal(verifySelector(checkpoint, capability, token, { current: newKey, retained: [oldKey] }), true);
  assert.throws(() => verifySelector(checkpoint, capability, token, { current: newKey, retained: [] }), /ACTION_NOT_ADVERTISED/u);
  assert.throws(() => issueSelectors(checkpoint, [capability], { current: { key_id: 'bad', key: Buffer.alloc(0) }, retained: [] }), /ACTION_TOKEN_KEY_UNAVAILABLE/u);
});
