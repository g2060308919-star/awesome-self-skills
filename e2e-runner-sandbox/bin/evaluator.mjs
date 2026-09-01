#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { materializeRunnerInput } from "../src/bundle/materialize-input.mjs";
import { createControlClient } from "../src/control/client.mjs";
import { readRuntimeFiles } from "../src/control/runtime-files.mjs";
import { evaluateTrial } from "../src/evaluator/evaluate.mjs";
import { createOfflineOcr, resolveInstalledOcrPaths } from "../src/evaluator/ocr.mjs";
import { readArtifacts } from "../src/evaluator/read-artifacts.mjs";
import { scanPath } from "../src/evaluator/scan-canary.mjs";
import { SandboxError } from "../src/shared/errors.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const OPTION_NAMES = Object.freeze({
  "--runtime": "runtimeDirectory",
  "--profile": "profileId",
  "--kind": "kind",
  "--account-id": "accountId",
  "--role": "role",
  "--session-id": "sessionId",
  "--approval-id": "approvalId",
  "--decision": "decision",
  "--actor": "actor",
  "--bundle-root": "bundleRoot",
  "--bundle-version": "bundleVersion",
  "--run-id": "runId",
  "--output": "output",
  "--path": "path",
  "--registry": "registry",
  "--artifacts": "artifacts",
  "--snapshot": "snapshot",
  "--events": "events",
  "--outbox": "outbox",
  "--fault": "fault",
  "--host-trace": "hostTrace",
  "--assistance": "assistance",
  "--metrics": "metrics",
  "--trial": "trialDirectory"
});

const COMMAND_OPTIONS = Object.freeze({
  status: ["runtimeDirectory"],
  prepare: ["runtimeDirectory", "profileId"],
  reset: ["runtimeDirectory", "profileId"],
  snapshot: ["runtimeDirectory", "kind"],
  events: ["runtimeDirectory"],
  outbox: ["runtimeDirectory"],
  requests: ["runtimeDirectory"],
  canaries: ["runtimeDirectory"],
  fault: ["runtimeDirectory"],
  "expire-session": ["runtimeDirectory", "sessionId"],
  "set-role": ["runtimeDirectory", "accountId", "role"],
  "external-action": ["runtimeDirectory", "approvalId", "decision", "actor"],
  "run-jobs": ["runtimeDirectory", "actor"],
  evaluate: ["runtimeDirectory", "trialDirectory"],
  stop: ["runtimeDirectory"]
});

const OFFLINE_COMMAND_OPTIONS = Object.freeze({
  materialize: ["bundleRoot", "bundleVersion", "profileId", "runId", "output"],
  "scan-canary": ["path", "registry", "output"]
});

export function parseArguments(argv) {
  const [command, ...rest] = argv;
  const commandOptions = COMMAND_OPTIONS[command] ?? OFFLINE_COMMAND_OPTIONS[command];
  if (!commandOptions) {
    throw new SandboxError("CLI_ARGUMENT_INVALID", "Unknown evaluator command");
  }
  if (rest.length % 2 !== 0) {
    throw new SandboxError("CLI_ARGUMENT_INVALID", "Every option requires a value");
  }
  const parsed = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = OPTION_NAMES[rest[index]];
    if (!name || !commandOptions.includes(name) || parsed[name] !== undefined) {
      throw new SandboxError("CLI_ARGUMENT_INVALID", `Unsupported or duplicate option: ${rest[index]}`);
    }
    parsed[name] = rest[index + 1];
  }
  for (const required of commandOptions) {
    if (!parsed[required]) {
      throw new SandboxError("CLI_ARGUMENT_INVALID", `Missing required option: ${required}`);
    }
  }
  const { runtimeDirectory, ...args } = parsed;
  return { command, runtimeDirectory, args, offline: Object.hasOwn(OFFLINE_COMMAND_OPTIONS, command) };
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    throw new SandboxError("CLI_INPUT_INVALID", `${label} must be readable JSON`);
  }
}

async function writeJson(path, value) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return outputPath;
}

