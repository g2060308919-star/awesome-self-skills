# Run 产物契约

## 输入与快照

最低输入为 `schema_version: "2.0"`、带 `name`/`target_urls` 的 `suite` 和非空 `cases`。每条 case 有唯一原始 `case_id`、`module`、`title`、`preconditions`、非空 `steps`；每个 step 有 `action` 与非空 `expected`；每个 oracle 有唯一语义 `text`。保留全部已有 ID 与额外字段；缺失 step/oracle ID 依输入顺序稳定生成。非法字段在浏览器操作前以 JSON 路径报错。

`init` 排他创建 `<WORKSPACE_ROOT>/b2b-e2e-runs/<timestamp-random>/`，写入 `test-cases.json`、`execution-log.json` 和 `evidence/`。快照写入后以 SHA-256 固化；随后不得修改。源文件变化不影响 Run，重跑必须新建 Run。

已经由 generate-test-cases 正式交付的 Case Document 与 Execution Plan 可使用现成 `g-case-document-handoff.mjs` 适配器，经 `init-g` 进入同一个当前流程。输入必须是两份 `output/current.json` 正式指针、对应 G 编译器路径和已有确认信息形成的 suite JSON；这些由 Runner 定位/整理，不新增用户前置填写流程。适配器先调用 G 的只读正式交付校验，再复核指针/产物摘要、版本配对、执行清单完成且 execution_ready、runner_ready、当前文档修订绑定、Grounded/execute/ready 和原顺序。固定测试值、来源声明、可替换约束、只读准备及原 Oracle 文字保留进不可变 R 快照。

G 的 schema/compiler 配对沿用已有适配器：4.0.0/0.5.0、4.2.0/0.7.0、4.3.0/0.8.0、4.3.1/0.8.1、4.3.2/0.8.2、4.3.3/0.8.3；本次未修改生成器或放宽其交付校验。纯投影函数只映射形状，不能取代 G 正式校验，也不授予业务执行权限。`init-g` 仍执行当前 Run 的账号、授权、覆盖和浏览器契约，不提供另一运行版本。

## execution-log.json

日志只引用用例 ID，不复制正文。它保存 schema、Run ID/状态/时间、快照哈希、MCP 预检、Target 所有权、角色观察、代理状态/验证、证据与清理总态，以及有序关键事件。检查点事件至少包含 checkpoint ID、状态、四态结果、语义原因、实际观察、证据状态、证据引用、阻塞和时间。还要记录实际执行顺序、动态样本锁定/替换、用户协助和清理事实。

每次 MCP 预检、登录/角色变化、代理变化、关键动作/效果、检查点、阻塞/协助、样本变化和清理后立即用 `record` 更新。写入采用同目录临时文件、完整序列化、fsync、原子 rename；任何时刻正式 JSON 都可解析。

唯一流程为 `b2b-e2e-current`，省略 workflow 参数与显式选择它完全相同。`init` 将 `workflow_profile` 写为首个事件，每个 Run 固定包含 `execution_coverage@1.0` 和 `mock_fallback@1.0`；仅明确传入 `--mock-fallback allowed|declined` 才写初始 `mock_policy`。未回答时没有决定事件，不能启用模拟。随后在业务开始前记录 `permission_plan` 与完整 `coverage_plan`。旧 workflow 参数在创建目录前拒绝；旧 Run（包括无 profile）在读取/记录/恢复/报告前以 `UNSUPPORTED_WORKFLOW` 拒绝，原数据字节不变，不迁移、不降级接受。缺少能力格式、未知扩展或版本也拒绝；包与 schema 版本仍保留。

`mock_policy` 和 `proxy_policy` 分别授权。共有字段为 `action`（`initial` / `changed` / `revoked`）、`decision`（`allowed` / `declined`）、`decision_source: user`、无秘密用户依据 `basis`；后续决定必须用 `previous_decision_ref` 指向同类最新决定的 sequence。首次不带前序引用；撤回须由 allowed 变为 declined。`proxy_policy` 另需 `purpose: environment_access` 及 `rules_sha256`，由 `scripts/lib/proxy-authorization.mjs` 的 `proxyRulesDigest(rules)` 对实际确认规则计算。规则变化需要新的明确决定及摘要；基础规则按环境访问用途授权，保留请求头、响应头、响应体三种改写；不按业务 URL 或 `non_business` 标签限制合法环境规则。基础代理许可不授权构造用例模拟输入，Mock 许可不授权额外环境规则。所有决定都经 `record` 追加，不能改写历史。

