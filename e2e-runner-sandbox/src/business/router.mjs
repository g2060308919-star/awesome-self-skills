import { readFile } from "node:fs/promises";

import { SandboxError } from "../shared/errors.mjs";
import { assertSameOrigin, readForm } from "./input.mjs";
import {
  clearSessionCookie,
  createSessionCookie,
  readSessionCookie
} from "./session-cookies.mjs";
import { renderApprovals } from "./views/approvals.mjs";
import { renderAudit } from "./views/audit.mjs";
import {
  renderCustomerDetail,
  renderCustomerForm,
  renderCustomerList
} from "./views/customers.mjs";
import { renderDashboardContent } from "./views/dashboard.mjs";
import { renderLogin } from "./views/login.mjs";
import { renderProjectDetail, renderProjectExport, renderProjectList } from "./views/projects.mjs";
import { renderStandalone, renderWorkspace } from "./views/shell.mjs";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function send(response, status, contentType, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": contentType,
    ...extraHeaders
  });
  response.end(body);
}

function sendHtml(response, status, html, headers = {}) {
  send(response, status, "text/html; charset=utf-8", html, headers);
}

function sendJson(response, status, body) {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function redirect(response, location, headers = {}) {
  response.writeHead(303, {
    ...SECURITY_HEADERS,
    location,
    ...headers
  });
  response.end();
}

function canMutate(account) {
  return account.role === "Operator" || account.role === "Administrator";
}

function customerInput(form) {
  return {
    name: form.name ?? "",
    email: form.email ?? "",
    timezone: form.timezone ?? "UTC",
    status: form.status ?? "Active",
    owner: form.owner ?? "",
    plan: form.plan ?? "Core",
    tags: String(form.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

function changedCustomerFields(current, submitted) {
  return Object.fromEntries(Object.entries(submitted).filter(([field, value]) => {
    const prior = current[field];
    return Array.isArray(value)
      ? JSON.stringify(value) !== JSON.stringify(prior)
      : value !== prior;
  }));
}

export function createBusinessRouter({ coordinator, operations, loginRateLimit }) {
  const assets = new Map([
    ["/assets/app.mjs", [new URL("../../public/app.mjs", import.meta.url), "text/javascript; charset=utf-8"]],
    ["/assets/styles.css", [new URL("../../public/styles.css", import.meta.url), "text/css; charset=utf-8"]],
    ["/favicon.ico", [new URL("../../public/favicon.svg", import.meta.url), "image/svg+xml"]]
  ]);

  async function identity(request) {
    const sessionId = readSessionCookie(request);
    if (!sessionId) return null;
    const result = await operations.getSessionContext({ sessionId });
    return result.ok ? { sessionId, account: result.account } : null;
  }

  function workspace(response, identityValue, title, activeSection, content, options = {}) {
    sendHtml(response, options.status ?? 200, renderWorkspace({
      title,
      account: identityValue.account,
      variant: coordinator.status().uiVariant,
      activeSection,
      content,
      notice: options.notice,
      noticeKind: options.noticeKind
    }));
  }

  return async function route(request, response) {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url, origin);

    if (request.method === "GET" && assets.has(url.pathname)) {
      const [path, contentType] = assets.get(url.pathname);
      send(response, 200, contentType, await readFile(path));
      return;
    }

    if (request.method === "POST") assertSameOrigin(request, origin);

    if (request.method === "GET" && url.pathname === "/") {
      const current = await identity(request);
      if (current) return redirect(response, "/dashboard");
      sendHtml(response, 200, renderLogin(coordinator.read().accounts));
      return;
    }

    if (request.method === "POST" && url.pathname === "/login") {
      if (!loginRateLimit(request.socket.remoteAddress ?? "unknown")) {
        sendHtml(response, 429, renderLogin(coordinator.read().accounts, "Too many login attempts. Wait one minute and try again."));
        return;
      }
      const form = await readForm(request);
      const result = await operations.login(form.accountId, { provenance: "manual-evaluator" });
      if (!result.ok) {
        sendHtml(response, result.status, renderLogin(coordinator.read().accounts, result.message));
        return;
      }
      redirect(response, "/dashboard", { "set-cookie": createSessionCookie(result.session.id) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/logout") {
      const sessionId = readSessionCookie(request);
      if (sessionId) await operations.logout(sessionId);
      redirect(response, "/", { "set-cookie": clearSessionCookie() });
      return;
    }

    const protectedBusinessPath =
      url.pathname === "/dashboard" ||
      url.pathname === "/customers" ||
      url.pathname.startsWith("/customers/") ||
      url.pathname === "/projects" ||
      url.pathname.startsWith("/projects/") ||
      url.pathname === "/approvals" ||
      url.pathname.startsWith("/approvals/") ||
      url.pathname === "/audit";
    if (!protectedBusinessPath) {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Page not found" } });
      return;
    }

    const current = await identity(request);
    if (!current) {
      redirect(response, "/");
      return;
    }
    const context = { sessionId: current.sessionId };

    if (request.method === "GET" && url.pathname === "/dashboard") {
      workspace(response, current, "Dashboard", "dashboard", renderDashboardContent(coordinator.read()));
      return;
    }

    if (request.method === "GET" && url.pathname === "/customers") {
      const query = {
        search: url.searchParams.get("search") ?? "",
        status: url.searchParams.get("status") ?? "",
        plan: url.searchParams.get("plan") ?? "",
        page: Number(url.searchParams.get("page") ?? 1),
        pageSize: 5
      };
      const result = await operations.listCustomers(context, query);
      workspace(response, current, "Customers", "customers", renderCustomerList(
        result, query, coordinator.status().uiVariant, canMutate(current.account)
      ));
      return;
    }

    if (request.method === "GET" && url.pathname === "/customers/new") {
      if (!canMutate(current.account)) throw new SandboxError("PERMISSION_DENIED", "This role cannot create customers", {}, 403);
      workspace(response, current, "Create customer", "customers", renderCustomerForm({}));
      return;
    }

    if (request.method === "POST" && url.pathname === "/customers") {
      const input = customerInput(await readForm(request));
      const result = await operations.createCustomer(context, input);
      if (!result.ok) {
        workspace(response, current, "Create customer", "customers", renderCustomerForm({ customer: input, errors: result.fields ?? {} }), { status: result.status });
        return;
      }
      redirect(response, `/customers/${encodeURIComponent(result.customer.id)}?notice=Customer%20created`);
      return;
    }

    const customerEdit = url.pathname.match(/^\/customers\/([^/]+)\/edit$/);
    if (customerEdit && request.method === "GET") {
      const result = await operations.getCustomer(context, decodeURIComponent(customerEdit[1]));
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      workspace(response, current, "Edit customer", "customers", renderCustomerForm({ customer: result.customer, mode: "edit" }));
      return;
    }
    if (customerEdit && request.method === "POST") {
      const id = decodeURIComponent(customerEdit[1]);
      const input = customerInput(await readForm(request));
      const currentCustomer = await operations.getCustomer(context, id);
      if (!currentCustomer.ok) throw new SandboxError(currentCustomer.code, currentCustomer.message, {}, currentCustomer.status);
      const result = await operations.updateCustomer(context, id, changedCustomerFields(currentCustomer.customer, input));
      if (!result.ok) {
        workspace(response, current, "Edit customer", "customers", renderCustomerForm({ customer: { id, ...input }, errors: result.fields ?? {}, mode: "edit" }), { status: result.status });
        return;
      }
      redirect(response, `/customers/${encodeURIComponent(id)}?notice=Customer%20saved`);
      return;
    }

    const customerDelete = url.pathname.match(/^\/customers\/([^/]+)\/delete$/);
    if (customerDelete && request.method === "POST") {
      const id = decodeURIComponent(customerDelete[1]);
      const result = await operations.deleteCustomer(context, id);
      if (!result.ok) {
        const currentCustomer = coordinator.read().customers.find((customer) => customer.id === id);
        if (!currentCustomer) throw new SandboxError(result.code, result.message, {}, result.status);
        workspace(response, current, currentCustomer.name, "customers", renderCustomerDetail(
          currentCustomer,
          canMutate(current.account),
          { kind: "alert", message: `${result.message}. Residual record: ${result.residualId ?? id}` }
        ), { status: result.status });
        return;
      }
      redirect(response, "/customers?notice=Customer%20deleted");
      return;
    }

    const customerDetail = url.pathname.match(/^\/customers\/([^/]+)$/);
    if (customerDetail && request.method === "GET") {
      const result = await operations.getCustomer(context, decodeURIComponent(customerDetail[1]));
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      workspace(response, current, result.customer.name, "customers", renderCustomerDetail(result.customer, canMutate(current.account)), {
        notice: url.searchParams.get("notice")
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/projects") {
      const result = await operations.listProjects(context);
      workspace(response, current, "Projects", "projects", renderProjectList(result.projects));
      return;
    }

    const projectStatus = url.pathname.match(/^\/projects\/([^/]+)\/status$/);
    if (projectStatus && request.method === "POST") {
      const form = await readForm(request);
      const id = decodeURIComponent(projectStatus[1]);
      try {
        const result = await operations.changeProjectStatus(context, id, form.status);
        if (!result.ok) {
          const project = coordinator.read().projects.find((candidate) => candidate.id === id);
          workspace(response, current, project.name, "projects", renderProjectDetail(project, canMutate(current.account), {
            kind: "alert",
            message: result.message,
            diagnostic: result.privateDiagnostic,
            exportSummary: coordinator.read().featureFlags?.exportSummary === true
          }), { status: result.status });
          return;
        }
        redirect(response, `/projects/${encodeURIComponent(id)}?notice=${encodeURIComponent(`Project is ${result.project.status}`)}`);
      } catch (error) {
        if (error.code === "RESPONSE_DISCONNECTED") {
          sendHtml(response, 504, renderStandalone({ title: "Outcome unknown", content: '<main id="main-content" class="message-page"><h1>Outcome unknown</h1><p role="alert">The response ended before the result could be confirmed.</p><a href="/projects">Re-observe project state</a></main>' }));
          return;
        }
        throw error;
      }
      return;
    }

    const projectDescription = url.pathname.match(/^\/projects\/([^/]+)\/description$/);
    if (projectDescription && request.method === "POST") {
      const id = decodeURIComponent(projectDescription[1]);
      const form = await readForm(request);
      const result = await operations.updateProjectDescription(context, id, form.description);
      if (result.code === "MANUAL_LOGIN_REQUIRED") {
        redirect(response, "/", { "set-cookie": clearSessionCookie() });
        return;
      }
      if (!result.ok) {
        const project = coordinator.read().projects.find((candidate) => candidate.id === id);
        workspace(response, current, project.name, "projects", renderProjectDetail(project, canMutate(current.account), {
          kind: "alert", message: result.message,
          exportSummary: coordinator.read().featureFlags?.exportSummary === true
        }), { status: result.status });
        return;
      }
      redirect(response, `/projects/${encodeURIComponent(id)}?notice=Project%20description%20saved`);
      return;
    }

    const projectExport = url.pathname.match(/^\/projects\/([^/]+)\/export$/);
    if (projectExport && request.method === "GET") {
      if (coordinator.read().featureFlags?.exportSummary !== true) {
        sendJson(response, 404, { error: { code: "FEATURE_UNAVAILABLE", message: "Export summary is unavailable" } });
        return;
      }
      const result = await operations.getProject(context, decodeURIComponent(projectExport[1]));
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      workspace(response, current, "Export project summary", "projects", renderProjectExport(result.project));
      return;
    }

    const projectDetail = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (projectDetail && request.method === "GET") {
      const result = await operations.getProject(context, decodeURIComponent(projectDetail[1]));
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      workspace(response, current, result.project.name, "projects", renderProjectDetail(result.project, canMutate(current.account), {
        kind: "status",
        message: url.searchParams.get("notice"),
        exportSummary: coordinator.read().featureFlags?.exportSummary === true
      }), { notice: null });
      return;
    }

    if (request.method === "GET" && url.pathname === "/approvals") {
      const result = await operations.listApprovals(context);
      workspace(response, current, "Approvals", "approvals", renderApprovals(result.approvals, current.account));
      return;
    }
    if (request.method === "POST" && url.pathname === "/approvals") {
      const form = await readForm(request);
      const result = await operations.submitApproval(context, {
        targetType: "project",
        targetId: form.targetId,
        action: form.action
      });
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      redirect(response, "/approvals?notice=Approval%20submitted");
      return;
    }

    const approvalDecision = url.pathname.match(/^\/approvals\/([^/]+)\/decision$/);
    if (approvalDecision && request.method === "POST") {
      const form = await readForm(request);
      const result = await operations.decideApproval(context, decodeURIComponent(approvalDecision[1]), form.decision);
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      redirect(response, "/approvals?notice=Decision%20recorded");
      return;
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      const result = await operations.readBusinessAudit(context);
      if (!result.ok) throw new SandboxError(result.code, result.message, {}, result.status);
      workspace(response, current, "Business audit", "audit", renderAudit(result.events));
      return;
    }

    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Page not found" } });
  };
}

export function sendBusinessError(response, error) {
  const status = Number.isInteger(error.httpStatus) ? error.httpStatus : 500;
  const code = error.code ?? "BUSINESS_INTERNAL_ERROR";
  const message = status >= 500 ? "The synthetic workspace could not complete the request" : error.message;
  sendJson(response, status, { error: { code, message } });
}
