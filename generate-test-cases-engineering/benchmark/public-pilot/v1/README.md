# Public-source machine pilot v1

This directory is a reproducible intake pilot for `generate-test-cases`. It is useful for checking source packaging, task binding, machine review, adjudication, defect normalization, and the retained 30-PRD corpus. It is not independently release-eligible.

The invariant boundary is:

```json
{
  "release_eligible": false,
  "release_status": "insufficient_evidence"
}
```

No record here is an external-human expert label. The two reviews and the adjudication are explicitly `reviewer_class=machine-agent` and `review_scope=intake-only`.

## Validate

From the repository root:

```bash
npm run public-pilot
```

The current expected result is:

- `status=pilot_ready`;
- 30 machine-admitted cases, with five in each frozen stratum;
- zero countable historical defects;
- `captures_ready=false` because three comparator identities are unresolved;
- `release_eligible=false` and `release_status=insufficient_evidence`.

The validator is offline and fail-closed. It recomputes retained-file SHA-256 values, the Task 3 corpus snapshot, source/task/provenance bindings, two complete independent machine reports, final machine adjudication, global defect-lead normalization, and comparator readiness.

## Layout

- `catalog.json` is the entry point and binds every retained artifact.
- `intake-report.md` is the exact frozen intake report bound by both independent reviews.
- `cases/` contains exact source, same-revision license, provenance, and scoped task bytes.
- `reviews/` contains two independent machine intake reports and their machine adjudication.
- `defect-leads.json` contains normalized public issue leads. Every current lead is unbound and uncountable.
- `comparators.json` freezes the available target identity and records unavailable baselines as `unresolved`.

## Add or replace a case

1. Select an owner-controlled requirements artifact from a real product repository. Examples, templates, recruitment exercises, and implementation-only artifacts do not qualify.
2. Pin an exact 40-character commit and retain the source plus the applicable license from that same revision.
3. Record SHA-256 values, acquisition time, immutable upstream URLs, provenance, a product-specific task scope, and exactly one frozen stratum.
4. Confirm the source bytes are not already present under a different path or owner.
5. Recompute the corpus snapshot before review. Both machine reviewers must independently cover the complete snapshot, and adjudication must digest-bind both complete reports.
6. Link the three report entries in the catalog and run `npm run public-pilot`.

Do not repair a failing digest by editing only the declaration. Replace or intentionally regenerate the full downstream lineage: source/task metadata, snapshot, both reviews, adjudication, catalog links, and their digests.

## Defect boundary

A public issue URL is only a lead. It becomes countable only after immutable issue bytes are retained, the issue is shown to be a historical defect, it is deduplicated globally, and it is bound to a final-admitted valid case in the same product and stratum scope. The v1 ledger deliberately contains no countable defects and the validator rejects declarations that try to bypass a retained snapshot.

## Comparator history

The retained comparator registry records the superseded four-system research design. `long-prompt`, `test-case-designer`, and `technique-router` remain honestly unresolved because no authoritative licensed implementation identity was supplied or established. They are no longer release prerequisites under [ADR-001](../../../docs/decisions/ADR-001-single-system-release-gate.md).

No captures were invented. The current release gate consumes only genuine `generate-test-cases` captures retained under `benchmark/release/v1`; it does not reinterpret these synthetic pilot fixtures as release evidence.

## Current release boundary

Run `npm run benchmark` to inspect the single-system release gate. Until 90 genuine target captures are retained and bound to one clean candidate, the honest result remains `insufficient_evidence`. Machine intake reviews remain machine reviews and are not relabeled as human evidence.