覆盖层事件：

- `coverage_plan` 精确覆盖全部原检查点，记录递增修订、快照哈希、稳定 scope、既有权限组、位置、原步骤与显式依赖；refine 不得改变已执行含义或删除现有范围。
- `coverage_context` 绑定 scope、计划/实际账号、Target、存储上下文、环境、实际安全 URL、切换状态和事实/角色观察引用。上下文变化、权限变化、计划修订、全局等待/恢复会使相关未来工作重新核验。
- `coverage_review` 绑定当前计划修订和事件边界；用于 switch、batch_end、wait、resume、checkpoint_close、final，逐项分类范围并用事实引用证明选择。`checkpoint_result` 增加 `execution_refs` 与 `coverage_review_ref`；开始事件增加 `scope_ids` 与 `context_refs`。
- `data_gap` 记录真实 blocker/探索、缺失条件、已知请求事实和未开始步骤的依赖；`gap_kind` 为 `missing_data`、`preparation_blocked`、`permission_unavailable` 或 `interface_input_unavailable`，准备阻塞可引用实际 `preparation_adjustment`。普通 `undetermined` 可用 `data_gap_ref` 支撑未开始依赖步骤，不再伪造 `resolution_ref`，但必须保留探索引用、`not_attempted_reason` 且没有开放协作。

Mock 层事件包括追加式可变更/可撤回的 `mock_policy`、从合法数据缺口派生的 `mock_candidate`、版本化 `mock_attempt`、去重请求事实 `mock_observation`、不覆盖原检查点的 `mock_checkpoint` 和候选收尾 `mock_disposition`。场景/状态/回执是运行资产，不是第二份产品结果；代理不得直接覆盖 `execution-log.json`，Runner 通过既有 `record` 导入。重复回执幂等，跨 Run、未知证据、过期上下文和无效顺序同时在 record 与重放校验中拒绝。

`mock_candidate` 必须填写 `assertion_domain: frontend|real_backend|real_permission` 与原断言依据 `assertion_basis`；已有 `checkpoint_semantics` 时分类必须匹配。`mock_checkpoint` 的 passed/failed 只允许 frontend 候选，并须有 `page_observation_refs` 引用同 attempt_id、checkpoint_ids 的实际页面观察；观察必须晚于本场景实际开始、触发和引用的关联回执，状态/回执不能代替页面消费证据。请求行为断言可以没有回执，必须有实际观察窗口；响应消费通过必须引用实际响应及后续页面事实。后台或权限专属断言不能由模拟升级为通过。

权限计划契约保持不变：

- 初始 `permission_plan` 只保存不可变的权限组—用例—检查点拓扑。后续可用性、账号和核验不回写计划，由初始计划与追加日志确定性派生为当前权限状态；覆盖上下文和切换/批次审查必须查询该当前状态。
- `version: "1.0"`；`groups` 是本轮实际权限组数组；`role_independent_case_ids` 是确实不依赖角色的原 case ID。
- 每组必须包含唯一 `group_id`、用例角色原文 `role_text`、非空 `permissions`、原 `case_ids`、完整 `checkpoint_ids`、`availability`、无秘密 `account_ref`、`preparation_owner` 和声明摘要 `declaration`。`ready` 必须有账号引用；`user_preparation_required` 的准备者必须是 `user`。
- 组数、状态分布及账号映射不限；组与账号不要求一一对应。组覆盖加无角色用例必须完整覆盖快照，不能改写或复制用例。

后续事件沿用 `record`：

