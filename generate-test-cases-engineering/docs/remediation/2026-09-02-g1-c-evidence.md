# Generate Test Cases V1 Remediation — G1-C Evidence

Date: 2026-09-02 (Asia/Shanghai)

## Scope

G1-C connects the existing deterministic t-wise selector to the sole production obligation compiler and closes per-Case Oracle ownership. It freezes compiler-owned vector obligations, owner fact routes, selected-value evidence, private candidate-cap gaps, optional vector Oracle prebindings, one-to-one expectation closure, typed Oracle execution identity, exact-signature merging, and independent classifier/coverage replay. Runner entry, Reply Schema, durable-run Adapter behavior, and metadata triggering remain G1-D.

## Commits

- `db5b83ec47ae6e87ab605cbb959f9c682529527f` — `feat: wire t-wise obligations and oracle closure`
- `24ad4683312791d634a07d5c73c5ab88eb5362e5` — `fix: preserve merged evidence and t-wise closure`
- `9bd27cb80e2e879ed80c103131ca046fdf5a8c02` — `fix: anchor forbid evidence by level`

## Red to green mapping

### Production t-wise and explicit Oracle closure

The complete pre-production RED matrix was executed from an isolated detached checkout at parent `16b4795b94143183924341c286475e1843e7021f`:

```text
/private/tmp/g1c-red-baseline.ivGl8E/repo
node --test --test-concurrency=1 test/interface/g1c-twise-oracle.test.mjs
```

Observed: exit 1; 21 top-level groups / 49 TAP results; 45 failures and four already-correct compatibility passes. A separate coverage replay was 0/1. The failures covered owner existence, fact/view/element closure, scope, risk and forbid evidence, selected-value evidence, complete assignments, private cap, resource gaps, vector prebindings, empty prebindings, one-to-one closure, auxiliary expectations, gap/Blocked/NotApplicable rejection, E1 downgrade, typed signatures, multiple signatures, lane conflict, and classifier/coverage replay.

Additional REDs discovered during implementation and retained in the regression suite covered:

- broad requests attached to narrower owners and unrelated selected owner elements;
- classifier replay missing selected-value source evidence and coverage replay missing the owner fact route;
- legal strength 3 rejected by both replayers while strength 4 over three parameters remained invalid;
- accepted E2 `test-data` incorrectly admitted as a vector Oracle prebinding;
- ordered cleanup actions incorrectly collapsed by exact-signature merging.

The initial GREEN commit `db5b83e` passed 771/771 package tests and 100-run repeatability before independent review.

### Independent review fix round

Two independent read-only reviewers found three Important defects:

1. exact-signature merging ignored single-valued evidence/provenance, emitted an apparently Grounded merged Case, and then failed its own evidence-summary replay;
2. classifier and coverage accepted a derived vector whose `owner.view_id` disagreed with its owner element view IDs;
3. a generic owner requirement could be used as a forbid proof and silently remove a tuple.

The repair REDs reproduced all single-valued Case associations in a table, owner-view tampering in both replayers, and generic, partial, and split forbid proofs. GREEN at `24ad468` made single-valued association differences deterministic semantic conflicts, merged the safe nested source-claim set, fully re-evaluated merged Cases, added the two owner-view replay gates, and required every forbid proof to close the entire selected-value tuple.

The adversarial re-review then found one remaining Important bypass: an E2 generic owner descendant that was a common ancestor of all value claims still passed the symmetric relation check. The final RED reproduced that installed-shape case. GREEN at `9bd27cb` made the proof direction evidence-level-specific:

- an E2 proof must be a strict descendant of every selected-value target;
- an E3 proof must be a strict, non-owner ancestor of every selected-value target;
- equality, generic owner, partial, split, E1, diagnostic, unrelated, and sibling evidence cannot shrink the candidate set.

Both joint E2 descendants and non-owner E3 common parents remain valid. Every forbid proof closes the complete tuple; a mixture containing any invalid proof fails closed.

## Implemented invariants

