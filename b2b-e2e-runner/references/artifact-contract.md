# Run 产物契约

## 输入与快照

最低输入为 `schema_version: "2.0"`、带 `name`/`target_urls` 的 `suite` 和非空 `cases`。每条 case 有唯一原始 `case_id`、`module`、`title`、`preconditions`、非空 `steps`；每个 step 有 `action` 与非空 `expected`；每个 oracle 有唯一语义 `text`。保留全部已有 ID 与额外字段；缺失 step/oracle ID 依输入顺序稳定生成。非法字段在浏览器操作前以 JSON 路径报错。

`init` 排他创建 `<WORKSPACE_ROOT>/b2b-e2e-runs/<timestamp-random>/`，写入 `test-cases.json`、`execution-log.json` 和 `evidence/`。快照写入后以 SHA-256 固化；随后不得修改。源文件变化不影响 Run，重跑必须新建 Run。

## execution-log.json

日志只引用用例 ID，不复制正文。它保存 schema、Run ID/状态/时间、快照哈希、MCP 预检、Target 所有权、角色观察、代理状态/验证、证据与清理总态，以及有序关键事件。检查点事件至少包含 checkpoint ID、状态、四态结果、语义原因、实际观察、证据状态、证据引用、阻塞和时间。还要记录实际执行顺序、动态样本锁定/替换、用户协助和清理事实。

每次 MCP 预检、登录/角色变化、代理变化、关键动作/效果、检查点、阻塞/协助、样本变化和清理后立即用 `record` 更新。写入采用同目录临时文件、完整序列化、fsync、原子 rename；任何时刻正式 JSON 都可解析。

新建正式 Run 使用 profile `permission-batches-html-v2`。`init` 将 `workflow_profile` 写为首个事件；随后在任何业务开始前记录一次 `permission_plan`。历史 v1 和无 profile Run 保持原校验、恢复及报告语义，不自动迁移、删改或借删除 profile 降级。未知 profile 拒绝。

权限计划契约保持不变：

- `version: "1.0"`；`groups` 是本轮实际权限组数组；`role_independent_case_ids` 是确实不依赖角色的原 case ID。
- 每组必须包含唯一 `group_id`、用例角色原文 `role_text`、非空 `permissions`、原 `case_ids`、完整 `checkpoint_ids`、`availability`、无秘密 `account_ref`、`preparation_owner` 和声明摘要 `declaration`。`ready` 必须有账号引用；`user_preparation_required` 的准备者必须是 `user`。
- 组数、状态分布及账号映射不限；组与账号不要求一一对应。组覆盖加无角色用例必须完整覆盖快照，不能改写或复制用例。

后续事件沿用 `record`：

| 事件 | 必填字段与语义 |
|---|---|
| `permission_availability` | `group_id`、三态 `availability`、`account_ref`、用户明确说明的无秘密 `declaration` |
| `permission_batch` | `group_id`、`phase`（`started` / `waiting` / `drained`）、事实 `description` |
| `permission_wait` | v2 含 `assistance_id`、`group_id`、仍未完成且同时属于开放协作与该组的 `checkpoint_ids`、具体 `reason`；不伪造执行结果 |
| `role_observation` | v2 `observation` 含 `group_id`、计划 `account_ref`、实际 `observed_account_ref`、固定 `verification_scope: execution_context`、`verification`（`verified` / `mismatch` / `unconfirmed`）、已登记 `target_id`、非生产 `environment_ref`、非秘密 `context_ref`、`switch_status` 和事实 `description` |
| `execution_context_change` | 已实际发生变化的 `context_ref`、受影响已登记 `target_ids` 和事实 `description`；只使相关未完成组旧核验失效 |
| `resume_check` | 由 `resume-check` 自动写入，用来使恢复前的角色核验失效 |

v2 `assistance` 使用 `assistance_id`、`phase`（`requested` / `resolved` / `unavailable` / `stop_waiting` / `stop_run`）、精确 `checkpoint_ids`、事实 `description` 和 `decision_source`。`requested` 还须有 `required_user_action` 与真实 `attempts`；确实涉及权限时才有 `group_ids`。后续事件只能处理同一事项仍未解决的范围；无法协助、停止等待与停止全轮必须是明确用户决定。v1 的 `permission_decision: "stop_waiting"` 仅在历史兼容分支继续解释。

