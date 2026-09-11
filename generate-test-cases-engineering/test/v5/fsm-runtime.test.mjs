// @ts-nocheck
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceV5Run, createV5RunDirectory } from '../../src/entry.mjs';
import { minimalOriginFromRaw } from '../../src/v5/clarification-parser.mjs';
import { generateV5Contracts } from '../../src/v5/registry-generator.mjs';
import {
  actionTemplateForV5Action,
  selectV5Error,
  selectV5Outcome,
  validateV5FsmRegistry
} from '../../src/v5/fsm.mjs';

const contracts = generateV5Contracts();

process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY = Buffer.alloc(32, 29).toString('base64');
process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID = 'fsm-test';

test('all 51 FSM outcomes have one unique trigger and one generated reply contract', () => {
  assert.equal(validateV5FsmRegistry(contracts.fsmRegistry), true);
  assert.equal(contracts.fsmRegistry.outcomes.length, 51);
  assert.equal(contracts.replyContracts.rows.filter((row) => row.source.kind === 'fsm_outcome').length, 51);
  for (const expected of contracts.fsmRegistry.outcomes) {
    const actual = selectV5Outcome(contracts.fsmRegistry, expected.trigger);
    assert.deepEqual(actual, expected);
    const rows = contracts.replyContracts.rows.filter((row) => row.source.kind === 'fsm_outcome' && row.source.outcome_id === expected.outcome_id);
    assert.equal(rows.length, 1, expected.outcome_id);
    assert.equal(rows[0].exact_projection_kind, 'persisted_run_state');
    assert.deepEqual(rows[0].exact_commit, expected.commit_projection);
  }
});

test('action templates are resolved from the closed action union and current cell', () => {
  assert.equal(actionTemplateForV5Action(contracts.fsmRegistry, 'cd.active.requirements.review', { kind: 'submit_artifact', artifact_kind: 'evidence_claims' }).template_id, 'artifact.submit_evidence_claims');
  assert.equal(actionTemplateForV5Action(contracts.fsmRegistry, 'ep.active.closure.resolve', { kind: 'advance_execution_plan', operation: { kind: 'provide_capability_proof' } }).template_id, 'execution.advance_closure');
  assert.equal(actionTemplateForV5Action(contracts.fsmRegistry, 'ep.active.final.confirm', { kind: 'advance_execution_plan', operation: { kind: 'pause_execution' } }).template_id, 'execution.confirm_or_pause');
  assert.throws(() => actionTemplateForV5Action(contracts.fsmRegistry, 'cd.active.source.provide', { kind: 'submit_artifact', artifact_kind: 'case_drafts' }), /ACTION_NOT_ADVERTISED/u);
  assert.throws(() => actionTemplateForV5Action(contracts.fsmRegistry, 'ep.active.closure.resolve', { kind: 'advance_execution_plan', operation: { kind: 'deploy_cases' } }), /ACTION_NOT_ADVERTISED/u);
});

test('error selection follows generated validator phase then priority', () => {
  const selected = selectV5Error(contracts.policyRegistry, [
    { code: 'SCHEMA_VALIDATION_FAILED' },
    { code: 'ANSWER_BINDING_INVALID' },
    { code: 'ACTION_NOT_ADVERTISED' },
    { code: 'RUN_ARGUMENT_INVALID' }
  ]);
  assert.equal(selected.code, 'RUN_ARGUMENT_INVALID');
  assert.equal(selectV5Error(contracts.policyRegistry, [{ code: 'RISK_LEDGER_INVALID' }, { code: 'ORACLE_NOT_DECIDABLE' }]).code, 'ORACLE_NOT_DECIDABLE');
  assert.throws(() => selectV5Error(contracts.policyRegistry, [{ code: 'UNREGISTERED' }]), /POLICY_REGISTRY_INCONSISTENT/u);
});

