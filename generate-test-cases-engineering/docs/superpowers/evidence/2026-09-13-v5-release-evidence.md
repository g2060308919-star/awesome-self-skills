# Generate Test Cases V5 Release Evidence

Date: 2026-09-13

Decision: **ACCEPT for repository publication.**

This record evaluates the implementation only against the user-provided
`03-development-spec.md`. The problem record and technical design were used to
understand context and architecture but did not override the spec.

## Candidate identity

- Base commit: `858fdd1de77ba31655ff57810fbf0ff8a47872c9`.
- Final implementation commit: `1fb011dace3bfdb85a5ee84d5149d0cf95fb5d62`.
- Final implementation tree: `c29fb2f3af8a07dccfba9b8b4f8996599bbbb0e1`.
- Schema/compiler versions: `5.0.0` / `0.6.0`.
- Public exports: `createV5RunDirectory`, `advanceV5Run`, and `inspectV5Run`.
- Direct CLI: inspect only.

Artifact digests:

| Artifact | SHA-256 |
| --- | --- |
| Candidate compiler bundle | `660b0632956018ae93508a4893b1efb674178c792e8210c91dd24c5c3e3aebe8` |
| Repository-published compiler bundle | `660b0632956018ae93508a4893b1efb674178c792e8210c91dd24c5c3e3aebe8` |
| Raw Schema manifest bytes | `9e54dfa3f3926579c39f6de7aabee72985c977b2a7a0f7d31b3053463bb95007` |
| Schema manifest self-digest | `3ac88929e0760f3e84cce1729efc49b4106a3737cb80e29e58b092f23e4fa5b2` |
| Fixture manifest bytes | `73735b0d6f7c2feab73bbba2ec2d102b35b5c530d1c098d0af4d25b1b58c6374` |
| Deterministic full transcript | `sha256:17781e2b5adf6fa98cc03a5b04d257c94ea40ac824d40d4a48843e9d443a6eb9` |

The Schema manifest contains 15 closed Schemas and cross-binds all policy
artifacts. The fixture manifest contains 105 exact leaves and 111 isolated
catalog declarations.

## Verification commands

All commands ran from `generate-test-cases-engineering` against the bytes in
implementation commit `1fb011d` unless explicitly identified as a later
documentation-only verification.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p jsconfig.json` | exit 0; zero diagnostics |
| `npm run build` | exit 0 |
| `node build/build.mjs --check` | exit 0; generated bundle current |
| `npm run check` | exit 0; 118/118 tests passed |
| `npm run test:benchmark` | exit 0; 18/18 benchmark cases passed |
| `npm run public-pilot` | exit 0; 16/16 groups and 105/105 leaves passed with transcript `sha256:17781e2b5adf6fa98cc03a5b04d257c94ea40ac824d40d4a48843e9d443a6eb9` |
| `node test/fixtures-v5-runner.mjs tests/fixtures/v5/manifest.json` | exit 0; 16/16 groups, 105/105 leaves |
| matrix-only deterministic replay twice | exit 0; digest `sha256:812263420cab2c292a754321a130d0485a0c46548239bf46468f21727d95c51f` |
| manifest generator twice | byte-identical `73735b0d6f7c2feab73bbba2ec2d102b35b5c530d1c098d0af4d25b1b58c6374` |
| `npm pack --dry-run --cache /private/tmp/generate-v5-npm-cache-final` | exit 0; 351 files, 684.5 kB package, 8.1 MB unpacked |
| `diff -qr skill/generate-test-cases ../generate-test-cases` | no differences |
| `git diff --check 858fdd1de77ba31655ff57810fbf0ff8a47872c9...HEAD` | exit 0 |
| `npm audit --audit-level=high` | exit 0; zero vulnerabilities |
| secret-pattern, production-sink, and TypeScript-suppression scans | zero matches in all three scans |

The final publication pass repeats build/check, benchmark, public pilot,
package dry-run, security scans, and diff checks after this evidence file is
added. Its Git merge and remote-ref identifiers are reported in the task
completion record; the evidence commit is documentation-only.

## Spec release gates

| Gate | Result and evidence |
| ---: | --- |
| 1–3 | Compiler/build pass; 15 Schema digests validate; C01–C16 is 16/16 and 105/105. |
| 4 | Pre-change V4 characterization is frozen in `2026-09-11-v5-baseline.md`; equivalent V5 regression passes. |
| 5–6 | V4 operational source/dispatch/fallback/migration removed; exactly three V5 exports; CLI is inspect-only. |
| 7–10 | Compiler-owned Seed/registry/IDs/cells/coverage/envelopes, typed Oracle/rule refs, Blocked/Conditional policy, and acyclic forward provenance pass focused suites. |
| 11–13 | JSON/Markdown/CSV parity, permission reconciliation, canonical arrays, deterministic replay, and prefix collision checks pass. |
| 14 | Crash, stale action/preview, idempotency, genesis order, normal-fatal, quarantine, token rotation, and key-leak tests pass. |
| 15 | Registry inventory is exact: 16 cells, 9 action templates, 4 read-only profiles, 51 outcomes, 40 RuntimeError rows, and 34 Invariant rows; all 40 errors have executable leaf triggers. |
| 16–17 | Security/telemetry scan is clean; diff check passes; review found no unrelated modification. |
| 18–22 | Bootstrap, run identity, accepted-source identity, pointer/CAS/transaction, and Question Part/Decision contracts pass their positive and negative fixtures. |
| 23 | The normal-fatal matrix covers all seven compiler-state targets. Receipt digest `sha256:c4441716ff56edfdf704a0bb57657d5ab68a959d42904e9f1a049737658b8564` and accepted-projection digest `sha256:8f8024e762ff9b05eda367fc8d698df6a02f5b172373f4615e2b91008df60396` are members of the corresponding verified checkpoint sets. Missing, malformed, non-member, and diagnostic-mismatch negatives are rejected before mutation/fatal publication. |

Detailed C01–C16 Schema → runtime symbol → fixture mapping is maintained in
`2026-09-11-v5-traceability.md`.

## Security and publication review

- Production source has no dynamic code evaluation, shell/process execution,
  outbound fetch/request path, or browser/API execution sink.
- The action-token master key is loaded only from the process environment,
  validated in memory, and absent from persisted records, replies, renderers,
  logs, fixtures, and telemetry.
- Error and diagnostic projections expose bounded codes, object references,
  and digests, not full source text, full clarification answers, credentials,
  or sensitive business values.
- Secret-pattern scans found no private key, GitHub token, AWS key, Google API
  key, or OpenAI key in the changed candidate/published trees.
- Dependency audit reports zero vulnerabilities.

## Cutover inventory

The repository and Skill configuration declare no production catalog root and
no deployment target. Following the release plan, only declared catalog roots
may be inventoried. Therefore the repository publication has zero discoverable
production V4 active runs, and this record does not claim a runtime deployment.
Historical benchmark, fixture, visualization, and remediation run directories
are test evidence rather than a configured live catalog; they were neither
migrated nor cancelled.

Repository publication is the Git-tracked, byte-identical synchronization from
`skill/generate-test-cases/` to `../generate-test-cases/`. It does not overwrite
the user's separate global Skill installation.

## Limitations and deviations

- V5 compiles an Execution Plan only when explicitly requested; it never runs
  browser/API E2E work or records execution results.
- Production capability-proof verification still requires the existing
  externally registered verifier. The deterministic verifier added for gate 23
  exists only while the internal fixture profile is installed and is not a
  public export.
- Historical V3/V4 evidence remains in Git as non-executable audit material.
- No normative SHOULD deviation is known.
