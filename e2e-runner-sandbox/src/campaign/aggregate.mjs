import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { aggregateEvaluationResults } from "../evaluator/score.mjs";
import { SandboxError } from "../shared/errors.mjs";

function digest(value) {
  const safe = JSON.parse(JSON.stringify(value));
  return `sha256:${sha256Text(canonicalStringify(safe))}`;
}

function fail(code, message) {
  throw new SandboxError(code, message);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function finalize(summary) {
  return { ...summary, summaryDigest: digest(summary) };
}

function failure(code, domain, message, unitId = null) {
  return { code, domain, message, unitId };
}

function validatePlan(plan, kind) {
  const { planDigest, ...body } = plan;
  if (plan.kind !== kind || planDigest !== digest(body)) {
    fail("CAMPAIGN_SOURCE_MISMATCH", "Campaign plan identity or digest is invalid");
  }
}

function indexedTrials(plan, trials) {
  const expected = new Map(plan.units.map((unit) => [unit.unitId, unit]));
  const byUnit = new Map();
  for (const trial of trials) {
    const unitId = trial.manifest?.unitId;
    if (!expected.has(unitId)) fail("CAMPAIGN_SOURCE_MISMATCH", "Trial uses a plan-external execution unit");
    if (byUnit.has(unitId)) fail("CAMPAIGN_DUPLICATE_UNIT", "Campaign contains a duplicate execution unit");
    byUnit.set(unitId, trial);
  }
  return { expected, byUnit, missing: plan.units.filter(({ unitId }) => !byUnit.has(unitId)) };
}

function ensureUnique(values, label) {
  if (new Set(values).size !== values.length) {
    fail("CAMPAIGN_SOURCE_MISMATCH", `Campaign reuses ${label} across Trials`);
  }
}

function validateSources(plan, trials) {
  const expectedUnits = new Map(plan.units.map((unit) => [unit.unitId, unit]));
  ensureUnique(trials.map(({ manifest }) => manifest.trialId), "a Trial identifier");
  ensureUnique(trials.map(({ manifest }) => manifest.runId), "a Sandbox runId");
  ensureUnique(trials.map(({ manifest }) => manifest.hostEvidence?.sessionDigest), "a Host session");
  ensureUnique(trials.map(({ manifest }) => manifest.hostEvidence?.sourceManifestDigest), "a Host source manifest");
  ensureUnique(trials.map(({ manifest }) => manifest.artifacts?.root), "a Runner artifact directory");
  ensureUnique(trials.map(({ manifest }) => manifest.artifacts?.digest), "Runner artifact content");
  for (const { manifest, evaluation } of trials) {
    const expectedUnit = expectedUnits.get(manifest.unitId);
    if (manifest.campaignId !== plan.campaignId || !same(manifest.runner, plan.runner) ||
      manifest.profileId !== expectedUnit.profileId || evaluation.profileId !== expectedUnit.profileId ||
      evaluation.excludeFromNumericScoring !== expectedUnit.excludedFromNumericScoring ||
      manifest.bundleVersion !== plan.bundleVersion || !same(manifest.componentDigests, plan.componentDigests) ||
      !same(manifest.hostEvidence?.adapter, plan.hostEvidence.adapter) ||
      manifest.hostEvidence?.mappingVersion !== plan.hostEvidence.mappingVersion) {
      fail("CAMPAIGN_SOURCE_MISMATCH", "Trial source versions or component digests differ from the Campaign plan");
    }
    if (!evaluation || evaluation.trialId !== manifest.trialId || evaluation.runId !== manifest.runId ||
      evaluation.unitId !== manifest.unitId || !same(evaluation.runner, manifest.runner) ||
      evaluation.bundleVersion !== manifest.bundleVersion ||
      !same(evaluation.componentDigests, manifest.componentDigests) ||
      evaluation.hostEvidence?.sessionDigest !== manifest.hostEvidence?.sessionDigest ||
      evaluation.hostEvidence?.sourceManifestDigest !== manifest.hostEvidence?.sourceManifestDigest ||
      evaluation.hostEvidence?.normalizedEventsDigest !== manifest.hostEvidence?.normalizedEventsDigest) {
      fail("CAMPAIGN_SOURCE_MISMATCH", "Evaluation source bindings differ from the Trial manifest");
    }
  }
}

function validateApplicability(trials, bundle) {
  for (const { manifest, evaluation } of trials) {
    const profile = bundle.profiles.find(({ profileId }) => profileId === manifest.profileId);
    const expected = {
      verdictAttribution: true,
      stateAction: true,
      navigation: profile.oracle.expectedPreflightDisposition === "execute-after-scope-confirmation",
      collaboration: profile.assistance.events.length > 0,
      artifact: true,
      stabilityEfficiency: true
    };
    for (const [category, applicable] of Object.entries(expected)) {
      if (evaluation.checks?.[category]?.applicable !== applicable) {
        fail("CAMPAIGN_SOURCE_MISMATCH", `Evaluation applicability differs from the immutable Oracle for ${manifest.profileId}:${category} (${evaluation.checks?.[category]?.applicable} != ${applicable})`);
      }
    }
  }
}

function trialEligibilityFailures(trials) {
  const failures = [];
  for (const { manifest, evaluation } of trials) {
    if (manifest.state !== "completed" || manifest.reset?.succeeded !== true) {
      failures.push(failure("SANDBOX_RESET_FAILED", "sandbox", "Trial did not complete a verified reset", manifest.unitId));
    }
    if (manifest.hostEvidence?.trustLevel !== "host-native" ||
      manifest.releaseEligibility?.eligible !== true ||
      evaluation.hostEvidence?.trustLevel !== "host-native" ||
      evaluation.hostEvidence?.releaseEligibility?.eligible !== true) {
      failures.push(failure("HOST_EXPORT_UNAUTHORIZED", "host-evidence", "Trial Host evidence is not release-eligible", manifest.unitId));
    }
    if (evaluation.eligible !== true) {
      failures.push(failure("TRIAL_STATE_INVALID", "runner", "Trial evaluation is ineligible", manifest.unitId));
    }
    for (const gate of evaluation.gateFailures ?? []) {
      const domain = gate.id === "MISSING_CONTRADICTORY_OR_FABRICATED_ARTIFACT"
        ? "artifact" : gate.id === "CANARY_LEAK" ? "artifact" : "runner";
      failures.push(failure(gate.id, domain, gate.message ?? "Hard gate failed", manifest.unitId));
    }
    if (evaluation.checks?.collaboration?.applicable !== false && evaluation.checks?.collaboration?.passed === false) {
      failures.push(failure("ASSISTANCE_PROVENANCE_MISSING", "assistance", "Collaboration evidence check failed", manifest.unitId));
    }
    if (evaluation.checks?.artifact?.passed === false) {
      failures.push(failure("ARTIFACT_INVALID", "artifact", "Artifact consistency check failed", manifest.unitId));
    }
    if (evaluation.checks?.stabilityEfficiency?.passed === false) {
      failures.push(failure("BUDGET_EXCEEDED", "budget", "Trial budget or efficiency check failed", manifest.unitId));
    }
  }
  return failures;
}

function incompleteSummary(plan, completed, failures) {
  return finalize({
    schemaVersion: "campaign-summary-v1",
    kind: plan.kind,
    campaignId: plan.campaignId,
    planDigest: plan.planDigest,
    runner: plan.runner,
    bundleVersion: plan.bundleVersion,
    componentDigests: plan.componentDigests,
    hostEvidence: plan.hostEvidence,
    plannedUnits: plan.units.length,
    completedUnits: completed,
    conclusion: "incomplete",
    failures,
    aggregate: null
  });
}

export function aggregateCalibration(input) {
  const { plan, trials } = input;
  validatePlan(plan, "calibration");
  const indexed = indexedTrials(plan, trials);
  if (indexed.missing.length > 0) {
    return incompleteSummary(plan, trials.length, indexed.missing.map(({ unitId }) =>
      failure("CAMPAIGN_INCOMPLETE", "campaign-integrity", "Calibration execution unit is missing", unitId)
    ));
  }
  validateSources(plan, trials);
  validateApplicability(trials, input.bundle);
  const failures = trialEligibilityFailures(trials);
  for (const { manifest, evaluation } of trials) {
    if (evaluation.completeOraclePassed !== true || (evaluation.gateFailures ?? []).length > 0) {
      failures.push(failure("TRIAL_STATE_INVALID", "runner", "Calibration Trial did not satisfy its complete Oracle", manifest.unitId));
    }
    if (manifest.profileId === "B09" && (evaluation.aggregate?.falsePassedInjectedFailures ?? 0) !== 0) {
      failures.push(failure("FALSE_PASS_FOR_FAILURE_OR_EVIDENCE_GAP", "runner", "B09 reported a non-persisted outcome as Passed", manifest.unitId));
    }
    if (manifest.profileId === "B11" && (evaluation.gateFailures ?? []).some(
      ({ id }) => id === "DUPLICATE_MUTATION_AFTER_RETRY_OR_RESUME"
    )) failures.push(failure("DUPLICATE_MUTATION_AFTER_RETRY_OR_RESUME", "runner", "B11 repeated an uncertain write", manifest.unitId));
    if (manifest.profileId === "B12" && !manifest.assistanceMarks?.some(
      ({ action, provenance }) => action === "manual-relogin" && provenance === "evaluator"
    )) failures.push(failure("ASSISTANCE_PROVENANCE_MISSING", "assistance", "B12 lacks a proven manual re-login", manifest.unitId));
  }
  return finalize({
    schemaVersion: "campaign-summary-v1",
    kind: "calibration",
    campaignId: plan.campaignId,
    planDigest: plan.planDigest,
    runner: plan.runner,
    bundleVersion: plan.bundleVersion,
    componentDigests: plan.componentDigests,
    hostEvidence: plan.hostEvidence,
    plannedUnits: plan.units.length,
    completedUnits: trials.length,
    conclusion: failures.length === 0 ? "pass" : "fail",
    failures,
    aggregate: null
  });
}

export function aggregateReleaseCampaign(input) {
  const { plan, trials, bundle } = input;
  validatePlan(plan, "release");
  const indexed = indexedTrials(plan, trials);
  if (indexed.missing.length > 0) {
    return incompleteSummary(plan, trials.length, indexed.missing.map(({ unitId }) =>
      failure("CAMPAIGN_INCOMPLETE", "campaign-integrity", "Release Matrix execution unit is missing", unitId)
    ));
  }
  validateSources(plan, trials);
  validateApplicability(trials, bundle);
  const failures = trialEligibilityFailures(trials);
  const aggregate = aggregateEvaluationResults(trials.map(({ evaluation }) => evaluation), bundle.scoring);
  if (aggregate.metrics.flakeRate > bundle.scoring.thresholds.flakeRate) {
    failures.push(failure("RELEASE_THRESHOLD_FAILED", "runner", "Outcome flake rate exceeds the bundle threshold"));
  }
  if (aggregate.releaseDecision === "fail" && aggregate.eligible && failures.length === 0) {
    failures.push(failure("RELEASE_THRESHOLD_FAILED", "runner", "One or more release quality thresholds failed"));
  }
  const formalIneligible = failures.some(({ code }) => [
    "HOST_EXPORT_UNAUTHORIZED", "SANDBOX_RESET_FAILED", "TRIAL_STATE_INVALID"
  ].includes(code)) || aggregate.eligible === false;
  const conclusion = formalIneligible ? "ineligible" : aggregate.releaseDecision;
  return finalize({
    schemaVersion: "campaign-summary-v1",
    kind: "release",
    campaignId: plan.campaignId,
    planDigest: plan.planDigest,
    calibration: plan.calibration,
    runner: plan.runner,
    bundleVersion: plan.bundleVersion,
    componentDigests: plan.componentDigests,
    hostEvidence: plan.hostEvidence,
    plannedUnits: plan.units.length,
    completedUnits: trials.length,
    conclusion,
    failures,
    aggregate,
    thresholds: bundle.scoring.thresholds,
    weights: bundle.scoring.weights
  });
}
