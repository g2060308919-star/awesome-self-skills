# Public benchmark evidence audit — 2026-08-31

## Question

Can public search alone supply the real assets required to turn the V1 benchmark from `insufficient_evidence` into a release-eligible result?

## Frozen release boundary

The controlling local sources are `../../AGENTS.md`, `benchmark/v1/adjudication/protocol.md`, `benchmark/v1/manifest.json`, and `benchmark/manifest.schema.json`. Together they require:

- six fixed strata and at least five distinct PRDs per stratum (30 total);
- at least three critical expert Test Points, two clarification-required PRDs, and five traceable historical defects per stratum;
- exactly four systems, three independent runs per PRD (360 captures);
- two independent experts completely labeling every expert Test Point, generated factual claim, and generated Case, plus completed third-party adjudication for disagreements;
- frozen, reproducible provenance for every system and every run;
- external captured evidence rather than the synthetic pilot.

No renamed copy or byte-identical source can count as a second PRD.

## Method and acceptance rule

Search was restricted to first-party repositories, specifications, documentation, and issue trackers. A source is not accepted merely because a search result calls it a PRD. For inclusion it still needs an owner, requirements-grade content, an immutable revision, redistribution or evaluation rights, distinct content, and traceable defects. Templates, tutorials, portfolio examples, synthetic fixtures, and unverified AI-generated demo PRDs are excluded.

## Findings

### 1. Public search did not establish a strict 30-PRD corpus

Public search produced many templates, product documentation pages, standards, RFCs, feature proposals, and recent demo repositories. These can be useful *PRD-equivalent* requirements sources in a separate future study, but they cannot be counted as 30 real PRDs in this frozen release gate. This audit did not find and verify 30 strict PRDs meeting all provenance, licensing, stratum, uniqueness, and defect-traceability conditions.

One strong requirements-grade candidate is TodoMVC's official [Application Specification](https://github.com/tastejs/todomvc/blob/master/app-spec.md). The owning repository states that its examples follow the same specification and that repository content is MIT-licensed unless otherwise specified ([TodoMVC repository](https://github.com/tastejs/todomvc)). It is a valid public specification candidate, but it is one document and is not itself titled or governed as a PRD.

Other search hits explicitly titled PRD, including [YAT's PRD](https://github.com/yat-hk/yat/blob/main/PRD.md) and [Hosted Jasper's PRD](https://github.com/sakibtamim/Jasper/blob/master/docs/hosted-jasper/prd.md), remain candidates only. This audit did not establish all required release facts for them, and neither a search result nor a filename proves product authority, independent provenance, licensing, stratum fitness, or historical-defect coverage.

### 2. Public defects are possible, but must be bound case by case

First-party issue trackers can provide real historical defect records. For example, the TodoMVC project has a public [issue tracker](https://github.com/tastejs/todomvc/issues). A benchmark defect record still needs a corpus-unique ID, frozen risk, source reference, and a defensible relationship to the selected requirements. Five arbitrary issues cannot be attached to a stratum merely to satisfy its denominator.

### 3. The comparator baselines are not yet reproducible

The frozen design names `long-prompt`, `test-case-designer`, and `technique-router`, but the package contains no real prompt/skill artifacts for those comparators.

A public repository named [test-case-designer](https://github.com/ll0v0ll/test-case-designer) is a plausible candidate, but its visible root currently has no explicit license file. GitHub's own licensing guidance states that without a license, default copyright applies and others may not reproduce, distribute, or create derivative works ([GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)). It therefore must not be vendored as the baseline without permission or a license clarification.

No public artifact was established as the uniquely intended `technique-router`. A new comparator may be authored and frozen before any capture, but it cannot be changed after seeing benchmark labels or results.

### 4. Public search cannot supply independent expert annotations

Even a perfect public corpus would not provide the required two complete, independent expert label sets and disagreement adjudications. Public specifications and issue discussions are source evidence, not benchmark annotations. AI agents or inferred labels must not be represented as external expert evidence.

## Conclusion

Public search is useful for building a version-pinned candidate pool and finding traceable defects, but **public search alone cannot make the release gate pass**. The current honest result remains `insufficient_evidence` until all of the following are separately completed:

1. an accepted 30-item corpus under the frozen PRD interpretation;
2. frozen definitions and versions for all three comparators and the target;
3. 360 genuine independent captures with exact provenance;
4. two real independent expert annotation sets plus completed adjudication;
5. a clean offline score that passes every frozen threshold.

This document is a research record, not corpus evidence, an expert label, a capture, or a release result.
