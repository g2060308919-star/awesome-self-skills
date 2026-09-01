import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { materializeRunnerInput } from "../bundle/materialize-input.mjs";
import { evaluateTrial } from "../evaluator/evaluate.mjs";
import { readArtifacts } from "../evaluator/read-artifacts.mjs";
import { buildHostEvidence } from "../host-evidence/bridge.mjs";
import { METRIC_DERIVER_VERSION } from "../host-evidence/derive-metrics.mjs";
import { readHostSourcePackage } from "../host-evidence/source-package.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { nextTrialActions, reviseTrial, transitionTrial } from "./state-machine.mjs";

function digest(value) {
  const jsonSafe = value === undefined ? null : JSON.parse(JSON.stringify(value));
  return `sha256:${sha256Text(canonicalStringify(jsonSafe))}`;
}

function fail(code, message) {
  throw new SandboxError(code, message);
}

function commandDigest(input) {
  return digest(input ?? {});
}

function withCommand(manifest, command, input) {
  return {
    ...manifest,
    commands: {
      ...(manifest.commands ?? {}),
      [command]: { inputDigest: commandDigest(input), recordedAtRevision: manifest.revision + 1 }
    }
  };
}

function existingCommand(manifest, command, input) {
  const prior = manifest.commands?.[command];
  if (!prior) return false;
  if (prior.inputDigest !== commandDigest(input)) {
    fail("TRIAL_INPUT_CHANGED", `Repeated ${command} command changed its inputs`);
  }
  return true;
}

function assistanceCommandKey(kind, eventId) {
  return `${kind}:${eventId}`;
}

function pathOverlaps(left, right) {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  return left === right || (!leftToRight.startsWith("..") && !isAbsolute(leftToRight)) ||
    (!rightToLeft.startsWith("..") && !isAbsolute(rightToLeft));
}

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
  return path;
}

