import { createHash } from 'node:crypto';
import path from 'node:path';
import currentPointerSchema from '../skill/generate-test-cases/scripts/schemas/current-pointer.schema.json' with { type: 'json' };
import executionPlanSchema from '../skill/generate-test-cases/scripts/schemas/execution-plan.schema.json' with { type: 'json' };
import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { renderBusinessMarkdownV4 } from './business-markdown-v4.mjs';
import { canonicalStringify, digest } from './canonical.mjs';
import { renderExecutionWorksheetCsvV4 } from './canonical-output-v4.mjs';
import { validateCanonicalManifestRelations } from './contracts.mjs';
import { sortNonBlockingDiagnosticsV4 } from './non-blocking-diagnostics-v4.mjs';
import {
  atomicWriteJson, atomicWriteText, outputPaths, readText, revisionName
} from './run-store.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const BUNDLE_KEYS = Object.freeze([
  'schema_version', 'compiler_version', 'delivery_intent', 'source_revision', 'result_kind',
  'ordered_case_ids', 'scope_manifest', 'cases', 'coverage', 'semantic_root_groups',
  'exploratory', 'not_applicable', 'risk_review_ledger'
]);
const ACTIVE_ROOT_STATUSES = new Set(['presented', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery']);
const RISK_KINDS = Object.freeze([
  'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
  'long_content', 'pagination', 'refresh', 'business_permission_boundary'
]);

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {string} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** @param {unknown} input */
function normalizeInput(input) {
  if (!record(input) || Object.keys(input).some(key => !['run_id', 'completed_at', 'bundle', 'render_options', 'non_blocking_diagnostics'].includes(key))
    || typeof input.run_id !== 'string' || !input.run_id.trim()
    || typeof input.completed_at !== 'string' || !input.completed_at.trim()
    || !record(input.bundle) || !record(input.render_options)
    || !Array.isArray(input.non_blocking_diagnostics)) throw new TypeError('CANONICAL_DELIVERY_INPUT_INVALID');
  const bundle = structuredClone(input.bundle);
  const actualKeys = Object.keys(bundle).sort();
  const expectedKeys = [...BUNDLE_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])
    || bundle.schema_version !== '4.0.0' || bundle.compiler_version !== '0.5.0'
    || bundle.delivery_intent !== 'case_document' || !Number.isSafeInteger(bundle.source_revision)
    || bundle.source_revision < 0 || !Array.isArray(bundle.risk_review_ledger)) {
    throw new TypeError('CANONICAL_BUNDLE_INVALID');
  }
  if (validateAgainstSchema(bundle, testBundleSchema).length) throw new TypeError('CANONICAL_BUNDLE_INVALID');
  const projection = Object.fromEntries([
    'result_kind', 'ordered_case_ids', 'scope_manifest', 'cases', 'coverage',
    'semantic_root_groups', 'exploratory', 'not_applicable'
  ].map(key => [key, structuredClone(bundle[key])]));
  projection.render_options = structuredClone(input.render_options);
  return { value: structuredClone(input), bundle, projection };
}

/** @param {Record<string, any>} bundle */
function derivedCounts(bundle) {
  const activeRoots = bundle.semantic_root_groups.filter(
    (/** @type {any} */ root) => ACTIVE_ROOT_STATUSES.has(root.status)
  );
  return {
    case_count: bundle.cases.length,
    blocked_root_count: activeRoots.length,
    closed_for_delivery_root_count: activeRoots.filter(
      (/** @type {any} */ root) => root.status === 'closed_for_delivery'
    ).length,
    not_applicable_count: bundle.not_applicable.length,
    exploratory_count: bundle.exploratory.length
  };
}

/** The deep T06 validator establishes basis/target semantics. This final gate
 * independently checks that no required primary-module review or rendered
 * exclusion/exploration target disappeared before delivery. @param {Record<string,any>} bundle */
