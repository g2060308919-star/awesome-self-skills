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

export function normalizeFixture(profile) {
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
    state: structuredClone(profile.fixture)
  };
}
