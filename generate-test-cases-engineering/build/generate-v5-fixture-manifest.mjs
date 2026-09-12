import { readFile, writeFile } from 'node:fs/promises';

import { canonicalV5Stringify } from '../src/v5/canonical-v5.mjs';
import { minimalOriginFromRaw } from '../src/v5/clarification-parser.mjs';
import { V5_REQUIRED_FIXTURE_LEAF_IDS } from '../test/v5/fixture-inventory.mjs';
import { generateV5Contracts } from '../src/v5/registry-generator.mjs';

const manifestPath = new URL('../tests/fixtures/v5/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const base = manifest.fixtures.filter((fixture) => /\.(positive\.baseline|negative\.rejection)$/u.test(fixture.fixture_id));
const baseById = new Map(base.map((fixture) => [fixture.fixture_id, fixture]));

function sourceLeafId(fixtureId) {
  const match = /^(F-C(?:0[1-9]|1[0-6])-[a-z0-9-]+)\.(positive|negative|blocked|protocol)\./u.exec(fixtureId);
  if (!match) throw new Error(`invalid required fixture ID: ${fixtureId}`);
  const negative = match[2] === 'negative' || match[2] === 'blocked';
  return `${match[1]}.${negative ? 'negative.rejection' : 'positive.baseline'}`;
}

const behaviorFailureKinds = new Map([
  ['C08', ['oracle', 'ORACLE_NOT_DECIDABLE']],
  ['C09', ['field', 'FIELD_CORRESPONDENCE_REQUIRED']],
  ['C10', ['value', 'VALUE_STATE_INVALID']],
  ['C11', ['domain', 'DOMAIN_CONTRACT_REQUIRED']],
  ['C12', ['population', 'POPULATION_CONTRACT_REQUIRED']],
  ['C13', ['permission', 'PERMISSION_MATRIX_INCOMPLETE']],
  ['C14', ['risk', 'RISK_LEDGER_INVALID']]
]);
const contracts = generateV5Contracts();
const requestRoot = new URL('../tests/fixtures/v5/requests/', import.meta.url);
const readRequest = async (name) => JSON.parse(await readFile(new URL(name, requestRoot), 'utf8'));
const previewTemplate = await readRequest('clarification-preview-final.json');
const commitTemplate = await readRequest('clarification-commit-valid.json');
const createC01Template = await readRequest('create-c01.json');
const sourceC01Template = await readRequest('source-c01.json');
const evidenceC01Template = await readRequest('evidence-c01-valid.json');
const behaviorValidTemplate = await readRequest('behavior-invalid-permission.json');
behaviorValidTemplate.action.artifact.permission_matrix_reviews = [];
delete behaviorValidTemplate.action.artifact.formal_test_point_ids;
const claimRef = (clientKey) => ({ '$fixture_client_key': clientKey });

const generatedRequests = new Map();
function registerRequest(name, request) {
  generatedRequests.set(name, request);
  return `requests/${name}`;
}
registerRequest('behavior-valid.json', behaviorValidTemplate);
for (const name of ['behavior-invalid-oracle.json', 'behavior-invalid-field.json', 'behavior-invalid-value.json', 'behavior-invalid-domain.json', 'behavior-invalid-population.json', 'behavior-invalid-permission.json', 'behavior-invalid-risk.json']) {
  const request = await readRequest(name);
  delete request.action.artifact.formal_test_point_ids;
  registerRequest(name, request);
}

const entityGapEvidence = await readRequest('evidence-c03-valid.json');
entityGapEvidence.idempotency_key = 'fixture-c03-evidence-gap';
entityGapEvidence.action.artifact.semantic_gaps = [{
  semantic_gap_client_key: 'gap-entity',
  target: { origin: { kind: 'entity_resolution', conflict_group_id: { '$fixture_binding': 'required' }, mention_candidate_ids: [{ '$fixture_binding': 'required' }, { '$fixture_binding': 'required' }] } },
  answer_contract: { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: { kind: 'text', min_scalars: 1, max_scalars: 128, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' } },
  question: '这些名称是否指向同一业务对象？', why_needed: '必须先闭合名称身份才能建立稳定引用。',
  question_impact_summary: { affected_case_keys: ['entity-order'], impact_kinds: ['identity'] }
}];
entityGapEvidence.action.artifact.entity_resolutions[0].resolution = { kind: 'unresolved', semantic_gap_client_key: 'gap-entity' };
registerRequest('evidence-c03-gap.json', entityGapEvidence);

function clarificationPreview(name, raw, mutate) {
  const request = structuredClone(previewTemplate);
  request.idempotency_key = `fixture-${name.replace(/\.json$/u, '')}`;
  request.action.raw_response = raw;
  request.action.proposed_units[0].origin = minimalOriginFromRaw(raw, { start_scalar: 0, end_scalar: [...raw].length });
  mutate?.(request.action.proposed_units[0], request.action, request);
  return registerRequest(name, request);
}

const REQUESTS = {
  bindingAmbiguous: clarificationPreview('clarification-binding-ambiguous.json', 'Q001 Q001 显示保存成功'),
  bindingInvalid: clarificationPreview('clarification-binding-invalid.json', 'Q001 显示保存成功', (unit) => { unit.target.display_token = 'Q999'; }),
  controlOrigin: clarificationPreview('clarification-control-origin-invalid.json', 'Q001 我想稍后回答', (unit) => { unit.action = 'defer'; delete unit.answer; }),
  clientKey: clarificationPreview('clarification-client-key-invalid.json', 'Q001 显示保存成功', (unit) => { unit.unit_client_key = 'bad key'; }),
  answerNature: clarificationPreview('clarification-answer-nature-invalid.json', 'Q001 显示保存成功', (unit) => { unit.answer.nature = 'provisional'; }),
  temporaryBasis: clarificationPreview('clarification-temporary-basis-missing.json', 'Q001 显示保存成功', (unit) => { unit.answer.nature = 'temporary'; }),
  partConflict: clarificationPreview('clarification-part-conflict.json', 'Q001 显示保存成功', (unit, action) => { action.proposed_units.push({ ...structuredClone(unit), unit_client_key: 'answer-conflict' }); }),
  defer: clarificationPreview('clarification-preview-defer.json', 'Q001 稍后回答', (unit) => { unit.unit_client_key = 'defer-one'; unit.action = 'defer'; delete unit.answer; }),
  unknown: clarificationPreview('clarification-preview-unknown.json', 'Q001 目前未知', (unit) => { unit.unit_client_key = 'unknown-one'; unit.action = 'unknown'; delete unit.answer; }),
  stale: clarificationPreview('clarification-preview-stale.json', 'Q001 显示保存成功', (unit, action) => { action.presentation_id = 'stale-presentation'; }),
  valid: 'requests/clarification-preview-final.json',
  commitValid: 'requests/clarification-commit-valid.json'
};
const invalidCommit = structuredClone(commitTemplate);
invalidCommit.idempotency_key = 'fixture-clarification-commit-invalid';
invalidCommit.action.raw_confirmation = '拒绝';
invalidCommit.action.confirmation_range = { start_scalar: 0, end_scalar: 2 };
REQUESTS.commitInvalid = registerRequest('clarification-commit-invalid.json', invalidCommit);

const schemaInvalidBehavior = { idempotency_key: 'fixture-behavior-schema-invalid', action: { kind: 'submit_artifact', action_token: { '$fixture_binding': 'required' }, artifact_kind: 'behavior_views' } };
registerRequest('behavior-schema-invalid.json', schemaInvalidBehavior);
const compilerOwnedBehavior = structuredClone(behaviorValidTemplate);
compilerOwnedBehavior.idempotency_key = 'fixture-behavior-compiler-owned';
compilerOwnedBehavior.action.artifact.schema_version = '5.0.0';
registerRequest('behavior-compiler-owned.json', compilerOwnedBehavior);
const actionNotAdvertised = { idempotency_key: 'fixture-action-not-advertised', action: { kind: 'submit_artifact', action_token: 'not-a-current-token', artifact_kind: 'case_drafts', artifact: {} } };
registerRequest('action-not-advertised.json', actionNotAdvertised);
const idempotencyConflict = { idempotency_key: sourceC01Template.idempotency_key, action: { kind: 'cancel_run', action_token: 'conflicting-action' } };
registerRequest('advance-idempotency-conflict.json', idempotencyConflict);
registerRequest('create-unsupported.json', { idempotency_key: 'fixture-create-unsupported', schema_version: '4.0.0', run_directory: '/legacy' });
registerRequest('create-execution-invalid-ref.json', { idempotency_key: 'fixture-execution-invalid-ref', delivery_intent: 'execution_plan', case_document_ref: { run_id: 'RUN-NOT-FOUND', revision: 1, manifest_digest: `sha256:${'1'.repeat(64)}`, bundle_digest: `sha256:${'2'.repeat(64)}`, case_document_lineage_id: 'LINEAGE-NOT-FOUND', schema_version: '5.0.0' } });
registerRequest('create-resume-invalid-parent.json', { idempotency_key: 'fixture-resume-invalid-parent', creation_reason: 'resume_cancelled', parent_run_id: 'RUN-NOT-FOUND' });

const complementBehavior = structuredClone(behaviorValidTemplate);
complementBehavior.idempotency_key = 'fixture-behavior-complement-overclaimed';
complementBehavior.action.artifact.domain_contracts = [{
  domain_client_key: 'status', subject_ref: 'orders', field_path: '/status',
  domain: { kind: 'closed_enum', members: [{ kind: 'string', value: 'open' }, { kind: 'string', value: 'closed' }], closed_world_basis: [{ kind: 'claim', claim_id: claimRef('claim-save') }] },
  partitions: [
    { partition_client_key: 'target', kind: 'exact_members', semantic_role: 'target', values: [{ kind: 'string', value: 'open' }] },
    { partition_client_key: 'complement', kind: 'complement', semantic_role: 'complement', universe: { kind: 'parent_domain' }, excluded_values: [{ kind: 'string', value: 'open' }, { kind: 'string', value: 'closed' }] }
  ]
}];
registerRequest('behavior-complement-overclaimed.json', complementBehavior);

const oracleRequiredBehavior = structuredClone(behaviorValidTemplate);
oracleRequiredBehavior.idempotency_key = 'fixture-behavior-oracle-required';
oracleRequiredBehavior.action.artifact.oracle_semantic_contracts[0].observation_ref.subject_ref = '';
registerRequest('behavior-oracle-required.json', oracleRequiredBehavior);

for (const [name, graph] of Object.entries({
  'behavior-provenance-valid.json': { nodes: [{ node_id: 'source', kind: 'source_unit', run_id: 'run', case_document_lineage_id: 'lineage', semantic_root_digest: 'root', accepted: true }, { node_id: 'claim', kind: 'claim', run_id: 'run', case_document_lineage_id: 'lineage', semantic_root_digest: 'root', accepted: true }], edges: [{ from: 'source', to: 'claim' }] },
  'behavior-provenance-edge.json': { nodes: [{ node_id: 'source', kind: 'source_unit' }, { node_id: 'case', kind: 'case' }], edges: [{ from: 'source', to: 'case' }] },
  'behavior-provenance-downstream-source.json': { nodes: [{ node_id: 'case', kind: 'case' }, { node_id: 'source', kind: 'source_unit' }], edges: [{ from: 'case', to: 'source' }] },
  'behavior-provenance-cycle.json': { nodes: [{ node_id: 'a', kind: 'claim', run_id: 'run', case_document_lineage_id: 'lineage', semantic_root_digest: 'root', accepted: true, evidence_level: 'E2' }, { node_id: 'b', kind: 'claim', run_id: 'run', case_document_lineage_id: 'lineage', semantic_root_digest: 'root', accepted: true, evidence_level: 'E2' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }
})) {
  const request = structuredClone(behaviorValidTemplate);
  request.idempotency_key = `fixture-${name.replace(/\.json$/u, '')}`;
  if (name !== 'behavior-provenance-valid.json') request.action.artifact.provenance_graph = graph;
  registerRequest(name, request);
}

const permissionContent = '管理员权限：提交后必须保存订单，并显示成功提示。';
const permissionCreate = structuredClone(createC01Template);
permissionCreate.idempotency_key = 'fixture-permission-create';
permissionCreate.source_bootstrap.source_request_seeds[0].locator.content = permissionContent;
registerRequest('create-permission.json', permissionCreate);
const permissionSource = structuredClone(sourceC01Template);
permissionSource.idempotency_key = 'fixture-permission-source';
permissionSource.action.source_payload.source_pack.sources[0].content = permissionContent;
registerRequest('source-permission.json', permissionSource);
const permissionEvidence = structuredClone(evidenceC01Template);
permissionEvidence.idempotency_key = 'fixture-permission-evidence';
permissionEvidence.action.artifact.claims[0].primary_outcome_signature = Object.fromEntries(['subject_slot_digest', 'condition_slot_digest', 'action_slot_digest', 'primary_observation_slot_digest', 'branch_slot_digest'].map((key) => [key, { '$fixture_binding': 'required' }]));
registerRequest('evidence-permission.json', permissionEvidence);
const permissionOutcome = structuredClone(behaviorValidTemplate);
permissionOutcome.idempotency_key = 'fixture-permission-outcome-invalid';
permissionOutcome.action.artifact.permission_matrix_reviews = [{ matrix_id: { '$fixture_binding': 'required' }, seed_digest: { '$fixture_binding': 'required' }, cell_dispositions: [{ required_cell_key: { '$fixture_binding': 'required' }, disposition: { kind: 'formal', outcome: {}, basis: [] } }] }];
permissionOutcome.action.artifact.permission_matrix_reviews[0].cell_dispositions[0].disposition = { kind: 'semantic_gap', gap_ref: { kind: 'same_behavior_batch', semantic_gap_client_key: 'gap-permission-outcome' } };
permissionOutcome.action.artifact.semantic_gap_proposals = [{
  semantic_gap_client_key: 'gap-permission-outcome',
  target: { kind: 'permission_cell', matrix_id: { '$fixture_binding': 'required' }, required_cell_key: { '$fixture_binding': 'required' } },
  missing_semantics: 'permission_outcome', question: '该权限单元格的明确业务预期是什么？',
  answer_contract: { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: { kind: 'enum', allowed_values: ['allow', 'deny'] } },
  basis: [{ kind: 'claim', claim_id: claimRef('claim-save') }]
}];
registerRequest('behavior-permission-outcome-invalid.json', permissionOutcome);
const permissionValid = structuredClone(behaviorValidTemplate);
permissionValid.idempotency_key = 'fixture-permission-behavior-valid';
permissionValid.action.artifact.permission_matrix_reviews = [{
  matrix_id: { '$fixture_binding': 'required' }, seed_digest: { '$fixture_binding': 'required' },
  cell_dispositions: [{
    required_cell_key: { '$fixture_binding': 'required' },
    disposition: { kind: 'formal', outcome: { permission_dimension: 'decision', action_ref: 'mutate', expected: 'allow' }, basis: [{ kind: 'claim', claim_id: claimRef('claim-save') }] }
  }]
}];
registerRequest('behavior-permission-valid.json', permissionValid);

const caseValid = {
  idempotency_key: 'fixture-case-valid',
  action: { kind: 'submit_artifact', action_token: { '$fixture_binding': 'required' }, artifact_kind: 'case_drafts', artifact: {
    case_drafts: [
      { case_client_key: 'case-save', title: '保存订单', module_id: 'orders', priority: 'P1', primary_test_point_id: 'tp-0', business_preconditions: ['已登录'], data_conditions: [], steps: [{ step_client_key: 'step-save', action: '提交订单', semantic_action_ref: { action_id: 'save', semantic_root_digest: { '$fixture_binding': 'required' } }, claim_ids: [claimRef('claim-save')] }], case_step_semantic_bindings: [{ case_client_key: 'case-save', step_client_key: 'step-save', action_ref: { action_id: 'save', semantic_root_digest: { '$fixture_binding': 'required' } } }], domain_selections: [], oracles: [{ oracle_client_key: 'oracle-save', oracle_semantic_contract_id: { '$fixture_binding': 'required' }, observe_after_step_client_key: 'step-save', observation_ref: { kind: 'response', logical_surface_ref: 'orders-api', subject_ref: claimRef('claim-save'), field_path: '/status' }, assertion: { kind: 'exact_text', expected_text: 'saved' }, evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, claim_ids: [claimRef('claim-save')] }], canonical_names: ['订单'], claim_ids: [claimRef('claim-save')], semantic_gap_ids: [] },
      { case_client_key: 'case-message', title: '显示成功提示', module_id: 'orders', priority: 'P1', primary_test_point_id: 'tp-1', business_preconditions: ['已登录'], data_conditions: [], steps: [{ step_client_key: 'step-message', action: '提交订单', semantic_action_ref: { action_id: 'save', semantic_root_digest: { '$fixture_binding': 'required' } }, claim_ids: [claimRef('claim-message')] }], case_step_semantic_bindings: [{ case_client_key: 'case-message', step_client_key: 'step-message', action_ref: { action_id: 'save', semantic_root_digest: { '$fixture_binding': 'required' } } }], domain_selections: [], oracles: [{ oracle_client_key: 'oracle-message', oracle_semantic_contract_id: { '$fixture_binding': 'required' }, observe_after_step_client_key: 'step-message', observation_ref: { kind: 'response', logical_surface_ref: 'orders-api', subject_ref: claimRef('claim-message'), field_path: '/status' }, assertion: { kind: 'exact_text', expected_text: 'success' }, evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, claim_ids: [claimRef('claim-message')] }], canonical_names: ['提示'], claim_ids: [claimRef('claim-message')], semantic_gap_ids: [] }
    ]
  } }
};
registerRequest('case-valid.json', caseValid);
const caseOracleRequired = structuredClone(caseValid);
caseOracleRequired.idempotency_key = 'fixture-case-oracle-required';
caseOracleRequired.action.artifact.case_drafts[0].oracles[0].observation_ref.subject_ref = '';
registerRequest('case-oracle-required.json', caseOracleRequired);

const behaviorFailureSources = new Map();
for (const [kind, content] of Object.entries({
  field: '字段映射要求：提交后必须保存订单，并显示成功提示。',
  domain: '状态域要求：提交后必须保存订单，并显示成功提示。',
  population: '人口范围要求：提交后必须保存订单，并显示成功提示。'
})) {
  const createRequest = structuredClone(createC01Template);
  createRequest.idempotency_key = `fixture-${kind}-gap-create`;
  createRequest.source_bootstrap.source_request_seeds[0].locator.content = content;
  const sourceRequest = structuredClone(sourceC01Template);
  sourceRequest.idempotency_key = `fixture-${kind}-gap-source`;
  sourceRequest.action.source_payload.source_pack.sources[0].content = content;
  const createName = `create-${kind}-gap.json`;
  const sourceName = `source-${kind}-gap.json`;
  registerRequest(createName, createRequest);
  registerRequest(sourceName, sourceRequest);
  behaviorFailureSources.set(kind, { create: `requests/${createName}`, source: `requests/${sourceName}` });
}

const behaviorGapBlueprints = Object.freeze({
  field: {
    gapIndex: 2, missingSemantics: 'null_policy', question: '空值在字段对应中应视为缺失、业务值、非法值还是不适用？',
    oracleByIndex: { 0: 'oracle-contract-0', 1: 'oracle-contract-1' },
    valueSchema: { kind: 'enum', allowed_values: ['null_is_missing', 'null_is_value', 'null_is_invalid', 'null_is_not_applicable'] }
  },
  domain: {
    gapIndex: 0, missingSemantics: 'domain_boundary', question: '请明确该状态域的完整 universe 与可执行分区边界。',
    oracleByIndex: { 1: 'oracle-contract-0', 2: 'oracle-contract-1' },
    valueSchema: { kind: 'text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }
  },
  population: {
    gapIndex: 1, missingSemantics: 'population_scope', question: '该要求应量化哪一个精确人口范围？',
    oracleByIndex: { 0: 'oracle-contract-0', 2: 'oracle-contract-1' },
    valueSchema: {
      kind: 'population_scope', existing_candidates: [], allow_typed_creation: true,
      creation_constraints: { allowed_scope_kinds: ['single_item', 'visible_region', 'current_page', 'current_response', 'all_pages', 'full_dataset'], semantic_root_digest: { '$fixture_binding': 'required' } }
    }
  }
});

for (const [kind, blueprint] of Object.entries(behaviorGapBlueprints)) {
  const request = structuredClone(behaviorValidTemplate);
  request.idempotency_key = `fixture-behavior-${kind}-gap`;
  request.action.artifact.behavior_contract_reviews = Array.from({ length: 3 }, (_, index) => ({
    seed_digest: { '$fixture_binding': 'required' }, required_contract_key: { '$fixture_binding': 'required' },
    disposition: index === blueprint.gapIndex
      ? { kind: 'semantic_gap', gap_ref: { kind: 'same_behavior_batch', semantic_gap_client_key: `gap-${kind}` } }
      : { kind: 'formal', contract_client_keys: [blueprint.oracleByIndex[index]] }
  }));
  request.action.artifact.semantic_gap_proposals = [{
    semantic_gap_client_key: `gap-${kind}`,
    target: { kind: 'behavior_contract', required_contract_key: { '$fixture_binding': 'required' } },
    missing_semantics: blueprint.missingSemantics, question: blueprint.question,
    answer_contract: { answer_mode: 'typed_answer', allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'], value_schema: blueprint.valueSchema },
    basis: [{ kind: 'claim', claim_id: claimRef('claim-save') }]
  }];
  registerRequest(`behavior-invalid-${kind}.json`, request);
}

await Promise.all([...generatedRequests].map(([name, request]) => writeFile(new URL(name, requestRoot), `${JSON.stringify(request, null, 2)}\n`)));

function specializeBehaviorFailure(clone, fixtureId, requirement) {
  if (!/\.(negative|blocked)\./u.test(fixtureId)) return clone;
  const failure = behaviorFailureKinds.get(requirement);
  if (!failure) return clone;
  const [kind, errorCode] = failure;
  const source = structuredClone(baseById.get('F-C01-atomicity.positive.baseline'));
  const signalSource = behaviorFailureSources.get(kind);
  if (signalSource) {
    source.action_sequence[0].request_file = signalSource.create;
    source.action_sequence[1].request_file = signalSource.source;
    if (kind === 'field' || kind === 'population') {
      const evidenceBindings = source.action_sequence[2].request_bindings;
      evidenceBindings.find((binding) => binding.target_json_pointer === '/action/artifact/claims/0/observation_slot_digests/0').value_from.source_json_pointer = '/work_packet/semantic_review_seed/normative_units/0/outcome_candidates/0/atom_signature/primary_observation_slot_digest';
      evidenceBindings.find((binding) => binding.target_json_pointer === '/action/artifact/claims/1/primary_outcome_signature/primary_observation_slot_digest').value_from.source_json_pointer = '/work_packet/semantic_review_seed/normative_units/0/outcome_candidates/0/required_observation_slot_digests/0';
      evidenceBindings.find((binding) => binding.target_json_pointer === '/action/artifact/claims/1/observation_slot_digests/0').value_from.source_json_pointer = '/work_packet/semantic_review_seed/normative_units/0/outcome_candidates/0/required_observation_slot_digests/0';
    }
  }
  const requestFile = `requests/behavior-invalid-${kind}.json`;
  source.fixture_id = fixtureId;
  source.requirement_ids = [requirement];
  source.input_files.push(requestFile);
  source.action_sequence.push({
    step_id: 'behavior-invalid', api: 'advanceV5Run',
    run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' },
    request_file: requestFile,
    client_key_bindings_from: { source_step_id: 'evidence', source_json_pointer: '/commit_receipt/client_key_bindings' },
    request_bindings: [
      { target_json_pointer: '/action/action_token', value_from: { source_step_id: 'evidence', source_json_pointer: '/available_actions/0/action_token' } },
      { target_json_pointer: '/action/artifact/behavior_contract_seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/0/required_contract_key' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/1/required_contract_key' } },
      ...(behaviorFailureSources.has(kind) ? [
        { target_json_pointer: '/action/artifact/behavior_contract_reviews/2/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
        { target_json_pointer: '/action/artifact/behavior_contract_reviews/2/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/2/required_contract_key' } },
        { target_json_pointer: '/action/artifact/semantic_gap_proposals/0/target/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: `/work_packet/behavior_contract_worklist/required_contracts/${behaviorGapBlueprints[kind].gapIndex}/required_contract_key` } },
        ...(kind === 'population' ? [{ target_json_pointer: '/action/artifact/semantic_gap_proposals/0/answer_contract/value_schema/creation_constraints/semantic_root_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/semantic_root_digest' } }] : [])
      ] : [])
    ]
  });
  const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === errorCode && candidate.source.response_context === 'run_mutation' && candidate.source.trigger_state?.fsm_cell_id === 'cd.active.case.behavior' && candidate.exact_projection_kind === 'persisted_run_state');
  if (!row) throw new Error(`missing behavior failure reply row for ${errorCode}`);
  source.expected_steps.push({ kind: 'api_reply', reply: {
    reply_kind: 'run_reply', projection_kind: 'persisted_run_state', reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, error_code: errorCode, stage: row.exact_stage, obligation: row.exact_obligation,
    lifecycle: 'active', semantic_revision_delta: row.exact_commit.kind === 'artifact_commit' ? row.exact_commit.semantic_revision_delta : 0, required_json_pointers: ['/diagnostics/0/code'], forbidden_json_pointers: ['/compiler_version']
  } });
  return synchronizeInputFiles(source);
}

const processExpectation = (api, extra = {}) => ({ kind: 'process_control', api, ...extra });

function withoutStepId(step) {
  const { step_id: ignored, ...nested } = structuredClone(step);
  return nested;
}

function registryErrorReply(errorCode, context, triggerState, overrides = {}) {
  const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === errorCode && candidate.source.response_context === context && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(triggerState) && candidate.exact_projection_kind === (overrides.projection_kind ?? candidate.exact_projection_kind));
  if (!row) throw new Error(`missing fixture reply contract for ${errorCode}/${context}/${canonicalV5Stringify(triggerState)}`);
  if (row.exact_projection_kind === 'read_only_integrity_fatal') return { kind: 'api_reply', reply: {
    reply_kind: 'run_reply', projection_kind: row.exact_projection_kind, reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, error_code: errorCode, lifecycle: 'fatal', last_verified_state_kind: overrides.last_verified_state_kind ?? 'checkpoint',
    semantic_revision_delta: 0, required_json_pointers: ['/diagnostics/0/code'], forbidden_json_pointers: ['/compiler_version']
  } };
  return { kind: 'api_reply', reply: {
    reply_kind: 'run_reply', projection_kind: row.exact_projection_kind, reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, error_code: errorCode, stage: row.exact_stage, obligation: row.exact_obligation,
    lifecycle: row.exact_lifecycle, semantic_revision_delta: row.exact_commit.semantic_revision_delta ?? 0,
    required_json_pointers: ['/diagnostics/0/code'], forbidden_json_pointers: ['/compiler_version']
  } };
}

function c01Prefix() {
  const source = structuredClone(baseById.get('F-C01-atomicity.positive.baseline'));
  return {
    input_files: source.input_files,
    create: source.action_sequence[0], source: source.action_sequence[1], evidence: source.action_sequence[2],
    createExpected: source.expected_steps[0], sourceExpected: source.expected_steps[1]
  };
}

function clarificationPrefix() {
  const source = structuredClone(baseById.get('F-C02-ambiguity.positive.baseline'));
  return {
    input_files: source.input_files.slice(0, 3),
    actions: source.action_sequence.slice(0, 3),
    expected: source.expected_steps.slice(0, 3)
  };
}

function permissionPrefix() {
  const prefix = c01Prefix();
  const actions = [prefix.create, prefix.source, prefix.evidence].map((step) => structuredClone(step));
  actions[0].request_file = 'requests/create-permission.json';
  actions[1].request_file = 'requests/source-permission.json';
  actions[2].request_file = 'requests/evidence-permission.json';
  const parentIndex = actions[2].request_bindings.findIndex((binding) => binding.target_json_pointer === '/action/artifact/claims/0/primary_outcome_signature');
  actions[2].request_bindings.splice(parentIndex, 1, ...['subject_slot_digest', 'condition_slot_digest', 'action_slot_digest', 'branch_slot_digest'].map((field) => ({ target_json_pointer: `/action/artifact/claims/0/primary_outcome_signature/${field}`, value_from: { source_step_id: 'source', source_json_pointer: `/work_packet/semantic_review_seed/normative_units/0/outcome_candidates/0/atom_signature/${field}` } })), { target_json_pointer: '/action/artifact/claims/0/primary_outcome_signature/primary_observation_slot_digest', value_from: { source_step_id: 'source', source_json_pointer: '/work_packet/semantic_review_seed/normative_units/0/outcome_candidates/0/required_observation_slot_digests/0' } });
  return { actions, expected: [prefix.createExpected, prefix.sourceExpected, structuredClone(baseById.get('F-C01-atomicity.positive.baseline').expected_steps[2])] };
}

function synchronizeInputFiles(fixture) {
  fixture.input_files = [...new Set(fixture.action_sequence.flatMap((step) => step.api === 'inject_crash' ? [step.during.request_file].filter(Boolean) : [step.request_file].filter(Boolean)))];
  return fixture;
}

function previewStep(requestFile, stepId, sourceStepId = 'evidence', options = {}) {
  const source = structuredClone(baseById.get('F-C02-ambiguity.positive.baseline').action_sequence[3]);
  source.step_id = stepId;
  source.request_file = requestFile;
  source.request_bindings.forEach((binding) => { binding.value_from.source_step_id = sourceStepId; });
  if (options.actionIndex !== undefined) source.request_bindings.find((binding) => binding.target_json_pointer === '/action/action_token').value_from.source_json_pointer = `/available_actions/${options.actionIndex}/action_token`;
  if (options.fixedPresentation) source.request_bindings = source.request_bindings.filter((binding) => binding.target_json_pointer !== '/action/presentation_id');
  if (options.fixedDisplayToken) source.request_bindings = source.request_bindings.filter((binding) => binding.target_json_pointer !== '/action/proposed_units/0/target/display_token');
  if (options.secondUnit) {
    for (const binding of source.request_bindings.filter((candidate) => candidate.target_json_pointer.startsWith('/action/proposed_units/0/target/'))) {
      source.request_bindings.push({ ...structuredClone(binding), target_json_pointer: binding.target_json_pointer.replace('/0/', '/1/') });
    }
  }
  return source;
}

function commitStep(requestFile, stepId, sourceStepId) {
  const source = structuredClone(baseById.get('F-C02-ambiguity.positive.baseline').action_sequence[4]);
  source.step_id = stepId;
  source.request_file = requestFile;
  source.request_bindings.forEach((binding) => { binding.value_from.source_step_id = sourceStepId; });
  return source;
}

function behaviorStep(requestFile, stepId, evidenceStepId = 'evidence', extraBindings = []) {
  return {
    step_id: stepId, api: 'advanceV5Run',
    run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' },
    request_file: requestFile,
    client_key_bindings_from: { source_step_id: 'evidence', source_json_pointer: '/commit_receipt/client_key_bindings' },
    request_bindings: [
      { target_json_pointer: '/action/action_token', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/available_actions/0/action_token' } },
      { target_json_pointer: '/action/artifact/behavior_contract_seed_digest', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/seed_digest', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/required_contract_key', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/0/required_contract_key' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/seed_digest', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/required_contract_key', value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/1/required_contract_key' } },
      ...extraBindings
    ]
  };
}

function caseOracleContractBindings(behaviorStepId = 'behavior-valid') {
  return [0, 1].map((index) => ({
    target_json_pointer: `/action/artifact/case_drafts/${index}/oracles/0/oracle_semantic_contract_id`,
    value_from: { source_step_id: behaviorStepId, source_json_pointer: `/commit_receipt/client_key_bindings/${index}/stable_id` }
  }));
}

function caseSemanticRootBindings(evidenceStepId = 'evidence') {
  return [0, 1].flatMap((index) => [
    `/action/artifact/case_drafts/${index}/steps/0/semantic_action_ref/semantic_root_digest`,
    `/action/artifact/case_drafts/${index}/case_step_semantic_bindings/0/action_ref/semantic_root_digest`
  ].map((targetJsonPointer) => ({
    target_json_pointer: targetJsonPointer,
    value_from: { source_step_id: evidenceStepId, source_json_pointer: '/work_packet/behavior_contract_worklist/semantic_root_digest' }
  })));
}

function fsmReply(outcomeId, semanticRevisionDelta, requiredJsonPointers = []) {
  const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'fsm_outcome' && candidate.source.outcome_id === outcomeId);
  if (!row) throw new Error(`missing FSM fixture reply row ${outcomeId}`);
  return { kind: 'api_reply', reply: {
    reply_kind: 'run_reply', projection_kind: row.exact_projection_kind, reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, stage: row.exact_stage, obligation: row.exact_obligation, lifecycle: row.exact_lifecycle,
    semantic_revision_delta: semanticRevisionDelta, required_json_pointers: requiredJsonPointers, forbidden_json_pointers: ['/compiler_version']
  } };
}

function preRunErrorReply(errorCode) {
  const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === errorCode && candidate.source.response_context === 'pre_run');
  if (!row) throw new Error(`missing pre-run fixture reply row ${errorCode}`);
  return { kind: 'api_reply', reply: { reply_kind: 'pre_run_error', reply_contract_id: row.reply_contract_id, reply_status: row.exact_reply_status, error_code: errorCode, semantic_revision_delta: 0, required_json_pointers: ['/diagnostics/0/code'], forbidden_json_pointers: ['/compiler_version'] } };
}

function specializeClarificationFixture(clone, fixtureId, requirement) {
  if (!['C04', 'C05', 'C06', 'C07'].includes(requirement)) return clone;
  if (!/\.(negative|blocked)\./u.test(fixtureId)) {
    const positive = structuredClone(baseById.get('F-C02-ambiguity.positive.baseline'));
    positive.fixture_id = fixtureId; positive.requirement_ids = [requirement];
    return synchronizeInputFiles(positive);
  }
  const prefix = clarificationPrefix();
  clone.action_sequence = [...prefix.actions]; clone.expected_steps = [...prefix.expected];
  const error = (code) => registryErrorReply(code, 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.resolve' });
  if (requirement === 'C04') {
    const rows = [
      ['binding-ambiguous', REQUESTS.bindingAmbiguous, 'ANSWER_BINDING_AMBIGUOUS', {}],
      ['binding-invalid', REQUESTS.bindingInvalid, 'ANSWER_BINDING_INVALID', { fixedDisplayToken: true }],
      ['control-origin', REQUESTS.controlOrigin, 'CONTROL_ORIGIN_REQUIRED', {}],
      ['client-key', REQUESTS.clientKey, 'CLIENT_KEY_INVALID', {}]
    ];
    for (const [id, file, code, options] of rows) { clone.action_sequence.push(previewStep(file, id, 'evidence', options)); clone.expected_steps.push(error(code)); }
  } else if (requirement === 'C05') {
    for (const [id, file, code] of [['answer-nature', REQUESTS.answerNature, 'ANSWER_NATURE_INVALID'], ['temporary-basis', REQUESTS.temporaryBasis, 'TEMPORARY_BASIS_REQUIRED']]) {
      clone.action_sequence.push(previewStep(file, id)); clone.expected_steps.push(error(code));
    }
  } else if (requirement === 'C06') {
    clone.action_sequence.push(previewStep(REQUESTS.partConflict, 'part-conflict', 'evidence', { secondUnit: true }));
    clone.expected_steps.push(error('QUESTION_PART_ACTION_CONFLICT'));
    clone.action_sequence.push(previewStep(REQUESTS.defer, 'defer-preview'));
    clone.expected_steps.push(registryErrorReply('CLARIFICATION_CONFIRMATION_REQUIRED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.resolve' }));
    clone.action_sequence.push(commitStep(REQUESTS.commitValid, 'defer-commit', 'defer-preview'));
    clone.expected_steps.push(fsmReply('OUT5.cd.requirements.confirm.commit.resolve', 1, ['/work_packet/presentation/parts/0/question_state']));
    clone.action_sequence.push(previewStep(REQUESTS.unknown, 'transition-invalid', 'defer-commit', { actionIndex: 1 }));
    clone.expected_steps.push(error('QUESTION_PART_TRANSITION_INVALID'));
  } else {
    clone.action_sequence.push(previewStep(REQUESTS.stale, 'stale-preview', 'evidence', { fixedPresentation: true }));
    clone.expected_steps.push(error('CLARIFICATION_PREVIEW_STALE'));
    clone.action_sequence.push(previewStep(REQUESTS.valid, 'valid-preview'));
    clone.expected_steps.push(registryErrorReply('CLARIFICATION_CONFIRMATION_REQUIRED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.resolve' }));
    clone.action_sequence.push(commitStep(REQUESTS.commitInvalid, 'confirmation-invalid', 'valid-preview'));
    clone.expected_steps.push(registryErrorReply('CLARIFICATION_CONFIRMATION_INVALID', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.confirm' }));
    clone.action_sequence.push(commitStep(REQUESTS.commitValid, 'valid-commit', 'valid-preview'));
    clone.expected_steps.push(fsmReply('OUT5.cd.requirements.confirm.commit.behavior', 1, ['/work_packet/behavior_contract_worklist/seed_digest']));
    clone.action_sequence.push({ step_id: 'tamper-impact', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'valid-commit', source_json_pointer: '/run_directory' }, target: { kind: 'compiler_projection', projection_kind: 'applied_clarification_impact' }, mutation: 'flip_first_byte' });
    clone.expected_steps.push(processExpectation('tamper_run_storage', { target: { kind: 'compiler_projection', projection_kind: 'applied_clarification_impact' }, result: 'tampered' }));
    clone.action_sequence.push({ step_id: 'inspect-impact', api: 'inspectV5Run', run_directory_from: { source_step_id: 'valid-commit', source_json_pointer: '/run_directory' } });
    clone.expected_steps.push(registryErrorReply('CLARIFICATION_IMPACT_MISMATCH', 'run_inspect', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' }, { projection_kind: 'read_only_integrity_fatal' }));
  }
  return synchronizeInputFiles(clone);
}

function specializeBehaviorFixtures(clone, fixtureId, requirement) {
  if (requirement === 'C08' && /\.(negative|blocked)\./u.test(fixtureId)) {
    const prefix = c01Prefix();
    clone.action_sequence = [prefix.create, prefix.source, prefix.evidence,
      behaviorStep('requests/behavior-valid.json', 'behavior-valid'),
      { step_id: 'oracle-required', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/case-oracle-required.json', client_key_bindings_from: { source_step_id: 'evidence', source_json_pointer: '/commit_receipt/client_key_bindings' }, request_bindings: [
        { target_json_pointer: '/action/action_token', value_from: { source_step_id: 'behavior-valid', source_json_pointer: '/available_actions/0/action_token' } },
        ...caseOracleContractBindings(),
        ...caseSemanticRootBindings()
      ] },
      behaviorStep('requests/behavior-invalid-oracle.json', 'oracle-undecidable', 'oracle-required')];
    clone.expected_steps = [prefix.createExpected, prefix.sourceExpected, structuredClone(baseById.get('F-C01-atomicity.positive.baseline').expected_steps[2]),
      fsmReply('OUT5.cd.case.behavior.ready', 1, ['/work_packet/context/behavior/artifact_digest']),
      registryErrorReply('ORACLE_SEMANTICS_REQUIRED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.drafts' }),
      registryErrorReply('ORACLE_NOT_DECIDABLE', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' })];
    return synchronizeInputFiles(clone);
  }
  if (requirement === 'C11' && fixtureId.includes('.negative.') && fixtureId !== 'F-C11-complement.negative.rejection') {
    const prefix = c01Prefix();
    clone.action_sequence = [prefix.create, prefix.source, prefix.evidence, behaviorStep('requests/behavior-complement-overclaimed.json', 'complement-overclaimed')];
    clone.expected_steps = [prefix.createExpected, prefix.sourceExpected, structuredClone(baseById.get('F-C01-atomicity.positive.baseline').expected_steps[2]), registryErrorReply('COMPLEMENT_COVERAGE_OVERCLAIMED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' })];
    return synchronizeInputFiles(clone);
  }
  if (requirement === 'C13') {
    const prefix = permissionPrefix();
    clone.action_sequence = [...prefix.actions]; clone.expected_steps = [...prefix.expected];
    if (/\.(negative|blocked)\./u.test(fixtureId)) {
      clone.action_sequence.push(behaviorStep('requests/behavior-invalid-permission.json', 'permission-matrix'));
      clone.expected_steps.push(registryErrorReply('PERMISSION_MATRIX_INCOMPLETE', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' }));
      clone.action_sequence.push(behaviorStep('requests/behavior-permission-outcome-invalid.json', 'permission-outcome', 'evidence', [
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/matrix_id', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/matrix_id' } },
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/seed_digest' } },
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/cell_dispositions/0/required_cell_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/required_cells/0/required_cell_key' } },
        { target_json_pointer: '/action/artifact/semantic_gap_proposals/0/target/matrix_id', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/matrix_id' } },
        { target_json_pointer: '/action/artifact/semantic_gap_proposals/0/target/required_cell_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/required_cells/0/required_cell_key' } }
      ]));
      clone.expected_steps.push(registryErrorReply('PERMISSION_OUTCOME_UNRESOLVED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' }));
    } else {
      const permissionBindings = [
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/matrix_id', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/matrix_id' } },
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/seed_digest' } },
        { target_json_pointer: '/action/artifact/permission_matrix_reviews/0/cell_dispositions/0/required_cell_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/permission_matrix_worklists/0/required_cells/0/required_cell_key' } }
      ];
      clone.action_sequence.push(behaviorStep('requests/behavior-permission-valid.json', 'behavior-valid', 'evidence', permissionBindings));
      clone.expected_steps.push(fsmReply('OUT5.cd.case.behavior.ready', 1, ['/work_packet/context/behavior/artifact_digest']));
      clone.action_sequence.push({
        step_id: 'oracle-reroute', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/case-oracle-required.json', client_key_bindings_from: { source_step_id: 'evidence', source_json_pointer: '/commit_receipt/client_key_bindings' }, request_bindings: [
          { target_json_pointer: '/action/action_token', value_from: { source_step_id: 'behavior-valid', source_json_pointer: '/available_actions/0/action_token' } },
          ...caseOracleContractBindings(),
          ...caseSemanticRootBindings()
        ]
      });
      const reroute = registryErrorReply('ORACLE_SEMANTICS_REQUIRED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.drafts' });
      reroute.reply.required_json_pointers.push('/work_packet/permission_matrix_worklists/0/required_cells/0/required_cell_key');
      clone.expected_steps.push(reroute);
    }
    return synchronizeInputFiles(clone);
  }
  return clone;
}

