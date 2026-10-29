# 逐项验收记录

验收基线：仓库 `80e25279b7e3a01058857df5f7c505055fe7fefb`；当前协议 `4.3.3 / 0.8.3`。来源为本目录原样保存的三份交接文档。下列编号只指本次 03-spec；既有测试名称中的 AT 编号属于历史需求，不与本表混用。

原整改提交 `7c247eb` 的 AT：通过 33，失败 0，未执行 0。该基线全量测试：833/833；范围外未执行项另列，不计作通过。合入最新 main 的补充修复、测试和审阅投影核验见 [merge-validation.md](merge-validation.md)。

结论以 [最终检查记录](verification.json)、[正式交付验真](delivery-verification.json) 和 [三轮自检](self-checks.md) 为准。所有测试替身均在测试层；没有修改生产验证逻辑来接受替身。

## 验收入口与证据简称

所有测试路径均相对工程根目录。`npm run check` 包含类型检查、构建新鲜度和当前全量测试；`npm run test:acceptance` 是整改接口子集。当前全量包含公开 bundle、CLI、纯编译层和事务层，不把纯函数测试称为独立业务审阅。

- **CTX**：[remediation-context.test.mjs](../../test/interface/remediation-context.test.mjs)，当前四工件夹具，通过公开 `advanceStrict`、`prepareStageArtifact`；重启检查另启动 CLI。
- **FAULT**：[remediation-faults.test.mjs](../../test/interface/remediation-faults.test.mjs)，仅测试构建注入内部抛错与未知返回，真实运行器推进；生产包不含注入。
- **SCHEMA**：[remediation-schema.test.mjs](../../test/interface/remediation-schema.test.mjs)、schema-integrity、v4-schema-dialect、各 v4 契约测试；修改独立副本的 Schema、清单和摘要。
- **FLOW**：[v4-reliability-full-flow.test.mjs](../../test/interface/v4-reliability-full-flow.test.mjs)，当前正常流程、前后两阶段问题、部分回答及迟到回答、实际 CLI；其中复核 completion 是明确标记的协议夹具。
- **TXN**：`test/recovery/v4-{revision-transaction,candidate-transaction,idempotent-append,semantic-reopen-transaction,critical-delivery-recovery}.test.mjs`，真实事务、锁、故障边界与恢复。
- **MATERIAL**：`test/interface/v4-{source-acquisition-runner,source-preparation,prd-source-collection}.test.mjs`，本地 provider 替身及实际采集凭据；来源字节、版本、签名 URL 与缓存约束。
- **QUALITY**：`test/core/v4-{critical-delivery-gate,risk-review-ledger,case-quality-protection,coverage-conservation,business-outcome-obligations,evidence-source-boundary}.test.mjs`，当前语义与证据反例。
- **LOCAL**：[local-generation.mjs](../../test/acceptance/local-generation.mjs) 用文档内嵌的 [minimal.md](../../test/fixtures/remediation/minimal.md) 和 [comprehensive.md](../../test/fixtures/remediation/comprehensive.md)，把 Agent 实际编写并经修订的 scenarios 经四阶段 helper 和 Runner 重新生成。用例规则仅在夹具中，不在编译器中。
- **REVIEW**：[来源优先独立清单](../../test/fixtures/remediation/independent-checklist.md)、[综合第三轮](../../test/fixtures/remediation/comprehensive-review-round3.md)、[最小第二轮](../../test/fixtures/remediation/minimal-review-round2.md)、[临时目录重审](../../test/fixtures/remediation/portable-independent-review.md)。独立上下文 `/root/source_first_review` 先读来源建立目标，再读生成投影；不是生成者自评。
- **NEGATIVE**：[adversarial-generation.mjs](../../test/acceptance/adversarial-generation.mjs)、[实际独立反例报告](../../test/fixtures/remediation/adversarial-review.md)、[反例运行索引](acceptance/adversarial/runs.json)。
- **DELIVERY**：[deliver-reviewed.mjs](../../test/acceptance/deliver-reviewed.mjs)、[verify-recorded-deliveries.mjs](../../test/acceptance/verify-recorded-deliveries.mjs)、canonical-delivery/presentation 测试；公开正式 verifier 对 manifest、规范内容及投影校验。

