# generate-test-cases 编译器整改交付

> 以下 833 项结果对应原基线 `80e2527` 上的整改提交 `7c247eb`。合入最新远程 main 的差异、补充修复与验证见 [merge-validation.md](merge-validation.md)；Evidence repair 结论已按远程实现更正。

本次只维护当前 `schema 4.3.3 / compiler 0.8.3`，保留四工件、原语义身份算法、证据等级、必要澄清、任务修订/恢复、独立复核和正式交付。未实现样本业务系统、未启动 E2E。

最终检查：`npm run check` 833 项全部通过，0 失败、0 跳过；AT-01–33 全部通过；实际发布包的 4 份正式交付验真通过。

最终验证数据见 [verification.json](verification.json)，逐项要求见 [acceptance-record.md](acceptance-record.md)，发现与修复过程见 [self-checks.md](self-checks.md)。完整本地综合样本经真实独立上下文三轮业务审阅及正式 verifier；两份样本在独立目录重新生成、重新审阅并交付。

## 代码与构建入口

维护源位于 `generate-test-cases-engineering/src`，公开入口 `src/entry.mjs`，构建 `build/build.mjs`；外置 Schema 与技能政策位于 `skill/generate-test-cases`。构建产物同步仓库根 `generate-test-cases` 和远程 main 新增的 `prd-e2e-plugin/skills/generate-test-cases`。没有手工修改 bundle 代码，没有修改机器上全局安装的 Skill。

| 变化 | 文件与作用 |
|---|---|
| 前置编译与上下文 | `src/v4-pipeline.mjs` 拆出同源三工件 authoring 计算；`src/v4-system-context.mjs` 派生三工件系统输入；新 `src/case-context-v4.mjs` 绑定 run/revision/三个 accepted digest 并提供完整上下文 |
| 机械构造 | 新 `src/stage-artifact-adapter.mjs`，公开异步 `prepareStageArtifact(runDirectory, reply, {stage,payload})`；只读，无提交副作用，拒绝未知/保留字段，返回 prepared 或带定位诊断的 invalid |
| 阶段与恢复 | `src/advance-v4.mjs` 不再空 case 探测；上下文成功后才接受 behavior；锁内重验 case binding；后置回答通过原事务先提交上游；明确内部失败与来源变化诊断 |
| 引用一致性 | `src/ordering-registry.mjs` 共享 selector 检查；与最终编译共用 case 引用/步骤/oracle/局部 ID 校验，不提前强求最终跨 case 依赖闭包 |
| 当前协议 | `src/v4-contract.mjs` 当前常量；`advance-strict`、`entry`、bootstrap、source 系列去掉历史格式分支；移除 migration/upgrade 实现和导出、旧运行创建器与历史 renderer；当前任务与 provider 元数据保留 |
| 事务缺陷 | `revision-transaction-v4` 恢复 prior 补 schema_version；`execution-run-v4` final cancel 采用当前 contract |
| 契约与构建 | 新 case-context / stage-artifact-result Schema；case-drafts 必须带 context digest；reply 嵌入一致；`build/verify-schema-contracts.mjs` 验证 refs/dialect/副本；注册清单与摘要同步 |
| 政策和回归 | stage-construction 文档；current-suite 默认纳入当前测试，明确历史排除索引；原历史测试字节保留在 test-history；公开生成、审阅交付及负例脚本 |

原 `canonical.mjs` 未改；OUT/TP/OBS/FLOW/ACTION/DEP/CASE 身份计算没有引入运行路径、时间、随机数或新编号算法。新上下文摘要有运行绑定，但不进入正式 CASE 身份。样本业务规则只在 `test/fixtures/remediation`，不进入编译器。

## 核实后的文档差异

1. **artifact_repairs**：原基线当前 V4 Runner 没有消费它，原整改提交据此拒绝非空记录。合并时核实远程 main 已独立实现当前协议 Evidence 修订事务，因此最终版本保留其 digest 绑定、材料复用与事务恢复，并接入只读构造接口。没有移植旧协议；已接受的 Behavior/Case 不增加通用修订入口。业务回答追加、任务修订和语义重开继续保留并回归。
2. **来源/范围变化**：原当前 Runner 会校验澄清追加中的 immutable 字段，却没有文档约定的 NEW_RUN_REQUIRED，且写 case 阶段可能忽略这种上游候选。此次补齐拒绝与恢复诊断，不添加创建状态。原 run-management 规则由 Adapter 用普通 `createV4RunDirectory` 创建 fresh run，再在 `run-catalog.json` 原子记录 supersedes/superseded_by；不是新增 compiler lineage 类型。取消继续仍用原 resume_cancelled；执行语义重开仍用原事务。
3. **旧旅程测试**：不少文件名带 v4，实际冻结为 4.0/4.2，另有 V3 自动接纳/迁移断言。它们不属于当前支持矩阵。历史文件原字节保留；当前机制分别补正例/负例及真实本地旅程，不把历史失败伪装成当前通过。
4. **材料替换**：已有当前受控获取要求精确 base_source_pack_digest 与 byte receipt；旧夹具曾假定可用整包替换夹带业务回答。实际约束已经更严格。测试改为验证拒绝越权替换与合法验证追加，没有放宽生产校验。

