# PRD 驱动 E2E 插件：技术方案

状态：待实现基线
目标插件：`prd-e2e` `0.1.0`
目标运行时：Node.js 22+，仅使用 Node.js 内置运行时依赖

## 1. 方案摘要

本方案新增 `run-prd-e2e` Skill，使用同一个 Agent 按阶段加载并遵循两个现有子 Skill：

1. `generate-test-cases` 生成 Case Document；
2. `generate-test-cases` 生成并确认独立的 Execution Plan；
3. 确定性 Compiler 将已确认的 Case 转换为 Runner v2 输入；
4. `b2b-e2e-runner` 独占浏览器执行、证据和结果判定；
5. 外层 Finalizer 汇总引用和追踪关系，不重新判定结果。

三个 Skill 作为固定快照打包进一个 `prd-e2e` 插件。Skill 之间不通过进程内 API 直接调用；编排由 Agent 的 Skill 路由完成，阶段交接由可校验文件完成。

## 2. 架构

```text
安装边界
┌────────────────────────────────────────────────────────┐
│ prd-e2e plugin                                         │
│                                                        │
│  run-prd-e2e                                           │
│  ├─ 外层状态机                                         │
│  ├─ Runner Input Compiler                              │
│  ├─ Run Validator / Finalizer                          │
│  └─ 子 Skill 路由                                      │
│                                                        │
│  generate-test-cases        b2b-e2e-runner             │
│  └─ 语义与执行计划          └─ 浏览器事实、证据、报告   │
└────────────────────────────────────────────────────────┘

运行时数据流

PRD + 测试地址
      │
      ▼
Case Document ──不可变引用──▶ Execution Plan
      │                            │
      └────────────┬───────────────┘
                   ▼
          execution-profile.json
                   │
                   ▼
       deterministic compiler
                   │
                   ▼
          runner-input.json v2
                   │
                   ▼
          b2b-e2e-runner Run
                   │
                   ▼
       report.html + final-index.json
```

## 3. 组件职责

### 3.1 `run-prd-e2e`

负责：

- 校验启动输入并创建外层 Run；
- 依据外层状态选择当前唯一合法动作；
- 使用 `generate-test-cases` 完成 Case Document 和 Execution Plan 两个独立子 Run；
- 保存子 Run 的权威引用与内容摘要；
- 收集当前执行所需、但不属于业务语义的执行配置；
- 调用确定性 Compiler 生成 Runner v2 输入；
- 在 Runner 阶段只转交控制、保存 Run 引用和镜像公开状态；
- 从已校验的 Runner 结果生成最终索引。

不负责：

- 自己分析 PRD 并手写正式 Case；
- 自己修改 Case、Step、Oracle 或预期结果；
- 自己操作页面或判断 passed/failed；
- 保存认证秘密；
- 将两个子 Skill 的说明复制进自身形成分叉实现。

### 3.2 `generate-test-cases`

沿用其当前 v4 工作流，不修改现有业务逻辑。编排层使用两个交付边界：

- `delivery_intent=case_document`：生成权威 Case Document；
- `delivery_intent=execution_plan`：创建一个绑定不可变 `case_document_ref` 的 Execution Plan。

当前兼容基线为 Case Document / Execution Plan `schema_version: "4.2.0"`、`compiler_version: "0.7.0"`。实现时必须从被打包快照的 `scripts/schema-manifest.json` 和 Schema 实际校验，不能只信任文档常量。

E2E 请求本身构成“用户明确要求执行计划”，因此 Case Document 完成后可以自动进入 Execution Plan 子流程；但最终执行清单仍必须按 `generate-test-cases` 的现有确认契约完成确认。

### 3.3 Runner Input Compiler

Compiler 是 Node.js 确定性脚本。它只做：

- Schema 与引用校验；
- 执行范围过滤；
- 无损字段映射；
- 环境、清理和追踪元数据注入；
- 原子写入 `runner-input.json`。

它不得使用模型生成、补全或改写任何业务语义。遇到无法无损转换的结构时必须失败，不得“尽量修复”。

### 3.4 `b2b-e2e-runner`

沿用其当前 Runner v2 契约，不修改业务逻辑。其最低输入为：

