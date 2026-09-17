# Runner usability implementation plan

> Execute in this task with TDD and bounded delegated report work. User prohibits commits, remote publishing, historical Run edits and installed-copy synchronization; these constraints override generic workflow commit instructions.

Spec: `docs/superpowers/specs/2026-09-17-runner-usability.md`.

Baseline: main e7981dc; 101/101 native Node tests pass. Working branch: codex/runner-usability-recovery.

## Task 1: A 阅读版报告（独立委派）

Own `scripts/lib/report-html.mjs`, optional presentation-only module and focused `tests/report-reading*.test.mjs`. Read model interfaces; do not change facts/aggregation or v1. Add failing tests for long duration, friendly URL, grouped actionable conclusions, single-column concise dialog/ID disclosure/images; implement A with fixed safe scripts, keep 20-row pagination, all original facts and CSP. Verify report tests; record exact RED/GREEN and diff review. No commits.

## Task 2: 安全截图归档与交付边界

Own `scripts/run-artifacts.mjs`, optional `scripts/lib/evidence-import.mjs`, evidence/delivery tests. Test explicit allowed source, real image validation, no symlink/overwrite, bytes integrity and existing ledger registration; preserve product state. Add additive report delivery metadata so stage generation does not imply external publication; retain existing CLI and return fields. Verify regressions.

## Task 3: 执行指令与代理诊断

Own SKILL.md, agents/openai.yaml, references, scenario tests and a minimal read-only proxy preflight if justified by tests. Run fresh-agent baseline scenarios, then update concrete preflight, upload, exploration, timely help, final-only delivery and same-Target recovery guidance. Reuse existing permissions and proxy core unless reproduced failure requires change. Add focused tests and fresh-agent rechecks.

## Task 4: 实际 fixture 与收尾

Create isolated verification inputs in ignored validation output, run real MCP screenshot/upload/data inspection and supported proxy lifecycle checks. Generate an A report from new synthetic Run only; inspect offline desktop/mobile/dialog/pagination and long content. Clean owned resources. Run full suite, structure/secrets/path checks, independent spec/quality review. Record verified vs unverified limitations and file list. Do not install, commit or push.

## Progress

- Baseline: 101 passed, 0 failed.
- Task 1: complete. A 渲染器和 8 项阅读测试，真实离线桌面/窄屏检查完成；独立审查账号语义问题已修复。
- Task 2: complete. 截图归档与 deliver 门槛复用原账本；大 PNG、来源/路径/覆盖/摘要、阶段与提前结束已验证。
- Task 3: complete. 指令更新与独立 Agent 控制/引导场景完成；复用现有权限模型和代理核心。
- Task 4: complete within documented scope. 124/124 回归、官方结构校验、真实上传/数据探索/截图、独立代理及清理通过；当前宿主 pipe 热切换与生产 UAT 未验证，见 `docs/validation/2026-09-17-runner-usability.md`。
