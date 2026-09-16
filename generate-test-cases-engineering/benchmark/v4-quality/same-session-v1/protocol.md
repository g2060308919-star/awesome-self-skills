# User-approved same-session comparison protocol

## Authority and limitation

2026-09-16，用户明确同意不创建真正独立、无历史上下文的模型任务，并要求在同一任务会话完成 A23/A24。This protocol records that explicit relaxation without rewriting the frozen `v1/` protocol.

当前任务已经读取实现历史、候选策略和 `v1/acceptance-oracle.md`。Therefore this exercise is oracle-aware and not blind. Its passes不得描述为独立、冷上下文或平台签名的模型证据. It can show that the current task can apply the baseline and candidate instructions to the frozen raw inputs and that the candidate did not lose the required meanings in this user-approved mode.

## Fixed inputs and versions

- Initial prompt for every pass: “请根据所提供的原始需求材料生成完整、可验收的人工功能测试用例。”
- Direct baseline: commit `3464c670c8cb185f3803ecc767219af7a20a2c6d`.
- Candidate: commit `6f42f19f59d3d3bdb619041af2ccb80bd902fd9d`, with the runtime/source tree projection bound by `manifest.json`.
- Raw inputs and answer semantics: byte-identical files from `../v1/`.
- The same current-task model, reasoning context, tools, and source bytes are used for both versions.
- The task exposed the model family as GPT-5, but did not expose an exact deployment ID or reasoning-effort setting. Those fields are retained as unavailable rather than guessed.
- Baseline passes apply the policy at the direct baseline; candidate passes apply the workspace policy.
- At evaluation time the user had not authorized installation, commit, push, publication, target-system execution, or historical-run mutation. Commit/push/PR authorization was granted later; installation, target execution and historical-run mutation remain outside scope.

## Pass procedure

Each row in `matrix.md` is a reviewer-authored same-session comparison observation. For each observation the task reads the named raw input, checks the business understanding, necessary clarification, independently diagnosable results, source-to-result and result-to-source coverage, and then compares the retained result with the oracle. Row IDs are unique and exhaustive for this matrix, but no逐行原始模型 transcript was retained. Therefore the matrix is review evidence, not replayable run evidence, and its status is `same_session_reviewed` rather than release acceptance.

F03 observations separately exercise final, temporary, unknown, defer, delivery, partial and invalid-answer handling. In the partial observation the displayed batch also contains another independent fixture item; only that other item is answered, while the entire F03 time-boundary question remains pending. The other item is used only to exercise batching and does not supply or alter F03 business truth. The compiler's event acceptance, stale-answer, recovery, renderer, and transaction behavior remain supported by the deterministic tests cited in `acceptance.md`; this same-session exercise does not fabricate compiler event IDs or claim that a narrative record is a runner checkpoint.

## Decision rule

An observation is marked failed if it loses a sourced outcome, merges independently failing results, changes the target object, hides a required action in setup, invents a product rule, omits a necessary question, broadens authorization, uses a weak signal that permits a false positive, or presents an incomplete current-format Table/HTML. Candidate non-regression is limited to this same-session, oracle-aware review matrix and is not a release-eligibility claim.