- `schema_version: "2.0"`；
- `suite.name` 和 `suite.target_urls`；
- 非空 `cases`；
- 每个 Case 的唯一 `case_id`、`module`、`title`、`preconditions`、非空 `steps`；
- 每个 Step 的 `action` 和非空 `expected`；
- 每个 Oracle 的非空 `text`。

Runner 允许保留额外字段，因此 Compiler 可携带 lineage、执行配置、原始 ID、Oracle surface 和 claim IDs。正式 Runner Run 开始后，浏览器动作、证据、权限批次、代理、四态结果和报告全部以 Runner 契约为准。

### 3.5 插件层

插件只负责：

- 将三个 Skill 作为一个安装单元分发；
- 提供合法的 `.codex-plugin/plugin.json`；
- 记录三个 Skill 的内容摘要与兼容契约；
- 在发布前验证结构、版本、重复名称和快照漂移。

插件 manifest 不保存运行时状态，也不重复编排说明。

## 4. Skill 串联机制

Skill 串联不是 JavaScript 函数互调。`run-prd-e2e/SKILL.md` 必须明确：

- Case 语义阶段必须使用 `generate-test-cases`；
- `runner-input.json` 通过校验后，执行阶段必须使用 `b2b-e2e-runner`；
- 每次暂停或恢复都先读取外层状态和对应子 Run 权威输出；
- Runner Run 期间不得同时使用另一套本地 E2E Skill 参与动作或判定。

Agent 在同一任务中依次遵循相应 Skill；确定性脚本保证各阶段文件契约，而不是依赖对话上下文传值。

## 5. 端到端流程

### 5.1 Intake

接收：

```json
{
  "schema_version": "1.0",
  "prd_sources": ["可读取的文件、链接或内联正文引用"],
  "target_urls": ["https://test.example.com"],
  "suite_name": "可选名称"
}
```

规则：

- `prd_sources` 和 `target_urls` 必须是非空、去重数组；
- URL 只允许 HTTP(S)，不得包含 user-info 或秘密型查询参数；
- `suite_name` 缺失时固定使用 `PRD E2E`，不得为了命名暂停流程或改变需求范围；
- 创建持久化外层 Run 后才能进入子流程。

### 5.2 Case Document

编排层创建并持续恢复同一个 `case_document` 子 Run，直到：

- `finished`：读取并校验 `output/current.json` 及其引用的 canonical bundle；
- `need_artifact` / `need_user_answers`：进入外层等待状态并原样转达当前必要输入；
- `need_revision`：只修复子 Skill 指定的 staging 产物；
- `fatal`：外层进入 `blocked`；
- `cancelled`：外层进入 `cancelled`。

外层只记录子 Run 根目录、manifest 路径、bundle 路径、`case_document_ref` 和摘要，不复制或编辑权威产物。

### 5.3 Execution Plan

Case Document 完成后，创建单独的 `execution_plan` 子 Run，绑定以下不可变引用：

```text
run_id + revision + manifest_digest + bundle_digest
```

只有满足以下全部条件才可继续编译：

- Execution Plan `status=finished`；
- `result_kind=execution_ready`；
- `runner_ready=true`；
- `runner_projection.case_ids` 非空；
- `case_document_ref` 与 Case Document 权威引用完全相同；
- 每个选中项均为 `Grounded + execute + ready`；
- 用户已经确认完整执行计划。

若结果为 `no_execution_selected`，不得调用 Runner。外层以 `completed` 结束，`completion_kind=no_execution_selected`，并生成不含 Runner 结果的最终索引。

### 5.4 Execution Profile

Case Document 描述业务语义；当前环境信息由外层独立保存：

```json
{
  "schema_version": "1.0",
  "environment": {
    "classification": "non-production",
    "evidence": "用户明确说明或受信环境清单引用"
  },
  "execution_scope": {
    "case_ids": ["CASE-001"]
  },
  "test_data": {
    "kind": "case-document",
    "requirements": []
  },
  "evidence_policy": {
    "kind": "runner-default",
    "requirements": []
  },
  "business_cleanup": {
    "cases": [
      {
        "case_id": "CASE-001",
        "disposition": "not_required",
        "reason": "只读用例"
      }
    ]
  },
  "pass_standard": {
    "kind": "exact-expected-text"
  }
}
```

要求：

