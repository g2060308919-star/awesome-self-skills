# 三轮自检与复验记录

> 本文记录原整改基线；合入最新远程 main 后的补充自检及最终验证见 [merge-validation.md](merge-validation.md)。

这些记录检查本次实现，不是复制 03-spec 的“文档自检”。代码另由 `/root/compiler_code_review` 只读复核，业务样本另由 `/root/source_first_review` 真实审阅。最终命令退出码和计数见 [verification.json](verification.json)。

## 第一轮：修改范围与核心架构

检查：逐文件 diff 对照四工件、身份计算、当前协议和任务恢复边界；核对原 HEAD 与技术方案实际入口。

| 发现 | 修复或范围处置 | 复验结果 |
|---|---|---|
| 用空 case_drafts 探测测试点，前置计算绑定四工件 | 抽取同一个三工件 authoring 编译；case_context 为只读派生回复，不增加 Agent 工件 | AT-01/03；正式仍四工件 |
| 历史 dispatch、自动采纳、升级/迁移和旧渲染分支仍可达 | 当前常量与单协议入口；移除 migration/upgrade 导出/实现和历史 renderer；保留任务 revision、provider version、摘要、取消/语义重开 | AT-14/15/32；bundle 检查无升级迁移入口 |
| 有些无版本根 Schema 仍接受 V3 pointer/checkpoint/presentation | 封闭根到当前协议，加入缺版本旧结构拒绝测试；不可达旧定义不冒充支持入口 | versionless 红测试后通过；SCHEMA、构建完整性 |
| 清理时发现外部来源事件和执行 context 仍引用共享定义 | 保留当前 v4ExecutionContext/v4ExecutionEvent/v4Source 等所需定义；构建扫描全部引用 | types/build/schema 检查通过 |
| 原基线 V4 未消费 artifact_repairs；合并时发现远程已实现当前 Evidence 修订 | 最终保留远程事务并接入 helper，不移植旧引擎；保留业务回答和语义重开 | CTX 畸形 recipe 拒绝；FLOW/TXN 修订通过；Evidence repair 补充复验见合并记录 |
| 原测试混合冻结 V3、4.0、4.2 和最新机制，直接删除会丢失回归 | 原 HEAD 测试字节存档；共享纯算法 182 项仍运行，当前等价旅程补齐；新文件默认进入当前套件 | test-history 清单和当前全量通过；历史失败不记通过 |

身份复核：canonical.mjs 未改；OUT/TP/OBS 算法未改；ordering 仅抽取 selector 校验；正式 CASE 算法未改，context digest 不进入 CASE 身份投影。没有样本名称、权限、时间规则写入 src。没有改装全局 Skill、安装新依赖或新增审批阶段。

## 第二轮：接口、阶段交接与恢复

检查：公开 helper/Runner、读写边界、引用负例、锁内失效、实际故障注入、两阶段问答及事务中断。

| 发现 | 修复 | 复验结果 |
|---|---|---|
| helper 只有摘要自洽不能防止篡改后重哈希 | 从只读 accepted prefix 重编译完整当前 context，再比对运行、修订、依据和内容；Runner 提交锁内再算 | AT-06/07/11；跨运行、自重哈希均拒绝 |
| helper 与最终编译的引用、步骤/oracle、局部 ID 规则可能分叉 | 复用 validateCaseDraftCandidate 与共享 schema/语义验证；保留最终覆盖与复核门禁 | AT-09/10/21；精确错误码、无半成品 |
| 把完整顺序依赖闭包提前给局部候选会拒绝合法分批构造 | selector 有效性提取共享函数；缺其他 case 的完整依赖闭包仍由最终编译检查 | 部分依赖候选红→绿，最终 ordering 回归通过 |
| 后置回答计算了新 source/evidence 却未按事务接受，导致后续修订与上下文错位 | 通过原事务提交新的 source/evidence 前缀，再重新要求 views/cases；旧 digest 拒绝 | FLOW 实际 r003 回答与 stale candidate；checkpoint 字节断言 |
| 恢复旧事务构造 prior 时漏 schema_version | 携带当前 run schema_version | transaction 中断/重复恢复通过 |
| final-confirmation cancel 仍有旧 4.0 常量 | 改为当前 contract；不改取消模型 | 真实 cancel/续接及执行授权测试通过 |
| 注入内部抛错/未知返回后诊断丢失阶段及原因 | 失败明确归类，保留 code/path/message 和未提交说明；不让工具失败变成重复业务提问 | FAULT 的临时 bundle 红→绿；不前进/不发布 |
| 文档要求 NEW_RUN_REQUIRED；当前代码只在澄清追加中做 immutable 拒绝，写 case 时还会忽略 changed source | 增加当前原始来源/实质范围检查，明确新运行诊断；仍由原 Adapter 规则调用普通 bootstrap，再原子写 catalog 前后关联 | CTX AT-15 真实 source/scope/authority 变更拒绝、旧前缀不动、新 run 与 catalog 关联 |
| 末轮只读复核指出上述 guard 可能把旧 user_statement 快照当来源变化 | 限定下一修订；按 source_id 匹配原来源，排除 user_statement 后比较；旧回答/旧修订继续走原绑定验证 | 新增 remediation-source-change 固化旧快照、精确重放、损坏回答历史、随后合法追加；源码与实际 bundle 均通过，最终全量见 logs |

