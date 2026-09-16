# Frozen comparison protocol

## Isolation and configuration

For each cell below, start a clean conversation with no prior generated Facts, Views, Cases, answers, summaries, or output files. Use an isolated run directory. The baseline and candidate must use the same model, reasoning setting, tool availability, initial prompt, source bytes, delivery intent, and answer semantics. Record the exact configuration and every turn.

The initial prompt is: “请根据所提供的原始需求材料生成完整、可验收的人工功能测试用例。” It does not authorize assumptions, deferral, unknown, or delivery with gaps.

If a real semantic question appears, answer only then with the matching script. Bind the answer through the version's advertised action; never paste protocol IDs into the user answer. Do not force a post-case question if the issue was already found pre-case.

Retain for every run:

1. implementation identity and source-tree digest;
2. model, reasoning configuration, available tools, start/end time, and isolated run path;
3. every user/assistant turn, actual questions and answers, and compiler acceptance/revision result;
4. final `current.json`, canonical JSON, HTML, Table, Markdown, CSV, and source-reading summary;
5. source→Case omissions, Case→source assertions, target counterexamples, and opened HTML/Table review;
6. all failures and unverified items—never select only the best run.

## Run matrix

| Family | Initial input | Variant | Independent runs per version |
| --- | --- | --- | ---: |
| F01 | `inputs/F01-announcement-flow.md` | fixed | 3 |
| F02 | `inputs/F02-condition-and.md` | AND | 1 |
| F02 | `inputs/F02-condition-or.md` | OR | 1 |
| F03 | `inputs/F03-ambiguity.md` | final/temporary/unknown/defer/partial/delivery controls are separate runs | 3 total minimum, preserving every exercised script |
| F04 | `inputs/F04-filter-mapping.md` | fixed | 3 |
| F05 | `inputs/F05-input-dependency.md` | fixed | 1 |
| F06 | `inputs/F06-observation-ui.md` | UI-only | 1 |
| F06 | `inputs/F06-observation-interface.md` | stated request and business-success contract | 1 |
| F06 | `inputs/F06-observation-missing-rule.md` | success rule missing | 1 |
| F07 | `inputs/F07-image-comments.md` plus its referenced image and two comment pages | fixed | 3 |
| F07 | `inputs/F07-offline-excerpt.md` | offline excerpt only | 1 |
| F07 | `inputs/F07-unreadable-attachment.md` | unavailable attachment | 1 |
| F08 | `inputs/F08-evidence.md` | complete formula | 1 |
| F08 | `inputs/F08-evidence-missing-parameter.md` | required parameter missing | 1 |

Run the complete matrix once against the direct baseline and once against the candidate. F01, F03, F04, and F07 require at least three clean contexts for each version. A23 uses `review-candidates/` in separate clean review-only contexts; it is never counted as raw-input generation.

## Comparison rules

Compare business meaning, not exact Case count, title, wording, random IDs, or timestamps. A run fails if it merges independently failing results, drops a supported terminal result, changes object mid-path, hides a required action in setup, invents a product rule, misses a necessary question, broadens authorization, loses an accepted answer, presents an incomplete Table/HTML, or damages historical verification. A stronger metric cannot offset one of these failures.

Only after all required cells have actual retained evidence may the result be described as “within this frozen corpus and configuration, no corresponding regression was observed.”