- 非生产证据必须是明确事实，不能从 hostname 推断；
- `execution_scope.case_ids` 必须与 Execution Plan projection 顺序和内容完全一致；
- 每个选中 Case 必须恰好有一个清理声明：`required + instruction` 或 `not_required + reason`；
- 凭据只保留在执行内存或浏览器输入，不进入该文件。

### 5.5 Compile

Compiler 按 Execution Plan 中 `runner_projection.case_ids` 的顺序选取 Case，并执行以下映射：

| 来源 | Runner 字段 | 规则 |
| --- | --- | --- |
| `runner_projection.case_ids` | `cases` 成员与顺序 | 唯一选择依据 |
| `case.case_id` | `case_id` | 原样复制 |
| `scope_manifest.modules[module_id].name` | `module` | 找不到即失败 |
| `case.title` | `title` | 原样复制 |
| `business_preconditions[].description` | `preconditions[]` | 保持顺序 |
| `data_conditions` | `data_conditions` | 作为额外字段保留结构 |
| `test_values` | `test_values` | 存在时作为额外字段保留结构 |
| 清理声明 | `cleanup` | 每个选中 Case 恰好一个 |
| `step.step_id` | `step_id` | 原样复制 |
| `step.action` | `action` | 原样复制 |
| `oracle.observe_after_step_id` | 所属 `step.expected[]` | 按 Case Document Oracle 顺序归组 |
| `oracle.oracle_id` | `oracle_id` | 原样复制 |
| `oracle.expected` | `text` | 字节级原样复制 |
| `oracle.surface` | `surface` | 作为额外字段保留 |
| `oracle.claim_ids` | `claim_ids` | 作为额外字段保留 |
| `request.target_urls` | `suite.target_urls` | 原样复制 |

Compiler 还在 `suite.lineage` 中保存 `case_document_ref` 和 `case_ids_digest`，在 `suite.execution` 中保存经过校验的执行配置。

以下情况必须停止：

- Case Document、Execution Plan 或其摘要不匹配；
- 选中 Case 不存在或不是 `Grounded + execute + ready`；
- Case、Step 或 Oracle ID 重复；
- `module_id` 找不到模块；
- Oracle 指向不存在的 Step；
- 任一 Step 没有 Oracle；
- 预期文本为空；
- 执行范围或清理声明不完整；
- 非生产证据缺失；
- 发现秘密材料。

“Step 没有 Oracle”是两个现有契约之间的真实不兼容：生成器允许存在中间动作，Runner 要求每个 Step 至少一个 expected。第一版不得发明 Oracle 或合并 Step，只能报告不可无损转换并停止。

### 5.6 Runner Preflight 与执行

`runner-input.json` 通过 Runner 自身 `validateTestCases` 后，编排层将控制权交给 `b2b-e2e-runner`。Runner 继续处理：

- Chrome DevTools MCP 和 Chrome 可用性；
- 账号、权限批次和登录动作；
- 是否使用代理及代理规则；
- 页面动作、检查点、截图和证据；
- 同 Run 暂停与恢复；
- 四态结果与 `report.html`。

Runner 已从输入获得 URL、范围、测试数据、证据要求、清理声明和通过标准，不应重复询问这些内容。账号密码不得写入外层文件。

### 5.7 Finalize

Runner 完成后，外层读取并校验：

- Runner `test-cases.json` 快照；
- `execution-log.json`；
- `report` 命令返回的 counts、`chatTableMarkdown`、snapshotHash、eventCount、lastSequence；
- `reportPath` 与 `htmlReportPath` 指向同一个 `report.html`。

Finalizer 生成 `final-index.json`，保存引用、统计和 Case → Step → Oracle → Runner checkpoint 的追踪关系。它不得重新计算四态，也不得把 `chatTableMarkdown` 落盘。最终对话直接使用 Runner 已校验的 counts 和完整表格。

## 6. 外层状态机

```text
intake
  -> generating_cases
  -> awaiting_semantic_input -> generating_cases
  -> cases_ready
  -> planning_execution
  -> awaiting_execution_confirmation -> planning_execution
  -> compiling_runner_input
  -> runner_preflight
  -> awaiting_execution_resource -> runner_preflight
  -> executing
  -> completed
```

任一非终态可根据明确事件进入 `blocked` 或 `cancelled`。`completed`、`blocked`、`cancelled` 为终态。`no_execution_selected` 从 `planning_execution` 直接进入 `completed`。

