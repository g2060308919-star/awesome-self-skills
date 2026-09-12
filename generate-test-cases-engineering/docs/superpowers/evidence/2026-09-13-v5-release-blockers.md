# Generate Test Cases V5 Release Blockers

Date: 2026-09-13

Decision: **REJECT — do not merge or push as a completed V5 release.**

The sole normative acceptance contract is `03-development-spec.md`. The
automated suite demonstrates useful implementation progress, but it does not
close the contract below.

## Verified progress

- `npm run build` passed.
- `node build/build.mjs --check` passed.
- The executable fixture manifest passed 16 requirement groups and 105 leaves
  with transcript digest
  `sha256:1e5b55c34e1c110c4caed7c1a0e2205fb4069962b7d76ae286565f95528cee6e`.
- The V5/runtime test invocation passed 109 of 110 tests before publication
  synchronization; the only failure was the stale published Skill inventory.
  After copying the engineering Skill build to the repository publication,
  `repository-published-sync.test.mjs` passed.
- `git diff --check` passed.
- A repository scan found no private-key, GitHub token, or AWS access-key
  pattern in the changed engineering/published Skill trees.

## Release blockers

### 1. Phase 0 V4 Case contract was redesigned instead of extended

The Phase 0 Case identity projection includes the frozen V4 fields such as
`ordering`, `acceptance_role`, `fact_ids`, `supporting_observation_ids`, typed
business preconditions/data conditions, semantic effects, baseline spec, and
test values. The V5 contract permits the exact Case extension
`case_step_semantic_bindings`, `domain_selections`, and typed `oracles`.

The current public Case schema and compiler instead introduce a different
shape with `canonical_names`, `claim_ids`, `semantic_gap_ids`, inline
`semantic_action_ref`, and inline step Claim IDs. The Case anchor and final Case
ID are calculated from that replacement shape. This violates the explicit
in-place extension and frozen Case identity requirements.

Relevant implementation:

- `src/v5/interface-schemas.mjs:508`
- `src/v5/case-compiler.mjs:220`
- `src/v5/case-compiler.mjs:244`
- `src/v5/case-compiler.mjs:279`

### 2. Case work context is not a stable-ID-rewritten accepted projection

The runtime accepts the raw Agent `behavior_views` payload into the envelope
and places that payload in the next work packet. It therefore retains batch
client keys and same-batch structure while the stable mappings exist only in
the preceding mutation receipt. A restarted or replacement Agent cannot build
the next artifact from `inspectV5Run` alone, contrary to the AgentWorkContext
contract.

Relevant implementation:

- `src/v5/interface-schemas.mjs:771`
- `src/v5/runtime.mjs:1022`
- `src/v5/runtime.mjs:1066`

### 3. Production provenance compilation stops at Behavior contracts

The policy registry declares the complete Source → Claim → Fact →
AtomicOutcome → FormalTestPoint → Case/CaseOracle chain, but
`compileBehaviorProvenanceGraph` only creates source-unit, Claim, and Behavior
contract nodes. The production path does not compile the required Fact,
AtomicOutcome, FormalTestPoint, Case, or CaseOracle nodes/edges.

Relevant implementation:

- `src/v5/provenance.mjs:14`
- `src/v5/runtime.mjs:994`

### 4. Required named fixtures are aliases, not independent gate triggers

Hashing each manifest fixture after removing only `fixture_id` and
`requirement_ids` shows that many normatively required leaves have byte-identical
action and expectation bodies. In particular, C13 has 13 named leaves but only
2 unique bodies. Seven distinct negative requirements—including
cross-coordinate denial, Oracle denial requiredness mismatch, orphan auxiliary
contract, and permission-coordinate binding failures—execute the same two
generic permission errors. Six positive requirements likewise share one body.

Other affected groups include C08, C11, C12, C15, and C16. A passing leaf count
therefore does not prove the named invariant set required by the specification.

Relevant generator branch:

- `build/generate-v5-fixture-manifest.mjs:498`
- `build/generate-v5-fixture-manifest.mjs:504`

### 5. The mandatory static check fails

The repository-local command
`./node_modules/.bin/tsc --noEmit -p jsconfig.json` reports **236 errors across
18 files**. Failures include invalid object shapes, impossible `never` arrays,
implicit `any`, missing properties, and runtime union errors. Consequently
`npm run check` cannot pass.

## Required remediation before release

1. Restore the Phase 0 V4 semantic Case projection and apply only the exact V5
   Case extension; freeze Case/Step/Oracle identity goldens against it.
2. Compile and persist Facts, AtomicOutcomes, FormalTestPoints, Cases, and
   CaseOracles with the registered provenance edges.
3. Persist and expose stable-ID-rewritten accepted Behavior/Test Obligation
   projections so a fresh Agent can continue using only `inspectV5Run`.
4. Replace aliased manifest leaves with independent inputs and assertions that
   trigger every named C01–C16 invariant.
5. Fix all static-check diagnostics without disabling checking, then rerun the
   exact release commands and regenerate release evidence.

## Git publication status

- Feature branch: `codex/generate-test-cases-v5`
- Current committed HEAD: `b3c01f8`
- The remediation above remains in the working tree.
- No remote feature push was performed.
- `main` was not merged or pushed.
