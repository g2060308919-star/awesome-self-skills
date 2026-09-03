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

### 1. Follow-up work established a 30-item machine-intake corpus, not a formal release corpus

The initial search produced many templates, documentation pages, standards, RFCs, feature proposals, and demo repositories. Follow-up source-by-source remediation retained 30 independently identified owner-controlled requirements artifacts with immutable commit URLs, same-revision licenses, distinct bytes, provenance, and bounded tasks. Two independent machine reviewers and a machine adjudicator now admit all 30 to the separate public pilot, five in each frozen stratum.

That result is intentionally narrower than a formal benchmark admit. Some retained artifacts are requirements-grade product specifications or implementation plans rather than documents formally governed under the title “PRD”; none has external-human expert annotations or countable historical-defect evidence. The corpus therefore exercises intake and lineage but cannot be counted as the frozen release corpus.

Representative retained first-party sources include Hosted Jasper's [hosted-service PRD](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/docs/hosted-jasper/prd.md), Unbrowse's [acceptance criteria](https://github.com/unbrowse-ai/unbrowse/blob/e844f8f6af03b2ca9f0c466ac2262efceb2cf8ca/docs/architecture/ACCEPTANCE-CRITERIA.md), AgentAction's [gateway PRD](https://github.com/dinpd/AgentAction/blob/84722312663cc46a7d928d0d883332f8d6d1d821/docs/agentaction-gateway-prd.md), Cloudflare Agents' [queue specification](https://github.com/cloudflare/agents/blob/73d2ed457ba02035d2b1d3efc785c012254ac216/docs/agents/queue.md), and Runmill's [production-worker PRD](https://github.com/mikigraf/Runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/docs/asf-production-worker-prd.md). A filename or search result was never sufficient by itself; the pilot validator binds the exact retained bytes, project identity, license, and task.

### 2. Public defects are possible, but must be bound case by case

First-party issue trackers can provide real historical defect records. For example, the TodoMVC project has a public [issue tracker](https://github.com/tastejs/todomvc/issues). A benchmark defect record still needs a corpus-unique ID, frozen risk, source reference, and a defensible relationship to the selected requirements. Five arbitrary issues cannot be attached to a stratum merely to satisfy its denominator.

### 3. The target is frozen, but three comparator baselines are not reproducible

The public-pilot comparator registry content-addresses `generate-test-cases` to its current Skill, compiler, schema manifest, repository revision, model identity, and run recipe. The frozen design also names `long-prompt`, `test-case-designer`, and `technique-router`, but the package contains no authoritative real prompt/Skill artifacts for those comparators.

A public repository named [test-case-designer](https://github.com/ll0v0ll/test-case-designer) is a plausible candidate, but its visible root currently has no explicit license file. GitHub's own licensing guidance states that without a license, default copyright applies and others may not reproduce, distribute, or create derivative works ([GitHub Docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)). It therefore must not be vendored as the baseline without permission or a license clarification.

No public artifact was established as the uniquely intended `technique-router`. A new comparator may be authored and frozen before any capture, but it cannot be changed after seeing benchmark labels or results.

### 4. Public search cannot supply independent expert annotations

Even a perfect public corpus would not provide the required two complete, independent expert label sets and disagreement adjudications. Public specifications and issue discussions are source evidence, not benchmark annotations. AI agents or inferred labels must not be represented as external expert evidence.

## Conclusion

Public search produced a useful, reproducible 30-item machine pilot and normalized public defect leads, but **public search and machine adjudication cannot make the release gate pass**. The public pilot is `pilot_ready`; capture readiness is false; the formal result remains `insufficient_evidence` until all of the following are separately completed:

1. the pilot items are accepted under the frozen formal PRD interpretation by the required real external experts;
2. authoritative definitions and versions are frozen for the three unresolved comparators;
3. 360 genuine independent captures are retained with exact provenance;
4. two complete real independent expert annotation sets and completed third-party adjudication exist;
5. historical defects are immutably retained and validly bound, and the clean offline score passes every frozen threshold.

This document is a research record, not corpus evidence, an expert label, a capture, or a release result.
