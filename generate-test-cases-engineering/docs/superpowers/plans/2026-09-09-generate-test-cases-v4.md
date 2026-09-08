# generate-test-cases v4 implementation ledger

Normative contract: `03-development-spec.md` supplied on 2026-09-09. The problem record and technical design are context only. Baseline commit: `1b16eddda0ed13a02a41d6a1dd1c5cecf23cfa02` on `codex/generate-test-cases-v4`.

## Gate order

The implementation follows the specification DAG and records RED before GREEN for every observable slice:

1. T01 characterization fixtures and four independent RED failures.
2. T02 schema 4.0.0/compiler 0.5.0, including the required JSON-Schema dialect semantics.
3. T03–T05 case-document/execution separation, resource independence, and relative baselines.
4. T11 source canonicalization before T07 topology/scope.
5. T06 sparse behaviors, outcomes, risk review, values, and ordering after T04/T07.
6. T08–T10 two-phase clarification, partial answers, and revision transactions.
7. T12 canonical outputs/result routing; T13 v3 migration; T14 Skill policy; T15 journeys and release evidence.

## Required verification

- Targeted RED/GREEN commands are recorded with the task commits.
- Every BR-01–BR-19 has a positive and negative test.
- The P-01–P-20 and O-01–O-03 mappings use the exact test files in Spec section 9.1; no item may be marked N/A.
- Final gates: `npm run check`, `npm run test:benchmark`, `npm run public-pilot`, installed-shape contract tests, validator, v4 journey/golden/recovery, 100-run determinism, and three fresh-context pressure runs.
- Generated `schema-manifest.json` and `scripts/test-compiler.mjs` are rebuilt from source; generated files are never hand-edited.

## Baseline evidence

- `npm ci --offline`: exit 0; 4 packages installed; 0 vulnerabilities.
- `npm run check`: exit 0; 911 core/golden/interface/recovery tests passed and one 100-run installed-shape repeatability test passed.
- Node `v24.18.0`; npm `11.16.0`.

## Task status

| Task | State | Evidence |
|---|---|---|
| T01 | RED established | 4 independent legacy failures in `v4-user-outcome-contract.test.mjs`; fixtures retained for later v4 GREEN |
| T02 | passed | compiler 0.5/schema 4 envelope, explicit intent, reply/manifest/bundle contracts; 73 targeted tests pass |
| T03 | pending | case/execution compiler boundary |
| T04 | pending | resource-independence metamorphic suite |
| T05 | pending | capture-at-execution baseline |
| T06 | pending | sparse behavior/outcomes/risk/value/order |
| T07 | pending | topology discovery and scope manifest |
| T08 | pending | pre/post-case clarification |
| T09 | pending | partial answers and stable decisions |
| T10 | pending | idempotent revision transaction |
| T11 | pending | source/asset/locator identity |
| T12 | pending | canonical outputs and result matrix |
| T13 | pending | v3-to-v4 migration |
| T14 | pending | Skill instructions and references |
| T15 | pending | journeys, pressure, and release gates |

## Task 02 evidence

- RED: schema-dialect suite initially exposed ten unsupported dialect behaviors; delivery-intent suite exposed four missing v4 contract behaviors; manifest, reply, and bundle suites each failed before their schemas existed.
- GREEN: `node --test test/core/v4-schema-dialect.test.mjs test/interface/v4-delivery-intent.test.mjs test/interface/v4-manifest-contract.test.mjs test/interface/v4-reply-contract.test.mjs test/interface/v4-test-bundle-contract.test.mjs test/interface/schema-integrity.test.mjs` — exit 0, 73/73 passed.
- Static/build checks: `./node_modules/.bin/tsc --noEmit -p jsconfig.json` and `node build/build.mjs --check` — exit 0.
- Legacy installed-shape journey remains readable and executable; schema/build artifacts were regenerated with the repository build, not edited directly.
