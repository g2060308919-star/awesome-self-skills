# 历史协议测试存档

本次仅维护 4.3.3 / 0.8.3。这里的历史测试和旧夹具是只读证据，不表示当前包支持其输入。`retired-protocols/` 保存原 HEAD 文件字节，不修改历史运行或黄金文件。它们原先覆盖自动接纳 V3、迁移/升级、多版本调度、冻结 4.2 渲染及 4.0 PRD 端到端夹具。

`excluded-current-suite.json` 列明仍在原位置保留、但属于冻结 V3 工件/运行协议的测试，以及当前等价机制入口。`test/current-suite.mjs` 默认纳入新测试，只排除此明确清单。通用身份、组合、来源策略、执行授权和 Schema 验证器检查仍运行。历史测试没有记为通过；首次宽泛诊断运行的失败及处置见整改验收记录。

## 当前覆盖替代关系

| 原历史测试群 | 保留的当前机制与实际入口 |
|---|---|
| V3/adoption/migration/version-upgrade/frozen presentation | remediation-context、remediation-schema 明确拒绝旧输入且原文件不变；当前 presentation/canonical-delivery 验真 |
| 4.0 B-end/task15/runner-production 四工件及问答旅程 | remediation-context、v4-reliability-full-flow；本地 minimal/comprehensive 四阶段 helper + 真实独立审阅 + 正式交付 |
| post-case/semantic-reopen 的旧运行夹具 | full-flow 的先澄清/部分回答/后置问题/旧上下文拒绝；semantic-reopen-transaction 的冲突、并发、四边界恢复和决定暂停；installed-action-adapter 的当前授权边界 |
| 旧 source-acquisition 流程 | v4-source-acquisition-runner 保留当前 20 项；v4-source-preparation 保留材料缺失、缓存与重启；非法替换业务回答改为验证当前严格拒绝 |
| 旧覆盖守恒测试（混合在 coverage.test.mjs） | v4-coverage-conservation、v4-risk-review-ledger、v4-critical-delivery-gate；真实 AT-23 审阅发现源规则遗漏，即使生成点全覆盖 |
| 旧 schema-validator 的通用部分 | current-schema-validator（保留原通用断言）、v4-schema-dialect、各当前契约测试、remediation-schema |
| 旧 schema-examples 索引 | 四阶段 prepareStageArtifact 的真实正例/负例、外置/嵌入/注册/摘要破坏测试；不为旧 $defs 保留兼容根 |
| 冻结旧格式黄金与 repeatability | 当前 canonical-delivery/presentation 测试；current-installed.repeat 从本地需求重新生成；四份真实签出交付归档并复验 |

业务未知、E1、Conditional、关键缺口、不适用、探索项计数、独立复核失效和规范投影门禁没有删除或降低。测试夹具的协议复核模拟仅用于传输/恢复，不能替代 `test/fixtures/remediation/` 中真实独立上下文审阅。
