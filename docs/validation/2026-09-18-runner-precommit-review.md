# Runner 提交前审查与结构补验

日期：2026-09-18（Asia/Shanghai）。基线：`e7981dc`，分支：`codex/runner-usability-recovery`。

后续：用户授权修复后，R1/R2/R3 已在另一轮实现并验证，见[修复与验证记录](2026-09-18-runner-review-fixes.md)。下文保留审查当时的缺陷和验证事实，不作为最新修复状态。

本轮仅完成未提交改动审查、建议提交范围和结构补验。未修改 Runner 实现或个人安装副本，未修改全局 Python/MCP 配置，未提交、合并或推送。

## 结论

官方结构校验通过，原回归 127/127 通过；但审查发现两项已独立复现的证据归档缺陷，以及一项筛选焦点缺口。因此不建议直接合并。以下问题本轮仅记录，未修复。

### R1 · P1：图片内嵌文本未经过秘密检查

- 位置：`b2b-e2e-runner/scripts/lib/evidence-import.mjs:52`。
- 归档对事件元数据执行秘密检查，但图片字节只经过格式外壳/MIME 检查和哈希；图片内嵌文本没有检查。
- 独立复现：在可正常解码的 1×1 PNG 中加入 CRC 正确、含合成认证信息标记的 `tEXt` 块。`archiveScreenshot` 成功，`validateRun` 返回 `valid: true`，标记原字节保留在 evidence 文件中。
- 风险：若真实工具输出含认证信息元数据，其内容可随证据文件传播；人工检查画面无法看到这些元数据。图片元数据与日志事件元数据是不同边界。
- 建议：先补图片元数据秘密拒绝测试，在持久化前安全检查支持格式的元数据；保持原字节归档，不以静默改写图片替代拒绝。无法安全检查的内容应明确拒绝。此处已复现 PNG，不把其他格式推测写成已验证事实。

### R2 · P2：无法解码的 PNG 被登记为 captured

- 位置：`b2b-e2e-runner/scripts/lib/evidence-import.mjs:13`。
- 仅检查 PNG 签名、固定位置的 IHDR/尺寸及尾部 IEND 字样，没有验证真实结构或可解码性。
- 独立复现：45 字节样本没有合法图片数据，仍被归档并通过 Run 校验；独立 Pillow 解码拒绝该文件。对照的正常 PNG 解码成功。
- 风险：损坏文件被当作成功截图，报告可能展示破图，证据保存状态与实际可用性不一致。
- 建议：先补格式损坏/截断测试，再实现有资源上限的格式完整性检查；仍不得把“可解码”当成来源真实性或画面无秘密的证明。

### R3 · P2：清除筛选缺少焦点接续

- 位置：`b2b-e2e-runner/scripts/lib/report-html.mjs:151`。
- 启用结论筛选后，代码将焦点放到“显示全部用例”；激活此按钮会隐藏它，但不把焦点移至表格、分页或原触发器。
- 静态路径确认；现有测试只查固定脚本文本，没有执行这条键盘交互。本轮未启动浏览器，因此不宣称已完成真实浏览器焦点复现。
- 建议：补实际 DOM/浏览器交互测试，明确清除筛选后的可见焦点目标，避免长报告中的阅读位置丢失。

## 非阻塞记录

- `docs/superpowers/plans/2026-09-17-report-task-result.md:7` 写“主机名和路径”，实际友好标签仅显示主机名及“测试地址”，应修正文档而非反向修改用户认可的展示。
- `agents/openai.yaml` 的 `short_description` 为 73 字符，超过 Skill Creator 的 25–64 字符建议；与基线完全相同，不是本次引入。YAML 可解析，默认提示词正确引用 `$b2b-e2e-runner`。官方 `quick_validate.py` 不检查这个 UI 字段长度。

## 本轮验证

```sh
node --test b2b-e2e-runner/tests/*.test.mjs
<ISOLATED_VENV>/bin/python <SKILL_CREATOR_ROOT>/scripts/quick_validate.py b2b-e2e-runner
git diff --check
```

- 全量 Node 测试：127 passed / 0 failed / 0 skipped，退出 0。
- Skill Creator 原生校验：`Skill is valid!`，退出 0。
- 临时 venv 使用 Python 3.9.6、PyYAML 6.0.3；仅安装在已忽略的本任务目录，没有增加仓库依赖或全局包。此结果补齐 `2026-09-18-runner-recovery.md` 记录的缺依赖限制，保留原记录作为当时事实。
- 所有本次变更的 `.mjs` 语法检查通过；`git diff --check` 通过。
- 9 处 Skill 相对文档引用均存在。
- 原 28 个待审文件未检出机器专属绝对路径或私钥标记；现有秘密文本扫描命中两处明确的合成测试输入，人工核对后未发现真实凭据。这不是图片视觉秘密检查或完备秘密检测保证。
- 两项隔离归档复现证实当前代码错误接受输入；复现脚本退出 0 表示缺陷成功复现，不表示缺陷已修复或拒绝测试通过。

本轮审查覆盖工作流/规则、归档与交付接口、HTML 渲染、CDP 断连、测试与可选浏览器夹具。浏览器专项结果沿用上一轮已保留记录；本轮没有重跑浏览器、真实权限协作或 Network 截图。

## 建议提交范围

原始审查范围为 28 个文件（11 个已跟踪修改、17 个新增），均属于本次 Runner 改进；待上述缺陷修复及回归完成后，再考虑提交。加上本记录为 29 个候选文件。

| 范围 | 文件 |
|---|---|
| 指令和契约（7） | `b2b-e2e-runner/SKILL.md`、`agents/openai.yaml`、`references/{workflow,proxy-protocol,result-model,artifact-contract,security-and-evidence}.md` |
| 实现（5） | `scripts/run-artifacts.mjs`、`scripts/create-test-image.mjs`、`scripts/lib/{evidence-import,report-html,cdp-client}.mjs` |
| 自动测试（7） | `tests/{skill-scenarios,cdp-client,evidence-import,report-delivery,report-reading,test-image,workflow-usability}.test.mjs` |
| 可复现夹具（4） | `tests/fixtures/{browser-evidence-smoke,create-reading-demo,proxy-browser-smoke,usability-server}.mjs` |
| 原范围文档（5） | `docs/superpowers/specs/2026-09-17-runner-usability.md`、两份对应实施计划/记录、`docs/validation/2026-09-17-runner-usability.md`、`docs/validation/2026-09-18-runner-recovery.md` |
| 本轮审查（1） | 本文件 |

上表 Skill 内相对文件名均从 `b2b-e2e-runner/` 解析。精确 28 文件清单和内容 SHA-256 见本地 `scope-audit.json`。不纳入 `.tmp/`、Run 产物、截图、transcript、Python venv、个人安装副本、全局配置或其他 Skill。

## 本地证据

本轮目录：`.tmp/runner-review-ude9Ms/`（已忽略，不加入 Git）。

- `unit-tests.log`：127 项全量回归完整输出。
- `structure-validation.log`、`validator-dependencies.txt`：官方结构校验和隔离依赖版本。
- `scope-audit.json`：原 28 文件清单、摘要、语法及扫描候选。
- `review-repro.mjs`、`review-repro-results.json`：R1/R2 独立复现与结果。
- `image-decode-check.log`：正常 PNG 与损坏样本的独立解码对照。

复现 Run 明确标注为合成审查输入，不是真实浏览器证据或业务测试结论。本轮未创建 Chrome、MCP、代理或 fixture 服务进程；临时校验环境和诊断材料保留以便复核。
