# E2E Runner Evaluation Sandbox

This package is a local-only, synthetic B2B workspace for evaluating semantic E2E Runners. It provides a conventional customer/project/approval UI, a private evaluator control plane, immutable B01–B18 and H01–H02 profiles, fault injection, artifact evaluation, and offline canary scanning.

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

Open only the printed `businessUrl` in the isolated Chrome session. At the visible login page, ask a person to select the required synthetic account and click **Continue to workspace**. The Runner must not select an account or inspect browser storage.

Useful evaluator commands:

```bash
node bin/evaluator.mjs events --runtime <runtime-directory>
node bin/evaluator.mjs outbox --runtime <runtime-directory>
node bin/evaluator.mjs fault --runtime <runtime-directory>
node bin/evaluator.mjs external-action --approval-id APR-EXAMPLE --decision Approved --actor designated-approver --runtime <runtime-directory>
node bin/evaluator.mjs run-jobs --actor deterministic-worker --runtime <runtime-directory>
node bin/evaluator.mjs materialize --bundle-root ./benchmark --bundle-version v1 --profile B11 --run-id <run-id> --output <output-file>
node bin/evaluator.mjs scan-canary --path <path> --registry <registry-file> --output <output-file>
node bin/evaluator.mjs evaluate --trial <trial-directory> --runtime <runtime-directory>
node bin/evaluator.mjs reset --profile B01 --runtime <runtime-directory>
node bin/evaluator.mjs stop --runtime <runtime-directory>
```

An evaluation trial directory contains `artifacts/report.md`, `artifacts/execution-log.json`, `artifacts/evidence/`, plus `host-trace.json`, `assistance.json`, and `metrics.json`. The evaluator writes `evaluation.json` beside them. See the [operator runbook](docs/operator-runbook.md) for the full 13-step procedure.

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
