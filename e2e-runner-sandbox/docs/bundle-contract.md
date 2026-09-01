# Immutable bundle contract

`benchmark/v1/` is a released, content-addressed evaluation bundle. `bundle.json` joins the public Runner-input schema, private Oracle contract, snapshot normalizer, scoring policy, provenance classifier, profile index, execution matrix, and digest manifest.

## Profile composition

Each profile resolves exactly one fixture, UI variant, optional one-shot fault, Runner input, Oracle entry, and assistance script. The loader verifies all declared component SHA-256 digests before returning a deeply frozen bundle. JSON pointers are the only allowed run-ID substitution mechanism; prototype-related and unresolved pointer segments fail closed.

The matrix contains five repetitions for each independent B01–B18/H01–H02 truth. B05, B08, B15, and B17 variants remain separate profiles rather than runtime conditionals. H02 is retained for honest Not Run capability behavior and is excluded from numeric release scoring.

## Public and private halves

The materialized Runner input contains semantic plans, cases, steps, assertion text, declared dependencies, and affirmed environment context. It must not contain selectors, control paths, fault identifiers, expected hidden outcomes, stable internal target IDs beyond business-visible data, canaries, or Oracle fields.

The Oracle half contains allowed mutations, expected canonical diffs/events/outbox, fault consumption, assistance truth, budgets, scoring checks, and expected verdict/attribution. Only the evaluator loads it.

## Regeneration and verification

Corpus source is `scripts/build-corpus.mjs`. Any intentional corpus change must be regenerated, reviewed as source and output, and followed by a new digest manifest:

```bash
node scripts/build-corpus.mjs
npm run bundle:digests
npm run bundle:verify
```

Do not edit `SHA256SUMS.json` by hand. A digest mismatch, unsafe path, symbolic link, invalid contract value, undeclared matrix profile, or cyclic dependency makes the entire bundle unusable.
