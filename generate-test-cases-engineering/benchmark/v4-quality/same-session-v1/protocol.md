# User-approved same-session comparison protocol

## Authority and limitation

2026-09-16，用户明确同意不创建真正独立、无历史上下文的模型任务，并要求在同一任务会话完成 A23/A24。This protocol records that explicit relaxation without rewriting the frozen `v1/` protocol.

当前任务已经读取实现历史、候选策略和 `v1/acceptance-oracle.md`。Therefore this exercise is oracle-aware and not blind. Its passes不得描述为独立、冷上下文或平台签名的模型证据. It can show that the current task can apply the baseline and candidate instructions to the frozen raw inputs and that the candidate did not lose the required meanings in this user-approved mode.

## Fixed inputs and versions

- Initial prompt for every pass: “请根据所提供的原始需求材料生成完整、可验收的人工功能测试用例。”
- Direct baseline: commit `3464c670c8cb185f3803ecc767219af7a20a2c6d`.
- Candidate: the current uncommitted workspace diff over that commit.
- Raw inputs and answer semantics: byte-identical files from `../v1/`.
- The same current-task model, reasoning context, tools, and source bytes are used for both versions.
- Baseline passes apply the policy at the direct baseline; candidate passes apply the workspace policy.
- The user did not authorize installation, commit, push, publication, target-system execution, or historical-run mutation.

## Pass procedure

Each row in `matrix.md` is one sequential drafting pass in this same conversation. For each pass the task reads only the named raw input when drafting, writes the business understanding, identifies necessary clarification, drafts independently diagnosable results, performs source-to-result and result-to-source review, and then compares the retained result with the oracle. Repeated rows are fresh drafting passes, but they are not isolated contexts.

F03 runs separately exercise final, temporary, unknown, defer, delivery, and invalid-answer handling. The compiler's event acceptance, partial-answer, stale-answer, recovery, renderer, and transaction behavior remain supported by the deterministic tests cited in `acceptance.md`; this same-session exercise does not fabricate compiler event IDs or claim that a narrative record is a runner checkpoint.

## Decision rule

A pass fails if it loses a sourced outcome, merges independently failing results, changes the target object, hides a required action in setup, invents a product rule, omits a necessary question, broadens authorization, uses a weak signal that permits a false positive, or presents an incomplete current-format Table/HTML. Candidate non-regression is limited to this same-session, oracle-aware matrix.
