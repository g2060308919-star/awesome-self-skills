# Public PRD Research — Machine Test Expert A

**Date:** 2026-08-31  
**Scope:** frozen strata 1–3: transaction/order/payment; identity/role/permission; workflow/approval/state  
**Author class:** machine research agent; not a human or external expert  
**Status:** candidate research and source screening only

## 1. Result and non-claim

The bounded search found **24 first-party candidates**: 8 transaction, 8 identity, and 8 workflow. The candidate-level result is:

| Stratum | Examined | `accepted-for-intake` | `pending` | `rejected` | Gap to five accepted |
|---|---:|---:|---:|---:|---:|
| transaction/order/payment | 8 | 2 | 3 | 3 | 3 |
| identity/role/permission | 8 | 1 | 7 | 0 | 4 |
| workflow/approval/state | 8 | 5 | 3 | 0 | 0 |
| **Total** | **24** | **8** | **13** | **3** | **7** |

`accepted-for-intake` is deliberately narrower than a release claim and weaker than final corpus `ADMIT`. It means that this research found a real, independently owned, requirements-grade PRD; fixed its source to a full commit; calculated the exact-byte SHA-256; found an applicable open-source license at that revision; and found no duplicate among the ten strict PRDs checked. The final adjudicator must still create the frozen source package, task/provenance record, corpus ID, license-scope record, and full duplicate comparison before assigning `ADMIT` under the [frozen rubric](2026-08-31-public-prd-adjudication-rubric.md). Consequently, **strict final `ADMIT` remains 0 in every stratum at the time of this report**.

This report is not an expert annotation, external-expert adjudication, benchmark capture, benchmark result, legal opinion, or release approval. Agent judgements must not be written into `expert_annotations`, used as expert identities, or used to change `evidence_class` to `external-expert-corpus`.

The search therefore does **not** solve the publication gate by itself. It materially reduces the source-discovery gap, but the transaction and identity strata still lack five acceptable PRDs, and every stratum still lacks countable frozen historical-defect evidence mapped to admitted items.

## 2. Method and decision vocabulary

I applied the handoff `AGENTS.md`, `benchmark/v1/adjudication/protocol.md`, manifest/schema/gates, the existing public-evidence audit, and the independently frozen pre-adjudication rubric. Only first-party owner repositories, first-party product documentation, and first-party issue trackers were used as evidence. Search snippets were used only for discovery.

For each strict PRD I checked:

- official owner/repository and real planned, in-progress, or implemented project binding;
- governing PRD role and observable requirements/acceptance semantics;
- full immutable Git commit and exact source-relative path;
- exact-byte SHA-256, also used as the path-independent content digest for the single-file source;
- applicable repository license at the same fixed revision;
- source uniqueness within the screened strict-PRD set;
- one and only one frozen stratum assignment;
- whether AI-assisted authorship was actually disclosed, rather than inferred;
- whether a historical defect was directly traceable to that candidate.

Status mapping used in the candidate tables:

- `accepted-for-intake`: passes this machine source screen; not yet final `ADMIT`.
- `pending`: potentially useful, but a mandatory fact is missing or the artifact is PRD-equivalent rather than a strict PRD.
- `rejected`: established exclusion such as recruitment exercise, API schema, template, tutorial, or fixture.

AI-assisted writing is not an automatic rejection. Where the source does not disclose how the document was authored, the report says `unknown`; it does not infer AI authorship from style. A project using AI as a product feature is also not evidence that its PRD was AI-written.

## 3. Fixed strict-PRD evidence

The original bytes were retrieved from the immutable raw GitHub URL and hashed locally. Retrieval time for A01–A09 was `2026-08-31T13:28:28Z`; A10 was retrieved at approximately `2026-08-31T13:36Z`. All ten hashes are distinct.

