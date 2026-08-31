import { SandboxError } from "../shared/errors.mjs";
import { emitEvent, projectBusinessAudit } from "./events.mjs";
import { matchFault, summarizeFault } from "./fault-engine.mjs";
import { authorize } from "./permissions.mjs";
import {
  invalidateAccountSessions,
  invalidateSession,
  resolveSession
} from "./sessions.mjs";

const CUSTOMER_FIELDS = new Set([
  "name",
  "email",
  "timezone",
  "status",
  "owner",
  "plan",
  "tags"
]);

function publicFailure(code, message, status = 400, extra = {}) {
  return { ok: false, status, code, message, ...extra };
}

function mutationTargetKind(profile, entity, targetId) {
  return profile.protectedRecords.includes(`${entity}:${targetId}`) ? targetId : "created";
}

function mutationAllowed(profile, draft, input) {
  const targetKind = mutationTargetKind(profile, input.entity, input.targetId);
  const allowance = profile.allowedMutations.find(
    (candidate) =>
      candidate.entity === input.entity &&
      (candidate.target === input.targetId || candidate.target === targetKind || candidate.target === "*") &&
      (candidate.field === input.field || candidate.field === "*") &&
      candidate.operation === input.operation
  );
  if (!allowance) return false;
  const priorCount = draft.oracleEvents.filter(
    (event) =>
      event.type === "state_mutation" &&
      event.entity === input.entity &&
      event.targetId === input.targetId &&
      event.operation === input.operation &&
      (String(event.field).split(",").includes(input.field) || allowance.field === "*")
  ).length;
  return priorCount < allowance.maxCount;
}

function recordDeniedMutation(draft, tools, operationContext, input) {
  emitEvent(draft, tools, {
    ...operationContext,
    type: "authorization_denial",
    entity: input.entity,
    targetId: input.targetId,
    field: input.field,
    operation: input.operation,
    outcome: "rejected-out-of-whitelist"
  });
  return publicFailure(
    "MUTATION_NOT_ALLOWED",
    "This benchmark run does not permit that mutation",
    409
  );
}

function validateCustomer(input, { partial = false } = {}) {
  const fields = {};
  if ((!partial || Object.hasOwn(input, "name")) && !String(input.name ?? "").trim()) {
    fields.name = "Customer name is required";
  }
  if (
    (!partial || Object.hasOwn(input, "email")) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email ?? ""))
  ) {
    fields.email = "Enter a valid email address";
  }
  if (Object.hasOwn(input, "tags") && !Array.isArray(input.tags)) {
    fields.tags = "Tags must be a list";
  }
  if (partial) {
    for (const key of Object.keys(input)) {
      if (!CUSTOMER_FIELDS.has(key)) fields[key] = "Field cannot be changed";
    }
  }
  return fields;
}

