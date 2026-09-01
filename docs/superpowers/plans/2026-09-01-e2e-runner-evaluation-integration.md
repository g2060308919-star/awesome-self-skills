# E2E Runner Evaluation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing local B2B evaluation Sandbox with provenance-bound Host evidence import, a recoverable Trial state machine, a fixed calibration gate, and a complete Release Matrix decision without modifying benchmark bundle `v1`.

**Spec:** `/Users/zhangxudong/Library/Group Containers/group.com.apple.notes/Accounts/F9B299C9-B93D-4A03-9E9C-4BCA07E67C16/Media/C1906D7B-F3BF-4DC6-B918-3F95DF42C36F/1_C2E9A76D-E6E1-4357-B9B0-E6818357C270/2026-09-01-e2e-runner-evaluation-integration-spec.md`

**Architecture:** Keep the immutable benchmark and current evaluator as the scoring kernel. Add a narrow `host-evidence` adapter boundary whose core consumes normalized events, a private request trace exposed only over the authenticated control socket, an owner-only file-backed Trial store, and campaign planners/aggregators above existing execution units and scoring. The evaluator CLI remains the single operator entry point and emits one stable JSON result per invocation.

**Tech Stack:** Node.js 24 ESM, `node:test`, built-in crypto/fs/net/http APIs, existing canonical JSON/digest helpers, existing evaluator and bundle contracts.

## Capability Gap Audit

| Capability | State before this change | Decision |
| --- | --- | --- |
| Local B2B Sandbox, fixtures, reset/runId, faults, Oracle, canaries | Existing | Reuse unchanged |
| Immutable benchmark bundle and 130-unit matrix | Existing | Reuse `v1`; no in-place edits |
| Single-Trial artifact reader/evaluator/scoring | Existing | Reuse as scoring kernel |
| Host trace classifier and hard gates | Partial | Feed it provenance-bound Bridge output |
| Trial workflow | Partial, in-memory and non-resumable | Add persisted state/store/orchestrator |
| Host session evidence import | Missing | Add explicit single-file Codex rollout adapter/export manifest |
| Assistance and metrics derivation | Missing | Derive from normalized events and private request trace |
| Business HTTP request trace | Missing | Record per-run summaries and expose only via control socket |
| Calibration gate | Missing | Add versioned `calibration-v1` plan and summary |
| Release Matrix completeness and source checks | Missing | Add campaign planner/aggregator and reports |

## Task 1: Host Evidence contracts and Codex rollout adapter

**Files:**
- Create: `e2e-runner-sandbox/src/host-evidence/contracts.mjs`
- Create: `e2e-runner-sandbox/src/host-evidence/codex-rollout-adapter.mjs`
- Create: `e2e-runner-sandbox/src/host-evidence/source-package.mjs`
- Create: `e2e-runner-sandbox/test/host-evidence-adapter.test.mjs`
- Create: `e2e-runner-sandbox/test/fixtures/host-evidence/*.jsonl`

- [ ] Write failing tests for valid one-session normalization, explicit authorization, file digest validation, session mismatch, cross-session mixing, unknown events/tools, invalid event order, source path safety, and unsupported source format.
- [ ] Implement stable event schema and trust levels; accept only an explicitly named regular JSONL file and never enumerate Host history.
- [ ] Pair Codex `function_call`/`function_call_output` and `custom_tool_call`/`custom_tool_call_output` by call id while preserving sequence and timestamps.
- [ ] Record adapter, mapping, source manifest, and normalized stream digests.
- [ ] Run `node --test test/host-evidence-adapter.test.mjs` and commit.

## Task 2: Bridge projections and derivation

**Files:**
- Create: `e2e-runner-sandbox/src/host-evidence/bridge.mjs`
- Create: `e2e-runner-sandbox/src/host-evidence/derive-assistance.mjs`
- Create: `e2e-runner-sandbox/src/host-evidence/derive-metrics.mjs`
- Create: `e2e-runner-sandbox/test/host-evidence-bridge.test.mjs`

- [ ] Write failing tests for the three bound outputs, tampering, Runner-self-reported data, missing metric sources, assistance provenance/deadlines, unknown tools, and no raw transcript leakage.
- [ ] Generate `host-trace-v1`, `assistance-v1`, and `metrics-v1` from the same normalized stream and source manifest.
- [ ] Mark every metric with source digest/deriver version; missing required data is not derivable and is never coerced to zero.
- [ ] Make only `host-native` real evidence release-eligible; fixtures and operator-attested data remain diagnostic.
- [ ] Run targeted tests and commit.

## Task 3: Private business request trace

**Files:**
- Modify: `e2e-runner-sandbox/src/domain/run-coordinator.mjs`
- Modify: `e2e-runner-sandbox/src/business/server.mjs`
- Modify: `e2e-runner-sandbox/src/business/router.mjs`
- Modify: `e2e-runner-sandbox/src/control/protocol.mjs`
- Modify: `e2e-runner-sandbox/src/control/server.mjs`
- Modify: `e2e-runner-sandbox/bin/evaluator.mjs`
- Modify: `e2e-runner-sandbox/test/business-http.test.mjs`
- Modify: `e2e-runner-sandbox/test/control-plane.test.mjs`

