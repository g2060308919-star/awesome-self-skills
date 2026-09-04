# Problem-record closure evidence

## Scope

This increment closes the actionable observations in `测试用例生成执行问题记录.md`
(`GTCC-001` through `GTCC-020`) and `generate-test-cases-skill-problem-record.md`
(`GTC-001` through `GTC-007`). The retired remediation specification was not used
as an authority. The execution-closure specification remained authoritative only
for execution decisions, confirmation, finished delivery, and post-ready changes.

The maintainable development root is `generate-test-cases-engineering`. Its built
installed shape is `skill/generate-test-cases`; the repository-published copy is
`../generate-test-cases`. The two installed shapes were compared byte-for-byte.

## Closure matrix

| Issue | Closure |
| --- | --- |
| GTC-001 | The compiler recomputes SHA-256 from the exact UTF-8 source body and retains the existing source/locator/range/version binding checks. |
| GTC-002 | Existing append-only Decision, revision, stale-obligation association, reanalysis, and clarification recovery paths remain covered by the execution-closure and source-revision suites. |
| GTC-003 | Existing execution-plan closure requires explicit dispositions and an exact displayed-plan confirmation; only Grounded + Execute Cases enter `runner_case_ids`. |
| GTC-004 | `coverage.not_applicable` is a closed discriminated union containing both formal Test Point exclusions and terminal requirement-fact exclusions, including their source-backed business subject and reason. |
| GTC-005 | Checkpoints, current pointers, presentations, execution plans, and preview requests are closed schemas and are verified across crash/recovery boundaries. |
| GTC-006 | Each supplied source now has one exhaustive review partition; all normative or uncertain non-whitespace text must be represented by accepted direct-Claim locator coverage. The output explicitly describes coverage as declared-scope accounting rather than total product coverage. |
| GTC-007 | The repository contains modular source, package/lock files, build, unit/interface/recovery/golden tests, and a reproducible bundled installed shape. `npm test` also fails if the repository-published Skill differs byte-for-byte from the engineering build shape. |
| GTCC-001 | Normal clarification and the primary Markdown view hide root, obligation, Fact, Claim, and digest identifiers; they remain available only in the audit appendix/protocol. |
| GTCC-002 | Clarification policy requires named Critical/High/Medium/Low counts and rejects unlabeled tuples. |
| GTCC-003 | Clarification policy and compiler output require answerable product-language questions, scope, cause, impact, and required material instead of generic “clarification required” statements. |
| GTCC-004 | Product truth remains separate from testability; environmental/technical gaps use execution-preparation semantics, cannot upgrade evidence, and non-answerable gaps are not presented as business questions. |
| GTCC-005 | Product/module/role/client/version/region/environment scope is frozen before fact extraction; later material scope change requires a new run. |
| GTCC-006 | Business rules, execution preparation, scope exclusions, and source/evidence gaps have distinct presentation categories without changing their true classifications; invalid exclusion evidence is classified as a source/evidence gap. |
| GTCC-007 | Each visible root gap includes its business-readable cause, impact, complete scope set, highest risk, required input, atomic next question, affected Test Points with individual scope/risk, and their confirmed DoNotExecute reasons. A grouped root appears only once. Raw protocol reasons and internal material references remain audit-only. |
| GTCC-008 | One independently answerable decision is requested per visible question/subquestion; the protocol binding is retained privately. |
| GTCC-009 | Business content is the primary Markdown layer; IDs, evidence references, execution signatures, and ledgers are isolated in the audit appendix. |
| GTCC-010 | Delivery wording says requirement accounting and formal Test Point coverage, and the Skill explicitly says this is declared-scope accounting rather than complete PRD/product coverage. |
| GTCC-011 | Independent risk hypotheses remain explicit Exploratory entries, outside the formal denominator, and are shown in the primary delivery. |
| GTCC-012 | A Case containing more than one independently diagnosable typed outcome is rejected with `CASE_OUTCOME_NOT_ATOMIC`. |
| GTCC-013 | “Same as baseline” is not executable unless the version/state, compared fields, and expected values or permitted differences are explicit; otherwise the Test Point remains Blocked. |
| GTCC-014 | Final test data receives compiler-owned `value_origin`: requirement, source description, example, derived, or temporary assumption. Case Drafts cannot self-label it, and a submitted provenance type that disagrees with the referenced Claim form is rejected. |
| GTCC-015 | Derived values retain replayable E2 provenance; assumptions remain E1/Conditional and cannot be rendered as confirmed requirements. |
| GTCC-016 | Markdown begins with a compact business plan and keeps detailed traceability in an audit appendix. |
| GTCC-017 | `Execution Overview` provides a one-row-per-Case inventory with title, scope, risk, role, and disposition. |
| GTCC-018 | Business Cases are deterministically sorted by execution disposition, then scope, risk, role, title, and stable ID as an invisible tie-breaker. |
| GTCC-019 | JSON is the sole normative result and Markdown is mechanically rendered from the same validated snapshot; post-render hand editing is forbidden. |
| GTCC-020 | The manual worksheet contains exactly the confirmed `runner_case_ids`, starts with `Not recorded` and blank defect/notes placeholders, and binds later downstream results by bundle digest plus stable Case ID. |

