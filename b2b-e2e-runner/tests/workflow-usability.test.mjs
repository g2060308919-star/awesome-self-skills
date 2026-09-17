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

test("proxy preparation is skipped when unused and never implies silent restart or fallback", async () => {
  const content = await read("references/proxy-protocol.md");
  for (const text of ["不需要代理", "跳过", "remote-debugging-pipe", "browserUrl", "登录前", "重新登录", "不是代理效果验证", "不得要求用户查端口"]) assert.ok(content.includes(text), text);
});
