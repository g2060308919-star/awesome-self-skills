# 单 Target CDP Fetch 代理

## 适用边界

仅在已确认的非生产目标、Chrome DevTools MCP 正在操作的同一自有 Chrome 上使用，Run 必须属于唯一 `b2b-e2e-current` 流程。首次未登录启动时就探测并优先准备共享连接；不需要代理时跳过代理规则、Fetch 启用和流量修改，不跳过宿主支持的连接能力探测。禁止页面内 fetch/XHR monkeypatch、浏览器全局代理、任意脚本 Mock 服务或其他浏览器工具降级。

### 连接准备与恢复

1. 从当前 MCP 已知启动配置、公开工具返回或本 Run 专用 Chrome 启动输出取得连接事实。`remote-debugging-pipe` 是进程管道，不是共享 HTTP/WebSocket endpoint。不得试探其他浏览器端口，不将另一 Chrome 的端口冒充当前浏览器。
2. 未登录的专用实例优先由宿主管理工具隔离启动，使用独立 profile、loopback 动态端口；只有宿主明确支持且可核验所有权时才外部启动再接入。MCP 的 `--browserUrl` 取决于本机能力，不能绕过拒绝接管或认证保护。原代理 start 使用 HTTP `/json/version` 与 `/json/list` 获取浏览器 WebSocket；MCP 的 `--wsEndpoint` 不代表代理 CLI 支持直接 WebSocket 参数。
3. 准备共享 endpoint 不启用 Fetch、不替换响应、不表示已获 Mock 授权；初始拒绝 Mock 仍可保留空闲连接。宿主支持、原实例和上下文仍存活时，中途明确允许 Mock 复用同一窗口、实际 Target 和登录态，不重新登录。只有 pipe 或宿主限制无法共享时，说明 Mock 受限并继续独立真实工作；不能承诺所有宿主零重启。
4. 登记 Run 所有权、实例代次、实际 Target、MCP pageId 映射和存储上下文。相同实质连接配置复用浏览器，调用标识变化不新建；配置确有变化才失效。断连先检查原实例与 Target，再重建页面映射和新鲜语义节点。相同 URL、旧 pageId 或 endpoint 可达都不足以证明身份；新 Target 必须重新核验与绑定。
5. 不得要求用户查端口、提供 endpoint 或 targetId。若仅有的恢复路径需要重启宿主/浏览器、丢失登录态或影响用户页面，说明具体影响后请求必要授权；不得改全局配置或接管其他 Run。endpoint/Target 检查不是代理效果验证，后续仍需真实请求、页面和清理验证。

### 两种独立授权

同一批问题分别确认账号覆盖、Mock 决定、普通代理规则。`mock_policy` 和 `proxy_policy` 首次使用 `initial`，以后 `changed` / `revoked` 均引用同类最新 `previous_decision_ref`，来自用户明确决定。`proxy_policy.rules_sha256` 绑定实际规范化规则，规则变化须重新明确授权；`mock_policy` 只授权完整声明式模拟场景。

允许 Mock 且无其他普通代理规则时，不需要另行授权 Mock 使用的 Fetch。仅允许普通代理不允许合成业务数据：基础配置和 proxy_policy 必须明确 `purpose: environment_access` 并绑定原始规则摘要；用户确认的环境访问响应可含业务形状字段，不再用 non_business 标签决定授权。为具体用例生成测试状态必须走获准的完整 Mock 场景；不接受用普通 Response 阶段替换绕过授权或声称写入隔离。未回答、拒绝和撤回都不能继续对应修改，撤回需要安全清理后才能恢复真实业务。

一个代理实例只精确绑定一个 `targetId`，通过浏览器 WebSocket 建立该 Target 的扁平 Session，只处理该 Session 的 `Fetch.requestPaused`。Fetch 不得在 BrowserContext 或整个 Chrome 上启用。先用 CDP pattern 缩小范围，再按 protocol、完整 hostname、URL pathname prefix 和标准化 method 精确匹配；重定向重新匹配。普通代理的不匹配流量原样继续；Mock 的保护范围内未知业务流量必须阻断，不能使用这条普通代理规则透传。即使其他页面请求完全相同的接口，也不得受影响。

