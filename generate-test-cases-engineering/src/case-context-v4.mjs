import { canonicalArtifactSnapshot, digest } from './canonical.mjs';
import { compileCaseAuthoringContext } from './v4-pipeline.mjs';

/** Bind existing semantic results to the accepted run; never changes semantic IDs.
 * @param {any} artifacts @param {any} system @param {string} runId @returns {any} */
export function compileBoundCaseContext(artifacts, system, runId) {
  const upstream = Object.fromEntries(['source_pack', 'evidence_claims', 'behavior_views'].map(key => [key, artifacts[key]]));
  const result = compileCaseAuthoringContext(upstream, system);
  if (result.status !== 'authoring') return result;
  const context = {
    run_id: runId, source_revision: artifacts.source_pack.source_revision,
    basis: Object.fromEntries(Object.entries(upstream).map(([key, value]) => [
      `${key}_digest`, `sha256:${digest(canonicalArtifactSnapshot(value))}`
    ])),
    facts: result.evidence.fact_ledger, fact_modules: result.behavior.fact_modules,
    modules: result.evidence.scope_manifest.modules, outcomes: result.behavior.outcomes,
    formal_test_points: result.behavior.formal_test_points,
    supporting_observations: result.behavior.supporting_observations,
    ordering_registry: result.orderingRegistry
  };
  return { status: 'authoring', context: { ...context, context_digest: `sha256:${digest(context)}` } };
}
