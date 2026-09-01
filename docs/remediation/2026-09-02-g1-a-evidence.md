# Generate Test Cases V1 Remediation — G1-A Evidence

Date: 2026-09-02 (Asia/Shanghai)

## Scope

G1-A added the single closed `behavior_views.obligation_inputs` seam, wired the four responsibility views through production, removed the hidden fifth-input compatibility path, and made public terminal/custom inputs the only source of their internal compilation records. Full requirement-gap lifecycle, interaction semantics, t-wise, Case Oracle ownership, and runner/recovery protocol remain later slices.

## Commits

- `54845c6` — `feat: compile obligation inputs from behavior views`
- `7066900` — `fix: close obligation input seam`
- `dbc0ed4` — `fix: bind custom identity to public semantics`
- `eab9fdf` — G0 audit only; no production change after `dbc0ed4`

## Red to green mapping

### Initial obligation-input seam

RED command:

```text
node --test --test-concurrency=1 --test-name-pattern='obligation input|input role|timing integration' test/interface/obligation-inputs.test.mjs
```

Observed: exit 1; 4 tests, 0 pass, 4 fail. The installed schema rejected `/obligation_inputs`; the pure core still consumed the hidden compilation input.

GREEN: the same focused set passed 4/4. The first full check exposed five compatibility fixtures; after hand-reviewed deterministic identity updates, `npm run check` passed 667/667 plus the 100-run repeatability test.

### Hidden fifth input and dense reserved arrays

RED command:

```text
node --test test/interface/obligation-inputs.test.mjs
```

Observed: exit 1; 6 tests, 4 pass, 2 fail. A malformed `[null]` terminal array was erased and an injected fifth input still changed the result.

GREEN evidence:

- focused obligation/Schema set: 68/68;
- five-file compatibility set: 48/48;
- `npm run check`: exit 0, 669/669 plus 100 byte-identical installed-shape runs.

### Audit-only custom keys and public diagnostic paths

RED command:

```text
node --test --test-concurrency=1 test/interface/obligation-inputs.test.mjs test/core/obligation-ledger.test.mjs
```

Observed: exit 1; 47 tests, 45 pass, 2 fail. Changing only `semantic_key` produced two obligations; a public terminal error used `/obligationCompilation/factRoutes/...`.

GREEN evidence:

```text
npm run build && node --test --test-concurrency=1 test/core/obligation-ledger.test.mjs test/interface/obligation-inputs.test.mjs test/core/schema-validator.test.mjs
```

Exit 0; 70/70. The compatibility set passed 48/48 with no golden change.

The controller reran the four semantic regressions at `dbc0ed4`: exit 0, 4/4. A fresh controller `npm run check` then exited 0 with 671/671 main tests and one passing repeatability test covering 100 fresh installed-shape runs.

## Independent review

The independent re-review of `7066900..dbc0ed4` found all requested items addressed:

- input-domain, role, timing, and integration selectors have hand-derived ID, risk, and source-claim assertions;
- `semantic_key` is audit-only and cannot increase the formal denominator;
- system/custom collisions remain closed;
- terminal/custom diagnostics retain exact public array-item paths;
- scale coverage uses distinct, schema-valid fact owners rather than artificial key isolation;
- no tests were deleted or weakened and the bundle remained build-generated.

Verdict: `APPROVED`; no new Critical or Important finding.

## Digests at G1-A closure

- `src/obligations/compile-obligation-inputs.mjs`: `01f5cbbecbacd26a8ca0aa4f1ed6f45cbcd8b17ac00b6c4f3e921ab53decbd85`
- `src/obligations/compile-obligations.mjs`: `53ceb0f913e07868a3171608e18707f3c8499663b6380870ebfbe021a204e0b3`
- `skill/generate-test-cases/SKILL.md`: `67625fc2ac7989582b60d33db83cc3ff1b23dd9a33fa9ee412e207c15bd293ae`
- `behavior-views.schema.json`: `b43380c8023161f11c0b7a17db1c9b3e8f51aa04f76c66b060bc20fb1ec6f5c9`
- `schema-manifest.json`: `2b2c18a64cecab908ee48d7eb767be07faccd1bab4b058024a08bc60dadc1cde`
- `test-compiler.mjs`: `2eec5cdf4f991685ca7cdd8f04340b3dee84ff9951a6ca08e9d38ae197981d56`

These are intermediate engineering digests, not release-candidate evidence. Any later production, Schema, Skill, benchmark, or generated-bundle change invalidates them for G4/G5.