`workflow-state.json` 至少保存：

- `run_id`、创建与更新时间；
- `stage`、`status`、`completion_kind`；
- `transition_seq` 和已应用 `event_id`；
- `next_action`、`waiting_for_user`、`minimum_missing_input`；
- generation、execution plan、runner input、runner run、final index 引用；
- 不含秘密的状态转换历史。

无论资源等待发生在正式 Run 创建前还是 Runner 执行中，`runner_resource_received` 都先回到 `runner_preflight`。若已经存在 Runner Run，该阶段先完成同 Run `resume-check`；验证通过后再以 `runner_started` 回到 `executing`。因此状态表不存在依赖聊天上下文选择的分支。

状态转换必须满足：

- 封闭 transition table；
- 事件具有唯一 ID 和预期序号；
- 重复事件幂等；
- 过期序号和非法边拒绝；
- JSON 使用同目录临时文件、`fsync` 和 rename 原子替换。

## 7. 恢复规则

恢复顺序固定：

1. 用户或当前任务明确定位外层 Run 根目录；
2. 校验外层 `request.json`、`workflow-state.json` 和已有引用；
3. 按当前阶段定位对应子 Run；
4. 使用子 Skill 自身恢复机制读取最新权威状态；
5. 只执行 `next_action` 指向的合法动作。

特殊规则：

- Generator 恢复必须先对原 run directory 调用其 compiler，不从聊天或文件名猜测阶段；
- Runner 恢复必须使用同一 Runner Run 执行 `resume-check`；
- 已完成动作和效果不确定的副作用动作不得自动重放；
- PRD 原始字节、物料范围、Case Document 引用、预期文本或通过标准发生变化时，旧交接失效并要求新 Run；
- 用户只需回答当前 `minimum_missing_input` 或子 Skill 明确返回的 `required_user_action`。

## 8. Run 目录

```text
<workspace>/e2e-runs/<run-id>/
├── request.json
├── workflow-state.json
├── generation-ref.json
├── execution-plan-ref.json
├── execution-profile.json
├── runner-input.json
├── runner-run-ref.json
└── final-index.json
```

文件按阶段创建，不要求空占位。外层只拥有上述交接文件，不复制或修改子 Run 的权威产物。

## 9. 插件目录

```text
prd-e2e-plugin/
├── .codex-plugin/
│   └── plugin.json
├── package.json
├── bundle-lock.json
├── skills/
│   ├── run-prd-e2e/
│   │   ├── SKILL.md
│   │   ├── agents/openai.yaml
│   │   ├── package.json
│   │   ├── schemas/
│   │   ├── scripts/
│   │   ├── references/
│   │   └── tests/
│   ├── generate-test-cases/
│   └── b2b-e2e-runner/
├── scripts/
│   ├── vendor-child-skills.mjs
│   ├── verify-bundle.mjs
│   └── check-install-conflicts.mjs
└── tests/
    ├── plugin-package.test.mjs
    └── install-smoke.md
```

插件 scaffold 必须由当前环境可用的 `plugin-creator` 生成或校验。Manifest 至少包含合法的 `name`、严格 semver `version`、`description`、`author.name`、`skills: "./skills/"` 和 validator 要求的 `interface` 字段。第一版是本地插件，不在本次范围内添加 MCP、App、Hook、品牌素材或远程发布元数据。

## 10. Vendoring 与版本锁定

`vendor-child-skills.mjs` 必须：

1. 接收两个显式子 Skill 源目录；
2. 校验其 `SKILL.md` frontmatter 名称；
3. 仅替换插件内对应的两个明确目标目录；
4. 按普通文件逐字节复制，不改写业务内容；
5. 拒绝 symlink、设备文件、socket、嵌套 `.git` 和越界路径；
6. 计算源目录与目标目录的确定性 tree SHA-256；
7. 两者一致后原子写入 `bundle-lock.json`。

tree hash 规则：忽略 `.DS_Store`，按 POSIX 相对路径字节序排序，对每个普通文件计算 SHA-256，再对 `relativePath + NUL + fileSha256 + LF` 序列计算总 SHA-256。

`bundle-lock.json` 记录：

- 插件名和 lock schema；
- 三个 Skill 的相对路径、来源类型和 tree SHA-256；
- 当前兼容的 Generator schema/compiler 版本；
- Runner 输入 schema 版本。

