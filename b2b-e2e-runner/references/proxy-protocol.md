# 单 Target CDP Fetch 代理

## 适用边界

仅在测试用例确认的非生产目标、Chrome DevTools MCP 正在操作的同一 Chrome CDP endpoint 上使用。endpoint 不可访问即报告阻塞；禁止用页面内 fetch/XHR monkeypatch、浏览器全局代理或其他浏览器工具降级。

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

## 真实验证与恢复

内部计数不是证据。Runner 在执行依赖代理的检查点前，自动从服务器回显/Network 原始事件证明请求头实际发出，从页面观察证明状态、响应头/body 生效，并证明同 Target 不匹配请求、至少一个其他页面、刷新/导航和停止后原响应。无法安全触发另一页面真实请求时，只能记录 Target 级隔离事实和可执行模拟证据，不得虚构结果。验证结果写入报告并在最终对话展示，不列入执行前用户确认。代理中断时暂停受影响检查点，重新附着并复核；恢复成功后重跑该检查点。不能恢复则判 `undetermined` 并写代理事实，不能直接判产品 `failed`。
