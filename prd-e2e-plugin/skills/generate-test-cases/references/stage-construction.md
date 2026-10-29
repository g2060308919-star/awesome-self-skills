# Construct the four stage candidates

Use the public bundle's asynchronous `prepareStageArtifact` only for a validated
Runner reply advertising `write_stage_artifact` or `revise_artifact` for one of
`source_pack`, `evidence_claims`, `behavior_views`, `case_drafts`.

```js
const api = await import(absoluteInstalledCompilerUrl);
const reply = await api.advanceStrict(runDirectory);
// Read the advertised Schema and matching semantic policy first.
const prepared = await api.prepareStageArtifact(runDirectory, reply, {
  stage: reply.stage,
  payload: semanticPayload
});
if (prepared.status === 'invalid') {
  // Correct the reported code/path/message; preserve accepted state.
  reportConstructionDiagnostics(prepared.diagnostics);
} else {
  // Use the fixed staging file for this stage, then invoke advanceStrict again.
  const files = {source_pack: 'source-pack.json', evidence_claims: 'evidence-claims.json',
    behavior_views: 'behavior-views.json', case_drafts: 'case-drafts.json'};
  await writeFile(path.join(runDirectory, 'staging', files[prepared.stage]),
    JSON.stringify(prepared.artifact));
}
```

The helper is read-only: no locks are taken for acceptance, no run is created,
no staging/accepted/output file is written. `prepared` means a candidate passed
construction checks. Runner acceptance, review and formal delivery still follow.
Use `constructV4Action`, source preparation/collection/material helpers, and
`constructIndependentReviewCompletionV4` for their existing controlled actions.
A material request, business question, finished/cancelled/fatal reply, or mismatched
stage is not a stage-writing authorization.

Supply semantic fields only. The helper fills `schema_version`, `source_revision`,
Source Pack `run_instance_id`, and Case Draft `case_context_digest`. Supplying
these reserved fields or unknown properties is an error; they are never silently
replaced or dropped. Agent-local `case_id`, step IDs and oracle IDs remain authored
labels and must be nonempty/unique at their existing scope. They do not replace
compiler-generated formal CASE identity.

For cases, read the complete `reply.case_context`: facts and `fact_modules`, scope
modules, outcomes, formal test points, supporting observations, and ordering
registry. Resolve every selected reference there. This context is a read-only
projection of the three accepted upstream artifacts, not a fifth Agent artifact.
Do not recreate OUT/TP/OBS/FLOW/ACTION/DEP identities or submit empty probe cases.
Supply the existing pending independent review structure and genuinely independent,
source-first target inventory on the first candidate. Construction does not demand
a completed review or manufacture passing assessments.

The helper compares the full reply context with a read-only recomputation of current
accepted state. A modified context remains invalid even if its digest is recalculated.
The Runner recomputes under the submission lock. `CASE_CONTEXT_STALE` means that the
candidate no longer binds current accepted semantics: obtain the fresh reply, recheck
the affected preconditions/actions/results and design responsibility, then prepare
again. Merely replacing a digest is not a semantic repair. Missing/malformed digests,
wrong source revision and broken references keep their own diagnostics.

A new upstream answer may return the behavior stage before the case stage. Preserve
accepted Decisions, recheck downstream design and wait for the new context. Review-only
changes preserve the upstream context; content changes invalidate the independent
review target and require a new real review.

Handle `invalid` using its nonempty `diagnostics` (`code`, `path`, `message`). It never
contains a partial artifact. Construction failures are technical; do not turn them
into business gaps or ask the user to debug protocol fields. Track no-progress attempts
at the Agent/Adapter layer as specified in run-management.md: after three repairs,
the fourth identical stage/root-cause result is `PIPELINE_NO_PROGRESS`, without
inventing a Runner state or restarting to reset the counter.

For the current Evidence repair transaction, first follow the controlled Source Pack repair procedure in run-management.md. When the runner requests evidence_claims for the next revision, pass that exact reply to prepareStageArtifact. The helper revalidates the pending repair against the accepted digest and unchanged Source Pack, fills the next revision, and reads acquisition state without deleting pending material. It does not authorize arbitrary replacement of an accepted stage.
