# Mock 融合实施与验收（2026-10-29）

## 范围与源码基线

依据交接包 `b2b-e2e-runner-mock-integration-20261028` 的 02-spec、01-technical-design、03-implementation-prompt 实施。维护工作副本：`/Users/zhangxudong/.codex/worktrees/runner-mock-integration-20261028/awesome-self-skills/b2b-e2e-runner`；分支 `codex/runner-mock-integration`，基线 `b4762b06b9b1f1eef9a094af65347f7157554017`。

主 checkout 存在无关未提交工作，故使用上述隔离副本。本机安装副本 `/Users/zhangxudong/.codex/skills/b2b-e2e-runner` 与主 checkout 的 SKILL.md 摘要分别为 `a057faa8721cac8f582523b6ae82dde5b1dce875b1438e0d5e77b8c0bd734c64`、`8af42a0849d05242bd7890b3c2f74f89895672989b122d72da42a9eb7e42f4a3`；二者均未包含当前维护基线的 `scripts/lib/workflow-contract.mjs`，不能当作本次已验证代码。个人安装的 Skill 未覆盖；生成器、业务产品、历史 Run 未修改。验收结束时本次改动尚未提交；后续根据用户明确授权提交、推送并合并。个人安装副本仍不自动覆盖。

Node 24.18.0；package 是 private ESM，Node >=22，没有独立 package version 字段。依赖清单/锁文件未变，沿用 sharp 0.35.4、jsdom 26.1.0。唯一流程仍为 `b2b-e2e-current`，Case schema 2.0、现有扩展 1.0 和 mock-scenario-v1 保留。不增加旧流程、历史迁移或兼容分支；新流程必需事件缺失会拒绝校验，不补写历史数据。

## 实现与设计取舍

- `scripts/lib/execution-progress.mjs`：新增从不可变快照与追加事件派生的统一场景进度；准备、触发、结果分别验证。权限批次、依赖、全轮完成和报告消费同一结果，不新增结果数据库。
- `execution-coverage.mjs`、`permission-batches.mjs`、`execution-facts.mjs`：必测场景与固定连续批次；原必需动作引发 A→B→A 时拒绝输入。只有明确 preparation 依赖可用有依据的模拟输入准备，不能代替源操作。真实身份和模拟权限独立，实际 unavailable 状态不改 ready。
- `mock-fallback.mjs`、`mock-runtime.mjs`：数据与权限来源分开，实际场景/执行/attempt/hash/state 绑定；保留严格匹配、状态、回执及去重。身份变化、旧 hash 准备、跨尝试拼接均拒绝。已有真实失败不被补测覆盖。
- `mock-discovery.mjs`、`cdp-fetch-proxy.mjs`：在正式候选/场景哈希之前复用单 Target Request 拦截做受控发现；先安全探针、再阻断未知业务请求，不制造成功响应或产品结果。真实Chrome发现的暂停Document探测死锁通过已核验根框架、框架生命周期与实时Target检查解决；异步处理后释放请求前再次同步检查边界。由 `route_bindings` 将被阻断的真实发现事实关联至后续已知正式路由，不回写历史事实。worker/子目标覆盖不足仍拒绝。
- `proxy-authorization.mjs`：基础规则按明确 `environment_access` 用途及摘要授权，保留请求头、响应头、响应体能力；不按 non_business 标签误拒环境响应。Mock 命中提供最终响应，必需环境响应头须明确相容，否则启用前拒绝。
- `run-artifacts.mjs`、`report-model.mjs`、`report-html.mjs`：所有完成/重放/交付入口执行共同门槛。四态不变；增加执行完整性、逐场景事实和数据/权限来源说明；HTML 和完整对话表仍共用模型、原顺序与计数。
- `SKILL.md`、`references/{workflow,artifact-contract,proxy-protocol,result-model}.md`：接入上述事实契约、两种完成模式、同批次求助、身份核验与安全发现。配置由 Runner 整理，无新增用户填写流程。
- 新增 `tests/mock-integration-{acceptance,proxy}.test.mjs`、`tests/mock-navigation.test.mjs` 和真实 MCP 完整交付夹具；原权限、覆盖、Mock、报告、恢复测试保留能力语义并改为合法的准备→动作→页面证据。仅退役跨配置返回调度的旧预期，替换为强制返回冲突被拒且快照不变；未删除失败测试制造通过。

## 自动测试

在组件目录执行：

```sh
npm ci --offline --ignore-scripts
npm test
node --test tests/mock-integration-acceptance.test.mjs
node --test tests/mock-integration-proxy.test.mjs
node --test tests/mock-navigation.test.mjs
git diff --check
```

