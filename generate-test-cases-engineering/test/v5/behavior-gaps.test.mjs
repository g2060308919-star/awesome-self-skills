import assert from 'node:assert/strict';
import test from 'node:test';

import { compileBehaviorSemanticGaps, clarificationGapsFromAcceptedBehavior } from '../../src/v5/behavior-gaps.mjs';
import { deriveBehaviorContractSeed } from '../../src/v5/behavior-contracts.mjs';
import { createSemanticRuleIndex } from '../../src/v5/semantic-rules.mjs';

const root = `sha256:${'a'.repeat(64)}`;
const basis = [{ kind: 'claim', claim_id: 'claim-field' }];

function seed() {
  return deriveBehaviorContractSeed(root, {
    semanticRuleIndex: createSemanticRuleIndex(root, { registry_digest: `sha256:${'b'.repeat(64)}`, registered_rules: [], accepted_rule_contract_refs: [] }),
    riskModuleIds: ['orders'], requirements: [{ contract_kind: 'field_correspondence', subject_ref: 'orders', intent_ref: 'status-match', basis }]
  });
}

test('Behavior gap proposal compiles to stable bsg5 identity and an exact same-batch binding', () => {
  const worklist = seed();
  const requiredKey = worklist.required_contracts[0].required_contract_key;
  const proposal = {
    semantic_gap_client_key: 'gap-transform', target: { kind: 'behavior_contract', required_contract_key: requiredKey },
    missing_semantics: 'null_policy', question: 'Which null policy defines the status mapping?',
    answer_contract: { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: { kind: 'enum', allowed_values: ['null_is_missing', 'null_is_value', 'null_is_invalid', 'null_is_not_applicable'] } },
    basis
  };
  const reviews = [{ seed_digest: worklist.seed_digest, required_contract_key: requiredKey, disposition: { kind: 'semantic_gap', gap_ref: { kind: 'same_behavior_batch', semantic_gap_client_key: 'gap-transform' } } }];
  const compiled = compileBehaviorSemanticGaps(root, worklist, [proposal], reviews);
  assert.match(compiled.accepted_gaps[0].semantic_gap_id, /^bsg5_[0-9a-f]{64}$/u);
  assert.deepEqual(compiled.client_key_bindings, [{ client_key: 'gap-transform', stable_id: compiled.accepted_gaps[0].semantic_gap_id }]);
  assert.equal(clarificationGapsFromAcceptedBehavior(compiled.accepted_gaps)[0].gap_binding.gap_id, compiled.accepted_gaps[0].semantic_gap_id);
  assert.deepEqual(compileBehaviorSemanticGaps(root, worklist, [{ ...proposal, semantic_gap_client_key: 'renamed' }], [{ ...reviews[0], disposition: { kind: 'semantic_gap', gap_ref: { kind: 'same_behavior_batch', semantic_gap_client_key: 'renamed' } } }]).accepted_gaps[0], compiled.accepted_gaps[0]);
});

test('Behavior gap targets and missing-semantics kinds cannot be cross-wired', () => {
  const worklist = seed();
  const requiredKey = worklist.required_contracts[0].required_contract_key;
  const proposal = { semantic_gap_client_key: 'gap-domain', target: { kind: 'behavior_contract', required_contract_key: requiredKey }, missing_semantics: 'domain_boundary', question: 'What is the domain?', answer_contract: { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: { kind: 'text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' } }, basis };
  const reviews = [{ seed_digest: worklist.seed_digest, required_contract_key: requiredKey, disposition: { kind: 'semantic_gap', gap_ref: { kind: 'same_behavior_batch', semantic_gap_client_key: 'gap-domain' } } }];
  assert.throws(() => compileBehaviorSemanticGaps(root, worklist, [proposal], reviews), /SEMANTIC_REVIEW_CANDIDATE_UNKNOWN/u);
});
