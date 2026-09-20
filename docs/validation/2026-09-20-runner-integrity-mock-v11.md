# Runner execution integrity and optional Mock validation

Date: 2026-09-20

Result: PASS

This record validates the additive v1.1 execution-coverage and optional Mock fallback work for `b2b-e2e-runner`. It does not change the test-case schema, original IDs, expected text, four-state model, or existing side-effect replay protection.

## Delivered behavior

- A versioned `execution_coverage@1.0` extension plans every original checkpoint by permission group, site, execution context, dependency, and return work without creating a role-by-site Cartesian product.
- A versioned `mock_fallback@1.0` extension records one explicit, immutable choice before permission and ordinary-proxy preflight. Decline, revoke, historical runs, and unknown versions fail closed as specified.
- Data gaps, candidates, attempts, receipts, assistance, and final effective results form one traceable ledger. Mock facts supplement only their declared data-gap scope and never overwrite real failures or prove real persistence.
- Declarative Mock routes match exact origin, path, method, query multiplicity/type, and JSON body rules. Transactions are atomic, serialized, bounded to 5 MiB, resumable, and deduplicated only by the same Fetch-event identity.
- Request-stage interception is bound to one exact Target. Unknown or ambiguous business traffic, unsafe synthetic passthrough, state persistence failures, and invalid revisions are blocked before upstream.
- Switch, batch, wait, resume, dependency, and final coverage reviews prevent omitted site work, fabricated starts, cross-context identity reuse, and premature delivery.
- HTML and the conversation table use one effective result projection while preserving the real result and making Mock scope visible.
- Cleanup is retryable: a first stop may remain `cleanup_failed` while the owned page is not isolated; after Chrome DevTools MCP navigates it to `about:blank`, a second stop detaches, persists `stopped`, and releases the lock.

## Automated verification

From `b2b-e2e-runner/`:

```text
npm test
188 tests, 188 passed, 0 failed
```

Additional checks:

```text
node --check for every scripts/**/*.mjs and tests/**/*.mjs: PASS
git diff --check: PASS
portable absolute-path check: PASS
installed-Skill source comparison, excluding node_modules: PASS
```

The installed Skill was backed up before synchronization. The synchronized installation was dependency-restored with `npm ci --ignore-scripts` and passed the same full test suite.

## Real browser validation

### Normal two-site execution

- Used Chrome DevTools MCP against two local loopback sites.
- Verified A identity on site 1, created `REC-UAT-001`, verified B identity on site 2, approved the record, returned to A/site 1, reverified the context, and observed `REC-UAT-001 · approved`.
- A successful empty-array query was recorded as a data gap. One missing response-contract field was supplied explicitly and accepted; no field was guessed.
- The final browser screenshot was archived as real image bytes and the Run validated successfully.
- Artifact location: `<TMP>/runner-v11-uat/workspace/b2b-e2e-runs/20260920151912566-a5b4eb77-36d4-4485-978a-5ec665a78ea3/`.
- Screenshot digest: `55376afd5693969ba730505e04b3b2b79774182690ba5df7f142b4bbc3866d4e`.

### Same-Target Mock and cleanup recovery

- Used `chrome-devtools-mcp@1.7.0`, an isolated Chrome profile, a loopback CDP endpoint, and a loopback upstream counter.
- Bound the proxy to Target `A98B885330446E91D168DF25A6A21418` only.
- The bound page performed `POST /api/save`, received HTTP 201 and displayed `Mock 保存成功`; Chrome Network recorded the request while upstream writes remained `0`.
- Mock state and receipt were persisted atomically; proxy counters reported `mockFulfilled: 1` for the final cleanup-retry Run.
- A second Target requested the same URL and was not rewritten. It displayed `响应不符合预期`, upstream writes increased to `1`, and bound-proxy counters did not change.
- Refreshing/navigating the bound Target preserved interception.
- A stop attempted before page isolation produced `cleanup_failed` and kept the process and owner lock, as required. This exercise exposed and fixed a retry bug in the signal handler. The regression test is `cleanup_failed keeps SIGTERM handler installed so cleanup can be retried`.
- After the bound Target was navigated to `about:blank`, the second stop succeeded: process absent, session `detached`, state `stopped`, and no lock files remained.
- Navigating back after stop reached the real upstream; the page displayed `响应不符合预期` and upstream writes increased from `1` to `2`, proving restoration.
- Final retry Run artifacts: `<TMP>/runner-v11-proxy-uat/workspace/b2b-e2e-runs/20260920155258543-6039ea54-55ce-4936-8a88-d4b14d44ffda/`.

## AC-01 through AC-68

All rows below passed. “Test” names are exact or identifying substrings in the Node test output; “UAT” refers to the real-browser exercises above.

