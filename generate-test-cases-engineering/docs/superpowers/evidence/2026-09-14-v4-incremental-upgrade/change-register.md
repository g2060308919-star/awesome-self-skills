# C01-C16 change register

The statuses are the four values required by the Spec. “Reuse” means the actual V4 path and tests already satisfy the behavior; it does not waive the associated AT checks.

| C | Disposition | Actual V4 evidence | Minimal failure/new target | Slice / acceptance |
|---|---|---|---|---|
| C01 compound outcomes | `reuse_verified` | Fact/result and `business-outcomes-v4.mjs`; source/scope/business-outcome tests | Protect comma/semicolon/table metamorphs and the selected/otherwise branches without changing the source parser into a keyword splitter | T01/T02, AT01-02 |
| C02 ambiguity vs exact wording | `fix_proven_gap` | semantic gaps already carry question/reason/impact/outcome; manual expected supports literal prose | Policy lacks the supplied distinction between literal “显示‘正常’” and vague “正常显示”; add failure-capable truth checks and guidance | T02/T04, AT03-04 |
| C03 object identity vs display | `fix_proven_gap` | Facts, semantic subjects, locators, and field paths retain identity | Add a scoped identity/alias/display rule; reject global fuzzy text equivalence | T02/T04, AT05 |
| C04 natural-language answer binding | `reuse_verified` | `constructV4Action`, Unicode scalar spans, presentation/root digests, partial-answer tests | Add deterministic batch orchestration; ambiguous fragments remain unbound while reliable items proceed | T03, AT06-08 |
| C05 authority and temporariness | `reuse_verified` | V4 `user_statement`/`authorized_confirmation`, task/product scope, E1/E3 and downgrade warning | Preview must expose adopted nature; apply confirmation must not upgrade it | T03/T06, AT11-14 |
| C06 omitted answer closure | `reuse_verified` | presented/deferred/unknown/closed states and successor presentations | Batch uniqueness/atomicity and retained pending controls | T03, AT09-10/18 |
| C07 trustworthy business preview | `add_capability` | No semantic-answer preview exists; `post-ready-preview.mjs` is execution-only | Add compiler-owned prepare/commit preview with no accepted mutation on prepare | T03, AT15-19 |
| C08 decidable/manual expected | `reuse_verified` | closed CaseSpec Oracle plus natural-language `expected`, relative baseline, resource-independence | Protect literal manual Oracles and reject invented technical prerequisites | T04, AT03-04/21-22 |
| C09 cross-surface correspondence | `reuse_verified` | integration views, subject refs, surfaces, field paths, evidence-backed assertions | Add independent wrong-row set-swap rejection and single-object/UI not-applicable controls | T04, AT23-24 |
| C10 data state vs render state | `fix_proven_gap` | existing semantic values and typed operands can retain 0/null/missing | Freeze conditional guidance and truth projection so 0/null/missing do not collapse | T04/T05, AT25 |
| C11 representative vs finite required values | `fix_proven_gap` | input domains, test values, obligations, coverage already provide reusable carriers | Add six-instance independent coverage assertion and legal-format missing-value mutant | T05, AT26-28 |
| C12 logical population scope | `reuse_verified` | outcome conditions, quantifier-capable prose, scope and coverage denominators | Protect logical all-record assertion without runtime count/non-empty invention | T05, AT29-30 |
| C13 permission obligations | `reuse_verified` | role-permission view and separate obligations/results | Add independent semantic recall that fails when deny outcome is removed with case count preserved | T05, AT31-33 |
| C14 risk noise and folding | `reuse_verified` | nine risk kinds, risk ledger, presentation ordering/group counts | Protect visibility/priority and no-loss folding; no new risk registry | T02, AT34 |
| C15 manual protocol burden | `add_capability` | IDs/digests/transactions are compiler-owned, but semantic source append is assembled manually | Two high-level Adapter operations create source provenance, stage, commit, and recover | T03/T06, AT08/19/40/43-44 |
| C16 downstream self-proof/wrong reference | `reuse_verified` | evidence direction, ancestry, scope, Oracle closure, repair/reopen tests | Add valid-schema semantic mutants to independent acceptance; do not rely on digest/schema errors | T06, AT35-37/46 |

No C item authorizes a V5 port. Code changes require a red/new acceptance case linked above; otherwise the V4 implementation remains unchanged and receives protection evidence only.
