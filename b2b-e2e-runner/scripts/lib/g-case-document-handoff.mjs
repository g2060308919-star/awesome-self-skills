import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateTestCases } from './contracts.mjs';

const VERSIONS = new Map([
  ['4.0.0', '0.5.0'], ['4.2.0', '0.7.0'], ['4.3.0', '0.8.0'],
  ['4.3.1', '0.8.1'], ['4.3.2', '0.8.2']
]);

function fail(message) {
  const error = new Error(`G 交接无效：${message}`);
  error.code = 'INPUT_CONTRACT';
  throw error;
}

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function readVersion(value) {
  if (VERSIONS.get(value?.schema_version) !== value?.compiler_version) fail('版本组合不受支持');
}

async function readCanonicalArtifact(manifestPath, field) {
  const manifestBytes = await readFile(manifestPath);
  let manifest;
  try { manifest = JSON.parse(manifestBytes); }
  catch { fail('交付指针不是合法 JSON'); }
  readVersion(manifest);
  if (manifest.authority !== 'canonical') fail('交付指针不是规范产物');
  const artifact = manifest[field];
  if (!artifact || typeof artifact.path !== 'string'
    || !/^output\/r\d{3,}\/[^/]+\.json$/u.test(artifact.path)
    || !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest)) fail('规范产物路径或摘要缺失');
  const runRoot = path.basename(manifestPath) === 'current.json'
    ? path.dirname(path.dirname(manifestPath)) : path.dirname(manifestPath);
  const bytes = await readFile(path.join(runRoot, artifact.path));
  if (hash(bytes) !== artifact.digest) fail('规范产物摘要不匹配');
  let value;
  try { value = JSON.parse(bytes); }
  catch { fail('规范产物不是合法 JSON'); }
  readVersion(value);
  if (value.schema_version !== manifest.schema_version
    || value.compiler_version !== manifest.compiler_version) fail('产物版本与指针不一致');
  return { manifest, manifestBytes, value };
}

/** Pure shape mapping only. Execution authority is established by init-g's
 * G delivery verification before this function is used for a Run. */
export function projectGCaseToRunnerCase(source, moduleName) {
  const id = source?.case_id;
  if (!moduleName || !Array.isArray(source?.steps) || !Array.isArray(source?.oracles)) {
    fail(`用例 ${id ?? '<缺失>'} 缺少模块或步骤`);
  }
  const stepIds = new Set(source.steps.map(step => step.step_id));
  if (stepIds.size !== source.steps.length
    || source.oracles.some(oracle => !stepIds.has(oracle.observe_after_step_id))) {
    fail(`用例 ${id} 的 Oracle 与步骤关系不完整`);
  }
  const steps = source.steps.map(step => {
    const oracles = source.oracles.filter(oracle => oracle.observe_after_step_id === step.step_id);
    if (oracles.length === 0) fail(`步骤 ${id}/${step.step_id} 没有可交接的 Oracle`);
    return {
      step_id: step.step_id, action: step.action,
      expected: oracles.map(oracle => ({
        oracle_id: oracle.oracle_id, text: oracle.expected,
        source_claim_ids: structuredClone(oracle.claim_ids), surface: oracle.surface
      }))
    };
  });
  const preconditions = [...(source.business_preconditions ?? []), ...(source.data_conditions ?? [])]
    .map(item => item.description);
  const sourceClaimIds = [...new Set(source.oracles.flatMap(oracle => oracle.claim_ids ?? []))].sort();
  return {
    case_id: source.case_id, module: moduleName, title: source.title,
    preconditions, steps, source_claim_ids: sourceClaimIds,
    test_values: structuredClone(source.test_values ?? []),
    source_case: structuredClone(source)
  };
}

/**
 * Project an already confirmed G Case Document and Execution Plan into the
 * R 2.0 input contract. This does not approve execution or inspect a site.
 */
