# Runner 唯一当前流程：实施与验收记录

日期：2026-10-27。规范来源：用户提供的 `b2b-e2e-runner-latest-workflow-20261026/{01-问题记录,02-技术方案,03-spec}.md`。本次只修改 Runner 及其交接测试，不连接历史业务环境，不恢复已停止的业务 Run。

## 1. 来源、备份与版本

- 实际个人安装：`$HOME/.codex/skills/b2b-e2e-runner`。完整源码与仓库 `e75229e` 的 Runner 对应。安装副本未修改。
- 维护源码：仓库 `b2b-e2e-runner/`。实施使用独立 worktree 和 `codex/runner-latest-workflow` 分支。未改原工作区、账号、浏览器配置或历史运行材料。
- 备份在任何源码写入、依赖安装、格式化之前完成。单文件位置：
  `$HOME/Downloads/b2b-e2e-runner-source-backups/b2b-e2e-runner-v2-source-backup-20261027-031734-6737a9273d.tar.gz`
- 归档 SHA-256：`f86680822afd0f7ce6742005025a5cbd03191ee6c5b9954c7f7733d71b26cf6c`；213596 字节。68 个源文件、803090 字节；75 个源码条目，连同元数据共 79 个归档成员。包含 `source/`、`manifest.json`、`RESTORE.md`；清单记录路径、文件类型、摘要、权限、链接规则、来源与排除项。
- 备份排除可再生 `node_modules`；保留依赖清单和锁文件。未收集凭据、个人全局配置、浏览器 profile、业务日志和证据。来源树没有未被备份的项目源码。
- 首次解包验证及归档摘要已在编辑前报告。随后用交付的 `scripts/verify-source-backup.py` 再次核验全部 75/79 项并解至新目录：`$HOME/Downloads/b2b-e2e-runner-latest-workflow-20261027-evidence/backup-verification-ce0533d818`。实际结果见同级 `actual-backup-verification.json`。
- 当前唯一 workflow：`b2b-e2e-current`；输入 schema 保持 `2.0`，覆盖与 Mock 扩展保持 `1.0`，场景保持 `mock-scenario-v1`。没有新增运行版本分支；v1/v2/v3 参数、无 profile 的旧 Run 均明确拒绝，历史文件逐字节不变。
- 合并来源：远程 `3a8584d`。Generator 的源码、分发文件、已有插件副本逐字节保留；正式 G 交接模块保持远程原实现。没有借此重建跨 Run retake 或独立 activity duration 功能。

### 本机原因核对的边界

本机可观察到多个独立的 MCP/Chrome 启动进程，但缺少历史任务完整的宿主调用材料，不能把进程数量或某个环境变量认定为历史故障根因。原 v2 缺少统一的 Run→浏览器代次→Target→MCP pageId 身份登记；原代理接入也不能独自保证宿主共享连接可复用。本次分别补上身份与连接接入，并在本机公开 CLI 宿主复现验证。实质配置参与摘要，调用标识不参与；没有任意删除环境变量。

## 2. 实施文件与设计取舍

