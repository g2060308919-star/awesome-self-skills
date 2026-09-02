# Generate Test Cases V1 Remediation — G1-D Evidence

Date: 2026-09-02 (Asia/Shanghai)

## Scope

G1-D closes the private runner and Skill Adapter protocol. It adds the sole named Module export, import/direct-execution separation, exact argv handling, closed Reply routing, pre-promotion clarification validation, canonical durable-run recovery, bilingual discovery boundaries, and the required progressive references. It does not install the Skill or create a release tag.

## Commit

- `851e3552f35505069691c6d2e89537a0a9126b3e` — `feat: close runner protocol and durable recovery`
- Parent: `76cb091ca0b6d4e78f14886236e6b7214852a10b`
- Change size: 24 files, 1934 insertions, 331 deletions.
- Post-commit worktree: clean.

## Initial RED to GREEN

The initial RED was written before production changes and reproduced:

- dynamic bundle import exported nothing, executed the CLI, emitted output, consumed staging, and wrote accepted/checkpoint state;
- zero arguments returned the wrong fatal diagnostic, while two or more arguments were silently accepted and consumed staging;
- Reply Schema admitted derived stages and stage/schema mismatches;
- the runner had no explicit closed mapping from internal diagnostics to the four Agent-writable artifacts;
- invalid r001 delivery, reopen, and Decision appends were promoted before semantic validation;
- the Skill lacked validate-first Reply handling, durable run recovery, `NEW_RUN_REQUIRED`, complete bilingual triggers, and the automation/code-review negative boundary.

Initial RED results:

```text
g1d-runner-protocol.test.mjs: exit 1, 3/8 pass
g1d-reply-contract.test.mjs: exit 1, 1/6 pass
g1d-stage-progression.test.mjs: exit 1, 1/5 pass
g1d-source-revision.test.mjs: exit 0, 2/2 existing-behavior locks pass
skill-static.test.mjs: exit 1, 2/6 pass
```

The first GREEN introduced `src/reply-routing.mjs`, used it in the real `advanceStrict` revision path, closed Reply Schema to four one-to-one stage/schema pairs, added a direct-execution guard and sole `advanceStrict` export, enforced exact argv, moved clarification append validation before promotion, and updated Skill metadata and references. The bundle remained build-generated.

## Regression repair

An intermediate primary run passed 802/814. The 12 failures were retained and corrected rather than hidden:

- seven Schema-integrity fixtures exposed canonical-path handling in copied runners;
- two full-journey fixtures encoded the obsolete extra-argv contract and a forged clarification history;
- three checkpoint fixtures used forged root/question/reopen histories.

The fixtures now build real pending → delivery → reopen lifecycles through compiler replies. The completed-run preservation invariant remains explicit: `NEW_RUN_REQUIRED` byte-preserves the prior `output/current.json` and bundle, and a newer accepted-but-incomplete revision cannot be hidden by an older checkpoint.

The repeatability worker was changed from relying on import side effects to exercising the real child CLI. Each of 100 fresh installed-shape runs invokes the top-level entry four times.

## Independent review rounds

Two independent read-only reviewers evaluated specification compliance and code quality.

### First review

Both reviewers found an Important bypass: when a prior revision lacked `clarification-state.json` or downstream Agent artifacts, pre-promotion validation returned early. An r001 append with fabricated question/root IDs could become immutable before the compiler rejected it.

New RED: 13/17 pass, four failures. It covered an incomplete prior revision, missing prior state, an orphan state with missing Case Drafts, and `--preserve-symlinks-main` execution.

GREEN:

- complete accepted artifacts deterministically reconstruct missing compiler state;
- incomplete prior revisions cannot authorize a Decision/control append;
- stored state inconsistent with accepted artifacts fails closed;
- the entry and installed Schema root both canonicalize real paths;
- stale promotion, checkpoint, source-revision, and old-current tests use real compiler-owned roots and legal clarification histories;
- 100-run repeatability again exercises the actual CLI.

### Second review

Both reviewers found a second Important recovery defect: ordinary reinvocation without a new Source Pack still trusted stored derived clarification state. A forged suppressed/delivery state could create finished output without a `request_delivery`, and a forged event sequence could produce a misleading normal reply before later fatal failure.

New RED: 9/11 pass, two failures. Deleting state already rebuilt deterministically; forged delivered/suppressed state and event-sequence mismatch did not fail early.

GREEN/Refactor:

- `acceptedRunIntegrity` now performs one linear canonical replay of every accepted revision before staging, reply, or output handling;
- accepted four-artifact history is the only clarification fact source;
- missing derived state is rebuilt, stored mismatch is immediately fatal, and a higher accepted source cannot follow an incomplete revision;
- the canonical active context is reused by pre-promotion and final evaluation;
- the old stored-state input and duplicate recursive history replay were removed.

The third specification and code-quality reviews independently returned `APPROVED` with no Critical, Important, or Minor findings. Both reviewers reran the stored-state attacks and confirmed immediate `RUN_INTEGRITY_ERROR` with no output publication.

## Verification

Implementer final fresh check at the committed candidate:

```text
npm run check
```

Exit 0:

- TypeScript no-emit: PASS;
- generated build `--check`: PASS;
- primary suite: 821/821 PASS in 307.477 s;
- repeatability: 1/1 PASS, 100 fresh installed-shape runs and 400 real child-CLI calls in 46.706 s.

Adjacent recovery verification:

```text
tsc --noEmit && node --test --test-concurrency=1 \
  test/interface/full-journey.test.mjs \
  test/recovery/checkpoint-recovery.test.mjs \
  test/recovery/source-revision.test.mjs
```

Exit 0: 66/66 PASS in 90.536 s.

Controller independent verification:

```text
node --check skill/generate-test-cases/scripts/test-compiler.mjs
npm run build -- --check
node --test --test-concurrency=1 \
  test/interface/g1d-runner-protocol.test.mjs \
  test/interface/g1d-reply-contract.test.mjs \
  test/interface/g1d-stage-progression.test.mjs \
  test/recovery/g1d-source-revision.test.mjs \
  test/interface/skill-static.test.mjs
git diff --check
```

Exit 0: 34/34 focused tests PASS; bundle syntax, generated build, and diff hygiene PASS.

Environment: Node `v24.18.0`; npm `11.16.0`.

## Digests at G1-D closure

- modular source-tree aggregate: `69f06668aa93e6b6da7875130254db9830cf3cdb047c52e35d198d27eb2a637a`
- generated `test-compiler.mjs`: `5725952e95195ba85f9887c46f4b65bdfe5035fa80b27a85ffa0c7f71921db16`
- Schema aggregate: `f02e2a012f0f06f05256e5b0fbc4988fceccf3322aae82b70b00fac403e2f4a6`
- `reply.schema.json`: `0bb30d6cb1276c51a09dc3a66b3de07c9aa18b2766c941bdd792bac84f6f6c34`
- `schema-manifest.json`: `f706ff91b97ea1ee336f5abda96d3ff348804c71a5961db217bdddd971bb047a`
- `SKILL.md`: `06f974e581b710490cdb45a1cfc79e3014ff4326579b56618d2edcad87999a94`

These are intermediate engineering digests, not G4/G5 release evidence. Any later production, Schema, Skill, benchmark, or bundle change invalidates them for release use. No installation, push, merge, or RC tag occurred in G1-D.
