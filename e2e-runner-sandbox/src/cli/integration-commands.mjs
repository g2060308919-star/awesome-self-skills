import { chmod, mkdir, opendir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { aggregateCalibration, aggregateReleaseCampaign } from "../campaign/aggregate.mjs";
import { campaignStatus, createCalibrationPlan, createReleasePlan, nextCampaignUnit } from "../campaign/planner.mjs";
import { renderCampaignMarkdown } from "../campaign/report.mjs";
import { loadBundle } from "../bundle/load-bundle.mjs";
import { normalizeCodexRollout } from "../host-evidence/codex-rollout-adapter.mjs";
import { createCodexSourcePackage, readHostSourcePackage } from "../host-evidence/source-package.mjs";
import { scanPath } from "../evaluator/scan-canary.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { createTrialOrchestrator } from "../trial/orchestrator.mjs";
import { createTrialStore } from "../trial/store.mjs";

export const INTEGRATION_OFFLINE_COMMANDS = new Set([
  "host-export", "host-normalize", "calibration-create", "release-create",
  "campaign-next", "campaign-status", "campaign-aggregate"
]);

export const INTEGRATION_RUNTIME_COMMANDS = new Set([
  "trial-create", "trial-status", "trial-show-input", "trial-confirm-scope",
  "trial-start", "trial-bind-session", "trial-assist-start", "trial-assist-complete",
  "trial-interrupt", "trial-resume", "trial-import-host", "trial-collect",
  "trial-evaluate", "trial-reset"
]);

function fail(code, message) {
  throw new SandboxError(code, message);
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    fail("CLI_ARGUMENT_INVALID", `${label} must be a safe identifier`);
  }
  return value;
}

async function writeOwnerFile(path, text) {
  const directory = dirname(resolve(path));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(resolve(path), text, { encoding: "utf8", mode: 0o600 });
  await chmod(resolve(path), 0o600);
  return resolve(path);
}

async function writeOwnerJson(path, value) {
  return writeOwnerFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    fail("CLI_INPUT_INVALID", `${label} must be readable JSON`);
  }
}

function safeTrialSummary(manifest) {
  return {
    trialId: manifest.trialId,
    campaignId: manifest.campaignId,
    profileId: manifest.profileId,
    unitId: manifest.unitId,
    runId: manifest.runId,
    state: manifest.state,
    revision: manifest.revision,
    runner: manifest.runner,
    bundleVersion: manifest.bundleVersion,
    hostEvidence: manifest.hostEvidence ? {
      trustLevel: manifest.hostEvidence.trustLevel,
      adapter: manifest.hostEvidence.adapter,
      mappingVersion: manifest.hostEvidence.mappingVersion,
      sessionDigest: manifest.hostEvidence.sessionDigest,
      sourceManifestDigest: manifest.hostEvidence.sourceManifestDigest,
      normalizedEventsDigest: manifest.hostEvidence.normalizedEventsDigest
    } : null,
    evaluation: manifest.evaluation ?? null,
    reset: manifest.reset ?? null,
    releaseEligibility: manifest.releaseEligibility,
    nextActions: manifest.nextActions
  };
}

async function bundleAt(packageRoot) {
  return loadBundle(join(packageRoot, "benchmark"), "v1");
}

async function orchestratorFor(context) {
  const bundle = await bundleAt(context.packageRoot);
  const store = await createTrialStore({ root: resolve(context.parsed.args.privateRoot) });
  return createTrialOrchestrator({
    bundle,
    store,
    client: context.client,
    exchangeRoot: resolve(context.parsed.args.exchangeRoot),
    businessUrl: context.runtime.businessUrl,
    canaryScanner: (root, registry) => context.withOfflineOcr((ocr) =>
      scanPath(root, registry, { ocr })
    )
  });
}

