import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runEvaluatorCli } from "../bin/evaluator.mjs";
import { createRuntimeFiles } from "../src/control/runtime-files.mjs";
import { createControlServer } from "../src/control/server.mjs";
import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";
import { profile, setup } from "./helpers/domain-harness.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function cliHarness(t) {
  const harness = await setup();
  const runtime = await createRuntimeFiles({ businessUrl: "http://127.0.0.1:49002" });
  const server = createControlServer({
    coordinator: harness.coordinator,
    operations: harness.operations,
    socketPath: runtime.socketPath,
    token: runtime.token,
    profileResolver: async (profileId) => profile({ profileId })
  });
  await server.listen();
  t.after(() => server.close());
  t.after(() => rm(runtime.runtimeDirectory, { recursive: true, force: true }));
  return runtime;
}

test("evaluator CLI prints one stable JSON result for a control command", async (t) => {
  const runtime = await cliHarness(t);
  const lines = [];

  const exitCode = await runEvaluatorCli(
    ["status", "--runtime", runtime.runtimeDirectory],
    { write: (line) => lines.push(line) }
  );

  assert.equal(exitCode, 0, lines.join("\n"));
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.equal(output.ok, true);
  assert.equal(output.command, "status");
  assert.equal(output.result.lifecycle, "active");
  assert.equal(Object.hasOwn(output, "token"), false);
});

test("CLI parses command options into typed evaluator arguments", async (t) => {
  const runtime = await cliHarness(t);
  const lines = [];

  const exitCode = await runEvaluatorCli([
    "set-role",
    "--runtime",
    runtime.runtimeDirectory,
    "--account-id",
    "acct-viewer",
    "--role",
    "Operator"
  ], { write: (line) => lines.push(line) });

  assert.equal(exitCode, 0, lines.join("\n"));
  assert.equal(JSON.parse(lines[0]).result.account.role, "Operator");
});

test("CLI reads the private request trace through the authenticated control command", async (t) => {
  const runtime = await cliHarness(t);
  const lines = [];
  const exitCode = await runEvaluatorCli([
    "requests", "--runtime", runtime.runtimeDirectory
  ], { write: (line) => lines.push(line) });

  assert.equal(exitCode, 0, lines.join("\n"));
  assert.deepEqual(JSON.parse(lines[0]).result, []);
});

test("CLI rejects missing runtime and unknown options without contacting control", async () => {
  const lines = [];

  const exitCode = await runEvaluatorCli(
    ["status", "--unknown", "value"],
    { write: (line) => lines.push(line) }
  );

  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(lines[0]).error.code, "CLI_ARGUMENT_INVALID");
});

test("CLI materializes and archives an exact run-scoped Runner input", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evaluator-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = join(directory, "runner-input.json");
  const lines = [];

  const exitCode = await runEvaluatorCli([
    "materialize",
    "--bundle-root", join(packageRoot, "benchmark"),
    "--bundle-version", "v1",
    "--profile", "B11",
    "--run-id", "cli-materialized-run",
    "--output", outputPath
  ], { write: (line) => lines.push(line) });

  assert.equal(exitCode, 0, lines.join("\n"));
  const input = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(input.cases[0].data.customerName, "Bench-cli-materialized-run");
  assert.equal(JSON.parse(lines[0]).result.outputPath, outputPath);
});

test("CLI evaluates the documented trial directory through private control truth", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evaluator-trial-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const trialDirectory = join(directory, "trial");
  await mkdir(trialDirectory, { recursive: true });
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), join(trialDirectory, "artifacts"), { recursive: true });
  await cp(join(packageRoot, "test", "fixtures", "host-traces", "allowed-devtools.json"), join(trialDirectory, "host-trace.json"));

  const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "B01");
  await writeFile(join(trialDirectory, "assistance.json"), `${JSON.stringify(profile.assistance.events.map((event) => ({ ...event, elapsedMs: 1000 })), null, 2)}\n`);
  await writeFile(join(trialDirectory, "metrics.json"), `${JSON.stringify({
    activeElapsedMs: 1000, browserReads: 2, businessRequests: 4,
    writes: 0, repeatedNoProgressActions: 0
  }, null, 2)}\n`);

  const coordinator = createRunCoordinator({ runIdFactory: () => "cli-evaluation-run" });
  await coordinator.prepare(profile);
  const operations = createBusinessOperations({ coordinator });
  const runtime = await createRuntimeFiles({ businessUrl: "http://127.0.0.1:49003" });
  t.after(() => rm(runtime.runtimeDirectory, { recursive: true, force: true }));
  const server = createControlServer({
    coordinator, operations, socketPath: runtime.socketPath, token: runtime.token,
    profileResolver: async () => profile
  });
  await server.listen();
  t.after(() => server.close());
  const lines = [];

  const exitCode = await runEvaluatorCli([
    "evaluate", "--trial", trialDirectory, "--runtime", runtime.runtimeDirectory
  ], { write: (line) => lines.push(line) });

  assert.equal(exitCode, 0, lines.join("\n"));
  const evaluation = JSON.parse(await readFile(join(trialDirectory, "evaluation.json"), "utf8"));
  assert.equal(evaluation.releaseDecision, "fail");
  assert.equal(evaluation.diagnosticReleaseDecision, "pass");
  assert.equal(evaluation.score, "ineligible");
  assert.equal(evaluation.diagnosticScore, 100);
  assert.equal(evaluation.hostEvidence.trustLevel, "operator-attested");
});