function validateFinalRiskReview(bundle) {
  const moduleIds = new Set(bundle.scope_manifest.modules.map((/** @type {any} */ item) => item.module_id));
  const exploratory = new Map(bundle.exploratory.map((/** @type {any} */ item) => [item.exploratory_id, item]));
  const notApplicable = new Map(bundle.not_applicable.map((/** @type {any} */ item) => [item.not_applicable_record_id, item]));
  const seen = new Set();
  for (const item of bundle.risk_review_ledger) {
    const key = `${item.module_id}\0${item.risk_kind}`;
    if (!moduleIds.has(item.module_id) || seen.has(key)) throw new TypeError('RISK_REVIEW_INCOMPLETE');
    seen.add(key);
    if (item.status === 'exploratory' && item.exploratory_ids.some(
      (/** @type {string} */ id) => exploratory.get(id)?.module_id !== item.module_id
    )) throw new TypeError('RISK_REVIEW_TARGET_MISMATCH');
    if (item.status === 'not_applicable' && item.not_applicable_record_ids.some(
      (/** @type {string} */ id) => notApplicable.get(id)?.module_id !== item.module_id
    )) throw new TypeError('RISK_REVIEW_TARGET_MISMATCH');
  }
  for (const module of bundle.scope_manifest.modules) if (module.role === 'primary') {
    for (const riskKind of RISK_KINDS) if (!seen.has(`${module.module_id}\0${riskKind}`)) {
      throw new TypeError('RISK_REVIEW_INCOMPLETE');
    }
  }
}

/** @param {Record<string,any>} manifest */
function validateManifest(manifest) {
  const diagnostics = [
    ...validateAgainstSchema(manifest, currentPointerSchema),
    ...validateCanonicalManifestRelations(manifest)
  ];
  if (diagnostics.length) throw new TypeError('CANONICAL_MANIFEST_INVALID');
}

/** @param {Record<string,any>} manifest @param {Record<string,string>} artifacts @param {any[]} nonBlockingDiagnostics */
function finishedReply(manifest, artifacts, nonBlockingDiagnostics) {
  const blockedOnly = manifest.result_kind === 'blocked_only';
  const reply = {
    status: 'finished', phase: 'delivery', run_id: manifest.run_id,
    delivery_intent: 'case_document', result_kind: manifest.result_kind,
    produced_artifacts: [
      { kind: 'case_document', path: manifest.bundle.path, digest: byteDigest(artifacts.bundle) },
      { kind: 'business_markdown', path: manifest.markdown.path, digest: byteDigest(artifacts.markdown) },
      { kind: 'execution_worksheet', path: manifest.execution_worksheet.path, digest: byteDigest(artifacts.worksheet) }
    ],
    incomplete_reason: null,
    user_next_steps: [{
      action: 'read_artifact',
      description: blockedOnly ? '查看未决业务问题报告和明确关闭的缺口。' : '查看人工功能测试用例和执行工作表。'
    }],
    recovery: {
      mode: 'create_new_run',
      description: '原始资料或实质范围改变时创建新运行；当前 canonical 交付保持不可变。'
    },
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(nonBlockingDiagnostics)
  };
  if (validateAgainstSchema(reply, { $ref: '#/$defs/finishedReply', $defs: replySchema.$defs }).length) {
    throw new TypeError('CANONICAL_FINISHED_REPLY_INVALID');
  }
  return reply;
}

/** @param {unknown} left @param {unknown} right */
function same(left, right) { return canonicalStringify(left) === canonicalStringify(right); }

/** @param {unknown} ref @returns {ref is Record<string,any>} */
function validateCaseDocumentRef(ref) {
  return record(ref) && Object.keys(ref).length === 4
    && ['run_id', 'revision', 'manifest_digest', 'bundle_digest'].every(key => Object.hasOwn(ref, key))
    && typeof ref.run_id === 'string' && Boolean(ref.run_id.trim())
    && Number.isSafeInteger(ref.revision) && ref.revision >= 0
    && /^sha256:[0-9a-f]{64}$/u.test(ref.manifest_digest)
    && /^sha256:[0-9a-f]{64}$/u.test(ref.bundle_digest);
}

