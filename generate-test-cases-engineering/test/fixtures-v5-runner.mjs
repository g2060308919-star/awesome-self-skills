// @ts-nocheck
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { advanceV5Run, createV5RunDirectory, inspectV5Run } from '../src/entry.mjs';
import { validateAgainstSchema } from '../src/schema-validator.mjs';
import { canonicalV5Stringify } from '../src/v5/canonical-v5.mjs';
import { generateV5InterfaceSchemas } from '../src/v5/interface-schemas.mjs';
import { generateV5Contracts } from '../src/v5/registry-generator.mjs';
import { readSealedV5Record, readVerifiedRun, writeAtomicFile } from '../src/v5/run-store.mjs';
import { installV5DeterministicTestProfile } from '../src/v5/runtime-services.mjs';
import { digestFilename } from '../src/v5/storage-paths.mjs';
import { canonicalObjectDigest } from '../src/v5/storage-records.mjs';
import { V5_REQUIRED_FIXTURE_LEAF_IDS } from './v5/fixture-inventory.mjs';

const REQUIREMENTS = new Set(Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`));
const FIXTURE_ID = /^F-C(0[1-9]|1[0-6])-[a-z0-9-]+\.(positive|negative|blocked|protocol)\.[a-z0-9-]+$/u;
const SANDBOX_ROOT = '/tmp/generate-test-cases-v5-fixtures-v1';

function fail(message) { throw new Error(`V5_FIXTURE_CONTRACT: ${message}`); }
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function validateManifestRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.includes('\\') || value.includes('\0') || value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) fail(`unsafe manifest-relative path: ${String(value)}`);
  return value;
}

function pointerTokens(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) fail(`invalid JSON pointer: ${String(pointer)}`);
  return pointer.slice(1).split('/').map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function resolveFixturePointer(value, pointer) {
  let current = value;
  for (const token of pointerTokens(pointer)) {
    if ((Array.isArray(current) && !/^(0|[1-9][0-9]*)$/u.test(token)) || !object(current) && !Array.isArray(current) || !Object.hasOwn(current, token)) fail(`JSON pointer does not resolve exactly once: ${pointer}`);
    current = current[token];
  }
  return current;
}

function replaceFixturePointer(value, pointer, replacement, sentinelKey) {
  const tokens = pointerTokens(pointer);
  if (tokens.length === 0) fail('binding cannot replace the request root');
  let current = value;
  for (const token of tokens.slice(0, -1)) {
    if ((!object(current) && !Array.isArray(current)) || !Object.hasOwn(current, token)) fail(`binding target is missing: ${pointer}`);
    current = current[token];
  }
  const leaf = tokens.at(-1);
  if ((!object(current) && !Array.isArray(current)) || !Object.hasOwn(current, leaf) || canonicalV5Stringify(current[leaf]) !== canonicalV5Stringify({ [sentinelKey]: 'required' })) fail(`binding target is not the exact sentinel: ${pointer}`);
  current[leaf] = structuredClone(replacement);
}

function assertNoSentinels(value) {
  const encoded = canonicalV5Stringify(value);
  if (encoded.includes('$fixture_binding') || encoded.includes('$fixture_absolute_path') || encoded.includes('$fixture_client_key')) fail('request contains an unconsumed fixture placeholder');
}

function validateExpectedPair(action, expected) {
  const publicApis = new Set(['createV5RunDirectory', 'advanceV5Run', 'inspectV5Run']);
  if (publicApis.has(action.api)) {
    if (expected?.kind !== 'api_reply') fail(`${action.api} must pair with api_reply`);
    return;
  }
  if (!['restart_process', 'tamper_run_storage', 'inject_crash'].includes(action.api) || expected?.kind !== 'process_control' || expected.api !== action.api) fail(`process-control pair is inconsistent for ${action.api}`);
  if (action.api === 'inject_crash' && expected.crash_point !== action.crash_point) fail('crash points differ');
  if (action.api === 'tamper_run_storage' && canonicalV5Stringify(expected.target) !== canonicalV5Stringify(action.target)) fail('tamper targets differ');
}

function validateReplyRef(value, runDirectory = false) {
  if (!object(value) || !exactKeys(value, ['source_step_id', 'source_json_pointer']) || typeof value.source_step_id !== 'string' || typeof value.source_json_pointer !== 'string') fail('reply reference is not closed');
  pointerTokens(value.source_json_pointer);
  if (runDirectory && value.source_json_pointer !== '/run_directory') fail('run_directory_from must bind /run_directory');
}

function validateRequestBindings(step, allowAbsolutePaths) {
  if (!Array.isArray(step.request_bindings) || !Array.isArray(step.fixture_absolute_path_bindings ?? [])) fail('request binding lists are required');
  for (const binding of step.request_bindings) {
    if (!object(binding) || !exactKeys(binding, ['target_json_pointer', 'value_from']) || typeof binding.target_json_pointer !== 'string') fail('request binding is not closed');
    pointerTokens(binding.target_json_pointer);
    validateReplyRef(binding.value_from);
  }
  if (!allowAbsolutePaths && Object.hasOwn(step, 'fixture_absolute_path_bindings')) fail('advance cannot contain fixture absolute-path bindings');
  for (const binding of step.fixture_absolute_path_bindings ?? []) {
    if (!object(binding) || !exactKeys(binding, ['target_json_pointer', 'fixture_file']) || typeof binding.target_json_pointer !== 'string' || typeof binding.fixture_file !== 'string') fail('fixture absolute-path binding is not closed');
    pointerTokens(binding.target_json_pointer);
  }
  if (step.client_key_bindings_from !== undefined) {
    validateReplyRef(step.client_key_bindings_from);
    if (step.client_key_bindings_from.source_json_pointer !== '/commit_receipt/client_key_bindings') fail('client-key rewrite must bind the exact committed binding list');
  }
}

function validateTamperTarget(target) {
  if (!object(target) || typeof target.kind !== 'string') fail('tamper target is invalid');
  const operational = new Set(['current_run_pointer', 'current_transaction_object', 'current_receipt_object', 'current_idempotency_index', 'current_reply_object', 'current_checkpoint', 'current_selector_sidecar']);
  if (operational.has(target.kind)) { if (!exactKeys(target, ['kind'])) fail('operational tamper target is not closed'); return; }
  if (target.kind === 'accepted_artifact') { if (!exactKeys(target, ['kind', 'artifact_kind']) || !['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'].includes(target.artifact_kind)) fail('accepted artifact target is invalid'); return; }
  if (target.kind === 'compiler_state') {
    const setTargetKinds = new Set(['execution_receipt', 'accepted_compiler_projection']);
    const scalarKinds = new Set(['source_acquisition_state', 'question_part_state_set', 'clarification_pending', 'execution_snapshot', 'final_execution_projection']);
    if (setTargetKinds.has(target.state_kind) ? !exactKeys(target, ['kind', 'state_kind', 'target_digest']) || typeof target.target_digest !== 'string' : !scalarKinds.has(target.state_kind) || !exactKeys(target, ['kind', 'state_kind'])) fail('compiler-state tamper target is invalid');
    return;
  }
  if (target.kind === 'compiler_projection') { if (!exactKeys(target, ['kind', 'projection_kind']) || target.projection_kind !== 'applied_clarification_impact') fail('compiler projection target is invalid'); return; }
  if (target.kind === 'renderer_output') { if (!exactKeys(target, ['kind', 'output_kind']) || !['json', 'markdown', 'csv'].includes(target.output_kind)) fail('renderer output target is invalid'); return; }
  fail(`unsupported logical tamper target: ${target.kind}`);
}

function validateInvocation(step, nested = false) {
  const prefix = nested ? [] : ['step_id'];
  if (step.api === 'createV5RunDirectory') {
    if (!exactKeys(step, [...prefix, 'api', 'catalog_key', 'request_file', 'request_bindings', 'fixture_absolute_path_bindings', ...(step.client_key_bindings_from === undefined ? [] : ['client_key_bindings_from'])])) fail('create invocation is not closed');
    validateRequestBindings(step, true);
  } else if (step.api === 'advanceV5Run') {
    if (!exactKeys(step, [...prefix, 'api', 'run_directory_from', 'request_file', 'request_bindings', ...(step.client_key_bindings_from === undefined ? [] : ['client_key_bindings_from'])])) fail('advance invocation is not closed');
    validateReplyRef(step.run_directory_from, true);
    validateRequestBindings(step, false);
  } else if (step.api === 'inspectV5Run') {
    if (!exactKeys(step, [...prefix, 'api', 'run_directory_from'])) fail('inspect invocation is not closed');
    validateReplyRef(step.run_directory_from, true);
  } else if (step.api === 'restart_process' && !nested) {
    if (!exactKeys(step, ['step_id', 'api'])) fail('restart invocation is not closed');
  } else if (step.api === 'tamper_run_storage' && !nested) {
    if (!exactKeys(step, ['step_id', 'api', 'run_directory_from', 'target', 'mutation']) || !['flip_first_byte', 'truncate_to_zero', 'delete_object'].includes(step.mutation)) fail('tamper invocation is not closed');
    validateReplyRef(step.run_directory_from, true);
    validateTamperTarget(step.target);
  } else if (step.api === 'inject_crash' && !nested) {
    if (!exactKeys(step, ['step_id', 'api', 'crash_point', 'during']) || typeof step.crash_point !== 'string' || !object(step.during)) fail('crash invocation is not closed');
    validateInvocation(step.during, true);
  } else fail(`unknown fixture API: ${step.api}`);
}

function validateExpected(expected) {
  if (!object(expected) || typeof expected.kind !== 'string') fail('expected step is invalid');
  if (expected.kind === 'process_control') {
    if (expected.api === 'restart_process' && exactKeys(expected, ['kind', 'api', 'result']) && expected.result === 'restarted') return;
    if (expected.api === 'tamper_run_storage' && exactKeys(expected, ['kind', 'api', 'target', 'result']) && expected.result === 'tampered') { validateTamperTarget(expected.target); return; }
    if (expected.api === 'inject_crash' && exactKeys(expected, ['kind', 'api', 'crash_point', 'result']) && typeof expected.crash_point === 'string' && expected.result === 'process_terminated') return;
    fail('process-control expectation is not closed');
  }
  if (expected.kind !== 'api_reply' || !object(expected.reply)) fail('API expectation is invalid');
  const reply = expected.reply;
  const common = ['reply_kind', 'reply_contract_id', 'reply_status', 'semantic_revision_delta', 'required_json_pointers', 'forbidden_json_pointers', ...(Object.hasOwn(reply, 'golden_digest_file') ? ['golden_digest_file'] : [])];
  if (!Array.isArray(reply.required_json_pointers) || !Array.isArray(reply.forbidden_json_pointers) || reply.semantic_revision_delta !== 0 && reply.semantic_revision_delta !== 1) fail('API expectation pointers or revision delta are invalid');
  [...reply.required_json_pointers, ...reply.forbidden_json_pointers].forEach(pointerTokens);
  if (reply.reply_kind === 'pre_run_error') {
    if (!exactKeys(reply, [...common, 'error_code']) || reply.semantic_revision_delta !== 0 || !['protocol_error', 'fatal'].includes(reply.reply_status)) fail('pre-run expectation is not closed');
  } else if (reply.projection_kind === 'persisted_run_state') {
    if (!exactKeys(reply, [...common, 'projection_kind', ...(Object.hasOwn(reply, 'error_code') ? ['error_code'] : []), 'stage', 'obligation', 'lifecycle'])) fail('persisted expectation is not closed');
  } else if (reply.projection_kind === 'read_only_integrity_fatal') {
    if (!exactKeys(reply, [...common, 'projection_kind', 'error_code', 'lifecycle', 'last_verified_state_kind']) || reply.reply_status !== 'fatal' || reply.lifecycle !== 'fatal' || reply.semantic_revision_delta !== 0) fail('integrity expectation is not closed');
  } else if (reply.projection_kind === 'read_only_terminal_rejection') {
    if (!exactKeys(reply, [...common, 'projection_kind', 'error_code', 'stage', 'obligation', 'lifecycle']) || reply.reply_status !== 'protocol_error' || reply.semantic_revision_delta !== 0) fail('terminal expectation is not closed');
  } else fail('unknown expected reply branch');
}

export function validateV5FixtureManifest(manifest) {
  if (!object(manifest) || !exactKeys(manifest, ['schema_version', 'fixtures']) || manifest.schema_version !== '5.0.0' || !Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) fail('manifest root is not closed V5');
  const fixtureIds = new Set();
  for (const fixture of manifest.fixtures) {
    if (!object(fixture) || !exactKeys(fixture, ['fixture_id', 'requirement_ids', 'runtime_profile', 'catalog_keys', 'input_files', 'action_sequence', 'expected_steps']) || !FIXTURE_ID.test(fixture.fixture_id) || fixtureIds.has(fixture.fixture_id) || fixture.runtime_profile !== 'deterministic-v1') fail(`invalid or duplicate fixture: ${fixture.fixture_id}`);
    fixtureIds.add(fixture.fixture_id);
    if (!Array.isArray(fixture.requirement_ids) || fixture.requirement_ids.length === 0 || fixture.requirement_ids.some((id) => !REQUIREMENTS.has(id))) fail(`invalid requirement set: ${fixture.fixture_id}`);
    if (!Array.isArray(fixture.catalog_keys) || fixture.catalog_keys.length === 0 || new Set(fixture.catalog_keys).size !== fixture.catalog_keys.length || fixture.catalog_keys.some((key) => !/^[a-z][a-z0-9-]*$/u.test(key))) fail(`invalid catalog keys: ${fixture.fixture_id}`);
    if (!Array.isArray(fixture.input_files) || fixture.input_files.length === 0 || new Set(fixture.input_files).size !== fixture.input_files.length) fail(`invalid input files: ${fixture.fixture_id}`);
    fixture.input_files.forEach(validateManifestRelativePath);
    if (!Array.isArray(fixture.action_sequence) || fixture.action_sequence.length === 0 || fixture.action_sequence.length !== fixture.expected_steps?.length) fail(`action/expected cardinality differs: ${fixture.fixture_id}`);
    const stepIndexes = new Map();
    fixture.action_sequence.forEach((step, index) => {
      if (!object(step) || typeof step.step_id !== 'string' || stepIndexes.has(step.step_id)) fail(`duplicate step ID: ${step.step_id}`);
      stepIndexes.set(step.step_id, index);
      validateInvocation(step);
      validateExpected(fixture.expected_steps[index]);
      validateExpectedPair(step, fixture.expected_steps[index]);
      for (const fileField of ['request_file']) if (step[fileField] !== undefined) { validateManifestRelativePath(step[fileField]); if (!fixture.input_files.includes(step[fileField])) fail(`undeclared input file: ${step[fileField]}`); }
      for (const binding of [...(step.request_bindings ?? []), ...(step.fixture_absolute_path_bindings ?? []), ...(step.run_directory_from ? [step.run_directory_from] : []), ...(step.client_key_bindings_from ? [step.client_key_bindings_from] : [])]) {
        const sourceStepId = binding.source_step_id ?? binding.value_from?.source_step_id;
        if (sourceStepId !== undefined && (!stepIndexes.has(sourceStepId) || stepIndexes.get(sourceStepId) >= index)) fail(`binding is not backward-only: ${step.step_id}`);
      }
      if (step.catalog_key && !fixture.catalog_keys.includes(step.catalog_key)) fail(`undeclared catalog key: ${step.catalog_key}`);
    });
    fixture.action_sequence.forEach((step, index) => {
      if (['restart_process', 'tamper_run_storage', 'inject_crash'].includes(step.api) && !fixture.action_sequence.slice(index + 1).some((candidate) => ['advanceV5Run', 'inspectV5Run'].includes(candidate.api))) fail(`process-control step lacks later API evidence: ${step.step_id}`);
    });
  }
  for (const requirement of REQUIREMENTS) {
    const leaves = manifest.fixtures.filter((fixture) => fixture.requirement_ids.includes(requirement));
    if (!leaves.some((fixture) => fixture.fixture_id.includes('.positive.')) || !leaves.some((fixture) => /\.(negative|blocked|protocol)\./u.test(fixture.fixture_id))) fail(`${requirement} lacks positive and negative/blocked/protocol leaves`);
  }
  const actualFixtureIds = [...fixtureIds].sort();
  if (canonicalV5Stringify(actualFixtureIds) !== canonicalV5Stringify(V5_REQUIRED_FIXTURE_LEAF_IDS)) fail('manifest does not contain the exact normative fixture leaf inventory');
  const contracts = generateV5Contracts();
  const referencedTestIds = [
    ...contracts.policyRegistry.rules.flatMap((rule) => rule.test_ids),
    ...contracts.policyRegistry.provenance_policy.allowed_edges.flatMap((edge) => edge.test_ids),
    ...contracts.stableIdPreimageRegistry.rows.map((row) => row.golden_test_id)
  ];
  for (const testId of referencedTestIds) if (manifest.fixtures.filter((fixture) => fixture.fixture_id === testId).length !== 1) fail(`registry test ID does not resolve to exactly one manifest leaf: ${testId}`);
  return manifest;
}

async function readJsonFile(root, relativePath) {
  validateManifestRelativePath(relativePath);
  const candidate = path.join(root, relativePath);
  const [rootReal, candidateReal] = await Promise.all([realpath(root), realpath(candidate)]);
  if (path.relative(rootReal, candidateReal).startsWith('..') || path.isAbsolute(path.relative(rootReal, candidateReal))) fail(`fixture file escapes root: ${relativePath}`);
  const stat = await lstat(candidateReal);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`fixture input is not a regular file: ${relativePath}`);
  return JSON.parse(await readFile(candidateReal, 'utf8'));
}

export function v5FixtureSandboxPaths(fixtureId, relativePath, bytes) {
  const fixtureHash = sha256(Buffer.from(fixtureId));
  const fileHash = sha256(Buffer.concat([Buffer.from(validateManifestRelativePath(relativePath)), Buffer.from([0]), bytes]));
  return {
    fixtureHash,
    directory: path.join(SANDBOX_ROOT, fixtureHash),
    lock: path.join(SANDBOX_ROOT, 'locks', `${fixtureHash}.lock`),
    input: path.join(SANDBOX_ROOT, fixtureHash, `${fileHash}.input`)
  };
}

export async function acquireV5FixtureSandbox(fixtureId) {
  if (process.platform === 'win32' || path.sep !== '/') fail('fixed POSIX fixture sandbox is unsupported on this platform');
  const { fixtureHash, directory, lock } = v5FixtureSandboxPaths(fixtureId, 'placeholder.input', Buffer.alloc(0));
  await mkdir(path.join(SANDBOX_ROOT, 'locks'), { recursive: true, mode: 0o700 });
  await chmod(SANDBOX_ROOT, 0o700);
  await chmod(path.join(SANDBOX_ROOT, 'locks'), 0o700);
  try { await mkdir(lock, { mode: 0o700 }); } catch { fail(`fixture sandbox is already locked: ${fixtureId}`); }
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { mode: 0o700 });
  return { fixtureHash, directory, release: async () => { await rm(directory, { recursive: true, force: true }); await rm(lock, { recursive: true, force: true }); } };
}

async function applyRequestBindings(template, step, replies, fixtureRoot, fixture, sandbox) {
  const request = structuredClone(template);
  const targets = new Set();
  for (const binding of step.request_bindings ?? []) {
    if (targets.has(binding.target_json_pointer)) fail('binding target appears twice');
    targets.add(binding.target_json_pointer);
    const source = replies.get(binding.value_from.source_step_id);
    if (!source) fail(`binding source has no API reply: ${binding.value_from.source_step_id}`);
    replaceFixturePointer(request, binding.target_json_pointer, resolveFixturePointer(source, binding.value_from.source_json_pointer), '$fixture_binding');
  }
  for (const binding of step.fixture_absolute_path_bindings ?? []) {
    if (targets.has(binding.target_json_pointer) || !fixture.input_files.includes(binding.fixture_file)) fail('absolute-path binding is duplicate or undeclared');
    targets.add(binding.target_json_pointer);
    if (!/^\/source_bootstrap\/source_request_seeds\/(0|[1-9][0-9]*)\/locator\/absolute_path$/u.test(binding.target_json_pointer)) fail('absolute-path binding targets a forbidden field');
    const relativePath = validateManifestRelativePath(binding.fixture_file);
    const sourcePath = path.join(fixtureRoot, relativePath);
    const [rootReal, sourceReal] = await Promise.all([realpath(fixtureRoot), realpath(sourcePath)]);
    if (path.relative(rootReal, sourceReal).startsWith('..')) fail('local fixture source escapes root');
    const stat = await lstat(sourceReal);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('local fixture source is not a regular file');
    const bytes = await readFile(sourceReal);
    const destination = v5FixtureSandboxPaths(fixture.fixture_id, relativePath, bytes).input;
    await writeAtomicFile(destination, bytes);
    await chmod(destination, 0o600);
    replaceFixturePointer(request, binding.target_json_pointer, destination, '$fixture_absolute_path');
    const locatorPointer = binding.target_json_pointer.replace(/\/absolute_path$/u, '');
    if (resolveFixturePointer(request, `${locatorPointer}/kind`) !== 'local_file') fail('absolute-path binding requires a local_file locator');
  }
  if (step.client_key_bindings_from) {
    const source = replies.get(step.client_key_bindings_from.source_step_id);
    if (!source) fail(`client-key binding source has no API reply: ${step.client_key_bindings_from.source_step_id}`);
    const bindings = resolveFixturePointer(source, step.client_key_bindings_from.source_json_pointer);
    if (!Array.isArray(bindings) || bindings.some((binding) => !object(binding) || typeof binding.client_key !== 'string' || typeof binding.stable_id !== 'string')) fail('committed client-key binding list is invalid');
    const stableByClientKey = new Map(bindings.map((binding) => [binding.client_key, binding.stable_id]));
    const rewrite = (value) => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => {
          const rewritten = rewrite(child);
          if (rewritten !== undefined) value[index] = rewritten;
        });
        return;
      }
      if (!object(value)) return;
      if (exactKeys(value, ['$fixture_client_key'])) {
        const stableId = stableByClientKey.get(value.$fixture_client_key);
        if (!stableId) fail(`unknown committed client key: ${String(value.$fixture_client_key)}`);
        return stableId;
      }
      for (const [key, child] of Object.entries(value)) {
        const rewritten = rewrite(child);
        if (rewritten !== undefined) value[key] = rewritten;
      }
    };
    rewrite(request);
  }
  if (request.action?.artifact_kind === 'behavior_views' && object(request.action.artifact)) {
    const seedSourceId = step.client_key_bindings_from?.source_step_id
      ?? step.request_bindings.find((binding) => binding.target_json_pointer === '/action/artifact/behavior_contract_seed_digest')?.value_from.source_step_id;
    const seedReply = seedSourceId ? replies.get(seedSourceId) : undefined;
    const seed = seedReply?.work_packet?.behavior_contract_worklist;
    const obligations = seedReply?.work_packet?.context?.test_obligations?.payload;
    const artifact = request.action.artifact;
    if (obligations && Array.isArray(obligations.outcomes) && Array.isArray(obligations.formal_test_points)) {
      const pointByOutcomeId = new Map(obligations.formal_test_points.map((point) => [point.outcome_id, point.formal_test_point_id]));
      const pointByClaimId = new Map(obligations.outcomes.flatMap((outcome) => outcome.claim_ids.map((claimId) => [claimId, pointByOutcomeId.get(outcome.outcome_id)])));
      for (const [index, contract] of (artifact.oracle_semantic_contracts ?? []).entries()) {
        const claimId = contract.basis?.find((basis) => basis.kind === 'claim')?.claim_id;
        contract.formal_test_point_id = pointByClaimId.get(claimId) ?? obligations.formal_test_points[index]?.formal_test_point_id;
      }
      const oracleByClientKey = new Map((artifact.oracle_semantic_contracts ?? []).map((contract) => [contract.oracle_contract_client_key, contract]));
      for (const contract of artifact.behavior_equivalence_contracts ?? []) contract.formal_test_point_id = oracleByClientKey.get(contract.oracle_semantic_contract_client_key)?.formal_test_point_id;
    }
    if (seed && Array.isArray(seed.required_contracts) && Array.isArray(artifact.behavior_contract_reviews)) {
      const collectionKinds = [
        ['field_correspondence', 'field_correspondences', 'mapping_client_key'],
        ['domain', 'domain_contracts', 'domain_client_key'],
        ['population', 'population_contracts', 'population_contract_client_key'],
        ['oracle_semantics', 'oracle_semantic_contracts', 'oracle_contract_client_key'],
        ['permission_auxiliary', 'permission_auxiliary_contracts', 'contract_client_key']
      ];
      const contractInfo = new Map();
      for (const [kind, collection, clientKeyField] of collectionKinds) for (const contract of artifact[collection] ?? []) contractInfo.set(contract[clientKeyField], { kind, contract });
      const gapKind = new Map((artifact.semantic_gap_proposals ?? []).map((gap) => [gap.semantic_gap_client_key, ['authority', 'join', 'transform', 'null_policy', 'freshness'].includes(gap.missing_semantics) ? 'field_correspondence' : gap.missing_semantics === 'domain_boundary' ? 'domain' : ['population_scope', 'population_proof'].includes(gap.missing_semantics) ? 'population' : gap.missing_semantics?.startsWith('oracle_') ? 'oracle_semantics' : gap.target?.kind === 'permission_cell' ? 'permission_auxiliary' : undefined]));
      const claimed = new Set();
      const keyByGap = new Map();
      for (const review of artifact.behavior_contract_reviews) {
        let kind; let subjectRef;
        if (review.disposition?.kind === 'formal') {
          const info = contractInfo.get(review.disposition.contract_client_keys?.[0]);
          kind = info?.kind;
          subjectRef = info?.contract?.observation_ref?.subject_ref;
        } else if (review.disposition?.kind === 'semantic_gap') {
          const gapClientKey = review.disposition.gap_ref?.semantic_gap_client_key;
          kind = gapKind.get(gapClientKey);
        }
        const candidates = seed.required_contracts.filter((candidate) => candidate.contract_kind === kind && !claimed.has(candidate.required_contract_key));
        const selected = candidates.find((candidate) => subjectRef !== undefined && candidate.subject_ref === subjectRef) ?? candidates[0];
        if (!selected) continue;
        review.seed_digest = seed.seed_digest;
        review.required_contract_key = selected.required_contract_key;
        claimed.add(selected.required_contract_key);
        if (review.disposition?.kind === 'semantic_gap') keyByGap.set(review.disposition.gap_ref.semantic_gap_client_key, selected.required_contract_key);
      }
      for (const gap of artifact.semantic_gap_proposals ?? []) if (keyByGap.has(gap.semantic_gap_client_key) && gap.target?.kind === 'behavior_contract') gap.target.required_contract_key = keyByGap.get(gap.semantic_gap_client_key);
    }
  }
  if (request.action?.artifact_kind === 'case_drafts' && object(request.action.artifact)) {
    const tokenBinding = step.request_bindings.find((binding) => binding.target_json_pointer === '/action/action_token');
    const caseWorkReply = tokenBinding ? replies.get(tokenBinding.value_from.source_step_id) : undefined;
    const context = caseWorkReply?.work_packet?.context;
    const obligations = context?.test_obligations?.payload;
    const acceptedOracles = context?.behavior?.payload?.oracle_semantic_contracts;
    if (obligations && Array.isArray(acceptedOracles)) {
      const pointByOutcomeId = new Map(obligations.formal_test_points.map((point) => [point.outcome_id, point]));
      for (const [index, draft] of (request.action.artifact.case_drafts ?? []).entries()) {
        const claimId = draft.oracles?.[0]?.claim_ids?.[0];
        const outcome = obligations.outcomes.find((candidate) => candidate.claim_ids.includes(claimId)) ?? obligations.outcomes[index];
        const point = outcome ? pointByOutcomeId.get(outcome.outcome_id) : undefined;
        const acceptedOracle = acceptedOracles.find((candidate) => candidate.formal_test_point_id === point?.formal_test_point_id) ?? acceptedOracles[index];
        if (!outcome || !point || !acceptedOracle) fail('Case fixture cannot resolve accepted Fact, TestPoint, and Oracle projections');
        draft.acceptance_role = outcome.acceptance_role;
        draft.fact_ids = [outcome.fact_id];
        draft.primary_test_point_id = point.formal_test_point_id;
        draft.supporting_observation_ids = obligations.supporting_observations.filter((observation) => observation.outcome_id === outcome.outcome_id).map((observation) => observation.supporting_observation_id);
        draft.oracles[0].oracle_semantic_contract_id = acceptedOracle.oracle_contract_client_key;
      }
    }
  }
  assertNoSentinels(request);
  return request;
}

function normalizeReply(reply, catalogs) {
  const result = structuredClone(reply);
  if (typeof result.run_directory === 'string') {
    for (const [key, root] of catalogs) if (result.run_directory.startsWith(`${root}${path.sep}`)) result.run_directory = `fixture://catalog/${key}${result.run_directory.slice(root.length)}`;
  }
  return result;
}