async function runTrialCommand(context) {
  const { command, args } = context.parsed;
  const orchestrator = await orchestratorFor(context);
  let result;
  if (command === "trial-create") result = await orchestrator.create({
    unitId: args.unitId,
    campaignId: args.campaignId,
    runner: { version: args.runnerVersion, digest: args.runnerDigest }
  });
  else if (command === "trial-status") result = await orchestrator.status(args.trialDirectory);
  else if (command === "trial-show-input") return orchestrator.showRunnerInput(args.trialDirectory);
  else if (command === "trial-confirm-scope") result = await orchestrator.confirmScope(args.trialDirectory, {
    environmentClassification: args.environmentClassification,
    scope: args.scope,
    idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-start") result = await orchestrator.startRunner(args.trialDirectory, {
    executionStartedAtMs: Number(args.startedAtMs), idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-bind-session") result = await orchestrator.bindSession(args.trialDirectory, {
    sessionDigest: args.sessionDigest,
    executionStartedAtMs: Number(args.startedAtMs),
    idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-assist-start") result = await orchestrator.startAssistance(args.trialDirectory, {
    eventId: args.eventId, startedAtMs: Number(args.startedAtMs), idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-assist-complete") result = await orchestrator.completeAssistance(args.trialDirectory, {
    eventId: args.eventId, trigger: args.trigger, reply: args.reply, action: args.action,
    provenance: args.provenance, endedAtMs: Number(args.endedAtMs),
    idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-interrupt") result = await orchestrator.markInterrupted(args.trialDirectory, {
    uncertainWrites: args.uncertainWrites === "true", reason: args.reason,
    idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-resume") result = await orchestrator.resume(args.trialDirectory, {
    reconciled: args.reconciled === "true", idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-import-host") {
    const sourcePackage = await readHostSourcePackage(resolve(args.source));
    const normalized = await normalizeCodexRollout(sourcePackage);
    result = await orchestrator.importHost(args.trialDirectory, {
      normalized, sourcePackage, idempotencyKey: args.idempotencyKey
    });
  } else if (command === "trial-collect") result = await orchestrator.collect(args.trialDirectory, {
    artifactRoot: resolve(args.artifacts), idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-evaluate") result = await orchestrator.evaluate(args.trialDirectory, {
    idempotencyKey: args.idempotencyKey
  });
  else if (command === "trial-reset") result = await orchestrator.reset(args.trialDirectory, {
    idempotencyKey: args.idempotencyKey
  });
  else fail("CLI_ARGUMENT_INVALID", "Unknown Trial command");
  return safeTrialSummary(result);
}

function campaignPlanPath(campaignRoot, campaignId) {
  return join(resolve(campaignRoot), safeId(campaignId, "campaignId"), "campaign-plan.json");
}

async function readCampaignTrials(privateRoot, campaignId, includeIncomplete) {
  const store = await createTrialStore({ root: resolve(privateRoot) });
  const entries = [];
  for await (const entry of await opendir(store.root)) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(entry.name)) continue;
    let manifest;
    try {
      manifest = await store.read(entry.name);
    } catch {
      continue;
    }
    if (manifest.campaignId !== campaignId) continue;
    if (includeIncomplete) {
      entries.push({ manifest });
      continue;
    }
    const evaluationPath = manifest.outputs?.evaluation?.path;
    if (!evaluationPath) continue;
    const trialDirectory = store.paths(manifest.trialId).trialDirectory;
    const containment = relative(trialDirectory, resolve(evaluationPath));
    if (isAbsolute(containment) || containment.startsWith("..")) {
      fail("CAMPAIGN_SOURCE_MISMATCH", "Evaluation output path escapes its private Trial directory");
    }
    entries.push({ manifest, evaluation: await readJson(evaluationPath, "evaluation") });
  }
  return entries;
}

