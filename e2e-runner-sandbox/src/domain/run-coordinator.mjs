import { randomBytes, randomUUID } from "node:crypto";

import { createCanary } from "../shared/canary.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { normalizeFixture } from "./fixtures.mjs";
import { createLogicalClock } from "./logical-clock.mjs";
import { createSnapshot, diffSnapshots } from "./snapshot.mjs";

function unavailable(lifecycle) {
  return new SandboxError(
    "SANDBOX_UNAVAILABLE",
    "Sandbox is not accepting business operations",
    { lifecycle },
    503
  );
}

export function createRunCoordinator(options = {}) {
  const clock = options.clock ?? createLogicalClock("2026-08-31T00:00:00.000Z");
  const runIdFactory = options.runIdFactory ?? randomUUID;
  const canaryFactory = options.canaryFactory ?? ((prefix) => createCanary(prefix, randomBytes));
  let lifecycle = "empty";
  let acceptingBusinessRequests = false;
  let runId = null;
  let epoch = 0;
  let revision = 0;
  let state = null;
  let metadata = null;
  let preSnapshot = null;
  let businessRequests = [];
  let businessRequestSequence = 0;
  let abortController = new AbortController();
  let commitQueue = Promise.resolve();
  let lastResetOperation = null;

  function publicRun() {
    return {
      runId,
      epoch,
      revision,
      lifecycle,
      acceptingBusinessRequests,
      profileId: metadata?.profileId ?? null,
      fixtureVersion: metadata?.fixtureVersion ?? null,
      uiVariant: metadata?.uiVariant ?? null,
      fault: metadata?.fault ? {
        id: metadata.fault.id,
        armed: true,
        triggered: metadata.fault.triggered ?? 0,
        consumed: Boolean(metadata.fault.consumed)
      } : null,
      preSnapshot: preSnapshot ? structuredClone(preSnapshot) : null
    };
  }

  function enqueueCommit(action) {
    const pending = commitQueue.then(action, action);
    commitQueue = pending.catch(() => undefined);
    return pending;
  }

  function resetOperationFor(profile, input) {
    if (!input?.operationId) return null;
    if (typeof input.operationId !== "string" || !input.operationId ||
      typeof input.expectedRunId !== "string" || !input.expectedRunId ||
      !Number.isInteger(input.expectedEpoch) || input.expectedEpoch < 0) {
      throw new SandboxError("RESET_INTENT_INVALID", "Reset intent is incomplete", {}, 400);
    }
    return {
      operationId: input.operationId,
      expectedRunId: input.expectedRunId,
      expectedEpoch: input.expectedEpoch,
      profileId: profile.profileId
    };
  }

  function sameResetOperation(left, right) {
    return left.operationId === right.operationId &&
      left.expectedRunId === right.expectedRunId &&
      left.expectedEpoch === right.expectedEpoch &&
      left.profileId === right.profileId;
  }

  async function install(profile, mode, resetOperation = null) {
    if (lifecycle === "failed-reset" && mode !== "recovering") {
      throw unavailable(lifecycle);
    }
    if (mode === "preparing" && lifecycle !== "empty" && lifecycle !== "aborted") {
      throw new SandboxError("RUN_ALREADY_ACTIVE", "A run is already installed", {}, 409);
    }
    if (mode === "resetting" && lifecycle !== "active") throw unavailable(lifecycle);
    if (mode === "recovering" && lifecycle !== "failed-reset") {
      throw new SandboxError("RECOVERY_NOT_REQUIRED", "Sandbox is not in failed-reset state", {}, 409);
    }

    acceptingBusinessRequests = false;
    lifecycle = mode;
    abortController.abort();
    abortController = new AbortController();
    const nextRunId = runIdFactory();
    const nextEpoch = epoch + 1;
    if (resetOperation) lastResetOperation = { ...resetOperation, outcome: "in-progress" };
    else if (mode !== "recovering") lastResetOperation = null;

    try {
      const candidate = normalizeFixture(profile, nextRunId);
      candidate.metadata.canaries = [
        canaryFactory("BENCH_SECRET"),
        canaryFactory("BENCH_SENSITIVE")
      ];
      if (candidate.metadata.fault?.diagnosticCanary === "secret") {
        candidate.metadata.fault.diagnostic = candidate.metadata.canaries[0].token;
      }
      const candidateSnapshot = createSnapshot(candidate.state);
      clock.reset();
      state = candidate.state;
      metadata = candidate.metadata;
      runId = nextRunId;
      epoch = nextEpoch;
      revision = 0;
      preSnapshot = candidateSnapshot;
      businessRequests = [];
      businessRequestSequence = 0;
      lifecycle = "active";
      acceptingBusinessRequests = true;
      if (resetOperation) {
        lastResetOperation = {
          ...resetOperation,
          outcome: "succeeded",
          resultRunId: runId,
          resultEpoch: epoch
        };
      }
      return publicRun();
    } catch (error) {
      state = null;
      metadata = null;
      runId = null;
      revision = 0;
      preSnapshot = null;
      businessRequests = [];
      businessRequestSequence = 0;
      lifecycle = "failed-reset";
      acceptingBusinessRequests = false;
      if (resetOperation) lastResetOperation = { ...resetOperation, outcome: "failed" };
      throw new SandboxError(
        "RESET_FAILED",
        "Sandbox fixture installation failed",
        { causeCode: error.code ?? "UNKNOWN" },
        503
      );
    }
  }

  return Object.freeze({
    prepare(profile) {
      return install(profile, "preparing");
    },

    reset(profile, input = null) {
      const operation = resetOperationFor(profile, input);
      if (!operation) return install(profile, "resetting");
      if (lastResetOperation?.operationId === operation.operationId) {
        if (!sameResetOperation(lastResetOperation, operation)) {
          throw new SandboxError("RESET_INTENT_MISMATCH", "Repeated reset intent changed its binding", {}, 409);
        }
        if (lastResetOperation.outcome === "succeeded") {
          if (lifecycle !== "active" || runId !== lastResetOperation.resultRunId ||
            epoch !== lastResetOperation.resultEpoch) {
            throw new SandboxError("RESET_INTENT_MISMATCH", "Completed reset no longer matches the active Sandbox", {}, 409);
          }
          return Promise.resolve(publicRun());
        }
        if (lastResetOperation.outcome === "failed" && lifecycle === "failed-reset") {
          return install(profile, "recovering", operation);
        }
        throw new SandboxError("RESET_INTENT_MISMATCH", "Reset intent is not safely repeatable", {}, 409);
      }
      if (lifecycle !== "active" || runId !== operation.expectedRunId || epoch !== operation.expectedEpoch) {
        throw new SandboxError("RESET_INTENT_MISMATCH", "Reset intent does not match the active Sandbox", {}, 409);
      }
      return install(profile, "resetting", operation);
    },

    recoverPrepare(profile) {
      return install(profile, "recovering");
    },

    status() {
      return publicRun();
    },

    read() {
      if (lifecycle !== "active" || !state) throw unavailable(lifecycle);
      return structuredClone(state);
    },

    snapshot() {
      if (lifecycle !== "active" || !state) throw unavailable(lifecycle);
      return createSnapshot(state);
    },

    diff() {
      if (lifecycle !== "active" || !state || !preSnapshot) throw unavailable(lifecycle);
      return diffSnapshots(preSnapshot, createSnapshot(state));
    },

    oracleRegistry() {
      if (lifecycle !== "active" || !metadata) throw unavailable(lifecycle);
      return { canaries: structuredClone(metadata.canaries) };
    },

    beginBusinessRequest() {
      if (lifecycle !== "active" || !runId) return null;
      businessRequestSequence += 1;
      return Object.freeze({ runId, epoch, requestSequence: businessRequestSequence });
    },

    completeBusinessRequest(ticket, summary) {
      if (!ticket || lifecycle !== "active" || ticket.runId !== runId || ticket.epoch !== epoch) {
        return false;
      }
      if (!Number.isInteger(summary.status) || typeof summary.method !== "string" ||
        typeof summary.route !== "string" || !/^sha256:[a-f0-9]{64}$/.test(summary.resultDigest) ||
        !Number.isFinite(summary.startedAtMs) || !Number.isFinite(summary.endedAtMs) ||
        summary.endedAtMs < summary.startedAtMs) {
        throw new SandboxError("BUSINESS_REQUEST_TRACE_INVALID", "Business request summary is invalid");
      }
      businessRequests.push({
        requestId: `REQ-${String(ticket.requestSequence).padStart(6, "0")}`,
        requestSequence: ticket.requestSequence,
        runId: ticket.runId,
        method: summary.method,
        route: summary.route,
        status: summary.status,
        startedAtMs: summary.startedAtMs,
        endedAtMs: summary.endedAtMs,
        timestampMs: summary.endedAtMs,
        resultDigest: summary.resultDigest
      });
      return true;
    },

    businessRequestTrace() {
      if (lifecycle !== "active") throw unavailable(lifecycle);
      return structuredClone(businessRequests).sort(
        (left, right) => left.requestSequence - right.requestSequence
      );
    },

    async transact(context, operation) {
      if (!acceptingBusinessRequests || lifecycle !== "active" || !state) {
        throw unavailable(lifecycle);
      }
      if (context?.runId && context.runId !== runId) {
        throw new SandboxError("RUN_ID_MISMATCH", "Business request targets another run", {}, 409);
      }
      if (typeof operation !== "function") {
        throw new SandboxError("OPERATION_INVALID", "Transaction operation must be callable");
      }

      const captured = {
        runId,
        epoch,
        revision,
        signal: abortController.signal
      };
      const draft = structuredClone(state);
      const draftMetadata = structuredClone(metadata);
      const result = await operation(draft, {
        runId: captured.runId,
        epoch: captured.epoch,
        now: () => clock.now(),
        tick: () => clock.tick(),
        profile: draftMetadata
      });

      if (captured.signal.aborted) {
        throw new SandboxError("RUN_ABORTED", "Transaction was aborted by a run transition", {}, 409);
      }

      return enqueueCommit(() => {
        if (captured.signal.aborted) {
          throw new SandboxError("RUN_ABORTED", "Transaction was aborted by a run transition", {}, 409);
        }
        if (lifecycle !== "active" || runId !== captured.runId || epoch !== captured.epoch) {
          throw new SandboxError("STALE_RUN_EPOCH", "Transaction belongs to a stale run", {}, 409);
        }
        if (revision !== captured.revision) {
          throw new SandboxError("STALE_RUN_REVISION", "Concurrent transaction changed run state", {}, 409);
        }
        state = draft;
        metadata = draftMetadata;
        revision += 1;
        return result;
      });
    },

    async abort() {
      abortController.abort();
      acceptingBusinessRequests = false;
      lifecycle = "aborted";
      return publicRun();
    }
  });
}
