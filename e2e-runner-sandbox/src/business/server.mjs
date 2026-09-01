import http from "node:http";

import { createBusinessRouter, sendBusinessError } from "./router.mjs";

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
