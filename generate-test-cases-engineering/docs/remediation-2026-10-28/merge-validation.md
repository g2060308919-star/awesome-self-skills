# 合入远程 main 的补充验证

原整改提交为 `7c247eb`，原基线为 `80e2527`。远程 main 已推进到 `0f8a3c2`，两条历史各有独立开发；本次在远程 main 创建隔离工作树，仅移入编译器整改提交，没有把原分支上的其他 E2E 开发提交带入 main。

原 `verification.json`、833 项测试结果及三轮自检是原整改基线记录。本文与 `merge-verification.json` 记录整合后的版本，不能将原测试计数当成合并结果。原 AT-01–33 的逐项证据、真实业务审阅和正式交付均保留。

最终 `npm run check`：**898/898 通过，0 失败、0 取消、0 跳过**。公开发布包 repair helper 回归 3/3；两份重新生成的完整审阅投影一致；四份已有真实审阅交付验真通过；三份技能包各 29 个文件全部字节一致。初次合并回归的 45 个失败及新增红测试均已修复并复验，没有将失败或未执行项目计为通过。

## 合并差异与修复

| 发现 | 处理 | 复验依据 |
|---|---|---|
| 远程已实现当前 Evidence repair，而原分支尚无该机制 | 保留远程 digest 绑定、不可变 Source 检查、修订事务、旧交付失效和幂等重放；撤销非空 artifact_repairs 的一概拒绝 | v4-acquired-repair-regression；remediation-evidence-repair-helper |
| 新 helper 最初拒绝合法 r+1 Evidence 修订；材料加载默认会清理私有暂存 | 抽取并复用 Runner 已有候选检查，只读重算当前请求并完整比对；填充 r+1；只读派生显式传 read_only，保留待恢复材料 | 新测试先复现 STAGE_NOT_WRITABLE；合法/畸形/伪造请求、全目录字节快照及 acquired 材料回归 |
| 远程新增事实/Claim 写入目标隔离和材料候选归属 | 保留澄清前置检查、accepted base、候选隔离、事务后协调及崩溃恢复；测试使用各自独立的 ambiguous 事实，不能覆写已知 active 事实 | clarification-target、material-recovery、acquisition-ownership、事务/语义重开测试 |
| 远程已有公开拓扑 API，新分支存在重复导出方案 | 保留 discoverV4Topology(sourcePack, claims) 与 constructV4TopologyEvidence；本地验收生成器按已接受 Claim 授权调用，不把样本规则写入编译器 | topology-adapter、当前/历史协议正反例及公开本地生成 |
| 远程行为断言严格分支仅匹配 4.3.0，当前 4.3.3 错入旧过滤；pre-case 没有派生完整断言诊断 | 删除历史过滤分支，当前协议共用严格断言；前置接受和最终编译使用同一个行为证据校验 | behavior-assertion-contract：畸形、重复、冲突、错误 Claim/Fact、前后阶段一致性，先红后绿 |
| 上游新插件含第三份技能副本 | 从工程源码重建并同步根技能包与插件技能包；一致性测试覆盖全部三份 | repository-published-sync、build --check |

来源或资产变化现在先返回 NEW_RUN_REQUIRED；同候选材料事件或基线篡改仍拒绝。被拒绝的签名来源替换保持原 need_artifact 恢复请求，不能伪装为已经完成澄清。

## 业务审阅与交付

`verify-regeneration.mjs` 使用最终公开 bundle 从本地源文重新生成两份样本，并比较完整 review_target_projection 与已真实审阅版本的摘要。它不生成 completion、不声明新审阅、不交付新运行；临时运行保持 pending review 后清理。已真实审阅的原目录及 portable 目录四份交付由最终仓库发布包重新验真，并继续拒绝篡改 CSV 后伪造文件摘要的情况。

```sh
npm ci
npm run build
npm run check
node test/acceptance/verify-regeneration.mjs
node test/acceptance/verify-recorded-deliveries.mjs
node test/acceptance/no-progress.mjs
```

## 合并后三轮自检

1. **范围和架构**：逐处解决源码冲突；保留四工件、当前 4.3.3/0.8.3、语义身份、证据等级、业务澄清、任务修订/恢复、独立审阅和正式交付；保留 main 新增能力。未带入无关 E2E 修改，未实现业务系统或引入协议迁移。
2. **接口、交接、错误与恢复**：发现并修复 Evidence repair/helper 断点及只读材料清理问题；统一 pre-case/authoring/final 的断言校验。非法请求、过期绑定、材料隔离、修订重放及真实进程中断均纳入回归；没有降低生产校验来适配旧夹具。
3. **质量反例、审阅、构建与交付**：复验行为断言反例、源规则澄清及正式交付篡改；重新生成样本与真实审阅投影比较；三份产物逐文件字节比较。协议测试使用明确标注的模拟 review，仅测试传输/事务，不能替代业务审阅。

最终命令退出码、测试计数、产物摘要和日志见 `merge-verification.json`。范围外未执行项仍包括外部 MCP、原业务 PRD、业务系统/E2E、生产操作、其他操作系统及历史协议升级迁移；不计作通过。
