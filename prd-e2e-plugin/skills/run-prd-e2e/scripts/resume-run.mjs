#!/usr/bin/env node

import path from "node:path";

import { requireCondition } from "./lib/errors.mjs";
import { nextRecoveryAction, validateRecoveryTarget } from "./lib/recovery.mjs";
import { loadRun } from "./run.mjs";

async function main() {
  const index = process.argv.indexOf("--run");
  requireCondition(index >= 0 && process.argv[index + 1], "INPUT_CONTRACT", "resume-run requires --run.");
  const loaded = await loadRun(path.resolve(process.argv[index + 1]));
  const action = await validateRecoveryTarget(nextRecoveryAction(loaded.state));
  process.stdout.write(`${JSON.stringify(action)}\n`);
}

main().catch(error => {
  process.stdout.write(`${JSON.stringify({ error: { code: error?.code ?? "RUN_INTEGRITY", message: error?.message ?? "Resume failed." } })}\n`);
  process.exitCode = 1;
});
