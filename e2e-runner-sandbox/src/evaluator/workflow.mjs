import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { materializeRunnerInput } from "../bundle/materialize-input.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { evaluateTrial } from "./evaluate.mjs";
import { readArtifacts } from "./read-artifacts.mjs";
import { scanPath } from "./scan-canary.mjs";

const STEP_NAMES = Object.freeze([
  "select-profile",
  "prepare-materialize-and-capture-pre",
  "fresh-context",
  "deliver-input",
  "resolve-environment",
  "assist-and-confirm",
  "start-chrome-and-manual-login",
  "later-assistance",
  "terminal-and-host-trace",
  "collect-artifacts",
  "capture-post-oracle",
  "evaluate",
  "reset-and-release"
]);

function safeIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new SandboxError("EVALUATION_IDENTIFIER_INVALID", `${label} is not a safe identifier`);
  }
  return value;
}

function snapshot(value) {
  return structuredClone(value);
}

function stepDigest(step) {
  return sha256Text(canonicalStringify({
    sequence: step.sequence,
    name: step.name,
    status: step.status,
    previousDigest: step.previousDigest,
    details: step.details
  }));
}

function createSteps(profileId, unitId) {
  let previousDigest = null;
  return STEP_NAMES.map((name, index) => {
    const completed = index < 2;
    const step = {
      sequence: index + 1,
      name,
      status: completed ? "completed" : "pending",
      previousDigest,
      details: completed ? { profileId, unitId } : {}
    };
    step.digest = stepDigest(step);
    previousDigest = step.digest;
    return step;
  });
}
export function createEvaluationWorkflow(options) {
  const { bundle, coordinator } = options;
  const archiveRoot = resolve(options.archiveRoot);
  const trials = new Map();

  function materializedDigest(value) {
    return sha256Text(canonicalStringify(value));
  }

  function profileFor(profileId) {
    const profile = bundle.profiles.find((candidate) => candidate.profileId === profileId);
    if (!profile) throw new SandboxError("EVALUATION_PROFILE_UNKNOWN", "Evaluation profile was not found", {}, 404);
    return profile;
  }

  function unitFor(unitId, profileId) {
    const unit = bundle.executionMatrix.units.find((candidate) => candidate.unitId === unitId);
    if (!unit || unit.profileId !== profileId) {
      throw new SandboxError("EVALUATION_UNIT_INVALID", "Execution unit does not match the selected profile");
    }
    return unit;
  }

  async function materialize(profile, runId) {
    return materializeRunnerInput(
      profile.runnerInput,
      runId,
      profile.runnerInput.runIdPointers
    );
  }

  async function archiveInput(trialId, value) {
    const directory = join(archiveRoot, safeIdentifier(trialId, "trialId"));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "runner-input.json");
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return path;
  }

  function captureBefore() {
    const before = coordinator.status().preSnapshot;
    if (!before) throw new SandboxError("EVALUATION_SNAPSHOT_MISSING", "Prepared run has no pre-run snapshot");
    return snapshot(before);
  }

  function captureAfter() {
    return {
      current: coordinator.snapshot(),
      diff: coordinator.diff(),
      events: coordinator.read().oracleEvents,
      outbox: coordinator.read().outbox,
      fault: coordinator.status().fault
    };
  }

  async function createTrial({ profileId, unitId }) {
    const profile = profileFor(safeIdentifier(profileId, "profileId"));
    const unit = unitFor(safeIdentifier(unitId, "unitId"), profile.profileId);
    const lifecycle = coordinator.status().lifecycle;
    const prepared = lifecycle === "active"
      ? await coordinator.reset(profile)
      : await coordinator.prepare(profile);
    const trialId = `${unit.unitId}-${prepared.runId}`;
    safeIdentifier(trialId, "trialId");
    const input = await materialize(profile, prepared.runId);
    const materializedInputPath = await archiveInput(trialId, input);
    const trial = {
      trialId,
      runId: prepared.runId,
      profileId: profile.profileId,
      unitId: unit.unitId,
      materializedInput: input,
      materializedInputPath,
      materializedInputSha256: materializedDigest(input),
      preSnapshot: captureBefore(),
      assistance: [],
      excludedWaitMs: 0,
      steps: createSteps(profile.profileId, unit.unitId)
    };
    trials.set(trialId, trial);
    return snapshot(trial);
  }

  async function recordAssistance(trialId, event) {
    const trial = trials.get(trialId);
    if (!trial) throw new SandboxError("EVALUATION_TRIAL_UNKNOWN", "Evaluation trial was not found", {}, 404);
    const profile = profileFor(trial.profileId);
    const allowed = profile.assistance.events.find((candidate) => candidate.eventId === event.eventId);
    if (!allowed || allowed.trigger !== event.trigger || allowed.reply !== event.reply ||
      allowed.action !== event.action || allowed.provenance !== event.provenance) {
      throw new SandboxError("ASSISTANCE_SCRIPT_VIOLATION", "Assistance event does not match the immutable evaluator script");
    }
    const elapsedMs = Number(event.endedAtMs) - Number(event.startedAtMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > allowed.deadlineMs) {
      throw new SandboxError("ASSISTANCE_TIME_INVALID", "Assistance timing is invalid");
    }
    const record = Object.freeze({ ...snapshot(event), elapsedMs });
    trial.assistance.push(record);
    trial.excludedWaitMs += elapsedMs;
    return snapshot(trial);
  }

  async function evaluate(trialId, input) {
    const trial = trials.get(trialId);
    if (!trial) throw new SandboxError("EVALUATION_TRIAL_UNKNOWN", "Evaluation trial was not found", {}, 404);
    const profile = profileFor(trial.profileId);
    const after = input.after ?? captureAfter();
    const artifacts = input.artifacts ?? await readArtifacts(input.artifactRoot);
    const registry = input.canaryRegistry ?? coordinator.oracleRegistry();
    const canaryScan = input.canaryScan ?? await scanPath(artifacts.root, registry);
    return evaluateTrial({
      oracle: profile.oracle,
      artifacts,
      hostTraceClassifier: bundle.hostTraceClassifier,
      scoring: bundle.scoring,
      executionUnit: unitFor(trial.unitId, trial.profileId),
      snapshot: after.diff,
      events: after.events,
      outbox: after.outbox,
      fault: after.fault,
      assistanceLog: trial.assistance,
      canaryScan,
      hostTrace: input.hostTrace ?? [],
      metrics: input.metrics ?? {}
    });
  }

  return Object.freeze({
    createTrial,
    materialize,
    archiveInput,
    captureBefore,
    captureAfter,
    recordAssistance,
    evaluate,
    materializedDigest
  });
}
