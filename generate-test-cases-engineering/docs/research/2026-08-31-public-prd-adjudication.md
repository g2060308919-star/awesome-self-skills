# Public PRD Corpus Machine Adjudication

**Date:** 2026-08-31  
**Decision scope:** public-source corpus admission research  
**Adjudicator class:** machine agent, not a human or external expert  
**Benchmark result after this review:** `insufficient_evidence`

## 1. Final ruling

The two machine reports contain 42 candidate records across the six frozen strata. Applying the previously frozen [pre-adjudication rubric](2026-08-31-public-prd-adjudication-rubric.md) without relaxing it produces:

| Frozen stratum | Reviewed | `ADMIT` | `HOLD` | `REJECT` | `DUPLICATE` | Protocol-valid historical defects |
|---|---:|---:|---:|---:|---:|---:|
| transaction/order/payment | 8 | 0 | 5 | 3 | 0 | 0 |
| identity/role/permission | 8 | 0 | 8 | 0 | 0 | 0 |
| workflow/approval/state | 8 | 0 | 7 | 1 | 0 | 0 |
| form/configuration/input validation | 5 | 0 | 5 | 0 | 0 | 0 |
| asynchronous integration/event | 6 | 0 | 5 | 1 | 0 | 0 |
| time-window/quota/entitlement | 7 | 0 | 6 | 1 | 0 | 0 |
| **Total** | **42** | **0** | **36** | **6** | **0** | **0** |

`HOLD` is the rubric's fail-closed equivalent of “pending”; it does not count toward a corpus minimum. There is no conditional `ADMIT`. In particular, all 23 rows that A or B called `accepted-for-intake` remain `HOLD`: that machine source-screen status is explicitly weaker than final admission.

The reviewed pool contains 28 claimed strict PRDs and 14 PRD-equivalent or excluded controls. The strict subset resolves to `ADMIT 0 / HOLD 26 / REJECT 2`; the equivalent/control subset resolves to `ADMIT 0 / HOLD 10 / REJECT 4`. Even if all 26 strict holds were later cured, the transaction stratum would still need three additional distinct strict candidates and identity would still need two; an extra item in another stratum cannot compensate.

This document is not an external-expert annotation or adjudication, does not populate any `expert_annotations` or expert identity, and cannot change `evidence_class`. Agreement among machine agents would not satisfy the two-expert rule. Moreover, A and B reviewed disjoint strata rather than independently reviewing every candidate, so their reports are not two complete parallel label sets even apart from being machine-authored.

## 2. Frozen inputs and method

The controlling sources were read completely before the reports: [handoff instructions](../../../../AGENTS.md), [capture/adjudication protocol](../../benchmark/v1/adjudication/protocol.md), [current manifest](../../benchmark/v1/manifest.json), [manifest schema](../../benchmark/manifest.schema.json), [release gates](../../benchmark/gates.mjs), [public evidence audit](2026-08-31-public-benchmark-evidence.md), and the [frozen rubric](2026-08-31-public-prd-adjudication-rubric.md).

The A/B inputs were then frozen without rewriting them:

| Input | SHA-256 | Receipt time (UTC) |
|---|---|---|
| [Machine expert A](2026-08-31-public-prd-expert-a.md) | `3dcbf5f9764d8a93e4664d310ac68bfe2be0c9b89f7fc3aae2dff502e8717cb3` | `2026-08-31T13:44:28Z` |
| [Machine expert B](2026-08-31-public-prd-expert-b.md) | `882c35126a46b80ef181d3e031adc44e590040ec49667f2b27d5e1e2d9d1541e` | `2026-08-31T13:44:28Z` |

Candidate identity was normalized with a report prefix because A's `A01` and B's `A-01` are unrelated artifacts. First-party cited artifacts control; report conclusions do not. Missing immutable bytes, rights, provenance, uniqueness, or governing-role evidence produces `HOLD`. An established fixture, portfolio/recruitment artifact, non-governing legacy document, API schema, or implementation-only artifact produces `REJECT`.