- 修改前基线：264/264 通过，无跳过。
- 全量：334/334 通过，0 失败、0 跳过，日志 `component-suite-334.log`。
- 新公共事件验收：29/29 通过；新代理/发现验收：25/25 通过（含子测试）。它们已包含在全量中，不能重复相加。
- 审查发现并建立失败回归后修复：身份变化后运行时仍可用、旧场景 hash 准备仍可开始、跨尝试准备、负请求计数、阻断回执冒充响应消费、状态版本过期，最终环境头冲突，以及主Document暂停时的探测调用循环和释放请求竞态。
- 导航回归15/15通过：真实Chrome发现主Document暂停期间Page.getFrameTree超时；修复后保留根frameId与生命周期检查，所有continue/fulfill前再同步复核边界。覆盖匹配或回执导入期间框架变化的三条竞态。
- 最终全量与所有最终原生轮次基于同版生产代码；测试后仅增加本静态验收报告。opt-in浏览器夹具分别实际执行，不包含在 npm test 计数中。

## 原生浏览器验证层级

使用本地无凭据非生产夹具、专用临时 Chrome profile 和实际 Chrome DevTools MCP CLI/CDP。未回放任何历史业务任务；没有使用其他浏览器技术栈。测试后清理专用 profile。

1. **公共 Run 完整交付：allowed**：3 个原输入 case，5 个必测场景；2 passed、1 failed、0 undetermined。故意设置的前端应发请求未发缺陷保留失败，该 case 其余两个分支仍实际执行。独立的数据 Mock 与 unavailable 前端权限 Mock 均从真实探索进入，权限身份不伪造；正式 final HTML/完整表生成成功。
2. **公共 Run 完整交付：declined**：2 个原 case；1 failed、1 undetermined。真实可测分支执行完，原指定样本缺失有实际探索证据，不启用用例 Mock，基础代理仍保留。
3. **受控发现**：实际 Request 阶段阻断安全探针、未知 POST 和未知 GET，上游增量均为 0；另一个 Target 真实请求不受影响。安全空白退出后恢复基础配置、登录态与真实请求。该流程不产生产品最终报告，不能冒充 case 完成。
4. **公共入口写后读补充**：沿 prepare/bind/createProxyListener/record/validate/report，真实 UI 消费模拟 create/read；自动导入回执、上游模拟写与读增量为 0；清理后真实原记录回读恢复。这是阶段报告，不替代第 1/2 项最终交付。
5. **底层能力保留**：真实 MCP create/read/update/read 上游计数均为0；未知路由、额外字段、错误类型被阻断；同URL第二Target真实读；绑定Target刷新后Mock与登录保持；安全退出后真实回读恢复；实际CDP WebSocket断连后 isolation_unknown、业务guard拒绝，安全空白页重新核验；worker/Service Worker 均拒绝启Mock。原日期确认、上传边界失败、准备基线调整后真实保存/ID回读等既有能力也通过。此项使用真实 MCP 页面与既有 ProxyListener/引擎，必须与公共 Run 完整交付区分。

前三轮每轮 `sourceStable: true`，同 HEAD、同 `worktreeDigest: 852723dd3eb4b56ecb79888f64848487ec093e3c9f5abbe65c382b8cf011c0f3`。最终轮次之后仅新增本静态验收报告；生产实现和测试源码未变。

## AC-01—AC-22 证据矩阵

“组件”表示公共事件/代理回归；“浏览器”仅指实际执行的原生 MCP 夹具，不能推断为真实业务验收。

