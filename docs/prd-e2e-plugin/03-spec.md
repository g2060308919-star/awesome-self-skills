# `prd-e2e` 插件实现 Spec

版本：1.0
状态：Ready for implementation
目标发布：`prd-e2e` `0.1.0`

## 1. 规范说明

本文是本次实现和验收的规范性依据。

- “必须”表示不满足即不能验收；
- “不得”表示明确禁止；
- “应”表示默认要求，只有存在可记录的技术原因时才可偏离；
- 未在本文或背景文档范围内声明的能力，不属于本次实现。

实现者必须先阅读同目录下的 `01-background.md` 和 `02-technical-design.md`。不得依赖任何历史对话来补充需求。

## 2. 交付物

实现必须交付一个 `prd-e2e-plugin/` 目录，包含：

1. 合法的 Codex 插件 manifest；
2. 新建的 `run-prd-e2e` Skill；
3. 未修改业务内容的 `generate-test-cases` 固定快照；
4. 未修改业务内容的 `b2b-e2e-runner` 固定快照；
5. 外层 Run、状态转换、Compiler、校验与 Finalizer 脚本；
6. 三个 Skill 的内容摘要锁文件；
7. 单元测试、兼容性测试、包结构测试和安装冒烟记录。

插件必须只暴露以下三个 Skill 名称：

```text
run-prd-e2e
generate-test-cases
b2b-e2e-runner
```

## 3. 插件要求

### PKG-001 单一安装单元

在无同名冲突的 Codex profile 中，安装 `prd-e2e` 插件必须同时提供三个 Skill，不得要求用户另外安装任一子 Skill。

### PKG-002 独立 Skill 边界

三个 Skill 必须位于独立目录并保留各自的 `SKILL.md`。`run-prd-e2e` 不得复制两个子 Skill 的完整流程或将其合并为一个 Skill。

### PKG-003 Manifest

`.codex-plugin/plugin.json` 必须由当前 `plugin-creator` 规范生成或验证，并满足：

- `name` 为 `prd-e2e`；
- `version` 初始为严格 semver `0.1.0`；
- `description` 准确表达“从 PRD 生成可追踪用例并在非生产 B2B Web 系统执行”；
- `skills` 指向 `./skills/`；
- 包含 validator 要求的非空 `author.name` 与 `interface` 字段；
- 不声明未实际提供的 MCP、App、Hook 或素材；
- 不含占位符和开发机器绝对路径。

本地首版可保留脚手架提供的合法本地开发者元数据；公共发布者、品牌和远程市场配置不属于本次范围。

### PKG-004 固定快照

两个现有子 Skill 必须从显式、已验证的源目录逐字节 vendor 到插件。除忽略 `.DS_Store` 外，不得修改、格式化或筛选普通文件内容。

### PKG-005 Bundle Lock

`bundle-lock.json` 必须符合以下封闭类型：

```typescript
type BundleLock = {
  schema_version: "1.0";
  plugin: "prd-e2e";
  contracts: {
    generate_test_cases_schema: "4.2.0";
    generate_test_cases_compiler: "0.7.0";
    b2b_runner_input_schema: "2.0";
  };
  skills: {
    "run-prd-e2e": SkillLock<"workspace-build">;
    "generate-test-cases": SkillLock<"validated-installed-snapshot">;
    "b2b-e2e-runner": SkillLock<"validated-installed-snapshot">;
  };
};

type SkillLock<Source extends string> = {
  path: string;          // 对应 skills/<name> 的 POSIX 相对路径
  source: Source;
  tree_sha256: string;   // 必须匹配 /^[a-f0-9]{64}$/
};
```

`skills` 不允许其他键；三个 `path` 必须分别为对应的 `skills/<name>`，不得写入绝对源路径。

若实际源快照的公开契约不是上述版本，实现者必须停止并报告兼容性变化，不得静默修改本 Spec 中的目标版本。

### PKG-006 更新发布

