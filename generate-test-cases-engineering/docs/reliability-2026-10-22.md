# 可靠性修复与验证记录（2026-10-22 至 2026-10-23）

本次修改针对 Case Document 的同文不同事实展示、集合摘要上下文和直接相关的恢复、诊断及版本升级。新版本为 **Schema 4.3.3 / compiler 0.8.3**；四个 Agent 工件、业务澄清、最终语义门禁、独立审核、追加式修订及交付结构保留。

## 输入与基线

- 工作仓库：`/Users/zhangxudong/codes/awesome-self-skills`，工程目录 `generate-test-cases-engineering`。
- 开始时工作树干净，HEAD `4beb55f278af1648fbb0afd7c6f71dcefca87d72`，源码最近提交 `7c57863`，原版本 4.3.2/0.8.2。
- 初次修复工作分支：`codex/generate-test-cases-reliability`。本节记录首次本地验证；后续远程 main 集成见文末。已安装的个人 Skill 未修改。
- 环境：macOS，Node v24.18.0，npm 11.16.0。
- 已完整读取用户列出的 `01-background.md`、`02-technical-design.md`、`03-spec.md`。
- `PROMPT.txt` 未提供具体路径；工作区、Desktop、Downloads、Documents 及 Spotlight 检索未找到。已知 Notes 附件可以按完整路径读取，但其父目录枚举返回 `Operation not permitted`。已向用户询问路径，未用其他旧交接包替代。

## 修复位置及约束

| 位置 | 改变及保留的约束 |
| --- | --- |
| `src/semantic-gaps-v4.mjs` | 在候选合并后，从完整 Fact/Claim 关联计算展示。同文标签使用一致且有来源的主体/动作/条件区分；上下文不足时只去重展示，不删除 Fact、Claim、root 或覆盖关联。 |
| `src/canonical.mjs`、`src/advance-v4.mjs`、`src/v4-pipeline.mjs` | 先形成工件根上下文下的规范化快照，再派生摘要、台账和序列化内容。新版额外规范化 Fact 的 claim/module 集合及 Scope 的模块/边界集合；历史序列化规则不变。步骤、事件和任意业务值数组仍保持顺序。 |
| `src/revision-artifact-validation-v4.mjs` | 现有事务预检验证实际序列化内容，检查新版快照及组件摘要；失败保留字段路径，在事务预留之前拒绝。旧版本按原编码验证，不能重签旧摘要放行。 |
| `src/revision-transaction-v4.mjs`、`src/advance-v4.mjs` | 最新公开入口在重放前恢复已经完整落盘的中断候选，重新检查精确字节、身份、base 和现有事务门禁，再完成同一事务；不重建另一套提交系统，不覆盖损坏历史。 |
| `src/schema-validator.mjs`、`src/diagnostic-error-v4.mjs` | 保留 oneOf 的可定位叶级错误；跨入口保留有界诊断，对 URL、凭证字段和完整 Authorization 凭证脱敏，不把内部输出错误当成业务问题。 |
| `src/v4-pipeline.mjs` | 修复完整 CLI 测试发现的后置澄清/审核顺序冲突：先发出并完成 Case Draft 的内容绑定审核，再提交含后置问题的检查点。最终审核和 critical 门禁均未放宽。 |
| `src/version-upgrade-v4.mjs`、`src/run-bootstrap-v4.mjs`、`src/entry.mjs` | 正式入口对旧 v4 身份要求受控升级；新后继由编译器发号、记录真实 `version_upgrade` 原因并按日志幂等恢复。旧目录字节、历史答案和原 manifest 保留。 |
| `src/source-acquisition-v4.mjs` | 复用现有获取状态验证增加只读模式，升级审查不会清理旧目录里的临时材料。 |
| `../b2b-e2e-runner/scripts/lib/g-case-document-handoff.mjs` | 正式 G→R 回归实际出现“版本组合不受支持”；最小兼容改动仅加入精确 4.3.3/0.8.3 配对，所有 G 官方只读校验、manifest、bundle 与执行计划绑定门禁保留。 |
| `skill/generate-test-cases/` | Schema、版本、manifest、bundle 与来源/运行策略同步；仓库两处分发副本随最终构建同步。 |

