#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { createControlClient } from "../src/control/client.mjs";
import { readRuntimeFiles } from "../src/control/runtime-files.mjs";
import { SandboxError } from "../src/shared/errors.mjs";

const OPTION_NAMES = Object.freeze({
  "--runtime": "runtimeDirectory",
  "--profile": "profileId",
  "--kind": "kind",
  "--account-id": "accountId",
  "--role": "role",
  "--session-id": "sessionId",
  "--approval-id": "approvalId",
  "--decision": "decision",
  "--actor": "actor"
});

const COMMAND_OPTIONS = Object.freeze({
  status: ["runtimeDirectory"],
  prepare: ["runtimeDirectory", "profileId"],
  reset: ["runtimeDirectory", "profileId"],
  snapshot: ["runtimeDirectory", "kind"],
  events: ["runtimeDirectory"],
  outbox: ["runtimeDirectory"],
  canaries: ["runtimeDirectory"],
  fault: ["runtimeDirectory"],
  "expire-session": ["runtimeDirectory", "sessionId"],
  "set-role": ["runtimeDirectory", "accountId", "role"],
  "external-action": ["runtimeDirectory", "approvalId", "decision", "actor"],
  stop: ["runtimeDirectory"]
});

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMAND_OPTIONS, command)) {
    throw new SandboxError("CLI_ARGUMENT_INVALID", "Unknown evaluator command");
  }
  if (rest.length % 2 !== 0) {
    throw new SandboxError("CLI_ARGUMENT_INVALID", "Every option requires a value");
  }
  const parsed = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = OPTION_NAMES[rest[index]];
    if (!name || !COMMAND_OPTIONS[command].includes(name) || parsed[name] !== undefined) {
      throw new SandboxError("CLI_ARGUMENT_INVALID", `Unsupported or duplicate option: ${rest[index]}`);
    }
    parsed[name] = rest[index + 1];
  }
  for (const required of COMMAND_OPTIONS[command]) {
    if (!parsed[required]) {
      throw new SandboxError("CLI_ARGUMENT_INVALID", `Missing required option: ${required}`);
    }
  }
  const { runtimeDirectory, ...args } = parsed;
  return { command, runtimeDirectory, args };
}

export async function runEvaluatorCli(argv, options = {}) {
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  try {
    const parsed = parseArguments(argv);
    const runtime = await (options.readRuntimeFiles ?? readRuntimeFiles)(parsed.runtimeDirectory);
    const client = (options.clientFactory ?? createControlClient)({
      socketPath: runtime.socketPath,
      token: runtime.token
    });
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
