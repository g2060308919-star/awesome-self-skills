# Run 产物契约

## 输入与快照

最低输入为 `schema_version: "2.0"`、带 `name`/`target_urls` 的 `suite` 和非空 `cases`。每条 case 有唯一原始 `case_id`、`module`、`title`、`preconditions`、非空 `steps`；每个 step 有 `action` 与非空 `expected`；每个 oracle 有唯一语义 `text`。保留全部已有 ID 与额外字段；缺失 step/oracle ID 依输入顺序稳定生成。非法字段在浏览器操作前以 JSON 路径报错。

`init` 排他创建 `<WORKSPACE_ROOT>/b2b-e2e-runs/<timestamp-random>/`，写入 `test-cases.json`、`execution-log.json` 和 `evidence/`。快照写入后以 SHA-256 固化；随后不得修改。源文件变化不影响 Run，重跑必须新建 Run。

## execution-log.json

日志只引用用例 ID，不复制正文。它保存 schema、Run ID/状态/时间、快照哈希、MCP 预检、Target 所有权、角色观察、代理状态/验证、证据与清理总态，以及有序关键事件。检查点事件至少包含 checkpoint ID、状态、四态结果、语义原因、实际观察、证据状态、证据引用、阻塞和时间。还要记录实际执行顺序、动态样本锁定/替换、用户协助和清理事实。

每次 MCP 预检、登录/角色变化、代理变化、关键动作/效果、检查点、阻塞/协助、样本变化和清理后立即用 `record` 更新。写入采用同目录临时文件、完整序列化、fsync、原子 rename；任何时刻正式 JSON 都可解析。

## CLI

路径均可为绝对路径并支持空格：

```text
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs record --run <RUN_ROOT> --event <EVENT_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs resume-check --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs validate --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs report --run <RUN_ROOT>
```

stdout 恰好一个 JSON。退出码：0 成功、2 输入契约、3 一致性、4 秘密扫描、5 文件系统。错误信息必须脱敏。

`resume-check` 检查哈希、日志和最后事件，列出派发未确认的副作用动作并禁止自动重放，同时要求复核页面、角色和代理。

`validate` 检查快照哈希、schema、ID 唯一与引用、事件顺序、四态、计数、代理/清理结构、证据路径边界与存在性及秘密。`report` 只读 `test-cases.json` 与 `execution-log.json`，派生 Markdown；人工修改报告不会改变事实。

## 证据引用

路径必须是 Run 根目录下以 `evidence/` 开头的相对普通文件，禁止绝对路径、`..` 越界和符号链接。每份证据有 ID、时间、描述、支持的检查点，并且只提供相对路径或内联结构化内容之一。详细安全规则见 [security-and-evidence.md](security-and-evidence.md)。
