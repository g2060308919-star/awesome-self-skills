# Run 产物契约

## 输入与快照

最低输入为 `schema_version: "2.0"`、带 `name`/`target_urls` 的 `suite` 和非空 `cases`。每条 case 有唯一原始 `case_id`、`module`、`title`、`preconditions`、非空 `steps`；每个 step 有 `action` 与非空 `expected`；每个 oracle 有唯一语义 `text`。保留全部已有 ID 与额外字段；缺失 step/oracle ID 依输入顺序稳定生成。非法字段在浏览器操作前以 JSON 路径报错。

`init` 排他创建 `<WORKSPACE_ROOT>/b2b-e2e-runs/<timestamp-random>/`，写入 `test-cases.json`、`execution-log.json` 和 `evidence/`。快照写入后以 SHA-256 固化；随后不得修改。源文件变化不影响 Run，重跑必须新建 Run。

## execution-log.json

日志只引用用例 ID，不复制正文。它保存 schema、Run ID/状态/时间、快照哈希、MCP 预检、Target 所有权、角色观察、代理状态/验证、证据与清理总态，以及有序关键事件。检查点事件至少包含 checkpoint ID、状态、四态结果、语义原因、实际观察、证据状态、证据引用、阻塞和时间。还要记录实际执行顺序、动态样本锁定/替换、用户协助和清理事实。

每次 MCP 预检、登录/角色变化、代理变化、关键动作/效果、检查点、阻塞/协助、样本变化和清理后立即用 `record` 更新。写入采用同目录临时文件、完整序列化、fsync、原子 rename；任何时刻正式 JSON 都可解析。

新 Run 使用 profile `permission-batches-html-v1`。`init` 将 `workflow_profile` 写为首个事件；随后在任何业务开始前记录一次 `permission_plan`：

- `version: "1.0"`；`groups` 是本轮实际权限组数组；`role_independent_case_ids` 是确实不依赖角色的原 case ID。
- 每组必须包含唯一 `group_id`、用例角色原文 `role_text`、非空 `permissions`、原 `case_ids`、完整 `checkpoint_ids`、`availability`、无秘密 `account_ref`、`preparation_owner` 和声明摘要 `declaration`。`ready` 必须有账号引用；`user_preparation_required` 的准备者必须是 `user`。
- 组数、状态分布及账号映射不限；组与账号不要求一一对应。组覆盖加无角色用例必须完整覆盖快照，不能改写或复制用例。

后续事件沿用 `record`：

| 事件 | 必填字段与语义 |
|---|---|
| `permission_availability` | `group_id`、三态 `availability`、`account_ref`、用户明确说明的无秘密 `declaration` |
| `permission_batch` | `group_id`、`phase`（`started` / `waiting` / `drained`）、事实 `description` |
| `permission_wait` | `group_id`、仍未完成且属于该组的 `checkpoint_ids`、具体 `reason`；不伪造执行结果 |
| `role_observation` | `observation` 中含 `group_id`、`account_ref`、`verification`（`verified` / `mismatch`）、页面事实 `description` |
| `resume_check` | 由 `resume-check` 自动写入，用来使恢复前的角色核验失效 |

`assistance` 可用 `permission_decision: "stop_waiting"` 和明确 `group_ids` 记录用户决定本轮不再等待；这不等于 `unavailable`。权限原因直接结束检查点时，`checkpoint_result.permission_group_ids` 保留精确组引用。未知组/检查点、未知版本、缺失覆盖、未就绪或未实际核验就开始、等待覆盖已完成项、以及仍有未处理检查点时完成 Run 都拒绝。

有效示例：先记录待准备组的 `permission_availability` 为 `ready`，再记录页面事实为 `verified`，然后开始其检查点。拒绝示例：只因用户说“好了”便直接写 `checkpoint_started`；没有新鲜角色核验时必须失败关闭。

## CLI

路径均可为绝对路径并支持空格：

```text
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON> --workflow-profile permission-batches-html-v1
node <SKILL_ROOT>/scripts/run-artifacts.mjs record --run <RUN_ROOT> --event <EVENT_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs resume-check --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs validate --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs report --run <RUN_ROOT>
```

stdout 恰好一个 JSON。退出码：0 成功、2 输入契约、3 一致性、4 秘密扫描、5 文件系统。错误信息必须脱敏。

`resume-check` 检查哈希、日志和最后事件，列出派发未确认的副作用动作并禁止自动重放，同时要求复核页面、角色和代理。

`validate` 检查快照哈希、schema、ID 唯一与引用、事件顺序、权限计划/迁移、四态、计数、代理/清理结构、证据路径边界与存在性及秘密。`report` 从同一次 `test-cases.json` 与 `execution-log.json` 读取建立共享模型，派生 `report.md` 和 `report.html`；人工修改报告不会改变事实。

`report` 的单 JSON stdout 保留 `runId`、`counts` 和 `reportPath`；`reportPath` 仍指向 Markdown，新增 `htmlReportPath` 指向 HTML。初始化或普通执行中尚无报告合法；新 profile 进入 `awaiting_user` 或 `completed` 后交付必须有两份报告且内容对应同一快照哈希和事件读取边界。无标记历史 Run 不强制有 HTML；若 HTML 已存在仍需校验。

共享报告模型负责把账本事实投影为面向评测者的语义时间线、证据说明、代理结论、清理结论和一致性结论。HTML 渲染器只消费这些语义字段，不序列化任意账本对象；机器级哈希、序号、内部状态和值域仍以 `execution-log.json` 为准。

两次 rename 不是跨文件原子事务。写到一半、只篡改一份或账本在生成期间变化都不得交付；只允许从原账本重新生成两份报告，不手改派生结果。`checkReport: false` 仅用于报告重建前忽略旧派生内容，不跳过快照、日志、证据和秘密结构检查。

## 证据引用

路径必须是 Run 根目录下以 `evidence/` 开头的相对普通文件，禁止绝对路径、`..` 越界和符号链接。每份证据有 ID、时间、描述、支持的检查点，并且只提供相对路径或内联结构化内容之一。详细安全规则见 [security-and-evidence.md](security-and-evidence.md)。