async function runOfflineCommand(context) {
  const { command, args } = context.parsed;
  if (command === "host-export") {
    const created = await createCodexSourcePackage({
      sourcePath: resolve(args.source),
      outputDirectory: resolve(args.output),
      trustLevel: args.trustLevel,
      authorization: {
        explicit: true,
        actor: args.authorizationActor,
        authorizedAt: args.authorizedAt
      }
    });
    return {
      trustLevel: created.manifest.trustLevel,
      sessionDigest: created.manifest.sessionDigest,
      sourceManifestDigest: created.manifest.sourceManifestDigest,
      exporter: created.manifest.exporter
    };
  }
  if (command === "host-normalize") {
    const source = await readHostSourcePackage(resolve(args.source));
    const normalized = await normalizeCodexRollout(source);
    await writeOwnerJson(args.output, normalized);
    return {
      trustLevel: normalized.trustLevel,
      sessionDigest: normalized.sessionDigest,
      sourceManifestDigest: normalized.sourceManifestDigest,
      normalizedEventsDigest: normalized.normalizedEventsDigest,
      eventCount: normalized.events.length
    };
  }
  const bundle = await bundleAt(context.packageRoot);
  if (command === "calibration-create") {
    const definition = await readJson(join(context.packageRoot, "config", "calibration-v1.json"), "calibration definition");
    const plan = createCalibrationPlan({
      bundle, definition,
      campaignId: args.campaignId,
      createdAt: args.createdAt,
      runner: { version: args.runnerVersion, digest: args.runnerDigest }
    });
    await writeOwnerJson(campaignPlanPath(args.campaignRoot, plan.campaignId), plan);
    return { campaignId: plan.campaignId, planDigest: plan.planDigest, plannedUnits: plan.units.length };
  }
  if (command === "release-create") {
    const calibrationSummary = await readJson(args.calibrationSummary, "calibration summary");
    const plan = createReleasePlan({
      bundle, calibrationSummary,
      campaignId: args.campaignId,
      createdAt: args.createdAt,
      runner: { version: args.runnerVersion, digest: args.runnerDigest }
    });
    await writeOwnerJson(campaignPlanPath(args.campaignRoot, plan.campaignId), plan);
    return { campaignId: plan.campaignId, planDigest: plan.planDigest, plannedUnits: plan.units.length };
  }
  const plan = await readJson(args.campaignPath, "campaign plan");
  if (command === "campaign-next") {
    const trials = await readCampaignTrials(args.privateRoot, plan.campaignId, true);
    return { campaignId: plan.campaignId, next: nextCampaignUnit(plan, trials) };
  }
  if (command === "campaign-status") {
    const trials = await readCampaignTrials(args.privateRoot, plan.campaignId, true);
    return campaignStatus(plan, trials);
  }
  if (command === "campaign-aggregate") {
    const trials = await readCampaignTrials(args.privateRoot, plan.campaignId, false);
    const summary = plan.kind === "calibration"
      ? aggregateCalibration({ plan, trials, bundle })
      : aggregateReleaseCampaign({ plan, trials, bundle });
    await writeOwnerJson(args.output, summary);
    const markdownPath = args.output.toLowerCase().endsWith(".json")
      ? `${args.output.slice(0, -5)}.md` : `${args.output}.md`;
    await writeOwnerFile(markdownPath, renderCampaignMarkdown(summary));
    return {
      campaignId: plan.campaignId,
      conclusion: summary.conclusion,
      completedUnits: summary.completedUnits,
      plannedUnits: summary.plannedUnits,
      summaryDigest: summary.summaryDigest
    };
  }
  fail("CLI_ARGUMENT_INVALID", "Unknown integration command");
}

export async function runIntegrationCommand(context) {
  if (INTEGRATION_RUNTIME_COMMANDS.has(context.parsed.command)) return runTrialCommand(context);
  if (INTEGRATION_OFFLINE_COMMANDS.has(context.parsed.command)) return runOfflineCommand(context);
  fail("CLI_ARGUMENT_INVALID", "Unknown integration command");
}