| 文件/模块 | 改动及取舍 |
|---|---|
| `scripts/lib/workflow-contract.mjs`、`run-artifacts.mjs` | 默认唯一当前流程；旧输入先拒绝；覆盖和 Mock 格式始终具备但不捏造授权；继续使用原事件、快照与原子文件提交；正式 G 输入仍走现有 delivery 校验。 |
| `scripts/browser-session.mjs`、`lib/browser-session.mjs`、`lib/proxy-browser-binding.mjs` | prepare/discover/bind；只读取本 Run 临时 profile 的动态端口文件；核对 endpoint/浏览器身份/Target/storage/config；原生 MCP 页面清单与唯一空白标记共同证明 pageId 映射；配置变化/丢页/断连先核实。宿主不支持时限制 Mock，绝不扫描其他端口。 |
| `lib/run-mutation.mjs`、`lib/execution-facts.mjs` | 串行化同一日志的读—校验—追加—原子写；保存动作派发与效果，用同一归约器恢复；确认和不明写入禁止重放；旧事实或其他动作的证据不能证明本动作未提交。固定条件与普通准备基线分开；表单填值、确认、回读、上传、保存分别记录。 |
| `lib/mock-fallback.mjs`、`lib/proxy-authorization.mjs` | Mock/普通代理分别授权、追加变更和撤回；真实后端/真实权限断言不因 Mock 通过；前端 Mock 通过需同 attempt、同检查点且晚于回执的页面事实。 |
| `lib/mock-runtime.mjs`、`lib/mock-scenario.mjs`、`cdp-fetch-proxy.mjs` | 继承完整声明式引擎；HTTP(S) Request 保护包含未知 origin/path；严格匹配、模拟状态、写后读、去重、回执链与版本校验；持久化或账本导入失败不交付成功；经过验证的回执可以幂等补记，但不重放写入。单 Target 内请求队列不是并发调度系统。 |
| 同上 | 启动及业务守卫重新核对浏览器/授权/实际通道；只读探测 worker、SW、子目标，不附着它们。正式入口在原日志追加代理生命周期，清理区分页面隔离、Fetch 停用、detach、锁释放与真实响应恢复；断连明确隔离未知。 |
| `lib/permission-batches.mjs`、`report-model.mjs`、`report-html.mjs`、`report.mjs` | 保留权限、覆盖、证据验证；HTML/对话表同一投影，每条原输入一行；真实失败不覆盖；来源、准备调整和补充观察不是新结果状态。删除不用的旧 Markdown 报告入口。保留远程现有 control_effect 和 page/request_details 证据范围。 |
| `SKILL.md`、五份 references、`assets/report-template.md` | 主流程正文、命令、授权、恢复、结果与退出规则同步；不让用户选择旧流程，不新增前置填写表。 |
| `tests/fixtures/latest-*`、`tests/latest-*`、`tests/current-workflow.test.mjs` | 本地非生产夹具、真正的原生 MCP 冒烟、失败回归、备份负例与报告集成。原生 MCP 从已安装 CLI 寻找，不自动下载，不固定开发者路径。 |
| `validation/g-r-generated-handoff.test.mjs` | 原生成器完整产物→正式 `init-g` 交接语义保持；调用参数更新为当前流程。 |

## 3. 能力保留与退役清单

| 能力 | 结果 |
|---|---|
| 不可变快照、原 ID、追加事件、权限拓扑、范围协助、同 Run 恢复 | 保留；所有相关原测试经过公共入口运行。 |
| execution_coverage、依赖和批次审查、部分权限继续独立工作 | 保留并默认启用；测试夹具补齐真实公共事件，没有绕过验证器。 |
| Request 前拦截、严格类型与存在性匹配、模拟状态与写后读 | 保留；实际浏览器 create/read/update/read 和上游计数验证。 |
| Run/attempt/hash/revision/cycle 绑定、状态版本、回执及请求去重 | 保留并加强损坏/分裂写入/补记守卫。不同页面请求不被合并。 |
| 未知请求阻断、安全透传、单 Target 隔离、规则边界更新 | 保留；未知跨域也进入保护。未覆盖通道拒绝。 |
| 页面消费证据、原失败优先、四态、HTML 与对话表一致 | 保留并补充来源/准备/表单投影。 |
| 截图归档、秘密/路径检查、页面与请求详情截图区分 | 保留并接入远程证据完整性要求。5 处原组件夹具把“无图但 complete”改为真实的 partial 和显式缺口，未改产品结果断言。 |
| G Case Document/Execution Plan 官方验证与原文投影 | 保留；正式跨组件测试通过。 |
| 旧 workflow/旧 Run、Markdown 双报告 | 按要求退役，改为拒绝并证明字节不变；没有迁移。 |
| 远程另一版本的跨 Run retake、独立 activity duration | 按本次“不要补齐无关另一版本功能”排除；移除其专属模块及 10 项专属测试，用 current-workflow 的命令/事件拒绝和原数据不变测试代替；额外的旧 P11 profile 测试改为明确拒绝。未因名称含 v2/v3 删除任何完整 Mock、权限或证据能力测试。 |

