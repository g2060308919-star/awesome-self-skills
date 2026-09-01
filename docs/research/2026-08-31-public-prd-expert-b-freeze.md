# Public PRD expert-B candidate freeze — machine pilot

**Acquired:** `2026-08-31T15:08:41Z`

**Agent class:** machine research agent; not a human or external expert
**Scope:** the 15 `ACCEPTED-FOR-INTAKE` rows from the original expert-B report, plus one bounded replacement for an item that failed same-revision licensing

## Boundary and method

This report performs Task 1, Step 2 of the public-source machine pilot. It does not modify or reinterpret the hash-frozen expert-B report or the final machine adjudication. `accepted-for-pilot-freeze` below means only that the strict PRD, project binding, immutable commit, and a repository license applicable on its face were fixed together. It is not the frozen rubric's formal `ADMIT`, an external-expert decision, a benchmark capture, or release evidence.

For each original candidate, the machine agent:

1. resolved the official GitHub repository's default-branch `HEAD` through GitHub's first-party commits API;
2. required an exact 40-character commit;
3. downloaded the PRD and repository license from `raw.githubusercontent.com` at that same commit and calculated exact-byte SHA-256 values;
4. linked the immutable project tree/README as real-project binding evidence and retained the original report's single stratum only when the fixed PRD still supported it;
5. failed closed when the license file was absent, then searched only the affected final stratum for one replacement.

A root license is treated as sufficient for this pilot freeze only when it is present in the same revision, the PRD is inside that repository, and no per-file contrary notice was found. This is an evidence screen, not a legal opinion. Formal `ADMIT` still requires the frozen rubric's retained source package, acquisition/task/corpus provenance, license-scope review, path-independent digest, global independence comparison, and expert-label feasibility record.

## Count summary

| Frozen stratum | Original B candidates checked | Original `accepted-for-pilot-freeze` | HOLD | Replacement accepted | Final freeze queue |
|---|---:|---:|---:|---:|---:|
| form/configuration/input validation | 5 | 5 | 0 | 0 | **5** |
| asynchronous integration/event | 5 | 5 | 0 | 0 | **5** |
| time-window/quota/entitlement | 5 | 4 | 1 | 1 | **5** |
| **Total** | **15** | **14** | **1** | **1** | **15** |

No original accepted-for-intake row was rejected. `nearform/copilot-status` is `HOLD` because the frozen revision contains the PRD but no license or copying file. `girish-kor/AutoTube` is the only added candidate and restores the time/quota queue to five.

## Form / configuration / input validation

### EB-F-01 — Kanea — `accepted-for-pilot-freeze`

