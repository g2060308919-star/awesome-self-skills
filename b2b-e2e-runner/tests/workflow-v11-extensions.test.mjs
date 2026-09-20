import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeRun, validateRun } from "../scripts/run-artifacts.mjs";
import { writeJsonAtomic } from "../scripts/lib/atomic-json.mjs";

const fixture = new URL("./fixtures/test-cases.json", import.meta.url);

async function withRoot(prefix, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  try { return await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function readLog(runRoot) {
  return JSON.parse(await readFile(path.join(runRoot, "execution-log.json"), "utf8"));
}

test("v1.1 AC-06/40: every newly initialized v2 Run enables coverage without inventing a Mock decision", async () => {
  await withRoot("runner-v11-coverage-", async root => {
    const run = await initializeRun({
      workspaceRoot: root,
      casesPath: fixture,
      workflowProfile: "permission-batches-html-v2"
    });
    const log = await readLog(run.runRoot);
    assert.deepEqual(log.extensions, { execution_coverage: { schema_version: "1.0" } });
    assert.deepEqual(log.events.map(event => [event.type, event.sequence]), [["workflow_profile", 1]]);
  });
});

test("v1.1 AC-01/02: an explicit Mock decision is initialized after the workflow profile and before permission planning", async () => {
  for (const decision of ["allowed", "declined"]) {
    await withRoot(`runner-v11-mock-${decision}-`, async root => {
      const run = await initializeRun({
        workspaceRoot: root,
        casesPath: fixture,
        workflowProfile: "permission-batches-html-v2",
        mockFallback: decision
      });
      const log = await readLog(run.runRoot);
      assert.deepEqual(log.extensions, {
        execution_coverage: { schema_version: "1.0" },
        mock_fallback: { schema_version: "1.0" }
      });
      assert.deepEqual(log.events.map(event => event.type), ["workflow_profile", "mock_policy"]);
      assert.deepEqual(log.events[1], {
        type: "mock_policy",
        action: "initial",
        decision,
        decision_source: "user",
        basis: "用户在执行前明确选择",
        sequence: 2,
        at: log.events[1].at
      });
      await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));
    });
  }
});

test("v1.1 AC-02/40: invalid or non-v2 Mock initialization combinations fail closed", async () => {
  await withRoot("runner-v11-invalid-mock-", async root => {
    for (const options of [
      { mockFallback: "allowed" },
      { workflowProfile: "permission-batches-html-v1", mockFallback: "declined" },
      { workflowProfile: "permission-batches-html-v2", mockFallback: "sometimes" }
    ]) {
      await assert.rejects(
        initializeRun({ workspaceRoot: root, casesPath: fixture, ...options }),
        error => error.code === "INPUT_CONTRACT" && /Mock|mock/.test(error.message)
      );
    }
  });
});

test("v1.1 AC-39/40: unknown extension versions reject, while a historical v2 Run without extensions is not migrated", async () => {
  await withRoot("runner-v11-extension-compat-", async root => {
    const unknown = await initializeRun({
      workspaceRoot: root,
      casesPath: fixture,
      workflowProfile: "permission-batches-html-v2"
    });
    const unknownLog = await readLog(unknown.runRoot);
    unknownLog.extensions = { execution_coverage: { schema_version: "9.9" } };
    await writeJsonAtomic(path.join(unknown.runRoot, "execution-log.json"), unknownLog);
    await assert.rejects(validateRun(unknown.runRoot, { checkReport: false }), error =>
      error.code === "RUN_CONSISTENCY" && /扩展|版本/.test(error.message));

    const historical = await initializeRun({
      workspaceRoot: root,
      casesPath: fixture,
      workflowProfile: "permission-batches-html-v2"
    });
    const historicalLog = await readLog(historical.runRoot);
    delete historicalLog.extensions;
    await writeJsonAtomic(path.join(historical.runRoot, "execution-log.json"), historicalLog);
    await assert.doesNotReject(validateRun(historical.runRoot, { checkReport: false }));
    assert.equal((await readLog(historical.runRoot)).extensions, undefined);
  });
});
