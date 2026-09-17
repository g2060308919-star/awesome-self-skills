# 单 Target CDP Fetch 代理

## 适用边界

仅在测试用例确认的非生产目标、Chrome DevTools MCP 正在操作的同一 Chrome CDP endpoint 上使用。用户明确不需要代理时跳过所有代理 endpoint 检查，不因 MCP 使用 pipe 阻塞普通测试。需要代理时尽量在登录前发现连接不兼容；先做安全、可判断的自动诊断/恢复，再对真正需要用户处理的影响请求协助。禁止用页面内 fetch/XHR monkeypatch、浏览器全局代理或其他浏览器工具降级。

### 连接准备与失败恢复

1. 从当前 MCP 的已知启动配置、工具返回或本 Run 专用 Chrome 的启动输出取得连接方式；只检查有关配置，不扫描全机、私有会话或试探端口。`remote-debugging-pipe` 是进程管道，不是可供独立代理连接的 HTTP/WebSocket endpoint；不能把另一 Chrome 的可用端口当作同一个浏览器。
2. 可访问 endpoint 必须具有当前 MCP 已登记的精确页面 Target；相同 URL 不足以证明身份。现有代理 start 使用 loopback HTTP `/json/version` 与 `/json/list` 获取浏览器 WebSocket。MCP 可用其当前版本支持的 `--browserUrl` 连接同一 endpoint；`--wsEndpoint` 是 MCP 可选连接方式，不代表本代理 CLI 已支持直接传 WebSocket URL。使用前核对本地版本能力，不能凭空承诺。
3. 若只有 pipe，不能无损把在用浏览器改成端口模式。尚未登录、完全属于本 Run 且当前宿主支持安全重连时，可由 Runner 自动准备隔离测试 Chrome（独立临时 profile、只绑定 loopback、动态端口）并让 MCP 连接它；必须重新核验工具真实调用和 Target。若会重启宿主/浏览器、需重新登录或影响其他页面，先用中文说明影响请求授权；不得自行改全局配置、关闭用户浏览器或接管其他 Run。
4. 不得要求用户查端口、提供 endpoint 或 targetId。用户只能被要求完成不可代办的动作（例如允许重启并重新登录）；Runner 负责配置定位、参数和重连复核。宿主不能在当前会话重载 MCP 时明确说明这是真实限制，不声称已修复，也不继续依赖代理的业务写操作。
5. endpoint/Target 连接检查不是代理效果验证。代理真正启动后仍须下述完整运行期验证；原代理前提不能静默删除。恢复失败记录工具阻塞、继续独立工作并及时协作；只有符合原合法收尾条件才把影响检查点记为无法确定。已有可能提交的写操作不得因“重跑受影响检查点”而重复派发。

一个代理实例只精确绑定一个 `targetId`，通过浏览器 WebSocket 建立该 Target 的扁平 Session，只处理该 Session 的 `Fetch.requestPaused`。Fetch 不得在 BrowserContext 或整个 Chrome 上启用。先用 CDP pattern 缩小范围，再按 protocol、完整 hostname、URL pathname prefix 和标准化 method 精确匹配；重定向重新匹配。不匹配流量立即原样继续。即使其他页面请求完全相同的接口，也不得受影响。

## 配置

规则是有稳定顺序的 JSON 数组；无法确定的重复匹配在启动前拒绝：

```json
{
  "schema_version": "1.0",
  "environment": "staging",
  "run_id": "RUN_ID",
  "target_id": "CDP_TARGET_ID",
  "lock_root": "RUN_PRIVATE_TEMP_LOCK_ROOT",
  "rules": [{
    "match": {
      "protocol": "https:",
      "hostname": "non-production.example.test",
      "path_prefix": "/api/orders",
      "methods": ["GET"]
    },
    "request": { "headers": { "set": { "x-fixture-mode": "empty" }, "remove": ["x-old"] } },
    "response": {
      "status": 201,
      "headers": { "set": { "x-fixture": "yes" }, "remove": ["x-old-response"] },
      "body": { "mode": "json_patch", "operations": [{ "op": "set", "path": "/state", "value": "ready" }] }
    }
  }]
}
```