初始 v2 测试基线为 **195/195**，无基线失败。合并中旧版专属测试曾因旧 profile 被拒绝而失败；随后按上述已明确的退役范围替换，非通过放松校验消除失败。

## 4. 唯一最新使用流程

1. 阅读当前 `SKILL.md` 及其 references。用已确认用例确认非生产环境；同批只询问缺失账号、Mock 决定、普通代理规则，分项保存；账号凭据不进日志。
2. `node b2b-e2e-runner/scripts/run-artifacts.mjs init --workspace <workspace> --cases <cases.json>`。默认当前流程，只有用户已明确初始决定才传 `--mock-fallback allowed|declined`。G 产物用现有 `init-g`，仍进入同一流程。
3. `browser-session.mjs prepare --run <run> --storage-context <context> --host shared-loopback`。此 host 能力必须来自实际宿主探测，不能盲目宣称支持。由宿主公开接口使用返回参数启动一次未登录专用 Chrome；准备共享连接不启用 Fetch。
4. MCP 打开返回的唯一空白 marker 并 `list_pages`，将原始页面清单交给 `bind --page-id ... --marker ... --mcp-pages <file>`；`discover` 仅核验自有 endpoint。记录权限/覆盖/检查点语义，登录后重新确认上下文。宿主限制共享接入时继续独立真实工作。
5. 缺数据按现有数据探索→授权内 UI 准备→获准 Mock。普通准备调整记录依据与支持范围；核心失败保留。输入实际提交并回读。未知写入效果先调查，不能重新创建。
6. Mock 经候选、attempt、场景摘要、通道覆盖、正式 `createProxyListener` 入口；Request 前拦截，回执可靠入账后才返回，最终仍验证真实页面消费。只有前端范围可据 Mock 通过。
7. 等待/撤回/停止时 MCP 使自有页面安全退出，再停止拦截；分别核实清理和真实只读恢复。断连停止业务并报告隔离未知。
8. `validate`、`report`、`deliver` 使用同一日志。阶段报告只表示尚未完成；正式结束才交付完整 HTML 和每条原用例一行的四态表。

准确参数及事件样例以当前 `references/artifact-contract.md`、`references/proxy-protocol.md` 为准。

## 5. 实际验证命令、环境和证据

在 Runner 目录（Node **24.18.0**，依赖由原 lock 通过 `npm ci --offline` 安装）：

```sh
npm test
node --test tests/latest-backup-verification.test.mjs
node --test tests/latest-browser-session.test.mjs
node tests/fixtures/latest-mcp-smoke.mjs
node tests/fixtures/latest-official-mcp-smoke.mjs
```

仓库根目录：

```sh
node --test validation/g-r-generated-handoff.test.mjs
git diff --check
```

- 最终 `npm test`：**264/264 passed，0 failed，0 skipped**（9.459 秒）；备份专项 **10/10**，浏览器身份专项 **7/7**；正式生成器→Runner 交接 **1/1**。
- 两项真实 MCP 脚本均退出 0。宿主仅为本机公开 CLI **Chrome DevTools MCP 1.7.0 + Chrome 156.0.8078.48 + macOS**。仅使用自建非生产夹具和专用临时 profile；实际 UI 经原生 MCP 语义节点操作。未用其它浏览器框架替代。
- 广泛真实验证证据 B：`$HOME/Downloads/b2b-e2e-runner-latest-workflow-20261027-evidence/real-chrome-mcp-461e559e7b`，45 文件；manifest SHA-256 `7b4d67192bff70a7e0d0ea1944dc0cc7b867a5cda76ecaf2529cc07d1ac81c4c`。包含原始工具记录、14 张真实截图、上游计数、引擎回执；`acceptance.json` 区分通过与缺口。
- 正式入口真实验证证据 O：同父目录 `official-final-mcp-0faca6fb39`，28 文件；manifest SHA-256 `c9e1e26084588d8695b624ef38074e4d91d2bca16def0d002494688dd2f036a2`。使用 initializeRun→prepare→MCP list/bind→登录→独立授权→正式 listener→自动回执入账→页面截图→安全停止→真实只读恢复→validate/阶段 HTML。未复制代理 owner token sidecar；临时 profile 已清除。
- O 的 Run 仍是 running，交付类型 stage；前端 Mock 结果 1 passed，原真实结果 undetermined 保留。**不宣称这是完整业务任务终态验收**。最终完整报告/交付语义由组件集成测试覆盖。
- B 的 Mock 数据面使用直接 listener；正式 Run 绑定与自动入账由 O 补充。二者不可互相冒充；全部 39 项不是一份真实业务 Run 的回放。