没有增加第五种 Agent 工件，没有用删除事实、编造业务答案或宽松校验消除报错，也没有增加自动执行行为。

## 测试证据

原始回归日志保存在工作区 `.tmp/reliability-20261022/`。A、B 在修改生产代码前独立失败：A 为 `CHECKPOINT_SCHEMA_INVALID`，B 为 `RUN_INTEGRITY_ERROR / REVISION_ARTIFACT_RELATION_INVALID`。失败前的来源、完整阅读、拓扑和引用门禁均已通过。其后加入的嵌套集合、凭证脱敏、公开升级入口、历史关系与审计缺陷也先由测试暴露再修复。

| Spec | 覆盖与断言 |
| --- | --- |
| T01–T05 | 同文不同动作保留全部 ID；合法两模块四事实/四缺口经正式 CLI；候选合并、上下文相同与冲突负例；悬空引用/重复 ID 正确拒绝且不提交。 |
| T06–T09 | 单元性质测试种子 1–64（LCG 1664525/1013904223）；正式 CLI 种子 3、10、100、20261022，包含 f3/f10/f100 与合法嵌套集合换序。检查规范化幂等、无输入突变、保存读回、前后置摘要一致、业务值及有序序列变化可见。 |
| T10、T23 | 叶级路径、子摘要错误、提交预检无状态副作用；超长诊断、签名 URL、重复 ID 和 Authorization Bearer 凭证脱敏；正式回复符合 Schema。 |
| T11–T14 | 正式 CLI 来源→证据→部分/最终回答→设计→审核→后置问题→交付；六种产物的 manifest 摘要、用例数量/顺序、步骤及 Oracle 对照；未知/暂缓/临时答案不能交付；重放、重复和过期动作不改已接受状态。 |
| T15–T16 | 复用现有真实 revision transaction 阶段注入、同修订 profile 升级恢复、base/锁竞争及损坏历史测试，不新增模拟事务系统。 |
| T17–T20 | staging 失败候选、已提交待答、最终/临时/待答混合、旧完成交付、全部已声明旧 pair；升级四个真实阶段中断；字节/跨工件/外层重新散列后的绑定损坏负例；父目录逐文件摘要不变。 |
| T21 | 普通 Grounded 订单用例的业务投影来自未修改基线 HEAD 的临时 git 归档编译结果，保存在 `test/fixtures/v4/reliability-normal-business-baseline.json`。比较用例、预期、状态、优先级和覆盖；版本、运行身份及协议摘要可变。 |
| T22 | 用构建后 `scripts/test-compiler.mjs` 重跑 T01/T06/T11/T17 代表链路；同一测试脚本通过环境变量切换源码/分发入口。 |
| T24 | 正式 CLI 下游 Execution Plan 绑定验证及既有执行闭环回归；新的全流程测试只选择 do_not_execute，不执行业务操作。 |

最终全量门禁与专项结果如下。`npm run check` 返回 0；主回归 1600/1600、重复性测试 2/2 通过，均无失败、取消或跳过。主回归用时 987.8 秒，重复性阶段用时 117.1 秒。最终日志为 `.tmp/reliability-20261022/check-verified.log`。

