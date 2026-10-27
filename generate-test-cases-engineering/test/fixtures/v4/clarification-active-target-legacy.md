# Legacy active-target fixture

Synthetic local fixture captured by the unmodified bundle at source commit
`02eb8d92c4f0894353f55047d78ac15465bed430`, schema/compiler 4.3.3/0.8.3.
Bundle SHA-256: `bec2ab5f3fb86bd3b283fef53f684a378984248ab2768e7c04ca6f66ba6bc4a4`.

The gzip contains a JSON object with a validated old presentation and 14 exact
run files. It was produced by the real old CLI using the existing Bend Review
synthetic PRD fixture, local test image bytes and genuine collection/acquisition
helpers. Before Evidence submission, the unresolved IP Fact was marked active.
The old runner incorrectly accepted and presented that target. No accepted file
or checkpoint was edited afterward. It contains no real user material or account.

The new runner must reject both replay and a mixed valid/active-target answer
batch before material changes, while every captured history byte stays intact.
The fixture is independent of git history, external services and installed skills
at test execution time. It represents historical format compatibility, not
recovery of a real user's run.
