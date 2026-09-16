# V4 generation-quality corpus

This directory freezes the raw-input corpus and review protocol for Spec A01–A24. It is development evidence only and is not shipped in the installed Skill.

- Generation runs receive only the files named as initial inputs in `protocol.md`.
- `acceptance-oracle.md`, `review-candidates/`, answer scripts, and prior outputs are never placed in a generation context.
- No `source_pack`, Fact, View, Test Point, Case Draft, or canonical bundle is prefilled.
- `manifest.json` binds every frozen file by SHA-256. Changing any byte creates a new corpus version.
- `acceptance-record.md` records actual runs only. `not_run` is not a pass.
- `review-candidates/` isolates the four A23 defect classes (missing terminal result, object switch, merged independent results, and example-as-rule) plus one valid control.

Direct comparison baseline: updated V4 commit `3464c670c8cb185f3803ecc767219af7a20a2c6d`.

Additional original-V4 reference: `b9fad4c35acbd37c9531417fae136cd18f9e0afa`.
