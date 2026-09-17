# Recovery

1. Require an explicitly identified outer Run root.
2. Validate `request.json`, `workflow-state.json`, and every existing referenced digest and path.
3. Follow only the stored stage and `next_action`.
4. If still at `intake` or `cases_ready`, create the required child Run first and commit the corresponding `*_started` event together with its ref. For later Generator stages, invoke its compiler on the same stored child Run directory before deciding what to do.
5. For an existing Runner Run, use its `resume-check` before returning from `runner_preflight` to `executing`.

Do not infer progress from conversation history, timestamps, filenames, or a directory that merely looks newest. Never replay a completed action or an action whose side effect is uncertain. If PRD bytes, material scope, immutable Case reference, expected text, or pass standard changed, stop with `NEW_RUN_REQUIRED`.

Before delegation, require the stored child Run root to be an existing non-symlink directory and use its canonical path. Missing, relative, or substituted Run roots are `RUN_INTEGRITY` failures.

All Runner resource replies first produce `runner_resource_received`, returning to `runner_preflight`. If a Runner Run already exists, keep the same outer and Runner Run IDs, complete `resume-check`, and only then apply `runner_started` to resume execution.
