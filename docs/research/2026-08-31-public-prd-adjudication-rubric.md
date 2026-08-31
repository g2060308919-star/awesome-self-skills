# Public PRD Corpus Pre-Adjudication Rubric

**Date:** 2026-08-31  
**Status:** Frozen machine-adjudication rubric, prepared before reviewing the pending A/B research conclusions  
**Decision scope:** Public-source PRD corpus admission only  
**Non-claim:** This document is not an expert annotation, external-expert adjudication, benchmark capture, benchmark result, legal opinion, or release approval.

## 1. Purpose and hard boundary

This rubric defines how a machine adjudicator will evaluate public-source corpus candidates and reconcile later A/B research reports. It does not itself admit any candidate. A candidate counts only after an evidence-backed decision under this rubric is recorded.

The repository currently contains a synthetic pilot and does not contain the complete external expert corpus or captured baseline runs. Missing evidence must remain `insufficient_evidence`; it must not be inferred, fabricated, or replaced with machine-authored labels. Public-source research alone cannot satisfy the release gate. These limits come from the [handoff instructions](../../../../AGENTS.md), the [adjudication protocol](../../benchmark/v1/adjudication/protocol.md), and the [public benchmark evidence audit](2026-08-31-public-benchmark-evidence.md).

The rubric therefore separates three things:

1. **Source admission:** whether a public artifact is eligible to become one benchmark PRD item.
2. **Corpus composition:** whether the admitted items collectively meet the frozen stratum and provenance requirements.
3. **Release evidence:** later captures, two independent human-expert label sets, completed disagreement adjudication, and passing offline gates.

Passing source admission is necessary but never sufficient for release.

## 2. Controlling evidence and precedence

The following sources are applied together. A permissive reading of one source cannot waive a stricter applicable requirement in another.

| Priority | Source | Controlling role |
|---:|---|---|
| 1 | [Handoff instructions](../../../../AGENTS.md) | Repository status, non-fabrication, and `insufficient_evidence` boundary |
| 2 | [Adjudication protocol](../../benchmark/v1/adjudication/protocol.md) | Corpus, capture, expert-label, lineage, defect, and release-evidence rules |
| 3 | [Manifest schema](../../benchmark/manifest.schema.json) and [gates](../../benchmark/gates.mjs) | Closed machine-readable shape and executable release thresholds |
| 4 | [Current manifest](../../benchmark/v1/manifest.json) | Frozen current pilot configuration; it is evidence of current state, not proof of a future external corpus |
| 5 | [Public benchmark evidence audit](2026-08-31-public-benchmark-evidence.md) | Discovery leads and known gaps only; it is not corpus evidence, expert evidence, or a release result |

For facts about a public candidate, evidence precedence is:

1. the exact, immutable, first-party source revision;
2. first-party license, repository metadata, issue, commit, or release record pinned to an immutable revision;
3. an independently archived byte-identical copy used only to preserve or verify the first-party record;
4. secondary search results or commentary, used only to locate stronger evidence.

Secondary summaries, search snippets, filenames, stars, popularity, or an agent's interpretation cannot cure absent first-party evidence.

## 3. Decision vocabulary

Every candidate receives exactly one status:

| Status | Meaning | Counts toward corpus minimums? |
|---|---|---:|
| `ADMIT` | Every item-level mandatory criterion below is proved by fixed evidence. | Yes |
| `HOLD` | The artifact may qualify, but a curable fact is missing or ambiguous, such as license scope, ownership, governing role, or immutable revision. | No |
| `REJECT` | A disqualifying fact is established, such as a template, tutorial, synthetic fixture, fabricated provenance, or non-requirements artifact. | No |
| `DUPLICATE` | The content is already represented by an admitted item or is not independent under the duplicate rules. | No |

There is no conditional admission and no partial credit. Unresolved evidence results in `HOLD`, not an optimistic `ADMIT`.

## 4. Item-level admission rubric

A candidate is `ADMIT` only when all mandatory rows are satisfied.