任一内置 Skill 内容变化后，发布流程必须重新 vendor、更新 lock、运行全量测试、修改插件版本并重新发布。仅当子 Skill 契约变化时，才需要修改编排 Adapter/Compiler；无契约变化时不得无故修改编排行为。

### PKG-007 名称冲突

安装前必须检查目标 profile 的同名 Skill。发现冲突时必须停止并报告路径，不得自动覆盖、删除、移动或禁用。

## 4. `run-prd-e2e` Skill 要求

### SKL-001 触发边界

Skill description 必须能区分以下场景：

- 适用：用户同时提供或准备提供 PRD 与非生产 B2B Web 测试地址，并要求完整浏览器 E2E 验收；
- 不适用：仅生成测试用例、仅执行已有 Runner v2 用例、生产测试、API 自动化或生成 Playwright 代码。

### SKL-002 子 Skill 路由

`SKILL.md` 必须明确：

- Case Document 与 Execution Plan 阶段使用 `generate-test-cases`；
- Runner 输入验证通过后使用 `b2b-e2e-runner`；
- 恢复时不从对话历史推断进度；
- 不改写 Case、Step、Oracle ID 或 expected 文本；
- Runner Run 期间不使用另一套 E2E 动作、证据或结果规则。

### SKL-003 渐进加载

主 `SKILL.md` 应保持为流程路由器。详细阶段、交接和恢复规则必须分别放入 references，并从对应阶段明确链接。不得把两个子 Skill 的完整说明复制到主文件。

### SKL-004 UI Metadata

`agents/openai.yaml` 必须与 Skill 名称和能力一致；`default_prompt` 必须显式包含 `$run-prd-e2e`。除非用户另有明确要求，必须允许正常自动发现。

## 5. 启动输入

### IN-001 Request Schema

外层请求必须使用以下封闭结构：

```json
{
  "schema_version": "1.0",
  "prd_sources": ["non-empty string"],
  "target_urls": ["https://non-production.example/path"],
  "suite_name": "optional non-empty string"
}
```

要求：

- `prd_sources` 至少一个、元素非空、不可重复；
- `target_urls` 至少一个、元素非空、不可重复，只允许 HTTP(S)；
- URL 不得包含 user-info、密码、Token、Ticket、Signature、Authorization 或其他认证材料；
- 未知字段必须拒绝；
- 不得把 URL 名称本身当作非生产证明。
- `suite_name` 缺失时必须使用固定默认值 `PRD E2E`，不得额外向用户提问。

### IN-002 Run 创建

有效请求必须创建唯一外层 Run：

```text
<workspace>/e2e-runs/<timestamp>-<random>/
```

创建必须排他、可检测重复，并原子写入 `request.json` 与 `workflow-state.json`。CLI 不得允许调用方指定 Run ID。

## 6. 外层状态

### ST-001 状态集合

活动或等待 stage 只允许：

```text
intake
generating_cases
awaiting_semantic_input
cases_ready
planning_execution
awaiting_execution_confirmation
compiling_runner_input
runner_preflight
awaiting_execution_resource
executing
```

终态只允许：

```text
completed
blocked
cancelled
```

### ST-002 合法转换

| 当前 stage | 事件 | 下一 stage |
| --- | --- | --- |
| `intake` | `case_generation_started` | `generating_cases` |
| `generating_cases` | `semantic_input_requested` | `awaiting_semantic_input` |
| `awaiting_semantic_input` | `semantic_input_received` | `generating_cases` |
| `generating_cases` | `case_document_ready` | `cases_ready` |
| `cases_ready` | `execution_planning_started` | `planning_execution` |
| `planning_execution` | `execution_confirmation_requested` | `awaiting_execution_confirmation` |
| `awaiting_execution_confirmation` | `execution_confirmation_received` | `planning_execution` |
| `planning_execution` | `execution_plan_ready` | `compiling_runner_input` |
| `planning_execution` | `no_execution_selected` | `completed` |
| `compiling_runner_input` | `runner_input_compiled` | `runner_preflight` |
| `runner_preflight` | `runner_resource_requested` | `awaiting_execution_resource` |
| `awaiting_execution_resource` | `runner_resource_received` | `runner_preflight` |
| `runner_preflight` | `runner_started` | `executing` |
| `executing` | `runner_paused` | `awaiting_execution_resource` |
| `executing` | `runner_completed` | `completed` |