- `compileObligations` is the only production caller that consumes `compileObligationInputs`; no fifth Agent artifact or test-only injection exists.
- A public request has a closed single owner, at least three finite parameters, explicit interaction risk, declarative forbid constraints, compiler-private cap, and optional vector prebindings.
- The deterministic selector keeps the frozen binary strength-2 cover `000`, `011`, `101`, `110`, supports strength through the declared parameter count, covers every legal tuple, excludes only strongly proved forbidden tuples, and never samples over cap.
- Every selected vector becomes a compiler-owned caseable interaction obligation. Its identity uses policy, owner, scope, strength, and semantic assignments, not evidence IDs, risk evidence, obligation associations, or input order.
- Selected vectors inherit every owner fact root and selected-value claim and route to every owner fact. Missing owner roots, selected claims, route links, strength bounds, or the single owner-view contract fail independently in classifier and coverage.
- Cap overflow yields one owner-linked, non-answerable `resource_limit` requirement gap and Blocked fact route; it cannot be closed by Case, NotApplicable, or an expectation.
- Empty `required_oracle_refs` is an optional prebinding. Each linked caseable obligation still requires exactly one `obligation-oracle` expectation with a single `closes_obligation_id` and nonempty `oracle_evidence_refs`; auxiliary expectations never count toward formal coverage.
- Oracle evidence is typed and accepted: E3 requirement, E1 assumption, or legal E2 expected-value ancestry. Scope, support, closure, primary membership, prebindings, and forbid exclusions are checked independently by classification and coverage. E1 input or Oracle evidence caps the Case at Conditional.
- Agent execution signatures name expectation IDs; compiler Case identity uses typed Oracle semantics and excludes evidence and obligation IDs. Different typed signatures remain separate Cases; exact signatures merge only losslessly; the same obligation cannot cross Grounded and Conditional lanes.
- Ordered cleanup semantics remain ordered. Single-valued evidence/provenance differences fail closed; set-valued associations merge deterministically and the result passes full classifier and coverage replay.

## Review and verification

The first independent review verdict was `FIX ROUND`. After both fixes, the specification/quality reviewer and adversarial reviewer independently returned `APPROVED` with no Critical or Important findings. The final adversarial pass exercised multi-level ancestry, siblings, equality, multiple valid proofs, valid-plus-invalid proof sets, and tuple assignment reorder.

Implementer final evidence at `9bd27cb`:

- installed G1-C: 71/71;
- final package check: 791/791;
- repeatability: 1/1, covering 100 fresh installed-shape runs;
- build, bundle syntax, generated-bundle freshness, TypeScript, and diff checks: exit 0.

The controller independently ran:

```text
node --test --test-concurrency=1 --test-name-pattern='installed t-wise risk and forbid evidence' test/interface/g1c-twise-oracle.test.mjs
node build/build.mjs --check
node --check skill/generate-test-cases/scripts/test-compiler.mjs
npm run check
```

Results: focused forbid suite 11/11; build and bundle checks exit 0; fresh `npm run check` exit 0 with 791/791 main tests in 282447 ms and 1/1 repeatability test covering 100 fresh installed-shape runs in 68569 ms. The tracked worktree was clean before and after verification.

## Digests at G1-C closure

- `src/obligations/compile-obligations.mjs`: `4c7133fabbbc71a74e1895a41fb761c096abc3b2c25748026e600989ce04ec75`
- `src/classify.mjs`: `7427bc0284e92ef8fe4d49d241d8d32916efe1690e72d5c1bea4d03b5d31bf2d`
- `src/coverage.mjs`: `d845bf50adb948e25d094074b473700313ae119f5e008171f2163fb8d9d93000`
- `src/canonical.mjs`: `9f57a986ff557bd62a43046e2faf16abc218e311918150e64bf9f88c645d595e`
- `skill/generate-test-cases/SKILL.md`: `67625fc2ac7989582b60d33db83cc3ff1b23dd9a33fa9ee412e207c15bd293ae`
- `references/behavior-views.md`: `ae47a8f25323039ab94397d03e539244967fea29af6996e2067825b98f5c0704`
- `references/case-writing-policy.md`: `e2db957662193b9c69f9f8eef26643f0795bc2086e945b95ef6fb7f31ecfdabf`
- `references/clarification-policy.md`: `eabff02cecfaa186a0587abadeb42ea221feb504ad6148b27ec3f6756d26bad3`
- `behavior-views.schema.json`: `dc373d331ecbb263c6364abb62bdbda7ca2587455784dee963bd961af16f6db3`
- `case-drafts.schema.json`: `0d53dd6d4e716f0e80472fdc1d8498960dc5c7977ba21018ac71bce863f9a279`
- `test-obligations.schema.json`: `6ef0b8fb3973c6b6fee8550d0145b1057e0af61fac1c2a84678e70b1c3cd927d`
- `test-bundle.schema.json`: `7eef4bd12e7928c041ebc298a45dd822f6ac86a63c4f231849547d1acc669852`
- `schema-manifest.json`: `2c3b0f7315f9d2590eeff80915ffaf088240d02ee1c5112bbd84ac89d894b3e3`
- `test-compiler.mjs`: `2e6f67ff2ed88d7b470ec7a55bbf82a5b0ac34ea3dbee53049703e6131726224`

These are intermediate engineering digests, not release-candidate evidence. Any later production, Schema, Skill, benchmark, or generated-bundle change invalidates them for G4/G5. No installation or RC tag was created.
