# b2b-e2e-runner 完成审计

审计日期：2026-08-30

## 结论先行

完成定义已满足，`b2b-e2e-runner` 可以声明为已实现、已安装并完成前向验证：

- 源码包与个人安装副本都严格只有 `SKILL.md`、`agents/openai.yaml`、`assets/report-template.md` 三个文件，逐字节一致；官方 skill-creator validator 对两处均输出 `Skill is valid!`。
- 个人 Codex 已按用户授权配置并启用固定命令 `npx -y chrome-devtools-mcp@1.7.0 --isolated`，fresh executor 成功发现并调用该 MCP；没有使用 Playwright、Computer Use 或其他浏览器回退。
- 一个 fresh-context、tool-call-audited executor 通过独立可见 Chrome 完成了 raw semantic plan 的全部 8 个用例并生成最终三项制品：[`report.md`](chrome-forward-run/artifacts/report.md)、[`execution-log.json`](chrome-forward-run/artifacts/execution-log.json)、[`evidence/`](chrome-forward-run/artifacts/evidence/)。
- 最终结论为 Passed 4、Failed 1、Inconclusive 2、Not Run 1；21 个必需断言为 14 `verified-pass`、2 `verified-fail`、2 `unverified`、3 `not-run`。四类 assertion outcome、四类 case verdict 和四类 provenance 均有实际记录。
- TC-08 在破坏性目标不明确时保持暂停；用户明确授权 `删除 REQ-9001，保留 REQ-9002` 后，只点击一次 `Delete REQ-9001`。新观察确认 REQ-9001 缺失、REQ-9002 仍为 `$125.00 / Draft`，其他记录仍在。
- 最终运行根目录严格只有三项输出。28 个唯一 evidence 引用全部存在且都被 report 索引；JSON、结论派生、链接、evidence 引用边界、symlink 和 RC 制品 secret-canary 扫描均通过。

没有剩余的实现或规范测试缺口。保留两项披露限制：Chrome DevTools 拒绝向临时 run 目录写截图，因此使用脱敏的结构化文本证据；宿主没有对所有仓库路径施加 OS 级读取隔离，因此本运行不称为“OS-enforced strict oracle-blind”。这两项不是原始 TD01–TD24 的未满足条件。

## 2026-08-30 合并前定点加固

预合并审查发现运行时同名目录规则会把已安装 Skill 自身误判为冲突，并建议显式声明浏览器侧内容不构成授权。修订前 4/4 fresh-context 样本复现 self-conflict；修订后 5 个独立样本对 self-conflict 与不可信内容边界共 10/10 判定通过。源码与安装副本随后重新同步并通过官方 validator，demo 仍为 23/23。完整记录见 [`premerge-hardening.md`](premerge-hardening.md)。

这次定点修订发生在下述 8-case Chrome forward run 之后；没有声称修订后的字节版本重新完成了全量 Chrome 运行。既有 RC 仍支持未改动的执行、结论、归因、清理、诊断与制品合同，本次变更由定点 fresh-context 行为检查覆盖。

## 证据分类

- **SC（静态契约）**：当前 Skill 与报告模板的明确约束。
- **RED（无 Skill 控制组）**：[`red-baseline.md`](red-baseline.md) 的 12 个 fresh-context 场景。
- **PA（代理行为测试）**：[`green-forward.md`](green-forward.md) 与 [`microtests/`](microtests/) 的 fresh-context 行为结果。
- **DR（demo readiness / HTTP-unit）**：[`demo-app/validation.md`](demo-app/validation.md) 及 23/23 demo 测试。
- **RM（MCP missing）**：[`representative-run/`](representative-run/) 的能力缺失门禁运行。
- **SG（start gate）**：[`start-gate-forward/`](start-gate-forward/) 的生产拒绝与未知环境暂停。
- **RC（real Chrome forward run）**：[`chrome-forward-run/artifacts/`](chrome-forward-run/artifacts/) 的完整浏览器运行及最终制品。