| 事件 | 必填字段与语义 |
|---|---|
| `permission_availability` | `group_id`、三态 `availability`、`account_ref`、用户明确说明的无秘密 `declaration` |
| `permission_batch` | `group_id`、`phase`（`started` / `waiting` / `drained`）、事实 `description` |
| `permission_wait` | 含 `assistance_id`、`group_id`、仍未完成且同时属于开放协作与该组的 `checkpoint_ids`、具体 `reason`；不伪造执行结果 |
| `role_observation` | `observation` 含 `group_id`、计划 `account_ref`、实际 `observed_account_ref`、固定 `verification_scope: execution_context`、`verification`（`verified` / `mismatch` / `unconfirmed`）、已登记 `target_id`、非生产 `environment_ref`、非秘密 `context_ref`、`switch_status` 和事实 `description` |
| `execution_context_change` | 已实际发生变化的 `context_ref`、受影响已登记 `target_ids` 和事实 `description`；只使相关未完成组旧核验失效 |
| `resume_check` | 由 `resume-check` 自动写入，用来使恢复前的角色核验失效 |

`assistance` 使用 `assistance_id`、`phase`（`requested` / `resolved` / `unavailable` / `stop_waiting` / `stop_run`）、精确 `checkpoint_ids`、事实 `description` 和 `decision_source`。`requested` 还须有 `required_user_action` 与真实 `attempts`；确实涉及权限时才有 `group_ids`。后续事件只能处理同一事项仍未解决的范围；无法协助、停止等待与停止全轮必须是明确用户决定。不接受旧 `permission_decision` 简写；停止等待须使用当前协作事件。

`evidence_capture` 记录精确 `checkpoint_ids`、固定 `capture_kind: screenshot`、`capture_scope: page|request_details`（省略为 page）、`outcome`（`captured` / `failed` / `unavailable`）、上下文 `description` 与真实 `attempts`。成功必须注册真实图片 `evidence`；失败/不可用必须有 `reason` 且不能引用模拟图片。不同 scope 的采集缺口分别保留，普通页面截图不能补齐请求详情缺口。`evidence_status: complete` 必须有实际材料，且每类已记录采集的最新状态均成功；没有材料或仍有缺口时用 partial/missing，并保留产品原结果。实际执行用例在阶段或最终交付前必须有成功或明确缺失的截图采集记录。

实际发生请求/响应控制影响时追加 `control_effect`，字段为精确 `checkpoint_ids`、`attempt_id`、已登记 `target_id`、`phase: request|response`、实际 `match` 与可读 `description`。`checkpoint_result.verification_source` 使用 real/mock_affected/unknown：存在控制影响不能声称 real，mock_affected 必须有实际控制影响记录；仅配置规则不能证明影响发生。报告投影呈现“含模拟或控制影响”与影响说明，仍保留原四态、断言标准和真实观察。该事件不替代独立授权、完整 Mock 引擎或实际页面消费证据，也不证明请求前写入隔离。

可用 `report_context` 记录经允许展示的 `prd_links`、`environment_description`、`display_timezone` 和来源 `description`，不修改目标或预期。链接只允许无认证信息的 HTTP(S)。

最终 `undetermined` 的 `checkpoint_result` 必须在 `exploration_summary` 和 `exploration_ref` 中恰选一个。摘要字段为精确 `checkpoint_ids`、`missing_fact`、`known_facts`、真实 `attempts`，没有尝试时的 `not_attempted_reason`，以及 `cannot_continue_reason`。`exploration_ref` 只能引用本 Run 先前带合法摘要的 blocker。未开始检查点还须满足原权限终结路径或用 `resolution_ref` 引用先前的合法协作解决/结束事件；开放协作未结束时拒绝终结。

权限原因直接结束检查点时，`checkpoint_result.permission_group_ids` 保留精确组引用。未知组/检查点、未知版本、缺失覆盖、错误账号/Target、必要切换未完成、未就绪或未实际核验就开始、等待覆盖已完成项、以及仍有未处理检查点时完成 Run 都拒绝。`record` 和日志重放使用同一校验。

有效示例：先记录待准备组的 `permission_availability` 为 `ready`，再记录页面事实为 `verified`，成功记录绑定当前账号与新鲜观察的 `coverage_context`，然后开始其检查点。权限、账号或上下文变化后必须重复这道闸门。拒绝示例：只因用户说“好了”便直接写 `checkpoint_started`，或先操作业务页面再补上下文；没有新鲜角色核验或上下文被拒时必须失败关闭并只暂停受影响范围。

