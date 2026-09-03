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

Apply that rule before t-wise modeling. For every source-defined forbidden tuple, create a separate replayable E2 `expected-value` using the closed `decision-table-instance` derivation. Its parents must include the atomic selected-value claims for every assignment in that tuple and the joint forbid rule; its `value` must exactly equal the sourced forbidden outcome in `rule_input.outcome`. An explicit partial forbidden tuple keeps its exact assignment arity: you must not add an unspecified parameter and must not clone it across an unspecified domain. Only an authoritative exclusive rule that exhaustively proves the combination permits exactly one value may expand into complement tuples, and only when an authoritative closed enumeration makes those tuples mechanical. For every tuple produced by that expansion, include the authoritative closed enumeration Claim itself in `parent_claim_ids`; recording only its source locator in `source_locator_ids` is not sufficient ancestry. Keep one E2 outcome per tuple. A broad enumeration claim or separate value claims are not joint forbid proof, and an open domain must remain Blocked rather than being completed from recall.

## Build the fact ledger

Split sources into atomic, independently true-or-false claims. For each claim preserve value, scope, locator, source identity, kind, and evidence level. Distinguish requirements, descriptions, examples, and diagnostics.

Split exclusion language by proposition as well. A sentence that says a capability is unsupported and outside the acceptance scope contains two atomic E3 claims with different `claim_id` values, even when both use the same source locator: one formal capability fact and one independent scope-exclusion proof Claim. Never merge the unsupported behavior and the outside-scope proof into one Claim. Record the scope-exclusion Claim as non-product proof with `kind = description` and record its Fact Ledger entry as `diagnostic`; it must not create another formal Fact, Behavior View, decision rule, custom responsibility, or obligation. Only the unsupported capability Claim remains a normative fact. The later NotApplicable review must cite the separate exclusion Claim; the formal fact's own primary Claim cannot prove its exclusion.

Keep product behavior separate from test-process and output-format instructions. Statements about how test cases must be generated, traced, classified, formatted, reviewed, or restricted to manual rather than automated testing are not product behavior. If they are needed to control this task, record them as description or diagnostic context with a diagnostic Fact Ledger status; never turn them into an active formal Fact or Behavior View. Likewise, a list of test-environment capabilities may support Testability fields but is not itself a product Test Point. Product behavior or responsibility remains formal even when a missing Oracle or Testability capability makes it currently unobservable or unexecutable; preserve that Test Point as Blocked instead of demoting or deleting it.

When a source explicitly enumerates distinct in-scope scenarios whose product outcome or Oracle is missing, create one separate formal responsibility per named scenario. Record one atomic `kind = requirement` Claim and one `status = ambiguous` Fact Ledger entry for each, then route it to its own Blocked Test Point; you must not collapse named scenarios into a generic missing-result or parse-failure gap. This records that each named behavior requires resolution and does not invent an outcome.

Mark each formal fact as active, conflicted, ambiguous, or diagnostic. Do not drop a fact because it cannot yet produce a Case. Route every in-scope normative fact into a behavior view or record why it is Blocked, out of scope, NotApplicable, or awaiting a view.

When `need_revision` rejects the status, scope, or provenance of a normative Claim, repair that exact Claim and its Fact Ledger entry; never delete the Claim or empty the Fact Ledger merely to advance. If the cause is frozen in an already accepted earlier stage, stop at the repair limit and report it instead of laundering the requirement away.

Keep risk hypotheses separate from the formal fact ledger. They may become Exploratory suggestions but cannot substitute for a formal Test Point or its expected result.