## Red to green evidence

- Invalid body digests, missing/overlapping/gapped source reviews, blank rationales,
  partially unclaimed normative spans, and the original quadratic span/Claim scan
  failed before the integrity, exhaustive-review, and range-index implementation;
  the targeted evidence suite now passes, including 6,000 span/Claim pairs in
  bounded time.
- Terminal requirement-fact NotApplicable visibility and execution-inventory
  deduplication failed before the discriminated final projection; coverage and
  execution-plan suites now pass.
- Multi-outcome Case Drafts failed only after adding the new regression, then passed
  after the atomicity gate was implemented.
- Business-first headings, display IDs, ordering, blank worksheet, and data-origin
  labels failed their new renderer tests before implementation, then passed with
  reviewed JSON/Markdown goldens for all ten journeys.
- Forged data provenance types, internal codes/IDs in the business layer, generic
  exclusion wording, missing DoNotExecute reasons, stale repository-published
  Skill bytes, and invalid audit heading ownership each failed an independent
  regression before their fixes and now pass.
- Blocked/Exploratory execution reasons, answerable blocker questions, exclusion
  gap routing, grouped-root presentation, and NotApplicable business subjects each
  failed a focused Markdown regression before their fixes and now pass.
- A version-2.0 Source Pack migration regression failed before the 2.1.0 gate and
  now returns the explicit migration/new-run reply.

## Verification

All commands ran from `generate-test-cases-engineering` unless noted.

- `npm test` — exit 0; 815/815 main tests plus 100 fresh installed-shape runs
  byte-identical.
- `npm run check` — exit 0; `tsc --noEmit`, generated-bundle freshness, the same
  815/815 tests, and the 100-run repeatability test all passed.
- `npm run build` followed by `node build/build.mjs --check` — exit 0.
- `node --check skill/generate-test-cases/scripts/test-compiler.mjs` — exit 0.
- Official `quick_validate.py` with the dependency-complete Python 3.12.14
  environment against both installed shapes — exit 0, `Skill is valid!`.
- Repository-published bundle import/argv smoke — exit 0; sole named export
  `advanceStrict`, import produced no side effect, and 0/relative/nonexistent/2+
  arguments produced one fatal JSON line with exit 0 and no accepted run.
- `diff -qr skill/generate-test-cases ../generate-test-cases` — exit 0.

Final installed-shape digests after the complete passing gate:

- `SKILL.md`: `8c3417f7b3d6f1f5ef6823a7769486bd89eb81f9a9241796eda44039802b98ea`
- `test-compiler.mjs`: `7dc1eec705af7327a2b0aec30ca4b4b7aa17caa466ef844458f27dfa1e5d8939`
- `schema-manifest.json`: `7c2af5eecd6253a3b26a4e844efa793f2b64e10b71ab1ce7a233a1733925fcf4`
- `source-pack.schema.json`: `9ec71b61865760bd27f2429f278b6f2c783e960c0de1cf739f6bd6f6f412191e`
- `test-bundle.schema.json`: `3101f18ad3b6fcbd9a6ac71ca46f1a41400c1011d2833533f4239f440cf36a70`

This evidence validates engineering behavior and reproducibility. It does not claim
that test cases were executed, defects were recorded, or a large-scale business
accuracy benchmark was performed.