## 场景级执行与统一进度

以下字段由 Runner 从原用例与实际操作整理，不新增用户前置填写流程。单场景默认使用 `scope_id` 作为 `scenario_id`；scope 可包含 `preconditions`、`assertion_kind: ui|response_consumption|request_behavior`、`assertion_domain: frontend|real_backend|real_permission`、`chain_id`。多场景使用非空且至少两项的 `scenario_requirements`，每项严格包含 `scenario_id`、`step_refs`、`source_refs`、`preconditions`、`assertion_kind`、`assertion_domain`、`chain_id`，不能同时填写 scope 的单场景字段。计划修订不得删减场景或改写已绑定语义。

依赖可声明 `condition_kind: required_action|preparation`，省略为 required_action。只有原文明确属于准备条件且有原步骤来源依据时才标 preparation；模拟准备不能替代原必需动作。固定批次按原输入首次出现顺序并尊重必需动作依赖排序；必需动作产生 A→B→A 配置循环时拒绝并说明输入冲突。`batch_id` 是 scope 的排序权限组 ID 以 `+` 连接，无权限组为 `general`。

| 事件/扩展 | 必要字段与验证 |
|---|---|
| `identity_observation` | `account_ref`、相同的 `observed_account_ref`、自有 `target_id`、`context_ref`、`environment_ref`、`observed_url`、`verification: verified`、引用该 Target/上下文真实页面或 Network 的 `fact_refs`；只核验真实身份 |
| `data_gap` 权限缺口 | `gap_kind: permission_unavailable`、精确 `group_id`、新鲜 `identity_ref`、明确用户无法提供资源的 `resource_statement_ref`；资源状态保持 unavailable |
| `simulated_permission` | `group_id`、`identity_ref`、上述 `gap_ref`、已知契约的 `contract_refs`、`input_description`；不得伪记实际权限 ready |
| `coverage_context` 扩展 | `identity_ref`、可选 `simulated_permission_ref`、`verification_stage: identity`；真实身份可在同源入口核验，不以被测权限行为先成功作为前提。仅数据 Mock 时沿正常真实权限上下文，无须 unavailable 或模拟权限事实 |
| `scenario_preparation` | `checkpoint_id`、`scenario_id`、唯一 `execution_id`、`batch_id`、`context_refs`、同检查点实际前置输入 `fact_refs`、独立 `data_source: real|mock` 与 `permission_source: real|mock`。模拟输入另需当前 `attempt_id`、`scenario_hash`、最新 `state_version`；模拟权限需 `simulated_permission_ref` |
| 准备依赖扩展 | `scenario_preparation.prepared_dependencies: [{dependency_id, fact_refs}]` 只关联本场景输入事实与原计划 preparation 依赖，不能完成或改写其来源操作。由有效 Mock 结果满足的依赖必须在同一 attempt/hash 相容链内，不能用于真实写链 |
| `checkpoint_started` / `mock_checkpoint` started | 同一 `scenario_id`、`execution_id`、`preparation_ref`、精确单个 `scope_ids`、新鲜 `context_refs`；可带匹配 `batch_id`。模拟开始还需原有 attempt/candidate 字段，与准备的尝试/hash/当前状态一致 |
| `action_dispatched`、页面与 Network 事实 | 使用同一 `scenario_id`、`execution_id`、检查点关联和模拟时的 `attempt_id`。实际触发晚于开始、页面观察晚于触发；不能仅写自由文本或代理计数代替执行 |
| `checkpoint_result` / `mock_checkpoint` result | 使用同一场景和执行 ID，保留原结果/证据字段，引用实际触发后的 `execution_refs` / `page_observation_refs`；passed、failed 都需要完整前置输入与实际执行链 |

响应消费通过需要同场景匹配响应（实际 Network `response_status`，或 Mock 的 `disposition: mocked` 与 `response_facts`）以及其后的页面观察。请求行为断言的 Network 事实使用 `request_window: {action_ref, completion_ref, completion_basis, request_count}`；completion_ref 指向实际控件完成页面事实，计数为非负整数，不能仅凭固定等待或强制 Mock 命中判定。

