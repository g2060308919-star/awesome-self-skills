# Generate Test Cases V5 Release Blockers

Date: 2026-09-13

Decision: **RESOLVED — the five recorded blockers and the final spec gate are closed.**

The sole normative acceptance contract is `03-development-spec.md`. Documents
01 and 02 remain background and architecture context only.

## Closure record

| Blocker | Resolution | Evidence |
| --- | --- | --- |
| Phase 0 Case contract was replaced | Restored the frozen V4 Case projection and limited V5 to `case_step_semantic_bindings`, `domain_selections`, and typed `oracles`; identity goldens exclude the extension fields. | `903ede1`; `case-output.test.mjs`, `schema-contracts.test.mjs` |
| Accepted work context retained Agent client keys | Behavior acceptance now persists a stable-ID-rewritten compiler projection sufficient for restart through `inspectV5Run`. | `e6033e0`; `fsm-runtime.test.mjs`, `schema-contracts.test.mjs` |
| Provenance stopped at Behavior | Compiler now emits and validates Source → Claim → Fact → AtomicOutcome → FormalTestPoint → Case/CaseOracle with registered, acyclic edges. | `e6033e0`; `provenance.test.mjs`, `case-output.test.mjs` |
| Named fixtures were aliases | Every normative leaf has a unique isolated trigger/assertion body and an individual golden. | `6c0df03`; `fixture-runner.test.mjs`; 105/105 leaves |
| Static check reported 236 errors | All diagnostics were repaired without `@ts-nocheck`, `@ts-ignore`, or weakened compiler settings. | `4e1d81b`; `tsc --noEmit -p jsconfig.json` exits 0 |
| Final gate 23 lacked the seven-state normal-fatal matrix | The manifest now creates and corrupts source state, Question Part state, pending clarification, Execution snapshot, Execution receipt, final Execution projection, and accepted Compiler projection. Set targets use checkpoint-member digests; missing, invalid, non-member, and diagnostic-mismatch negatives fail before fatal publication. | `1fb011d`; `F-C15-protocol.protocol.storage-tamper-matrix`; `fixture-runner.test.mjs` |

## Final result

- `npm run check`: 118/118 passed.
- C01–C16 manifest: 16/16 groups and 105/105 leaves passed.
- Deterministic transcript:
  `sha256:17781e2b5adf6fa98cc03a5b04d257c94ea40ac824d40d4a48843e9d443a6eb9`.
- Candidate and repository-published Skill trees are byte-identical.
- `git diff --check` passes and dependency audit reports zero vulnerabilities.
- No declared deployment/catalog root exists, so the repository publication has
  zero discoverable production V4 active runs and makes no runtime-deployment
  claim. Historical benchmark and validation run directories are not a
  configured live catalog and were not modified or migrated.

The complete command log, artifact digests, gate mapping, limitations, and
security review are in `2026-09-13-v5-release-evidence.md`.
