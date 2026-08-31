# Evidence Policy

Use this policy while creating Source Packs and Evidence Claims. The bundled schemas define the exact closed record shapes; this file defines the semantic choices.

## Preserve source identity and scope

Record each source's kind, version, status, authority, content digest, and applicable scope. Treat historical defects and production behavior as diagnostic signals unless an effective source explicitly makes them normative.

Create a typed locator for every relied-on text range, table cell, or page region. Preserve table coordinates and page/region summaries. Mark extraction as `verified`, `machine-extracted`, or `uncertain`. An uncertain extraction cannot directly support E3; verify the original region or keep the affected fact Blocked.

Build Source Policy from explicit authority and scope. A newer date or more official-looking document does not silently supersede another source. Accept supersession only when a source declares it or an authorized task-scoped decision resolves it. Limit unresolved conflicts to their intersecting scope.

## Assign the lowest justified evidence level

- E3: an effective authoritative source directly states the fact, or an authorized user confirms a final rule for the declared task scope.
- E2: a mechanical result derived only from E3/E2 through an allowed rule and target.
- E1: an explicitly temporary task assumption, including an answer whose nature is not declared.
- E0: model recall, common practice, or an unsupported risk hypothesis. E0 is not accepted evidence and never enters a deterministic Case.

One lower fact lowers the whole Case. E1 never becomes Grounded. Unsupported or contradicted content never becomes Grounded or Conditional.

## Keep E2 mechanical and closed

Allow only this derivation-kind and target matrix:

- `formula` → `test-data` or `expected-value`; require complete units, precision, and rounding;
- `decision-table-instance` → `expected-value` or `model-element`; require explicit sourced conditions and outcome;
- `boundary-representative` → `test-data`; require a sourced finite domain or inclusive boundary;
- `enumeration-complement` → `test-data` or `model-element`; require a sourced exhaustive enumeration with `closed_world=true`;
- `graph-reachability` → `model-element`; use it for structural reachability only.

Match every derivation kind to its allowed target. Boundary analysis does not invent error text, persistence, events, or state changes. Graph reachability proves structure, not a business Oracle. Require an acyclic parent graph terminating in E3, with all inputs and parameters replayable.

Before accepting `evidence_claims`, identify each complete source-defined business outcome that joins several atomic Oracle claims. When the accepted source supplies the conditions and outcome needed by the closed matrix, create one replayable E2 `expected-value` child with `derivation_kind = decision-table-instance`; set `parent_claim_ids` to all atomic Oracle parents that the outcome jointly proves. This gives a later concrete expectation one evidence reference whose ancestry covers the whole outcome. Do not create an aggregate merely to satisfy the compiler: when the conditions, outcome, or allowed derivation are absent, preserve the gap as Blocked.

## Build the fact ledger

Split sources into atomic, independently true-or-false claims. For each claim preserve value, scope, locator, source identity, kind, and evidence level. Distinguish requirements, descriptions, examples, and diagnostics.

Mark each formal fact as active, conflicted, ambiguous, or diagnostic. Do not drop a fact because it cannot yet produce a Case. Route every in-scope normative fact into a behavior view or record why it is Blocked, out of scope, NotApplicable, or awaiting a view.

Keep risk hypotheses separate from the formal fact ledger. They may become Exploratory suggestions but cannot substitute for a formal Test Point or its expected result.
