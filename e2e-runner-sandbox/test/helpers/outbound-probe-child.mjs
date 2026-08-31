import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

import { installOutboundGuard } from "../../src/security/outbound-guard.mjs";

installOutboundGuard({ allowedHosts: ["127.0.0.1", "::1"] });

async function blocked(operation) {
  try {
    await operation();
    return { blocked: false, code: null };
  } catch (error) {
    return { blocked: error.code === "OUTBOUND_NETWORK_DENIED", code: error.code ?? null };
  }
}

const result = {
  dns: await blocked(() => new Promise((resolve, reject) => dns.lookup("example.com", (error) => error ? reject(error) : resolve()))),
  tcp: await blocked(() => net.connect({ host: "198.51.100.10", port: 80 })),
  http: await blocked(() => http.get("http://example.com/")),
  https: await blocked(() => https.get("https://example.com/")),
  fetch: await blocked(() => fetch("https://example.com/")),
  websocket: await blocked(() => new WebSocket("wss://example.com/socket"))
};

process.stdout.write(`${JSON.stringify(result)}\n`);