## 配置

规则是有稳定顺序的 JSON 数组；无法确定的重复匹配在启动前拒绝。下面是无业务状态的诊断响应示例，须用实际已确认事实替换占位，记录同规则摘要的 `proxy_policy` 后才能启动：

```json
{
  "schema_version": "1.0",
  "environment": "staging",
  "run_id": "RUN_ID",
  "run_root": "<ABSOLUTE_CURRENT_RUN_ROOT>",
  "purpose": "environment_access",
  "target_id": "CDP_TARGET_ID",
  "lock_root": "RUN_PRIVATE_TEMP_LOCK_ROOT",
  "rules": [{
    "match": {
      "protocol": "https:",
      "hostname": "non-production.example.test",
      "path_prefix": "/fixture/diagnostics",
      "methods": ["GET"]
    },
    "request": { "headers": { "set": { "x-fixture-mode": "empty" }, "remove": ["x-old"] } },
    "response": {
      "status": 201,
      "headers": { "set": { "x-fixture": "yes" }, "remove": ["x-old-response"] },
      "body": { "mode": "json_patch", "operations": [{ "op": "set", "path": "/displayMessage", "value": "诊断响应展示样本" }] }
    }
  }]
}
```

Body mode 还可使用 `{ "mode": "replace_text", "value": "..." }`、`{ "mode": "replace_base64", "value": "..." }` 或 `{ "mode": "none" }`。Header 名大小写不敏感，set 替换全部旧值且不重复，remove 删除全部同名值。JSON Pointer 只支持 set/delete。禁止任意 JS 回调、浏览器全局代理、SSE、WebSocket frame、流式和大型二进制。只在改 body 时获取原 body；正确处理 `base64Encoded`，改写后移除旧 content-length 与失效的 content-encoding，最终 body 用 Base64 fulfill。普通代理默认上限 5 MiB，超限或规则错误原样继续并记诊断；此行为绝不能用于 Mock 业务路由。授权撤回或绑定失效须停止对应修改，并记录影响。

配置不得包含认证 secret，不写死业务域名、环境 header 或绝对路径。明文 HTTP 默认只允许 loopback；只有用例明确确认内网非生产 HTTP 时才可显式放行。

## Mock 场景绑定与请求前隔离

可选 Mock 复用同一个单 Target 代理实例和锁，不启动第二个 Fetch 监听器。配置通过 `run_root` 与 `mock_scenario` 引用 Run 内场景文件：相对路径、SHA-256、`attempt_id`、状态文件和回执文件；还必须有本次 `proxy_cycle_id` 和引用已验证通道事实的 `mock_channel_coverage_ref`。start 会核对 `mock_fallback@1.0`、当前 `mock_policy: allowed`、running 尝试、Run/case/attempt 归属、候选/支持检查点、场景修订与哈希。路径穿越、符号链接、缺失/成对不一致的状态回执、未知版本或撤回授权均失败关闭。

场景 schema 固定为 `mock-scenario-v1`。match 精确比较 origin（含有效端口）、pathname、method、解码后的 query 有序值数组以及 JSON body 的存在性、类型和值；缺失、空字符串、null、数字与字符串不同。额外 query/body 字段只有显式确认后才能忽略。不能用 HTTP 方法推断读写；POST 可以是查询，GET 也可能有副作用。多规则命中、未知业务请求、合成 ID 未覆盖的请求、模板/状态/持久化失败均在 Request 阶段 `failRequest`，绝不落入普通代理的错误透传。

命中规则时在临时状态副本执行受限 set/delete，生成并校验 JSON 或显式 text 响应，先可靠保存状态版本和去重回执并复核一致，再 `fulfillRequest`；整个流程不访问真实上游。相同 attempt + proxy cycle + Fetch request ID 只提交一次，新浏览器请求不擅自幂等。响应仍受 5 MiB 上限，超限阻断而非透传。规则增加只能发生在无在途事务的检查点边界，已使用 route 的语义不可原地改变；状态丢失或与账本版本不一致时不能假装从中间恢复。