/** @param {unknown} ref @param {{resolve_case_document:(ref:any)=>Promise<any>|any}} services */
async function resolveCaseDocument(ref, services) {
  if (!validateCaseDocumentRef(ref) || !record(services) || typeof services.resolve_case_document !== 'function') {
    throw new TypeError('CASE_DOCUMENT_REFERENCE_INVALID');
  }
  const snapshot = await services.resolve_case_document(structuredClone(ref));
  const manifestBytes = snapshot?.manifest_bytes;
  const bundleBytes = snapshot?.bundle_bytes;
  if (typeof manifestBytes !== 'string' || typeof bundleBytes !== 'string'
    || byteDigest(manifestBytes) !== ref.manifest_digest || byteDigest(bundleBytes) !== ref.bundle_digest) {
    throw new TypeError('CASE_DOCUMENT_DIGEST_MISMATCH');
  }
  let manifest; let bundle;
  try { manifest = JSON.parse(manifestBytes); bundle = JSON.parse(bundleBytes); } catch {
    throw new TypeError('CASE_DOCUMENT_ARTIFACT_INVALID');
  }
  if (`${canonicalStringify(manifest)}\n` !== manifestBytes || `${canonicalStringify(bundle)}\n` !== bundleBytes
    || validateAgainstSchema(manifest, currentPointerSchema).length
    || validateCanonicalManifestRelations(manifest).length
    || validateAgainstSchema(bundle, testBundleSchema).length
    || manifest.delivery_intent !== 'case_document' || manifest.authority !== 'canonical'
    || !['delivered_cases', 'delivered_with_gaps'].includes(manifest.result_kind)
    || manifest.run_id !== ref.run_id || manifest.revision !== ref.revision
    || manifest.bundle.digest !== ref.bundle_digest
    || bundle.delivery_intent !== 'case_document' || bundle.source_revision !== ref.revision
    || bundle.result_kind !== manifest.result_kind || bundle.cases.length !== manifest.case_count) {
    throw new TypeError('CASE_DOCUMENT_MANIFEST_INVALID');
  }
  return { manifest, bundle, manifest_bytes: manifestBytes, bundle_bytes: bundleBytes };
}

/** @param {unknown} input @param {{resolve_case_document:(ref:any)=>Promise<any>|any}} services */
async function normalizeExecutionInput(input, services) {
  if (!record(input) || Object.keys(input).some(key => ![
    'run_id', 'revision', 'completed_at', 'case_document_ref', 'execution_plan', 'non_blocking_diagnostics'
  ].includes(key)) || typeof input.run_id !== 'string' || !input.run_id.trim()
    || !Number.isSafeInteger(input.revision) || input.revision < 0
    || typeof input.completed_at !== 'string' || !input.completed_at.trim()
    || !Array.isArray(input.non_blocking_diagnostics) || !record(input.execution_plan)) {
    throw new TypeError('EXECUTION_DELIVERY_INPUT_INVALID');
  }
  const plan = structuredClone(input.execution_plan);
  if (validateAgainstSchema(plan, {
    $schema: executionPlanSchema.$schema,
    $defs: executionPlanSchema.$defs,
    $ref: '#/$defs/v4ExecutionPlan'
  }).length) throw new TypeError('EXECUTION_PLAN_SCHEMA_INVALID');
  if (!same(plan.case_document_ref, input.case_document_ref)
    || plan.status !== 'finished' || !['execution_ready', 'no_execution_selected'].includes(plan.result_kind)
    || typeof plan.runner_ready !== 'boolean' || !Array.isArray(plan.items) || !record(plan.runner_projection)
    || Object.keys(plan.runner_projection).some(key => !['case_ids', 'case_ids_digest'].includes(key))
    || !Array.isArray(plan.runner_projection.case_ids)
    || plan.runner_projection.case_ids_digest !== `sha256:${digest(plan.runner_projection.case_ids)}`) {
    throw new TypeError('EXECUTION_PLAN_INVALID');
  }
  const referenced = await resolveCaseDocument(input.case_document_ref, services);
  const cases = new Map(referenced.bundle.cases.map((/** @type {any} */ item) => [item.case_id, item]));
  const orderedCaseIds = referenced.bundle.ordered_case_ids;
  if (plan.items.length !== orderedCaseIds.length || new Set(plan.items.map((/** @type {any} */ item) => item?.case_id)).size !== plan.items.length) {
    throw new TypeError('EXECUTION_PLAN_INVALID');
  }
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index]; const candidate = cases.get(item?.case_id);
    if (!record(item) || Object.keys(item).some(key => !['case_id', 'semantic_status', 'disposition', 'ready'].includes(key))
      || item.case_id !== orderedCaseIds[index] || !candidate || item.semantic_status !== candidate.semantic_status
      || !['execute', 'do_not_execute'].includes(item.disposition) || typeof item.ready !== 'boolean'
      || (item.disposition === 'execute' && (item.semantic_status !== 'Grounded' || item.ready !== true))) {
      throw new TypeError('EXECUTION_PLAN_INVALID');
    }
  }
  const selected = plan.items.filter((/** @type {any} */ item) => item.disposition === 'execute')
    .map((/** @type {any} */ item) => item.case_id);
  if (!same(plan.runner_projection.case_ids, selected)
    || plan.runner_ready !== (selected.length > 0)
    || plan.result_kind !== (selected.length ? 'execution_ready' : 'no_execution_selected')) {
    throw new TypeError('EXECUTION_RUNNER_PROJECTION_INVALID');
  }
  return { value: structuredClone(input), plan, referenced };
}