export async function loadGCaseDocumentHandoff({ caseManifestPath, planManifestPath, gCompilerPath, suite }) {
  if (!caseManifestPath || !planManifestPath || !gCompilerPath || !suite) {
    fail('缺少 G 编译器、交付指针或已确认的测试套件');
  }
  if (![caseManifestPath, planManifestPath].every(item =>
    path.basename(item) === 'current.json' && path.basename(path.dirname(item)) === 'output')) {
    fail('只能从 G 当前正式交付指针接入');
  }
  // G owns the complete schema, semantic and delivery gates. Hash checks
  // below are defense in depth; they alone cannot authorize a forged plan.
  let compiler;
  try { compiler = await import(pathToFileURL(path.resolve(gCompilerPath)).href); }
  catch { fail('无法加载具备只读交付校验入口的 G 编译器'); }
  if (typeof compiler.verifyCaseDocumentDeliveryV4 !== 'function'
    || typeof compiler.verifyExecutionPlanDeliveryV4 !== 'function') {
    fail('G 编译器版本缺少正式交付校验入口');
  }
  const caseRoot = path.dirname(path.dirname(caseManifestPath));
  const planRoot = path.dirname(path.dirname(planManifestPath));
  let verifiedCase;
  let verifiedPlan;
  try {
    verifiedCase = await compiler.verifyCaseDocumentDeliveryV4(caseRoot);
    verifiedPlan = await compiler.verifyExecutionPlanDeliveryV4(planRoot, {
      resolve_case_document: async () => ({
        manifest_bytes: await readFile(caseManifestPath, 'utf8'),
        bundle_bytes: verifiedCase.artifacts.bundle
      })
    });
  } catch {
    fail('G 官方 Case Document 或 Execution Plan 校验未通过');
  }
  const [document, execution] = await Promise.all([
    readCanonicalArtifact(caseManifestPath, 'bundle'),
    readCanonicalArtifact(planManifestPath, 'execution_plan_artifact')
  ]);
  if (!same(document.manifest, verifiedCase.manifest)
    || !same(document.value, JSON.parse(verifiedCase.artifacts.bundle))
    || !same(execution.manifest, verifiedPlan.manifest)
    || !same(execution.value, verifiedPlan.execution_plan)) {
    fail('正式校验后交付材料发生变化');
  }
  const bundle = document.value;
  const plan = execution.value;
  if (document.manifest.delivery_intent !== 'case_document'
    || bundle.delivery_intent !== 'case_document'
    || execution.manifest.delivery_intent !== 'execution_plan'
    || plan.delivery_intent !== 'execution_plan'
    || plan.status !== 'finished' || plan.result_kind !== 'execution_ready'
    || plan.runner_ready !== true || execution.manifest.runner_ready !== true) {
    fail('没有已完成且可执行的正式执行清单');
  }
  const ref = plan.case_document_ref;
  if (ref?.run_id !== document.manifest.run_id
    || ref.revision !== document.manifest.revision
    || ref.revision !== bundle.source_revision
    || ref.manifest_digest !== hash(document.manifestBytes)
    || ref.bundle_digest !== document.manifest.bundle.digest) fail('执行清单未绑定当前 Case Document');
  if (!same(plan.runner_projection, execution.manifest.runner_projection)
    || !Array.isArray(plan.runner_projection?.case_ids)
    || plan.runner_projection.case_ids.length === 0
    || plan.runner_projection.case_ids_digest !== hash(JSON.stringify(plan.runner_projection.case_ids))) {
    fail('执行投影摘要或交付指针不一致');
  }
  if (!Array.isArray(bundle.ordered_case_ids) || !Array.isArray(bundle.cases)
    || !Array.isArray(bundle.scope_manifest?.modules)
    || new Set(bundle.ordered_case_ids).size !== bundle.ordered_case_ids.length
    || !same(bundle.ordered_case_ids, bundle.cases.map(item => item.case_id))) {
    fail('Case Document 用例顺序不一致');
  }
  const caseById = new Map(bundle.cases.map(item => [item.case_id, item]));
  const moduleById = new Map(bundle.scope_manifest.modules.map(item => [item.module_id, item]));
  const selected = new Set(plan.runner_projection.case_ids);
  if (selected.size !== plan.runner_projection.case_ids.length
    || !same(plan.runner_projection.case_ids, bundle.ordered_case_ids.filter(id => selected.has(id)))) {
    fail('执行用例不符合原交付顺序');
  }
  const planItems = new Map(plan.items?.map(item => [item.case_id, item]) ?? []);
  const cases = plan.runner_projection.case_ids.map(id => {
    const source = caseById.get(id);
    const item = planItems.get(id);
    if (!source || source.semantic_status !== 'Grounded'
      || item?.semantic_status !== 'Grounded' || item.disposition !== 'execute'
      || item.ready !== true) {
      fail(`用例 ${id} 未获正式执行确认`);
    }
    return projectGCaseToRunnerCase(source, moduleById.get(source.module_id)?.name);
  });
  const projected = {
    schema_version: '2.0',
    suite: { ...structuredClone(suite), g_case_document_ref: structuredClone(ref) },
    cases
  };
  validateTestCases(projected);
  return projected;
}