async function withOfflineOcr(action) {
  const ocr = await createOfflineOcr(await resolveInstalledOcrPaths(packageRoot));
  try {
    return await action(ocr);
  } finally {
    await ocr.terminate();
  }
}

async function runOfflineCommand(parsed) {
  const { command, args } = parsed;
  if (command === "materialize") {
    const bundle = await loadBundle(resolve(args.bundleRoot), args.bundleVersion);
    const profile = bundle.profiles.find(({ profileId }) => profileId === args.profileId);
    if (!profile) throw new SandboxError("EVALUATION_PROFILE_UNKNOWN", "Evaluation profile was not found", {}, 404);
    const input = materializeRunnerInput(profile.runnerInput, args.runId, profile.runnerInput.runIdPointers);
    return { outputPath: await writeJson(args.output, input), profileId: profile.profileId, runId: args.runId };
  }
  if (command === "scan-canary") {
    const registry = await readJson(args.registry, "registry");
    const result = await withOfflineOcr((ocr) => scanPath(resolve(args.path), registry, { ocr }));
    return { outputPath: await writeJson(args.output, result), result };
  }
  throw new SandboxError("CLI_ARGUMENT_INVALID", "Unknown offline evaluator command");
}

async function runTrialEvaluation(parsed, client) {
  const trialDirectory = resolve(parsed.args.trialDirectory);
  const bundle = await loadBundle(resolve(packageRoot, "benchmark"), "v1");
  const status = await client.request("status", {});
  const profile = bundle.profiles.find(({ profileId }) => profileId === status.profileId);
  if (!profile) throw new SandboxError("EVALUATION_PROFILE_UNKNOWN", "Active profile is not present in bundle v1", {}, 404);
  const artifacts = await readArtifacts(resolve(trialDirectory, "artifacts"));
  const [snapshot, events, outbox, fault, registry, hostTrace, assistanceLog, metrics] = await Promise.all([
    client.request("snapshot", { kind: "diff" }),
    client.request("events", {}),
    client.request("outbox", {}),
    client.request("fault", {}),
    client.request("canaries", {}),
    readJson(resolve(trialDirectory, "host-trace.json"), "host trace"),
    readJson(resolve(trialDirectory, "assistance.json"), "assistance"),
    readJson(resolve(trialDirectory, "metrics.json"), "metrics")
  ]);
  const canaryScan = await withOfflineOcr((ocr) => scanPath(artifacts.root, registry, { ocr }));
  const result = evaluateTrial({
    oracle: profile.oracle,
    artifacts,
    hostTraceClassifier: bundle.hostTraceClassifier,
    scoring: bundle.scoring,
    snapshot,
    events,
    outbox,
    fault,
    hostTrace,
    assistanceLog,
    metrics,
    canaryScan
  });
  return { outputPath: await writeJson(resolve(trialDirectory, "evaluation.json"), result), result };
}

export async function runEvaluatorCli(argv, options = {}) {
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  try {
    const parsed = parseArguments(argv);
    if (parsed.offline) {
      const result = await runOfflineCommand(parsed);
      write(JSON.stringify({ ok: true, command: parsed.command, result }));
      return 0;
    }
    const runtime = await (options.readRuntimeFiles ?? readRuntimeFiles)(parsed.runtimeDirectory);
    const client = (options.clientFactory ?? createControlClient)({
      socketPath: runtime.socketPath,
      token: runtime.token
    });
    if (parsed.command === "evaluate") {
      const result = await runTrialEvaluation(parsed, client);
      write(JSON.stringify({ ok: true, command: parsed.command, result }));
      return 0;
    }
    const result = await client.request(parsed.command, parsed.args);
    write(JSON.stringify({ ok: true, command: parsed.command, result }));
    return 0;
  } catch (error) {
    write(JSON.stringify({
      ok: false,
      error: {
        code: error.code ?? "CLI_INTERNAL_ERROR",
        message: error.code ? error.message : "Evaluator command failed"
      }
    }));
    return error.code === "CLI_ARGUMENT_INVALID" ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runEvaluatorCli(process.argv.slice(2));
}
