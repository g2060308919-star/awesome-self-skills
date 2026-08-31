# Public PRD Intake — Final Machine-Pilot Freeze Queue

**Date:** 2026-08-31

**Scope:** Public-Source Machine Pilot Task 1, Step 3

**Machine status:** 30 `accepted-for-pilot-freeze` candidates

**Formal frozen-rubric status:** `ADMIT = 0`
**Release status:** `insufficient_evidence`

## 1. Boundary and provenance

`accepted-for-pilot-freeze` is a machine screening status. It means that the cited first-party repository contains a real-project strict PRD and a repository license at one exact 40-character commit, and that one frozen stratum is plausibly dominant. It is not formal corpus `ADMIT`, a legal opinion, an external-human expert decision, an expert annotation, a benchmark capture, or release evidence.

The queue is the deterministic union of three inputs, with every selected candidate appearing exactly once:

| Source record | Selected here | Contribution |
|---|---:|---|
| [Original machine expert A report](2026-08-31-public-prd-expert-a.md) | 8 | A01–A03 and A06–A10 |
| [Machine expert A supplement, including fix round 1](2026-08-31-public-prd-expert-a-supplement.md) | 7 | AS-T01–AS-T03 and AS-I01–AS-I04 |
| [Machine expert B freeze report](2026-08-31-public-prd-expert-b-freeze.md) | 15 | EB-F-01–05, EB-A-01–05, EB-T-02–06 |
| **Total** | **30** | six strata × five |

The [frozen rubric](2026-08-31-public-prd-adjudication-rubric.md) and earlier [machine adjudication](2026-08-31-public-prd-adjudication.md) still control formal admission. The original A and B reports were not edited. Historical intermediate statuses are superseded only for this pilot queue where an append-only supplement or freeze record explicitly closes the named screening gap.

## 2. Count closure

| Frozen stratum | Original A | A supplement | B freeze | Final pilot count |
|---|---:|---:|---:|---:|
| transaction/order/payment | 2 | 3 | 0 | **5** |
| identity/role/permission | 1 | 4 | 0 | **5** |
| workflow/approval/state | 5 | 0 | 0 | **5** |
| form/configuration/input validation | 0 | 0 | 5 | **5** |
| asynchronous integration/event | 0 | 0 | 5 | **5** |
| time-window/quota/entitlement | 0 | 0 | 5 | **5** |
| **Total** | **8** | **7** | **15** | **30** |

## 3. Final accepted-for-pilot-freeze queue

Every repository, commit, PRD and license link below is first-party. The commit is the identity; mutable branch names are not.

