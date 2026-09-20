# B2B E2E Runner 1.1 Execution Integrity and Mock Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `permission-batches-html-v2` Runner 上实现版本化执行覆盖与可选 Mock 补测，并保持历史 Run、原用例、四态结果和单 HTML 报告兼容。

**Architecture:** `execution-coverage.mjs` 负责覆盖计划、上下文、依赖和复核的纯派生与校验；`mock-fallback.mjs` 负责 Mock 事件生命周期与有效结果投影；`mock-scenario.mjs` 负责声明式精确匹配、事务状态和模板求值。`run-artifacts.mjs` 仍是唯一日志写入入口，`cdp-fetch-proxy.mjs` 只执行已校验场景并输出收据，报告继续从同一快照和账本派生。

**Tech Stack:** Node.js 22+ ESM、`node:test`、Chrome DevTools Protocol Fetch domain、现有原子 JSON/HTML 报告模块。

**Spec:** 本任务附件 `03-spec.md`；实现接口以附件 `02-technical-design.md` 为准。

## Global Constraints

- 不修改 generate-test-cases、原用例快照、原 case/step/oracle ID 或 `expected[].text`。
- 保留 Chrome DevTools MCP、单 Target 代理、权限分批、四态结果、事件账本和单 HTML 同源报告。
- 新建 v2 Run 默认启用 `execution_coverage@1.0`；Mock 仅在显式 `allowed|declined` 时写入 `mock_fallback@1.0`。
- 历史 Run 不迁移；未知扩展、版本、工具或来源 fail closed。
- 写操作结果不明时不得自动重放；Mock 写请求必须在真实上游前拦截。

## Review Focus

- 部分协作恢复不能等待无关事项，也不能让全局等待遮蔽已释放范围。
- 多权限双站点不能产生权限×站点笛卡尔积或遗漏返回任务。
- Mock 多规则冲突、未知参数和持久化错误必须 fail closed，真实上游计数保持 0。
- 真实失败不得被 Mock 投影覆盖，配置/代理故障不得误判产品失败。
- 完成与交付必须从全量检查点、覆盖复核、协作和 Mock 生命周期重新审计。

---

### Task 1: Versioned extensions and compatibility

**Files:**
- Modify: `b2b-e2e-runner/scripts/run-artifacts.mjs`
- Create: `b2b-e2e-runner/tests/workflow-v11-extensions.test.mjs`

**Interfaces:**
- Produces: v2 init `extensions` and optional `mock_policy`; legacy Run behavior remains unchanged.

- [ ] Add failing init/CLI tests for coverage default, explicit Mock choice, invalid combinations, and legacy compatibility.
- [ ] Run the focused test and confirm missing-contract failures.
- [ ] Add minimal extension initialization and validation.
- [ ] Run focused and full Runner suites.

### Task 2: Execution coverage state machine

**Files:**
- Create: `b2b-e2e-runner/scripts/lib/execution-coverage.mjs`
- Modify: `b2b-e2e-runner/scripts/run-artifacts.mjs`
- Modify: `b2b-e2e-runner/scripts/lib/permission-batches.mjs`
- Create: `b2b-e2e-runner/tests/execution-coverage.test.mjs`

**Interfaces:**
- Produces: `validateCoverageEvent`, `deriveCoverageState`, `validateCoverageLog`, completion/wait/resume gates.

- [ ] Add failing tests for exact checkpoint coverage, no cartesian expansion, contexts, dependencies, reviews, partial resume and final audit.
- [ ] Confirm every test fails for a missing contract.
- [ ] Implement closed schemas and pure replay-derived state.
- [ ] Wire record/replay/validate/resume/completion/delivery gates and run all tests.

### Task 3: Mock ledger, scenario engine, and effective projection

**Files:**
- Create: `b2b-e2e-runner/scripts/lib/mock-fallback.mjs`
- Create: `b2b-e2e-runner/scripts/lib/mock-scenario.mjs`
- Modify: `b2b-e2e-runner/scripts/run-artifacts.mjs`
- Modify: `b2b-e2e-runner/scripts/lib/report-model.mjs`
- Create: `b2b-e2e-runner/tests/mock-fallback.test.mjs`
- Create: `b2b-e2e-runner/tests/mock-scenario.test.mjs`

**Interfaces:**
- Produces: event lifecycle validation, exact request matching, atomic state transition, effective four-state projection.

- [ ] Add failing lifecycle, gap/failure, match ambiguity, query/body type, template, atomicity, dedupe, revision and recovery tests.
- [ ] Confirm focused failures.
- [ ] Implement reducers and pure scenario transactions without arbitrary code execution.
- [ ] Wire effective projection while retaining real result facts and run suites.

### Task 4: Single-Target proxy integration and cleanup

**Files:**
- Modify: `b2b-e2e-runner/scripts/cdp-fetch-proxy.mjs`
- Modify: `b2b-e2e-runner/tests/proxy-lifecycle.test.mjs`
- Create: `b2b-e2e-runner/tests/proxy-mock-scenario.test.mjs`

**Interfaces:**
- Consumes: validated scenario and active attempt digest.
- Produces: request receipts/state snapshots while `run-artifacts` remains sole execution-log writer.

- [ ] Add failing tests proving Mock decision precedes upstream, unknown writes fail closed, other Targets remain unaffected, and cleanup blanks the owned page before detach.
- [ ] Confirm failures are protocol behavior failures.
- [ ] Implement minimal scenario branch and deterministic receipt/state files.
- [ ] Run proxy fixtures and full Runner suites.

### Task 5: Reports, skill instructions, and AC verification

**Files:**
- Modify: `b2b-e2e-runner/scripts/lib/report-model.mjs`
- Modify: `b2b-e2e-runner/scripts/lib/report-html.mjs`
- Modify: `b2b-e2e-runner/SKILL.md`
- Modify: `b2b-e2e-runner/references/workflow.md`
- Modify: `b2b-e2e-runner/references/artifact-contract.md`
- Modify: `b2b-e2e-runner/references/result-model.md`
- Modify: `b2b-e2e-runner/references/proxy-protocol.md`
- Create: `b2b-e2e-runner/references/mock-fallback.md`
- Create: `b2b-e2e-runner/tests/workflow-v11-report.test.mjs`
- Create: `b2b-e2e-runner/tests/workflow-v11-scenarios.test.mjs`

**Interfaces:**
- Consumes: validated coverage and Mock projections.
- Produces: one semantic HTML report plus same-model five-column conversation table.

- [ ] Add failing report/source-of-truth/final-gate and 23-case dual-site scenario tests mapped to AC-01–AC-68.
- [ ] Confirm failures, then implement report projections and concise instruction routing.
- [ ] Run structure, secret, path, legacy, full unit/integration suites and actual non-production Chrome DevTools MCP fixtures.
- [ ] Produce an AC matrix with evidence and explicit unverified items; review the full diff before optional installation sync.