/** @param {Record<string,any>} manifest @param {string} planBytes @param {any[]} diagnostics */
function executionFinishedReply(manifest, planBytes, diagnostics) {
  const reply = {
    status: 'finished', phase: 'delivery', run_id: manifest.run_id,
    delivery_intent: 'execution_plan', result_kind: manifest.result_kind,
    produced_artifacts: [{
      kind: 'execution_plan', path: manifest.execution_plan_artifact.path, digest: byteDigest(planBytes)
    }],
    incomplete_reason: null,
    user_next_steps: [{
      action: 'read_artifact',
      description: manifest.runner_ready
        ? '查看已确认的执行清单；本 Skill 不会自动启动 E2E 测试。'
        : '查看未选择执行的结论；Case Document 保持有效。'
    }],
    recovery: { mode: 'create_new_run', description: '需要改变语义或执行选择时按规范创建新运行。' },
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(diagnostics)
  };
  if (validateAgainstSchema(reply, { $ref: '#/$defs/finishedReply', $defs: replySchema.$defs }).length) {
    throw new TypeError('CANONICAL_FINISHED_REPLY_INVALID');
  }
  return reply;
}

/**
 * Produce all Case Document bytes from one closed canonical bundle. The
 * caller supplies time as system state; rendering itself is deterministic.
 * @param {unknown} input
 */
export function materializeCaseDocumentDeliveryV4(input) {
  const { value, bundle } = normalizeInput(input);
  validateFinalRiskReview(bundle);
  const bundleBytes = `${canonicalStringify(bundle)}\n`;
  // Render both human surfaces from the exact canonical JSON bytes that will
  // be persisted, not from a pre-canonical in-memory collection order.
  const canonicalBundle = JSON.parse(bundleBytes);
  const { projection } = normalizeInput({ ...value, bundle: canonicalBundle });
  const markdownBytes = renderBusinessMarkdownV4(projection);
  const worksheetBytes = renderExecutionWorksheetCsvV4(canonicalBundle, canonicalBundle.ordered_case_ids);
  const revision = canonicalBundle.source_revision;
  const prefix = `output/${revisionName(revision)}`;
  const manifest = {
    run_id: value.run_id, revision, schema_version: '4.0.0', compiler_version: '0.5.0',
    delivery_intent: 'case_document', authority: 'canonical', result_kind: canonicalBundle.result_kind,
    bundle: { path: `${prefix}/test-bundle.json`, digest: byteDigest(bundleBytes) },
    markdown: { path: `${prefix}/test-cases.md`, digest: byteDigest(markdownBytes) },
    execution_worksheet: {
      path: `${prefix}/execution-worksheet.csv`, digest: byteDigest(worksheetBytes), format: 'csv'
    },
    render_options: structuredClone(value.render_options), ...derivedCounts(canonicalBundle),
    completed_at: value.completed_at
  };
  validateManifest(manifest);
  return {
    manifest, bundle_bytes: bundleBytes, markdown_bytes: markdownBytes,
    worksheet_bytes: worksheetBytes
  };
}