| Criterion | Minimum proof | Fail-closed result |
|---|---|---|
| First-party identity | The artifact is published by the product/project owner in its official repository or official documentation property. Owner and canonical URL are recorded. | `HOLD` if ownership is unclear; `REJECT` if it is a third-party reconstruction. |
| Governing PRD role | First-party context shows that the frozen artifact governs intended product behavior as a product requirements document or owner-controlled functional requirements specification. A filename or page title containing “PRD” is neither sufficient nor required by itself. | `HOLD` if the governing role is not established; `REJECT` for commentary or examples that do not govern behavior. |
| Requirements-grade content | The artifact contains enough normative product behavior to derive observable test points: defined scope, actors or system behavior, requirements/acceptance constraints, and relevant boundary or failure behavior. | `REJECT` for a blank template, checklist shell, tutorial, portfolio sample, API marketing page, or implementation-only notes. |
| Authenticity | The artifact predates this benchmark, has an independent owner, and is bound to a real proposed, in-progress, or implemented product/project. AI-assisted authorship is not by itself disqualifying. Disqualifying materials are artifacts generated for this benchmark or templates, samples, demos, and fictional fixtures with no real project binding. | `REJECT` only for the disqualifying cases; `HOLD` while real-project binding is unproved. |
| Original-source usability | A generator can receive the original source plus the benchmark task without needing hidden labels, audit conclusions, expected outputs, or historical run diagnostics. | `REJECT` if the item is inseparable from answer material; otherwise `HOLD` pending a clean source package. |
| Immutable version | Exact bytes are bound to an immutable full commit, immutable release/archive object, or equivalent content-addressed revision. The record includes canonical source URL, owner, revision identifier, path, retrieval time, exact-byte SHA-256, and path-independent content digest. Mutable branch URLs or “latest” pages alone are insufficient. | `HOLD` until fixed. |
| License and evaluation rights | The exact artifact has an explicit applicable license or written authorization covering the intended local reproduction, benchmark evaluation, retention, and distribution of derived annotations/captures. The license name/version, canonical license URL/path, revision, copyright owner, and scope-to-file evidence are recorded. | `HOLD`; public readability, repository visibility, or silence is not permission. Ambiguity is escalated to an authorized legal/rights reviewer, not resolved by the machine adjudicator. |
| Content independence | Exact-byte and path-independent content digests are compared with all admitted items. Renames, mirrors, translations that merely reproduce the same requirements, vendored copies, and material subsets/supersets intended to multiply one source do not create independent items. | `DUPLICATE`, or `HOLD` if derivation is uncertain. |
| Stable provenance | A provenance record identifies source, task, fixed version, digest method, acquisition time, and corpus item ID without using local absolute paths as identity. | `HOLD`. |
| Stratum fit | One frozen stratum is supported by the artifact's actual product/domain and risk characteristics, rather than selected only to fill a quota. | `HOLD` on a classification dispute; `REJECT` if it fits none of the six frozen strata. |
| Expert-label feasibility | The artifact exposes enough observable semantics for two independent experts later to label Test Points, factual claims, and Cases with bidirectional closure. This is a feasibility screen only; the machine does not author or pre-approve those labels. | `HOLD` if feasibility cannot be established. |

The public evidence audit's named sources remain candidates until they satisfy every row. Being requirements-grade, open source, or well known is not by itself an admission decision. The audit explicitly treats public search as discovery rather than release evidence. See the [audit conclusions](2026-08-31-public-benchmark-evidence.md) and the [protocol's evidence controls](../../benchmark/v1/adjudication/protocol.md).

## 5. Corpus-level acceptance rules

After item-level decisions, the admitted set must independently satisfy all corpus rules. An individually valid PRD may remain unused if including it would break corpus uniqueness, provenance, or frozen composition.

