# Product requirements document

## Product

SYSTEM ERROR'S THE LOOP is a public skill pack that gives coding agents a disciplined build lifecycle without requiring a specific vendor, private memory system or cloud service.

It detects skills by capability and description, chooses the best installed specialist that satisfies the stage contract, identifies genuine capability gaps and falls back to a complete bundled lifecycle when no safe specialist is available.

## Problem

Agent workflows often fail in predictable ways:

- A user has useful skills installed, but the orchestrator routes by a hardcoded name or ignores them.
- A workflow claims to support several harnesses while depending on one harness's commands, paths or subagent APIs.
- “Autonomous” work expands scope, acts outwardly or keeps running without visible authority, ownership or a kill switch.
- Tests produce prose rather than evidence, issues disappear between turns and stale workers can continue writing.
- Public workflow packs copy private, vendor or community material without a defensible provenance trail.

THE LOOP addresses these failures with portable stage contracts, capability routing, bounded autonomy, durable local state and evidence-led completion.

## Users

### Primary

- Individual builders using Codex, Claude Code, Kimi Code or OpenCode.
- Small teams that want a shared lifecycle without standardising on one agent vendor.
- Consultants who need auditable delivery and faithful handoff across client environments.

### Secondary

- Skill authors who need a compatibility target.
- Maintainers evaluating whether an installed skill is safe to route into a workflow.
- Non-code operators producing research, documents, plans or operational assets with the same lifecycle discipline.

## Product principles

1. Capability before name: route against the stage contract, not a brand or folder name.
2. Fallback completeness: every core stage works without optional third-party skills.
3. Bounded missions: Auto completes one declared asset or halts at a configured gate.
4. Visible authority: users can always see what the agent may do.
5. Evidence before green: completion requires reproducible checks and an empty issue ledger.
6. Faithful failure: unknown, inaccessible and failed are never reported as passed.
7. Public by construction: private systems inform requirements but do not enter the source tree.

## Scope

### v0.1 skill pack

- Setup and doctor.
- Attended Loop and bounded Auto.
- Strategize, spec-pack, build, test and resolve.
- Health-check, audit and close.
- Ten shared protocols.
- Thin adapters and conformance fixtures for all five harnesses.
- Public provenance records and release checks.
- A static canonical landing page specification and launch gate for `systemerror.app/the-loop`.
- Nineteen expansion packages: Parallel independent lanes; generic Cloud; Watch,
  Control and Autonomy; portfolio review; adaptive skill planning and creation;
  grounding, quality and handoff utilities; and Endless supervision.

All 31 packages are complete harness-native instructions. The toolkit provides deeper
automation for stateful workflows and Parallel lanes without changing the usability
or shipping status of any skill.

### Out of scope

- A hosted orchestration service in v0.1.
- A proprietary model, agent runtime or private memory backend.
- Bundling vendor or community skill text.
- Silent installation, silent permission elevation or self-modification.
- Telemetry, accounts, billing or collection of user prompts.
- Deploying the landing page during Phase 1.

## Modes and relationship

| Mode | Contract | Delivery |
| --- | --- | --- |
| Loop | Attended default. Confirms or surfaces each meaningful gate. | portable skill + toolkit automation |
| Auto | One bounded asset to green or a configured gate. | portable skill + toolkit automation |
| Parallel | Independent capability-gated lanes with explicit merge ownership. | portable skill + lane helpers |
| Cloud | Remote or restricted planning, drafting and handoff without private infrastructure assumptions. | portable skill |
| Endless | Supervisor that selects only approved work and runs bounded Auto missions. Empty queue means monitor, never invent. | portable skill |

Setup installs and configures the pack. Doctor reports discovery, precedence and host
capabilities. Control, Autonomy and Watch expose the shared safety contracts. Endless
sits above these components and cannot bypass them.

## Functional requirements

### Installation and discovery

- **FR-001** Setup must detect installed target harnesses without requiring all five.
- **FR-002** Setup must present its exact file operations before overwriting or linking existing paths.
- **FR-003** Setup must support repository-local installation and document user-level installation.
- **FR-004** Doctor must report each discovered skill, its source, its winning precedence and any name collision.
- **FR-005** Doctor must distinguish “not installed,” “not discoverable,” “permission denied” and “behavior not verified.”
- **FR-006** Portable skills must load from a standard `SKILL.md` package with no private absolute path.