不得写入开发机器绝对路径。

## 11. 子 Skill 更新流程

任一内置 Skill 更新时：

```text
更新权威 Skill
-> 重新 vendor
-> 更新 bundle-lock.json
-> 运行兼容性与全量测试
-> 修改插件版本
-> 重新发布/重新安装插件
```

判断规则：

- 仅内部实现变化且输入输出契约兼容：通常不修改 `run-prd-e2e`，但仍需重新打包和发布插件；
- 契约、Schema、暂停状态或报告输出变化：先修改 Compiler/Adapter 与测试，再重新打包；
- 兼容性无法证明：不得发布新 bundle。

运行时依赖外部独立 Skill 的“自动最新版”方案不采用，因为它会破坏一次安装、版本可复现和兼容性保证。

## 12. 安装冲突

插件暴露的三个 Skill 名称必须唯一。安装前检查目标 Codex profile 是否已从其他来源暴露：

- `run-prd-e2e`；
- `generate-test-cases`；
- `b2b-e2e-runner`。

发现冲突时，工具只报告 `{name, bundledPath, installedPath}` 并停止。不得自动删除、移动、覆盖或禁用现有 Skill。由用户选择清理独立安装或使用干净 profile 后再安装。

## 13. 错误处理

错误必须使用稳定 code，并提供不含秘密的定位信息。最低错误集合：

- `INPUT_CONTRACT`：启动或文件结构不合法；
- `AUTHENTICATED_URL_FORBIDDEN`：URL 含认证材料；
- `SECRET_MATERIAL_FORBIDDEN`：发现秘密；
- `ILLEGAL_TRANSITION` / `STALE_TRANSITION`：状态转换非法或过期；
- `HANDOFF_REF_MISMATCH`：Case Document 与 Execution Plan 引用不一致；
- `CASE_NOT_EXECUTABLE`：选中项不满足执行条件；
- `MODULE_NOT_FOUND`；
- `ORACLE_STEP_MISMATCH` / `STEP_WITHOUT_ORACLE`；
- `EXECUTION_PROFILE_INCOMPLETE`；
- `RUN_INTEGRITY` / `RUNNER_LINEAGE_MISMATCH`；
- `BUNDLE_SHAPE` / `BUNDLE_DRIFT` / `SKILL_NAME_CONFLICT`；
- `NEW_RUN_REQUIRED`：权威输入或标准变化，不能恢复原 Run。

错误不得包含密码、Token、Cookie 或认证 URL 原文。

## 14. 测试策略

### 14.1 编排 Skill

- 启动输入与秘密扫描；
- 封闭状态转换、幂等和恢复；
- Case/Step/Oracle ID 与文本保真；
- 非 Grounded、非 Execute、未 ready Case 拒绝；
- 每 Step 无 Oracle 时拒绝；
- 非生产证据和清理声明门槛；
- Runner 输入通过当前 Runner validator；
- Runner 暂停多次后仍恢复同一 Run；
- Runner 报告与 final index 追踪一致；
- `no_execution_selected` 不初始化 Runner。

### 14.2 插件

- 恰好发现三个预期 Skill，且名称不重复；
- 三个 Skill 均通过 Skill validator；
- 插件通过 Plugin validator；
- lock hash 与实际目录一致；
- vendored 子 Skill 与源快照 hash 一致；
- 不含开发机器绝对路径和秘密；
- 同名独立 Skill 冲突能够被检测并阻止安装；
- 干净 profile 中一次安装后，新会话可发现三个 Skill。

### 14.3 行为场景

至少验证：

1. 自动接力：Case 生成后不要求用户手工点名 Runner；
2. 契约压力：拒绝把 Generator v4 bundle 直接交给 Runner v2；
3. 恢复：账号阻塞解除后恢复同一外层 Run 和 Runner Run，不重放已完成或效果不确定动作。

## 15. 实施约束

- 直接在最终插件目录结构中开发，不先创建另一个临时产品结构再搬迁；
- 运行时代码仅使用 Node.js 内置模块；
- 新脚本先写行为测试，再实现；
- 不修改两个 vendored 子 Skill；
- 不在未经用户另行授权时安装到当前活动 Codex profile；
- 不使用真实生产地址做冒烟测试；发现 `.invalid` 地址时只做 discovery-only 测试，不打开该地址。