v2 `evidence_capture` 记录精确 `checkpoint_ids`、固定 `capture_kind: screenshot`、`outcome`（`captured` / `failed` / `unavailable`）、上下文 `description` 与真实 `attempts`。成功必须注册真实图片 `evidence`；失败/不可用必须有 `reason` 且不能引用模拟图片。实际执行用例在阶段或最终交付前必须有成功或明确缺失的截图采集记录；证据状态与产品结果分开。

v2 可用 `report_context` 记录经允许展示的 `prd_links`、`environment_description`、`display_timezone` 和来源 `description`，不修改目标或预期。链接只允许无认证信息的 HTTP(S)。

v2 最终 `undetermined` 的 `checkpoint_result` 必须在 `exploration_summary` 和 `exploration_ref` 中恰选一个。摘要字段为精确 `checkpoint_ids`、`missing_fact`、`known_facts`、真实 `attempts`，没有尝试时的 `not_attempted_reason`，以及 `cannot_continue_reason`。`exploration_ref` 只能引用本 Run 先前带合法摘要的 blocker。未开始检查点还须满足原权限终结路径或用 `resolution_ref` 引用先前的合法协作解决/结束事件；开放协作未结束时拒绝终结。

权限原因直接结束检查点时，`checkpoint_result.permission_group_ids` 保留精确组引用。未知组/检查点、未知版本、缺失覆盖、错误账号/Target、必要切换未完成、未就绪或未实际核验就开始、等待覆盖已完成项、以及仍有未处理检查点时完成 Run 都拒绝。`record` 和日志重放使用同一校验。

有效示例：先记录待准备组的 `permission_availability` 为 `ready`，再记录页面事实为 `verified`，然后开始其检查点。拒绝示例：只因用户说“好了”便直接写 `checkpoint_started`；没有新鲜角色核验时必须失败关闭。

## CLI

路径均可为绝对路径并支持空格：

```text
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON> --workflow-profile permission-batches-html-v2
node <SKILL_ROOT>/scripts/run-artifacts.mjs record --run <RUN_ROOT> --event <EVENT_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs resume-check --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs validate --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs report --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs deliver --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs deliver --run <RUN_ROOT> --stage requested
node <SKILL_ROOT>/scripts/run-artifacts.mjs archive-screenshot --run <RUN_ROOT> --event <CAPTURE_EVENT_JSON> --source <ACTUAL_TOOL_IMAGE> --source-root <AUTHORIZED_TOOL_OUTPUT_DIR>
node <SKILL_ROOT>/scripts/run-artifacts.mjs archive-screenshot --run <RUN_ROOT> --event <CAPTURE_EVENT_JSON> --image-stdin true
```

stdout 恰好一个 JSON。退出码：0 成功、2 输入契约、3 一致性、4 秘密扫描、5 文件系统。错误信息必须脱敏。

截图字节校验使用本 Skill 的锁定依赖。首次归档前，在 `<SKILL_ROOT>` 执行 `npm ci --ignore-scripts --omit=dev`（开发测试不加 `--omit=dev`）。只安装到已获准的 Skill 目录，不做全局安装，不自动覆盖个人安装副本；依赖不可用时拒绝归档，不降级为只检查文件头。普通 init/record/report 及无新归档标记的历史证据不因缺少解码器而改变原接口。

`archive-screenshot` 接收一个现有成功 `evidence_capture` 事件，且恰好一份 `kind: screenshot` 证据。路径采用 `evidence/<安全单一文件名>.png|jpg|jpeg|webp`。文件模式必须来自本次 MCP 真实输出的明确可读授权目录；不得以此绕过工具访问限制。返回值模式从 stdin 接收 MCP 图片块的 `{data, mimeType}`，不把 Base64 写进账本。两模式互斥，上限 25 MiB；类型/截断/路径/符号链接/覆盖/元数据秘密检查失败则拒绝。原字节排他原子归档后复用 `record` 登记；登记失败撤回本次新文件，不修改产品结果。证据增加可选 `sha256` 和 `capture_source`，校验时检查摘要；旧证据无摘要保持兼容。摘要只能证明字节一致，不能证明来源真实或图片无秘密，必须由 Runner 核对工具来源、画面及检查点。