## AT-01 至 AT-33

“通过”表示该行断言已被指定测试或实际审阅观察到；预期拒绝的负例通过，不表示负例工件可交付。

| 项目 | 输入与实际入口 | 断言与实际结果 | 状态 / 证据 |
|---|---|---|---|
| AT-01 | CTX 三个前置工件；LOCAL 未提交用例阶段 | 无空用例探测即可得到 facts、唯一 fact_modules、modules、OUT/TP/OBS/顺序及依据摘要；无 accepted case | 通过：CTX、样本 reply-behavior_views.json |
| AT-02 | 同前缀重复调用、独立 CLI 重启、pending/完成复核 | 上下文规范内容与摘要稳定；不额外提交；复核更新不影响上下文。独立 fresh run 只改变运行绑定 | 通过：CTX、independent-review-runner、current-installed.repeat |
| AT-03 | 同一输入前置与最终编译 | formal_test_points、outcomes、observations、ordering 相同；正式 CASE 算法复用原实现 | 通过：CTX、QUALITY、旧业务投影基线对照 |
| AT-04 | 错误 Claim 绑定、清空设计责任 disposition | 返回 behavior_views 的具体错误；checkpoint 字节不变，没有 accepted behavior 或有效 context | 通过：CTX AT-04 |
| AT-05 | 前置上下文函数抛错 / 返回未识别状态；非法 ordering | 不推进、不发布；保留阶段、错误码、字段和未提交说明 | 通过：FAULT、CTX 内部失败；测试专用临时 bundle |
| AT-06 | 接受后置回答形成 r003；重填候选修订号但保留旧 digest | CASE_CONTEXT_STALE；当前前缀不变，返回当前 context | 通过：FLOW 后置问题旅程、CTX |
| AT-07 | 篡改 context 并重算自摘要；跨 run digest | helper 对照只读重算结果拒绝；Runner 也拒绝绑定失配 | 通过：CTX |
| AT-08 | 四阶段真实 payload、pending review、fatal 等非写入回复 | 四阶段 prepared；pending 合法但不发布；非写动作 invalid；helper 不写 staging/accepted | 通过：LOCAL、CTX、stage-artifact-result 契约 |
| AT-09 | 相同语义两次编译；批内局部 case/step ID 重复 | 正式 CASE ID 稳定；重复局部 ID 拒绝；局部编号不成为正式身份 | 通过：CTX、current-installed.repeat |
| AT-10 | 空 oracle、缺/坏 digest、旧修订号、坏引用、未知/保留字段 | 各自返回结构/引用/修订错误；不是一律 STALE；invalid 无半成品 | 通过：CTX、各 case-draft 契约 |
| AT-11 | 已构造候选后完成合法上游回答，再提交旧候选 | 锁内重算依据；旧候选不能覆盖新前缀 | 通过：FLOW 的 r003/旧 digest，CTX；TXN 锁入口 |
| AT-12 | 单独改坏外置或嵌入定义、悬空 ref、清单或字节摘要 | 构建/加载完整性检查失败；正式包新鲜度检查通过 | 通过：SCHEMA、build --check |
| AT-13 | 最小与综合正常本地材料 | 四工件、必要问题、真实复核、正式交付完成；无版本选择或技术审批 | 通过：LOCAL、REVIEW、DELIVERY |
| AT-14 | 旧 identity、升级请求、无版本旧 pointer/checkpoint/presentation | 明确拒绝，不转换、不升级；原 identity 字节不改；迁移入口不存在 | 通过：CTX、SCHEMA、run-instance/transaction 边界 |
| AT-15 | 真实问答追加/材料恢复；改变原来源字节、新来源或 run_scope；取消继续 | 回答按修订提交；材料走受控动作；物质变化 NEW_RUN_REQUIRED 且旧前缀不变，Adapter 普通创建新运行后原子写 catalog 关联；取消新 sibling 不追加父日志 | 通过：CTX AT-15、remediation-source-change（旧快照、重放、回答历史、后续合法追加）、FLOW、MATERIAL、v4-cancellation、installed-action-adapter；层次差异见实现记录 |
| AT-16 | candidate 落盘后中断；reserved/materialized/committed 等事务边界故障 | 恢复到合法原子状态，回答与 receipt 无重复、不丢失；补齐 replay schema_version | 通过：TXN；真实 CLI 重启 |
| AT-17 | 并发相同/冲突 append、旧候选、非 ready 高修订 | 锁与摘要冲突生效；一次事务/receipt；旧 current 不覆盖新状态 | 通过：TXN、critical-delivery-recovery、CTX |
| AT-18 | 真缺失、合法缓存重试、未获取/失效材料 | 缺失返回材料恢复；缓存复用不重索；失效数据仍被拒绝 | 通过：MATERIAL 当前 20 项获取旅程及 preparation |
| AT-19 | 部分回答、旧 presentation/root、同一有效回答重放 | 精确接受已答部分，未答保留；旧绑定不覆盖，重复无额外决定 | 通过：FLOW、partial-answer、decision-recompile、TXN |
| AT-20 | 删除 minimal 保存失败处理句 | Agent 识别必要未知并走实际 semantic gap，need_user_answers；独立审阅确认不能由成功/取消推导失败恢复 | 通过：NEGATIVE；不是预设 mock 拒绝 |
| AT-21 | 断开 Claim/Fact/TP/OBS/FLOW/ACTION、oracle→step | helper/最终编译对应引用门禁拒绝并给路径；不靠标题猜补 | 通过：CTX、QUALITY、behavior-reference、oracle-step 测试 |
| AT-22 | 改错只读权限、草稿状态、10 字母边界、失败恢复 | 结构仍可进入 review，17/17 生成点有 case；独立审阅逐项发现 4 组矛盾，未签出 completion | 通过：NEGATIVE AT22-F01–F04；未正式交付负例 |
| AT-23 | 从 facts/views/cases 删去取消重开责任，保留来源 | 16/16 生成点引用齐全仍被来源优先 M11 目标发现遗漏；无伪造 through 结论 | 通过：NEGATIVE AT23-F01；未正式交付负例 |
| AT-24 | E1 临时规则、关键问题 defer/unknown；合法非关键 Conditional 对照 | 关键缺口仍阻断，E1 不升格；合法 Conditional 保留原语义及交付处置 | 通过：QUALITY、critical-delivery-journey/recovery、FLOW |
| AT-25 | 无依据不适用、探索项混正式、删除唯一 case | 风险/证据/覆盖门禁拒绝；不能通过删 point 提高覆盖；原 obligation 仍存在 | 通过：risk-review-ledger、business-outcome-obligations、coverage-conservation |
| AT-26 | 同一记录完整生命周期与局部单点 | 两者均保留；综合实际审阅核实原对象身份、时间与关键动作连续；没有按终点去重 | 通过：case-quality-protection、REVIEW C49/C50 等及生命周期复验 |
| AT-27 | pending/缺 review；复核后改前提/步骤/预期 | 正式门禁不通过；内容摘要改变要求重审 | 通过：independent-review-runner/core、CTX；真实审阅另列 AT-33 |
| AT-28 | 篡改正式文件；改变 CSV 预期且同步伪造 CSV digest | verifier 拒绝；即使 manifest 字节形式合法，投影与规范 JSON 不同仍 CANONICAL_ARTIFACT_INVALID | 通过：DELIVERY 4 份验真 + tampered_projection_rejected |
| AT-29 | 从源码构建、加载实际发布 bundle；四份已审阅归档 | Schema/helper 正常加载；公开接口生成；最终 repository 发布包重新验真 4 份正式交付 | 通过：build、installed tests、LOCAL、delivery-verification.json |
| AT-30 | 仅复制 bundle、本地源文/scenarios/driver 至 OS 独立临时目录 | 清理环境变量后新进程生成；无工程源码导入/原私有目录/账号；新的 2 个 run 实际重审并正式交付 | 通过：portable-generation、portable-workspace.json、REVIEW 临时目录报告 |
| AT-31 | 同 run 同阶段 4 次相同空 oracle 错误 | Adapter 第四次输出 PIPELINE_NO_PROGRESS；Runner 仍 need_revision；checkpoint 不变、未重开规避 | 通过：no-progress.mjs、no-progress-evidence.json；计数不进 Runner |
| AT-32 | 当前执行计划、不可变 case_document_ref、显式动作 | 仅编译/读取边界与授权合同回归，未启动执行；不可变 digest 保留 | 通过：execution-plan-compiler、case-document-boundary、execution-action-contract、execution-worksheet、FLOW |
| AT-33 | 本地综合全文 + Agent scenarios，经真实四阶段生成 | 70 个来源目标真实审阅，首轮 11 项、次轮 4 项问题全部修正后第三轮通过；新临时 run 再重审；正式 verifier 通过 | 通过：REVIEW、真实 completion/attestation、DELIVERY；137 条只是实际结果，不是验收阈值 |

