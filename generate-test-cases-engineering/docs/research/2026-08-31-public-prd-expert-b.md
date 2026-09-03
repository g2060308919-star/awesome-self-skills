# Public PRD candidate review — machine test expert B — 2026-08-31

## Scope and non-claim

This is an independent **machine-agent research and triage record** for the last three frozen strata:

1. `form/configuration/input validation`
2. `asynchronous integration/event`
3. `time-window/quota/entitlement`

It is not an external human expert annotation, adjudication, capture, corpus manifest, or release result. Nothing here may be represented as one of the two required external expert identities. The controlling sources are the handoff `AGENTS.md`, `benchmark/v1/adjudication/protocol.md`, the benchmark manifest/schema, `benchmark/gates.mjs`, and the prior public-evidence audit.

After the primary task requested convergence, the search stopped at the strongest five strict candidates per stratum. Where five could not be verified, HOLD/REJECT items and the exact gap are recorded instead of filling the gap with RFCs, standards, templates, tutorials, portfolios, or synthetic fixtures.

## Decision rules

- **ACCEPTED-FOR-INTAKE** means: the artifact is a real project-owned PRD (not merely PRD-equivalent), the project is independently maintained and planned/in progress/implemented, the source and owner are direct, copying/evaluation rights are explicit, the content is distinct and testable, and the frozen stratum fit is defensible. It is **not benchmark-admitted** until an exact commit/tag, raw bytes, SHA-256, task scope, and case-specific evidence are frozen.
- **HOLD** means it may be a strict PRD but one or more release facts remain unproved (usually license/rights, source authority, or dominant stratum fit).
- **REJECT** means it is excluded by the frozen interpretation (portfolio/demo/template/tutorial/synthetic) or is not a strict PRD.
- AI assistance is not an automatic rejection. Unless the owner expressly discloses authorship, the value is `unknown`. Real implementation, independent ownership, non-fixture purpose, rights, versioning, and testability control the decision.
- A mutable branch URL is never the frozen identity. Intake must resolve the file to an exact Git commit (or an owner release tag that fixes that file), download through the commit-addressed raw URL, store the raw bytes offline, and record their SHA-256. Every accepted row below uses this method unless a stronger tag is stated.
- Content uniqueness is preliminary: all listed documents have different owners/products and visibly different requirements. Final intake must calculate the protocol's path-independent content digest and reject byte-identical or renamed duplicates.

## Strict count summary

| Frozen stratum | ACCEPTED-FOR-INTAKE | HOLD | REJECT | Strict target status |
|---|---:|---:|---:|---|
| form/configuration/input validation | 5 | 0 | 0 | candidate target reached; none frozen/admitted yet |
| asynchronous integration/event | 5 | 0 | 1 | candidate target reached; none frozen/admitted yet |
| time-window/quota/entitlement | 5 | 1 | 1 | candidate target reached; none frozen/admitted yet |

The report therefore does not establish the frozen benchmark minimum. Even the 15 accepted-for-intake candidates remain zero admitted cases until immutable snapshots and case scopes are produced.

## 1. Form / configuration / input validation