没有新增 Runner 状态或全局重试服务。三次修正后第四次同根因由 Adapter 停止；[no-progress-evidence.json](no-progress-evidence.json) 保存实际四次 Runner 诊断及未变 checkpoint 的字节摘要。

## 第三轮：质量反例、独立复核、构建与交付

检查：来源到设计/用例与断言回溯来源；负例；真实独立审阅；当前发布包重建和多投影验真。

| 发现 | 修复或处置 | 复验结果 |
|---|---|---|
| 综合首轮 110 条虽然结构完整，真实 reviewer 找到 11 项问题：状态数据矛盾、中间步骤未观察、权限/状态交叉遗漏、时间跨提交/重试遗漏、连续对象/证据不足等 | 只修 Agent scenarios/事实设计，不给编译器硬编码业务规则；保留首轮失败报告与未发布运行 | 第二轮 131 条重新审阅；不以点全覆盖当通过 |
| 综合第二轮另有 4 项：只读用户未实际保存、复制取消/换来源重开、相近状态筛选、AND 单条件反例仍不足 | 按实际报告继续修订全部受影响内容，生成新目标后重审 | 第三轮 137 条、70 来源目标通过；实际 completion 与摘要绑定 |
| 最小首轮漏只读实际尝试及字符反例 | 补齐来源允许的场景和可判定断言 | 第二轮 17 条、12 来源目标通过 |
| AT-22 错业务与 AT-23 漏源规则仍有 17/17、16/16 生成点引用 | 真实独立上下文发现 4 组矛盾和 M11 漏项；不签发通过、不正式发布负例 | adversarial-review.md 明确发现关口；AT-20 必要未知仍待回答 |
| 自动复核夹具不能证明业务内容正确 | 协议模拟与实际 reviewer 记录分开；临时目录 2 个新 run 另行逐字段/逐目标重审并新签 attestation | original + portable 共 4 份正式交付通过；未复用旧签出冒充新审阅 |
| 最初投影篡改测试把 manifest 重排，先触发格式校验而未到语义投影 | 保留 manifest 原规范字节仅替换 CSV digest，再改 CSV 预期 | 准确触发 CANONICAL_ARTIFACT_INVALID，证明投影一致性门禁 |
| 旧 test 假定错误码/旧版本常量，Schema tamper 替换了不存在字符串；新增脚本静态导入 bundle 触发不必要类型检查 | 对照真实当前规则修正断言、确保篡改实际发生；动态载入公开 bundle；未改低生产门禁 | 当前 full check 全部通过；开发失败记录保留摘要 |

四份结果均由同一规范结果产生 JSON、HTML、CSV、Markdown、完整会话表格和来源阅读记录，并经 `output/current.json` 验真。结果是“用例文档已生成、业务测试未执行”；未声称业务系统通过测试。

## 开发验证的失败轨迹

- 首次宽泛审计：910 项中 673 通过、237 失败，主要是冻结旧协议和旧夹具；后续当前化审计 337 项中 274 通过、63 失败。真实修复与历史测试归档分别处理，未把失败直接改为通过。
- check1：657 项中 654 通过、3 失败（AT-25 错误码假设、无效 tamper、旧 skill policy 断言）；修正测试后复验。
- check2：新增静态 bundle import 的类型检查失败，改用运行时公开加载后解决。
- check3：831 项全部通过；此后新增 AT-15 原始材料变化回归并继续做最终检查。
- check4：新增测试 rename 的局部 Node 声明缺失，已用仓库现有动态 fs 类型方式修正。
- 最终状态只取 verification.json 对应日志，不把中途失败或旧审计覆盖为最终通过。

最终复验：833 项当前测试全部通过；实际 bundle 的源变更回归 1/1 通过；4 份真实审阅正式交付全部验真；原始文档、20 份历史存档、29 个发布文件的字节检查通过。三轮无剩余未解决项。