任一非终态可通过明确事件进入 `blocked` 或 `cancelled`。终态不得再转换。

如果资源等待发生在已有 Runner Run 中，回到 `runner_preflight` 后必须先对原 Run 执行 `resume-check`，再通过 `runner_started` 返回 `executing`。不得直接依据聊天记忆跳回执行态。

### ST-003 幂等与并发

每个事件必须包含唯一 `event_id` 和 `expected_seq`：

- 已应用的同一 `event_id` 重放时返回当前状态，不重复副作用；
- `expected_seq` 与当前序号不一致时返回 `STALE_TRANSITION`；
- 非法边返回 `ILLEGAL_TRANSITION`；
- 状态落盘必须原子替换；
- history 不得包含秘密或完整凭据。

### ST-004 恢复

恢复必须读取并校验外层状态，再调用当前子 Skill 的原生恢复入口。不得根据聊天历史、目录修改时间或“看起来最新”的文件选择 Run。

## 7. Case Document 与 Execution Plan

### GEN-001 Case Document 权威性

Case Document 必须来自 `generate-test-cases` 的 `delivery_intent=case_document` v4 工作流。只有 `output/current.json` 及其摘要校验通过的引用才可作为权威输出。

### GEN-002 子 Run 引用

外层 generation ref 必须记录实际子 Run 根目录、manifest、bundle、不可变 `case_document_ref` 和非秘密摘要。不得复制或修改 canonical bundle。

### GEN-003 Execution Plan

Execution Plan 必须是另一个 `delivery_intent=execution_plan` Run，并与 Case Document 的以下引用完全绑定：

```text
run_id
revision
manifest_digest
bundle_digest
```

### GEN-004 可执行门槛

只有以下 Plan 可进入编译：

```text
status = finished
result_kind = execution_ready
runner_ready = true
runner_projection.case_ids 非空
```

每个投影 Case 必须在最终 items 中为：

```text
semantic_status = Grounded
disposition = execute
ready = true
```

### GEN-005 无执行项

`result_kind=no_execution_selected` 时：

- 不得生成 Runner Run；
- 外层进入 `completed`；
- `completion_kind=no_execution_selected`；
- `final-index.json` 必须引用 Case Document 和 Execution Plan，Runner 字段为 `null`，并说明没有选择执行项。

写入 final index 与进入 `completed` 必须构成可恢复的有序操作：先原子写入并校验 final index，再提交带 final-index 引用的 `no_execution_selected` 状态事件。

## 8. Execution Profile

### EXE-001 Profile Schema

Profile 必须包含：

- `schema_version` 固定为 `1.0`；
- `environment.classification` 固定为 `non-production`；
- 非空 `environment.evidence`；
- 与 projection 完全一致的 `execution_scope.case_ids`；
- `test_data.kind` 只能为 `case-document` 或 `explicit`，`test_data.requirements` 为字符串数组；
- `evidence_policy.kind` 只能为 `runner-default` 或 `explicit`，`evidence_policy.requirements` 为字符串数组；
- 每个选中 Case 恰好一条 `business_cleanup` 声明；
- `pass_standard.kind=exact-expected-text`。

Profile 是封闭结构，未知字段必须拒绝。

### EXE-002 Cleanup

清理声明只允许：

```json
{
  "case_id": "CASE-001",
  "disposition": "required",
  "instruction": "删除本次创建的测试记录"
}
```

或：

```json
{
  "case_id": "CASE-002",
  "disposition": "not_required",
  "reason": "该用例只读"
}
```

不得缺失、重复或出现未选中 Case。

### EXE-003 Secrets

账号引用可以使用不含秘密的标签。密码、Cookie、Authorization、Token、Session ID、认证票据、签名值和认证 URL 不得写入 Profile 或任何外层产物。

## 9. Runner Input Compiler

### CMP-001 输入

