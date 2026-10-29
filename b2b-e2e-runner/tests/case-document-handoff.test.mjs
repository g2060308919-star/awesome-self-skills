import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadGCaseDocumentHandoff } from "../scripts/lib/g-case-document-handoff.mjs";
import { initializeRun } from "../scripts/run-artifacts.mjs";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function gCase(id, extras = {}) {
  return {
    case_id: id, title: id, module_id: "module", semantic_status: "Grounded",
    business_preconditions: [], data_conditions: [], test_values: [],
    steps: [{ step_id: `S-${id}`, action: `执行 ${id}` }],
    oracles: [{
      oracle_id: `O-${id}`, observe_after_step_id: `S-${id}`,
      surface: "ui", expected: `看到 ${id}`, claim_ids: [`CLM-${id}`]
    }],
    ...extras
  };
}

async function writeDelivery(root, cases) {
  const bundle = {
    schema_version: "4.3.3", compiler_version: "0.8.3", delivery_intent: "case_document",
    source_revision: 1, ordered_case_ids: cases.map(item => item.case_id), cases,
    scope_manifest: { modules: [{ module_id: "module", name: "示例模块" }] }
  };
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  const manifest = {
    schema_version: "4.3.3", compiler_version: "0.8.3", authority: "canonical",
    delivery_intent: "case_document", run_id: "run-cases", revision: 3,
    bundle: { path: "output/r001/case-document.json", digest: hash(bundleBytes) }
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  await mkdir(path.join(root, "output/r001"), { recursive: true });
  await writeFile(path.join(root, "output/r001/case-document.json"), bundleBytes);
  await writeFile(path.join(root, "output/current.json"), manifestBytes);
  const compilerPath = path.join(root, "compiler.mjs");
  await writeFile(compilerPath, `import { readFile } from "node:fs/promises";
export async function verifyCaseDocumentDeliveryV4() {
  const manifest = JSON.parse(await readFile(new URL("./output/current.json", import.meta.url), "utf8"));
  const bundle = await readFile(new URL("./output/r001/case-document.json", import.meta.url), "utf8");
  return { manifest, artifacts: { bundle } };
}
`);
  return { caseManifestPath: path.join(root, "output/current.json"), compilerPath, bundleBytes, manifestBytes };
}

const suite = { name: "交接", target_urls: ["https://staging.example.test"] };

test("an unfinished, partial, or inconsistent execution plan still projects every ordered case", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "case-handoff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    gCase("C-1"),
    gCase("C-2", { semantic_status: "Blocked" }),
    gCase("C-3")
  ];
  const delivery = await writeDelivery(root, cases);
  const projected = await loadGCaseDocumentHandoff({
    ...delivery, planManifestPath: path.join(root, "missing-plan/output/current.json"), gCompilerPath: delivery.compilerPath, suite
  });
  assert.equal(projected.schema_version, "2.0");
  assert.deepEqual(projected.cases.map(item => item.case_id), ["C-1", "C-2", "C-3"]);
  assert.deepEqual(projected.cases.map(item => item.steps[0].expected[0].text), ["看到 C-1", "看到 C-2", "看到 C-3"]);
  const omitted = await loadGCaseDocumentHandoff({ caseManifestPath: delivery.caseManifestPath, gCompilerPath: delivery.compilerPath, suite });
  assert.deepEqual(omitted.cases.map(item => item.case_id), ["C-1", "C-2", "C-3"]);
});

test("a Case Document digest or structure error still rejects the handoff", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "case-handoff-bad-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const delivery = await writeDelivery(root, [gCase("C-1")]);
  const original = await readFile(path.join(root, "output/r001/case-document.json"));
  await writeFile(path.join(root, "output/r001/case-document.json"), Buffer.from(`${original.toString("utf8")}\n`));
  await assert.rejects(loadGCaseDocumentHandoff({
    caseManifestPath: delivery.caseManifestPath, gCompilerPath: delivery.compilerPath, suite
  }), /摘要不匹配/u);
  await writeFile(path.join(root, "output/r001/case-document.json"), original);
  const broken = gCase("C-1");
  broken.oracles[0].observe_after_step_id = "missing-step";
  const brokenDelivery = await writeDelivery(path.join(root, "broken"), [broken]);
  await assert.rejects(loadGCaseDocumentHandoff({
    caseManifestPath: brokenDelivery.caseManifestPath, gCompilerPath: brokenDelivery.compilerPath, suite
  }), /Oracle|步骤/u);
  const oldCompiler = path.join(root, "old-compiler.mjs");
  await writeFile(oldCompiler, "export const advanceStrict = () => {};\n");
  await assert.rejects(loadGCaseDocumentHandoff({
    caseManifestPath: delivery.caseManifestPath, gCompilerPath: oldCompiler, suite
  }), /版本缺少正式交付校验入口/u);
});

test("init --cases keeps file order and the existing excluded meaning", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "init-cases-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const casesPath = path.join(root, "cases.json");
  const input = {
    schema_version: "2.0",
    suite: { name: "文件输入", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "KEEP-1", module: "模块", title: "第一条", preconditions: [], steps: [{ action: "打开", expected: [{ text: "看到第一条" }] }] },
      { case_id: "SKIP-2", module: "模块", title: "预先排除", excluded: true, preconditions: [], steps: [{ action: "不执行", expected: [{ text: "不检查" }] }] }
    ]
  };
  await writeFile(casesPath, JSON.stringify(input));
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "b2b-e2e-current" });
  const frozen = JSON.parse(await readFile(path.join(run.runRoot, "test-cases.json"), "utf8"));
  const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
  assert.deepEqual(frozen.cases.map(item => item.case_id), ["KEEP-1", "SKIP-2"]);
  assert.equal(frozen.cases[1].excluded, true);
  assert.equal(log.cases[0].result, "undetermined");
  assert.equal(log.cases[1].result, "not_executed");
  assert.equal(log.cases[1].checkpoints[0].status, "skipped");
});
