import { createHash } from "node:crypto";
import http from "node:http";

import { createBusinessRouter, sendBusinessError } from "./router.mjs";

const STATIC_PATHS = new Set(["/assets/app.mjs", "/assets/styles.css", "/favicon.ico"]);

export function normalizeBusinessRoute(pathname) {
  return pathname
    .replace(/^\/customers\/[^/]+\/(edit|delete)$/, "/customers/:id/$1")
    .replace(/^\/customers\/[^/]+$/, "/customers/:id")
    .replace(/^\/projects\/[^/]+\/(status|description|export)$/, "/projects/:id/$1")
    .replace(/^\/projects\/[^/]+$/, "/projects/:id")
    .replace(/^\/approvals\/[^/]+\/decision$/, "/approvals/:id/decision");
}

function traceResponse(request, response, coordinator, now) {
  const origin = `http://127.0.0.1:${request.socket.localPort}`;
  const url = new URL(request.url, origin);
  if (STATIC_PATHS.has(url.pathname)) return;
  const ticket = coordinator.beginBusinessRequest();
  if (!ticket) return;
  const startedAtMs = now();
  const responseHash = createHash("sha256");
  const write = response.write.bind(response);
  const end = response.end.bind(response);
  response.write = (chunk, ...args) => {
    if (chunk !== undefined && chunk !== null) responseHash.update(chunk);
    return write(chunk, ...args);
  };
  response.end = (chunk, ...args) => {
    if (chunk !== undefined && chunk !== null) responseHash.update(chunk);
    return end(chunk, ...args);
  };
  response.once("finish", () => {
    responseHash.update(`\nstatus:${response.statusCode}\ncontent-type:${response.getHeader("content-type") ?? ""}`);
    coordinator.completeBusinessRequest(ticket, {
      method: request.method,
      route: normalizeBusinessRoute(url.pathname),
      status: response.statusCode,
      startedAtMs,
      endedAtMs: Math.max(startedAtMs, now()),
      resultDigest: `sha256:${responseHash.digest("hex")}`
    });
  });
}

function createLoginLimiter({ maximum = 20, windowMilliseconds = 60_000 } = {}) {
  const attempts = new Map();
  return (address) => {
    const now = Date.now();
    const current = attempts.get(address);
    if (!current || now - current.startedAt >= windowMilliseconds) {
      attempts.set(address, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= maximum;
  };
}

export function createBusinessServer(options) {
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1") throw new Error("Business server must bind to 127.0.0.1");
  const route = createBusinessRouter({
    coordinator: options.coordinator,
    operations: options.operations,
    loginRateLimit: createLoginLimiter(options.loginRateLimit)
  });
  const server = http.createServer((request, response) => {
    traceResponse(request, response, options.coordinator, options.now ?? Date.now);
    route(request, response).catch((error) => sendBusinessError(response, error));
  });

  return Object.freeze({
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, host, () => {
          server.off("error", reject);
          const address = server.address();
          resolve({
            origin: `http://${host}:${address.port}`,
            host,
            port: address.port
          });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
}
