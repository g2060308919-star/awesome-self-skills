# generate-test-cases V1 release evidence

## Outcome

The `generate-test-cases` installed-shape artifact passed the revised single-system release gate on 2026-09-03. Installation and RC tagging remain separate, explicitly authorized operations.

## Release policy

- System under test: `generate-test-cases` only.
- Corpus: 30 public PRDs, five in each of six product-risk strata.
- Repetitions: three isolated runs per PRD, for 90 captures.
- Witnessing: three assigned Codex sub-Agent task identities with distinct operator observation records.
- Excluded claims: no four-system comparison, no external-expert benchmark, no platform-signed or cryptographic Agent attestation, and no superiority claim.

## Frozen result

- Final candidate commit: `5148c660dd4b3dbb6b453551ae4847355e1206d0`
- Gate status: `pass`
- Release eligible: `true`
- Cases/captures: `30/90`, all 90 completed
- Strata: transaction/order/payment 5; identity/role/permission 5; workflow/approval/state 5; form/configuration/input validation 5; asynchronous integration/event 5; time-window/quota/entitlement 5
- Gate issues: none
- Full engineering check: 880/880 tests passed
- Determinism: 100/100 fresh installed-shape runs were byte-identical
- Official Skill validator: `Skill is valid!`
- Clean-checkout path used for final evidence: `/private/tmp/generate-test-cases-final5-LqfCFq`

## Artifact bindings

- Compiler: `96a3b2fcbc168240a2f79b0c8c36c8fa78566e99ee10b16138aa69aa6ebbb6b9`
- Schema aggregate: `5c8bdc6d6b2d3c22b3fcf44f6195d83f683a73c57cc9008b8ac746f7aeb3e91c`
- Schema manifest: `f706ff91b97ea1ee336f5abda96d3ff348804c71a5961db217bdddd971bb047a`
- Skill: `06f974e581b710490cdb45a1cfc79e3014ff4326579b56618d2edcad87999a94`
- Bundle: `24914e4890abb13f74fffe5a4edb294469a477441e33264d5a7a2a250dada6b5`
- Release manifest: `e28e1689d8169d12f3ae9c9d1d652c8bffb789b2eda2920cb43a66d9ca6af1c9`
- Corpus catalog: `aef05da4807d8783e1c82fc0fb299e643ffbb5d04a1464088e56aa95bead238a`
- Corpus content: `233b6f6fcb983691fc6e5f4a2be9555010254ddb714734a363c73c68a2a5a57a`
- Capture ledger: `9a6db5c69ab6b9ab47d51020c27f2b8c73385b61c38cb7e12b199f66449d3af7`
- Capture evidence root: `9c8666cfa550ec5f9fb77a25a8c926472fc86c38e2037b7e86280499300b1231`

The candidate commit identifies the isolated development repository used to build and validate the installed artifact. The public repository intentionally publishes the installed Skill shape rather than local development dependencies or temporary worktrees.
