# Runner 审查问题修复与验证

日期：2026-09-18（Asia/Shanghai）。基线：`e7981dc`，分支：`codex/runner-usability-recovery`。

本轮依据用户“先修复上述问题”，处理[提交前审查](2026-09-18-runner-precommit-review.md)的 R1、R2、R3。保留原有未提交改动；未提交、合并或推送，未覆盖个人安装 Skill、改动全局配置或修改历史 Run。

## 修复结果

| 问题 | 实现 | 验证 |
|---|---|---|
| R1：图片内嵌元数据秘密绕过 | 新增统一图片校验器；扫描受支持的文本/压缩文本、辅助字段与标准 ICC 子集；未知/嵌套内容拒绝；新归档标记在交付前重验 | 秘密、压缩炸弹、ICC 内外尾随/未引用载荷、hIST、更新摘要后篡改均拒绝；归档失败不落图片或事件 |
| R2：不可解码图片登记成功 | PNG 容器/CRC 与 JPEG/WebP 边界检查后，通过锁定版本 Sharp 完整解码；设文件、元数据、像素与处理时间限制 | 45 字节伪 PNG、截断/压缩数据损坏被拒绝；三格式正常输入按原字节保留 |
| R3：清除筛选后焦点丢失 | 清除筛选后移至可见用例区域，`tabindex=-1` 不新增正常 Tab 停靠点 | 执行真实报告脚本的 DOM 测试，以及真实 Chrome Enter→Tab 交互通过 |

另修正报告计划文档对测试地址标签的描述，使其与现有“主机名 + 测试地址”展示一致。没有改变用例 schema、四态聚合、权限流程或代理架构。

## 本轮涉及文件

路径均相对仓库根目录；不代表覆盖上一轮所有未提交文件。

- 新增：`b2b-e2e-runner/package.json`、`package-lock.json`、`scripts/lib/screenshot-validation.mjs`。
- 实现：`b2b-e2e-runner/scripts/lib/evidence-import.mjs`、`scripts/run-artifacts.mjs`、`scripts/lib/report-html.mjs`。
- 测试：`b2b-e2e-runner/tests/evidence-import.test.mjs`、`tests/report-reading.test.mjs`。
- 契约：`b2b-e2e-runner/references/artifact-contract.md`、`references/security-and-evidence.md`。
- 文档：`docs/superpowers/plans/2026-09-17-report-task-result.md`、本记录、原审查记录的后续链接。

上列同一条中的简写路径分别从 `b2b-e2e-runner/` 解析。

## 验证命令和结果

```sh
cd b2b-e2e-runner
npm ci --ignore-scripts
cd ..
node --test b2b-e2e-runner/tests/*.test.mjs
<ISOLATED_VENV>/bin/python <SKILL_CREATOR_ROOT>/scripts/quick_validate.py b2b-e2e-runner
git diff --check
```

- 全量 Node 回归：**149 passed / 0 failed / 0 skipped**，退出 0。
- 官方 Skill 结构校验通过；所有变更 `.mjs` 的语法检查及 `git diff --check` 通过。
- 当前 33 个候选文件扫描未发现机器专属绝对路径或私钥标记；17 个 `.mjs` 语法通过，Skill 的 5 个 Markdown 引用存在。秘密文本扫描的 8 处命中均为自动测试中的合成拒绝样本，人工核对无真实凭据；不宣称完备秘密检测。
- 锁定运行时依赖 `sharp@0.35.4`；`jsdom@26.1.0` 仅用于执行 DOM 交互测试。实际安装使用官方 npm registry、`--ignore-scripts` 和任务内缓存，无全局安装。`npm audit` 本次返回 0 个已知漏洞，不代表未来安全保证。
- 首次截图归档前，获准的 Skill 安装目录需要 `npm ci --ignore-scripts --omit=dev`；开发回归使用完整依赖。缺少解码器时明确拒绝归档，不退回文件头检查。
- 保留 RED 输出：原修复 10 项失败、交付前重验 1 项失败、标准 ICC 兼容 3 项失败、独立复核边界 4 项失败、压缩流尾随 1 项失败；均在对应最小实现后通过。没有删除失败断言。原测试用 1×1 PNG 本身不可解码，替换为真实可解码的合成输入，未把它描述成浏览器证据。

