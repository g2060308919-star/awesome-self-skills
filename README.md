# awesome-self-skills

Reusable Codex skills:

- [b2b-e2e-runner](b2b-e2e-runner/) — execute confirmed semantic E2E cases against unfamiliar non-production B2B web systems.
- [generate-test-cases](generate-test-cases/) — compile PRDs and module descriptions into evidence-grounded manual functional test cases with explicit traceability, coverage, blockers, and clarification.
- [generate-test-cases-engineering](generate-test-cases-engineering/) — reproducible modular source, build, tests, benchmark gate, and release evidence for the published `generate-test-cases` Skill.

`generate-test-cases` now publishes one operational V5 workflow (Schema `5.0.0`, compiler `0.6.0`). Its only public mutation surface is `createV5RunDirectory` followed by `advanceV5Run`; `inspectV5Run` and the direct CLI are read-only. The compiler owns stable identity, provenance, clarification transactions, canonical rendering, integrity recovery, and the four-artifact authority boundary.

The earlier single-system corpus remains historical evidence for the original release and is not an operational runtime path. See the [historical release evidence](docs/generate-test-cases-v1-release.md) and the [V5 cutover decision](generate-test-cases-engineering/docs/decisions/ADR-002-v5-single-operational-workflow.md).

## E2E Runner evaluation sandbox

The repository includes a standardized local synthetic B2B system for evaluating semantic E2E Runners. Start with the [Sandbox README](e2e-runner-sandbox/README.md).