准备、开始和结果均复核上下文；实际身份、权限、浏览器或恢复状态变化会使旧核验失效。模拟场景修订后必须基于当前 hash 重新准备，不能复用旧准备记录。场景引擎回执只在确有唯一开放执行时关联其场景；准备期间回执不能伪造为产品执行。

`execution-progress` 从不可变快照与追加事件统一派生场景/检查点/case/固定批次，覆盖、依赖、权限、日志重放与报告共用。真实失败优先保留，但同 case 其他场景未测时 `execution_complete` 仍为 false。候选合法收尾不表示场景已测。允许模式中的 unknown/unsupported/遗漏候选、预排除或后端专属输入不能正常完成；拒绝模式保留已探索缺口和原契约合法预排除。未回答不是拒绝。

当前配置未合法完成不能启动另一配置；完成后不能返回。只在当前批次内继续独立工作，其他批次存在可测范围不阻止当前批次明确等待。最终审查、`run_state: completed`、validate、report 和 deliver 均执行共同门槛；用户原有 `assistance.stop_run` 可以生成明确标注未完成的早结束报告，不能算全量完成。

## 执行事实与追加尝试

以下事件都使用同一 `record` 入口，秘密、路径和证据关联检查同样适用；运行重放用相同验证器。同一场景执行结果不可覆盖，已完成真实场景不可重开；同检查点的其他原必测场景仍须继续。补充结果只追加，不重写快照、原 expected 或原结果。

| 事件 | 字段与边界 |
|---|---|
| `checkpoint_semantics` | 执行前一次记录 `checkpoint_id`、`assertion_domain`（`frontend` / `real_backend` / `real_permission`）、`condition_kind`（`fixed` / `preparation` / `direct`）、原用例依据 `basis`；不得事后改分类以抬高结果 |
| `preparation_adjustment` | 唯一 `adjustment_id`、精确 `checkpoint_ids`、固定 `classification: preparation`、`original`、`replacement`、`basis_refs`、`unchanged_goal_reason`、`support_scope`、`verification_refs`；核验引用实际页面/Network 或已完成回读/上传/保存的 `form_interaction`。固定/直接核心条件不能登记为可调整准备数据 |
| `form_interaction` | `interaction_id`、`checkpoint_ids`、`control_kind`、`stage`、实际 `method`、`description`；文本/日期阶段为 `tool_filled`、`confirmed`、`readback`，文件为 `file_selected`、`uploaded`，保存为 `saved`。确认及后续阶段引用实际 `fact_refs`；回读先有确认并记录 `actual_value`，上传先有文件选择，同 ID 不得跨控件/范围复用 |
| `supplementary_attempt` | `attempt_id`、`checkpoint_ids`、`phase: started|result`、`source: real|mock`、`description`；结果必须匹配开始范围/来源且只能一次，带四态中的 passed/failed/undetermined 与实际 `fact_refs`。它保存补充观察，不升级原始失败/未知 |
| `mock_channel_coverage` | 精确 `target_id`、当前 `context_ref`、`scenario_hash`、`covered_route_ids`、实际 Network `request_refs`、`channels` 与 `uncovered_channels`。每个合法 channel 为 `kind: page-http`、同一 Target 和请求引用；无法确认或存在未覆盖通道不能启动该场景 |

`mock_channel_coverage` 在运行时还与代理配置的 `mock_channel_coverage_ref`、Run/attempt/场景摘要核对；每条实际 `network_observation` 必须含 `target_id`、`context_ref`、`channel: page-http`、安全 `url` 和精确 `method`；正式路由通过请求的 `route_id` 或覆盖事件的 `route_bindings: [{route_id, request_ref}]` 关联，证明覆盖的路由确实来自该页面通道。`route_bindings` 仅用于先经同一发现会话安全探针核验、随后被阻断的 `discovery_request`，需精确匹配实际 URL/method；不能把未知接口预先伪装为已编译路由。不能用人为填写覆盖布尔值或另一 Target 请求替代事实，不为取证擅自触发真实业务写入。新上下文或场景修订后重新核验。

