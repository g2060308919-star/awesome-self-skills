// Opt-in real Chrome + chrome-devtools-mcp fixture test. No personal profile/config.
// Usage: node ... --chrome <executable> --mcp-entry <installed MCP bin js> --output <authorized dir>
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProxyListener } from "../../scripts/cdp-fetch-proxy.mjs";
import { CdpClient } from "../../scripts/lib/cdp-client.mjs";
import { createUsabilityServer } from "./usability-server.mjs";

const args = process.argv.slice(2);
const option = key => args[args.indexOf(`--${key}`) + 1];
const chromePath = option("chrome"), mcpEntry = option("mcp-entry"), output = option("output");
assert(chromePath && mcpEntry && output, "explicit executable paths and output required");
const temporary = await mkdtemp(path.join(os.tmpdir(), "runner-proxy-browser-"));
const profile = path.join(temporary, "chrome-profile");
const lockRoot = path.join(temporary, "locks");
const server = createUsabilityServer();
const checks = [], transcript = [];
let chrome, client, listener, transport;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const fixture = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"], { stdio: "ignore" });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await sleep(100); }
  }
  assert.match(port ?? "", /^\d+$/, "dedicated Chrome reports its dynamic port");
  const endpoint = `http://127.0.0.1:${port}`;
  const sdk = await import(pathToFileURL(path.resolve(path.dirname(mcpEntry), "../third_party/index.js")));
  client = new sdk.Client({ name: "runner-isolated-smoke", version: "1.0.0" }, { capabilities: { roots: {} } });
  client.setRequestHandler(sdk.ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(path.resolve(output)).href, name: "fixture-output" }] }));
  transport = new sdk.StdioClientTransport({ command: process.execPath, args: [mcpEntry, "--browserUrl", endpoint, "--no-usage-statistics", "--no-performance-crux"], env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1" }, stderr: "pipe" });
  await client.connect(transport);
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.filter(item => item.type === "text").map(item => item.text).join("\n") ?? "";
    transcript.push({ tool: name, text });
    assert(!result.isError, text);
    return text;
  }
  const pages = await call("new_page", { url: `${fixture}#A` });
  const pageA = Number(pages.match(/(?:^|\n)(\d+):[^\n]*\[selected\]/)?.[1]); assert(Number.isFinite(pageA));
  const pagesB = await call("new_page", { url: `${fixture}#B` });
  const pageB = Number(pagesB.match(/(?:^|\n)(\d+):[^\n]*\[selected\]/)?.[1]); assert(Number.isFinite(pageB));
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  const matches = targets.filter(target => target.type === "page" && target.url === `${fixture}#A`);
  assert.equal(matches.length, 1);
  const targetId = matches[0].id;
  listener = await createProxyListener({ endpoint, environment: "test", target_id: targetId, run_id: "isolated-proxy-smoke", lock_root: lockRoot, rules: [{ match: { protocol: "http:", hostname: "127.0.0.1", path_prefix: "/probe", methods: ["GET"] }, request: { headers: { set: { "x-fixture-request": "rewritten" } } }, response: { status: 201, headers: { set: { "x-fixture": "rewritten" } }, body: { mode: "json_patch", operations: [{ op: "set", path: "/value", value: "body-rewritten" }] } } }] });
  let proxySocket;
  listener.clientFactory = async url => {
    proxySocket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      proxySocket.addEventListener("open", resolve, { once: true });
      proxySocket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(proxySocket);
  };
  await listener.start();
  async function probe() {
    const snapshot = await call("take_snapshot");
    const uid = snapshot.match(/uid=(\S+) button "读取代理测试响应"/)?.[1]; assert(uid);
    await call("click", { uid });
    return await call("take_snapshot");
  }
  assert.match(await probe(), /状态 200.*origin.*none.*origin/); checks.push("other-target-unaffected");
  await call("select_page", { pageId: pageA });
  assert.match(await probe(), /状态 201.*body-rewritten.*rewritten.*rewritten/); checks.push("same-target-request-header-status-response-header-body");
  await call("navigate_page", { type: "reload" });
  assert.match(await probe(), /状态 201.*rewritten/); checks.push("reload");
  await call("navigate_page", { url: `${fixture}?view=navigated` });
  assert.match(await probe(), /状态 201.*rewritten/); checks.push("same-target-navigation");
  // Inject loss below the listener, without calling its normal stop path.
  proxySocket.close();
  const cleanupDeadline = Date.now() + 2000;
  while (listener.status().state !== "stopped" && Date.now() < cleanupDeadline) await sleep(20);
  assert.equal(listener.status().state, "stopped");
  assert(listener.status().recentErrors.some(error => error.code === "CDP_DISCONNECTED"));
  assert.equal((await readdir(lockRoot)).filter(name => !name.startsWith(".")).length, 0);
  checks.push("unexpected-disconnect-cleans-session-and-lock-promptly");
  assert.match(await probe(), /状态 200.*origin.*none.*origin/); checks.push("disconnect-restores-origin");
  const reconnectTargets = await (await fetch(`${endpoint}/json/list`)).json();
  assert(reconnectTargets.some(target => target.id === targetId && target.url === `${fixture}?view=navigated`));
  await listener.start();
  assert.equal(listener.status().targetId, targetId);
  assert.match(await probe(), /状态 201.*body-rewritten.*rewritten.*rewritten/); checks.push("same-target-reconnect-reverified");
  await call("select_page", { pageId: pageB });
  assert.match(await probe(), /状态 200.*origin.*none.*origin/); checks.push("other-target-unaffected-after-reconnect");
  await call("select_page", { pageId: pageA });
  await listener.stop();
  assert.match(await probe(), /状态 200.*origin.*none.*origin/); checks.push("stop-restores-origin");
  assert.equal((await readdir(lockRoot)).filter(name => !name.startsWith(".")).length, 0); checks.push("lock-released");
} finally {
  await listener?.stop();
  await client?.close();
  if (chrome && chrome.exitCode === null) { const exited = once(chrome, "exit"); chrome.kill("SIGTERM"); await Promise.race([exited, sleep(5000)]); if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill("SIGKILL"); await exited; } }
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
  await writeFile(path.join(output, "proxy-browser-smoke.json"), JSON.stringify({ checks, transcript, cleanup: { ownChromeStopped: chrome?.exitCode !== null || chrome?.signalCode !== null, ownFixtureStopped: !server.listening, profileRemoved: true }, conclusion: checks.length === 10 ? "PASS" : "FAIL" }, null, 2));
}
process.stdout.write(JSON.stringify({ checks, conclusion: "PASS", output: path.resolve(output) }) + "\n");