export function createBusinessOperations(options) {
  const { coordinator } = options;
  const sessionIdFactory = options.sessionIdFactory ?? (() => crypto.randomUUID());
  const entityIdFactory = options.entityIdFactory ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);

  async function withActor(context, specification, callback) {
    const outcome = await coordinator.transact(
      { logicalOperation: specification.logicalOperation },
      async (draft, tools) => {
        const resolved = resolveSession(draft, context?.sessionId);
        const operationContext = {
          actorId: resolved.account?.id ?? null,
          sessionId: resolved.session?.id ?? context?.sessionId ?? null,
          logicalOperation: specification.logicalOperation,
          entity: specification.entity ?? null,
          targetId: specification.targetId ?? null,
          source: specification.source ?? "business-ui"
        };
        emitEvent(draft, tools, {
          ...operationContext,
          type: "operation_attempt",
          outcome: "attempted"
        });

        const faultAt = (phase) =>
          matchFault(tools.profile.fault, operationContext, phase);
        const preAuthorizationFault = faultAt("before-authorization");
        if (preAuthorizationFault === "expire-session" && resolved.session) {
          invalidateSession(draft, resolved.session.id);
          emitEvent(draft, tools, {
            ...operationContext,
            type: "session_event",
            outcome: "expired"
          });
          return publicFailure(
            "MANUAL_LOGIN_REQUIRED",
            "Your test session expired. Ask the evaluator to sign in again.",
            401
          );
        }

        if (!resolved.session || !resolved.account) {
          return publicFailure(
            "MANUAL_LOGIN_REQUIRED",
            "Manual login is required",
            401
          );
        }
        if (!authorize(resolved.account, specification.permission)) {
          emitEvent(draft, tools, {
            ...operationContext,
            type: "authorization_denial",
            outcome: "permission-denied"
          });
          return publicFailure(
            "PERMISSION_DENIED",
            `${resolved.account.role} permission does not allow this action`,
            403
          );
        }

        faultAt("before-validation");
        const result = await callback({
          draft,
          tools,
          account: resolved.account,
          session: resolved.session,
          operationContext,
          faultAt
        });

        const responseFault = faultAt("response");
        if (responseFault === "transient-read") {
          return publicFailure(
            "TRANSIENT_READ_FAILURE",
            "The business view is temporarily unavailable",
            503
          );
        }
        return result;
      }
    );

    if (outcome?.throwAfterCommit === "RESPONSE_DISCONNECTED") {
      throw new SandboxError(
        "RESPONSE_DISCONNECTED",
        "The response disconnected after the business commit",
        {},
        504
      );
    }
    return outcome;
  }

  function recordMutation(draft, tools, operationContext, input, summary) {
    const event = emitEvent(draft, tools, {
      ...operationContext,
      type: "state_mutation",
      entity: input.entity,
      targetId: input.targetId,
      field: input.field,
      operation: input.operation,
      outcome: "committed",
      before: input.before,
      after: input.after
    });
    projectBusinessAudit(draft, event, summary);
    return event;
  }

  async function login(accountId, loginOptions = {}) {
    return coordinator.transact({ logicalOperation: "session.login" }, (draft, tools) => {
      const account = draft.accounts.find(({ id }) => id === accountId);
      if (!account) return publicFailure("ACCOUNT_NOT_FOUND", "Test account was not found", 404);
      const operationContext = {
        actorId: account.id,
        sessionId: null,
        logicalOperation: "session.login"
      };
      emitEvent(draft, tools, {
        ...operationContext,
        type: "operation_attempt",
        outcome: "attempted"
      });
      const session = {
        id: sessionIdFactory(),
        accountId,
        active: true,
        provenance: loginOptions.provenance ?? "manual-evaluator",
        createdAt: tools.now()
      };
      draft.sessions.push(session);
      emitEvent(draft, tools, {
        ...operationContext,
        sessionId: session.id,
        type: "session_event",
        outcome: "logged-in"
      });
      return { ok: true, status: 200, session: structuredClone(session), account: structuredClone(account) };
    });
  }

  async function logout(sessionId, actor = "manual-evaluator") {
    return coordinator.transact({ logicalOperation: "session.logout" }, (draft, tools) => {
      const resolved = resolveSession(draft, sessionId);
      if (!resolved.session) return publicFailure("SESSION_NOT_FOUND", "Session is not active", 404);
      invalidateSession(draft, sessionId);
      emitEvent(draft, tools, {
        type: "session_event",
        actorId: resolved.account?.id ?? actor,
        sessionId,
        logicalOperation: "session.logout",
        outcome: "logged-out"
      });
      return { ok: true, status: 200 };
    });
  }

  async function listCustomers(context, query = {}) {
    return withActor(
      context,
      {
        logicalOperation: query.source === "background-poll" ? "customer.list.background" : "customer.list",
        permission: "customer.read",
        entity: "customer",
        source: query.source
      },
      ({ draft }) => {
        let customers = [...draft.customers];
        if (query.search) {
          const needle = String(query.search).toLocaleLowerCase("en-US");
          customers = customers.filter((customer) =>
            [customer.id, customer.name, customer.email].some((value) =>
              String(value).toLocaleLowerCase("en-US").includes(needle)
            )
          );
        }
        if (query.status) customers = customers.filter(({ status }) => status === query.status);
        if (query.plan) customers = customers.filter(({ plan }) => plan === query.plan);
        const pageSize = Math.max(1, Math.min(Number(query.pageSize) || 5, 25));
        const page = Math.max(1, Number(query.page) || 1);
        const start = (page - 1) * pageSize;
        return {
          ok: true,
          status: 200,
          customers: structuredClone(customers.slice(start, start + pageSize)),
          page,
          pageSize,
          total: customers.length
        };
      }
    );
  }

  async function getCustomer(context, customerId) {
    return withActor(
      context,
      {
        logicalOperation: "customer.detail",
        permission: "customer.read",
        entity: "customer",
        targetId: customerId
      },
      ({ draft }) => {
        const customer = draft.customers.find(({ id }) => id === customerId);
        return customer
          ? { ok: true, status: 200, customer: structuredClone(customer) }
          : publicFailure("CUSTOMER_NOT_FOUND", "Customer was not found", 404);
      }
    );
  }

  async function createCustomer(context, input) {
    return withActor(
      context,
      { logicalOperation: "customer.create", permission: "customer.create", entity: "customer" },
      ({ draft, tools, account, operationContext, faultAt }) => {
        const fields = validateCustomer(input);
        if (Object.keys(fields).length > 0) {
          emitEvent(draft, tools, {
            ...operationContext,
            type: "validation_rejection",
            outcome: "rejected",
            after: fields
          });
          return publicFailure("VALIDATION_REJECTED", "Review the highlighted fields", 422, { fields });
        }
        const id = entityIdFactory("CUS");
        const customer = { id, ...structuredClone(input) };
        if (!mutationAllowed(tools.profile, draft, {
          entity: "customer", targetId: id, field: "*", operation: "create"
        })) {
          return recordDeniedMutation(draft, tools, operationContext, {
            entity: "customer", targetId: id, field: "*", operation: "create"
          });
        }
        if (faultAt("before-commit") === "success-without-persistence") {
          return { ok: true, status: 201, customer, persistence: "suppressed-by-profile" };
        }
        draft.customers.push(customer);
        recordMutation(draft, tools, operationContext, {
          entity: "customer", targetId: id, field: "*", operation: "create",
          before: null, after: customer
        }, `${account.displayName} created customer ${id}`);
        const disconnect = faultAt("after-commit-before-response") === "commit-then-disconnect";
        return {
          ok: true,
          status: 201,
          customer: structuredClone(customer),
          ...(disconnect ? { throwAfterCommit: "RESPONSE_DISCONNECTED" } : {})
        };
      }
    );
  }

  async function updateCustomer(context, customerId, patch) {
    return withActor(
      context,
      { logicalOperation: "customer.update", permission: "customer.update", entity: "customer", targetId: customerId },
      ({ draft, tools, account, operationContext, faultAt }) => {
        const customer = draft.customers.find(({ id }) => id === customerId);
        if (!customer) return publicFailure("CUSTOMER_NOT_FOUND", "Customer was not found", 404);
        const fields = validateCustomer(patch, { partial: true });
        if (Object.keys(fields).length > 0 || Object.keys(patch).length === 0) {
          if (Object.keys(patch).length === 0) fields.form = "At least one field must change";
          emitEvent(draft, tools, {
            ...operationContext,
            type: "validation_rejection",
            outcome: "rejected",
            after: fields
          });
          return publicFailure("VALIDATION_REJECTED", "Review the highlighted fields", 422, { fields });
        }
        for (const field of Object.keys(patch)) {
          if (!mutationAllowed(tools.profile, draft, {
            entity: "customer", targetId: customerId, field, operation: "update"
          })) {
            return recordDeniedMutation(draft, tools, operationContext, {
              entity: "customer", targetId: customerId, field, operation: "update"
            });
          }
        }
        const before = structuredClone(customer);
        const after = { ...customer, ...structuredClone(patch) };
        if (faultAt("before-commit") === "success-without-persistence") {
          return { ok: true, status: 200, customer: after, persistence: "suppressed-by-profile" };
        }
        Object.assign(customer, patch);
        recordMutation(draft, tools, operationContext, {
          entity: "customer", targetId: customerId, field: Object.keys(patch).sort().join(","),
          operation: "update", before, after: customer
        }, `${account.displayName} updated customer ${customerId}`);
        return { ok: true, status: 200, customer: structuredClone(customer) };
      }
    );
  }

  async function deleteCustomer(context, customerId) {
    return withActor(
      context,
      { logicalOperation: "customer.delete", permission: "customer.delete", entity: "customer", targetId: customerId },
      ({ draft, tools, account, operationContext, faultAt }) => {
        const index = draft.customers.findIndex(({ id }) => id === customerId);
        if (index < 0) return publicFailure("CUSTOMER_NOT_FOUND", "Customer was not found", 404);
        if (faultAt("before-commit") === "cleanup-conflict") {
          return publicFailure("CLEANUP_CONFLICT", "The run-scoped customer remains because cleanup conflicted", 409, {
            residualId: customerId
          });
        }
        if (!mutationAllowed(tools.profile, draft, {
          entity: "customer", targetId: customerId, field: "*", operation: "delete"
        })) {
          return recordDeniedMutation(draft, tools, operationContext, {
            entity: "customer", targetId: customerId, field: "*", operation: "delete"
          });
        }
        const [removed] = draft.customers.splice(index, 1);
        recordMutation(draft, tools, operationContext, {
          entity: "customer", targetId: customerId, field: "*", operation: "delete",
          before: removed, after: null
        }, `${account.displayName} deleted customer ${customerId}`);
        return { ok: true, status: 200, deletedId: customerId };
      }
    );
  }

  async function listProjects(context, query = {}) {
    return withActor(
      context,
      {
        logicalOperation: query.source === "background-poll" ? "project.list.background" : "project.list",
        permission: "project.read",
        entity: "project",
        source: query.source
      },
      ({ draft }) => ({ ok: true, status: 200, projects: structuredClone(draft.projects) })
    );
  }

  async function getProject(context, projectId) {
    return withActor(
      context,
      {
        logicalOperation: "project.detail",
        permission: "project.read",
        entity: "project",
        targetId: projectId
      },
      ({ draft }) => {
        const project = draft.projects.find(({ id }) => id === projectId);
        return project
          ? { ok: true, status: 200, project: structuredClone(project) }
          : publicFailure("PROJECT_NOT_FOUND", "Project was not found", 404);
      }
    );
  }

  async function changeProjectStatus(context, projectId, status) {
    return withActor(
      context,
      {
        logicalOperation: "project.status.update",
        permission: "project.status.update",
        entity: "project",
        targetId: projectId
      },
      ({ draft, tools, account, operationContext, faultAt }) => {
        const project = draft.projects.find(({ id }) => id === projectId);
        if (!project) return publicFailure("PROJECT_NOT_FOUND", "Project was not found", 404);
        if (!new Set(["Active", "Inactive", "Processing"]).has(status)) {
          emitEvent(draft, tools, {
            ...operationContext,
            type: "validation_rejection",
            outcome: "rejected",
            after: { status: "Choose Active or Inactive" }
          });
          return publicFailure("VALIDATION_REJECTED", "Choose a valid project status", 422);
        }
        if (!mutationAllowed(tools.profile, draft, {
          entity: "project", targetId: projectId, field: "status", operation: "update"
        })) {
          return recordDeniedMutation(draft, tools, operationContext, {
            entity: "project", targetId: projectId, field: "status", operation: "update"
          });
        }
        const preCommitFault = faultAt("before-commit");
        if (preCommitFault === "application-failure-with-canary") {
          return publicFailure("APPLICATION_FAILURE", "Project status could not be saved", 500, {
            privateDiagnostic: tools.profile.fault.diagnostic
          });
        }
        const before = structuredClone(project);
        if (preCommitFault === "delayed-completion") {
          project.status = "Processing";
          draft.delayedJobs.push({
            id: `JOB-${projectId}`,
            kind: "project-activation",
            projectId,
            finalStatus: status,
            runId: tools.runId,
            epoch: tools.epoch
          });
        } else {
          project.status = status;
        }
        recordMutation(draft, tools, operationContext, {
          entity: "project", targetId: projectId, field: "status", operation: "update",
          before, after: project
        }, `${account.displayName} changed project ${projectId} to ${project.status}`);
        const disconnect = faultAt("after-commit-before-response") === "commit-then-disconnect";
        return {
          ok: true,
          status: 200,
          project: structuredClone(project),
          ...(disconnect ? { throwAfterCommit: "RESPONSE_DISCONNECTED" } : {})
        };
      }
    );
  }

  async function submitApproval(context, input) {
    return withActor(
      context,
      { logicalOperation: "approval.submit", permission: "approval.submit", entity: "approval" },
      ({ draft, tools, account, operationContext }) => {
        const targetCollection = input.targetType === "project" ? draft.projects : draft.customers;
        if (!targetCollection.some(({ id }) => id === input.targetId)) {
          return publicFailure("APPROVAL_TARGET_NOT_FOUND", "Approval target was not found", 404);
        }
        const id = entityIdFactory("APR");
        if (!mutationAllowed(tools.profile, draft, {
          entity: "approval", targetId: id, field: "*", operation: "create"
        })) {
          return recordDeniedMutation(draft, tools, operationContext, {
            entity: "approval", targetId: id, field: "*", operation: "create"
          });
        }
        const approval = {
          id,
          requesterId: account.id,
          requiredRole: "Approver",
          targetType: input.targetType,
          targetId: input.targetId,
          requestedAction: input.action,
          status: "Pending",
          decisionBy: null,
          decidedAt: null
        };
        draft.approvals.push(approval);
        const mutation = recordMutation(draft, tools, operationContext, {
          entity: "approval", targetId: id, field: "*", operation: "create",
          before: null, after: approval
        }, `${account.displayName} submitted approval ${id}`);
        const idempotencyKey = `${tools.runId}:${id}:submitted`;
        const outbox = {
          id: `OUT-${String(draft.outbox.length + 1).padStart(6, "0")}`,
          runId: tools.runId,
          approvalId: id,
          recipientRole: "Approver",
          eventSequence: mutation.eventSequence + 1,
          idempotencyKey,
          createdAt: tools.now()
        };
        if (!draft.outbox.some((entry) => entry.idempotencyKey === idempotencyKey)) {
          draft.outbox.push(outbox);
          emitEvent(draft, tools, {
            ...operationContext,
            type: "notification_enqueued",
            targetId: id,
            outcome: "queued",
            correlationKey: idempotencyKey
          });
        }
        return { ok: true, status: 201, approval: structuredClone(approval) };
      }
    );
  }

  async function decideApproval(context, approvalId, decision) {
    return withActor(
      context,
      { logicalOperation: "approval.decide", permission: "approval.decide", entity: "approval", targetId: approvalId },
      ({ draft, tools, account, operationContext }) => {
        const approval = draft.approvals.find(({ id }) => id === approvalId);
        if (!approval) return publicFailure("APPROVAL_NOT_FOUND", "Approval was not found", 404);
        if (approval.status !== "Pending") return publicFailure("ALREADY_DECIDED", "Approval already has a decision", 409);
        if (!new Set(["Approved", "Rejected"]).has(decision)) {
          return publicFailure("VALIDATION_REJECTED", "Choose Approved or Rejected", 422);
        }
        if (!mutationAllowed(tools.profile, draft, {
          entity: "approval", targetId: approvalId, field: "status", operation: "update"
        })) {
          return recordDeniedMutation(draft, tools, operationContext, {
            entity: "approval", targetId: approvalId, field: "status", operation: "update"
          });
        }
        const before = structuredClone(approval);
        approval.status = decision;
        approval.decisionBy = account.id;
        approval.decidedAt = tools.now();
        recordMutation(draft, tools, operationContext, {
          entity: "approval", targetId: approvalId, field: "status", operation: "update",
          before, after: approval
        }, `${account.displayName} ${decision.toLowerCase()} approval ${approvalId}`);
        return { ok: true, status: 200, approval: structuredClone(approval) };
      }
    );
  }

  async function readBusinessAudit(context) {
    return withActor(
      context,
      { logicalOperation: "business-audit.read", permission: "business-audit.read", entity: "business-audit" },
      ({ draft, account }) => ({
        ok: true,
        status: 200,
        events: structuredClone(
          account.role === "Viewer" ? draft.businessAudit.slice(-10) : draft.businessAudit.slice(-50)
        )
      })
    );
  }

  async function listApprovals(context) {
    return withActor(
      context,
      { logicalOperation: "approval.list", permission: "approval.read", entity: "approval" },
      ({ draft }) => ({
        ok: true,
        status: 200,
        approvals: structuredClone(draft.approvals)
      })
    );
  }

  async function getSessionContext(context) {
    return coordinator.transact({ logicalOperation: "session.current" }, (draft, tools) => {
      const resolved = resolveSession(draft, context?.sessionId);
      if (!resolved.session || !resolved.account) {
        return publicFailure("MANUAL_LOGIN_REQUIRED", "Manual login is required", 401);
      }
      emitEvent(draft, tools, {
        type: "operation_attempt",
        actorId: resolved.account.id,
        sessionId: resolved.session.id,
        logicalOperation: "session.current",
        outcome: "observed"
      });
      return {
        ok: true,
        status: 200,
        session: structuredClone(resolved.session),
        account: structuredClone(resolved.account)
      };
    });
  }

  async function changeAccountRole(accountId, role, actor = "evaluator") {
    return coordinator.transact({ logicalOperation: "session.role.change" }, (draft, tools) => {
      const account = draft.accounts.find(({ id }) => id === accountId);
      if (!account) return publicFailure("ACCOUNT_NOT_FOUND", "Test account was not found", 404);
      const before = account.role;
      account.role = role;
      emitEvent(draft, tools, {
        type: "session_event",
        actorId: actor,
        logicalOperation: "session.role.change",
        entity: "account",
        targetId: accountId,
        outcome: "role-changed",
        before,
        after: role
      });
      return { ok: true, status: 200, account: structuredClone(account) };
    });
  }

  async function expireSession(sessionId, actor = "evaluator") {
    return coordinator.transact({ logicalOperation: "session.expire" }, (draft, tools) => {
      const session = invalidateSession(draft, sessionId);
      if (!session) return publicFailure("SESSION_NOT_FOUND", "Session is not active", 404);
      emitEvent(draft, tools, {
        type: "session_event",
        actorId: actor,
        sessionId,
        logicalOperation: "session.expire",
        outcome: "expired"
      });
      return { ok: true, status: 200 };
    });
  }

  async function switchAccount(currentSessionId, nextAccountId) {
    await logout(currentSessionId);
    return login(nextAccountId, { provenance: "manual-evaluator" });
  }

  async function completeExternalAction(input) {
    return coordinator.transact({ logicalOperation: "approval.external-decision" }, (draft, tools) => {
      const operationContext = {
        actorId: input.actor,
        sessionId: null,
        logicalOperation: "approval.external-decision",
        entity: "approval",
        targetId: input.approvalId
      };
      emitEvent(draft, tools, {
        ...operationContext,
        type: "operation_attempt",
        outcome: "attempted"
      });
      const approval = draft.approvals.find(({ id }) => id === input.approvalId);
      if (!approval) return publicFailure("APPROVAL_NOT_FOUND", "Approval was not found", 404);
      if (approval.status !== "Pending") return publicFailure("ALREADY_DECIDED", "Approval already has a decision", 409);
      if (!mutationAllowed(tools.profile, draft, {
        entity: "approval", targetId: approval.id, field: "status", operation: "update"
      })) {
        return recordDeniedMutation(draft, tools, {
          ...operationContext
        }, {
          entity: "approval", targetId: approval.id, field: "status", operation: "update"
        });
      }
      const before = structuredClone(approval);
      approval.status = input.decision;
      approval.decisionBy = input.actor;
      approval.decidedAt = tools.now();
      emitEvent(draft, tools, {
        ...operationContext,
        type: "external_action",
        outcome: "completed",
        before,
        after: approval
      });
      recordMutation(draft, tools, operationContext, {
        entity: "approval", targetId: approval.id, field: "status", operation: "update",
        before, after: approval
      }, `${input.actor} completed approval ${approval.id}`);
      return { ok: true, status: 200, approval: structuredClone(approval) };
    });
  }

  async function runDueJobs(actor = "deterministic-worker") {
    return coordinator.transact({ logicalOperation: "worker.run" }, (draft, tools) => {
      const completed = [];
      for (const job of draft.delayedJobs.splice(0)) {
        if (job.runId !== tools.runId || job.epoch !== tools.epoch) continue;
        const project = draft.projects.find(({ id }) => id === job.projectId);
        if (!project) continue;
        const before = structuredClone(project);
        project.status = job.finalStatus;
        const context = {
          actorId: actor,
          sessionId: null,
          logicalOperation: "project.async-complete",
          entity: "project",
          targetId: project.id
        };
        emitEvent(draft, tools, {
          ...context,
          type: "external_action",
          outcome: "completed",
          before,
          after: project
        });
        recordMutation(draft, tools, context, {
          entity: "project", targetId: project.id, field: "status", operation: "update",
          before, after: project
        }, `${actor} completed project ${project.id}`);
        completed.push(project.id);
      }
      return { ok: true, status: 200, completed };
    });
  }

  return Object.freeze({
    login,
    logout,
    switchAccount,
    getSessionContext,
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    listProjects,
    getProject,
    changeProjectStatus,
    submitApproval,
    decideApproval,
    listApprovals,
    readBusinessAudit,
    changeAccountRole,
    expireSession,
    completeExternalAction,
    runDueJobs,
    faultStatus() {
      return summarizeFault(coordinator.status().fault);
    },
    invalidateAccountSessions(accountId) {
      return coordinator.transact({ logicalOperation: "session.account.invalidate" }, (draft, tools) => {
        const invalidated = invalidateAccountSessions(draft, accountId);
        for (const sessionId of invalidated) {
          emitEvent(draft, tools, {
            type: "session_event",
            actorId: "evaluator",
            sessionId,
            logicalOperation: "session.account.invalidate",
            outcome: "invalidated"
          });
        }
        return { ok: true, status: 200, invalidated };
      });
    }
  });
}
