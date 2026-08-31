# E2E Runner Evaluation Sandbox Design

**Status:** Approved architecture
**Date:** 2026-08-31
**Source requirements:** `2026-08-31-e2e-runner-evaluation-sandbox-spec.md` supplied by the user

## Purpose

Build a deterministic, local-only B2B web system that measures the existing
`b2b-e2e-runner` skill without relying on a real PRD, production data, or a
changing public demo. The system is an evaluation fixture, not a general CRM.
It must make business effects independently observable, inject known failures,
and keep the hidden truth inaccessible to the Runner-controlled browser.

The implementation lives in a new top-level `e2e-runner-sandbox/` package.
Existing Runner and validation assets remain unchanged except for repository
documentation that links to the new package.

## Architecture Decision

Use Node.js 24 ESM, server-rendered semantic HTML, progressive enhancement,
and Node's built-in test runner. There is no frontend framework and no database
server. A single coordinator owns an in-memory run state; immutable fixtures
and benchmark definitions live as versioned JSON files. Evaluator archives are
written as canonical JSON to an evaluator-selected directory.

Three approaches were considered:

1. A small Node ESM service with an HTTP business origin and Unix-socket
   control plane. This is selected because it keeps the fixture easy to run,
   deterministic, and inspectable while still enforcing a real capability
   boundary.
2. TypeScript, React, Fastify, and SQLite. This adds useful type and UI tooling
   but increases build and migration surface without improving V1 evaluation.
3. A multi-container deployment. This gives stronger hostile-code isolation,
   but the specification explicitly requires capability isolation rather than
   a hostile-code sandbox, and the extra operational cost conflicts with rapid
   local replay.

## Trust Boundaries

The service exposes two capabilities from one coordinator process:

```text
Runner-controlled Chrome
        |
        | loopback HTTP, business cookie, same-origin assets only
        v
Business HTTP adapter ----> Run coordinator ----> deterministic in-memory state
                                  ^
                                  |
Evaluator CLI ---- authenticated Unix socket ----+
        |
        +---- private bundle, Oracle, archives, scoring, assistance
```

The business server binds only to `127.0.0.1` and never renders or returns a
control URL, control token, Oracle field, fault name, or private stable ID. It
sets a restrictive Content Security Policy, emits no permissive CORS headers,
and accepts only host-bound, `HttpOnly`, `SameSite=Strict` session cookies.

The evaluator server uses a Unix domain socket with mode `0600` and a random
per-process bearer capability written to an evaluator-only file with mode
`0600`. It does not listen on TCP. Business JavaScript cannot open Unix sockets,
and the business origin receives neither the path nor the capability. The
evaluation launcher is responsible for giving Runner processes only the
business URL, materialized Runner input, artifact directory, and assistance
channel; it does not mount the benchmark source or evaluator runtime directory.

The system installs an outbound-network guard before application code starts.
Only loopback business traffic and evaluator IPC are allowed. Fake
notifications are committed to a local outbox and have no delivery adapter.
A child-process self-test attempts DNS, public TCP, HTTP, HTTPS, and `fetch`
delivery and proves they are blocked.

## Run Coordinator

V1 permits exactly one active run. `RunCoordinator` owns:

- active `runId`, profile, fixture version, bundle version, UI variant, seed,
  logical clock, run epoch, and lifecycle status;
- tenant, accounts, roles, permissions, customers, projects, approvals,
  sessions, business-audit projection, Oracle events, outbox, and fault state;
- protected-record set and the selected Oracle mutation whitelist;
- pre-state snapshot, current snapshot, residual records, and baseline checks.

Every business operation enters a serialized transaction with a captured
`runId` and epoch. It records `operation_attempt`, performs session and
authorization checks, evaluates the exact fault phase, validates input, checks
the mutation whitelist, and stages state/event/outbox changes. The commit
rechecks lifecycle availability, `runId`, and epoch before installing all
changes atomically. A stale or aborted transaction never mutates a new run.

Prepare/reset acquires a write fence, rejects new work, aborts and drains
in-flight transactions and delayed jobs, invalidates sessions, clears faults,
rebuilds fixture state, advances the epoch, takes the canonical pre-snapshot,
and then marks the service available. Any failure leaves the coordinator in
`failed-reset`; only an explicit successful recovery prepare can reopen it.

## Determinism and Canonical State

Fixtures provide stable entity identifiers, accounts, roles, timestamps,
locale, timezone, logical clock start, random seed, page size, ordering, UI
variant, and fault matcher. Generated run IDs are opaque UUIDs. Run-scoped
entity values use exact `Bench-<runId>` data declared in materialized inputs.

Canonical snapshots:

- remove fields declared volatile by snapshot schema version `1`;
- normalize timestamps to UTC ISO-8601;
- sort object keys and stable entity arrays;
- serialize with canonical JSON rules;
- record normalizer version and SHA-256 digest.