function specializeRequirementsGapFixture(clone, fixtureId, requirement) {
  if (!['C02', 'C03'].includes(requirement) || !/\.(negative|blocked)\./u.test(fixtureId)) return clone;
  const positive = structuredClone(baseById.get(requirement === 'C02' ? 'F-C02-ambiguity.positive.baseline' : 'F-C03-entity.positive.baseline'));
  positive.fixture_id = fixtureId;
  positive.requirement_ids = [requirement];
  positive.action_sequence = positive.action_sequence.slice(0, 3);
  positive.expected_steps = positive.expected_steps.slice(0, 3);
  if (requirement === 'C03') {
    const evidence = positive.action_sequence[2];
    evidence.request_file = 'requests/evidence-c03-gap.json';
    evidence.request_bindings = evidence.request_bindings.filter((binding) => !binding.target_json_pointer.includes('/resolution/clusters/'));
    evidence.request_bindings.push(
      { target_json_pointer: '/action/artifact/semantic_gaps/0/target/origin/conflict_group_id', value_from: { source_step_id: 'source', source_json_pointer: '/work_packet/semantic_review_seed/entity_conflict_groups/0/conflict_group_id' } },
      { target_json_pointer: '/action/artifact/semantic_gaps/0/target/origin/mention_candidate_ids/0', value_from: { source_step_id: 'source', source_json_pointer: '/work_packet/semantic_review_seed/entity_mention_candidates/0/candidate_id' } },
      { target_json_pointer: '/action/artifact/semantic_gaps/0/target/origin/mention_candidate_ids/1', value_from: { source_step_id: 'source', source_json_pointer: '/work_packet/semantic_review_seed/entity_mention_candidates/1/candidate_id' } }
    );
    positive.expected_steps[2] = registryErrorReply('ENTITY_RESOLUTION_UNRESOLVED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.review' });
    positive.expected_steps[2].reply.required_json_pointers.push('/work_packet/presentation/parts/0/question_part_id');
  }
  return synchronizeInputFiles(positive);
}