新归档在写入前检查容器边界、PNG CRC、文本/压缩文本元数据与标准颜色配置，实际解码全部像素后才接受；解码结果仅在内存中丢弃，持久化仍为原字节。上限为 25 MiB 文件、8 MiB 元数据检查预算、64×1024×1024 像素及 5 秒解码处理。超过上限、损坏、未知/嵌套元数据均拒绝；不静默删除 EXIF/XMP、ICC 私有标签或重新编码图片。标准 sRGB 的可检查 ICC 标签允许且保留原值；这不表示支持所有相机或专业色彩配置。带 `capture_source: tool_file|tool_image_return` 的归档证据在 Run 校验/报告交付前再次使用同一图片检查；旧证据仍按原兼容分支处理，不修改历史 Run。

ICC 支持本次已验证的矩阵/TRC 型标准颜色配置子集：受限名称对应的 `XYZ `、`sf32`、`para`、`curv`、`mluc` 标签，逐项检查长度、内部字符串区间和编码；不接受任意 ICC 标签。允许完全相同的共享数据区间和最多 3 字节的零对齐，不允许未引用数据、部分重叠或标签内尾随载荷。PNG `hIST` 与固定辅助字段纳入元数据扫描；压缩元数据必须完整消费输入，不忽略压缩流之后的字节。这些检查不扩展为像素隐写检测。

`report` 保留旧接口和内部阶段产物；增加 `delivery`（`kind: stage|final|early_end`、`automaticallyPresent`、中文 `label`）。`deliver` 是外部交付门槛：非 completed 默认不返回路径、统计或表格；只有用户明确请求阶段结果才传 `--stage requested`。最终复用完整生成/校验流程；早结束由原 `assistance.stop_run` 用户决定识别，不引入第二套事实或终结事件。

`resume-check` 检查哈希、日志和最后事件，列出派发未确认的副作用动作并禁止自动重放，同时要求复核页面、角色和代理。

`validate` 检查快照哈希、schema、ID 唯一与引用、事件顺序、权限/上下文/协作/探索契约、四态、计数、代理/清理结构、证据路径边界与存在性及秘密。`report` 从同一次 `test-cases.json` 与 `execution-log.json` 读取建立共享模型，v2 派生单一 `report.html` 与不落盘的对话表；人工修改报告不会改变事实。

v2 `report` 的 stdout 恰好一个 JSON，包含 `runId`、`counts`、`reportFormat: "html-only-v1"`、完整 `chatTableMarkdown`、`snapshotHash`、`eventCount` 和 `lastSequence`；`reportPath` 与 `htmlReportPath` 相同，均指向 `report.html`。初始化或普通执行中尚无报告合法；v2 进入 `awaiting_user` 或 `completed` 后必须有合法 HTML，存在 `report.md` 反而拒绝。历史 v1 仍生成原报告对；无 profile 的历史 Run 保持原规则。

共享报告模型负责把账本事实投影为面向评测者的语义时间线、证据说明、代理结论、清理结论和一致性结论。HTML 渲染器只消费这些语义字段，不序列化任意账本对象；机器级哈希、序号、内部状态和值域仍以 `execution-log.json` 为准。

v2 使用原子文本写入 `report.html` 并回读比对。HTML 缺失、陈旧、被篡改、写入失败或生成期间账本变化都不得交付；只允许从原账本重新生成 `report.html` 和对话表，不手改派生结果。`checkReport: false` 仅用于重建前忽略旧派生内容，不跳过快照、日志、证据和秘密结构检查。历史 v1 的双文件写入局限只属于兼容分支。

## 证据引用

路径必须是 Run 根目录下以 `evidence/` 开头的相对普通文件，禁止绝对路径、`..` 越界和任一层符号链接。每份证据有全局唯一 ID、时间、描述、支持的检查点，并且只提供相对路径或内联结构化内容之一。`kind: screenshot` 的文件只允许内容与扩展名相符的 PNG、JPEG 或 WebP；检查点只可引用已注册且确实声明支持它的证据。详细安全规则见 [security-and-evidence.md](security-and-evidence.md)。