### 3.1 Transaction/order/payment — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-TR-01 | A01 | [`clintecker/press`](https://github.com/clintecker/press) | [`5848b6990d6632c0d543a861af590036e9dc8533`](https://github.com/clintecker/press/commit/5848b6990d6632c0d543a861af590036e9dc8533) | [`docs/DIRECT-ORDERING-PLAN.md`](https://github.com/clintecker/press/blob/5848b6990d6632c0d543a861af590036e9dc8533/docs/DIRECT-ORDERING-PLAN.md) | [`LICENSE`](https://github.com/clintecker/press/blob/5848b6990d6632c0d543a861af590036e9dc8533/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; direct-ordering, payment, fulfillment and idempotency requirements; formal `ADMIT` pending. |
| PF-TR-02 | A02 | [`profullstack/coinpayportal`](https://github.com/profullstack/coinpayportal) | [`13f160c0897168931e407eccd6411e88946d0f23`](https://github.com/profullstack/coinpayportal/commit/13f160c0897168931e407eccd6411e88946d0f23) | [`PRD.md`](https://github.com/profullstack/coinpayportal/blob/13f160c0897168931e407eccd6411e88946d0f23/PRD.md) | [`LICENSE`](https://github.com/profullstack/coinpayportal/blob/13f160c0897168931e407eccd6411e88946d0f23/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; implemented gateway plus checkout/plugin requirements; formal `ADMIT` pending. |
| PF-TR-03 | AS-T01 | [`socrates8300/k2payments`](https://github.com/socrates8300/k2payments) | [`48d352294a4c35c1e8624c29812cd2912d385d3f`](https://github.com/socrates8300/k2payments/commit/48d352294a4c35c1e8624c29812cd2912d385d3f) | [`prd.md`](https://github.com/socrates8300/k2payments/blob/48d352294a4c35c1e8624c29812cd2912d385d3f/prd.md) | [`LICENSE`](https://github.com/socrates8300/k2payments/blob/48d352294a4c35c1e8624c29812cd2912d385d3f/LICENSE) / `AGPL-3.0-only` | `accepted-for-pilot-freeze`; implemented ISO 20022 transaction orchestration; formal `ADMIT` pending. |
| PF-TR-04 | AS-T02 | [`chuhemiao/agentic-transaction-firewall`](https://github.com/chuhemiao/agentic-transaction-firewall) | [`b652229d87d4e5b8f732184c779fb54ed83dd2bf`](https://github.com/chuhemiao/agentic-transaction-firewall/commit/b652229d87d4e5b8f732184c779fb54ed83dd2bf) | [`docs/PRD.md`](https://github.com/chuhemiao/agentic-transaction-firewall/blob/b652229d87d4e5b8f732184c779fb54ed83dd2bf/docs/PRD.md) | [`LICENSE`](https://github.com/chuhemiao/agentic-transaction-firewall/blob/b652229d87d4e5b8f732184c779fb54ed83dd2bf/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; payment intents, transaction decisions and execution constraints; formal `ADMIT` pending. |
| PF-TR-05 | AS-T03 | [`cwvedvik/tripletex-mcp`](https://github.com/cwvedvik/tripletex-mcp) | [`3b88f1644511d7266ccd0d19bc62a8ecebd6d48c`](https://github.com/cwvedvik/tripletex-mcp/commit/3b88f1644511d7266ccd0d19bc62a8ecebd6d48c) | [`docs/PRD-Tripletex-MCP-Rebuild.md`](https://github.com/cwvedvik/tripletex-mcp/blob/3b88f1644511d7266ccd0d19bc62a8ecebd6d48c/docs/PRD-Tripletex-MCP-Rebuild.md) | [`LICENSE`](https://github.com/cwvedvik/tripletex-mcp/blob/3b88f1644511d7266ccd0d19bc62a8ecebd6d48c/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; order-to-invoice lifecycle and payment-term invariants; formal `ADMIT` pending. |

### 3.2 Identity/role/permission — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-ID-01 | A03 | [`sakibtamim/Jasper`](https://github.com/sakibtamim/Jasper) | [`73d7e8f6b54c4fedd04a26f98ba9711cf74bef54`](https://github.com/sakibtamim/Jasper/commit/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54) | [`docs/hosted-jasper/prd.md`](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/docs/hosted-jasper/prd.md) | [`LICENSE`](https://github.com/sakibtamim/Jasper/blob/73d7e8f6b54c4fedd04a26f98ba9711cf74bef54/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; hosted customer/staff roles, OIDC and MFA; formal `ADMIT` pending. |
| PF-ID-02 | AS-I01 | [`christag/moss`](https://github.com/christag/moss) | [`9c35e52f6525a34adec63c94063c58b08019096e`](https://github.com/christag/moss/commit/9c35e52f6525a34adec63c94063c58b08019096e) | [`planning/prd.md`](https://github.com/christag/moss/blob/9c35e52f6525a34adec63c94063c58b08019096e/planning/prd.md) | [`LICENSE`](https://github.com/christag/moss/blob/9c35e52f6525a34adec63c94063c58b08019096e/LICENSE) / `AGPL-3.0-only` | `accepted-for-pilot-freeze`; hierarchical RBAC, scoped assignment and denial behavior; formal `ADMIT` pending. |
| PF-ID-03 | AS-I02 | [`aiperceivable/apcore-mcp`](https://github.com/aiperceivable/apcore-mcp) | [`7ef64c6b7d9b5b57399b82aa6f10c629207120e4`](https://github.com/aiperceivable/apcore-mcp/commit/7ef64c6b7d9b5b57399b82aa6f10c629207120e4) | [`docs/prd-apcore-mcp.md`](https://github.com/aiperceivable/apcore-mcp/blob/7ef64c6b7d9b5b57399b82aa6f10c629207120e4/docs/prd-apcore-mcp.md) | [`LICENSE`](https://github.com/aiperceivable/apcore-mcp/blob/7ef64c6b7d9b5b57399b82aa6f10c629207120e4/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; JWT identity, claim mapping, ACL roles and 401 outcomes; formal `ADMIT` pending. |
| PF-ID-04 | AS-I03 | [`stone16/context-engine`](https://github.com/stone16/context-engine) | [`f180a976796a50e98ba43845409ddbc1bf3299a9`](https://github.com/stone16/context-engine/commit/f180a976796a50e98ba43845409ddbc1bf3299a9) | [`docs/agents/prd-contextengine-implementation.md`](https://github.com/stone16/context-engine/blob/f180a976796a50e98ba43845409ddbc1bf3299a9/docs/agents/prd-contextengine-implementation.md) | [`LICENSE`](https://github.com/stone16/context-engine/blob/f180a976796a50e98ba43845409ddbc1bf3299a9/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; supplement fix closes earlier license-scope HOLD; tenant-safe access is dominant; formal `ADMIT` pending. |
| PF-ID-05 | AS-I04 | [`proishan11/open-agent-policy`](https://github.com/proishan11/open-agent-policy) | [`e4866fde2ed9ebe1005410203faf6343819e31ff`](https://github.com/proishan11/open-agent-policy/commit/e4866fde2ed9ebe1005410203faf6343819e31ff) | [`open-agent-policy-prd.md`](https://github.com/proishan11/open-agent-policy/blob/e4866fde2ed9ebe1005410203faf6343819e31ff/open-agent-policy-prd.md) | [`LICENSE`](https://github.com/proishan11/open-agent-policy/blob/e4866fde2ed9ebe1005410203faf6343819e31ff/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; identity, sessions, grants, delegation and deny-by-default policy; formal `ADMIT` pending. |

### 3.3 Workflow/approval/state — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-WF-01 | A06 | [`mohammadmaso/kherad`](https://github.com/mohammadmaso/kherad) | [`2a8d6992b87a33760688e1f956653c21a6292294`](https://github.com/mohammadmaso/kherad/commit/2a8d6992b87a33760688e1f956653c21a6292294) | [`PRD.md`](https://github.com/mohammadmaso/kherad/blob/2a8d6992b87a33760688e1f956653c21a6292294/PRD.md) | [`LICENSE`](https://github.com/mohammadmaso/kherad/blob/2a8d6992b87a33760688e1f956653c21a6292294/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; submit/review/approve/merge workflow; formal `ADMIT` pending. |
| PF-WF-02 | A07 | [`aa2246740/pi-company`](https://github.com/aa2246740/pi-company) | [`e4c27fdf626b28d3adf59d245a66cb8f3791b70e`](https://github.com/aa2246740/pi-company/commit/e4c27fdf626b28d3adf59d245a66cb8f3791b70e) | [`PRD.md`](https://github.com/aa2246740/pi-company/blob/e4c27fdf626b28d3adf59d245a66cb8f3791b70e/PRD.md) | [`LICENSE`](https://github.com/aa2246740/pi-company/blob/e4c27fdf626b28d3adf59d245a66cb8f3791b70e/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; event-sourced review/test/acceptance/merge gates; formal `ADMIT` pending. |
| PF-WF-03 | A08 | [`beettlle/pi-spine`](https://github.com/beettlle/pi-spine) | [`528f2fd128ac1878c700d9248f22f36500e27aa9`](https://github.com/beettlle/pi-spine/commit/528f2fd128ac1878c700d9248f22f36500e27aa9) | [`pi-spine-PRD.md`](https://github.com/beettlle/pi-spine/blob/528f2fd128ac1878c700d9248f22f36500e27aa9/pi-spine-PRD.md) | [`LICENSE`](https://github.com/beettlle/pi-spine/blob/528f2fd128ac1878c700d9248f22f36500e27aa9/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; orchestration journal, state machine and human gates; formal `ADMIT` pending. |
| PF-WF-04 | A09 | [`mikigraf/runmill`](https://github.com/mikigraf/runmill) | [`4fab5115bba155f5dbb0f9afc10ad582663dac2c`](https://github.com/mikigraf/runmill/commit/4fab5115bba155f5dbb0f9afc10ad582663dac2c) | [`prd.md`](https://github.com/mikigraf/runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/prd.md) | [`LICENSE`](https://github.com/mikigraf/runmill/blob/4fab5115bba155f5dbb0f9afc10ad582663dac2c/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; review/approval/merge state machine; `/autoplan` marker is disclosed, not disqualifying; formal `ADMIT` pending. |
| PF-WF-05 | A10 | [`deghosal-2026/ai-incident-commander`](https://github.com/deghosal-2026/ai-incident-commander) | [`ea0d3867a390cb94bfa51cf76054212ccef8f000`](https://github.com/deghosal-2026/ai-incident-commander/commit/ea0d3867a390cb94bfa51cf76054212ccef8f000) | [`docs/PRD.md`](https://github.com/deghosal-2026/ai-incident-commander/blob/ea0d3867a390cb94bfa51cf76054212ccef8f000/docs/PRD.md) | [`LICENSE`](https://github.com/deghosal-2026/ai-incident-commander/blob/ea0d3867a390cb94bfa51cf76054212ccef8f000/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; human approval gates and incident-state transitions; AI product feature is not human evidence; formal `ADMIT` pending. |

### 3.4 Form/configuration/input validation — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-FM-01 | EB-F-01 | [`m18h/kanea`](https://github.com/m18h/kanea) | [`c5407e089e9d44098871cb00f883fcf5f7132fa2`](https://github.com/m18h/kanea/commit/c5407e089e9d44098871cb00f883fcf5f7132fa2) | [`PRD.md`](https://github.com/m18h/kanea/blob/c5407e089e9d44098871cb00f883fcf5f7132fa2/PRD.md) | [`LICENSE`](https://github.com/m18h/kanea/blob/c5407e089e9d44098871cb00f883fcf5f7132fa2/LICENSE) / `Apache-2.0` | `accepted-for-pilot-freeze`; schema checks, invalid architecture refusal and diagnostics; formal `ADMIT` pending. |
| PF-FM-02 | EB-F-02 | [`devaxl/VoiceType-AI`](https://github.com/devaxl/VoiceType-AI) | [`26334e5143cddc28bfa6351751df36b67efdac4f`](https://github.com/devaxl/VoiceType-AI/commit/26334e5143cddc28bfa6351751df36b67efdac4f) | [`PRD.md`](https://github.com/devaxl/VoiceType-AI/blob/26334e5143cddc28bfa6351751df36b67efdac4f/PRD.md) | [`LICENSE`](https://github.com/devaxl/VoiceType-AI/blob/26334e5143cddc28bfa6351751df36b67efdac4f/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; provider settings, collisions, migrations and malformed responses; formal `ADMIT` pending. |
| PF-FM-03 | EB-F-03 | [`System-Error-Worldwide/the-loop`](https://github.com/System-Error-Worldwide/the-loop) | [`e53bda761fc0f2467e5f686b0e1d9e2b773ab870`](https://github.com/System-Error-Worldwide/the-loop/commit/e53bda761fc0f2467e5f686b0e1d9e2b773ab870) | [`docs/specs/prd.md`](https://github.com/System-Error-Worldwide/the-loop/blob/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/docs/specs/prd.md) | [`LICENSE`](https://github.com/System-Error-Worldwide/the-loop/blob/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; setup/capability/config validation and fail-closed collisions; formal `ADMIT` pending. |
| PF-FM-04 | EB-F-04 | [`deghosal-2026/agent-tooltrust`](https://github.com/deghosal-2026/agent-tooltrust) | [`e4a8522df2613b1ad94373a4e5b40e930654e452`](https://github.com/deghosal-2026/agent-tooltrust/commit/e4a8522df2613b1ad94373a4e5b40e930654e452) | [`docs/design/PRD.md`](https://github.com/deghosal-2026/agent-tooltrust/blob/e4a8522df2613b1ad94373a4e5b40e930654e452/docs/design/PRD.md) | [`LICENSE`](https://github.com/deghosal-2026/agent-tooltrust/blob/e4a8522df2613b1ad94373a4e5b40e930654e452/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; JSON/YAML policy validation; single-assigned here, not identity; formal `ADMIT` pending. |
| PF-FM-05 | EB-F-05 | [`arthursantos67/cineprime-api`](https://github.com/arthursantos67/cineprime-api) | [`e66b7ec1485ecbb2970043b459db32c1bd85f436`](https://github.com/arthursantos67/cineprime-api/commit/e66b7ec1485ecbb2970043b459db32c1bd85f436) | [`product-requirements-document.md`](https://github.com/arthursantos67/cineprime-api/blob/e66b7ec1485ecbb2970043b459db32c1bd85f436/product-requirements-document.md) | [`LICENSE`](https://github.com/arthursantos67/cineprime-api/blob/e66b7ec1485ecbb2970043b459db32c1bd85f436/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; form constraints and standardized field errors; single-assigned here; formal `ADMIT` pending. |

### 3.5 Asynchronous integration/event — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-AS-01 | EB-A-01 | [`marketcalls/openalgo`](https://github.com/marketcalls/openalgo) | [`01910584c4c7e89583ebdaaf8a3ce3a006155e68`](https://github.com/marketcalls/openalgo/commit/01910584c4c7e89583ebdaaf8a3ce3a006155e68) | [`docs/scalping/PRD.md`](https://github.com/marketcalls/openalgo/blob/01910584c4c7e89583ebdaaf8a3ce3a006155e68/docs/scalping/PRD.md) | [`License.md`](https://github.com/marketcalls/openalgo/blob/01910584c4c7e89583ebdaaf8a3ce3a006155e68/License.md) / `AGPL-3.0-only` | `accepted-for-pilot-freeze`; event buses, triggers, reconnect and failure behavior; formal `ADMIT` pending. |
| PF-AS-02 | EB-A-02 | [`sandraschi/ocr-mcp`](https://github.com/sandraschi/ocr-mcp) | [`f5c662299fc13925daa5760a3ee17cb9cc34eff5`](https://github.com/sandraschi/ocr-mcp/commit/f5c662299fc13925daa5760a3ee17cb9cc34eff5) | [`PRD.md`](https://github.com/sandraschi/ocr-mcp/blob/f5c662299fc13925daa5760a3ee17cb9cc34eff5/PRD.md) | [`LICENSE`](https://github.com/sandraschi/ocr-mcp/blob/f5c662299fc13925daa5760a3ee17cb9cc34eff5/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; scan watcher, batch pipeline and terminal states; formal `ADMIT` pending. |
| PF-AS-03 | EB-A-03 | [`sandraschi/mujoco-mcp`](https://github.com/sandraschi/mujoco-mcp) | [`778c332f990434f5a1009bb4d11620dae5c75791`](https://github.com/sandraschi/mujoco-mcp/commit/778c332f990434f5a1009bb4d11620dae5c75791) | [`PRD.md`](https://github.com/sandraschi/mujoco-mcp/blob/778c332f990434f5a1009bb4d11620dae5c75791/PRD.md) | [`LICENSE`](https://github.com/sandraschi/mujoco-mcp/blob/778c332f990434f5a1009bb4d11620dae5c75791/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; queued concurrent/sequential simulation jobs; formal `ADMIT` pending. |
| PF-AS-04 | EB-A-04 | [`sandraschi/local-llm-mcp`](https://github.com/sandraschi/local-llm-mcp) | [`c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0`](https://github.com/sandraschi/local-llm-mcp/commit/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0) | [`PRD.md`](https://github.com/sandraschi/local-llm-mcp/blob/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/PRD.md) | [`LICENSE`](https://github.com/sandraschi/local-llm-mcp/blob/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; async providers, health, circuit breaking and failover; formal `ADMIT` pending. |
| PF-AS-05 | EB-A-05 | [`sandraschi/arr-mcp`](https://github.com/sandraschi/arr-mcp) | [`01bb2f1a7f8a100fca5dd09ca4ef115781652016`](https://github.com/sandraschi/arr-mcp/commit/01bb2f1a7f8a100fca5dd09ca4ef115781652016) | [`PRD.md`](https://github.com/sandraschi/arr-mcp/blob/01bb2f1a7f8a100fca5dd09ca4ef115781652016/PRD.md) | [`LICENSE`](https://github.com/sandraschi/arr-mcp/blob/01bb2f1a7f8a100fca5dd09ca4ef115781652016/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; queued cross-service automation and partial failures; formal `ADMIT` pending. |

### 3.6 Time-window/quota/entitlement — 5

| Pilot ID | Origin | Owner/repository and binding evidence | Immutable commit | PRD path | Same-commit license path / SPDX | Machine screening note |
|---|---|---|---|---|---|---|
| PF-TM-01 | EB-T-02 | [`mangopudding/mcp-server-iru-api`](https://github.com/mangopudding/mcp-server-iru-api) | [`6743958ad8fa3329035a663d60b931cf0419058e`](https://github.com/mangopudding/mcp-server-iru-api/commit/6743958ad8fa3329035a663d60b931cf0419058e) | [`docs/PRD.md`](https://github.com/mangopudding/mcp-server-iru-api/blob/6743958ad8fa3329035a663d60b931cf0419058e/docs/PRD.md) | [`LICENSE`](https://github.com/mangopudding/mcp-server-iru-api/blob/6743958ad8fa3329035a663d60b931cf0419058e/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; hourly request limits, TTLs and retry/backoff; formal `ADMIT` pending. |
| PF-TM-02 | EB-T-03 | [`juniper-tc02e/ayin`](https://github.com/juniper-tc02e/ayin) | [`773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8`](https://github.com/juniper-tc02e/ayin/commit/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8) | [`docs/Ayin-PRD-and-SaaS-Plan.md`](https://github.com/juniper-tc02e/ayin/blob/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/docs/Ayin-PRD-and-SaaS-Plan.md) | [`LICENSE`](https://github.com/juniper-tc02e/ayin/blob/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/LICENSE) / `AGPL-3.0-only` | `accepted-for-pilot-freeze`; rate limits, retention windows and entitlements; hackathon origin disclosed; formal `ADMIT` pending. |
| PF-TM-03 | EB-T-04 | [`yat-hk/yat`](https://github.com/yat-hk/yat) | [`0c206d5ea88b5fe256904d960875d9d0af5c6309`](https://github.com/yat-hk/yat/commit/0c206d5ea88b5fe256904d960875d9d0af5c6309) | [`PRD.md`](https://github.com/yat-hk/yat/blob/0c206d5ea88b5fe256904d960875d9d0af5c6309/PRD.md) | [`LICENSE`](https://github.com/yat-hk/yat/blob/0c206d5ea88b5fe256904d960875d9d0af5c6309/LICENSE) / `GPL-3.0-only` | `accepted-for-pilot-freeze`; update/sleep/freshness windows; agent-first/AI-written disclosure is not disqualifying; formal `ADMIT` pending. |
| PF-TM-04 | EB-T-05 | [`marketcalls/openrag`](https://github.com/marketcalls/openrag) | [`76303a9a88cbb779093a682b2be6c645eef7ed8b`](https://github.com/marketcalls/openrag/commit/76303a9a88cbb779093a682b2be6c645eef7ed8b) | [`docs/prd.md`](https://github.com/marketcalls/openrag/blob/76303a9a88cbb779093a682b2be6c645eef7ed8b/docs/prd.md) | [`LICENSE`](https://github.com/marketcalls/openrag/blob/76303a9a88cbb779093a682b2be6c645eef7ed8b/LICENSE) / `AGPL-3.0-only` | `accepted-for-pilot-freeze`; monthly allocations, reset day, debit and exhaustion; Codex collaboration disclosed; formal `ADMIT` pending. |
| PF-TM-05 | EB-T-06 | [`girish-kor/AutoTube`](https://github.com/girish-kor/AutoTube) | [`d88a214be289c0f44df4c37aa6f2d2b04e613bac`](https://github.com/girish-kor/AutoTube/commit/d88a214be289c0f44df4c37aa6f2d2b04e613bac) | [`docs/PRD.md`](https://github.com/girish-kor/AutoTube/blob/d88a214be289c0f44df4c37aa6f2d2b04e613bac/docs/PRD.md) | [`LICENSE`](https://github.com/girish-kor/AutoTube/blob/d88a214be289c0f44df4c37aa6f2d2b04e613bac/LICENSE) / `MIT` | `accepted-for-pilot-freeze`; schedules, daily volume and API-quota queueing; replacement for Nearform; formal `ADMIT` pending. |

## 4. Non-counting HOLD and REJECT queue

The following inputs are not among the 30 rows above. Each appears once. `HOLD` is curable but does not count; `REJECT` has an established exclusion. The historical `stone16/context-engine` HOLD is intentionally absent here because supplement fix round 1 superseded it with accepted PF-ID-04.

### 4.1 From original A/adjudication

| Candidate | Status | Reason |
|---|---|---|
| `absmach/atom` | `HOLD` | Strict identity PRD pinned, but no same-revision applicable license. |
| `navinkumaragilysys/oncall` | `HOLD` | Strict identity PRD pinned, but no same-revision applicable license. |
| Medusa checkout docs | `HOLD` | PRD-equivalent; governing strict-PRD role, immutable source and documentation rights unresolved. |
| Solidus checkout/guide set | `HOLD` | No single fixed governing requirements artifact. |
| Spree checkout docs | `HOLD` | Mutable product docs; governing role and license scope unresolved. |
| Kubernetes conditional-authorization KEP | `HOLD` | Owner proposal, but strict governing-role admission and fixed package unresolved. |
| OpenFGA type-restrictions RFC | `HOLD` | Owner RFC, but strict governing-role admission and fixed package unresolved. |
| Keycloak authorization-services docs | `HOLD` | Mutable docs and non-PRD governing role unresolved. |
| Grafana RBAC docs | `HOLD` | Immutable revision, documentation rights and governing role unresolved. |
| Grafana OnCall permissions | `HOLD` | Archived/redirected source and exact governing artifact unresolved. |
| Tekton API specification | `HOLD` | PRD-equivalent; governing product-requirements role unresolved. |
| Apache Airflow AIP directory | `HOLD` | No single normalized governing AIP selected. |
| Stripe OpenAPI | `REJECT` | API/SDK schema, not a governing product PRD. |
| Checkout.com gateway assessment | `REJECT` | Recruitment exercise with simulator/test doubles. |
| TodoMVC application specification | `REJECT` | Teaching/comparison example specification, not a transaction-product PRD. |
| Argo `workflow_types.go` | `REJECT` | Implementation/type-definition source, not governing product requirements. |

### 4.2 From A supplement

| Candidate | Status | Reason |
|---|---|---|
| `saeidamini/SupplyBoost` | `HOLD` | Fixed PRD and implementation exist, but no repository-wide license. |
| `retrostoremanager/fn-mystore` | `HOLD` | Fixed PRD exists, but no applicable license file. |
| `adamstosho/KaspaConcert` | `HOLD` | Fixed revision has a license and implementation but no PRD. |
| `Automattic/workspace` | `HOLD` | License blocker closed, but identity/site permission is not an unambiguous dominant product layer. |
| `szystems/burosoft` | `HOLD` | Implemented strict PRD but no repository-wide license. |
| `jolleekin/mini-slack` | `HOLD` | Identity-focused strict PRD but no applicable license. |
| `DashankaNadeeshanDeSilva/kontor-mcp` | `REJECT` | The PRD expressly identifies portfolio showcase as a primary purpose. |

### 4.3 From original B and B freeze

| Candidate | Status | Reason |
|---|---|---|
| `nearform/copilot-status` | `HOLD` | Fixed PRD exists, but the complete same-revision tree has no license/copying file; replaced by AutoTube only for pilot count closure. |
| Burke Holland Urlist gist | `HOLD` | Product authority/implementation and copying rights unresolved. |
| `timsurrealedu/nolen` | `REJECT` | PRD expressly describes educational/research/portfolio and demo purposes. |
| `onurkarakus/SubifyProject` legacy v2 PRD | `REJECT` | Document expressly says it is historical-only and not the application source of truth. |

## 5. Bias and concentration disclosures

- `sandraschi` owns four of the five asynchronous candidates and 4/30 of the full queue. Their PRD byte hashes differ and their products are distinct, so same ownership is not duplicate proof; it is nevertheless a severe concentration and correlated-authorship risk.
- `marketcalls` owns two candidates (`openalgo` and `openrag`) across different strata. `deghosal-2026` owns two (`ai-incident-commander` and `agent-tooltrust`). These are distinct products but still reduce maintainer diversity.
- The queue is GitHub-public, open-license, English/Markdown-heavy and agent/MCP-heavy. It is not representative of private enterprise PRDs, non-GitHub product teams, other languages, or mature regulated-product portfolios.
- Several artifacts disclose or strongly associate with AI/agent workflows. YAT is agent-first/AI-written; OpenRAG discloses Codex collaboration; Runmill contains an `/autoplan` marker; several workflow/form/identity products are themselves agent systems. AI assistance is not an automatic rejection, but it is a corpus-style and correlated-generation bias and never becomes human-expert evidence.
- Ayin has a hackathon origin. It is retained because the cited revision contains a real implemented project rather than a template or fictional fixture, but maturity and longevity bias must be recorded.
- Root-license screening includes permissive and copyleft licenses. The pilot treats a same-revision root license with no contrary notice as facially applicable; an authorized rights reviewer must still confirm retention and distribution of source packages, annotations and captures.
- The reports checked distinct exact PRD byte hashes within their own subsets. A complete cross-30 path-independent digest, subset/superset/translation comparison and domain-concentration review are still outstanding.

## 6. Formal admission and release boundary

All 30 rows remain machine-screened source candidates. **Formal `ADMIT` remains 0**, because the combined queue is not yet the rubric's retained corpus package with complete acquisition metadata, stable corpus and task identifiers, task digests, path-independent content digests, global independence adjudication, authorized license-scope review, and expert-label feasibility records.

Machine agents are not the two independent external human experts required by the protocol. This document and its source reports must not populate `expert_annotations`, external-expert identity fields, expert agreement, human adjudication, capture outputs, or hidden labels. AI-assisted product history does not change that boundary.

No historical defects are admitted or case-bound here; no captures were run. The later workflow still requires five valid defects per stratum, three critical expert Test Points and two clarification-required PRDs per stratum, 360 provenance-closed captures, two complete independent human-expert label sets, completed disagreement adjudication, and passing offline gates. Until those assets exist, the release result remains `insufficient_evidence`.
