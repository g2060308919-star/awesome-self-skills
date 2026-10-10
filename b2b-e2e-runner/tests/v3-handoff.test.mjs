import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeRun } from "../scripts/run-artifacts.mjs";

test("E02 frozen runner input retains source value origins, comparison rules and read-only setup", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "runner-handoff-"));
  try {
    const cases = [
      { case_id: "fixed", module: "样本", title: "固定样本", source_claim_ids: ["CLM-fixed"],
        preconditions: ["使用需求指定的文件 A，不可替换"],
        test_values: [{ value: "A", value_origin: { kind: "requirement", claim_ids: ["CLM-fixed"] } }],
        steps: [{ step_id: "load", action: "上传指定文件 A", expected: [{ oracle_id: "result", text: "系统接受指定文件 A" }] }] },
      { case_id: "replaceable", module: "查询", title: "可替换示例", source_claim_ids: ["CLM-example"],
        preconditions: ["存在名称精确匹配样本和一个前缀相似干扰项"],
        test_values: [{ value: "示例名称", value_origin: { kind: "example", claim_ids: ["CLM-example"], replaceable: true },
          binding_constraint: "仅替换样本实体；保留名称查询和前缀干扰关系" }],
        steps: [{ step_id: "search", action: "按原示例名称查询", expected: [{ oracle_id: "match", text: "只显示名称精确匹配项，不显示前缀相似项" }] }] },
      { case_id: "literal", module: "提示", title: "逐字提示", source_claim_ids: ["CLM-literal"], preconditions: [],
        steps: [{ step_id: "upload", action: "上传超限文件", expected: [{ oracle_id: "message", text: "拦截上传并逐字显示：文件超过 5MB" }] }] },
      { case_id: "meaning", module: "提示", title: "含义提示", source_claim_ids: ["CLM-meaning"], preconditions: [],
        steps: [{ step_id: "upload", action: "上传超限文件", expected: [{ oracle_id: "message", text: "拦截上传；提示必须说明 5MB 上限，措辞可不同" }] }] },
      { case_id: "readonly", module: "券", title: "系统回填", source_claim_ids: ["CLM-readonly"],
        preconditions: ["准备有效期符合要求的券样本"],
        steps: [{ step_id: "query", action: "查询券并观察系统回填的只读有效期", expected: [{ oracle_id: "expiry", text: "有效期来自所查券且不可编辑" }] }] }
    ];
    const input = { schema_version: "2.0", suite: { name: "非敏感交接夹具", target_urls: ["https://staging.example.test"] }, cases };
    const casesPath = path.join(workspace, "cases.json");
    await writeFile(casesPath, JSON.stringify(input));
    const run = await initializeRun({ workspaceRoot: workspace, casesPath, workflowProfile: "permission-batches-html-v3" });
    const frozen = JSON.parse(await readFile(path.join(run.runRoot, "test-cases.json"), "utf8"));
    assert.deepEqual(frozen.cases, cases);
    assert.deepEqual(frozen.cases.map(item => item.case_id), ["fixed", "replaceable", "literal", "meaning", "readonly"]);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
