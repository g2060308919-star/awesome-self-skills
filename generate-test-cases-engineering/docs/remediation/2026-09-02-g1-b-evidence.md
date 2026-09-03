# Generate Test Cases V1 Remediation — G1-B Evidence

Date: 2026-09-02 (Asia/Shanghai)

## Scope

G1-B closes terminal fact and interaction routing, compiler-owned requirement-gap obligations, grouped Case blocker roots, and closed custom-responsibility ownership. It also moves all terminal interaction route decisions into the sole final reconciliation after built-in and custom strategies. T-wise generation, Case Oracle ownership, and runner/durable-run protocol remain later slices.

## Commits

- `9e0faa36a1586d9cfd3825420faefc1a5233e22b` — `feat: compile terminal and interaction gaps`
- `16b4795b94143183924341c286475e1843e7021f` — `fix: close G1-B route reconciliation`

## Red to green mapping

### Terminal routes, gaps, interactions, custom owners, and grouped blockers

Initial installed-shape RED:

```text
node --test --test-concurrency=1 test/interface/g1b-routes.test.mjs
```

Observed: exit 1; 7 tests, 1 pass, 6 fail. The first failure was the missing compiler-owned requirement-gap obligation for a blocked terminal fact.

Additional regressions were written before repair for per-obligation blocker reachability, canonical capability/conflict subjects, strict interaction provenance, ambiguous view-element ownership, custom-owner indexing, and integration semantic selector deduplication. Their RED slices were 0/4, `CUSTOM_RESPONSIBILITY_OWNER_NOT_MODELED`, and 3/4 respectively; the corresponding GREEN slices were 4/4, passing owner-route enrichment, and 4/4.

The first production commit then passed:

- installed G1-B: 22/22;
- focused package command: 690/690 plus 100-run byte-identical repeatability;
- runner/stage/schema/recovery compatibility: 87/87;
- `npm run check`: 693/693 plus 100-run byte-identical repeatability.

### Independent-review fix round

The first independent review found three Important gaps:

1. interaction destination and route completeness were still decided before the final reconciliation;
2. terminal/interaction issue scope and terminal evidence closure were incomplete;
3. fact-owned custom responsibilities did not bind their scope to every owner fact's primary scope.

RED coverage reproduced:

- premature `INTERACTION_CANDIDATE_MISSING` in the structural audit;
- terminal unrelated issue scope, dangling evidence, evidence scope mismatch, and unrelated evidence;
- interaction issue scope outside every candidate module or narrower than a semantic subject;
- global secondary evidence used to attach an unrelated custom responsibility to a fact owner.

GREEN evidence at `16b4795`:

- installed G1-B: 31/31;
- behavior/interaction/obligation compatibility: 75/75 during implementation and 108/108 in independent review with classification included;
- Skill static policies: 4/4;
- prescribed focused package command: 703/703 plus 100-run byte-identical repeatability;
- implementer `npm run check`: exit 0, 703/703 plus 100-run byte-identical repeatability.

The controller independently reran a fresh `npm run check` at `16b4795`: exit 0; 703/703 main tests in 261355 ms and 1/1 repeatability test covering 100 fresh installed-shape runs in 68991 ms.

## Implemented invariants

- Behavior-view validation is structural/modeling-only. The sole final reconciliation owns modeled xor terminal facts and interaction formal-view/Blocked/Exploratory, missing, multiple, no-signal, and invalid route decisions.
- A terminal fact or blocked interaction derives one compiler-owned `requirement-gap`, `caseable=false`, stable root, gap obligation ID, and route linkage. Agent artifacts cannot submit or close the gap.
- Fact gap identity derives from fact ID; interaction gap identity derives from canonical module IDs, dimension, and closed semantic refs. Provenance, risk, reasons, revision, candidate IDs, obligation IDs, and affected-obligation grouping do not enter root identity.
- Terminal and interaction issue scopes are bound to their semantic owners. Issue evidence is known, scope-covering, and directionally related.
- Interaction candidates keep provenance `source_claim_ids` separate from compiler-verifiable identity `semantic_subject_refs`; integration side effects resolve uniquely by `(side_effect_kind,target)`.
- Custom responsibility type/owner contracts are closed; every fact owner scope contains the responsibility scope; view-element owners resolve to a nonempty unambiguous fact set; `semantic_key` remains audit-only.
- Grouped Case blockers use compiler-derived obligation IDs plus typed reachable subjects and typed issue intent. Compiler expansion enforces disjoint groups and per-obligation reachability without letting Agent risk overwrite formal Test Point risk.
- Non-answerable gaps converge to final Blocked without questions. Unknown/deferred roots remain suppressed until explicit reopen.

## Independent review

The fix-round reviewer re-ran installed and core suites, build freshness, and diff checks. All three prior Important findings were `ADDRESSED`; test migrations were legitimate moves from prepass assertions to final reconciliation assertions; no tests or goldens were deleted or weakened; bundle generation remained source-driven; no G1-C or G1-D behavior was added.

Verdict: `APPROVED`; no new Critical or Important finding.

## Digests at G1-B closure

- `src/obligations/compile-obligations.mjs`: `e8d7744afefd54ca6dcf0d294614fe826f427c8f8398cad69bea5caa34e2b701`
- `src/classify.mjs`: `4a80e85d7b4ebc7eb080121fbcbd5b15bceef9d7e47f9428f34e4f618752de02`
- `src/core.mjs`: `505396e940160a2d62a19c9316cad13313d6ca9ab50d28f78d9f9c9e1c4a5761`
- `src/views/interaction-matrix.mjs`: `52b884e2998f90e64aa776223df672e21faf938d30473f22d84caad3cdf5c53c`
- `src/views/validate-views.mjs`: `4f43d6e2fb401283a44facdeef185bdb4ccb0b45f446f127e2617eb799f91553`
- `skill/generate-test-cases/SKILL.md`: `67625fc2ac7989582b60d33db83cc3ff1b23dd9a33fa9ee412e207c15bd293ae`
- `behavior-views.schema.json`: `b8152ad398e5d4ecf14a7d4733d62955324f8a49bf97b189ff34aaeb13469b45`
- `case-drafts.schema.json`: `45e1dd0d441bf830a5bfaf0dcfa79fd53344e9c3d093af22eaf9224d526ec318`
- `test-obligations.schema.json`: `9f77c1104e7cc1e9ec2b33fa0eb9cd3c048300c9bb161cd09d842c3e37141a28`
- `schema-manifest.json`: `4bd885b53ca32aae0f68e0dbd6dbb57af46734ad66c9a7a27ba733579e5ecc28`
- `test-compiler.mjs`: `804db817ea3076d4a66e199109ad578290c4312da50c541d2ba40e0570878863`

These are intermediate engineering digests, not release-candidate evidence. Any later production, Schema, Skill, benchmark, or generated-bundle change invalidates them for G4/G5.
