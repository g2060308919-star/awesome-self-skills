// Opt-in real MCP test. Explicit paths only; no personal Chrome profile/config.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createUsabilityServer } from "./usability-server.mjs";

const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; }
const chromePath = option("chrome"), mcpEntry = option("mcp-entry"), outputPath = option("output"), reportPath = option("report");
assert(chromePath && mcpEntry && outputPath && reportPath, "--chrome --mcp-entry --output --report are required");
const output = path.resolve(outputPath);
const temporary = await mkdtemp(path.join(os.tmpdir(), "runner-browser-evidence-"));
const profile = path.join(temporary, "profile");
const server = createUsabilityServer();
const checks = [], transcript = [];
let chrome, client;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const fixture = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(chromePath, ["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--auto-open-devtools-for-tabs", "about:blank"], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await sleep(100); }
  }
  assert.match(port ?? "", /^\d+$/);
  const sdk = await import(pathToFileURL(path.resolve(path.dirname(mcpEntry), "../third_party/index.js")));
  client = new sdk.Client({ name: "runner-browser-evidence", version: "1.0" }, { capabilities: { roots: {} } });
  client.setRequestHandler(sdk.ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(output).href, name: "test-output" }] }));
  const transport = new sdk.StdioClientTransport({ command: process.execPath, args: [mcpEntry, "--browserUrl", `http://127.0.0.1:${port}`, "--experimentalDevtools", "--experimentalIncludeAllPages", "--no-usage-statistics", "--no-performance-crux"], env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1" }, stderr: "pipe" });
  await client.connect(transport);
  async function call(name, arguments_ = {}) {
    const result = await client.callTool({ name, arguments: arguments_ });
    const text = result.content?.filter(item => item.type === "text").map(item => item.text).join("\n") ?? "";
    transcript.push({ name, arguments: arguments_, text });
    assert(!result.isError, text);
    return text;
  }
  const pageIds = text => [...text.matchAll(/(?:^|\n)(\d+):/g)].map(match => Number(match[1]));
  const before = pageIds(await call("list_pages"));
  const pages = await call("new_page", { url: fixture });
  const page = Number(pages.match(/(?:^|\n)(\d+):[^\n]*\[selected\]/)?.[1]);
  assert(Number.isFinite(page));
  const devtools = [...pages.matchAll(/(?:^|\n)(\d+): DevTools /g)].map(match => Number(match[1])).filter(id => !before.includes(id));
  assert.equal(devtools.length, 1, "one new real DevTools target must accompany the owned test page");
  await call("select_page", { pageId: devtools[0] });
  async function clickObserved(pattern) {
    const snapshot = await call("take_snapshot");
    const uid = snapshot.match(pattern)?.[1];
    assert(uid, `fresh semantic match required: ${pattern}`);
    await call("click", { uid });
  }
  await clickObserved(/uid=(\S+) tab "Network"/);
  await call("select_page", { pageId: page });
  await clickObserved(/uid=(\S+) button "读取代理测试响应"/);
  const requests = await call("list_network_requests", { resourceTypes: ["fetch"] });
  assert(requests.includes(`${fixture}probe`));
  await call("select_page", { pageId: devtools[0] });
  await call("wait_for", { text: ["probe"], timeout: 10000 });
  await clickObserved(/uid=(\S+) cell "Fetch probe"/);
  let snapshot = await call("take_snapshot");
  assert(snapshot.includes(`${fixture}probe`) && snapshot.includes("200 OK") && snapshot.includes("X-Fixture") && snapshot.includes("origin"));
  // This fixture never uses credentials. Do not generalize whole-panel capture
  // to authenticated systems; real Runs must review visible secrets first.
  await clickObserved(/uid=(\S+) button "Customize and control DevTools"/);
  await clickObserved(/uid=(\S+) button "Undock into separate window"/);
  await call("emulate", { viewport: "1400x1100x1" });
  await call("take_screenshot", { filePath: path.join(output, "network-headers-smoke.png") });
  checks.push("real-network-headers-screenshot");
  await clickObserved(/uid=(\S+) tab "Response"/);
  snapshot = await call("take_snapshot");
  assert(snapshot.includes('origin') && snapshot.includes('requestMarker'));
  await call("take_screenshot", { filePath: path.join(output, "network-response-smoke.png") });
  checks.push("real-network-response-screenshot");
  for (const name of ["network-headers-smoke.png", "network-response-smoke.png"]) {
    const bytes = await readFile(path.join(output, name));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert(bytes.length > 1000);
  }
  const minimal = path.join(output, "offline-control.html");
  await writeFile(minimal, '<!doctype html><meta charset="utf-8"><title>离线对照</title><h1>无脚本、样式、图片的最小页面</h1>', { flag: "wx" });
  await call("new_page", { url: pathToFileURL(minimal).href });
  const directOpenConsole = await call("list_console_messages", { types: ["warn", "error"] });
  // Record the control rather than require an upstream bug on every version.
  transcript.push({ directOpenFileOriginWarning: directOpenConsole.includes("unique security origins") });
  for (const filename of [minimal, reportPath, reportPath, reportPath]) {
    await call("new_page", { url: "about:blank" });
    assert((await call("take_snapshot")).includes('url="about:blank"'));
    await call("navigate_page", { url: pathToFileURL(path.resolve(filename)).href });
    const messages = await call("list_console_messages", { types: ["warn", "error"] });
    assert(messages.includes("<no console messages found>"), messages);
    const state = await call("take_snapshot");
    assert(state.includes(filename === minimal ? "离线对照" : "测试报告"));
  }
  checks.push("offline-blank-then-navigate-control-and-three-report-opens");
} finally {
  await client?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = once(chrome, "exit"); chrome.kill("SIGTERM");
    await Promise.race([exited, sleep(3000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) { chrome.kill("SIGKILL"); await exited; }
  }
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
  await writeFile(path.join(output, "browser-evidence-smoke.json"), JSON.stringify({ checks, transcript, conclusion: checks.length === 3 ? "PASS" : "FAIL", cleanup: { ownChromeStopped: chrome?.exitCode !== null || chrome?.signalCode !== null, fixtureStopped: !server.listening, profileRemoved: true } }, null, 2));
}
console.log(JSON.stringify({ checks, conclusion: "PASS", output }));