## 6. R01–R12 验收映射

C＝实际组件/本地集成测试；B＝真实原生 MCP 广泛夹具；O＝正式入口真实 MCP。通过类别只适用于表内事实。

| 规范 | 证据与结论 | 限制 |
|---|---|---|
| R01 | 编辑前独立完整备份、实际解包与摘要核验；C 10 项负例/正例 | 归档仅在本机，不上传源码备份或浏览器证据到仓库 |
| R02 | C current-workflow、原权限/覆盖/Mock 测试；旧 Run 原字节不变 | 不兼容历史 Run；安装副本与既有插件快照未更新 |
| R03 | C session/execution-facts/result-integration；B A04–07；O 正式绑定 | 仅验证公开 CLI 宿主；不是所有托管宿主验证 |
| R04 | B/O 首次登录前共享 endpoint、授权前无 Fetch、登录后原 Target 启用 | pipe-only/拒接管实际宿主未运行，降级组件验证 |
| R05 | C mock-fallback/proxy-authorization/mock-regression；O Mock 与普通代理独立决定 | 真实撤回中断矩阵部分由 C 覆盖 |
| R06 | 原引擎测试+C 新损坏/绑定回归；B create/read/update/read；O 自动入账 | 不支持多 Target、worker/SW/子目标和流式 Mock；拒绝而不漏拦 |
| R07 | 原 exploration/assistance 测试+C 数据缺口；B 真实 UI 准备；O 精确样本缺口 | 未用历史业务账号回放 |
| R08 | C preparation/result-integration；B 原图片拒绝、替代准备后真实 ID | B 的 UI 证据与 C 的完整双检查点日志分别验证 |
| R09 | C form facts/fixture；B 实际文本、日期、文件、上传、保存回读 | 未穷举所有组件库 |
| R10 | C 报告/证据/秘密/投影；O 真实截图+阶段报告 | O 非完整终态报告；完整终态由 C 验证 |
| R11 | C 失败/撤回/在途排空/恢复；B 真断连和安全停止；O 自动生命周期 | 硬断线期间不承诺零泄漏，隔离未知则停止业务 |
| R12 | 主说明及 references 同步；195 项原基线及扩展回归；B/O | 下面逐项列明浏览器未验证部分；插件打包另有既有失败 |

## 7. A01–A39 逐项记录