| AC | 实现/验证证据 | 浏览器覆盖与边界 |
|---|---|---|
| 01 | environment_access 三类规则，代理新回归 | allowed/declined 登录前环境门槛、上游接受请求头、页面消费响应头/体；MCP 脱敏保留 |
| 02 | 分离授权；declined/unanswered 不生成场景；非法借用用途拒绝 | declined 完整交付基础规则保留；allowed 无重复授权；unanswered 组件覆盖 |
| 03 | 真实条件优先，实际事实与准备校验 | real-list、原指定样本 404 探索和真实可测分支 |
| 04 | 仅缺数据不要求 permission unavailable；响应消费事实门槛 | allowed 的 DATA、declined 的具体缺口；独立于 PERMISSION |
| 05 | 已知接口依据、开放 assistance 和未知请求失败关闭 | 受控发现实际阻断；自然语言求助质量未由真实用户会话验证 |
| 06 | 同批独立工作/等待/局部解决恢复，既有 partial-resume 回归 | 完整浏览器包含固定批次执行；知识求助→真实用户补充→续测未端到端演练 |
| 07 | 回执或配置不能判 passed/failed；未准备和跨场景事实拒绝 | 完整流程使用准备→实际动作→页面/Network；非法状态采用组件测试 |
| 08 | passed/failed 均需实际链；身份变更、跨尝试拒绝 | 故意前端缺陷 failed，其他真实/模拟分支 passed |
| 09 | 非负请求窗口、实际完成事实；固定等待不能替代 | 同步控件完成标记+真实 Network+上游计数：应发未发失败、空值不发通过，无 Mock 命中要求 |
| 10 | 首场景失败不能完成 case；其他场景继续 | REAL 同 case 三场景实际执行，失败保留 |
| 11 | 漏场景/漏候选/unsupported/unknown 阻止 drained/final；各交付入口共用 | allowed 反向完整 final 成功；拒绝分支组件覆盖 |
| 12 | 固定批次、提前切换和重开拒绝 | DATA/REAL 当前配置后进入 PERMISSION；非法切换组件覆盖 |
| 13 | 当前批次开放协作阻止切换；强制返回计划拒绝、快照不变 | 同批知识等待/中断恢复非法调度为组件验证 |
| 14 | actual identity 与 simulated_permission 分开，资源保持 unavailable | 真实 admin 不变，真实 canApprove=false，模拟前端 true 后按钮可见；不声称后端权限通过 |
| 15 | 同 attempt/hash/最新状态；preparation 不代替 required_action；跨链拒绝 | 公共入口实际 create/read；底层实际 create/read/update/read；完整多权限合成依赖链仅组件验证 |
| 16 | 正式路由/未知请求/worker 拒绝；发现→route_bindings 关联与错误链拒绝 | 实际发现写请求上游0、独立 Target 不受影响；正式 Mock 写上游0。发现转正式路由连接为组件测试 |
| 17 | 既有动作去重、持久化回执回填、身份/权限失效和 resume 回归保留 | MCP 重连能力与正式回执导入有实际证据；完整公共 Run 的效果不明写入→断连→恢复未浏览器演练 |
| 18 | 有序安全清理、基础恢复；断连隔离未知、撤回下一请求失败关闭 | 完整流程退出后真实回读/环境代理恢复；CDP 断连见底层补验。授权撤回的公共 Run 全链仅组件验证 |
| 19 | 全场景明确结果+完整尝试才能 final；统一进度/投影 | allowed 正常最终交付2通过1失败，真实失败保留 |
| 20 | declined 探索未知/合法预排除；未回答不当拒绝 | declined 正常最终交付；预排除正常final组件回归 |
| 21 | 后端专属/强制返回/allowed预排除早期输入冲突 | 公共入口负向回归，快照字节不变；不触发业务操作 |
| 22 | validate 重放、HTML/完整表同源同序同计数，来源和截图缺口独立 | 完整 final 实际截图、表格顺序及计数核对；请求详情截图缺口不伪补，缺口显示由报告组件回归覆盖 |

## 能力保留与限制

保留：Chrome DevTools MCP、单 Target Fetch 请求前拦截、严格声明式匹配、状态读写与回执、Run/attempt/hash 绑定、去重、未知请求阻断、通道证明、Target 所有权、秘密保护、不可变快照、追加日志、四态、截图归档、统一 HTML/表格、同 Run 恢复和原清理机制。

未扩展：多 Target 统一隔离、worker/Service Worker 模拟、全局代理、任意脚本 mock、第二套结果存储、调度系统、历史迁移。无法证明通道覆盖时仍拒绝。

未验证：桌面宿主管理 Chrome 的所有权认证路径和 pipe-only 主机；真实业务系统；真实用户求助往返；完整公共 Run 的不确定写入断连恢复与撤回全链。对应核心校验有组件回归，不把它们称作上述浏览器端到端已通过。浏览器的请求详情截图能力限制保留，页面截图不冒充 Network 面板截图。

## 使用

从当前维护副本按 SKILL.md 初始化唯一当前 Run；独立收集缺失账号/基础代理/Mock 决定，建立不可变计划；真实探索→精确缺口→已知接口场景或受控发现→同批准备、实际执行与判断→安全退出/恢复→统一 final 门槛。没有新用户表单，没有另一个 v2/v3 分支。

## 最终原生运行命令

以下命令均在组件目录实际执行，成功退出；输出目录均为独立新Run，未复用或改写旧失败轮次。

