# 澄清目标与材料归属可靠性修复验收记录

本次在源码隔离工作树实现和验证，未部署、未更新全局安装技能、未修改真实用户运行目录。修复分支为 `codex/clarification-material-recovery`。实现验收完成后，用户于 2026-10-27 追加授权提交代码并合并到远程 main；该操作不包含全局安装或真实运行目录变更。

## 基线与范围

- 完整读取用户附带的 `01-问题记录.md`、`02-技术方案.md`、`03-spec.md`。三份文档作为本次需求依据；不需要原 PRD、Cooper 账号或另一台电脑的运行目录。
- 原工作目录停在 `80e2527`，不是最新 main。fetch 后从 `origin/main` 的 `02eb8d92c4f0894353f55047d78ac15465bed430` 创建隔离工作树。实际维护源码在 `generate-test-cases-engineering/src`。
- 仓库及父目录未发现适用的 `AGENTS.md`、`CLAUDE.md` 或 `.codegraph`；没有可先查询的 CodeGraph 索引。
- 公共 schema/compiler 仍为 `4.3.3 / 0.8.3`，没有新增 Agent 工件、修改公共输出形状或改变正式标识算法。新增编译器私有恢复格式为 `1.0.0`。版本字符串本身不能区分修复前后的 bundle，应同时核对本记录的 SHA-256。
- 验证环境：Node.js 24.18.0、npm 11.16.0；在隔离工程目录执行 `npm ci --ignore-scripts`。

## 修复位置与行为

| 维护源码 | 改动 |
| --- | --- |
| `src/clarification-targets-v4.mjs` | 纯校验当前有效答复写集合：目标 Fact 必须存在且为 ambiguous/conflicted；跨根 Fact/Claim 写集合独占；同根允许独立或完全相同的 Claim 分组，拒绝部分重叠；保护非目标已知 Fact。共享只读依据不计入写集合。现有诊断中列出真实 root、Fact、状态、Claim。 |
| `src/clarification-v4.mjs` | 规范化、合并后且生成可答复展示前执行同一校验；覆盖前置和后置公共编译路径。 |
| `src/advance-v4.mjs` | 历史展示重放及前后置答复入口防御；在候选材料变更前校验整批可执行目标。已接受临时答复的重放与新的答复分开处理。错误走 Evidence `need_revision`；保留原 overlay 拒绝逻辑。先恢复原修订事务，再协调材料投影。 |
| `src/source-acquisition-context-v4.mjs` | 闭合、摘要约束的私有候选归属记录、内容寻址快照及接受版本绑定。绑定原事务、接受 Source 与 checkpoint 的精确字节；不是第二套业务接受事务。 |
| `src/source-acquisition-v4.mjs` | 候选写材料前保存已验证基础上下文；同候选重试复用，异候选同版本隔离；语义拒绝后恢复基础投影且保留候选审计；原提交完成后同步材料归属；唯一完整旧证据才可重建。首次获取中断仍按原材料协议继续。 |
| `src/prd-source-collection-v4.mjs` | 来源采集、审阅摘要及回执校验使用同一选定上下文，避免中途重新读取失败候选的全局投影。完整性和来源校验保持启用。 |

私有记录位于 `transactions/source-acquisition`：候选目录、不可变材料基线、内容寻址状态快照、接受版本绑定及当前协调指针。`derived/source-acquisition.json` 只是可恢复投影；材料 acquired 不代表答复已接受。历史 `accepted`、原事务及旧 `source-acquisition-base-rNNN.json` 不被覆盖。合法材料版本可早于当前语义版本，不以强制版本相等消除错误。

技能说明维护在工程的 `skill/generate-test-cases` 下，更新了 `SKILL.md`、`references/clarification-policy.md`、`references/run-management.md`，并生成、同步仓库内三份分发副本。

## 先失败、再修复的证据

未改生产源码时，`red-confirmed.log` 记录四项失败：active 目标、共享 Fact、共享 Claim 均被错误出题；真实图片验真落盘后，答复因 `V4_DECISION_MESSAGE_PROVENANCE_INVALID` 被拒绝，随后基于接受 R 的合法 Evidence 修订失败于 `SOURCE_ACQUISITION_STATE_INVALID`。该恢复用例刻意使用真实下游语义失败，不能被目标预检查提前短路。

