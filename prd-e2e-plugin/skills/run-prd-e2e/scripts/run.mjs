#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson } from "./lib/atomic-json.mjs";
import { fail, requireCondition } from "./lib/errors.mjs";
import { initialState, transitionState, validateWorkflowState } from "./lib/state-machine.mjs";
import { validateRequest } from "./lib/contracts.mjs";

const RUN_ID = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/;

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  return `${timestamp}-${randomBytes(6).toString("hex")}`;
}

async function requireRegularFile(filePath) {
  let stat;
  try {
    stat = await lstat(filePath);
  } catch {
    fail("RUN_INTEGRITY", `Required Run artifact is missing: ${path.basename(filePath)}.`);
  }
  requireCondition(stat.isFile() && !stat.isSymbolicLink(), "RUN_INTEGRITY", `Run artifact is not a regular file: ${path.basename(filePath)}.`);
}

async function parseJsonFile(filePath) {
  await requireRegularFile(filePath);
  const text = await readFile(filePath, "utf8");
  try {
    return { value: JSON.parse(text), text };
  } catch {
    fail("RUN_INTEGRITY", `Run artifact is not valid JSON: ${path.basename(filePath)}.`);
  }
}

async function validateRunRoot(runRoot) {
  requireCondition(typeof runRoot === "string" && path.isAbsolute(runRoot), "RUN_INTEGRITY", "Run root must be absolute.");
  let stat;
  try {
    stat = await lstat(runRoot);
  } catch {
    fail("RUN_INTEGRITY", "Outer Run root does not exist.");
  }
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), "RUN_INTEGRITY", "Outer Run root is unsafe.");
  const canonical = await realpath(runRoot);
  requireCondition(canonical === path.resolve(runRoot), "RUN_INTEGRITY", "Outer Run root must use its canonical path.");
  requireCondition(RUN_ID.test(path.basename(canonical)), "RUN_INTEGRITY", "Outer Run root has an invalid identity.");
  return canonical;
}

export async function createRun({ workspaceRoot, request }) {
  requireCondition(typeof workspaceRoot === "string" && path.isAbsolute(workspaceRoot), "INPUT_CONTRACT", "workspaceRoot must be absolute.");
  const canonicalWorkspace = await realpath(workspaceRoot).catch(() => fail("INPUT_CONTRACT", "workspaceRoot must exist."));
  const normalizedRequest = validateRequest(request);
  const runsRoot = path.join(canonicalWorkspace, "e2e-runs");
  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  const runsRootStat = await lstat(runsRoot).catch(() => fail("RUN_INTEGRITY", "Outer Run container is missing."));
  requireCondition(runsRootStat.isDirectory() && !runsRootStat.isSymbolicLink(), "RUN_INTEGRITY", "Outer Run container is unsafe.");
  requireCondition(await realpath(runsRoot) === path.resolve(runsRoot), "RUN_INTEGRITY", "Outer Run container must use its canonical path.");

  let runId;
  let runRoot;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    runId = createRunId();
    runRoot = path.join(runsRoot, runId);
    try {
      await mkdir(runRoot, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === 7) throw error;
    }
  }

  const requestPath = path.join(runRoot, "request.json");
  const statePath = path.join(runRoot, "workflow-state.json");
  const state = initialState({ runId });
  await atomicWriteJson(requestPath, normalizedRequest);
  const stateWrite = await atomicWriteJson(statePath, state);
  return {
    run_id: runId,
    run_root: runRoot,
    request_path: requestPath,
    state_path: statePath,
    stage: state.stage,
    next_action: state.next_action,
    state_text: stateWrite.text
  };
}

export async function loadRun(runRoot) {
  const canonical = await validateRunRoot(runRoot);
  const requestPath = path.join(canonical, "request.json");
  const statePath = path.join(canonical, "workflow-state.json");
  const [requestRead, stateRead] = await Promise.all([parseJsonFile(requestPath), parseJsonFile(statePath)]);
  const request = validateRequest(requestRead.value);
  const state = validateWorkflowState(stateRead.value, { expectedRunId: path.basename(canonical) });
  return {
    run_root: canonical,
    request,
    state,
    request_text: requestRead.text,
    state_text: stateRead.text
  };
}

async function acquireLock(runRoot) {
  const lockPath = path.join(runRoot, ".workflow.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if (error?.code === "EEXIST") fail("RUN_BUSY", "The outer Run is already being updated.");
    throw error;
  }
  return async () => {
    await handle.close();
    await unlink(lockPath).catch(() => {});
  };
}

export async function applyTransition({ runRoot, event }) {
  const canonical = await validateRunRoot(runRoot);
  const release = await acquireLock(canonical);
  try {
    const loaded = await loadRun(canonical);
    const next = transitionState(loaded.state, event);
    if (next !== loaded.state && JSON.stringify(next) !== JSON.stringify(loaded.state)) {
      await atomicWriteJson(path.join(canonical, "workflow-state.json"), next);
    }
    return next;
  } finally {
    await release();
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    requireCondition(key?.startsWith("--") && rest[index + 1] !== undefined, "INPUT_CONTRACT", "CLI flags must use --name value pairs.");
    flags[key.slice(2)] = rest[index + 1];
  }
  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  let result;
  if (command === "create") {
    requireCondition(flags.workspace && flags.request, "INPUT_CONTRACT", "create requires --workspace and --request.");
    result = await createRun({ workspaceRoot: path.resolve(flags.workspace), request: JSON.parse(await readFile(flags.request, "utf8")) });
  } else if (command === "transition") {
    requireCondition(flags.run && flags.event, "INPUT_CONTRACT", "transition requires --run and --event.");
    result = await applyTransition({ runRoot: path.resolve(flags.run), event: JSON.parse(await readFile(flags.event, "utf8")) });
  } else if (command === "inspect") {
    requireCondition(flags.run, "INPUT_CONTRACT", "inspect requires --run.");
    result = await loadRun(path.resolve(flags.run));
  } else {
    fail("INPUT_CONTRACT", "Command must be create, transition, or inspect.");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) {
  main().catch(error => {
    process.stdout.write(`${JSON.stringify({ error: { code: error.code ?? "RUN_INTEGRITY", message: error.message } })}\n`);
    process.exitCode = 1;
  });
}