在绑定 Target 的 HTTP(S) Request 层建立完整保护范围，捕获未知 origin/path 后再作声明式分类；仅已知成功路由的窄 pattern 不构成完整隔离。静态资源等安全透传必须有事实来源，未知路由、多命中、额外字段、类型不符或未覆盖合成 ID 一律阻断；不能按 GET/POST 推断副作用。

模拟业务操作前必须通过 `mock_channel_coverage` 关联实际 `network_observation`、当前 Target/存储上下文、attempt 的上下文引用、场景哈希和每个路由。只接受实际观察到的 `page-http` 通道，不能填一个布尔值替代证据。存在 Service Worker、worker、子 Target 或其他未覆盖通道，或无法证明所有相关业务路由进入该会话时，拒绝场景并说明限制。保持单 Target 架构，不接管 worker 或另一个页面来凑覆盖；WebSocket/SSE/流式不支持。不为取证擅自派发真实写请求。

状态与回执的分别原子写入不等于跨文件数据库事务：中间崩溃、版本或链条不一致必须阻断恢复，不能返回未可靠提交的成功。日志落后时，只能在完整核对 Run/attempt/revision/proxy cycle、状态与回执链后幂等补记已发生事实，不重放业务写入。合法模板仅在上下文和契约一致时复用，身份、环境或契约变化后重新核验；不同尝试的状态不得串用。

本地计数 fixture 的验收必须证明模拟业务写请求的真实上游接收数为零，同时验证页面消费响应、写后读一致、未知请求阻断、另一个 Target 不受影响、刷新/导航和普通规则共存。实际业务报告只能陈述当前 Target 的请求前处理事实；没有服务端证据时不得扩大为整个后端绝无写入。

## 生命周期

```text
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs start --endpoint <CDP_ENDPOINT> --config <RULES_JSON> --state <PRIVATE_STATE_JSON>
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs status --state <PRIVATE_STATE_JSON>
node <SKILL_ROOT>/scripts/cdp-fetch-proxy.mjs stop --state <PRIVATE_STATE_JSON>
```

start 校验 endpoint→target 映射与 Runner 当前登记的测试页面一致、排他获取 `hash(endpoint identity + targetId)` 锁、attach、Network.enable、Fetch.enable，并前台保持连接。state 包含 PID、Target、Session 是否已附着、owner token、计数和最近错误，但不保存 Session ID。stop 对照锁验证 PID、Run ID、owner token 后只向该 owner 发停止信号。锁带时间与心跳；仅心跳过期且 PID 不存在时回收。不同 Target 可用独立实例和独立锁并发；一个实例不能覆盖多个页面。

同一 Target 内刷新或导航时保持绑定并重新做真实验证。测试转移到新标签页产生新 `targetId` 时，旧代理不得影响新页面；先停止旧绑定，再为新 Target 创建独立实例、锁和验证。

正式 `createProxyListener` 入口通过同一 Run 原子追加 `proxy_state`，同步 active、停止、降级及隔离未知等生命周期事实。状态变化去重；页面隔离、Fetch 关闭、detach 和锁释放分别记录。监听器不能仅凭 stop 成功声称真实响应恢复：`real_response_restored` 保持未核实，直到 Runner 取得真实只读页面响应并追加证据。owner token、进程身份和连接秘密不得复制到主日志。

正常结束、失败、中断、SIGINT/SIGTERM、Target 关闭或授权撤回时，按当前代理类型执行安全清理，无需用户确认；仅在连接仍可控且已证实页面安全时才能依次 Fetch.disable、detach、停止本 Run 进程和释放本 Run 锁。随后用安全的真实只读请求验证原行为恢复。只操作与 state 中 Run ID、owner token、endpoint 和 targetId 全部匹配的资源，不得停止其他 Target 的代理，也不得释放其他 Run 的锁。

Mock 清理更严格：Runner 必须先在拦截仍有效时通过 Chrome DevTools MCP 把所属 owned 测试页导航到 `about:blank`，处置在途请求，再请求 stop。stop 会复核 Target 已安全离开模拟场景；若未满足则状态为 `cleanup_failed`，保持拦截和锁，不执行 Fetch.disable/detach，也不退出代理进程。完成安全隔离后再次 stop 才释放。CDP 断连时记录 `isolation_unknown`，停止所有相关新业务动作；无法证实 Fetch 是否仍在，不承诺断线期间 fail-closed 或零泄漏，不以进程退出当清理成功。