test('runtime dispatches clarification preview and commit through registry outcomes', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-fsm-clarification-'));
  const created = await createV5RunDirectory(catalog, { idempotency_key: 'create', delivery_intent: 'case_document', source_bootstrap: { source_request_seeds: [{ source_request_client_key: 'prd', source_role: 'primary_prd', locator: { kind: 'inline_text', media_type: 'text/markdown', content: '保存订单，并显示成功提示。' }, required: true }] } });
  const sourceRequest = created.work_packet.source_requests[0];
  const sourceSelector = created.available_actions.find((selector) => selector.capability.kind === 'submit_source_batch');
  const review = await advanceV5Run(created.run_directory, { idempotency_key: 'source', action: { kind: 'submit_source_batch', action_token: sourceSelector.action_token, request_ids: [sourceRequest.request_id], request_dispositions: [{ request_id: sourceRequest.request_id, outcome: 'fulfilled', source_client_keys: ['prd'] }], source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'prd', media_type: 'text/markdown', content: '保存订单，并显示成功提示。' }] } } } });
  const seed = review.work_packet.semantic_review_seed;
  const candidate = seed.normative_units[0].outcome_candidates[0];
  const answerContract = { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: { kind: 'text', min_scalars: 1, max_scalars: 128, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' } };
  const gap = { semantic_gap_client_key: 'gap-outcome', target: { kind: 'expected_outcome', origin: { kind: 'outcome_decomposition', outcome_candidate_id: candidate.candidate_id } }, answer_contract: answerContract, question: '保存后显示什么？', why_needed: '用于形成唯一可判定的验收结果。', question_impact_summary: { affected_module_ids: ['orders'], affected_business_refs: ['save-order'], affected_claim_ids: [], current_test_point_ids: [], blocked_count: 1, conditional_count: 0, unresolved_outcome: '保持 Blocked' } };
  const evidenceSelector = review.available_actions.find((selector) => selector.capability.kind === 'submit_artifact');
  const clarification = await advanceV5Run(created.run_directory, { idempotency_key: 'evidence', action: { kind: 'submit_artifact', action_token: evidenceSelector.action_token, artifact_kind: 'evidence_claims', artifact: { semantic_review_seed_digest: seed.seed_digest, claims: [], semantic_gaps: [gap], decomposition_reviews: [{ seed_digest: seed.seed_digest, candidate_id: candidate.candidate_id, disposition: { kind: 'semantic_gap', semantic_gap_client_key: 'gap-outcome' } }], ambiguity_reviews: [], entity_resolutions: [] } } });
  assert.equal(clarification.reply_status, 'need_user_answers');
  const part = clarification.work_packet.presentation.parts[0];
  const raw = 'Q001：显示保存成功';
  const previewSelector = clarification.available_actions.find((selector) => selector.capability.kind === 'preview_clarification_response');
  const preview = await advanceV5Run(created.run_directory, { idempotency_key: 'preview', action: { kind: 'preview_clarification_response', action_token: previewSelector.action_token, presentation_id: clarification.work_packet.presentation.presentation_id, semantic_root_digest: clarification.work_packet.presentation.semantic_root_digest, preview_intent: 'apply_units', raw_response: raw, proposed_units: [{ unit_client_key: 'answer-one', origin: minimalOriginFromRaw(raw, { start_scalar: 0, end_scalar: [...raw].length }), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: clarification.work_packet.presentation.semantic_root_digest }, action: 'answer', answer: { value: { kind: 'text', value: '显示保存成功' }, source_text: '显示保存成功', nature: 'final' } }] } });
  assert.equal(preview.reply_status, 'clarification_confirmation_required');
  const commitSelector = preview.available_actions.find((selector) => selector.capability.kind === 'commit_clarification_response');
  const committed = await advanceV5Run(created.run_directory, { idempotency_key: 'commit', action: { kind: 'commit_clarification_response', action_token: commitSelector.action_token, presentation_id: preview.work_packet.presentation.presentation_id, semantic_root_digest: preview.work_packet.presentation.semantic_root_digest, preview_digest: preview.work_packet.clarification_preview.preview_digest, raw_confirmation: '确认提交', confirmation_range: { start_scalar: 0, end_scalar: 4 } } });
  assert.equal(committed.obligation, 'provide_behavior_views', JSON.stringify(committed));
  assert.equal(committed.current_revision, 3);
});