For every row below, `machine_adjudicator_non_expert=true` and `duplicate_of=null`. The latter means that no corpus-item duplicate is established; it does not mean global independence has been proved. Historical-defect references remain research leads only and are summarized in Section 6.

## 3. Transaction, identity, and workflow rulings (report A)

### 3.1 Transaction/order/payment

| Normalized ID | Artifact / first-party source | Class | A position | Final | Fixed-version, rights, uniqueness, and governing-role ruling | Unresolved items |
|---|---|---|---|---|---|---|
| EA-A01 | `clintecker/press` [Direct Ordering PRD/TRD](https://github.com/clintecker/press/blob/5848b6990d6632c0d543a861af590036e9dc8533/docs/DIRECT-ORDERING-PLAN.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit `5848…`, path, SHA-256 and same-revision MIT file; it is a real proposed feature with requirements-grade transaction behavior. | No retained corpus source package/task digest/corpus ID; no license scope-to-file record; uniqueness checked only against A's ten strict files, not the whole corpus. |
| EA-A02 | `profullstack/coinpayportal` [PRD](https://github.com/profullstack/coinpayportal/blob/13f160c0897168931e407eccd6411e88946d0f23/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit `13f1…`, path, SHA-256 and same-revision MIT file; transaction requirements and real-project binding are plausible. | Same missing intake/provenance, license-scope, and global uniqueness records as EA-A01. |
| EA-T-E1 | Medusa [checkout documentation](https://docs.medusajs.com/resources/storefront-development/checkout) | PRD-equivalent docs | pending | `HOLD` | First-party, testable product documentation, but no fixed artifact proves an owner-controlled governing product-requirements role. | Select and pin exact source; prove governing role, applicable documentation license, project/task provenance, digest and independence. |
| EA-T-E2 | [Solidus repository/guide set](https://github.com/solidusio/solidus) | PRD-equivalent implementation/docs | pending | `HOLD` | No single governing requirements artifact was selected. This is curable discovery incompleteness, not admission. | Exact artifact, immutable revision, rights scope, governing role, digest and full provenance. |
| EA-T-E3 | Spree [checkout documentation](https://spreecommerce.org/docs/developer/customization/checkout) | PRD-equivalent docs | pending | `HOLD` | Checkout semantics are testable, but the mutable page is not yet established as a fixed governing requirements specification. | Immutable source, documentation license scope, governing-role proof, digest and provenance. |
| EA-T-R1 | Stripe [OpenAPI repository](https://github.com/stripe/openapi) | API schema | rejected | `REJECT` | The owner describes it as OpenAPI specifications used for API coverage and SDK generation, not a governing product requirements artifact. | Disqualifying class is established; not curable by pinning. |
| EA-T-R2 | Checkout.com [engineering assessment](https://github.com/cko-recruitment) | recruitment exercise | rejected | `REJECT` | The owner explicitly calls it an engineering assessment and supplies a bank simulator/test double. | Excluded recruitment fixture. |
| EA-T-R3 | TodoMVC [application specification](https://github.com/tastejs/todomvc/blob/ff43b02e59dfa604386bb382034b2cd07c2bcd8a/app-spec.md) | example consistency spec | rejected | `REJECT` | The owner says identical example implementations follow the same spec for framework comparison; it is neither a transaction product nor a real-product PRD for this stratum. | Excluded example/teaching control. |

### 3.2 Identity/role/permission

| Normalized ID | Artifact / first-party source | Class | A position | Final | Fixed-version, rights, uniqueness, and governing-role ruling | Unresolved items |
|---|---|---|---|---|---|---|
| EA-A03 | `sakibtamim/Jasper` [Hosted Jasper PRD](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/docs/hosted-jasper/prd.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit `73d7…`, path, SHA-256 and MIT file; real-product binding and role/permission semantics are plausible. | No retained corpus package/task/corpus ID, license scope-to-file record, or global content-independence comparison. |
| EA-A04 | `absmach/atom` [PRD](https://github.com/absmach/atom/blob/c046ff2b3c2bf969277e2d5f7e5543f1d96daf27/product-docs/PRD.md) | strict PRD | pending | `HOLD` | Commit/path/SHA and real identity-service binding are recorded, but no applicable license was found at the frozen revision. | Written permission or revision-applicable license, plus intake provenance and global uniqueness. Public visibility is not permission. |
| EA-A05 | `navinkumaragilysys/oncall` [PRD](https://github.com/navinkumaragilysys/oncall/blob/d18b5fd21ed3838367f0602ce69b1afd39b6487d/PRD.md) | strict PRD | pending | `HOLD` | Commit/path/SHA and real-project role semantics are recorded, but no applicable license was found. | Written permission or applicable license, intake provenance and global uniqueness. |
| EA-I-E1 | Kubernetes [conditional-authorization KEP](https://github.com/kubernetes/enhancements/blob/master/keps/sig-auth/5681-conditional-authorization/README.md) | PRD-equivalent enhancement proposal | pending | `HOLD` | A formal owner proposal may qualify only if fixed evidence establishes that it governs product requirements under the frozen interpretation. | Exact commit/bytes/digest, license scope, governing-role determination, task/provenance and uniqueness. |
| EA-I-E2 | OpenFGA [type-restrictions RFC](https://github.com/openfga/rfcs/blob/main/20220831-add-type-restrictions-to-json-syntax.md) | PRD-equivalent RFC | pending | `HOLD` | Owner-controlled RFC with testable semantics; strict governing role and immutable intake are not established. | Exact revision/bytes/digest, applicable rights, governing-role decision and provenance. |
| EA-I-E3 | Keycloak [authorization-services documentation](https://www.keycloak.org/docs/latest/authorization_services/) | PRD-equivalent docs | pending | `HOLD` | `latest` is mutable and product documentation is not automatically a governing PRD. | Fixed source, rights scope, governing-role proof, digest, task/provenance and uniqueness. |
| EA-I-E4 | Grafana [RBAC documentation source](https://github.com/grafana/grafana/blob/main/docs/sources/administration/roles-and-permissions/access-control/manage-rbac-roles/index.md) | PRD-equivalent docs | pending | `HOLD` | Testable permission semantics, but mutable revision, documentation license scope and governing role remain open. | Exact revision/bytes/digest, rights scope, governing role and provenance. |
| EA-I-E5 | [Grafana OnCall repository](https://github.com/grafana/oncall) | PRD-equivalent implementation/docs | pending | `HOLD` | Archived/redirected repository and no normalized governing requirements artifact. | Exact first-party artifact, ownership/redirect chain, revision, rights, governing role, digest and provenance. |

### 3.3 Workflow/approval/state

| Normalized ID | Artifact / first-party source | Class | A position | Final | Fixed-version, rights, uniqueness, and governing-role ruling | Unresolved items |
|---|---|---|---|---|---|---|
| EA-A06 | `mohammadmaso/kherad` [PRD](https://github.com/mohammadmaso/kherad/blob/2a8d6992b87a33760688e1f956653c21a6292294/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit/path/SHA and Apache-2.0 file; real project and review/merge workflow are plausible. | Retained corpus package/task/corpus ID, license scope-to-file record and global uniqueness. |
| EA-A07 | `aa2246740/pi-company` [PRD](https://github.com/aa2246740/pi-company/blob/e4c27fdf626b28d3adf59d245a66cb8f3791b70e/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit/path/SHA and Apache-2.0 file; implemented workflow semantics are plausible. | Same full-intake, license-scope, and global-uniqueness gaps. |
| EA-A08 | `beettlle/pi-spine` [PRD](https://github.com/beettlle/pi-spine/blob/528f2fd128ac1878c700d9248f22f36500e27aa9/pi-spine-PRD.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit/path/SHA and MIT file; orchestration-state semantics are plausible. | Same full-intake, license-scope, and global-uniqueness gaps. |
| EA-A09 | `mikigraf/runmill` [PRD](https://github.com/mikigraf/runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/prd.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit/path/SHA and MIT file. The `/autoplan` marker does not itself disqualify a real independently owned project; AI assistance is neutral. | Same full-intake, license-scope, and global-uniqueness gaps. |
| EA-A10 | `deghosal-2026/ai-incident-commander` [PRD](https://github.com/deghosal-2026/ai-incident-commander/blob/ea0d3867a390cb94bfa51cf76054212ccef8f000/docs/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | A records commit/path/SHA and MIT file; AI as a product feature is not AI-authorship evidence and is not disqualifying. | Acquisition time is only approximate; full intake/task/corpus ID, license scope and global uniqueness remain missing. |
| EA-W-E1 | Tekton [API specification](https://github.com/tektoncd/pipeline/blob/main/docs/api-spec.md) | PRD-equivalent specification | pending | `HOLD` | Owner specification may qualify only if its governing functional-requirements role is proved and the mutable source is frozen. | Exact revision/bytes/digest, rights scope, governing-role decision and provenance. |
| EA-W-E2 | Argo Workflows [`workflow_types.go`](https://github.com/argoproj/argo-workflows/blob/main/pkg/apis/workflow/v1alpha1/workflow_types.go) | implementation source | pending | `REJECT` | Conflict resolved against A's optimistic pending status: the selected artifact is a Go implementation/type-definition file, not an owner-controlled governing product requirements artifact. Rubric §4 rejects implementation-only artifacts. | A different governing PRD/spec would be a new candidate, not a cure for this artifact. |
| EA-W-E3 | Apache Airflow [AIP directory](https://github.com/apache/airflow/tree/main/airflow-core/docs/aip) | PRD-equivalent proposal set | pending | `HOLD` | A directory is not one normalized corpus item; an exact governing AIP has not been selected. | Select one artifact and prove immutable revision, rights, governing role, content digest, provenance and independence. |

## 4. Form, asynchronous, and time-window rulings (report B)

All 15 B rows called `ACCEPTED-FOR-INTAKE` use mutable `main` or `master` source and license URLs and merely prescribe a future freeze method. None records the actual full commit, retained raw bytes, exact SHA-256, path-independent digest, acquisition time, task digest, corpus ID, license scope-to-file evidence, or full-corpus uniqueness result. They therefore cannot be `ADMIT` now.

### 4.1 Form/configuration/input validation

| Normalized ID | Artifact / first-party source | Class | B position | Final | Ruling and unresolved items |
|---|---|---|---|---|---|
| EB-F-01 | `m18h/kanea` [PRD](https://github.com/m18h/kanea/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Real-project and validation fit are plausible; freeze exact source/license revision, bytes, digests, acquisition, task/corpus provenance, license scope and global uniqueness. |
| EB-F-02 | `devaxl/VoiceType-AI` [PRD](https://github.com/devaxl/VoiceType-AI/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same missing immutable intake, rights-scope, provenance and independence proof. |
| EB-F-03 | `System-Error-Worldwide/the-loop` [PRD](https://github.com/System-Error-Worldwide/the-loop/blob/main/docs/specs/prd.md) | strict PRD | accepted-for-intake | `HOLD` | Same missing immutable intake, rights-scope, provenance and independence proof. |
| EB-F-04 | `deghosal-2026/agent-tooltrust` [PRD](https://github.com/deghosal-2026/agent-tooltrust/blob/main/docs/design/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Dominant form/config stratum is plausible but identity collision must be fixed once; same intake/provenance gaps. |
| EB-F-05 | `arthursantos67/cineprime-api` [PRD](https://github.com/arthursantos67/cineprime-api/blob/main/product-requirements-document.md) | strict PRD | accepted-for-intake | `HOLD` | Dominant form/config stratum must remain single-assigned; same intake/provenance gaps. |

### 4.2 Asynchronous integration/event

| Normalized ID | Artifact / first-party source | Class | B position | Final | Ruling and unresolved items |
|---|---|---|---|---|---|
| EB-A-01 | `marketcalls/openalgo` [Scalping Terminal PRD](https://github.com/marketcalls/openalgo/blob/main/docs/scalping/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Event-system fit is plausible; freeze exact source/license revision, bytes/digests, acquisition, task/corpus provenance, license scope and global uniqueness. |
| EB-A-02 | `sandraschi/ocr-mcp` [PRD](https://github.com/sandraschi/ocr-mcp/blob/master/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same mandatory gaps. |
| EB-A-03 | `sandraschi/mujoco-mcp` [PRD](https://github.com/sandraschi/mujoco-mcp/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same mandatory gaps. |
| EB-A-04 | `sandraschi/local-llm-mcp` [PRD](https://github.com/sandraschi/local-llm-mcp/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same mandatory gaps. |
| EB-A-05 | `sandraschi/arr-mcp` [PRD](https://github.com/sandraschi/arr-mcp/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same mandatory gaps. Same maintainer does not prove duplication, but no content digests exist to prove independence. |
| EB-A-R1 | `timsurrealedu/nolen` [PRD](https://github.com/timsurrealedu/nolen/blob/main/PRD.md) | portfolio/demo PRD | rejected | `REJECT` | The PRD expressly binds the product to educational, research, and portfolio purposes and a reproducible demo; the frozen request excludes portfolio artifacts. No AI inference is involved. |

### 4.3 Time-window/quota/entitlement

| Normalized ID | Artifact / first-party source | Class | B position | Final | Ruling and unresolved items |
|---|---|---|---|---|---|
| EB-T-01 | `nearform/copilot-status` [PRD](https://github.com/nearform/copilot-status/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Quota/time fit and real-project binding are plausible. Author `System` is recorded as unknown, not rejected. Freeze full immutable intake, rights scope, provenance and uniqueness. |
| EB-T-02 | `mangopudding/mcp-server-iru-api` [PRD](https://github.com/mangopudding/mcp-server-iru-api/blob/main/docs/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Same mandatory immutable-intake/provenance gaps. |
| EB-T-03 | `juniper-tc02e/ayin` [PRD + SaaS plan](https://github.com/juniper-tc02e/ayin/blob/main/docs/Ayin-PRD-and-SaaS-Plan.md) | strict PRD | accepted-for-intake | `HOLD` | A hackathon origin does not automatically make an implemented independent project a fixture. No rejection is justified, but immutable intake/provenance remains absent. |
| EB-T-04 | `yat-hk/yat` [PRD](https://github.com/yat-hk/yat/blob/main/PRD.md) | strict PRD | accepted-for-intake | `HOLD` | Disclosed agent-first/AI-written specification is not disqualifying; real device/project evidence controls. Exact commit, retained bytes/digests, fixed license scope, provenance and uniqueness are missing. |
| EB-T-05 | `marketcalls/openrag` [PRD](https://github.com/marketcalls/openrag/blob/main/docs/prd.md) | strict PRD | accepted-for-intake | `HOLD` | Disclosed Codex collaboration is not disqualifying and cannot be treated as human evidence. Same mandatory intake/provenance gaps. |
| EB-T-H1 | Burke Holland [Urlist PRD gist](https://gist.github.com/burkeholland/da305953dcf4e3c1649fd4cad20ddd23) | claimed strict PRD | hold | `HOLD` | Detailed requirements are not enough: authoritative real-product binding and copying/evaluation rights were not established. A gist revision could address only versioning, not those separate gaps. |
| EB-T-R1 | `onurkarakus/SubifyProject` [legacy v2 PRD](https://github.com/onurkarakus/SubifyProject/blob/master/docs/Subify.Web.Uygulamasi.v2.PRD.md) | superseded strict PRD | rejected | `REJECT` | The document itself says it is legacy, historical-only, and not the application source of truth; the owner points to a different current PRD. It therefore fails the governing-role criterion. |

## 5. Conflict resolutions

| Issue | A/B position | Frozen-rubric resolution |
|---|---|---|
| `accepted-for-intake` versus `ADMIT` | A: 8 accepted-for-intake; B: 15 accepted-for-intake. Both disclaim final admission. | All 23 become `HOLD`. A lacks final retained source/task/corpus/license-scope/global-uniqueness records; B additionally lacks actual immutable commits and digests. There is no conditional admission. |
| A's 13 `pending` rows and B's one `HOLD` | Generally treated as potentially curable. | Thirteen remain `HOLD`. EA-W-E2 alone becomes `REJECT` because the selected Argo artifact is implementation source rather than a governing requirements artifact. |
| Five report-level rejects | A rejects Stripe OpenAPI, Checkout.com assessment and TodoMVC example spec; B rejects Nolen portfolio PRD and superseded Subify PRD. | All five remain `REJECT` because first-party context establishes the disqualifying class. |
| AI-assisted authorship | A/B record unknown, product AI use, agent-first authorship, or Codex collaboration. | No candidate is rejected because of AI assistance. EB-T-04 and EB-T-05 remain `HOLD`, not `REJECT`; machine involvement also supplies no external-human evidence. |
| License claims | A pins license files for eight strict candidates but finds none for Atom/Oncall; B links mutable license files. | Atom/Oncall remain `HOLD` for absent rights. A's other eight still need an intake license scope-to-file record. Every B strict candidate remains `HOLD` until source and license are frozen together and scope is recorded. |
| Content uniqueness | A finds ten distinct exact hashes only within its strict set; B uses owner/product/visual difference and no content digest. | No `DUPLICATE` is proved, but no candidate passes full-corpus independence. Same owner does not itself make a duplicate; names and paths do not prove independence. All affected rows remain `HOLD`. |
| A/B independence | Reports cover different strata and are machine-authored. | They are useful research leads only. They are neither two independent complete reviews of every item nor the two external expert label sets required by the protocol. |

## 6. Historical-defect adjudication

The minimum is aggregated per stratum: at least five valid historical defects in each stratum. A candidate with `defect_count=0` is not rejected merely for that reason. However, a defect becomes countable only after it is frozen, proven to be an actual defect, assigned risk, checked for uniqueness, and defensibly mapped to an admitted item's product and requirements scope.

| Stratum | Raw first-party leads reported | Distinct within this stratum before cross-stratum resolution | Bound to an `ADMIT` item | Protocol-valid count | Minimum met? |
|---|---:|---:|---:|---:|---|
| transaction/order/payment | 6 | 6 | 0 | 0 | No |
| identity/role/permission | 6 | 6 | 0 | 0 | No |
| workflow/approval/state | 6 | 6 | 0 | 0 | No |
| form/configuration/input validation | 5 | 5 | 0 | 0 | No |
| asynchronous integration/event | 5 | 5 | 0 | 0 | No |
| time-window/quota/entitlement | 5 | 5 | 0 | 0 | No |

The apparent 33 rows contain 32 unique issue leads because [Temporal #10321](https://github.com/temporalio/temporal/issues/10321) appears once in A's workflow pool and again as `ASYNC-TEMP-10321` in B's asynchronous pool. It may be assigned at most once after a defensible stratum and admitted-item mapping; it cannot satisfy both minima.

A's transaction/identity/workflow issues map to pending equivalents or discovery controls, not to an admitted strict item. B's five-item pools are likewise drawn from Kubernetes, Temporal, or Argo rather than bound to the proposed PRDs. No issue has the required immutable evidence snapshot/digest, case mapping, and uniqueness record. Therefore every stratum's countable total remains zero. This is a mapping/provenance failure, not a per-PRD defect quota.

## 7. Corpus and release consequence

The public search has produced a useful intake queue, not a benchmark corpus. To convert a `HOLD` to `ADMIT`, the owner must supply or permit a complete record containing exact source bytes, immutable revision and path, acquisition time, source SHA-256 and path-independent digest, applicable fixed license/authorization with scope-to-file evidence, corpus item ID, task and task digest, governing-role evidence, real-project binding, single stratum, expert-label feasibility, and a full-corpus independence comparison.

Even after a valid 30-item corpus exists, the release state remains `insufficient_evidence` until the comparator/target versions are frozen, 360 genuine independent captures exist, two real independent external experts completely annotate every required object, all disagreements receive completed human adjudication with lineage, and the offline metrics pass every frozen gate. Nothing in this machine adjudication supplies or substitutes for those assets.

No benchmark, Skill, gate, manifest, schema, capture, or production code was modified by this adjudication.
