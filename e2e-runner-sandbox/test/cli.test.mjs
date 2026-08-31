import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import { runEvaluatorCli } from "../bin/evaluator.mjs";
import { createRuntimeFiles } from "../src/control/runtime-files.mjs";
import { createControlServer } from "../src/control/server.mjs";
import { profile, setup } from "./helpers/domain-harness.mjs";

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

test("CLI rejects missing runtime and unknown options without contacting control", async () => {
  const lines = [];

  const exitCode = await runEvaluatorCli(
    ["status", "--unknown", "value"],
    { write: (line) => lines.push(line) }
  );

  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(lines[0]).error.code, "CLI_ARGUMENT_INVALID");
});
