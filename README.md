# awesome-self-skills

Reusable Codex skills:

- [b2b-e2e-runner](b2b-e2e-runner/) — execute confirmed semantic E2E cases against unfamiliar non-production B2B web systems.
- [generate-test-cases](generate-test-cases/) — compile PRDs and module descriptions into evidence-grounded manual functional test cases with explicit traceability, coverage, blockers, and clarification.
- [generate-test-cases-engineering](generate-test-cases-engineering/) — reproducible modular source, build, tests, benchmark gate, and release evidence for the published `generate-test-cases` Skill.

`generate-test-cases` V1 has passed its single-system release gate. The frozen gate uses 30 public PRDs across six product-risk strata and three operator-witnessed Codex sub-Agent runs per PRD (90 replayable captures total). It does not claim comparator superiority, external-expert validation, or platform-signed Agent identity. See the [release evidence](docs/generate-test-cases-v1-release.md).

## E2E Runner evaluation sandbox

The repository includes a standardized local synthetic B2B system for evaluating semantic E2E Runners. Start with the [Sandbox README](e2e-runner-sandbox/README.md).
