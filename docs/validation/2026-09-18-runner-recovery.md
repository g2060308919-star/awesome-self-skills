# Runner 截图、离线报告与恢复验证

日期：2026-09-18（Asia/Shanghai）。范围：本机非生产、无真实凭据夹具；Node 24.18.0、Chrome 152、Chrome DevTools MCP 1.7.0。保留既有未提交改动；未修改个人安装 Skill、全局 MCP 配置或历史 Run，未提交或推送。

## 改动与根因

- `scripts/lib/cdp-client.mjs`：transport close/error 原先只通知监听器和拒绝当时的 pending 命令，没有先标记连接终止。清理回调仍可能向死连接发送 Fetch/detach 命令、等待超时。新增终态先行、一次性断连通知；后续命令立即拒绝，不增加自动重放或自动重连。
- `tests/cdp-client.test.mjs`：先观察到两个失败断言（断连后仍发送两次 Fetch.disable），最小修复后全部通过；另测主动 close 幂等。
- `tests/fixtures/proxy-browser-smoke.mjs`：在真实 WebSocket 层关闭代理连接，不调用正常 stop 冒充异常；检查自动锁释放、原响应恢复、同 Target 重连和另一页隔离。
- `tests/fixtures/browser-evidence-smoke.mjs`：通过真实 DevTools Target 采集 Network Headers/Response，核验 PNG；验证空白页初始化后的离线报告加载。初次回归曾在 Network 面板尚未呈现请求行时失败；改为 MCP `wait_for` 等待真实请求文本后取新快照，没有重发请求或放宽断言。
- `references/security-and-evidence.md`、`workflow.md`、`proxy-protocol.md`：写入已验证路径、版本与授权限制、可见秘密检查、离线报告打开顺序及断连事实边界。

## Network 截图

使用专属 Chrome profile、loopback 动态 CDP 端口和 `--auto-open-devtools-for-tabs`；专属 MCP 启用 `--experimentalDevtools --experimentalIncludeAllPages`，仍由 MCP 进行所有页面点击、快照和截图。根据创建前后清单唯一确认对应 DevTools，再定位真实请求；通过 DevTools 菜单独立窗口以获得可读详情。

已实际验证：`GET /probe` 的 URL、200 状态、响应头和响应体，以及权限演练 `POST /api/approve` 的 URL、POST、200、业务记录和一次提交结果。Headers/Response 截图已目视核验，不是页面重绘或文字转图。演练的两张 Network 截图经原字节归档进入 Run，并在离线报告详情及放大层正常显示。

限制：此能力依赖当前 MCP 的实验性 DevTools 访问选项，不等于默认宿主已经启用；未热切换现有宿主连接。真实认证系统仍需逐次排除可见秘密，不能把无凭据夹具的整屏截图策略照搬过去。

## file:// 首开告警

原症状在没有脚本、样式或图片的最小 HTML 上也已复现：同文件 URL 的 unique security origins 告警。因此没有修改报告渲染器、CSP 或浏览器安全参数，也没有清空 Console 隐藏问题。

已验证的打开顺序：MCP `new_page(about:blank)` → `take_snapshot` 确认已附着 → `navigate_page(file://报告)`。自动回归中最小页面及连续三次实际报告打开均无 warn/error；当前宿主连接也独立验证成功；新权限演练报告首开、详情、三张 B 证据加载及图片放大均无 Console 告警或横向溢出。

这是针对已复现浏览器/MCP 首次附着现象的安全规避路径，不声称修复了 Chromium 上游根因。直接新建 file 页面告警存在时序差异：最初冷启动对照出现，后续自动回归中的直接打开对照未出现；原始事实均保留。不同浏览器版本、原生双击或其他宿主仍需重新验证。

## 真实用户权限协作

新 Run：`20260917162633643-40ff2e48-bbfe-4e78-807b-51c2e85de67a`。

1. 用户确认模拟 A 已就绪、B 由用户准备、C 本轮无法提供；账号为本地合成身份 `demo-operator`，没有真实密码或 SSO。
2. MCP 观察账号、非生产环境、精确业务 Target、权限 A、提交次数 0；先执行 A，页面显示 `ITEM-731 · 秋季横幅 · 待审核`。
3. C 仅受影响检查点记为无法确定，不申请权限、不判产品失败。B 创建开放协作，保存为 `awaiting_user`；内部报告校验成功，`deliver` 返回 false 且不含报告路径、统计或全表。
4. 打开本地协作页，用户实际点击准备 B 并回复“已准备好了”。Runner 没有代点击、自动申请、轮询或创建定时任务。
5. 执行 `resume-check`，同一 Run 的快照哈希保持不变；没有可能已提交动作。MCP 重新核验同一账号、同一 Target、A 和 B 同时存在；未推定新增 B 会撤销 A。
6. 仅派发一次 B 审核。真实页面、POST 200、响应和截图均显示 `ITEM-731` 审核通过、提交次数 1；A 没有重放。C 保持无法确定。
7. 最终 2 通过、0 未通过、1 无法确定、0 未执行；39 个事件，4 张真实截图，最终报告及账本校验通过。

这证明本次 Agent/用户交互及同 Run 恢复，不代表真实账号密码登录、多账号切换、SSO 或生产权限流程已验证。本权限 Run 未使用代理；代理断线与重连另在独立双 Target 夹具中验证，未混入本 Run 的产品事实。

## 验证命令

```sh
node --test --test-reporter=spec b2b-e2e-runner/tests/*.test.mjs
node b2b-e2e-runner/tests/fixtures/proxy-browser-smoke.mjs \
  --chrome <CHROME_EXECUTABLE> --mcp-entry <MCP_BIN_JS> --output <AUTHORIZED_OUTPUT>
node b2b-e2e-runner/tests/fixtures/browser-evidence-smoke.mjs \
  --chrome <CHROME_EXECUTABLE> --mcp-entry <MCP_BIN_JS> \
  --output <NEW_AUTHORIZED_OUTPUT> --report <VALID_REPORT_HTML>
node b2b-e2e-runner/scripts/run-artifacts.mjs validate --run <RUN_ROOT>
git diff --check
```

结果：全量 127/127；代理真实浏览器 10/10；真实 Network 截图与离线打开验证 PASS；`git diff --check` 通过；9 个相对文档引用存在；本次 7 个实现/测试/规则文件的秘密指标和机器专属绝对路径检查均为 0。

额外结构校验限制：已尝试系统 Python 和 bundled Python 执行 Skill Creator 的 `quick_validate.py`，二者均因缺少 PyYAML 无法运行，不能称该检查通过。未为此安装全局依赖。本次没有改动 Skill frontmatter；现有全部 Skill 场景回归和相对引用检查已通过。

## 本地证据与清理

相对仓库根目录：

- `.tmp/runner-recovery-1c5stK/`：原始诊断 transcript、最小 HTML 对照、Network 图片、`browser-evidence-smoke.json`、`proxy-browser-smoke.json`、`unit-tests.log`。
- `.tmp/runner-permission-recovery-MIuaMB/`：模拟输入、真实交互 transcript、fixture 状态及 `b2b-e2e-runs/<Run ID>/` 产物。

独立诊断 Chrome、MCP、fixture 已停止；测试 profile 已删除；代理断线后与最终停止后锁均为空；原页面响应恢复已实测。交互驱动完成清理后曾因 stdin 保留进程，已按核实的本次 PID 单独终止，不影响用户浏览器。报告和证据保留；最终报告预览页保留供阅读。临时结果未加入 Git，后续清理 `.tmp` 前需另行保留需要的验收证据。