test('public runtime completes source, evidence, behavior, Case, and canonical delivery', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-fsm-delivery-'));
  const created = await createV5RunDirectory(catalog, { idempotency_key: 'create-delivery', delivery_intent: 'case_document', source_bootstrap: { source_request_seeds: [{ source_request_client_key: 'prd', source_role: 'primary_prd', locator: { kind: 'inline_text', media_type: 'text/markdown', content: '提交后必须保存订单，并显示成功提示。' }, required: true }] } });
  const sourceRequest = created.work_packet.source_requests[0];
  const sourceSelector = created.available_actions.find((selector) => selector.capability.kind === 'submit_source_batch');
  const review = await advanceV5Run(created.run_directory, { idempotency_key: 'source-delivery', action: { kind: 'submit_source_batch', action_token: sourceSelector.action_token, request_ids: [sourceRequest.request_id], request_dispositions: [{ request_id: sourceRequest.request_id, outcome: 'fulfilled', source_client_keys: ['prd'] }], source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'prd', media_type: 'text/markdown', content: '提交后必须保存订单，并显示成功提示。' }] } } } });
  const seed = review.work_packet.semantic_review_seed;
  const claims = [];
  const decompositionReviews = [];
  for (const candidate of seed.normative_units.flatMap((unit) => unit.outcome_candidates)) {
    const candidateClaims = candidate.required_observation_slot_digests.map((slot, index) => ({ claim_client_key: `claim-${claims.length + index}`, primary_outcome_signature: { ...candidate.atom_signature, primary_observation_slot_digest: slot }, observation_slot_digests: [slot] }));
    claims.push(...candidateClaims);
    decompositionReviews.push({ seed_digest: seed.seed_digest, candidate_id: candidate.candidate_id, disposition: candidateClaims.length === 1 ? { kind: 'single_claim', claim_client_key: candidateClaims[0].claim_client_key } : { kind: 'split_claims', claim_client_keys: candidateClaims.map((claim) => claim.claim_client_key) } });
  }
  const evidenceSelector = review.available_actions.find((selector) => selector.capability.kind === 'submit_artifact');
  const behavior = await advanceV5Run(created.run_directory, { idempotency_key: 'evidence-delivery', action: { kind: 'submit_artifact', action_token: evidenceSelector.action_token, artifact_kind: 'evidence_claims', artifact: { semantic_review_seed_digest: seed.seed_digest, claims, semantic_gaps: [], decomposition_reviews: decompositionReviews, ambiguity_reviews: seed.ambiguity_candidates.map((candidate) => ({ seed_digest: seed.seed_digest, candidate_id: candidate.candidate_id, disposition: { kind: 'resolved_by_claims', claim_client_keys: [claims[0].claim_client_key] } })), entity_resolutions: [] } } });
  assert.equal(behavior.obligation, 'provide_behavior_views');
  const behaviorSeed = behavior.work_packet.behavior_contract_worklist;
  const oracleContracts = behaviorSeed.required_contracts.map((row, index) => ({ oracle_contract_client_key: `oracle-contract-${index}`, requirement_key: row.required_contract_key }));
  const riskKinds = ['null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay', 'long_content', 'pagination', 'refresh', 'business_permission_boundary'];
  const riskReviews = behaviorSeed.risk_review_module_ids.flatMap((moduleRef) => riskKinds.map((riskKind) => ({ review_client_key: `risk-${moduleRef}-${riskKind}`, module_ref: moduleRef, risk_kind: riskKind, risk_signal_status: 'no_signal', review_basis: [{ kind: 'claim', claim_id: claims[0].claim_client_key }] })));
  const behaviorSelector = behavior.available_actions.find((selector) => selector.capability.kind === 'submit_artifact');
  const caseWork = await advanceV5Run(created.run_directory, { idempotency_key: 'behavior-delivery', action: { kind: 'submit_artifact', action_token: behaviorSelector.action_token, artifact_kind: 'behavior_views', artifact: { behavior_contract_seed_digest: behaviorSeed.seed_digest, contract_reviews: behaviorSeed.required_contracts.map((row, index) => ({ seed_digest: behaviorSeed.seed_digest, required_contract_key: row.required_contract_key, disposition: { kind: 'formal', contract_client_keys: [oracleContracts[index].oracle_contract_client_key] } })), oracle_semantic_contracts: oracleContracts, risk_reviews: riskReviews, formal_test_point_ids: ['tp-save'], semantic_gaps: [] } } });
  assert.equal(caseWork.obligation, 'provide_case_drafts');
  const root = behaviorSeed.semantic_root_digest;
  const claimId = claims[0].claim_client_key;
  const stepKey = 'step-save';
  const caseSelector = caseWork.available_actions.find((selector) => selector.capability.kind === 'submit_artifact');
  const finished = await advanceV5Run(created.run_directory, { idempotency_key: 'cases-delivery', action: { kind: 'submit_artifact', action_token: caseSelector.action_token, artifact_kind: 'case_drafts', artifact: {
    case_drafts: [{ case_client_key: 'case-save', title: '保存订单', module_id: 'orders', priority: 'P1', primary_test_point_id: 'tp-save', business_preconditions: ['已登录'], data_conditions: [], steps: [{ step_client_key: stepKey, action: '提交订单', semantic_action_ref: { action_id: 'save', semantic_root_digest: root }, claim_ids: [claimId] }], oracles: [{ oracle_client_key: 'oracle-save', oracle_semantic_contract_id: 'oracle-contract-0', observe_after_step_client_key: stepKey, observation_ref: { kind: 'response', logical_surface_ref: 'orders-api', subject_ref: 'order', field_path: '/status' }, assertion: { kind: 'exact_text', expected_text: 'saved' }, evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, claim_ids: [claimId] }], population_scope: { kind: 'current_response', collection_ref: { contract_id: 'orders', contract_kind: 'collection', semantic_root_digest: root } }, canonical_names: ['订单'], claim_ids: [claimId], semantic_gap_ids: [] }],
    claim_assessments: [{ claim_id: claimId, level: 'E2', support_review: 'supported' }], accepted_gap_ids: [], formal_test_point_ids: ['tp-save'], semantic_partitions: [], value_instances: [], permission_cells: [], risk_ledger: { reviewed_cell_count: riskReviews.length, items: [] }, semantic_audit: { value_states: [], field_correspondences: [], domains: [], populations: [] }
  } } });
  assert.equal(finished.reply_status, 'finished', JSON.stringify(finished));
  assert.equal(finished.work_packet.terminal_kind, 'case_document_finished');
  assert.equal((await readdir(path.join(created.run_directory, 'objects', 'rendered-outputs'))).length, 3);
});