function assertExpectedReply(actual, expected, priorRevision) {
  if (actual.kind !== expected.reply_kind || actual.reply_contract_id !== expected.reply_contract_id || actual.reply_status !== expected.reply_status) fail(`reply contract mismatch: ${canonicalV5Stringify({ actual, expected })}`);
  if (expected.projection_kind !== undefined && actual.projection_kind !== expected.projection_kind) fail('reply projection kind differs');
  if (expected.error_code !== undefined && actual.diagnostics?.[0]?.code !== expected.error_code) fail('reply diagnostic differs');
  if (expected.stage !== undefined && actual.stage !== expected.stage) fail('reply stage differs');
  if (expected.obligation !== undefined && actual.obligation !== expected.obligation) fail('reply obligation differs');
  if (expected.lifecycle !== undefined && actual.run_lifecycle !== expected.lifecycle) fail('reply lifecycle differs');
  if (expected.last_verified_state_kind !== undefined && actual.last_verified_state?.kind !== expected.last_verified_state_kind) fail('last verified state kind differs');
  const delta = typeof actual.current_revision === 'number' ? actual.current_revision - priorRevision : 0;
  if (delta !== expected.semantic_revision_delta) fail(`semantic revision delta differs: ${delta}`);
  for (const pointer of expected.required_json_pointers) resolveFixturePointer(actual, pointer);
  for (const pointer of expected.forbidden_json_pointers) {
    try { resolveFixturePointer(actual, pointer); fail(`forbidden pointer exists: ${pointer}`); } catch (error) { if (!String(error.message).includes('does not resolve')) throw error; }
  }
}

