# Generate Test Cases V5 traceability

Date: 2026-09-12

Normative contract: `03-development-spec.md` only. The problem/optimization
record (`01`) and technical design (`02`) were read for context and architecture
but do not override this acceptance record.

## Release identity and authority

- Schema version: `5.0.0`; compiler version: `0.6.0`.
- Public API: `createV5RunDirectory`, `advanceV5Run`, `inspectV5Run`.
- Direct CLI: read-only inspection.
- Agent-owned artifacts: `source_pack`, `evidence_claims`, `behavior_views`,
  `case_drafts`; all identities, digests, registries, state, receipts, pointers,
  provenance, and rendered outputs are compiler-owned.
- Machine contract: the fifteen closed `v5-*.schema.json` files and matching
  generated policy documents under `skill/generate-test-cases/scripts/`.
- Fixture contract: `tests/fixtures/v5/manifest.json` is the only discovery
  surface and resolves 105 exact leaves. Every policy-registry `test_id` resolves
  to one manifest leaf.

## C01–C16 mapping

The Schema column names the controlling closed registry Schema(s); the runtime
column names the enforcing symbol/module seam; and the fixture column names the
manifest leaf prefix plus focused test evidence.

| Requirement | Closed Schema / registry | Enforcing runtime symbols | Fixture and focused evidence |
| --- | --- | --- | --- |
| C01 atomic requirement decomposition | `v5-normative-rule-inventory`, `v5-stable-id-preimage-registry`, `v5-canonical-array-manifest` | `deriveSemanticReviewSeed`, `compileEvidenceSemantics`, `stableV5Id` | `F-C01-atomicity.*`; `semantic-seed.test.mjs` |
| C02 ambiguity isolation | `v5-normative-rule-inventory`, `v5-answer-constraint-registry` | `deriveSemanticReviewSeed`, `compileEvidenceSemantics`, question-part compilation | `F-C02-ambiguity.*`; `semantic-seed.test.mjs`, `clarification.test.mjs` |
| C03 entity and terminology consistency | `v5-normative-rule-inventory`, `v5-stable-id-preimage-registry` | compiler-owned entity candidates, review reduction, and term registry identities | `F-C03-entity.*`; `semantic-seed.test.mjs` |
| C04 answer binding | `v5-answer-constraint-registry`, `v5-clarification-control-registry` | `parseClarificationResponse`, binding validation | `F-C04-binding.*`; `clarification.test.mjs` |
| C05 answer evidence nature | `v5-answer-constraint-registry`, `v5-clarification-control-registry` | `previewClarificationResponse`, temporary-basis and final-evidence validation | `F-C05-nature.*`; `clarification.test.mjs` |
| C06 question-part FSM | `v5-fsm-registry`, `v5-answer-constraint-registry` | question-part state reduction and `advanceV5Run` dispatch | `F-C06-question-fsm.*`; `clarification.test.mjs`, `fsm-runtime.test.mjs` |
| C07 two-phase impact | `v5-fsm-registry`, `v5-reply-contracts.generated`, `v5-clarification-control-registry` | `previewClarificationResponse`, `commitClarificationResponse`, stale-preview validation | `F-C07-impact.*`; `clarification.test.mjs`, `fsm-runtime.test.mjs` |
| C08 Oracle completeness | `v5-normative-rule-inventory`, `v5-stable-id-preimage-registry` | `validateOracle`, `compileCaseDocument` | `F-C08-oracle.*`; `oracles.test.mjs`, `case-output.test.mjs` |
| C09 field correspondence / Behavior gaps | `v5-normative-rule-inventory`, `v5-stable-id-preimage-registry` | `validateFieldCorrespondence`, `compileBehaviorSemanticGaps`, Behavior review validation | `F-C09-correspondence.*`; `behavior-contracts.test.mjs`, `behavior-gaps.test.mjs` |
| C10 explicit ValueState | `v5-normative-rule-inventory`, `v5-canonical-array-manifest` | `validateValueStateContract`, Behavior View validation | `F-C10-value-state.*`; `behavior-contracts.test.mjs` |
| C11 complement/domain contract | `v5-normative-rule-inventory`, `v5-canonical-array-manifest` | domain partition/complement validation and Case projection | `F-C11-complement.*`; `behavior-contracts.test.mjs`, `case-output.test.mjs` |
| C12 population contract | `v5-normative-rule-inventory`, `v5-canonical-array-manifest` | population boundary/class/selection validation | `F-C12-population.*`; `behavior-contracts.test.mjs` |
| C13 permission semantics | `v5-permission-derivation-registry`, `v5-canonical-array-manifest` | `derivePermissionContract`, permission Oracle validation | `F-C13-permission.*`; `permission.test.mjs`, `oracles.test.mjs` |
| C14 risk coverage | `v5-normative-rule-inventory`, `v5-canonical-array-manifest` | risk-ledger validation, Case classification and deterministic rendering | `F-C14-risk.*`; `behavior-contracts.test.mjs`, `case-output.test.mjs` |
| C15 source/runtime/durability protocol | `v5-source-acquisition-policy`, `v5-storage-layout-registry`, `v5-fsm-registry`, `v5-policy-registry`, `v5-reply-contracts.generated` | source acquisition, selector tokens, run store, normal transactions, quarantine transactions, exact outcome dispatch | `F-C15-*`; `source-acquisition.test.mjs`, `storage.test.mjs`, `transactions.test.mjs`, `action-tokens.test.mjs`, `integrity-routing.test.mjs`, `fsm-runtime.test.mjs`, `fixture-runner.test.mjs` |
| C16 provenance and resume | `v5-stable-id-preimage-registry`, `v5-canonical-array-manifest`, `v5-policy-registry` provenance policy | `acceptArtifactEnvelope`, `validateV5ProvenanceGraph`, `createResumeProjection` | `F-C16-provenance.*`; `identity.test.mjs`, `provenance.test.mjs`, `resume.test.mjs` |

