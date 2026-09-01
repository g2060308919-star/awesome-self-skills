# E2E Runner Evaluation Sandbox

This package is a local-only, synthetic B2B workspace for evaluating semantic E2E Runners. It provides a conventional customer/project/approval UI, a private evaluator control plane, immutable B01–B18 and H01–H02 profiles, provenance-bound Host evidence import, recoverable Trials, calibration and Release Matrix aggregation, fault injection, artifact evaluation, and offline canary scanning.

It is not a production service. It binds only to `127.0.0.1`, contains no real customer data, and must not be exposed through a public proxy.

## Requirements

- Node.js 24 or newer
- npm with the committed lockfile
- Chrome DevTools MCP pinned to `chrome-devtools-mcp@1.7.0 --isolated` for browser evaluation

The MCP package is not installed globally by this project. An `npx -y chrome-devtools-mcp@1.7.0 --isolated` configuration downloads the pinned package into npm's cache when needed and launches a fresh temporary Chrome profile.

## Quickstart

Run these commands from `e2e-runner-sandbox/`:

```bash
npm ci
npm run self-test
npm start
```

`npm start` prints one JSON line containing `businessUrl` and `runtimeDirectory`. Keep the terminal running. The runtime directory is evaluator-private: never put it, its files, the control socket, or its capability in Runner input, browser artifacts, or reports.

In a second evaluator terminal:

```bash
node bin/evaluator.mjs prepare --profile B01 --runtime <runtime-directory>
node bin/evaluator.mjs snapshot --kind before --runtime <runtime-directory>
```

Those atomic commands remain available for diagnostics. Formal evaluation uses the persisted workflow below so Host evidence and every resume/reset decision remain auditable.

## Persisted evaluation workflow

Keep evaluator-private and Runner-exchange data under ignored `trial-results/`, but in separate roots. First create the fixed six-unit calibration plan and one Trial:

```bash
node bin/evaluator.mjs calibration-create --campaign-root trial-results/campaigns --campaign-id calibration-v1-run --runner-version <runner-version> --runner-digest <runner-digest> --created-at <created-at>
node bin/evaluator.mjs trial-create --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --unit B01-R1 --campaign-id calibration-v1-run --runner-version <runner-version> --runner-digest <runner-digest>
node bin/evaluator.mjs trial-confirm-scope --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --environment non-production --scope local-sandbox-only --idempotency-key scope-B01-R1
node bin/evaluator.mjs trial-show-input --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id>
node bin/evaluator.mjs trial-start --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --started-at-ms <started-at-ms> --idempotency-key start-B01-R1
```

The Runner receives only the `trial-show-input` result: materialized input, local business URL, and exchange artifact directory. It uses Chrome DevTools MCP only. A person performs the visible test-account login.

After that one Host session is complete, explicitly export that one Codex rollout file and bind it to the Trial. The exporter never searches Host history:

```bash
node bin/evaluator.mjs host-export --source <one-codex-rollout-jsonl> --output trial-results/host-source-B01-R1 --trust host-native --authorization-actor <authorization-actor> --authorized-at <authorized-at>
node bin/evaluator.mjs trial-import-host --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --source trial-results/host-source-B01-R1 --idempotency-key import-B01-R1
node bin/evaluator.mjs trial-collect --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --artifacts <artifacts> --idempotency-key collect-B01-R1
node bin/evaluator.mjs trial-evaluate --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --idempotency-key evaluate-B01-R1
node bin/evaluator.mjs trial-reset --runtime <runtime-directory> --private-root trial-results/evaluation-private/trials --exchange-root trial-results/runner-exchange --trial <trial-id> --idempotency-key reset-B01-R1
```

Create the other five calibration Trials with their precommitted units, then aggregate. A Release plan can only be created from the matching passing calibration summary:

```bash
node bin/evaluator.mjs campaign-status --campaign trial-results/campaigns/calibration-v1-run/campaign-plan.json --private-root trial-results/evaluation-private/trials
node bin/evaluator.mjs campaign-aggregate --campaign trial-results/campaigns/calibration-v1-run/campaign-plan.json --private-root trial-results/evaluation-private/trials --output trial-results/campaigns/calibration-v1-run/campaign-summary.json
node bin/evaluator.mjs release-create --campaign-root trial-results/campaigns --campaign-id release-run --runner-version <runner-version> --runner-digest <runner-digest> --calibration-summary trial-results/campaigns/calibration-v1-run/campaign-summary.json --created-at <created-at>
node bin/evaluator.mjs campaign-next --campaign trial-results/campaigns/release-run/campaign-plan.json --private-root trial-results/evaluation-private/trials
node bin/evaluator.mjs campaign-aggregate --campaign trial-results/campaigns/release-run/campaign-plan.json --private-root trial-results/evaluation-private/trials --output trial-results/campaigns/release-run/campaign-summary.json
```

Open only the printed `businessUrl` in the isolated Chrome session. At the visible login page, ask a person to select the required synthetic account and click **Continue to workspace**. The Runner must not select an account or inspect browser storage.

Useful evaluator commands:

```bash
node bin/evaluator.mjs events --runtime <runtime-directory>
node bin/evaluator.mjs outbox --runtime <runtime-directory>
node bin/evaluator.mjs requests --runtime <runtime-directory>
node bin/evaluator.mjs fault --runtime <runtime-directory>
node bin/evaluator.mjs external-action --approval-id APR-EXAMPLE --decision Approved --actor designated-approver --runtime <runtime-directory>
node bin/evaluator.mjs run-jobs --actor deterministic-worker --runtime <runtime-directory>
node bin/evaluator.mjs materialize --bundle-root ./benchmark --bundle-version v1 --profile B11 --run-id <run-id> --output <output-file>
node bin/evaluator.mjs scan-canary --path <path> --registry <registry-file> --output <output-file>
node bin/evaluator.mjs evaluate --trial <trial-directory> --runtime <runtime-directory>
node bin/evaluator.mjs reset --profile B01 --runtime <runtime-directory>
node bin/evaluator.mjs stop --runtime <runtime-directory>
```

The three Runner artifacts stay in the exchange root. Host source, normalized events, the three Bridge projections, Oracle truth, evaluation and manifest stay evaluator-private. Legacy manually assembled `host-trace.json`, `assistance.json`, and `metrics.json` can still be scored diagnostically, but are not release-eligible. See the [operator runbook](docs/operator-runbook.md).

## Verification

```bash
npm run bundle:verify
npm run self-test
npm test
```

The bundle verification checks every immutable V1 JSON component. The self-test proves loopback binding, owner-only control capability, strict browser headers, fake-only outbox behavior, bundle integrity, and process-level outbound denial.

## Documentation

- [Operator runbook](docs/operator-runbook.md)
- [Bundle contract](docs/bundle-contract.md)
- [Security model](docs/security-model.md)
- [Host evidence contract](docs/host-evidence-contract.md)
- [Trial and Campaign contract](docs/trial-and-campaign-contract.md)