/** @param {string} runDirectory @param {Record<string,any>} manifest */
async function readAndVerifyArtifacts(runDirectory, manifest) {
  validateManifest(manifest);
  if (manifest.delivery_intent !== 'case_document') throw new TypeError('CANONICAL_MANIFEST_INVALID');
  const prefix = `output/${revisionName(manifest.revision)}`;
  if (manifest.bundle.path !== `${prefix}/test-bundle.json`
    || manifest.markdown.path !== `${prefix}/test-cases.md`
    || manifest.execution_worksheet.path !== `${prefix}/execution-worksheet.csv`) {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  /** @type {Record<string,string>} */
  const artifacts = {};
  for (const [key, name] of [['bundle', 'bundle'], ['markdown', 'markdown'], ['execution_worksheet', 'worksheet']]) {
    let text;
    try { text = await readText(runDirectory, path.join(runDirectory, manifest[key].path)); } catch {
      throw new TypeError('CANONICAL_ARTIFACT_INVALID');
    }
    if (byteDigest(text) !== manifest[key].digest) throw new TypeError('CANONICAL_ARTIFACT_DIGEST_MISMATCH');
    artifacts[name] = text;
  }
  let bundle;
  try { bundle = JSON.parse(artifacts.bundle); } catch { throw new TypeError('CANONICAL_ARTIFACT_INVALID'); }
  if (`${canonicalStringify(bundle)}\n` !== artifacts.bundle) throw new TypeError('CANONICAL_ARTIFACT_INVALID');
  const normalized = normalizeInput({
    run_id: manifest.run_id, completed_at: manifest.completed_at, bundle,
    render_options: manifest.render_options, non_blocking_diagnostics: []
  });
  validateFinalRiskReview(normalized.bundle);
  if (normalized.bundle.source_revision !== manifest.revision
    || normalized.bundle.result_kind !== manifest.result_kind
    || canonicalStringify(derivedCounts(normalized.bundle)) !== canonicalStringify({
      case_count: manifest.case_count, blocked_root_count: manifest.blocked_root_count,
      closed_for_delivery_root_count: manifest.closed_for_delivery_root_count,
      not_applicable_count: manifest.not_applicable_count, exploratory_count: manifest.exploratory_count
    })) throw new TypeError('CANONICAL_ARTIFACT_INVALID');
  if (renderBusinessMarkdownV4(normalized.projection) !== artifacts.markdown
    || renderExecutionWorksheetCsvV4(normalized.bundle, normalized.bundle.ordered_case_ids) !== artifacts.worksheet) {
    throw new TypeError('CANONICAL_ARTIFACT_INVALID');
  }
  return { bundle: artifacts.bundle, markdown: artifacts.markdown, worksheet: artifacts.worksheet };
}

/**
 * Re-read current.json and every artifact it authorizes. No stale or stray
 * output path can become part of the finished response.
 * @param {string} runDirectory
 */
export async function verifyCaseDocumentDeliveryV4(runDirectory) {
  let currentText;
  try { currentText = await readText(runDirectory, path.join(runDirectory, 'output/current.json')); } catch {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  let manifest;
  try { manifest = JSON.parse(currentText); } catch { throw new TypeError('CANONICAL_MANIFEST_INVALID'); }
  if (`${canonicalStringify(manifest)}\n` !== currentText) throw new TypeError('CANONICAL_MANIFEST_INVALID');
  const artifacts = await readAndVerifyArtifacts(runDirectory, manifest);
  return { manifest, artifacts, reply: finishedReply(manifest, artifacts, []) };
}

/**
 * Publish the three immutable revision artifacts, verify exact read-back, and
 * only then make them authoritative by atomically replacing current.json.
 * @param {string} runDirectory @param {unknown} input
 */
export async function publishCaseDocumentDeliveryV4(runDirectory, input) {
  const materialized = materializeCaseDocumentDeliveryV4(input);
  const paths = outputPaths(runDirectory, materialized.manifest.revision);
  await atomicWriteText(runDirectory, paths.bundle, materialized.bundle_bytes);
  await atomicWriteText(runDirectory, paths.markdown, materialized.markdown_bytes);
  await atomicWriteText(runDirectory, paths.worksheet, materialized.worksheet_bytes);
  await readAndVerifyArtifacts(runDirectory, materialized.manifest);
  await atomicWriteJson(runDirectory, paths.current, materialized.manifest);
  const verified = await verifyCaseDocumentDeliveryV4(runDirectory);
  const value = /** @type {any} */ (input);
  return {
    ...materialized,
    reply: finishedReply(verified.manifest, verified.artifacts, value.non_blocking_diagnostics)
  };
}

/**
 * Materialize a final Execution manifest after independently resolving the
 * immutable Case Document it references.
 * @param {unknown} input @param {{resolve_case_document:(ref:any)=>Promise<any>|any}} services
 */
export async function materializeExecutionPlanDeliveryV4(input, services) {
  const { value, plan } = await normalizeExecutionInput(input, services);
  const planBytes = `${canonicalStringify(plan)}\n`;
  const prefix = `output/${revisionName(value.revision)}`;
  const manifest = {
    run_id: value.run_id, revision: value.revision, schema_version: '4.0.0', compiler_version: '0.5.0',
    delivery_intent: 'execution_plan', authority: 'canonical', result_kind: plan.result_kind,
    case_document_ref: structuredClone(value.case_document_ref),
    execution_plan_artifact: { path: `${prefix}/execution-plan.json`, digest: byteDigest(planBytes) },
    runner_projection: structuredClone(plan.runner_projection), runner_ready: plan.runner_ready,
    completed_at: value.completed_at
  };
  validateManifest(manifest);
  if (manifest.execution_plan_artifact.path !== `output/${revisionName(manifest.revision)}/execution-plan.json`) {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  return { manifest, execution_plan: plan, execution_plan_bytes: planBytes };
}

/** @param {string} runDirectory @param {{resolve_case_document:(ref:any)=>Promise<any>|any}} services */
export async function verifyExecutionPlanDeliveryV4(runDirectory, services) {
  let currentText;
  try { currentText = await readText(runDirectory, path.join(runDirectory, 'output/current.json')); } catch {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  let manifest;
  try { manifest = JSON.parse(currentText); } catch { throw new TypeError('CANONICAL_MANIFEST_INVALID'); }
  if (`${canonicalStringify(manifest)}\n` !== currentText || manifest.delivery_intent !== 'execution_plan') {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  validateManifest(manifest);
  if (manifest.execution_plan_artifact.path !== `output/${revisionName(manifest.revision)}/execution-plan.json`) {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  let planBytes;
  try { planBytes = await readText(runDirectory, path.join(runDirectory, manifest.execution_plan_artifact.path)); } catch {
    throw new TypeError('CANONICAL_ARTIFACT_INVALID');
  }
  if (byteDigest(planBytes) !== manifest.execution_plan_artifact.digest) {
    throw new TypeError('CANONICAL_ARTIFACT_DIGEST_MISMATCH');
  }
  let plan;
  try { plan = JSON.parse(planBytes); } catch { throw new TypeError('CANONICAL_ARTIFACT_INVALID'); }
  if (`${canonicalStringify(plan)}\n` !== planBytes) throw new TypeError('CANONICAL_ARTIFACT_INVALID');
  const normalized = await normalizeExecutionInput({
    run_id: manifest.run_id, revision: manifest.revision, completed_at: manifest.completed_at,
    case_document_ref: manifest.case_document_ref, execution_plan: plan, non_blocking_diagnostics: []
  }, services);
  if (manifest.result_kind !== normalized.plan.result_kind
    || manifest.runner_ready !== normalized.plan.runner_ready
    || !same(manifest.runner_projection, normalized.plan.runner_projection)) {
    throw new TypeError('EXECUTION_MANIFEST_INVALID');
  }
  return {
    manifest, execution_plan: plan, execution_plan_bytes: planBytes,
    reply: executionFinishedReply(manifest, planBytes, [])
  };
}

/** @param {string} runDirectory @param {unknown} input @param {{resolve_case_document:(ref:any)=>Promise<any>|any}} services */
export async function publishExecutionPlanDeliveryV4(runDirectory, input, services) {
  const materialized = await materializeExecutionPlanDeliveryV4(input, services);
  const paths = outputPaths(runDirectory, materialized.manifest.revision);
  await atomicWriteText(runDirectory, paths.executionPlan, materialized.execution_plan_bytes);
  // Re-run reference and plan verification before granting current authority.
  await normalizeExecutionInput(input, services);
  await atomicWriteJson(runDirectory, paths.current, materialized.manifest);
  const verified = await verifyExecutionPlanDeliveryV4(runDirectory, services);
  const value = /** @type {any} */ (input);
  return {
    ...materialized,
    reply: executionFinishedReply(
      verified.manifest, verified.execution_plan_bytes, value.non_blocking_diagnostics
    )
  };
}