进入 `awaiting_user` 前同样执行上述清理并记录真实恢复结果；保留测试页面和登录态。用户通知后恢复原 Run 时，根据原确认规则为当前已登记 Target 新建代理周期并重新验证，不能沿用上一周期的“已清理”状态，也不能触碰其他页面或 Run。

CDP transport 断连后，客户端须先标记连接终止，再通知代理清理；后续命令立即拒绝，不能在死连接上等待超时而拖住 Target 锁。断连无法获得 `Fetch.disable`/detach 的成功回执时不得伪造；把进程退出、锁释放、页面隔离和真实响应恢复分别记录；任一未验证则明确证据缺口。恢复后先重新建立限制或使自有模拟页安全退出，再在安全条件下核验真实只读响应。只有重新确认同一 endpoint 中的精确业务 Target，才可重新 attach 并启用 Fetch；重新验证改写、其他 Target 隔离和最终停止恢复。该过程只恢复代理，不自动重试业务写操作。

## 真实验证与恢复

内部计数不是证据。Runner 在执行依赖代理的检查点前，自动从服务器回显/Network 原始事件证明请求头实际发出，从页面观察证明状态、响应头/body 生效，并证明同 Target 不匹配请求、至少一个其他页面、刷新/导航和停止后原响应。无法安全触发另一页面真实请求时，只能记录 Target 级隔离事实和可执行模拟证据，不得虚构结果。验证结果写入报告并在最终对话展示，不列入执行前用户确认。代理中断时暂停受影响检查点，重新附着并复核；恢复成功后仅继续未派发或已证明未提交且可重试的动作；已确认效果或效果不明的写入绝不重放。不能恢复则判 `undetermined` 并写代理事实，不能直接判产品 `failed`。


## 场景建立前的受控发现

`createProxyListener` 可接 `discovery: {discovery_id, checkpoint_ids, context_ref, safe_probe: {url, method: "GET"}, passthrough: []}`。本阶段不传 mock_scenario、candidate、attempt 或最终场景摘要。必须已有运行中 Run、明确 allowed、bound 自有 Target 及覆盖这些检查点的新鲜真实身份上下文；worker/子框架检查复用正式 Mock 通道保护。安全探针自身仍在 Request 阶段阻断；探针未被观察前任何请求都不透传。

MCP 实际触发探针后，未知业务 Request 捕获并 failRequest，记录同 Target/context/checkpoint 的 network_observation（kind 为 discovery_probe/discovery_request），不生成 Mock 回执或产品结果。透传只支持精确 `{url,method:"GET",side_effect_free:true,basis_refs:[事件序号]}`，依据来自已知真实观察或用户契约；GET 本身不证明无副作用。发现过程同样在断连时隔离未知，安全退出后恢复基础代理和登录态，再补齐正式场景及通道证明。没有安全探针或无法证明通道则求助。

Mock 命中使用声明的最终响应，不叠加第二轮 Response 改写；匹配的基础规则要求的环境响应头必须在 Mock 响应显式满足，缺失/冲突启用前拒绝。已知安全透传继续基础规则。停止/重新绑定代理进程可复用原 Chrome/Target/登录态，不强制热更新，也不让用户重复填写已确认规则。

### 暂停主文档时的通道核验

正式场景和受控发现启用前通过 Page.getFrameTree 取得实际根 frameId，并先订阅 Page 框架生命周期。仅当 Fetch 暂停的 Document 确切属于该已核验根框架、未观察到子框架或根身份变化时，使用该根记录与最新 Target 枚举核验；避免在 Chrome 已暂停主文档时再次调用 Page.getFrameTree 形成等待循环。仍逐请求检查关联 worker/子 Target、当前授权及严格场景匹配；未知 URL/未知或子 frameId 继续阻断。其他请求与业务动作前保留完整 frame-tree 探测。框架边界变化后安全退出并重新核验，不能把导航当作扩大拦截范围的授权。

每次 continue/fulfill 发送前还须同步复核框架变化、传输状态及停止标记，覆盖异步匹配、授权和回执导入期间发生的边界变化；核验后的异步等待不构成继续释放请求的依据。