1. The corpus contains at least 30 admitted items: at least five in each of the six frozen strata in the [manifest](../../benchmark/v1/manifest.json) and [manifest schema](../../benchmark/manifest.schema.json).
2. Each item is content-distinct under exact-byte and path-independent content identity. Repositories, paths, or names are not independence proofs.
3. The source package for every item is frozen before any system capture. Labels, prior outputs, diagnostics, and adjudication material remain outside generation inputs.
4. Each stratum must ultimately contain at least three critical expert Test Points and at least two clarification-required PRDs. Machine pre-screening may assess feasibility, but only the later independent expert process establishes those labels.
5. **Historical defects are a stratum-level requirement, not a per-PRD admission requirement.** Each stratum must have at least five valid, traceable, corpus-unique historical defects. A PRD with no defect record is not automatically rejected if the stratum total is satisfied.
6. No defect, source artifact, capture, raw output, extracted object, or label snapshot may be reused across nominally different corpus items to inflate a denominator.
7. All four systems and all three independent repeats per item must later be present, yielding 12 captures per PRD. Corpus admission does not assert that those captures exist.

These are the frozen composition rules of the [adjudication protocol](../../benchmark/v1/adjudication/protocol.md), represented in the current [manifest](../../benchmark/v1/manifest.json) and enforced in part by the [schema](../../benchmark/manifest.schema.json).

## 6. Historical-defect traceability minimum

A historical defect may count toward a stratum's minimum only if all of the following are recorded:

- a dense, corpus-unique defect ID;
- the affected admitted item or a defensible mapping to that item's product/requirements scope and stratum;
- a fixed first-party source reference, such as an immutable issue snapshot, commit, or release note;
- the original first-party identifier and canonical URL;
- evidence that the record describes an actual historical product defect rather than a hypothetical test idea, feature request, duplicate bookkeeping entry, or benchmark-authored scenario;
- a frozen risk classification with an evidence-backed rationale and affected behavior;
- the immutable revision and exact digest of the retained evidence;
- a uniqueness check preventing the same underlying defect from being counted through aliases, mirrors, multiple commits, or multiple PRDs.

