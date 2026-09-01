# Real B01 Host Evidence Rehearsal

This record documents the diagnostic rehearsal performed on 2026-09-02. It is not Calibration evidence and must not be used to create a Release Matrix.

## Scope and authorization

- Profile/unit: `B01` / `B01-R1`
- Trial: `trial-725c8843-f5ed-4fb8-b06b-1b3acc45e2ce`
- Run: `bbf55c39-8ab9-4394-aee0-b1c37e12b368`
- Host adapter: `codex-rollout@1.2.0`
- The operator explicitly authorized export of the one current Codex task by exact task ID. No other task was read or imported.
- The business page was local and non-production. Login remained a manual action in the visible browser.

This historical `1.2.0` adapter package predates the controlled native-source attestation added after the rehearsal. It remains diagnostic evidence only and cannot be promoted to formal release evidence.

Private runtime paths, control-plane locations, credentials, capability tokens and Oracle content are intentionally omitted.

## Observed execution

The operator selected the synthetic `Vera Viewer` account. The Runner then used the visible business UI to search for `Acme Alpine` and opened customer `CUS-1012`. The visible detail page showed the expected read-only values: status `Active`, owner `Avery Stone`, and plan `Scale`. No business write was performed.

The manual login request occurred after the immutable assistance deadline. The persisted assistance event therefore has `valid: false` and `ASSISTANCE_DEADLINE_EXCEEDED`; the expired interval was not excluded from active execution time.

## Provenance outputs

The Bridge generated private `host-trace.json`, `assistance.json` and `metrics.json` inputs with one consistent source identity:

- Session digest: `sha256:f5a5354f0456ba3e450ef4ea33bfe92b5f50601bb223f5172fc0ceac564f62bf`
- Source manifest digest: `sha256:03c1dcc9aed3e6271f50f705d6a34db9158248593b997758e74a9b69233f2c7d`
- Normalized events digest: `sha256:1ab1e44d5d0ae3d090ca48b7abd37f26b35fb5bc0d641d80ffa289250a60e97a`

The source was a snapshot of an active, long-running Codex task. Current Codex task tool traffic is wrapped by the generic `exec` host call, so the conservative adapter classified those operations as unknown rather than inferring nested Chrome actions from JavaScript text. The export also included activity before this Trial's scope confirmation. Both conditions correctly failed closed.

## Result and cleanup

- Evaluation: `eligible: false`, `score: ineligible`, diagnostic score `40`, release decision `fail`
- Release reasons: `HOST_EVENT_UNKNOWN`, `ASSISTANCE_DEADLINE_EXCEEDED`, `HOST_EVENT_ORDER_INVALID`
- Responsibility domains: Runner, Host evidence, assistance and budget
- Fixture reset: succeeded; Trial ended in `completed`
- Calibration aggregation: `incomplete` (`1/6` units)
- Release Matrix creation: rejected with `CALIBRATION_REQUIRED`

A formal Calibration run still requires six fresh, bounded Host sessions for `H01`, `B01`, `B02`, `B09`, `B11` and `B12`. A clean Host export must contain only the selected Trial and expose supported tool events; this diagnostic snapshot cannot be promoted or rewritten into release evidence.