- [ ] Write failing tests proving request summaries are run-bound, reset with a new run, exclude bodies/cookies/secrets, and are unavailable on the business origin.
- [ ] Record method, normalized route class, status, request sequence, runId, and logical time/response completion without sensitive values.
- [ ] Add allowlisted authenticated control command `requests`; retain capability isolation.
- [ ] Run HTTP/control/security tests and commit.

## Task 4: Persistent Trial store and state machine

**Files:**
- Create: `e2e-runner-sandbox/src/trial/state-machine.mjs`
- Create: `e2e-runner-sandbox/src/trial/store.mjs`
- Create: `e2e-runner-sandbox/src/trial/orchestrator.mjs`
- Create: `e2e-runner-sandbox/test/trial-state-machine.test.mjs`
- Create: `e2e-runner-sandbox/test/trial-orchestrator.test.mjs`

- [ ] Write failing transition tests for valid progression, invalid transitions, content-addressed inputs, one-session binding, owner-only paths, locks, and idempotent completed steps.
- [ ] Persist an atomic manifest with state/history/input and source digests, timestamps, runId, profile/unit, session binding, retryability, and next action.
- [ ] Implement prepare/materialize/confirm/bind/collect/evaluate/reset steps on top of current control/bundle/evaluator APIs.
- [ ] On uncertain Runner writes enter a manual reconciliation state; never replay business actions.
- [ ] Make collect/evaluate/reset safely resumable and preserve diagnostics if reset fails.
- [ ] Run targeted tests and commit.

## Task 5: Calibration and Release Matrix campaigns

**Files:**
- Create: `e2e-runner-sandbox/config/calibration-v1.json`
- Create: `e2e-runner-sandbox/src/campaign/planner.mjs`
- Create: `e2e-runner-sandbox/src/campaign/aggregate.mjs`
- Create: `e2e-runner-sandbox/src/campaign/report.mjs`
- Create: `e2e-runner-sandbox/test/campaign.test.mjs`

- [ ] Write failing tests for exact calibration profiles H01/B01/B02/B09/B11/B12, incomplete/ineligible calibration, missing/duplicate matrix units, mixed bundle/runner/source/mapping digests, session reuse, runId mismatch, and reset failure.
- [ ] Create content-addressed calibration/campaign manifests outside benchmark `v1`.
- [ ] Gate formal campaign creation on a complete passing calibration summary.
- [ ] Validate every expected execution unit before calling existing `aggregateEvaluationResults`.
- [ ] Generate machine JSON and Markdown that attributes failures to Runner, Host evidence, Sandbox, artifacts, collaboration, budget, or matrix completeness.
- [ ] Run campaign tests and commit.

## Task 6: Unified CLI and operator documentation

**Files:**
- Modify: `e2e-runner-sandbox/bin/evaluator.mjs`
- Modify: `e2e-runner-sandbox/package.json`
- Modify: `e2e-runner-sandbox/README.md`
- Modify: `e2e-runner-sandbox/docs/operator-runbook.md`
- Create: `e2e-runner-sandbox/docs/host-evidence-contract.md`
- Create: `e2e-runner-sandbox/docs/trial-and-campaign-contract.md`
- Modify: `e2e-runner-sandbox/test/cli.test.mjs`
- Modify: `e2e-runner-sandbox/test/docs-commands.test.mjs`

- [ ] Write failing CLI tests for evidence export/import, Trial create/status/steps, calibration create/aggregate, campaign create/aggregate, stable error codes, and single-JSON stdout.
- [ ] Add commands without removing existing evaluator commands.
- [ ] Document private vs exchange directories, explicit authorization, real-session limits, recovery decisions, and exact calibration/release commands.
- [ ] Run CLI/docs tests and commit.

## Task 7: Integrated verification and real B01 rehearsal

**Files:**
- Create: `e2e-runner-sandbox/test/evaluation-integration.test.mjs`
- Create on rehearsal: private runtime outputs outside Runner evidence directories.

- [ ] Add an automated recorded-fixture end-to-end test from source package through Bridge, Trial collection/evaluation/reset, calibration summary, and release eligibility rejection for non-host-native evidence.
- [ ] Run `npm test`, `npm run self-test`, and `npm run bundle:verify`; keep benchmark `v1` digests unchanged.
- [ ] Start Sandbox and create a B01 Trial; show the user the business URL and manual steps.
- [ ] Import only the explicitly authorized current Host session export and prove all three evidence outputs share source/session/Trial digests.
- [ ] Record real constraints if the Host cannot supply a stable authorized export; do not substitute a fixture for this acceptance item.
- [ ] Review the diff, run final verification, and commit the integrated result.

