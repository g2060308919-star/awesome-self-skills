#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBusinessServer } from "../src/business/server.mjs";
import { createControlServer } from "../src/control/server.mjs";
import { createRuntimeFiles } from "../src/control/runtime-files.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";
import { SandboxError } from "../src/shared/errors.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function loadProfile(profileId) {
  if (!/^(?:B(?:0[1-9]|1[0-8])(?:-[a-z-]+)?|H0[12])$/.test(profileId)) {
    throw new SandboxError("PROFILE_ID_INVALID", "Profile ID is not allowlisted");
  }
  const profilePath = join(packageRoot, "benchmark", "v1", "profiles", `${profileId}.json`);
  const fixturePath = join(packageRoot, "benchmark", "v1", "fixtures", "core-v1.json");
  const [profile, fixture] = await Promise.all([
    JSON.parse(await readFile(profilePath, "utf8")),
    JSON.parse(await readFile(fixturePath, "utf8"))
  ]);
  return { ...profile, fixture };
}

const coordinator = createRunCoordinator();
const operations = createBusinessOperations({ coordinator });
const business = createBusinessServer({ coordinator, operations });
const address = await business.listen();
const runtime = await createRuntimeFiles({ businessUrl: address.origin });
let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await control.close();
  await business.close();
}

const control = createControlServer({
  coordinator,
  operations,
  socketPath: runtime.socketPath,
  token: runtime.token,
  profileResolver: loadProfile,
  onStop: () => setImmediate(() => shutdown())
});
await control.listen();

process.stdout.write(`${JSON.stringify({
  service: "e2e-runner-evaluation-sandbox",
  businessUrl: address.origin,
  runtimeDirectory: runtime.runtimeDirectory,
  pid: process.pid
})}\n`);

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