独立审查又发现临时关键根的新最终答复遗漏。先新增测试，`review-red.log` 证明新答复错误进入材料获取，以及诊断缺失具体身份；修复后 `review-green.log` 的 19 项通过。相同已接受临时答复仍可重放，新非法写入在材料变更前拒绝，r0/r1、checkpoint、材料投影字节不变。复审无剩余发现。

首轮全套为 1655/1657：仅两个旧升级夹具测试失败。原夹具将 final/temporary/pending 三个问题指向同一组 Fact，属于本次明确拒绝的结构。最小调整为三条独立合成来源规则：草稿重复记录数、生效失败后的输入保留、撤回配置权限，各有独立段落、locator、Claim、Fact。未放宽 final 复用、临时/待回答重问、历史字节审计或三阶段中断断言；修正后该两项单独运行通过。

其他原有可靠性夹具也将已知提交规则与真正待确认规则分开，保留已知事实及其来源，未用复制同一命题换 ID 或统一改 ambiguous 绕过检查。独立复核确认上述调整未弱化验收断言。

## Spec 验收对应

| Spec | 可执行证据 |
| --- | --- |
| T01–T03 | `core/v4-clarification-write-targets.test.mjs` 的顺序反转与冲突身份断言；`interface/v4-clarification-material-recovery.test.mjs` 的实际 runner 出题前拒绝。 |
| T04–T05 | 共享只读依据、独立目标、相同 Claim 集合分组成功；同根部分重叠失败；既有多模块完整流程继续通过。 |
| T06 | `interface/v4-clarification-target-acceptance.test.mjs` 合成表单规则：答复重开行为后，“取消关闭”“名称必填”的 Fact/Claim 及旧接受字节不变。 |
| T07 | 未修改旧 bundle 02eb8d9 捕获的真实 CLI 合成旧状态；有效与 active 目标混合答复，两种顺序均整批拒绝且材料/接受历史不变。gzip 夹具旁附来源说明。 |
| T08–T09 | 本地图片经真实材料请求、字节验真、回执和持久化后，在真实语义入口拒绝；再由接受 R 构造 D=R+1 Evidence 修订并重启，确认失败答复/额外事件不继承。 |
| T10 | pending、acquired、committed 三种同候选重试；请求可重放，事件和 Decision 不重复。 |
| T11 | 同一拟用版本不同候选继续，旧候选基线/历史不覆盖。 |
| T12 | 将完整合成运行的真实请求、事件、回执、接受历史转换为旧私有格式，仅移除新增协调格式；可证明旧接受前缀时恢复并完成修订。 |
| T13–T14 | 缺基线、缺回执、基线篡改、跨运行、重复请求历史均明确拒绝，保留现场和旧接受字节。重复历史负例不等于穷尽所有歧义形状。既有签名来源、来源替换及审阅完整性回归保留。 |
| T15 | 原有部分/临时答复回归；新增临时关键根接受重放与新最终答复的写前拒绝。临时输入不升级为最终权威。 |
| T16 | Evidence 修订改变根版本后重放旧答复，不自动重绑，之后仍可合法修订。 |
| T17 | 正式 CLI 子进程在实际原子 rename 后退出：基础记录、候选材料、语义拒绝记录、原事务物化、checkpoint、材料投影，共六处；每处重启检查归属、事件唯一、历史字节与后续推进。 |
| T18 | 没有已接受基础的首次图片获取，材料落盘后真实进程退出再恢复。未声称穷尽每条指令之间的中断。 |
| T19 | 已物化/已提交的原修订事务先完成恢复；其他候选不能让其回滚。 |
| T20 | 来源、澄清、四类工件、独立审核、canonical 输出和 G→R 交接；源码与仓库分发 bundle 均执行相关完整流程。 |

测试分三类：纯校验单元实验；通过正式 runner 的完整合成持久化夹具（包含本地图片和已有 provider 回归）；真实用户现场恢复。本次只完成前两类，没有原用户现场，因此不宣称原用户任务已恢复。

## 最终命令与结果

命令默认从 `generate-test-cases-engineering` 执行，日志保留在仓库 `.tmp/clarification-material-recovery/`。首轮失败及环境中断日志均保留，不用单项成功掩盖整条命令的非零退出。