### Routing

- **FR-010** Each stage must publish a capability contract with required inputs, outputs, evidence and halt conditions.
- **FR-011** Routing must rank installed skills by explicit capability evidence, description match, compatibility, availability and user preference.
- **FR-012** A skill name alone must not satisfy a capability contract.
- **FR-013** Route selection and rejection reasons must be recorded.
- **FR-014** If no installed skill satisfies a contract, the bundled fallback must run.
- **FR-015** An optional upstream dependency must be linked or invoked, never copied into the repository without its own provenance approval.

### Lifecycle

- **FR-020** Strategize must declare the problem, desired outcome, scope, success gate and known constraints.
- **FR-021** Spec-pack must require the relevant specification set before implementation of a new product or major feature.
- **FR-022** Build must operate on one approved slice and preserve unrelated changes.
- **FR-023** Test must record reproducible evidence and open every surviving defect in the issue ledger.
- **FR-024** Resolve must link each change to an issue and regression check.
- **FR-025** Green means all required evidence passed and no blocking issue remains open.
- **FR-026** Close must leave a truthful final state, unresolved gates and a portable handoff.

### State, ownership and recovery

- **FR-030** Every run must have one ID, declared asset, mode, owner and current stage.
- **FR-031** A writing worker must hold an unexpired lease for the run or lane; lease-independent kill-switch control may only reduce the run to a halted state.
- **FR-032** Ownership must be checked immediately before each state-changing action.
- **FR-033** Long-running work must emit a heartbeat and expose stale status.
- **FR-034** Interrupted runs must be resumable from an authoritative validated event chain; stale or missing run/lease projections are repaired deterministically without claiming skipped evidence.
- **FR-035** The kill switch must prevent new state-changing actions and move active work to a truthful halted state even when the writer lease is missing, expired or invalid.
- **FR-036** Usage must keep per-stage attempt counters, count duration only inside validated lease/heartbeat intervals, and fail with an exact budget reason when a frozen budget is exhausted.
- **FR-037** Every callback must linearize authority at durable intent, retain reserved usage for an unknown outcome, and roll back only an exact reservation that the same process proves never reached callback entry.
- **FR-038** Every side-effecting callback must have a durable pre-callback intent. Success must clear it through the exact declared semantic event; an unmatched intent must reconcile to failed for local work or waiting for external verification for outward work and must never be replayed.

### Autonomy

- **FR-040** Default authority permits local, reversible work inside the declared asset but requires approval for outward actions, strategy expansion and self-modification.
- **FR-041** Elevation must show exact permissions and realistic risks before typed confirmation.
- **FR-042** A grant must record actor, confirmation, scope, start, expiry and revocation state.
- **FR-043** Startup, runtime status and digests must visibly warn when authority is elevated.
- **FR-044** Revocation must be possible with one documented command.
- **FR-045** Visible authority, audit logging, evidence, leases, an external kill switch and faithful failure reporting are permanent invariants under every level.

### Code and non-code work

- **FR-050** The code track must require branch or equivalent isolation before unattended edits, repository hygiene and executable checks.
- **FR-051** The non-code track must define source quality, factuality, format and review evidence appropriate to the asset.
- **FR-052** Both tracks must use the same state, authority, evidence and issue contracts.
- **FR-053** Example workflows must include one code asset and one non-code asset.

### Provenance and trust

- **FR-060** Every shipped file must have a source classification, compatible licence and authoring history.
- **FR-061** Release checks must scan tracked files and Git history for private data and credential patterns.
- **FR-062** The project must publish candidate decisions and explain why imported skills are dependencies or exclusions.
- **FR-063** Each release must pass the shared conformance suite for all five adapters and an independent final review.

## Landing page requirements

- **WEB-001** `https://systemerror.app/the-loop` must be the canonical marketing and product page.
- **WEB-002** The hero must state the product promise and System Error provenance without implying vendor ownership or endorsement.
- **WEB-003** The page must name Codex, Claude Code, Kimi Code, OpenCode and DeepSeek
  Harness as supported harnesses.
