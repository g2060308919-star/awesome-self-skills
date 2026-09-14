# P01-P16 protection map

| P | V4 source/consumer binding | Existing protection | Incremental acceptance |
|---|---|---|---|
| P01 source/assets/locators | `source-compiler-v4`, source policy/runtime, asset and locator schemas | `v4-source-*`, `v4-locator-precision`, acquisition runner | AT01/02/46 source variants |
| P02 scope/modules/roles | `scope-manifest-v4`, Facts and source boundary | scope, evidence boundary, source structure | AT01/29/32 truth projection |
| P03 atomic outcomes | `business-outcomes-v4`, obligations and coverage | business-outcome obligations | AT01/26/31 independent outcome keys |
| P04 answerable pre-case questions | `semantic-gaps-v4`, `clarification-v4`, presentation summary | pre-case, gap classification, presentation tests | AT03/04/15 policy and interface |
| P05 partial answer/binding/nature | action adapter, clarification, decision record | partial-answer, decision-recompile, installed adapter | AT06-14 preview tests |
| P06 answer changes final result | advance/revision/evidence overlay/canonical delivery | Task15 journeys and semantic recompile | AT17/18 end-to-end projection |
| P07 sparse views and interactions | sparse behavior, seven obligation compilers, matrix | behavior/flow/state/input/role/timing/integration/interaction tests | F-CITY plus non-F-CITY state/timing controls |
| P08 manual expected/values/baseline | Case semantics, relative baseline, value origin | generation-resource-independence, relative-baseline, value-origin | AT21-25/28/45 |
| P09 post-case new gaps | advance post-case and clarification ledger | two-phase/post-case runner tests | AT20 no-repeat/new-root check |
| P10 source/Decision/E2/E3 | evidence, decision record, overlay | evidence boundary, decision recompile, ancestry tests | AT11-14/35-37 valid-schema mutants |
| P11 exclusions/exploratory | not-applicable, risk review, final outcome | risk, zero-case, final-status tests | AT26/28/34/39 |
| P12 revision/idempotency/recovery | revision transaction, run store, cancellation | transaction, crash, source revision, cancellation | AT16/18/19/40/44 preview recovery |
| P13 partial/blocked/no-applicable | final outcome and canonical manifest | zero-case/final-status/manifest tests | AT39 exact branch checks |
| P14 business language/three outputs | business markdown, canonical delivery | canonical delivery, markdown, manifest tests | AT17/38/45 official projection comparison |
| P15 explicit execution consumer | execution plan/run and semantic reopen | execution worksheet, reopen, no-fallback | AT41/43; E2E Runner remains out of scope |
| P16 semantic identity/invalidation | canonical IDs, semantic digest, revision transaction | metamorphic, repeatability, repair/reopen | AT17/40/42 identity projection |

Baseline result: no known P01-P16 failure in the 1447-test suite or repeatability tests. The new acceptance work must demonstrate true semantic mutants, not relabel every historical concern as a V4 defect.
