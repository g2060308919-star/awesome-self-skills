import assert from "node:assert/strict";
import test from "node:test";

import { aggregateCase } from "../scripts/lib/report.mjs";

test("AC-005/006: four-state aggregation covers precedence and evidence independence", () => {
  const cases = [
    [["passed"], false, "passed"],
    [["passed", "failed"], false, "failed"],
    [["failed", "undetermined"], false, "failed"],
    [["passed", "undetermined"], false, "undetermined"],
    [["not_executed"], true, "not_executed"],
    [[], false, "undetermined"]
  ];
  for (const [results, excluded, expected] of cases) {
    assert.equal(aggregateCase({
      excluded,
      checkpoints: results.map((result, index) => ({
        checkpoint_id: String(index),
        required: true,
        result,
        evidence_status: index % 2 ? "missing" : "complete"
      }))
    }), expected);
  }
});

test("AC-014: screenshot evidence failure does not change product result", () => {
  const complete = aggregateCase({
    checkpoints: [{ required: true, result: "passed", evidence_status: "complete" }]
  });
  const missing = aggregateCase({
    checkpoints: [{ required: true, result: "passed", evidence_status: "missing" }]
  });
  assert.equal(complete, "passed");
  assert.equal(missing, "passed");
});