| 实际命令 | 结果 |
| --- | --- |
| `npm run check` | exit 0；包含 TypeScript、构建字节检查、1600 项 core/golden/interface/recovery 测试及 2 项重复性测试。重复性覆盖原有 100 次独立安装流程及最新 v4 的 3 次独立运行。 |
| `node --test test/core/v4-reliability*.test.mjs test/interface/v4-reliability.test.mjs test/interface/v4-reliability-full-flow.test.mjs test/interface/v4-reliability-public-upgrade.test.mjs` | 29/29 通过。 |
| `node --test test/recovery/v4-materialized-recovery.test.mjs test/recovery/v4-version-upgrade.test.mjs` | 28/28 通过；包含公开恢复后接受下一条答案。 |
| 安装版 action-adapter 与 T09/T15 journey 两个完整测试文件 | 分别 10/10、6/6 通过；临时答案继续阻断，精确来源绑定、敏感信息清理及过期动作恢复断言保留。 |
| 最新安装版三次独立运行的重复性测试 | 1/1 通过；三个运行分别完成来源采集、独立审核和交付，各 7 个用例，Bundle/Markdown/工作表保持逐字节一致，无需排除身份字段。 |
| `GTC_RELIABILITY_RUNNER="$PWD/skill/generate-test-cases/scripts/test-compiler.mjs" node --test test/interface/v4-reliability.test.mjs test/interface/v4-reliability-full-flow.test.mjs test/recovery/v4-version-upgrade.test.mjs` | 最终构建 25/25 通过，日志 `bundle-verified.log`。 |
| `npm run test:benchmark` | 165/165 通过。 |
| `npm run public-pilot` | exit 0，30/30 `pilot_admitted`，`pilot_ready`；`release_eligible:false`、`release_status:insufficient_evidence`。 |
| 根目录 `node --test validation/g-r-generated-handoff.test.mjs b2b-e2e-runner/tests/g-case-projection.test.mjs` | 2/2 通过，实际生成 G 交付并进入 R init-g；无实际浏览器/业务执行。 |
| Skill 官方 `quick_validate.py` | `Skill is valid!`；系统及 bundled Python 缺少 yaml，使用 `.tmp` 下独立 venv 安装 PyYAML 后运行，没有增加项目依赖。 |
| 两次 `diff -qr` 对照工程 Skill、根分发 Skill、插件内 Skill | exit 0，全部文件字节一致。 |
| 最后一次 `npx tsc --noEmit -p jsconfig.json`、`node build/build.mjs --check`、`git diff --check` | 均 exit 0；包括最终迁移的重复性测试文件。 |

初次修复树的三处 `scripts/test-compiler.mjs` SHA-256 均为 `b3fb2dfc6d49b5d63de447df02351a17c86f1fac6d8d8b0da96e10003d1ee440`。远程 main 含额外修复，集成后的构建与验证另记于文末。

早期全量测试曾与 Schema/build 修改并行，出现 `SCHEMA_INTEGRITY_MISMATCH`；随后全量运行（1583 项、10 项失败）暴露了旧诊断文案/版本断言、仍在旧版本生成的测试 fixture 和分发副本未同步。独立预查还发现三次运行的重复性夹具停留在旧版本，被公开入口的 `VERSION_UPGRADE_REQUIRED` 拦截；已迁移为最新合法流程，保留逐字节比较。这些中间运行不作为最终通过证据。失败项均保留原语义校验，按最新版契约更新测试或同步构建，未删除测试。

独立审查发现的问题已通过新增回归修复。审查者独立验证了最新同修订 pre→post→final 的三个中断阶段，均由正式入口恢复到 finished 并清除 pending；最终未发现剩余实质性阻塞问题。

## 升级支持矩阵

下表适用于 **Case Document**。生成统一使用 4.3.3/0.8.3；表中的旧版本仅用于只读解码和验证。

| 旧 Schema/compiler | 旧数据审查 | 继续策略 |
| --- | --- | --- |
| 4.0.0 / 0.5.0 | 原始字节、版本关系及已提交历史 | 新后继重算；按最新请求补充缺失的分析/审核材料。 |
| 4.2.0 / 0.7.0 | 同上 | 同上。 |
| 4.3.0 / 0.8.0 | 同上，保留旧来源 registry 验证语义 | 同上。 |
| 4.3.1 / 0.8.1 | 同上 | 同上。 |
| 4.3.2 / 0.8.2 | 同上；验证完成交付及来源采集绑定 | staging、待澄清、已完成任务均建立独立新版后继。 |
| 未知或混配版本、损坏历史 | 明确拒绝 | 不改版本字段，不回退旧生成器。 |