## D01–D25 不可变决策

| ID | Verdict | 主要证据与判定 |
|---|---|---|
| D01 | Satisfied | `SKILL.md` 只接受已确认语义计划并输出事实、日志和报告；RC 直接消费上游计划，没有生成用例。 |
| D02 | Satisfied | start gate 只要求足够测试语义，不定义精确 Schema；RC 使用 `demo-app/test-plan.json` 成功执行。 |
| D03 | Satisfied | `SKILL.md` 要求精确范围确认；RC 报告和日志保存了全部 8 个用例的 confirmed scope。 |
| D04 | Satisfied | `start-gate-forward/` 实证生产拒绝、未知环境阻塞；RC 仅在 `nonProduction: true` 后启动 Chrome。 |
| D05 | Satisfied | `environment-check.md` 固定并核验唯一 MCP；RC 限制字段与审计路径确认未使用回退。 |
| D06 | Satisfied | RC 启动独立可见 Chrome 与隔离 profile，并在同一受控会话中完成计划。 |
| D07 | Satisfied | `run-login-required.md` 与 `authenticated-session.md` 证明先暂停手工登录，再重新观察；未请求、保存或填写凭据。 |
| D08 | Satisfied | RC 使用结构化 accessibility 状态按业务标签/文本/角色定位，不使用 CSS/XPath、源码路由或预生成地图；截图写入失败被如实披露。 |
| D09 | Satisfied | RC 的 events、cases、steps、assertions 与 evidence 实际覆盖理解、观察、定位、动作、验证、留证和事实记录循环。 |
| D10 | Satisfied | Skill 依赖现场 AI 推理；三文件包中没有权限规划器、角色引擎、导航引擎或状态机。 |
| D11 | Satisfied | RC 实际请求了登录、外部人员操作、角色变更、页面路径/业务解释与破坏性目标确认。 |
| D12 | Satisfied | TC-03 与 TC-08 先做相关只读探索，再保存 case/step、现场、尝试和所需协助。 |
| D13 | Satisfied | TC-06 等待时仅运行声明独立的 TC-01/TC-07；依赖 TC-06 的 TC-05 在其终态后执行。 |
| D14 | Satisfied | 登录、外部操作、角色切换和 TC-08 授权后均重新观察并弃用旧引用。 |
| D15 | Satisfied | TC-02 仅因有效预期被事实否定而 Failed；TC-03/04 作为 case issue/withdrawal 使用 `unverified`/`not-run`，未误报产品失败。 |
| D16 | Satisfied | TC-07 只提交一次；504/不明确结果后先检查列表与详情，确认仅一条 REQ-5001，未重试。 |
| D17 | Satisfied | 28 个 evidence 文件聚焦关键断言、失败、异常、协作、清理与授权，没有为普通点击制造冗余截图。 |
| D18 | Satisfied | RC 实际出现且只使用四种断言状态，语义与 `SKILL.md` 一致。 |
| D19 | Satisfied | 四种用例结论均按必需断言推导；TC-03 的 pass + unverified + not-run 正确为 Inconclusive。 |
| D20 | Satisfied | log 同时保存 `ai`、`user-assisted-observed`、`external-person`、`user-reported-only`；TC-06 下游状态通过没有追溯证明外部交互。 |
| D21 | Satisfied | TC-07 声明清理成功；TC-02 声明清理失败并报告 REQ-4001 残留；未声明清理的持久状态和 TC-08 精确授权范围均明确报告。 |
| D22 | Satisfied | TC-02 只持久化最小诊断字段并将私密字段写为 `[REDACTED]`；最终 RC 制品根目录的 canary 扫描零命中。 |
| D23 | Satisfied | RC 根目录严格只有 `report.md`、`execution-log.json`、`evidence/`，无 HTML 报告。 |
| D24 | Satisfied | 三文件包没有自定义 Runtime、平台或确定性渲染脚本；真实 RC 已证明纯 Skill 能稳定交付。 |
| D25 | Satisfied | 设计基线来自用户 ZIP 的 Spec/Implementation Guide；portable trace 保存源哈希，运行时不咨询或继承其他本地 E2E Skill，也不再把自身安装目录误判为冲突。 |

