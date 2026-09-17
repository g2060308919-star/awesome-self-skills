import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "assets/report-template.md",
  "references/workflow.md",
  "references/artifact-contract.md",
  "references/result-model.md",
  "references/proxy-protocol.md",
  "references/security-and-evidence.md",
  "scripts/run-artifacts.mjs",
  "scripts/lib/permission-batches.mjs",
  "scripts/lib/report-model.mjs",
  "scripts/lib/report-html.mjs",
  "scripts/cdp-fetch-proxy.mjs"
];

test("AC-025: required Skill files and every Markdown reference exist", async () => {
  await Promise.all(required.map(relative => access(path.join(skillRoot, relative))));
  const markdownFiles = required.filter(file => file.endsWith(".md"));
  for (const relative of markdownFiles) {
    const source = await readFile(path.join(skillRoot, relative), "utf8");
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g)) {
      const target = match[1].split("#")[0];
      await access(path.resolve(path.dirname(path.join(skillRoot, relative)), target));
    }
  }
});

test("TASK-01: compact main instruction routes the required workflow and hard constraints", async () => {
  const skill = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.equal(skill.split("\n").length <= 180, true, "SKILL.md should remain compact");
  for (const phrase of [
    "Chrome DevTools MCP",
    "一次性确认",
    "expected[].text",
    "10 个不同结果页",
    "targetId",
    "不得自动重放",
    "清理"
  ]) assert.equal(skill.includes(phrase), true, phrase);
  for (const reference of required.filter(file => file.startsWith("references/"))) {
    assert.equal(skill.includes(reference), true, reference);
  }
});

test("portable Skill files contain no development-machine absolute paths", async () => {
  for (const relative of required) {
    const source = await readFile(path.join(skillRoot, relative), "utf8");
    assert.equal(/\/Users\/|\/home\/|[A-Z]:\\\\Users\\/.test(source), false, relative);
  }
});

test("report template contains the exact fixed five-column table", async () => {
  const template = await readFile(path.join(skillRoot, "assets/report-template.md"), "utf8");
  assert.equal(template.includes("| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |"), true);
});
