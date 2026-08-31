import { SandboxError } from "../shared/errors.mjs";

const REQUIRED_ARRAYS = [
  "accounts",
  "customers",
  "projects",
  "approvals",
  "sessions",
  "businessAudit",
  "oracleEvents",
  "outbox",
  "delayedJobs"
];

function materializeRunScopedFixture(value, runId) {
  if (Array.isArray(value)) return value.map((item) => materializeRunScopedFixture(item, runId));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, child]) => [key, materializeRunScopedFixture(child, runId)]
    ));
  }
  if (typeof value === "string" && value.includes("{{runId}}")) {
    if (value !== "Bench-{{runId}}" || typeof runId !== "string" || runId.length === 0) {
      throw new SandboxError("FIXTURE_INVALID", "Fixture runId placeholder is not allowlisted");
    }
    return `Bench-${runId}`;
  }
  return value;
}

export function normalizeFixture(profile, runId) {
  if (!profile || typeof profile !== "object" || typeof profile.profileId !== "string") {
    throw new SandboxError("FIXTURE_INVALID", "Profile metadata is incomplete");
  }
  if (!profile.fixture || typeof profile.fixture !== "object") {
    throw new SandboxError("FIXTURE_INVALID", "Profile fixture is required");
  }
  if (!profile.fixture.tenant || typeof profile.fixture.tenant.id !== "string") {
    throw new SandboxError("FIXTURE_INVALID", "Fixture tenant is required");
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(profile.fixture[key])) {
      throw new SandboxError("FIXTURE_INVALID", `Fixture ${key} must be an array`);
    }
  }

  const ids = new Set();
  for (const collection of ["accounts", "customers", "projects", "approvals"]) {
    for (const entity of profile.fixture[collection]) {
      if (!entity || typeof entity.id !== "string" || ids.has(`${collection}:${entity.id}`)) {
        throw new SandboxError("FIXTURE_INVALID", `Fixture ${collection} identifiers must be unique`);
      }
      ids.add(`${collection}:${entity.id}`);
    }
  }

  return {
    metadata: {
      profileId: profile.profileId,
      fixtureVersion: profile.fixtureVersion,
      uiVariant: profile.uiVariant,
      randomSeed: profile.randomSeed,
      locale: profile.locale,
      timezone: profile.timezone,
      protectedRecords: structuredClone(profile.protectedRecords ?? []),
      allowedMutations: structuredClone(profile.allowedMutations ?? []),
      fault: structuredClone(profile.fault ?? null)
    },
    state: materializeRunScopedFixture(profile.fixture, runId)
  };
}