| ID | 实际验证及证据 | 未验证部分/边界 |
|---|---|---|
| A01 | 真实备份/新目录解包；清单覆盖当前完整 v2，编辑前核验完成 | 无历史电脑材料 |
| A02 | C latest-backup-verification：越界、缺关键文件、摘要/权限/成员/链接问题拒绝，目标已存在拒绝 | 无 |
| A03 | C current-workflow：默认唯一流程、所有旧参数及旧 Run 在写入前拒绝，目录字节不变 | 未进行个人安装覆盖冒烟 |
| A04 | C 配置摘要/prepare 重用；B 三轮同 pid/endpoint/Target | 未验证其它宿主调用缓存策略 |
| A05 | B 公共 browserUrl 客户端断开重连两次，保留原 owner 启动器及登录；C recovery、O bind | 原 owner 退出会按原生生命周期关闭 Chrome，未承诺 owner 退出后浏览器必存活 |
| A06 | B 关闭页后旧 pageId 拒绝，新 marker 映射新 Target；C 失效/身份校验 | 不假定新页继承上下文 |
| A07 | B 同 URL 两 Target 独立；C 外来 Run/generation/endpoint 拒绝，O 精确绑定 | 两个完整并行业务 Run 未运行 |
| A08 | B/O 共享端口在登录前准备；B 安全探测确实到达上游，无 Fetch | 无 |
| A09 | B/O 已登录原浏览器/Target/存储上下文上启用；无重启/重新登录 | 仅支持且存活的已验证 CLI 组合 |
| A10 | C unsupported-host：不开 profile、不发现端口，保留真实独立事实入口 | 实际 pipe-only/受保护托管宿主未实测，不标浏览器通过 |
| A11 | 同批分项规则已更新；C/O Mock allowed + 普通代理 declined 可启用 | 对话提问一致性为文档/场景测试，不是用户对话回放 |
| A12 | C 普通规则摘要授权、合成业务 Response 拒绝、启动前守卫 | 请求头普通代理在真实 MCP 下未单独重跑 |
| A13 | C 拒绝→允许→撤回→再允许、旧决定引用、下一请求阻断及清理；B/O 安全 stop | 完整三次用户决策循环没有全部在真实 MCP 重跑 |
| A14 | B 页面真实消费 create/read/update/read，上游写/读均零；O create/read 正式回执入账 | O 未重复 update 路由，B 已验证 |
| A15 | B 未知路由/额外字段/错误类型阻断；C 多匹配、failRequest 失败也不透传 | 多匹配真实浏览器注入未运行 |
| A16 | C 同 request/cycle 去重和可靠回执；B 两次不同请求有不同回执 | 同一次 CDP 投递重送使用 C 验证 |
| A17 | C 持久化失败、状态/回执链/Run 包装损坏、账本滞后补记、禁止继续 | 未在真实 Chrome 中注入磁盘故障或杀进程时间窗 |
| A18 | C 网络模式验证未知同域/跨域 Request 真进入 guard；B 未知路由零上游 | 未覆盖合成 ID 后续路由/跨域组合的真实浏览器矩阵 |
| A19 | 原 mock-scenario/mock-runtime 测试+C attempt/cycle/context/revision/state 隔离 | 角色/环境切换模板复用为 C，未跑多账号业务环境 |
| A20 | B 另一 Target 同接口真实响应，当前 Target 刷新仍正确绑定 | 无多 Target 代理功能 |
| A21 | B/O MCP blank→排空→disable/detach→释放锁→真实只读回读；C 撤回/等待/清理失败 | 信号只表示已发出，不能作为完整清理证据 |
| A22 | B 真实 WebSocket 断连→isolation_unknown→业务守卫拒绝；C 恢复限制/锁保留 | 硬断线期间零泄漏不可保证，不作承诺 |
| A23 | B 正确上传两类有效 PNG，真实 UI/服务器严格拒绝并截图；C failed 判定 | B 和原检查点报告判定分开验证，不称历史业务失败回放 |
| A24 | B 750×600/100000 实际选择、上传、保存产生新 ID、列表详情回读；C 调整与原失败同时保留 | 同一完整真实 Run 的两检查点报告未实测 |
| A25 | C 明确 fixed/core 不可调整；补充观察不提升原失败 | 未在另一个真实产品验证 |
| A26 | C 同 case 上传 failed 与独立 ID passed 聚合 failed，原输入只一行 | 真实浏览器双检查点终态报告未执行 |
| A27 | C immutable 原结果、supplementary 及原 Mock failed 优先测试 | 无 |
| A28 | C real_backend/real_permission Mock 不可通过，页面消费晚于回执；O 前端来源 | 未用模拟权限宣称真实访问控制通过 |
| A29 | B 授权内 UI 真实准备；O 固定样本 SYNTHETIC-001 缺口及获准 Mock，真实生产不写 | 两路径分开验证，非完整账号策略矩阵 |
| A30 | B 日期未确认失焦回退；正确确认可见提交；正确合法日期被夹具故障拒绝 | 不推断所有控件都需 Enter |
| A31 | B 选择、上传、保存的可见阶段/上游计数独立；C form_interaction | 无 |
| A32 | C 同一 reducer 在追加与 resume 中区分未派发/已确认/不明/证实未提交；旧或错动作事实拒绝 | 真实 MCP 断连时没有重放写入；完整恢复账本路径由 C 验证 |
| A33 | C 原报告/Mock/结果集成四态、顺序、统计与 HTML/对话表一致；O 单前端 Mock 阶段报告 | 混合全部来源的真实终态任务未执行 |
| A34 | 原证据/报告测试+C 请求详情缺口，缺图不改产品结论；O 真截图 | 实际受保护截图拒绝宿主未再次触发 |
| A35 | 原 redaction/path/evidence 测试+C 新事件/场景/状态/回执校验 | 不把非敏感夹具 ID 当账号秘密 |
| A36 | C 文档场景/CLI/旧输入拒绝；O 公开入口到阶段 HTML；G 正式交接测试 | 不是每一份 reference 独立重做一次完整浏览器 Run |
| A37 | C 普通 Response 合成业务禁止、Request 阶段完整引擎；B 零写上游证明 | Response 后端已访问场景为组件验证，不把替换标签当隔离 |
| A38 | C 不明写入不可重试/事实作用域；夹具 disconnectAfterCommit 后读到真实记录 | 真 MCP 的业务响应超时→列表核实全过程未执行 |
| A39 | B 真 worker/SW 安全探测后模拟启动拒绝；C 子 frame/Target、无证据/错 Target/新出现 worker 拒绝 | 独立子 Target 的真实浏览器组合未完整执行；不扩为多 Target |