## REQ 映射

| 条款 | 实现/保留机制 | 验收 |
|---|---|---|
| REQ-01 | 仍四工件、原两阶段澄清、复核和发布；未启动 E2E | 08、13、32、33 |
| REQ-02 | 公开 case_context，fact_modules 与所有引用闭合 | 01、02、03 |
| REQ-03 | 复用 outcome/ordering/canonical CASE；绑定不入语义身份 | 02、03、09 |
| REQ-04 | 先验证前置再接受；穷尽失败状态；保留终段质量检查 | 04、05、24、25、27 |
| REQ-05 | helper 重算 + Runner 锁内复核上下文摘要 | 06、07、10、11、17 |
| REQ-06 | 只读 prepareStageArtifact；机械字段由程序填写 | 08、09、10 |
| REQ-07 | 共享契约、封闭 Schema、构建注册/摘要验证 | 08、10、12、29 |
| REQ-08 | 单协议入口；旧适配/升级/迁移移除；任务机制保留 | 13、14、15、32 |
| REQ-09 | 原事务/锁/幂等；当前修订提交；Adapter 重试上限 | 02、11、15、16、17、18、19、31 |
| REQ-10 | 失败分类/路径/未提交状态；必要未知保留 | 05、10、18、20、31 |
| REQ-11 | 当前目标授权、来源字节/定位/收集证据 | 15、18、19、20、24、33 |
| REQ-12 | 证据等级、关键门禁、步骤关联与真实语义审阅 | 20、21、22、24、26、33 |
| REQ-13 | 双向追溯、来源优先遗漏发现、覆盖守恒 | 21、23、25、26 |
| REQ-14 | pending 不交付；内容变更失效；独立 reviewer 实际审阅 | 22、23、27、33 |
| REQ-15 | 当前 manifest、同规范多投影、正式 verifier | 17、28、29、32、33 |
| REQ-16 | 内嵌 local 夹具、新目录重跑、外部接口本地替身 | 20、22、23、29、30、33 |

## 失败、未执行与范围说明

最终当前协议验收的通过/失败/未执行计数记录在 verification.json。开发中的红测试和修订过程不是最终失败遗漏，见 self-checks.md 与 logs/。旧协议首次宽泛诊断失败已逐项归类，未声称旧输入兼容通过；存档与当前替代关系见 [test-history](../../test-history/README.md)。

以下明确未执行：原业务 PRD 回归、真实外部 MCP/provider 服务连通性、浏览器/业务 E2E、生产操作、跨操作系统运行、历史协议升级迁移矩阵、30-PRD public-pilot/benchmark。它们不属于本次 03-spec 完成条件；本地替身只证明接口与故障处理，不证明外部服务可用。

新生成运行会停在 pending review；必须让独立上下文阅读当前材料并签发其运行和内容对应的真实记录后，才能执行正式交付。不自动复用历史 completion 来替代新审阅。
