# Runner 执行体验与报告 A：实施与验收

日期：2026-09-17。基线：`e7981dc`；本地开发分支：`codex/runner-usability-recovery`。未提交、未推送、未同步个人安装副本、未修改历史 Run。

## 交付范围

| 用户问题 | 实现与证据 | 结论 |
|---|---|---|
| 前置说明难懂 | 以操作/权限/影响用例说明需求，提供自然语言示例；内部状态由 Runner 转换；不要求填写固定表单 | 已实现；文档回归及独立 Agent 行为复核 |
| 虚构通用账号组 | 通用用例复用确认账号；无特殊权限时使用已有 role_independent_case_ids；保留登录、依赖和前置条件门槛 | 已实现；未改权限模型 |
| 截图路径拒绝 | 新增 archive-screenshot：明确授权工具文件或真实图片返回值原字节归档、排他写入、摘要检查、复用现有捕获事件 | 已实现；真实临时输出归档、返回图片能力与自动化拒绝测试 |
| 未真正上传 | 明确选择/上传/业务保存三个事实层；新增无秘密 PNG 输入生成器 | 已实现；真实 MCP 上传和页面结果验证 |
| 未探索合法数据 | 先核对适用条件，再在授权列表/详情/关联记录寻找；保留 10 页上限，不猜 ID、不额外造业务数据 | 已实现；真实 fixture 查看过期与有效记录详情 |
| 求助不及时 | 用户独占条件及时求助，工具故障先安全恢复；具体缺口和行动，独立工作继续，无事可做才等待 | 已实现；独立 Agent 情景复核，未伪称生产 UAT |
| 每次暂停都贴报告 | 保留内部 report；新增 deliver 门槛，未完成默认不返回路径/统计/全表；显式阶段请求例外；提前结束标记 | 已实现；运行期接口测试覆盖阶段、完成、提前结束及未完成门禁 |
| 报告阅读体验 | A 阅读版：分段耗时、简短地址、结论优先单栏弹窗、角色及计划/实际账号、折叠补充记录、图片放大、分类行动入口、长 ID 约束 | 已实现；真实离线页面检查与安全回归 |
| pipe 与独立代理不兼容 | 不需要代理则跳过；需要时登录前检查同浏览器/精确 Target，安全恢复；涉及重启/登录影响先授权 | 指令与可访问 endpoint 路径已验证；不承诺把当前在用 pipe 无损热切换 |

## 测试与审查

基线：101 passed / 0 failed。新增针对性失败测试后最小实现。初始截图/交付测试 0/5，文档行为约束 0/4，普通图片脚本 0/2，报告阅读测试初始 0/3；后续审查缺陷另有复现及回归。

最终执行：

```text
node --test --test-reporter=spec b2b-e2e-runner/tests/*.test.mjs
tests 124
pass 124
fail 0
skipped 0
duration_ms 4788.705167

quick_validate.py b2b-e2e-runner
Skill is valid!

git diff --check
（无输出，退出 0）
```

官方结构校验器最初因当前 Python 缺少 PyYAML 无法运行；只在本次忽略的验证目录安装 PyYAML 6.0.2 后成功，未改全局 Python。结构、引用路径、机器专属绝对路径、秘密阻断、旧 CLI/v1 报告和副作用防重放均包含于回归；新样例 Run 的 `validate` 也通过。

独立审查发现并修复：

- 合法约 5 MiB PNG 的 Base64 重复分组正则导致栈溢出。先复现，再改为线性字符/长度/padding 校验，增加大图片回归。
- 简化账号 chip 时丢失计划/实际关系。恢复关联、未知状态与核验状态，增加不同账号、缺少观察、同账号但上下文不匹配三种测试；不再把通用 mismatch 臆断为账号不同。

独立 Agent 控制组（只读模拟）确实给通用用例增加了账号组，并在等待回复中插入报告与全表；使用更新指令的独立 Agent 不再这样做，能按真实图片返回值归档、自动准备普通测试图，并在发布记录详情寻找合法 ID。另复核了全部通用用例、含糊暂停、用户索要阶段结果、指定文件缺失及保存效果不明。此项是行为情景验证，不是实际用户/生产系统 UAT，也不是多模型可靠性保证。

## 真实浏览器验证

仅使用 Chrome DevTools MCP 1.7.0 与本地公开 fixture，无真实账号、认证信息或业务系统。