D 状态计数：**Satisfied 25、Partial 0、Missing 0**。

## 完整 Chrome 运行与制品核验

| 核验项 | 结果 | 权威证据 |
|---|---|---|
| 运行终态 | `status=complete`，有 startedAt/endedAt，8 个 case 均终态 | `chrome-forward-run/artifacts/execution-log.json` |
| 用例汇总 | Passed 4 / Failed 1 / Inconclusive 2 / Not Run 1，等于从 case verdict 独立派生值 | `execution-log.json`、`report.md` Result Summary |
| 断言汇总 | 14 pass / 2 fail / 2 unverified / 3 not-run，共 21 | `execution-log.json` 各 case/step/assertions |
| 来源矩阵 | 四个 provenance 值全部出现，协助与业务结论分离 | `execution-log.json` events/assistance/cases |
| Evidence | 28 个唯一引用全部位于 `evidence/`；文件集合与引用集合相等 | `execution-log.json`、`artifacts/evidence/` |
| Report links | report 中所有相对链接均解析成功，并索引全部 28 个 evidence 文件 | `report.md` Artifact Index |
| TC-08 | 精确授权前后都有新观察；只删 REQ-9001，REQ-9002 保持不变 | `TC-08-authorized-predelete.md`、`TC-08-S1-delete-verified.md` |
| 失败诊断 | 可见失败与单一相关 Console/Network 503 诊断一致；不声称根因 | `TC-02-S2-failure.md`、`TC-02-diagnostics.md` |
| Cleanup | 成功、失败、未声明及残留四类均如实记录 | report 的 Cleanup and Residual Data；各 case cleanup 对象 |
| 数据安全 | 最终 RC 制品无 secret-canary 命中、无秘密原件、无 symlink；evidence 引用无 traversal/越界 | 最终 RC 制品递归审计 |
| 文件合同 | 根目录严格三项；工作区副本与原始 run 根目录逐字节一致 | `chrome-forward-run/artifacts/` 与 `<temporary-run-root>/run` |

历史 CAP-001 仍只证明安装前 MCP 缺失时会清晰停止且不回退；它不被追溯改写为浏览器证据。真实业务证据以上述 RC 为准。

## TD01–TD24 Testing Decisions

编号与用户规范的 portable trace [`source-testing-decisions.md`](source-testing-decisions.md) 一致。