## 真实 Chrome 验证

本轮只通过 Chrome DevTools MCP 操作新建的隔离本地报告页，无账号、真实业务系统或代理。

1. 新建空白页→获取快照→导航到新生成的合成报告。此时控制台无 warning/error。
2. 激活“未通过”分类，显示 1 行，焦点位于“显示全部用例”。按 Enter 清除后：焦点为可见 `SECTION`，`tabindex=-1`；恢复第 1/2 页、20 行，总计 25 条。再按 Tab 到 `TC-001` 的“查看”按钮。
3. 页面宽度 1440，文档宽度 1440，没有横向溢出；实际截图已人工观察。此报告为布局/交互夹具，不是 25 条业务 E2E 已执行的证明。
4. MCP 指定文件路径写入仍被宿主拒绝；没有更改访问权限或伪造落盘成功。使用工具原生无路径图片返回，在本任务材料中保留原图片块，再通过实际 `readScreenshotSource` 校验 PNG/JPEG/WebP，逐字节相同。完整归档及事件登记链路另由自动化测试验证。

| 实际工具输出 | 字节数 | SHA-256 |
|---|---:|---|
| PNG | 536533 | `035ddb60308d0d1dfb5a6af2455f889b4c7292de316b0a91fadfd73f1d3df34a` |
| JPEG | 298949 | `2a1d76fdf5f377b4a16b89c8bf3e3e1c23ee2e19771011e9a0f12c6b3a75d71b` |
| WebP | 160958 | `7c163d8119a97c3631b8b85d5d48b7c2b6e6fe4bc0744baa43945c0ae545ab2d` |

JPEG/WebP 实际返回包含 ICC。初版拒绝了这些合法输入，因此先增加三格式标准颜色配置兼容测试，再实现受限 ICC 检查；不是关闭元数据检查。独立安全复核进一步发现 ICC 未引用载荷与 PNG hIST 漏检；补充真实失败测试并收紧结构及扫描，最终三格式真实图片仍通过。

独立复审已确认上述两个元数据边界关闭，未发现本次修复引入新的高置信 P1/P2 回归；复审者独立运行归档测试 27/27、全量回归 149/149。此结论限于本次审查范围，不是无漏洞保证。

## 边界与清理

- 元数据检查不是 OCR、隐写检测或工具来源认证。可见画面仍需秘密审查，工具来源仍需核对；正常 UID/IP/业务 ID 保留原值。
- 仅支持文档规定的矩阵/TRC 型 ICC 子集；不支持的 EXIF/XMP/IPTC、私有/嵌套元数据明确拒绝，不重编码或静默剥离。旧证据无新增归档标记仍走旧兼容路径，不追溯改写历史 Run。
- 本轮没有重跑真实权限协作、业务用例或代理重连，不把上一轮结果冒充本轮验证。
- 未启动 fixture、代理或独立 Chrome 服务进程，没有新增 Target 锁。已移除本轮空的临时截图目录；本轮报告预览页与已忽略的诊断材料保留供复核，未关闭用户页面或重置用户会话。

## 本地证据

本轮目录：`.tmp/runner-review-fixes-3qNWuA/`（已忽略，不加入 Git）。

- `red*.log`、`green*.log`、`full-final.log`：TDD 与最终 149 项回归输出。
- `structure-validation.log`、`npm-audit.json`、`scope-final.log`：结构、依赖、安全扫描和语法检查。
- `browser-focus-verification.json`：真实 MCP 返回的焦点与分页读数。
- `real-screenshot-final.log`、`returned-{png,jpeg,webp}.json`、`report-focus.*`：本轮真实工具返回及最终兼容校验，原图片块只保留于诊断材料，不写入 Run 账本。
- `report-demo.json` 与其指向的新合成 Run：只供交互/布局验证。

解码资源选项参照 [Sharp 输入文档](https://sharp.pixelplumbing.com/api-constructor/)；ICC 标签和区间检查依据 [ICC.1:2022](https://www.color.org/specification/ICC.1-2022-05.pdf)，但支持范围有意小于完整标准。压缩流消费检查使用 [Node.js zlib 接口](https://nodejs.org/api/zlib.html)。
