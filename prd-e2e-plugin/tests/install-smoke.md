# Installation smoke record

Status: **NOT EXECUTED — separate user authorization is required**

The repository-safe package and discovery checks run without modifying an active Codex profile. The installation smoke below intentionally remains pending because it creates external profile and plugin state.

## Authorized smoke procedure

1. Create a clean, disposable Codex test profile outside the active profile.
2. Run `scripts/check-install-conflicts.mjs` against that profile and require an empty conflict list.
3. Add a local test marketplace entry that points to this `prd-e2e-plugin/` source, then install `prd-e2e` once through the supported Codex plugin command.
4. Start a new session and verify that discovery returns exactly:
   - `run-prd-e2e`
   - `generate-test-cases`
   - `b2b-e2e-runner`
5. Submit a discovery-only request with `https://smoke.example.invalid/` and no browser authorization.
6. Verify that one outer Run is created with `stage=intake` and `next_action=start_case_generation`.
7. Confirm that no `.invalid` URL was opened and no real website was accessed.
8. Remove the disposable test profile using the profile owner's normal cleanup process.

Do not adapt this smoke to the active profile, a production target, or a real test site without new authorization.
