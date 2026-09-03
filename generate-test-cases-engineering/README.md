# generate-test-cases engineering source

This directory is the reproducible development project for the published [`generate-test-cases`](../generate-test-cases/) Skill.

It was imported from the complete tracked tree of the validated development commit:

```text
5148c660dd4b3dbb6b453551ae4847355e1206d0
```

The snapshot contains the modular compiler source, schemas, build pipeline, test suites, benchmark gate, 30-PRD corpus metadata, and 90 operator-witnessed replay captures. It intentionally excludes nested Git metadata, `node_modules`, local worktrees, runtime caches, temporary files, and environment secrets.

## Verify

```bash
npm ci
npm run check
npm run benchmark
```

The build output at `skill/generate-test-cases/` must remain byte-identical to the repository-level `generate-test-cases/` published shape before changes are merged.

The release benchmark is the approved single-system gate. It does not make comparator-superiority, external-expert, or platform-signed Agent identity claims.
