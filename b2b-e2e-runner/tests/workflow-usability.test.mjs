import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("preflight separates ordinary login from special permissions and accepts a natural reply", async () => {
  const workflow = await read("references/workflow.md");
  for (const text of ["不创建“通用配置账号”", "现在能用", "之后准备", "本次提供不了", "例如可以这样回复", "role_independent_case_ids", "没有特殊权限组"]) assert.ok(workflow.includes(text), text);
  assert.ok(!workflow.includes("没有任何已就绪权限组时不得初始化正式 Run；提示先准备至少一个组"));
});

test("upload, screenshot recovery and meaningful exploration have concrete non-bypass paths", async () => {
  const workflow = await read("references/workflow.md");
  for (const text of ["archive-screenshot", "真实图片返回值", "工具允许的临时目录", "不得反复重试同一个被拒路径", "upload_file", "已选择文件", "上传成功", "业务保存", "create-test-image", "详情", "合法候选", "不得猜测 ID", "用户独占"]) assert.ok(workflow.includes(text), text);
});

test("internal stage generation is distinct from external delivery on explicit Run termination", async () => {
  for (const name of ["SKILL.md", "references/workflow.md", "references/result-model.md"]) {
    const content = await read(name);
    assert.match(content, /不.*(?:展示|发送).*(?:报告|全表)/, name);
    assert.match(content, /明确.*(?:结束|终止)/, name);
    assert.ok(content.includes("deliver"), name);
  }
});

test("shared connectivity is prepared before login without interception or an implicit restart", async () => {
  const content = await read("references/proxy-protocol.md");
  for (const text of ["首次未登录启动", "不跳过", "不启用 Fetch", "remote-debugging-pipe", "browserUrl", "重新登录", "不是代理效果验证", "不得要求用户查端口"]) assert.ok(content.includes(text), text);
});

test("R12 A36: instructions expose one workflow and preserve connection, assertion and observation boundaries", async () => {
  const files = ["SKILL.md", "references/workflow.md", "references/artifact-contract.md", "references/result-model.md", "references/proxy-protocol.md", "references/security-and-evidence.md"];
  const contents = await Promise.all(files.map(read));
  for (const [index, content] of contents.entries()) {
    for (const command of content.matchAll(/--workflow-profile\s+([^\s`]+)/g)) {
      assert.equal(command[1], "b2b-e2e-current", `${files[index]} exposes another workflow`);
    }
    assert.doesNotMatch(content, /permission-batches-html-v[123]/, files[index]);
  }
  const contract = contents[2];
  for (const text of ["browser-session.mjs prepare", "browser-session.mjs discover", "browser-session.mjs bind", "不自行启动", "当前 bind CLI 只实现 marker 路径", "checkpoint_semantics", "preparation_adjustment", "assertion_domain", "page_observation_refs", "previous_decision_ref", "isolation_unknown"]) {
    assert.ok(contents.join("\n").includes(text), text);
  }
  assert.ok(contract.includes("不重放业务写入"));
  assert.ok(contract.includes("后台或权限专属断言不能由模拟升级为通过"));
});