Body mode 还可使用 `{ "mode": "replace_text", "value": "..." }`、`{ "mode": "replace_base64", "value": "..." }` 或 `{ "mode": "none" }`。Header 名大小写不敏感，set 替换全部旧值且不重复，remove 删除全部同名值。JSON Pointer 只支持 set/delete。禁止任意 JS 回调、浏览器全局代理、SSE、WebSocket frame、流式和大型二进制。只在改 body 时获取原 body；正确处理 `base64Encoded`，改写后移除旧 content-length 与失效的 content-encoding，最终 body 用 Base64 fulfill。默认上限 5 MiB，超限或规则错误原样继续并记诊断。

配置不得包含认证 secret，不写死业务域名、环境 header 或绝对路径。明文 HTTP 默认只允许 loopback；只有用例明确确认内网非生产 HTTP 时才可显式放行。

## 生命周期

```text
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs start --endpoint <CDP_ENDPOINT> --config <RULES_JSON> --state <PRIVATE_STATE_JSON>
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs status --state <PRIVATE_STATE_JSON>
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs stop --state <PRIVATE_STATE_JSON>
```

start 校验 endpoint→target 映射与 Runner 当前登记的测试页面一致、排他获取 `hash(endpoint identity + targetId)` 锁、attach、Network.enable、Fetch.enable，并前台保持连接。state 包含 PID、Target、Session 是否已附着、owner token、计数和最近错误，但不保存 Session ID。stop 对照锁验证 PID、Run ID、owner token 后只向该 owner 发停止信号。锁带时间与心跳；仅心跳过期且 PID 不存在时回收。不同 Target 可用独立实例和独立锁并发；一个实例不能覆盖多个页面。

同一 Target 内刷新或导航时保持绑定并重新做真实验证。测试转移到新标签页产生新 `targetId` 时，旧代理不得影响新页面；先停止旧绑定，再为新 Target 创建独立实例、锁和验证。

正常结束、失败、中断、SIGINT/SIGTERM、Target 关闭或 CDP 断连都自动尽力 Fetch.disable、detach、停止本 Run 代理进程并释放本 Run 锁，无需用户确认；随后用真实请求验证原行为恢复。只操作与 state 中 Run ID、owner token、endpoint 和 targetId 全部匹配的资源，不得停止其他 Target 的代理，也不得释放其他 Run 的锁。

进入 `awaiting_user` 前同样执行上述清理并记录真实恢复结果；保留测试页面和登录态。用户通知后恢复原 Run 时，根据原确认规则为当前已登记 Target 新建代理周期并重新验证，不能沿用上一周期的“已清理”状态，也不能触碰其他页面或 Run。

CDP transport 断连后，客户端须先标记连接终止，再通知代理清理；后续命令立即拒绝，不能在死连接上等待超时而拖住 Target 锁。断连无法获得 `Fetch.disable`/detach 的成功回执时不得伪造；以旧连接终止、锁释放以及真实页面请求恢复原响应共同验证恢复。只有重新确认同一 endpoint 中的精确业务 Target，才可重新 attach 并启用 Fetch；重新验证改写、其他 Target 隔离和最终停止恢复。该过程只恢复代理，不自动重试业务写操作。

## 真实验证与恢复

内部计数不是证据。Runner 在执行依赖代理的检查点前，自动从服务器回显/Network 原始事件证明请求头实际发出，从页面观察证明状态、响应头/body 生效，并证明同 Target 不匹配请求、至少一个其他页面、刷新/导航和停止后原响应。无法安全触发另一页面真实请求时，只能记录 Target 级隔离事实和可执行模拟证据，不得虚构结果。验证结果写入报告并在最终对话展示，不列入执行前用户确认。代理中断时暂停受影响检查点，重新附着并复核；恢复成功后重跑该检查点。不能恢复则判 `undetermined` 并写代理事实，不能直接判产品 `failed`。