| ID | Artifact and authority | Implementation / AI disclosure | Direct source and freeze method | Rights | Unique stratum fit | defect_count | Decision |
|---|---|---|---|---|---|---:|---|
| F-01 | Kanea, owned by `m18h`; the repository calls `PRD.md` its north star | Implemented container orchestrator; 405 commits and published signed releases were visible. AI authorship unknown | [PRD](https://github.com/m18h/kanea/blob/main/PRD.md), [owner repository](https://github.com/m18h/kanea). Prefer the release tag whose source contains the selected PRD; otherwise exact intake commit + raw SHA-256 | [Apache-2.0](https://github.com/m18h/kanea/blob/main/LICENSE) | Job/service specs, `kanea plan`, schema checks, refused invalid releases/architectures, exact field diagnostics; distinct container-orchestration content | 0 | **ACCEPTED-FOR-INTAKE** |
| F-02 | VoiceType AI, owned by `devaxl` | Owner states a working v0 with implemented settings, profiles, migrations, hotkey collision detection and recovery. AI authorship unknown | [PRD](https://github.com/devaxl/VoiceType-AI/blob/main/PRD.md), [owner repository](https://github.com/devaxl/VoiceType-AI); exact intake commit + raw SHA-256 | [MIT](https://github.com/devaxl/VoiceType-AI/blob/main/LICENSE) | Versioned configuration, provider keys, mutually constrained settings, invalid/missing key paths, malformed provider responses; distinct desktop-dictation content | 0 | **ACCEPTED-FOR-INTAKE** |
| F-03 | The Loop, owned/maintained by System Error Worldwide | Implemented multi-harness skill pack with source, schemas and tests. AI authorship unknown | [PRD](https://github.com/System-Error-Worldwide/the-loop/blob/main/docs/specs/prd.md), [owner repository](https://github.com/System-Error-Worldwide/the-loop); exact intake commit + raw SHA-256 | [MIT](https://github.com/System-Error-Worldwide/the-loop/blob/main/LICENSE) | Setup inputs, capability detection, namespace/config safety, validation and fail-closed release requirements; distinct agent-skill-pack content | 0 | **ACCEPTED-FOR-INTAKE** |
| F-04 | Agent ToolTrust, owned by `deghosal-2026`; PRD identifies an approved product owner/source | v0.2 shipped and published to PyPI; source/tests present. AI authorship unknown | [PRD](https://github.com/deghosal-2026/agent-tooltrust/blob/main/docs/design/PRD.md), [owner repository](https://github.com/deghosal-2026/agent-tooltrust); use a release/source tag containing the PRD or exact intake commit + raw SHA-256 | [MIT](https://github.com/deghosal-2026/agent-tooltrust/blob/main/LICENSE) | Declarative JSON/YAML policies, unknown-key/missing-section/range/path/enum validation, migration and line/column errors; distinct policy-engine content. Identity/permission is a collision risk, so final adjudication must retain it only here if config validation is the chosen dominant lane | 0 | **ACCEPTED-FOR-INTAKE** |
| F-05 | CinePrime, owned by `arthursantos67` | Implemented full-stack product; repository exposes backend/frontend, tests, 404 commits, and issue tracker. AI authorship unknown | [PRD](https://github.com/arthursantos67/cineprime-api/blob/main/product-requirements-document.md), [owner repository](https://github.com/arthursantos67/cineprime-api); exact intake commit + raw SHA-256 | [MIT](https://github.com/arthursantos67/cineprime-api/blob/main/LICENSE) | Registration/checkout/admin form constraints, standardized invalid-body/field errors and API validation rules; distinct cinema-reservation content. It must not also count in transaction or time strata | 0 | **ACCEPTED-FOR-INTAKE** |

### Routed historical-defect pool (not yet case-bound)

These are first-party issue records related to validation behavior. They are candidates for evaluation-only evidence only after a selected PRD case contains the corresponding obligation/risk; arbitrary attachment is forbidden.

| Defect ID | Frozen risk | First-party record | Relevance |
|---|---|---|---|
| FORM-K8S-65470 | critical | [Invalid regex in OpenAPI validation crashes API server](https://github.com/kubernetes/kubernetes/issues/65470) | invalid validation expression causes service crash |
| FORM-K8S-68787 | high | [CR validation error lacks correct details](https://github.com/kubernetes/kubernetes/issues/68787) | validation rejection loses actionable error detail |
| FORM-K8S-68466 | high | [CRD cannot have a field named `items`](https://github.com/kubernetes/kubernetes/issues/68466) | legal field shape rejected by schema machinery |
| FORM-K8S-120821 | high | [CEL changes break CRD validation compatibility](https://github.com/kubernetes/kubernetes/issues/120821) | same rule changes validity across releases |
| FORM-K8S-90128 | medium | [CRD validation message reports the wrong invalid value](https://github.com/kubernetes/kubernetes/issues/90128) | misleading error oracle |

Discovered traceable pool: **5**. Benchmark-admitted/case-bound defects: **0**. Per-candidate `defect_count` remains zero until defensible binding is completed.

## 2. Asynchronous integration / event

| ID | Artifact and authority | Implementation / AI disclosure | Direct source and freeze method | Rights | Unique stratum fit | defect_count | Decision |
|---|---|---|---|---|---|---:|---|
| A-01 | OpenAlgo Scalping Terminal PRD, owned by the OpenAlgo project (`marketcalls`) | PRD states implemented; owner repository has 5,000+ commits and a live event-driven product. AI authorship unknown | [PRD](https://github.com/marketcalls/openalgo/blob/main/docs/scalping/PRD.md), [owner repository](https://github.com/marketcalls/openalgo); exact intake commit + raw SHA-256 | [AGPL-3.0](https://github.com/marketcalls/openalgo/blob/main/License.md) | WebSocket/ZeroMQ/Socket.IO event buses, event-driven price/book/risk triggers, reconnect/failover behavior; distinct trading-terminal content | 0 | **ACCEPTED-FOR-INTAKE** |
| A-02 | OCR-MCP, owned by `sandraschi` | Implemented web app/MCP server with 82 commits, tests, batch/pipeline and auto-scan watcher. AI authorship unknown | [PRD](https://github.com/sandraschi/ocr-mcp/blob/master/PRD.md), [owner repository](https://github.com/sandraschi/ocr-mcp); exact intake commit + raw SHA-256 | [MIT](https://github.com/sandraschi/ocr-mcp/blob/master/LICENSE) | Asynchronous scan watcher, batch OCR, multi-backend processing pipelines and completion/error states; distinct OCR/scanner content | 0 | **ACCEPTED-FOR-INTAKE** |
| A-03 | MuJoCo-MCP, owned by `sandraschi` | Implemented server/dashboard/installer with 41 commits, tests and a job queue. AI authorship unknown | [PRD](https://github.com/sandraschi/mujoco-mcp/blob/main/PRD.md), [owner repository](https://github.com/sandraschi/mujoco-mcp); exact intake commit + raw SHA-256 | [MIT](https://github.com/sandraschi/mujoco-mcp/blob/main/LICENSE) | Concurrent/sequential simulation jobs, queueing, per-job state machine and collision avoidance; distinct physics-simulation content | 0 | **ACCEPTED-FOR-INTAKE** |
| A-04 | Local LLM MCP, owned by `sandraschi` | Owner PRD/repository describe an implemented multi-provider MCP server as production-ready. AI authorship unknown | [PRD](https://github.com/sandraschi/local-llm-mcp/blob/main/PRD.md), [owner repository](https://github.com/sandraschi/local-llm-mcp); exact intake commit + raw SHA-256 | [MIT](https://github.com/sandraschi/local-llm-mcp/blob/main/LICENSE) | Multiple local/cloud provider integrations, asynchronous inference/loading/error paths and provider failover; distinct model-serving content | 0 | **ACCEPTED-FOR-INTAKE** |
| A-05 | ARR-MCP, owned by `sandraschi` | Implemented unified server for seven automation services with tools and orchestration code. AI authorship unknown | [PRD](https://github.com/sandraschi/arr-mcp/blob/main/PRD.md), [owner repository](https://github.com/sandraschi/arr-mcp); exact intake commit + raw SHA-256 | [MIT](https://github.com/sandraschi/arr-mcp/blob/main/LICENSE) | Cross-service automation, queued downloads/imports, eventual status and partial integration failure paths; distinct media-automation content | 0 | **ACCEPTED-FOR-INTAKE** |
| A-R1 | Nolen PRD, owned by `timsurrealedu` | Code exists, but the PRD expressly says the platform is for educational, research, and **portfolio** purposes | [PRD](https://github.com/timsurrealedu/nolen/blob/main/PRD.md), [owner repository](https://github.com/timsurrealedu/nolen) | No explicit repository license was visible during review | Event-stream content is strong, but the frozen exclusion explicitly removes portfolio artifacts | 0 | **REJECT** |

Owner diversity note: A-02 through A-05 have the same maintainer but distinct products and distinct visible content. The current protocol forbids byte-identical duplicates, not same-owner documents; nevertheless, final corpus curation should consider concentration bias and retain path-independent content digests.

### Routed historical-defect pool (not yet case-bound)

| Defect ID | Frozen risk | First-party record | Relevance |
|---|---|---|---|
| ASYNC-TEMP-1267 | critical | [Oversized workflow arguments corrupt history and block executions](https://github.com/temporalio/temporal/issues/1267) | partial persistence leaves an unrecoverable async state |
| ASYNC-TEMP-10321 | critical | [SQL race permanently stalls child workflow](https://github.com/temporalio/temporal/issues/10321) | transaction/transfer race loses forward progress |
| ASYNC-TEMP-9118 | high | [Activities become stuck when Temporal crashes](https://github.com/temporalio/temporal/issues/9118) | event recorded but downstream task absent |
| ASYNC-ARGO-3049 | high | [Event trigger conditions not respected](https://github.com/argoproj/argo-events/issues/3049) | wrong event dependency triggers / intended trigger omitted |
| ASYNC-ARGO-4109 | high | [Sensor leaks NATS connections after JetStream K/V initialization failure](https://github.com/argoproj/argo-events/issues/4109) | retry/failure path leaks integration resources |

Discovered traceable pool: **5**. Benchmark-admitted/case-bound defects: **0**.

## 3. Time-window / quota / entitlement

| ID | Artifact and authority | Implementation / AI disclosure | Direct source and freeze method | Rights | Unique stratum fit | defect_count | Decision |
|---|---|---|---|---|---|---:|---|
| T-01 | Copilot Status, owned by Nearform | Implemented React Native application with tests and 172 commits; Nearform sponsorship is disclosed. PRD author field says `System`, so human/AI authorship is not independently established and is recorded as unknown rather than rejected | [PRD](https://github.com/nearform/copilot-status/blob/main/PRD.md), [owner repository](https://github.com/nearform/copilot-status); exact intake commit + raw SHA-256 | [MIT](https://github.com/nearform/copilot-status/blob/main/LICENSE) | Entitlement, used/remaining quota, overage, reset date, countdown, hourly refresh, 429 reset handling; distinct quota-monitor content | 0 | **ACCEPTED-FOR-INTAKE** |
| T-02 | MCP Server for Iru API, owned by `mangopudding` | Implemented server with 23 tools and 456 unit tests; AI authorship unknown | [PRD](https://github.com/mangopudding/mcp-server-iru-api/blob/main/docs/PRD.md), [owner repository](https://github.com/mangopudding/mcp-server-iru-api); exact intake commit + raw SHA-256 | [MIT](https://github.com/mangopudding/mcp-server-iru-api/blob/main/LICENSE) | Upstream 10,000-requests/hour customer limit, TTL caches, pagination, categorized rate-limit errors and retry/backoff; distinct device-management integration content | 0 | **ACCEPTED-FOR-INTAKE** |
| T-03 | Ayin PRD + SaaS Plan, owned by `juniper-tc02e` | Built for a hackathon, but the owner repository has 92 commits and states MVP milestones M0-M5 are code-complete with real env-key-gated connectors; it is not merely a template or fictional portfolio fixture. AI authorship unknown | [PRD](https://github.com/juniper-tc02e/ayin/blob/main/docs/Ayin-PRD-and-SaaS-Plan.md), [owner repository](https://github.com/juniper-tc02e/ayin); exact intake commit + raw SHA-256 | [AGPL-3.0](https://github.com/juniper-tc02e/ayin/blob/main/LICENSE) | Purpose/identity-gated scans, live-tunable rate limits, retention/deletion windows, pricing/package entitlements and monitoring cadence; distinct OSINT safety product | 0 | **ACCEPTED-FOR-INTAKE** |
| T-04 | YAT, owned by `yat-hk` | Real firmware/engine/schema repository. PRD discloses agent-first/AI-written specification artifacts; this does not negate independent owner, real device target or implemented code. No release tag yet | [PRD](https://github.com/yat-hk/yat/blob/main/PRD.md), [owner repository](https://github.com/yat-hk/yat); exact intake commit + raw SHA-256 (no release tag existed during review) | [GPL-3.0](https://github.com/yat-hk/yat/blob/main/LICENSE) | Hourly/commute update windows, sleeping-device timing, schedule freshness and battery/cycle constraints; distinct e-ink device content. It must not also count in form/config | 0 | **ACCEPTED-FOR-INTAKE** |
| T-05 | OpenRAG, owned by the OpenAlgo project (`marketcalls`) | Implemented, actively developed self-hosted product with a working FastAPI backend, React frontend, deployment path and 270 visible commits. The owner expressly discloses that the Build Week implementation was created collaboratively with Codex; this is recorded as AI-assisted, not treated as external-human evidence | [PRD](https://github.com/marketcalls/openrag/blob/main/docs/prd.md), [owner repository](https://github.com/marketcalls/openrag); exact intake commit + raw SHA-256 | [AGPL-3.0](https://github.com/marketcalls/openrag/blob/main/LICENSE) | Per-org/per-user monthly allocations, configurable reset day, weighted debit, authoritative pre/post-use enforcement, threshold alerts, exhaustion blocks, top-ups and audited reconciliation; distinct enterprise-RAG quota content | 0 | **ACCEPTED-FOR-INTAKE** |
| T-H1 | Urlist PRD gist, owned by Burke Holland's GitHub account | A detailed requirements document exists, but no authoritative product repository/implementation and no copying license were established | [PRD gist](https://gist.github.com/burkeholland/da305953dcf4e3c1649fd4cad20ddd23); a gist revision could freeze bytes if authority/rights are later proved | No explicit license established | Anonymous/authenticated publish limits, rate-limit errors, retry timing and UI auto-dismiss windows are strong | 0 | **HOLD** — missing product authority/implementation and rights |
| T-R1 | Legacy Subify Web v2 PRD, owned by `onurkarakus` | Repository contains code, but the document itself says it is legacy, historical only, and not the application source of truth | [legacy PRD](https://github.com/onurkarakus/SubifyProject/blob/master/docs/Subify.Web.Uygulamasi.v2.PRD.md), [owner repository](https://github.com/onurkarakus/SubifyProject) | No explicit license established | Premium limits and RevenueCat entitlements fit, but an expressly superseded non-authoritative document cannot be the frozen product truth | 0 | **REJECT** |

Strict accepted count is **5**. T-05 and asynchronous candidate A-01 share an owner but are different products with visibly distinct requirements; final intake must still check path-independent digests and concentration bias. No PRD-equivalent standard or documentation page was promoted to reach the target.

### Routed historical-defect pool (not yet case-bound)

| Defect ID | Frozen risk | First-party record | Relevance |
|---|---|---|---|
| TIME-K8S-107205 | high | [Resource limits ignored against ResourceQuota](https://github.com/kubernetes/kubernetes/issues/107205) | valid entitlement is rejected as absent |
| TIME-K8S-97090 | high | [Extended-resource usage not reflected in ResourceQuota](https://github.com/kubernetes/kubernetes/issues/97090) | consumed quota remains zero |
| TIME-K8S-52093 | critical | [Concurrent map-write panic in resource quota controller](https://github.com/kubernetes/kubernetes/issues/52093) | concurrent quota processing crashes controller |
| TIME-K8S-120981 | critical | [Ephemeral-storage quota gap can exhaust cluster storage](https://github.com/kubernetes/kubernetes/issues/120981) | declared quota does not enforce a resource without per-pod limit |
| TIME-K8S-140890 | high | [WatchList retry prevents quota controller sync and leaves stale usage](https://github.com/kubernetes/kubernetes/issues/140890) | stale full-quota state rejects new work indefinitely |

Discovered traceable pool: **5**. Benchmark-admitted/case-bound defects: **0**.

## Remaining gate work

Public research has narrowed the candidate pool, but it has not repaired the release evidence gate. The minimum remaining work is:

1. fetch every accepted file at an exact commit/tag, store raw bytes offline, calculate source and path-independent SHA-256 values, and perform cross-report duplicate/collision adjudication;
2. create case-specific task scopes and bind only relevant historical defects to each case, with frozen IDs, risks and source references;
3. obtain two real independent external expert label sets and completed disagreement adjudication;
4. run the twelve required captures per admitted PRD with frozen provenance, then score offline.

Until those steps exist, the honest benchmark result remains `insufficient_evidence`.
