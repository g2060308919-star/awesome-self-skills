import http from "node:http";
import { readFile } from "node:fs/promises";
import { createDemoState } from "./domain.mjs";
import {
  renderCleanupFailurePage,
  renderLoginPage,
  renderRequestDetail,
  renderUnknownOutcomePage,
  renderWorkspace
} from "./views.mjs";

function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

async function readInput(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  return JSON.parse(body);
}

function sendRedirect(response, location) {
  response.writeHead(303, {
    "cache-control": "no-store",
    location
  });
  response.end();
}

function requireControlledSession(demo, response) {
  if (demo.snapshot().session.authenticated) return true;
  sendJson(response, 401, {
    error: {
      code: "MANUAL_LOGIN_REQUIRED",
      message: "Start the demo session manually"
    }
  });
  return false;
}

async function handleRequest(request, response, demo) {
  const url = new URL(request.url, "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/__diag/meta") {
    sendJson(response, 200, {
      service: "b2b-e2e-runner-demo",
      mode: "demo",
      nonProduction: true
    });
    return;
  }

  const assetMap = new Map([
    ["/assets/app.mjs", [new URL("../public/app.mjs", import.meta.url), "text/javascript; charset=utf-8"]],
    ["/assets/diagnostics.mjs", [new URL("./diagnostics.mjs", import.meta.url), "text/javascript; charset=utf-8"]],
    ["/assets/styles.css", [new URL("../public/styles.css", import.meta.url), "text/css; charset=utf-8"]]
  ]);
  if (request.method === "GET" && assetMap.has(url.pathname)) {
    const [path, contentType] = assetMap.get(url.pathname);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentType
    });
    response.end(await readFile(path));
    return;
  }

  const needsControlledSession =
    url.pathname === "/api/session/role" ||
    url.pathname === "/api/requests" ||
    url.pathname.startsWith("/api/requests/") ||
    url.pathname.startsWith("/ui/") ||
    url.pathname.startsWith("/requests/") ||
    url.pathname === "/api/diagnostics/reconciliation";
  if (needsControlledSession && !requireControlledSession(demo, response)) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    const state = demo.snapshot();
    if (!state.session.authenticated) {
      sendJson(response, 401, {
        error: { code: "MANUAL_LOGIN_REQUIRED", message: "Start the demo session manually" }
      });
      return;
    }
    sendJson(response, 200, state);
    return;
  }

  const detailMatch = url.pathname.match(/^\/requests\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) {
    const state = demo.snapshot();
    const requestRecord = state.requests.find(
      ({ id }) => id === decodeURIComponent(detailMatch[1])
    );
    if (!requestRecord) {
      sendJson(response, 404, { error: "Request not found" });
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    });
    response.end(renderRequestDetail(state, requestRecord));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/manual-login") {
    const isForm = (request.headers["content-type"] ?? "").startsWith(
      "application/x-www-form-urlencoded"
    );
    const { displayName } = await readInput(request);
    demo.signInManually(displayName);
    if (isForm) {
      sendRedirect(response, "/");
      return;
    }
    sendJson(response, 200, demo.snapshot().session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/session/role") {
    const { role } = await readInput(request);
    demo.changeRole(role);
    sendJson(response, 200, demo.snapshot().session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/ui/session/role") {
    const { role } = await readInput(request);
    demo.changeRole(role);
    sendRedirect(response, "/?notice=Session%20context%20changed");
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/requests") {
    const input = await readInput(request);
    const result = demo.submitRequest({
      ...input,
      simulateAmbiguous: url.searchParams.get("outcome") === "ambiguous"
    });
    sendJson(response, result.status, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/ui/requests/create") {
    const input = await readInput(request);
    demo.submitRequest({
      title: input.title,
      amount: Number(input.amount),
      simulateAmbiguous: true
    });
    response.writeHead(504, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    });
    response.end(renderUnknownOutcomePage());
    return;
  }

  const approvalMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/approve$/);
  if (request.method === "POST" && approvalMatch) {
    const result = demo.approveRequest(decodeURIComponent(approvalMatch[1]));
    sendJson(response, result.status, result);
    return;
  }

  const uiApprovalMatch = url.pathname.match(
    /^\/ui\/requests\/([^/]+)\/approve$/
  );
  if (request.method === "POST" && uiApprovalMatch) {
    const result = demo.approveRequest(decodeURIComponent(uiApprovalMatch[1]));
    const notice = result.ok ? "Request approved" : result.reason;
    const kind = result.ok ? "status" : "alert";
    sendRedirect(
      response,
      `/?notice=${encodeURIComponent(notice)}&noticeKind=${kind}`
    );
    return;
  }

  const uiDeleteMatch = url.pathname.match(/^\/ui\/requests\/([^/]+)\/delete$/);
  if (request.method === "POST" && uiDeleteMatch) {
    const requestId = decodeURIComponent(uiDeleteMatch[1]);
    const result = demo.cleanupRequest(requestId);
    if (result.ok) {
      sendRedirect(response, "/?notice=Request%20deleted");
      return;
    }
    response.writeHead(result.status, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    });
    response.end(renderCleanupFailurePage(requestId, result.reason));
    return;
  }

  const requestMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (request.method === "DELETE" && requestMatch) {
    const result = demo.cleanupRequest(decodeURIComponent(requestMatch[1]), {
      simulateFailure: url.searchParams.get("outcome") === "failure"
    });
    if (result.status === 204) {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }
    sendJson(response, result.status, result);
    return;
  }

  const externalReviewMatch = url.pathname.match(
    /^\/external\/requests\/([^/]+)\/review$/
  );
  if (request.method === "POST" && externalReviewMatch) {
    const result = demo.completeExternalReview(
      decodeURIComponent(externalReviewMatch[1])
    );
    sendJson(response, result.status, result);
    return;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/diagnostics/reconciliation"
  ) {
    sendJson(response, 503, {
      error: {
        code: "RECONCILIATION_DIVERGED",
        message: "Synthetic reconciliation failed",
        requestId: "diag-req-4001"
      },
      privateDiagnostic: {
        authorization: "Bearer DEMO-TOKEN-CANARY-8472",
        cookie: "session=DEMO-COOKIE-CANARY-5193",
        supplierTaxId: "DEMO-CLIENT-CANARY-6021"
      }
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8"
    });
    const state = demo.snapshot();
    response.end(
      state.session.authenticated
        ? renderWorkspace(state, {
            notice: url.searchParams.get("notice"),
            kind: url.searchParams.get("noticeKind")
          })
        : renderLoginPage()
    );
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

export function createDemoServer() {
  const demo = createDemoState();
  const server = http.createServer((request, response) => {
    handleRequest(request, response, demo).catch(() => {
      sendJson(response, 500, {
        error: { code: "DEMO_INTERNAL_ERROR", message: "Synthetic demo request failed" }
      });
    });
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      return `http://127.0.0.1:${address.port}`;
    },

    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createDemoServer();
  const origin = await app.listen();
  process.stdout.write(`B2B E2E demo listening on ${origin}\n`);
}
