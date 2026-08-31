import { randomUUID } from "node:crypto";

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
  let lifecycle = "empty";
  let acceptingBusinessRequests = false;
  let runId = null;
  let epoch = 0;
  let revision = 0;
  let state = null;
  let metadata = null;
  let preSnapshot = null;
  let abortController = new AbortController();
  let commitQueue = Promise.resolve();

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
      fault: structuredClone(metadata?.fault ?? null),
      preSnapshot: preSnapshot ? structuredClone(preSnapshot) : null
    };
  }

  function enqueueCommit(action) {
    const pending = commitQueue.then(action, action);
    commitQueue = pending.catch(() => undefined);
    return pending;
  }

  async function install(profile, mode) {
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

    try {
      const candidate = normalizeFixture(profile);
      const candidateSnapshot = createSnapshot(candidate.state);
      clock.reset();
      state = candidate.state;
      metadata = candidate.metadata;
      runId = nextRunId;
      epoch = nextEpoch;
      revision = 0;
      preSnapshot = candidateSnapshot;
      lifecycle = "active";
      acceptingBusinessRequests = true;
      return publicRun();
    } catch (error) {
      state = null;
      metadata = null;
      runId = null;
      revision = 0;
      preSnapshot = null;
      lifecycle = "failed-reset";
      acceptingBusinessRequests = false;
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

    reset(profile) {
      return install(profile, "resetting");
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
      const result = await operation(draft, {
        runId: captured.runId,
        epoch: captured.epoch,
        now: () => clock.now(),
        tick: () => clock.tick()
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