1. 当前 MCP 的工作区图片路径被拒；本地已安装源码及工具返回表明其允许临时目录。未启用 unrestricted paths，未改根目录权限。
2. 在该工具允许且本任务可写的临时目录创建 640×360 PNG（3464 bytes）。`upload_file` 后页面先显示已选择，点击上传后回显 3464 bytes / 图片 ID `8010c06090ec`，保存后页面显示同一 ID 的业务保存成功。不是仅点击上传按钮。
3. 从列表打开已发布春季活动详情，观察其已过期；再打开秋季活动详情，观察当前有效、适用测试商城及原值 `coupon-active-731`。未猜 ID、访问隐藏接口或创建额外数据。
4. 实际截图直接写工作区再次被拒；合法临时文件输出成功，无路径调用也返回真实图片。临时截图经新归档组件原字节写入新建布局样例的 evidence 并验证摘要；Base64 归档链路另由真实 PNG 自动化测试覆盖（未把工具返回图片与自动化输入混称为同一来源）。
5. 独立临时 Chrome profile + 独立 MCP `--browserUrl` + 现有代理核心：验证请求头回显、响应状态/头/body 改写、第二 Target 不受影响、刷新、完整文档导航、停止恢复原行为及释放锁。六项检查 PASS。没有修改当前会话 MCP 配置，也没有改写代理核心。
6. 离线 `file://` 打开正式生成器产出的 25 条合成布局样例：第一页 20 条、第二页 5 条，分类入口能筛到唯一无法确定项；长耗时 12 小时 24 分钟 48 秒、长中文、218 字符原 ID、完整实际 href、折叠补充记录、真实 fixture 截图放大均检查。Escape 返回详情并恢复图片按钮焦点；无 Console error/warn。
7. 1440、768、320 像素视口的页面无横向溢出；768/320 弹窗 clientWidth 分别为 730/282，scrollWidth 相同。320 下分段耗时不溢出。桌面权限表 clientWidth/scrollWidth 均为 1210。原生窗口 resize 最小返回 500，随后通过 MCP viewport emulation 确认实际 320，未把 500 冒称为 320。

本地验证产物（位于 `.gitignore` 已忽略的 `.tmp/`，不加入版本库）：

- [合成布局报告](../../.tmp/runner-usability-btSgUr/b2b-e2e-runs/20260917144639201-3e7f5245-6b50-45fb-96c7-cc99ab62d44b/report.html)
- [同一 Run 的用例快照](../../.tmp/runner-usability-btSgUr/b2b-e2e-runs/20260917144639201-3e7f5245-6b50-45fb-96c7-cc99ab62d44b/test-cases.json) 与 [日志](../../.tmp/runner-usability-btSgUr/b2b-e2e-runs/20260917144639201-3e7f5245-6b50-45fb-96c7-cc99ab62d44b/execution-log.json)
- [真实本地 fixture 截图](../../.tmp/runner-usability-btSgUr/evidence/fixture-real.png)，SHA-256 `db9d09bfb1b1fc6d191c6a5705aa53ebd636cf12d0d5d42a74671d2ce9bf83b9`
- [320px 详情截图](../../.tmp/runner-usability-btSgUr/evidence/report-dialog-320.png)，SHA-256 `b6dd0c2b86cc9a1d68c57bd327db486793a14af627731b3f82e11d779198b847`
- [独立代理原始工具响应与清理结果](../../.tmp/runner-usability-btSgUr/proxy-browser-smoke.json)

合成报告中的四态和 12 小时耗时是明确标记的布局输入，不是实际业务测试统计。其图片是上述真实本地 fixture 截图，不作为合成业务结果的证明。没有修改任何历史 Run。

## 清理和限制

- 独立代理烟测确认：ownChromeStopped=true、ownFixtureStopped=true、profileRemoved=true；锁目录在删除前为空。独立 MCP 已关闭。
- 本轮可见浏览器验证创建的两个 Target 已关闭；原用户预览页保留。额外 loopback fixture 进程已停止并退出 0；本轮创建的工具临时目录已删除，必要截图已原字节归档。最终仅给用户打开静态报告预览，不保留测试服务。
- 新增 PNG 生成器仅支持普通 PNG；指定文件、JPEG-only 或特定业务内容不能默默替代。输入素材不是截图证据。
- 图片格式检查与 SHA-256 不能认证截图来源，也不能发现所有视觉秘密；仍须核对真实工具输出、可见内容与检查点。截图仍可能失败，但不能因此改变产品结论。
- 当前宿主的 pipe 会话未热切换。正式需要代理且切换将影响会话/登录时，仍需用户授权及宿主重连；本次证明的是隔离 `--browserUrl` 路径，不是所有宿主都可无损恢复。
- 生产系统、真实验证码/审批/SSO、任意业务文件上传、所有 Chrome/宿主版本及全部可访问性场景未验证。没有申请真实权限或访问生产。
- 个人安装副本仍为旧版，本次不自动覆盖；使用新行为前需另外决定如何同步安装。

## 改动文件

实际接口与渲染：`scripts/run-artifacts.mjs`、`scripts/lib/evidence-import.mjs`、`scripts/create-test-image.mjs`、`scripts/lib/report-html.mjs`。

Skill 指令：`SKILL.md`、`agents/openai.yaml`、五篇 `references/` 工作流/代理/结果/产物/安全文档。

自动化：新增 evidence-import、report-delivery、report-reading、test-image、workflow-usability 测试；更新 skill-scenarios 旧规则断言。

可复现开发夹具：`tests/fixtures/usability-server.mjs`、`proxy-browser-smoke.mjs`、`create-reading-demo.mjs`。所有本机 executable/输出位置从 CLI 输入，不写死开发机路径。代理烟测当前对照安装版 1.7.0 的 SDK 导出，属于可选开发验证脚本，不是 Runner 执行架构。

规划和验收：本记录、对应 spec/plan 及报告任务实施记录。schema、结果聚合、权限账本、代理核心与历史兼容接口未替换。

参考：[MCP 官方配置](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)、[MCP 生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)。当前安装版行为另以实际源码、`--help` 和上述运行证据核验。