## Cross-cutting normative surfaces

| Contract | Evidence |
| --- | --- |
| 16 exact FSM cells, 51 outcome rows, 9 action templates, 4 read-only profiles | generated FSM/reply registries; `registries.test.mjs`, `fsm-runtime.test.mjs` |
| 40 error rows and exact precedence | generated policy registry; `contract-inventory.test.mjs`, `registries.test.mjs`, `integrity-routing.test.mjs` |
| 28 stable-ID prefixes | generated stable-ID registry; `identity.test.mjs` |
| Closed Schema validation | generated schemas and manifest; `schema-contracts.test.mjs`, `no-v4-runtime.test.mjs` |
| Transactional create, mutation, retry, crash recovery, and quarantine | `transactions.mjs`, `run-store.mjs`; transaction and fixture suites |
| Seven compiler-state normal-fatal targets and set-digest/diagnostic negatives | `F-C15-protocol.protocol.storage-tamper-matrix`; `fixture-runner.test.mjs`, `execution-wrapper.test.mjs` |
| Canonical JSON and deterministic Markdown/CSV parity | render modules; reviewed V5 goldens; `case-output.test.mjs` |
| No browser/API E2E side effect | Execution Plan wrapper and public Skill policy; `execution-wrapper.test.mjs`, `skill-contract.test.mjs` |
| V5-only published path | source/schema/export scans and published byte equality; `no-v4-runtime.test.mjs`, `repository-published-sync.test.mjs` |

## Known limitations and SHOULD deviations

- This repository publishes a compiler/Skill, not a live service. No deployment
  or declared catalog root is configured here, so release evidence cannot claim
  a runtime deployment or inventory an external run store.
- Browser/API E2E execution is intentionally out of scope. V5 can compile a
  separately requested Execution Plan but does not execute it.
- Historical V3/V4 evidence remains in Git for auditability. It is excluded from
  exports, dispatch, schemas, scripts, Skill instructions, and the built bundle.
- No normative `SHOULD` is knowingly deviated from. If review discovers one,
  this section must be updated before merge.

Release-gate command results and final reviewed commit identifiers are recorded
separately in `2026-09-13-v5-release-evidence.md`.
