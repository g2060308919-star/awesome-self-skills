# Evidence Policy

Use this policy while creating Source Packs and Evidence Claims. The bundled schemas define the exact closed record shapes; this file defines the semantic choices.

## Preserve source identity and scope

Record each source's kind, version, status, authority, content digest, and applicable scope. Treat historical defects and production behavior as diagnostic signals unless an effective source explicitly makes them normative.

Treat a user-supplied current PRD or module description as `effective` for this task unless the material explicitly identifies it as draft or historical. Missing detail does not make a current source a draft; preserve the missing detail as a fact, Oracle, or Testability gap. A Source Policy rule cannot promote a source whose own status remains draft.

Scope strings are compiler identities, not prose summaries. Choose one canonical slash-delimited path for the run, then reuse it verbatim for `run_scope` and every in-scope Source, Source Policy rule, Claim, Fact, and Behavior View; use child paths only for a deliberate narrower scope. Never paraphrase the same scope between stages. `*` is universal only when the corresponding source and claim are also universal—it cannot broaden a previously accepted narrow scope.

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

For `decision-table-instance`, `value` must exactly equal `rule_input.outcome`, and that outcome must be explicitly source-backed by the parents. Do not use a label, summary, or reformatted sentence as a substitute.

Before accepting `evidence_claims`, identify each complete source-defined business outcome that joins several atomic Oracle claims. When the accepted source supplies the conditions and outcome needed by the closed matrix, create one replayable E2 `expected-value` child with `derivation_kind = decision-table-instance`; set `parent_claim_ids` to all atomic Oracle parents that the outcome jointly proves. This gives a later concrete expectation one evidence reference whose ancestry covers the whole outcome. Do not create an aggregate merely to satisfy the compiler: when the conditions, outcome, or allowed derivation are absent, preserve the gap as Blocked.

## Build the fact ledger

Split sources into atomic, independently true-or-false claims. For each claim preserve value, scope, locator, source identity, kind, and evidence level. Distinguish requirements, descriptions, examples, and diagnostics.

Mark each formal fact as active, conflicted, ambiguous, or diagnostic. Do not drop a fact because it cannot yet produce a Case. Route every in-scope normative fact into a behavior view or record why it is Blocked, out of scope, NotApplicable, or awaiting a view.

When `need_revision` rejects the status, scope, or provenance of a normative Claim, repair that exact Claim and its Fact Ledger entry; never delete the Claim or empty the Fact Ledger merely to advance. If the cause is frozen in an already accepted earlier stage, stop at the repair limit and report it instead of laundering the requirement away.

Keep risk hypotheses separate from the formal fact ledger. They may become Exploratory suggestions but cannot substitute for a formal Test Point or its expected result.