| TD | Status | RC/门禁证据 |
|---|---|---|
| TD01 | Satisfied | 单一最高 seam：输入 raw semantic plan 和非生产 target，核验真实浏览器行为及三项最终制品。 |
| TD02 | Satisfied | RC 打开正确 loopback target、请求手工登录、只用 Chrome DevTools MCP、适配 UI、求助、记录事实并生成完整制品。 |
| TD03 | Satisfied | TC-01 是 AI-only 直通 happy path，三个必需断言均 `verified-pass`，结论 Passed；TC-05/07/08 另有通过路径。 |
| TD04 | Satisfied | TC-02 动作完成后有效成功预期被可见事实否定，两个断言 `verified-fail`，结论 Failed，并有相关证据。 |
| TD05 | Satisfied | TC-03 安全探索可见导航后找不到 Legacy Billing，精确求助而非声明缺陷。 |
| TD06 | Satisfied | 用户确认 TC-03 过时、TC-04 撤回；分别正确形成 case issue、Inconclusive 与 Not Run，没有把无效预期标为失败。 |
| TD07 | Satisfied | TC-05 在 Analyst 权限不足时请求角色/权限变化，用户手动切换后才继续。 |
| TD08 | Satisfied | TC-06 由外部人员执行；runner 恢复并重新观察，同时保留未直接观察的交互证据缺口。 |
| TD09 | Satisfied | TC-05 没有依赖固定 role-to-account 规则，接受用户辅助的 Manager 上下文并重新验证。 |
| TD10 | Satisfied | TC-05 角色切换及 TC-06 外部状态变化后均 fresh observe，再执行后续动作。 |
| TD11 | Satisfied | TC-06 等待期间仅继续声明独立的 TC-01/07；TC-05 依赖保持，其他用例顺序没有猜测性重排。 |
| TD12 | Satisfied | TC-07 不明确写结果后没有重试，先观察现态，验证恰好一条业务记录，并清理成功。 |
| TD13 | Satisfied | TC-08 对同名 REQ-9001/9002 不猜测；`done` 仍不足时继续暂停，直到收到精确授权。 |
| TD14 | Satisfied | TC-02 只收集单一相关 503 Console/Network 诊断，字段最小化、脱敏且不作无证根因判断。 |
| TD15 | Satisfied | 关键断言、失败、协作、授权和 cleanup 有证据；普通中间点击不要求重复截图。 |
| TD16 | Satisfied | RC 覆盖四断言状态与四 case verdict；TC-03 的部分执行组合正确推导 Inconclusive。 |
| TD17 | Satisfied | 四类 provenance 与业务 verdict 分字段保存；人工协助本身没有让 case 自动通过。 |
| TD18 | Satisfied | TC-06 的可见下游状态 `verified-pass`，范围内外部交互仍 `unverified`，最终 Inconclusive。 |
| TD19 | Satisfied | TC-07 清理成功、TC-02 清理失败与残留、其他 case 未声明清理、TC-08 精确授权动作均有记录。 |
| TD20 | Satisfied | canary 失败路径被触发；所有持久化 report/log/evidence 仅含脱敏信息，递归零命中；没有秘密截图原件。 |
| TD21 | Satisfied | 两个 fresh start-gate executor 分别实证生产目标在浏览器前拒绝、未知环境在浏览器前阻塞；RC 仅在肯定非生产后启动。 |
| TD22 | Satisfied | RM 实证 MCP 缺失时清晰停止且不使用回退；RC 又实证 MCP 可用路径。 |
| TD23 | Satisfied | RC 每次输出合同在最终根目录表现为 exact-three，所有 report/log evidence 引用解析到 `evidence/` 下。 |
| TD24 | Satisfied | 代表性 loopback demo、raw plan、fresh normal-caller context 和只看可观察交互/制品的独立审计构成完整 forward test；OS 级 read boundary 限制单独披露。 |

TD 状态计数：**Satisfied 24、Partial 0、Missing 0**。

## 其他验证层

- RED 控制组与 GREEN 启用 Skill 组各有 12 个 fresh-context 场景；GREEN 的 12/12 场景未发现 Skill 偏航。场景内部的 Failed 是业务结论，不是行为测试失败。
- microtests 记录了初始措辞方差、最小规则修正及 post-refactor 5/5 样本、25/25 决策通过；它们支持规则稳定性但不替代 RC。
- demo 的 Node/HTTP/domain 套件为 23 tests / 23 pass / 0 fail；它只作为 DR，与 RC 分开计数。
- 生产/未知环境 SG、MCP missing RM、官方 validator、源码/安装副本 byte identity 都有独立落盘记录。

## 最终边界

本次完成声明是“规范三文件 Skill 已实现、安装、配置，并以真实 Chrome 正向运行覆盖 D01–D25 与 TD01–TD24”。它不声称 TC-02 的产品故障已修复，也不把 TC-03/04 的错误用例变成通过；这些诚实的 Failed/Inconclusive/Not Run 正是 runner 行为正确性的证据。
