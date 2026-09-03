# Public PRD remediation record — 2026-09-01

## Outcome

The public-source machine pilot now contains 30 digest-bound cases, with five cases in each frozen stratum. Two independent machine test experts returned 30 `admit`, 0 `hold`, and 0 `reject`; the machine adjudicator preserved all agreements and recorded zero disagreements.

This is machine intake evidence only. The reports set `formal_admit_count=0`, `external_expert_evidence=false`, `release_eligible=false`, and `release_status=insufficient_evidence`.

## Remediation method

Every candidate was checked against exact retained source bytes, a 40-character repository commit, a license from the same revision, provenance metadata, a source-bound task, and the frozen intake report. Task scopes were narrowed where the original wording exceeded the source. Sources with fundamental authority, license, or behavioral-contract problems were replaced rather than rationalized.

Three final replacements were material:

- Workflow/approval/state case `PF-WF-04` now uses AgentAction's first-party [gateway PRD](https://github.com/dinpd/AgentAction/blob/84722312663cc46a7d928d0d883332f8d6d1d821/docs/agentaction-gateway-prd.md), covering exact-action challenges, approval/grant binding, replay handling, and fail-closed context drift under Apache-2.0.
- Asynchronous integration/event case `PF-AS-04` now uses Cloudflare Agents' first-party [queue specification](https://github.com/cloudflare/agents/blob/73d2ed457ba02035d2b1d3efc785c012254ac216/docs/agents/queue.md), covering persistent FIFO callbacks, automatic processing, bounded retry, and dequeue outcomes under MIT.
- Asynchronous integration/event case `PF-AS-05` now uses Runmill's first-party [production-worker PRD](https://github.com/mikigraf/Runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/docs/asf-production-worker-prd.md), covering immediate run IDs, durable events, checkpoint recovery and reconciliation, and terminal retry disposition under MIT.

The transaction replacement retained during the preceding pass is Unbrowse's first-party [acceptance criteria](https://github.com/unbrowse-ai/unbrowse/blob/e844f8f6af03b2ca9f0c466ac2262efceb2cf8ca/docs/architecture/ACCEPTANCE-CRITERIA.md) under MIT.

## Defect and release boundary

Public issue research produced 32 globally deduplicated leads from 33 source occurrences. Every entry remains `status=lead`, `bound_case_id=null`, `countable=false`, and `snapshot_status=not-retained`; Temporal issue 10321 is represented once with both source occurrences. These leads are research inputs, not historical-defect recall credit.

The target comparator is frozen, while `long-prompt`, `test-case-designer`, and `technique-router` remain unresolved. No captured runs, human labels, adjudications, defect snapshots, release pass, installation, or release-candidate tag were invented or created.
