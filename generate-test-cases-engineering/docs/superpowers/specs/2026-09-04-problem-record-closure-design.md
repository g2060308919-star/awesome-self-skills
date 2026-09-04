# Generate Test Cases Problem-Record Closure Design

## Authority and scope

This increment closes every actionable observation in:

- `测试用例生成执行问题记录.md` (`GTCC-001` through `GTCC-020`)
- `generate-test-cases-skill-problem-record.md` (`GTC-001` through `GTC-007`)

The user explicitly retired `generate-test-cases-remediation-spec.md`; it is not an authority for this increment. The execution-closure specification remains authoritative only for execution decisions, presentation confirmation, finished delivery, and post-delivery changes. The baseline design and implementation plan remain authoritative elsewhere.

The PRD-to-Case chain and the private `advanceStrict(absoluteRunDirectory)` interface remain intact. The change does not add a public CLI, npm package, MCP service, browser/API runner, comparator, expert benchmark, global installation, or release tag.

## Root-cause findings

The earlier remediation closed execution-plan confirmation and several Skill wording defects, but five structural causes remain:

1. A Source Pack can declare an arbitrary `content_digest`; locators only compare against that declaration. The compiler does not recompute the source body digest.
2. The compiler accounts for facts after extraction but has no explicit inventory proving that the supplied source text was reviewed before extraction. A sentence omitted before fact creation is invisible to later coverage ledgers.
3. A terminal fact routed directly to NotApplicable appears in requirement accounting but not in the final exclusion collection, so the bundle's visible exclusion inventory is incomplete.
4. Canonical Markdown exposes compiler IDs throughout the primary reading path and orders cases by canonical identity instead of business execution value.
5. The delivery has no mechanically derived manual-execution worksheet. Users therefore copy and reshape content by hand, creating drift from canonical JSON.

## Design

### 1. Source integrity and exhaustive review

`validateSourceIntegrity(sourcePack)` recomputes SHA-256 over every UTF-8 `source.content` and rejects a mismatched `content_digest` with `SOURCE_CONTENT_DIGEST_MISMATCH`. Existing locator digest and selector checks remain.

Source Pack gains a closed `source_reviews` collection. Each source has exactly one review containing ordered, non-overlapping text spans. Spans use half-open UTF-16 offsets `[start, end)`, classify the text as `normative`, `non_normative`, or `uncertain`, and include a nonblank rationale. Reviews must cover every non-whitespace character in the exact source body; gaps, overlap, digest mismatch, dangling source references, duplicate reviews, or invalid ranges require Source Pack revision.

At Evidence Claims validation, the union of accepted direct-Claim text-range locators from the same immutable source version must cover every non-whitespace character in each `normative` or `uncertain` span. A single overlap is insufficient because it would allow the rest of a broad paragraph to disappear. Authors should therefore split broad source passages into atomic review spans and direct Claims. `non_normative` spans are accounted by their rationale and never become evidence merely because they were reviewed.

This is a completeness gate over supplied text, not a natural-language truth oracle: a malicious or mistaken `non_normative` classification still requires human review. The final quality limits state that boundary explicitly.

### 2. Unified NotApplicable visibility

`coverage.not_applicable` becomes a closed discriminated collection with `subject_kind`:

- `formal_test_point`: the existing obligation exclusion record.
- `requirement_fact`: a terminal fact route with its fact ID, exclusion claim, scope, supported review, and the compiler-projected business exclusion reason.

Requirement exclusions remain outside formal Test Point denominators and execution decisions. The execution-plan universe continues to include only Cases, formal Test Points, and Exploratory items. Markdown presents both kinds in one business-readable exclusion section and distinguishes why each is excluded.

### 3. Case outcome atomicity

One Case may close multiple formal obligations only when all obligation-oracle expectations describe the same independently diagnosable observed outcome. The compiler derives an outcome signature from the preceding action, observer, observation surface, observation target, Oracle type, comparison, and expected state/value. Distinct signatures in one Case return `CASE_OUTCOME_NOT_ATOMIC` and require the Case Draft to be split. This does not impose an arbitrary step or expectation count.

### 4. Business-first deterministic Markdown

Canonical JSON remains the sole normative result. Markdown is a pure deterministic projection with two layers:

1. Business delivery: one-line readiness and coverage overview; scope/module flow; execution order; executable cases; DoNotExecute, Blocked, Exploratory, and NotApplicable summaries; manual worksheet.
2. Audit appendix: stable IDs, evidence links, formal obligation mappings, digests, and detailed ledgers.

The primary sections use display numbers instead of stable IDs. Case ordering is deterministic by execution disposition, scope, risk (`critical`, `high`, `medium`, `low`), role, title, and finally stable ID as an invisible tie-breaker. This preserves reproducibility without making hashes the user's navigation model.

Risk is rendered with named fields. Clarifications and blockers use business subject, cause, impact, and one answerable atomic question. Blockers sharing one compiler root are presented once, with every affected Test Point and its confirmed execution decision nested under that root. Example/baseline/derived values are labeled from their provenance and evidence level.

### 5. Manual execution record boundary

The Markdown worksheet is derived from the confirmed execution plan and contains display number, title, scope, risk, assignee/role, result, defect reference, and notes. Result fields are explicitly blank/not-recorded at generation time. The Skill instructs users to create a downstream execution record bound to `bundle_digest + case_id`; it never mutates canonical JSON or claims that execution occurred.

### 6. Versioning and migration

Because Source Pack and Test Bundle contracts change incompatibly, schema version becomes `2.1.0` and compiler version becomes `0.3.0`. Manifest, embedded bundle, fixtures, checkpoints, and tests move together. A `2.0.0` run receives the existing migration/new-run response rather than partial interpretation.

## Issue closure map

- `GTC-001`: recomputed source digest plus existing immutable locator checks.
- `GTC-002`, `GTC-003`, `GTC-005`: retained execution-closure tests prove these already-implemented paths.
- `GTC-004`: unified requirement/formal NotApplicable collection.
- `GTC-006`: exhaustive source review plus normative-span-to-Claim gate.
- `GTC-007`: maintainable source, tests, build, and bundled installed shape remain separate and are validated together.
- `GTCC-001`, `002`, `009`, `010`, `011`, `013`–`020`: business-first Markdown, explicit labels, deterministic business order, worksheet, and audit appendix.
- `GTCC-003`–`008`: structured cause/impact/atomic-question rendering and distinct categories for business-rule gaps, scope exclusions, evidence gaps, and execution preparation.
- `GTCC-012`: compiler-enforced observed-outcome atomicity.

## Acceptance boundary

Completion requires targeted Red→Green evidence for every new behavior, original PRD-to-Case and execution-closure regressions, schema/manifest integrity, bundle build freshness, deterministic/golden/recovery tests, official Skill validation, and a reviewed diff. It does not claim large-scale business accuracy benchmarking or real test execution.
