# E2E Test Report

## Run Context

| Field | Value |
|---|---|
| Run ID | {{run_id}} |
| Target | {{target_url}} |
| Environment | {{environment}} |
| Started / ended | {{started_at}} / {{ended_at}} |
| Input test plan | {{test_plan_reference}} |
| Confirmed scope | {{scope}} |
| Roles, accounts, tenants, or permissions | {{access_context}} |
| Limitations | {{limitations}} |

## Result Summary

Totals below must be derived from required assertion facts in `execution-log.json`.

| Passed | Failed | Inconclusive | Not Run |
|---:|---:|---:|---:|
| {{passed_count}} | {{failed_count}} | {{inconclusive_count}} | {{not_run_count}} |

## Assistance and External Actions

{{assistance_summary_with_case_step_time_action_observation_and_evidence}}

## Blockers and Unverified Scope

{{unresolved_blockers_unverified_assertions_not_run_cases_and_waiting_conditions}}

## Case Results

### {{case_id}} — {{case_title}}

- Verdict and fact-based reason: {{case_verdict_and_reason}}
- Preconditions and test data: {{preconditions_and_test_data}}
- Role / permission / tenant context: {{case_access_context}}
- Case issues: {{case_issues_or_none}}
- Case evidence: {{relative_links_under_evidence}}

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| {{step_id}} | {{action}} | {{expected}} | {{actual}} | {{assertion_id}} / {{required}} | {{verified-pass_or_verified-fail_or_unverified_or_not-run}} | {{ai_or_user-assisted-observed_or_external-person_or_user-reported-only}} | {{step_and_assertion_relative_links_under_evidence}} |

Repeat the case section for every case, including Not Run cases. Link evidence at case, step, and assertion level.

## Verified Failures and Suspected Abnormalities

{{failures_and_abnormalities_with_expected_actual_and_redacted_relevant_page_console_network_evidence}}

## Cleanup and Residual Data

| Case | Declared or authorized cleanup | Result | Residual data | Evidence |
|---|---|---|---|---|
| {{case_id}} | {{cleanup_scope_or_not_declared}} | {{succeeded_failed_or_not_run}} | {{residual_data_or_none_known}} | {{relative_links_under_evidence}} |

## Data Handling

All persisted artifacts were reviewed to exclude passwords, cookies, authorization values, tokens, other secrets, and unrelated sensitive business data. {{additional_redaction_or_limitation_notes}}

## Artifact Index

- Machine-readable facts: [execution-log.json](execution-log.json)
- Evidence root: [evidence/](evidence/)
- {{evidence_inventory_with_case_step_assertion_mapping}}