| AC | Result | Evidence |
|---|---|---|
| AC-01 | PASS | `v1.1 AC-01/02: an explicit Mock decision...` and Skill scenario routing test |
| AC-02 | PASS | Mock policy immutability/decline tests; report does not claim Mock usage after decline |
| AC-03 | PASS | `v1.1 AC-03/33/36/38...`; declined-policy projection tests |
| AC-04 | PASS | Mock candidate lifecycle and policy tests; normal browser UAT |
| AC-05 | PASS | Skill scenario rules keep ordinary real execution independent from an unavailable proxy endpoint |
| AC-06 | PASS | Data candidate lifecycle tests and independent-work coverage reviews |
| AC-07 | PASS | Coverage review plus batched assistance tests |
| AC-08 | PASS | Verified data-gap closure integration test; normal browser empty-array UAT |
| AC-09 | PASS | Real-failure precedence in effective projection tests |
| AC-10 | PASS | Forged/ineligible data-gap references rejected by Mock fallback tests |
| AC-11 | PASS | Snapshot/hash immutability tests; live-revision resume test |
| AC-12 | PASS | Effective projection keeps real persistence requirements and real failures |
| AC-13 | PASS | Data-gap candidate requires explicit source/contract facts |
| AC-14 | PASS | Assistance/exploration workflow tests prohibit invented request facts |
| AC-15 | PASS | `v1.1 AC-15/16/17: ... match exactly` |
| AC-16 | PASS | Exact typed query/body matching test |
| AC-17 | PASS | Ambiguous and unknown business traffic fail-closed test |
| AC-18 | PASS | Stateful transaction/read consistency tests |
| AC-19 | PASS | Atomic transaction and state-persistence failure tests |
| AC-20 | PASS | Receipt/event deduplication and binding consistency tests |
| AC-21 | PASS | Compatible live revision/resume tests |
| AC-22 | PASS | Used-route semantics cannot be rewritten after resume; missing/tampered state rejected |
| AC-23 | PASS | Request-stage proxy test and real browser upstream counter stayed at zero |
| AC-24 | PASS | Unknown/unsafe/persistence-error requests blocked before upstream |
| AC-25 | PASS | Confirmed semantic passthrough classification test |
| AC-26 | PASS | Single listener precedence and one-lock protocol tests |
| AC-27 | PASS | Two-Target unit tests and real second-Target isolation UAT |
| AC-28 | PASS | Coverage/fact gates require observed request effects rather than configuration claims |
| AC-29 | PASS | Real Network/page observations and archived screenshot in browser UAT |
| AC-30 | PASS | Secret rejection/redaction and Mock binding integrity tests |
| AC-31 | PASS | Cleanup-isolation unit test and real retryable cleanup UAT |
| AC-32 | PASS | Cleanup fail-closed, no replay, context invalidation, and retry regression tests |
| AC-33 | PASS | One traceable candidate plus batched assistance tests |
| AC-34 | PASS | Completion rejects open candidates/attempts/assistance |
| AC-35 | PASS | Scoped assistance resume tests |
| AC-36 | PASS | Candidate lifecycle preserves completed work and permits the next concrete gap |
| AC-37 | PASS | Scoped unavailability/assistance resolution tests |
| AC-38 | PASS | Revoke/early-end cleanup and completion-gate tests |
| AC-39 | PASS | Legal Mock attempt start versus ordinary replay rejection tests |
| AC-40 | PASS | Cross-Run/evidence/context/sequence replay tests |
| AC-41 | PASS | Real failure and single-attempt aggregation tests |
| AC-42 | PASS | Mock configuration failure stays distinct from product failure; screenshot independence tests |
| AC-43 | PASS | One effective four-state row with real/Mock provenance tests |
| AC-44 | PASS | HTML/chat same-model tests and final-only delivery tests |
| AC-45 | PASS | Completion gate rejects open candidates, attempts, and assistance |
| AC-46 | PASS | Historical v2 compatibility and unknown-extension rejection tests |
| AC-47 | PASS | Skill/reference unsupported-scope assertions and structure tests |
| AC-48 | PASS | Exact A10/B8/C5, two-site, 23-checkpoint fixture test |
| AC-49 | PASS | Coverage-map/refinement tests preserve sourced unknown scopes |
| AC-50 | PASS | Switch/batch review rejects omitted A/site-2 work |
| AC-51 | PASS | Site-context preparation and review tests |
| AC-52 | PASS | A→B→A dependency/return-work tests and two-site browser UAT |
| AC-53 | PASS | Blocked batch versus unfinished group distinction tests |
| AC-54 | PASS | Per-site execution-context verification tests |
| AC-55 | PASS | Scope-bound context validation rejects cross-site reuse |
| AC-56 | PASS | Context preparation and account-binding tests |
| AC-57 | PASS | Scoped assistance permits independent work and partial resume |
| AC-58 | PASS | Verified context allows the tested permission behavior to fail normally |
| AC-59 | PASS | Review rejects global waiting while independent work remains |
| AC-60 | PASS | Partial B resume while C stays open tests |
| AC-61 | PASS | Started-without-facts cannot terminate a checkpoint |
| AC-62 | PASS | Stage report can show pending work without mutating product results |
| AC-63 | PASS | Dependency facts block dependent work while independent work continues |
| AC-64 | PASS | Multi-step/scope completion requires all necessary facts |
| AC-65 | PASS | Final audit rejects unsupported terminal explanations |
| AC-66 | PASS | Context changes invalidate only affected unfinished work |
| AC-67 | PASS | Declined-Mock coverage path and normal two-site browser UAT |
| AC-68 | PASS | Exact multi-group remainder/return-work fixture and final review tests |

## Cleanup proof

- The dedicated proxy process and both earlier proxy PIDs were absent.
- CDP status was `stopped` with session `detached`.
- The proxy lock root contained no files.
- All three temporary Chrome pages were navigated to `about:blank` before daemon shutdown.
- The dedicated Chrome DevTools daemon, Chrome process, and fixture server were stopped; neither the CDP port nor fixture port had a listener.
- The temporary Chrome profile was removed.
- The valid UAT Run artifacts were retained for review; no fake screenshot artifact was retained.

## Limits retained intentionally

- Mock does not prove a real backend write, real persistence, authorization, or production behavior.
- V1 remains exact single-Target CDP Fetch interception. WebSocket frames, SSE/streaming, large binary responses, workers as independent shared Targets, global browser proxying, arbitrary JavaScript callbacks, and multi-Target shared Mock state are unsupported.
- A usable loopback CDP endpoint is still required for the proxy component. Ordinary no-proxy real execution is not blocked merely because such an endpoint is unavailable.
- Passwords remain current-login input only and are neither persisted nor displayed.