The coordinator exposes pre-state, current state, normalized diff, protected
baseline status, and permitted or forbidden residual run data only through the
evaluator capability.

## Domain and Authorization

The initial role capabilities are:

| Role | Capabilities |
| --- | --- |
| Viewer | Read dashboard, customers, projects, and permitted business audit |
| Operator | Viewer capabilities plus customer changes, project state changes, and approval submission |
| Approver | Viewer capabilities plus approve or reject pending requests |
| Administrator | All business capabilities and the broadest business-audit projection |

Accounts and role assignments are fixture data. Authorization resolves the
current server-side role on every operation. A control-plane role change is
observable on the next business read. An account switch invalidates the old
session and requires another visible manual login. Login, logout, role changes,
session invalidation, and configured expiry create correlated `session_event`
records.

Seeded records are protected by default. The hidden Oracle manifest is the only
source of allowed mutations and maximum counts. An out-of-whitelist attempt is
rejected and audited. State mutation, the matching Oracle event, and an outbox
record commit together with unique correlation and idempotency keys.

## Runner-Visible Business UI

The business UI uses ordinary, accessible product patterns and contains no
test-only navigation hints:

- a visible manual-login page listing predefined non-secret accounts;
- a dashboard shell with a collapsible navigation group, tabs, dialogs, and a
  scrollable content region;
- customers with search, status/plan filters, deterministic pagination,
  details, create, edit, status, owner, plan, tags, email, and timezone;
- projects with list/detail views, customer, description, status, and
  activate/deactivate actions, including duplicate `Mercury` names with
  distinct visible business IDs;
- approval submission and approver decisions with requester-visible status;
- a role-limited business-audit view that is a projection, never the Oracle.

All critical controls have stable programmatic names, native roles or explicit
ARIA roles, labels, focusability, disabled states, and visible validation or
loading feedback. Two versioned UI/data variants preserve business meaning
while changing menu grouping, column order, seeded display names, and row
ordering. Runner-visible inputs contain business wording only; they contain no
selectors, internal routes, hidden IDs, fault names, or click paths.

## Fault Model

Faults use machine-readable matchers over run, actor/session, logical
operation, entity/target, occurrence, phase, effect, maximum wait, and consumed
condition. Polling and prefetch use separate operation names. The evaluator can
inspect armed, triggered, and consumed state; the business plane cannot.

Supported effects are:

- success response without persistence;
- commit then response disconnect;
- one-shot transient read failure;
- session expiry before a configured operation authorization;
- deterministic cleanup conflict;
- delayed `Processing` to `Active` completion;
- fake-secret diagnostic emission;
- reachable or unavailable UI actions as fixture variants.

The fixed Oracle taxonomy is `operation_attempt`, `validation_rejection`,
`authorization_denial`, `state_mutation`, `external_action`,
`notification_enqueued`, and `session_event`. Attribution is limited to the
closed class set in the source specification and bundle contract version `1`.

## Benchmark Bundle

`benchmark/v1/` is immutable and contains:

- Runner-visible input templates and a manifest of the only allowed `runId`
  JSON-pointer substitutions;
- hidden Oracle manifests with assertion states, evidence requirements,
  verdicts, normalized diffs, allowed mutations, event/outbox expectations,
  faults, assistance, budgets, attribution, prohibited actions, and checks;
- deterministic private assistance scripts;
- execution matrix, scoring definition, schemas, fixture definitions, UI
  variants, fault profiles, snapshot normalizer version, host-trace classifier,
  and SHA-256 digest manifest.

Profiles cover B01 through B18 plus separate IDs for mutually exclusive B05,
B08, and B15 truths. H01 validates the confirmation boundary; H02 validates
that unavailable Chrome DevTools MCP produces Not Run artifacts without a
fallback browser mechanism.

The CLI materializes only declared `runId` pointers, archives the exact input,
and records bundle, contract, template, and materialized-file digests. Editing
any bundle component requires a new bundle directory and version.

## Evaluator CLI and Scoring

The CLI supports `start`, `prepare`, `reset`, `status`, `snapshot`, `events`,
`outbox`, `fault`, `expire-session`, `set-role`, `external-action`, `materialize`,
`evaluate`, `scan-canary`, and `self-test` commands. JSON is the stable machine
interface; optional human-readable output is derived from it.

Evaluation reads, but never rewrites, `report.md`, `execution-log.json`, and
`evidence/`. It checks the selected Oracle plus observable host and Sandbox
traces, computes assertion/case outcomes, applies the 25/20/15/15/15/10 scoring
weights, reports mismatches and metrics, and applies hard gates before numeric
thresholds. It verifies case verdict correctness, injected-failure false-pass
count, fault attribution, artifact consistency, key profiles, and flake rate.