async function runTamper(step, replies, catalogRoots) {
  const runDirectory = resolveFixturePointer(replies.get(step.run_directory_from.source_step_id), '/run_directory');
  if (![...catalogRoots.values()].some((root) => runDirectory.startsWith(`${root}${path.sep}`))) fail('tamper target is outside this fixture catalogs');
  let targetPath;
  if (step.target.kind === 'current_run_pointer') targetPath = path.join(runDirectory, 'current-transaction.json');
  else {
    const current = await readVerifiedRun(runDirectory);
    const digestByKind = {
      current_transaction_object: current.transaction.transaction_digest,
      current_receipt_object: current.transaction.receipt_digest,
      current_idempotency_index: current.transaction.idempotency_index_digest,
      current_reply_object: current.transaction.reply_object_digest,
      current_checkpoint: current.transaction.checkpoint_digest,
      current_selector_sidecar: current.transaction.selector_sidecar_digest
    };
    const directoryByKind = {
      current_transaction_object: current.layout.transactions, current_receipt_object: current.layout.receipts,
      current_idempotency_index: current.layout.idempotencyIndexes, current_reply_object: current.layout.replies,
      current_checkpoint: current.layout.checkpoints, current_selector_sidecar: current.layout.selectorSidecars
    };
    if (digestByKind[step.target.kind]) targetPath = path.join(directoryByKind[step.target.kind], digestFilename(digestByKind[step.target.kind]));
    else if (step.target.kind === 'accepted_artifact') {
      const matches = [];
      for (const digest of current.checkpoint.accepted_artifact_digests ?? []) {
        const record = await readSealedV5Record(current.layout.acceptedArtifacts, digest, 'envelope_digest');
        if (record.artifact_kind === step.target.artifact_kind) matches.push(path.join(current.layout.acceptedArtifacts, digestFilename(digest)));
      }
      if (matches.length !== 1) fail('accepted artifact tamper target is not unique');
      targetPath = matches[0];
    } else if (step.target.kind === 'renderer_output') {
      const index = { json: 0, markdown: 1, csv: 2 }[step.target.output_kind];
      const digest = current.checkpoint.rendered_output_digests?.[index];
      if (!digest) fail('renderer output target is unavailable');
      targetPath = path.join(current.layout.renderedOutputs, digestFilename(digest));
    } else if (step.target.kind === 'compiler_projection') {
      const digest = current.checkpoint.applied_clarification_impact_digest;
      if (step.target.projection_kind !== 'applied_clarification_impact' || typeof digest !== 'string') fail('compiler projection target is unavailable');
      targetPath = path.join(current.layout.compilerState, digestFilename(digest));
    } else if (step.target.kind === 'compiler_state') {
      const checkpointFieldByKind = {
        source_acquisition_state: 'source_acquisition_state_digest',
        question_part_state_set: 'question_part_state_set_digest',
        clarification_pending: 'pending_clarification_digest',
        execution_snapshot: 'execution_snapshot_digest',
        final_execution_projection: 'final_execution_projection_digest'
      };
      let digest;
      if (step.target.state_kind === 'execution_receipt') {
        digest = step.target.target_digest;
        if (!current.checkpoint.accepted_execution_receipt_digests?.includes(digest)) fail('execution receipt target is not in the verified checkpoint set');
      } else if (step.target.state_kind === 'accepted_compiler_projection') {
        digest = step.target.target_digest;
        if (!current.checkpoint.compiler_projection_digests?.includes(digest)) fail('compiler projection target is not in the verified checkpoint set');
      } else {
        const field = checkpointFieldByKind[step.target.state_kind];
        digest = field ? current.checkpoint[field] : undefined;
      }
      if (typeof digest !== 'string') fail('compiler-state target is unavailable');
      targetPath = path.join(current.layout.compilerState, digestFilename(digest));
    } else fail(`unsupported logical tamper target: ${step.target.kind}`);
  }
  if (!targetPath) fail('logical tamper target is unavailable');
  if (step.mutation === 'delete_object') await rm(targetPath);
  else if (step.mutation === 'truncate_to_zero') await writeFile(targetPath, Buffer.alloc(0));
  else if (step.mutation === 'flip_first_byte') { const bytes = await readFile(targetPath); if (bytes.length === 0) fail('cannot flip an empty object'); bytes[0] ^= 1; await writeFile(targetPath, bytes); }
  else fail(`unknown tamper mutation: ${step.mutation}`);
}

