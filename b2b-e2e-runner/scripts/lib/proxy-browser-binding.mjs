import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertCurrentWorkflow } from "./workflow-contract.mjs";
import { browserIdentity } from "./browser-session.mjs";

function fail(message) {
  const error = new Error(message);
  error.code = "PROXY_BROWSER_BINDING";
  throw error;
}

export async function assertBrowserProxyBinding(config, expected = null) {
  if (typeof config.run_root !== "string" || !path.isAbsolute(config.run_root)) fail("代理需要本 Run 的绝对 run_root 以核验浏览器所有权");
  const log = JSON.parse(await readFile(path.join(config.run_root, "execution-log.json"), "utf8"));
  assertCurrentWorkflow(log);
  const runId = config.run_id ?? config.runId;
  const targetId = config.target_id ?? config.targetId;
  if (log.run?.run_id !== runId) fail("代理浏览器 Run 归属不一致");
  let endpoint;
  try { endpoint = new URL(config.endpoint).origin; } catch { fail("代理浏览器 endpoint 无效"); }
  const sessions = log.events.filter(event => event.type === "browser_session");
  const bound = sessions.filter(event => event.phase === "bound" && event.target_id === targetId &&
    (!config.storage_context || event.storage_context === config.storage_context)).at(-1);
  if (!bound || bound.run_id !== runId || bound.shared_connection !== "ready" ||
      !bound.generation || !bound.storage_context || !/^[a-f0-9]{64}$/.test(bound.browser_identity ?? "")) {
    fail("代理 Target 尚无本 Run 已核验的共享浏览器绑定");
  }
  let boundEndpoint;
  try { boundEndpoint = new URL(bound.endpoint).origin; } catch { fail("浏览器绑定 endpoint 无效"); }
  const latest = sessions.filter(event => event.storage_context === bound.storage_context).at(-1);
  if (endpoint !== boundEndpoint || latest !== bound ||
      (config.browser_generation && config.browser_generation !== bound.generation) ||
      (expected && ["generation", "storage_context", "target_id", "browser_identity", "config_sha256"].some(key => expected[key] !== bound[key]))) {
    fail("浏览器代次、存储身份、Target 或连接已失效，须先重新核验绑定");
  }
  if (!sessions.some(event => event.phase === "prepared" && event.run_id === runId && event.generation === bound.generation &&
    event.storage_context === bound.storage_context && event.config_sha256 === bound.config_sha256 && event.sequence < bound.sequence)) {
    fail("浏览器绑定没有本 Run 对应的已登记启动代次");
  }
  return structuredClone(bound);
}

export async function loadBrowserProxyBinding(config) {
  const session = await assertBrowserProxyBinding(config);
  return {
    session,
    assertBound: () => assertBrowserProxyBinding(config, session),
    verifyDiscoveredBrowser(version) {
      let endpoint, websocket;
      try { endpoint = new URL(config.endpoint); websocket = new URL(version.webSocketDebuggerUrl); } catch { fail("发现的共享浏览器地址无效"); }
      if (!["ws:", "wss:"].includes(websocket.protocol) ||
          !["127.0.0.1", "localhost", "[::1]"].includes(websocket.hostname) ||
          websocket.port !== endpoint.port || websocket.username || websocket.password || websocket.search || websocket.hash ||
          browserIdentity(websocket.pathname) !== session.browser_identity) {
        fail("发现的浏览器实例与当前 Run 已绑定实例不一致");
      }
    }
  };
}
