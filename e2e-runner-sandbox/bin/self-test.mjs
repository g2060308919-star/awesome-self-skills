#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { verifyBundleDigests } from "./bundle-digests.mjs";
import { createBusinessServer } from "../src/business/server.mjs";
import { createRuntimeFiles } from "../src/control/runtime-files.mjs";
import { createControlServer } from "../src/control/server.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";
import { validateSyntheticData } from "../src/security/data-policy.mjs";
import { runIsolationProbes } from "../src/security/isolation-probes.mjs";
import { installOutboundGuard } from "../src/security/outbound-guard.mjs";
import { runRunnerEnvironmentProbe } from "../src/security/runner-environment-probe.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function check(name, passed, details = {}) {
  return { name, passed: Boolean(passed), details };
}

export async function runSelfTest() {
  const checks = [];
  let control;
  let business;
  let runtime;
  let guard;
  let probeDirectory;
  try {
    const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");
    const digests = await verifyBundleDigests();
    checks.push(check("bundle-digests", Object.keys(digests).length > 0, { files: Object.keys(digests).length }));
    const profile = bundle.profiles.find(({ profileId }) => profileId === "B06");
    const fixtureViolations = validateSyntheticData(profile.fixture);
    checks.push(check("synthetic-data-policy", fixtureViolations.length === 0, { violations: fixtureViolations }));

    const coordinator = createRunCoordinator({ runIdFactory: () => "self-test-run" });
    await coordinator.prepare(profile);
    const operations = createBusinessOperations({ coordinator, entityIdFactory: () => "APR-SELF-TEST" });
    business = createBusinessServer({ coordinator, operations });
    const address = await business.listen();
    runtime = await createRuntimeFiles({ businessUrl: address.origin });
    control = createControlServer({
      coordinator,
      operations,
      socketPath: runtime.socketPath,
      token: runtime.token,
      profileResolver: async (profileId) => {
        const resolved = bundle.profiles.find((entry) => entry.profileId === profileId);
        if (!resolved) throw new Error("Profile not found");
        return resolved;
      },
      onStop: () => undefined
    });
    await control.listen();
    guard = installOutboundGuard({
      allowedHosts: ["127.0.0.1", "::1"],
      allowedSocketPaths: [runtime.socketPath]
    });

    checks.push(...await runIsolationProbes({ ...runtime, businessUrl: address.origin }));

    const login = await operations.login("acct-operator", { provenance: "manual-evaluator" });
    const submitted = await operations.submitApproval({ sessionId: login.session.id }, {
      targetType: "project", targetId: "PRJ-1001", action: "activate"
    });
    const outbox = coordinator.read().outbox;
    checks.push(check(
      "outbox-only",
      submitted.ok && outbox.length === 1 && outbox[0].kind === "approval-requested" &&
        validateSyntheticData(outbox).length === 0,
      { count: outbox.length, kind: outbox[0]?.kind }
    ));

    probeDirectory = await mkdtemp(join(tmpdir(), "sandbox-runner-probe-"));
    const artifactDirectory = join(probeDirectory, "artifacts");
    const inputPath = join(probeDirectory, "runner-input.json");
    await mkdir(artifactDirectory);
    await writeFile(inputPath, `${JSON.stringify(profile.runnerInput)}\n`);
    const permissionProbe = await runRunnerEnvironmentProbe({
      inputPath,
      artifactDirectory,
      bundlePath: join(packageRoot, "benchmark", "v1", "bundle.json"),
      oraclePath: join(packageRoot, "benchmark", "v1", "oracles", "index.json"),
      capabilityPath: runtime.capabilityPath,
      socketPath: runtime.socketPath
    });
    const denied = ["bundle", "oracle", "capability", "socket"].every(
      (name) => permissionProbe[name].allowed === false && permissionProbe[name].code === "ERR_ACCESS_DENIED"
    );
    checks.push(check(
      "runner-filesystem-isolation",
      permissionProbe.input.allowed && permissionProbe.artifactWrite.allowed && denied,
      permissionProbe
    ));
  } catch (error) {
    checks.push(check("self-test-internal", false, {
      code: error.code ?? "SELF_TEST_FAILED",
      message: error.message,
      causeCode: error.cause?.code ?? null,
      causeMessage: error.cause?.message ?? null,
      targetClass: error.cause?.targetClass ?? error.targetClass ?? null,
      destination: error.cause?.destination ?? error.destination ?? null
    }));
  } finally {
    await control?.close().catch(() => undefined);
    await business?.close().catch(() => undefined);
    guard?.restore();
    if (runtime?.runtimeDirectory) await rm(runtime.runtimeDirectory, { recursive: true, force: true });
    if (probeDirectory) await rm(probeDirectory, { recursive: true, force: true });
  }
  return {
    passed: checks.length > 0 && checks.every(({ passed }) => passed),
    checks,
    environment: { node: process.version, platform: process.platform, businessBind: "127.0.0.1", controlTransport: "unix-socket" }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runSelfTest();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
}
