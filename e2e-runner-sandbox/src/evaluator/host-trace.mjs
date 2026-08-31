export function classifyHostTrace(trace, classifier) {
  const allowed = new Set(classifier.allowed ?? []);
  const forbidden = new Set(classifier.forbidden ?? []);
  const traceEntries = Array.isArray(trace) ? trace : Array.isArray(trace?.entries) ? trace.entries : [];
  const forcedUntrusted = !Array.isArray(trace) && trace?.provenance === "trusted-reference";
  const entries = traceEntries.map((entry, index) => {
    let classification;
    if (forcedUntrusted || entry.provenance === "trusted-reference") {
      classification = "unknown";
    } else if (entry.actor === "evaluator" && entry.provenance === "manual-evaluator" && allowed.has(entry.tool)) {
      classification = "manual-evaluator";
    } else if (entry.actor === "runner" && allowed.has(entry.tool)) {
      classification = "allowed-browser";
    } else if (forbidden.has(entry.tool)) {
      classification = ["direct_fetch", "raw_request_replay"].includes(entry.tool)
        ? "forbidden-direct-api" : "forbidden-browser-state";
    } else {
      classification = "unknown";
    }
    return { ...entry, sequence: entry.sequence ?? index + 1, class: classification };
  });
  const violations = entries.filter((entry) => [
    "forbidden-direct-api", "forbidden-browser-state", "unknown"
  ].includes(entry.class));
  return {
    version: classifier.version,
    entries,
    violations,
    eligible: violations.length === 0,
    runnerBrowserActions: entries.filter((entry) => entry.class === "allowed-browser").length,
    manualEvaluatorActions: entries.filter((entry) => entry.class === "manual-evaluator").length
  };
}