- Owner/repository: `m18h/kanea`; immutable [tree](https://github.com/m18h/kanea/tree/c5407e089e9d44098871cb00f883fcf5f7132fa2) and [README](https://github.com/m18h/kanea/blob/c5407e089e9d44098871cb00f883fcf5f7132fa2/README.md).
- Commit: [`c5407e089e9d44098871cb00f883fcf5f7132fa2`](https://github.com/m18h/kanea/commit/c5407e089e9d44098871cb00f883fcf5f7132fa2).
- PRD: `PRD.md`; immutable [blob](https://github.com/m18h/kanea/blob/c5407e089e9d44098871cb00f883fcf5f7132fa2/PRD.md), [raw](https://raw.githubusercontent.com/m18h/kanea/c5407e089e9d44098871cb00f883fcf5f7132fa2/PRD.md); SHA-256 `cc31e99fdaa41c6a37b281393736d18e3e4e008982446364e75f7194da2d0f0e`.
- License: Apache-2.0 at root `LICENSE`; immutable [blob](https://github.com/m18h/kanea/blob/c5407e089e9d44098871cb00f883fcf5f7132fa2/LICENSE), [raw](https://raw.githubusercontent.com/m18h/kanea/c5407e089e9d44098871cb00f883fcf5f7132fa2/LICENSE); SHA-256 `8787ce0a1184eaed0b190d84bb34a3f89d63bc298fea53805c5054cb326d6e79`.
- Binding and stratum: the same revision contains the implemented Go/container-orchestration project. The governing PRD specifies job/service inputs, plan-time schema checks, refused invalid architectures, and field/file diagnostics, making validation the dominant lane.

### EB-F-02 — VoiceType AI — `accepted-for-pilot-freeze`

- Owner/repository: `devaxl/VoiceType-AI`; immutable [tree](https://github.com/devaxl/VoiceType-AI/tree/26334e5143cddc28bfa6351751df36b67efdac4f) and [README](https://github.com/devaxl/VoiceType-AI/blob/26334e5143cddc28bfa6351751df36b67efdac4f/README.md).
- Commit: [`26334e5143cddc28bfa6351751df36b67efdac4f`](https://github.com/devaxl/VoiceType-AI/commit/26334e5143cddc28bfa6351751df36b67efdac4f).
- PRD: `PRD.md`; immutable [blob](https://github.com/devaxl/VoiceType-AI/blob/26334e5143cddc28bfa6351751df36b67efdac4f/PRD.md), [raw](https://raw.githubusercontent.com/devaxl/VoiceType-AI/26334e5143cddc28bfa6351751df36b67efdac4f/PRD.md); SHA-256 `e45053befd4247520e329805c27f41dcb0a1f2e24209c570b2b282d5145a2145`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/devaxl/VoiceType-AI/blob/26334e5143cddc28bfa6351751df36b67efdac4f/LICENSE), [raw](https://raw.githubusercontent.com/devaxl/VoiceType-AI/26334e5143cddc28bfa6351751df36b67efdac4f/LICENSE); SHA-256 `7ead18f6607bd81d06662843a66adacbfbb78670405272abe698528f86b92b7e`.
- Binding and stratum: the same revision contains the Tauri/Rust desktop dictation product. Its finalized PRD governs provider keys, profiles, hotkey collisions, mutually constrained settings, migrations, malformed responses, and recovery behavior.

### EB-F-03 — SYSTEM ERROR'S THE LOOP — `accepted-for-pilot-freeze`

- Owner/repository: `System-Error-Worldwide/the-loop`; immutable [tree](https://github.com/System-Error-Worldwide/the-loop/tree/e53bda761fc0f2467e5f686b0e1d9e2b773ab870) and [README](https://github.com/System-Error-Worldwide/the-loop/blob/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/README.md).
- Commit: [`e53bda761fc0f2467e5f686b0e1d9e2b773ab870`](https://github.com/System-Error-Worldwide/the-loop/commit/e53bda761fc0f2467e5f686b0e1d9e2b773ab870).
- PRD: `docs/specs/prd.md`; immutable [blob](https://github.com/System-Error-Worldwide/the-loop/blob/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/docs/specs/prd.md), [raw](https://raw.githubusercontent.com/System-Error-Worldwide/the-loop/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/docs/specs/prd.md); SHA-256 `962d66fb0df76f1e452b8c5f96794c3b1b279f5bfad5d4ec12d6b40b9c5cf09c`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/System-Error-Worldwide/the-loop/blob/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/LICENSE), [raw](https://raw.githubusercontent.com/System-Error-Worldwide/the-loop/e53bda761fc0f2467e5f686b0e1d9e2b773ab870/LICENSE); SHA-256 `f008c1469cc26b68c21d912a0083a2fc1161e11ccbc0ec9c35a39de8e3c16787`.
- Binding and stratum: the same revision contains the shipped multi-harness skill pack, schemas, runtime and conformance tests. The PRD makes setup/capability/configuration validation and fail-closed namespace/collision checks observable product requirements. Synthetic examples inside the repository do not make the independently maintained product PRD a synthetic fixture.

### EB-F-04 — Agent ToolTrust — `accepted-for-pilot-freeze`

- Owner/repository: `deghosal-2026/agent-tooltrust`; immutable [tree](https://github.com/deghosal-2026/agent-tooltrust/tree/e4a8522df2613b1ad94373a4e5b40e930654e452) and [README](https://github.com/deghosal-2026/agent-tooltrust/blob/e4a8522df2613b1ad94373a4e5b40e930654e452/README.md).
- Commit: [`e4a8522df2613b1ad94373a4e5b40e930654e452`](https://github.com/deghosal-2026/agent-tooltrust/commit/e4a8522df2613b1ad94373a4e5b40e930654e452).
- PRD: `docs/design/PRD.md`; immutable [blob](https://github.com/deghosal-2026/agent-tooltrust/blob/e4a8522df2613b1ad94373a4e5b40e930654e452/docs/design/PRD.md), [raw](https://raw.githubusercontent.com/deghosal-2026/agent-tooltrust/e4a8522df2613b1ad94373a4e5b40e930654e452/docs/design/PRD.md); SHA-256 `3b478712a62db882e15dab6ba97f9dc43b6e10d90c901b7a5e5b3c3b2023d956`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/deghosal-2026/agent-tooltrust/blob/e4a8522df2613b1ad94373a4e5b40e930654e452/LICENSE), [raw](https://raw.githubusercontent.com/deghosal-2026/agent-tooltrust/e4a8522df2613b1ad94373a4e5b40e930654e452/LICENSE); SHA-256 `f6feb22ed5d9fadd7db789aafddd3b32b3c849791fa45983270482f6204bdf25`.
- Binding and stratum: the same revision contains the published Python policy engine, CI and tests. The selected lane is declarative JSON/YAML policy validation: missing sections, unknown keys, enum/range/path rules, migrations, and diagnostic locations. It must not also count in identity/permission.

### EB-F-05 — CinePrime — `accepted-for-pilot-freeze`

- Owner/repository: `arthursantos67/cineprime-api`; immutable [tree](https://github.com/arthursantos67/cineprime-api/tree/e66b7ec1485ecbb2970043b459db32c1bd85f436) and [README](https://github.com/arthursantos67/cineprime-api/blob/e66b7ec1485ecbb2970043b459db32c1bd85f436/README.md).
- Commit: [`e66b7ec1485ecbb2970043b459db32c1bd85f436`](https://github.com/arthursantos67/cineprime-api/commit/e66b7ec1485ecbb2970043b459db32c1bd85f436).
- PRD: `product-requirements-document.md`; immutable [blob](https://github.com/arthursantos67/cineprime-api/blob/e66b7ec1485ecbb2970043b459db32c1bd85f436/product-requirements-document.md), [raw](https://raw.githubusercontent.com/arthursantos67/cineprime-api/e66b7ec1485ecbb2970043b459db32c1bd85f436/product-requirements-document.md); SHA-256 `38a32678c6d84644790c781003c780b2c8d8f19e3f69a564c34909c85f3577a2`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/arthursantos67/cineprime-api/blob/e66b7ec1485ecbb2970043b459db32c1bd85f436/LICENSE), [raw](https://raw.githubusercontent.com/arthursantos67/cineprime-api/e66b7ec1485ecbb2970043b459db32c1bd85f436/LICENSE); SHA-256 `6a7276de4d2e7a6cf5a239444c122be86ce7bcc699f94f8910eeb58ae645c1ba`.
- Binding and stratum: the same revision contains the Django/DRF backend and Next.js cinema-reservation frontend. Registration, checkout and admin inputs plus standardized invalid-body and field-error rules support the validation lane. It must not also count in transaction or time strata.

## Asynchronous integration / event

### EB-A-01 — OpenAlgo Scalping Terminal — `accepted-for-pilot-freeze`

- Owner/repository: `marketcalls/openalgo`; immutable [tree](https://github.com/marketcalls/openalgo/tree/01910584c4c7e89583ebdaaf8a3ce3a006155e68) and [README](https://github.com/marketcalls/openalgo/blob/01910584c4c7e89583ebdaaf8a3ce3a006155e68/README.md).
- Commit: [`01910584c4c7e89583ebdaaf8a3ce3a006155e68`](https://github.com/marketcalls/openalgo/commit/01910584c4c7e89583ebdaaf8a3ce3a006155e68).
- PRD: `docs/scalping/PRD.md`; immutable [blob](https://github.com/marketcalls/openalgo/blob/01910584c4c7e89583ebdaaf8a3ce3a006155e68/docs/scalping/PRD.md), [raw](https://raw.githubusercontent.com/marketcalls/openalgo/01910584c4c7e89583ebdaaf8a3ce3a006155e68/docs/scalping/PRD.md); SHA-256 `751f80cd01e3f2e382f7f124a8dca18b0bd3619ad10e7b1f52b84d1fb1264a43`.
- License: AGPL-3.0 at root `License.md`; immutable [blob](https://github.com/marketcalls/openalgo/blob/01910584c4c7e89583ebdaaf8a3ce3a006155e68/License.md), [raw](https://raw.githubusercontent.com/marketcalls/openalgo/01910584c4c7e89583ebdaaf8a3ce3a006155e68/License.md); SHA-256 `76a97c878c9c7a8321bb395c2b44d3fe2f8d81314d219b20138ed0e2dddd5182`.
- Binding and stratum: the same revision contains the live algorithmic-trading platform. The PRD governs WebSocket, ZeroMQ and Socket.IO event paths, price/book/risk triggers, reconnects and failure behavior.

### EB-A-02 — OCR-MCP — `accepted-for-pilot-freeze`

- Owner/repository: `sandraschi/ocr-mcp`; immutable [tree](https://github.com/sandraschi/ocr-mcp/tree/f5c662299fc13925daa5760a3ee17cb9cc34eff5) and [README](https://github.com/sandraschi/ocr-mcp/blob/f5c662299fc13925daa5760a3ee17cb9cc34eff5/README.md).
- Commit: [`f5c662299fc13925daa5760a3ee17cb9cc34eff5`](https://github.com/sandraschi/ocr-mcp/commit/f5c662299fc13925daa5760a3ee17cb9cc34eff5).
- PRD: `PRD.md`; immutable [blob](https://github.com/sandraschi/ocr-mcp/blob/f5c662299fc13925daa5760a3ee17cb9cc34eff5/PRD.md), [raw](https://raw.githubusercontent.com/sandraschi/ocr-mcp/f5c662299fc13925daa5760a3ee17cb9cc34eff5/PRD.md); SHA-256 `e2154d225db6e639b4530e96998f1433564a96a671efcc8f578cc80e5a1772ff`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/sandraschi/ocr-mcp/blob/f5c662299fc13925daa5760a3ee17cb9cc34eff5/LICENSE), [raw](https://raw.githubusercontent.com/sandraschi/ocr-mcp/f5c662299fc13925daa5760a3ee17cb9cc34eff5/LICENSE); SHA-256 `57bd85d017f3eaea7a2de0b78323f1bfa92b05ae53c73d07ba8dc622c50009ca`.
- Binding and stratum: the same revision contains the FastMCP OCR application. Auto-scan watchers, batch processing, multi-backend pipelines, and queued/completed/failed outcomes are observable asynchronous behavior.

### EB-A-03 — MuJoCo-MCP — `accepted-for-pilot-freeze`

- Owner/repository: `sandraschi/mujoco-mcp`; immutable [tree](https://github.com/sandraschi/mujoco-mcp/tree/778c332f990434f5a1009bb4d11620dae5c75791) and [README](https://github.com/sandraschi/mujoco-mcp/blob/778c332f990434f5a1009bb4d11620dae5c75791/README.md).
- Commit: [`778c332f990434f5a1009bb4d11620dae5c75791`](https://github.com/sandraschi/mujoco-mcp/commit/778c332f990434f5a1009bb4d11620dae5c75791).
- PRD: `PRD.md`; immutable [blob](https://github.com/sandraschi/mujoco-mcp/blob/778c332f990434f5a1009bb4d11620dae5c75791/PRD.md), [raw](https://raw.githubusercontent.com/sandraschi/mujoco-mcp/778c332f990434f5a1009bb4d11620dae5c75791/PRD.md); SHA-256 `de17d20419bfef9e2e3b0c0430c3013c4582fd76c5fdc96424919bea96db86eb`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/sandraschi/mujoco-mcp/blob/778c332f990434f5a1009bb4d11620dae5c75791/LICENSE), [raw](https://raw.githubusercontent.com/sandraschi/mujoco-mcp/778c332f990434f5a1009bb4d11620dae5c75791/LICENSE); SHA-256 `408dff2e3167a75e92d211f7f7f5c96f314ba08adc4fbed701a9543deff8c216`.
- Binding and stratum: the same revision contains the physics-simulation MCP server, dashboard and installer. Its PRD defines queueing, concurrent/sequential jobs, per-job state transitions and collision avoidance.

### EB-A-04 — Local LLM MCP — `accepted-for-pilot-freeze`

- Owner/repository: `sandraschi/local-llm-mcp`; immutable [tree](https://github.com/sandraschi/local-llm-mcp/tree/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0) and [README](https://github.com/sandraschi/local-llm-mcp/blob/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/README.md).
- Commit: [`c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0`](https://github.com/sandraschi/local-llm-mcp/commit/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0).
- PRD: `PRD.md`; immutable [blob](https://github.com/sandraschi/local-llm-mcp/blob/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/PRD.md), [raw](https://raw.githubusercontent.com/sandraschi/local-llm-mcp/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/PRD.md); SHA-256 `ea4b2ef517f241e1e72fe81746fe585d99e4b1e888242e391ca0538306d91e7e`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/sandraschi/local-llm-mcp/blob/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/LICENSE), [raw](https://raw.githubusercontent.com/sandraschi/local-llm-mcp/c57c1bfd8fa6af0a7c43fb58d668e60f90ccb1a0/LICENSE); SHA-256 `3a984a578f2d70cbfa7a9fbb8fef13ea7c9cca43d3d20f1994c27dcdb1af74fb`.
- Binding and stratum: the same revision contains the production-oriented FastMCP/FastAPI provider gateway and dashboard. Provider integration, asynchronous inference/loading, health/circuit-breaker behavior and failover dominate.

### EB-A-05 — ARR-MCP — `accepted-for-pilot-freeze`

- Owner/repository: `sandraschi/arr-mcp`; immutable [tree](https://github.com/sandraschi/arr-mcp/tree/01bb2f1a7f8a100fca5dd09ca4ef115781652016) and [README](https://github.com/sandraschi/arr-mcp/blob/01bb2f1a7f8a100fca5dd09ca4ef115781652016/README.md).
- Commit: [`01bb2f1a7f8a100fca5dd09ca4ef115781652016`](https://github.com/sandraschi/arr-mcp/commit/01bb2f1a7f8a100fca5dd09ca4ef115781652016).
- PRD: `PRD.md`; immutable [blob](https://github.com/sandraschi/arr-mcp/blob/01bb2f1a7f8a100fca5dd09ca4ef115781652016/PRD.md), [raw](https://raw.githubusercontent.com/sandraschi/arr-mcp/01bb2f1a7f8a100fca5dd09ca4ef115781652016/PRD.md); SHA-256 `b46161bbd6e18f2afd15531fa523c85cdbb7d378c160f3d654902f1ca5d01d04`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/sandraschi/arr-mcp/blob/01bb2f1a7f8a100fca5dd09ca4ef115781652016/LICENSE), [raw](https://raw.githubusercontent.com/sandraschi/arr-mcp/01bb2f1a7f8a100fca5dd09ca4ef115781652016/LICENSE); SHA-256 `408dff2e3167a75e92d211f7f7f5c96f314ba08adc4fbed701a9543deff8c216`.
- Binding and stratum: the same revision contains a unified MCP server for seven media-automation services. Queued downloads/imports, eventual status, cross-service orchestration and partial integration failures form the asynchronous lane.

Concentration disclosure: EB-A-02 through EB-A-05 have the same maintainer. Their exact PRD byte hashes differ and their products/domains are distinct, so this is not evidence of duplication; it remains a corpus-composition and path-independent-content review concern.

## Time-window / quota / entitlement

### EB-T-01 — Copilot Status — `HOLD`

- Owner/repository: `nearform/copilot-status`; immutable [tree](https://github.com/nearform/copilot-status/tree/6429ce6aa60161180865cebc90071b0193ff26b4) and [README](https://github.com/nearform/copilot-status/blob/6429ce6aa60161180865cebc90071b0193ff26b4/README.md).
- Commit: [`6429ce6aa60161180865cebc90071b0193ff26b4`](https://github.com/nearform/copilot-status/commit/6429ce6aa60161180865cebc90071b0193ff26b4).
- PRD: `PRD.md`; immutable [blob](https://github.com/nearform/copilot-status/blob/6429ce6aa60161180865cebc90071b0193ff26b4/PRD.md), [raw](https://raw.githubusercontent.com/nearform/copilot-status/6429ce6aa60161180865cebc90071b0193ff26b4/PRD.md); SHA-256 `aca046ab1a77182138762957651259dacaf65639da9647163fa7bd7d3dc9a28b`.
- License failure: `LICENSE` at the same commit returns 404, and the complete fixed tree contains no path matching `LICENSE`, `COPYING`, or a variant. Public visibility and a repository owner do not supply copying/evaluation rights.
- Binding and stratum: the React Native product and quota-monitor semantics are real and fit the stratum, but immutable licensing is a mandatory fail-closed requirement. Curable only by written authorization or a later revision with an applicable license; it does not count here.

### EB-T-02 — MCP Server for Iru API — `accepted-for-pilot-freeze`

- Owner/repository: `mangopudding/mcp-server-iru-api`; immutable [tree](https://github.com/mangopudding/mcp-server-iru-api/tree/6743958ad8fa3329035a663d60b931cf0419058e) and [README](https://github.com/mangopudding/mcp-server-iru-api/blob/6743958ad8fa3329035a663d60b931cf0419058e/README.md).
- Commit: [`6743958ad8fa3329035a663d60b931cf0419058e`](https://github.com/mangopudding/mcp-server-iru-api/commit/6743958ad8fa3329035a663d60b931cf0419058e).
- PRD: `docs/PRD.md`; immutable [blob](https://github.com/mangopudding/mcp-server-iru-api/blob/6743958ad8fa3329035a663d60b931cf0419058e/docs/PRD.md), [raw](https://raw.githubusercontent.com/mangopudding/mcp-server-iru-api/6743958ad8fa3329035a663d60b931cf0419058e/docs/PRD.md); SHA-256 `0fa8477db88aa8dee614456d132a9c811d8771da876f586ea2a5074bb665eebc`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/mangopudding/mcp-server-iru-api/blob/6743958ad8fa3329035a663d60b931cf0419058e/LICENSE), [raw](https://raw.githubusercontent.com/mangopudding/mcp-server-iru-api/6743958ad8fa3329035a663d60b931cf0419058e/LICENSE); SHA-256 `4847b39a59a0b59db4f878b7236c77502e79120dccfd34c859b31a40295cc224`.
- Binding and stratum: the same revision contains the implemented device-management API server. The PRD exposes a 10,000-request/hour customer limit, TTL caches, categorized limit errors, pagination and retry/backoff boundaries.

### EB-T-03 — Ayin — `accepted-for-pilot-freeze`

- Owner/repository: `juniper-tc02e/ayin`; immutable [tree](https://github.com/juniper-tc02e/ayin/tree/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8) and [README](https://github.com/juniper-tc02e/ayin/blob/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/README.md).
- Commit: [`773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8`](https://github.com/juniper-tc02e/ayin/commit/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8).
- PRD: `docs/Ayin-PRD-and-SaaS-Plan.md`; immutable [blob](https://github.com/juniper-tc02e/ayin/blob/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/docs/Ayin-PRD-and-SaaS-Plan.md), [raw](https://raw.githubusercontent.com/juniper-tc02e/ayin/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/docs/Ayin-PRD-and-SaaS-Plan.md); SHA-256 `7c8e48cf87ce773d0414d4037e1d5689a15b1909d33b9459c460f48929b83af9`.
- License: AGPL-3.0 at root `LICENSE`; immutable [blob](https://github.com/juniper-tc02e/ayin/blob/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/LICENSE), [raw](https://raw.githubusercontent.com/juniper-tc02e/ayin/773fdd11e6cdc1c61234440ccdbdcd0188d3bcd8/LICENSE); SHA-256 `8486a10c4393cee1c25392769ddd3b2d6c242d6ec7928e1414efff7dfb2f07ef`.
- Binding and stratum: the same revision contains the consent-forward OSINT self-scan product. Despite hackathon origin, it is bound to a real independent implementation rather than a template or portfolio fixture. Rate limits, retention/deletion windows and package entitlements support this lane.

### EB-T-04 — YAT — `accepted-for-pilot-freeze`

- Owner/repository: `yat-hk/yat`; immutable [tree](https://github.com/yat-hk/yat/tree/0c206d5ea88b5fe256904d960875d9d0af5c6309) and [README](https://github.com/yat-hk/yat/blob/0c206d5ea88b5fe256904d960875d9d0af5c6309/README.md).
- Commit: [`0c206d5ea88b5fe256904d960875d9d0af5c6309`](https://github.com/yat-hk/yat/commit/0c206d5ea88b5fe256904d960875d9d0af5c6309).
- PRD: `PRD.md`; immutable [blob](https://github.com/yat-hk/yat/blob/0c206d5ea88b5fe256904d960875d9d0af5c6309/PRD.md), [raw](https://raw.githubusercontent.com/yat-hk/yat/0c206d5ea88b5fe256904d960875d9d0af5c6309/PRD.md); SHA-256 `386037c6f365660555426fe96e004c8badee7577aad9c88ad1f58bc4e690fa02`.
- License: GPL-3.0 at root `LICENSE`; immutable [blob](https://github.com/yat-hk/yat/blob/0c206d5ea88b5fe256904d960875d9d0af5c6309/LICENSE), [raw](https://raw.githubusercontent.com/yat-hk/yat/0c206d5ea88b5fe256904d960875d9d0af5c6309/LICENSE); SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.
- Binding and stratum: the same revision contains real e-ink firmware/engine/schema work for a Hong Kong day display. Hourly/commute update windows, sleeping-device behavior, freshness and battery-cycle constraints dominate. Agent-first/AI-written specification disclosure is recorded but is neither human evidence nor a rejection reason.

### EB-T-05 — OpenRAG — `accepted-for-pilot-freeze`

- Owner/repository: `marketcalls/openrag`; immutable [tree](https://github.com/marketcalls/openrag/tree/76303a9a88cbb779093a682b2be6c645eef7ed8b) and [README](https://github.com/marketcalls/openrag/blob/76303a9a88cbb779093a682b2be6c645eef7ed8b/README.md).
- Commit: [`76303a9a88cbb779093a682b2be6c645eef7ed8b`](https://github.com/marketcalls/openrag/commit/76303a9a88cbb779093a682b2be6c645eef7ed8b).
- PRD: `docs/prd.md`; immutable [blob](https://github.com/marketcalls/openrag/blob/76303a9a88cbb779093a682b2be6c645eef7ed8b/docs/prd.md), [raw](https://raw.githubusercontent.com/marketcalls/openrag/76303a9a88cbb779093a682b2be6c645eef7ed8b/docs/prd.md); SHA-256 `a289d8b127242d802a0cd4cb991da69bb85729ceec46967179cd36a32ac8b47c`.
- License: AGPL-3.0 at root `LICENSE`; immutable [blob](https://github.com/marketcalls/openrag/blob/76303a9a88cbb779093a682b2be6c645eef7ed8b/LICENSE), [raw](https://raw.githubusercontent.com/marketcalls/openrag/76303a9a88cbb779093a682b2be6c645eef7ed8b/LICENSE); SHA-256 `4df3c306dddaaf4baffdff5ca820cc679ac8cd6dc263c6a74517783e42fa7a3b`.
- Binding and stratum: the same revision contains the working FastAPI backend, React frontend, deployment path and tests. Monthly org/user allocations, configurable reset day, weighted debit, pre/post-use enforcement, threshold alerts, exhaustion blocks and top-ups are requirements-grade quota behavior. The owner discloses Codex collaboration; it remains machine-assisted project history, not external-human evidence.

### EB-T-06 — AutoTube — replacement — `accepted-for-pilot-freeze`

- Owner/repository: `girish-kor/AutoTube`; immutable [tree](https://github.com/girish-kor/AutoTube/tree/d88a214be289c0f44df4c37aa6f2d2b04e613bac) and [README](https://github.com/girish-kor/AutoTube/blob/d88a214be289c0f44df4c37aa6f2d2b04e613bac/README.md).
- Commit: [`d88a214be289c0f44df4c37aa6f2d2b04e613bac`](https://github.com/girish-kor/AutoTube/commit/d88a214be289c0f44df4c37aa6f2d2b04e613bac).
- PRD: `docs/PRD.md`; immutable [blob](https://github.com/girish-kor/AutoTube/blob/d88a214be289c0f44df4c37aa6f2d2b04e613bac/docs/PRD.md), [raw](https://raw.githubusercontent.com/girish-kor/AutoTube/d88a214be289c0f44df4c37aa6f2d2b04e613bac/docs/PRD.md); SHA-256 `2ef8dfee5e4b712f882afc37394853bbbc375896087143365799556c068100d3`.
- License: MIT at root `LICENSE`; immutable [blob](https://github.com/girish-kor/AutoTube/blob/d88a214be289c0f44df4c37aa6f2d2b04e613bac/LICENSE), [raw](https://raw.githubusercontent.com/girish-kor/AutoTube/d88a214be289c0f44df4c37aa6f2d2b04e613bac/LICENSE); SHA-256 `e8e8f198d6b831e3e3442ab0066382dd06e9c791a1f5167518cf8394cf74aef5`.
- Binding and stratum: the same revision contains a Docker/n8n/PostgreSQL/media-worker implementation, workflow definitions and tests for a real single-operator content pipeline. Its governing PRD requires scheduled unattended runs, a defined daily volume, pre-flight API quota checks, usage tracking and graceful queueing instead of failure when free-tier quotas are exhausted. It is not a template, tutorial, portfolio sample or benchmark fixture.

Cross-stratum concentration disclosure: EB-A-01 and EB-T-05 share owner `marketcalls` but are distinct trading and enterprise-RAG products with different PRD exact-byte hashes. This still warrants a later corpus-composition review.

## Remaining concerns and formal gate boundary

- The freeze queue now reaches five license-safe strict PRDs in each of the three assigned strata, but these 15 are only `accepted-for-pilot-freeze`; formal benchmark `ADMIT` remains zero.
- The PRD SHA-256 values are all distinct within this report. This is not the required path-independent digest or a global comparison against expert-A/future candidates.
- Root-license scope is recorded from same-revision first-party files. An authorized rights reviewer must still confirm that the planned retained source packages and any distributed derived captures comply with each license.
- The asynchronous stratum has four of five items from one maintainer; same-owner status is not duplication, but it is a concentration-bias concern.
- AI-assisted/agent-first and hackathon disclosures for YAT, OpenRAG and Ayin remain explicit. Machine research cannot turn any of them into external-human evidence.
- No historical defect was bound, no expert annotation was authored, no capture was run, and no release gate changed. The benchmark result remains `insufficient_evidence`.