Invalid or duplicate defect entries are excluded from both numerator and denominator. Missing defects lower the stratum count; they do not retroactively make an otherwise admissible PRD ineligible. This distinction follows the [protocol's per-stratum historical-defect rule](../../benchmark/v1/adjudication/protocol.md) and the corresponding [manifest minimum](../../benchmark/v1/manifest.json).

## 7. License and fixed-version adjudication

### 7.1 License rule

The adjudicator records evidence, not a legal conclusion. An explicit license must be shown to apply to the exact artifact and intended benchmark use. A repository license that excludes documentation, a page governed by different site terms, an unlicensed subdirectory, or unclear ownership remains `HOLD`. Permission must not be inferred from public availability or from a license on unrelated code.

If a license changes, only the license applicable to the frozen source revision is considered. Later relicensing does not silently alter the admitted record; it requires a new evidence record and explicit corpus decision.

### 7.2 Fixed-version rule

Admission binds identity to bytes, not a mutable path. The minimum binding tuple is:

```text
owner + canonical source URL + immutable revision + source-relative path
+ exact-byte SHA-256 + path-independent content digest + acquisition timestamp
```

The exact source/task digests used by captures must later match this admission record. A changed byte sequence, moved scope, or materially changed license creates a new candidate revision; it must not silently overwrite the admitted item or its history. This is consistent with the protocol's frozen provenance and append-only correction rules in the [adjudication protocol](../../benchmark/v1/adjudication/protocol.md).

## 8. A/B conflict adjudication procedure

When the two independent reports are later supplied, they will be evaluated claim by claim without changing this rubric.

1. **Freeze inputs.** Record each report's digest and receipt time. Do not merge or rewrite either report.
2. **Normalize candidate identity.** Match candidates by immutable source identity and content digest, not display name or local path.
3. **Build an issue matrix.** For every candidate, compare the reports on ownership, governing PRD role, requirements quality, authenticity, version, license, uniqueness, stratum, defect evidence, and proposed status.
4. **Verify cited primary evidence.** A report's conclusion has no independent authority. Reproduce the underlying first-party evidence at the pinned revision.
5. **Resolve by evidence, not votes.** Agreement is adopted only when its evidence satisfies this rubric. Disagreement is decided by the strongest applicable controlling or first-party evidence; confidence, verbosity, or report order does not decide it.
6. **Fail closed.** If a material disagreement cannot be resolved from fixed primary evidence, assign `HOLD`. License ambiguity, mutable provenance, unexplained lineage, and unresolved duplication cannot be averaged away.
7. **Preserve the conflict record.** Record both positions, cited evidence, the exact governing rubric clause, resolution, rationale, and unresolved follow-up. Sort records deterministically by normalized candidate ID and issue key.
8. **Do not backfill release evidence.** The final machine ruling may admit a source or identify a defect candidate; it cannot create an expert label, external-expert adjudication, captured run, or passing gate.

Specific tie-break rules:

| Conflict | Resolution rule |
|---|---|
| “PRD” title vs. weak content | Content and first-party governing role control; title alone loses. |
| Requirements specification vs. strict PRD | Require first-party evidence that it governs product requirements. Without it, `HOLD`; do not broaden the frozen interpretation merely to meet quota. |
| First-party pinned artifact vs. secondary description | The pinned first-party artifact controls. |
| Mutable current page vs. earlier pinned revision | Evaluate the pinned revision. A materially different current page is a separate candidate revision. |
| Public access vs. absent license | Absence of applicable permission controls: `HOLD`. |
| Same content under different names/paths | Content identity controls: `DUPLICATE`. |
| Competing stratum classifications | Use frozen stratum definitions and product/risk evidence. If more than one remains equally defensible, `HOLD` pending an explicit, documented classification decision. |
| Conflicting defect mappings | Count the defect only where first-party history and affected requirements establish the relationship; otherwise exclude it until resolved. Never count it twice. |

## 9. Agent-annotation prohibition

The machine adjudicator and the A/B research agents are not the two independent external experts required by the protocol. Therefore:

- agent-produced annotations, candidate Test Points, label suggestions, statuses, or rationales must not be stored or represented as `expert_annotations`;
- agent identities must not populate external expert or adjudicator identity fields;
- agreement between two agents is not independent expert agreement;
- an agent ruling cannot complete an expert disagreement record;
- agent-authored data cannot justify changing `evidence_class` from `synthetic-pilot` to `external-expert-corpus`;
- agent research and this rubric must not enter generator prompts, raw capture inputs, expected outputs, or hidden answer material;
- any agent-suggested label or defect is only a research lead and must be independently established by the protocol's real expert and provenance process.

The protocol requires two distinct nonblank expert identities and completed adjudication for every disagreement, while the handoff forbids fabricated expert labels and passing results. The public evidence audit also states that AI-agent or inferred labels cannot be represented as external expert evidence. See [protocol](../../benchmark/v1/adjudication/protocol.md), [handoff instructions](../../../../AGENTS.md), and [audit](2026-08-31-public-benchmark-evidence.md).

## 10. Required decision record

Every later candidate ruling must include this minimum record:

```yaml
candidate_id: stable local research identifier
decision: ADMIT | HOLD | REJECT | DUPLICATE
canonical_owner: string
canonical_source_url: string
immutable_revision: string
source_relative_path: string
source_sha256: 64-hex
content_digest: 64-hex
license:
  name_and_version: string
  evidence_url_or_path: string
  immutable_revision: string
  scope_rationale: string
governing_prd_role_evidence: [fixed primary references]
stratum: one frozen stratum or null
duplicate_of: admitted candidate_id or null
historical_defect_candidates: [research references only]
a_report_position: string
b_report_position: string
resolved_conflicts: [issue, evidence, rubric_clause, resolution, rationale]
unresolved_items: [string]
machine_adjudicator_non_expert: true
```

An `ADMIT` record must have no unresolved mandatory item. Defect candidates in this record do not count until separately validated under Section 6.

## 11. Release boundary after corpus adjudication

Even a fully admitted 30-item corpus remains non-release evidence until all comparator and target versions are frozen before capture; 12 independent captures per PRD exist; raw output and extraction provenance are closed; two real experts independently and completely annotate every required object; every disagreement is adjudicated; lineage is gap-free; and the executable gates pass without non-finite, empty, or inconsistent denominators. The [gates](../../benchmark/gates.mjs) additionally require the frozen metric thresholds, zero unsupported critical/high Grounded Oracles, adequate historical-defect recall in every domain/stratum mapping, and zero prohibited process failures.

Until those facts exist, the correct state remains `insufficient_evidence` regardless of how many public candidate sources have been discovered.