test("CLI exports and normalizes exactly one explicitly authorized Host session", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "host-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePackage = join(directory, "source-package");
  const normalizedPath = join(directory, "normalized.json");
  const sourcePath = join(packageRoot, "test", "fixtures", "host-evidence", "codex-rollout.jsonl");
  const exportLines = [];
  const exportCode = await runEvaluatorCli([
    "host-export", "--source", sourcePath, "--output", sourcePackage,
    "--trust", "recorded-fixture", "--authorization-actor", "test-operator",
    "--authorized-at", "2026-09-01T01:00:00.000Z"
  ], { write: (line) => exportLines.push(line) });
  assert.equal(exportCode, 0, exportLines.join("\n"));
  assert.equal(exportLines.length, 1);
  assert.equal(JSON.stringify(JSON.parse(exportLines[0])).includes(sourcePath), false);

  const normalizeLines = [];
  const normalizeCode = await runEvaluatorCli([
    "host-normalize", "--source", sourcePackage, "--output", normalizedPath
  ], { write: (line) => normalizeLines.push(line) });
  assert.equal(normalizeCode, 0, normalizeLines.join("\n"));
  const normalized = JSON.parse(await readFile(normalizedPath, "utf8"));
  assert.equal(normalized.sourceValidated, true);
  assert.equal(normalized.events.length, 3);
  assert.equal(JSON.stringify(normalized).includes("snapshot redacted"), false);
});

test("CLI drives a persisted Trial while keeping private paths and Oracle snapshots off stdout", async (t) => {
  const runtime = await cliHarness(t);
  const directory = await mkdtemp(join(tmpdir(), "trial-cli-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateRoot = join(directory, "private", "trials");
  const exchangeRoot = join(directory, "exchange");
  const createLines = [];
  const createCode = await runEvaluatorCli([
    "trial-create", "--runtime", runtime.runtimeDirectory,
    "--private-root", privateRoot, "--exchange-root", exchangeRoot,
    "--unit", "B01-R1", "--campaign-id", "calibration-cli",
    "--runner-version", "runner-cli-1", "--runner-digest", `sha256:${"a".repeat(64)}`
  ], { write: (line) => createLines.push(line) });
  assert.equal(createCode, 0, createLines.join("\n"));
  const created = JSON.parse(createLines[0]).result;
  assert.equal(created.state, "awaiting_scope_confirmation");
  assert.doesNotMatch(createLines[0], new RegExp(privateRoot));
  assert.doesNotMatch(createLines[0], /preSnapshot|oracle/i);

  const statusLines = [];
  const statusCode = await runEvaluatorCli([
    "trial-status", "--runtime", runtime.runtimeDirectory,
    "--private-root", privateRoot, "--exchange-root", exchangeRoot,
    "--trial", created.trialId
  ], { write: (line) => statusLines.push(line) });
  assert.equal(statusCode, 0, statusLines.join("\n"));
  assert.deepEqual(JSON.parse(statusLines[0]).result.nextActions, ["confirm-scope", "status"]);
});

test("CLI creates the versioned six-unit calibration plan", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "campaign-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lines = [];
  const exitCode = await runEvaluatorCli([
    "calibration-create", "--campaign-root", directory,
    "--campaign-id", "calibration-cli", "--runner-version", "runner-cli-1",
    "--runner-digest", `sha256:${"a".repeat(64)}`,
    "--created-at", "2026-09-01T01:00:00.000Z"
  ], { write: (line) => lines.push(line) });
  assert.equal(exitCode, 0, lines.join("\n"));
  assert.equal(JSON.parse(lines[0]).result.plannedUnits, 6);
  const plan = JSON.parse(await readFile(join(directory, "calibration-cli", "campaign-plan.json"), "utf8"));
  assert.equal(plan.planVersion, "calibration-v1");
});

test("CLI errors include stable codes, actionable next steps, and distinct exits", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "host-cli-error-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lines = [];
  const exitCode = await runEvaluatorCli([
    "host-export",
    "--source", join(packageRoot, "test", "fixtures", "host-evidence", "codex-rollout.jsonl"),
    "--output", join(directory, "package"), "--trust", "recorded-fixture",
    "--authorization-actor", "operator", "--authorized-at", "not-a-time"
  ], { write: (line) => lines.push(line) });
  assert.equal(exitCode, 3);
  const result = JSON.parse(lines[0]);
  assert.equal(result.error.code, "HOST_EXPORT_UNAUTHORIZED");
  assert.match(result.error.nextStep, /authorized Host session/i);
});