| ID | Stratum | Owner / real-project status | Fixed source and revision | Exact-byte SHA-256 | License at same revision | AI-writing disclosure | Candidate status | `defect_count` |
|---|---|---|---|---|---|---|---|---:|
| A01 | transaction | `clintecker/press`; implemented book-production project, proposed direct-ordering v1.16 feature | [PRD/TRD at `5848b6990d6632c0d543a861af590036e9dc8533`](https://github.com/clintecker/press/blob/5848b6990d6632c0d543a861af590036e9dc8533/docs/DIRECT-ORDERING-PLAN.md) | `601219c4a4abcb883b5d487b7267c7c24e614506ef2c29dc893b975bf9489e1c` | [MIT](https://github.com/clintecker/press/blob/5848b6990d6632c0d543a861af590036e9dc8533/LICENSE) | unknown | accepted-for-intake | 0 |
| A02 | transaction | `profullstack/coinpayportal`; implemented payment gateway, proposed WooCommerce/WHMCS plugins | [PRD at `13f160c0897168931e407eccd6411e88946d0f23`](https://github.com/profullstack/coinpayportal/blob/13f160c0897168931e407eccd6411e88946d0f23/PRD.md) | `f27845a7705879333c1140ebac231ce339c71198c2f3eb77bf177c475b935273` | [MIT](https://github.com/profullstack/coinpayportal/blob/13f160c0897168931e407eccd6411e88946d0f23/LICENSE) | unknown | accepted-for-intake | 0 |
| A03 | identity | `sakibtamim/Jasper`; implemented Discord bot, proposed Hosted Jasper extension | [Hosted Jasper PRD at `73d7e8f6b54c4fedd04a26f98ba9711cf74bef54`](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/docs/hosted-jasper/prd.md) | `dd7e68e17acfb74f80fc9620d1a5d5ddc4682792c865d99e530e7a1ddf2cfeb6` | [MIT](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/LICENSE) | unknown | accepted-for-intake | 0 |
| A04 | identity | `absmach/atom`; implemented identity/authorization service | [PRD at `c046ff2b3c2bf969277e2d5f7e5543f1d96daf27`](https://github.com/absmach/atom/blob/c046ff2b3c2bf969277e2d5f7e5543f1d96daf27/product-docs/PRD.md) | `5d90f3bba84aefff1ebad0fd70281b869451e8ec68e970f88634d743034c441f` | **No license file returned for this revision; public visibility is not permission** | unknown | pending | 0 |
| A05 | identity | `navinkumaragilysys/oncall`; implemented multi-team on-call repository with a governing PRD | [PRD at `d18b5fd21ed3838367f0602ce69b1afd39b6487d`](https://github.com/navinkumaragilysys/oncall/blob/d18b5fd21ed3838367f0602ce69b1afd39b6487d/PRD.md) | `980960531f5a6512d0ee4d6d2f3f8bb2812ead2f9d8ad23d5e6a112e435022ef` | **No license file returned for this revision** | unknown | pending | 0 |
| A06 | workflow | `mohammadmaso/kherad`; implemented Git-backed wiki with merge-request review | [PRD at `2a8d6992b87a33760688e1f956653c21a6292294`](https://github.com/mohammadmaso/kherad/blob/2a8d6992b87a33760688e1f956653c21a6292294/PRD.md) | `69eeba1770678f2147ee2ea8c0576b8928ffce101b97686ff2e834e11d46d7cc` | [Apache-2.0](https://github.com/mohammadmaso/kherad/blob/2a8d6992b87a33760688e1f956653c21a6292294/LICENSE) | product uses AI agents; PRD authorship unknown | accepted-for-intake | 0 |
| A07 | workflow | `aa2246740/pi-company`; implemented/released local multi-agent project workflow | [PRD at `e4c27fdf626b28d3adf59d245a66cb8f3791b70e`](https://github.com/aa2246740/pi-company/blob/e4c27fdf626b28d3adf59d245a66cb8f3791b70e/PRD.md) | `0df819bb79a5eb74ee18931cd43f4f626c26d6698bd67d031520f08ce0553eba` | [Apache-2.0](https://github.com/aa2246740/pi-company/blob/e4c27fdf626b28d3adf59d245a66cb8f3791b70e/LICENSE) | product uses agents; PRD authorship unknown | accepted-for-intake | 0 |
| A08 | workflow | `beettlle/pi-spine`; implemented/released orchestration spine | [PRD at `528f2fd128ac1878c700d9248f22f36500e27aa9`](https://github.com/beettlle/pi-spine/blob/528f2fd128ac1878c700d9248f22f36500e27aa9/pi-spine-PRD.md) | `c12662f0e0692f4ca06b95c39c2768d3b3a8b6b9255c76521a2c129b1184ded6` | [MIT](https://github.com/beettlle/pi-spine/blob/528f2fd128ac1878c700d9248f22f36500e27aa9/LICENSE) | product uses agents; PRD authorship unknown | accepted-for-intake | 0 |
| A09 | workflow | `mikigraf/runmill`; implemented delivery-loop project with active issue tracker | [PRD at `4fab5115bba155f5dbb0f9afc10ad582663dac2c`](https://github.com/mikigraf/runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/prd.md) | `1bc05ce30cf9aa4c671d459672aa96a209bbdb0131175b7e18529c2b920ec7a0` | [MIT](https://github.com/mikigraf/runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/LICENSE) | source contains an `/autoplan` restore-point marker; degree of assisted authorship not established | accepted-for-intake | 0 |
| A10 | workflow | `deghosal-2026/ai-incident-commander`; implemented CLI with simulation and real-run modes, human approval gates, and CI | [PRD at `ea0d3867a390cb94bfa51cf76054212ccef8f000`](https://github.com/deghosal-2026/ai-incident-commander/blob/ea0d3867a390cb94bfa51cf76054212ccef8f000/docs/PRD.md) | `220de80aa4da423266dc4160f78687b9414d8135e430617fa1f11870bafc7d50` | [MIT](https://github.com/deghosal-2026/ai-incident-commander/blob/ea0d3867a390cb94bfa51cf76054212ccef8f000/LICENSE) | AI is a product feature; PRD authorship unknown | accepted-for-intake | 0 |

Why these fit:

- A01 and A02 contain normative order/payment states, hosted checkout, webhook, reconciliation, refund, failure, idempotency, and exactly-once constraints.
- A03–A05 contain named roles, permission matrices or authorization-policy semantics, denial behavior, and observable access-control outcomes.
- A06–A10 contain explicit lifecycle states, review/approval gates, transition rules, terminal outcomes, and failure/recovery behavior.

A04 and A05 are strong real PRDs, not rejected artifacts. Their only established blocker is absence of an applicable license/authorization at the fixed revision. They must remain `pending`; a machine cannot infer copying rights from public availability.

## 4. PRD-equivalent and excluded controls

These sources are useful discovery or defect-mapping controls, but they do not increase the strict PRD accepted count.

### 4.1 Transaction/order/payment

| ID | Candidate | First-party source / authority | Classification | Status and reason |
|---|---|---|---|---|
| T-E1 | Medusa checkout | [Official checkout documentation](https://docs.medusajs.com/resources/storefront-development/checkout), [official repository](https://github.com/medusajs/medusa) | PRD-equivalent product/developer documentation | pending: requirements-rich and tied to an implemented product, but not established as the governing PRD; mutable docs/license scope still need freezing |
| T-E2 | Solidus checkout/payment behavior | [Official project repository](https://github.com/solidusio/solidus) | PRD-equivalent implementation and guide set | pending: useful for defect mapping, but no single fixed governing requirements artifact has been selected |
| T-E3 | Spree checkout flow | [Official checkout documentation](https://spreecommerce.org/docs/developer/customization/checkout), [official repository](https://github.com/spree/spree) | PRD-equivalent product/developer documentation | pending: checkout-state semantics are testable, but governing PRD role and fixed documentation license scope are unresolved |
| T-R1 | Stripe OpenAPI | [Official OpenAPI repository](https://github.com/stripe/openapi) | API schema | rejected: an implementation contract/schema, not a product requirements document |
| T-R2 | Checkout.com payment gateway assessment | [Official recruitment organisation and requirements](https://github.com/cko-recruitment) | recruitment/coding exercise | rejected: explicitly an assessment with simulator/test doubles, not a real-product governing PRD |
| T-R3 | TodoMVC application specification | [Official application specification](https://github.com/tastejs/todomvc/blob/ff43b02e59dfa604386bb382034b2cd07c2bcd8a/app-spec.md), [official repository](https://github.com/tastejs/todomvc) | template/example application specification | rejected: the owner explicitly defines a consistency spec for example implementations; it is neither a transaction product nor a real-product PRD |

Together with A01–A02, this stratum has eight screened candidates: 2 accepted-for-intake, 3 pending, and 3 rejected.

### 4.2 Identity/role/permission

| ID | Candidate | First-party source / authority | Classification | Status and reason |
|---|---|---|---|---|
| I-E1 | Kubernetes conditional authorization | [Official KEP 5681](https://github.com/kubernetes/enhancements/blob/master/keps/sig-auth/5681-conditional-authorization/README.md) | owner-controlled enhancement proposal / PRD-equivalent | pending: formal and testable, but not a strict PRD; must be fixed to a commit and explicitly admitted as a functional-requirements equivalent |
| I-E2 | OpenFGA type restrictions | [Official RFC](https://github.com/openfga/rfcs/blob/main/20220831-add-type-restrictions-to-json-syntax.md) | owner-controlled RFC / PRD-equivalent | pending for the same governing-role interpretation and immutable-source packaging |
| I-E3 | Keycloak authorization services | [Official authorization-services documentation](https://www.keycloak.org/docs/latest/authorization_services/) | product specification/documentation equivalent | pending: strong permission semantics and defects, but mutable docs and non-PRD governing role must be resolved |
| I-E4 | Grafana RBAC | [Official RBAC documentation source](https://github.com/grafana/grafana/blob/main/docs/sources/administration/roles-and-permissions/access-control/manage-rbac-roles/index.md) | product documentation equivalent | pending: immutable revision, exact documentation license scope, and strict-PRD admission unresolved |
| I-E5 | Grafana OnCall permissions | [Official archived repository](https://github.com/grafana/oncall) | implemented-product documentation equivalent | pending: useful for defect mapping, but the archived/redirected source and governing requirements artifact require normalization |

Together with A03–A05, this stratum has eight screened candidates: 1 accepted-for-intake and 7 pending. No item is promoted merely to meet the quota.

### 4.3 Workflow/approval/state

| ID | Candidate | First-party source / authority | Classification | Status and reason |
|---|---|---|---|---|
| W-E1 | Tekton Pipelines | [Official API specification](https://github.com/tektoncd/pipeline/blob/main/docs/api-spec.md) | product/API specification equivalent | pending: state semantics are rich, but it is not a strict PRD and still needs a fixed revision/license-scope record |
| W-E2 | Argo Workflows | [Official workflow type definition](https://github.com/argoproj/argo-workflows/blob/main/pkg/apis/workflow/v1alpha1/workflow_types.go) | implementation/specification equivalent | pending: useful observable state model, not a governing PRD |
| W-E3 | Apache Airflow AIPs | [Official AIP directory](https://github.com/apache/airflow/tree/main/airflow-core/docs/aip) | enhancement/specification equivalent | pending: an exact governing AIP and immutable revision have not been selected |

Together with A06–A10, this stratum has eight screened candidates: 5 accepted-for-intake and 3 pending.

Temporal was checked as a defect-discovery control via its [official workflow-execution documentation](https://docs.temporal.io/workflow-execution) and [official repository](https://github.com/temporalio/temporal), but it is not counted as a ninth candidate in the strict totals because no single frozen governing requirements artifact was selected.

## 5. Historical-defect research leads

The protocol minimum is **five valid historical defects per stratum**, not one defect per PRD. Therefore a strict PRD with `defect_count=0` is not automatically rejected. However, a defect can count only after it is frozen, proven to describe an actual historical defect, mapped to an admitted item and its requirements scope, assigned a frozen risk, checked for uniqueness, and retained with an immutable snapshot/digest.

I verified the following **18 first-party issue records** as real defect leads. They are not hypothetical benchmark-authored test ideas.

### 5.1 Transaction leads — six

1. [Solidus #6326 — checkout stack overflow after adding a credit card](https://github.com/solidusio/solidus/issues/6326).
2. [solidus_stripe #313 — failed 3DS payment displayed as paid when confirmation is removed](https://github.com/solidusio/solidus_stripe/issues/313).
3. [solidus_stripe #311 — store credits leave an insufficient Stripe balance](https://github.com/solidusio/solidus_stripe/issues/311).
4. [solidus_affirm #42 — apostrophe in customer name breaks checkout](https://github.com/solidusio/solidus_affirm/issues/42).
5. [Medusa #8640 — Stripe checkout payment-session initiation failure](https://github.com/medusajs/medusa/issues/8640).
6. [Medusa #11816 — payment succeeds but order is not created when shipping options mismatch](https://github.com/medusajs/medusa/issues/11816).

These map plausibly to pending equivalents T-E1/T-E2, not to accepted A01/A02. Strict count now: `verified leads=6`, `frozen + uniquely mapped to admitted items=0`, `protocol-valid count=0`.

### 5.2 Identity leads — six

1. [Keycloak #41707 — wildcard/same-URI permission match causes `access_denied`](https://github.com/keycloak/keycloak/issues/41707).
2. [Keycloak #23585 — user roles fail in account console](https://github.com/keycloak/keycloak/issues/23585).
3. [Keycloak #51249 — deleting a required authorization role weakens role policies](https://github.com/keycloak/keycloak/issues/51249).
4. [Keycloak #51247 — scope permission lists only one of multiple configured resources](https://github.com/keycloak/keycloak/issues/51247).
5. [Grafana #54974 — anonymous RBAC migration reports missing `dashboards:read`](https://github.com/grafana/grafana/issues/54974).
6. [Grafana OnCall #5096 — permissions fail when `org_id != 1`](https://github.com/grafana-cold-storage/oncall/issues/5096).

These map plausibly to pending equivalents I-E3/I-E4/I-E5, not to accepted A03. Strict count now: `verified leads=6`, `frozen + uniquely mapped to admitted items=0`, `protocol-valid count=0`.

### 5.3 Workflow leads — six

1. [Argo #13299 — workflow remains Running after a resource-template failure](https://github.com/argoproj/argo-workflows/issues/13299).
2. [Argo #12103 — workflow remains Running after its only pod is Completed](https://github.com/argoproj/argo-workflows/issues/12103).
3. [Argo #16567 — semaphore removes the wrong pending-queue entry and misses notifications](https://github.com/argoproj/argo-workflows/issues/16567).
4. [Tekton #10136 — PipelineRun status message is wrong after a task timeout](https://github.com/tektoncd/pipeline/issues/10136).
5. [Airflow #67287 — scheduler/trigger race produces an incorrect queued state](https://github.com/apache/airflow/issues/67287).
6. [Temporal #10321 — SQL transaction race permanently stalls a workflow](https://github.com/temporalio/temporal/issues/10321).

The first four map plausibly to pending equivalents W-E1/W-E2; Airflow and Temporal remain discovery controls without admitted source items. They do not map to accepted A06–A10. Strict count now: `verified leads=6`, `frozen + uniquely mapped to admitted items=0`, `protocol-valid count=0`.

## 6. What remains blocked and how to resolve it

The evidence gap is now specific rather than generic:

1. **Transaction corpus gap:** find and fully freeze three more independently owned, licensed, real-product strict PRDs. Alternatively, obtain an explicit protocol/adjudicator ruling that particular owner-controlled functional specifications (for example Medusa, Solidus, or Spree) qualify; do not silently relabel them.
2. **Identity corpus gap:** find and fully freeze four more licensed strict PRDs. Atom and Oncall can become usable only through an applicable license or written authorization covering reproduction, evaluation, retention, and distribution of derived evidence.
3. **Source-package gap:** persist the exact accepted source bytes, canonical owner/URL, full commit, source-relative path, acquisition timestamp, exact SHA-256, path-independent digest, license evidence, task digest, and corpus ID in the corpus intake mechanism. The research report alone is not that package.
4. **Defect gap:** either admit the relevant PRD-equivalent artifacts through an explicit adjudication decision or find historical defects that genuinely affect the accepted strict PRDs. Freeze each issue/commit/release record and digest; record a defensible requirements mapping, risk, uniqueness decision, and source snapshot. Do not count the 18 links above yet.
5. **Human evidence gap:** recruit two real, distinct external experts, run independent complete annotations, preserve disagreements, and complete human adjudication. Machine A/B reports and a machine adjudicator cannot satisfy this step.
6. **Capture/release gap:** freeze all four system identities, produce 12 independent captures per admitted PRD, preserve raw outputs/extractions/labels with lineage, and run the offline gates without missing or non-finite denominators.

Until all six are done, the correct publication state is `insufficient_evidence`. The appropriate fix is to complete and preserve missing evidence, not weaken thresholds, fabricate labels, represent machine agents as external experts, or turn discovery leads into passing results.

## 7. Reproducibility notes

- Commit identities were obtained from the public GitHub commits API and recorded as 40-character full SHAs.
- Source files were retrieved from `raw.githubusercontent.com/<owner>/<repo>/<full-sha>/<path>` and hashed with SHA-256.
- The ten strict PRD hashes in Section 3 are all distinct. This checks exact source-byte duplication only within this report; the final corpus must compare them with every other admitted item and apply the rubric's subset/superset/translation rules.
- Repository license metadata and fixed-revision license files were checked separately. Atom and Oncall failed closed because no license file was present at the fixed revision.
- Official issues were checked through first-party repository issue records. No issue lead was attached to an unrelated PRD merely to satisfy the five-defect quota.
- Mutable `main`, `master`, `latest`, documentation, and issue URLs in the equivalent/defect sections are discovery references only until an intake process retains immutable source bytes and digests.