正式适配入口：`createV4RunDirectory(catalogRoot, { parent_run_id, creation_reason: 'version_upgrade' })`。同一 parent/目标版本重复请求返回同一后继，日志阶段为 `reserved → identity_created → materials_staged → complete`。

已验证的 collection 可重新绑定。没有完整可验证 collection 的旧获取状态保留审计材料，再走普通来源获取入口。旧答案只有在最终确认权威、完整 Fact/Claim、来源、作用域及 root 版本适用性均被证明后，才由编译器生成新绑定；当前自动复用限初始 pre-case。临时、未知、暂缓、变化或无法证明的答案，以及 post-case 问题，保留历史并重新澄清。复用审计须绑定已完成事务中的精确检查点。

旧 Execution Plan 继续使用只读交付验证；本次未增加其版本转换。取消的旧任务、尚有未完成 revision transaction 的旧任务会被安全拒绝，不能借升级修补或改写父历史。

## 未验证与范围边界

- 尚未获得 `PROMPT.txt`，因此不能声明交接包四份材料全部核验。
- 未取得实际业务任务的完整原始运行目录和用户答案；没有把合成测试的答案写入真实任务，不能据此宣称其 234 条事实、24 个待答项已完成交付。
- T21 是一条冻结正常业务基线，不能外推为所有 PRD 业务质量相同。
- public-pilot 的 30 份来源准入不等于发布质量证据；工具返回的 `release_eligible: false / insufficient_evidence` 仍需保留。
- 本机验证采用 Node 24；构建目标 Node 20，未另起 Node 20 环境实跑。
- 初次验证阶段未发布或推送。后续用户已明确要求提交并合并远程 main，集成记录见下；仍未替换个人已安装 Skill，亦未运行真实下游 E2E。

## 远程 main 集成

- 本次修复已独立提交为 `80e2527`。抓取远程后发现原工作分支与 `origin/main` 双向分叉，分别有 91、14 个独有提交；原分支包含其他 E2E 工作，不能将整条历史直接带入 main。
- 在隔离工作区从远程 `7943cbe` 创建 `codex/merge-gtc-reliability-main`，仅移植上述修复提交。保留 main 已有的拓扑适配器、来源采集不可变 base、采集后语义修正和 Evidence repair 流程。
- 冲突逐处合并，远程原有 4.3.2 的采集 base 和 Evidence repair 校验同步适用于 4.3.3；原始来源绑定、只读升级验证及本次规范化门禁同时保留。生成包由合并后的源码重建，再同步三处 Skill。
- 测试夹具改用 main 的 `discoverV4Topology(sourcePack, claims)` 契约，旧公开流程迁移为最新版本。额外验证合法 Evidence repair 的 Fact/Claim/module 集合换序，确认规范化字节、身份、组件摘要和重放均保持一致；该回归直接通过，没有据此扩大生产代码改动。
- 独立复核实际创建了 4.3.2 已获取来源及其不可变 base，再执行只读验证和幂等升级；父目录逐文件摘要不变，临时材料保留。删除 base 后仍按 main 原有规则拒绝。复核未发现剩余阻塞问题。
- 集成专项：可靠性/完整 CLI/升级/拓扑 37/37，采集修复 4/4，核心性质 7/7；基准 165/165；最终构建代表链路 25/25；G→R 2/2。Skill 官方结构校验、类型检查和三份分发目录比对通过。
- 集成版三处 `test-compiler.mjs` 的 SHA-256 均为 `bec2ab5f3fb86bd3b283fef53f684a378984248ab2768e7c04ca6f66ba6bc4a4`。日志保存在原工作区 `.tmp/reliability-main-20261023/`。
- 最终集成 `npm run check` 返回 0：主回归 **1621/1621**、重复性 **2/2**，无失败、取消或跳过。主回归用时 1004.7 秒，重复性阶段 124.2 秒。完整日志为 `check-final.log`；第一次集成预查因旧拓扑导入失败已停止，修正夹具后重新执行了完整门禁。
- 发布目标为用户授权的远程 `main`；推送前再次抓取确认仍基于 `7943cbe`，只允许普通快进更新，不改写远程历史。