动作使用 `action_planned` → `action_dispatched` → `effect_observed` / `action_confirmed`。计划与派发必须包含非空 `action_id`、原 `checkpoint_id` 与显式 `side_effect`；效果确认引用 `page_observation` / `network_observation` 的 `fact_refs`，引用必须关联同一 action_id、checkpoint_ids 且晚于派发。记录可读 `description`，`outcome` 为 `confirmed_success` / `confirmed_failure` / `not_submitted`；无 outcome 的真实效果观察按已确认成功归约。未派发与已证明未提交允许检查重试条件，效果已确认或效果不明拒绝重复派发。不能把日志补记或检查点恢复当成业务动作执行。

验证来源与证据状态不增加新的结果状态。报告从这些事件关联准备调整、表单阶段、补充尝试与原检查点；真实失败优先，后台专属断言不能由 Mock 升级为真实通过。

## 浏览器会话辅助命令

先初始化当前 Run；在登录前准备其专用浏览器。只有宿主管理接口明确支持传入共享 loopback 启动参数时，才选择 `--host shared-loopback`：

```text
node <SKILL_ROOT>/scripts/browser-session.mjs prepare --run <RUN_ROOT> --storage-context <NONSECRET_CONTEXT> --host shared-loopback --config <ACTUAL_LAUNCH_CONFIG_JSON>
node <SKILL_ROOT>/scripts/browser-session.mjs discover --run <RUN_ROOT> --storage-context <NONSECRET_CONTEXT>
node <SKILL_ROOT>/scripts/browser-session.mjs bind --run <RUN_ROOT> --storage-context <NONSECRET_CONTEXT> --page-id <CURRENT_MCP_PAGE_ID> --marker <RETURNED_MARKER> --mcp-pages <CURRENT_MCP_LIST_PAGES_OUTPUT_TXT>
```

`--config` 可省略；传入时只含无秘密的实际连接配置。摘要保留全部实质启动参数及环境字段，不能因某变量可疑就删掉它。调用追踪元数据单独传递，不进入实质配置。prepare 只建立 Run 所有权、生成空 profile 和启动参数，不启动 Chrome，也不启用 Fetch。宿主管理工具负责使用返回的 `chrome_devtools_mcp_arguments`（独立 userDataDir、动态 remote-debugging-port=0）启动一次未登录实例。返回 `reused: true` 或 `launch_allowed: false` 时不得重新 launch；配置变化须先核实并显式退出旧代次。宿主不支持时记录 unsupported，独立真实测试可继续，不伪造可共享能力。

首次绑定先用 MCP 导航自有页到 prepare 返回的唯一无秘密 marker，实际调用 list_pages，由 Agent 保存本次真实工具文本到临时文件并传入 `--mcp-pages`，取得当前 pageId 后 bind；不要求用户填写、复制或猜测页面映射。discover 仅读取已登记自有临时 profile 的 `DevToolsActivePort`，验证 loopback `/json/version`、实际 `/json/list` 和浏览器身份摘要；不扫描其他浏览器。bind 依据唯一 marker 匹配实际 Target，并核验 pageId 确实来自该次 MCP 输出，记录映射与 Target 所有权；它仍返回 `business_allowed: false`，必须重新取得语义快照、角色/覆盖上下文和代理/通道验证后才执行业务。

`browser_session` 经同一 record 追加：`phase` 为 prepared、bound、disconnected、target_lost、retired 或 unsupported；共同字段为 `run_id`、`generation`、`storage_context`、`config_sha256`、`shared_connection`（pending/ready/unavailable），仅保存无秘密 `profile_name`。bound 另有精确 `target_id`、`mcp_page_id`、loopback `endpoint`、`browser_identity`、`mapping_proof`（unique_blank_marker/host_target_metadata/reverified_marker）与 `mapping_evidence`。marker 证据含 `page_id`、`marker`、`source: chrome-devtools-mcp:list_pages`、实际文本的 `observation_sha256`；权威宿主元数据证据含 `page_id`、`target_id`、`source: host_target_metadata`。后继代次用 `previous_session_ref` 关联历史，不能修改原会话。

