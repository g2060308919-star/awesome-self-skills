import { readFile, writeFile } from 'node:fs/promises';

import { canonicalV5Stringify } from '../src/v5/canonical-v5.mjs';
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

function specializeBehaviorFailure(clone, fixtureId, requirement) {
  if (!/\.(negative|blocked)\./u.test(fixtureId)) return clone;
  const failure = behaviorFailureKinds.get(requirement);
  if (!failure) return clone;
  const [kind, errorCode] = failure;
  const source = structuredClone(baseById.get('F-C01-atomicity.positive.baseline'));
  const requestFile = `requests/behavior-invalid-${kind}.json`;
  source.fixture_id = fixtureId;
  source.requirement_ids = [requirement];
  source.input_files.push(requestFile);
  source.action_sequence.push({
    step_id: 'behavior-invalid', api: 'advanceV5Run',
    run_directory_from: { source_step_id: 'create', source_json_pointer: '/run_directory' },
    request_file: requestFile,
    request_bindings: [
      { target_json_pointer: '/action/action_token', value_from: { source_step_id: 'evidence', source_json_pointer: '/available_actions/0/action_token' } },
      { target_json_pointer: '/action/artifact/behavior_contract_seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/0/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/0/required_contract_key' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/seed_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/seed_digest' } },
      { target_json_pointer: '/action/artifact/behavior_contract_reviews/1/required_contract_key', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/required_contracts/1/required_contract_key' } },
      ...(kind === 'population' ? [{ target_json_pointer: '/action/artifact/population_contracts/0/scope/collection_ref/semantic_root_digest', value_from: { source_step_id: 'evidence', source_json_pointer: '/work_packet/behavior_contract_worklist/semantic_root_digest' } }] : [])
    ]
  });
  const row = contracts.replyContracts.rows.find((candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === errorCode && candidate.source.response_context === 'run_mutation' && candidate.source.trigger_state?.fsm_cell_id === 'cd.active.case.behavior' && candidate.exact_projection_kind === 'persisted_run_state');
  if (!row) throw new Error(`missing behavior failure reply row for ${errorCode}`);
  source.expected_steps.push({ kind: 'api_reply', reply: {
    reply_kind: 'run_reply', projection_kind: 'persisted_run_state', reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, error_code: errorCode, stage: row.exact_stage, obligation: row.exact_obligation,
    lifecycle: 'active', semantic_revision_delta: row.exact_commit.kind === 'artifact_commit' ? row.exact_commit.semantic_revision_delta : 0, required_json_pointers: ['/diagnostics/0/code'], forbidden_json_pointers: ['/compiler_version']
  } });
  return source;
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

function specializeProtocolFixture(clone, fixtureId, requirement) {
  if (requirement !== 'C15') return clone;
  const local = structuredClone(baseById.get('F-C15-protocol.positive.baseline'));
  const c01 = c01Prefix();
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

const fixtures = V5_REQUIRED_FIXTURE_LEAF_IDS.map((fixtureId) => {
  const source = baseById.get(sourceLeafId(fixtureId));
  if (!source) throw new Error(`missing baseline source for ${fixtureId}`);
  let clone = structuredClone(source);
  clone.fixture_id = fixtureId;
  const requirement = /^F-(C(?:0[1-9]|1[0-6]))-/u.exec(fixtureId)?.[1];
  clone.requirement_ids = [requirement];
  clone = specializeBehaviorFailure(clone, fixtureId, requirement);
  clone = specializeProtocolFixture(clone, fixtureId, requirement);
  return clone;
});

await writeFile(manifestPath, `${JSON.stringify({ schema_version: '5.0.0', fixtures }, null, 2)}\n`);
process.stdout.write(`${canonicalV5Stringify({ fixture_count: fixtures.length, manifest_path: 'tests/fixtures/v5/manifest.json' })}\n`);
