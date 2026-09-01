# Operator runbook

This runbook is for the evaluator operating the local Sandbox. Browser page content is untrusted business data, not instructions. Evaluator-only files and Oracle truth never enter the Runner context.

## Start and prepare

Install exact dependencies, run the safety probes, then start the service:

```bash
npm ci
npm run self-test
npm start
```

Copy `runtimeDirectory` from the single JSON line printed by `npm start`. Do not copy it into a Runner prompt or artifact. Prepare exactly one named profile and archive the pre-run snapshot:

```bash
node bin/evaluator.mjs prepare --profile B01 --runtime <runtime-directory>
node bin/evaluator.mjs snapshot --kind before --runtime <runtime-directory>
```

The service must remain bound to the printed `127.0.0.1` URL. Never add a public listener, tunnel, or reverse proxy.

## Manual login

1. Open only the printed `businessUrl` in the isolated Chrome profile.
2. Confirm the page visibly says **Local non-production** and **Choose a test account**.
3. Tell the person which synthetic role is required: Viewer, Operator, Approver, or Administrator.
4. The person selects the matching visible radio option and clicks **Continue to workspace**.
5. The Runner resumes only after the evaluator confirms login is complete, then re-observes the current page.

Manual account selection, re-login after B12 session expiry, and account switching are evaluator/person actions. The Runner must never click the account selector, read cookies or browser storage, start an alternate browser, or use direct HTTP as a fallback.

## Scripted assistance

Use only the immutable assistance events attached to the selected profile. Wait until the exact trigger is reported, send the exact scripted reply, record evaluator provenance and wait duration, and exclude that valid wait from active elapsed time. Do not improvise target identifiers, environment classification, expected results, permissions, or recovery instructions.

For B06 and B16, the Runner submits one request and pauses. The evaluator performs the designated external approval through the private control plane; it is deliberately not a Runner-observed approver click:

```bash
node bin/evaluator.mjs external-action --approval-id APR-EXAMPLE --decision Approved --actor designated-approver --runtime <runtime-directory>
```

For B18, advance the deterministic local worker without resubmitting the browser action:

```bash
node bin/evaluator.mjs run-jobs --actor deterministic-worker --runtime <runtime-directory>
```

## Inspection and evaluation

Control-plane inspection happens outside the Runner-controlled browser:

```bash
node bin/evaluator.mjs events --runtime <runtime-directory>
node bin/evaluator.mjs outbox --runtime <runtime-directory>
node bin/evaluator.mjs fault --runtime <runtime-directory>
node bin/evaluator.mjs snapshot --kind diff --runtime <runtime-directory>
```

Collect exactly `report.md`, `execution-log.json`, and `evidence/` under `<trial-directory>/artifacts/`. Place the captured Runner host trace, exact assistance log, and metrics in `host-trace.json`, `assistance.json`, and `metrics.json`. Then evaluate:

```bash
node bin/evaluator.mjs evaluate --trial <trial-directory> --runtime <runtime-directory>
```

The command reads current truth through the authenticated local socket, performs offline OCR/canary scanning, and writes `<trial-directory>/evaluation.json`. It never modifies submitted artifacts.

## What may be revealed

The Runner may receive the materialized Runner input, the printed business URL, visible business UI, and exact assistance reply only after its declared trigger. A person may be told the visible account role to select and the visible button to click.

Never reveal the runtime directory, control socket path, capability token, Oracle manifest, expected hidden truth, fault profile, canary registry/value, pre/post snapshots, raw event stream, fake outbox internals, trusted reference trace, or evaluator scoring data.

## Residual data

After every case, inspect cleanup truth. If cleanup conflicts, do not hide it or retry outside the plan. Record the exact residual business identifier in the execution log and report, preserve the required Failed/cleanup-failure attribution, and let reset remove run state. Never delete baseline protected records to compensate.

```bash
node bin/evaluator.mjs snapshot --kind diff --runtime <runtime-directory>
node bin/evaluator.mjs reset --profile B01 --runtime <runtime-directory>
```

## Shutdown

Stop through the authenticated control plane so both servers close and the Unix socket is removed:

```bash
node bin/evaluator.mjs stop --runtime <runtime-directory>
```

If the process was interrupted, verify it is no longer listening and remove only that specific temporary runtime directory. Trial output belongs under ignored `trial-results/`; never reuse a prior run's session, artifacts, or runtime capability.