| 命令 | 最终结果 | 日志 |
| --- | --- | --- |
| `npm run build` | 通过 | `build-final.log` |
| `npm run check` | 类型/构建校验与主回归 1660/1660 通过；后续两项重复性测试受系统休眠影响超时取消，整条命令退出 1 | `check-final.log` |
| `npm run test:benchmark` | 165/165 通过 | `benchmark-final.log` |
| `GTC_RECOVERY_RUNNER="$PWD/../generate-test-cases/scripts/test-compiler.mjs" node --test test/interface/v4-clarification-target-acceptance.test.mjs test/recovery/v4-acquisition-ownership.test.mjs` | 19/19 通过 | `bundle-recovery-final.log` |
| `GTC_RELIABILITY_RUNNER="$PWD/../generate-test-cases/scripts/test-compiler.mjs" node --test test/interface/v4-reliability-full-flow.test.mjs test/recovery/v4-version-upgrade.test.mjs` | 20/20 通过 | `bundle-flow-upgrade-final.log` |
| 仓库根目录：`node --test validation/g-r-generated-handoff.test.mjs` | 1/1 通过 | `g-r-final.log` |
| `caffeinate -is node --test test/repeatability/*.repeat.mjs` | 2/2 通过（117.9 秒）；原超时限制不变 | `repeatability-awake.log` |
| 官方 `quick_validate.py` 分别检查根技能与插件技能 | 两份均通过 | `skill-root-final.log`、`skill-plugin-final.log` |
| `git diff --check`；三份分发目录逐文件 SHA-256 对比 | 通过；每份 27 文件一致 | 最终本地核验 |

最终验证完成于 2026-10-27。

macOS 电源日志记录多次约 15 分钟的 Maintenance Sleep，重复性测试计时明显越过 120/480 秒后才被取消（并非断言失败）。普通防空闲休眠重试也被中断；最终使用仅随测试进程存活的 `caffeinate -is`，确认 PreventSystemSleep 断言有效，不更改永久电源设置。独立重跑的两项最终均通过，断言已随进程结束释放。环境证据在 `sleep-interruption.log`。

最终 runner SHA-256：`e87162ab531fa3044d14d93a2872d997e5f2c776d77e11e505cf39a17a2ba778`。

## 兼容边界与未验证事项

- 本补丁在最新 `4.3.3 / 0.8.3` 生效。新私有格式必须由本补丁 runner 读取；未知格式、摘要、归属或来源证明不通过即拒绝，不支持用旧 bundle 继续写新私有格式。
- 没有新私有元数据的已污染旧状态，仅支持能由原接受事务、不可变基线、原请求、实际事件/回执、采集与审阅证据唯一还原的形状。本地图片 acquired 案例已完整验证。缺原始绑定、捕获类请求无法重新证明、缺文件/回执、跨运行或存在歧义时继续安全拒绝；不凭原始字节重造 provenance，不自动修复任意损坏。
- 既有升级支持矩阵不扩大：`4.0.0/0.5.0`、`4.2.0/0.7.0`、`4.3.0/0.8.0`、`4.3.1/0.8.1`、`4.3.2/0.8.2` 通过独立 successor 使用最新代码重编译。只复用完整可证明的 final 答复；临时/待定或证明不足的答复重问，旧运行只读。未知版本仍拒绝。v3 仍遵循已有只读迁移机制。
- 本地恢复测试是真实进程和文件系统持久化测试，但输入为合成夹具。没有登录真实 Cooper、访问原 PRD、恢复另一台电脑目录、执行真实生产业务或验证所有 OS/断电时序。
- 本次不新增“把 active Fact 自动降级后升级临时答复”的能力；新答复目标不合法时返回明确 Evidence 修订诊断，保留已接受临时 Decision 和历史。

## 追加提交与合并验证

远程 main 的集成基线为 `02eb8d92c4f0894353f55047d78ac15465bed430`，与实现基线一致。合并前使用 `caffeinate -is npm run check` 重跑完整检查，整条命令退出 0：类型与构建一致性校验通过，主回归 1660/1660、重复性 2/2，零失败、零取消。记录在 `pre-merge-check.log`。推送前再次 fetch 确认远程 main 未前进，所有 33 个源码、测试和分发文件与本轮受测快照一致；合并采用普通快进更新，不改写远程历史。
