# PRD E2E 插件集成修复验证

日期：2026-09-18。用户已授权在修复插件集成门禁后提交工作分支并合并、推送 `main`。本记录接续 [原合并门禁](2026-09-18-runner-merge-gate.md)，不抹去先前真实失败结果。

## 变更范围

- `prd-e2e-plugin` 升至 `0.2.0`，发布契约对齐 Generator `4.3.0 / 0.8.0`、Runner `2.0`。
- 编排器保留历史 `4.2.0 / 0.7.0` 交接，拒绝跨产物版本混用。未更改 ID、用例范围、步骤或 Oracle 文本映射。
- 新增严格 Git 源码导出，两个子 Skill 均逐字节来自已提交源 `064ce773d94b06ddf69c6d1afca482e0fe4fb0cb`；不把开发目录 `node_modules` 放入插件，也未放宽树哈希规则。
- 更新锁、兼容文档与回归测试；根 Generator/Runner、Sandbox 代码及个人安装均未在本轮修改。

## 红—绿证据与回归

原始输出保存在已忽略目录 `.tmp/plugin-integration-MOD94P/`，测试产物和依赖不进入提交。

| 验证 | 结果 | 输出 |
|---|---|---|
| 适配器与源码导出失败测试 | 14 项中 4 项预期失败，随后 14/14 通过 | `red-adapter-snapshot.log`、`green-adapter-snapshot.log` |
| 契约/版本/锁升级失败测试 | 16 项中 6 项预期失败 | `red-packaging.log` |
| 插件全量回归 | 65/65 通过 | `plugin-final.log` |
| 根 Runner 回归 | 149/149 通过 | `runner-root.log` |
| 打包 Runner 隔离副本回归 | 149/149 通过 | `runner-bundled-no-scripts.log` |
| Sandbox 全量回归 | 168/168 通过 | `sandbox-full.log` |
| Generator 类型、构建、全量回归 | 类型与生成产物检查通过；主回归 1519/1519，重复稳定性 2/2 通过（含 100 次独立运行与 3 次 v4 运行） | `generator-check.log` |
| 插件结构与三个 Skill 结构 | 全部通过 | 官方 `validate_plugin.py` / `quick_validate.py` |
| 锁定摘要与两个仓库源快照 | 一致 | `bundle-verify.json` |
| 高置信秘密/开发机路径检查 | 130 个插件文件，0 项发现 | 私钥头、GitHub/API/AWS 凭据形态及开发机路径扫描；包测试另检查秘密文件名、占位符和不安全条目 |
| `git diff --check` | 通过 | 无空白错误 |

执行命令：`npm --prefix prd-e2e-plugin test`、`npm --prefix b2b-e2e-runner test`、`npm --prefix e2e-runner-sandbox test`、`npm --prefix generate-test-cases-engineering run check`。打包 Runner 复制到全新隔离目录后，按其锁文件 `npm ci --ignore-scripts` 再执行 `npm test`；初次离线缓存不全报 `ENOTCACHED`，下载到本任务独立缓存后，离线且禁用安装脚本的安装与测试均通过。

## 接口集成与审查

新增测试调用真实 Generator `compileCaseDocumentRevisionV4`、Case/Plan 产物生成函数，交给插件编译器和实际打包 Runner 校验器，逐项核对 Case/Step/Oracle ID、步骤顺序与预期文本。继续调用实际 Runner 初始化、事件落盘、完成、报告交付及 `validateRun`，然后通过插件 finalizer 校验完整边界。另验证真实生成的 4.3 `no_execution_selected` 产物和重算摘要后的混用版本拒绝。

新旧契约、摘要篡改、未知版本、源目录未提交、既有目的目录、符号链接、已跟踪依赖和未知来源枚举均有拒绝测试。原测试没有删除或降低门槛。

独立只读审查未发现 Required/Critical 问题：复跑插件 65 项、针对性 26 项，并额外复核实际 Runner 产物集成测试 1 项。审查未修改工作区或个人配置。

## 真实限制

- 上述旅程使用明确标注的离线测试 fixture，不代表本轮重新执行真实 Agent 浏览器登录或业务验收。
- 没有向活跃个人 profile 安装插件；安装冒烟仍为 `NOT EXECUTED`，不自动覆盖个人 Skill、市场或 MCP 配置。
- 摘要校验针对纯源码包；安装依赖后的运行副本不能当作新的发布源快照。来源枚举不是平台签名或独立身份认证。
- 高置信模式扫描并非全部秘密检测的完备性证明；现有秘密保护回归也继续通过。
