# Private run management

This is Adapter orchestration metadata, not an additional semantic artifact or public interface. The compiler still accepts exactly the four stage artifacts and one absolute run directory. Never put the catalog under `staging`, accepted artifacts, or the installation.

## Durable catalog

Keep `run-catalog.json` in the current task's persistent private run parent. Read `scripts/schemas/run-catalog.schema.json` before creating or editing it. Capture real absolute canonical directories and compiler-issued run IDs, never invented IDs. Keep exactly one active directory at a time (or null). Each row records the immutable source-content digest and scope, last reply kind, error codes, and predecessor/successor IDs.

- After the first runner reply, register the run as active. On resumption, locate it from the catalog and invoke that runner first.
- After `finished`, mark it completed; completion may be document-only, not execution-ready.
- On a terminal protocol/runtime failure or `PIPELINE_NO_PROGRESS`, mark it failed, retain diagnostics and all run files. A corrected retry may reactivate the same run; append a lifecycle event recording the transition.
- A changed original source or material scope needs a new run. Create and invoke it first; only after obtaining its actual run ID update both catalog rows: the old run becomes superseded and names `superseded_by`, and the new row names `supersedes`. Append one transition event; never erase the old row or history. The catalog is a relationship index, not authority to mutate an old run.
- A catalog disagreement with actual runner identity is a process error. Stop that operation and report the conflicting paths/IDs. Do not choose whichever has a ready pointer or highest-looking directory name.

Write catalog changes atomically from a validated in-memory copy. A completed/failed run remains recoverable. No deletion, source rewriting, or installation is part of catalog maintenance.

## Repair accepted generated artifacts

Generated extraction/modeling mistakes do not change original PRD truth and do not require a sibling run. For an unaccepted artifact, fix the staging file at the same revision. For an accepted artifact, preserve its bytes and append a new Source Pack revision containing one `artifact_repairs` record:

```json
{
  "repair_seq": 1,
  "base_source_revision": 0,
  "stage": "evidence_claims",
  "accepted_artifact_digest": "copy the actual accepted artifact SHA-256",
  "reason": "Describe the observed generation error and the frozen source to re-read."
}
```

The example digest is descriptive, never a literal submission. Compute the canonical digest of the accepted artifact using the same canonical JSON semantics as the compiler, or copy the digest from the runner's diagnostic/checkpoint; never hash arbitrary pretty-printed bytes. Preserve all existing repair records exactly. The new record uses the next repair sequence and immediately prior source revision. It is not a Decision Record, evidence, or a user business answer; it shares no clarification sequence. Do not append business/execution events in the same repair revision.

Copy the prior Source Pack, increment `source_revision` once, append the record and call the runner. It validates the exact target, carries only earlier safe stages forward, invalidates all downstream artifacts and confirmations, and returns the first artifact to regenerate. This works even when the previous revision was incomplete. Remove only stale *staging* copies after confirming they are not the original source or accepted files; regenerate them at the newly returned revision. Never edit accepted/derived/output files.

`source_pack` repairs may correct extraction locators, source review/asset review, or delivery presentation settings; original source bytes, source set, scope, and source authority policy remain frozen. New authoritative business material follows normal Decision/source-change rules, never a repair loophole.

## Avoid redundant work

For small readable requirements, read the needed source/evidence/view schemas and policies once. You may stage `source_pack`, `evidence_claims`, and `behavior_views` together after completing their semantic review, then call the runner; each still passes its normal individual gate. Do not prewrite Case obligation IDs: inspect the compiler's derived Test Points before writing `case_drafts`. There is no batch parameter or alternative runner call.

A valid execution-only Source Pack append reuses already accepted Evidence, Behavior Views and Cases mechanically. Submit only the Source Pack; do not re-extract or resubmit the other artifacts unless the runner explicitly requests them. Business-rule updates and reanalysis still regenerate affected artifacts. Always invoke the runner after a crash to reconstruct progress; never manually skip validation based on the catalog.
