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
  assert.equal(evaluation.releaseDecision, "pass");
  assert.equal(evaluation.score, 100);
});