- **WEB-004** It must explain how Setup, Loop, Auto, Parallel, Cloud and Endless relate
  and explain their relationship without dividing the shipped skills into tiers.
- **WEB-005** It must explain installed-skill capability detection and bundled fallbacks.
- **WEB-006** It must show autonomy levels, visible warnings and permanent invariants.
- **WEB-007** It must include a provenance and licensing trust section plus a compatibility/status matrix.
- **WEB-008** It must link installation and quickstart instructions to `System-Error-Worldwide/the-loop`.
- **WEB-009** It must show one code example and one non-code example.
- **WEB-010** The primary CTA must lead to installation or GitHub. The secondary CTA must lead to Moses's Agent Workflow Audit or consulting offer.
- **WEB-011** It must provide title, description, canonical URL, Open Graph, Twitter card and structured data appropriate to a free software product.
- **WEB-012** v1 must remain static unless measured conversion requirements justify interactivity. Any CSP change requires a security review and explicit approval.
- **WEB-013** Analytics are off by default. If later approved, measurement must be privacy-conscious, documented and compatible with the site's privacy notice.
- **WEB-014** The page must meet WCAG 2.2 AA target checks and pass keyboard, contrast, reduced-motion and responsive verification.
- **WEB-015** The page must extend the existing System Error Software visual system rather than use a separate template aesthetic.
- **WEB-016** Production deployment requires explicit approval and must never be bundled into a repository push.

## Non-functional requirements

- **NFR-001 Portability:** common behavior cannot depend on a harness-exclusive frontmatter field or tool name.
- **NFR-002 Safety:** no action may exceed visible, unexpired authority.
- **NFR-003 Privacy:** no telemetry or prompt capture by default.
- **NFR-004 Reliability:** state writes must be atomic and recoverable after interruption.
- **NFR-005 Auditability:** important decisions and state transitions must be append-only or reconstructable.
- **NFR-006 Performance:** setup and doctor should finish within 10 seconds on a normal local repository, excluding harness launches.
- **NFR-007 Accessibility:** public web content targets WCAG 2.2 AA.
- **NFR-008 Security:** secrets and private identifiers must block release.
- **NFR-009 Namespace safety:** same-path replacement of the project or configured state namespace must fail closed before intent, callback and completion commit.
- **NFR-010 Compatibility:** Linux and macOS are required for v0.1; Windows support must be labelled unverified until tested.

## Success metrics

### Product readiness

- All 31 packages install through every first-class adapter.
- Every skill remains usable through native harness instruction loading even when the
  optional toolkit is not used.
- Every conformance scenario produces the expected route, state transition, evidence and halt behavior.
- Kill-switch latency is under one state-changing action: after detection, no further mutation occurs.
- No open blocking issues or unexplained private-content scan findings at release.
- An independent reviewer approves every provenance record.

### Landing page

- The route returns 200 with a self-canonical URL and working repository CTA.
- All named content requirements are present and truthful to the shipped release.
- Keyboard, automated accessibility, responsive screenshots and metadata validation pass.
- The existing `script-src 'none'` policy remains effective in v1.
- If measurement is later approved, the page records only agreed aggregate events and documents retention and legal basis.

## Acceptance gate

v0.1 includes the 31-skill manifest, all shared protocols, five adapters, passing
repository conformance, complete provenance records and the MIT licence. Dated CLI
reports remain environment-specific evidence, not the product's support status.

The launch may be called complete only after the repository is public, the static landing page matches the released compatibility matrix, both CTAs are valid and production deployment has separate explicit approval.

## Assumption ledger

| Assumption | Class | Consequence if wrong |
| --- | --- | --- |
| Original public source uses the MIT licence. | locked | Change only through an explicit maintainer decision and update all notices. |
| English-only v0.1 is acceptable. | safe default | Add localisation later without changing kernel behavior. |
| Local JSON state is sufficient for v0.1. | safe default | Introduce a storage adapter without changing schemas. |
| Static landing content is enough for launch conversion. | safe default | Justify and security-review any later interactivity and CSP change. |
| The consulting CTA destination is `https://systemerror.app/services/`. | locked | Reconfirm the route during the landing-page delivery review. |