恢复先 discover，依据浏览器身份和旧实际 Target 决定可否重绑；身份不明或 Target 消失时禁止业务和盲目新建。只有无未确认写入、活跃模拟或其他页面副作用的安全边界，才可用 marker 重新导航自有页；不能为取得映射打断用户页。宿主若公开提供可验证的 Target/pageId 元数据，可据此登记 host_target_metadata；当前 bind CLI 只实现 marker 路径。映射失效时重新取语义节点，不按 URL 猜页。恢复动作只恢复连接，不重放业务写入。

## CLI

路径均可为绝对路径并支持空格：

```text
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON> --workflow-profile b2b-e2e-current
node <SKILL_ROOT>/scripts/run-artifacts.mjs init --workspace <WORKSPACE_ROOT> --cases <CASES_JSON> --mock-fallback allowed|declined
node <SKILL_ROOT>/scripts/run-artifacts.mjs init-g --workspace <WORKSPACE_ROOT> --case-manifest <G_CASE_OUTPUT_CURRENT_JSON> --plan-manifest <G_PLAN_OUTPUT_CURRENT_JSON> --g-compiler <G_COMPILER_MJS> --suite <CONFIRMED_SUITE_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs record --run <RUN_ROOT> --event <EVENT_JSON>
node <SKILL_ROOT>/scripts/run-artifacts.mjs resume-check --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs validate --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs report --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs deliver --run <RUN_ROOT>
node <SKILL_ROOT>/scripts/run-artifacts.mjs deliver --run <RUN_ROOT> --stage requested
node <SKILL_ROOT>/scripts/run-artifacts.mjs archive-screenshot --run <RUN_ROOT> --event <CAPTURE_EVENT_JSON> --source <ACTUAL_TOOL_IMAGE> --source-root <AUTHORIZED_TOOL_OUTPUT_DIR>
node <SKILL_ROOT>/scripts/run-artifacts.mjs archive-screenshot --run <RUN_ROOT> --event <CAPTURE_EVENT_JSON> --image-stdin true
```

`activity-start`、`activity-end`、`activity-complete`、`link-retake` 及其旧事件均已退役并拒绝，不迁移活动计时或跨 Run 汇总记录。当前补充观察使用同一 Run 的 `supplementary_attempt`，不能用它提升原已终结结果。

stdout 恰好一个 JSON。退出码：0 成功、2 输入契约、3 一致性、4 秘密扫描、5 文件系统。错误信息必须脱敏。

截图字节校验使用本 Skill 的锁定依赖。首次归档前，在 `<SKILL_ROOT>` 执行 `npm ci --ignore-scripts --omit=dev`（开发测试不加 `--omit=dev`）。只安装到已获准的 Skill 目录，不做全局安装，不自动覆盖个人安装副本；依赖不可用时拒绝归档，不降级为只检查文件头。普通 init/record/report 不因此安装全局依赖；涉及图片归档验证时依赖缺失应明确报错。

`archive-screenshot` 接收一个现有成功 `evidence_capture` 事件，且恰好一份 `kind: screenshot` 证据。路径采用 `evidence/<安全单一文件名>.png|jpg|jpeg|webp`。文件模式必须来自本次 MCP 真实输出的明确可读授权目录；不得以此绕过工具访问限制。返回值模式从 stdin 接收 MCP 图片块的 `{data, mimeType}`，不把 Base64 写进账本。两模式互斥，上限 25 MiB；类型/截断/路径/符号链接/覆盖/元数据秘密检查失败则拒绝。原字节排他原子归档后复用 `record` 登记；登记失败撤回本次新文件，不修改产品结果。证据增加可选 `sha256` 和 `capture_source`，校验时检查摘要；当前 Run 的普通证据条目可不带该可选摘要；它们仍须通过路径、内容和秘密检查。摘要只能证明字节一致，不能证明来源真实或图片无秘密，必须由 Runner 核对工具来源、画面及检查点。

