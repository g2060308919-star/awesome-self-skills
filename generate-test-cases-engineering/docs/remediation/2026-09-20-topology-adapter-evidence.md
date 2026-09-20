# Topology and behavior-evidence Adapter candidate

## Scope and contract

The user approved the revised two-helper design after review: require actual
topology review witnesses, expose source-backed authorization, and preserve
runner acceptance. This is a narrowly authorized exception to the earlier
five-policy-file implementation scope. Existing policy edits are retained.

The published bundle now exports:

- `discoverV4Topology(sourcePack, claims)` → the existing topology discovery shape.
- `constructV4TopologyEvidence(sourcePack, claims, review)` → exactly
  `topology_discovery`, `topology_review`, `topology_dispositions`, `scope_manifest`.

Both are pure synchronous constructors. They snapshot JSON inputs without
invoking accessors, validate existing source/Claim schemas and locator/unit
reviews, and validate the closed `semantic_value.topology_authorization` input
documented in the shipped Evidence Policy. They reuse the original canonical
source projection, topology discovery and scope compiler. They neither infer
authorization from dispositions nor synthesize completed review witnesses.
Candidate-specific module/role and boundary checks prevent using another
candidate's authorization from the same Claim.

Helper results are candidates, not accepted business evidence. The original
`advanceStrict` path still validates run/revision, receipts, source authority,
derivations, conflicts and final acceptance. No new phase, persisted artifact,
runner result, state machine or E2E behavior is introduced. Decision-based
scope exclusions are not synthesized; the exposed constructor supports
source-backed Claim exclusions and rejects unverified scope Decisions.

The accepted public Evidence document also now has a closed
`behavior_assertions` contract for schema `4.3.0`. Each assertion is bound to
one Claim and one supporting Fact, names one supported behavior-view field
path, and carries the asserted value. The Evidence stage rejects malformed,
unsupported, unresolved, cross-Claim, duplicate and conflicting assertions
with deterministic diagnostics. The legacy `4.0.0` and `4.2.0` paths retain
their previous permissive behavior.

## Actual verification

- RED: all initial seven topology interface tests failed because the public
  methods did not exist. Before rebuilding, two installed-runner tests also
  failed on the missing bundled export. All five initial behavior-assertion
  contract tests failed because invalid public input produced no diagnostic.
- GREEN: twelve topology interface tests passed. They cover valid construction,
  detached outputs, missing/partial/duplicate reviews, stale discovery,
  unknown/duplicate/omitted candidates, missing or inconsistent authorization,
  malformed/source-unbound fields, source-review/locator errors, accessor
  rejection, the three existing V4 schema contracts, semantic hints, aliases,
  table/image inventories, boundary direction and unverified scope Decisions.
- Installed bundle integration passed with helper-produced Evidence, including
  pre-case clarification, semantic controls, cancellation and resumed sibling
  runs. The first combined interface run passed 37 tests; two additional
  structural tests were then added and passed in the twelve-test topology run.
  The five behavior-assertion tests also passed, covering valid consumption,
  malformed shape, unsupported paths, Claim/Fact mismatch, and deterministic
  duplicate/conflict diagnostics while preserving legacy compatibility.
- TypeScript checking, reproducible build checking and repository mirror byte
  comparison passed. The generated bundle contains the new public Adapter and
  behavior-evidence validation. Schema files and schema manifest are unchanged.
- Benchmark regression: `npm run test:benchmark` passed 165/165 tests, exit 0.
- Full program regression: 1536/1536 tests passed, zero failures/skips.
- Repeatability: both tests passed: 100 fresh installed-shape legacy-contract
  runs produced identical bytes; three fresh V4 directories produced matching
  canonical output digests. `npm test` completed with exit 0. These tests use
  fixed semantic fixtures, not independent model generations from raw PRDs.

These are program/contract checks. The table/image fixture is synthetic and is
not evidence of real image interpretation. Existing prepared semantic fixtures
exercise transport and acceptance; they do not prove fresh PRD-to-Case quality.

## Candidate identity and publication boundary

Artifact contract remains `4.3.0 / 0.8.0` for this local development candidate.
The schema manifest does not hash compiler code; the version pair alone does
not identify this candidate. Candidate bundle SHA-256 (both repository copies):

`5d9d4aa563de6b80dd28d247d94b8972d8d238d348b20c43672d3a06fbd1aa03`

For comparison, the repository's HEAD bundle SHA-256 was
`f36a62ff5a2dcf8446baa48220f93814a355efedbedaf7f87e6ea411abf6586c`.

Schema-manifest file SHA-256:

`53a7a3e24c7db51e2ea1b2c5e43c53862c2acbe442de4658bbb11f70a110a637`

The version pair intentionally remains unchanged because the v1.2 design
forbids schema/compiler version churn. The candidate is identified by the
bundle digest above together with the Git commit recorded by the PR and merge.
Publication still requires the remaining semantic acceptance evidence. This
candidate is not a release acceptance.

The installed Skill was not overwritten. Its compiler file SHA-256 observed
during verification was
`24914e4890abb13f74fffe5a4edb294469a477441e33264d5a7a2a250dada6b5`.
No installation or historical-run rewrite was performed.

## Remaining acceptance boundary

The topology construction seam and the `behavior_assertions` public-input
contract are both closed and covered by executable tests. Full source-to-final-
Case semantic evaluations for the earlier unverified v1.2 acceptance items
remain outstanding. The available evaluations were performed in this task
session and several stop before accepted compiler artifacts; they do not meet
the original independent cold-context release standard. This report therefore
records an implementation candidate, not a fully release-accepted build.