Compiler 必须同时接收并校验：

- request；
- generation ref；
- Case Document bundle；
- Execution Plan 与 manifest；
- Execution Profile。

任何引用或摘要不一致均必须拒绝。

### CMP-002 选择权

Runner Case 的成员和顺序只能来自 `executionPlan.runner_projection.case_ids`。不得根据优先级、数组自然顺序或 Agent 偏好重新选择或排序。

### CMP-003 无损映射

Compiler 必须按照技术方案第 5.5 节的映射生成 `schema_version: "2.0"` 输入，并满足：

- Case、Step、Oracle ID 原样保留；
- Step 顺序原样保留；
- 同一 Step 下 Oracle 保持 Case Document 中的相对顺序；
- `oracle.expected` 到 `expected[].text` 字节级相同；
- URL、模块、前置条件、data conditions、test values、cleanup、surface 和 claim IDs 按定义保留；
- lineage 可追溯到 Case Document ref 和 projected Case digest。

### CMP-004 不可转换时失败

出现以下任一情况时不得写出可执行输入：

- 缺失或重复 Case/Step/Oracle ID；
- Case 不可执行；
- 模块找不到；
- Oracle 找不到 Step；
- 任一 Step 没有 Oracle；
- expected 为空；
- scope、cleanup 或非生产证据不完整；
- 发现秘密；
- 输出不能通过被打包 Runner 的 `validateTestCases`。

不得发明 Oracle、合并 Step、改变 expected 或降级到其他 Runner schema。

### CMP-005 原子写入

`runner-input.json` 必须原子写入并记录 SHA-256。文件写入成功但状态转换失败时，恢复流程只有在重新计算内容完全相同后才可复用。

## 10. Runner 交接

### RUN-001 启动条件

只有 `runner-input.json` 通过外层校验和被打包 Runner 自身 validator 后，才可进入 Runner preflight。浏览器操作前必须已有非生产证据。

### RUN-002 Runner 权威性

Runner Run 期间：

- 使用 `permission-batches-html-v2`；
- 页面操作、权限批次、代理、截图、证据和结果只遵循 `b2b-e2e-runner`；
- `expected[].text` 是唯一通过标准；
- 外层不得提供竞争性判断或修改 Case；
- 外层只保存 Runner Run 引用与公开状态。

### RUN-003 账号与权限等待

Runner 返回需用户协助时，外层只转达 Runner 的精确 `required_user_action`。用户回复后必须恢复同一 Runner Run；不得新建 Run，不得重放已完成或效果不确定的副作用动作。

### RUN-004 报告

新 Runner v2 Run 只持久化一个 `report.html`。最终对话使用同一次 `report` 命令返回的完整 `chatTableMarkdown`，该表不得另行落盘为完整 Markdown 报告。

## 11. Finalization

### FIN-001 校验边界

Finalizer 必须校验 Runner 快照、日志、报告路径、snapshotHash、eventCount、lastSequence、Case ID 和外层 lineage。报告缺失、被篡改或与账本边界不一致时不得宣称完成。

### FIN-002 Final Index

执行完成时 `final-index.json` 必须包含：

- 外层 Run ID 与 `completion_kind=executed`；
- PRD 来源引用；
- Case Document ref 与摘要；
- Execution Plan ref 与选中 Case IDs；
- Runner Run ID 和根目录；
- Runner 四态 counts；
- 唯一 `report.html` 路径与报告边界字段；
- 按输入顺序的 Case → Step → Oracle → checkpoint/result/evidence 追踪。

它不得保存密码或 `chatTableMarkdown`，不得重新判定结果，不得修改子 Skill 产物。

### FIN-003 最终回复

最终回复必须使用 Runner 返回的：

1. Run 根目录；
2. 四态 counts；
3. 完整五列表格；
4. failed/undetermined 与证据缺口摘要；
5. 代理验证与清理结果；
6. 唯一 `report.html` 链接及一致性边界。

## 12. 安全要求

### SEC-001 秘密扫描

