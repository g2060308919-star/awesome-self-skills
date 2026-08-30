# Local demo validation record

Date: 2026-08-30

Evidence class: **DR (demo readiness)**. This record proves the synthetic target and its raw semantic test plan independently of browser runtime. The completed real Chrome evidence is kept separately under [`../chrome-forward-run/artifacts/`](../chrome-forward-run/artifacts/); HTTP/unit facts in this file are not counted as RC.

## Boundaries

- The demo uses only Node built-ins and binds to `127.0.0.1` on an operating-system-assigned port.
- The served metadata identifies `mode: demo` and `nonProduction: true`.
- State is process-local memory and resets when the process exits.
- The Skill package remains the exact three-file package; this target lives only under `validation/`.
- No Playwright, Puppeteer, Computer Use, browser fallback, database, or external network dependency was introduced.
- Secret-like values are synthetic canaries intentionally present in the fixture's failing Network response and its related raw Console event. The visible UI summary redacts them. The final artifact scan targeted only the generated run directory and found zero canary-prefix matches; this fixture source is intentionally excluded from that assertion.

## TDD evidence

The demo was developed test-first in this session and the full suite was rerun after each correction. Individual RED outputs were not persisted, so this record does not independently prove every RED transition; its durable evidence is the final executable suite. The final command was:

```text
npm test
```

Final result:

```text
tests 23
pass 23
fail 0
cancelled 0
skipped 0
todo 0
```

Covered HTTP/domain behaviors include manual credential-free login, rejection of every controlled-browser mutation before login, permission denial and role change with current-role state reflected in the native selector, approval mutation, unknown-ID approval safety, ambiguous write persistence, generated-ID isolation from seeded business IDs, exact cleanup, unknown-ID deletion safety, residual cleanup failure, external-person state change and audit provenance, unknown-ID external-review safety, secret-bearing 503 diagnostics with a redacted UI summary, semantic server-rendered HTML, real business-ID detail links, a named request-action group, progressive assets, and accessible permission feedback.

`jq empty validation/demo-app/test-plan.json` passed. Because these delivery files are untracked, `git diff --check` would not inspect them; an explicit `rg -n "[[:blank:]]+$" b2b-e2e-runner validation` scan returned no matches instead.

## Live-process health check

The demo was started with `npm start`. The process printed the ephemeral origin `http://127.0.0.1:61328` for this check.

`GET /__diag/meta` returned:

```json
{"service":"b2b-e2e-runner-demo","mode":"demo","nonProduction":true}
```

`GET /` returned the semantic login page with one `h1`, a `main` landmark, a visible `Non-production demo · Local QA` status, an explicitly labelled display-name field, and the native `Sign in manually` button. The process was then terminated; no server remains running from this check.

## Forward-test inputs and isolation

- `test-plan.json`: raw semantic cases only; no expected verdicts, provenance answers, recovery strategy, selectors, routes, or implementation details.
- `../forward-test-harness/demo-oracle.md`: harness-only interventions, expected observable behavior, TD01–TD24 mapping, and final artifact audit. It was physically separated from the demo input and was not supplied to the Skill under test.

The completed run started the demo separately and used a fresh temporary parent containing only `input/test-plan.json` plus an empty `run/`. The Skill was invoked from `run/` with `../input/test-plan.json` and the printed loopback origin. Demo source and the harness oracle remained outside that temporary parent; the final run root contains only the exact three output artifacts.

The executor was a fresh process that received only the installed Skill, raw plan, origin, confirmed scope/non-production context, and genuine interventions when they occurred. It had not been supplied the oracle, expected outcomes, or oracle-aware conversation history. The harness controller and post-run auditors remained separate, and MCP configuration was discovered in a new process. The host did not enforce an OS-level read boundary over every repository path, so this run is not described as OS-enforced strict oracle-blind execution.

## Completed Chrome proof status

The demo itself remains DR/HTTP-unit evidence. A separate fresh-context, tool-call-audited run used `chrome-devtools-mcp@1.7.0 --isolated` to launch an independent visible Chrome and bring all eight semantic cases to terminal results. TC-08 deleted only the explicitly authorized REQ-9001 and preserved REQ-9002. The run produced the exact three artifacts, and their references, summaries, verdict derivation, redaction, and filesystem shape were independently audited. Runtime facts belong to [`../chrome-forward-run/checkpoint.md`](../chrome-forward-run/checkpoint.md), not to this demo-unit record.
