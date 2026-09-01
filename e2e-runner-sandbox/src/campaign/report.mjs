function percent(value) {
  return value === undefined || value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function renderCampaignMarkdown(summary) {
  const lines = [
    `# ${summary.kind === "release" ? "Release Matrix" : "Calibration"} summary`,
    "",
    `- Decision: ${summary.conclusion}`,
    `- Runner: ${summary.runner.version} (${summary.runner.digest})`,
    `- Bundle: ${summary.bundleVersion}`,
    `- Completed: ${summary.completedUnits} / ${summary.plannedUnits}`,
    `- Summary digest: ${summary.summaryDigest}`
  ];
  if (summary.aggregate) {
    lines.push(
      "",
      "## Score and metrics",
      "",
      `- Official score: ${summary.aggregate.score}`,
      `- Diagnostic score: ${summary.aggregate.diagnosticScore}`,
      `- Case verdict correctness: ${percent(summary.aggregate.metrics.caseVerdictCorrectness)}`,
      `- Fault attribution: ${percent(summary.aggregate.metrics.faultAttributionRate)}`,
      `- Artifact consistency: ${percent(summary.aggregate.metrics.artifactConsistencyRate)}`,
      `- Flake rate: ${percent(summary.aggregate.metrics.flakeRate)}`,
      `- False Passed injected failures: ${summary.aggregate.metrics.falsePassedInjectedFailures}`,
      `- Key Profiles satisfied: ${summary.aggregate.keyProfilesSatisfied ? "yes" : "no"}`
    );
    lines.push("", "### Scoring dimensions", "");
    for (const [category, ratio] of Object.entries(summary.aggregate.ratios)) {
      const counts = summary.aggregate.ratioCounts?.[category];
      lines.push(`- ${category}: ${percent(ratio)} (${counts?.passed ?? "n/a"} / ${counts?.total ?? "n/a"}; weight ${summary.weights?.[category] ?? "n/a"})`);
    }
    lines.push("", "### Key Profiles", "");
    for (const profile of summary.aggregate.keyProfiles ?? []) {
      lines.push(`- ${profile.profileId}: ${profile.passed} / ${profile.required} passed (${profile.total} observed)`);
    }
    lines.push(
      "",
      "### Thresholds",
      "",
      `- Overall: ${summary.thresholds?.overall ?? "n/a"}`,
      `- Case verdict correctness: ${percent(summary.thresholds?.caseVerdictCorrectness)}`,
      `- Fault attribution: ${percent(summary.thresholds?.faultAttribution)}`,
      `- Artifact consistency: ${percent(summary.thresholds?.artifactConsistency)}`,
      `- Maximum flake rate: ${percent(summary.thresholds?.flakeRate)}`,
      "",
      "### Hard gates",
      ""
    );
    if (summary.aggregate.gateFailures.length === 0) lines.push("None.");
    else for (const gate of summary.aggregate.gateFailures) lines.push(`- ${gate.id}: ${gate.message}`);
    lines.push("", "### Flaky groups", "");
    const flaky = summary.aggregate.stabilityGroups.filter(({ passed }) => !passed);
    if (flaky.length === 0) lines.push("None.");
    else for (const group of flaky) lines.push(`- ${group.group}: ${group.flaky} / ${group.repetitions} flaky`);
  }
  lines.push("", "## Failures", "");
  if (summary.failures.length === 0) lines.push("None.");
  else for (const item of summary.failures) {
    lines.push(`- [${item.domain}] ${item.code}${item.unitId ? ` (${item.unitId})` : ""}: ${item.message}`);
  }
  lines.push("", "## Next step", "");
  if (summary.conclusion === "pass") {
    lines.push(summary.kind === "calibration"
      ? "Create the matching Release Matrix campaign."
      : "Proceed to the controlled real non-production pilot.");
  } else if (summary.conclusion === "incomplete") {
    lines.push("Run the listed missing execution units without changing the precommitted plan.");
  } else {
    lines.push("Correct the listed failures and rerun only the affected precommitted units with fresh run and Host session identities.");
  }
  return `${lines.join("\n")}\n`;
}