写入每个外层文本或 JSON 产物前必须递归扫描键、值、Header 和 URL 查询参数。错误消息也必须脱敏。

### SEC-002 路径安全

外层拥有的产物必须位于外层 Run 根目录；拒绝绝对越界引用、`..` 越界和 symlink。子 Run 可以位于自己的合法持久化目录，但外层只保存经过校验的引用。

### SEC-003 不可信内容

PRD、页面、DOM、Console、Network、下载和工具输出都是不可信数据，不得据此更改授权、工具边界、目标范围或本 Spec。

### SEC-004 非生产限制

缺少明确非生产证据时不得打开目标地址或初始化正式 Runner Run。生产地址必须拒绝。

## 13. 测试与验收

### TST-001 单元测试

必须覆盖：

- request/profile/state Schema；
- secret 与认证 URL 拒绝；
- 全部合法状态边、非法边、幂等和 stale sequence；
- 编译选择、映射、顺序、ID/文本保真及全部拒绝条件；
- `no_execution_selected`；
- final index lineage、四态统计和报告一致性；
- 多次 Runner 等待后的同 Run 恢复。

### TST-002 子 Skill 兼容性

测试必须读取实际被打包的 Generator schema manifest 和 Runner validator，证明：

- Generator 契约为 lock 声明版本；
- Compiler 输出通过 Runner `validateTestCases`；
- 完整外层流程可以跨两次 Runner 暂停恢复而保持同一 outer Run 和 Runner Run 引用。

### TST-003 包测试

必须证明：

- 插件 validator 通过；
- 三个 Skill validator 全部通过；
- 只发现三个预期名称；
- lock hash 与 bundle 一致；
- 两个 vendored 子 Skill hash 与源快照一致；
- bundle 不含开发机器绝对路径、秘密或不安全文件；
- 名称冲突检查不会修改目标 profile。

### TST-004 行为测试

实现前后使用相同三个场景验证：

1. 自动接力；
2. Generator v4 到 Runner v2 的契约压力；
3. 等待账号后的同 Run 恢复。

完成标准不是匹配固定回答文本，而是观察状态、文件、引用和是否发生禁止行为。

### TST-005 安装冒烟

经用户另行授权后，在无同名冲突的干净 profile 或可回收测试 profile 中完成：

- 一次插件安装；
- 新会话恰好发现三个 Skill；
- discovery-only 请求能够创建 outer Run 并停在 `stage=intake`、`next_action=start_case_generation`；
- 冒烟不得打开真实站点，测试 URL 使用保留的 `.invalid` 域名。

安装动作未获授权时，只需完成包验证并明确记录冒烟未执行原因，不得私自修改活动 profile。

## 14. 验收清单

以下项目必须全部满足：

- [ ] 用户只需安装一个插件；
- [ ] 插件包含且仅包含三个预期 Skill；
- [ ] 两个现有 Skill 的业务内容未被修改；
- [ ] `run-prd-e2e` 能自动从 Case Document 接到 Execution Plan，再接到 Runner；
- [ ] 合法暂停后只需回答当前问题即可恢复原 Run；
- [ ] 交接不改变 Case/Step/Oracle ID 和 expected 文本；
- [ ] 只有确认可执行的 Case 进入 Runner；
- [ ] 非生产和 cleanup 门槛无法绕过；
- [ ] Runner 是浏览器事实和结果的唯一权威；
- [ ] `no_execution_selected` 不启动 Runner；
- [ ] 最终结果可追溯到不可变 Case Document ref；
- [ ] 外层文件与报告不包含秘密；
- [ ] Bundle lock 能检测任一 Skill 漂移；
- [ ] 子 Skill 更新流程要求新版插件；
- [ ] 所有单元、兼容性、包结构和已获授权的安装冒烟测试通过。

## 15. 明确排除

实现不得顺带加入：生产环境支持、Playwright、API Runner、多项目并发、定时任务、后台轮询、自动权限申请、自动 PRD 修订、测试结果回写 Case、远程依赖自动更新、自动解决同名 Skill 冲突或与本目标无关的现有代码重构。