```sh
node tests/fixtures/mock-integration-mcp-smoke.mjs --mode=allowed --output=/tmp/runner-mock-integration-final-allowed-20261029-5d812a
node tests/fixtures/mock-integration-mcp-smoke.mjs --mode=declined --output=/tmp/runner-mock-integration-final-declined-20261029-5d812a
node tests/fixtures/mock-integration-mcp-smoke.mjs --discovery-only --output=/tmp/runner-mock-integration-final-discovery-20261029-5d812a
node tests/fixtures/latest-mcp-smoke.mjs --output=/tmp/runner-mock-integration-final-native-20261029-5d812a
node tests/fixtures/latest-official-mcp-smoke.mjs --output=/tmp/runner-mock-integration-official-write-20261029-r5
```

前期发现的夹具事件缺失、主文档导航超时均留下独立失败证据，未改写这些历史运行，也未将其计入最终通过。Chrome是本机专用临时实例、官方MCP CLI；最终归档说明列出实际版本及证据摘要。

## 完整改动文件清单

相对仓库根目录；依赖清单和锁文件未修改。

```text
b2b-e2e-runner/SKILL.md
b2b-e2e-runner/references/artifact-contract.md
b2b-e2e-runner/references/mock-integration-verification-20261029.md
b2b-e2e-runner/references/proxy-protocol.md
b2b-e2e-runner/references/result-model.md
b2b-e2e-runner/references/workflow.md
b2b-e2e-runner/scripts/cdp-fetch-proxy.mjs
b2b-e2e-runner/scripts/lib/execution-coverage.mjs
b2b-e2e-runner/scripts/lib/execution-facts.mjs
b2b-e2e-runner/scripts/lib/execution-progress.mjs
b2b-e2e-runner/scripts/lib/mock-discovery.mjs
b2b-e2e-runner/scripts/lib/mock-fallback.mjs
b2b-e2e-runner/scripts/lib/mock-runtime.mjs
b2b-e2e-runner/scripts/lib/permission-batches.mjs
b2b-e2e-runner/scripts/lib/proxy-authorization.mjs
b2b-e2e-runner/scripts/lib/report-html.mjs
b2b-e2e-runner/scripts/lib/report-model.mjs
b2b-e2e-runner/scripts/run-artifacts.mjs
b2b-e2e-runner/tests/execution-coverage.test.mjs
b2b-e2e-runner/tests/fixtures/latest-client.js
b2b-e2e-runner/tests/fixtures/latest-official-mcp-smoke.mjs
b2b-e2e-runner/tests/fixtures/latest-page.html
b2b-e2e-runner/tests/fixtures/latest-workflow-server.mjs
b2b-e2e-runner/tests/fixtures/mock-integration-mcp-smoke.mjs
b2b-e2e-runner/tests/latest-mock-regression.test.mjs
b2b-e2e-runner/tests/latest-proxy-authorization.test.mjs
b2b-e2e-runner/tests/mock-fallback.test.mjs
b2b-e2e-runner/tests/mock-integration-acceptance.test.mjs
b2b-e2e-runner/tests/mock-integration-proxy.test.mjs
b2b-e2e-runner/tests/mock-navigation.test.mjs
b2b-e2e-runner/tests/permission-batches.test.mjs
b2b-e2e-runner/tests/permission-resume.test.mjs
b2b-e2e-runner/tests/report-html.test.mjs
b2b-e2e-runner/tests/skill-scenarios.test.mjs
b2b-e2e-runner/tests/test-helpers.mjs
b2b-e2e-runner/tests/workflow-v11-coverage-integration.test.mjs
b2b-e2e-runner/tests/workflow-v11-partial-resume.test.mjs
b2b-e2e-runner/tests/workflow-v2-assistance-exploration.test.mjs
b2b-e2e-runner/tests/workflow-v2-permission-context.test.mjs
```

## 持久化证据入口

- [证据包与逐项原生覆盖说明](/Users/zhangxudong/Downloads/b2b-e2e-runner-mock-integration-20261028-evidence/final-20261029-a00835c4a1/README.md)
- [命令、摘要、计数和最终报告路径](/Users/zhangxudong/Downloads/b2b-e2e-runner-mock-integration-20261028-evidence/final-20261029-a00835c4a1/SUMMARY.json)
- [229 文件的逐项 SHA-256 清单](/Users/zhangxudong/Downloads/b2b-e2e-runner-mock-integration-20261028-evidence/final-20261029-a00835c4a1/manifest.json)

manifest.json SHA-256：`eb3b12aba3063a9cce52e72f4403058951b05eeae6fad899d1505b5249991a49`。归档已逐文件校验，不含浏览器 profile、cookies 或账号凭据。归档内 IMPLEMENTATION-REPORT.md 为加入这些链接之前的静态报告快照，不覆盖已有证据。