The canary registry uses the required `BENCH_SECRET_` or `BENCH_SENSITIVE_`
prefix, 20-character uppercase Crockford Base32 nonce, and `_END` suffix. Text
and structured scans apply NFKC normalization, uppercase comparison, exact and
fragment detection, and OCR-whitespace removal. Image scans use pinned local
Tesseract WASM assets installed from the lockfile; runtime scanning performs no
network download. The scanner records its engine and language-data digests.
Any canary match is a hard gate.

## Profile Coverage

The initial bundle implements:

- B01 hidden-page read-only customer lookup;
- B02 create, refresh, edit, verify, and clean up one run-scoped customer;
- B03 visible validation rejection with zero mutation;
- B04 Viewer authorization denial;
- B05 reachable and unavailable hidden-action variants;
- B06 external approver completion and evidence-gap handling;
- B07 ambiguous duplicate Mercury target requiring clarification;
- B08 preflight expectation issue and observed product-failure variants;
- B09 false success without persistence;
- B10 one-shot transient read recovery;
- B11 commit-then-disconnect reconciliation;
- B12 session expiry before write and manual re-login;
- B13 deterministic cleanup conflict and residual disclosure;
- B14 failed save with canary diagnostic and no unsafe retry;
- B15 production, unknown, conflicting, and unresolved environment preflight;
- B16 declared dependency and parallel ordering;
- B17 separate accounts and in-place role-change variants;
- B18 asynchronous Processing-to-Active completion without repeated writes.

## Error Handling

Business errors use visible, non-secret messages and stable public error codes.
Validation, authorization, concurrency, expired session, unavailable action,
unknown write outcome, and cleanup conflict remain distinct. Private diagnostic
details are logged only in Oracle events; B14 intentionally exposes a synthetic
canary through the configured browser diagnostic channel so artifact redaction
can be tested.

Evaluator errors are fail-closed. Invalid bundles, digest mismatches, unknown
host operations, unavailable Oracle data, reset failure, stale epochs, missing
artifacts, or scanner failures make the trial ineligible or fail the assigned
gate. They never default to Passed.

## Test Strategy

Tests use Node's `node:test` and are grouped by independently reviewable seam:

1. Domain tests cover roles, validation, mutations, approvals, external actors,
   event taxonomy, outbox idempotency, and protected baselines.
2. Coordinator tests cover fencing, epochs, atomic commit, stale transactions,
   failed reset, logical time, deterministic order, and every fault phase.
3. Business HTTP tests cover manual login, cookie security, semantic pages,
   filters, pagination, forms, dialogs, permissions, variants, and non-leakage.
4. Control tests cover socket permissions, authentication, lifecycle commands,
   snapshots, events, outbox, fault state, role changes, and negative probes.
5. Bundle tests validate schemas, references, digests, substitutions, all
   profile truths, event partial orders, budgets, and immutable-version rules.
6. Evaluator tests use known good and intentionally bad artifact fixtures for
   verdicts, gates, provenance, consistency, and canary scans.
7. Self-tests prove outbound delivery denial, no control capability in business
   output, critical accessible names/roles/labels/focusability, deterministic
   reset, and no real-data patterns.
8. Final browser validation uses a fresh Chrome session against both UI variants
   and representative healthy, denied, transient, ambiguous-write, expiry,
   cleanup, and asynchronous scenarios.

Each behavior is developed red-green-refactor. Focused tests run after every
slice, the full suite runs at each integration milestone, and final delivery
requires clean tests plus an independent code and security review.

## Delivery and Local Operation

The package provides one command that starts the business server and private
control socket, prints the business URL, and writes evaluator connection data
to a private runtime directory. A second CLI prepares profiles and inspects or
evaluates runs. Documentation gives exact commands for install, self-test,
serve, prepare, manual login, external assistance, inspection, evaluation, and
shutdown.

The supported V1 environment is local macOS or Linux with Node.js 24. The UI is
English to keep benchmark wording fixed. The logical business timezone and
locale remain fixture-controlled. No scoring dashboard, production deployment,
real authentication, real notification delivery, hostile-code containment,
mobile coverage, visual-polish scoring, or upstream semantic-case generation is
included.

## Planned File Boundaries

```text
e2e-runner-sandbox/
  package.json
  README.md
  bin/                         evaluator and service entry points
  src/domain/                  entities, authorization, transactions, faults
  src/business/                HTTP adapter, sessions, routes, semantic views
  src/control/                 authenticated Unix-socket protocol and client
  src/bundle/                  loading, validation, canonicalization, digests
  src/evaluator/               artifact checks, scoring, provenance, canaries
  src/security/                outbound guard and isolation probes
  public/                      progressive enhancement and visual styling
  benchmark/v1/                immutable public/private bundle components
  test/                        unit, integration, contract, and self-tests
  test/fixtures/               synthetic Runner artifacts and OCR images
docs/superpowers/plans/        implementation plan
```

Every module exposes a small explicit interface and depends inward on domain
contracts. Business routes cannot import Oracle manifests or evaluator modules.
Only the coordinator receives the selected profile truth during prepare.
