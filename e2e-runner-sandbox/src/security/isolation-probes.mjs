import { lstat } from "node:fs/promises";

import { createControlClient } from "../control/client.mjs";
import { validateSyntheticData } from "./data-policy.mjs";

async function probe(name, operation) {
  try {
    const details = await operation();
    return { name, passed: true, details };
  } catch (error) {
    return { name, passed: false, error: { code: error.code ?? "PROBE_FAILED", message: error.message } };
  }
}

export async function runIsolationProbes(runtime) {
  const rootResponse = await fetch(`${runtime.businessUrl}/`, { redirect: "manual" });
  const rootBody = await rootResponse.text();
  const probes = [];
  probes.push(await probe("business-no-control-discovery", async () => {
    const forbidden = [
      runtime.token,
      runtime.socketPath,
      runtime.runtimeDirectory,
      "oracle-v1",
      "control.sock",
      "capability"
    ];
    if (forbidden.some((value) => value && rootBody.includes(value))) throw new Error("Business page leaked evaluator material");
    for (const path of ["/control", "/oracle", "/.well-known/evaluator", "/runtime.json"]) {
      const response = await fetch(`${runtime.businessUrl}${path}`);
      if (response.status !== 404 || (await response.text()).includes(runtime.token)) {
        throw new Error(`Evaluator route guess was not safely rejected: ${path}`);
      }
    }
    return { guessedRoutes: 4 };
  }));
  probes.push(await probe("cors-denied", async () => {
    const response = await fetch(`${runtime.businessUrl}/`, { headers: { origin: "https://outside.invalid" } });
    if (response.headers.has("access-control-allow-origin")) throw new Error("Business origin exposes permissive CORS");
    return { allowOrigin: null };
  }));
  probes.push(await probe("csp-local-only", async () => {
    const policy = rootResponse.headers.get("content-security-policy") ?? "";
    if (!policy.includes("connect-src 'self'") || /https?:\/\//.test(policy)) throw new Error("CSP permits a non-local connection target");
    return { policy };
  }));
  probes.push(await probe("cookie-isolation", async () => {
    const response = await fetch(`${runtime.businessUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: runtime.businessUrl,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ accountId: "acct-viewer" })
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    if (!/HttpOnly/i.test(cookie) || !/SameSite=Strict/i.test(cookie) || /Domain=/i.test(cookie)) {
      throw new Error("Business session cookie is not host-only and strict");
    }
    if ([runtime.token, runtime.socketPath].some((value) => cookie.includes(value))) throw new Error("Cookie leaked evaluator capability");
    return { hostOnly: true, httpOnly: true, sameSite: "Strict" };
  }));
  probes.push(await probe("control-owner-only", async () => {
    const socketMode = (await lstat(runtime.socketPath)).mode & 0o777;
    const capabilityMode = (await lstat(runtime.capabilityPath)).mode & 0o777;
    if (socketMode !== 0o600 || capabilityMode !== 0o600) throw new Error("Control files are not owner-only");
    return { socketMode, capabilityMode };
  }));
  probes.push(await probe("bad-token-denied", async () => {
    const client = createControlClient({ socketPath: runtime.socketPath, token: "0".repeat(64) });
    try {
      await client.request("status", {});
    } catch (error) {
      if (error.code === "CONTROL_UNAUTHORIZED") return { code: error.code };
      throw error;
    }
    throw new Error("Bad control token was accepted");
  }));
  probes.push(await probe("rendered-data-policy", async () => {
    const violations = validateSyntheticData(rootBody);
    if (violations.length > 0) throw new Error("Rendered page violates synthetic data policy");
    return { violations: 0 };
  }));
  return probes;
}