## 8. 明确未完成或不作承诺的部分

1. 真实浏览器验证只覆盖上述本机原生 CLI 组合。桌面托管宿主、pipe-only、宿主拒接管的真实场景尚未验证。代码不绕过这些限制。
2. 真实浏览器测试是非生产等价夹具；没有历史电脑的运行材料、账号或证据，没有声称回放历史任务。全部 39 项的完整单一浏览器终态任务未执行；组件证据和浏览器证据逐项区分。
3. 本次不安装、不发布插件，也不覆盖个人 skill。仓库内 `prd-e2e-plugin` 是独立旧快照，本次未同步：远程 main 的 Generator 已为 **4.3.3/0.8.3**，其 vendor/lock 仍为 **4.3.0/0.8.0**，原 `verify-bundle` 返回 `BUNDLE_DRIFT: generate-test-cases`；现有 vendor 在任何替换前返回 `BUNDLE_SHAPE`。修复该插件的 Generator 契约超出本次 Runner 范围，没有刷新摘要掩盖漂移。当前可用交付是维护源码 `b2b-e2e-runner/`；正式 G→R 入口已独立验证。
4. 不支持历史 Run 恢复、不迁移、不保留 v2/v3 运行分支；包/schema 数字不等于 workflow 兼容性。跨 Run 补测和独立活动计时属于明确未纳入的另一版本功能。
5. 单 Target 架构不能证明 SW/worker/子目标/其它通道完整隔离；场景发现这些通道时拒绝。硬断线后无法证实拦截存在，隔离状态明确 unknown，停止业务。

## 9. 安全恢复备份

从维护源码目录执行，选择一个尚不存在的新目录：

```sh
/usr/bin/python3 scripts/verify-source-backup.py \
  "$HOME/Downloads/b2b-e2e-runner-source-backups/b2b-e2e-runner-v2-source-backup-20261027-031734-6737a9273d.tar.gz" \
  --extract-to '<new-directory>'
```

检查工具报告的归档摘要与上文相同；阅读解出的 `b2b-e2e-runner-v2-source/manifest.json` 和 `RESTORE.md`，比较 `source/`。必要时在解出的 `source/` 执行 `npm ci`（缓存可用时 `npm ci --offline`）和 `npm test`。先比较需要恢复的能力，再由用户决定恢复位置；不要直接覆盖当前工作区、个人安装或运行工件。