function specializeProtocolFixture(clone, fixtureId, requirement) {
  if (requirement !== 'C15') return clone;
  const local = structuredClone(baseById.get('F-C15-protocol.positive.baseline'));
  const c01 = c01Prefix();
  if (fixtureId === 'F-C15-protocol.negative.rejection') {
    const createInvocation = (stepId, requestFile) => ({ step_id: stepId, api: 'createV5RunDirectory', catalog_key: 'primary', request_file: requestFile, request_bindings: [], fixture_absolute_path_bindings: [] });
    clone.catalog_keys = ['primary'];
    clone.action_sequence = [
      createInvocation('unsupported', 'requests/create-unsupported.json'),
      createInvocation('execution-invalid-ref', 'requests/create-execution-invalid-ref.json'),
      createInvocation('resume-invalid-parent', 'requests/create-resume-invalid-parent.json'),
      createInvocation('run-argument-invalid', 'requests/create-invalid.json'),
      c01.create, c01.source, c01.evidence,
      { step_id: 'schema-invalid', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/behavior-schema-invalid.json', request_bindings: [{ target_json_pointer: '/action/action_token', value_from: { source_step_id: 'evidence', source_json_pointer: '/available_actions/0/action_token' } }] },
      behaviorStep('requests/behavior-compiler-owned.json', 'compiler-owned'),
      { step_id: 'action-not-advertised', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/action-not-advertised.json', request_bindings: [] },
      { step_id: 'idempotency-conflict', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/advance-idempotency-conflict.json', request_bindings: [] },
      behaviorStep('requests/behavior-valid.json', 'behavior-valid'),
      { step_id: 'case-valid', api: 'advanceV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, request_file: 'requests/case-valid.json', client_key_bindings_from: { source_step_id: 'evidence', source_json_pointer: '/commit_receipt/client_key_bindings' }, request_bindings: [
        { target_json_pointer: '/action/action_token', value_from: { source_step_id: 'behavior-valid', source_json_pointer: '/available_actions/0/action_token' } },
        ...caseOracleContractBindings(),
        ...caseSemanticRootBindings()
      ] },
      { step_id: 'tamper-renderer', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'case-valid', source_json_pointer: '/run_directory' }, target: { kind: 'renderer_output', output_kind: 'json' }, mutation: 'flip_first_byte' },
      { step_id: 'inspect-renderer', api: 'inspectV5Run', run_directory_from: { source_step_id: 'case-valid', source_json_pointer: '/run_directory' } }
    ];
    const behaviorState = { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' };
    clone.expected_steps = [
      preRunErrorReply('UNSUPPORTED_SCHEMA_VERSION'), preRunErrorReply('CASE_DOCUMENT_REFERENCE_INVALID'), preRunErrorReply('RESUME_PARENT_INVALID'), preRunErrorReply('RUN_ARGUMENT_INVALID'),
      c01.createExpected, c01.sourceExpected, structuredClone(baseById.get('F-C01-atomicity.positive.baseline').expected_steps[2]),
      registryErrorReply('SCHEMA_VALIDATION_FAILED', 'run_mutation', behaviorState),
      registryErrorReply('COMPILER_OWNED_FIELD_SUBMITTED', 'run_mutation', behaviorState),
      registryErrorReply('ACTION_NOT_ADVERTISED', 'run_mutation', behaviorState),
      registryErrorReply('IDEMPOTENCY_CONFLICT', 'run_mutation', behaviorState),
      fsmReply('OUT5.cd.case.behavior.ready', 1, ['/work_packet/context/behavior/artifact_digest']),
      fsmReply('OUT5.cd.case.drafts.finished', 1, ['/work_packet/case_document_ref/bundle_digest']),
      processExpectation('tamper_run_storage', { target: { kind: 'renderer_output', output_kind: 'json' }, result: 'tampered' }),
      registryErrorReply('CANONICAL_RENDER_MISMATCH', 'run_inspect', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.terminal.finished' }, { projection_kind: 'read_only_integrity_fatal' })
    ];
    return synchronizeInputFiles(clone);
  }
  if (fixtureId.endsWith('.create-genesis-publication-order')) {
    local.fixture_id = fixtureId; local.requirement_ids = ['C15'];
    local.action_sequence = [
      { step_id: 'crash-genesis', api: 'inject_crash', crash_point: 'after_catalog_genesis_record', during: withoutStepId(local.action_sequence[0]) },
      { step_id: 'restart', api: 'restart_process' },
      { ...structuredClone(local.action_sequence[0]), step_id: 'create-recover' },
      { step_id: 'inspect', api: 'inspectV5Run', run_directory_from: { source_step_id: 'create-recover', source_json_pointer: '/run_directory' } }
    ];
    local.expected_steps = [
      processExpectation('inject_crash', { crash_point: 'after_catalog_genesis_record', result: 'process_terminated' }),
      processExpectation('restart_process', { result: 'restarted' }),
      structuredClone(local.expected_steps[0]), structuredClone(local.expected_steps[1])
    ];
    return local;
  }
  if (fixtureId.endsWith('.selector-sidecar-crash-restart')) {
    clone.input_files = c01.input_files; clone.action_sequence = [
      c01.create,
      { step_id: 'crash-source', api: 'inject_crash', crash_point: 'before_pointer_publish', during: withoutStepId(c01.source) },
      { step_id: 'restart', api: 'restart_process' },
      { ...structuredClone(c01.source), step_id: 'source-recover' },
      { step_id: 'inspect', api: 'inspectV5Run', run_directory_from: { source_step_id: 'source-recover', source_json_pointer: '/run_directory' } }
    ];
    clone.expected_steps = [c01.createExpected, processExpectation('inject_crash', { crash_point: 'before_pointer_publish', result: 'process_terminated' }), processExpectation('restart_process', { result: 'restarted' }), c01.sourceExpected, { ...structuredClone(c01.sourceExpected), reply: { ...structuredClone(c01.sourceExpected.reply), semantic_revision_delta: 0 } }];
    return clone;
  }
  if (fixtureId.endsWith('.idempotent-noop-restart')) {
    clone.input_files = c01.input_files; clone.action_sequence = [c01.create, c01.source, { step_id: 'restart', api: 'restart_process' }, { ...structuredClone(c01.source), step_id: 'source-replay' }];
    clone.expected_steps = [c01.createExpected, c01.sourceExpected, processExpectation('restart_process', { result: 'restarted' }), { ...structuredClone(c01.sourceExpected), reply: { ...structuredClone(c01.sourceExpected.reply), semantic_revision_delta: 0 } }];
    return clone;
  }
  const currentPointerInspect = fixtureId.endsWith('.read-only-integrity-fatal') || fixtureId.endsWith('.current-pointer-schema-and-cas');
  if (currentPointerInspect) {
    clone.input_files = c01.input_files; clone.action_sequence = [
      c01.create,
      { step_id: 'tamper', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, target: { kind: 'current_run_pointer' }, mutation: 'flip_first_byte' },
      { step_id: 'inspect', api: 'inspectV5Run', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' } }
    ];
    clone.expected_steps = [c01.createExpected, processExpectation('tamper_run_storage', { target: { kind: 'current_run_pointer' }, result: 'tampered' }), registryErrorReply('ACCEPTED_STATE_INTEGRITY_FAILURE', 'run_inspect', { kind: 'no_verified_fsm_cell', delivery_intent: 'case_document' }, { projection_kind: 'read_only_integrity_fatal', last_verified_state_kind: 'none' })];
    return clone;
  }
  const acceptedArtifactInspect = fixtureId.endsWith('.accepted-source-state-anchor') || fixtureId.endsWith('.semantic-digest-family-tamper');
  if (acceptedArtifactInspect) {
    clone.input_files = c01.input_files; clone.action_sequence = [
      c01.create, c01.source,
      { step_id: 'tamper', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'source', source_json_pointer: '/run_directory' }, target: { kind: 'accepted_artifact', artifact_kind: 'source_pack' }, mutation: 'flip_first_byte' },
      { step_id: 'inspect', api: 'inspectV5Run', run_directory_from: { source_step_id: 'source', source_json_pointer: '/run_directory' } }
    ];
    clone.expected_steps = [c01.createExpected, c01.sourceExpected, processExpectation('tamper_run_storage', { target: { kind: 'accepted_artifact', artifact_kind: 'source_pack' }, result: 'tampered' }), registryErrorReply('ACCEPTED_STATE_INTEGRITY_FAILURE', 'run_inspect', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.review' }, { projection_kind: 'read_only_integrity_fatal' })];
    return clone;
  }
  const normalFatal = fixtureId.endsWith('.normal-chain-fatal-incident') || fixtureId.endsWith('.normal-chain-fatal-crash-replay');
  if (normalFatal) {
    const crash = fixtureId.endsWith('.normal-chain-fatal-crash-replay');
    clone.input_files = c01.input_files;
    clone.action_sequence = [c01.create, c01.source, { step_id: 'tamper', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'source', source_json_pointer: '/run_directory' }, target: { kind: 'accepted_artifact', artifact_kind: 'source_pack' }, mutation: 'flip_first_byte' }];
    clone.expected_steps = [c01.createExpected, c01.sourceExpected, processExpectation('tamper_run_storage', { target: { kind: 'accepted_artifact', artifact_kind: 'source_pack' }, result: 'tampered' })];
    if (crash) {
      clone.action_sequence.push({ step_id: 'crash-fatal', api: 'inject_crash', crash_point: 'before_pointer_publish', during: withoutStepId(c01.evidence) }, { step_id: 'restart', api: 'restart_process' });
      clone.expected_steps.push(processExpectation('inject_crash', { crash_point: 'before_pointer_publish', result: 'process_terminated' }), processExpectation('restart_process', { result: 'restarted' }));
    }
    clone.action_sequence.push({ ...structuredClone(c01.evidence), step_id: 'fatal' });
    clone.expected_steps.push(registryErrorReply('ACCEPTED_STATE_INTEGRITY_FAILURE', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.review' }, { projection_kind: 'persisted_run_state' }));
    return clone;
  }
  const quarantine = fixtureId.endsWith('.integrity-quarantine-recovery') || fixtureId.endsWith('.quarantine-idempotency-namespace');
  if (quarantine) {
    clone.input_files = c01.input_files; clone.action_sequence = [
      c01.create,
      { step_id: 'tamper', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' }, target: { kind: 'current_run_pointer' }, mutation: 'flip_first_byte' },
      { ...structuredClone(c01.source), step_id: 'quarantine' }
    ];
    const quarantineReply = registryErrorReply('ACCEPTED_STATE_INTEGRITY_FAILURE', 'run_mutation', { kind: 'no_verified_fsm_cell', delivery_intent: 'case_document' }, { projection_kind: 'persisted_run_state' });
    clone.expected_steps = [c01.createExpected, processExpectation('tamper_run_storage', { target: { kind: 'current_run_pointer' }, result: 'tampered' }), quarantineReply];
    if (fixtureId.endsWith('.quarantine-idempotency-namespace')) {
      clone.action_sequence.push({ ...structuredClone(c01.source), step_id: 'quarantine-replay', run_directory_from: { source_step_id: 'quarantine', source_json_pointer: '/run_directory' } });
      clone.expected_steps.push({ ...structuredClone(quarantineReply), reply: { ...structuredClone(quarantineReply.reply), semantic_revision_delta: 0 } });
    }
    return clone;
  }
  const operationalTamper = fixtureId.endsWith('.receipt-index-quarantine') || fixtureId.endsWith('.transaction-receipt-reply-cross-binding') || fixtureId.endsWith('.storage-tamper-matrix');
  if (operationalTamper) {
    const target = fixtureId.endsWith('.transaction-receipt-reply-cross-binding') ? { kind: 'current_receipt_object' } : fixtureId.endsWith('.storage-tamper-matrix') ? { kind: 'current_reply_object' } : { kind: 'current_idempotency_index' };
    clone.input_files = c01.input_files; clone.action_sequence = [c01.create, c01.source, { step_id: 'tamper', api: 'tamper_run_storage', run_directory_from: { source_step_id: 'source', source_json_pointer: '/run_directory' }, target, mutation: 'flip_first_byte' }, { ...structuredClone(c01.evidence), step_id: 'quarantine' }];
    clone.expected_steps = [c01.createExpected, c01.sourceExpected, processExpectation('tamper_run_storage', { target, result: 'tampered' }), registryErrorReply('ACCEPTED_STATE_INTEGRITY_FAILURE', 'run_mutation', { kind: 'no_verified_fsm_cell', delivery_intent: 'case_document' }, { projection_kind: 'persisted_run_state' })];
    return clone;
  }
  return clone;
}

function specializeProvenanceFixture(clone, fixtureId, requirement) {
  if (requirement !== 'C16') return clone;
  const prefix = c01Prefix();
  clone.action_sequence = [prefix.create, prefix.source, prefix.evidence];
  clone.expected_steps = [prefix.createExpected, prefix.sourceExpected, structuredClone(baseById.get('F-C01-atomicity.positive.baseline').expected_steps[2])];
  if (/\.(negative|blocked)\./u.test(fixtureId)) {
    for (const [stepId, requestFile, errorCode] of [
      ['edge-not-allowed', 'requests/behavior-provenance-edge.json', 'PROVENANCE_EDGE_NOT_ALLOWED'],
      ['downstream-source', 'requests/behavior-provenance-downstream-source.json', 'DOWNSTREAM_ARTIFACT_AS_SOURCE'],
      ['cycle', 'requests/behavior-provenance-cycle.json', 'PROVENANCE_CYCLE']
    ]) {
      clone.action_sequence.push(behaviorStep(requestFile, stepId));
      clone.expected_steps.push(registryErrorReply(errorCode, 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.case.behavior' }));
    }
  } else {
    clone.action_sequence.push(behaviorStep('requests/behavior-provenance-valid.json', 'provenance-valid'));
    clone.expected_steps.push(fsmReply('OUT5.cd.case.behavior.ready', 1, ['/work_packet/context/behavior/artifact_digest']));
  }
  return synchronizeInputFiles(clone);
}

const fixtures = V5_REQUIRED_FIXTURE_LEAF_IDS.map((fixtureId) => {
  const source = baseById.get(sourceLeafId(fixtureId));
  if (!source) throw new Error(`missing baseline source for ${fixtureId}`);
  let clone = structuredClone(source);
  clone.fixture_id = fixtureId;
  const requirement = /^F-(C(?:0[1-9]|1[0-6]))-/u.exec(fixtureId)?.[1];
  clone.requirement_ids = [requirement];
  clone = specializeBehaviorFailure(clone, fixtureId, requirement);
  clone = specializeRequirementsGapFixture(clone, fixtureId, requirement);
  clone = specializeClarificationFixture(clone, fixtureId, requirement);
  clone = specializeBehaviorFixtures(clone, fixtureId, requirement);
  clone = specializeProtocolFixture(clone, fixtureId, requirement);
  clone = specializeProvenanceFixture(clone, fixtureId, requirement);
  for (let index = 0; index < clone.action_sequence.length; index += 1) {
    if (clone.action_sequence[index].request_file !== 'requests/evidence-c02-gap.json') continue;
    clone.expected_steps[index] = registryErrorReply('AMBIGUITY_UNRESOLVED', 'run_mutation', { kind: 'verified_fsm_cell', fsm_cell_id: 'cd.active.requirements.review' });
    clone.expected_steps[index].reply.required_json_pointers.push('/work_packet/presentation/parts/0/question_part_id');
  }
  for (const expected of clone.expected_steps) {
    if (expected.kind !== 'api_reply' || expected.reply.reply_status !== 'clarification_confirmation_required' || expected.reply.error_code) continue;
    const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === 'CLARIFICATION_CONFIRMATION_REQUIRED' && candidate.source.trigger_state?.fsm_cell_id === 'cd.active.requirements.resolve');
    if (!row) throw new Error('missing requirements clarification confirmation reply row');
    expected.reply.reply_contract_id = row.reply_contract_id;
    expected.reply.error_code = 'CLARIFICATION_CONFIRMATION_REQUIRED';
  }
  return clone;
});

await writeFile(manifestPath, `${JSON.stringify({ schema_version: '5.0.0', fixtures }, null, 2)}\n`);
process.stdout.write(`${canonicalV5Stringify({ fixture_count: fixtures.length, manifest_path: 'tests/fixtures/v5/manifest.json' })}\n`);