export async function runV5FixtureManifest(manifestPath, options = {}) {
  const absoluteManifest = path.resolve(manifestPath);
  const fixtureRoot = path.dirname(absoluteManifest);
  const manifest = validateV5FixtureManifest(JSON.parse(await readFile(absoluteManifest, 'utf8')));
  const contracts = generateV5Contracts();
  const replySchema = generateV5InterfaceSchemas(contracts).reply;
  const transcript = [];
  const requirementResults = new Map([...REQUIREMENTS].map((id) => [id, 0]));
  const observedDiagnosticsByFixture = new Map();
  let executedFixtureCount = 0;
  for (const fixture of manifest.fixtures) {
    if (Array.isArray(options.fixtureIds) && !options.fixtureIds.includes(fixture.fixture_id)) continue;
    executedFixtureCount += 1;
    observedDiagnosticsByFixture.set(fixture.fixture_id, new Set());
    const tempRoot = path.join(SANDBOX_ROOT, 'catalogs', sha256(Buffer.from(fixture.fixture_id)));
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    const catalogs = new Map();
    for (const key of fixture.catalog_keys) { const directory = path.join(tempRoot, key); await mkdir(directory); catalogs.set(key, await realpath(directory)); }
    const sandbox = await acquireV5FixtureSandbox(fixture.fixture_id);
    const replies = new Map();
    let restore = installV5DeterministicTestProfile(fixture.fixture_id);
    let priorRevision = 0;
    try {
      for (let index = 0; index < fixture.action_sequence.length; index += 1) {
        const step = fixture.action_sequence[index];
        const expected = fixture.expected_steps[index];
        if (step.api === 'restart_process') { restore(); restore = installV5DeterministicTestProfile(fixture.fixture_id); continue; }
        if (step.api === 'tamper_run_storage') { await runTamper(step, replies, catalogs); continue; }
        let invocation = step;
        let crashRestore = null;
        if (step.api === 'inject_crash') { restore(); crashRestore = installV5DeterministicTestProfile(fixture.fixture_id, { crashPoint: step.crash_point }); restore = crashRestore; invocation = step.during; }
        try {
          let actual;
          if (invocation.api === 'createV5RunDirectory') {
            const template = await readJsonFile(fixtureRoot, invocation.request_file);
            const request = await applyRequestBindings(template, invocation, replies, fixtureRoot, fixture, sandbox);
            actual = await createV5RunDirectory(catalogs.get(invocation.catalog_key), request);
          } else if (invocation.api === 'advanceV5Run') {
            const template = await readJsonFile(fixtureRoot, invocation.request_file);
            const request = await applyRequestBindings(template, invocation, replies, fixtureRoot, fixture, sandbox);
            const runDirectory = resolveFixturePointer(replies.get(invocation.run_directory_from.source_step_id), '/run_directory');
            actual = await advanceV5Run(runDirectory, request);
          } else if (invocation.api === 'inspectV5Run') {
            const runDirectory = resolveFixturePointer(replies.get(invocation.run_directory_from.source_step_id), '/run_directory');
            actual = await inspectV5Run(runDirectory);
          } else fail(`unknown fixture API: ${invocation.api}`);
          if (step.api === 'inject_crash') fail(`crash injection returned an API reply at ${step.crash_point}`);
          if (typeof options.onReply === 'function') await options.onReply(structuredClone(actual), { fixture_id: fixture.fixture_id, step_id: step.step_id });
          const replySchemaIssues = validateAgainstSchema(actual, replySchema);
          if (replySchemaIssues.length > 0) {
            const branch = replySchema.oneOf.find((candidate) => candidate.properties?.reply_contract_id?.const === actual.reply_contract_id);
            const branchIssues = branch ? validateAgainstSchema(actual, { ...branch, $defs: replySchema.$defs }) : [];
            fail(`public reply violates generated Reply oneOf: ${canonicalV5Stringify({ replySchemaIssues, branchIssues, reply_contract_id: actual.reply_contract_id })}`);
          }
          assertExpectedReply(actual, expected.reply, priorRevision);
          for (const diagnostic of actual.diagnostics ?? []) {
            if (typeof diagnostic?.code === 'string') observedDiagnosticsByFixture.get(fixture.fixture_id).add(diagnostic.code);
          }
          if (typeof actual.current_revision === 'number') priorRevision = actual.current_revision;
          replies.set(step.step_id, actual);
          const normalized = normalizeReply(actual, catalogs);
          if (expected.reply.golden_digest_file) {
            const expectedDigest = String(await readFile(path.join(fixtureRoot, validateManifestRelativePath(expected.reply.golden_digest_file)), 'utf8')).trim();
            if (canonicalObjectDigest(normalized) !== expectedDigest) fail(`golden digest differs: ${fixture.fixture_id}/${step.step_id}`);
          }
          transcript.push({ fixture_id: fixture.fixture_id, step_id: step.step_id, reply_digest: canonicalObjectDigest(normalized) });
        } catch (error) {
          if (step.api !== 'inject_crash' || !String(error.message).includes('INJECTED_CRASH')) throw new Error(`${fixture.fixture_id}/${step.step_id}: ${error.message}`, { cause: error });
        } finally {
          if (step.api === 'inject_crash') { restore(); restore = installV5DeterministicTestProfile(fixture.fixture_id); }
        }
      }
      for (const requirement of fixture.requirement_ids) requirementResults.set(requirement, requirementResults.get(requirement) + 1);
    } finally {
      restore();
      await sandbox.release();
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
  const uncoveredRuntimeErrors = contracts.policyRegistry.rules
    .filter((rule) => rule.kind === 'runtime_error')
    .filter((rule) => !rule.test_ids.some((fixtureId) => observedDiagnosticsByFixture.get(fixtureId)?.has(rule.error_code)))
    .map((rule) => `${rule.error_code} -> ${rule.test_ids.join(',')}`)
    .sort();
  const partialRun = Array.isArray(options.fixtureIds);
  if (!partialRun && uncoveredRuntimeErrors.length > 0) fail(`Registry runtime errors lack executable leaf triggers: ${uncoveredRuntimeErrors.join('; ')}`);
  if (!partialRun && [...requirementResults.values()].some((count) => count < 2)) fail('not all C01-C16 requirement groups executed positive and negative leaves');
  const executedRequirements = [...requirementResults.values()].filter((count) => count > 0).length;
  const summary = { schema_version: '5.0.0', requirement_groups_passed: partialRun ? executedRequirements : requirementResults.size, fixture_leaves_passed: partialRun ? executedFixtureCount : manifest.fixtures.length, transcript_digest: canonicalObjectDigest(transcript) };
  return options.includeTranscript === true ? { ...summary, transcript } : summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifestPath = process.argv[2];
  if (!manifestPath || process.argv.length !== 3) fail('usage: node test/fixtures-v5-runner.mjs tests/fixtures/v5/manifest.json');
  const summary = await runV5FixtureManifest(manifestPath);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