async function writeJson(path, value) {
  return writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function artifactDigest(artifacts) {
  return digest(artifacts.digests);
}

const RESPONSIBILITY_DOMAIN_ORDER = Object.freeze([
  "runner", "host-evidence", "sandbox", "artifact", "assistance", "budget", "campaign-integrity"
]);

function evaluationResponsibilityDomains(rawEvaluation, bridgeEligibility) {
  const domains = new Set(rawEvaluation.responsibilityDomains ?? []);
  const checks = rawEvaluation.checks ?? {};
  const failed = (name) => checks[name]?.applicable !== false && checks[name]?.passed === false;
  if (failed("verdictAttribution") || failed("stateAction") || failed("navigation")) domains.add("runner");
  if (failed("artifact")) domains.add("artifact");
  if (failed("collaboration")) domains.add("assistance");
  if (failed("stabilityEfficiency")) domains.add("budget");
  for (const reason of bridgeEligibility.reasons ?? []) {
    if (String(reason.code).startsWith("ASSISTANCE_")) domains.add("assistance");
    else if (String(reason.code).startsWith("METRIC_")) domains.add("budget");
    else domains.add("host-evidence");
  }
  return RESPONSIBILITY_DOMAIN_ORDER.filter((domain) => domains.has(domain));
}

function publicStatus(manifest) {
  return { ...structuredClone(manifest), nextActions: nextTrialActions(manifest) };
}

export function createTrialOrchestrator(options) {
  const {
    bundle,
    store,
    client,
    businessUrl,
    bridgeBuilder = buildHostEvidence,
    trialEvaluator = evaluateTrial,
    artifactReader = readArtifacts,
    canaryScanner
  } = options;
  const sourcePackageReader = options.sourcePackageReader ?? readHostSourcePackage;
  const exchangeRoot = resolve(options.exchangeRoot);
  if (!isAbsolute(options.exchangeRoot) || pathOverlaps(store.root, exchangeRoot)) {
    fail("TRIAL_STATE_INVALID", "Private Trial and Runner exchange roots must be separate");
  }
  const trialIdFactory = options.trialIdFactory ?? (() => `trial-${randomUUID()}`);
  const now = options.now ?? (() => new Date().toISOString());
  const nowMs = options.nowMs ?? Date.now;
  const bundleVersion = bundle.version ?? bundle.bundleVersion ?? "v1";
  let businessOrigin;
  try {
    businessOrigin = new URL(businessUrl).origin;
  } catch {
    fail("TRIAL_STATE_INVALID", "Business URL must contain a valid origin");
  }

  function unitFor(unitId) {
    const unit = bundle.executionMatrix.units.find((candidate) => candidate.unitId === unitId);
    if (!unit) fail("TRIAL_STATE_INVALID", "Execution unit is not present in the immutable matrix");
    return unit;
  }

  function profileFor(profileId) {
    const profile = bundle.profiles.find((candidate) => candidate.profileId === profileId);
    if (!profile) fail("TRIAL_STATE_INVALID", "Execution profile is not present in the immutable bundle");
    return profile;
  }

  async function assertSandboxIdentity(manifest, lockedIdentity = null) {
    const status = await client.request("status", {});
    const profile = profileFor(manifest.profileId);
    const mismatch = status.lifecycle !== "active" || status.runId !== manifest.runId ||
      status.epoch !== manifest.sandboxEpoch || status.profileId !== manifest.profileId ||
      (status.fixtureVersion != null && status.fixtureVersion !== profile.fixtureVersion) ||
      (status.uiVariant != null && status.uiVariant !== profile.uiVariant) ||
      (lockedIdentity && Object.entries(lockedIdentity).some(([key, value]) => status[key] !== value));
    if (mismatch) {
      fail("SANDBOX_RUN_MISMATCH", "Sandbox identity does not match the confirmed Trial");
    }
    const identity = {
      runId: status.runId,
      epoch: status.epoch,
      profileId: status.profileId
    };
    if (status.fixtureVersion != null) identity.fixtureVersion = status.fixtureVersion;
    if (status.uiVariant != null) identity.uiVariant = status.uiVariant;
    return identity;
  }

  function exchangePaths(trialId) {
    const root = join(exchangeRoot, trialId);
    return { root, inputPath: join(root, "runner-input.json"), artifactRoot: join(root, "artifacts") };
  }

  function privateOutputPath(trialId, name) {
    return join(store.paths(trialId).trialDirectory, name);
  }

  async function sandboxPreparationCommand() {
    const status = await client.request("status", {});
    if (status.lifecycle !== "active") return "prepare";
    const manifests = await store.list();
    const owner = manifests.find((manifest) =>
      manifest.runId === status.runId || manifest.reset?.runId === status.runId
    );
    if (!owner || owner.state !== "completed" || owner.reset?.succeeded !== true ||
      owner.reset.runId !== status.runId) {
      fail("SANDBOX_RUN_MISMATCH", "Active Sandbox run belongs to an unfinished or unknown Trial");
    }
    return "reset";
  }

  async function assertTrialOwnsActiveRun(manifest) {
    const status = await client.request("status", {});
    if (!["active", "failed-reset"].includes(status.lifecycle) || status.runId !== manifest.runId ||
      status.epoch !== manifest.sandboxEpoch) {
      fail("SANDBOX_RUN_MISMATCH", "Sandbox active run or epoch does not match the Trial being reset");
    }
  }

  async function createUnlocked(input) {
    const unit = unitFor(input.unitId);
    const profile = profileFor(unit.profileId);
    if (!input.runner || typeof input.runner.version !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(input.runner.digest)) {
      fail("TRIAL_STATE_INVALID", "Runner version and SHA-256 digest are required");
    }
    await sandboxPreparationCommand();
    const trialId = trialIdFactory();
    const paths = exchangePaths(trialId);
    await mkdir(paths.artifactRoot, { recursive: true, mode: 0o700 });
    const initial = await store.create({
      schemaVersion: "trial-manifest-v1",
      trialId,
      campaignId: input.campaignId ?? null,
      profileId: profile.profileId,
      unitId: unit.unitId,
      runner: structuredClone(input.runner),
      bundleVersion,
      componentDigests: {
        bundle: digest({ version: bundleVersion, digests: bundle.digests }),
        inputTemplate: profile.inputTemplateDigest,
        oracle: digest(profile.oracle),
        assistance: digest(profile.assistance),
        classifier: digest(bundle.hostTraceClassifier),
        metricDeriver: digest(METRIC_DERIVER_VERSION),
        scoring: digest(bundle.scoring)
      },
      state: "created",
      revision: 0,
      timeline: [],
      commands: {},
      outputs: {},
      assistanceMarks: [],
      releaseEligibility: { eligible: false, reasons: [{ code: "TRIAL_STATE_INVALID", message: "Trial is incomplete" }] },
      createdAt: now()
    });
    const prepared = await store.transact(trialId, initial.revision, async (current) => {
      const prepareCommand = await sandboxPreparationCommand();
      const result = await client.request(prepareCommand, {
        profileId: profile.profileId
      });
      const materialized = materializeRunnerInput(
        profile.runnerInput,
        result.runId,
        profile.runnerInput.runIdPointers
      );
      const materializedDigest = digest(materialized);
      const privateInputPath = privateOutputPath(trialId, "runner-input.json");
      await Promise.all([
        writeJson(privateInputPath, materialized),
        writeJson(paths.inputPath, materialized)
      ]);
      return transitionTrial({
        ...withCommand(current, "prepare", { profileId: profile.profileId }),
        runId: result.runId,
        sandboxEpoch: result.epoch,
        prepare: { runId: result.runId, epoch: result.epoch, preSnapshot: result.preSnapshot },
        materializedInput: {
          digest: materializedDigest,
          privatePath: privateInputPath,
          exchangePath: paths.inputPath
        },
        exchange: { root: paths.root, artifactRoot: paths.artifactRoot }
      }, "prepared", {
        at: now(), reason: "sandbox-prepared", idempotencyKey: `prepare:${trialId}`
      });
    });
    const awaiting = await store.transact(trialId, prepared.revision, (current) =>
      transitionTrial(current, "awaiting_scope_confirmation", {
        at: now(), reason: "runner-input-materialized", idempotencyKey: `materialize:${trialId}`
      })
    );
    return publicStatus(awaiting);
  }

  async function create(input) {
    return store.withGlobalLock(() => createUnlocked(input));
  }

  async function status(trialId) {
    return publicStatus(await store.read(trialId));
  }

  async function showRunnerInput(trialId) {
    const manifest = await store.read(trialId);
    if (!["awaiting_scope_confirmation", "awaiting_runner", "running", "collecting", "evaluating", "evaluated"].includes(manifest.state)) {
      fail("TRIAL_STATE_INVALID", "Runner input is unavailable in the current Trial state");
    }
    let input;
    try {
      input = JSON.parse(await readFile(manifest.materializedInput.exchangePath, "utf8"));
    } catch {
      fail("TRIAL_INPUT_CHANGED", "Materialized Runner input is missing or invalid");
    }
    if (digest(input) !== manifest.materializedInput.digest) {
      fail("TRIAL_INPUT_CHANGED", "Materialized Runner input changed after preparation");
    }
    return {
      trialId,
      runId: manifest.runId,
      profileId: manifest.profileId,
      unitId: manifest.unitId,
      businessUrl,
      artifactRoot: manifest.exchange.artifactRoot,
      input
    };
  }

  async function confirmScope(trialId, input) {
    const current = await store.read(trialId);
    if (existingCommand(current, "confirm-scope", input)) return publicStatus(current);
    if (input.environmentClassification !== "non-production" || typeof input.scope !== "string" || !input.scope) {
      fail("TRIAL_STATE_INVALID", "Exact non-production scope confirmation is required");
    }
    const sandboxIdentity = await assertSandboxIdentity(current);
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "confirm-scope", input),
        scopeConfirmation: {
          environmentClassification: input.environmentClassification,
          scope: input.scope,
          allowedOrigins: [businessOrigin],
          sandboxIdentity,
          confirmedAt: now()
        }
      }, "awaiting_runner", {
        at: now(), reason: "scope-confirmed", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function bindSession(trialId, input) {
    const current = await store.read(trialId);
    if (current.hostSession?.sessionDigest) {
      if (current.hostSession.sessionDigest !== input.sessionDigest) {
        fail("TRIAL_ALREADY_BOUND_TO_SESSION", "Trial is already bound to another Host session");
      }
      if (existingCommand(current, "bind-session", input)) return publicStatus(current);
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(input.sessionDigest) || !Number.isFinite(input.executionStartedAtMs)) {
      fail("TRIAL_STATE_INVALID", "Host session digest and execution start are required");
    }
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "bind-session", input),
        hostSession: { sessionDigest: input.sessionDigest, boundAt: now() },
        timing: { executionStartedAtMs: input.executionStartedAtMs, waitIntervals: [] }
      }, "running", {
        at: now(), reason: "host-session-bound", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function startRunner(trialId, input) {
    const current = await store.read(trialId);
    if (existingCommand(current, "start-runner", input)) return publicStatus(current);
    if (!Number.isFinite(input.executionStartedAtMs)) {
      fail("TRIAL_STATE_INVALID", "Runner execution start timestamp is required");
    }
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "start-runner", input),
        hostSession: null,
        timing: { executionStartedAtMs: input.executionStartedAtMs, waitIntervals: [] }
      }, "running", {
        at: now(), reason: "runner-start-authorized", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function markInterrupted(trialId, input) {
    const current = await store.read(trialId);
    if (existingCommand(current, "mark-interrupted", input)) return publicStatus(current);
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial(withCommand(manifest, "mark-interrupted", input), "blocked", {
        at: now(), reason: input.reason ?? "runner-interrupted",
        resumeState: "running",
        requiresManualReconciliation: input.uncertainWrites === true,
        idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function startAssistance(trialId, input) {
    const current = await store.read(trialId);
    const commandKey = assistanceCommandKey("assist-start", input.eventId);
    if (existingCommand(current, commandKey, input)) return publicStatus(current);
    if (current.state !== "running") fail("TRIAL_STATE_INVALID", "Assistance can start only while a Trial is running");
    const profile = profileFor(current.profileId);
    const expected = profile.assistance.events.find(({ eventId }) => eventId === input.eventId);
    if (!expected || current.assistanceMarks.some(({ eventId }) => eventId === input.eventId) ||
      !Number.isFinite(input.startedAtMs)) {
      fail("ASSISTANCE_PROVENANCE_MISSING", "Assistance start is not declared by the immutable script");
    }
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, commandKey, input),
        pendingAssistance: { eventId: input.eventId, startedAtMs: input.startedAtMs }
      }, "awaiting_assistance", {
        at: now(), reason: `assistance-started:${input.eventId}`, idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function completeAssistance(trialId, input) {
    const current = await store.read(trialId);
    const commandKey = assistanceCommandKey("assist-complete", input.eventId);
    if (existingCommand(current, commandKey, input)) return publicStatus(current);
    if (current.state !== "awaiting_assistance" || current.pendingAssistance?.eventId !== input.eventId) {
      fail("TRIAL_STATE_INVALID", "No matching assistance wait is active");
    }
    const profile = profileFor(current.profileId);
    const expected = profile.assistance.events.find(({ eventId }) => eventId === input.eventId);
    if (!expected || ["eventId", "trigger", "reply", "action", "provenance"].some(
      (key) => input[key] !== expected[key]
    )) fail("ASSISTANCE_PROVENANCE_MISSING", "Assistance completion does not match the immutable script");
    const startMs = current.pendingAssistance.startedAtMs;
    const endMs = Number(input.endedAtMs);
    const elapsedMs = endMs - startMs;
    if (!Number.isFinite(endMs) || elapsedMs < 0 || elapsedMs > expected.deadlineMs) {
      fail("ASSISTANCE_PROVENANCE_MISSING", "Assistance completion timing is invalid");
    }
    const mark = {
      eventId: input.eventId,
      trigger: input.trigger,
      reply: input.reply,
      action: input.action,
      provenance: input.provenance,
      startedAtMs: startMs,
      endedAtMs: endMs,
      elapsedMs,
      hostEventDigests: input.hostEventDigests ?? [],
      controlEventIds: input.controlEventIds ?? []
    };
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, commandKey, input),
        pendingAssistance: null,
        assistanceMarks: [...manifest.assistanceMarks, mark],
        timing: {
          ...manifest.timing,
          waitIntervals: [...manifest.timing.waitIntervals, {
            startMs, endMs, sessionDigest: manifest.hostSession?.sessionDigest ?? null
          }]
        }
      }, "running", {
        at: now(), reason: `assistance-completed:${input.eventId}`, idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function expireAssistance(trialId, input) {
    const current = await store.read(trialId);
    const commandKey = assistanceCommandKey("assist-timeout", input.eventId);
    if (existingCommand(current, commandKey, input)) return publicStatus(current);
    if (current.state !== "awaiting_assistance" || current.pendingAssistance?.eventId !== input.eventId) {
      fail("TRIAL_STATE_INVALID", "No matching assistance wait is active");
    }
    const profile = profileFor(current.profileId);
    const expected = profile.assistance.events.find(({ eventId }) => eventId === input.eventId);
    const startMs = current.pendingAssistance.startedAtMs;
    const endMs = Number(input.endedAtMs);
    const elapsedMs = endMs - startMs;
    if (!expected || !Number.isFinite(endMs) || elapsedMs <= expected.deadlineMs) {
      fail("ASSISTANCE_PROVENANCE_MISSING", "Assistance timeout is not beyond the immutable deadline");
    }
    const failure = {
      code: "ASSISTANCE_DEADLINE_EXCEEDED",
      message: "Assistance exceeded the immutable script deadline"
    };
    const mark = {
      eventId: expected.eventId,
      trigger: expected.trigger,
      reply: expected.reply,
      action: expected.action,
      provenance: expected.provenance,
      startedAtMs: startMs,
      endedAtMs: endMs,
      elapsedMs,
      valid: false,
      failure,
      hostEventDigests: [],
      controlEventIds: []
    };
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, commandKey, input),
        pendingAssistance: null,
        assistanceMarks: [...manifest.assistanceMarks, mark],
        releaseEligibility: { eligible: false, reasons: [failure] }
      }, "running", {
        at: now(), reason: `assistance-timeout:${input.eventId}`, idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function resume(trialId, input) {
    const current = await store.read(trialId);
    if (existingCommand(current, "resume", input)) return publicStatus(current);
    if (current.state !== "blocked") fail("TRIAL_STATE_INVALID", "Only a blocked Trial can resume");
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial(withCommand(manifest, "resume", input), manifest.blocking.resumeState, {
        at: now(), reason: "operator-resume", reconciled: input.reconciled === true,
        idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function abandon(trialId, input) {
    const current = await store.read(trialId);
    if (existingCommand(current, "abandon", input)) return publicStatus(current);
    if (typeof input.reason !== "string" || input.reason.trim() === "" || input.reason.length > 512) {
      fail("TRIAL_STATE_INVALID", "Trial abandonment requires a concise reason");
    }
    const failure = { code: "TRIAL_ABANDONED", message: input.reason };
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "abandon", input),
        pendingAssistance: null,
        abandonment: { reason: input.reason, recordedAt: now() },
        releaseEligibility: { eligible: false, reasons: [failure] }
      }, "abandoned", {
        at: now(), reason: `trial-abandoned:${input.reason}`, idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function collect(trialId, input) {
    const current = await store.read(trialId);
    const artifacts = await artifactReader(resolve(input.artifactRoot));
    const currentDigest = artifactDigest(artifacts);
    if (current.artifacts) {
      if (current.artifacts.digest !== currentDigest || current.artifacts.root !== artifacts.root) {
        fail("TRIAL_INPUT_CHANGED", "Runner artifacts changed after collection");
      }
      if (existingCommand(current, "collect", input)) return publicStatus(current);
      fail("TRIAL_STATE_INVALID", "Artifacts were already collected with another command");
    }
    if (current.state !== "running") fail("TRIAL_STATE_INVALID", "Trial is not ready to collect artifacts");
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "collect", input),
        artifacts: { root: artifacts.root, digest: currentDigest, digests: artifacts.digests, collectedAt: now() }
      }, "collecting", {
        at: now(), reason: "artifacts-collected", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function importHost(trialId, input) {
    const current = await store.read(trialId);
    const normalizedEnvelopeDigest = digest(input.normalized);
    if (current.hostSession?.sessionDigest &&
      input.normalized.sessionDigest !== current.hostSession.sessionDigest) {
      fail("HOST_SESSION_MISMATCH", "Imported Host session does not match the Trial binding");
    }
    if (current.hostEvidence) {
      if (current.hostEvidence.normalizedEnvelopeDigest !== normalizedEnvelopeDigest) {
        fail("TRIAL_ALREADY_BOUND_TO_SESSION", "Trial already has a different Host evidence stream");
      }
      if (existingCommand(current, "import-host", { normalizedEnvelopeDigest, idempotencyKey: input.idempotencyKey })) {
        return publicStatus(current);
      }
    }
    if (!["running", "collecting"].includes(current.state)) {
      fail("TRIAL_STATE_INVALID", "Host evidence cannot be imported in the current Trial state");
    }
    const normalizedPath = privateOutputPath(trialId, "normalized-envelope.json");
    await writeJson(normalizedPath, input.normalized);
    const commandInput = { normalizedEnvelopeDigest, idempotencyKey: input.idempotencyKey };
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      reviseTrial(withCommand(manifest, "import-host", commandInput), {
        at: now(), reason: "host-evidence-imported", idempotencyKey: input.idempotencyKey,
        patch: {
          hostSession: manifest.hostSession ?? {
            sessionDigest: input.normalized.sessionDigest,
            boundAt: now()
          },
          timing: {
            ...manifest.timing,
            waitIntervals: manifest.timing.waitIntervals.map((interval) => ({
              ...interval,
              sessionDigest: interval.sessionDigest ?? input.normalized.sessionDigest
            }))
          },
          hostEvidence: {
            adapter: input.normalized.adapter,
            mappingVersion: input.normalized.mappingVersion,
            trustLevel: input.normalized.trustLevel,
            sourceValidated: input.normalized.sourceValidated === true,
            sessionDigest: input.normalized.sessionDigest,
            sourceManifestDigest: input.normalized.sourceManifestDigest,
            normalizedEventsDigest: input.normalized.normalizedEventsDigest,
            normalizedEnvelopeDigest,
            normalizedPath,
            sourcePackageDirectory: input.sourcePackage?.packageDirectory ?? null
          }
        }
      })
    ));
  }

  async function normalizedFor(manifest) {
    let normalized;
    try {
      normalized = JSON.parse(await readFile(manifest.hostEvidence.normalizedPath, "utf8"));
    } catch {
      fail("TRIAL_INPUT_CHANGED", "Normalized Host envelope is missing or invalid");
    }
    if (digest(normalized) !== manifest.hostEvidence.normalizedEnvelopeDigest ||
      normalized.normalizedEventsDigest !== manifest.hostEvidence.normalizedEventsDigest) {
      fail("TRIAL_INPUT_CHANGED", "Normalized Host envelope changed after import");
    }
    return normalized;
  }

  async function collectTruth() {
    const [snapshot, events, outbox, requestTrace, fault, registry] = await Promise.all([
      client.request("snapshot", { kind: "diff" }),
      client.request("events", {}),
      client.request("outbox", {}),
      client.request("requests", {}),
      client.request("fault", {}),
      client.request("canaries", {})
    ]);
    return { snapshot, events, outbox, requestTrace, fault, registry };
  }

  async function freezeEvaluationInput(current, input) {
    await assertSandboxIdentity(current, current.scopeConfirmation?.sandboxIdentity);
    const truth = await collectTruth();
    const frozen = {
      schemaVersion: "trial-evaluation-input-v1",
      trialId: current.trialId,
      runId: current.runId,
      terminalAtMs: nowMs(),
      truth
    };
    const path = privateOutputPath(current.trialId, "evaluation-input.json");
    await writeJson(path, frozen);
    const frozenDigest = digest(frozen);
    return store.transact(current.trialId, current.revision, (manifest) =>
      transitionTrial({
        ...withCommand(manifest, "evaluate", input),
        evaluationInput: { path, digest: frozenDigest, terminalAtMs: frozen.terminalAtMs }
      }, "evaluating", {
        at: now(), reason: "evaluation-input-frozen", idempotencyKey: input.idempotencyKey
      })
    );
  }

  async function readEvaluationInput(manifest) {
    let frozen;
    try {
      frozen = JSON.parse(await readFile(manifest.evaluationInput.path, "utf8"));
    } catch {
      fail("TRIAL_INPUT_CHANGED", "Frozen evaluation input is missing or invalid");
    }
    if (digest(frozen) !== manifest.evaluationInput.digest ||
      frozen.trialId !== manifest.trialId || frozen.runId !== manifest.runId ||
      frozen.terminalAtMs !== manifest.evaluationInput.terminalAtMs) {
      fail("TRIAL_INPUT_CHANGED", "Frozen evaluation input changed after capture");
    }
    return frozen;
  }

  async function evaluate(trialId, input) {
    let current = await store.read(trialId);
    if (current.state === "evaluated" && existingCommand(current, "evaluate", input)) {
      const artifacts = await artifactReader(current.artifacts.root);
      if (artifactDigest(artifacts) !== current.artifacts.digest) fail("TRIAL_INPUT_CHANGED", "Artifacts changed after evaluation");
      return publicStatus(current);
    }
    if (current.state === "collecting") {
      current = await freezeEvaluationInput(current, input);
    }
    if (current.state !== "evaluating" || !current.hostEvidence || !current.artifacts) {
      fail("TRIAL_STATE_INVALID", "Trial is missing collected artifacts or Host evidence");
    }
    const profile = profileFor(current.profileId);
    const unit = unitFor(current.unitId);
    const artifacts = await artifactReader(current.artifacts.root);
    if (artifactDigest(artifacts) !== current.artifacts.digest) {
      fail("TRIAL_INPUT_CHANGED", "Runner artifacts changed after collection");
    }
    const normalized = await normalizedFor(current);
    if (current.hostEvidence.sourcePackageDirectory) {
      const source = await sourcePackageReader(current.hostEvidence.sourcePackageDirectory);
      if (source.manifest.sourceManifestDigest !== current.hostEvidence.sourceManifestDigest ||
        source.manifest.sessionDigest !== current.hostEvidence.sessionDigest) {
        fail("TRIAL_INPUT_CHANGED", "Host source package changed after import");
      }
    }
    const frozenInput = await readEvaluationInput(current);
    const truth = frozenInput.truth;
    const bridge = bridgeBuilder({
      normalized,
      trial: {
        trialId,
        runId: current.runId,
        sessionDigest: current.hostSession.sessionDigest,
        executionStartedAtMs: current.timing.executionStartedAtMs,
        terminalAtMs: frozenInput.terminalAtMs,
        waitIntervals: current.timing.waitIntervals,
        environmentClassification: current.scopeConfirmation.environmentClassification,
        scopeConfirmedAtMs: Date.parse(current.scopeConfirmation.confirmedAt),
        allowedOrigins: current.scopeConfirmation.allowedOrigins
      },
      assistanceScript: profile.assistance,
      assistanceMarks: input.assistanceMarks ?? current.assistanceMarks,
      controlEvents: truth.events,
      requestTrace: truth.requestTrace,
      oracleEvents: truth.events
    });
    if (!canaryScanner) fail("TRIAL_STATE_INVALID", "A configured canary scanner is required for evaluation");
    const canaryScan = await canaryScanner(artifacts.root, truth.registry);
    const rawEvaluation = trialEvaluator({
      oracle: profile.oracle,
      artifacts,
      hostTraceClassifier: bundle.hostTraceClassifier,
      scoring: bundle.scoring,
      executionUnit: {
        ...unit,
        runnerVersion: current.runner.version,
        bundleVersion
      },
      snapshot: truth.snapshot,
      events: truth.events,
      outbox: truth.outbox,
      fault: truth.fault,
      assistanceLog: bridge.assistance.events,
      canaryScan,
      hostTrace: bridge.hostTrace,
      metrics: bridge.metrics
    });
    const formalEligible = rawEvaluation.eligible && bridge.releaseEligibility.eligible;
    const evaluation = {
      ...rawEvaluation,
      eligible: formalEligible,
      score: formalEligible ? rawEvaluation.score : "ineligible",
      releaseDecision: formalEligible ? rawEvaluation.releaseDecision : "fail",
      trialId,
      runId: current.runId,
      unitId: current.unitId,
      runner: current.runner,
      bundleVersion: current.bundleVersion,
      componentDigests: current.componentDigests,
      hostEvidence: {
        trustLevel: current.hostEvidence.trustLevel,
        releaseEligibility: bridge.releaseEligibility,
        adapter: current.hostEvidence.adapter,
        mappingVersion: current.hostEvidence.mappingVersion,
        sessionDigest: current.hostEvidence.sessionDigest,
        sourceManifestDigest: current.hostEvidence.sourceManifestDigest,
        normalizedEventsDigest: current.hostEvidence.normalizedEventsDigest
      },
      responsibilityDomains: evaluationResponsibilityDomains(rawEvaluation, bridge.releaseEligibility)
    };
    const outputValues = {
      hostTrace: bridge.hostTrace,
      assistance: bridge.assistance,
      metrics: bridge.metrics,
      evaluation
    };
    const outputs = {};
    for (const [name, value] of Object.entries(outputValues)) {
      const path = privateOutputPath(trialId, `${name === "hostTrace" ? "host-trace" : name}.json`);
      await writeJson(path, value);
      outputs[name] = { path, digest: digest(value), generator: "trial-orchestrator-v1", trustLevel: current.hostEvidence.trustLevel };
    }
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...manifest,
        outputs: { ...manifest.outputs, ...outputs },
        evaluation: {
          eligible: evaluation.eligible,
          score: evaluation.score,
          diagnosticScore: evaluation.diagnosticScore,
          releaseDecision: evaluation.releaseDecision,
          completeOraclePassed: evaluation.completeOraclePassed,
          gateFailures: evaluation.gateFailures
        },
        releaseEligibility: bridge.releaseEligibility
      }, "evaluated", {
        at: now(), reason: "evaluation-completed", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function resetUnlocked(trialId, input) {
    let current = await store.read(trialId);
    if (current.state === "completed" && existingCommand(current, "reset", input)) return publicStatus(current);
    if (["evaluated", "reset_failed", "invalid", "abandoned"].includes(current.state)) {
      if (current.state === "reset_failed") {
        if (!existingCommand(current, "reset", input)) {
          fail("TRIAL_STATE_INVALID", "Failed reset is missing its persisted intent");
        }
      } else {
        await assertTrialOwnsActiveRun(current);
      }
      current = await store.transact(trialId, current.revision, (manifest) =>
        transitionTrial({
          ...withCommand(manifest, "reset", input),
          resetIntent: manifest.resetIntent ?? {
            operationId: digest({ trialId, command: "reset", inputDigest: commandDigest(input) }),
            expectedRunId: manifest.runId,
            expectedEpoch: manifest.sandboxEpoch,
            targetProfileId: manifest.profileId,
            startedAt: now()
          }
        }, "resetting", {
          at: now(), reason: "reset-started", idempotencyKey: input.idempotencyKey
        })
      );
    }
    if (current.state !== "resetting") fail("TRIAL_STATE_INVALID", "Trial cannot reset in its current state");
    if (!existingCommand(current, "reset", input) || !current.resetIntent) {
      fail("TRIAL_STATE_INVALID", "Resetting Trial is missing its persisted intent");
    }
    let result;
    try {
      result = await client.request("reset", {
        profileId: current.resetIntent.targetProfileId,
        operationId: current.resetIntent.operationId,
        expectedRunId: current.resetIntent.expectedRunId,
        expectedEpoch: current.resetIntent.expectedEpoch
      });
      if (result.lifecycle !== "active" || result.profileId !== current.resetIntent.targetProfileId ||
        result.epoch !== current.resetIntent.expectedEpoch + 1 ||
        typeof result.runId !== "string" || result.runId === current.resetIntent.expectedRunId) {
        fail("SANDBOX_RUN_MISMATCH", "Sandbox reset result does not match the persisted reset intent");
      }
    } catch (error) {
      await store.transact(trialId, current.revision, (manifest) =>
        transitionTrial({
          ...manifest,
          reset: { succeeded: false, errorCode: error.code ?? "UNKNOWN", failedAt: now() }
        }, "reset_failed", {
          at: now(), reason: "sandbox-reset-failed", idempotencyKey: input.idempotencyKey
        })
      );
      throw new SandboxError("SANDBOX_RESET_FAILED", "Sandbox reset failed and the Trial is fenced", {
        causeCode: error.code ?? "UNKNOWN"
      });
    }
    return publicStatus(await store.transact(trialId, current.revision, (manifest) =>
      transitionTrial({
        ...manifest,
        reset: { succeeded: true, runId: result.runId, epoch: result.epoch, completedAt: now() }
      }, "completed", {
        at: now(), reason: "sandbox-reset-verified", idempotencyKey: input.idempotencyKey
      })
    ));
  }

  async function reset(trialId, input) {
    return store.withGlobalLock(() => resetUnlocked(trialId, input));
  }

  return Object.freeze({
    create,
    status,
    showRunnerInput,
    confirmScope,
    bindSession,
    startRunner,
    startAssistance,
    completeAssistance,
    expireAssistance,
    markInterrupted,
    resume,
    abandon,
    collect,
    importHost,
    evaluate,
    reset
  });
}