## 实际业务生成和交付

真实独立 reviewer 先从源文得到 minimal 12 个、comprehensive 70 个目标，再读取生成内容。综合首轮发现 11 项、次轮发现 4 项问题；修正 scenarios 后第三轮通过。最小样本首轮 2 项问题也修正后复验。完整报告、completion body 和绑定实际 run/content 的 attestation 在 `test/fixtures/remediation/`。

| 运行 | 实际结果 | 权威入口 |
|---|---|---|
| 原工作目录 minimal | 17 条；真实审阅和 verifier 通过 | [current.json](acceptance/runs/RUN-f4817349-e0a9-4ccb-9187-c24b091406c8/output/current.json) |
| 原工作目录 comprehensive | 137 条；真实审阅和 verifier 通过 | [current.json](acceptance/runs/RUN-9511f58e-6cae-4877-bf74-47d1328ca0f1/output/current.json) |
| 独立工作目录 minimal | 全新 run；重新审阅和 verifier 通过 | [current.json](acceptance/portable/runs/RUN-a0cc0f92-93e4-40ca-a973-0d9a79733af5/output/current.json) |
| 独立工作目录 comprehensive | 全新 run；重新审阅和 verifier 通过 | [current.json](acceptance/portable/runs/RUN-dd8ccfed-82e0-4047-afbe-e298e3a07b82/output/current.json) |

数量是实际产物描述，不是固定阈值或“100%业务覆盖”承诺。AT-22/23 负例虽有完整的已生成点引用，真实 reviewer 仍发现业务错误和源规则遗漏；它们没有交付。AT-20 删除失败规则后保持必要澄清。对一般自然语言的理解依赖 Agent 及独立审阅，不宣称结构编译器能理解所有业务文本。

## 可重跑命令

在工程根目录执行（Node >=20；本次环境具体版本见 verification.json）：

```sh
npm ci
npm run build
npm run check
npm run test:acceptance
node test/acceptance/no-progress.mjs
node test/acceptance/verify-recorded-deliveries.mjs
```

`verify-recorded-deliveries` 使用仓库根实际发布 bundle 验证四份归档，并在隔离副本中修改 CSV 预期、伪造文件摘要，确认规范投影 verifier 仍拒绝。它读取现有真实审阅，绝不新造 review。若仅重新构建工程包，合并前须把 `skill/generate-test-cases/` 同步到根 `generate-test-cases/` 及 `prd-e2e-plugin/skills/generate-test-cases/`；构建/安装同步测试会检查三者一致。

从本地源文重新生成（请提供新的目录，不覆盖本次证据索引）：

```sh
node test/acceptance/local-generation.mjs minimal /absolute/path/to/fresh-catalog
node test/acceptance/local-generation.mjs comprehensive /absolute/path/to/fresh-catalog
node test/acceptance/portable-generation.mjs
```

这些脚本只使用文档内本地材料、已由 Agent 编写的语义 scenarios、公开四阶段构造与 Runner；重新生成阶段工件而不是复制旧成功工件。portable 脚本打印新临时目录，独立子进程只加载复制的发布包；它会把 portable-workspace.json 更新成新运行待审状态。

新运行必停在 pending review。先在独立上下文阅读原始来源、建立/核实来源清单，再逐条对照当前 review_request、accepted 前置和 staging case。由真实 reviewer 写对应当前运行/内容的 completion 和 attestation。最后用：

```sh
node test/acceptance/deliver-reviewed.mjs comprehensive /absolute/path/to/fresh-catalog actual-review-attestations.json
```

该脚本读取 `test/fixtures/remediation` 中指定 envelope；不匹配实际 run_id、内容摘要或 completion 字节就拒绝。自动单测的协议 completion 不可用来替代此步骤。

负例生成入口是 `node test/acceptance/adversarial-generation.mjs`；它会更新验收反例目录索引，新一轮 AT-22/23 必须再做独立语义审阅。当前记录的发现见 adversarial-review.md。

## 限制及未执行项目

未执行原业务 PRD 回归、真实外部服务连通性、业务系统/E2E、生产操作、跨 OS、旧协议升级迁移、public-pilot/benchmark；没有将这些记为通过。材料获取仅本地测试替身证明合同和恢复。审阅身份是本次真实独立 Codex 上下文，不是密码学或外部平台签名证明。

所有修改仍在工作区，未提交或推送。历史运行与原始交接文档保留；最终当前协议测试和 AT 清单以 verification.json 为准。
