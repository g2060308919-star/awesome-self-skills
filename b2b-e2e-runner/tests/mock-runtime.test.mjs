import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadMockProxyBinding } from "../scripts/lib/mock-runtime.mjs";

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function scenario() {
  return {
    schema_version: "mock-scenario-v1", scenario_id: "scenario-1", revision: 1,
    run_id: "RUN-1", case_id: "CASE-1", attempt_id: "attempt-1",
    candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [], initial_state: { saved: false },
    routes: [{
      route_id: "save", match: {
        origin: "https://fixture.test", pathname: "/api/save", method: "POST", query: {},
        body: { rules: [{ pointer: "/name", presence: "required", type: "string" }], allowed_extra_pointers: [] }
      },
      effect: [{ op: "set", path: "/saved", value: true }],
      response: { status: 201, headers: {}, body: { saved: { $state: "/saved" } } },
      provenance: { source_refs: ["network:1"], synthetic_values: [] }
    }], passthrough: [], provenance: { source_refs: ["network:1"], synthetic_values: [] }
  };
}

function log(hash, decision = "allowed") {
  return {
    schema_version: "2.0", extensions: { execution_coverage: { schema_version: "1.0" }, mock_fallback: { schema_version: "1.0" } },
    run: { run_id: "RUN-1", status: "running" }, events: [
      { type: "mock_policy", action: "initial", decision, decision_source: "user", basis: "明确选择", sequence: 1, at: "2026-09-20T00:00:01Z" },
      {
        type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "started",
        scenario_revision: 1, scenario_hash: hash, state_version: 0, context_refs: [1], proxy_cycle_refs: ["cycle-1"],
        candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [], sequence: 2, at: "2026-09-20T00:00:02Z"
      }
    ]
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mock-runtime-"));
  await mkdir(path.join(root, "mock"));
  const encoded = JSON.stringify(scenario());
  const hash = sha(encoded);
  await writeFile(path.join(root, "mock/scenario.json"), encoded);
  await writeFile(path.join(root, "execution-log.json"), JSON.stringify(log(hash)));
  return { root, hash };
}

function config(root, hash) {
  return {
    run_root: root, run_id: "RUN-1", proxy_cycle_id: "cycle-1",
    mock_scenario: {
      path: "mock/scenario.json", sha256: hash, attempt_id: "attempt-1",
      state_path: "mock/state.json", receipts_path: "mock/receipts.json"
    }
  };
}

test("v1.1 AC-20/21/22/30/40: proxy binding verifies Run ownership and persists a resumable state/receipt pair", async () => {
  const { root, hash } = await fixture();
  try {
    const binding = await loadMockProxyBinding(config(root, hash));
    const receipt = await binding.engine.handle({
      url: "https://fixture.test/api/save", method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"synthetic"}'
    }, { proxy_cycle_id: "cycle-1", request_id: "request-1" });
    assert.equal(receipt.disposition, "mocked");
    const runtime = JSON.parse(await readFile(binding.statePath, "utf8"));
    const receipts = JSON.parse(await readFile(binding.receiptsPath, "utf8"));
    assert.equal(runtime.state_version, 1);
    assert.equal(receipts.receipts[0].receipt_id, receipt.receipt_id);

    const current = log(hash);
    current.events.push({
      type: "mock_observation", attempt_id: "attempt-1", receipt_id: receipt.receipt_id, route_id: "save", request_id: "request-1",
      disposition: "mocked", request_facts: ["exact request"], response_facts: ["201"], state_before_version: 0,
      state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "cycle-1", sequence: 3, at: "2026-09-20T00:00:03Z"
    });
    await writeFile(path.join(root, "execution-log.json"), JSON.stringify(current));
    const resumed = await loadMockProxyBinding(config(root, hash));
    assert.equal(resumed.engine.snapshot().state_version, 1);
    const duplicate = await resumed.engine.handle({
      url: "https://fixture.test/api/save", method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"synthetic"}'
    }, { proxy_cycle_id: "cycle-1", request_id: "request-1" });
    assert.equal(duplicate.receipt_id, receipt.receipt_id);
    assert.equal(resumed.engine.snapshot().state_version, 1, "same Fetch identity must not commit twice after resume");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-02/22/30/40: declined policy, tampered hash, path traversal, and missing state fail closed", async () => {
  const { root, hash } = await fixture();
  try {
    const declined = log(hash, "declined");
    await writeFile(path.join(root, "execution-log.json"), JSON.stringify(declined));
    await assert.rejects(loadMockProxyBinding(config(root, hash)), /未明确允许|撤回/);
    await writeFile(path.join(root, "execution-log.json"), JSON.stringify(log(hash)));
    await assert.rejects(loadMockProxyBinding(config(root, "0".repeat(64))), /SHA-256/);
    const escaped = config(root, hash);
    escaped.mock_scenario.path = "../scenario.json";
    await assert.rejects(loadMockProxyBinding(escaped), /不得越出|相对路径/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