新归档在写入前检查容器边界、PNG CRC、文本/压缩文本元数据与标准颜色配置，实际解码全部像素后才接受；解码结果仅在内存中丢弃，持久化仍为原字节。上限为 25 MiB 文件、8 MiB 元数据检查预算、64×1024×1024 像素及 5 秒解码处理。超过上限、损坏、未知/嵌套元数据均拒绝；不静默删除 EXIF/XMP、ICC 私有标签或重新编码图片。标准 sRGB 的可检查 ICC 标签允许且保留原值；这不表示支持所有相机或专业色彩配置。带 `capture_source: tool_file|tool_image_return` 的归档证据在 Run 校验/报告交付前再次使用同一图片检查；其他当前 Run 证据按其真实登记方式检查，旧 Run 仍整体拒绝。

ICC 支持本次已验证的矩阵/TRC 型标准颜色配置子集：受限名称对应的 `XYZ `、`sf32`、`para`、`curv`、`mluc` 标签，逐项检查长度、内部字符串区间和编码；不接受任意 ICC 标签。允许完全相同的共享数据区间和最多 3 字节的零对齐，不允许未引用数据、部分重叠或标签内尾随载荷。PNG `hIST` 与固定辅助字段纳入元数据扫描；压缩元数据必须完整消费输入，不忽略压缩流之后的字节。这些检查不扩展为像素隐写检测。

`report` 生成内部阶段产物并返回 `delivery`（`kind: stage|final|early_end`、`automaticallyPresent`、中文 `label`）。`deliver` 是外部交付门槛：非 completed 默认不返回路径、统计或表格；只有用户明确请求阶段结果才传 `--stage requested`。最终复用完整生成/校验流程；早结束由原 `assistance.stop_run` 用户决定识别，不引入第二套事实或终结事件。

`resume-check` 检查哈希、日志和最后事件；与执行时共用动作归约，返回 `action_states`、`retryable_action_ids` 和效果不明动作，`auto_replay_allowed` 始终为 false。已确认效果和效果不明的写入都不重放，只有逐动作证实未提交后才允许符合条件的重试；同时复核页面、角色和代理。

`validate` 检查快照哈希、schema、ID 唯一与引用、事件顺序、权限/上下文/协作/探索契约、四态、计数、代理/清理结构、证据路径边界与存在性及秘密。`report` 从同一次 `test-cases.json` 与 `execution-log.json` 读取建立共享模型，派生单一 `report.html` 与不落盘的对话表；人工修改报告不会改变事实。

`report` 的 stdout 恰好一个 JSON，包含 `runId`、`counts`、`reportFormat: "html-only-v1"`、完整 `chatTableMarkdown`、`snapshotHash`、`eventCount` 和 `lastSequence`；`reportPath` 与 `htmlReportPath` 相同，均指向 `report.html`。初始化或普通执行中尚无报告合法；进入 `awaiting_user` 或 `completed` 后必须有合法 HTML，存在 `report.md` 反而拒绝。旧 Run 不生成任何报告，不修改其已有报告。

共享报告模型负责把账本事实投影为面向评测者的语义时间线、证据说明、代理结论、清理结论和一致性结论。HTML 渲染器只消费这些语义字段，不序列化任意账本对象；机器级哈希、序号、内部状态和值域仍以 `execution-log.json` 为准。

使用原子文本写入 `report.html` 并回读比对。HTML 缺失、陈旧、被篡改、写入失败或生成期间账本变化都不得交付；只允许从原账本重新生成 `report.html` 和对话表，不手改派生结果。`checkReport: false` 仅用于重建前忽略旧派生内容，不跳过快照、日志、证据和秘密结构检查。不得通过切换旧 workflow 绕过上述检查。

## 证据引用

路径必须是 Run 根目录下以 `evidence/` 开头的相对普通文件，禁止绝对路径、`..` 越界和任一层符号链接。每份证据有全局唯一 ID、时间、描述、支持的检查点，并且只提供相对路径或内联结构化内容之一。`kind: screenshot` 的文件只允许内容与扩展名相符的 PNG、JPEG 或 WebP；检查点只可引用已注册且确实声明支持它的证据。详细安全规则见 [security-and-evidence.md](security-and-evidence.md)。
